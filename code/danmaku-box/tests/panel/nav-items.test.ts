// danmaku-box/tests/panel/nav-items.test.ts
// 契约测试：分组导航水平化（spec V3 §6）。
// 全部弹幕置顶、新建分组置尾、激活态、星标、占位（active/count 语义）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNavItems } from '../../src/panel/nav-items.ts';
import type { GroupWithCount } from '../../src/panel/nav-items.ts';
import { DEFAULT_GROUP_ID } from '../../src/shared/constants.ts';

function g(id: string, name: string, count: number, builtin = false): GroupWithCount {
  return { id, name, order: 0, builtin, count };
}

test('全部弹幕置顶且计数为各组之和', () => {
  const items = buildNavItems([g('a', '分组A', 2), g('b', '分组B', 3)], 'a');
  assert.equal(items[0]?.kind, 'all');
  if (items[0]?.kind !== 'all') return;
  assert.equal(items[0].name, '全部弹幕');
  assert.equal(items[0].count, 5);
});

test('selectedGroupId 为 null 时全部弹幕激活，否则分组激活', () => {
  const all = buildNavItems([g('a', '分组A', 1)], null);
  assert.equal(all[0]?.kind === 'all' && all[0]?.active, true);
  const pick = buildNavItems([g('a', '分组A', 1)], 'a');
  if (pick[0]?.kind !== 'all' || pick[1]?.kind !== 'group') return;
  assert.equal(pick[0].active, false);
  assert.equal(pick[1].active, true);
});

test('默认收藏组标记内置星标', () => {
  const items = buildNavItems([g(DEFAULT_GROUP_ID, '默认收藏', 4, true)], null);
  if (items[1]?.kind !== 'group') return;
  assert.equal(items[1].builtin, true);
});

test('新建分组 marker 恒在末尾', () => {
  const items = buildNavItems([g('a', '分组A', 1), g('b', '分组B', 2)], null);
  const last = items[items.length - 1];
  assert.equal(last?.kind, 'new');
});
