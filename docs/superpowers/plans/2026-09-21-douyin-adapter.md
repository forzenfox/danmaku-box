# 抖音直播站点适配 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为弹幕收藏插件新增抖音直播适配器（`douyin.ts`），实现双登录态下聊天区右键收藏、已登录回填、无飘屏降级，复用既有收藏/菜单/消息链路。

**Architecture:** 新增一个站点适配器模块并接入 `SiteDetector`，与斗鱼适配器并列；通用层（弹幕库/分组/菜单/收藏链路）零逻辑改动，仅新增一个「未登录回填」错误码分支。适配器的可分支逻辑（探针/登录态/命中/提取/回填编排）全部通过注入 `doc`/`location`/`reactWrite` 依赖单测；React 受控写入的最终事件序列是纯浏览器集成，Task-0 现场实测定稿，编排经由注入的 `reactWrite` spy 验证（沿用仓库「fake 桩、无 jsdom」测试风格）。

**Tech Stack:** TypeScript + node:test（fake 桩，无 jsdom）+ esbuild；门禁 `npm run check`（typecheck → lint → test → build）。

**规格依据：** `docs/product/PRD-douyin-adapter.md`（V1.0，契约 FR-D01~D05 / AC-D01~D08 / GD1~GD6）；技术依据 `docs/research/douyin-assets/selector-dict.md`（2026-09-21 双会话实测）。契约编号 P1-P6 对应本计划任务，注释标注对应 PRD 验收项。

**工作目录：** 所有命令在 `code/danmaku-box/` 下执行，测试用 `node --test` 单个文件。

---

## 执行前置：Task 0 现场实测（Q-D1 / Q-D2）

**Files:** 无代码改动；产出两个实测定稿常量/序列。

**背景**（PRD 开放问题）：回填的 React 受控事件序列（Q-D2）与输入框字数上限（Q-D1）未实测，PRD 明确「实现阶段现场实测定稿」，验收口径为「写入后站方发送按钮出现」。

- [ ] **Step 1: 打开已登录抖音直播间**
  用 trae-remote-official:chrome-devtools 打开 `https://live.douyin.com/<已登录房间号>`，`take_snapshot` 确认输入框 `[contenteditable=true]` 存在、发送按钮（svg）未出现。

- [ ] **Step 2: 实测候选事件序列 A（execCommand 清除+写入）**
  `evaluate_script` 注入：聚焦输入框 → 全选现有内容 → `document.execCommand('insertText', false, '<测试文本>')` → 读 `document.querySelector('<发送按钮选择器>') !== null`。
  记录：发送按钮是否出现（=React 感知）。若 A 生效，Task 5 的 `defaultReactWrite` 采用 A；否则实测候选序列 B（原生 value setter + beforeinput/input 双事件），并记录生效者。

- [ ] **Step 3: 实测字数上限（Q-D1）**
  `evaluate_script` 注入逐步写入长文本，观察发送按钮出现前可容纳的最大字符数。将该数值记入 Task 5 的 `DOUYIN_MAX_LENGTH`（初值 50，若实测不同按实测覆盖）；同时覆盖「超长截断 toast」文案。

- [ ] **Step 4: 记录结论**
  在 `docs/research/douyin-assets/selector-dict.md`「输入框与回填」章节补记：最终事件序列、字数上限、发送按钮的探测选择器（若可稳定获取）。此结论仅在 Task 5 被引用。

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `src/content/adapters/douyin.ts` | Create | 抖音适配器（探针/登录态/命中/提取/回填编排/飘屏 no-op/房间号），依赖注入可测 |
| `src/content/adapters/types.ts` | Modify | `FillResult.reason` 联合类型追加 `'NEED_LOGIN'` |
| `src/shared/constants.ts` | Modify | `ERROR_CODES` 追加 `NEED_LOGIN` |
| `src/background/message-router.ts` | Modify | `FILL_REQUEST` 映射 `reason === 'NEED_LOGIN'` → `ERROR_CODES.NEED_LOGIN` |
| `src/panel/panel.ts` | Modify | `fillDanmaku` 失败分支追加 `NEED_LOGIN` toast 引导（唯一通用层例外，见 PRD AC-D04） |
| `src/content/index.ts` | Modify | `createSiteDetector` 装配 `douyin: createDouyinAdapter()` |
| `tests/content/douyin-adapter.test.ts` | Create | P1-P4 契约测试 |
| `tests/content/site-detector.test.ts` | Modify | 追加 douyin 域名/直播间/非直播间用例 |
| `tests/shared/constants.test.ts` | Modify | 追加 `NEED_LOGIN` 错误码断言 |
| `tests/storage/message-router.test.ts` | Modify | 追加 `NEED_LOGIN` 回填路由用例 |

---

### Task 1: 适配器骨架 + 直播间判定/探针/登录态/房间号

