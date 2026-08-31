// 测试辅助：内存版 StorageArea，模拟 chrome.storage.local / session 行为。
// 通过 failSet / failGet 开关注入底层故障，覆盖失败路径。
import type { StorageAreaLike } from '../../src/background/storage.service.ts';

export class MemoryArea implements StorageAreaLike {
  store = new Map<string, unknown>();
  failSet = false;
  failGet = false;
  QUOTA_BYTES = 10240;

  async get(keys: string | string[] | null): Promise<Record<string, unknown>> {
    if (this.failGet) throw new Error('mock get failure');
    const result: Record<string, unknown> = {};
    if (keys === null) {
      for (const [k, v] of this.store) result[k] = v;
      return result;
    }
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) {
      const v = this.store.get(k);
      if (v !== undefined) result[k] = v;
    }
    return result;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    if (this.failSet) throw new Error('mock set failure');
    for (const [k, v] of Object.entries(items)) this.store.set(k, v);
  }

  async remove(keys: string | string[]): Promise<void> {
    for (const k of Array.isArray(keys) ? keys : [keys]) this.store.delete(k);
  }

  async getBytesInUse(keys?: string | string[] | null): Promise<number> {
    const targets =
      keys === null || keys === undefined
        ? [...this.store.keys()]
        : Array.isArray(keys)
          ? keys
          : [keys];
    let total = 0;
    for (const k of targets) {
      if (this.store.has(k)) total += byteLength(k) + byteLength(this.store.get(k));
    }
    return total;
  }
}

function byteLength(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v), 'utf8');
}
