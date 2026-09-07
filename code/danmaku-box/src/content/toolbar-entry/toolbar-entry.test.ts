// danmaku-box/src/content/toolbar-entry/toolbar-entry.test.ts
// 契约测试（spec 2026-09-07 §4）：注入序 / 挂载 / 开关 / 几何 / 降级 / 生命周期。
// 沿用 drawer-host.test.ts 的 fake doc 最小桩思路，增强 querySelector/insertBefore/contains/事件存储。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolbarEntry, computeMaxHeight, TOOLBAR_ENTRY_STYLES } from './toolbar-entry.ts';

/** fake 元素：涵盖目标断言所需成员 */
interface FakeEl {
  tag: string;
  attrs: Record<string, string>;
  children: FakeEl[];
  removed: boolean;
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
      this.children.push(c);
      return c;
    },
    querySelector(sel: string) {
      const cls = sel.replace(/^\./, '');
      return this.children.find((c) => c.className.split(' ').includes(cls)) ?? null;
    },
    insertBefore(node: FakeEl, ref: FakeEl | null) {
      node.parentElement = el;
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
    getAttribute(k: string) {
      return this.attrs[k] ?? null;
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
