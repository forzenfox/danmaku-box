// 回填文本构建（PRD FR-04：替换/追加模式、超限截断；纯函数便于测试）。
// 追加模式以空格衔接已有内容；任何模式产物均截断至平台上限。

export interface BuildFillInput {
  /** 输入框当前内容 */
  current: string;
  /** 待回填的弹幕文本 */
  incoming: string;
  mode: 'replace' | 'append';
  /** 平台字数上限（斗鱼实测 50） */
  maxLength: number;
}

export interface BuildFillResult {
  text: string;
  truncated: boolean;
}

export function buildFillText({
  current,
  incoming,
  mode,
  maxLength,
}: BuildFillInput): BuildFillResult {
  const joined = mode === 'append' && current !== '' ? `${current} ${incoming}` : incoming;
  return {
    text: joined.slice(0, maxLength),
    truncated: joined.length > maxLength,
  };
}
