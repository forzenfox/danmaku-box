// danmaku-box/tests/content/site-detector.test.ts
// SiteDetector 直播间判定（走查反馈修正）：非直播间 douyu.com 页面必须返回 null，
// 否则 content script 会挂载抽屉把手（蓝色按钮）与右键菜单。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSiteDetector } from '../../src/content/site-detector.ts';
import { createDouyuAdapter } from '../../src/content/adapters/douyu.ts';
import { createDouyinAdapter } from '../../src/content/adapters/douyin.ts';

const detector = createSiteDetector({ douyu: createDouyuAdapter() });

/** 伪根节点：直播间判定通过后 probe 需要 input 锚点存在，返回 ok */
const fakeRoot = { querySelector: () => ({}) } as unknown as Document;

function loc(hostname: string, pathname: string) {
  return { hostname, pathname } as Location;
}

describe('SiteDetector 只对直播间 URL 返回 DetectedSite', () => {
  it('www.douyu.com/<房间号> → DetectedSite + ok', () => {
    const d = detector.detect(loc('www.douyu.com', '/1126960'), fakeRoot);
    assert.ok(d, '直播间应被识别');
    assert.equal(d.site, 'douyu');
    assert.equal(d.status, 'ok');
  });

  it('douyu.com 非直播间页面 → null（不挂载抽屉/菜单）', () => {
    assert.equal(detector.detect(loc('www.douyu.com', '/'), fakeRoot), null, '首页不注入');
    assert.equal(detector.detect(loc('www.douyu.com', '/g_yz'), fakeRoot), null, '分类目录不注入');
    assert.equal(
      detector.detect(loc('www.zz.douyu.com', '/p/abc'), fakeRoot),
      null,
      '个人页不注入',
    );
  });

  it('非 douyu 域名 → null（保持静默退出）', () => {
    assert.equal(detector.detect(loc('example.com', '/1126960'), fakeRoot), null);
  });
});

// ---------- SiteDetector 识别 douyin 直播间并装配 DouyinAdapter ----------
describe('SiteDetector douyin 域名', () => {
  const dyDetector = createSiteDetector({
    douyu: createDouyuAdapter(),
    douyin: createDouyinAdapter(),
  });

  it('live.douyin.com/<房间号> → DetectedSite + site=douyin', () => {
    const d = dyDetector.detect(loc('live.douyin.com', '/492632285289'), fakeRoot);
    assert.ok(d, '应识别抖音直播间');
    assert.equal(d.site, 'douyin');
    assert.equal(d.status, 'ok');
    assert.equal(d.adapter.site, 'douyin');
  });

  it('douyin.com 非直播间 URL → null（不挂载能力）', () => {
    assert.equal(dyDetector.detect(loc('www.douyin.com', '/'), fakeRoot), null, '首页不注入');
    assert.equal(dyDetector.detect(loc('www.douyin.com', '/search'), fakeRoot), null, '搜索不注入');
  });

  it('未装配 douyin 时 douyin 域名 → null（静默，不影响斗鱼）', () => {
    const solo = createSiteDetector({ douyu: createDouyuAdapter() });
    assert.equal(solo.detect(loc('live.douyin.com', '/492632285289'), fakeRoot), null);
  });
});
