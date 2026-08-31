import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { createMessageRouter } from '../../src/background/message-router.ts';
import { createDanmakuStore } from '../../src/background/danmaku-store.ts';
import { createSettingsService } from '../../src/background/settings.service.ts';
import { createStorageService } from '../../src/background/storage.service.ts';
import { MemoryArea } from '../helpers/memory-area.ts';
import { createDiagnostics } from '../../src/background/diagnostics.ts';
import { DEFAULT_GROUP_ID, ERROR_CODES, MESSAGES } from '../../src/shared/constants.ts';

// 消息路由契约测试（技术方案 V0.2 5.2 消息协议 + P2.5 面板契约测试）：
// 统一信封、错误映射、写操作串行队列、未知消息处理。

async function makeRouter() {
  const area = new MemoryArea();
  const storage = createStorageService(area);
  const store = await createDanmakuStore(storage);
  const settings = createSettingsService(storage);
  const router = createMessageRouter({ store, settings, tab: fakeTab });
  return { router, area, store };
}

function msg(type: string, payload: object = {}) {
  return { type, payload };
}

const fakeTab = {
  getActiveTab: async () => null as { tabId: number; url: string } | null,
  getTabSite: async () => null as { site: string; status: string } | null,
  sendToTab: async () => undefined,
};

describe('消息路由统一信封', () => {
  it('LIST_DANMAKU 返回 {items,total,hasMore}', async () => {
    const { router } = await makeRouter();
    const r = await router.handleMessage(msg(MESSAGES.LIST_DANMAKU, { page: 1, pageSize: 50 }));
    assert.equal(r?.ok, true);
    assert.deepEqual(Object.keys(r?.data ?? {}), ['items', 'total', 'hasMore']);
  });

  it('GET_GROUPS 返回默认分组（含计数）', async () => {
    const { router } = await makeRouter();
    const r = await router.handleMessage(msg(MESSAGES.GET_GROUPS));
    assert.equal(r?.ok, true);
    const groups = (r?.data as { groups: Array<{ id: string; count: number }> }).groups;
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.id, DEFAULT_GROUP_ID);
    assert.equal(groups[0]?.count, 0);
  });

  it('CREATE_GROUP 成功返回 {group}', async () => {
    const { router } = await makeRouter();
    const r = await router.handleMessage(msg(MESSAGES.CREATE_GROUP, { name: '应援口号' }));
    assert.equal(r?.ok, true);
    assert.equal((r?.data as { group: { name: string } }).group.name, '应援口号');
  });

  it('业务错误映射为错误信封（NAME_EXISTS）', async () => {
    const { router } = await makeRouter();
    await router.handleMessage(msg(MESSAGES.CREATE_GROUP, { name: 'A' }));
    const r = await router.handleMessage(msg(MESSAGES.CREATE_GROUP, { name: 'A' }));
    assert.equal(r?.ok, false);
    assert.equal(r?.error?.code, ERROR_CODES.NAME_EXISTS);
  });

  it('DELETE_GROUP 内置分组映射 BUILTIN_GROUP', async () => {
    const { router } = await makeRouter();
    const r = await router.handleMessage(msg(MESSAGES.DELETE_GROUP, { id: DEFAULT_GROUP_ID }));
    assert.equal(r?.ok, false);
    assert.equal(r?.error?.code, ERROR_CODES.BUILTIN_GROUP);
  });

  it('COLLECT_DANMAKU 成功且 GET_MENU_CONTEXT 反映 hasThisContent', async () => {
    const { router } = await makeRouter();
    const collected = await router.handleMessage(
      msg(MESSAGES.COLLECT_DANMAKU, {
        content: '666',
        groupId: DEFAULT_GROUP_ID,
        platform: 'douyu',
        room: '1',
      }),
    );
    assert.equal((collected?.data as { duplicate: boolean }).duplicate, false);
    const menu = await router.handleMessage(msg(MESSAGES.GET_MENU_CONTEXT, { content: '666' }));
    const groups = (menu?.data as { groups: Array<{ hasThisContent: boolean }> }).groups;
    assert.equal(groups[0]?.hasThisContent, true);
  });

  it('CREATE_DANMAKU 重复返回 duplicate 字段而非错误', async () => {
    const { router } = await makeRouter();
    await router.handleMessage(
      msg(MESSAGES.CREATE_DANMAKU, { content: '666', groupId: DEFAULT_GROUP_ID }),
    );
    const r = await router.handleMessage(
      msg(MESSAGES.CREATE_DANMAKU, { content: '666', groupId: DEFAULT_GROUP_ID }),
    );
    assert.equal(r?.ok, true);
    assert.equal((r?.data as { duplicate: boolean }).duplicate, true);
  });

  it('GET_SETTINGS 默认 / SAVE_SETTINGS 更新', async () => {
    const { router } = await makeRouter();
    const before = await router.handleMessage(msg(MESSAGES.GET_SETTINGS));
    assert.equal((before?.data as { settings: { fillMode: string } }).settings.fillMode, 'replace');
    await router.handleMessage(msg(MESSAGES.SAVE_SETTINGS, { patch: { fillMode: 'append' } }));
    const after = await router.handleMessage(msg(MESSAGES.GET_SETTINGS));
    assert.equal((after?.data as { settings: { fillMode: string } }).settings.fillMode, 'append');
  });

  it('PANEL_OPENED 返回空 data', async () => {
    const { router } = await makeRouter();
    const r = await router.handleMessage(msg(MESSAGES.PANEL_OPENED));
    assert.equal(r?.ok, true);
    assert.deepEqual(r?.data, {});
  });

  it('未知消息返回 null（不进入协议）', async () => {
    const { router } = await makeRouter();
    assert.equal(await router.handleMessage(msg('UNKNOWN_MESSAGE')), null);
    assert.equal(await router.handleMessage(null), null);
    assert.equal(await router.handleMessage('string'), null);
  });
});

