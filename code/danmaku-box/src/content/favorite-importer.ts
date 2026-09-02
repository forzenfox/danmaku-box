// 斗鱼官方收藏导入（新增模块；端点经 2026-09-02 实机核验）。
// 职责：解析官方 bulletscreen/query 响应、探测登录态、封装同源 fetch、处理面板消息。
// 边界：不触碰 DOM 与存储；纯函数与注入式依赖为主，便于 TDD。

import type { FavoriteItem } from '../shared/types.ts';

/**
 * 解析官方收藏响应 `{ data: { list: [{content, type, id}] } }`。
 * 结构异常（data/list 缺失）视为空收藏，返回 []；入参非对象抛 TypeError。
 */
export function parseFavoriteResponse(raw: unknown): FavoriteItem[] {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError('favorite response must be an object');
  }
  const data = (raw as Record<string, unknown>).data;
  if (typeof data !== 'object' || data === null) return [];
  const list = (data as Record<string, unknown>).list;
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const o = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    return {
      content: typeof o.content === 'string' ? o.content : '',
      type: typeof o.type === 'number' ? o.type : undefined,
      id: typeof o.id === 'number' ? o.id : undefined,
    };
  });
}

/** 登录态探测：斗鱼登录后在 douyu.com 域种 acf_uid cookie（2026-09-02 实测）。 */
export function probeDouyuLogin(cookie: string): boolean {
  return /(?:^|;)\s*acf_uid=/.test(cookie);
}