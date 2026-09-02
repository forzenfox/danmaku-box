// 共享类型定义（技术方案 5.2 消息协议 / 6.1 实体模型）。
// 消息名与存储 key 的稳定值见 constants.ts，本文件只定义结构。

/** 弹幕实体（技术方案 6.1） */
export interface Danmaku {
  id: string;
  /** 弹幕文本，可为空串（空文本弹幕条目） */
  content: string;
  group_id: string;
  platform: 'douyu' | 'douyin' | 'manual';
  room: string;
  created_at: string;
}

/** 分组实体（技术方案 6.1，last_used_at 为右键菜单最近使用排序依据） */
export interface Group {
  id: string;
  name: string;
  order: number;
  builtin: boolean;
  last_used_at?: string;
}

/** 设置项 key（技术方案 6.2 枚举集合） */
export type SettingKey =
  'fillMode' | 'fillAfterBehavior' | 'chatContextMenuEnabled' | 'last_selected_group';

export type FillMode = 'replace' | 'append';
export type FillAfterBehavior = 'focus_only' | 'focus_and_highlight';

/** 消息信封（技术方案 5.2 统一信封） */
export interface MessageEnvelope<T = unknown> {
  type: string;
  payload: T;
}

/** 统一返回：成功携带 data，失败携带错误码 */
export interface Result<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

/** CS_READY 上报负载 */
export interface CsReadyPayload {
  type: 'CS_READY';
  site: 'douyu' | 'douyin';
  status: string;
}

/** 斗鱼官方云端收藏条目（japi/privateCustomApi/favorite/web/bulletscreen/query 响应 data.list 项） */
export interface FavoriteItem {
  content: string;
  type?: number;
  id?: number;
}