describe('写操作串行队列（技术方案 5.2 契约要点）', () => {
  it('并发写按派发顺序串行执行', async () => {
    const area = new MemoryArea();
    const storage = createStorageService(area);
    const store = await createDanmakuStore(storage);
    const order: string[] = [];
    const slowStore = {
      ...store,
      createGroup: async (name: string) => {
        await sleep(name === 'A' ? 20 : 5);
        order.push(name);
        return store.createGroup(name);
      },
    };
    const router = createMessageRouter({
      store: slowStore,
      settings: createSettingsService(storage),
      tab: fakeTab,
    });
    const pA = router.handleMessage(msg(MESSAGES.CREATE_GROUP, { name: 'A' }));
    const pB = router.handleMessage(msg(MESSAGES.CREATE_GROUP, { name: 'B' }));
    const [rA, rB] = await Promise.all([pA, pB]);
    assert.equal(rA?.ok, true);
    assert.equal(rB?.ok, true);
    assert.deepEqual(order, ['A', 'B'], '后派发的快操作未插队，串行生效');
  });
});
// ── P4：回填路由与站点状态（依赖注入 fake tab 上下文）──────

interface TabContext {
  getActiveTab(): Promise<{ tabId: number; url: string } | null>;
  getTabSite(tabId: number): Promise<{ site: string; status: string } | null>;
  sendToTab(tabId: number, type: string, payload: Record<string, unknown>): Promise<unknown>;
}

async function makeFillRouter(tab: TabContext) {
  const area = new MemoryArea();
  const storage = createStorageService(area);
  const store = await createDanmakuStore(storage);
  const settings = createSettingsService(storage);
  return createMessageRouter({ store, settings, tab });
}

const fillPayload = { content: '666冲冲冲', mode: 'replace' };

