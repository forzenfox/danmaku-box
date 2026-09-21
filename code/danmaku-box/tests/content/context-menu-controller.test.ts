import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContextMenuController } from '../../src/content/context-menu.controller.ts';
import { createDouyuAdapter } from '../../src/content/adapters/douyu.ts';
import type { SiteAdapter } from '../../src/content/adapters/types.ts';

// C9 契约（专项 PRD 7.1）：「弹幕右键收藏」开关关闭时右键不拦截（不调 preventDefault，
// 站点缺省行为不变）；开关开启且命中弹幕时拦截并冻结。控制器工厂在构造期使用全局
// chrome.storage（读取开关），mount 使用全局 document，故测试在调用工厂前布置 globalThis 桩。
// 桩为最小实现：仅覆盖本用例触达的 API（contextmenu 捕获监听、Shadow 宿主、菜单节点树）。

/** 选择器 → 类名子串特征（与 douyu 适配器使用的选择器语法一致） */
function classNeedle(sel: string): string | undefined {
  return /\[class\*="([^"]+)"\]/.exec(sel)?.[1] ?? /\.([A-Za-z0-9_-]+)/.exec(sel)?.[1];
}

interface FakeShadow {
  appendChild(c: FakeEl): FakeEl;
}

interface FakeEl {
  className: string;
  tagName: string;
  ownText: string;
  children: FakeEl[];
  parent: FakeEl | null;
  isConnected: boolean;
  dataset: Record<string, string>;
  style: Record<string, string>;
  attrs: Map<string, string>;
  listeners?: Map<string, Array<(e: unknown) => void>>;
  textContent: string;
  getAttribute(k: string): string | null;
  setAttribute(k: string, v: string): void;
  appendChild(c: FakeEl): FakeEl;
  remove(): void;
  replaceChildren(): void;
  closest(sel: string): FakeEl | null;
  querySelector(sel: string): FakeEl | null;
  addEventListener(t: string, fn: (e: unknown) => void): void;
  removeEventListener(t: string, fn: (e: unknown) => void): void;
  getBoundingClientRect(): { width: number; height: number };
  attachShadow(): FakeShadow;
  focus(): void;
}

function el(className: string, tag = 'div'): FakeEl {
  const node: FakeEl = {
    className,
    tagName: tag.toUpperCase(),
    ownText: '',
    children: [],
    parent: null,
    isConnected: true,
    dataset: {},
    style: {},
    attrs: new Map<string, string>(),
    get textContent() {
      return this.ownText + this.children.map((c) => c.textContent).join('');
    },
    set textContent(v: string) {
      this.ownText = v;
    },
    getAttribute(k) {
      return this.attrs.get(k) ?? null;
    },
    setAttribute(k, v) {
      this.attrs.set(k, v);
    },
    appendChild(c) {
      c.parent?.remove();
      c.parent = node;
      this.children.push(c);
      return c;
    },
    remove() {
      if (this.parent) {
        this.parent.children = this.parent.children.filter((c) => c !== node);
        this.parent = null;
      }
    },
    replaceChildren() {
      this.children = [];
    },
    closest(sel) {
      const needle = classNeedle(sel);
      let cur: FakeEl | null = node;
      while (cur) {
        if (needle && cur.className.split(' ').some((c) => c.includes(needle))) return cur;
        cur = cur.parent;
      }
      return null;
    },
    querySelector(sel) {
      const walk = (n: FakeEl): FakeEl | null => {
        for (const c of n.children) {
          if (sel === 'img, svg') {
            if (c.tagName === 'IMG' || c.tagName === 'SVG') return c;
          } else {
            const needle = classNeedle(sel);
            if (needle && c.className.split(' ').some((x) => x.includes(needle))) return c;
          }
          const deep = walk(c);
          if (deep) return deep;
        }
        return null;
      };
      return walk(node);
    },
    addEventListener(t, fn) {
      const map = node.listeners ?? new Map<string, Array<(e: unknown) => void>>();
      node.listeners = map;
      map.set(t, [...(map.get(t) ?? []), fn]);
    },
    removeEventListener(t, fn) {
      const list = node.listeners?.get(t) ?? [];
      node.listeners?.set(
        t,
        list.filter((f) => f !== fn),
      );
    },
    getBoundingClientRect: () => ({ width: 100, height: 50 }),
    attachShadow: () => ({ appendChild: (c) => c }),
    focus: () => undefined,
  };
  return node;
}

interface DocStub {
  addEventListener(t: string, fn: (e: unknown) => void, capture?: boolean): void;
  removeEventListener(t: string, fn: (e: unknown) => void, capture?: boolean): void;
  createElement(tag: string): FakeEl;
  elementsFromPoint(x: number, y: number): FakeEl[];
  documentElement: FakeEl;
  fullscreenElement: FakeEl | null;
}

