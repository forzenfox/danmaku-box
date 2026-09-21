// content script 入口（M3 右键菜单 / M5 回填引擎 / M7 站点探测，P3-P4 装配）。
// 未适配站点（detector 返回 null）静默退出；嵌套 iframe 默认不注入（manifest
// 未声明 all_frames），FR-01 的 iframe 静默降级由此天然成立。

import { MESSAGES } from '../shared/constants.ts';
import { createDouyuAdapter } from './adapters/douyu.ts';
import { createDouyinAdapter } from './adapters/douyin.ts';
import { createContextMenuController } from './context-menu.controller.ts';
import { createToolbarEntry } from './toolbar-entry/toolbar-entry.ts';
import { createDouyinEntry } from './toolbar-entry/douyin-entry.ts';
import { safeSendMessage } from './extension-context.ts';
import { createFillEngine } from './fill-engine.ts';
import { handleFavoriteRequest } from './favorite-importer.ts';
import { createSiteDetector } from './site-detector.ts';

const detector = createSiteDetector({
  douyu: createDouyuAdapter(),
  douyin: createDouyinAdapter(),
});
const detected = detector.detect(window.location, document);

if (detected) {
  // CS_READY 上报：建立 tabId→site 映射（service worker 写入 storage.session）。
  // 使用 safeSendMessage 包裹：扩展重载/SW 失效后老 content script 调用
  // chrome.runtime.sendMessage 会**同步抛出**"Extension context invalidated"
  // （不走 promise reject，.catch() 抓不住），safeSendMessage 内部已 try/catch
  // 静默降级返回 Result.fail，避免污染页面（spec: 2026-09-02-extension-context-guard）。
  void safeSendMessage(chrome, {
    type: MESSAGES.CS_READY,
    payload: { site: detected.site, status: detected.status },
  });

  createContextMenuController({ adapter: detected.adapter }).mount();

  // FILL_ACTION 执行器：service worker 路由的回填命令在本页执行（技术方案 7.2）
  const fillEngine = createFillEngine(detected.adapter);

  // 工具栏「藏+」入口装配：按站点互斥分流（试点决策 2026-09-21，见 index.assembly.test.ts）。
  // 抖音走 douyin-entry（锚点 .webcast-chatroom）；斗鱼走既有 toolbar-entry（锚点
  // .ChatToolBar__left）；其他站点已被 detector 拦截，不会到达此分支。
  // toolbarEntry 在外层构造（createToolbarEntry 构造本身无 DOM 副作用，build 才触及 DOM），
  // 供下方 FILL_ACTION 收起定时器引用；挂载仍按站点互斥（抖音页只 mount douyinEntry）。
  const toolbarEntry = createToolbarEntry({
    doc: document,
    getURL: (p) => chrome.runtime.getURL(p),
  });
  if (detected.site === 'douyin') {
    // 抖音「藏+」入口（锚点实测 2026-09-21）：只挂 douyin-entry；
    // 斗鱼 toolbar-entry 在抖音页无 .ChatToolBar__left 会静默降级，但按规范显式分流。
    const douyinEntry = createDouyinEntry({
      doc: document,
      getURL: (p) => chrome.runtime.getURL(p),
    });
    douyinEntry.mount();
  } else {
    toolbarEntry.mount(); // 斗鱼（其他站点由 detector 拦截）
  }

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
      const result = fillEngine.handleFillAction({
        content: String(payload.content ?? ''),
        mode: payload.mode === 'append' ? 'append' : 'replace',
      });
      sendResponse(result);
      // 回填成功后约 0.9s 自动收起弹层（延迟让弹层内 toast「已回填」先展示，
      // 收起后输入框露出可直接发送——聚焦由 fill-engine 现有逻辑完成）。失败路径
      // （result.ok !== true）不收起，用户需看到错误提示。900ms 为既定值（spec §5.3），
      // 不抽成可配置项（YAGNI）。
      if (result.ok) {
        setTimeout(() => toolbarEntry.hide(), 900);
      }
    } else if (type === MESSAGES.PROBE_REQUEST) {
      // 实时探测（C）：service worker 查询当前 DOM 的适配状态，
      // 覆盖注入时一次性快照的滞后（如弹幕列表延迟渲染导致的过期 adapter_down）。
      const probe = detected.adapter.probe(document);
      sendResponse({ site: detected.site, status: probe.ok ? 'ok' : 'adapter_down' });
    } else if (type === MESSAGES.GET_DOUYU_FAVORITE) {
      // 面板「一键导入官方收藏」：content script 同源 fetch 官方端点（cookie 鉴权）。
      void handleFavoriteRequest({
        cookie: document.cookie,
        fetchImpl: (url) => fetch(url, { credentials: 'include' }),
      }).then((result) => {
        // 扩展重载后 sendResponse 可能同步抛「Extension context invalidated」，
        // 在此兜住避免 unhandled rejection（SW 侧 sendToTab reject 已兜底 DELIVERY_FAILED）。
        try {
          sendResponse(result);
        } catch {
          /* 上下文已失效，忽略 */
        }
      });
      return true; // 异步回包
    }
    return false; // 同步回包
  });
}
