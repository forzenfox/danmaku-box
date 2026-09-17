// hover 采样器（专项 PRD FR-V01）：飘屏弹幕约 120px/s 横移 [实测 2026-09-17]，
// mousedown→contextmenu 时序内目标已位移，需在右键前持续记录指针下的弹幕项。
// 本模块只采样不判定：时效/身份校验由 danmu-hit 在消费时刻实时执行
// （「用时实时判定」原则，避免定时清理与竞态）。

export const HOVER_THROTTLE_MS = 50;

export interface HoverSample {
  el: Element;
  uuid: string | null;
  x: number;
  y: number;
  t: number;
}

export interface HoverSamplerDeps {
  findItem: (target: Element) => Element | null;
  now: () => number;
}

export interface HoverSampler {
  record(x: number, y: number, target: Element | null): void;
  latest(): HoverSample | null;
}

export function createHoverSampler(deps: HoverSamplerDeps): HoverSampler {
  let lastT = -Infinity;
  let sample: HoverSample | null = null;

  return {
    record(x, y, target) {
      if (target === null) return;
      const t = deps.now();
      if (t - lastT < HOVER_THROTTLE_MS) return;
      lastT = t;
      const item = deps.findItem(target);
      if (!item) return;
      sample = { el: item, uuid: item.getAttribute('data-comment-uuid'), x, y, t };
    },
    latest: () => sample,
  };
}
