# 弹幕库面板形态改造：网页内抽屉 UI 设计

- 日期：2026-08-31
- 状态：已评审（脑暴流程），待实现
- 关联文档：PRD、technical-design.md（V0.2）、prototype-design.md（V0.2）

## 1. 背景与问题

当前弹幕库面板形态为浏览器侧边栏（sidePanel，技术方案 9.2.1 选型）。实际使用中发现固有痛点：

- **打开 sidePanel 会整体压缩直播窗口**，直播画面变窄，观看体验受损。该问题是 sidePanel 的浏览器级属性，无法在代码层消除。

需求：将面板 UI 改为**直播网页内的抽屉形态**（点击网页侧沿把手滑出），不挤压直播布局；同时保留 sidePanel 作为兜底入口。

## 2. 选型论证

### 2.1 面板形态对比（评审裁决）

| 候选 | 结论 | 理由 |
|---|---|---|
| **网页内抽屉（选定，iframe 复用版）** | 采用 | 完全消除窗口压缩；回填闭环在直播间同页完成，点击弹幕→输入框就近反馈；iframe 复用 panel.html 使面板逻辑零改动；样式天然隔离（iframe + Shadow DOM 双重隔离） |
| sidePanel（现状） | 保留为兜底 | 非直播页唯一入口；站点改版/页面卡死时的逃生通道；测试与代码零成本续用 |
| 在 content script 内重写渲染 | 否决 | panel.ts 全部重写（DOM 渲染引擎搬进 CS）；content script 上下文无扩展页 API（chrome.storage 等受限）；123 个既有测试大改；样式需全局前缀隔离 |
| popup | 否决 | 失焦即关，与回填主流程冲突（技术方案 9.2.1 已否决） |
| 独立弹窗窗口 | 备选 | 不挤压页面，但回填需跨窗口注视；引入 windows 权限；与"融入直播间"目标不符 |

### 2.2 iframe 复用的成立前提

当前 [panel.ts](../danmaku-box/src/panel/panel.ts) 已满足（文件头注释"不读写站点 DOM"）：

- 全部数据操作经消息协议走 service worker（`src/shared/messaging.ts`）
- 不依赖 sidePanel 特有 API

因此 `panel.html` 作为扩展页面，无论被 sidePanel 还是被 content script 的 iframe 挂载，运行上下文一致，假设全部成立。

## 3. 目标架构

```
┌─ 直播间页面（douyu.com）────────────────────────────────────┐
│  直播画面 / 弹幕区                                        │
│                                                ┌───────┐  │
│                                 ┌──────────────┐ │ 把手  │  │
│                                 │ Shadow DOM 容器│◀───────┘  │
│                                 │  ┌─────────┐ │  点击    │
│                                 │  │ iframe  │ ├──滑入/滑出│
│                                 │  │panel.html│ │         │
│                                 │  └────┬────┘ │         │
│                                 └───────┼──────┘         │
└─────────────────────────────────────────┼──────────────────┘
                                          │ chrome.runtime 消息
                                          ▼
┌─ Service Worker ───────────────────────────────────────────┐
│  消息路由（现状，零改动）                                   │
└────────────────────────────────────────────────────────────┘
```

- **核心决策：panel.html 是唯一面板实现，抽屉与 sidePanel 是两类宿主容器，共用同一份面板代码。**
- 抽屉的开关是纯页面内交互（content script 本地 toggle），不经过 service worker。

## 4. 入口与触发（评审裁决）

两个入口互相独立、行为恒定（避免一个按钮多环境歧义）：

| 入口 | 显示条件 | 行为 | 实现 |
|---|---|---|---|
| 网页内把手（抽屉专属） | 仅直播间（适配器探测命中时注入） | 开/关抽屉 iframe | content script 本地处理，不经 SW |
| 工具栏扩展按钮（sidePanel 专属） | 始终可用 | 开/关 sidePanel | 保留 `openPanelOnActionClick: true`，原生行为 |

- 直播间内两套 UI 并存即"抽屉为主、sidePanel 兜底"：sidePanel 作为改版/卡死时的逃生通道，且代码零成本。
- **不做**视图分支路由：不修改 `chrome.action.onClicked`，不引入 `TOGGLE_DRAWER` 消息。

## 5. 变更清单

### 5.1 manifest（唯一清单文件改动）

新增 `web_accessible_resources`（抽屉 iframe 落地前提）：

```json
"web_accessible_resources": [{
  "resources": ["panel.html", "panel.css", "panel.js"],
  "matches": ["*://*.douyu.com/*"]
}]
```

其余配置不动：`permissions`（storage/tabs/sidePanel）、`side_panel`、`content_scripts`、`host_permissions`。

### 5.2 新增模块（content script 侧）

```
src/content/
├── index.ts                       # 入口：detected 命中后挂载 drawer（追加一行装配）
├── drawer/
│   ├── drawer-host.ts             # 抽屉宿主：把手 + 容器 + iframe 生命周期（新）
│   ├── drawer-host.css            # 把手 & 容器样式（Shadow DOM 内嵌，新）
│   └── drawer-host.test.ts        # 状态机/注入条件/geometry（新）
```

### 5.3 明确不改

