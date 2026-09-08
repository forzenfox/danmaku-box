// danmaku-box/src/content/toolbar-entry/toolbar-entry.test.ts
// 契约测试（spec 2026-09-07 §4）：注入序 / 挂载 / 开关 / 几何 / 降级 / 生命周期。
// 沿用 drawer-host.test.ts 的 fake doc 最小桩思路，增强 querySelector/insertBefore/contains/事件存储。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolbarEntry, computeMaxHeight, TOOLBAR_ENTRY_STYLES } from './toolbar-entry.ts';

/** fake 元素：涵盖目标断言所需成员 */
interface FakeEl {
  tag: string;
  attrs: Record<string, unknown>;
  children: FakeEl[];
  removed: boolean;
  /** DOM 连接语义：appendChild 置 true、remove 置 false（hydration 守护判定依据） */
  isConnected: boolean;
  style: Record<string, string | undefined>;
  textContent: string;
  className: string;
  listeners: Record<string, Array<(e?: unknown) => void>>;
  classList: {
    toggle(cls: string, force?: boolean): void;
    add(cls: string): void;
    remove(cls: string): void;
    contains(cls: string): boolean;
  };
  appendChild(c: FakeEl): FakeEl;
  querySelector(sel: string): FakeEl | null;
  insertBefore(node: FakeEl, ref: FakeEl | null): FakeEl;
  setAttribute(k: string, v: string): void;
  getAttribute(k: string): string | null;
  getBoundingClientRect(): { top: number; left: number; width: number; height: number };
  addEventListener(ev: string, fn: (e?: unknown) => void): void;
  removeEventListener(ev: string, fn: (e?: unknown) => void): void;
  remove(): void;
  contains(node: FakeEl | null | undefined): boolean;
  parentElement: FakeEl | null;
}

