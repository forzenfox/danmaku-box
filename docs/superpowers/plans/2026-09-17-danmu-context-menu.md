# 飘屏弹幕右键收藏 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在斗鱼视频区飘屏弹幕上实现右键唤出「藏+」收藏菜单：准确命中单条弹幕、WAAPI 冻结/恢复、全屏可用，复用既有聊天区收藏链路。

**Architecture:** 按可行性报告 6.2 与专项 PRD 的契约，把飘屏能力收敛在斗鱼适配器（M6）内重写；右键控制器的新增逻辑（hover 采样、三级命中、冻结管理、全屏宿主迁移）全部抽为**纯模块**独立测试，控制器仅做装配，避免为 chrome API 搭重型测试桩。通用层（消息链路、存储、菜单 UI）零改动。

**Tech Stack:** TypeScript + node:test（无 jsdom，沿用项目 fake 桩风格）+ esbuild；门禁 `npm run check`（typecheck → lint → test → build）。

**规格依据：** `docs/product/PRD-danmu-context-menu.md`（V1.0）、`reports/danmu-context-menu-feasibility/`（实测证据）。契约编号 C1-C9 对应 PRD 7.1。

**工作目录：** 所有命令在 `code/danmaku-box/` 下执行。

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `src/content/adapters/types.ts` | Modify | `pauseDanmu`/`resumeDanmu` 签名加可选 `target` |
| `src/content/adapters/douyu.ts` | Modify | 飘屏选择器修正（C1/C2）、WAAPI 冻结实现（C3/C4/C8） |
| `src/content/hover-sampler.ts` | Create | mousemove 节流采样记录（纯逻辑） |
| `src/content/danmu-hit.ts` | Create | 三级命中判定 + 三重校验（纯函数，C5/C6） |
| `src/content/danmu-freeze.ts` | Create | 单活动冻结目标管理（关闭恢复/连续右键无孤儿，C7） |
| `src/content/menu-host.ts` | Create | Shadow 宿主创建与全屏迁移（FR-V05） |
| `src/content/context-menu.controller.ts` | Modify | 装配以上模块（删旧兜底逻辑） |
| `public/settings.html` | Modify | 开关文案「聊天区右键收藏」→「弹幕右键收藏」（存储 key 不变，存量继承） |
| `docs/product/technical-design.md` | Modify | 8.2 飘屏暂停行与 7.1 时序图按实测修正 |
| `tests/content/douyu-adapter.test.ts` | Modify | 追加 C1-C4/C8 用例 |
| `tests/content/hover-sampler.test.ts` 等 4 个 | Create | 各纯模块契约测试 |

---

### Task 1: 适配器飘屏命中与文本提取（C1、C2）

**Files:**
- Modify: `src/content/adapters/douyu.ts`（SELECTORS #L12-L19、findDanmakuItem #L43-L51、extract #L53-L60）
- Test: `tests/content/douyu-adapter.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/content/douyu-adapter.test.ts` 末尾追加（fake 元素支持 `closest`/`querySelector`/`textContent` 子串语义，模拟 2026-09-17 实测 DOM：层容器 `danmu-fbb2a3` + 弹幕项 `danmuItem-a8616a scroll-c8a9ee` + 文本 `textWrap-f7cfb9`）：

