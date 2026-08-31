// 消息路由（技术方案 V0.2 5.2 消息协议的 service worker 侧实现）。
// 职责：接收统一信封 {type, payload}，分发至领域服务，返回统一信封结果。
// 错误映射：StoreError → {ok:false, error:{code,message}}；
// 读操作意外异常映射 READ_FAILED，写操作意外异常映射 WRITE_FAILED；
// 写操作经 Promise 链式队列串行执行（避免多面板窗口并发写覆盖）。
// 回填路由（FILL_REQUEST/GET_SITE_STATE）依赖注入 tab 上下文，便于契约测试。

import { ERROR_CODES, MESSAGES, SCHEMA_VERSION } from '../shared/constants.ts';
import type { Result } from '../shared/types.ts';
import { parseBackup } from './backup.ts';
import type { DanmakuStore } from './danmaku-store.ts';
import type { Diagnostics } from './diagnostics.ts';
import type { SettingsService } from './settings.service.ts';
import { StoreError } from './store-error.ts';

/** 活动标签页上下文（背景页装配 chrome.tabs + storage.session 实现） */
export interface TabContext {
  getActiveTab(): Promise<{ tabId: number; url: string } | null>;
  getTabSite(tabId: number): Promise<{ site: string; status: string } | null>;
  sendToTab(tabId: number, type: string, payload: Record<string, unknown>): Promise<unknown>;
}

export interface RouterDeps {
  store: DanmakuStore;
  settings: SettingsService;
  tab: TabContext;
  /** 诊断日志（可选注入；缺省时跳过记录） */
  diagnostics?: Diagnostics;
}

type Handler = (payload: Record<string, unknown>) => Promise<unknown>;

export interface MessageRouter {
  handleMessage(message: unknown): Promise<Result | null>;
}

