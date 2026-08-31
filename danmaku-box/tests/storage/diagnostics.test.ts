import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnostics } from '../../src/background/diagnostics.ts';
import { createStorageService } from '../../src/background/storage.service.ts';
import { MemoryArea } from '../helpers/memory-area.ts';
import { DIAG_LOG_LIMIT, STORAGE_KEYS } from '../../src/shared/constants.ts';

// M10 诊断与降级（技术方案 V0.2 4.M10 / 9.5）：本地环形日志，仅存本机不上报。

describe('Diagnostics 环形日志', () => {
  it('log 写入并可从快照读回', async () => {
    const area = new MemoryArea();
    const diag = createDiagnostics(createStorageService(area), () => '0.1.0');
    await diag.log('router', 'info', '启动');
    const snap = await diag.snapshot();
    assert.equal(snap.logs.length, 1);
    assert.equal(snap.logs[0]?.module, 'router');
    assert.equal(snap.version, '0.1.0');
  });

  it('超过上限 200 条时环形淘汰最旧日志', async () => {
    const area = new MemoryArea();
    const diag = createDiagnostics(createStorageService(area), () => '0.1.0');
    for (let i = 0; i < DIAG_LOG_LIMIT + 5; i++) {
      await diag.log('test', 'info', `日志${i}`);
    }
    const snap = await diag.snapshot();
    assert.equal(snap.logs.length, DIAG_LOG_LIMIT);
    assert.equal(snap.logs[0]?.message, '日志5');
    assert.equal(snap.logs[snap.logs.length - 1]?.message, `日志${DIAG_LOG_LIMIT + 4}`);
  });

  it('快照包含存储用量', async () => {
    const area = new MemoryArea();
    const diag = createDiagnostics(createStorageService(area), () => '0.1.0');
    const snap = await diag.snapshot();
    assert.ok('storage' in snap);
  });

  it('日志持久化到 diag.logs 键', async () => {
    const area = new MemoryArea();
    const diag = createDiagnostics(createStorageService(area), () => '0.1.0');
    await diag.log('m', 'warn', 'x');
    assert.ok(area.store.has(STORAGE_KEYS.diagLogs));
  });
});
