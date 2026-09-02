// 官方收藏导入的面板文案与汇总（纯函数，便于 TDD）。
// 决策 2：官方无数据给出提示；决策 3：未登录给出先登录提示。

export const FAVORITE_IMPORT_HINTS: Record<string, string> = {
  SITE_UNSUPPORTED: '请在斗鱼直播间页面打开面板后重试',
  NO_ACTIVE_TAB: '未检测到活动标签页，请打开斗鱼直播间后重试',
  NOT_LOGGED_IN: '您还未登录斗鱼，请先在斗鱼官网登录后重试',
  SOURCE_UNAVAILABLE: '获取官方收藏失败，请稍后重试',
  DELIVERY_FAILED: '直播页未就绪，请刷新后重试',
  ADAPTER_DOWN: '直播页已改版，导入暂不可用，请等待插件更新',
  READ_FAILED: '本地数据读取失败，请重试',
  WRITE_FAILED: '写入失败，请重试',
};

/** 官方无任何收藏时的面板提示（决策 2） */
export const FAVORITE_EMPTY_HINT = '官方暂无收藏弹幕';

const HINT_FALLBACK = '导入失败，请稍后重试';

/** 错误码 → 导入提示文案（未知码走兜底） */
export function favoriteImportHint(code: string | undefined): string {
  return (code && FAVORITE_IMPORT_HINTS[code]) || HINT_FALLBACK;
}

export interface ImportSummary {
  added: number;
  skipped: number;
  invalid: number;
}

/** 导入结果 → 汇总文案（added 全部为 0 时提示无新增） */
export function favoriteImportSummary(sum: ImportSummary): string {
  const parts: string[] = [];
  if (sum.added > 0 || sum.skipped > 0)
    parts.push(`已导入 ${sum.added} 条，跳过 ${sum.skipped} 条`);
  if (sum.invalid > 0) parts.push(`${sum.invalid} 条内容无效`);
  if (parts.length === 0) return '官方收藏已全部存在，无需导入';
  return parts.join('，');
}
