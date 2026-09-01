// danmaku-box/src/content/drawer/drawer-host.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawerHost, DRAWER_STYLES, type DrawerSessionState } from './drawer-host.ts';

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
      classList: {
        toggle() {},
        add() {},
        remove() {},
        contains() {
          return false;
        },
      },
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
  classList: { toggle(): void; add(): void; remove(): void; contains(): boolean };
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

test('fullscreen 进入收起、退出恢复上次开合意图', () => {
  const { doc } = makeFakeDoc();
  const listeners: Record<string, () => void> = {};
  const fakeWin = {
    document: { fullscreenElement: null as Element | null },
    addEventListener: (t: string, fn: () => void) => {
      listeners[t] = fn;
    },
    removeEventListener: () => {},
  };
  const host = createDrawerHost({
    doc,
    getURL: () => '',
    session: null,
    win: fakeWin as unknown as Window,
  });
  host.mount();
  host.toggle(); // 用户打开 → open/lastOpen=true
  assert.equal(host.isOpen(), true);
  const onFullscreenChange = listeners['fullscreenchange'];
  assert.ok(onFullscreenChange, 'mount 后应注册 fullscreenchange 监听');
  fakeWin.document.fullscreenElement = {} as Element;
  onFullscreenChange(); // 进入全屏 → 收起
  assert.equal(host.isOpen(), false);
  fakeWin.document.fullscreenElement = null;
  onFullscreenChange(); // 退出全屏 → 恢复 lastOpen=true
  assert.equal(host.isOpen(), true);
});

test('dispose 移除 Shadow 宿主节点', () => {
  const { doc, created } = makeFakeDoc();
  const host = createDrawerHost({
    doc,
    getURL: () => '',
    session: null,
  });
  host.mount();
  const hostDiv = created.find((e) => e.tag === 'div'); // 首个 div 即 Shadow 宿主（记录内不可变性由 fake 保证）
  assert.ok(hostDiv, 'mount 后应先有宿主节点');
  host.dispose();
  assert.equal(host.isOpen(), false);
  assert.equal(hostDiv.removed, true, 'Shadow 宿主被移除（子树随之移除）');
});

test('DRAWER_STYLES 含 V2 布局参数（非全高 + 响应式宽度）', () => {
  assert.match(DRAWER_STYLES, /height: min\(62vh, 560px\)/);
  assert.match(DRAWER_STYLES, /width: min\(720px, 40vw\)/);
  assert.ok(!/bottom\s*:\s*0\s*;/.test(DRAWER_STYLES), '不得再全高贴底 bottom: 0');
});

test('hide() 收起并写回会话关闭态', async () => {
  const { doc } = makeFakeDoc();
  let saved: Record<string, DrawerSessionState> | null = null;
  const session = {
    get: async () => undefined,
    set: async (items: Record<string, DrawerSessionState>) => {
      saved = items;
    },
  };
  const host = createDrawerHost({ doc, getURL: () => '', session });
  host.mount();
  host.toggle();
  assert.equal(host.isOpen(), true);
  host.hide();
  assert.equal(host.isOpen(), false);
  await Promise.resolve();
  assert.equal(saved!['drawer.ui']!.open, false);
});

test('hide() 幂等：toggle 开->hide->再 hide 不报错且 isOpen() 保持 false', () => {
  const { doc } = makeFakeDoc();
  const host = createDrawerHost({ doc, getURL: () => '', session: null });
  host.mount();
  host.toggle();
  assert.equal(host.isOpen(), true);
  host.hide();
  assert.equal(host.isOpen(), false);
  assert.doesNotThrow(() => host.hide());
  assert.equal(host.isOpen(), false);
});

test('hide() 不动 lastOpen，全屏进入仍收起、退出恢复显式意图', () => {
  const { doc } = makeFakeDoc();
  const listeners: Record<string, () => void> = {};
  const fakeWin = {
    document: { fullscreenElement: null as Element | null },
    addEventListener: (t: string, fn: () => void) => {
      listeners[t] = fn;
    },
    removeEventListener: () => {},
  };
  const host = createDrawerHost({
    doc,
    getURL: () => '',
    session: null,
    win: fakeWin as unknown as Window,
  });
  host.mount();
  host.toggle(); // 用户打开 -> lastOpen=true
  host.hide(); // 程序化收起 -> open=false，但不改 lastOpen
  assert.equal(host.isOpen(), false);
  const onFullscreenChange = listeners['fullscreenchange'];
  assert.ok(onFullscreenChange, 'mount 后应注册 fullscreenchange 监听');
  fakeWin.document.fullscreenElement = {} as Element;
  onFullscreenChange(); // 进入全屏 -> 保持收起
  assert.equal(host.isOpen(), false);
  fakeWin.document.fullscreenElement = null;
  onFullscreenChange(); // 退出全屏 -> 恢复显式意图 open=true
  assert.equal(host.isOpen(), true);
});

test('退出全屏恢复打开时会话同步写回 open:true', async () => {
  const { doc } = makeFakeDoc();
  const listeners: Record<string, () => void> = {};
  const fakeWin = {
    document: { fullscreenElement: null as Element | null },
    addEventListener: (t: string, fn: () => void) => {
      listeners[t] = fn;
    },
    removeEventListener: () => {},
  };
  let saved: Record<string, DrawerSessionState> | null = null;
  const session = {
    get: async () => undefined,
    set: async (items: Record<string, DrawerSessionState>) => {
      saved = items;
    },
  };
  const host = createDrawerHost({
    doc,
    getURL: () => '',
    session,
    win: fakeWin as unknown as Window,
  });
  host.mount();
  host.toggle(); // lastOpen=true
  host.hide(); // 会话写回 open:false
  assert.equal(saved!['drawer.ui']!.open, false);
  const onFullscreenChange = listeners['fullscreenchange'];
  assert.ok(onFullscreenChange, 'mount 后应注册 fullscreenchange 监听');
  fakeWin.document.fullscreenElement = null; // 已退出全屏，触发恢复打开
  onFullscreenChange();
  await Promise.resolve(); // 等 persist 落库（session.set 真异步）
  assert.equal(host.isOpen(), true);
  assert.equal(saved!['drawer.ui']!.open, true, '会话态应跟随内存态写回 open:true');
});
