import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { createDanmakuStore } from '../../src/background/danmaku-store.ts';
import { StoreError } from '../../src/background/store-error.ts';
import { createStorageService } from '../../src/background/storage.service.ts';
import { MemoryArea } from '../helpers/memory-area.ts';
import {
  DANMAKU_MAX_LENGTH,
  DEFAULT_GROUP_ID,
  ERROR_CODES,
  GROUP_LIMIT,
  STORAGE_KEYS,
} from '../../src/shared/constants.ts';
import type { Danmaku, Group } from '../../src/shared/types.ts';

// M2 DanmakuStore 单元测试（技术方案 V0.2 P2 验证方式：
// 去重算法、分页边界、50 分组上限、排序正确性、last_used_at 维护）。

async function makeStore() {
  const area = new MemoryArea();
  const storage = createStorageService(area);
  const store = await createDanmakuStore(storage);
  return { area, storage, store };
}

async function expectError(code: string, promise: Promise<unknown>) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof StoreError, `应为 StoreError，实为 ${String(err)}`);
    assert.equal(err.code, code);
    return true;
  });
}

function seedDanmaku(area: MemoryArea, list: Danmaku[]) {
  area.store.set(STORAGE_KEYS.danmaku, list);
}

function d(id: string, content: string, groupId: string, createdAt: string): Danmaku {
  return {
    id,
    content,
    group_id: groupId,
    platform: 'douyu',
    room: '1126960',
    created_at: createdAt,
  };
}

describe('初始化', () => {
  it('首次创建自动写入内置默认分组', async () => {
    const { area, store } = await makeStore();
    const groups = await store.getGroups();
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.id, DEFAULT_GROUP_ID);
    assert.equal(groups[0]?.builtin, true);
    assert.equal(groups[0]?.name, '默认收藏');
    assert.ok(area.store.has(STORAGE_KEYS.groups));
  });

  it('默认分组存在但 builtin 标记缺失时初始化修复该标记', async () => {
    const area = new MemoryArea();
    // 模拟历史/异常数据：id 正确但 builtin 字段缺失
    area.store.set(STORAGE_KEYS.groups, [{ id: DEFAULT_GROUP_ID, name: '默认收藏', order: 0 }]);
    const storage = createStorageService(area);
    const store = await createDanmakuStore(storage);
    const groups = await store.getGroups();
    const builtin = groups.find((g) => g.id === DEFAULT_GROUP_ID);
    assert.equal(builtin?.builtin, true, '初始化应补全内置分组 builtin 标记');
    // 修复后 getMenuContext 不应因内置分组缺失而抛 READ_FAILED
    const menu = await store.getMenuContext('任意');
    assert.ok(Array.isArray(menu));
    assert.equal(menu[menu.length - 1]?.id, DEFAULT_GROUP_ID, '内置分组固定末位');
  });

  it('重复创建不产生重复默认分组', async () => {
    const { storage } = await makeStore();
    await createDanmakuStore(storage);
    const groups = (await storage.read<Group[]>(STORAGE_KEYS.groups)) ?? [];
    assert.equal(groups.filter((g) => g.id === DEFAULT_GROUP_ID).length, 1);
  });
});

describe('createGroup', () => {
  it('创建成功：名称正确、order 递增、非内置', async () => {
    const { store } = await makeStore();
    const g1 = await store.createGroup('应援口号');
    const g2 = await store.createGroup('整活文案');
    assert.equal(g1.name, '应援口号');
    assert.equal(g1.builtin, false);
    assert.equal(g2.order, g1.order + 1);
    assert.notEqual(g1.id, g2.id);
  });

  it('名称首尾空格自动去除', async () => {
    const { store } = await makeStore();
    assert.equal((await store.createGroup('  应援口号  ')).name, '应援口号');
  });

  it('非法名称（空/纯空格/超 12 字）抛 NAME_INVALID', async () => {
    const { store } = await makeStore();
    await expectError(ERROR_CODES.NAME_INVALID, store.createGroup(''));
    await expectError(ERROR_CODES.NAME_INVALID, store.createGroup('   '));
    await expectError(ERROR_CODES.NAME_INVALID, store.createGroup('一二三四五六七八九十一二三'));
  });

  it('重名抛 NAME_EXISTS', async () => {
    const { store } = await makeStore();
    await store.createGroup('应援口号');
    await expectError(ERROR_CODES.NAME_EXISTS, store.createGroup('应援口号'));
  });

  it('第 51 个分组抛 GROUP_LIMIT（上限含内置）', async () => {
    const { store } = await makeStore();
    for (let i = 0; i < GROUP_LIMIT - 1; i++) await store.createGroup(`分组${i}`);
    await expectError(ERROR_CODES.GROUP_LIMIT, store.createGroup('溢出组'));
  });
});

