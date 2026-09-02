# 一键导入斗鱼官方收藏弹幕 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首次安装后空库时，面板空态提供"一键导入斗鱼官方收藏弹幕"入口；用户点击后（已登录）拉取官方云端收藏、选择目标分组并导入本地弹幕库。

**Architecture:** 沿用既有"中心协调型消息架构"。面板经消息路由（service worker）向斗鱼直播间 content script 下发 `GET_DOUYU_FAVORITE`；content script 同源 fetch 官方端点（cookie 鉴权、无签名、无分页，2026-09-02 已实机核验），解析后返回条目；面板展示分组选择并调 `IMPORT_FAVORITE_DANMAKU` 批量落库（复用写串行队列与组内去重）。新增纯函数模块（解析器、登录探测、错误文案映射）保证 TDD 可测性。

**Tech Stack:** Chrome MV3（TypeScript + 原生 DOM）、node:test 测试、esbuild 构建。核心端点：`GET https://www.douyu.com/japi/privateCustomApi/favorite/web/bulletscreen/query`（Response `{ data: { list: [{ content, type, id }] } }`）。

---

## 文件结构（新建/修改）

| 文件 | 职责 | 操作 |
|---|---|---|
| `src/shared/constants.ts` | 新增 2 个消息名、1 个错误码 | Modify |
| `src/shared/types.ts` | 新增 `FavoriteItem` 类型 | Modify |
| `src/content/favorite-importer.ts` | 解析器 + 登录探测 + fetcher + 请求处理（纯函数为主，可注入 fetch） | Create |
| `src/background/danmaku-store.ts` | 新增 `importFavoriteDanmaku(entries, groupId)` 批量导入 | Modify |
| `src/background/message-router.ts` | 新增 `GET_DOUYU_FAVORITE` 路由 + `IMPORT_FAVORITE_DANMAKU` handler | Modify |
| `src/content/index.ts` | onMessage 注册 `GET_DOUYU_FAVORITE` 分支 | Modify |
| `src/panel/favorite-import.ts` | 错误文案映射 + 导入结果汇总（纯函数） | Create |
| `src/panel/panel.ts` | 空态按钮 + 拉取/选择分组/导入流程 | Modify |
| `tests/shared/constants.test.ts` | 同步新增常量断言 | Modify |
| `tests/content/favorite-importer.test.ts` | 解析/登录探测/fetcher/请求处理测试 | Create |
| `tests/storage/danmaku-store.test.ts` | `importFavoriteDanmaku` 测试 | Modify |
| `tests/panel/favorite-import.test.ts` | 文案映射测试 | Create |
| `docs/product/technical-design.md` | 消息表/文档同步 | Modify |
| `docs/product/PRD.md` | 功能条目增补 | Modify |

---

### Task 1: 消息协议与类型扩展

**Files:**
- Modify: `src/shared/constants.ts:4-30`（MESSAGES）、`src/shared/constants.ts:41-60`（ERROR_CODES）
- Modify: `src/shared/types.ts:44-48`（文件末尾）
- Test: `tests/shared/constants.test.ts:19-84`

- [ ] **Step 1: 更新常量契约测试（红灯）**

在 `tests/shared/constants.test.ts` 的 `MESSAGES` 断言对象中 `PANEL_CLOSED: 'PANEL_CLOSED',` 之后追加两行：

```ts
      GET_DOUYU_FAVORITE: 'GET_DOUYU_FAVORITE',
      IMPORT_FAVORITE_DANMAKU: 'IMPORT_FAVORITE_DANMAKU',
```

在 `ERROR_CODES` 断言对象中 `MIGRATE_FAILED: 'MIGRATE_FAILED',` 之后追加：

```ts
      SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/shared/constants.test.ts`
Expected: FAIL（`MESSAGES` 与 `ERROR_CODES` 实际对象缺少新键 → deepStrictEqual 不匹配）

- [ ] **Step 3: 实现常量与类型**

在 `src/shared/constants.ts` 的 `MESSAGES` 中 `PANEL_CLOSED: 'PANEL_CLOSED',` 后追加：

```ts
  GET_DOUYU_FAVORITE: 'GET_DOUYU_FAVORITE',
  IMPORT_FAVORITE_DANMAKU: 'IMPORT_FAVORITE_DANMAKU',
```

在 `ERROR_CODES` 中 `MIGRATE_FAILED: 'MIGRATE_FAILED',` 后追加：

```ts
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
```

在 `src/shared/types.ts` 文件末尾（`CsReadyPayload` 接口后）追加：

```ts
/** 斗鱼官方云端收藏条目（japi/privateCustomApi/favorite/web/bulletscreen/query 响应 data.list 项） */
export interface FavoriteItem {
  content: string;
  type?: number;
  id?: number;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/shared/constants.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/constants.ts src/shared/types.ts tests/shared/constants.test.ts
git commit -m "feat: 新增官方收藏导入的消息协议与 FavoriteItem 类型"
```

