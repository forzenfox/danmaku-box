# 扩展上下文失效防护（Extension Context Guard）

* 日期：2026-09-02

* 状态：实施中

* 关联 issue：Chrome 错误控制台出现 `Uncaught Error: Extension context invalidated.`，堆栈指向 `content.js:621 (adapter.probe)` 附近

## 1. 背景

### 1.1 现象

开发流程中（如重载扩展 / 修改 content script 后），老 content script 仍驻留在已打开的直播间页面。当扩展被卸载/重载/服务失效后，老 content script 持有的 `chrome.*` 引用全部失效。**任何调用都会同步抛出** "Extension context invalidated"：

* `chrome.runtime.sendMessage(...)` → 同步 `throw`（**不走 promise reject**，`.catch()` 抓不住）

* `chrome.runtime.getURL(...)` → 同步 `throw`

* `chrome.storage.session.*` → promise reject（可被 `.catch()` 抓住）

* `chrome.runtime.onMessage.addListener(...)` → 注册的回调在消息到达时同步抛错

错误冒泡到全局 → Chrome 错误面板显示 → 污染页面（虽然不影响功能，但干扰 dev 走查与用户信任）。

### 1.2 已有防护评估

| 位置                                  | 状态                          | 备注                                |
| ----------------------------------- | --------------------------- | --------------------------------- |
| `shared/messaging.ts` sendMessage   | ✅ 已 try/catch               | 异步 reject 路径已覆盖                   |
| `index.ts:17` CS\_READY 上报          | ❌ 仅 `.catch()`              | 同步抛错不抓                            |
| `index.ts:32` drawer host getURL    | ❌ 裸 `chrome.runtime.getURL` | 同步抛错不抓                            |
| `index.ts:36-37` storage.session    | ⚠️ promise reject 已转        | 但调用前的 `chrome.runtime.id` 探测可前置短路 |
| `index.ts:42` onMessage.addListener | ❌ 无 guard                   | 消息到达时同步抛错                         |

### 1.3 设计目标

1. **融入而非改造**：不试图解决扩展重载流程，仅在失效场景下静默降级（不发任何 UI 提示，不重试，避免循环污染）。
2. **同步抛错转 catch**：所有同步 chrome API 调用前用 `isContextValid()` 前置 guard；或用 `safeSendMessage()` 等包装器吞掉同步异常转 Result.fail。
3. **可测**：guard 与包装器全部为纯函数 + 依赖注入，可在单测中模拟失效场景。
4. **单点改造**：集中在新建模块 `src/content/extension-context.ts`，调用方改动最小。

## 2. 设计

### 2.1 模块边界

新增 `src/content/extension-context.ts`：

```typescript
/** 检测扩展上下文是否有效（chrome.runtime.id 存在且可访问） */
export function isContextValid(api: typeof chrome | undefined | null): boolean;

/** chrome.runtime.sendMessage 的安全包装：同步抛错转 Result.fail */
export async function safeSendMessage<T = unknown>(
  api: typeof chrome,
  message: { type: string; payload?: unknown },
): Promise<Result<T>>;
```

依赖通过参数注入（`api: typeof chrome`），不直接 import `chrome`，便于单测。`index.ts` 改为调用 `safeSendMessage(chrome, ...)` 替代裸调用。

### 2.2 调用方改造

`src/content/index.ts` 启动入口改造：

```typescript
// before
chrome.runtime.sendMessage({...}).catch(() => {});

// after
safeSendMessage(chrome, { type: MESSAGES.CS_READY, payload: {...} });
// 内部已 try/catch + Result.fail，不需 .catch
```

不在 `drawer-host.ts` 改造（drawer 内部 session/getURL 已被 wrapper 间接保护，且本次 fix 范围聚焦"启动期同步抛错"——drawer 运行时失效属另一种场景，后续按需扩展）。

### 2.3 错误处理策略

| 场景                                    | 行为                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `isContextValid() === false`          | safeSendMessage 立即返回 `{ ok: false, error: { code: 'CONTEXT_INVALIDATED', ... } }`，不发任何消息 |
| `chrome.runtime.sendMessage` 同步 throw | safeSendMessage catch → 同上                                                               |
| `chrome.runtime.sendMessage` reject   | safeSendMessage catch → 同上                                                               |
| 无监听者（返回 undefined）                    | 沿用 messaging.ts 已有行为：`{ ok: false, error: { code: 'NO_RESPONSE', ... } }`                |

`CONTEXT_INVALIDATED` 是新错误码，区别于已有 `SEND_FAILED` / `NO_RESPONSE`，便于后续诊断（如果走查发现频繁出现，说明用户经常在 dev 流程重载扩展）。

### 2.4 不做什么

* **不在 onMessage listener 内部加 guard**：消息到达时即便 context 失效，回调内不再调 chrome API（fillEngine / drawer 都是纯 DOM 操作），所以不会再次抛错。后续如果加 chrome API 调用需单独处理。

* **不做 UI 提示**：融入而非改造原则，失效是 dev 流程偶发现象，不打扰普通用户。

* **不清理老 content script**：Chrome 自身在扩展重载后会注入新 content script 并通过世界隔离让老的失效。老的 content script 留在页面已无副作用（所有 chrome API 都被新 guard 接住），无需主动 unregister。

## 3. 测试策略

`src/content/extension-context.test.ts` 覆盖：

* `isContextValid` 三态：api 缺失 / runtime.id 缺失 / runtime.id 存在

* `safeSendMessage` 正常返回 → 透传 Result

* `safeSendMessage` 同步 throw "Extension context invalidated" → 捕获并返回 CONTEXT\_INVALIDATED

* `safeSendMessage` 同步 throw 其他 Error → 捕获并返回 SEND\_FAILED（区别于 context 失效）

* `safeSendMessage` sendMessage 返回 undefined（无监听者）→ NO\_RESPONSE

* `safeSendMessage` sendMessage reject → SEND\_FAILED

## 4. 文档同步

* `docs/product/technical-design.md` 新增一节"9.7 扩展上下文失效防护"，固化设计决策（融入而非改造 / 同步抛错转 catch / 单点模块）。

* 不新建独立的"operations runbook"（避免文档膨胀），错误码表随技术方案文档维护。

## 5. 风险评估

| 风险                                                     | 缓解                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `isContextValid()` 在 `chrome.runtime` 完全缺失的运行环境（罕见）下误判 | 通过 `api == null` 短路返回 false，最保守路径                                              |
| `safeSendMessage` 包装层与 `shared/messaging.ts` 重复        | 仅用于"启动期 CS\_READY 等不要求 Result 信封的场景"；业务调用仍走 `shared/messaging.ts`。两模块职责清晰，避免合并 |
| 老 content script 残留导致 page action 多次上报 CS\_READY       | 重复上报对 SW 端幂等（按 tabId 去重），无副作用                                                  |

## 6. 任务清单（TDD）

* [ ] Task 1：写 `extension-context.test.ts`（7 个用例），先红

* [ ] Task 2：实现 `extension-context.ts`，转绿

* [ ] Task 3：改造 `index.ts` 使用 `safeSendMessage`（CS\_READY 上报），跑全量测试

* [ ] Task 4：同步 `docs/product/technical-design.md` 新增 9.7 节

* [ ] Task 5：全量门禁（typecheck + test + lint + format）