```ts
// ---------- 飘屏命中与文本提取（专项 PRD C1/C2，实测 DOM 结构 2026-09-17） ----------

/** 最小 fake DOM：className 子串匹配 closest/querySelector，textContent 聚合子树 */
function fakeEl(cls: string, opts: { text?: string; tag?: string } = {}) {
  const node: any = {
    className: cls,
    tagName: (opts.tag ?? 'div').toUpperCase(),
    attrs: new Map<string, string>(),
    ownText: opts.text ?? '',
    children: [] as any[],
    parent: null as any,
    isConnected: true,
    get textContent() {
      return this.ownText + this.children.map((c: any) => c.textContent).join('');
    },
    getAttribute(k: string) { return this.attrs.get(k) ?? null; },
    setAttribute(k: string, v: string) { this.attrs.set(k, v); },
    appendChild(c: any) { c.parent = this; this.children.push(c); return c; },
    closest(sel: string) {
      const needle = /\[class\*="([^"]+)"\]/.exec(sel)?.[1] ?? /\.([A-Za-z0-9_-]+)/.exec(sel)?.[1];
      let cur: any = this;
      while (cur) {
        if (needle && cur.className.split(' ').some((c: string) => c.includes(needle))) return cur;
        cur = cur.parent;
      }
      return null;
    },
    querySelector(sel: string) {
      const walk = (n: any): any => {
        for (const c of n.children) {
          if (sel === 'img, svg') {
            if (c.tagName === 'IMG' || c.tagName === 'SVG') return c;
          } else {
            const needle = /\[class\*="([^"]+)"\]/.exec(sel)?.[1] ?? /\.([A-Za-z0-9_-]+)/.exec(sel)?.[1];
            if (needle && c.className.split(' ').some((x: string) => x.includes(needle))) return c;
          }
          const deep = walk(c);
          if (deep) return deep;
        }
        return null;
      };
      return walk(this);
    },
  };
  return node;
}

/** 按实测结构搭建：层（pointer-events:none，永不成为 target）→ 弹幕项 → 文本节点 */
function buildDanmuLayer(items: Array<{ uuid: string; text: string }>) {
  const layer = fakeEl('danmu-fbb2a3');
  for (const it of items) {
    const item = fakeEl('danmuItem-a8616a scroll-c8a9ee');
    item.setAttribute('data-comment-uuid', it.uuid);
    const textWrap = fakeEl('textWrap-f7cfb9', { text: it.text });
    const textBox = fakeEl('text-da6396');
    textBox.appendChild(textWrap);
    item.appendChild(textBox);
    layer.appendChild(item);
  }
  return layer;
}

describe('DouyuAdapter 飘屏命中（C1：命中弹幕项而非层容器）', () => {
  const adapter = createDouyuAdapter();

  it('右键文本节点 → 命中其所属弹幕项', () => {
    const layer = buildDanmuLayer([
      { uuid: 'u1', text: '你让风行去哪' },
      { uuid: 'u2', text: '666冲冲冲' },
    ]);
    const wrap = layer.children[0].children[0].children[0]; // textWrap
    const hit = adapter.findDanmakuItem(wrap);
    assert.equal(hit, layer.children[0], '应命中第一条弹幕项');
    assert.ok(hit.className.includes('danmuItem'));
  });

  it('层容器自身不参与命中（其文本为多条拼接，旧缺陷回归钉桩）', () => {
    const layer = buildDanmuLayer([
      { uuid: 'u1', text: 'AAA' },
      { uuid: 'u2', text: 'BBB' },
    ]);
    // 层容器无 danmuItem 类：作为 target 向上追溯应返回 null
    assert.equal(adapter.findDanmakuItem(layer), null);
  });

  it('空文本弹幕项不命中（与聊天区规则一致）', () => {
    const layer = buildDanmuLayer([{ uuid: 'u1', text: '   ' }]);
    assert.equal(adapter.findDanmakuItem(layer.children[0]), null);
  });

  it('聊天区条目路径不受影响', () => {
    const chat = fakeEl('Barrage-listItem');
    assert.equal(adapter.findDanmakuItem(chat), chat);
  });
});

describe('DouyuAdapter 飘屏文本提取（C2：单条纯文本）', () => {
  const adapter = createDouyuAdapter();

  it('extract 取 textWrap 文本节点内容，非容器拼接串', () => {
    const layer = buildDanmuLayer([
      { uuid: 'u1', text: '你让风行去哪' },
      { uuid: 'u2', text: '666冲冲冲' },
    ]);
    const r = adapter.extract(layer.children[1]);
    assert.equal(r.text, '666冲冲冲');
    assert.equal(r.hasRichContent, false);
  });

  it('含 img 子元素的弹幕 → hasRichContent=true', () => {
    const item = fakeEl('danmuItem-a8616a');
    const wrap = fakeEl('textWrap-f7cfb9', { text: '带表情' });
    wrap.appendChild(fakeEl('', { tag: 'img' }));
    item.appendChild(wrap);
    const r = adapter.extract(item);
    assert.equal(r.text, '带表情');
    assert.equal(r.hasRichContent, true);
  });

  it('聊天区条目仍走 .Barrage-content', () => {
    const item = fakeEl('Barrage-listItem');
    const content = fakeEl('Barrage-content', { text: '聊天区弹幕' });
    item.appendChild(content);
    assert.equal(adapter.extract(item).text, '聊天区弹幕');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/content/douyu-adapter.test.ts`
Expected: 飘屏 describe 块 FAIL（`findDanmakuItem` 返回层容器或 null、`extract` 返回拼接串）；既有 probe/isLiveRoom 用例 PASS。

- [ ] **Step 3: 实现**

`src/content/adapters/douyu.ts`：

1. SELECTORS（#L12-L19）替换飘屏两项：

```ts
const SELECTORS = {
  listItem: '.Barrage-listItem',
  content: '.Barrage-content',
  input: '.ChatSend-txt',
  list: '.Barrage-list, #js-barrage-list',
  // 飘屏（2026-09-17 实测修正）：命中目标为弹幕项本身，层容器 pointer-events:none
  // 永不成为事件目标；宽选择器 [class*="danmu"] 会误命中 .danmudiv-* 等原生面板类名。
  danmuItem: '[class*="danmuItem"]',
  danmuText: '[class*="textWrap"]',
};
```

2. `findDanmakuItem`（#L43-L51）注释与匹配项更新：

```ts
    findDanmakuItem(target: Element): Element | null {
      // 聊天区弹幕条目（静止可悬停）
      const chatItem = target.closest(SELECTORS.listItem);
      if (chatItem) return chatItem;
      // 飘屏弹幕项本身（特征探测，哈希后缀易变不硬编码）；层容器不在此结构链上
      const danmu = target.closest(SELECTORS.danmuItem);
      if (danmu && (danmu.textContent ?? '').trim() !== '') return danmu;
      return null;
    },
```

3. `extract`（#L53-L60）优先飘屏文本节点：

```ts
    extract(item: Element): ExtractResult {
      // 飘屏：textWrap 纯文本节点；聊天区：.Barrage-content；均缺失回退自身文本
      const source = item.querySelector(SELECTORS.danmuText) ?? item.querySelector(SELECTORS.content);
      const text = (source?.textContent ?? item.textContent ?? '').trim();
      // 富内容判定：条目内存在图片/表情等非文本元素（FR-01 边界）
      const hasRichContent = item.querySelector('img, svg') !== null;
      return { text, hasRichContent };
    },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/content/douyu-adapter.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/content/adapters/douyu.ts tests/content/douyu-adapter.test.ts
git commit -m "fix(content): 飘屏命中修正为弹幕项、文本提取取 textWrap 单条内容"
```

