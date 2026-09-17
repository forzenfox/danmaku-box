// 右键菜单 Shadow 宿主（专项 PRD FR-V05）：默认挂 documentElement；
// 视频全屏（Fullscreen API）时 documentElement 不在全屏渲染树内，菜单不可见，
// 须在 fullscreenchange 时把宿主迁入 fullscreenElement、退出时迁回。
// 与工具栏弹层「全屏即收起」策略并存：弹层属驻留型入口，右键菜单属瞬时型入口，
// 用户主动唤出必须就地可见。

export interface MenuHost {
  ensureShadow(): ShadowRoot;
  migrate(): void;
}

export function createMenuHost(doc: Document, styles: string): MenuHost {
  let host: HTMLElement | null = null;
  let shadow: ShadowRoot | null = null;

  function ensureShadow(): ShadowRoot {
    if (shadow && host?.isConnected) return shadow;
    host = doc.createElement('div');
    host.dataset.danmakuBox = 'root';
    (doc.fullscreenElement ?? doc.documentElement).appendChild(host);
    shadow = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = styles;
    shadow.appendChild(style);
    return shadow;
  }

  function migrate(): void {
    if (!host) return;
    const target = doc.fullscreenElement ?? doc.documentElement;
    if (host.parentElement !== target) target.appendChild(host);
  }

  return { ensureShadow, migrate };
}
