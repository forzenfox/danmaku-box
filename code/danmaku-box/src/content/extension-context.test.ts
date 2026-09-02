// danmaku-box/src/content/extension-context.test.ts
// TDD Task 1（红）：覆盖 isContextValid + safeSendMessage。
// 全部使用依赖注入（api: typeof chrome），不依赖真实 chrome 全局。

import test from 'node:test';
import assert from 'node:assert/strict';
import { isContextValid, safeSendMessage } from './extension-context.ts';

/** 构造 fake chrome api：可控制 sendMessage 行为（resolve / reject / throw / 返回 undefined） */
function makeFakeChrome(opts: {
  id?: string;
  sendMessage?: (...args: unknown[]) => unknown;
}): typeof chrome {
  const sendMessage = opts.sendMessage ?? (() => Promise.resolve({ ok: true }));
  return {
    runtime: {
      id: opts.id,
      sendMessage: sendMessage as unknown as typeof chrome.runtime.sendMessage,
    },
  } as unknown as typeof chrome;
}

test('isContextValid: api 缺失 → false', () => {
  assert.equal(isContextValid(undefined), false);
  assert.equal(isContextValid(null), false);
});

test('isContextValid: chrome.runtime 缺失 → false', () => {
  assert.equal(isContextValid({} as typeof chrome), false);
});

test('isContextValid: chrome.runtime.id 缺失 → false', () => {
  assert.equal(isContextValid({ runtime: {} } as unknown as typeof chrome), false);
});

test('isContextValid: chrome.runtime.id 存在 → true', () => {
  assert.equal(isContextValid({ runtime: { id: 'ext-abc' } } as unknown as typeof chrome), true);
});

test('safeSendMessage: 正常返回 Result.ok（透传 sendMessage 响应）', async () => {
  const api = makeFakeChrome({
    id: 'ext-abc',
    sendMessage: () => Promise.resolve({ ok: true, value: 42 }),
  });
  const r = await safeSendMessage<{ value: number }>(api, { type: 'X' });
  assert.deepEqual(r, { ok: true, value: 42 });
});

test('safeSendMessage: sendMessage 同步抛出 "Extension context invalidated" → 捕获并返回 CONTEXT_INVALIDATED', async () => {
  const api = makeFakeChrome({
    id: 'ext-abc',
    sendMessage: () => {
      throw new Error('Extension context invalidated.');
    },
  });
  const r = await safeSendMessage(api, { type: 'X' });
  assert.equal(r.ok, false);
  assert.equal(r.error?.code, 'CONTEXT_INVALIDATED');
});

test('safeSendMessage: sendMessage 同步抛出其他 Error → 捕获并返回 SEND_FAILED', async () => {
  const api = makeFakeChrome({
    id: 'ext-abc',
    sendMessage: () => {
      throw new Error('Some other error');
    },
  });
  const r = await safeSendMessage(api, { type: 'X' });
  assert.equal(r.ok, false);
  assert.equal(r.error?.code, 'SEND_FAILED');
});

test('safeSendMessage: sendMessage 返回 undefined（无监听者） → NO_RESPONSE', async () => {
  const api = makeFakeChrome({
    id: 'ext-abc',
    sendMessage: () => Promise.resolve(undefined),
  });
  const r = await safeSendMessage(api, { type: 'X' });
  assert.equal(r.ok, false);
  assert.equal(r.error?.code, 'NO_RESPONSE');
});

test('safeSendMessage: sendMessage reject → SEND_FAILED', async () => {
  const api = makeFakeChrome({
    id: 'ext-abc',
    sendMessage: () => Promise.reject(new Error('network down')),
  });
  const r = await safeSendMessage(api, { type: 'X' });
  assert.equal(r.ok, false);
  assert.equal(r.error?.code, 'SEND_FAILED');
});

test('safeSendMessage: 启动前 context 已失效（id 缺失）→ 立即返回 CONTEXT_INVALIDATED，不调用 sendMessage', async () => {
  let called = false;
  const api = makeFakeChrome({
    id: undefined,
    sendMessage: () => {
      called = true;
      return Promise.resolve({ ok: true });
    },
  });
  const r = await safeSendMessage(api, { type: 'X' });
  assert.equal(r.ok, false);
  assert.equal(r.error?.code, 'CONTEXT_INVALIDATED');
  assert.equal(called, false, '不应调用 sendMessage');
});
