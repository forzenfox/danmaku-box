// content script 入口（M3 右键菜单 / M5 回填引擎 / M7 站点探测，P3-P4 装配）。
// 未适配站点（detector 返回 null）静默退出；嵌套 iframe 默认不注入（manifest
// 未声明 all_frames），FR-01 的 iframe 静默降级由此天然成立。

import { MESSAGES } from '../shared/constants.ts';
import { createDouyuAdapter } from './adapters/douyu.ts';
import { createContextMenuController } from './context-menu.controller.ts';
import { createDrawerHost, type DrawerSessionState } from './drawer/drawer-host.ts';
import { createFillEngine } from './fill-engine.ts';
import { createSiteDetector } from './site-detector.ts';

const detector = createSiteDetector({ douyu: createDouyuAdapter() });
const detected = detector.detect(window.location, document);

if (detected) {
  // CS_READY 上报：建立 tabId→site 映射（service worker 写入 storage.session）
  chrome.runtime
    .sendMessage({
      type: MESSAGES.CS_READY,
      payload: { site: detected.site, status: detected.status },
    })
    .catch(() => {
      // service worker 未就绪时静默失败，不影响页面（融入而非改造原则）
    });

  createContextMenuController({ adapter: detected.adapter }).mount();

  // FILL_ACTION 执行器：service worker 路由的回填命令在本页执行（技术方案 7.2）
  const fillEngine = createFillEngine(detected.adapter);

  // 抽屉宿主：dock-style 面板（panel.html iframe）。开合为页面内局部状态，不经 service worker
  const drawer = createDrawerHost({
    doc: document,
    getURL: (p) => chrome.runtime.getURL(p),
    session: {
      get: (k) => chrome.storage.session.get(k).then((r) => r[k] as DrawerSessionState | undefined),
      set: (items) => chrome.storage.session.set(items),
    },
  });
  drawer.mount();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const type =
      typeof message === 'object' && message !== null
        ? (message as { type?: string }).type
        : undefined;
    if (type === MESSAGES.FILL_ACTION) {
      const payload =
        typeof message === 'object' && message !== null
          ? ((message as { payload?: { content?: string; mode?: 'replace' | 'append' } }).payload ??
            {})
          : {};
      sendResponse(
        fillEngine.handleFillAction({
          content: String(payload.content ?? ''),
          mode: payload.mode === 'append' ? 'append' : 'replace',
        }),
      );
    } else if (type === MESSAGES.PROBE_REQUEST) {
      // 实时探测（C）：service worker 查询当前 DOM 的适配状态，
      // 覆盖注入时一次性快照的滞后（如弹幕列表延迟渲染导致的过期 adapter_down）。
      const probe = detected.adapter.probe(document);
      sendResponse({ site: detected.site, status: probe.ok ? 'ok' : 'adapter_down' });
    }
    return false; // 同步回包
  });
}