**Files:**
- Create: `src/content/adapters/douyin.ts`（骨架 + 本任务四个成员；其余成员 `throw new Error('not implemented')` 占位，使后续任务可红绿驱动）
- Test: `tests/content/douyin-adapter.test.ts`（probe / getLoginState / isLiveRoom）

- [ ] **Step 1: 写失败测试**

创建 `tests/content/douyin-adapter.test.ts`，首段为 probe（FR-D01/GD5）、getLoginState（FR-D01）、isLiveRoom（FR-D01/AC-D08）契约：

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDouyinAdapter } from '../../src/content/adapters/douyin.ts';

// ---------- 选择器常量（与 douyin.ts 保持同一字符串字面量） ----------
const I = '.webcast-chatroom___input-container [contenteditable=true]';
const H = '.cjR8oGui';
const L = '.webcast-chatroom___list';

/** 精确选择器字符串匹配的伪根节点（对 probe 语义） */
function fakeRoot(present: string[]): Document {
  return {
    querySelector: (sel: string) => (present.includes(sel) ? {} : null),
  } as unknown as Document;
}

/** 按登录态种类返回伪文档（对 getLoginState/locateInput/fill） */
function fakeDoc(kind: 'input' | 'hint' | 'none' | 'both'): Document {
  return {
    querySelector: (sel: string) => {
      if (sel === I && (kind === 'input' || kind === 'both')) return {} as HTMLElement;
      if (sel === H && (kind === 'hint' || kind === 'both')) return {} as HTMLElement;
      return null;
    },
  } as unknown as Document;
}

describe('DouyinAdapter.probe 双态锚点（FR-D01 / GD5）', () => {
  it('输入框存在（已登录）→ ok，提示条记为 missing', () => {
    const p = createDouyinAdapter().probe(fakeRoot([I]));
    assert.equal(p.ok, true, '输入框为必需锚点二选一之一');
    assert.deepEqual(p.missing, [H, L]);
  });

  it('登录提示条存在（未登录）→ ok（必需锚点二选一降级）', () => {
    const p = createDouyinAdapter().probe(fakeRoot([H]));
    assert.equal(p.ok, true, '未登录无输入框，须以提示条兜底');
    assert.deepEqual(p.missing, [I, L]);
  });

  it('双锚点均缺失 → adapter_down', () => {
    const p = createDouyinAdapter().probe(fakeRoot([]));
    assert.equal(p.ok, false);
    assert.deepEqual(p.missing, [I, H, L]);
  });

  it('必需锚点齐全，列表单独缺失 → ok 且列表仅记录（缺失不判失效）', () => {
    const p = createDouyinAdapter().probe(fakeRoot([I, H]));
    assert.equal(p.ok, true);
    assert.deepEqual(p.missing, [L]);
  });
});

describe('DouyinAdapter.getLoginState 真实两态判定（FR-D01，与斗鱼分叉）', () => {
  it('输入框存在 → logged_in', () => {
    assert.equal(createDouyinAdapter({ doc: fakeDoc('input') }).getLoginState(), 'logged_in');
  });

  it('登录提示条存在 → logged_out', () => {
    assert.equal(createDouyinAdapter({ doc: fakeDoc('hint') }).getLoginState(), 'logged_out');
  });

  it('双锚点均缺失 → unknown（适配下，不臆断）', () => {
    assert.equal(createDouyinAdapter({ doc: fakeDoc('none') }).getLoginState(), 'unknown');
  });
});