export function createMessageRouter(deps: RouterDeps): MessageRouter {
  const { store, settings, tab, diagnostics } = deps;

  // 写操作串行队列：Promise 链式队列，尾节点吞掉异常保证队列不中断
  let writeTail: Promise<unknown> = Promise.resolve();
  function enqueueWrite<T>(op: () => Promise<T>): Promise<T> {
    const next = writeTail.then(() => op());
    writeTail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /** 回填前置校验：活动标签页 → 站点映射 → 适配状态（技术方案 7.2 时序） */
  async function resolveFillTarget(): Promise<number> {
    const active = await tab.getActiveTab();
    if (!active) {
      throw new StoreError(ERROR_CODES.NO_ACTIVE_TAB, '未找到活动标签页');
    }
    const info = await tab.getTabSite(active.tabId);
    if (!info) {
      throw new StoreError(ERROR_CODES.SITE_UNSUPPORTED, '请在斗鱼直播间页面使用');
    }
    if (info.site !== 'douyu') {
      throw new StoreError(ERROR_CODES.SITE_UNSUPPORTED, '请在斗鱼直播间页面使用');
    }
    if (info.status !== 'ok') {
      throw new StoreError(ERROR_CODES.ADAPTER_DOWN, '直播页已改版，回填暂不可用，请等待插件更新');
    }
    return active.tabId;
  }

  /** 各消息处理器；返回值作为信封 data */
  const handlers: Record<string, Handler> = {
    [MESSAGES.LIST_DANMAKU]: (p) =>
      store.listDanmaku(p as Parameters<DanmakuStore['listDanmaku']>[0]),
    [MESSAGES.GET_GROUPS]: async () => ({ groups: await store.getGroupsWithCounts() }),
    [MESSAGES.CREATE_GROUP]: (p) =>
      enqueueWrite(() => store.createGroup(p.name as string)).then((group) => ({ group })),
    [MESSAGES.RENAME_GROUP]: (p) =>
      enqueueWrite(() => store.renameGroup(p.id as string, p.name as string)).then((group) => ({
        group,
      })),
    [MESSAGES.DELETE_GROUP]: (p) => enqueueWrite(() => store.deleteGroup(p.id as string)),
    [MESSAGES.REORDER_GROUPS]: (p) =>
      enqueueWrite(() => store.reorderGroups(p.orderedIds as string[])).then(() => ({})),
    [MESSAGES.COLLECT_DANMAKU]: (p) =>
      enqueueWrite(() =>
        store.collectDanmaku({
          content: p.content as string,
          groupId: p.groupId as string,
          platform: p.platform as 'douyu' | 'douyin',
          room: p.room as string,
        }),
      ),
    [MESSAGES.GET_MENU_CONTEXT]: (p) =>
      store.getMenuContext(p.content as string).then((groups) => ({ groups })),
    [MESSAGES.CREATE_DANMAKU]: (p) =>
      enqueueWrite(() =>
        store.createDanmaku({
          content: p.content as string,
          groupId: p.groupId as string,
        }),
      ),
    [MESSAGES.UPDATE_DANMAKU]: (p) =>
      enqueueWrite(() => store.updateDanmaku(p.id as string, p.content as string)).then(() => ({})),
    [MESSAGES.DELETE_DANMAKU]: (p) => enqueueWrite(() => store.deleteDanmaku(p.ids as string[])),
    [MESSAGES.MOVE_DANMAKU]: (p) =>
      enqueueWrite(() => store.moveDanmaku(p.ids as string[], p.targetGroupId as string)),
    [MESSAGES.FILL_REQUEST]: async (p) => {
      const tabId = await resolveFillTarget();
      const response = await tab.sendToTab(tabId, MESSAGES.FILL_ACTION, {
        content: p.content as string,
        mode: p.mode as 'replace' | 'append',
      });
      if (typeof response !== 'object' || response === null || !('ok' in response)) {
        void diagnostics?.log('fill', 'warn', `回填下发无回执（tab ${tabId}）`);
        throw new StoreError(ERROR_CODES.DELIVERY_FAILED, '直播页未就绪，请刷新后重试');
      }
      const fillResult = response as { ok: boolean; truncated?: boolean };
      void diagnostics?.log(
        'fill',
        fillResult.ok ? 'info' : 'warn',
        `回填${fillResult.ok ? '成功' : '失败'}（tab ${tabId}${fillResult.truncated ? '，已截断' : ''}）`,
      );
      return response;
    },
    [MESSAGES.GET_SITE_STATE]: async () => {
      const active = await tab.getActiveTab();
      if (!active) return { tabId: null, site: null, status: 'no_active_tab' };
      const info = await tab.getTabSite(active.tabId);
      if (!info) return { tabId: active.tabId, site: null, status: 'unsupported' };
      return { tabId: active.tabId, site: info.site, status: info.status };
    },
    [MESSAGES.GET_SETTINGS]: async () => ({ settings: await settings.get() }),
    [MESSAGES.SAVE_SETTINGS]: (p) =>
      enqueueWrite(() => settings.set(p.patch as Parameters<SettingsService['set']>[0])).then(
        () => ({}),
      ),
    [MESSAGES.EXPORT_BACKUP]: async () => {
      const [library, settingsData] = await Promise.all([store.exportLibrary(), settings.get()]);
      // 设置导出为数组形态（自描述、便于人工检查，技术方案 5.3）
      const settingsArray = Object.entries(settingsData).map(([key, value]) => ({ key, value }));
      const backup = {
        version: SCHEMA_VERSION,
        exported_at: new Date().toISOString(),
        danmaku: library.danmaku,
        groups: library.groups,
        settings: settingsArray,
      };
      void diagnostics?.log('backup', 'info', `导出备份：${library.danmaku.length} 条弹幕`);
      return { backup };
    },
    [MESSAGES.IMPORT_BACKUP]: (p) =>
      enqueueWrite(async () => {
        // 解析失败即止，不落盘（PRD FR-05 边界）
        const parsed = parseBackup(p.backup as string | Record<string, unknown>);
        const strategy = p.strategy === 'overwrite' ? 'overwrite' : 'merge';
        const result = await store.importLibrary(
          { groups: parsed.groups, danmaku: parsed.danmaku },
          strategy,
        );
        void diagnostics?.log(
          'backup',
          'info',
          `导入（${strategy === 'merge' ? '合并' : '覆盖'}）：新增 ${result.added} 条、跳过 ${result.skipped} 条`,
        );
        return result;
      }),
    [MESSAGES.GET_DIAG]: async () => {
      const diagnosticsData = diagnostics
        ? await diagnostics.snapshot()
        : { version: 'n/a', logs: [], storage: { used: 0, quota: 0 } };
      return { diagnostics: diagnosticsData };
    },
    [MESSAGES.PANEL_OPENED]: async () => ({}),
    [MESSAGES.PANEL_CLOSED]: async () => ({}),
  };

  /** 写类消息（意外异常时映射 WRITE_FAILED） */
  const writeTypes = new Set<string>([
    MESSAGES.CREATE_GROUP,
    MESSAGES.RENAME_GROUP,
    MESSAGES.DELETE_GROUP,
    MESSAGES.REORDER_GROUPS,
    MESSAGES.COLLECT_DANMAKU,
    MESSAGES.CREATE_DANMAKU,
    MESSAGES.UPDATE_DANMAKU,
    MESSAGES.DELETE_DANMAKU,
    MESSAGES.MOVE_DANMAKU,
    MESSAGES.SAVE_SETTINGS,
  ]);

  async function handleMessage(message: unknown): Promise<Result | null> {
    if (typeof message !== 'object' || message === null) return null;
    const { type, payload } = message as { type?: unknown; payload?: unknown };
    if (typeof type !== 'string' || !(type in handlers)) return null;
    const handler: Handler | undefined = handlers[type];
    if (!handler) return null;
    try {
      const data = await handler(
        (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>,
      );
      return { ok: true, data: data ?? {} };
    } catch (err) {
      if (err instanceof StoreError) {
        return { ok: false, error: { code: err.code, message: err.message } };
      }
      const code = writeTypes.has(type) ? ERROR_CODES.WRITE_FAILED : ERROR_CODES.READ_FAILED;
      return { ok: false, error: { code, message: '内部错误' } };
    }
  }

  return { handleMessage };
}