---

### Task 2: 适配器 WAAPI 冻结/恢复（C3、C4、C8）

**Files:**
- Modify: `src/content/adapters/types.ts`（#L34-L35）
- Modify: `src/content/adapters/douyu.ts`（pauseDanmu/resumeDanmu #L110-L121）
- Test: `tests/content/douyu-adapter.test.ts`

- [ ] **Step 1: 写失败测试**

追加到 `tests/content/douyu-adapter.test.ts`：

```ts
// ---------- WAAPI 冻结/恢复（专项 PRD C3/C4/C8；实测：飘屏位移由 WAAPI 驱动，
// animation-play-state 无效；弹幕项被对象池复用，uuid 更换须安全跳过） ----------

function fakeAnim() {
  return {
    paused: false,
    played: 0,
    pause() { this.paused = true; },
    play() { this.played += 1; },
  };
}

function fakeDanmuItem(uuid: string, anims: ReturnType<typeof fakeAnim>[]) {
  const item = fakeEl('danmuItem-a8616a', { text: '飘屏内容' });
  item.setAttribute('data-comment-uuid', uuid);
  item.getAnimations = () => anims;
  return item;
}

describe('DouyuAdapter WAAPI 冻结/恢复', () => {
  it('C3：pauseDanmu(target) 调用 getAnimations().pause()，resumeDanmu 恢复', () => {
    const adapter = createDouyuAdapter();
    const a = fakeAnim();
    const item = fakeDanmuItem('u1', [a]);
    adapter.pauseDanmu(item);
    assert.equal(a.paused, true);
    adapter.resumeDanmu(item);
    assert.equal(a.played, 1);
  });

  it('C3：无动画元素不抛错（聊天区条目/已结束弹幕）', () => {
    const adapter = createDouyuAdapter();
    const plain = fakeEl('Barrage-listItem');
    assert.doesNotThrow(() => adapter.pauseDanmu(plain));
    assert.doesNotThrow(() => adapter.resumeDanmu(plain));
  });

  it('C4：池化复用（uuid 更换）→ 恢复安全跳过，不误 play 新动画', () => {
    const adapter = createDouyuAdapter();
    const a = fakeAnim();
    const item = fakeDanmuItem('u1', [a]);
    adapter.pauseDanmu(item);
    item.setAttribute('data-comment-uuid', 'u2'); // 元素被复用给新弹幕
    adapter.resumeDanmu(item);
    assert.equal(a.played, 0, 'uuid 不一致不得恢复');
  });

  it('C4：元素脱离文档 → 恢复安全跳过', () => {
    const adapter = createDouyuAdapter();
    const a = fakeAnim();
    const item = fakeDanmuItem('u1', [a]);
    adapter.pauseDanmu(item);
    item.isConnected = false;
    adapter.resumeDanmu(item);
    assert.equal(a.played, 0);
  });

  it('C8：无参调用保持既有语义（no-op，聊天区路径不受影响）', () => {
    const adapter = createDouyuAdapter();
    assert.doesNotThrow(() => adapter.pauseDanmu());
    assert.doesNotThrow(() => adapter.resumeDanmu());
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/content/douyu-adapter.test.ts`
Expected: 新 describe FAIL（TS 编译错误：签名不接受参数 → 经 `node --test` 的 type-strip 表现为运行时 `pauseDanmu is not a function` 或断言失败；若 typecheck 先行拦截，先完成 Step 3 的 types.ts 改动再回到本步验证红灯）。

- [ ] **Step 3: 实现**

1. `src/content/adapters/types.ts` #L34-L35 改为：

```ts
  /** 冻结飘屏弹幕运动；传入目标元素时仅冻结该条（WAAPI），无参调用保持旧语义（no-op） */
  pauseDanmu(target?: Element): void;
  /** 恢复冻结；元素脱离文档或 uuid 变更（对象池复用）时安全跳过 */
  resumeDanmu(target?: Element): void;
```

2. `src/content/adapters/douyu.ts` 替换 pauseDanmu/resumeDanmu（#L110-L121），并在文件顶部 SELECTORS 之后加模块级 WeakMap：

```ts
// 冻结记录：元素 → 暂停时刻的 uuid 与 Animation 引用。
// 持有 Animation 对象而非仅元素，配合 uuid 校验规避对象池复用竞态（实测：同元素
// 1.5s 内 uuid 与文本均已更换）。WeakMap 使被回收元素自动出账，无泄漏。
const frozenAnims = new WeakMap<Element, { uuid: string | null; anims: Animation[] }>();
```

```ts
    pauseDanmu(target?: Element): void {
      // 无参调用（聊天区）：无飘屏可冻结，保持 no-op（旧 animation-play-state 实现对
      // WAAPI 驱动位移本就无效，属死代码清除）
      if (!target) return;
      const anims = target.getAnimations();
      if (anims.length === 0) return;
      for (const a of anims) {
        try { a.pause(); } catch { /* 已 finished/canceled，静默 */ }
      }
      frozenAnims.set(target, { uuid: target.getAttribute('data-comment-uuid'), anims });
    },

    resumeDanmu(target?: Element): void {
      if (!target) return;
      const rec = frozenAnims.get(target);
      if (!rec) return;
      frozenAnims.delete(target);
      // 三重校验之二：脱离文档或 uuid 已更换（元素复用给新弹幕）→ 跳过，
      // 宁可漏恢复一条已离场弹幕，不可错动新弹幕的动画
      if (!target.isConnected) return;
      if (target.getAttribute('data-comment-uuid') !== rec.uuid) return;
      for (const a of rec.anims) {
        try { a.play(); } catch { /* noop */ }
      }
    },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/content/douyu-adapter.test.ts && node node_modules/typescript/bin/tsc --noEmit`
