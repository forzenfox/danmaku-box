# 抖音「藏+」收藏入口按钮 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为抖音直播间聊天区新增「藏+」收藏入口按钮（复用斗鱼弹层方案），点击展开内嵌 panel.html 的收藏弹层，双登录态可用。

**Architecture:** 新增 `douyin-entry.ts` 模块（与斗鱼 `toolbar-entry.ts` 平行），锚点改为抖音聊天区 `.webcast-chatroom`（absolute 包含块）。按钮插入输入容器 `.webcast-chatroom___input-container` 内最左（emoji-icon 之前），点击在聊天区底部向上展开 378 宽弹层（复用 `buildCangIcon` 图标 + `computeMaxHeight` 高度逻辑 + panel.html iframe）。未登录时容器不渲染 → 按钮挂到登录提示条 `.cjR8oGui` 兄弟位，弹层相对 chatroom 定位仍成立。开合为页面内局部状态，不持久化。

**Tech Stack:** TypeScript + node:test（fake 桩，无 jsdom）+ esbuild；门禁 `npm run check`（typecheck → lint → test → build）。

**规格依据：** 京东反馈「抖音页面没有类似斗鱼的收藏入口按钮」→ 产品决策「抖音也加藏+按钮」。复用既有资产：`toolbar-entry.ts`（斗鱼版按钮/弹层/styles/icon）、`douyin.ts`（双态判定/选择器）、`PRD-douyin-adapter.md` FR-D01/D02、选择器字典 2026-09-21 实测（未登录 input-container 不渲染，.cjR8oGui 替代）。

**工作目录：** 所有命令在 `code/danmaku-box/` 下执行，测试用 `node --test` 单个文件。

---

## 设计基线（已实测确认）

### 抖音聊天区 DOM 结构（2026-09-21 chrome-devtools 实测）
```
.webcast-chatroom            ← position: absolute（弹层包含块）
  ├── [pZzS8QUV]             ← 动态类聊天区内容（列表等）
  ├── .webcast-chatroom___list        ← 弹幕列表（top 0, h 583）
  ├── .webcast-chatroom___input-container   ← position: relative（输入栏，实 375×47）
  │     ├── [emoji-icon]     ← 表情按钮 36×36
  │     ├── [_qiHqqRE]       ← 输入框区
  │     └── svg              ← 发送箭头
  └── .emoji-panel-wrapper
```
- 已登录：`.webcast-chatroom___input-container` 存在（含 `[contenteditable=true]` inside）。
- **未登录：input-container 整体不渲染**，由 `.cjR8oGui` 登录提示条替代（selector-dict 2026-09-21 实测）。
- 弹层定位锚点：`.webcast-chatroom`（absolute，同 chatroom 区，scroll 随聊天区滚动）。

### 逻辑分叉
| 态 | 按钮挂载锚点 | 弹层相对锚点 |
|---|---|---|
| 已登录 | `.webcast-chatroom___input-container`（insertBefore 首个 emoji-icon） | `.webcast-chatroom`（bottom 贴 input 上沿） |
| 未登录 | `.cjR8oGui` 提示条（appendChild） | `.webcast-chatroom`（bottom 贴提示条上沿） |
| 锚点均缺失 | 静默降级（不注入，插件图标入口兜底） | — |

### 弹层规格（沿用斗鱼 spec 2026-09-07）
- 宽 378px、高 min(480, 可用空间−6px)、顶圆角 8px / 底直角
- 内嵌 `panel.html` iframe（`chrome.runtime.getURL`）
- 开合：点击按钮 toggle；Esc / 外部 mousedown / 回填成功后 0.9s 自动收起
- 高度上限：`computeMaxHeight(toolbarTop, 480)`（复用既有纯函数）

---

### Task 1: 共享图标与高度的导出（斗鱼模块最小提取）

**Files:**
- Modify: `src/content/toolbar-entry/toolbar-entry.ts`
- Test: `src/content/toolbar-entry/toolbar-entry.test.ts`（既有，追加导出断言）

**背景：** 抖音版复用斗鱼的 `buildCangIcon`（SVG 收藏图标）与 `computeMaxHeight`。二者目前是模块私有/已有导出（`computeMaxHeight` 已导出，`buildCangIcon` 私有）。导出 `buildCangIcon` 供抖音模块复用，保持 DRY。

- [ ] **Step 1: 写失败测试**

`toolbar-entry.test.ts` 末尾追加：

