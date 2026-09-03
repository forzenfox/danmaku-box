// danmaku-box/src/panel/visibility-refresher.test.ts
// TDD（红→绿）：文档重新可见 / 窗口聚焦 → 去重触发 onShow（跨 tab 同步补刷信号）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisibilityRefresher, type VisibilityRefresherDeps } from './visibility-refresher.ts';

/** 事件源桩：记录监听器、支持手动派发 */
interface EventSourceLike {
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
  fire(type: string): void;
  has(type: string): boolean;
  count(type: string): number;
}

function makeEventSource(): EventSourceLike {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    addEventListener: (type, fn) => {
      (listeners[type] ??= []).push(fn);
    },
    removeEventListener: (type, fn) => {
      const arr = listeners[type] ?? [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    fire: (type) => {
      for (const fn of listeners[type] ?? []) fn();
    },
    has: (type) => (listeners[type] ?? []).length > 0,
    count: (type) => (listeners[type] ?? []).length,
  };
}

/** 装配 harness：box.visible 控制 visibilityState 桩 */
function makeHarness(): {
  box: { visible: boolean };
  doc: EventSourceLike;
  win: EventSourceLike;
  deps: VisibilityRefresherDeps;
  fired: () => number;
} {
  const box = { visible: false };
  const doc = makeEventSource();
  const win = makeEventSource();
  let fired = 0;
  const deps: VisibilityRefresherDeps = {
    doc: {
      addEventListener: (type, fn) => doc.addEventListener(type, fn),
      removeEventListener: (type, fn) => doc.removeEventListener(type, fn),
      get visibilityState() {
        return box.visible ? 'visible' : 'hidden';
      },
    },
    win,
    onShow: () => {
      fired += 1;
    },
  };
  return { box, doc, win, deps, fired: () => fired };
}

test('hidden→visible 的 visibilitychange：防抖窗口后触发一次 onShow', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { box, doc, deps, fired } = makeHarness();
  const r = createVisibilityRefresher(deps);
  r.mount();

  doc.fire('visibilitychange'); // 仍 hidden：不触发
  t.mock.timers.tick(350);
  assert.equal(fired(), 0, 'hidden 态派发不触发');

  box.visible = true;
  doc.fire('visibilitychange'); // hidden→visible：安排刷新
  assert.equal(fired(), 0, '防抖窗口内未到触发点');
  t.mock.timers.tick(350);
  assert.equal(fired(), 1, '窗口结束触发一次');
});

test('防抖合并：可见期间连击（visibilitychange + focus）只触发一次', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { box, doc, win, deps, fired } = makeHarness();
  const r = createVisibilityRefresher(deps);
  r.mount();
  box.visible = true;
  doc.fire('visibilitychange');
  doc.fire('visibilitychange');
  win.fire('focus');
  t.mock.timers.tick(350);
  assert.equal(fired(), 1, '连击合并为一次');
  // 窗口结束后再触发一次，重新安排
  box.visible = false;
  doc.fire('visibilitychange'); // hidden：不计
  box.visible = true;
  doc.fire('visibilitychange');
  t.mock.timers.tick(350);
  assert.equal(fired(), 2, '窗口结束后可再次触发');
});

test('窗口聚焦（文档可见）也作为重新可见信号', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { box, win, deps, fired } = makeHarness();
  const r = createVisibilityRefresher(deps);
  r.mount();
  box.visible = true;
  win.fire('focus');
  assert.equal(fired(), 0, '防抖内');
  t.mock.timers.tick(350);
  assert.equal(fired(), 1, 'focus 触发刷新');
});

test('mount 即可见不自动触发（避免与初始化 loadList 重复）', () => {
  const { box, deps, fired } = makeHarness();
  box.visible = true;
  const r = createVisibilityRefresher(deps);
  r.mount();
  assert.equal(fired(), 0, 'mount 不因当前可见而自发 onShow');
});

test('dispose 移除监听并清除 pending 定时器', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { box, doc, win, deps, fired } = makeHarness();
  const r = createVisibilityRefresher(deps);
  r.mount();
  assert.equal(doc.count('visibilitychange'), 1);
  assert.equal(win.count('focus'), 1);
  box.visible = true;
  doc.fire('visibilitychange'); // 安排 pending
  r.dispose();
  assert.equal(doc.count('visibilitychange'), 0, 'dispose 移除 doc 监听');
  assert.equal(win.count('focus'), 0, 'dispose 移除 win 监听');
  t.mock.timers.tick(1000);
  assert.equal(fired(), 0, 'dispose 后 pending 定时器不触发 onShow');
  r.dispose(); // 幂等
});