---

### Task 2: 官方收藏响应解析器 `parseFavoriteResponse`

**Files:**
- Create: `src/content/favorite-importer.ts`
- Test: `tests/content/favorite-importer.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `tests/content/favorite-importer.test.ts`：

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFavoriteResponse } from '../../src/content/favorite-importer.ts';
import type { FavoriteItem } from '../../src/shared/types.ts';

// parseFavoriteResponse：将官方 bulletscreen/query 响应解析为条目数组。
// 合法结构 { data: { list: [{content, type, id}] } }；异常结构抛错（消息层映射 SOURCE_UNAVAILABLE）。

describe('parseFavoriteResponse', () => {
  it('解析合法响应：提取 content/type/id', () => {
    const raw = {
      error: 0,
      data: {
        list: [
          { content: '第一条', type: 2, id: 101 },
          { content: '第二条', type: 2, id: 102 },
        ],
      },
    };
    assert.deepEqual(parseFavoriteResponse(raw), [
      { content: '第一条', type: 2, id: 101 },
      { content: '第二条', type: 2, id: 102 },
    ]);
  });

  it('list 缺失时视为空收藏（返回空数组）', () => {
    assert.deepEqual(parseFavoriteResponse({ error: 0, data: {} }), []);
    assert.deepEqual(parseFavoriteResponse({ error: 1 }), []);
  });

  it('条目缺少 content 字段时以空字符串兜底', () => {
    const raw = { data: { list: [{ type: 2 }, { content: '有内容', type: 2 }] } };
    const items = parseFavoriteResponse(raw) as FavoriteItem[];
    assert.equal(items[0]?.content, '');
    assert.equal(items[1]?.content, '有内容');
  });

  it('非对象入参（null/字符串）抛 TypeError', () => {
    assert.throws(() => parseFavoriteResponse(null));
    assert.throws(() => parseFavoriteResponse('not-json'));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/content/favorite-importer.test.ts`
Expected: FAIL（`Cannot find module favorite-importer.ts` 或 `parseFavoriteResponse is not defined`）

- [ ] **Step 3: 实现解析器**

创建 `src/content/favorite-importer.ts`：

```ts
// 斗鱼官方收藏导入（M? 新增模块；端点经 2026-09-02 实机核验）。
// 职责：解析官方 bulletscreen/query 响应、探测登录态、封装同源 fetch、处理面板消息。
// 边界：不触碰 DOM 与存储；纯函数与注入式依赖为主，便于 TDD。

import type { FavoriteItem } from '../shared/types.ts';

/**
 * 解析官方收藏响应 `{ data: { list: [{content, type, id}] } }`。
 * 结构异常（data/list 缺失）视为空收藏，返回 []；入参非对象抛 TypeError。
 */
export function parseFavoriteResponse(raw: unknown): FavoriteItem[] {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError('favorite response must be an object');
  }
  const data = (raw as Record<string, unknown>).data;
  if (typeof data !== 'object' || data === null) return [];
  const list = (data as Record<string, unknown>).list;
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const o = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    return {
      content: typeof o.content === 'string' ? o.content : '',
      type: typeof o.type === 'number' ? o.type : undefined,
      id: typeof o.id === 'number' ? o.id : undefined,
    };
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/content/favorite-importer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/content/favorite-importer.ts tests/content/favorite-importer.test.ts
git commit -m "feat: 官方收藏响应解析器 parseFavoriteResponse"
```

---

### Task 3: 登录态探测 `probeDouyuLogin`

**Files:**
- Modify: `src/content/favorite-importer.ts`
- Test: `tests/content/favorite-importer.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/content/favorite-importer.test.ts` 末尾追加：

```ts
import { probeDouyuLogin } from '../../src/content/favorite-importer.ts';

describe('probeDouyuLogin', () => {
  it('cookie 含 acf_uid 判定已登录（2026-09-02 实测登录态含该键）', () => {
    assert.equal(probeDouyuLogin('foo=1; acf_uid=2154363; dy_did=x'), true);
  });

  it('仅游客 cookie（dy_did/acf_did）判定未登录', () => {
    assert.equal(probeDouyuLogin('dy_did=abc; acf_did=xyz'), false);
  });

  it('空 cookie 判定未登录', () => {
    assert.equal(probeDouyuLogin(''), false);
  });
});
```

