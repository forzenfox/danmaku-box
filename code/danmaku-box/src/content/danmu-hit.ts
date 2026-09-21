// 三级命中判定（专项 PRD FR-V01）：飘屏为移动目标（约 120px/s [实测 2026-09-17]），
// 单靠事件目标或单次坐标查询都会落空。判定优先级：
// ① contextmenu 事件目标 → ② hover 采样缓存 → ③ 坐标叠层反查（elementsFromPoint）。
// ② 采用前执行三重校验（连接性/uuid 一致/时效+距离），防对象池复用误判；
// 校验在消费时刻实时执行（「用时实时判定」），采样器本身不做清理。

import type { HoverSample } from './hover-sampler.ts';

/** 采样有效窗口：右键时刻与采样时刻的最大间隔 */
export const SAMPLE_WINDOW_MS = 300;
/** 采样坐标与右键坐标的容差（px）[工程默认，随走查微调] */
export const MAX_DISTANCE_PX = 40;

export interface HitDeps {
  findItem: (target: Element) => Element | null;
  now: () => number;
  elementsFromPoint: (x: number, y: number) => Element[];
}

export interface HitEvent {
  target: EventTarget | null;
  clientX: number;
  clientY: number;
}

function sampleValid(sample: HoverSample, deps: HitDeps, e: HitEvent): boolean {
  if (!sample.el.isConnected) return false;
  if (sample.el.getAttribute('data-comment-uuid') !== sample.uuid) return false;
  if (deps.now() - sample.t > SAMPLE_WINDOW_MS) return false;
  const dx = sample.x - e.clientX;
  const dy = sample.y - e.clientY;
  return Math.hypot(dx, dy) <= MAX_DISTANCE_PX;
}

export function resolveHit(
  deps: HitDeps,
  e: HitEvent,
  sample: HoverSample | null,
): Element | null {
  // ① 事件目标（静止/慢速弹幕最快路径）；鸭子类型判定可查询元素（node 测试环境无全局 Element）
  const t = e.target as Element | null;
  if (t && typeof t.closest === 'function') {
    const hit = deps.findItem(t);
    if (hit) return hit;
  }
  // ② hover 采样（兜底 mousedown→contextmenu 时序内的位移）
  if (sample && sampleValid(sample, deps, e)) return sample.el;
  // ③ 坐标叠层反查（含锁屏工具条遮挡场景）
  for (const el of deps.elementsFromPoint(e.clientX, e.clientY)) {
    const hit = deps.findItem(el);
    if (hit) return hit;
  }
  return null;
}
