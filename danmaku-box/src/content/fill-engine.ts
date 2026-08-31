// M5 回填引擎 FillEngine（技术方案 V0.2 4.M5 / P4 里程碑）。
// 职责：接收 FILL_ACTION 并将弹幕文本写入目标站点输入框。
// 边界：不触发发送动作；仅作用于当前标签页；不修改输入框外部页面结构。

import type { FillResult, SiteAdapter } from './adapters/types.ts';

export interface FillActionPayload {
  content: string;
  mode: 'replace' | 'append';
}

export interface FillEngine {
  /** 执行回填；空文本直接拒绝（面板已置灰，此为运行时兜底） */
  handleFillAction(payload: FillActionPayload): FillResult;
}

export function createFillEngine(adapter: SiteAdapter): FillEngine {
  return {
    handleFillAction(payload: FillActionPayload): FillResult {
      if (!payload.content) {
        return { ok: false, truncated: false, reason: 'NO_INPUT' };
      }
      return adapter.fill(payload.content, payload.mode);
    },
  };
}