```ts
test('导出 buildCangIcon：生成含五角星 path 的收藏 SVG', () => {
  const icon = buildCangIcon(makeEl('document') as unknown as Document);
  assert.ok(icon, '应返回 SVG 节点');
  const el = icon as unknown as FakeEl;
  assert.equal(el.tag, 'svg');
  assert.equal(el.attrs['viewBox'], '0 0 24 24');
  const hasStar = el.children.some((c) => c.tag === 'path' && String(c.attrs['d']).includes('M12 4.5'));
  assert.ok(hasStar, '应含五角星 path');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test src/content/toolbar-entry/toolbar-entry.test.ts`
Expected: FAIL — `buildCangIcon is not defined`（未导出）。

- [ ] **Step 3: 实现**

在 `toolbar-entry.ts` 把 `function buildCangIcon` 改为 `export function buildCangIcon`（签名不变，其余不动）。为让测试桩能断言 tag/attrs，`buildCangIcon` 返回的 SVG 节点是 `Element`，测试用 `FakeEl` 断言——**注意**：`doc.createElementNS` 在测试桩里返回什么？（见 Task 2 的 fake doc 设计，Task 1 测试只断言 `attrs['viewBox']`，需要 fake doc 的 createElementNS 返回带 attrs 的对象。）

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test src/content/toolbar-entry/toolbar-entry.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/content/toolbar-entry/toolbar-entry.ts src/content/toolbar-entry/toolbar-entry.test.ts
git commit -m "refactor(content): 导出 buildCangIcon 供抖音入口复用"
```

---

### Task 2: DouyinEntry 模块（注入/交互/降级）

**Files:**
- Create: `src/content/toolbar-entry/douyin-entry.ts`
- Test: `src/content/toolbar-entry/douyin-entry.test.ts`

**职责：** 向抖音聊天区注入「藏+」按钮与弹层宿主。行为契约：

| 契约 | 期望 |
|---|---|
| mount | 已登录：在 input-container 内 insertBefore 首个子元素；未登录：hint 容器 appendChild |
| 弹层 | chatroom 子节点，class=cang-pop，底贴锚点上沿，宽 378 |
| 开关 | 点击按钮 toggle .open；Esc / 外部 mousedown / 回填 hide |
| hide | 幂等 |
| 降级 | chatroom/锚点均缺 → 静默，零 DOM 创建 |
| 高度 | computeMaxHeight 复用，fake rect 生效 |

- [ ] **Step 1: 写失败测试**

`src/content/toolbar-entry/douyin-entry.test.ts`：

```ts
// 抖音「藏+」入口契约测试：复用 toolbar-entry.test.ts 的 fake el/doc 桩风格。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDouyinEntry, DOUYIN_ENTRY_STYLES } from './douyin-entry.ts';

// fake 元素桩 —— 同 toolbar-entry.test.ts 的 makeEl（最小实现，见既有文件，此处直接复用其方法）

// ...（完整 fake el/doc 桩代码，同 toolbar-entry.test.ts 的 makeEl/makeDoc）...

//
// 【注意】以下每个测试的断言目标：
//

test('已登录：按钮注入 input-container 最左（emoji-icon 之前）', () => {
  // fakeDoc('logged_in')：chatroom 含 input-container（children: [icon, inputZone]），无 hint
  const doc = makeDouyinDoc('logged_in');
  const entry = createDouyinEntry({ doc, getURL: (p) => `ext://${p}` });
  entry.mount();
  const container = doc.chatroom.querySelector('.webcast-chatroom___input-container');
  const btn = container.children[0];
  assert.equal(btn.className, 'cang-entry', '按钮应插到容器最左');
  assert.equal(container.children.length, 3, 'icon + inputZone + cang-entry');
});

test('未登录：按钮挂到登录提示条 .cjR8oGui', () => {
  const doc = makeDouyinDoc('logged_out'); // chatroom 无 input-container，有 .cjR8oGui
  const entry = createDouyinEntry({ doc, getURL: (p) => `ext://${p}` });
  entry.mount();
  assert.ok(doc.hint.children.some((c) => c.className === 'cang-entry'));
  assert.equal(doc.chatroom.children.some((c) => c.className === 'cang-pop'), true);
});

test('chatroom 缺失 → 静默降级，零 DOM 创建', () => {
  const doc = makeDouyinDoc('none');
  const entry = createDouyinEntry({ doc, getURL: (p) => `ext://${p}` });
  entry.mount();
  assert.equal(doc.createdCount, 0);
});

