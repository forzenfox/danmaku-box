import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planDedupe } from '../../src/background/dedupe.ts';
import { createDanmakuStore } from '../../src/background/danmaku-store.ts';
import { createStorageService } from '../../src/background/storage.service.ts';
import { DEFAULT_GROUP_ID, STORAGE_KEYS } from '../../src/shared/constants.ts';
import type { Danmaku } from '../../src/shared/types.ts';
import { MemoryArea } from '../helpers/memory-area.ts';

// M2 全库去重算法测试（技术方案 V0.4 7.4.3 / PRD V1.3 FR-03 全库去重规则）：
// 组内重复保留最早一条；跨组重复优先删除默认收藏；非默认分组间重复保留；空文本跳过。

function d(id: string, content: string, groupId: string, createdAt: string): Danmaku {
  return {
    id,
    content,
    group_id: groupId,
    platform: 'douyu',
    room: '1126960',
    created_at: createdAt,
  };
}

function remainingIds(list: Danmaku[], deleteIds: string[]): string[] {
  const removed = new Set(deleteIds);
  return list.filter((item) => !removed.has(item.id)).map((item) => item.id);
}

describe('planDedupe 全库去重', () => {
  it('同组重复保留创建时间最早的一条', () => {
    const list = [
      d('a', 'X', 'g1', '2026-03-01T00:00:00Z'),
      d('b', 'X', 'g1', '2026-01-01T00:00:00Z'),
      d('c', 'X', 'g1', '2026-02-01T00:00:00Z'),
    ];
    const plan = planDedupe(list);
    assert.deepEqual(remainingIds(list, plan.deleteIds), ['b']);
    assert.equal(plan.removed, 2);
    assert.equal(plan.withinGroupRemoved, 2);
    assert.equal(plan.defaultGroupRemoved, 0);
    assert.equal(plan.keptCrossGroupContents, 0);
    assert.equal(plan.scanned, 3);
  });

  it('创建时间相同时保留先出现的一条', () => {
    const list = [
      d('a', 'X', 'g1', '2026-01-01T00:00:00Z'),
      d('b', 'X', 'g1', '2026-01-01T00:00:00Z'),
    ];
    const plan = planDedupe(list);
    assert.deepEqual(remainingIds(list, plan.deleteIds), ['a']);
  });

  it('默认收藏与自定义分组重复时删除默认收藏条目', () => {
    const list = [
      d('a', 'X', DEFAULT_GROUP_ID, '2026-01-01T00:00:00Z'),
      d('b', 'X', 'g1', '2026-01-02T00:00:00Z'),
    ];
    const plan = planDedupe(list);
    assert.deepEqual(remainingIds(list, plan.deleteIds), ['b']);
    assert.equal(plan.removed, 1);
    assert.equal(plan.withinGroupRemoved, 0);
    assert.equal(plan.defaultGroupRemoved, 1);
  });

  it('默认收藏多条 + 自定义一条：删除全部默认收藏条目', () => {
    const list = [
      d('a', 'X', DEFAULT_GROUP_ID, '2026-01-01T00:00:00Z'),
      d('b', 'X', DEFAULT_GROUP_ID, '2026-01-02T00:00:00Z'),
      d('c', 'X', 'g1', '2026-01-03T00:00:00Z'),
    ];
    const plan = planDedupe(list);
    assert.deepEqual(remainingIds(list, plan.deleteIds), ['c']);
    assert.equal(plan.removed, 2);
    assert.equal(plan.withinGroupRemoved, 1);
    assert.equal(plan.defaultGroupRemoved, 1);
  });

  it('非默认分组之间重复不做处理', () => {
    const list = [
      d('a', 'X', 'g1', '2026-01-01T00:00:00Z'),
      d('b', 'X', 'g2', '2026-01-02T00:00:00Z'),
    ];
    const plan = planDedupe(list);
    assert.deepEqual(remainingIds(list, plan.deleteIds), ['a', 'b']);
    assert.equal(plan.removed, 0);
    assert.equal(plan.keptCrossGroupContents, 1);
  });

  it('一组多条 + 另一非默认组一条：仅清理组内重复', () => {
    const list = [
      d('a', 'X', 'g1', '2026-01-01T00:00:00Z'),
      d('b', 'X', 'g1', '2026-01-02T00:00:00Z'),
      d('c', 'X', 'g2', '2026-01-03T00:00:00Z'),
    ];
    const plan = planDedupe(list);
    assert.deepEqual(remainingIds(list, plan.deleteIds), ['a', 'c']);
    assert.equal(plan.withinGroupRemoved, 1);
    assert.equal(plan.keptCrossGroupContents, 1);
  });

  it('空文本条目不参与去重', () => {
    const list = [
      d('a', '', 'g1', '2026-01-01T00:00:00Z'),
      d('b', '   ', 'g1', '2026-01-02T00:00:00Z'),
    ];
    const plan = planDedupe(list);
    assert.deepEqual(remainingIds(list, plan.deleteIds), ['a', 'b']);
    assert.equal(plan.removed, 0);
  });

  it('仅去首尾空白后内容相同视为重复', () => {
    const list = [
      d('a', ' X ', 'g1', '2026-01-01T00:00:00Z'),
      d('b', 'X', 'g1', '2026-01-02T00:00:00Z'),
    ];
    const plan = planDedupe(list);
    assert.deepEqual(remainingIds(list, plan.deleteIds), ['a']);
  });

  it('无重复时零删除', () => {
    const list = [
      d('a', 'A', 'g1', '2026-01-01T00:00:00Z'),
      d('b', 'B', 'g2', '2026-01-02T00:00:00Z'),
    ];
    const plan = planDedupe(list);
    assert.equal(plan.removed, 0);
    assert.equal(plan.scanned, 2);
  });
});

