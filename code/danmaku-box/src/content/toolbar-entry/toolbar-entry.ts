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
  max-height: 480px;              /* 高度上限由运行时内联覆盖：min(480, 工具栏上方可用−6) */
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
.cang-entry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-right: 8px;
  border-radius: 4px;
  cursor: pointer;
  color: #bbb;
  position: relative;
}
.cang-entry:hover { color: #1652f0; }
.cang-entry.is-on { color: #1652f0; }
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
}

export interface ToolbarEntry {
  mount(): void;
  hide(): void;
  isOpen(): boolean;
  dispose(): void;
}

/** 星形 + 右下角加号徽标（18×18 视觉，与官方图标风格一致） */
function buildCangIcon(doc: Document): [Element, Element] {
  const NS = 'http://www.w3.org/2000/svg';
  const star = doc.createElementNS(NS, 'svg');
  star.setAttribute('viewBox', '0 0 24 24');
  star.setAttribute('fill', 'none');
  star.setAttribute('stroke', 'currentColor');
  star.setAttribute('stroke-width', '2');
  star.setAttribute('stroke-linejoin', 'round');
  star.setAttribute('width', '15');
  star.setAttribute('height', '15');
  const path = doc.createElementNS(NS, 'path');
  path.setAttribute('d', 'M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.7l-5.1 2.6 1-5.7-4.1-4 5.7-.8z');
  star.appendChild(path);

  const plus = doc.createElementNS(NS, 'svg');
  plus.setAttribute('viewBox', '0 0 8 8');
  plus.setAttribute('width', '8');
  plus.setAttribute('height', '8');
  plus.setAttribute('fill', 'currentColor');
  plus.setAttribute(
    'style',
    'position:absolute;right:0;bottom:0;color:#fff;background:#1652f0;border-radius:2px;',
  );
  const p1 = doc.createElementNS(NS, 'path');
  p1.setAttribute('d', 'M3.6 1h.8v5.8h-.8z');
  const p2 = doc.createElementNS(NS, 'path');
  p2.setAttribute('d', 'M1 3.6h5.8v.8H1z');
  plus.appendChild(p1);
  plus.appendChild(p2);
  return [star, plus];
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

  /** 高度上限：跟随工具栏几何（fake/异常 doc 无 getBoundingClientRect 时跳过，沿用 CSS 兜底 480） */
  function applyMaxHeight(): void {
    if (!pop) return;
    if (typeof toolbar?.getBoundingClientRect !== 'function') return; // 测试桩无几何能力 → 跳过
    const top = toolbar.getBoundingClientRect().top;
    if (Number.isFinite(top)) pop.style.maxHeight = `${computeMaxHeight(top)}px`;
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
    toolbar = doc.querySelector('.ChatToolBar__left');
    if (!toolbar) {
      fallback();
      return;
    }

    // 1. 内嵌样式（随工具栏挂载，同包含块语义）
    styleEl = doc.createElement('style');
    styleEl.textContent = TOOLBAR_ENTRY_STYLES;
    toolbar.appendChild(styleEl as never);

    // 2. 「藏+」入口按钮：插入官方收藏之前（缺失则追加末尾）
    btn = doc.createElement('div');
    btn.className = 'cang-entry';
    btn.setAttribute('title', '藏+（弹幕收藏夹）');
    btn.setAttribute('aria-label', '藏+（弹幕收藏夹）');
    const [star, plus] = buildCangIcon(doc);
    btn.appendChild(star as never);
    btn.appendChild(plus as never);
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

  function mount(): void {
    if (mounted) return;
    mounted = true;
    build();
    if (!toolbar) {
      mounted = false; // 降级：可重试挂载
      return;
    }
    applyMaxHeight();
    doc.addEventListener('keydown', onKeydown);
    view?.addEventListener('mousedown', onExternalPointerDown, { capture: true });
    view?.addEventListener('fullscreenchange', onFullscreen);
    view?.addEventListener('resize', applyMaxHeight);
  }

  function dispose(): void {
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
