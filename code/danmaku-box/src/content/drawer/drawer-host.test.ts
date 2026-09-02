// danmaku-box/src/content/drawer/drawer-host.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDrawerHost,
  defaultMeasureWidth,
  DRAWER_STYLES,
  type DrawerSessionState,
} from './drawer-host.ts';

/** fake 宿主：最小 DOM 桩（memory-area 同款思路）。createElement 记录顺序；元素带 remove/removed 标记供 dispose 断言 */
function makeFakeDoc() {
  const created: FakeEl[] = [];
  function makeEl(tag: string): FakeEl {
    const attrs: Record<string, string> = {};
    const el: FakeEl = {
      tag,
      shadow: null,
      shadowMode: null,
      children: [] as unknown[],
      removed: false,
      style: {},
      textContent: '',
      className: '',
      classList: {
        toggle(cls: string, force?: boolean) {
          const has = this.contains(cls);
          const toAdd = force === undefined ? !has : force;
          const parts = el.className ? el.className.split(' ') : [];
          const next = toAdd
            ? has
              ? parts
              : [...parts, cls]
            : has
              ? parts.filter((x) => x !== cls)
              : parts;
          el.className = next.join(' ');
        },
        add(cls: string) {
          this.toggle(cls, true);
        },
        remove(cls: string) {
          this.toggle(cls, false);
        },
        contains(cls: string) {
          return (el.className ? el.className.split(' ') : []).includes(cls);
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
      attachShadow(init: { mode?: string }) {
        this.shadowMode = init?.mode ?? 'open';
        this.shadow = { appendChild() {} };
        return this.shadow;
      },
    };
    return el;
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
  shadowMode: string | null;
  children: unknown[];
  removed: boolean;
  style: { width?: string };
  textContent: string;
  className: string;
  classList: {
    toggle(cls: string, force?: boolean): void;
    add(cls: string): void;
    remove(cls: string): void;
    contains(cls: string): boolean;
  };
  appendChild(c: unknown): unknown;
  setAttribute(k: string, v: string): void;
  getAttribute(k: string): string | null;
  addEventListener(): void;
  removeEventListener(): void;
  remove(): void;
  attachShadow(init: { mode?: string }): { appendChild(c: unknown): void };
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

test('DRAWER_STYLES 含 V2 布局参数（非全高 + 保留兜底响应式宽度）', () => {
  assert.match(DRAWER_STYLES, /height: min\(62vh, 560px\)/);
  // 动态宽度由运行时内联样式覆盖；CSS 保留固定兜底（测量失败时）
  assert.match(DRAWER_STYLES, /width: min\(340px, 22vw\)/);
  // 原 max-width 会再次限制动态宽度（如 495px > 340px），必须移除，交由内联样式接管
  assert.ok(!/max-width:\s*340px/.test(DRAWER_STYLES), '不得再用 max-width: 340px 扼制动态宽度');
  assert.ok(!/width: min\(720px, 40vw\)/.test(DRAWER_STYLES), '不得再使用 40vw 宽覆盖视频区');
  assert.ok(!/bottom\s*:\s*0\s*;/.test(DRAWER_STYLES), '不得再全高贴底 bottom: 0');
});

test('Shadow 使用 open 模式（自动化走查可穿透访问把手/iframe）', () => {
  const { doc, created } = makeFakeDoc();
  const host = createDrawerHost({ doc, getURL: () => '', session: null });
  host.mount();
  const hostDiv = created.find((e) => e.tag === 'div'); // 首个 div 即 Shadow 宿主
  assert.ok(hostDiv, 'mount 后应先有宿主节点');
  assert.equal(
    hostDiv!.shadowMode,
    'open',
    'attachShadow 应以 open 模式挂载（此前 closed 阻碍 CDP/AX 走查）',
  );
});

test('动态宽度（默认测量器）：用布局视口 clientWidth 而非 innerWidth（滚动条 15px 不误遮视频）', () => {
  // 模拟真实页面：视口 1864（含 15px 滚动条）、布局视口 clientWidth=1849、视频右缘 1309
  const videoEl = {
    getBoundingClientRect: () => ({
      right: 1309,
      width: 1157,
      height: 544,
      left: 152,
      top: 124,
      bottom: 668,
    }),
  };
  const nativeDoc = {
    querySelector: (sel: string) => (sel === '#js-player-video' ? videoEl : null),
    documentElement: { clientWidth: 1849 },
  };
  const fakeWin = { innerWidth: 1864 } as unknown as Window;
  const measure = defaultMeasureWidth(nativeDoc as unknown as Document, fakeWin);
  // 抽屉右缘固定定位 right:0 对齐 clientWidth（1849）右缘 → 宽度应为 1849 - 1309 = 540
  assert.equal(measure(), 540);
});

test('动态宽度：measureWidth 返回 495 时内联样式 width=495px', () => {
  const { doc, created } = makeFakeDoc();
  const host = createDrawerHost({
    doc,
    getURL: () => '',
    session: null,
    measureWidth: () => 495,
  });
  host.mount();
  const wrap = created.find((e) => e.className.includes('drawer-host'));
  assert.ok(wrap, '应存在 .drawer-host 容器');
  assert.equal(wrap!.style.width, '495px');
});

test('动态宽度：measureWidth 返回 null 时回退 CSS 兜底（不设内联宽度）', () => {
  const { doc, created } = makeFakeDoc();
  const host = createDrawerHost({
    doc,
    getURL: () => '',
    session: null,
    measureWidth: () => null,
  });
  host.mount();
  const wrap = created.find((e) => e.className.includes('drawer-host'));
  assert.ok(wrap, '应存在 .drawer-host 容器');
  assert.ok(!wrap!.style.width, '测量失败时清除内联宽度（回退 CSS 兜底）');
});

test('DRAWER_STYLES 区分开合状态图标（把手不再恒为倒三角）', () => {
  // 语义：图标 = 下一次点击方向。右侧抽屉关闭→◀（向左滑出展开）；打开→▶（向右收回）
  // 左侧抽屉反向覆盖：关闭→▶（向右展开）；打开→◀（向左收回）
  assert.match(
    DRAWER_STYLES,
    /\.drawer-handle::before\s*\{\s*content: '◀'/,
    '默认（右侧闭合）指向展开方向 ◀',
  );
  assert.match(
    DRAWER_STYLES,
    /\.drawer-host\.open ~ \.drawer-handle::before\s*\{\s*content: '▶'/,
    '右侧展开时指向收起方向 ▶',
  );
  assert.match(
    DRAWER_STYLES,
    /\.drawer-host\.side-left ~ \.drawer-handle::before\s*\{\s*content: '▶'/,
    '左侧闭合时指向展开方向 ▶',
  );
  assert.match(
    DRAWER_STYLES,
    /\.drawer-host\.side-left\.open ~ \.drawer-handle::before\s*\{\s*content: '◀'/,
    '左侧展开时指向收起方向 ◀',
  );
});

test('把手不再渲染固定 ▼ 文本（图标交由 CSS ::before 按开合状态呈现）', () => {
  const { doc, created } = makeFakeDoc();
  const host = createDrawerHost({ doc, getURL: () => '', session: null });
  host.mount();
  const handle = created.find((e) => e.className.includes('drawer-handle'));
  assert.ok(handle, '应存在 .drawer-handle');
  assert.ok(
    !handle!.textContent.includes('▼'),
    '把手文本不再固定为倒三角 ▼（应清空，由 ::before 呈现状态图标）',
  );
});

test('动态宽度：resize 事件触发后按最新 measureWidth 重算', () => {
  const { doc, created } = makeFakeDoc();
  const listeners: Record<string, () => void> = {};
  const fakeWin = {
    document: { fullscreenElement: null as Element | null },
    addEventListener: (t: string, fn: () => void) => {
      listeners[t] = fn;
    },
    removeEventListener: () => {},
  };
  const sizes = [495, 572];
  const host = createDrawerHost({
    doc,
    getURL: () => '',
    session: null,
    win: fakeWin as unknown as Window,
    measureWidth: () => sizes.shift() ?? 572,
  });
  host.mount();
  let wrap = created.find((e) => e.className.includes('drawer-host'))!;
  assert.equal(wrap.style.width, '495px', 'mount 即按首测宽度设置');
  const onResize = listeners['resize'];
  assert.ok(onResize, 'mount 后应注册 resize 监听');
  onResize();
  wrap = created.find((e) => e.className.includes('drawer-host'))!;
  assert.equal(wrap.style.width, '572px', 'resize 后按新测量重算宽度');
});

test('动态宽度：fullscreenchange 触发后重算', () => {
  const { doc, created } = makeFakeDoc();
  const listeners: Record<string, () => void> = {};
  const fakeWin = {
    document: { fullscreenElement: null as Element | null },
    addEventListener: (t: string, fn: () => void) => {
      listeners[t] = fn;
    },
    removeEventListener: () => {},
  };
  let cur = 495;
  const host = createDrawerHost({
    doc,
    getURL: () => '',
    session: null,
    win: fakeWin as unknown as Window,
    measureWidth: () => cur,
  });
  host.mount();
  let wrap = created.find((e) => e.className.includes('drawer-host'))!;
  assert.equal(wrap.style.width, '495px');
  cur = 572;
  const onFullscreenChange = listeners['fullscreenchange'];
  assert.ok(onFullscreenChange, 'mount 后应注册 fullscreenchange 监听');
  fakeWin.document.fullscreenElement = {} as Element;
  onFullscreenChange();
  wrap = created.find((e) => e.className.includes('drawer-host'))!;
  assert.equal(wrap.style.width, '572px', '全屏切换后应按最新测量重算宽度');
});

test('动态宽度：dispose 后移除 resize 监听', () => {
  const { doc } = makeFakeDoc();
  const removed: string[] = [];
  const fakeWin = {
    document: { fullscreenElement: null as Element | null },
    addEventListener: () => {},
    removeEventListener: (t: string) => {
      removed.push(t);
    },
  };
  const host = createDrawerHost({
    doc,
    getURL: () => '',
    session: null,
    win: fakeWin as unknown as Window,
    measureWidth: () => 495,
  });
  host.mount();
  host.dispose();
  assert.ok(removed.includes('resize'), 'dispose 应移除 resize 监听');
  assert.ok(removed.includes('fullscreenchange'), 'dispose 应移除 fullscreenchange 监听');
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
