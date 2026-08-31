import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsService } from '../../src/background/settings.service.ts';
import { createStorageService } from '../../src/background/storage.service.ts';
import { MemoryArea } from '../helpers/memory-area.ts';
import { STORAGE_KEYS } from '../../src/shared/constants.ts';

// M9 SettingsService 单元测试：默认值兜底、合并写入、未知 key 与非法枚举值忽略。

describe('SettingsService', () => {
  it('未写入时返回默认设置（fillMode=replace、focus_only、右键开、无选中组）', async () => {
    const svc = createSettingsService(createStorageService(new MemoryArea()));
    assert.deepEqual(await svc.get(), {
      fillMode: 'replace',
      fillAfterBehavior: 'focus_only',
      chatContextMenuEnabled: true,
      last_selected_group: null,
    });
  });

  it('set 合并写入并持久化（模拟 SW 重启后仍可读回）', async () => {
    const area = new MemoryArea();
    const svc = createSettingsService(createStorageService(area));
    const next = await svc.set({ fillMode: 'append', last_selected_group: 'g_1' });
    assert.equal(next.fillMode, 'append');
    assert.equal(next.last_selected_group, 'g_1');
    assert.ok(area.store.has(STORAGE_KEYS.settings));
    const svc2 = createSettingsService(createStorageService(area));
    assert.equal((await svc2.get()).fillMode, 'append');
  });

  it('存储中的非法枚举值回退默认，未知 key 被忽略（技术方案 6.2）', async () => {
    const area = new MemoryArea();
    area.store.set(STORAGE_KEYS.settings, { fillMode: 'bogus', unknownKey: true });
    const s = await createSettingsService(createStorageService(area)).get();
    assert.equal(s.fillMode, 'replace');
    assert.equal('unknownKey' in s, false);
  });

  it('set 部分字段不影响其余设置', async () => {
    const svc = createSettingsService(createStorageService(new MemoryArea()));
    await svc.set({ chatContextMenuEnabled: false });
    const s = await svc.get();
    assert.equal(s.chatContextMenuEnabled, false);
    assert.equal(s.fillMode, 'replace');
    assert.equal(s.fillAfterBehavior, 'focus_only');
  });
});
