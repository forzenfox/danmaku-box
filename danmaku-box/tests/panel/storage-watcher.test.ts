import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStorageWatcher } from '../../src/panel/storage-watcher.ts';

// StorageWatcher 契约测试（技术方案 V0.2 5.2 契约要点 + 本修复）：
// 面板需感知 content script 右键收藏等外部存储变更并自动刷新列表。
// 核心：area 过滤、key 过滤、防抖合并、dispose 清理。

type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;

function makeWatcher(overrides: Partial<Parameters<typeof createStorageWatcher>[0]> = {}) {
  let listener: Listener | null = null;
  let disposed = false;
  const calls: string[] = [];
  const watcher = createStorageWatcher({
    subscribe(fn) {
      listener = fn;
      return () => {
        disposed = true;
        listener = null;
      };
    },
    keys: ['db.danmaku', 'db.groups'],
    onChange() {
      calls.push('change');
    },
    debounceMs: 50,
    ...overrides,
  });
  return {
    watcher,
    fire(changes: Record<string, { newValue?: unknown }>, area = 'local') {
      listener?.(changes, area);
    },
    get calls() {
      return calls;
    },
    get disposed() {
      return disposed;
    },
    tick(ms: number) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },
  };
}

describe('StorageWatcher 外部变更监听', () => {
  it('local 区 db.danmaku 变化触发 onChange（防抖后一次）', async () => {
    const ctx = makeWatcher();
    ctx.watcher.mount();
    ctx.fire({ 'db.danmaku': { newValue: [] } });
    await ctx.tick(80);
    assert.deepEqual(ctx.calls, ['change']);
  });

  it('db.groups 变化同样触发', async () => {
    const ctx = makeWatcher();
    ctx.watcher.mount();
    ctx.fire({ 'db.groups': { newValue: [] } });
    await ctx.tick(80);
    assert.deepEqual(ctx.calls, ['change']);
  });

  it('非本插件 key 变化不触发', async () => {
    const ctx = makeWatcher();
    ctx.watcher.mount();
    ctx.fire({ 'other.key': { newValue: 1 } });
    await ctx.tick(80);
    assert.deepEqual(ctx.calls, []);
  });

  it('非 local 区变化不触发（session 区忽略）', async () => {
    const ctx = makeWatcher();
    ctx.watcher.mount();
    ctx.fire({ 'db.danmaku': { newValue: [] } }, 'session');
    await ctx.tick(80);
    assert.deepEqual(ctx.calls, []);
  });

  it('防抖合并：连续多次变化只触发一次', async () => {
    const ctx = makeWatcher();
    ctx.watcher.mount();
    ctx.fire({ 'db.danmaku': { newValue: [] } });
    ctx.fire({ 'db.danmaku': { newValue: [] } });
    ctx.fire({ 'db.groups': { newValue: [] } });
    await ctx.tick(80);
    assert.deepEqual(ctx.calls, ['change'], '50ms 内多次变更应合并为一次刷新');
  });

  it('防抖窗口过后再次变化重新触发', async () => {
    const ctx = makeWatcher();
    ctx.watcher.mount();
    ctx.fire({ 'db.danmaku': { newValue: [] } });
    await ctx.tick(80);
    ctx.fire({ 'db.danmaku': { newValue: [] } });
    await ctx.tick(80);
    assert.deepEqual(ctx.calls, ['change', 'change']);
  });

  it('mount 前不响应；dispose 后取消订阅不再触发', async () => {
    const ctx = makeWatcher();
    ctx.watcher.mount();
    ctx.watcher.dispose();
    ctx.fire({ 'db.danmaku': { newValue: [] } });
    await ctx.tick(80);
    assert.deepEqual(ctx.calls, []);
    assert.equal(ctx.disposed, true);
  });

  it('未 mount 时 fire 不触发（listener 未注册）', async () => {
    const ctx = makeWatcher();
    ctx.fire({ 'db.danmaku': { newValue: [] } });
    await ctx.tick(80);
    assert.deepEqual(ctx.calls, []);
  });
});