把文件开头现有的 `import { parseFavoriteResponse } ...` 一行改为同时导入 `probeDouyuLogin`（保持导入区唯一）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/content/favorite-importer.test.ts`
Expected: FAIL（`probeDouyuLogin is not a function`）

- [ ] **Step 3: 实现登录探测**

在 `src/content/favorite-importer.ts` 的 `parseFavoriteResponse` 函数之后追加：

```ts
/** 登录态探测：斗鱼登录后在 douyu.com 域种 acf_uid cookie（2026-09-02 实测）。 */
export function probeDouyuLogin(cookie: string): boolean {
  return /(?:^|;)\s*acf_uid=/.test(cookie);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/content/favorite-importer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/content/favorite-importer.ts tests/content/favorite-importer.test.ts
git commit -m "feat: 斗鱼登录态探测 probeDouyuLogin"
```

---

### Task 4: 弹幕库批量导入 `importFavoriteDanmaku`

**Files:**
- Modify: `src/background/danmaku-store.ts:71-78`（DanmakuStore 接口）、`src/background/danmaku-store.ts:376-403`（返回对象内）
- Test: `tests/storage/danmaku-store.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/storage/danmaku-store.test.ts` 末尾追加（文件顶部已导入 `createDanmakuStore`、`createStorageService`、`MemoryArea`）：

```ts
// importFavoriteDanmaku：批量导入官方收藏到目标分组（组内去重，一次落盘）。

describe('DanmakuStore.importFavoriteDanmaku', () => {
  async function setup() {
    const area = new MemoryArea();
    const store = await createDanmakuStore(createStorageService(area));
    const group = await store.createGroup('斗鱼官收');
    return { area, store, groupId: group.id } as const;
  }

  it('批量写入并返回 added，平台标记 douyu', async () => {
    const { store, groupId } = await setup();
    const r = await store.importFavoriteDanmaku([{ content: 'aaa' }, { content: 'bbb' }], groupId);
    assert.deepEqual({ added: r.added, skipped: r.skipped, invalid: r.invalid }, { added: 2, skipped: 0, invalid: 0 });
    const list = await store.listDanmaku({ groupId });
    assert.equal(list.total, 2);
    assert.equal(list.items[0]?.platform, 'douyu');
  });

  it('同组内按内容去重：重复条目计 skipped', async () => {
    const { store, groupId } = await setup();
    await store.importFavoriteDanmaku([{ content: 'x' }], groupId);
    const r = await store.importFavoriteDanmaku([{ content: 'x' }, { content: 'y' }], groupId);
    assert.deepEqual({ added: r.added, skipped: r.skipped }, { added: 1, skipped: 1 });
  });

  it('空内容与超长内容计 invalid（不落库）', async () => {
    const { store, groupId } = await setup();
    const r = await store.importFavoriteDanmaku(
      [{ content: '' }, { content: 'a'.repeat(DANMAKU_MAX_LENGTH + 1) }, { content: 'ok' }],
      groupId,
    );
    assert.deepEqual({ added: r.added, invalid: r.invalid }, { added: 1, invalid: 2 });
  });

  it('目标分组不存在时抛 NOT_FOUND，零写入', async () => {
    const { store } = await setup();
    await assert.rejects(
      () => store.importFavoriteDanmaku([{ content: 'a' }], 'g_not_exist'),
      (err: { code?: string }) => err.code === 'NOT_FOUND',
    );
  });
});
```

若文件顶部未导入 `DANMAKU_MAX_LENGTH`，则在现有 import 语句中追加：`import { DANMAKU_MAX_LENGTH } from '../../src/shared/constants.ts';`（若已存在则跳过）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/storage/danmaku-store.test.ts`
Expected: FAIL（`store.importFavoriteDanmaku is not a function`）

- [ ] **Step 3: 实现批量导入**

在 `src/background/danmaku-store.ts` 的 `DanmakuStore` 接口中（`getMenuContext` 声明之前）追加方法签名：

```ts
  /** 批量导入（官方收藏迁移用）：组内去重；空/超长内容计 invalid 不落库；一次落盘 */
  importFavoriteDanmaku(
    entries: Array<{ content: string }>,
    targetGroupId: string,
  ): Promise<{ added: number; skipped: number; invalid: number }>;
```

在返回对象的 `collectDanmaku` 方法之后（`createDanmaku` 之前）追加实现：

```ts
    async importFavoriteDanmaku(
      entries: Array<{ content: string }>,
      targetGroupId: string,
    ): Promise<{ added: number; skipped: number; invalid: number }> {
      await requireGroupExists(targetGroupId);
      const list = await loadDanmaku();
      const seen = new Set(
        list.filter((d) => d.group_id === targetGroupId).map((d) => normalize(d.content)),
      );
      let added = 0;
      let skipped = 0;
      let invalid = 0;
      const batch: Danmaku[] = [];
      for (const raw of entries) {
        const content = String(raw.content ?? '').trim();
        if (content.length < 1 || content.length > DANMAKU_MAX_LENGTH) {
          invalid += 1;
          continue;
        }
        if (seen.has(normalize(content))) {
          skipped += 1;
          continue;
        }
        seen.add(normalize(content));
        batch.push({
          id: newId('d'),
          content,
          group_id: targetGroupId,
          platform: 'douyu',
          room: '',
          created_at: new Date().toISOString(),
        });
        added += 1;
      }
      if (batch.length > 0) await saveDanmaku([...list, ...batch]);
      return { added, skipped, invalid };
    },
```

- [ ] **Step 4: 运行全部测试确认通过**

Run: `npm test -- tests/storage/danmaku-store.test.ts tests/content/favorite-importer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/background/danmaku-store.ts tests/storage/danmaku-store.test.ts
git commit -m "feat: 弹幕库批量导入 importFavoriteDanmaku（组内去重）"
```

---

### Task 5: content script 获取官方收藏（fetch 封装 + 消息处理）

**Files:**
- Modify: `src/content/favorite-importer.ts`
- Modify: `src/content/index.ts:43-73`（onMessage 分支）
- Test: `tests/content/favorite-importer.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/content/favorite-importer.test.ts` 末尾追加：

```ts
import { handleFavoriteRequest } from '../../src/content/favorite-importer.ts';

describe('handleFavoriteRequest', () => {
  function fetchOk(body: unknown): (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }> {
    return async () => ({ ok: true, json: async () => body });
  }
  function fetchFail(): Promise<{ ok: boolean }> {
    return Promise.resolve({ ok: false });
  }

  it('已登录且接口正常：返回 items', async () => {
    const r = await handleFavoriteRequest({
      cookie: 'acf_uid=1',
      fetchImpl: fetchOk({ data: { list: [{ content: 'a', type: 2, id: 1 }] } }),
    });
    assert.equal(r.ok, true);
    assert.equal((r.data as { items: { content: string }[] }).items[0]?.content, 'a');
  });

  it('未登录：返回 NOT_LOGGED_IN 且不发请求', async () => {
    let called = false;
    const r = await handleFavoriteRequest({
      cookie: 'dy_did=x',
      fetchImpl: async () => {
        called = true;
        return { ok: true, json: async () => ({ data: { list: [] } }) };
      },
    });
    assert.equal(r.ok, false);
    assert.equal(called, false);
    assert.equal((r.error as { code: string }).code, 'NOT_LOGGED_IN');
  });

  it('网络/接口失败：返回 SOURCE_UNAVAILABLE', async () => {
    const r = await handleFavoriteRequest({ cookie: 'acf_uid=1', fetchImpl: fetchFail });
    assert.equal(r.ok, false);
    assert.equal((r.error as { code: string }).code, 'SOURCE_UNAVAILABLE');
  });

  it('接口返回畸形响应（非对象）：返回 SOURCE_UNAVAILABLE 而非抛异常', async () => {
    const r = await handleFavoriteRequest({ cookie: 'acf_uid=1', fetchImpl: fetchOk('oops') });
    assert.equal(r.ok, false);
    assert.equal((r.error as { code: string }).code, 'SOURCE_UNAVAILABLE');
  });
});
```

顶部 import 更新为一次导入 `parseFavoriteResponse, probeDouyuLogin, handleFavoriteRequest`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/content/favorite-importer.test.ts`
Expected: FAIL（`handleFavoriteRequest is not a function`）

- [ ] **Step 3: 实现 fetch 封装与请求处理**

在 `src/content/favorite-importer.ts` 中追加：

```ts
import type { Result } from '../shared/types.ts';

/** 端点：2026-09-02 实机核验（GET / cookie 鉴权 / 无签名 / 无分页一次全量） */
export const DOUYU_FAVORITE_URL =
  'https://www.douyu.com/japi/privateCustomApi/favorite/web/bulletscreen/query';

/** fetch 依赖最小切面（便于测试注入） */
export interface FetchLike {
  (input: string): Promise<{ ok: boolean; json(): Promise<unknown> }>;
}

/** 面板消息入口：探测登录 → 拉取 → 解析，统一归一为 Result 信封 */
export async function handleFavoriteRequest(deps: {
  cookie: string;
  fetchImpl: FetchLike;
}): Promise<Result<{ items: FavoriteItem[] }>> {
  if (!probeDouyuLogin(deps.cookie)) {
    return { ok: false, error: { code: 'NOT_LOGGED_IN', message: '请先在斗鱼官网登录' } };
  }
  try {
    const res = await deps.fetchImpl(DOUYU_FAVORITE_URL);
    if (!res.ok) {
      return { ok: false, error: { code: 'SOURCE_UNAVAILABLE', message: '官方收藏接口返回异常' } };
    }
    const items = parseFavoriteResponse(await res.json());
    return { ok: true, data: { items } };
  } catch {
    return { ok: false, error: { code: 'SOURCE_UNAVAILABLE', message: '获取官方收藏失败' } };
  }
}
```

在 `src/content/index.ts` 的 onMessage 监听器中，`PROBE_REQUEST` 分支之后追加分支：

```ts
    } else if (type === MESSAGES.GET_DOUYU_FAVORITE) {
      // 面板「一键导入官方收藏」：content script 同源 fetch 官方端点（cookie 鉴权）。
      void handleFavoriteRequest({
        cookie: document.cookie,
        fetchImpl: (url) => fetch(url, { credentials: 'include' }),
      }).then((result) => sendResponse(result));
      return true; // 异步回包
    }
