// 斗鱼官方收藏导入（新增模块；端点经 2026-09-02 实机核验）。
// 职责：解析官方 bulletscreen/query 响应、探测登录态、封装同源 fetch、处理面板消息。
// 边界：不触碰 DOM 与存储；纯函数与注入式依赖为主，便于 TDD。

import type { Result, FavoriteItem } from '../shared/types.ts';

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

/** 登录态探测：斗鱼登录后在 douyu.com 域种 acf_uid cookie（2026-09-02 实测）；
 *  游客态仅含 dy_did/acf_did 等，acf_uid 缺失即视为未登录。 */
export function probeDouyuLogin(cookie: string): boolean {
  return /(?:^|;)\s*acf_uid=/.test(cookie);
}

/** 端点：2026-09-02 实机核验（GET / cookie 鉴权 / 无签名 / 无分页一次全量） */
export const DOUYU_FAVORITE_URL =
  'https://www.douyu.com/japi/privateCustomApi/favorite/web/bulletscreen/query';

/** fetch 依赖最小切面（便于测试注入） */
export interface FetchLike {
  (input: string): Promise<{ ok: boolean; json(): Promise<unknown> }>;
}

/** 面板消息入口：探测登录 → 拉取 → 解析，统一归一为 Result 信封 */
export async function handleFavoriteRequest(deps: {
  cookie: string;
  fetchImpl: FetchLike;
}): Promise<Result<{ items: FavoriteItem[] }>> {
  if (!probeDouyuLogin(deps.cookie)) {
    return { ok: false, error: { code: 'NOT_LOGGED_IN', message: '请先在斗鱼官网登录' } };
  }
  try {
    const res = await deps.fetchImpl(DOUYU_FAVORITE_URL);
    if (!res.ok) {
      return { ok: false, error: { code: 'SOURCE_UNAVAILABLE', message: '官方收藏接口返回异常' } };
    }
    const items = parseFavoriteResponse(await res.json());
    return { ok: true, data: { items } };
  } catch {
    return { ok: false, error: { code: 'SOURCE_UNAVAILABLE', message: '获取官方收藏失败' } };
  }
}
