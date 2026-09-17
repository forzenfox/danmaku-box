import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHoverSampler, HOVER_THROTTLE_MS } from '../../src/content/hover-sampler.ts';

// hover 采样器（专项 PRD FR-V01）：mousemove 节流记录指针下弹幕项 {el, uuid, x, y, t}，
// 供右键时刻的三级命中作兜底。仅记录、不校验时效（校验在消费时实时执行）。

describe('createHoverSampler', () => {
  const el = (uuid: string) => ({
    getAttribute: (k: string) => (k === 'data-comment-uuid' ? uuid : null),
  });

  it('findItem 未命中 → 不记录', () => {
    const s = createHoverSampler({ findItem: () => null, now: () => 0 });
    s.record(10, 10, el('u1') as never);
    assert.equal(s.latest(), null);
  });

  it('命中 → 记录元素/uuid/坐标/时间戳', () => {
    const item = el('u1');
    const s = createHoverSampler({ findItem: () => item as never, now: () => 123 });
    s.record(10, 20, item as never);
    assert.deepEqual(s.latest(), { el: item, uuid: 'u1', x: 10, y: 20, t: 123 });
  });

  it('节流：窗口内后续 move 不覆盖采样', () => {
    let t = 0;
    const s = createHoverSampler({ findItem: (e) => e as never, now: () => t });
    s.record(10, 10, el('a') as never);
    t = HOVER_THROTTLE_MS - 1;
    s.record(99, 99, el('b') as never);
    assert.equal(s.latest()?.uuid, 'a', '节流窗口内应保留首次采样');
    t = HOVER_THROTTLE_MS + 1;
    s.record(99, 99, el('b') as never);
    assert.equal(s.latest()?.uuid, 'b');
  });

  it('target 为 null（如移出窗口）→ 不记录', () => {
    const s = createHoverSampler({ findItem: (e) => e as never, now: () => 0 });
    s.record(1, 1, null);
    assert.equal(s.latest(), null);
  });
});
