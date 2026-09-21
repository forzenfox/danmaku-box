import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Manifest 白名单契约测试：host_permissions / content_scripts / web_accessible_resources
// 三处必须同时放行 douyin 与 douyu，否则抖音直播页无法注入 content script、
// 面板 iframe 资源在抖音域不可用。

interface Manifest {
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