- service worker（消息路由零改动）
- panel.ts（面板逻辑零改动）
- 设置页、备份、构建脚本（[build.mjs](../danmaku-box/scripts/build.mjs) 的 4 入口打包不变，panel 仍为独立 IIFE）
- 既有 123 个单元测试

## 6. 模块职责边界（drawer-host.ts）

职责：管理抽屉的"壳"，不复制任何弹幕渲染逻辑。

| 项 | 说明 |
|---|---|
| 只负责壳 | 内部始终是 iframe（src=panel.html），面板逻辑仍在 panel.ts |
| 把手 | 细窄竖条（约 28px），悬浮直播页边缘，点击开/关抽屉；可拖拽吸附左右任一侧（旋转箭头） |
| 容器 | `position: fixed` 抽屉面板 + Shadow DOM `mode: 'closed'`（样式/事件全隔离，页面无法触及） |
| 生命周期 | 页面加载注入 → 用户交互开/关 → 页面卸载自动清理 |
| 状态 | 布尔 `open`；可选存 `storage.session` 使刷新后恢复 |

实现要点：

- iframe 内与 SW 走 `chrome.runtime`（扩展页面天然可用），不依赖宿主 DOM API → 无跨边界通信需求。
- iframe 宽度：桌面默认按面板约 720px；窄窗口 `min(1440px, 100vw) - 视频区保底`；宽度用户可拖拽、会话级记忆。
- 装配：content script 入口 `detected` 分支内追加 `createDrawerHost({ iframeSrc: chrome.runtime.getURL('panel.html') }).mount()`。

## 7. 错误处理与降级

原则：抽屉是锦上添花，任何异常不阻断收藏/回填主流程（二者走 SW 消息，与抽屉无关）。

| 场景 | 处置 |
|---|---|
| iframe 加载失败（WAR 未声明/更新竞态） | 容器内显示"面板加载失败，请用工具栏侧边栏"，点击即收起 |
| iframe 内 panel 报错 | 捕获未捕获错误，展示降级占位；sidePanel 同 HTML 双宿主不受影响 |
| 站点改版导致 `detected=false` | 把手不注入（呼应"直播间才显示"）；sidePanel 兜底可用 |
| SPA 重渲染把手丢失 | 监听 DOM 变化，把手自愈重建一次（防抖限频，不重复注入 iframe） |
| 全屏状态（F11/播放器全屏） | 全屏时自动收起把手与抽屉，退出后按记忆状态恢复 |
| 用户开抽屉后刷新 | 可选：`storage.session` 记住 open 状态，刷新后自动重开 |

兜底优先级：`[直播间] 把手 → 抽屉 → 加载失败/改版 → sidePanel（工具栏，常备）`；`[其他页] 工具栏 → sidePanel（唯一路径）`。

## 8. 测试策略（TDD）

`drawer-host.test.ts`（node:test + 现有 helpers，不带浏览器）：

| 用例 | 断言 |
|---|---|
| mount 时 `detected=false` 不注入把手 | 无 DOM 节点生成 |
| toggle 开→关→再开 | open 状态机正确；iframe 只创建一次 |
| iframe src 组装 | 等于 `chrome.runtime.getURL('panel.html')`（注入 getURL mock） |
| 把手吸附事件 | 位置 class 切换正确 |
| 页面卸载清理 | 已注入节点被移除（防泄漏） |
| iframe load 失败 | 显示降级提示节点 |
| fullscreen 进入 | 把手与抽屉移除；退出后按记忆状态恢复 |
| SPA 重渲染把手丢失 | 自愈重建仅一次（防抖），不重复注入 iframe |

> 真实 DOM 级交互（Shadow DOM 等）如需验证，沿用 memory-area 思路新增轻量 shim 或标记为人工走查项，不引入重型框架。

## 9. 明确不做（YAGNI）

- 抽屉内"在新窗口打开面板"（sidePanel 已覆盖）
- 抽屉/把手样式主题切换（跟随现有面板 CSS）
- 预适配抖音（一期保持 douyu.com 单站约束）

## 10. 里程碑拆解建议

| 里程碑 | 内容 | 验证 |
|---|---|---|
| D0 | manifest 增 WAR + drawer 骨架（把手/容器/iframe 加载） | 人工走查：直播页出现把手，点击滑出空面板 |
| D1 | drawer-host 完整交互（toggle/吸附/全屏/自愈/DOM 测试） | drawer-host.test.ts 全绿 + 人工走查 G2 路径 |
| D2 | 降级与边界联调（iframe 失败占位、页面改版、刷新恢复） | 双宿主回归：面板功能在抽屉/sidePanel 下等价 |

## 附录：决策记录

| # | 决策 | 理由 |
|---|---|---|
| 1 | 抽屉为主 + sidePanel 兜底（混合形态） | 非直播页仍需管理弹幕库；改版/卡死需逃生通道 |
| 2 | 覆盖式抽屉（不挤压布局、不移动页面元素） | 用户取舍裁决；主流直播辅助工具做法 |
| 3 | iframe 复用 panel.html，而非在 CS 内重写 | panel 零改动、测试零改动、样式天然隔离 |
| 4 | 两个入口行为恒定、逻辑分离 | 工具栏图标恒为 sidePanel，网页把手恒为抽屉，避免歧义，SW 零改动 |
| 5 | 纯页面内 toggle，不经 SW | 抽屉开关是 UI 局部状态，无需占用消息协议 |