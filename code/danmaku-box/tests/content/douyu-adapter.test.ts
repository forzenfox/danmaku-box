import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDouyuAdapter } from '../../src/content/adapters/douyu.ts';

// DouyuAdapter.probe 锚点语义测试（A：回填仅依赖输入框，弹幕列表为可选锚点）。
// 背景：斗鱼直播间弹幕列表随 WebSocket 首条消息延迟渲染（实测约 9s），
// 而回填仅写入输入框；列表缺失不应判定适配失效。

/** 构造仅暴露 querySelector 的伪根节点，命中集合按完整选择器字符串匹配 */
function fakeRoot(present: string[]): Document {
  return {
    querySelector: (sel: string) => (present.includes(sel) ? {} : null),
  } as unknown as Document;
}

const INPUT = '.ChatSend-txt';
const LIST = '.Barrage-list, #js-barrage-list';

describe('DouyuAdapter.probe 锚点语义', () => {
  it('输入框存在、弹幕列表缺失 → ok 且列表记为 missing', () => {
    const probe = createDouyuAdapter().probe(fakeRoot([INPUT]));
    assert.equal(probe.ok, true, '列表缺失不应判定适配失效');
    assert.deepEqual(probe.missing, [LIST]);
  });

  it('输入框与弹幕列表均存在 → ok 且无 missing', () => {
    const probe = createDouyuAdapter().probe(fakeRoot([INPUT, LIST]));
    assert.equal(probe.ok, true);
    assert.deepEqual(probe.missing, []);
  });

  it('输入框缺失 → adapter_down（回填真正的必需锚点）', () => {
    const probe = createDouyuAdapter().probe(fakeRoot([]));
    assert.equal(probe.ok, false);
    assert.deepEqual(probe.missing, [INPUT, LIST]);
  });
});

describe('DouyuAdapter.isLiveRoom 直播间 URL 判定（走查反馈：非直播页不挂载抽屉把手）', () => {
  const loc = (pathname: string) => ({ pathname }) as Location;

  it('纯数字首段 = 直播间（如 /1126960）', () => {
    assert.equal(createDouyuAdapter().isLiveRoom(loc('/1126960')), true);
  });

  it('非直播间 URL 返回 false（首页/目录/个人页/topic）', () => {
    assert.equal(createDouyuAdapter().isLiveRoom(loc('/')), false, '首页不应判定为直播间');
    assert.equal(createDouyuAdapter().isLiveRoom(loc('/g_yz')), false, '分类目录不应判定');
    assert.equal(
      createDouyuAdapter().isLiveRoom(loc('/hermes/b8mceqskr0xzv')),
      false,
      '个人页不应判定',
    );
    assert.equal(
      createDouyuAdapter().isLiveRoom(loc('/topic/jdqs3/1.shtml')),
      false,
      '专题页不应判定',
    );
  });
});

// ---------- 飘屏命中与文本提取（专项 PRD C1/C2，实测 DOM 结构 2026-09-17） ----------

/** fake 节点最小契约：className 子串匹配 closest/querySelector，textContent 聚合子树 */
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

/** 选择器 → 类名子串特征：支持 [class*="x"] 与 .x 两种形式（与实现的选择器语法一致） */
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

