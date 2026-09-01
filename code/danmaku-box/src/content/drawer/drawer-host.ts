// danmaku-box/src/content/drawer/drawer-host.ts
// 抽屉宿主 DrawerHost（spec 2026-08-31 §6）。
// 职责：管理抽屉的"壳"——把手 + Shadow DOM 容器 + panel.html iframe。
// 边界：不复制任何弹幕渲染逻辑；开关是页面内局部状态，不经 service worker。
// 测试策略：依赖注入 doc/getURL/session，DOM 副作用留人工走查（spec §8）。

/** 内嵌样式：Shadow DOM 隔离，把手/容器均页面无法触及 */
export const DRAWER_STYLES = `
  :host { all: initial; }
  .drawer-host {
    position: fixed;
    top: 0;
    right: 0;
    height: min(62vh, 560px);
    width: min(340px, 22vw);
    max-width: 340px;
    z-index: 2147483647;
    transform: translateX(105%);
    transition: transform 0.25s ease;
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.15);
    background: #fff;
  }
  .drawer-host.open { transform: translateX(0); }
  .drawer-host.side-left { right: auto; left: 0; transform: translateX(-105%); }
  .drawer-host.side-left.open { transform: translateX(0); }
  .drawer-iframe { width: 100%; height: 100%; border: 0; display: block; }
  .drawer-handle {
    position: fixed;
    top: 45%; right: 0;
    width: 28px; height: 96px;
    z-index: 2147483647;
    display: flex; align-items: center; justify-content: center;
    background: rgba(22, 82, 240, 0.92);
    color: #fff; font-size: 14px; cursor: pointer;
    border-radius: 8px 0 0 8px;
    user-select: none;
  }
  .drawer-host.side-left ~ .drawer-handle { right: auto; left: 0; border-radius: 0 8px 8px 0; }
  .drawer-cover { position: fixed; inset: 0; z-index: 2147483646; background: rgba(0,0,0,0.25); }
`;

export interface DrawerSessionState {
  open?: boolean;
  side?: 'left' | 'right';
  width?: number;
}

export interface DrawerSessionLike {
  get(key: string): Promise<DrawerSessionState | undefined>;
  set(items: Record<string, DrawerSessionState>): Promise<void>;
}

export interface DrawerHostDeps {
  /** 页面 document 注入（测试用 fake） */
  doc: Document;
  /** 组装 chrome-extension iframe src（测试注入桩） */
  getURL: (path: string) => string;
  /** 会话存储（null=不持久化）；默认生产态为 chrome.storage.session */
  session: DrawerSessionLike | null;
  /** 会话 key（可选，默认 'drawer.ui'） */
  sessionKey?: string;
  /** 视口/全屏事件源（测试注入，默认 window；测试环境为 null 时跳过监听） */
  win?: Window;
}

export interface DrawerHost {
  mount(): void;
  toggle(): void;
  hide(): void;
  isOpen(): boolean;
  dispose(): void;
}

const SESSION_KEY = 'drawer.ui';

export function createDrawerHost(deps: DrawerHostDeps): DrawerHost {
  const { doc, getURL, session, sessionKey = SESSION_KEY } = deps;
  let open = false;
  // lastOpen：用户最近一次显式 toggle 的开合意图（全屏过渡期间保留）
  let lastOpen = false;
  let mounted = false;
  let root: HTMLElement | null = null;
  let shadowHost: HTMLElement | null = null; // shadow 宿主（build 时备份，dispose 根除）
  const view = deps.win ?? (typeof window !== 'undefined' ? window : null);

  function applyOpen(force: boolean): void {
    open = force;
    root?.classList.toggle('open', open);
  }

  function persist(): void {
    if (!session) return;
    void session
      .set({
        [sessionKey]: {
          open,
          side: root?.classList.contains('side-left') ? 'left' : 'right',
        } satisfies DrawerSessionState,
      })
      .catch(() => {});
  }

  // 全屏：进入→收起（不动 lastOpen）；退出→恢复 lastOpen
  const onFullscreen = () => {
    if (!view) return;
    applyOpen(view.document.fullscreenElement ? false : lastOpen);
    // 退出全屏恢复为打开（lastOpen=true）时，同步会话态于内存态，消除歧见（R1）
    if (!view.document.fullscreenElement && lastOpen) persist();
  };

  function build(): void {
    // Shadow 宿主容器
    const hostEl = doc.createElement('div');
    shadowHost = hostEl; // 备份供 dispose 根除
    const shadow = hostEl.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = DRAWER_STYLES;
    const wrap = doc.createElement('div');
    wrap.className = 'drawer-host';
    const iframe = doc.createElement('iframe');
    iframe.className = 'drawer-iframe';
    iframe.setAttribute('src', getURL('panel.html'));
    wrap.appendChild(iframe);

    // 把手：同为 shadow 子树（fixed 定位仍相对页面视口，隔离于页面样式）
    const handle = doc.createElement('div');
    handle.className = 'drawer-handle';
    handle.textContent = '▼';
    handle.addEventListener('click', () => toggle());

    shadow.appendChild(style);
    shadow.appendChild(wrap);
    shadow.appendChild(handle);
    (doc.body as unknown as { appendChild(c: unknown): void }).appendChild(hostEl); // 仅在此处挂载一次

    root = wrap;

    // 恢复会话状态（异步，不阻塞首帧）
    if (session) {
      void session.get(sessionKey).then((s) => {
        if (s) {
          if (s.side === 'left') root?.classList.add('side-left');
          if (s.open) {
            lastOpen = true; // 会话恢复即显式意图，供全屏退出恢复
            applyOpen(true);
          }
        }
      });
    }
  }

  function mount(): void {
    if (mounted) return;
    mounted = true;
    build();
    view?.addEventListener('fullscreenchange', onFullscreen);
  }

  function toggle(): void {
    lastOpen = !open; // 记录用户显式意图
    applyOpen(lastOpen);
    persist();
  }
  function hide(): void {
    // 程序化收起：不改 lastOpen（保留用户显式意图供全屏退出恢复），但仍写回会话关闭态
    applyOpen(false);
    persist();
  }

  function dispose(): void {
    view?.removeEventListener('fullscreenchange', onFullscreen);
    shadowHost?.remove(); // shadow 宿主（子树随宿主一并移除）
    root = null;
    shadowHost = null;
    mounted = false;
  }

  return { mount, toggle, hide, isOpen: () => open, dispose };
}