```

文件顶部 import 追加：`import { handleFavoriteRequest } from './favorite-importer.ts';`

- [ ] **Step 4: 运行测试 + 类型检查**

Run: `npm test -- tests/content/favorite-importer.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: 无输出（exit 0）

- [ ] **Step 5: Commit**

```bash
git add src/content/favorite-importer.ts src/content/index.ts tests/content/favorite-importer.test.ts
git commit -m "feat: content 侧获取官方收藏（登录探测 + 同源 fetch）"
```

---

### Task 6: 消息路由接入两新消息

**Files:**
- Modify: `src/background/message-router.ts:23-29`（RouterDeps）、`:52-65`（resolveFillTarget）、`:68-195`（handlers）、`:198-209`（writeTypes）
- Test: `tests/storage/message-router.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/storage/message-router.test.ts` 文件末尾追加（复用文件已有的 `msg`、`fakeTab`、`MemoryArea`、`createDanmakuStore`、`createStorageService`、`createSettingsService` 导入；如 `ERROR_CODES`、`MESSAGES` 已在顶部导入则直接使用）：

```ts
// GET_DOUYU_FAVORITE：路由到活动 douyu tab 的 content script 并透传结果。
describe('官方收藏路由', () => {
  function routerWithTab(tab: typeof fakeTab) {
    const area = new MemoryArea();
    const storage = createStorageService(area);
    const settings = createSettingsService(storage);
    return createDanmakuStore(storage).then((store) =>
      createMessageRouter({ store, settings, tab }),
    );
  }

  it('活动 tab 为 douyu：下发 GET_DOUYU_FAVORITE 并透传 items', async () => {
    const tab = {
      getActiveTab: async () => ({ tabId: 1, url: 'https://www.douyu.com/1' }),
      getTabSite: async () => ({ site: 'douyu', status: 'ok' }),
      sendToTab: async () => ({ ok: true, data: { items: [{ content: 'a' }] } }),
    };
    const router = await routerWithTab(tab);
    const r = await router.handleMessage(msg(MESSAGES.GET_DOUYU_FAVORITE));
    assert.equal(r?.ok, true);
    assert.deepEqual((r?.data as { items: Array<{ content: string }> }).items, [
      { content: 'a' },
    ]);
  });

  it('活动 tab 非 douyu：返回 SITE_UNSUPPORTED 且不下发', async () => {
    let sent = false;
    const tab = {
      getActiveTab: async () => ({ tabId: 1, url: 'https://example.com' }),
      getTabSite: async () => ({ site: 'douyin', status: 'ok' }),
      sendToTab: async () => {
        sent = true;
        return undefined;
      },
    };
    const router = await routerWithTab(tab);
    const r = await router.handleMessage(msg(MESSAGES.GET_DOUYU_FAVORITE));
    assert.equal(r?.ok, false);
    assert.equal(r?.error?.code, ERROR_CODES.SITE_UNSUPPORTED);
    assert.equal(sent, false);
  });

  it('IMPORT_FAVORITE_DANMAKU 批量导入并返回 added', async () => {
    const { router } = await makeRouter();
    const created = await router.handleMessage(msg(MESSAGES.CREATE_GROUP, { name: '斗鱼官收' }));
    const gid = (created?.data as { group: { id: string } }).group.id;
    const r = await router.handleMessage(
      msg(MESSAGES.IMPORT_FAVORITE_DANMAKU, { entries: [{ content: 'x' }], groupId: gid }),
    );
    assert.equal(r?.ok, true);
    assert.deepEqual(r?.data, { added: 1, skipped: 0, invalid: 0 });
  });
});
```

