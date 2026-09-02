// danmaku-box/src/content/drawer/drawer-host.ts
// 抽屉宿主 DrawerHost（spec 2026-08-31 §6）。
// 职责：管理抽屉的"壳"——把手 + Shadow DOM 容器 + panel.html iframe。
// 边界：不复制任何弹幕渲染逻辑；开关是页面内局部状态，不经 service worker。
// 测试策略：依赖注入 doc/getURL/session，DOM 副作用留人工走查（spec §8）。
// Shadow 为 open 模式：既保留样式/事件隔离（隔离样式而非隔离访问），又允许 CDP/AX 自动化走查穿透访问把手与 iframe。

/** 内嵌样式：Shadow DOM 隔离页面样式污染，open 模式允许自动化走查访问子树 */
export const DRAWER_STYLES = `
  :host { all: initial; }
  .drawer-host {
    position: fixed;
    top: 0;
    right: 0;
    height: min(62vh, 560px);
    /* 兜底宽度：动态宽度由运行时内联样式覆盖（宽 = 视口 − 视频右缘），测量失败时维持此值 */
    width: min(340px, 22vw);
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
  /* 把手图标：指向「下一次点击的方向」，开合/左右状态可区分（V3.4）
     - 右侧闭合→◀（向左滑出展开）；右侧展开→▶（向右收回）
     - 左侧闭合→▶（向右展开）；左侧展开→◀（向左收回） */
  .drawer-handle::before {
    content: '◀';
    font-size: 16px;
    line-height: 1;
  }
  .drawer-host.open ~ .drawer-handle::before { content: '▶'; }
  .drawer-host.side-left ~ .drawer-handle::before { content: '▶'; }
  .drawer-host.side-left.open ~ .drawer-handle::before { content: '◀'; }
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
  /** 动态宽度测量器：返回抽屉应占的像素宽度；null=测量失败（回退 CSS 兜底、不改内联样式） */
  measureWidth?: () => number | null;
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
  // 动态宽度测量器：缺省时按「视口宽 − 视频区域右缘」实时测量（视频锚点：js-player-video / video）
  const measureWidth = deps.measureWidth ?? defaultMeasureWidth(doc, view);

  /** 按测量结果写内联宽度；null（测量失败）则清除内联样式，回退 CSS 兜底宽度 */
  function applyWidth(): void {
    if (!root) return;
    const width = measureWidth();
    if (width !== null && width > 0) {
      root.style.width = `${width}px`;
    } else {
      root.style.width = '';
    }
  }

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
    applyWidth(); // 全屏切换改变浏览区布局，视频右缘随之变化，重算抽屉宽度
    // 退出全屏恢复为打开（lastOpen=true）时，同步会话态于内存态，消除歧见（R1）
    if (!view.document.fullscreenElement && lastOpen) persist();
  };

  // resize：窗口尺寸变化 → 视频右缘随之变化，重算抽屉宽度
  const onResize = () => applyWidth();

  function build(): void {
    // Shadow 宿主容器
    const hostEl = doc.createElement('div');
    shadowHost = hostEl; // 备份供 dispose 根除
    const shadow = hostEl.attachShadow({ mode: 'open' });
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
    // 图标由 DRAWER_STYLES 的 ::before 按 .open / .side-left 状态呈现；文本保持为空
    handle.textContent = '';
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
    applyWidth(); // 首帧按当前视口/视频布局设置抽屉宽度
    view?.addEventListener('fullscreenchange', onFullscreen);
    view?.addEventListener('resize', onResize);
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
    view?.removeEventListener('resize', onResize);
    shadowHost?.remove(); // shadow 宿主（子树随宿主一并移除）
    root = null;
    shadowHost = null;
    mounted = false;
  }

  return { mount, toggle, hide, isOpen: () => open, dispose };
}

/** 默认动态宽度测量器（生产态）：抽屉宽度 = 布局视口宽 − 视频区域右缘。
 * 用 clientWidth（布局视口，不含滚动条）而非 innerWidth：抽屉 fixed right:0 的右缘
 * 对齐的是布局视口右缘（clientWidth），用 innerWidth 会把滚动条 15px 也算进宽度，
 * 导致抽屉左缘越界遮挡视频右缘（走查实测差 15px）。
 * 视频锚点：#js-player-video（斗鱼播放器容器），回退 video 标签；
 * 找不到视频区域或视口不可用时返回 null（由调用方回退 CSS 兜底宽度）。 */
export function defaultMeasureWidth(doc: Document, view: Window | null): () => number | null {
  return () => {
    if (!view) return null;
    // 防御：测试用 fake doc 无 querySelector 时视为测量失败（回退 CSS 兜底）
    if (typeof doc.querySelector !== 'function') return null;
    const anchor = doc.querySelector('#js-player-video') ?? doc.querySelector('video');
    if (!anchor) return null;
    const right = anchor.getBoundingClientRect().right;
    const clientWidth = doc.documentElement?.clientWidth;
    if (!Number.isFinite(right) || right <= 0 || !Number.isFinite(clientWidth)) return null;
    const width = Math.round(clientWidth - right);
    return width > 0 ? width : null;
  };
}
