// M9 设置服务 SettingsService（技术方案 V0.2 4.M9）。
// 职责：维护全局设置与面板状态的读写。
// 边界：不包含弹幕业务规则；不感知平台差异；未知 key 与非法枚举值忽略（技术方案 6.2）。

import { STORAGE_KEYS } from '../shared/constants.ts';
import type { FillAfterBehavior, FillMode } from '../shared/types.ts';
import type { StorageService } from './storage.service.ts';

export interface Settings {
  fillMode: FillMode;
  fillAfterBehavior: FillAfterBehavior;
  chatContextMenuEnabled: boolean;
  /** 弹幕库上次选中分组；null 表示「全部弹幕」 */
  last_selected_group: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  fillMode: 'replace',
  fillAfterBehavior: 'focus_only',
  chatContextMenuEnabled: true,
  last_selected_group: null,
};

export interface SettingsService {
  get(): Promise<Settings>;
  set(patch: Partial<Settings>): Promise<Settings>;
}

/** 仅接受合法字段值，其余忽略（含存储中的脏数据回退默认） */
function applyPatch(base: Settings, patch: Partial<Settings>): Settings {
  const next: Settings = { ...base };
  if (patch.fillMode === 'replace' || patch.fillMode === 'append') next.fillMode = patch.fillMode;
  if (
    patch.fillAfterBehavior === 'focus_only' ||
    patch.fillAfterBehavior === 'focus_and_highlight'
  ) {
    next.fillAfterBehavior = patch.fillAfterBehavior;
  }
  if (typeof patch.chatContextMenuEnabled === 'boolean') {
    next.chatContextMenuEnabled = patch.chatContextMenuEnabled;
  }
  if (typeof patch.last_selected_group === 'string' || patch.last_selected_group === null) {
    next.last_selected_group = patch.last_selected_group;
  }
  return next;
}

export function createSettingsService(storage: StorageService): SettingsService {
  async function load(): Promise<Settings> {
    const stored = await storage.read<Partial<Settings>>(STORAGE_KEYS.settings);
    return applyPatch(DEFAULT_SETTINGS, stored ?? {});
  }

  return {
    async get(): Promise<Settings> {
      return load();
    },
    async set(patch: Partial<Settings>): Promise<Settings> {
      const current = await load();
      const next = applyPatch(current, patch);
      await storage.write(STORAGE_KEYS.settings, next);
      return next;
    },
  };
}
