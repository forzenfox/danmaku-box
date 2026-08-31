// service worker 入口（M1 存储 / M2 弹幕库核心 / M9 设置 / 消息路由 / CS_READY / 回填路由）。
// 职责：设置图标点击打开侧边栏面板；路由统一信封消息；维护 tabId→site 会话映射；
// 将 FILL_REQUEST 按活动标签页路由至 content script。

import { MESSAGES } from '../shared/constants.ts';
import { createDanmakuStore } from './danmaku-store.ts';
import { createDiagnostics } from './diagnostics.ts';
import { createMessageRouter, type TabContext } from './message-router.ts';
import { createSettingsService } from './settings.service.ts';
import { createStorageService } from './storage.service.ts';

// 图标点击即打开侧边栏面板（技术方案 9.2.1 sidePanel 选型裁决）
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
  // 设置失败不阻塞扩展运行，用户仍可从浏览器侧边栏菜单手动打开
});

// ── tabId→site 会话映射（技术方案 5.2 契约要点：storage.session 持久化）──
const TAB_MAP_KEY = 'tab.site.map';

interface TabSiteEntry {
  site: string;
  status: string;
}

async function readTabMap(): Promise<Record<string, TabSiteEntry>> {
  const bag = await chrome.storage.session.get(TAB_MAP_KEY);
  const map = bag[TAB_MAP_KEY];
  return typeof map === 'object' && map !== null ? (map as Record<string, TabSiteEntry>) : {};
}

async function handleCsReady(tabId: number, site: string, status: string): Promise<void> {
  const map = await readTabMap();
  map[tabId] = { site, status };
  await chrome.storage.session.set({ [TAB_MAP_KEY]: map });
}

// 标签页关闭时清理映射（避免 session 内残留）
chrome.tabs.onRemoved.addListener((tabId) => {
  void readTabMap().then((map) => {
    if (tabId in map) {
      delete map[tabId];
      void chrome.storage.session.set({ [TAB_MAP_KEY]: map });
    }
  });
});

// ── 回填路由的 tab 上下文（chrome.tabs + session 映射的真实装配）──
const tabContext: TabContext = {
  async getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || tab.id === undefined) return null;
    return { tabId: tab.id, url: tab.url ?? '' };
  },
  async getTabSite(tabId) {
    const map = await readTabMap();
    return map[tabId] ?? null;
  },
  sendToTab(tabId, type, payload) {
    return chrome.tabs.sendMessage(tabId, { type, payload });
  },
};

// ── 装配与消息总入口 ────────────────────────
const local = createStorageService(chrome.storage.local);
const settings = createSettingsService(local);
const diagnostics = createDiagnostics(local, () => chrome.runtime.getManifest().version);
const routerPromise = createDanmakuStore(local).then((store) =>
  createMessageRouter({ store, settings, tab: tabContext, diagnostics }),
);
void diagnostics.log(
  'sw',
  'info',
  `service worker 启动（v${chrome.runtime.getManifest().version}）`,
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type =
    typeof message === 'object' && message !== null
      ? (message as { type?: string }).type
      : undefined;

  // content script 就绪上报（需要 sender.tab 上下文，单独处理）
  if (type === MESSAGES.CS_READY) {
    const payload =
      typeof message === 'object' && message !== null
        ? ((message as { payload?: { site?: string; status?: string } }).payload ?? {})
        : {};
    const tabId = sender.tab?.id;
    if (typeof tabId === 'number') {
      void diagnostics.log(
        'cs',
        'info',
        `标签页 ${tabId} 就绪：${String(payload.site ?? '')}（${String(payload.status ?? '')}）`,
      );
      void handleCsReady(tabId, String(payload.site ?? ''), String(payload.status ?? '')).finally(
        () => sendResponse({ ok: true, data: {} }),
      );
    } else {
      sendResponse({ ok: true, data: {} });
    }
    return true;
  }

  routerPromise
    .then((router) => router.handleMessage(message))
    .then((result) => {
      // 未知消息返回 null：不回包，保持通道静默（消息类型白名单）
      if (result) sendResponse(result);
    })
    .catch(() => {
      sendResponse({ ok: false, error: { code: 'INTERNAL', message: '后台处理失败' } });
    });
  return true; // 异步回包，保持消息通道开放
});
