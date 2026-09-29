import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Manifest 白名单契约测试：host_permissions / content_scripts / web_accessible_resources
// 三处必须同时放行 douyin 与 douyu，否则抖音直播页无法注入 content script、
// 面板 iframe 资源在抖音域不可用。

interface Manifest {
  permissions: string[];
  action?: { default_title?: string; default_icon?: Record<string, string> };
  host_permissions: string[];
  content_scripts: { matches: string[] }[];
  web_accessible_resources: { matches: string[] }[];
}

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/manifest.json', import.meta.url)), 'utf8'),
) as Manifest;

describe('manifest 注入白名单', () => {
  const hasDouyin = (patterns: string[]): boolean => patterns.some((p) => p.includes('douyin.com'));
  const hasDouyu = (patterns: string[]): boolean => patterns.some((p) => p.includes('douyu.com'));

  it('host_permissions 同时包含 douyin 与 douyu', () => {
    assert.ok(hasDouyin(manifest.host_permissions), 'host_permissions 缺少 douyin');
    assert.ok(hasDouyu(manifest.host_permissions), 'host_permissions 缺少 douyu');
  });

  it('content_scripts[0].matches 同时包含 douyin 与 douyu', () => {
    const matches = manifest.content_scripts[0]?.matches ?? [];
    assert.ok(hasDouyin(matches), 'content_scripts[0].matches 缺少 douyin');
    assert.ok(hasDouyu(matches), 'content_scripts[0].matches 缺少 douyu');
  });

  it('web_accessible_resources[0].matches 同时包含 douyin 与 douyu', () => {
    const matches = manifest.web_accessible_resources[0]?.matches ?? [];
    assert.ok(hasDouyin(matches), 'web_accessible_resources[0].matches 缺少 douyin');
    assert.ok(hasDouyu(matches), 'web_accessible_resources[0].matches 缺少 douyu');
  });
});

// Edge 上架契约（2026-09-28）：
// 1. Edge 官方要求先声明 `action` 才能通过工具栏图标打开侧边栏（setPanelBehavior 依赖），
//    否则背景页的 openPanelOnActionClick 调用无效；
// 2. `tabs` 权限已无用例：活动标签页路由只用 tabId + 会话映射，不读取 tab.url，
//    最小权限原则下必须移除（减少商店审核问询点）。
describe('manifest Edge 上架契约', () => {
  it('声明 action.default_title 与 16/32/48 图标', () => {
    assert.ok(manifest.action, '缺少 action：Edge 工具栏图标/快捷键无法打开侧边栏');
    assert.ok(
      typeof manifest.action?.default_title === 'string' &&
        manifest.action.default_title.length > 0,
      'action.default_title 必须为非空字符串',
    );
    for (const size of ['16', '32', '48']) {
      assert.equal(
        manifest.action?.default_icon?.[size],
        `icons/icon${size}.png`,
        `action.default_icon 缺少 ${size} 尺寸`,
      );
    }
  });

  it('permissions 保留 storage 与 sidePanel', () => {
    assert.ok(manifest.permissions.includes('storage'), 'permissions 缺少 storage');
    assert.ok(manifest.permissions.includes('sidePanel'), 'permissions 缺少 sidePanel');
  });

  it('permissions 不包含 tabs（最小权限）', () => {
    assert.ok(!manifest.permissions.includes('tabs'), 'tabs 无实际用例，不得声明');
  });
});
