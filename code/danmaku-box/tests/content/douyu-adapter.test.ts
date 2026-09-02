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