describe('renameGroup', () => {
  it('重命名成功且全库生效', async () => {
    const { store } = await makeStore();
    const g = await store.createGroup('旧名');
    const updated = await store.renameGroup(g.id, '新名');
    assert.equal(updated.name, '新名');
    assert.equal((await store.getGroups()).find((x) => x.id === g.id)?.name, '新名');
  });

  it('内置分组不可重命名（BUILTIN_GROUP）', async () => {
    const { store } = await makeStore();
    await expectError(ERROR_CODES.BUILTIN_GROUP, store.renameGroup(DEFAULT_GROUP_ID, '改名'));
  });

  it('与其他分组重名抛 NAME_EXISTS', async () => {
    const { store } = await makeStore();
    await store.createGroup('A组');
    const b = await store.createGroup('B组');
    await expectError(ERROR_CODES.NAME_EXISTS, store.renameGroup(b.id, 'A组'));
  });
});

describe('deleteGroup', () => {
  it('删除自定义分组：组内弹幕移入默认收藏并返回数量', async () => {
    const { store } = await makeStore();
    const g = await store.createGroup('活动口令');
    await store.collectDanmaku({ content: '666', groupId: g.id, platform: 'douyu', room: '1' });
    await store.collectDanmaku({
      content: '777',
      groupId: DEFAULT_GROUP_ID,
      platform: 'douyu',
      room: '1',
    });
    const { movedCount } = await store.deleteGroup(g.id);
    assert.equal(movedCount, 1);
    const all = await store.listDanmaku();
    assert.equal(all.total, 2);
    assert.equal(all.items.find((x) => x.content === '666')?.group_id, DEFAULT_GROUP_ID);
    assert.equal((await store.getGroups()).length, 1);
  });

  it('删除默认分组抛 BUILTIN_GROUP', async () => {
    const { store } = await makeStore();
    await expectError(ERROR_CODES.BUILTIN_GROUP, store.deleteGroup(DEFAULT_GROUP_ID));
  });
});

describe('reorderGroups', () => {
  it('按给定顺序重排 order', async () => {
    const { store } = await makeStore();
    const a = await store.createGroup('A');
    const b = await store.createGroup('B');
    const c = await store.createGroup('C');
    await store.reorderGroups([c.id, a.id, b.id, DEFAULT_GROUP_ID]);
    assert.deepEqual(
      (await store.getGroups()).map((g) => g.id),
      [c.id, a.id, b.id, DEFAULT_GROUP_ID],
    );
  });

  it('包含未知 id 抛 NOT_FOUND', async () => {
    const { store } = await makeStore();
    const a = await store.createGroup('A');
    await expectError(ERROR_CODES.NOT_FOUND, store.reorderGroups([a.id, 'g_unknown']));
  });
});

