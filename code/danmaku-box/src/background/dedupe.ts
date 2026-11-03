// M2 全库去重算法（技术方案 V0.4 7.4.3 / PRD V1.3 FR-03 全库去重规则）。
// 职责：以内容为维度规划全库去重，返回删除 id 与分类计数；纯函数便于 TDD。
// 边界：不读写存储；不依赖 DOM；空文本条目不参与判定。

import { DEFAULT_GROUP_ID } from '../shared/constants.ts';
import type { Danmaku } from '../shared/types.ts';

/** 去重归一化：仅去首尾空白（与收藏/新建去重一致） */
export function normalizeContent(raw: string): string {
  return String(raw ?? '').trim();
}

export interface DedupeReport {
  /** 扫描的全库弹幕总数 */
  scanned: number;
  /** 预计/实际删除条数 */
  removed: number;
  /** 其中：组内重复删除条数 */
  withinGroupRemoved: number;
  /** 其中：默认收藏跨组重复删除条数 */
  defaultGroupRemoved: number;
  /** 按规则保留的跨组重复内容数（非默认分组之间） */
  keptCrossGroupContents: number;
}

export interface DedupePlan extends DedupeReport {
  deleteIds: string[];
}

/** 创建时间更早者优先；时间相同/缺失时保留先出现的一条 */
function isEarlier(candidate: Danmaku, current: Danmaku): boolean {
  if (!candidate.created_at) return false;
  if (!current.created_at) return true;
  return candidate.created_at < current.created_at;
}

export function planDedupe(list: Danmaku[]): DedupePlan {
  const buckets = new Map<string, Danmaku[]>();
  for (const item of list) {
    const key = normalizeContent(item.content);
    if (key === '') continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  const deleteIds: string[] = [];
  let withinGroupRemoved = 0;
  let defaultGroupRemoved = 0;
  let keptCrossGroupContents = 0;

  for (const entries of buckets.values()) {
    if (entries.length < 2) continue;

    // a. 组内重复：每个分组保留一条（最早创建；同时间/缺失保留先出现）
    const entriesByGroup = new Map<string, Danmaku[]>();
    for (const item of entries) {
      const groupEntries = entriesByGroup.get(item.group_id);
      if (groupEntries) groupEntries.push(item);
      else entriesByGroup.set(item.group_id, [item]);
    }

    const removedInBucket = new Set<string>();
    for (const groupEntries of entriesByGroup.values()) {
      const first = groupEntries[0];
      if (!first) continue;
      let keep = first;
      for (const item of groupEntries) {
        if (isEarlier(item, keep)) keep = item;
      }
      for (const item of groupEntries) {
        if (item.id === keep.id) continue;
        removedInBucket.add(item.id);
        deleteIds.push(item.id);
      }
      withinGroupRemoved += groupEntries.length - 1;
    }

    // b. 跨组重复：包含默认收藏时删除默认收藏中的条目；
    //    非默认分组之间的重复保留原状
    const remaining = entries.filter((item) => !removedInBucket.has(item.id));
    const groupIds = new Set(remaining.map((item) => item.group_id));
    if (groupIds.size < 2) continue;
    if (groupIds.has(DEFAULT_GROUP_ID)) {
      for (const item of remaining) {
        if (item.group_id !== DEFAULT_GROUP_ID) continue;
        deleteIds.push(item.id);
        defaultGroupRemoved += 1;
      }
    } else {
      keptCrossGroupContents += 1;
    }
  }

  return {
    scanned: list.length,
    removed: deleteIds.length,
    withinGroupRemoved,
    defaultGroupRemoved,
    keptCrossGroupContents,
    deleteIds,
  };
}