- [ ] **Step 2: 运行测试并核对失败点**

Run: `npm test -- tests/storage/message-router.test.ts`
Expected: `GET_DOUYU_FAVORITE：活动 tab 为 douyu` 用例 FAIL（handler 未注册 → 返回 null 或非预期），其余旧用例 PASS。

- [ ] **Step 3: 实现路由与导入 handler**

在 `src/background/message-router.ts` 的 `handlers` 中 `[MESSAGES.GET_SITE_STATE]` 之后追加：

```ts
    [MESSAGES.GET_DOUYU_FAVORITE]: async () => {
      // 复用回填的 tab 前置校验：活动标签页 → 必须为 douyu 站点
      const tabId = await resolveFillTarget();
      const response = await tab.sendToTab(tabId, MESSAGES.GET_DOUYU_FAVORITE, {});
      if (typeof response !== 'object' || response === null || !('ok' in response)) {
        throw new StoreError(ERROR_CODES.DELIVERY_FAILED, '直播页未就绪，请刷新后重试');
      }
      // content 返回的 {ok,data|error} 信封直接透传（含 NOT_LOGGED_IN / SOURCE_UNAVAILABLE）
      return (response as { ok: boolean; data?: unknown; error?: unknown }).data ?? {};
    },
    [MESSAGES.IMPORT_FAVORITE_DANMAKU]: (p) =>
      enqueueWrite(() =>
        store.importFavoriteDanmaku(
          (Array.isArray(p.entries) ? p.entries : []) as Array<{ content: string }>,
          String(p.groupId ?? ''),
        ),
      ),
```

