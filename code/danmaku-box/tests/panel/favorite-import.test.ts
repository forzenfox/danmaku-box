import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAVORITE_EMPTY_HINT,
  favoriteImportHint,
  favoriteImportSummary,
} from '../../src/panel/favorite-import.ts';

// 官方收藏导入面板文案映射（决策 2/3：无数据提示、未登录提示）。

describe('favoriteImportHint', () => {
  it('未登录错误码 → 提示先登录（决策 3）', () => {
    assert.equal(favoriteImportHint('NOT_LOGGED_IN'), '您还未登录斗鱼，请先在斗鱼官网登录后重试');
  });

  it('非斗鱼站点 → 提示在斗鱼直播间使用', () => {
    assert.equal(favoriteImportHint('SITE_UNSUPPORTED'), '请在斗鱼直播间页面打开面板后重试');
  });

  it('未知错误码 → 通用兜底文案', () => {
    assert.equal(favoriteImportHint('WEIRD'), '导入失败，请稍后重试');
    assert.equal(favoriteImportHint(undefined), '导入失败，请稍后重试');
  });

  it('通用读/写错误码 → 与面板 errorText 一致的提示', () => {
    assert.equal(favoriteImportHint('READ_FAILED'), '本地数据读取失败，请重试');
    assert.equal(favoriteImportHint('WRITE_FAILED'), '写入失败，请重试');
  });
});

describe('favoriteImportSummary', () => {
  it('有跳过时展示新增/跳过', () => {
    assert.equal(
      favoriteImportSummary({ added: 5, skipped: 3, invalid: 0 }),
      '已导入 5 条，跳过 3 条',
    );
  });

  it('全部跳过时展示新增 0 与跳过数', () => {
    assert.equal(
      favoriteImportSummary({ added: 0, skipped: 2, invalid: 0 }),
      '已导入 0 条，跳过 2 条',
    );
  });

  it('全部归零提示官方无新增', () => {
    assert.equal(
      favoriteImportSummary({ added: 0, skipped: 0, invalid: 0 }),
      '官方收藏已全部存在，无需导入',
    );
  });

  it('无效条目提示', () => {
    assert.equal(
      favoriteImportSummary({ added: 1, skipped: 0, invalid: 2 }),
      '已导入 1 条，跳过 0 条，2 条内容无效',
    );
  });
});

describe('FAVORITE_EMPTY_HINT（决策 2：官方无数据提示）', () => {
  it('文案为「官方暂无收藏弹幕」', () => {
    assert.equal(FAVORITE_EMPTY_HINT, '官方暂无收藏弹幕');
  });
});
