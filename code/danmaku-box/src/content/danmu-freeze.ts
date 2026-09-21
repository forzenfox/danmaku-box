// 冻结目标管理（专项 PRD FR-V03）：右键菜单同一时刻只有一个活动冻结目标。
// 新右键命中时先恢复上一条再冻结新目标（避免"孤儿冻结"——菜单关闭只恢复
// 最后一条，前一条永久卡死）；release 幂等。

interface FreezeAdapter {
  pauseDanmu(target?: Element): void;
  resumeDanmu(target?: Element): void;
}

export interface FreezeManager {
  freeze(item: Element): void;
  release(): void;
}

export function createFreezeManager(adapter: FreezeAdapter): FreezeManager {
  let frozen: Element | null = null;

  return {
    freeze(item) {
      if (frozen === item) return;
      if (frozen) adapter.resumeDanmu(frozen);
      frozen = item;
      adapter.pauseDanmu(item);
    },
    release() {
      if (!frozen) return;
      const target = frozen;
      frozen = null;
      adapter.resumeDanmu(target);
    },
  };
}