/** 按实测结构搭建：层（pointer-events:none，永不成为 target）→ 弹幕项 → 文本节点 */
function buildDanmuLayer(items: Array<{ uuid: string; text: string }>): FakeNode {
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

/** FakeNode → Element：仅类型视角转换，运行时同一对象（沿用仓库 as unknown as 惯例） */
const asEl = (n: FakeNode) => n as unknown as Element;

describe('DouyuAdapter 飘屏命中（C1：命中弹幕项而非层容器）', () => {
  const adapter = createDouyuAdapter();

  it('右键文本节点 → 命中其所属弹幕项', () => {
    const layer = buildDanmuLayer([
      { uuid: 'u1', text: '你让风行去哪' },
      { uuid: 'u2', text: '666冲冲冲' },
    ]);
    const wrap = layer.children[0]!.children[0]!.children[0]!; // textWrap
    const hit = adapter.findDanmakuItem(asEl(wrap));
    assert.equal(hit, asEl(layer.children[0]!), '应命中第一条弹幕项');
    assert.ok(hit && hit.className.includes('danmuItem'));
  });

  it('层容器自身不参与命中（其文本为多条拼接，旧缺陷回归钉桩）', () => {
    const layer = buildDanmuLayer([
      { uuid: 'u1', text: 'AAA' },
      { uuid: 'u2', text: 'BBB' },
    ]);
    assert.equal(adapter.findDanmakuItem(asEl(layer)), null);
  });

  it('空文本且无表情元素的弹幕项不命中（对象池空占位）', () => {
    const layer = buildDanmuLayer([{ uuid: 'u1', text: '   ' }]);
    assert.equal(adapter.findDanmakuItem(asEl(layer.children[0]!)), null);
  });

  it('纯表情飘屏弹幕（无文本、含 img）→ 命中弹幕项（FR-V02：菜单照出）', () => {
    const item = fakeEl('danmuItem-a8616a scroll-c8a9ee');
    item.setAttribute('data-comment-uuid', 'u1');
    const textBox = fakeEl('text-da6396');
    const textWrap = fakeEl('textWrap-f7cfb9'); // 无文本，仅表情图片
    textWrap.appendChild(fakeEl('', { tag: 'img' }));
    textBox.appendChild(textWrap);
    item.appendChild(textBox);
    const hit = adapter.findDanmakuItem(asEl(textWrap));
    assert.equal(hit, asEl(item), '纯表情弹幕项应命中');
    const r = adapter.extract(asEl(item));
    assert.equal(r.text, '', '无文本弹幕提取为空串');
    assert.equal(r.hasRichContent, true);
  });

  it('聊天区条目路径不受影响', () => {
    const chat = fakeEl('Barrage-listItem');
    assert.equal(adapter.findDanmakuItem(asEl(chat)), asEl(chat));
  });
});

describe('DouyuAdapter 飘屏文本提取（C2：单条纯文本）', () => {
  const adapter = createDouyuAdapter();

  it('extract 取 textWrap 文本节点内容，非容器拼接串', () => {
    const layer = buildDanmuLayer([
      { uuid: 'u1', text: '你让风行去哪' },
      { uuid: 'u2', text: '666冲冲冲' },
    ]);
    const r = adapter.extract(asEl(layer.children[1]!));
    assert.equal(r.text, '666冲冲冲');
    assert.equal(r.hasRichContent, false);
  });

  it('含 img 子元素的弹幕 → hasRichContent=true', () => {
    const item = fakeEl('danmuItem-a8616a');
    const wrap = fakeEl('textWrap-f7cfb9', { text: '带表情' });
    wrap.appendChild(fakeEl('', { tag: 'img' }));
    item.appendChild(wrap);
    const r = adapter.extract(asEl(item));
    assert.equal(r.text, '带表情');
    assert.equal(r.hasRichContent, true);
  });

  it('聊天区条目仍走 .Barrage-content', () => {
    const item = fakeEl('Barrage-listItem');
    const content = fakeEl('Barrage-content', { text: '聊天区弹幕' });
    item.appendChild(content);
    assert.equal(adapter.extract(asEl(item)).text, '聊天区弹幕');
  });
});

// ---------- WAAPI 冻结/恢复（专项 PRD C3/C4/C8；实测：飘屏位移由 WAAPI 驱动，
// animation-play-state 无效；弹幕项被对象池复用，uuid 更换须安全跳过） ----------

function fakeAnim(playState?: string) {
  return {
    paused: false,
    played: 0,
    playState, // 缺省 undefined：不满足实现的 canceled/finished 跳过条件
    pause() {
      this.paused = true;
    },
    play() {
      this.played += 1;
    },
  };
}

function fakeDanmuItem(uuid: string, anims: ReturnType<typeof fakeAnim>[]) {
  const item = fakeEl('danmuItem-a8616a', { text: '飘屏内容' });
  item.setAttribute('data-comment-uuid', uuid);
  (item as unknown as { getAnimations: () => unknown[] }).getAnimations = () => anims;
  return item;
}

describe('DouyuAdapter WAAPI 冻结/恢复', () => {
  it('C3：pauseDanmu(target) 调用 getAnimations().pause()，resumeDanmu 恢复', () => {
    const adapter = createDouyuAdapter();
    const a = fakeAnim();
    const item = fakeDanmuItem('u1', [a]);
    adapter.pauseDanmu(asEl(item));
    assert.equal(a.paused, true);
    adapter.resumeDanmu(asEl(item));
    assert.equal(a.played, 1);
  });

  it('C3：无动画元素不抛错（聊天区条目/已结束弹幕）', () => {
    const adapter = createDouyuAdapter();
    const plain = fakeEl('Barrage-listItem');
    // 真实 Element 恒有 getAnimations（无动画返回 []），fake 需补齐该契约
    (plain as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [];
    assert.doesNotThrow(() => adapter.pauseDanmu(asEl(plain)));
    assert.doesNotThrow(() => adapter.resumeDanmu(asEl(plain)));
  });

  it('C4：池化复用（uuid 更换）→ 恢复安全跳过，不误 play 新动画', () => {
    const adapter = createDouyuAdapter();
    const a = fakeAnim();
    const item = fakeDanmuItem('u1', [a]);
    adapter.pauseDanmu(asEl(item));
    item.setAttribute('data-comment-uuid', 'u2'); // 元素被复用给新弹幕
    adapter.resumeDanmu(asEl(item));
    assert.equal(a.played, 0, 'uuid 不一致不得恢复');
  });

  it('C4：元素脱离文档 → 恢复安全跳过', () => {
    const adapter = createDouyuAdapter();
    const a = fakeAnim();
    const item = fakeDanmuItem('u1', [a]);
    adapter.pauseDanmu(asEl(item));
    item.isConnected = false;
    adapter.resumeDanmu(asEl(item));
    assert.equal(a.played, 0);
  });

  it('站方在 uuid 未变时 cancel 过动画 → 恢复跳过（play 会从 0 重启致弹幕重飞）', () => {
    const adapter = createDouyuAdapter();
    const canceled = fakeAnim('canceled');
    const finished = fakeAnim('finished');
    const running = fakeAnim(); // 既有 fake 无 playState（undefined），应正常恢复
    const item = fakeDanmuItem('u1', [canceled, finished, running]);
    adapter.pauseDanmu(asEl(item));
    adapter.resumeDanmu(asEl(item));
    assert.equal(canceled.played, 0, 'canceled 动画不得 play');
    assert.equal(finished.played, 0, 'finished 动画不得 play');
    assert.equal(running.played, 1);
  });

  it('C8：无参调用保持既有语义（no-op，聊天区路径不受影响）', () => {
    const adapter = createDouyuAdapter();
    assert.doesNotThrow(() => adapter.pauseDanmu());
    assert.doesNotThrow(() => adapter.resumeDanmu());
  });
});
