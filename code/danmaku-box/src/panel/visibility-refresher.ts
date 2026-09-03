// danmaku-box/src/panel/visibility-refresher.ts
// 面板重新可见时触发刷新 VisibilityRefresher（2026-09-03 跨 tab 同步缺陷修复）。
// 背景：数据变更经 chrome.storage.onChanged 广播，但后台/冻结 tab 中的抽屉面板
// 可能丢失该事件，切回收起时列表停留在旧数据。本模块以「文档重新可见/窗口聚焦」
// 为信号补拉最新数据——事件驱动、无轮询（storage-watcher 保留为前台主信号）。
// 边界：不管业务/数据；仅负责把“重新可见”翻译为去重后的 onShow 回调。

export interface VisibilityRefresherDeps {
  /** 文档对象（visibilitychange 来源；结构化窄接口，Document 天然兼容） */
  doc: {
    addEventListener(type: 'visibilitychange', listener: () => void): void;
    removeEventListener(type: 'visibilitychange', listener: () => void): void;
    readonly visibilityState: string;
  };
  /** 窗口对象（focus 来源；可空） */
  win?: {
    addEventListener(type: 'focus', listener: () => void): void;
    removeEventListener(type: 'focus', listener: () => void): void;
  } | null;
  /** 文档重新可见时的刷新回调 */
  onShow(): void;
  /** 同一次曝光内触发去重窗口（ms），默认 300：合并 visibilitychange+focus 连击 */
  debounceMs?: number;
}

export interface VisibilityRefresher {
  mount(): void;
  dispose(): void;
}

export function createVisibilityRefresher(deps: VisibilityRefresherDeps): VisibilityRefresher {
  const { doc, win = null, onShow, debounceMs = 300 } = deps;
  let mounted = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function fire(): void {
    if (timer) return; // 防抖窗口内已安排，去重连击
    timer = setTimeout(() => {
      timer = undefined;
      onShow();
    }, debounceMs);
  }

  /** 仅当文档处于可见态时视为“重新可见”信号（hidden 切走不触发） */
  const onVisibilityChange = () => {
    if (doc.visibilityState === 'visible') fire();
  };
  const onWindowFocus = () => {
    if (doc.visibilityState === 'visible') fire();
  };

  return {
    mount() {
      if (mounted) return;
      mounted = true;
      doc.addEventListener('visibilitychange', onVisibilityChange);
      win?.addEventListener('focus', onWindowFocus);
    },
    dispose() {
      if (!mounted) return;
      mounted = false;
      doc.removeEventListener('visibilitychange', onVisibilityChange);
      win?.removeEventListener('focus', onWindowFocus);
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