Expected: 测试全 PASS，typecheck 无错误。

- [ ] **Step 5: 提交**

```powershell
git add src/content/adapters/types.ts src/content/adapters/douyu.ts tests/content/douyu-adapter.test.ts
git commit -m "feat(content): 飘屏冻结改为 WAAPI 单条控制并校验池化复用竞态"
```

---

### Task 3: hover 采样器（纯模块）

**Files:**
- Create: `src/content/hover-sampler.ts`
- Test: `tests/content/hover-sampler.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHoverSampler, HOVER_THROTTLE_MS } from '../../src/content/hover-sampler.ts';

// hover 采样器（专项 PRD FR-V01）：mousemove 节流记录指针下弹幕项 {el, uuid, x, y, t}，
// 供右键时刻的三级命中作兜底。仅记录、不校验时效（校验在 danmu-hit 消费时实时执行）。

describe('createHoverSampler', () => {
  const el = (uuid: string) => ({ getAttribute: (k: string) => (k === 'data-comment-uuid' ? uuid : null) });

  it('findItem 未命中 → 不记录', () => {
    const s = createHoverSampler({ findItem: () => null, now: () => 0 });
    s.record(10, 10, el('u1'));
    assert.equal(s.latest(), null);
  });

  it('命中 → 记录元素/uuid/坐标/时间戳', () => {
    const item = el('u1');
    const s = createHoverSampler({ findItem: () => item as never, now: () => 123 });
    s.record(10, 20, item);
    assert.deepEqual(s.latest(), { el: item, uuid: 'u1', x: 10, y: 20, t: 123 });
  });

  it('节流：窗口内后续 move 不覆盖采样', () => {
    let t = 0;
    const s = createHoverSampler({ findItem: (e) => e as never, now: () => t });
    s.record(10, 10, el('a'));
    t = HOVER_THROTTLE_MS - 1;
    s.record(99, 99, el('b'));
    assert.equal(s.latest()?.uuid, 'a', '节流窗口内应保留首次采样');
    t = HOVER_THROTTLE_MS + 1;
    s.record(99, 99, el('b'));
    assert.equal(s.latest()?.uuid, 'b');
  });

  it('target 为 null（如移出窗口）→ 不记录', () => {
    const s = createHoverSampler({ findItem: (e) => e as never, now: () => 0 });
    s.record(1, 1, null);
    assert.equal(s.latest(), null);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/content/hover-sampler.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/content/hover-sampler.ts`**

```ts
// hover 采样器（专项 PRD FR-V01）：飘屏弹幕约 120px/s 横移 [实测 2026-09-17]，
// mousedown→contextmenu 时序内目标已位移，需在右键前持续记录指针下的弹幕项。
// 本模块只采样不判定：时效/身份校验由 danmu-hit 在消费时刻实时执行
// （「用时实时判定」原则，避免定时清理与竞态）。

export const HOVER_THROTTLE_MS = 50;

export interface HoverSample {
  el: Element;
  uuid: string | null;
  x: number;
  y: number;
  t: number;
}

export interface HoverSamplerDeps {
  findItem: (target: Element) => Element | null;
  now: () => number;
}

export interface HoverSampler {
  record(x: number, y: number, target: Element | null): void;
  latest(): HoverSample | null;
}

export function createHoverSampler(deps: HoverSamplerDeps): HoverSampler {
  let lastT = -Infinity;
  let sample: HoverSample | null = null;

  return {
    record(x, y, target) {
      if (target === null) return;
      const t = deps.now();
      if (t - lastT < HOVER_THROTTLE_MS) return;
      lastT = t;
      const item = deps.findItem(target);
      if (!item) return;
      sample = { el: item, uuid: item.getAttribute('data-comment-uuid'), x, y, t };
    },
    latest: () => sample,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/content/hover-sampler.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/content/hover-sampler.ts tests/content/hover-sampler.test.ts
git commit -m "feat(content): 新增 hover 节流采样器供飘屏命中兜底"
```

---

### Task 4: 三级命中判定（C5、C6）