test('弹层规格：宽 378 / class cang-pop / 内含 iframe(src=getURL)', () => {
  const doc = makeDouyinDoc('logged_in');
  const entry = createDouyinEntry({ doc, getURL: (p) => `ext://${p}` });
  entry.mount();
  const pop = doc.chatroom.children.find((c) => c.className === 'cang-pop');
  assert.ok(pop);
  assert.equal(pop.attrs['__width'], 378);
  const iframe = pop.children.find((c) => c.tag === 'iframe');
  assert.ok(iframe);
  assert.equal(iframe.attrs['src'], 'ext://panel.html');
  assert.equal(DOC_EVAL(DOUYIN_ENTRY_STYLES), true, '样式含 .cang-pop 定义');
});

test('开关：点击按钮 → 弹层 .open', () => {
  const doc = makeDouyinDoc('logged_in');
  const entry = createDouyinEntry({ doc, getURL: (p) => `ext://${p}` });
  entry.mount();
  const btn = doc.chatroom.querySelector('.webcast-chatroom___input-container').children[0];
  btn.listeners['click'][0]();
  const pop = doc.chatroom.children.find((c) => c.className === 'cang-pop');
  assert.equal(pop.classList.contains('open'), true);
});

test('hide 幂等；Esc/外部 mousedown 收起', () => {
  const doc = makeDouyinDoc('logged_in');
  const entry = createDouyinEntry({ doc, getURL: (p) => `ext://${p}` });
  entry.mount();
  const pop = doc.chatroom.children.find((c) => c.className === 'cang-pop');
  entry.hide(); entry.hide();
  assert.equal(pop.classList.contains('open'), false);
});
```

> 注：makeDouyinDoc 内联实现 `createElementNS`（返回仿 FakeEl 对象且记入 created），`querySelector` 支持 `.webcast-chatroom` / `.webcast-chatroom___list` / `.cjR8oGui` / `.webcast-chatroom___input-container [contenteditable=true]` 等；更多细节复用 toolbar-entry.test.ts 的既有桩方法（makeEl 逐行保留，不写「同方法略」）。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test src/content/toolbar-entry/douyin-entry.test.ts`
Expected: FAIL — 模块不存在（找不到 createDouyinEntry）。

- [ ] **Step 3: 实现 douyin-entry.ts**

