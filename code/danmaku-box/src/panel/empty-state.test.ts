// danmaku-box/src/panel/empty-state.test.ts
// TDD（红灯）：契约测试 —— 空态文案与步骤数据必须完整、有序、长度可控。
// 对象：src/panel/empty-state.ts（尚不存在，红 → 绿）。

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CTA_PRIMARY,
  CTA_SECONDARY,
  CTA_SECONDARY_BADGE,
  EMPTY_STEPS,
  EMPTY_SUBTITLE,
  EMPTY_TITLE,
} from './empty-state.ts';

test('空态步骤恰为 3 步且序号依次为 1/2/3', () => {
  assert.equal(EMPTY_STEPS.length, 3);
  assert.deepEqual(
    EMPTY_STEPS.map((s) => s.num),
    ['1', '2', '3'],
  );
});

test('每个步骤的 num/label/desc 均非空且长度受限', () => {
  for (const step of EMPTY_STEPS) {
    assert.ok(step.num.trim().length > 0, `num 非空（${step.label}）`);
    assert.ok(
      step.label.trim().length >= 3 && step.label.trim().length <= 16,
      `label 3-16 字（${step.label}）`,
    );
    assert.ok(
      step.desc.trim().length >= 8 && step.desc.trim().length <= 40,
      `desc 8-40 字（${step.label}）`,
    );
  }
});

test('标题/副标题与 CTA 文案非空且长度合理', () => {
  assert.ok(EMPTY_TITLE.trim().length > 0);
  assert.ok(EMPTY_SUBTITLE.trim().length > 0);
  assert.ok(CTA_PRIMARY.trim().length > 0);
  assert.ok(CTA_SECONDARY.trim().length > 0);
  assert.ok(CTA_SECONDARY_BADGE.trim().length > 0);
  assert.ok(EMPTY_SUBTITLE.length <= 30, '副标题不宜过长');
  assert.ok(CTA_PRIMARY.length <= 20, '主按钮文案不宜过长');
  assert.ok(CTA_SECONDARY.length <= 20, '次按钮文案不宜过长');
});

test('步骤描述覆盖三个关键动作：右键收藏 / 新建分组 / 点击回填', () => {
  const joined = EMPTY_STEPS.map((s) => `${s.label}${s.desc}`).join(' ');
  assert.match(joined, /收藏/);
  assert.match(joined, /分组/);
  assert.match(joined, /回填/);
});