**Files:**
- Create: `src/content/danmu-hit.ts`
- Test: `tests/content/danmu-hit.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveHit,
  SAMPLE_WINDOW_MS,
  MAX_DISTANCE_PX,
  type HitDeps,
} from '../../src/content/danmu-hit.ts';
import type { HoverSample } from '../../src/content/hover-sampler.ts';

// 三级命中（专项 PRD FR-V01）：① 事件目标 ② hover 采样（三重校验后采用）
// ③ 坐标叠层反查。全部未命中返回 null（不拦截原生行为）。

const item = (uuid: string, connected = true) => ({
  isConnected: connected,
  getAttribute: (k: string) => (k === 'data-comment-uuid' ? uuid : null),
});

function evt(target: unknown, x = 500, y = 300) {
  return { target, clientX: x, clientY: y };
}

const deps = (overrides: Partial<HitDeps> = {}): HitDeps => ({
  findItem: (t) => ((t as { className?: string })?.className?.includes('danmuItem') ? (t as never) : null),
  now: () => 1000,
  elementsFromPoint: () => [],
  ...overrides,
});

describe('resolveHit 三级命中', () => {
  it('① 事件目标命中 → 直接采用，忽略采样', () => {
    const hit = item('u1');
    (hit as any).className = 'danmuItem-x';
    const stale: HoverSample = { el: item('other') as never, uuid: 'other', x: 0, y: 0, t: 999 };
    assert.equal(resolveHit(deps(), evt(hit), stale), hit);
  });

  it('C6：目标未命中但采样有效（uuid 一致/新鲜/近距）→ 采用采样元素', () => {
    const cached = item('u9');
    (cached as any).className = 'other'; // target 本身不是弹幕
    const sample: HoverSample = { el: cached as never, uuid: 'u9', x: 505, y: 303, t: 900 };
    assert.equal(resolveHit(deps(), evt({ className: 'video' }, 500, 300), sample), cached);
  });

  it('C5：采样超时（>300ms）→ 不采用', () => {
    const cached = item('u9');
    const sample: HoverSample = { el: cached as never, uuid: 'u9', x: 500, y: 300, t: 1000 - SAMPLE_WINDOW_MS - 1 };
    assert.equal(resolveHit(deps(), evt({ className: 'video' }, 600, 300), sample), null);
  });

  it('C5：uuid 变更（对象池复用）→ 不采用', () => {
    const cached = item('reused');
    const sample: HoverSample = { el: cached as never, uuid: 'original', x: 500, y: 300, t: 990 };
    assert.equal(resolveHit(deps(), evt({ className: 'video' }, 600, 300), sample), null);
  });

  it('C5：元素脱离文档 → 不采用', () => {
    const cached = item('u9', false);
    const sample: HoverSample = { el: cached as never, uuid: 'u9', x: 500, y: 300, t: 990 };
    assert.equal(resolveHit(deps(), evt({ className: 'video' }, 600, 300), sample), null);
  });

  it('C5：指针位移超阈值（>40px）→ 不采用采样', () => {
    const cached = item('u9');
    const sample: HoverSample = { el: cached as never, uuid: 'u9', x: 500, y: 300, t: 990 };
    assert.equal(
      resolveHit(deps(), evt({ className: 'video' }, 500 + MAX_DISTANCE_PX + 1, 300), sample),
      null,
    );
  });

  it('③ 坐标叠层反查：前两级落空时按命中链顺序找弹幕项', () => {
    const deep = item('u3');
    (deep as any).className = 'danmuItem-deep';
    const d = deps({ elementsFromPoint: () => [{ className: 'video' } as never, deep as never] });
    assert.equal(resolveHit(d, evt({ className: 'video' }), null), deep);
  });

  it('三级全空 → null（不拦截）', () => {
    assert.equal(resolveHit(deps(), evt({ className: 'video' }), null), null);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/content/danmu-hit.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/content/danmu-hit.ts`**

```ts
// 三级命中判定（专项 PRD FR-V01）：飘屏为移动目标（约 120px/s [实测 2026-09-17]），
// 单靠事件目标或单次坐标查询都会落空。判定优先级：
// ① contextmenu 事件目标 → ② hover 采样缓存 → ③ 坐标叠层反查（elementsFromPoint）。
// ② 采用前执行三重校验（连接性/uuid 一致/时效+距离），防对象池复用误判；
// 校验在消费时刻实时执行（「用时实时判定」），采样器本身不做清理。

import type { HoverSample } from './hover-sampler.ts';

/** 采样有效窗口：右键时刻与采样时刻的最大间隔 */
export const SAMPLE_WINDOW_MS = 300;
/** 采样坐标与右键坐标的容差（px）[工程默认，随 W1 走查微调，PRD QV3] */
export const MAX_DISTANCE_PX = 40;

export interface HitDeps {
  findItem: (target: Element) => Element | null;
  now: () => number;
  elementsFromPoint: (x: number, y: number) => Element[];
}

export interface HitEvent {
  target: EventTarget | null;
  clientX: number;
  clientY: number;
}

function sampleValid(sample: HoverSample, deps: HitDeps, e: HitEvent): boolean {
  if (!sample.el.isConnected) return false;
  if (sample.el.getAttribute('data-comment-uuid') !== sample.uuid) return false;
  if (deps.now() - sample.t > SAMPLE_WINDOW_MS) return false;
  const dx = sample.x - e.clientX;
  const dy = sample.y - e.clientY;
  return Math.hypot(dx, dy) <= MAX_DISTANCE_PX;
}

export function resolveHit(deps: HitDeps, e: HitEvent, sample: HoverSample | null): Element | null {
  // ① 事件目标（静止/慢速弹幕最快路径）；鸭子类型判定（node 测试环境无全局 Element）
  const t = e.target as Element | null;
  if (t && typeof t.closest === 'function') {
    const hit = deps.findItem(t);
    if (hit) return hit;
  }
  // ② hover 采样（兜底 mousedown→contextmenu 时序内的位移）
  if (sample && sampleValid(sample, deps, e)) return sample.el;
  // ③ 坐标叠层反查（含锁屏工具条遮挡场景，沿用既有兜底语义）
  for (const el of deps.elementsFromPoint(e.clientX, e.clientY)) {
    const hit = deps.findItem(el);
    if (hit) return hit;
  }
  return null;
}
```