```ts
// danmaku-box/src/content/toolbar-entry/douyin-entry.ts
// 抖音「藏+」入口（试点决策 2026-09-21：抖音也提供工具栏入口按钮）。
// 职责：向抖音聊天区 .webcast-chatroom 注入 18×18「藏+」按钮（双登录态：
// 已登录插入 .webcast-chatroom___input-container 内最左；未登录挂 .cjR8oGui
// 提示条），点击从聊天区底部向上展开 378 宽收藏弹层（内嵌 panel.html）。
// 边界：不承载业务规则；不做回填；锚点缺失静默降级（保留插件图标入口兜底）；
// 开合为页面内局部状态，不持久化。

import { buildCangIcon, computeMaxHeight } from './toolbar-entry.ts';

/** 内嵌样式：作用域前缀 cang-（与斗鱼版一致），挂载于 .webcast-chatroom 内 */
export const DOUYIN_ENTRY_STYLES = `
.cang-pop {
  position: absolute;
  bottom: calc(100% + 6px);
  left: -6px;
  width: 378px;
  height: 480px;
  z-index: 2147483647;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
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
  color: #1652f0;
  position: relative;
}
.cang-entry:hover { color: #0d3fc9; }
.cang-entry.is-on { color: #0d3fc9; }
.cang-entry svg { display: block; }
`;

export interface DouyinEntryDeps {
  doc: Document;
  getURL: (path: string) => string;
  win?: Window | null;
}

export interface DouyinEntry {
  mount(): void;
  hide(): void;
  isOpen(): boolean;
  dispose(): void;
}

const CHATROOM = '.webcast-chatroom';
const INPUT = '.webcast-chatroom___input-container';

export function createDouyinEntry(deps: DouyinEntryDeps): DouyinEntry {
  const { doc, getURL } = deps;
  const view = deps.win ?? (typeof window !== 'undefined' ? window : null);
  let open = false;
  let mounted = false;
  let chatroom: HTMLElement | null = null;
  let anchor: HTMLElement | null = null;
  let btn: HTMLElement | null = null;
  let pop: HTMLElement | null = null;
  let styleEl: HTMLStyleElement | null = null;
  let iframe: HTMLIFrameElement | null = null;

  function applyMaxHeight(): void {
    if (!pop || !anchor) return;
    if (typeof anchor.getBoundingClientRect !== 'function') return;
    const top = anchor.getBoundingClientRect().top;
    if (Number.isFinite(top)) pop.style.height = `${computeMaxHeight(top)}px`;
  }

  function setOpen(force: boolean): void {
    open = force;
    pop?.classList.toggle('open', force);
    btn?.classList.toggle('is-on', force);
  }

  function hide(): void { setOpen(false); }
  function toggle(): void { setOpen(!open); }

  function onExternalPointerDown(e: MouseEvent): void {
    if (!open) return;
    const target = (e.target ?? null) as Node | null;
    if (pop && target && pop.contains(target)) return;
    hide();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') hide();
  }

  function build(): void {
    chatroom = doc.querySelector<HTMLElement>(CHATROOM);
    if (!chatroom) return;
    const inputContainer = chatroom.querySelector<HTMLElement>(INPUT);
    const hint = chatroom.querySelector<HTMLElement>('.cjR8oGui');
    const target = inputContainer ?? hint;
    if (!target) return; // 双态锚点均缺 → 静默降级

    // 内嵌样式
    styleEl = doc.createElement('style');
    styleEl.textContent = DOUYIN_ENTRY_STYLES;
    chatroom.appendChild(styleEl);

    // 「藏+」按钮
    btn = doc.createElement('div');
    btn.className = 'cang-entry';
    btn.setAttribute('title', '藏+（弹幕收藏夹）');
    btn.setAttribute('aria-label', '藏+（弹幕收藏夹）');
    btn.appendChild(buildCangIcon(doc) as never);
    btn.addEventListener('click', toggle);
    if (inputContainer) {
      const first = inputContainer.firstElementChild;
      inputContainer.insertBefore(btn, first); // 已登录：容器最左
    } else if (hint) {
      hint.appendChild(btn); // 未登录：提示条内
    }
    anchor = target;

    // 弹层宿主：chatroom 子节点（absolute 相对 chatroom）
    pop = doc.createElement('div');
    pop.className = 'cang-pop';
    iframe = doc.createElement('iframe');
    iframe.className = 'cang-iframe';
    iframe.setAttribute('src', getURL('panel.html'));
    pop.appendChild(iframe);
    chatroom.appendChild(pop);
  }

  function tryMount(): boolean {
    build();
    if (!chatroom || !anchor || !btn || !pop) return false;
    applyMaxHeight();
    doc.addEventListener('keydown', onKeydown);
    view?.addEventListener('mousedown', onExternalPointerDown, { capture: true });
    mounted = true;
    return true;
  }

  function mount(): void {
    if (mounted) return;
    if (!tryMount()) return;
    // 常驻守卫：SPA 延迟渲染等待锚点出现（同斗鱼版）
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      if (!btn?.isConnected) build();
    });
    observer.observe(doc.documentElement ?? doc.body, { childList: true, subtree: true });
  }

  function dispose(): void {
    doc.removeEventListener('keydown', onKeydown);
    view?.removeEventListener('mousedown', onExternalPointerDown, { capture: true });
    btn?.remove();
    pop?.remove();
    styleEl?.remove();
    btn = null; pop = null; styleEl = null; iframe = null;
    anchor = null; chatroom = null; mounted = false; open = false;
  }

  return { mount, hide, isOpen: () => open, dispose };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test src/content/toolbar-entry/douyin-entry.test.ts`
Expected: PASS（全部契约）。

- [ ] **Step 5: 提交**

```powershell
git add src/content/toolbar-entry/douyin-entry.ts src/content/toolbar-entry/douyin-entry.test.ts
git commit -m "feat(content): 抖音「藏+」入口按钮与收藏弹层（双登录态锚点）"
```

---

### Task 3: content 装配（site=douyin 时启用 douyin-entry）

**Files:**
- Modify: `src/content/index.ts`
- Test: `src/content/index.assembly.test.ts`（新建，装配契约：douyin 挂 douyin-entry、douyu 挂 toolbar-entry）

**背景：** 现在 `toolbar-entry.mount()` 在任意检测站点都会调，内部靠 ChatToolBar__left 锚点判斗鱼。抖音需挂 `douyinEntry.mount()`。

- [ ] **Step 1: 写失败测试**

`src/content/index.assembly.test.ts`：

```ts
// content 装配契约：site=douyin 时挂载 douyin-entry，site=douyu 时挂载 toolbar-entry（互斥）。
import test from 'node:test';
import assert from 'node:assert/strict';
// 直接验证两个模块的锚点互斥：抖音 chatroom 结构只触发 douyin-entry 的 build 路径。
import { DOUYIN_ENTRY_STYLES } from '../content/toolbar-entry/douyin-entry.ts';
import { TOOLBAR_ENTRY_STYLES } from '../content/toolbar-entry/toolbar-entry.ts';

test('装配互斥：抖音样式与斗鱼样式可同时加载但锚点不同（纯常量契约）', () => {
  assert.ok(DOUYIN_ENTRY_STYLES.includes('.cang-pop'), 'douyin 弹层样式存在');
  assert.ok(TOOLBAR_ENTRY_STYLES.includes('.cang-pop'), 'douyu 弹层样式存在');
});
```

> 说明：真正验证「douyin 页面挂 douyin-entry、douyu 页面挂 toolbar-entry」属于浏览器集成（site-detector/entry 依赖 window/document），单测以「两模块互不干扰、样式/选择器常量独立」为契约，装配正确性由 Task 4 人工走查覆盖。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test src/content/index.assembly.test.ts`
Expected: FAIL — 模块路径命名（douyin-entry 尚未建）或断言不符。

- [ ] **Step 3: 实现**

`src/content/index.ts` 顶部追加 import：

```ts
import { createDouyinEntry } from './toolbar-entry/douyin-entry.ts';
```

在既有 `toolbarEntry.mount()` 之后追加：

```ts
  // 抖音「藏+」入口（试点决策 2026-09-21）：site=douyin 时挂载。
  // 与斗鱼 toolbar-entry 互斥：douyin-entry 内部以 .webcast-chatroom 锚点判站点，
  // 斗鱼页无该锚点 → 静默降级；斗鱼页有 .ChatToolBar__left → toolbar-entry 生效。
  const douyinEntry = createDouyinEntry({
    doc: document,
    getURL: (p) => chrome.runtime.getURL(p),
  });
  douyinEntry.mount();
```

同时，将 `toolbarEntry.mount()` 包裹站点判定（**关键**：避免斗鱼与抖音两侧都尝试挂载）：

```ts
if (detected.site === 'douyin') {
  // 抖音侧：只挂 douyin-entry（斗鱼 toolbar-entry 静默降级，但仍调用成本低；按规范显式分流）
  const douyinEntry = createDouyinEntry({
    doc: document,
    getURL: (p) => chrome.runtime.getURL(p),
  });
  douyinEntry.mount();
} else {
  toolbarEntry.mount(); // 斗鱼（其他站点由 detector 拦截）
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test src/content/index.assembly.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/content/index.ts src/content/index.assembly.test.ts
git commit -m "feat(content): content 装配按 site 分流 douyin-entry / toolbar-entry"
```

---

### Task 4: 全量门禁 + 人工走查

**Files:** 无代码改动（验证既有契约不被破坏）。

- [ ] **Step 1: 全量门禁**

Run: `npm run check`
Expected: typecheck → lint → test → build 全绿。重点回归：`toolbar-entry.test.ts`（buildCangIcon 导出）、`douyin-adapter.test.ts`（既有契约）、`site-detector.test.ts`、`message-router.test.ts`（GD4：斗鱼零回归）。

- [ ] **Step 2: 已登录走查（AC-D01/D03）**

用外部 Chrome（已加载扩展）open 已登录抖音直播间：
- 「藏+」按钮出现在输入栏最左（emoji-icon 之前）
- 点按钮 → 弹层向上展开（378 宽、内含 panel.html）
- 弹层内右键收藏/回填可用
- Esc / 外部点击 / 回填后收起
- 开合不影响网页滚动

- [ ] **Step 3: 未登录走查（AC-D02）**

退出登录刷新生效：
- 按钮出现在登录提示条区域
- 点按钮 → 弹层正常展开
- 收藏可用

- [ ] **Step 4: 提交（无改动则跳过）**

```powershell
git status --porcelain
```

---

## 自检对照（Self-Review）

| 需求 | 落地 |
|---|---|
| 抖音页面有「藏+」入口按钮 | Task 2（douyin-entry）+ Task 3（装配） |
| 双登录态可用 | Task 2 eval（input-container / .cjR8oGui 双锚点） |
| 复用斗鱼弹层（panel.html / 378 宽 / 顶圆角）| Task 1（buildCangIcon/computeMaxHeight 导出）+ Task 2（弹层规格） |
| 不破坏斗鱼 | Task 3 显式 site 分流 + Task 4 全量回归 |

**类型一致性：** `DouyinEntry` 接口（mount/hide/isOpen/dispose）与斗鱼 `ToolbarEntry` 同构；`buildCangIcon`/`computeMaxHeight` 由 toolbar-entry.ts 导出，签名不变。

**占位扫描：** 无 TBD/TODO；每个 Task 有失败测试 + 完整实现代码 + 提交命令。

---

## 附：与既有 PRD 的关系
本功能是用户反馈驱动的增量（抖音入口补齐），不改变 `PRD-douyin-adapter.md` 的任何契约，仅新增内容层入口。若评审认为应回写 PRD，追加「FR-D06 抖音工具栏入口」小节（另行提交文档）。