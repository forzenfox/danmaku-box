import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMenuHost } from '../../src/content/menu-host.ts';

// 全屏宿主迁移（专项 PRD FR-V05）：菜单 Shadow 宿主默认挂 documentElement，
// 视频全屏时不在全屏渲染树内 → 菜单不可见。fullscreenchange 时迁入/迁回。
// fake doc 模拟真实 DOM 的移动式 appendChild 与 isConnected 语义。

interface FakeShadow {
  children: FakeNode[];
  appendChild(c: FakeNode): FakeNode;
}

interface FakeNode {
  name: string;
  children: FakeNode[];
  parentElement: FakeNode | null;
  isConnected: boolean;
  dataset: Record<string, string>;
  textContent?: string;
  appendChild(c: FakeNode): FakeNode;
  createElement(tag: string): FakeNode;
  attachShadow?(): FakeShadow;
}

interface FakeDoc extends FakeNode {
  documentElement: FakeNode;
  fullscreenElement: FakeNode | null;
}

function fakeNode(name: string): FakeNode {
  const node: FakeNode = {
    name,
    children: [],
    parentElement: null,
    isConnected: false,
    dataset: {},
    appendChild(c: FakeNode) {
      // 移动语义：先从旧父移除，再加入新父
      if (c.parentElement && c.parentElement.children) {
        c.parentElement.children = c.parentElement.children.filter((x) => x !== c);
      }
      c.parentElement = this;
      c.isConnected = true;
      this.children.push(c);
      return c;
    },
    createElement(tag: string) {
      const el = fakeNode(tag);
      el.attachShadow = () => {
        const shadow: FakeShadow = {
          children: [],
          appendChild(c: FakeNode) {
            shadow.children.push(c);
            return c;
          },
        };
        return shadow;
      };
      return el;
    },
  };
  return node;
}

function fakeDoc() {
  const doc = fakeNode('doc') as FakeDoc;
  doc.documentElement = fakeNode('html');
  doc.fullscreenElement = null;
  doc.createElement = (tag: string) => doc.documentElement.createElement(tag);
  return doc;
}

describe('createMenuHost 全屏迁移', () => {
  it('ensureShadow：宿主挂 documentElement', () => {
    const doc = fakeDoc();
    const host = createMenuHost(doc as unknown as Document, 'x');
    host.ensureShadow();
    assert.equal(doc.documentElement.children.length, 1);
  });

  it('进入全屏 → migrate 把宿主迁入全屏元素', () => {
    const doc = fakeDoc();
    const host = createMenuHost(doc as unknown as Document, 'x');
    host.ensureShadow();
    const fsEl = fakeNode('video-wrap');
    doc.fullscreenElement = fsEl;
    host.migrate();
    assert.equal(fsEl.children.length, 1, '宿主应迁入全屏元素');
    assert.equal(doc.documentElement.children.length, 0, 'documentElement 应不再持有宿主');
  });

  it('退出全屏 → migrate 迁回 documentElement', () => {
    const doc = fakeDoc();
    const host = createMenuHost(doc as unknown as Document, 'x');
    host.ensureShadow();
    const fsEl = fakeNode('video-wrap');
    doc.fullscreenElement = fsEl;
    host.migrate();
    doc.fullscreenElement = null;
    host.migrate();
    assert.equal(doc.documentElement.children.length, 1);
    assert.equal(fsEl.children.length, 0);
  });

  it('宿主已在目标位置 → migrate 不重复搬动', () => {
    const doc = fakeDoc();
    const host = createMenuHost(doc as unknown as Document, 'x');
    host.ensureShadow();
    host.migrate(); // 目标仍是 documentElement，宿主已在
    assert.equal(doc.documentElement.children.length, 1);
  });

  it('ensureShadow 幂等（同一 ShadowRoot 复用）', () => {
    const doc = fakeDoc();
    const host = createMenuHost(doc as unknown as Document, 'x');
    assert.equal(host.ensureShadow(), host.ensureShadow());
  });
});