describe('DanmakuStore.dedupeLibrary', () => {
  async function setup(list: Danmaku[]) {
    const area = new MemoryArea();
    const store = await createDanmakuStore(createStorageService(area));
    await store.createGroup('A');
    area.store.set(STORAGE_KEYS.danmaku, list);
    return { area, store };
  }

  it('dryRun 只返回报告，不写库', async () => {
    const list = [
      d('a', 'X', 'g1', '2026-01-01T00:00:00Z'),
      d('b', 'X', 'g1', '2026-01-02T00:00:00Z'),
    ];
    const { area, store } = await setup(list);
    const report = await store.dedupeLibrary({ dryRun: true });
    assert.equal(report.removed, 1);
    const raw = area.store.get(STORAGE_KEYS.danmaku) as Danmaku[];
    assert.equal(raw.length, 2);
  });

  it('dryRun=false 一次落库并返回报告', async () => {
    const list = [
      d('a', 'X', DEFAULT_GROUP_ID, '2026-01-01T00:00:00Z'),
      d('b', 'X', 'g1', '2026-01-02T00:00:00Z'),
    ];
    const { area, store } = await setup(list);
    const report = await store.dedupeLibrary();
    assert.deepEqual(report, {
      scanned: 2,
      removed: 1,
      withinGroupRemoved: 0,
      defaultGroupRemoved: 1,
      keptCrossGroupContents: 0,
    });
    const raw = area.store.get(STORAGE_KEYS.danmaku) as Danmaku[];
    assert.deepEqual(
      raw.map((item) => item.id),
      ['b'],
    );
  });

  it('无重复时不改变库内容', async () => {
    const list = [
      d('a', 'A', DEFAULT_GROUP_ID, '2026-01-01T00:00:00Z'),
      d('b', 'B', 'g1', '2026-01-02T00:00:00Z'),
    ];
    const { store } = await setup(list);
    const report = await store.dedupeLibrary();
    assert.equal(report.removed, 0);
    assert.equal((await store.listDanmaku()).total, 2);
  });
});
