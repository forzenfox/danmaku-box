// danmaku-box/src/content/toolbar-entry/douyin-entry.ts
// 抖音「藏+」入口与官方锚定弹层宿主（浏览器实测 2026-09-21）。
// 职责：向抖音直播聊天区注入 18×18「藏+」收藏按钮 + 弹层宿主（内嵌 panel.html iframe）。
// 登录态分叉锚点（selector-dict 实测）：
//   - 已登录：`.webcast-chatroom___input-container` 存在，按钮 insertBefore 到其首个子元素前
//             （容器最左），弹层挂入 chatroom 子节点，高度以该容器几何为准；
//   - 未登录：input-container 整体不渲染，被 `.cjR8oGui` 登录提示条替代，按钮 appendChild 到提示条；
//   - 聊区或双锚点均缺失 → 静默降级，零 DOM 创建（保留插件图标入口兜底）。
// 弹层以 chatroom 为绝对定位包含块（position:absolute），与斗鱼复用 buildCangIcon / computeMaxHeight。
// 边界：不承载业务规则；不做回填；开关为页面内局部状态，不持久化。
// 测试策略：依赖注入 doc/getURL/win，DOM 副作用留人工走查。

/** 抖音聊区容器锚点选择器（装配互斥契约端口，见 index.assembly.test.ts）。 */
export const DOUYIN_ENTRY_ANCHOR = '.webcast-chatroom';

/** 内嵌样式：沿用斗鱼 `cang-` 前缀（同页单站点不冲突），挂载于 chatroom（absolute 包含块）内 */
export const DOUYIN_ENTRY_STYLES = `
.cang-pop {
  position: absolute;
  bottom: calc(100% + 6px);       /* 底边贴锚点上沿（6px 呼吸） */
  left: -6px;                     /* 贴聊天区左缘实测偏移 */
  width: 378px;
  /* 高度由 JS 内联 height 锁定（min(480, 锚点上方可用-6)），CSS 兜底 480 防首次渲染塌缩 */
  height: 480px;
  z-index: 2147483647;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-bottom: 0;
  border-radius: 8px 8px 0 0;     /* 顶圆角、底部直角 */
  display: none;
  flex-direction: column;
  overflow: hidden;
}
.cang-pop.open { display: flex; }
.cang-pop .cang-iframe { width: 100%; height: 100%; border: 0; display: block; }
.cang-entry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  cursor: pointer;
  color: #1652f0;
}
.cang-entry:hover { color: #0d3fc9; }
.cang-entry.is-on { color: #0d3fc9; }
.cang-entry svg { display: block; }
`;

/** 「收藏」icon 与高度上限纯函数复用斗鱼版（DRY）。 */
import { buildCangIcon, computeMaxHeight } from './toolbar-entry.ts';

export interface DouyinEntryDeps {
  /** 页面 document（测试注入 fake） */
  doc: Document;
  /** 组装 chrome-extension iframe src */
  getURL: (path: string) => string;
  /** 视口事件源（外部点击；测试为 null 时跳过监听注册） */
  win?: Window | null;
  /** MutationObserver 构造器（测试注入 fake；缺省用全局，node 无全局时走旧降级语义） */
  observerCtor?: typeof MutationObserver;
}

export interface DouyinEntry {
  mount(): void;
  hide(): void;
  isOpen(): boolean;
  dispose(): void;
}

