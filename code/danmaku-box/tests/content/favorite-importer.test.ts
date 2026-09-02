import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFavoriteResponse, probeDouyuLogin } from '../../src/content/favorite-importer.ts';
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

  it('list 条目为非对象（字符串）时安全兜底为空对象', () => {
    const list = parseFavoriteResponse({ data: { list: ['abc', 123] } });
    assert.equal(list.length, 2);
    assert.equal(list[0]?.content, '');
    assert.equal(list[1]?.content, '');
  });

  it('type/id 为非 number（如字符串）时置 undefined', () => {
    const items = parseFavoriteResponse({ data: { list: [{ content: 'x', type: '2', id: '101' }] } });
    assert.equal(items[0]?.type, undefined);
    assert.equal(items[0]?.id, undefined);
  });
});

describe('probeDouyuLogin', () => {
  it('cookie 含 acf_uid 判定已登录（2026-09-02 实测登录态含该键）', () => {
    assert.equal(probeDouyuLogin('foo=1; acf_uid=2154363; dy_did=x'), true);
  });

  it('仅游客 cookie（dy_did/acf_did）判定未登录', () => {
    assert.equal(probeDouyuLogin('dy_did=abc; acf_did=xyz'), false);
  });

  it('空 cookie 判定未登录', () => {
    assert.equal(probeDouyuLogin(''), false);
  });
});