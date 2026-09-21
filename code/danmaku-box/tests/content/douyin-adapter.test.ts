import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDouyinAdapter } from '../../src/content/adapters/douyin.ts';

const I = '.webcast-chatroom___input-container [contenteditable=true]';
const H = '.cjR8oGui';
const L = '.webcast-chatroom___list';

function fakeRoot(present: string[]): Document {
  return {
    querySelector: (sel: string) => (present.includes(sel) ? {} : null),
  } as unknown as Document;
}

function fakeDoc(kind: 'input' | 'hint' | 'none' | 'both'): Document {
  return {
    querySelector: (sel: string) => {
      if (sel === I && (kind === 'input' || kind === 'both')) return {} as HTMLElement;
      if (sel === H && (kind === 'hint' || kind === 'both')) return {} as HTMLElement;
      return null;
    },
  } as unknown as Document;
}

describe('DouyinAdapter.probe 双态锚点（FR-D01 / GD5）', () => {
  it('输入框存在（已登录）→ ok，提示条记为 missing', () => {
    const p = createDouyinAdapter().probe(fakeRoot([I]));
    assert.equal(p.ok, true, '输入框为必需锚点二选一之一');
    assert.deepEqual(p.missing, [H, L]);
  });

  it('登录提示条存在（未登录）→ ok（必需锚点二选一降级）', () => {
    const p = createDouyinAdapter().probe(fakeRoot([H]));
    assert.equal(p.ok, true, '未登录无输入框，须以提示条兜底');
    assert.deepEqual(p.missing, [I, L]);
  });

  it('双锚点均缺失 → adapter_down', () => {
    const p = createDouyinAdapter().probe(fakeRoot([]));
    assert.equal(p.ok, false);
    assert.deepEqual(p.missing, [I, H, L]);
  });

  it('必需锚点齐全，列表单独缺失 → ok 且列表仅记录（缺失不判失效）', () => {
    const p = createDouyinAdapter().probe(fakeRoot([I, H]));
    assert.equal(p.ok, true);
    assert.deepEqual(p.missing, [L]);
  });
});

describe('DouyinAdapter.getLoginState 真实两态判定（FR-D01，与斗鱼分叉）', () => {
  it('输入框存在 → logged_in', () => {
    assert.equal(createDouyinAdapter({ doc: fakeDoc('input') }).getLoginState(), 'logged_in');
  });

  it('登录提示条存在 → logged_out', () => {
    assert.equal(createDouyinAdapter({ doc: fakeDoc('hint') }).getLoginState(), 'logged_out');
  });

  it('双锚点均缺失 → unknown', () => {
    assert.equal(createDouyinAdapter({ doc: fakeDoc('none') }).getLoginState(), 'unknown');
  });
});

describe('DouyinAdapter.isLiveRoom 直播间 URL 判定（FR-D01 / AC-D08）', () => {
  const loc = (pathname: string) => ({ pathname }) as Location;
  const adapter = createDouyinAdapter({ location: loc('/') });

  it('纯数字首段 = 直播间（如 /492632285289）', () => {
    assert.equal(
      createDouyinAdapter({ location: loc('/492632285289') }).isLiveRoom(loc('/492632285289')),
      true,
    );
  });

  it('非直播间（首页/目录/搜索等）→ false', () => {
    assert.equal(adapter.isLiveRoom(loc('/')), false, '首页不判定');
    assert.equal(adapter.isLiveRoom(loc('/search')), false, '搜索不判定');
    assert.equal(adapter.isLiveRoom(loc('/user/abc')), false, '用户页不判定');
  });
});