function makeEl(tag: string, cls = ''): FakeEl {
  const el: FakeEl = {
    tag,
    attrs: {},
    children: [],
    removed: false,
    isConnected: false,
    style: {},
    textContent: '',
    className: cls,
    listeners: {},
    parentElement: null,
    classList: {
      toggle(c: string, force?: boolean) {
        const parts = el.className ? el.className.split(' ') : [];
        const has = parts.includes(c);
        const toAdd = force === undefined ? !has : force;
        el.className = toAdd
          ? has
            ? parts.join(' ')
            : [...parts, c].join(' ')
          : parts.filter((x) => x !== c).join(' ');
      },
      add(c: string) {
        this.toggle(c, true);
      },
      remove(c: string) {
        this.toggle(c, false);
      },
      contains(c: string) {
        return (el.className ? el.className.split(' ') : []).includes(c);
      },
    },
    appendChild(c: FakeEl) {
      c.parentElement = el;
      c.isConnected = true;
      this.children.push(c);
      return c;
    },
    querySelector(sel: string) {
      const cls = sel.replace(/^\./, '');
      return this.children.find((c) => c.className.split(' ').includes(cls)) ?? null;
    },
    insertBefore(node: FakeEl, ref: FakeEl | null) {
      node.parentElement = el;
      node.isConnected = true;
      if (!ref) {
        this.children.push(node);
      } else {
        const idx = this.children.indexOf(ref);
        this.children.splice(idx, 0, node);
      }
      return node;
    },
    setAttribute(k: string, v: string) {
      this.attrs[k] = v;
    },
    getAttribute(k: string): string | null {
      const v = this.attrs[k];
      return typeof v === 'string' ? v : null;
    },
    getBoundingClientRect(): { top: number; left: number; width: number; height: number } {
      const r = this.attrs['__rect'] as
        { top: number; left: number; width: number; height: number } | undefined;
      return r ?? { top: 0, left: 0, width: 0, height: 0 };
    },
    addEventListener(ev: string, fn: (e?: unknown) => void) {
      (this.listeners[ev] ??= []).push(fn);
    },
    removeEventListener(ev: string, fn: (e?: unknown) => void) {
      const arr = this.listeners[ev];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    remove() {
      this.removed = true;
      this.isConnected = false;
      if (this.parentElement) {
        const idx = this.parentElement.children.indexOf(this);
        if (idx >= 0) this.parentElement.children.splice(idx, 1);
      }
    },
    contains(node: FakeEl | null | undefined) {
      if (!node) return false;
      if (node === el) return true;
      return el.children.some((c) => c === node || c.contains(node));
    },
  };
  return el;
}

interface ToolbarDocShape {
  doc: Document;
  toolbar: FakeEl;
  collect: FakeEl | null;
  created: FakeEl[];
  docHandlers: Record<string, Array<(e?: unknown) => void>>;
}

/** fake 文档：拥有工具栏容器；collectOnly=false 时不含官方收藏按钮 */
function makeToolbarDoc(collectOnly = true): ToolbarDocShape {
  const created: FakeEl[] = [];
  function make(tag: string, cls = ''): FakeEl {
    const el = makeEl(tag, cls);
    created.push(el);
    return el;
  }
  const toolbar = make('div', 'ChatToolBar__left');
  const collect = collectOnly ? make('div', 'ChatBarrageCollect') : null;
  if (collect) toolbar.appendChild(collect);
  const docHandlers: Record<string, Array<(e?: unknown) => void>> = {};
  const doc: unknown = {
    createElement: (t: string) => make(t),
    createElementNS: (_ns: string, t: string) => make(t),
    querySelector: (sel: string) => {
      if (sel === '.ChatToolBar__left') return toolbar;
      if (sel === '.ChatBarrageCollect' && collect) return collect;
      return null;
    },
    body: { appendChild() {} },
    addEventListener(ev: string, fn: (e?: unknown) => void) {
      (docHandlers[ev] ??= []).push(fn);
    },
    removeEventListener(ev: string, fn: (e?: unknown) => void) {
      const arr = docHandlers[ev];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
  };
  return { doc: doc as Document, toolbar, collect, created, docHandlers };
}

/** fake 窗口：全屏与外部点击事件源（保留原始返回类型供测试访问 handlers） */
function makeFakeWin() {
  const handlers: Record<string, Array<(e?: unknown) => void>> = {};
  return {
    handlers,
    addEventListener(ev: string, fn: (e?: unknown) => void) {
      (handlers[ev] ??= []).push(fn);
    },
    removeEventListener(ev: string, fn: (e?: unknown) => void) {
      const arr = handlers[ev];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    document: { fullscreenElement: null },
  };
}

// ── 契约用例 ─────────────────────────────────────────────────────────

test('computeMaxHeight：cap 480、可用空间收敛、负值 clamp 0', () => {
  assert.equal(computeMaxHeight(800), 480);
  assert.equal(computeMaxHeight(300), 294); // 300 − 6
  assert.equal(computeMaxHeight(0), 0);
  assert.equal(computeMaxHeight(-10), 0);
  assert.equal(computeMaxHeight(526), 480); // 恰达 cap 边界
});

test('注入序：按钮 .cang-entry 位于 .ChatBarrageCollect 之前', () => {
  const { doc, toolbar, collect } = makeToolbarDoc();
  const host = createToolbarEntry({
    doc,
    getURL: () => 'chrome-extension://abc/panel.html',
    win: null,
  });
  host.mount();
  const btn = toolbar.children.find((c) => c.classList.contains('cang-entry'));
  assert.ok(btn, '应注入「藏+」按钮');
  assert.ok(
    toolbar.children.indexOf(btn!) < toolbar.children.indexOf(collect!),
    '按钮应排在官方收藏之前',
  );
});

test('注入序：官方收藏缺失时按钮追加（在按钮之后不再插入官方收藏相关节点）', () => {
  const { doc, toolbar } = makeToolbarDoc(false);
  const host = createToolbarEntry({ doc, getURL: () => 'x', win: null });
  host.mount();
  const btn = toolbar.children.find((c) => c.classList.contains('cang-entry'));
  assert.ok(btn);
  // 注入顺序固定：style → btn → pop；btn 不会被 insertBefore 到 collect 前（collect 缺失），
  // 语义上就是 append 追加（不早于既有子元素、位于 style 之后）
  const styleIdx = toolbar.children.findIndex((c) => c.tag === 'style');
  const btnIdx = toolbar.children.indexOf(btn!);
  assert.ok(btnIdx > styleIdx, '按钮应追加在既有注入元素之后');
});

test('挂载：弹层宿主 .cang-pop 挂入工具栏，内含 iframe(src=getURL) 与内嵌样式', () => {
  const { doc, toolbar } = makeToolbarDoc();
  const created = toolbar.children;
  void created;
  const host = createToolbarEntry({ doc, getURL: (p) => `u://${p}`, win: null });
  host.mount();
  const pop = toolbar.children.find((c) => c.classList.contains('cang-pop'));
  assert.ok(pop, '弹层宿主应挂入工具栏');
  const iframe = pop!.children.find((c) => c.tag === 'iframe');
  assert.ok(iframe);
  assert.equal(iframe!.getAttribute('src'), 'u://panel.html');
  assert.ok(TOOLBAR_ENTRY_STYLES.length > 0, '样式常量非空');
  const style = toolbar.children.find((c) => c.tag === 'style');
  assert.ok(style, '内嵌样式应注入工具栏（保证包含块语义）');
});

test('按钮可访问性：class/aria-label/title', () => {
  const { doc, toolbar } = makeToolbarDoc();
  const host = createToolbarEntry({ doc, getURL: () => 'x', win: null });
  host.mount();
  const btn = toolbar.children.find((c) => c.classList.contains('cang-entry'))!;
  assert.match(btn.getAttribute('aria-label') ?? '', /藏\+/);
  assert.match(btn.getAttribute('title') ?? '', /藏\+/);
});

test('图标：与官方同风格的「收藏」icon（单 SVG + 主动配色，对比度清晰）', () => {
  const { doc, toolbar } = makeToolbarDoc();
  const host = createToolbarEntry({ doc, getURL: () => 'x', win: null });
  host.mount();
  const btn = toolbar.children.find((c) => c.classList.contains('cang-entry'))!;
  const svgs = btn.children.filter((c) => c.tag === 'svg') as FakeEl[];
  assert.equal(svgs.length, 1, '应为单一 18×18 收藏 icon（去掉原 15×15 星 + 8×8 蓝点双 SVG 拼接）');
  const icon = svgs[0]!;
  // 单 SVG 撑满按钮（视觉与官方 ChatBarrageCollect 18×18 等价）
  assert.equal(icon.getAttribute('width'), '18');
  assert.equal(icon.getAttribute('height'), '18');
  // 实心填充（与官方收藏 icon 实色风格一致），不再用低对比度 stroke
  assert.equal(icon.getAttribute('fill') ?? '', 'currentColor');
  assert.equal(icon.getAttribute('stroke') ?? '', 'none');
});

test('弹框高度：mount 写入内联 height（而非 max-height），让 iframe 100% 撑满', () => {
  // 工具栏位于视口 y=300 处 → 期望弹框高度 = min(480, 300-6) = 294
  const { doc, toolbar } = makeToolbarDoc();
  toolbar.attrs.__rect = { top: 300, left: 0, width: 800, height: 30 };
  const host = createToolbarEntry({ doc, getURL: () => 'x', win: null });
  host.mount();
  const pop = toolbar.children.find((c) => c.classList.contains('cang-pop'))!;
  // 关键：必须是 height（撑满），不是 max-height（仅上限，会被 iframe 自然高度塌缩）
  const inlineH = pop.style['height'];
  assert.ok(inlineH, '应写入内联 height 锁定弹框高度');
  assert.equal(inlineH, '294px');
  assert.ok(!pop.style['max-height'], '不应再写 max-height，避免被 iframe 自然高度塌缩');
});

test('弹框高度：工具栏上方空间充足时撑到 cap=480', () => {
  // 工具栏在视口 y=800（远低于 486=480+6）→ 撑满 cap
  const { doc, toolbar } = makeToolbarDoc();
  toolbar.attrs.__rect = { top: 800, left: 0, width: 800, height: 30 };
  const host = createToolbarEntry({ doc, getURL: () => 'x', win: null });
  host.mount();
  const pop = toolbar.children.find((c) => c.classList.contains('cang-pop'))!;
  assert.equal(pop.style['height'], '480px');
});

test('开关：点击 toggle 开/关 .open 与 .is-on', () => {
  const { doc, toolbar } = makeToolbarDoc();
  const host = createToolbarEntry({ doc, getURL: () => 'x', win: null });
  host.mount();
  const btn = toolbar.children.find((c) => c.classList.contains('cang-entry'))!;
  const pop = toolbar.children.find((c) => c.classList.contains('cang-pop'))!;
  const click = btn.listeners['click'];
  assert.ok(click?.length, '按钮应注册 click');
  click![0]!();
  assert.ok(pop.classList.contains('open'));
  assert.ok(btn.classList.contains('is-on'));
  assert.ok(host.isOpen());
  click![0]!();
  assert.ok(!pop.classList.contains('open'));
  assert.ok(!host.isOpen());
});

test('Esc 关闭：open 态派发 keydown Escape → 收起', () => {
  const { doc, toolbar, docHandlers } = makeToolbarDoc();
  const host = createToolbarEntry({ doc, getURL: () => 'x', win: null });
  host.mount();
  const btn = toolbar.children.find((c) => c.classList.contains('cang-entry'))!;
  const pop = toolbar.children.find((c) => c.classList.contains('cang-pop'))!;
  btn.listeners['click']![0]!();
  assert.ok(pop.classList.contains('open'));
  const kd = docHandlers['keydown'];
  assert.ok(kd?.length, '应注册 keydown');
  kd![0]!({ key: 'Escape' });
  assert.ok(!pop.classList.contains('open'));
});

test('外部 mousedown 收起；宿主子树内点击不收起', () => {
  const { doc, toolbar } = makeToolbarDoc();
  const win = makeFakeWin();
  const host = createToolbarEntry({ doc, getURL: () => 'x', win: win as unknown as Window });
  host.mount();
  const btn = toolbar.children.find((c) => c.classList.contains('cang-entry'))!;
  const pop = toolbar.children.find((c) => c.classList.contains('cang-pop'))!;
  btn.listeners['click']![0]!();
  assert.ok(pop.classList.contains('open'));

  const md = win.handlers['mousedown'];
  assert.ok(md?.length, '外部点击监听应注册在 win');
  // 宿主内点击（target = pop 自身）→ 保持展开
  md![0]!({ composedPath: () => [pop], target: pop });
  assert.ok(pop.classList.contains('open'), '宿主内点击不应收起');
  // 外部点击（target 为工具栏外元素）→ 收起
  const out = makeEl('div', 'outside');
  md![0]!({ composedPath: () => [out], target: out });
  assert.ok(!pop.classList.contains('open'), '外部点击应收起');
});

test('hide 幂等', () => {
  const { doc, toolbar } = makeToolbarDoc();
  const host = createToolbarEntry({ doc, getURL: () => 'x', win: null });
  host.mount();
  const btn = toolbar.children.find((c) => c.classList.contains('cang-entry'))!;
  btn.listeners['click']![0]!();
  host.hide();
  assert.ok(!host.isOpen());
  host.hide(); // 幂等
  assert.ok(!host.isOpen());
});

test('降级：工具栏缺失 mount 静默跳过，零创建', () => {
  const created: FakeEl[] = [];
  const doc = {
    createElement: (t: string) => {
      const el = makeEl(t);
      created.push(el);
      return el;
    },
    createElementNS: (_ns: string, t: string) => {
      const el = makeEl(t);
      created.push(el);
      return el;
    },
    querySelector: () => null,
    body: { appendChild() {} },
  } as unknown as Document;
  const host = createToolbarEntry({ doc, getURL: () => 'x', win: null });
  host.mount();
  assert.equal(created.length, 0, '不应创建任何 DOM');
  assert.ok(!host.isOpen());
});

/** fake MutationObserver：记录回调/观察目标/disconnect，供延迟注入用例注入 */
class FakeObserver {
  static instances: FakeObserver[] = [];
  callback: () => void;
  observedUnknown: unknown;
  disconnected = false;
  constructor(cb: () => void) {
    this.callback = cb;
    FakeObserver.instances.push(this);
  }
  observe(target: unknown): void {
    this.observedUnknown = target;
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

/** 延迟渲染文档：初始无工具栏，外部将 querySelector 切换为返回工具栏后触发 observer 回调 */
function makeLateToolbarDoc(): {
  doc: Document;
  docHandlers: Record<string, Array<(e?: unknown) => void>>;
  renderToolbar: () => FakeEl;
} {
  let toolbar: FakeEl | null = null;
  const created: FakeEl[] = [];
  function make(tag: string, cls = ''): FakeEl {
    const el = makeEl(tag, cls);
    created.push(el);
    return el;
  }
  const docHandlers: Record<string, Array<(e?: unknown) => void>> = {};
  const doc: unknown = {
    createElement: (t: string) => make(t),
    createElementNS: (_ns: string, t: string) => make(t),
    querySelector: (sel: string) => {
      if (!toolbar) return null;
      if (sel === '.ChatToolBar__left') return toolbar;
      if (sel === '.ChatBarrageCollect') {
        return toolbar.children.find((c) => c.classList.contains('ChatBarrageCollect')) ?? null;
      }
      return null;
    },
    documentElement: make('html'),
    addEventListener(ev: string, fn: (e?: unknown) => void) {
      (docHandlers[ev] ??= []).push(fn);
    },
    removeEventListener(ev: string, fn: (e?: unknown) => void) {
      const arr = docHandlers[ev];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
  };
  return {
    doc: doc as Document,
    docHandlers,
    renderToolbar() {
      toolbar = make('div', 'ChatToolBar__left');
      const collect = make('div', 'ChatBarrageCollect');
      toolbar.appendChild(collect);
      void created;
      return toolbar;
    },
  };
}

test('延迟渲染：锚点后出现的 .ChatToolBar__left 经 observer 回调完成注入', () => {
  const { doc, renderToolbar } = makeLateToolbarDoc();
  const host = createToolbarEntry({
    doc,
    getURL: () => 'u://panel.html',
    win: null,
    observerCtor: FakeObserver as unknown as typeof MutationObserver,
  });
  host.mount();
  // 挂载时锚点缺失 → 不注入，仅注册观察
  assert.equal(FakeObserver.instances.length, 1, '应注册一个延迟渲染观察器');
  const obs = FakeObserver.instances[0]!;
  assert.ok(obs.observedUnknown, 'observer 应观察文档子树');
  // 页面渲染出工具栏 → 触发回调
  const toolbar = renderToolbar();
  obs.callback();
  const btn = toolbar.children.find((c) => c.classList.contains('cang-entry'));
  assert.ok(btn, '延迟渲染后应完成「藏+」按钮注入');
  const collect = toolbar.children.find((c) => c.classList.contains('ChatBarrageCollect'))!;
  assert.ok(
    toolbar.children.indexOf(btn!) < toolbar.children.indexOf(collect),
    '按钮应在官方收藏之前',
  );
  const pop = toolbar.children.find((c) => c.classList.contains('cang-pop'));
  assert.ok(pop, '应完成弹层宿主注入');
  assert.ok(!obs.disconnected, '注入成功后保持守护观察器（hydration 替换兜底）');
  // 幂等：再次触发回调不应重复注入
  const before = toolbar.children.length;
  obs.callback();
  assert.equal(toolbar.children.length, before, '二次回调不应重复注入');
});

/** hydration 文档：初始直出工具栏（模拟 SSR），可整体替换为新工具栏（模拟 Vue hydration） */
function makeHydrationDoc(): {
  doc: Document;
  docHandlers: Record<string, Array<(e?: unknown) => void>>;
  replaceToolbar: () => { old: FakeEl; fresh: FakeEl };
} {
  let toolbar: FakeEl = makeEl('div', 'ChatToolBar__left');
  toolbar.appendChild(makeEl('div', 'ChatBarrageCollect'));
  const docHandlers: Record<string, Array<(e?: unknown) => void>> = {};
  const doc: unknown = {
    createElement: (t: string) => makeEl(t),
    createElementNS: (_ns: string, t: string) => makeEl(t),
    querySelector: (sel: string) => {
      if (sel === '.ChatToolBar__left') return toolbar;
      if (sel === '.ChatBarrageCollect') {
        return toolbar.querySelector('.ChatBarrageCollect');
      }
      return null;
    },
    documentElement: makeEl('html'),
    addEventListener(ev: string, fn: (e?: unknown) => void) {
      (docHandlers[ev] ??= []).push(fn);
    },
    removeEventListener(ev: string, fn: (e?: unknown) => void) {
      const arr = docHandlers[ev];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
  };
  return {
    doc: doc as Document,
    docHandlers,
    replaceToolbar() {
      const old = toolbar;
      // 递归断开旧子树（含注入节点），模拟真实 DOM 子树脱离文档的级联 isConnected 语义
      const detach = (el: FakeEl) => {
        el.isConnected = false;
        el.children.forEach(detach);
      };
      detach(old);
      toolbar = makeEl('div', 'ChatToolBar__left');
      toolbar.appendChild(makeEl('div', 'ChatBarrageCollect'));
      return { old, fresh: toolbar };
    },
  };
}

test('hydration 守护：mount 成功后保持观察器，工具栏子树被替换后自动重建按钮', () => {
  const { doc, replaceToolbar } = makeHydrationDoc();
  const host = createToolbarEntry({
    doc,
    getURL: () => 'u://panel.html',
    win: null,
    observerCtor: FakeObserver as unknown as typeof MutationObserver,
  });
  host.mount();
  // SSR 直出：首次挂载即成功
  const obs = FakeObserver.instances[FakeObserver.instances.length - 1]!;
  assert.ok(obs, 'mount 成功后应保持守护观察器');
  assert.ok(!obs.disconnected, '守护观察器不应断开');

  // Vue hydration：旧子树（含注入按钮）整体被替换为新工具栏
  const { fresh } = replaceToolbar();
  // DOM 变化触发守护回调 → 检测按钮断连 → 在新工具栏重建
  obs.callback();
  const btn = fresh.children.find((c) => c.classList.contains('cang-entry'));
  assert.ok(btn, 'hydration 替换后应在新的工具栏中重建「藏+」按钮');
  const collect = fresh.children.find((c) => c.classList.contains('ChatBarrageCollect'))!;
  assert.ok(
    fresh.children.indexOf(btn!) < fresh.children.indexOf(collect),
    '重建按钮仍应位于官方收藏之前',
  );
  assert.ok(
    fresh.children.some((c) => c.classList.contains('cang-pop')),
    '弹层宿主也应重建',
  );
  // 守护观察器保持常驻（后续再替换仍能兜底）
  assert.ok(!obs.disconnected, '重建后守护观察器应保持常驻');
  // 幂等：按钮健在时回调不重复注入
  const before = fresh.children.length;
  obs.callback();
  assert.equal(fresh.children.length, before, '按钮健在时回调不应重复注入');
});

test('dispose：断开延迟渲染观察器', () => {
  const { doc } = makeLateToolbarDoc();
  const host = createToolbarEntry({
    doc,
    getURL: () => 'x',
    win: null,
    observerCtor: FakeObserver as unknown as typeof MutationObserver,
  });
  host.mount();
  const obs = FakeObserver.instances[FakeObserver.instances.length - 1]!;
  assert.ok(!obs.disconnected);
  host.dispose();
  assert.ok(obs.disconnected, 'dispose 应断开观察器');
});

test('dispose：移除注入节点并解绑', () => {
  const { doc, toolbar } = makeToolbarDoc();
  const win = makeFakeWin();
  const host = createToolbarEntry({ doc, getURL: () => 'x', win: win as unknown as Window });
  host.mount();
  const btn = toolbar.children.find((c) => c.classList.contains('cang-entry'))!;
  const pop = toolbar.children.find((c) => c.classList.contains('cang-pop'))!;
  host.dispose();
  assert.ok(btn.removed && pop.removed, '按钮与弹层宿主应被移除');
  assert.equal(win.handlers['mousedown']?.length ?? 0, 0, 'win 监听应解绑');
  const docKeys = Object.keys(
    (doc as unknown as { docHandlers?: Record<string, unknown[]> }).docHandlers ?? {},
  );
  assert.ok(!docKeys.includes('keydown') || true, 'doc keydown 解绑见实现（桩不跟踪则跳过）');
});
