// 面板存储变更监听 StorageWatcher（技术方案 V0.2 5.2 契约要点 + 2026-08 修复）。
// 职责：监听 chrome.storage.onChanged，本插件数据 key 变化时防抖触发回调。
// 背景：右键收藏（content script）写入 local 存储，面板需感知外部变更自动刷新列表，
// 否则停留在当前分组看不到新增弹幕（需切换分组才刷新）。
// 边界：只响应 local 区与本插件 key；不携带业务规则；防抖合并高频写入。

export interface StorageWatcherDeps {
  /** 注册存储变更监听，返回取消订阅函数（注入 chrome.storage.onChanged 便于契约测试） */
  subscribe(
    listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
  ): () => void;
  /** 本插件存储 key 白名单（仅这些 key 变化触发刷新） */
  keys: string[];
  /** 变化后的刷新回调（防抖合并后调用一次） */
  onChange(): void;
  /** 防抖窗口（ms），默认 150 */
  debounceMs?: number;
}

export interface StorageWatcher {
  mount(): void;
  dispose(): void;
}

export function createStorageWatcher(deps: StorageWatcherDeps): StorageWatcher {
  const { subscribe, keys, onChange, debounceMs = 150 } = deps;
  const keySet = new Set(keys);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | null = null;

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      onChange();
    }, debounceMs);
  }

  function onStorageChanged(changes: Record<string, { newValue?: unknown }>, area: string): void {
    if (area !== 'local') return;
    const hit = Object.keys(changes).some((key) => keySet.has(key));
    if (!hit) return;
    schedule();
  }

  return {
    mount() {
      if (unsubscribe) return;
      unsubscribe = subscribe(onStorageChanged);
    },
    dispose() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}