注：`e.target instanceof Element` 在 node 测试环境无全局 `Element`，故条件带 `?.closest` 鸭子类型兜底；浏览器中走 instanceof 分支。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/content/danmu-hit.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/content/danmu-hit.ts tests/content/danmu-hit.test.ts
git commit -m "feat(content): 新增飘屏三级命中判定与采样三重校验"
```

---

### Task 5: 冻结目标管理（C7）

**Files:**
- Create: `src/content/danmu-freeze.ts`
- Test: `tests/content/danmu-freeze.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFreezeManager } from '../../src/content/danmu-freeze.ts';

// 冻结目标管理（专项 PRD FR-V03）：同一时刻仅一个活动冻结；
// 菜单关闭必恢复（C7）；连续右键先解旧再冻新，无孤儿冻结。

function fakeAdapter() {
  const calls: string[] = [];
  return {
    calls,
    pauseDanmu(target?: unknown) { calls.push(`pause:${(target as { id?: string })?.id}`); },
    resumeDanmu(target?: unknown) { calls.push(`resume:${(target as { id?: string })?.id}`); },
  };
}

describe('createFreezeManager', () => {
  it('C7：freeze 后 release → 对同一目标调用恢复', () => {
    const a = fakeAdapter();
    const m = createFreezeManager(a);
    const item = { id: 'i1' };
    m.freeze(item as never);
    m.release();
    assert.deepEqual(a.calls, ['pause:i1', 'resume:i1']);
  });

  it('连续右键不同弹幕 → 先恢复旧目标再冻结新目标', () => {
    const a = fakeAdapter();
    const m = createFreezeManager(a);
    m.freeze({ id: 'i1' } as never);
    m.freeze({ id: 'i2' } as never);
    assert.deepEqual(a.calls, ['pause:i1', 'resume:i1', 'pause:i2']);
  });

  it('重复 release / 未 freeze 直接 release → 幂等无副作用', () => {
    const a = fakeAdapter();
    const m = createFreezeManager(a);
    m.release();
    m.freeze({ id: 'i1' } as never);
    m.release();
    m.release();
    assert.deepEqual(a.calls, ['pause:i1', 'resume:i1']);
  });

  it('同一目标重复 freeze → 只冻结一次', () => {
    const a = fakeAdapter();
    const m = createFreezeManager(a);
    const item = { id: 'i1' };
    m.freeze(item as never);
    m.freeze(item as never);
    assert.deepEqual(a.calls, ['pause:i1']);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/content/danmu-freeze.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/content/danmu-freeze.ts`**

```ts
// 冻结目标管理（专项 PRD FR-V03）：右键菜单同一时刻只有一个活动冻结目标。
// 新右键命中时先恢复上一条再冻结新目标（避免"孤儿冻结"——菜单关闭只恢复
// 最后一条，前一条永久卡死）；release 幂等。

interface FreezeAdapter {
  pauseDanmu(target?: Element): void;
  resumeDanmu(target?: Element): void;
}

export interface FreezeManager {
  freeze(item: Element): void;
  release(): void;
}

export function createFreezeManager(adapter: FreezeAdapter): FreezeManager {
  let frozen: Element | null = null;

  return {
    freeze(item) {
      if (frozen === item) return;
      if (frozen) adapter.resumeDanmu(frozen);
      frozen = item;
      adapter.pauseDanmu(item);
    },
    release() {
      if (!frozen) return;
      const target = frozen;
      frozen = null;
      adapter.resumeDanmu(target);
    },
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/content/danmu-freeze.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/content/danmu-freeze.ts tests/content/danmu-freeze.test.ts
git commit -m "feat(content): 新增单活动冻结目标管理器"
```

---

### Task 6: 全屏宿主迁移模块（FR-V05）

**Files:**
- Create: `src/content/menu-host.ts`
- Test: `tests/content/menu-host.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMenuHost } from '../../src/content/menu-host.ts';

// 全屏宿主迁移（专项 PRD FR-V05）：菜单 Shadow 宿主默认挂 documentElement，
// 视频全屏时不在全屏渲染树内 → 菜单不可见。fullscreenchange 时迁入/迁回。
// fake doc 沿用 toolbar-entry.test.ts 的最小桩思路。

function fakeNode(name: string) {
  return {
    name,
    children: [] as any[],
    parent: null as any,
    dataset: {} as Record<string, string>,
    appendChild(c: any) { c.parent = this; this.children.push(c); return c; },
    createElement(tag: string) {
      const el: any = fakeNode(tag);
      el.attachShadow = () => ({ appendChild: () => undefined });
      return el;
    },
  };
}

function fakeDoc() {
  const doc: any = fakeNode('doc');
  doc.documentElement = fakeNode('html');
  doc.fullscreenElement = null;
  doc.createElement = doc.documentElement.createElement;
  return doc;
}

describe('createMenuHost 全屏迁移', () => {
  it('ensureShadow：宿主挂 documentElement', () => {
    const doc = fakeDoc();
    const host = createMenuHost(doc, 'x');
    host.ensureShadow();
    assert.ok(doc.documentElement.children.length === 1);
  });

  it('进入全屏 → migrate 把宿主迁入全屏元素', () => {
    const doc = fakeDoc();
    const host = createMenuHost(doc, 'x');
    host.ensureShadow();
    const fsEl = fakeNode('video-wrap');
    doc.fullscreenElement = fsEl;
    host.migrate();
    assert.equal(fsEl.children.length, 1, '宿主应迁入全屏元素');
    assert.equal(doc.documentElement.children.length, 0, 'documentElement 应不再持有宿主');
  });

  it('退出全屏 → migrate 迁回 documentElement', () => {
    const doc = fakeDoc();
    const host = createMenuHost(doc, 'x');
    host.ensureShadow();
    const fsEl = fakeNode('video-wrap');
    doc.fullscreenElement = fsEl;
    host.migrate();
    doc.fullscreenElement = null;
    host.migrate();
    assert.equal(doc.documentElement.children.length, 1);
    assert.equal(fsEl.children.length, 0);
  });

  it('宿主已在目标位置 → migrate 不重复搬动', () => {
    const doc = fakeDoc();
    const host = createMenuHost(doc, 'x');
    host.ensureShadow();
    host.migrate();
    assert.equal(doc.documentElement.children.length, 1);
  });

  it('ensureShadow 幂等（同一 ShadowRoot 复用）', () => {
    const doc = fakeDoc();
    const host = createMenuHost(doc, 'x');
    assert.equal(host.ensureShadow(), host.ensureShadow());
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/content/menu-host.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/content/menu-host.ts`**

```ts
// 右键菜单 Shadow 宿主（专项 PRD FR-V05）：默认挂 documentElement；
// 视频全屏（Fullscreen API）时 documentElement 不在全屏渲染树内，菜单不可见，
// 须在 fullscreenchange 时把宿主迁入 fullscreenElement、退出时迁回。
// 与工具栏弹层「全屏即收起」策略并存：弹层属驻留型入口，右键菜单属瞬时型入口，
// 用户主动唤出必须就地可见。

export interface MenuHost {
  ensureShadow(): ShadowRoot;
  migrate(): void;
}

export function createMenuHost(doc: Document, styles: string): MenuHost {
  let host: HTMLElement | null = null;
  let shadow: ShadowRoot | null = null;

  function ensureShadow(): ShadowRoot {
    if (shadow && host?.isConnected) return shadow;
    host = doc.createElement('div');
    host.dataset.danmakuBox = 'root';
    (doc.fullscreenElement ?? doc.documentElement).appendChild(host);
    shadow = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = styles;
    shadow.appendChild(style);
    return shadow;
  }

  function migrate(): void {
    if (!host) return;
    const target = doc.fullscreenElement ?? doc.documentElement;
    if (host.parentElement !== target) target.appendChild(host);
  }

  return { ensureShadow, migrate };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/content/menu-host.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/content/menu-host.ts tests/content/menu-host.test.ts
git commit -m "feat(content): 新增右键菜单宿主全屏迁移模块"
```

---

### Task 7: 控制器装配（接线全部新模块）

**Files:**
- Modify: `src/content/context-menu.controller.ts`

控制器为 chrome API 重副作用的装配层，逻辑已收敛到纯模块并有测试；本任务只做接线，验证靠 typecheck + 全量门禁 + Task 9 人工走查。

- [ ] **Step 1: 替换 import 与内部状态**

`src/content/context-menu.controller.ts` 顶部 import 区追加：

```ts
import { createMenuHost } from './menu-host.ts';
import { createHoverSampler } from './hover-sampler.ts';
import { resolveHit } from './danmu-hit.ts';
import { createFreezeManager } from './danmu-freeze.ts';
```

工厂函数内（#L56 `const { adapter } = deps;` 之后）：删除 `let shadow` / `let menuEl` 之间的 `shadow` 声明与 `ensureShadow` 函数（#L58、#L66-L76），替换为：

```ts
  const menuHost = createMenuHost(document, MENU_STYLES);
  const hover = createHoverSampler({
    findItem: (t) => adapter.findDanmakuItem(t),
    now: () => Date.now(),
  });
  const freeze = createFreezeManager(adapter);
```

`ensureShadow` 的调用点（`showToast` #L79、`renderMenu` #L177）改为 `menuHost.ensureShadow()`。

- [ ] **Step 2: closeMenu 改用冻结管理器**

`closeMenu`（#L91-L100）中 `adapter.resumeDanmu();` 替换为：

```ts
    freeze.release(); // C7：任意关闭路径均恢复被冻结弹幕（幂等）
```

- [ ] **Step 3: onContextMenu 改三级命中**

`onContextMenu`（#L254-L286）整体替换为（删除旧坐标兜底块，其语义已并入 resolveHit 第③级）：

```ts
  async function onContextMenu(e: MouseEvent): Promise<void> {
    if (!contextEnabled) return; // C9：开关关闭时视频区/聊天区均不拦截
    const item = resolveHit(
      {
        findItem: (t) => adapter.findDanmakuItem(t),
        now: () => Date.now(),
        elementsFromPoint: (x, y) => document.elementsFromPoint(x, y),
      },
      e,
      hover.latest(),
    );
    if (!item) return; // 三级未命中：不拦截原生菜单

    e.preventDefault();
    const { text, hasRichContent } = adapter.extract(item);
    currentText = text;
    currentHasRich = hasRichContent;

    const r = await sendMessage<{ groups: MenuGroup[] }>(MESSAGES.GET_MENU_CONTEXT, {
      content: text,
    });
    if (!r.ok || !r.data) {
      showToast('本地数据读取失败', true);
      return;
    }
    freeze.freeze(item); // 仅冻结被点弹幕（FR-V03），其余照常滚动
    renderMenu(e.clientX, e.clientY, r.data.groups);
  }
```

- [ ] **Step 4: mount 注册新监听**

`mount()`（#L305-L307）替换为：

```ts
  return {
    mount(): void {
      document.addEventListener('contextmenu', (e) => void onContextMenu(e), true);
      // hover 采样：捕获阶段静默记录，不改变弹幕外观（FR-V01）
      document.addEventListener(
        'mousemove',
        (e) => hover.record(e.clientX, e.clientY, e.target instanceof Element ? e.target : null),
        true,
      );
      // 全屏迁移（FR-V05）：进入/退出全屏时宿主随 fullscreenElement 迁入迁回
      document.addEventListener('fullscreenchange', () => menuHost.migrate());
    },
  };
```

- [ ] **Step 5: 全量门禁验证**

Run: `npm run check`
Expected: typecheck / lint / test / build 全部通过（既有 17 个测试文件 + 本次新增 4 个全绿）。

- [ ] **Step 6: 提交**

```powershell
git add src/content/context-menu.controller.ts
git commit -m "feat(content): 右键控制器接入三级命中、单条冻结与全屏宿主迁移"
```

---

### Task 8: 设置文案语义扩展（FR-V06）

**Files:**
- Modify: `public/settings.html`（#L38-L46）

存储 key `chatContextMenuEnabled` **不改名**——PRD 要求"存量用户开关状态与值原样继承"，改 key 需迁移逻辑且收益为零；仅用户可见文案更新。

- [ ] **Step 1: 更新文案**

`public/settings.html` #L38-L46 的 field 块替换为：

```html
        <div class="field">
          <span class="field-label">弹幕右键收藏</span>
          <div class="radio-row">
            <label
              ><input type="checkbox" id="chat-context-menu" />
              在直播间弹幕（聊天区与视频区飘屏）上右键弹出收藏菜单</label
            >
          </div>
        </div>
```

（`id="chat-context-menu"` 保留——`src/settings/settings.ts` #L37/#L77 按此 id 读写，改 id 需连带动两处代码，无收益。）

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功（settings.html 为静态拷贝）。

- [ ] **Step 3: 提交**

```powershell
git add public/settings.html
git commit -m "docs(settings): 右键收藏开关文案扩展为聊天区+视频区"
```

---

### Task 9: 文档同步 + 人工走查

**Files:**
- Modify: `docs/product/technical-design.md`（#L490、#L641）

- [ ] **Step 1: 修正技术方案 8.2 飘屏暂停行**

`docs/product/technical-design.md` #L641 整行替换为：

```markdown
| 飘屏暂停/恢复 | 飘屏位移由 **Web Animations API** 驱动（实测 2026-09-17：`animationName: none`，`animation-play-state` 无效）。命中目标为弹幕项 `[class*="danmuItem"]`（层容器 `pointer-events:none` 永不成为事件目标），冻结仅作用于被点单条：`target.getAnimations()` 逐个 `pause()`，WeakMap 保存 `{uuid, Animation[]}`；恢复前校验 `isConnected` + uuid 一致（对象池复用竞态防护），不一致安全跳过。无参调用保持 no-op（聊天区路径） [Data-backed: 可行性报告 3.2/3.5] |
```

- [ ] **Step 2: 修正 7.1 时序图暂停行**

#L490 `M3->>M6: adapter.pauseDanmu()  (若为飘屏)` 替换为：

```
    M3->>M6: freeze.freeze(item) → adapter.pauseDanmu(item)（WAAPI 单条冻结）
```

#L497 `M3->>M6: adapter.resumeDanmu()` 替换为：

```
    M3->>M6: freeze.release() → adapter.resumeDanmu(item)（校验 uuid 后恢复）
```

- [ ] **Step 3: 加载扩展人工走查（PRD 7.2 W1-W7）**

`npm run build` 后在 Chrome 加载 `dist/`，进入 douyu.com 任意直播间执行：

| # | 走查项 | 通过标准 |
|---|-------|---------|
| W1 | 高/中/低密度下对移动弹幕真实右键各 ≥20 次 | 正确目标命中率 ≥95%；未命中时无菜单无残留。不达标 → 触发 QV1 回退预案并回报 |
| W2 | 冻结体验 | 被点弹幕静止、其余照常滚动，无闪烁 |
| W3 | 收藏/Esc/点外部三种关闭路径各 10 轮 | 弹幕均恢复，无永久卡死 |
| W4 | 视频全屏右键链路 | 菜单全屏内可见可操作；Esc 仅关菜单；退出后宿主归位 |
| W5 | 直播结束/无弹幕右键视频区 | 无菜单、无报错 |
| W6 | 开关关闭 | 聊天区与视频区均不拦截；重开后恢复 |
| W7 | 网页全屏/影院模式 | 菜单不出视口、可操作 |

- [ ] **Step 4: 提交**

```powershell
git add docs/product/technical-design.md
git commit -m "docs: 技术方案飘屏暂停机制按 WAAPI 实测修正"
```

---

## 契约覆盖对照（自检）

| 契约 | 覆盖任务 |
|------|---------|
| C1 命中弹幕项 | Task 1 |
| C2 文本单条 | Task 1 |
| C3 WAAPI pause | Task 2 |
| C4 池化安全跳过 | Task 2 |
| C5 采样校验不采用 | Task 4 |
| C6 缓存兜底命中 | Task 4 |
| C7 关闭恢复 | Task 5（+Task 7 接线） |
| C8 无参语义 | Task 2 |
| C9 开关关闭不拦截 | Task 7 Step 3（`contextEnabled` 早退，走查 W6） |
| FR-V05 全屏 | Task 6 + Task 7 Step 4 |
| FR-V06 降级 | 既有 `findDanmakuItem` 返回 null → 不拦截（Task 1/4 天然成立），走查 W5 |
