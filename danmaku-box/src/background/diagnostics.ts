// M10 诊断与降级 Diagnostics（技术方案 V0.2 4.M10 / 9.5）。
// 职责：沉淀本地诊断日志（环形缓冲，上限 DIAG_LOG_LIMIT），生成诊断报告。
// 边界：不采集用户行为数据；不上报任何外部；不参与业务判定。

import { DIAG_LOG_LIMIT, STORAGE_KEYS } from '../shared/constants.ts';
import type { StorageService } from './storage.service.ts';

export type DiagLevel = 'info' | 'warn' | 'error';

export interface DiagLogEntry {
  ts: string;
  level: DiagLevel;
  module: string;
  message: string;
}

export interface DiagSnapshot {
  version: string;
  logs: DiagLogEntry[];
  storage: { used: number; quota: number };
}

export interface Diagnostics {
  log(module: string, level: DiagLevel, message: string): Promise<void>;
  snapshot(): Promise<DiagSnapshot>;
}

export function createDiagnostics(storage: StorageService, getVersion: () => string): Diagnostics {
  async function readLogs(): Promise<DiagLogEntry[]> {
    return (await storage.read<DiagLogEntry[]>(STORAGE_KEYS.diagLogs)) ?? [];
  }

  return {
    async log(module: string, level: DiagLevel, message: string): Promise<void> {
      const logs = await readLogs();
      logs.push({
        ts: new Date().toISOString(),
        level,
        module,
        message,
      });
      // 环形淘汰：仅保留最近 DIAG_LOG_LIMIT 条
      const trimmed = logs.slice(-DIAG_LOG_LIMIT);
      await storage.write(STORAGE_KEYS.diagLogs, trimmed);
    },

    async snapshot(): Promise<DiagSnapshot> {
      const [logs, usage] = await Promise.all([readLogs(), storage.usage()]);
      return { version: getVersion(), logs, storage: { used: usage.used, quota: usage.quota } };
    },
  };
}
