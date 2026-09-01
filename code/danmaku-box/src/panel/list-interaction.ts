// danmaku-box/src/panel/list-interaction.ts
// 弹幕列表点击交互逻辑（纯函数，可测试）。

/** 点击意图识别结果 */
export type ContentClickIntent = 'fill' | 'toggle-check';

/** 参数 */
export interface ResolveClickParams {
  batchMode: boolean;
  checked: Set<string>;
  id: string;
}

/**
 * 根据当前状态识别单击内容的意图：
 * - 非批量模式 → 回填
 * - 批量模式 → 切换勾选
 */
export function resolveContentClick(params: ResolveClickParams): ContentClickIntent {
  if (params.batchMode) {
    return 'toggle-check';
  }
  return 'fill';
}

/** 切换勾选（in-place） */
export function toggleChecked(checked: Set<string>, id: string): void {
  if (checked.has(id)) {
    checked.delete(id);
  } else {
    checked.add(id);
  }
}
