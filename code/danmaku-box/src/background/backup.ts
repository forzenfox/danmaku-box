// M8 备份服务（技术方案 V0.2 4.M8 / 5.3 Schema / 7.4.2 合并算法 / P6 里程碑）。
// 职责：备份文件的解析、版本迁移与合并算法（纯函数，便于 TDD）。
// 边界：不负责文件下载 UI；不执行破坏性操作前的确认逻辑（由调用方保证）。

import { DEFAULT_GROUP_ID, ERROR_CODES, SCHEMA_VERSION } from '../shared/constants.ts';
import type { Danmaku, Group } from '../shared/types.ts';
import { StoreError } from './store-error.ts';

/** 备份文件结构（技术方案 5.3；settings 为导出时的数组形态） */
export interface BackupFile {
  version: number;
  exported_at?: string;
  danmaku: Danmaku[];
  groups: Group[];
  settings?: Array<{ key: string; value: unknown }>;
}

export interface LibraryData {
  groups: Group[];
  danmaku: Danmaku[];
}

export interface MergeResult extends LibraryData {
  added: number;
  skipped: number;
  mergedGroups: number;
}

/** 去重归一化（与 DanmakuStore 一致：仅去首尾空白） */
function normalize(s: string): string {
  return s.trim();
}

/** 解析并校验备份文件：version 必须受支持，danmaku/groups 必须为数组 */
export function parseBackup(raw: unknown): BackupFile {
  let obj: Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new StoreError(ERROR_CODES.BAD_FORMAT, '文件格式不正确，请使用本产品导出的备份文件');
    }
  } else if (typeof raw === 'object' && raw !== null) {
    obj = raw as Record<string, unknown>;
  } else {
    throw new StoreError(ERROR_CODES.BAD_FORMAT, '文件格式不正确，请使用本产品导出的备份文件');
  }

  if (typeof obj.version !== 'number') {
    throw new StoreError(ERROR_CODES.BAD_FORMAT, '文件格式不正确，请使用本产品导出的备份文件');
  }
  if (obj.version !== SCHEMA_VERSION) {
    // 当前仅支持 v1；后续版本在此处注册迁移器，迁移失败中止且不落盘（PRD FR-05）
    throw new StoreError(ERROR_CODES.MIGRATE_FAILED, '备份文件版本不受支持');
  }
  if (!Array.isArray(obj.danmaku) || !Array.isArray(obj.groups)) {
    throw new StoreError(ERROR_CODES.BAD_FORMAT, '文件格式不正确，请使用本产品导出的备份文件');
  }
  return obj as unknown as BackupFile;
}

/**
 * 同名分组合并算法（技术方案 7.4.2）：
 * - 同名分组按名称合并为一个分组，备份中该组的弹幕归入合并后的分组；
 * - 组内按内容去重（跳过重复）；
 * - 引用未知分组的弹幕归入「默认收藏」（5.3 字段校验规则）；
 * - 新分组按 order 追加到现有分组之后。
 */
export function mergeLibrary(current: LibraryData, incoming: LibraryData): MergeResult {
  const groups: Group[] = current.groups.map((g) => ({ ...g }));
  const danmaku: Danmaku[] = current.danmaku.map((d) => ({ ...d }));
  // 分组内弹幕按组建立内容索引，用于去重
  const contentByGroup = new Map<string, Set<string>>();
  for (const d of danmaku) {
    if (!contentByGroup.has(d.group_id)) contentByGroup.set(d.group_id, new Set());
    contentByGroup.get(d.group_id)?.add(normalize(d.content));
  }
  // 名称 → 目标分组 id（现有组按名称建索引；默认收藏按名称自然命中）
  const nameIndex = new Map<string, string>();
  for (const g of groups) if (!nameIndex.has(g.name)) nameIndex.set(g.name, g.id);

  let added = 0;
  let skipped = 0;
  let mergedGroups = 0;
  let nextOrder = groups.reduce((max, g) => Math.max(max, g.order), 0);

  const orderedIncoming = [...incoming.groups].sort((a, b) => a.order - b.order);
  for (const g of orderedIncoming) {
    let targetId: string;
    if (nameIndex.has(g.name)) {
      targetId = nameIndex.get(g.name) as string;
      mergedGroups += 1;
    } else {
      targetId = g.id;
      const cloned: Group = { ...g, order: ++nextOrder };
      groups.push(cloned);
      nameIndex.set(cloned.name, cloned.id);
      contentByGroup.set(cloned.id, new Set());
    }

    for (const d of incoming.danmaku) {
      if (d.group_id !== g.id) continue;
      const n = normalize(d.content);
      const seen = contentByGroup.get(targetId);
      if (seen && seen.has(n)) {
        skipped += 1;
        continue;
      }
      seen?.add(n);
      danmaku.push({ ...d, group_id: targetId });
      added += 1;
    }
  }

  // 未被任何分组声明引用的弹幕（孤儿）归入默认收藏
  const knownIds = new Set(groups.map((g) => g.id));
  for (const d of incoming.danmaku) {
    if (!knownIds.has(d.group_id)) {
      const n = normalize(d.content);
      const seen = contentByGroup.get(DEFAULT_GROUP_ID);
      if (seen && seen.has(n)) {
        skipped += 1;
        continue;
      }
      seen?.add(n);
      danmaku.push({ ...d, group_id: DEFAULT_GROUP_ID });
      added += 1;
    }
  }

  return { groups, danmaku, added, skipped, mergedGroups };
}
