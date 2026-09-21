import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDouyinAdapter } from '../../src/content/adapters/douyin.ts';

const I = '.webcast-chatroom___input-container [contenteditable=true]';
const H = '.cjR8oGui';
const L = '.webcast-chatroom___list';

function fakeRoot(present: string[]): Document {
  return {
    querySelector: (sel: string) => (present.includes(sel) ? {} : null),
  } as unknown as Document;
}

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

  it('双锚点均缺失 → unknown', () => {
    assert.equal(createDouyinAdapter({ doc: fakeDoc('none') }).getLoginState(), 'unknown');
  });
});

describe('DouyinAdapter.isLiveRoom 直播间 URL 判定（FR-D01 / AC-D08）', () => {
  const loc = (pathname: string) => ({ pathname }) as Location;
  const adapter = createDouyinAdapter({ location: loc('/') });

  it('纯数字首段 = 直播间（如 /492632285289）', () => {
    assert.equal(
      createDouyinAdapter({ location: loc('/492632285289') }).isLiveRoom(loc('/492632285289')),
      true,
    );
  });

  it('非直播间（首页/目录/搜索等）→ false', () => {
    assert.equal(adapter.isLiveRoom(loc('/')), false, '首页不判定');
    assert.equal(adapter.isLiveRoom(loc('/search')), false, '搜索不判定');
    assert.equal(adapter.isLiveRoom(loc('/user/abc')), false, '用户页不判定');
  });
});

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
function buildItem(opts: { content?: string; emoji?: boolean; nickname?: string } = {}): FakeNode {
  const item = fakeEl('webcast-chatroom___item');
  const wrapper = fakeEl('Cl4EfhXg');
  const row = fakeEl('NkS2Invn');
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
    const item = buildItem({ nickname: '   ' });
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

// ---------- 回填编排（FR-D03；注入 reactWrite spy 验编排，事件序列 Task 0 定稿） ----------

function fakeInput(innerText: string): HTMLElement {
  return { innerText } as unknown as HTMLElement;
}

/** 伪文档：querySelector 命中输入框，其余无视 */
function fakeDocSel(input: HTMLElement | null): Document {
  return {
    querySelector: (sel: string) => {
      if (sel === I) return input;
      return null;
    },
  } as unknown as Document;
}

describe('DouyinAdapter 回填编排（FR-D03 / AC-D03）', () => {
  it('已登录 + replace：超长截断并按截断文本调 reactWrite', () => {
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

  it('未登录（提示条存在）→ reason=NEED_LOGIN，不写输入框', () => {
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
    assert.doesNotThrow(() => adapter.resumeDanmu(asEl(fakeEl('webcast-chatroom___item'))));
  });
});