describe('collectDanmaku（右键收藏路径）', () => {
  it('收藏成功：字段齐全且持久化', async () => {
    const { store, storage } = await makeStore();
    const { id, duplicate } = await store.collectDanmaku({
      content: '666冲冲冲',
      groupId: DEFAULT_GROUP_ID,
      platform: 'douyu',
      room: '1126960',
    });
    assert.equal(duplicate, false);
    assert.ok(id.startsWith('d_'));
    const list = (await storage.read<Danmaku[]>(STORAGE_KEYS.danmaku)) ?? [];
    assert.equal(list.length, 1);
    assert.equal(list[0]?.content, '666冲冲冲');
    assert.equal(list[0]?.platform, 'douyu');
    assert.equal(list[0]?.room, '1126960');
    assert.ok(list[0]?.created_at);
  });

  it('同组同内容重复收藏返回 duplicate 且不重复写入（归一化去首尾空白）', async () => {
    const { store } = await makeStore();
    await store.collectDanmaku({
      content: '666',
      groupId: DEFAULT_GROUP_ID,
      platform: 'douyu',
      room: '1',
    });
    const second = await store.collectDanmaku({
      content: ' 666 ',
      groupId: DEFAULT_GROUP_ID,
      platform: 'douyu',
      room: '2',
    });
    assert.equal(second.duplicate, true);
    assert.equal((await store.listDanmaku()).total, 1);
  });

  it('不同分组同内容不算重复', async () => {
    const { store } = await makeStore();
    const g = await store.createGroup('应援');
    await store.collectDanmaku({
      content: '666',
      groupId: DEFAULT_GROUP_ID,
      platform: 'douyu',
      room: '1',
    });
    const r = await store.collectDanmaku({
      content: '666',
      groupId: g.id,
      platform: 'douyu',
      room: '1',
    });
    assert.equal(r.duplicate, false);
    assert.equal((await store.listDanmaku()).total, 2);
  });

  it('内容超过 50 字抛 INVALID_CONTENT', async () => {
    const { store } = await makeStore();
    await expectError(
      ERROR_CODES.INVALID_CONTENT,
      store.collectDanmaku({
        content: 'x'.repeat(DANMAKU_MAX_LENGTH + 1),
        groupId: DEFAULT_GROUP_ID,
        platform: 'douyu',
        room: '1',
      }),
    );
  });

  it('空文本弹幕允许收藏（纯表情场景）', async () => {
    const { store } = await makeStore();
    const r = await store.collectDanmaku({
      content: '',
      groupId: DEFAULT_GROUP_ID,
      platform: 'douyu',
      room: '1',
    });
    assert.equal(r.duplicate, false);
    assert.equal((await store.listDanmaku()).total, 1);
  });

  it('目标分组不存在抛 NOT_FOUND', async () => {
    const { store } = await makeStore();
    await expectError(
      ERROR_CODES.NOT_FOUND,
      store.collectDanmaku({ content: '666', groupId: 'g_none', platform: 'douyu', room: '1' }),
    );
  });

  it('收藏后更新分组 last_used_at', async () => {
    const { store } = await makeStore();
    const g = await store.createGroup('应援');
    await store.collectDanmaku({ content: '666', groupId: g.id, platform: 'douyu', room: '1' });
    assert.ok((await store.getGroups()).find((x) => x.id === g.id)?.last_used_at);
  });
});

describe('createDanmaku（手动新建路径）', () => {
  it('手动新建成功（platform 记为 manual，站外文案无来源房间）', async () => {
    const { store } = await makeStore();
    const r = await store.createDanmaku({ content: '站外文案', groupId: DEFAULT_GROUP_ID });
    assert.equal(r.duplicate, false);
    const all = await store.listDanmaku();
    assert.equal(all.items[0]?.platform, 'manual');
    assert.equal(all.items[0]?.room, '');
  });

  it('纯空格内容抛 INVALID_CONTENT（手动新建不允许空文本）', async () => {
    const { store } = await makeStore();
    await expectError(
      ERROR_CODES.INVALID_CONTENT,
      store.createDanmaku({ content: '   ', groupId: DEFAULT_GROUP_ID }),
    );
  });

  it('与已有条目重复返回 duplicate 不重复写入', async () => {
    const { store } = await makeStore();
    await store.createDanmaku({ content: '666', groupId: DEFAULT_GROUP_ID });
    const r = await store.createDanmaku({ content: '666', groupId: DEFAULT_GROUP_ID });
    assert.equal(r.duplicate, true);
    assert.equal((await store.listDanmaku()).total, 1);
  });
});

describe('updateDanmaku', () => {
  it('更新内容成功', async () => {
    const { store } = await makeStore();
    const { id } = await store.createDanmaku({ content: '旧文案', groupId: DEFAULT_GROUP_ID });
    await store.updateDanmaku(id, '新文案');
    assert.equal((await store.listDanmaku()).items.find((x) => x.id === id)?.content, '新文案');
  });

  it('弹幕不存在抛 NOT_FOUND', async () => {
    const { store } = await makeStore();
    await expectError(ERROR_CODES.NOT_FOUND, store.updateDanmaku('d_none', '新文案'));
  });

  it('内容超长抛 INVALID_CONTENT', async () => {
    const { store } = await makeStore();
    const { id } = await store.createDanmaku({ content: '666', groupId: DEFAULT_GROUP_ID });
    await expectError(
      ERROR_CODES.INVALID_CONTENT,
      store.updateDanmaku(id, 'x'.repeat(DANMAKU_MAX_LENGTH + 1)),
    );
  });
});

