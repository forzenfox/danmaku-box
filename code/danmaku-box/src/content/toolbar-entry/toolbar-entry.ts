// danmaku-box/src/content/toolbar-entry/toolbar-entry.ts
// 工具栏「藏+」入口与官方锚定弹层宿主（spec 2026-09-07 §2/§3）。
// 职责：向斗鱼聊天工具栏 .ChatToolBar__left 注入 18×18「藏+」按钮（位于
// 「高能」与官方收藏 .ChatBarrageCollect 之间），点击后从工具栏上沿向上
// 展开官方锚定弹层（宽 378 对齐官方、高 min(480, 可用−6)、顶圆角8px/底直角）。
// 边界：不承载任何业务规则；不做回填；非斗鱼（无 .ChatToolBar__left）静默降级，
// 保留插件图标入口兜底；开关为页面内局部状态，不持久化。
// 测试策略：依赖注入 doc/getURL/win，DOM 副作用留人工走查（spec §4/§5）。

/** 内嵌样式：作用域前缀 cang-，挂载于 .ChatToolBar__left 内（工具栏为 absolute 包含块） */
export const TOOLBAR_ENTRY_STYLES = `
.cang-pop {
  position: absolute;
  bottom: calc(100% + 6px);       /* 底边贴工具栏上沿（6px 呼吸） */
  left: -6px;                     /* 对齐官方弹窗实测左缘（官方 x=358 vs 工具栏 x=364） */
  width: 378px;
  /* 高度由 JS 内联 height 锁定（min(480, 工具栏上方可用−6)），CSS 兜底 480 防首次渲染塌缩 */
  height: 480px;
  z-index: 2147483647;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-bottom: 0;
  border-radius: 8px 8px 0 0;     /* 顶圆角、底部直角贴合工具栏 */
  box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.1);
  display: none;
  flex-direction: column;
  overflow: hidden;
}
.cang-pop.open { display: flex; }
.cang-pop .cang-iframe { width: 100%; height: 100%; border: 0; display: block; }
/* 按钮默认主色蓝（与官方 ChatBarrageCollect 高亮态同色），
   icon 用 currentColor 透出：默认实色蓝（与官方一致），hover 不变色保持稳定视觉 */
.cang-entry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-right: 8px;
  border-radius: 4px;
  cursor: pointer;
  color: #1652f0;
  position: relative;
}
.cang-entry:hover { color: #0d3fc9; }
.cang-entry.is-on { color: #0d3fc9; }
.cang-entry svg { display: block; }
`;

/**
 * 弹层高度上限纯函数：min(cap, 工具栏顶部到视口顶的距离 − 6)，下限 0。
 * toolbarTop 取视口坐标（getBoundingClientRect().top），随 scroll/resize 更新。
 */
export function computeMaxHeight(toolbarTop: number, cap = 480): number {
  return Math.max(0, Math.min(cap, toolbarTop - 6));
}

export interface ToolbarEntryDeps {
  /** 页面 document（测试注入 fake） */
  doc: Document;
  /** 组装 chrome-extension iframe src */
  getURL: (path: string) => string;
  /** 视口事件源（外部点击/全屏；测试为 null 时跳过监听注册） */
  win?: Window | null;
  /** MutationObserver 构造器（测试注入 fake；缺省用全局，node 无全局时走旧降级语义） */
  observerCtor?: typeof MutationObserver;
}

export interface ToolbarEntry {
  mount(): void;
  hide(): void;
  isOpen(): boolean;
  dispose(): void;
}

/**
 * 「收藏」icon：18×18 实心五角星 + 圆角底色（与官方 ChatBarrageCollect 18×18 单色 icon 风格一致）。
 * 单一 SVG：viewBox 24×24，主图五角星 + 圆角底矩形占满，颜色由 `currentColor` 透出，
 * 按钮默认主色蓝 #1652f0，hover/打开态不变（与官方一致：颜色由父级 color 控制）。
 */