/** 事件注册表：mount 时控制器把 contextmenu 捕获处理器登记于此，测试直接取出调用 */
function makeDoc() {
  const handlers = new Map<string, Array<(e: unknown) => void>>();
  const doc: DocStub = {
    documentElement: el('html'),
    fullscreenElement: null,
    addEventListener: (t, fn) => {
      handlers.set(t, [...(handlers.get(t) ?? []), fn]);
    },
    removeEventListener: (t, fn) => {
      handlers.set(
        t,
        (handlers.get(t) ?? []).filter((f) => f !== fn),
      );
    },
    createElement: (tag) => el(tag),
    elementsFromPoint: () => [],
  };
  return { doc, handlers };
}

function makeChrome(enabled: boolean) {
  return {
    storage: {
      local: {
        get: (_key: string) =>
          Promise.resolve({ 'db.settings': { chatContextMenuEnabled: enabled } }),
      },
      onChanged: { addListener: () => undefined },
    },
    runtime: {
      sendMessage: () => Promise.resolve({ ok: true, data: { groups: [] } }),
    },
  };
}

/** 实测飘屏结构：弹幕项（携带 uuid）→ textBox → textWrap（纯文本） */
function buildDanmuItem(text: string): FakeEl {
  const item = el('danmuItem-a8616a scroll-c8a9ee');
  item.setAttribute('data-comment-uuid', 'u1');
  const textBox = el('text-da6396');
  const textWrap = el('textWrap-f7cfb9');
  textWrap.ownText = text;
  textBox.appendChild(textWrap);
  item.appendChild(textBox);
  return item;
}

/** 让出事件循环若干轮，冲刷 onContextMenu 异步链（storage.get / sendMessage 的 then） */
async function flushAsync(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise<void>((r) => setImmediate(r));
}

interface CtxEvent {
  target: FakeEl;
  clientX: number;
  clientY: number;
  defaultPrevented: boolean;
  preventDefault(): void;
}

function makeEvent(target: FakeEl): CtxEvent {
  return {
    target,
    clientX: 100,
    clientY: 100,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

/** 布置 globalThis 桩 → 构造控制器（构造期读取开关）→ mount → 返回 contextmenu 处理器 */
async function setup(enabled: boolean) {
  const { doc, handlers } = makeDoc();
  const pauseCalls: unknown[] = [];
  const resumeCalls: unknown[] = [];
  const real = createDouyuAdapter();
  const adapter: SiteAdapter = {
    ...real,
    pauseDanmu: (t?: Element) => {
      pauseCalls.push(t);
    },
    resumeDanmu: (t?: Element) => {
      resumeCalls.push(t);
    },
  };
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = doc;
  g.chrome = makeChrome(enabled);
  g.window = { innerWidth: 1280, innerHeight: 800 };
  createContextMenuController({ adapter }).mount();
  await flushAsync(); // 等待 storage.get 的 then 完成开关赋值
  const contextmenu = handlers.get('contextmenu') ?? [];
  assert.equal(contextmenu.length, 1, 'mount 应注册唯一 contextmenu 捕获处理器');
  return { fire: contextmenu[0]!, pauseCalls, resumeCalls };
}

describe('C9 右键控制器开关契约（专项 PRD 7.1 / FR-V06）', () => {
  it('开关关闭 → 命中弹幕也不拦截：不调 preventDefault、不冻结', async () => {
    const { fire, pauseCalls } = await setup(false);
    const item = buildDanmuItem('666冲冲冲');
    const e = makeEvent(item);
    fire(e);
    await flushAsync();
    assert.equal(e.defaultPrevented, false, '开关关闭时不得拦截右键');
    assert.equal(pauseCalls.length, 0, '开关关闭时不得冻结弹幕');
  });

  it('开关开启且命中飘屏弹幕 → 拦截并冻结目标', async () => {
    const { fire, pauseCalls } = await setup(true);
    const item = buildDanmuItem('666冲冲冲');
    const e = makeEvent(item);
    fire(e);
    await flushAsync();
    assert.equal(e.defaultPrevented, true, '命中弹幕应拦截原生菜单');
    assert.deepEqual(pauseCalls, [item], '应冻结被点弹幕项（FR-V03 单条冻结）');
  });

  it('开关开启但右键未命中弹幕 → 不拦截（非弹幕区恢复站点缺省行为）', async () => {
    const { fire, pauseCalls } = await setup(true);
    const blank = el('video-player');
    const e = makeEvent(blank);
    fire(e);
    await flushAsync();
    assert.equal(e.defaultPrevented, false);
    assert.equal(pauseCalls.length, 0);
  });
});