describe('deleteDanmaku', () => {
  it('批量删除并返回数量', async () => {
    const { store } = await makeStore();
    const a = await store.createDanmaku({ content: '1', groupId: DEFAULT_GROUP_ID });
    const b = await store.createDanmaku({ content: '2', groupId: DEFAULT_GROUP_ID });
    const c = await store.createDanmaku({ content: '3', groupId: DEFAULT_GROUP_ID });
    const { deleted } = await store.deleteDanmaku([a.id, b.id]);
    assert.equal(deleted, 2);
    const rest = await store.listDanmaku();
    assert.equal(rest.total, 1);
    assert.equal(rest.items[0]?.id, c.id);
  });

  it('全部不存在抛 NOT_FOUND', async () => {
    const { store } = await makeStore();
    await expectError(ERROR_CODES.NOT_FOUND, store.deleteDanmaku(['d_none']));
  });
});

describe('moveDanmaku', () => {
  it('批量移动到目标分组', async () => {
    const { store } = await makeStore();
    const target = await store.createGroup('应援');
    const a = await store.createDanmaku({ content: '1', groupId: DEFAULT_GROUP_ID });
    const b = await store.createDanmaku({ content: '2', groupId: DEFAULT_GROUP_ID });
    const { moved } = await store.moveDanmaku([a.id, b.id], target.id);
    assert.equal(moved, 2);
    assert.equal((await store.listDanmaku({ groupId: target.id })).total, 2);
  });

  it('目标分组不存在抛 NOT_FOUND', async () => {
    const { store } = await makeStore();
    const a = await store.createDanmaku({ content: '1', groupId: DEFAULT_GROUP_ID });
    await expectError(ERROR_CODES.NOT_FOUND, store.moveDanmaku([a.id], 'g_none'));
  });
});

