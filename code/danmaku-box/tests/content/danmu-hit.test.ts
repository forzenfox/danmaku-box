import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveHit,
  SAMPLE_WINDOW_MS,
  MAX_DISTANCE_PX,
  type HitDeps,
} from '../../src/content/danmu-hit.ts';
import type { HoverSample } from '../../src/content/hover-sampler.ts';

// 三级命中（专项 PRD FR-V01）：① 事件目标 ② hover 采样（三重校验后采用）
// ③ 坐标叠层反查。全部未命中返回 null（不拦截原生行为）。

const item = (uuid: string, connected = true) => ({
  isConnected: connected,
  getAttribute: (k: string) => (k === 'data-comment-uuid' ? uuid : null),
  // 真实弹幕项有 closest；此处返回 null 即可（findItem 桩按 className 判定，不依赖 closest 返回值，
  // closest 的存在仅用于通过 resolveHit 第①级的「是否为可查询元素」鸭子判定门）
  closest: () => null,
});

function evt(target: unknown, x = 500, y = 300) {
  return { target, clientX: x, clientY: y };
}

const deps = (overrides: Partial<HitDeps> = {}): HitDeps => ({
  findItem: (t) => ((t as { className?: string })?.className?.includes('danmuItem') ? (t as never) : null),
  now: () => 1000,
  elementsFromPoint: () => [],
  ...overrides,
});

describe('resolveHit 三级命中', () => {
  it('① 事件目标命中 → 直接采用，忽略采样', () => {
    const hit = item('u1');
    (hit as { className?: string }).className = 'danmuItem-x';
    const stale: HoverSample = { el: item('other') as never, uuid: 'other', x: 0, y: 0, t: 999 };
    assert.equal(resolveHit(deps(), evt(hit) as never, stale), hit);
  });

  it('C6：目标未命中但采样有效（uuid 一致/新鲜/近距）→ 采用采样元素', () => {
    const cached = item('u9');
    const sample: HoverSample = { el: cached as never, uuid: 'u9', x: 505, y: 303, t: 900 };
    assert.equal(resolveHit(deps(), evt({ className: 'video', closest: () => null }) as never, sample), cached);
  });

  it('C5：采样超时（>300ms）→ 不采用', () => {
    const cached = item('u9');
    const sample: HoverSample = { el: cached as never, uuid: 'u9', x: 500, y: 300, t: 1000 - SAMPLE_WINDOW_MS - 1 };
    assert.equal(resolveHit(deps(), evt({ className: 'video', closest: () => null }, 600, 300) as never, sample), null);
  });

  it('C5：uuid 变更（对象池复用）→ 不采用', () => {
    const cached = item('reused');
    const sample: HoverSample = { el: cached as never, uuid: 'original', x: 500, y: 300, t: 990 };
    assert.equal(resolveHit(deps(), evt({ className: 'video', closest: () => null }, 600, 300) as never, sample), null);
  });

  it('C5：元素脱离文档 → 不采用', () => {
    const cached = item('u9', false);
    const sample: HoverSample = { el: cached as never, uuid: 'u9', x: 500, y: 300, t: 990 };
    assert.equal(resolveHit(deps(), evt({ className: 'video', closest: () => null }, 600, 300) as never, sample), null);
  });

  it('C5：指针位移超阈值（>40px）→ 不采用采样', () => {
    const cached = item('u9');
    const sample: HoverSample = { el: cached as never, uuid: 'u9', x: 500, y: 300, t: 990 };
    assert.equal(
      resolveHit(deps(), evt({ className: 'video', closest: () => null }, 500 + MAX_DISTANCE_PX + 1, 300) as never, sample),
      null,
    );
  });

  it('③ 坐标叠层反查：前两级落空时按命中链顺序找弹幕项', () => {
    const deep = item('u3');
    (deep as { className?: string }).className = 'danmuItem-deep';
    const d = deps({ elementsFromPoint: () => [{ className: 'video', closest: () => null } as never, deep as never] });
    assert.equal(resolveHit(d, evt({ className: 'video', closest: () => null }) as never, null), deep);
  });

  it('三级全空 → null（不拦截）', () => {
    assert.equal(resolveHit(deps(), evt({ className: 'video', closest: () => null }) as never, null), null);
  });
});