describe('DouyinAdapter.isLiveRoom 直播间 URL 判定（FR-D01 / AC-D08）', () => {
  const loc = (pathname: string) => ({ pathname }) as Location;
  const adapter = createDouyinAdapter({ location: loc('/') });

  it('纯数字首段 = 直播间（如 /492632285289）', () => {
    assert.equal(createDouyinAdapter({ location: loc('/492632285289') }).isLiveRoom(loc('/492632285289')), true);
  });

  it('非直播间（首页/目录/搜索等）→ false', () => {
    assert.equal(adapter.isLiveRoom(loc('/')), false, '首页不判定');
    assert.equal(adapter.isLiveRoom(loc('/search')), false, '搜索不判定');
    assert.equal(adapter.isLiveRoom(loc('/user/abc')), false, '用户页不判定');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/content/douyin-adapter.test.ts`
Expected: FAIL——找不到模块（`douyin.ts` 尚未创建）。

- [ ] **Step 3: 创建骨架并实现四个成员**

创建 `src/content/adapters/douyin.ts`（本任务内 findDanmakuItem/extract/locateInput/fill/pause/resume 用 `throw` 占位，仅 `site`/`isLiveRoom`/`probe`/`getLoginState`/`getRoomId` 落地）：

```ts
// 抖音适配器 DouyinAdapter（PRD-douyin-adapter V1.0 / selector-dict 2026-09-21）。
// 与斗鱼差异：probe 必需锚点为「输入框 ∨ 登录提示条」二选一；getLoginState 真实两态；
// fill 为 React 受控写入（分叉点）；pause/resume 因无飘屏层为 no-op。
// 注：findDanmakuItem/extract/locateInput/fill/pause/resume 在后续 Task 落地，本处占位。
import { buildFillText } from '../build-fill-text.ts';
import type { ExtractResult, FillResult, ProbeResult, SiteAdapter } from './types.ts';

const SELECTORS = {
  chatroom: '.webcast-chatroom',
  list: '.webcast-chatroom___list',
  item: '.webcast-chatroom___item',
  text: '.webcast-chatroom___content-with-emoji-text',
  emoji: '.webcast-chatroom___content-with-emoji-emoji',
  inputContainer: '.webcast-chatroom___input-container',
  input: '.webcast-chatroom___input-container [contenteditable=true]',
  loginHint: '.cjR8oGui',
};

/** 抖音输入框字数上限（Q-D1；Task 0 实测定稿，默认对齐斗鱼 50） */
const DOUYIN_MAX_LENGTH = 50;

export interface DouyinAdapterDeps {
  /** 探测/定位文档根（默认 document；测试注入伪文档） */
  doc?: Document;
  /** 房间号来源（默认 window.location；测试注入） */
  location?: Pick<Location, 'pathname'>;
  /** React 受控写入器（默认：Task 0 实测定稿的 execCommand 序列）；测试注入 spy */
  reactWrite?: (input: HTMLElement, text: string) => boolean;
}

const notImpl = (): never => {
  throw new Error('not implemented');
};

export function createDouyinAdapter(deps: DouyinAdapterDeps = {}): SiteAdapter {
  const doc = () => deps.doc ?? document;
  const location = () => deps.location ?? window.location;

  return {
    site: 'douyin',

    isLiveRoom(loc: Pick<Location, 'pathname'>): boolean {
      const seg = loc.pathname.split('/').filter(Boolean)[0] ?? '';
      return /^\d+$/.test(seg);
    },

    probe(root: Document | HTMLElement): ProbeResult {
      // FR-D01：必需锚点为「输入框 ∨ 登录提示条」二选一（任一存在即适配存活）；
      // 弹幕列表为可选锚点，缺失仅记录不判失效（未登录亦会渲染列表）。
      const input = root.querySelector(SELECTORS.input);
      const loginHint = root.querySelector(SELECTORS.loginHint);
      const list = root.querySelector(SELECTORS.list);
      const missing: string[] = [];
      if (!input) missing.push(SELECTORS.input);
      if (!loginHint) missing.push(SELECTORS.loginHint);
      if (!list) missing.push(SELECTORS.list);
      return { ok: input !== null || loginHint !== null, missing };
    },

    findDanmakuItem(target: Element): Element | null {
      return notImpl();
    },

    extract(item: Element): ExtractResult {
      return notImpl();
    },

    locateInput(): HTMLElement | null {
      return notImpl();
    },

    fill(incoming: string, mode: 'replace' | 'append'): FillResult {
      return notImpl();
    },

    pauseDanmu(_target?: Element): void {
      return notImpl();
    },

    resumeDanmu(_target?: Element): void {
      return notImpl();
    },

    getLoginState(): 'logged_in' | 'logged_out' | 'unknown' {
      const d = doc();
      if (d.querySelector(SELECTORS.input)) return 'logged_in';
      if (d.querySelector(SELECTORS.loginHint)) return 'logged_out';
      return 'unknown';
    },

    getRoomId(): string {
      const seg = location().pathname.split('/').filter(Boolean)[0];
      return seg ?? '';
    },
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/content/douyin-adapter.test.ts`
Expected: probe / getLoginState / isLiveRoom 三块 PASS；Task 1 用例不触碰未实现成员。

- [ ] **Step 5: 提交**

```powershell
git add src/content/adapters/douyin.ts tests/content/douyin-adapter.test.ts
git commit -m "feat(content): 新增 DouyinAdapter 骨架与双态探针/登录态/直播间判定"
```

---

### Task 2: 弹幕命中与文本提取

**Files:**
- Modify: `src/content/adapters/douyin.ts`（findDanmakuItem / extract 占位替换为落地实现，约 #L66-L84 区域）
- Test: `tests/content/douyin-adapter.test.ts`（追加本任务 describe 块）

- [ ] **Step 1: 写失败测试**

在 `douyin-adapter.test.ts` 追加 fake 节点工具与命中/提取契约。fake 节点支持 `closest`/`querySelector` 类名子串匹配与 `img/svg` 探测（沿用斗鱼测试风格）：

```ts
// ---------- 弹幕命中与文本提取（FR-D02） ----------

/** fake 节点：className 子串匹配 closest/querySelector，textContent 聚合子树 */
interface FakeNode {
  className: string;
  tagName: string;
  attrs: Map<string, string>;
  ownText: string;
  children: FakeNode[];
  parent: FakeNode | null;
  isConnected: boolean;
  readonly textContent: string;
  getAttribute(k: string): string | null;
  setAttribute(k: string, v: string): void;
  appendChild(c: FakeNode): FakeNode;
  closest(sel: string): FakeNode | null;
  querySelector(sel: string): FakeNode | null;
}

function classNeedle(sel: string): string | undefined {
  return /\[class\*="([^"]+)"\]/.exec(sel)?.[1] ?? /\.([A-Za-z0-9_-]+)/.exec(sel)?.[1];
}

function fakeEl(cls: string, opts: { text?: string; tag?: string } = {}): FakeNode {
  const node: FakeNode = {
    className: cls,
    tagName: (opts.tag ?? 'div').toUpperCase(),
    attrs: new Map<string, string>(),
    ownText: opts.text ?? '',
    children: [],
    parent: null,
    isConnected: true,
    get textContent() {
      return this.ownText + this.children.map((c) => c.textContent).join('');
    },
    getAttribute(k) {
      return this.attrs.get(k) ?? null;
    },
    setAttribute(k, v) {
      this.attrs.set(k, v);
    },
    appendChild(c) {
      c.parent = node;
      this.children.push(c);
      return c;
    },
    closest(sel) {
      const needle = classNeedle(sel);
      let cur: FakeNode | null = node;
      while (cur) {
        if (needle && cur.className.split(' ').some((c) => c.includes(needle))) return cur;
        cur = cur.parent;
      }
      return null;
    },
    querySelector(sel) {
      const walk = (n: FakeNode): FakeNode | null => {
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
  };
  return node;
}

/** 按实测结构搭建条目：item → item-wrapper(哈希) → 内容层 → 昵称/文本/表情 */
function buildItem(opts: {
  content?: string;
  emoji?: boolean;
  nickname?: string;
} = {}): FakeNode {
  const item = fakeEl('webcast-chatroom___item');
  const wrapper = fakeEl('Cl4EfhXg'); // 哈希，仅结构占位
  const row = fakeEl('NkS2Invn'); // 哈希
  const nick = fakeEl('v8LY0gZF', { text: opts.nickname ?? 'z*****：' });
  const contentArea = fakeEl('cL385mHb');
  if (opts.content) {
    const textSpan = fakeEl('webcast-chatroom___content-with-emoji-text', { text: opts.content });
    contentArea.appendChild(textSpan);
  }
  if (opts.emoji) {
    const emoji = fakeEl('webcast-chatroom___content-with-emoji-emoji');
    emoji.appendChild(fakeEl('', { tag: 'img' }));
    contentArea.appendChild(emoji);
  }
  row.appendChild(nick);
  row.appendChild(contentArea);
  wrapper.appendChild(row);
  item.appendChild(wrapper);
  return item;
}

const asEl = (n: FakeNode) => n as unknown as Element;

describe('DouyinAdapter 弹幕命中（FR-D02）', () => {
  const adapter = createDouyinAdapter();

  it('右键文本锚点 → 命中其所属条目', () => {
    const item = buildItem({ content: '666冲冲冲' });
    const textSpan = item.children[0]!.children[0]!.children[1]!.children[0]!;
    assert.equal(adapter.findDanmakuItem(asEl(textSpan)), asEl(item));
  });

  it('空占位条目（无文本、无表情）→ 不命中（虚拟列表占位）', () => {
    const item = buildItem({ nickname: '   ' }); // 无文本锚点、无 img
    assert.equal(adapter.findDanmakuItem(asEl(item)), null);
  });

  it('纯表情条目（无文本锚点、含 img）→ 命中', () => {
    const item = buildItem({ emoji: true });
    assert.equal(adapter.findDanmakuItem(asEl(item)), asEl(item));
  });

  it('非条目区域 → null（不拦截原生菜单）', () => {
    const other = fakeEl('webcast-chatroom___list');
    assert.equal(adapter.findDanmakuItem(asEl(other)), null);
  });
});

describe('DouyinAdapter 文本提取（FR-D02：排除昵称污染）', () => {
  const adapter = createDouyinAdapter();

  it('extract 取文本锚点内容，不含昵称前缀', () => {
    const item = buildItem({ content: '666冲冲冲', nickname: 'z*****：' });
    const r = adapter.extract(asEl(item));
    assert.equal(r.text, '666冲冲冲', '不得混入"z*****："昵称');
    assert.equal(r.hasRichContent, false);
  });

  it('含 img 的条目 → hasRichContent=true；无文本锚点取空串', () => {
    const item = buildItem({ emoji: true, nickname: 'z*****：' });
    const r = adapter.extract(asEl(item));
    assert.equal(r.text, '', '纯表情弹幕文本为空');
    assert.equal(r.hasRichContent, true);
  });
});
```

> **实现注记（修正 PRD FR-D02 表述）：** PRD 写「缺失回退条目 textContent」，但抖音条目 textContent 含昵称（`v8LY0gZF` 文本形如「z*****：」）。**不得回退 textContent**，否则收藏混入昵称。改为：仅取文本锚点，缺失即空串（表情/占位语义天然成立）。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/content/douyin-adapter.test.ts`
Expected: 本任务两块 FAIL——`findDanmakuItem`/`extract` 抛 `not implemented`；Task 1 probe 用例仍 PASS。

- [ ] **Step 3: 实现**

替换 `douyin.ts` 中占位实现：

```ts
    findDanmakuItem(target: Element): Element | null {
      // FR-D02：命中条目本身；非空过滤排除虚拟列表空占位（纯表情含 img 仍命中）
      const item = target.closest(SELECTORS.item);
      if (
        item &&
        ((item.textContent ?? '').trim() !== '' || item.querySelector('img, svg') !== null)
      ) {
        return item;
      }
      return null;
    },

    extract(item: Element): ExtractResult {
      // 仅取文本锚点，不回到 textContent（条目 textContent 含昵称，会污染收藏）。
      // 无文本锚点 → 空串（表情/占位）：纯表情 text='' + hasRichContent=true，行为对齐主 PRD FR-01。
      const textAnchor = item.querySelector(SELECTORS.text);
      const text = textAnchor ? (textAnchor.textContent ?? '').trim() : '';
      const hasRichContent = item.querySelector('img, svg') !== null;
      return { text, hasRichContent };
    },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/content/douyin-adapter.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/content/adapters/douyin.ts tests/content/douyin-adapter.test.ts
git commit -m "feat(content): DouyinAdapter 弹幕命中与昵称安全文本提取"
```

---

### Task 3: 回填编排（locateInput / fill，React 受控写入）

**Files:**
- Modify: `src/content/adapters/douyin.ts`（locateInput / fill 占位替换，引入 deps.reactWrite 默认实现）
- Modify: `src/content/adapters/types.ts`（`FillResult.reason` 追加 `'NEED_LOGIN'`）
- Test: `tests/content/douyin-adapter.test.ts`（追加回填编排 describe 块）

- [ ] **Step 1: 写失败测试**

修改 `types.ts`：`reason?: 'NO_INPUT' | 'NEED_LOGIN';`（理由见下方实现；与 PRD 未登录引导对齐）。

在 `douyin-adapter.test.ts` 追加回填编排契约（注入 `reactWrite` spy 与伪 doc，验证编排而非浏览器事件序列）：

```ts
// ---------- 回填编排（FR-D03；注入 reactWrite spy 验证编排，事件序列 Task 0 定稿） ----------

function fakeInput(innerText: string): HTMLElement {
  return { innerText } as unknown as HTMLElement;
}

/** 伪文档：querySelector 命中选择器字符串 */
function fakeDocSel(input: HTMLElement | null): Document {
  return {
    querySelector: (sel: string) => {
      if (sel === I) return input;
      if (sel === H) return null;
      return null;
    },
  } as unknown as Document;
}

describe('DouyinAdapter 回填编排（FR-D03 / AC-D03）', () => {
  it('已登录 + replace：超长截断并按截断文本调用 reactWrite', () => {
    const input = fakeInput('旧内容');
    const wrote: Array<[HTMLElement, string]> = [];
    const adapter = createDouyinAdapter({
      doc: fakeDocSel(input),
      reactWrite: (el, t) => {
        wrote.push([el, t]);
        return true;
      },
    });
    const r = adapter.fill('x'.repeat(60), 'replace');
    assert.equal(r.ok, true);
    assert.equal(r.truncated, true);
    assert.equal(wrote.length, 1);
    assert.equal(wrote[0]![1]!.length, 50, '应写入截断至上限的文本');
  });

  it('已登录 + append：buildFillText 拼接已有内容后写入', () => {
    const input = fakeInput('cookie');
    const wrote: Array<[HTMLElement, string]> = [];
    const adapter = createDouyinAdapter({
      doc: fakeDocSel(input),
      reactWrite: (el, t) => {
        wrote.push([el, t]);
        return true;
      },
    });
    const r = adapter.fill('cutter', 'append');
    assert.equal(r.ok, true);
    assert.equal(wrote[0]![1], 'cookie cutter');
  });

  it('未登录（登录提示条存在）→ reason=NEED_LOGIN，不写输入框', () => {
    const wrote: Array<unknown> = [];
    const adapter = createDouyinAdapter({
      doc: fakeDoc('hint'),
      reactWrite: (el, t) => {
        wrote.push([el, t]);
        return true;
      },
    });
    const r = adapter.fill('hello', 'replace');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'NEED_LOGIN');
    assert.equal(wrote.length, 0);
  });

  it('unknown（双锚点缺失）→ reason=NO_INPUT（与斗鱼输入框缺失语义一致）', () => {
    const adapter = createDouyinAdapter({ doc: fakeDoc('none') });
    const r = adapter.fill('hello', 'replace');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'NO_INPUT');
  });

  it('空文本 → 直接拒绝，不查询输入框', () => {
    const wrote: Array<unknown> = [];
    const adapter = createDouyinAdapter({
      doc: fakeDoc('input'),
      reactWrite: (el, t) => {
        wrote.push([el, t]);
        return true;
      },
    });
    const r = adapter.fill('', 'replace');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'NO_INPUT');
    assert.equal(wrote.length, 0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/content/douyin-adapter.test.ts`
Expected: 回填编排块 FAIL——`fill`/`locateInput` 抛 `not implemented`。同时 `types.ts` 修改若未做，`NEED_LOGIN` 字面量在测试里赋值会编译失败——先改 `types.ts` 再跑。

- [ ] **Step 3: 实现**

`types.ts` 改联合类型：

```ts
export interface FillResult {
  ok: boolean;
  truncated: boolean;
  /** NO_INPUT：输入框缺失（无写入目标，含空文本）；NEED_LOGIN：抖音未登录，输入框不渲染（引导登录） */
  reason?: 'NO_INPUT' | 'NEED_LOGIN';
}
```

`douyin.ts` 顶部追加默认 React 写入（Task 0 定稿序列；此处按 execCommand 生效的实测结论写入，若 Task 0 选择序列 B 则替换为 B 实现）：

```ts
/** 默认 React 受控写入（Task 0 实测定稿：execCommand('insertText') 覆盖全选区，React 感知；
 *  直写 innerText + input 事件抖音不感知，不可照搬斗鱼范式） */
function defaultReactWrite(input: HTMLElement, text: string): boolean {
  input.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(input);
  sel?.removeAllRanges();
  sel?.addRange(range);
  return document.execCommand('insertText', false, text);
}
```

`createDouyinAdapter` 体内解构 reactWrite（放在 `const doc = ...` 附近）：

```ts
  const reactWrite = deps.reactWrite ?? defaultReactWrite;
```

替换 `locateInput` / `fill` 占位：

```ts
    locateInput(): HTMLElement | null {
      return doc().querySelector<HTMLElement>(SELECTORS.input);
    },

    fill(incoming: string, mode: 'replace' | 'append'): FillResult {
      const input = this.locateInput();
      // FR-D03：未登录输入框不渲染 → NEED_LOGIN 引导；其余无目标/空文本 → NO_INPUT
      if (!input || incoming === '') {
        return this.getLoginState() === 'logged_out'
          ? { ok: false, truncated: false, reason: 'NEED_LOGIN' }
          : { ok: false, truncated: false, reason: 'NO_INPUT' };
      }
      const current = input.innerText;
      const { text, truncated } = buildFillText({
        current,
        incoming,
        mode,
        maxLength: DOUYIN_MAX_LENGTH,
      });
      const ok = reactWrite(input, text); // React 感知与否由 Task 0 定稿序列保证
      return { ok, truncated };
    },
```

> `DOUYIN_MAX_LENGTH` 已在 Task 1 定义（Task 0 实测覆盖初值 50）。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/content/douyin-adapter.test.ts`
Expected: 全部 PASS（含 Task 1/2）。

- [ ] **Step 5: 提交**

```powershell
git add src/content/adapters/douyin.ts src/content/adapters/types.ts tests/content/douyin-adapter.test.ts
git commit -m "feat(content): DouyinAdapter 回填编排（React 受控写入，未登录 NEED_LOGIN）"
```

---

### Task 4: 飘屏冻结/恢复 no-op

**Files:**
- Modify: `src/content/adapters/douyin.ts`（pauseDanmu / resumeDanmu 占位替换）
- Test: `tests/content/douyin-adapter.test.ts`（追加 no-op 契约）

- [ ] **Step 1: 写失败测试**

在 `douyin-adapter.test.ts` 追加：

```ts
// ---------- 飘屏冻结/恢复 no-op（FR-D04：抖音无飘屏层） ----------

describe('DouyinAdapter 飘屏降级（FR-D04）', () => {
  const adapter = createDouyinAdapter();

  it('pauseDanmu(target) 不触碰 getAnimations（无飘屏层）', () => {
    let called = false;
    const item = fakeEl('webcast-chatroom___item', { text: 'x' });
    (item as unknown as { getAnimations: () => unknown[] }).getAnimations = () => {
      called = true;
      return [];
    };
    adapter.pauseDanmu(asEl(item));
    assert.equal(called, false, '秒返回，不冻结任何动画');
  });

  it('resumeDanmu 亦为 no-op，无参/带参均不抛错', () => {
    assert.doesNotThrow(() => adapter.pauseDanmu());
    assert.doesNotThrow(() => adapter.resumeDanmu());
    assert.doesNotThrow(() => adapter.resumeDanmu(fakeEl('webcast-chatroom___item')));
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/content/douyin-adapter.test.ts`
Expected: 本块 FAIL——`pauseDanmu`/`resumeDanmu` 抛 `not implemented`，`called` 实测未被触碰（false→no-op 语义）。

- [ ] **Step 3: 实现**

替换 `douyin.ts` 占位：

```ts
    pauseDanmu(_target?: Element): void {
      // FR-D04：抖音 PC 直播无独立飘屏弹幕层（登录/未登录两态实测确认），no-op
    },

    resumeDanmu(_target?: Element): void {
      // FR-D04：无冻结目标可恢复，no-op
    },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/content/douyin-adapter.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/content/adapters/douyin.ts tests/content/douyin-adapter.test.ts
git commit -m "feat(content): DouyinAdapter 飘屏冻结/恢复降级为 no-op"
```

---

### Task 5: 装配 + 未登录回填引导（通用层最小改动）

**Files:**
- Modify: `src/content/index.ts`
- Modify: `src/shared/constants.ts`
- Modify: `src/background/message-router.ts`
- Modify: `src/panel/panel.ts`
- Modify: `tests/content/site-detector.test.ts`
- Modify: `tests/shared/constants.test.ts`
- Modify: `tests/storage/message-router.test.ts`

**背景**（PRD GD4「通用层零改动」的范围解释）：收藏/菜单/消息链路零逻辑改动成立；但 AC-D04 明确定义「未登录回填置灰 + 引导」，需一个最小错误分支：新增 `ERROR_CODES.NEED_LOGIN` 并在回填路由作映射。这是本迭代唯一通用层例外。

- [ ] **Step 1: 写失败测试**

`tests/content/site-detector.test.ts` 末尾追加 douyin 域名装配用例：

```ts
// ---------- SiteDetector douyin 域名（抖音适配装配） ----------
describe('SiteDetector 识别 douyin 直播间并装配 DouyinAdapter', () => {
  const detector = createSiteDetector({
    douyu: createDouyuAdapter(),
    douyin: createDouyinAdapter(),
  });

  it('live.douyin.com/<房间号> → DetectedSite + site=douyin', () => {
    const d = detector.detect(loc('live.douyin.com', '/492632285289'), fakeRoot);
    assert.ok(d, '应识别抖音直播间');
    assert.equal(d.site, 'douyin');
    assert.equal(d.status, 'ok');
    assert.equal(d.adapter.getRoomId(), '492632285289');
  });

  it('douyin.com 非直播间 URL → null（不挂载能力）', () => {
    assert.equal(detector.detect(loc('www.douyin.com', '/'), fakeRoot), null, '首页不注入');
    assert.equal(detector.detect(loc('www.douyin.com', '/search'), fakeRoot), null, '搜索不注入');
  });

  it('未装配 douyin 时 douyin 域名 → null（静默，不影响斗鱼）', () => {
    const solo = createSiteDetector({ douyu: createDouyuAdapter() });
    assert.equal(solo.detect(loc('live.douyin.com', '/492632285289'), fakeRoot), null);
  });
});
```

> `site-detector.test.ts` 顶部当前 `const detector = createSiteDetector({ douyu: ... })`；本块内用局部 `detector` 变量同名会遮蔽，需将该块变量改名为 `dyDetector`（下实现步骤给出）。`getRoomId` 依赖 `window.location`——在 `node:test` 无 `window`，故 `douyin.ts` 的 `getRoomId` 在测试落地前保证不炸：检测块内仅断言 `d.site`/`d.status` 与 `d.adapter instanceof` 即可；若坚持断言 `getRoomId`，需在测试顶层给 `globalThis.window` 打桩。**实现此步时统一方案：避免在单测断言 getRoomId，改断言 `d.adapter.site === 'douyin'`。**

`tests/storage/message-router.test.ts` 末尾追加 NEED_LOGIN 路由用例（复用该文件既有 `router`/`fillPayload`/`sendToTab` 桩风格，注入 `sendToTab: async () => ({ ok: false, truncated: false, reason: 'NEED_LOGIN' })`，断言 `r.error.code === ERROR_CODES.NEED_LOGIN`）。

`tests/shared/constants.test.ts` 追加 `NEED_LOGIN: 'NEED_LOGIN'` 到 `ERROR_CODES` 断言对象。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/content/site-detector.test.ts tests/storage/message-router.test.ts tests/shared/constants.test.ts`
Expected: 三处 FAIL——装配未接线、`NEED_LOGIN` 错误码不存在、路由未映射。

- [ ] **Step 3: 实现**

`src/content/index.ts` 装配（先创建 import，再改 `createSiteDetector` 传参）：

```ts
import { createDouyinAdapter } from './adapters/douyin.ts';
// …
const detector = createSiteDetector({
  douyu: createDouyuAdapter(),
  douyin: createDouyinAdapter(),
});
```

`src/shared/constants.ts` 的 `ERROR_CODES` 追加（放在 `ADAPTER_DOWN` 之后）：

```ts
  NEED_LOGIN: 'NEED_LOGIN',
```

`src/background/message-router.ts` 的 `[MESSAGES.FILL_REQUEST]` 内，在既有 `NO_INPUT → ADAPTER_DOWN` 判断之后追加：

```ts
      // 抖音未登录回填：输入框不渲染（NEED_LOGIN）→ 引导登录（区别于改版失效）
      if (!fillResult.ok && fillResult.reason === 'NEED_LOGIN') {
        void diagnostics?.log('fill', 'warn', `回填需登录（tab ${tabId}）`);
        throw new StoreError(ERROR_CODES.NEED_LOGIN, '抖音直播需登录后才能回填，请登录后重试');
      }
```

`src/panel/panel.ts` 的 `fillDanmaku` 失败分支（#L771-L777）追加（在 `ADAPTER_DOWN` 分支之前），并补充登录入口指引：

```ts
  } else if (r.error?.code === ERROR_CODES.NEED_LOGIN) {
    toast('抖音直播需登录后才能回填，请先登录', 'warn');
    void chrome.tabs.create({ url: 'https://www.douyin.com/?show_login=1' });
  } else if (r.error?.code === 'SITE_UNSUPPORTED') {
```

> 面板需在顶部 `import { ERROR_CODES } from '../shared/constants.ts'`（panel.ts 已在 `DANMAKU_MAX_LENGTH` 旁 import constants，确认存在 `ERROR_CODES` 导出再引用）。

`tests/content/site-detector.test.ts` 顶部 import 追加 `createDouyinAdapter`；本块局部变量改名为 `dyDetector` 避免与顶部 `detector` 遮蔽；`getRoomId` 断言改为 `d.adapter.site === 'douyin'`。

- [ ] **Step 4: 跑测试确认通过**

Run（门禁核心四项）：
```
node --test tests/content/site-detector.test.ts tests/storage/message-router.test.ts tests/shared/constants.test.ts
npm run typecheck
npm run lint
```
Expected: 三测试文件 PASS、typecheck/lint 无错。

- [ ] **Step 5: 提交**

```powershell
git add src/content/index.ts src/shared/constants.ts src/background/message-router.ts src/panel/panel.ts tests/content/site-detector.test.ts tests/storage/message-router.test.ts tests/shared/constants.test.ts
git commit -m "feat: 装配 DouyinAdapter 并接线未登录回填引导（NEED_LOGIN）"
```

---

### Task 6: 全量门禁回归 + 双端人工走查

**Files:** 无代码改动（验证既有契约不被破坏）。

- [ ] **Step 1: 运行全量门禁**

Run: `npm run check`
Expected: typecheck → lint → test → build 全绿。重点回归：`douyu-adapter.test.ts`、`context-menu-controller.test.ts`、`message-router.test.ts` 既有用例（GD4：斗鱼零回归）。

- [ ] **Step 2: 已登录人工走查（AC-D01/D03/D05）**
  用 chrome-devtools 打开已登录抖音直播间：右键弹幕→菜单 ≤100ms→收藏入库 platform=douyin；点击条目→回填→发送按钮出现→焦点末尾；直播间内退出登录→回填即时翻转（NO_INPUT 引导）。

- [ ] **Step 3: 未登录人工走查（AC-D02/D04/D07）**
  全新无 cookie 会话：弹幕列表渲染、右键收藏成功无登录墙；回填→NEED_LOGIN 引导 toast + 打开登录页。probe 双态均「适配存活」。

- [ ] **Step 4: 提交（无改动则跳过）**

```powershell
git status --porcelain
```

---

## 自检对照（Self-Review）

| PRD 契约 | 落地任务 |
|---------|---------|
| FR-D01 适配探测与登录态 | Task 1（probe 双态 / getLoginState / isLiveRoom / getRoomId） |
| FR-D02 聊天区右键收藏 | Task 2（findDanmakuItem / extract，昵称安全） |
| FR-D03 弹幕回填 | Task 3（locateInput / fill / NEED_LOGIN）+ Task 0 实测定稿序列 |
| FR-D04 飘屏冻结降级 | Task 4（pause/resume no-op） |
| FR-D05 降级容错 | Task 5（ERROR_CODES.NEED_LOGIN 路由；probe 失效整体走既有 ADAPTER_DOWN） |
| AC-D01/D02/D03/D04/D05/D08 | Task 6 人工走查节点 |
| GD4 通用层零改动 | 收藏/菜单/消息链路零逻辑改动；唯一例外 = NEED_LOGIN 引导分支（AC-D04 必需） |
| Q-D1/Q-D2 | Task 0 现场实测定稿 |

**类型一致性自查：** `FillResult.reason` 在 Task 3 扩展为 `'NO_INPUT' | 'NEED_LOGIN'`，Task 5 路由按 `NEED_LOGIN` 匹配；`createDouyinAdapter` 依赖签名 `{ doc, location, reactWrite }` 贯穿 Task 1-4 测试；探针实验字符串常量 `I`/`H`/`L` 与 `douyin.ts` 的 `SELECTORS.input/loginHint/list` 保持同一字面量（计划已对齐）。

**占位扫描：** 除 Task 1 显式标注的占位（后续 Task 落地）外，无 TBD/TODO；每步含完整代码与预期输出。