describe('listDanmaku 查询', () => {
  it('无过滤返回全库与 total', async () => {
    const { store, area } = await makeStore();
    seedDanmaku(area, [
      d('1', 'a', DEFAULT_GROUP_ID, '2026-01-01T00:00:00Z'),
      d('2', 'b', DEFAULT_GROUP_ID, '2026-01-02T00:00:00Z'),
    ]);
    const all = await store.listDanmaku();
    assert.equal(all.total, 2);
    assert.equal(all.items.length, 2);
    assert.equal(all.hasMore, false);
  });

  it('groupId 过滤当前分组', async () => {
    const { store, area } = await makeStore();
    seedDanmaku(area, [
      d('1', 'a', DEFAULT_GROUP_ID, '2026-01-01T00:00:00Z'),
      d('2', 'b', 'g_2', '2026-01-02T00:00:00Z'),
    ]);
    const inGroup = await store.listDanmaku({ groupId: 'g_2' });
    assert.equal(inGroup.total, 1);
    assert.equal(inGroup.items[0]?.id, '2');
  });

  it('关键词过滤（不区分大小写）', async () => {
    const { store, area } = await makeStore();
    seedDanmaku(area, [
      d('1', '666冲冲冲', DEFAULT_GROUP_ID, '2026-01-01T00:00:00Z'),
      d('2', '生日快乐', DEFAULT_GROUP_ID, '2026-01-02T00:00:00Z'),
      d('3', 'Happy Birthday', DEFAULT_GROUP_ID, '2026-01-03T00:00:00Z'),
    ]);
    const zh = await store.listDanmaku({ keyword: '冲' });
    assert.equal(zh.total, 1);
    const en = await store.listDanmaku({ keyword: 'happy' });
    assert.equal(en.total, 1);
    assert.equal(en.items[0]?.id, '3');
  });

  it('搜索范围限定当前分组（PRD FR-02）', async () => {
    const { store, area } = await makeStore();
    seedDanmaku(area, [
      d('1', '666', DEFAULT_GROUP_ID, '2026-01-01T00:00:00Z'),
      d('2', '666', 'g_2', '2026-01-02T00:00:00Z'),
    ]);
    const scoped = await store.listDanmaku({ groupId: 'g_2', keyword: '666' });
    assert.equal(scoped.total, 1);
    assert.equal(scoped.items[0]?.id, '2');
  });

  it('latest 排序：新收藏在前', async () => {
    const { store, area } = await makeStore();
    seedDanmaku(area, [
      d('1', '旧', DEFAULT_GROUP_ID, '2026-01-01T00:00:00Z'),
      d('2', '新', DEFAULT_GROUP_ID, '2026-01-02T00:00:00Z'),
    ]);
    assert.deepEqual(
      (await store.listDanmaku({ sort: 'latest' })).items.map((x) => x.id),
      ['2', '1'],
    );
  });

  it('oldest 排序：早收藏在前', async () => {
    const { store, area } = await makeStore();
    seedDanmaku(area, [
      d('1', '旧', DEFAULT_GROUP_ID, '2026-01-01T00:00:00Z'),
      d('2', '新', DEFAULT_GROUP_ID, '2026-01-02T00:00:00Z'),
    ]);
    assert.deepEqual(
      (await store.listDanmaku({ sort: 'oldest' })).items.map((x) => x.id),
      ['1', '2'],
    );
  });

  it('length 排序：内容长的在前', async () => {
    const { store, area } = await makeStore();
    seedDanmaku(area, [
      d('1', '短', DEFAULT_GROUP_ID, '2026-01-01T00:00:00Z'),
      d('2', '这是一个很长的弹幕内容用于排序', DEFAULT_GROUP_ID, '2026-01-02T00:00:00Z'),
      d('3', '中等长度内容', DEFAULT_GROUP_ID, '2026-01-03T00:00:00Z'),
    ]);
    assert.deepEqual(
      (await store.listDanmaku({ sort: 'length' })).items.map((x) => x.id),
      ['2', '3', '1'],
    );
  });

  it('分页：pageSize 与 hasMore 边界', async () => {
    const { store, area } = await makeStore();
    seedDanmaku(
      area,
      [1, 2, 3, 4, 5].map((i) =>
        d(`${i}`, `内容${i}`, DEFAULT_GROUP_ID, `2026-01-0${i}T00:00:00Z`),
      ),
    );
    const p1 = await store.listDanmaku({ page: 1, pageSize: 2 });
    assert.equal(p1.items.length, 2);
    assert.equal(p1.hasMore, true);
    const p3 = await store.listDanmaku({ page: 3, pageSize: 2 });
    assert.equal(p3.items.length, 1);
    assert.equal(p3.hasMore, false);
  });

  it('超出页码返回空列表且 hasMore 为 false', async () => {
    const { store, area } = await makeStore();
    seedDanmaku(area, [d('1', 'a', DEFAULT_GROUP_ID, '2026-01-01T00:00:00Z')]);
    const over = await store.listDanmaku({ page: 2, pageSize: 50 });
    assert.equal(over.items.length, 0);
    assert.equal(over.hasMore, false);
  });
});

describe('getMenuContext（右键菜单数据）', () => {
  it('自定义组按最近使用降序，默认收藏固定末位', async () => {
    const { store } = await makeStore();
    const a = await store.createGroup('A');
    await sleep(5);
    const b = await store.createGroup('B');
    await store.collectDanmaku({ content: 'x', groupId: a.id, platform: 'douyu', room: '1' });
    await sleep(5);
    await store.collectDanmaku({ content: 'y', groupId: b.id, platform: 'douyu', room: '1' });
    assert.deepEqual(
      (await store.getMenuContext('666')).map((g) => g.id),
      [b.id, a.id, DEFAULT_GROUP_ID],
    );
  });

  it('从未使用的组按 order 兜底排序', async () => {
    const { store } = await makeStore();
    const a = await store.createGroup('A');
    const b = await store.createGroup('B');
    assert.deepEqual(
      (await store.getMenuContext('')).map((g) => g.id),
      [a.id, b.id, DEFAULT_GROUP_ID],
    );
  });

  it('hasThisContent 标记已收藏该内容的分组', async () => {
    const { store } = await makeStore();
    const g = await store.createGroup('应援');
    await store.collectDanmaku({ content: '666', groupId: g.id, platform: 'douyu', room: '1' });
    const menu = await store.getMenuContext('666');
    assert.equal(menu.find((x) => x.id === g.id)?.hasThisContent, true);
    assert.equal(menu.find((x) => x.id === DEFAULT_GROUP_ID)?.hasThisContent, false);
  });
});

