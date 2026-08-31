// 右键菜单视口避让定位（原型设计 V0.2 3.1.2，纯函数便于测试）。
// 规则：默认点击坐标右下方弹出；右溢出翻左侧、下溢出翻上方；任何方向保留 8px 安全边距。

export interface MenuSize {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

const MARGIN = 8;
const OFFSET = 2;

export function computeMenuPosition(
  x: number,
  y: number,
  size: MenuSize,
  viewport: Viewport,
): { left: number; top: number } {
  let left = x + OFFSET;
  let top = y + OFFSET;
  if (left + size.width > viewport.width - MARGIN) {
    left = x - size.width - OFFSET;
  }
  if (top + size.height > viewport.height - MARGIN) {
    top = y - size.height - OFFSET;
  }
  left = Math.max(MARGIN, left);
  top = Math.max(MARGIN, top);
  return { left, top };
}
