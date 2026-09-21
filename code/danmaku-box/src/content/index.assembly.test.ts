// danmaku-box/src/content/index.assembly.test.ts
// 装配互斥契约（试点决策 2026-09-21）：content 入口按 site 分流 douyin-entry / toolbar-entry。
// 纯常量/端口级校验（不引 jsdom，DOM 副作用留人工走查）：
//   - 两入口弹层样式均携带 .cang-pop（同页单站点不冲突）；
//   - 两入口锚点选择器常量独立存在且互斥（douyin=.webcast-chatroom，douyu=.ChatToolBar__left）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOUYIN_ENTRY_STYLES,
  DOUYIN_ENTRY_ANCHOR,
} from './toolbar-entry/douyin-entry.ts';
import {
  TOOLBAR_ENTRY_STYLES,
  TOOLBAR_ENTRY_ANCHOR,
} from './toolbar-entry/toolbar-entry.ts';

test('装配互斥：抖音与斗鱼入口弹层样式独立存在、锚点常量不共用', () => {
  // 弹层样式各自携带 .cang-pop（Legacy 前缀沿用，同页单站点不冲突）
  assert.ok(DOUYIN_ENTRY_STYLES.includes('.cang-pop'), 'douyin 弹层样式存在');
  assert.ok(TOOLBAR_ENTRY_STYLES.includes('.cang-pop'), 'douyu 弹层样式存在');

  // 锚点选择器互斥契约：douyin 用聊区容器，douyu 用聊天工具栏左区
  assert.ok(DOUYIN_ENTRY_ANCHOR.includes('.webcast-chatroom'), 'douyin 锚点常量存在');
  assert.ok(TOOLBAR_ENTRY_ANCHOR.includes('.ChatToolBar__left'), 'douyu 锚点常量存在');
  assert.notEqual(DOUYIN_ENTRY_ANCHOR, TOOLBAR_ENTRY_ANCHOR, '两入口锚点不共用');
});