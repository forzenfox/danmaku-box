// danmaku-box/src/panel/empty-state.ts
// 空态（整库为空）引导区文案与步骤数据（V2 重构）。
// 职责：集中维护空库场景的标题/副标题/CTA 文案与三步引导数据。
// 边界：纯数据，无 DOM；契约见 empty-state.test.ts。

export interface EmptyStep {
  /** 数字徽标文本（'1' '2' '3'） */
  num: string;
  /** 步骤标题 */
  label: string;
  /** 步骤描述 */
  desc: string;
}

export const EMPTY_TITLE = '还没有收藏任何弹幕';
export const EMPTY_SUBTITLE = '收藏喜欢的弹幕，在直播间一键回填';
export const CTA_PRIMARY = '手动添加第一条弹幕';
export const CTA_SECONDARY = '一键导入斗鱼官方收藏';
export const CTA_SECONDARY_BADGE = '仅斗鱼';

export const EMPTY_STEPS: readonly EmptyStep[] = [
  {
    num: '1',
    label: '直播间右键弹幕',
    desc: '在斗鱼/抖音直播间右键弹幕，快速加入收藏',
  },
  {
    num: '2',
    label: '新建分组，按用途归类',
    desc: '点击上方＋新建分组，自定义「梗」「素材」等分类',
  },
  {
    num: '3',
    label: '点击弹幕，一键回填',
    desc: '在直播间输入框聚焦时，单击收藏条目即可回填',
  },
];