describe('FILL_REQUEST 回填路由', () => {
  it('活动标签页为已适配斗鱼直播间：下发 FILL_ACTION 并透传结果', async () => {
    const sent: Array<{ tabId: number; type: string; payload: Record<string, unknown> }> = [];
    const router = await makeFillRouter({
      getActiveTab: async () => ({ tabId: 7, url: 'https://www.douyu.com/1126960' }),
      getTabSite: async () => ({ site: 'douyu', status: 'ok' }),
      sendToTab: async (tabId, type, payload) => {
        sent.push({ tabId, type, payload });
        return { ok: true, truncated: false };
      },
    });
    const r = await router.handleMessage(msg(MESSAGES.FILL_REQUEST, fillPayload));
    assert.equal(r?.ok, true);
    assert.deepEqual(r?.data, { ok: true, truncated: false });
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.type, MESSAGES.FILL_ACTION);
    assert.equal(sent[0]?.tabId, 7);
    assert.equal((sent[0]?.payload as { content: string }).content, '666冲冲冲');
  });

  it('无活动标签页抛 NO_ACTIVE_TAB', async () => {
    const router = await makeFillRouter({
      getActiveTab: async () => null,
      getTabSite: async () => null,
      sendToTab: async () => undefined,
    });
    const r = await router.handleMessage(msg(MESSAGES.FILL_REQUEST, fillPayload));
    assert.equal(r?.ok, false);
    assert.equal(r?.error?.code, ERROR_CODES.NO_ACTIVE_TAB);
  });

  it('活动页不在映射中（未适配站点）抛 SITE_UNSUPPORTED', async () => {
    const router = await makeFillRouter({
      getActiveTab: async () => ({ tabId: 7, url: 'https://example.com/' }),
      getTabSite: async () => null,
      sendToTab: async () => undefined,
    });
    const r = await router.handleMessage(msg(MESSAGES.FILL_REQUEST, fillPayload));
    assert.equal(r?.ok, false);
    assert.equal(r?.error?.code, ERROR_CODES.SITE_UNSUPPORTED);
  });

  it('映射状态为 adapter_down 抛 ADAPTER_DOWN', async () => {
    const router = await makeFillRouter({
      getActiveTab: async () => ({ tabId: 7, url: 'https://www.douyu.com/1126960' }),
      getTabSite: async () => ({ site: 'douyu', status: 'adapter_down' }),
      sendToTab: async () => undefined,
    });
    const r = await router.handleMessage(msg(MESSAGES.FILL_REQUEST, fillPayload));
    assert.equal(r?.ok, false);
    assert.equal(r?.error?.code, ERROR_CODES.ADAPTER_DOWN);
  });

  it('下发无回执（content script 未就绪）抛 DELIVERY_FAILED', async () => {
    const router = await makeFillRouter({
      getActiveTab: async () => ({ tabId: 7, url: 'https://www.douyu.com/1126960' }),
      getTabSite: async () => ({ site: 'douyu', status: 'ok' }),
      sendToTab: async () => undefined,
    });
    const r = await router.handleMessage(msg(MESSAGES.FILL_REQUEST, fillPayload));
    assert.equal(r?.ok, false);
    assert.equal(r?.error?.code, ERROR_CODES.DELIVERY_FAILED);
  });

  it('透传截断标记', async () => {
    const router = await makeFillRouter({
      getActiveTab: async () => ({ tabId: 7, url: 'https://www.douyu.com/1126960' }),
      getTabSite: async () => ({ site: 'douyu', status: 'ok' }),
      sendToTab: async () => ({ ok: true, truncated: true }),
    });
    const r = await router.handleMessage(msg(MESSAGES.FILL_REQUEST, fillPayload));
    assert.deepEqual(r?.data, { ok: true, truncated: true });
  });
});

describe('GET_SITE_STATE 站点状态', () => {
  it('返回活动标签页的站点与适配状态', async () => {
    const router = await makeFillRouter({
      getActiveTab: async () => ({ tabId: 7, url: 'https://www.douyu.com/1126960' }),
      getTabSite: async () => ({ site: 'douyu', status: 'ok' }),
      sendToTab: async () => undefined,
    });
    const r = await router.handleMessage(msg(MESSAGES.GET_SITE_STATE));
    assert.equal(r?.ok, true);
    assert.deepEqual(r?.data, { tabId: 7, site: 'douyu', status: 'ok' });
  });

  it('无活动标签页返回 no_active_tab 状态', async () => {
    const router = await makeFillRouter({
      getActiveTab: async () => null,
      getTabSite: async () => null,
      sendToTab: async () => undefined,
    });
    const r = await router.handleMessage(msg(MESSAGES.GET_SITE_STATE));
    assert.equal(r?.ok, true);
    assert.deepEqual(r?.data, { tabId: null, site: null, status: 'no_active_tab' });
  });

  it('未适配站点返回 unsupported', async () => {
    const router = await makeFillRouter({
      getActiveTab: async () => ({ tabId: 9, url: 'https://example.com/' }),
      getTabSite: async () => null,
      sendToTab: async () => undefined,
    });
    const r = await router.handleMessage(msg(MESSAGES.GET_SITE_STATE));
    assert.equal((r?.data as { status: string }).status, 'unsupported');
  });
});
// ── P6：备份与诊断路由契约 ──────────────────────

