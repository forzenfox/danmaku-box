// danmaku-box/tests/panel/list-interaction.test.ts
// 契约测试：弹幕行单击交互语义（走查反馈 V2.2 修正）。
// 批量模式下单击内容 = 切换勾选（而非回填）；非批量模式 = 回填；
// 行内操作按钮集合（测试反馈 2026-09-21：恢复行内删除；编辑态叉叉=保存退出）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveContentClick,
  resolveInlineActions,
  toggleChecked,
} from '../../src/panel/list-interaction.ts';

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

// ── 行内操作按钮集合决策 ─────────────────────────
test('批量模式下行内无操作按钮（操作并入顶部批量栏）', () => {
  assert.deepEqual(resolveInlineActions({ batchMode: true, editing: false }), []);
  assert.deepEqual(resolveInlineActions({ batchMode: true, editing: true }), []);
});

test('编辑态行内仅「完成」按钮（保存并退出编辑）', () => {
  assert.deepEqual(resolveInlineActions({ batchMode: false, editing: true }), ['done']);
});

test('常态行内操作 = 编辑 + 删除（2026-09-21 测试反馈恢复行内删除）', () => {
  assert.deepEqual(resolveInlineActions({ batchMode: false, editing: false }), ['edit', 'delete']);
});