describe('getGroupsWithCounts（面板分组导航计数）', () => {
  it('返回每个分组的弹幕数量', async () => {
    const { store } = await makeStore();
    const g = await store.createGroup('应援');
    await store.collectDanmaku({
      content: '1',
      groupId: DEFAULT_GROUP_ID,
      platform: 'douyu',
      room: '1',
    });
    await store.collectDanmaku({
      content: '2',
      groupId: DEFAULT_GROUP_ID,
      platform: 'douyu',
      room: '1',
    });
    await store.collectDanmaku({ content: '3', groupId: g.id, platform: 'douyu', room: '1' });
    const withCounts = await store.getGroupsWithCounts();
    assert.deepEqual(
      withCounts.map((x) => ({ id: x.id, count: x.count })),
      [
        { id: DEFAULT_GROUP_ID, count: 2 },
        { id: g.id, count: 1 },
      ],
    );
  });
});

// importFavoriteDanmaku：批量导入收藏弹幕到目标分组（组内去重，一次落盘）。

describe('DanmakuStore.importFavoriteDanmaku', () => {
  async function setup() {
    const area = new MemoryArea();
    const store = await createDanmakuStore(createStorageService(area));
    const group = await store.createGroup('斗鱼官收');
    return { area, store, groupId: group.id } as const;
  }

  it('批量写入并返回 added，平台标记 douyu', async () => {
    const { store, groupId } = await setup();
    const r = await store.importFavoriteDanmaku([{ content: 'aaa' }, { content: 'bbb' }], groupId);
    assert.deepEqual(
      { added: r.added, skipped: r.skipped, invalid: r.invalid },
      { added: 2, skipped: 0, invalid: 0 },
    );
    const list = await store.listDanmaku({ groupId });
    assert.equal(list.total, 2);
    assert.equal(list.items[0]?.platform, 'douyu');
  });

  it('同组内按内容去重：重复条目计 skipped', async () => {
    const { store, groupId } = await setup();
    await store.importFavoriteDanmaku([{ content: 'x' }], groupId);
    const r = await store.importFavoriteDanmaku([{ content: 'x' }, { content: 'y' }], groupId);
    assert.deepEqual({ added: r.added, skipped: r.skipped }, { added: 1, skipped: 1 });
  });

  it('空内容与超长内容计 invalid（不落库）', async () => {
    const { store, groupId } = await setup();
    const r = await store.importFavoriteDanmaku(
      [{ content: '' }, { content: 'a'.repeat(DANMAKU_MAX_LENGTH + 1) }, { content: 'ok' }],
      groupId,
    );
    assert.deepEqual({ added: r.added, invalid: r.invalid }, { added: 1, invalid: 2 });
  });

  it('目标分组不存在时抛 NOT_FOUND，零写入', async () => {
    const { store } = await setup();
    await assert.rejects(
      () => store.importFavoriteDanmaku([{ content: 'a' }], 'g_not_exist'),
      (err: { code?: string }) => err.code === 'NOT_FOUND',
    );
  });

  it('全 invalid 时零落盘（守卫 batch.length>0 生效）', async () => {
    const { store, groupId } = await setup();
    const r = await store.importFavoriteDanmaku(
      [{ content: '' }, { content: 'a'.repeat(DANMAKU_MAX_LENGTH + 1) }],
      groupId,
    );
    assert.deepEqual({ added: r.added, invalid: r.invalid }, { added: 0, invalid: 2 });
    assert.equal((await store.listDanmaku({ groupId })).total, 0);
  });

  it('全 skipped 时零落盘，总量不变', async () => {
    const { store, groupId } = await setup();
    await store.importFavoriteDanmaku([{ content: '已有' }], groupId);
    const r = await store.importFavoriteDanmaku([{ content: '已有' }], groupId);
    assert.deepEqual({ added: r.added, skipped: r.skipped }, { added: 0, skipped: 1 });
    assert.equal((await store.listDanmaku({ groupId })).total, 1);
  });
});
