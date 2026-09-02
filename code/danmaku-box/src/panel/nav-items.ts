// danmaku-box/src/panel/nav-items.ts
// 分组导航数据纯构建函数（V3 水平 chip 形态）。
// 职责：将分组列表映射为渲染所需的「全部弹幕 → 分组 → 新建分组」有序 spec。
// 边界：不含 DOM；纯输入输出，可单测。
import type { Group } from '../shared/types.ts';
import { DEFAULT_GROUP_ID } from '../shared/constants.ts';

export interface GroupWithCount extends Group {
  count: number;
}

export type NavItemSpec =
  | { kind: 'all'; id: null; name: string; count: number; active: boolean }
  | {
      kind: 'group';
      id: string;
      name: string;
      count: number;
      active: boolean;
      builtin: boolean;
      group: GroupWithCount;
    }
  | { kind: 'new'; id: null; name: string; count: number; active: boolean };

export function buildNavItems(
  groups: GroupWithCount[],
  selectedGroupId: string | null,
): NavItemSpec[] {
  const total = groups.reduce((sum, grp) => sum + grp.count, 0);
  const items: NavItemSpec[] = [
    { kind: 'all', id: null, name: '全部弹幕', count: total, active: selectedGroupId === null },
  ];
  for (const grp of groups) {
    items.push({
      kind: 'group',
      id: grp.id,
      name: grp.name,
      count: grp.count,
      active: selectedGroupId === grp.id,
      builtin: grp.id === DEFAULT_GROUP_ID,
      group: grp,
    });
  }
  items.push({ kind: 'new', id: null, name: '新', count: 0, active: false });
  return items;
}