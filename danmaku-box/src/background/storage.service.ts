// M1 存储服务 StorageService（技术方案 V0.2 4.M1 / P1 里程碑）。
// 职责：封装 chrome.storage 的读写、删除、用量查询。
// 边界：不做业务校验；不感知弹幕/分组语义；不缓存（每次直读存储）。
// 通过依赖注入 StorageAreaLike，实现可测试性（node:test 无需 mock 全局 chrome），
// local 与 session 两个存储区用同一工厂创建（storage.session 承载 SW 会话态持久化）。

/** chrome.storage.StorageArea 的结构化子集（鸭子类型，便于测试替换） */
export interface StorageAreaLike {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  getBytesInUse(keys?: string | string[] | null): Promise<number>;
  readonly QUOTA_BYTES: number;
}

/** 用量统计：已用字节数与该存储区配额 */
export interface StorageUsage {
  used: number;
  quota: number;
}

export interface StorageService {
  read<T>(key: string): Promise<T | undefined>;
  readMany(keys: string[]): Promise<Record<string, unknown>>;
  write(key: string, value: unknown): Promise<void>;
  writeMany(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  usage(): Promise<StorageUsage>;
}

/** 创建存储服务实例。area 传入 chrome.storage.local 或 chrome.storage.session */
export function createStorageService(area: StorageAreaLike): StorageService {
  return {
    async read<T>(key: string): Promise<T | undefined> {
      const bag = await area.get(key);
      return bag[key] as T | undefined;
    },

    async readMany(keys: string[]): Promise<Record<string, unknown>> {
      return area.get(keys);
    },

    async write(key: string, value: unknown): Promise<void> {
      await area.set({ [key]: value });
    },

    async writeMany(items: Record<string, unknown>): Promise<void> {
      await area.set(items);
    },

    async remove(keys: string | string[]): Promise<void> {
      await area.remove(keys);
    },

    async usage(): Promise<StorageUsage> {
      const used = await area.getBytesInUse(null);
      return { used, quota: area.QUOTA_BYTES };
    },
  };
}