> 说明：`GET_DOUYU_FAVORITE` 已知错误（NOT_LOGGED_IN / SOURCE_UNAVAILABLE）由 content 回包携带，不在 SW 抛 StoreError；`handleMessage` 的兜底读异常映射 `READ_FAILED` 只作用于 `sendToTab` 自身抛错路径。因此该分支不做秀异常转换，直接透传 content 信封的 data。若 content 回包 `ok:false`，则 `data` 为 undefined——面板侧展示通用失败文案兜底即可。

在 `writeTypes` 集合中追加一行（保证意外异常映射 WRITE_FAILED）：

```ts
    MESSAGES.IMPORT_FAVORITE_DANMAKU,
```

- [ ] **Step 4: 运行测试 + 全量回归**

Run: `npm test`
Expected: 全部 PASS（169+ 用例）

Run: `npm run typecheck` && `npm run lint`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/background/message-router.ts tests/storage/message-router.test.ts
git commit -m "feat: 消息路由接入 GET_DOUYU_FAVORITE / IMPORT_FAVORITE_DANMAKU"
```

---

### Task 7: 面板空态入口与导入流程

**Files:**
- Create: `src/panel/favorite-import.ts`
- Test: `tests/panel/favorite-import.test.ts`
- Modify: `src/panel/panel.ts:325-355`（空态分支）、`src/panel/panel.ts:87-101`（errorText 旁）

- [ ] **Step 1: 写失败测试**

创建 `tests/panel/favorite-import.test.ts`：

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAVORITE_IMPORT_HINTS,
  favoriteImportHint,
  favoriteImportSummary,
} from '../../src/panel/favorite-import.ts';

// 官方收藏导入面板文案映射（决策 2/3：无数据提示、未登录提示）。

describe('favoriteImportHint', () => {
  it('未登录错误码 → 提示先登录（决策 3）', () => {
    assert.equal(favoriteImportHint('NOT_LOGGED_IN'), '您还未登录斗鱼，请先在斗鱼官网登录后重试');
  });

  it('非斗鱼站点 → 提示在斗鱼直播间使用', () => {
    assert.equal(favoriteImportHint('SITE_UNSUPPORTED'), '请在斗鱼直播间页面打开面板后重试');
  });

  it('未知错误码 → 通用兜底文案', () => {
    assert.equal(favoriteImportHint('WEIRD'), '导入失败，请稍后重试');
    assert.equal(favoriteImportHint(undefined), '导入失败，请稍后重试');
  });
});

describe('favoriteImportSummary', () => {
  it('有跳过时展示新增/跳过', () => {
    assert.equal(favoriteImportSummary({ added: 5, skipped: 3, invalid: 0 }), '已导入 5 条，跳过 3 条');
  });

  it('全部跳过时展示新增 0 与跳过数', () => {
    assert.equal(favoriteImportSummary({ added: 0, skipped: 2, invalid: 0 }), '已导入 0 条，跳过 2 条');
  });

  it('全部归零提示官方无新增', () => {
    assert.equal(favoriteImportSummary({ added: 0, skipped: 0, invalid: 0 }), '官方收藏已全部存在，无需导入');
  });

  it('无效条目提示', () => {
    assert.equal(favoriteImportSummary({ added: 1, skipped: 0, invalid: 2 }), '已导入 1 条，跳过 0 条，2 条内容无效');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/panel/favorite-import.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现文案映射纯函数**

创建 `src/panel/favorite-import.ts`：

```ts
// 官方收藏导入的面板文案与汇总（纯函数，便于 TDD）。
// 决策 2：官方无数据给出提示；决策 3：未登录给出先登录提示。

