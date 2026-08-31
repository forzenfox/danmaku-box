// danmaku-box/src/content/drawer/drawer-host.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawerHost, DRAWER_STYLES } from './drawer-host.ts';

/** fake 宿主：最小 DOM 桩（memory-area 同款思路）。createElement 记录顺序；元素带 remove/removed 标记供 dispose 断言 */
function makeFakeDoc() {
  const created: FakeEl[] = [];
  function makeEl(tag: string): FakeEl {
    const attrs: Record<string, string> = {};
    return {
      tag,
      shadow: null,
      children: [] as unknown[],
      removed: false,
      style: {},
      classList: { toggle() {}, add() {}, remove() {} },
      appendChild(c: unknown) {
        this.children.push(c);
        return c;
      },
      setAttribute(k: string, v: string) {
        attrs[k] = v;
      },
      getAttribute(k: string) {
        return attrs[k] ?? null;
      },
      addEventListener() {},
      removeEventListener() {},
      remove() {
        this.removed = true;
      },
      attachShadow() {
        this.shadow = { appendChild() {} };
        return this.shadow;
      },
    };
  }
  return {
    doc: {
      createElement: (t: string) => {
        const el = makeEl(t);
        created.push(el);
        return el;
      },
      body: { appendChild() {} },
    },
    created,
  } as unknown as { doc: Document; created: FakeEl[] };
}

/** fake 元素类型：仅涵盖目标断言所需的成员 */
interface FakeEl {
  tag: string;
  shadow: { appendChild(c: unknown): void } | null;
  children: unknown[];
  removed: boolean;
  style: Record<string, never>;
  classList: { toggle(): void; add(): void; remove(): void };
  appendChild(c: unknown): unknown;
  setAttribute(k: string, v: string): void;
  getAttribute(k: string): string | null;
  addEventListener(): void;
  removeEventListener(): void;
  remove(): void;
  attachShadow(): { appendChild(c: unknown): void };
}

test('mount 注入 iframe 且 src 为 getURL(panel.html) 结果', async () => {
  const { doc, created } = makeFakeDoc();
  const host = createDrawerHost({
    doc,
    getURL: () => 'chrome-extension://abc/panel.html',
    session: null,
  });
  host.mount();
  const iframe = created.find((e) => e.tag === 'iframe');
  assert.ok(iframe, '应创建 iframe');
  assert.equal(iframe.getAttribute('src'), 'chrome-extension://abc/panel.html');
});

test('toggle 状态机：关→开→关', () => {
  const { doc } = makeFakeDoc();
  const host = createDrawerHost({
    doc,
    getURL: () => '',
    session: null,
  });
  host.mount();
  assert.equal(host.isOpen(), false);
  host.toggle(); // 开
  assert.equal(host.isOpen(), true);
  host.toggle(); // 关
  assert.equal(host.isOpen(), false);
});

test('iframe 只创建一次（重复 mount）', () => {
  const { doc, created } = makeFakeDoc();
  const host = createDrawerHost({
    doc,
    getURL: () => 'chrome-extension://abc/panel.html',
    session: null,
  });
  host.mount();
  host.mount(); // 幂等
  const iframes = created.filter((e) => e.tag === 'iframe');
  assert.equal(iframes.length, 1);
});

test('DRAWER_STYLES 含关键选择器', () => {
  assert.match(DRAWER_STYLES, /\.drawer-iframe/);
  assert.match(DRAWER_STYLES, /\.drawer-handle/);
});