describe('EXPORT_BACKUP / IMPORT_BACKUP / GET_DIAG', () => {
  it('EXPORT_BACKUP 返回含 version/danmaku/groups/settings 的备份对象', async () => {
    const area = new MemoryArea();
    const storage = createStorageService(area);
    const store = await createDanmakuStore(storage);
    const router = createMessageRouter({
      store,
      settings: createSettingsService(storage),
      tab: fakeTab,
      diagnostics: createDiagnostics(storage, () => '0.1.0'),
    });
    await store.createDanmaku({ content: '666', groupId: DEFAULT_GROUP_ID });
    const r = await router.handleMessage(msg(MESSAGES.EXPORT_BACKUP));
    assert.equal(r?.ok, true);
    const backup = (r?.data as { backup: Record<string, unknown> }).backup;
    assert.equal(backup.version, 1);
    assert.ok(Array.isArray(backup.danmaku));
    assert.ok(Array.isArray(backup.groups));
    assert.ok(Array.isArray(backup.settings));
  });

  it('IMPORT_BACKUP 合并策略返回新增/跳过/合并分组计数', async () => {
    const area = new MemoryArea();
    const storage = createStorageService(area);
    const store = await createDanmakuStore(storage);
    const router = createMessageRouter({
      store,
      settings: createSettingsService(storage),
      tab: fakeTab,
      diagnostics: createDiagnostics(storage, () => '0.1.0'),
    });
    const backup = {
      version: 1,
      danmaku: [
        {
          id: 'b1',
          content: '666',
          group_id: 'g_new',
          platform: 'douyu',
          room: '1',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      groups: [{ id: 'g_new', name: '备份组', order: 0, builtin: false }],
    };
    const r = await router.handleMessage(
      msg(MESSAGES.IMPORT_BACKUP, { backup, strategy: 'merge' }),
    );
    assert.equal(r?.ok, true);
    assert.deepEqual(r?.data as { added: number; skipped: number; mergedGroups: number }, {
      added: 1,
      skipped: 0,
      mergedGroups: 0,
    });
  });

  it('IMPORT_BACKUP 非法备份映射 BAD_FORMAT 且不落盘', async () => {
    const area = new MemoryArea();
    const storage = createStorageService(area);
    const store = await createDanmakuStore(storage);
    await store.createDanmaku({ content: '原数据', groupId: DEFAULT_GROUP_ID });
    const router = createMessageRouter({
      store,
      settings: createSettingsService(storage),
      tab: fakeTab,
      diagnostics: createDiagnostics(storage, () => '0.1.0'),
    });
    const r = await router.handleMessage(
      msg(MESSAGES.IMPORT_BACKUP, { backup: { nope: true }, strategy: 'merge' }),
    );
    assert.equal(r?.ok, false);
    assert.equal(r?.error?.code, ERROR_CODES.BAD_FORMAT);
    // 原库完整无损（迁移失败不落盘）
    assert.equal((await store.listDanmaku()).total, 1);
  });

  it('GET_DIAG 返回诊断快照', async () => {
    const area = new MemoryArea();
    const storage = createStorageService(area);
    const store = await createDanmakuStore(storage);
    const router = createMessageRouter({
      store,
      settings: createSettingsService(storage),
      tab: fakeTab,
      diagnostics: createDiagnostics(storage, () => '0.1.0'),
    });
    const r = await router.handleMessage(msg(MESSAGES.GET_DIAG));
    assert.equal(r?.ok, true);
    const data = r?.data as Record<string, unknown> | undefined;
    assert.ok(data !== undefined && 'diagnostics' in data);
  });
});
