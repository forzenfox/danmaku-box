import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFavoriteResponse } from '../../src/content/favorite-importer.ts';
import type { FavoriteItem } from '../../src/shared/types.ts';

// parseFavoriteResponse：将官方 bulletscreen/query 响应解析为条目数组。
// 合法结构 { data: { list: [{content, type, id}] } }；异常结构抛错（消息层映射 SOURCE_UNAVAILABLE）。

describe('parseFavoriteResponse', () => {
  it('解析合法响应：提取 content/type/id', () => {
    const raw = { error: 0, data: { list: [
      { content: '第一条', type: 2, id: 101 },
      { content: '第二条', type: 2, id: 102 },
    ] } };
    assert.deepEqual(parseFavoriteResponse(raw), [
      { content: '第一条', type: 2, id: 101 },
      { content: '第二条', type: 2, id: 102 },
    ]);
  });

  it('list 缺失时视为空收藏（返回空数组）', () => {
    assert.deepEqual(parseFavoriteResponse({ error: 0, data: {} }), []);
    assert.deepEqual(parseFavoriteResponse({ error: 1 }), []);
  });

  it('条目缺少 content 字段时以空字符串兜底', () => {
    const raw = { data: { list: [{ type: 2 }, { content: '有内容', type: 2 }] } };
    const items = parseFavoriteResponse(raw) as FavoriteItem[];
    assert.equal(items[0]?.content, '');
    assert.equal(items[1]?.content, '有内容');
  });

  it('非对象入参（null/字符串）抛 TypeError', () => {
    assert.throws(() => parseFavoriteResponse(null));
    assert.throws(() => parseFavoriteResponse('not-json'));
  });
});