export function createDouyinEntry(deps: DouyinEntryDeps): DouyinEntry {
  const { doc, getURL } = deps;
  const view = deps.win ?? (typeof window !== 'undefined' ? window : null);
  let open = false;
  let mounted = false;
  let chatroom: HTMLElement | null = null;
  /** 高度锚点：已登录=input-container，未登录=hint */
  let anchor: HTMLElement | null = null;
  let btn: HTMLElement | null = null;
  let pop: HTMLElement | null = null;
  let styleEl: HTMLStyleElement | null = null;
  let iframe: HTMLIFrameElement | null = null;
  let observer: MutationObserver | null = null;

  /** 高度上限：跟随锚点几何（fake/异常 doc 无 getBoundingClientRect 时跳过，沿用 CSS 兜底 480）。
   *  用内联 height 锁定（而非 max-height），让 flex column 下的 iframe 100% 跟满。 */
  function applyMaxHeight(): void {
    if (!pop) return;
    if (typeof anchor?.getBoundingClientRect !== 'function') return; // 测试桩无几何能力 → 跳过
    const top = anchor.getBoundingClientRect().top;
    if (Number.isFinite(top)) pop.style.height = `${computeMaxHeight(top)}px`;
  }

  function setOpen(force: boolean): void {
    open = force;
    pop?.classList.toggle('open', force);
    btn?.classList.toggle('is-on', force);
  }

  function hide(): void {
    setOpen(false);
  }

  function toggle(): void {
    setOpen(!open);
  }

  /** 外部 mousedown（目标不在弹层宿主子树内）→ 收起；宿主内点击（含 iframe）不收起 */
  function onExternalPointerDown(e: MouseEvent): void {
    if (!open) return;
    const target = (e.target ?? null) as Node | null;
    if (pop && target && pop.contains(target)) return;
    hide();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') hide();
  }

  function build(): void {
    // 幂等守卫：已注入且仍在文档中不重复 build；断连（hydration 替换子树）允许重建
    if (btn?.isConnected || pop?.isConnected) return;
    chatroom = doc.querySelector(DOUYIN_ENTRY_ANCHOR);
    if (!chatroom) return; // 聊区缺失：静默降级，零 DOM 创建

    // 双锚点分叉：已登录取 input-container，未登录取登录提示条
    const input = chatroom.querySelector('.webcast-chatroom___input-container');
    const hint = chatroom.querySelector('.cjR8oGui');
    if (!input && !hint) return; // 双锚点均缺失：静默降级，零 DOM 创建
    anchor = (input ?? hint) as HTMLElement;

    // 清孤儿引用：旧节点已脱离文档（hydration 替换），重建全新节点
    btn = null;
    pop = null;
    styleEl = null;
    iframe = null;

    // 1. 内嵌样式（随 chatroom 挂载，同包含块语义）
    styleEl = doc.createElement('style');
    styleEl.textContent = DOUYIN_ENTRY_STYLES;
    chatroom.appendChild(styleEl);

    // 2. 「藏+」入口按钮：已登录插入 input-container 首个子元素前（容器最左），
    //    未登录追加到登录提示条
    btn = doc.createElement('div');
    btn.className = 'cang-entry';
    btn.setAttribute('title', '藏+（弹幕收藏夹）');
    btn.setAttribute('aria-label', '藏+（弹幕收藏夹）');
    const icon = buildCangIcon(doc);
    btn.appendChild(icon);
    btn.addEventListener('click', toggle);
    if (input) {
      const first = input.children[0] ?? null;
      if (first) input.insertBefore(btn, first);
      else input.appendChild(btn);
    } else if (hint) {
      hint.appendChild(btn);
    }

    // 3. 弹层宿主：chatroom 子节点（absolute 脱离 flex 流），内部 iframe 载入 panel.html
    pop = doc.createElement('div');
    pop.className = 'cang-pop';
    iframe = doc.createElement('iframe');
    iframe.className = 'cang-iframe';
    iframe.setAttribute('src', getURL('panel.html'));
    pop.appendChild(iframe);
    chatroom.appendChild(pop);
  }

  /**
   * 单次尝试构建：成功则注册事件与高度计算并置 mounted；失败返回 false，
   * 由调用方决定是否经 MutationObserver 等待锚点出现（SPA 延迟渲染）。
   */
  function tryMount(): boolean {
    build();
    if (!chatroom || (!btn && !pop)) return false;
    applyMaxHeight();
    doc.addEventListener('keydown', onKeydown);
    view?.addEventListener('mousedown', onExternalPointerDown, { capture: true });
    view?.addEventListener('resize', applyMaxHeight);
    mounted = true;
    return true;
  }

  /**
   * DOM 变化守护回调（常驻观察器）：
   * - 已挂载且按钮健在 → O(1) 快速路径无操作（幂等）
   * - 已挂载但按钮断连（SPA hydration 替换聊天区子树）→ 仅重建 DOM 节点
   * - 未挂载且锚点出现 → 完成首次挂载
   */
  function onDomMutated(): void {
    if (mounted) {
      if (btn?.isConnected) return;
      build();
      if (btn?.isConnected) applyMaxHeight();
      return;
    }
    tryMount();
  }

  function mount(): void {
    if (mounted) return;
    if (tryMount()) return;
    // 首挂失败（锚点延迟渲染）：注册常驻守护观察器等待锚点出现。
    // 无 observer 能力（node 测试环境/极端平台）保持旧降级语义：静默跳过。
    const ctor =
      deps.observerCtor ?? (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    if (!ctor) return;
    observer = new ctor(onDomMutated);
    observer.observe(
      doc.documentElement ?? (doc.body as Element | null) ?? (doc as unknown as Element),
      { childList: true, subtree: true },
    );
  }

  function dispose(): void {
    observer?.disconnect();
    observer = null;
    doc.removeEventListener('keydown', onKeydown);
    view?.removeEventListener('mousedown', onExternalPointerDown, { capture: true });
    view?.removeEventListener('resize', applyMaxHeight);
    btn?.remove();
    pop?.remove();
    styleEl?.remove();
    btn = null;
    pop = null;
    styleEl = null;
    iframe = null;
    anchor = null;
    chatroom = null;
    mounted = false;
    open = false;
  }

  return { mount, hide, isOpen: () => open, dispose };
}