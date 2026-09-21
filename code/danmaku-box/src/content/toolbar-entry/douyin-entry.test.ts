// danmaku-box/src/content/toolbar-entry/douyin-entry.test.ts
// 契约测试（抖音实测 2026-09-21）：双登录态锚点注入 / 弹层规格 / 开关 / 几何 / 降级 / 生命周期。
// 沿用 toolbar-entry.test.ts 的 makeEl fake 桩模式，自建 makeDouyinDoc 双态文档。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDouyinEntry, DOUYIN_ENTRY_STYLES } from './douyin-entry.ts';

/** fake 元素：与 toolbar-entry.test.ts 的 makeEl 同形（覆盖目标断言所需成员） */
interface FakeEl {
  tag: string;
  attrs: Record<string, unknown>;
  children: FakeEl[];
  removed: boolean;
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
        | { top: number; left: number; width: number; height: number }
        | undefined;
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

type DouyinState = 'logged_in' | 'logged_out' | 'none';

interface DouyinDocShape {
  doc: Document;
  chatroom: FakeEl;
  /** 实际锚点：已登录=input-container，未登录=hint；none 态为空 */
  anchors: FakeEl[];
  created: FakeEl[];
  docHandlers: Record<string, Array<(e?: unknown) => void>>;
}

/** fake 文档：按登录态渲染抖音聊天区 DOM（`.webcast-chatroom` 为绝对定位包含块） */
function makeDouyinDoc(state: DouyinState): DouyinDocShape {
  const created: FakeEl[] = [];
  function make(tag: string, cls = ''): FakeEl {
    const el = makeEl(tag, cls);
    created.push(el);
    return el;
  }
  const chatroom = make('div', 'webcast-chatroom');
  chatroom.attrs.__rect = { top: 300, left: 0, width: 378, height: 400 };
  const anchors: FakeEl[] = [];
  if (state === 'logged_in') {
    const input = make('div', 'webcast-chatroom___input-container');
    input.attrs.__rect = { top: 300, left: 0, width: 375, height: 47 };
    // 首个子元素（表情按钮），用于「容器最左」前置断言
    input.appendChild(make('div', 'first-child'));
    chatroom.appendChild(input);
    anchors.push(input);
  } else if (state === 'logged_out') {
    const hint = make('div', 'cjR8oGui');
    hint.attrs.__rect = { top: 300, left: 0, width: 375, height: 47 };
    chatroom.appendChild(hint);
    anchors.push(hint);
  }
  // none 态：chatroom 存在但双锚点均缺失 → 静默降级
  const docHandlers: Record<string, Array<(e?: unknown) => void>> = {};
  const doc: unknown = {
    createElement: (t: string) => make(t),
    createElementNS: (_ns: string, t: string) => make(t),
    querySelector: (sel: string) => {
      if (sel === '.webcast-chatroom') return chatroom;
      if (sel === '.webcast-chatroom___input-container') return anchors[0] ?? null;
      if (sel === '.cjR8oGui') return anchors[0] ?? null;
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
  return { doc: doc as Document, chatroom, anchors, created, docHandlers };
}

/** fake 窗口：外部点击事件源 */
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
  };
}

// ── 契约用例 ─────────────────────────────────────────────────────────

test('已登录：按钮 .cang-entry 插入 input-container 首个子元素前（容器最左）', () => {
  const { doc, anchors } = makeDouyinDoc('logged_in');
  const host = createDouyinEntry({ doc, getURL: (p) => `u://${p}`, win: null });
  host.mount();
  const input = anchors[0]!;
  const first = input.children.find((c) => c.classList.contains('first-child'))!;
  const btn = input.children.find((c) => c.classList.contains('cang-entry'));
  assert.ok(btn, '应注入「藏+」按钮');
  assert.ok(
    input.children.indexOf(btn!) < input.children.indexOf(first),
    '按钮应位于容器最左（首个子元素之前）',
  );
});

test('未登录：按钮追加到登录提示条 .cjR8oGui 内', () => {
  const { doc, chatroom, anchors } = makeDouyinDoc('logged_out');
  const host = createDouyinEntry({ doc, getURL: (p) => `u://${p}`, win: null });
  host.mount();
  const hint = anchors[0]!;
  const btn = hint.children.find((c) => c.classList.contains('cang-entry'));
  assert.ok(btn, '未登录态按钮应追加到 .cjR8oGui');
  assert.ok(chatroom.children.some((c) => c.classList.contains('cang-pop')), '弹层仍应挂入 chatroom');
});

test('降级：chatroom 缺失 mount 静默跳过，零创建', () => {
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
  const host = createDouyinEntry({ doc, getURL: () => 'x', win: null });
  host.mount();
  assert.equal(created.length, 0, '不应创建任何 DOM');
  assert.ok(!host.isOpen());
});

test('降级：chatroom 存在但双锚点均缺失 → 静默跳过，零创建', () => {
  const { doc, created } = makeDouyinDoc('none');
  const host = createDouyinEntry({ doc, getURL: () => 'x', win: null });
  host.mount();
  assert.ok(
    !created.some((c) => c.classList.contains('cang-entry') || c.classList.contains('cang-pop')),
    '双锚点缺失时不应创建按钮或弹层',
  );
  assert.ok(!host.isOpen());
});

test('弹层规格：连续快照挂入 chatroom，宽 378、iframe class=cang-iframe 且 src=getURL', () => {
  const { doc, chatroom } = makeDouyinDoc('logged_in');
  const host = createDouyinEntry({ doc, getURL: (p) => `cang://${p}`, win: null });
  host.mount();
  const pop = chatroom.children.find((c) => c.classList.contains('cang-pop'))!;
  assert.ok(pop, '弹层宿主应挂入 chatroom');
  assert.ok(DOUYIN_ENTRY_STYLES.includes('width: 378px'), '样式常量应含 378 宽');
  const iframe = pop.children.find((c) => c.tag === 'iframe')!;
  assert.ok(iframe, '弹层内应含 iframe');
  assert.equal(iframe.getAttribute('src'), 'cang://panel.html');
  assert.ok(
    (iframe.className ?? '').split(' ').includes('cang-iframe'),
    'iframe 类名应为 cang-iframe',
  );
});

test('弹层高度：以锚点 getBoundingClientRect().top 写入内联 height', () => {
  // 锚点（input-container）顶部 y=300 → min(480, 300-6) = 294
  const { doc, chatroom } = makeDouyinDoc('logged_in');
  const host = createDouyinEntry({ doc, getURL: () => 'x', win: null });
  host.mount();
  const pop = chatroom.children.find((c) => c.classList.contains('cang-pop'))!;
  const inlineH = pop.style['height'];
  assert.ok(inlineH, '应写入内联 height 锁定弹框高度');
  assert.equal(inlineH, '294px');
});

test('开关：点击 toggle .open 与 .is-on', () => {
  const { doc, chatroom, anchors } = makeDouyinDoc('logged_in');
  const host = createDouyinEntry({ doc, getURL: () => 'x', win: null });
  host.mount();
  const input = anchors[0]!;
  const btn = input.children.find((c) => c.classList.contains('cang-entry'))!;
  const pop = chatroom.children.find((c) => c.classList.contains('cang-pop'))!;
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
  const { doc, chatroom, anchors, docHandlers } = makeDouyinDoc('logged_in');
  const host = createDouyinEntry({ doc, getURL: () => 'x', win: null });
  host.mount();
  const btn = anchors[0]!.children.find((c) => c.classList.contains('cang-entry'))!;
  const pop = chatroom.children.find((c) => c.classList.contains('cang-pop'))!;
  btn.listeners['click']![0]!();
  assert.ok(pop.classList.contains('open'));
  const kd = docHandlers['keydown'];
  assert.ok(kd?.length, '应注册 keydown');
  kd![0]!({ key: 'Escape' });
  assert.ok(!pop.classList.contains('open'));
});

test('外部 mousedown 收起；弹层子树内点击不收起', () => {
  const { doc, chatroom, anchors } = makeDouyinDoc('logged_in');
  const win = makeFakeWin();
  const host = createDouyinEntry({ doc, getURL: () => 'x', win: win as unknown as Window });
  host.mount();
  const btn = anchors[0]!.children.find((c) => c.classList.contains('cang-entry'))!;
  const pop = chatroom.children.find((c) => c.classList.contains('cang-pop'))!;
  btn.listeners['click']![0]!();
  assert.ok(pop.classList.contains('open'));
  const md = win.handlers['mousedown'];
  assert.ok(md?.length, '外部点击监听应注册在 win');
  // 弹层内点击（target = pop 自身）→ 保持展开
  md![0]!({ target: pop });
  assert.ok(pop.classList.contains('open'), '弹层内点击不应收起');
  // 外部点击（target 为弹层外元素）→ 收起
  const out = makeEl('div', 'outside');
  md![0]!({ target: out });
  assert.ok(!pop.classList.contains('open'), '外部点击应收起');
});

test('hide 幂等', () => {
  const { doc, anchors } = makeDouyinDoc('logged_in');
  const host = createDouyinEntry({ doc, getURL: () => 'x', win: null });
  host.mount();
  const btn = anchors[0]!.children.find((c) => c.classList.contains('cang-entry'))!;
  btn.listeners['click']![0]!();
  assert.ok(host.isOpen());
  host.hide();
  assert.ok(!host.isOpen());
  host.hide(); // 幂等
  assert.ok(!host.isOpen());
});

test('dispose：移除注入节点并解绑', () => {
  const { doc, chatroom, anchors } = makeDouyinDoc('logged_in');
  const win = makeFakeWin();
  const host = createDouyinEntry({ doc, getURL: () => 'x', win: win as unknown as Window });
  host.mount();
  const input = anchors[0]!;
  const btn = input.children.find((c) => c.classList.contains('cang-entry'))!;
  const pop = chatroom.children.find((c) => c.classList.contains('cang-pop'))!;
  host.dispose();
  assert.ok(btn.removed && pop.removed, '按钮与弹层宿主应被移除');
  assert.equal(win.handlers['mousedown']?.length ?? 0, 0, 'win 监听应解绑');
});