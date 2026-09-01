// danmaku-box/tests/panel/list-interaction.test.ts
// 契约测试：弹幕行单击交互语义（走查反馈 V2.2 修正）。
// 批量模式下单击内容 = 切换勾选（而非回填）；非批量模式 = 回填。
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveContentClick, toggleChecked } from '../../src/panel/list-interaction.ts';

test('非批量模式下单击内容意图为回填', () => {
  const checked = new Set<string>();
  const intent = resolveContentClick({ batchMode: false, checked, id: 'a1' });
  assert.equal(intent, 'fill');
  assert.equal(checked.has('a1'), false, '非批量模式不应改动勾选态');
});

test('批量模式下单击内容意图为切换勾选', () => {
  const checked = new Set<string>();
  const intent = resolveContentClick({ batchMode: true, checked, id: 'a1' });
  assert.equal(intent, 'toggle-check');
});

test('toggleChecked 未勾选 -> 勾选,已勾选 -> 取消', () => {
  const checked = new Set<string>();
  toggleChecked(checked, 'a1');
  assert.equal(checked.has('a1'), true, '单击应勾选');
  toggleChecked(checked, 'a1');
  assert.equal(checked.has('a1'), false, '再次单击应取消勾选');
});

test('toggleChecked 不影响其他条目', () => {
  const checked = new Set<string>(['b2']);
  toggleChecked(checked, 'a1');
  assert.ok(checked.has('b2'), '其余勾选保持不变');
  assert.deepEqual([...checked], ['b2', 'a1']);
});