export const FAVORITE_IMPORT_HINTS: Record<string, string> = {
  SITE_UNSUPPORTED: '请在斗鱼直播间页面打开面板后重试',
  NO_ACTIVE_TAB: '未检测到活动标签页，请打开斗鱼直播间后重试',
  NOT_LOGGED_IN: '您还未登录斗鱼，请先在斗鱼官网登录后重试',
  SOURCE_UNAVAILABLE: '获取官方收藏失败，请稍后重试',
  DELIVERY_FAILED: '直播页未就绪，请刷新后重试',
  ADAPTER_DOWN: '直播页已改版，导入暂不可用，请等待插件更新',
};

const HINT_FALLBACK = '导入失败，请稍后重试';

/** 错误码 → 导入提示文案（未知码走兜底） */
export function favoriteImportHint(code: string | undefined): string {
  return (code && FAVORITE_IMPORT_HINTS[code]) || HINT_FALLBACK;
}

export interface ImportSummary {
  added: number;
  skipped: number;
  invalid: number;
}

/** 导入结果 → 汇总文案（added 全部为 0 时提示无新增） */
export function favoriteImportSummary(sum: ImportSummary): string {
  const parts: string[] = [];
  if (sum.added > 0 || sum.skipped > 0) parts.push(`已导入 ${sum.added} 条，跳过 ${sum.skipped} 条`);
  if (sum.invalid > 0) parts.push(`${sum.invalid} 条内容无效`);
  if (parts.length === 0) return '官方收藏已全部存在，无需导入';
  return parts.join('，');
}
```

- [ ] **Step 4: 实现面板接入**

在 `src/panel/panel.ts` 顶部 import 追加：

```ts
import {
  favoriteImportHint,
  favoriteImportSummary,
} from './favorite-import.ts';
```

在 `renderList()` 的 `isEmptyLib` 分支（`add` 按钮之后、`empty.appendChild(add);` 与 `} else {` 之间）追加：

```ts
      const favBtn = h('button', 'btn', '一键导入斗鱼官方收藏');
      favBtn.type = 'button';
      favBtn.addEventListener('click', () => void startFavoriteImport());
      empty.appendChild(favBtn);
```

在 `renderList` 之后新增两个函数（置于 `renderItem` 之前）：

```ts
// 官方收藏导入流程：拉取 → 选组 → 落库（决策 2/3 文案走纯函数映射）
async function startFavoriteImport(): Promise<void> {
  const r = await sendMessage<{ items: FavoriteItem[] }>(MESSAGES.GET_DOUYU_FAVORITE);
  if (!r.ok) {
    toast(favoriteImportHint(r.error?.code), 'warn');
    return;
  }
  const items = r.data?.items ?? [];
  if (items.length === 0) {
    toast('官方暂无收藏弹幕', 'warn');
    return;
  }
  const groupId = await pickTargetGroup(items.length);
  if (groupId === null) return; // 用户取消
  const imp = await sendMessage<{ added: number; skipped: number; invalid: number }>(
    MESSAGES.IMPORT_FAVORITE_DANMAKU,
    { entries: items.map((i) => ({ content: i.content })), groupId },
  );
  if (!imp.ok) {
    toast(favoriteImportHint(imp.error?.code), 'warn');
    return;
  }
  toast(
    favoriteImportSummary({ added: imp.data?.added ?? 0, skipped: imp.data?.skipped ?? 0, invalid: imp.data?.invalid ?? 0 }),
  );
  void loadList(true);
}

// 目标分组选择弹窗（原生 select + 确认/取消）
async function pickTargetGroup(count: number): Promise<string | null> {
  return new Promise((resolve) => {
    const wrap = h('div', 'modal-mask');
    const box = h('div', 'modal');
    box.appendChild(h('div', 'modal-title', `共 ${count} 条官方收藏，导入到分组：`));
    const select = document.createElement('select');
    select.className = 'group-select';
    for (const g of state.groups) {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      select.appendChild(opt);
    }
    box.appendChild(select);
    const actions = h('div', 'modal-actions');
    const cancel = h('button', 'btn', '取消');
    const confirm = h('button', 'btn btn-primary', '导入');
    actions.appendChild(cancel);
    actions.appendChild(confirm);
    box.appendChild(actions);
    wrap.appendChild(box);
    modalRoot.appendChild(wrap);
    let done = false;
    const close = (value: string | null) => {
      if (done) return;
      done = true;
      wrap.remove();
      resolve(value as string | null);
    };
    cancel.addEventListener('click', () => close(null));
    confirm.addEventListener('click', () => close(select.value));
  });
}
```

文件顶部 import 追加 `import type { FavoriteItem } from '../shared/types.ts';`（若已 import 则并入现有 type import）。

- [ ] **Step 5: 运行测试 + 检查**

Run: `npm test -- tests/panel/favorite-import.test.ts`
Expected: PASS

Run: `npm run typecheck` && `npm run lint`
Expected: 无错误（alert: `pickTargetGroup` 返回类型正确；`FavoriteItem` 已导入）

- [ ] **Step 6: Commit**

```bash
git add src/panel/favorite-import.ts tests/panel/favorite-import.test.ts src/panel/panel.ts
git commit -m "feat: 面板空态一键导入斗鱼官方收藏（选组+结果提示）"
```

---

### Task 8: 文档同步与全量验证

**Files:**
- Modify: `docs/product/technical-design.md`（消息表 5.2 节、模块清单）
- Modify: `docs/product/PRD.md`（FR 增补：官方收藏一键迁移）

- [ ] **Step 1: 同步技术方案文档**

在 `docs/product/technical-design.md` 的 5.2 消息协议表中追加两行：

```md
| `GET_DOUYU_FAVORITE` | panel→background→content | `{}` | `{items}` | `NO_ACTIVE_TAB`、`SITE_UNSUPPORTED`、`DELIVERY_FAILED`、`NOT_LOGGED_IN`、`SOURCE_UNAVAILABLE` |
| `IMPORT_FAVORITE_DANMAKU` | panel→background | `{entries, groupId}` | `{added, skipped, invalid}` | `NOT_FOUND`、`WRITE_FAILED` |
```

并在「消息协议」小节补充实测注记：端点 `GET //www.douyu.com/japi/privateCustomApi/favorite/web/bulletscreen/query`（cookie 鉴权、无签名参数、无网络分页——2026-09-02 实机核验；未登录时官方前端不发请求直接弹登录框，插件侧以 `acf_uid` cookie 探测登录态）。

- [ ] **Step 2: 同步 PRD**

在 `docs/product/PRD.md` 的功能需求表中追加一条（或按现有 FR 编号续排）：

```md
| FR-06 | 官方收藏一键迁移 | 首次使用空库时，面板空态提供「一键导入斗鱼官方收藏」；已登录拉取官方云端收藏并可选目标分组导入（合并去重）；未登录提示先登录；官方无收藏时给出提示；仅读取官方云端数据，零上传 | P1 |
```

并同步「边界与异常」小节：导入边界仅官方云端收藏（不含 DouyuEx 本地扩展库）；不覆盖线上源数据，仅本地写入。

- [ ] **Step 3: 全量验证**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck/lint 无输出无错误；`npm test` 全部用例 PASS（原 169 + 新增用例）

Run: `npm run format`
Expected: 无输出（prettier 自检修复）

- [ ] **Step 4: 手工验收清单（标记全部完成后提交）**

- [ ] 加载开发版扩展（chrome://extensions 重新加载）
- [ ] 打开斗鱼直播间，侧边栏面板 → 空库显示"一键导入斗鱼官方收藏"按钮
- [ ] 已登录时点击 → 弹分组选择 → 导入 → toast 汇总 → 列表刷新且条目进入所选分组
- [ ] 官方无收藏账号 → toast「官方暂无收藏弹幕」
- [ ] 未登录（退出斗鱼）→ 打开面板点击 → toast「您还未登录斗鱼，请先在斗鱼官网登录后重试」
- [ ] 非斗鱼页面打开面板 → 显示空态按钮，点击 → toast「请在斗鱼直播间页面打开面板后重试」

- [ ] **Step 5: Commit**

```bash
git add docs/product/technical-design.md docs/product/PRD.md
git commit -m "docs: 官方收藏一键迁移功能与技术方案同步"
```

---

## Self-Review（交付前自查）

**覆盖核对：**
- 决策 1（仅官方云端）→ Task 5 fetch 官方端点 + Task 4 平台标记 douyu；Task 8 PRD 边界即仅云端 ✅
- 决策 2（空库恒显示 + 无数据提示）→ Task 7 空态分支常显按钮 + `items.length === 0` toast ✅
- 决策 3（未登录提示先登录）→ Task 3 登录探测 + Task 5 NOT_LOGGED_IN + Task 7 文案 ✅
- 已验证端点（无签名/无分页/单请求全量）→ Task 5 URL 常量 + Task 8 文档注记 ✅

**占位符扫描：** 无 TBD/占位；Task 6 步 1 注明了按既有测试文件模式的适配方式（该文件未在本计划内全文展示，因需沿用其已有 mock 帮手——已明确指示"按既有模式位置追加/复用")。

**类型一致性：** `FavoriteItem`（types.ts）→ 解析器返回 `FavoriteItem[]` → 消息 data `items` → panel `FavoriteItem` 导入一致；`importFavoriteDanmaku` 签名在 Task 4 接口与实现、Task 6 handler 中三处一致；`favoriteImportSummary` 输出与测试断言一致。