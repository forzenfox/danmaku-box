import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeMenuPosition } from '../../src/content/menu-position.ts';

// 右键菜单定位（原型设计 V0.2 3.1.2）：默认点击坐标右下方弹出，
// 自动避让视口边缘（右溢出翻转左侧、下溢出翻转上方），保留 8px 安全边距。

describe('computeMenuPosition 视口避让', () => {
  it('默认在点击坐标右下方弹出', () => {
    const pos = computeMenuPosition(
      100,
      100,
      { width: 180, height: 220 },
      { width: 1280, height: 800 },
    );
    assert.deepEqual(pos, { left: 102, top: 102 });
  });

  it('右侧溢出时翻转到点击坐标左侧', () => {
    const pos = computeMenuPosition(
      1200,
      100,
      { width: 180, height: 220 },
      { width: 1280, height: 800 },
    );
    assert.equal(pos.left, 1200 - 180 - 2);
  });

  it('下方溢出时翻转到点击坐标上方', () => {
    const pos = computeMenuPosition(
      100,
      700,
      { width: 180, height: 220 },
      { width: 1280, height: 800 },
    );
    assert.equal(pos.top, 700 - 220 - 2);
  });

  it('右下同时溢出时双向翻转', () => {
    const pos = computeMenuPosition(
      1200,
      700,
      { width: 180, height: 220 },
      { width: 1280, height: 800 },
    );
    assert.equal(pos.left, 1200 - 180 - 2);
    assert.equal(pos.top, 700 - 220 - 2);
  });

  it('翻转后仍不足时贴安全边距（不出现负坐标）', () => {
    const pos = computeMenuPosition(5, 5, { width: 180, height: 220 }, { width: 200, height: 240 });
    assert.equal(pos.left, 8);
    assert.equal(pos.top, 8);
  });
});