function buildCangIcon(doc: Document): Element {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('stroke', 'none');
  // 圆角底（占满 24×24 视觉区，4px 圆角与按钮 .cang-entry border-radius 一致）
  const bg = doc.createElementNS(NS, 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', '24');
  bg.setAttribute('height', '24');
  bg.setAttribute('rx', '4');
  bg.setAttribute('fill', 'currentColor');
  bg.setAttribute('opacity', '0.12'); // 浅底色，hover/打开态切主色实色
  svg.appendChild(bg);
  // 实心五角星（24×24 居中）：M12 4.5 l2.6 5.5 6 .85 -4.4 4.2 1.05 5.95 L12 18.1 l-5.25 2.9 1.05 -5.95 -4.4 -4.2 6 -.85 z
  const star = doc.createElementNS(NS, 'path');
  star.setAttribute(
    'd',
    'M12 4.5l2.6 5.5 6 .85-4.4 4.2 1.05 5.95L12 18.1l-5.25 2.9 1.05-5.95-4.4-4.2 6-.85z',
  );
  star.setAttribute('fill', 'currentColor');
  svg.appendChild(star);
  return svg;
}

export function createToolbarEntry(deps: ToolbarEntryDeps): ToolbarEntry {
  const { doc, getURL } = deps;
  const view = deps.win ?? (typeof window !== 'undefined' ? window : null);
  let open = false;
  let mounted = false;
  let toolbar: HTMLElement | null = null;
  let btn: HTMLElement | null = null;
  let pop: HTMLElement | null = null;
  let styleEl: HTMLStyleElement | null = null;
  let iframe: HTMLIFrameElement | null = null;
  let observer: MutationObserver | null = null;

  /** 高度上限：跟随工具栏几何（fake/异常 doc 无 getBoundingClientRect 时跳过，沿用 CSS 兜底 480）。
   *  用内联 height 锁定（而非 max-height），让 flex column 下的 iframe 100% 跟满，撑到目标高度后内部滚动。 */
  function applyMaxHeight(): void {
    if (!pop) return;
    if (typeof toolbar?.getBoundingClientRect !== 'function') return; // 测试桩无几何能力 → 跳过
    const top = toolbar.getBoundingClientRect().top;
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

  /** 进入全屏播放器时收起（退出不自动恢复——无 lastOpen 语义） */
  function onFullscreen(): void {
    if (view?.document.fullscreenElement) hide();
  }

  function fallback(): void {
    // 平台锚点缺失：静默降级，不抛错、零 DOM 创建（插件图标入口仍在）
  }

  function build(): void {
    // 幂等守卫：已注入且仍在文档中不重复 build；断连（hydration 替换子树）允许重建
    if (btn?.isConnected || pop?.isConnected) return;
    toolbar = doc.querySelector('.ChatToolBar__left');
    if (!toolbar) {
      fallback();
      return;
    }
    // 清孤儿引用：旧节点已脱离文档（hydration 替换），重建全新节点
    btn = null;
    pop = null;
    styleEl = null;
    iframe = null;

    // 1. 内嵌样式（随工具栏挂载，同包含块语义）
    styleEl = doc.createElement('style');
    styleEl.textContent = TOOLBAR_ENTRY_STYLES;
    toolbar.appendChild(styleEl as never);

    // 2. 「藏+」入口按钮：插入官方收藏之前（缺失则追加末尾）
    btn = doc.createElement('div');
    btn.className = 'cang-entry';
    btn.setAttribute('title', '藏+（弹幕收藏夹）');
    btn.setAttribute('aria-label', '藏+（弹幕收藏夹）');
    const icon = buildCangIcon(doc);
    btn.appendChild(icon as never);
    btn.addEventListener('click', toggle);
    const collect = toolbar.querySelector('.ChatBarrageCollect');
    if (collect) toolbar.insertBefore(btn, collect);
    else toolbar.appendChild(btn);

    // 3. 弹层宿主：工具栏子节点（absolute 脱离 flex 流），内部 iframe 载入 panel.html
    pop = doc.createElement('div');
    pop.className = 'cang-pop';
    iframe = doc.createElement('iframe');
    iframe.className = 'cang-iframe';
    iframe.setAttribute('src', getURL('panel.html'));
    pop.appendChild(iframe);
    toolbar.appendChild(pop);
  }

  /**
   * 单次尝试构建：成功则注册事件与高度计算并置 mounted；失败返回 false，
   * 由调用方决定是否经 MutationObserver 等待锚点出现（SPA 延迟渲染）。
   */
  function tryMount(): boolean {
    build();
    if (!toolbar) return false;
    applyMaxHeight();
    doc.addEventListener('keydown', onKeydown);
    view?.addEventListener('mousedown', onExternalPointerDown, { capture: true });
    view?.addEventListener('fullscreenchange', onFullscreen);
    view?.addEventListener('resize', applyMaxHeight);
    mounted = true;
    return true;
  }

  /**
   * DOM 变化守护回调（常驻观察器）：
   * - 已挂载且按钮健在 → O(1) 快速路径无操作（幂等）
   * - 已挂载但按钮断连（斗鱼 Vue hydration 替换 SSR 工具栏子树）→ 仅重建 DOM 节点，
   *   事件监听注册在 doc/view 上不受子树替换影响，不重复注册
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
    tryMount();
    // 常驻守护观察器：锚点延迟渲染（SPA 异步挂载）等待注入；已注入后防
    // hydration 替换丢失（SSR 直出工具栏会被框架重建，注入节点随之脱离文档）。
    // 无 observer 能力（node 测试环境/极端平台）保持旧降级语义：静默跳过。
    if (observer) return;
    const ctor =
      deps.observerCtor ?? (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    if (!ctor) return;
    observer = new ctor(onDomMutated);
    observer.observe(
      doc.documentElement ?? (doc.body as Element | null) ?? (doc as unknown as Element),
      {
        childList: true,
        subtree: true,
      },
    );
  }

  function dispose(): void {
    observer?.disconnect();
    observer = null;
    doc.removeEventListener('keydown', onKeydown);
    view?.removeEventListener('mousedown', onExternalPointerDown, { capture: true });
    view?.removeEventListener('fullscreenchange', onFullscreen);
    view?.removeEventListener('resize', applyMaxHeight);
    btn?.remove();
    pop?.remove();
    styleEl?.remove();
    btn = null;
    pop = null;
    styleEl = null;
    iframe = null;
    toolbar = null;
    mounted = false;
    open = false;
  }

  return { mount, hide, isOpen: () => open, dispose };
}
