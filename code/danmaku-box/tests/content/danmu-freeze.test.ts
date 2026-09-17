import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFreezeManager } from '../../src/content/danmu-freeze.ts';

// 冻结目标管理（专项 PRD FR-V03）：同一时刻仅一个活动冻结；
// 菜单关闭必恢复（C7）；连续右键先解旧再冻新，无孤儿冻结。

function fakeAdapter() {
  const calls: string[] = [];
  return {
    calls,
    pauseDanmu(target?: unknown) {
      calls.push(`pause:${(target as { id?: string })?.id}`);
    },
    resumeDanmu(target?: unknown) {
      calls.push(`resume:${(target as { id?: string })?.id}`);
    },
  };
}

describe('createFreezeManager', () => {
  it('C7：freeze 后 release → 对同一目标调用恢复', () => {
    const a = fakeAdapter();
    const m = createFreezeManager(a);
    const item = { id: 'i1' };
    m.freeze(item as never);
    m.release();
    assert.deepEqual(a.calls, ['pause:i1', 'resume:i1']);
  });

  it('连续右键不同弹幕 → 先恢复旧目标再冻结新目标', () => {
    const a = fakeAdapter();
    const m = createFreezeManager(a);
    m.freeze({ id: 'i1' } as never);
    m.freeze({ id: 'i2' } as never);
    assert.deepEqual(a.calls, ['pause:i1', 'resume:i1', 'pause:i2']);
  });

  it('重复 release / 未 freeze 直接 release → 幂等无副作用', () => {
    const a = fakeAdapter();
    const m = createFreezeManager(a);
    m.release();
    m.freeze({ id: 'i1' } as never);
    m.release();
    m.release();
    assert.deepEqual(a.calls, ['pause:i1', 'resume:i1']);
  });

  it('同一目标重复 freeze → 只冻结一次', () => {
    const a = fakeAdapter();
    const m = createFreezeManager(a);
    const item = { id: 'i1' };
    m.freeze(item as never);
    m.freeze(item as never);
    assert.deepEqual(a.calls, ['pause:i1']);
  });
});
