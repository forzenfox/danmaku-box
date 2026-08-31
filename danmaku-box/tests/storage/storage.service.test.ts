import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createStorageService } from '../../src/background/storage.service.ts';
import { MemoryArea } from '../helpers/memory-area.ts';

// M1 StorageService 单元测试（技术方案 V0.2 P1 验证方式：
// mock chrome.storage，覆盖读写/删除/用量/失败路径/会话态隔离）。

describe('StorageService 基础读写', () => {
  let area: MemoryArea;
  let svc: ReturnType<typeof createStorageService>;

  beforeEach(() => {
    area = new MemoryArea();
    svc = createStorageService(area);
  });

  it('空存储 read 返回 undefined', async () => {
    assert.equal(await svc.read('db.none'), undefined);
  });

  it('write 后 read 读回原值（对象/数组/字符串）', async () => {
    await svc.write('db.danmaku', [{ id: 'd1', content: '666' }]);
    await svc.write('db.groups', { id: 'g_default' });
    await svc.write('meta.tag', 'v1');
    assert.deepEqual(await svc.read('db.danmaku'), [{ id: 'd1', content: '666' }]);
    assert.deepEqual(await svc.read('db.groups'), { id: 'g_default' });
    assert.equal(await svc.read('meta.tag'), 'v1');
  });

  it('readMany 只返回存在的 key', async () => {
    await svc.write('db.a', 1);
    assert.deepEqual(await svc.readMany(['db.a', 'db.b']), { 'db.a': 1 });
  });

  it('writeMany 一次写入多键', async () => {
    await svc.writeMany({ 'db.a': 1, 'db.b': 'x' });
    assert.equal(await svc.read('db.a'), 1);
    assert.equal(await svc.read('db.b'), 'x');
  });

  it('remove 删除单个 key', async () => {
    await svc.write('db.a', 1);
    await svc.remove('db.a');
    assert.equal(await svc.read('db.a'), undefined);
  });

  it('remove 批量删除多个 key', async () => {
    await svc.writeMany({ 'db.a': 1, 'db.b': 2, 'db.c': 3 });
    await svc.remove(['db.a', 'db.b']);
    assert.equal(await svc.read('db.a'), undefined);
    assert.equal(await svc.read('db.b'), undefined);
    assert.equal(await svc.read('db.c'), 3);
  });

  it('usage 返回已用字节数与配额', async () => {
    await svc.write('db.a', 'hello');
    const usage = await svc.usage();
    assert.equal(usage.quota, 10240);
    assert.ok(usage.used > 0);
  });
});

describe('StorageService 失败路径', () => {
  it('底层 set 失败时 write 以 rejected 结束（错误冒泡，不静默丢数据）', async () => {
    const area = new MemoryArea();
    area.failSet = true;
    await assert.rejects(createStorageService(area).write('db.a', 1));
  });

  it('底层 set 失败时 writeMany 以 rejected 结束', async () => {
    const area = new MemoryArea();
    area.failSet = true;
    await assert.rejects(createStorageService(area).writeMany({ 'db.a': 1 }));
  });

  it('底层 get 失败时 read 以 rejected 结束', async () => {
    const area = new MemoryArea();
    area.failGet = true;
    await assert.rejects(createStorageService(area).read('db.a'));
  });
});

describe('local 与 session 双区隔离（storage.session 持久化层）', () => {
  it('同一工厂的两个实例（local/session）互不干扰', async () => {
    const localSvc = createStorageService(new MemoryArea());
    const sessionSvc = createStorageService(new MemoryArea());
    await localSvc.write('tab.map', { '1': 'douyu' });
    await sessionSvc.write('tab.map', { '2': 'douyin' });
    assert.deepEqual(await localSvc.read('tab.map'), { '1': 'douyu' });
    assert.deepEqual(await sessionSvc.read('tab.map'), { '2': 'douyin' });
  });

  it('session 区写入不影响 local 区用量', async () => {
    const localSvc = createStorageService(new MemoryArea());
    const sessionSvc = createStorageService(new MemoryArea());
    await sessionSvc.write('tab.map', { '1': 'douyu' });
    assert.equal((await localSvc.usage()).used, 0);
  });
});
