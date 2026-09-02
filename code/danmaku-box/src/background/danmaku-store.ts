// M2 弹幕库核心 DanmakuStore（技术方案 V0.2 4.M2 / P2 里程碑）。
// 职责：维护弹幕、分组、查询三类核心领域操作。
// 边界：不接触 DOM；不负责备份文件 I/O；不触发回填。
// 部署于 service worker，作为存储唯一入口；UI 与页面侧只经消息调用。

import {
  DANMAKU_MAX_LENGTH,
  DEFAULT_GROUP_ID,
  ERROR_CODES,
  GROUP_LIMIT,
  GROUP_NAME_MAX_LENGTH,
  LIST_PAGE_SIZE,
  STORAGE_KEYS,
} from '../shared/constants.ts';
import type { Danmaku, Group } from '../shared/types.ts';
import type { StorageService } from './storage.service.ts';
import { mergeLibrary } from './backup.ts';
import { StoreError } from './store-error.ts';

export type SortKey = 'latest' | 'oldest' | 'length';

export interface ListQuery {
  /** 目标分组；null/undefined 表示「全部弹幕」（全库） */
  groupId?: string | null;
  /** 搜索关键词（归一化后不区分大小写 includes） */
  keyword?: string;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface ListResult {
  items: Danmaku[];
  total: number;
  hasMore: boolean;
}

/** 右键菜单分组项（GET_MENU_CONTEXT 返回，技术方案 5.2） */
export interface MenuGroup {
  id: string;
  name: string;
  order: number;
  last_used_at?: string;
  builtin: boolean;
  hasThisContent: boolean;
}

export interface CollectInput {
  content: string;
  groupId: string;
  platform: 'douyu' | 'douyin';
  room: string;
}

export interface DanmakuStore {
  listDanmaku(query?: ListQuery): Promise<ListResult>;
  getGroups(): Promise<Group[]>;
  getGroupsWithCounts(): Promise<Array<Group & { count: number }>>;
  /** 导出原始库数据（备份用） */
  exportLibrary(): Promise<{ groups: Group[]; danmaku: Danmaku[] }>;
  /** 导入：merge=同名分组合并+组内去重；overwrite=整体替换（默认分组始终保障存在） */
  importLibrary(
    data: { groups: Group[]; danmaku: Danmaku[] },
    strategy: 'merge' | 'overwrite',
  ): Promise<{ added: number; skipped: number; mergedGroups: number }>;
  createGroup(name: string): Promise<Group>;
  renameGroup(id: string, name: string): Promise<Group>;
  deleteGroup(id: string): Promise<{ movedCount: number }>;
  reorderGroups(orderedIds: string[]): Promise<void>;
  collectDanmaku(input: CollectInput): Promise<{ id: string; duplicate: boolean }>;
  createDanmaku(input: {
    content: string;
    groupId: string;
  }): Promise<{ id: string; duplicate: boolean }>;
  updateDanmaku(id: string, content: string): Promise<void>;
  deleteDanmaku(ids: string[]): Promise<{ deleted: number }>;
  moveDanmaku(ids: string[], targetGroupId: string): Promise<{ moved: number }>;
  /** 批量导入收藏弹幕：组内去重、空/超长计 invalid 不落库；一次落盘（不回写分组 last_used_at） */
  importFavoriteDanmaku(
    entries: Array<{ content: string }>,
    targetGroupId: string,
  ): Promise<{ added: number; skipped: number; invalid: number }>;
  getMenuContext(content: string): Promise<MenuGroup[]>;
}

/** 去重归一化：仅去首尾空白（全角/半角不折叠，技术方案 7.4.1） */
function normalize(s: string): string {
  return s.trim();
}

/** 全局唯一 id：时间戳 + 随机后缀（技术方案 6.2） */
function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function createDanmakuStore(storage: StorageService): Promise<DanmakuStore> {
  async function loadGroups(): Promise<Group[]> {
    return (await storage.read<Group[]>(STORAGE_KEYS.groups)) ?? [];
  }
  async function saveGroups(groups: Group[]): Promise<void> {
    await storage.write(STORAGE_KEYS.groups, groups);
  }
  async function loadDanmaku(): Promise<Danmaku[]> {
    return (await storage.read<Danmaku[]>(STORAGE_KEYS.danmaku)) ?? [];
  }
  async function saveDanmaku(list: Danmaku[]): Promise<void> {
    await storage.write(STORAGE_KEYS.danmaku, list);
  }

  function validateGroupName(raw: string): string {
    const name = raw.trim();
    if (name.length < 1 || name.length > GROUP_NAME_MAX_LENGTH) {
      throw new StoreError(ERROR_CODES.NAME_INVALID, `分组名须为 1-${GROUP_NAME_MAX_LENGTH} 字符`);
    }
    return name;
  }

  /** 去重判定：内容 + 分组双重维度（技术方案 7.4.1） */
  function findDuplicate(list: Danmaku[], content: string, groupId: string): Danmaku | undefined {
    const n = normalize(content);
    return list.find((item) => item.group_id === groupId && normalize(item.content) === n);
  }

  // 初始化（幂等）：确保内置默认分组存在且 builtin 标记正确。
  // builtin 标记是 getMenuContext 定位内置分组的唯一依据；历史/异常数据可能缺失
  // 该字段（仅 id 存在），若不修复会导致右键菜单 READ_FAILED（2026-08 实测）。
  const existing = await loadGroups();
  const builtinIndex = existing.findIndex((g) => g.id === DEFAULT_GROUP_ID);
  if (builtinIndex === -1) {
    const builtin: Group = { id: DEFAULT_GROUP_ID, name: '默认收藏', order: 0, builtin: true };
    await saveGroups([builtin, ...existing.map((g, i) => ({ ...g, order: i + 1 }))]);
  } else {
    const builtin = existing[builtinIndex] as Group;
    if (!builtin.builtin) {
      const repaired: Group = { ...builtin, builtin: true, name: builtin.name || '默认收藏' };
      existing[builtinIndex] = repaired;
      await saveGroups(existing);
    }
  }

  async function requireGroupExists(groupId: string): Promise<void> {
    const groups = await loadGroups();
    if (!groups.some((g) => g.id === groupId)) {
      throw new StoreError(ERROR_CODES.NOT_FOUND, '目标分组不存在');
    }
  }

  return {
    async listDanmaku(query = {}): Promise<ListResult> {
      const {
        groupId = null,
        keyword,
        sort = 'latest',
        page = 1,
        pageSize = LIST_PAGE_SIZE,
      } = query;
      let items = await loadDanmaku();
      if (groupId) items = items.filter((item) => item.group_id === groupId);
      if (keyword && keyword.trim() !== '') {
        const kw = keyword.trim().toLowerCase();
        items = items.filter((item) => item.content.toLowerCase().includes(kw));
      }
      const byTimeAsc = (a: Danmaku, b: Danmaku) =>
        a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
      if (sort === 'oldest') items.sort(byTimeAsc);
      else if (sort === 'length') items.sort((a, b) => b.content.length - a.content.length);
      else items.sort((a, b) => -byTimeAsc(a, b));
      const total = items.length;
      const start = (page - 1) * pageSize;
      return {
        items: items.slice(start, start + pageSize),
        total,
        hasMore: start + pageSize < total,
      };
    },

    async getGroups(): Promise<Group[]> {
      return (await loadGroups()).sort((a, b) => a.order - b.order);
    },

    async getGroupsWithCounts(): Promise<Array<Group & { count: number }>> {
      const [groups, list] = await Promise.all([loadGroups(), loadDanmaku()]);
      const counts = new Map<string, number>();
      for (const item of list) {
        counts.set(item.group_id, (counts.get(item.group_id) ?? 0) + 1);
      }
      return groups
        .sort((a, b) => a.order - b.order)
        .map((g) => ({ ...g, count: counts.get(g.id) ?? 0 }));
    },

    async createGroup(rawName: string): Promise<Group> {
      const name = validateGroupName(rawName);
      const groups = await loadGroups();
      if (groups.some((g) => g.name === name)) {
        throw new StoreError(ERROR_CODES.NAME_EXISTS, '分组名已存在');
      }
      if (groups.length >= GROUP_LIMIT) {
        throw new StoreError(ERROR_CODES.GROUP_LIMIT, `分组数量已达上限 ${GROUP_LIMIT}`);
      }
      const group: Group = {
        id: newId('g'),
        name,
        order: groups.reduce((max, g) => Math.max(max, g.order), 0) + 1,
        builtin: false,
      };
      await saveGroups([...groups, group]);
      return group;
    },

    async renameGroup(id: string, rawName: string): Promise<Group> {
      const name = validateGroupName(rawName);
      const groups = await loadGroups();
      const target = groups.find((g) => g.id === id);
      if (!target) throw new StoreError(ERROR_CODES.NOT_FOUND, '分组不存在');
      if (target.builtin) throw new StoreError(ERROR_CODES.BUILTIN_GROUP, '内置分组不可重命名');
      if (groups.some((g) => g.name === name && g.id !== id)) {
        throw new StoreError(ERROR_CODES.NAME_EXISTS, '分组名已存在');
      }
      const updated: Group = { ...target, name };
      await saveGroups(groups.map((g) => (g.id === id ? updated : g)));
      return updated;
    },

    async deleteGroup(id: string): Promise<{ movedCount: number }> {
      const groups = await loadGroups();
      const target = groups.find((g) => g.id === id);
      if (!target) throw new StoreError(ERROR_CODES.NOT_FOUND, '分组不存在');
      if (target.builtin) throw new StoreError(ERROR_CODES.BUILTIN_GROUP, '内置分组不可删除');
      const list = await loadDanmaku();
      let movedCount = 0;
      const moved = list.map((item) => {
        if (item.group_id === id) {
          movedCount += 1;
          return { ...item, group_id: DEFAULT_GROUP_ID };
        }
        return item;
      });
      await saveDanmaku(moved);
      await saveGroups(groups.filter((g) => g.id !== id));
      return { movedCount };
    },

    async reorderGroups(orderedIds: string[]): Promise<void> {
      const groups = await loadGroups();
      const known = new Set(groups.map((g) => g.id));
      if (orderedIds.some((id) => !known.has(id))) {
        throw new StoreError(ERROR_CODES.NOT_FOUND, '排序清单包含未知分组');
      }
      const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
      await saveGroups(groups.map((g) => ({ ...g, order: orderMap.get(g.id) ?? g.order })));
    },

    async collectDanmaku(input: CollectInput): Promise<{ id: string; duplicate: boolean }> {
      const { content, groupId, platform, room } = input;
      if (content.length > DANMAKU_MAX_LENGTH) {
        throw new StoreError(
          ERROR_CODES.INVALID_CONTENT,
          `弹幕内容超过 ${DANMAKU_MAX_LENGTH} 字上限`,
        );
      }
      await requireGroupExists(groupId);
      const list = await loadDanmaku();
      const dup = findDuplicate(list, content, groupId);
      if (dup) return { id: dup.id, duplicate: true };
      const record: Danmaku = {
        id: newId('d'),
        content,
        group_id: groupId,
        platform,
        room,
        created_at: new Date().toISOString(),
      };
      await saveDanmaku([...list, record]);
      // 更新分组最近使用时间（右键菜单「最近使用」排序依据，FR-01）
      const groups = await loadGroups();
      await saveGroups(
        groups.map((g) => (g.id === groupId ? { ...g, last_used_at: record.created_at } : g)),
      );
      return { id: record.id, duplicate: false };
    },

    async importFavoriteDanmaku(
      entries: Array<{ content: string }>,
      targetGroupId: string,
    ): Promise<{ added: number; skipped: number; invalid: number }> {
      // 本接口当前仅用于斗鱼官方收藏迁移，故 platform 固定为 douyu；
      // 与 createDanmaku 抛错语义不同：批量导入对空/超长计 invalid 继续，不中断整批。
      await requireGroupExists(targetGroupId);
      const list = await loadDanmaku();
      const seen = new Set(
        list.filter((d) => d.group_id === targetGroupId).map((d) => normalize(d.content)),
      );
      let added = 0;
      let skipped = 0;
      let invalid = 0;
      const batch: Danmaku[] = [];
      for (const raw of entries) {
        const content = String(raw.content ?? '').trim();
        if (content.length < 1 || content.length > DANMAKU_MAX_LENGTH) {
          invalid += 1;
          continue;
        }
        if (seen.has(normalize(content))) {
          skipped += 1;
          continue;
        }
        seen.add(normalize(content));
        batch.push({
          id: newId('d'),
          content,
          group_id: targetGroupId,
          platform: 'douyu',
          room: '',
          created_at: new Date().toISOString(),
        });
        added += 1;
      }
      if (batch.length > 0) await saveDanmaku([...list, ...batch]);
      return { added, skipped, invalid };
    },

    async createDanmaku(input: {
      content: string;
      groupId: string;
    }): Promise<{ id: string; duplicate: boolean }> {
      const content = input.content.trim();
      if (content.length < 1 || content.length > DANMAKU_MAX_LENGTH) {
        throw new StoreError(
          ERROR_CODES.INVALID_CONTENT,
          `弹幕内容须为 1-${DANMAKU_MAX_LENGTH} 字`,
        );
      }
      await requireGroupExists(input.groupId);
      const list = await loadDanmaku();
      const dup = findDuplicate(list, content, input.groupId);
      if (dup) return { id: dup.id, duplicate: true };
      // 手动新建为站外文案：无站点来源（platform 记为 manual，room 留空）
      const record: Danmaku = {
        id: newId('d'),
        content,
        group_id: input.groupId,
        platform: 'manual',
        room: '',
        created_at: new Date().toISOString(),
      };
      await saveDanmaku([...list, record]);
      return { id: record.id, duplicate: false };
    },

    async updateDanmaku(id: string, rawContent: string): Promise<void> {
      const content = rawContent.trim();
      if (content.length < 1 || content.length > DANMAKU_MAX_LENGTH) {
        throw new StoreError(
          ERROR_CODES.INVALID_CONTENT,
          `弹幕内容须为 1-${DANMAKU_MAX_LENGTH} 字`,
        );
      }
      const list = await loadDanmaku();
      if (!list.some((item) => item.id === id)) {
        throw new StoreError(ERROR_CODES.NOT_FOUND, '弹幕不存在');
      }
      await saveDanmaku(list.map((item) => (item.id === id ? { ...item, content } : item)));
    },

    async deleteDanmaku(ids: string[]): Promise<{ deleted: number }> {
      const list = await loadDanmaku();
      const idSet = new Set(ids);
      const remaining = list.filter((item) => !idSet.has(item.id));
      const deleted = list.length - remaining.length;
      if (deleted === 0) throw new StoreError(ERROR_CODES.NOT_FOUND, '未找到可删除的弹幕');
      await saveDanmaku(remaining);
      return { deleted };
    },

    async moveDanmaku(ids: string[], targetGroupId: string): Promise<{ moved: number }> {
      await requireGroupExists(targetGroupId);
      const list = await loadDanmaku();
      const idSet = new Set(ids);
      let moved = 0;
      const next = list.map((item) => {
        if (idSet.has(item.id) && item.group_id !== targetGroupId) {
          moved += 1;
          return { ...item, group_id: targetGroupId };
        }
        return item;
      });
      await saveDanmaku(next);
      return { moved };
    },

    async exportLibrary(): Promise<{ groups: Group[]; danmaku: Danmaku[] }> {
      const [groups, danmaku] = await Promise.all([loadGroups(), loadDanmaku()]);
      return { groups, danmaku };
    },

    async importLibrary(
      data: { groups: Group[]; danmaku: Danmaku[] },
      strategy: 'merge' | 'overwrite',
    ): Promise<{ added: number; skipped: number; mergedGroups: number }> {
      if (strategy === 'overwrite') {
        // 整体替换：调用方（面板）负责先产出当前库临时备份；默认分组始终保障存在
        const groups = data.groups.map((g) => ({ ...g }));
        if (!groups.some((g) => g.id === DEFAULT_GROUP_ID)) {
          groups.unshift({ id: DEFAULT_GROUP_ID, name: '默认收藏', order: 0, builtin: true });
        }
        await saveGroups(groups);
        await saveDanmaku(data.danmaku.map((d) => ({ ...d })));
        return { added: data.danmaku.length, skipped: 0, mergedGroups: 0 };
      }
      // 合并：同名分组合并 + 组内去重 + 孤儿弹幕归入默认收藏（技术方案 7.4.2）
      const [currentGroups, currentDanmaku] = await Promise.all([loadGroups(), loadDanmaku()]);
      const result = mergeLibrary(
        { groups: currentGroups, danmaku: currentDanmaku },
        { groups: data.groups, danmaku: data.danmaku },
      );
      await saveGroups(result.groups);
      await saveDanmaku(result.danmaku);
      return { added: result.added, skipped: result.skipped, mergedGroups: result.mergedGroups };
    },
    async getMenuContext(content: string): Promise<MenuGroup[]> {
      const [groups, list] = await Promise.all([loadGroups(), loadDanmaku()]);
      // 最近使用在前、默认分组固定末位（PRD FR-01）
      const custom = groups
        .filter((g) => !g.builtin)
        .sort((a, b) => {
          if (a.last_used_at && b.last_used_at) {
            return a.last_used_at < b.last_used_at ? 1 : a.last_used_at > b.last_used_at ? -1 : 0;
          }
          if (a.last_used_at) return -1;
          if (b.last_used_at) return 1;
          return a.order - b.order;
        });
      const builtin = groups.find((g) => g.builtin);
      if (!builtin) throw new StoreError(ERROR_CODES.READ_FAILED, '内置分组缺失');
      const n = normalize(content);
      const withFlag = (g: Group): MenuGroup => ({
        id: g.id,
        name: g.name,
        order: g.order,
        last_used_at: g.last_used_at,
        builtin: g.builtin,
        hasThisContent: list.some(
          (item) => item.group_id === g.id && normalize(item.content) === n,
        ),
      });
      return [...custom.map(withFlag), withFlag(builtin)];
    },
  };
}
