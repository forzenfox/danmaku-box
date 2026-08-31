import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLibrary, parseBackup, type BackupFile } from '../../src/background/backup.ts';
import { StoreError } from '../../src/background/store-error.ts';
import { DEFAULT_GROUP_ID, ERROR_CODES, STORAGE_KEYS } from '../../src/shared/constants.ts';
import type { Danmaku, Group } from '../../src/shared/types.ts';

// M8 备份服务纯函数测试（技术方案 V0.2 7.4.2 同名分组合并算法、5.3 Schema 校验、
// P6 验证方式：合并算法、跨版本迁移失败不落盘）。

function g(id: string, name: string, order = 0, builtin = false): Group {
  return { id, name, order, builtin };
}

function d(id: string, content: string, groupId: string): Danmaku {
  return {
    id,
    content,
    group_id: groupId,
    platform: 'douyu',
    room: '1',
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('parseBackup 备份文件校验', () => {
  const valid: BackupFile = {
    version: 1,
    danmaku: [d('b1', '666', DEFAULT_GROUP_ID)],
    groups: [g(DEFAULT_GROUP_ID, '默认收藏', 0, true)],
  };

  it('合法对象通过并原样返回', () => {
    assert.deepEqual(parseBackup(valid), valid);
  });

  it('JSON 字符串可解析', () => {
    assert.deepEqual(parseBackup(JSON.stringify(valid)), valid);
  });

  it('缺 version 抛 BAD_FORMAT', () => {
    const bad = { ...valid } as Record<string, unknown>;
    delete bad.version;
    assert.throws(
      () => parseBackup(bad),
      (err: unknown) => err instanceof StoreError && err.code === ERROR_CODES.BAD_FORMAT,
    );
  });

  it('不支持的版本号抛 MIGRATE_FAILED', () => {
    assert.throws(
      () => parseBackup({ ...valid, version: 99 }),
      (err: unknown) => err instanceof StoreError && err.code === ERROR_CODES.MIGRATE_FAILED,
    );
  });

  it('缺 danmaku/groups 抛 BAD_FORMAT', () => {
    assert.throws(
      () => parseBackup({ version: 1, groups: [] }),
      (err: unknown) => err instanceof StoreError && err.code === ERROR_CODES.BAD_FORMAT,
    );
    assert.throws(
      () => parseBackup({ version: 1, danmaku: [] }),
      (err: unknown) => err instanceof StoreError && err.code === ERROR_CODES.BAD_FORMAT,
    );
  });

  it('非对象输入抛 BAD_FORMAT', () => {
    assert.throws(
      () => parseBackup('not json {'),
      (err: unknown) => err instanceof StoreError && err.code === ERROR_CODES.BAD_FORMAT,
    );
  });
});

describe('mergeLibrary 合并算法（技术方案 7.4.2）', () => {
  it('同名分组按名称合并，备份组内弹幕归入合并后的分组', () => {
    const current = {
      groups: [g(DEFAULT_GROUP_ID, '默认收藏', 0, true), g('g1', '应援', 1)],
      danmaku: [d('a1', '已有', 'g1')],
    };
    const incoming = {
      groups: [g('x1', '应援', 0), g('x2', '新组', 1)],
      danmaku: [d('b1', '新弹幕', 'x1'), d('b2', '另一条', 'x2')],
    };
    const r = mergeLibrary(current, incoming);
    const ying = r.groups.find((x) => x.name === '应援');
    assert.ok(ying);
    assert.equal(r.danmaku.filter((x) => x.group_id === ying.id).length, 2);
    assert.ok(r.groups.some((x) => x.name === '新组'));
    assert.equal(r.mergedGroups, 1);
  });

  it('组内去重：内容相同的弹幕跳过', () => {
    const current = {
      groups: [g(DEFAULT_GROUP_ID, '默认收藏', 0, true)],
      danmaku: [d('a1', '666', DEFAULT_GROUP_ID)],
    };
    const incoming = {
      groups: [g(DEFAULT_GROUP_ID, '默认收藏', 0, true)],
      danmaku: [d('b1', '666', DEFAULT_GROUP_ID), d('b2', '777', DEFAULT_GROUP_ID)],
    };
    const r = mergeLibrary(current, incoming);
    assert.equal(r.danmaku.length, 2);
    assert.equal(r.added, 1);
    assert.equal(r.skipped, 1);
  });

  it('引用未知分组的弹幕归入默认收藏（5.3 字段校验规则）', () => {
    const current = {
      groups: [g(DEFAULT_GROUP_ID, '默认收藏', 0, true)],
      danmaku: [],
    };
    const incoming = {
      groups: [g(DEFAULT_GROUP_ID, '默认收藏', 0, true)],
      danmaku: [d('b1', '孤儿', 'g_ghost')],
    };
    const r = mergeLibrary(current, incoming);
    assert.equal(r.danmaku[0]?.group_id, DEFAULT_GROUP_ID);
    assert.equal(r.added, 1);
  });

  it('备份默认分组合并入当前默认分组（不产生第二个默认组）', () => {
    const current = {
      groups: [g(DEFAULT_GROUP_ID, '默认收藏', 0, true)],
      danmaku: [],
    };
    const incoming = {
      groups: [g('x_default', '默认收藏', 0, true)],
      danmaku: [d('b1', '666', 'x_default')],
    };
    const r = mergeLibrary(current, incoming);
    assert.equal(r.groups.filter((x) => x.builtin).length, 1);
    assert.equal(r.danmaku[0]?.group_id, DEFAULT_GROUP_ID);
  });

  it('无同名分组时全部新增且 mergedGroups 为 0', () => {
    const current = {
      groups: [g(DEFAULT_GROUP_ID, '默认收藏', 0, true)],
      danmaku: [],
    };
    const incoming = {
      groups: [g('x1', '新组', 0)],
      danmaku: [d('b1', '666', 'x1')],
    };
    const r = mergeLibrary(current, incoming);
    assert.equal(r.mergedGroups, 0);
    assert.equal(r.added, 1);
    assert.equal(r.groups.length, 2);
  });
});

describe('importLibrary（store 集成）', () => {
  it('overwrite 策略整体替换', async () => {
    const { createDanmakuStore } = await import('../../src/background/danmaku-store.ts');
    const { createStorageService } = await import('../../src/background/storage.service.ts');
    const { MemoryArea } = await import('../helpers/memory-area.ts');
    const area = new MemoryArea();
    const storage = createStorageService(area);
    const store = await createDanmakuStore(storage);
    await store.createDanmaku({ content: '旧数据', groupId: DEFAULT_GROUP_ID });
    const custom = await store.createGroup('旧组');

    const r = await store.importLibrary(
      {
        groups: [g('n1', '新组', 0)],
        danmaku: [d('n1d', '新数据', 'n1')],
      },
      'overwrite',
    );
    assert.equal(r.added, 1);
    const groups = await store.getGroups();
    assert.equal(groups.length, 2); // 默认收藏 + 新组
    assert.ok(!groups.some((x) => x.id === custom.id));
    const list = await store.listDanmaku();
    assert.equal(list.total, 1);
    assert.equal(list.items[0]?.content, '新数据');
  });

  it('overwrite 空库达成清空语义（默认分组保留）', async () => {
    const { createDanmakuStore } = await import('../../src/background/danmaku-store.ts');
    const { createStorageService } = await import(
      '../../src/backend/storage.service.ts'.replace('backend', 'background')
    );
    const { MemoryArea } = await import('../helpers/memory-area.ts');
    const area = new MemoryArea();
    const store = await createDanmakuStore(createStorageService(area));
    await store.createDanmaku({ content: '将清空', groupId: DEFAULT_GROUP_ID });

    await store.importLibrary({ groups: [], danmaku: [] }, 'overwrite');
    assert.equal((await store.listDanmaku()).total, 0);
    assert.ok((await store.getGroups()).some((x) => x.id === DEFAULT_GROUP_ID));
  });

  it('exportLibrary 返回原始分组与弹幕数据', async () => {
    const { createDanmakuStore } = await import('../../src/background/danmaku-store.ts');
    const { createStorageService } = await import('../../src/background/storage.service.ts');
    const { MemoryArea } = await import('../helpers/memory-area.ts');
    const area = new MemoryArea();
    const store = await createDanmakuStore(createStorageService(area));
    await store.createDanmaku({ content: '666', groupId: DEFAULT_GROUP_ID });
    const lib = await store.exportLibrary();
    assert.equal(lib.danmaku.length, 1);
    assert.equal(lib.groups.length, 1);
    assert.ok(area.store.has(STORAGE_KEYS.danmaku));
  });
});
