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

/** 行内操作按钮类型：edit=编辑；delete=删除；done=完成编辑（保存并退出） */
export type InlineAction = 'edit' | 'delete' | 'done';

export interface InlineActionsParams {
  batchMode: boolean;
  editing: boolean;
}

/**
 * 行内操作按钮集合决策：
 * - 批量模式 → 无行内操作（移动/删除并入顶部批量栏）
 * - 编辑态 → 仅「完成」（叉叉=保存并退出；Esc 仍为不保存退出）
 * - 常态 → 编辑 + 删除（2026-09-21 测试反馈：恢复行内删除入口）
 */
export function resolveInlineActions(params: InlineActionsParams): InlineAction[] {
  if (params.batchMode) return [];
  if (params.editing) return ['done'];
  return ['edit', 'delete'];
}
