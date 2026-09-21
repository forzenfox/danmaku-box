// 抖音适配器 DouyinAdapter（PRD-douyin-adapter V1.0 / selector-dict 2026-09-21）。
// 登录态双形态兼容（FR-D01）：已登录时输入框 [contenteditable=true] 存在；未登录
// 时输入框不渲染、被登录提示条 .cjR8oGui 替代。故 probe 必需锚点是「输入框 **或**
// 提示条」二选一，任一存在即适配存活；弹幕列表随 WebSocket 延迟渲染，列为可选锚点。

import type { ExtractResult, FillResult, ProbeResult, SiteAdapter } from './types.ts';

const SELECTORS = {
  chatroom: '.webcast-chatroom',
  list: '.webcast-chatroom___list',
  item: '.webcast-chatroom___item',
  text: '.webcast-chatroom___content-with-emoji-text',
  emoji: '.webcast-chatroom___content-with-emoji-emoji',
  inputContainer: '.webcast-chatroom___input-container',
  input: '.webcast-chatroom___input-container [contenteditable=true]',
  loginHint: '.cjR8oGui',
};

export const DOUYIN_MAX_LENGTH = 50;

export interface DouyinAdapterDeps {
  doc?: Document;
  location?: Pick<Location, 'pathname'>;
  reactWrite?: (input: HTMLElement, text: string) => boolean;
}

const notImpl = (): never => {
  throw new Error('not implemented');
};

export function createDouyinAdapter(deps: DouyinAdapterDeps = {}): SiteAdapter {
  const doc = () => deps.doc ?? document;
  const location = () => deps.location ?? window.location;

  return {
    site: 'douyin',

    isLiveRoom(loc: Pick<Location, 'pathname'>): boolean {
      const seg = loc.pathname.split('/').filter(Boolean)[0] ?? '';
      return /^\d+$/.test(seg);
    },

    probe(root: Document | HTMLElement): ProbeResult {
      const input = root.querySelector(SELECTORS.input);
      const loginHint = root.querySelector(SELECTORS.loginHint);
      const list = root.querySelector(SELECTORS.list);
      const missing: string[] = [];
      if (!input) missing.push(SELECTORS.input);
      if (!loginHint) missing.push(SELECTORS.loginHint);
      if (!list) missing.push(SELECTORS.list);
      return { ok: input !== null || loginHint !== null, missing };
    },

    findDanmakuItem(_target: Element): Element | null {
      return notImpl();
    },
    extract(_item: Element): ExtractResult {
      return notImpl();
    },
    locateInput(): HTMLElement | null {
      return notImpl();
    },
    fill(_incoming: string, _mode: 'replace' | 'append'): FillResult {
      return notImpl();
    },
    pauseDanmu(_target?: Element): void {
      return notImpl();
    },
    resumeDanmu(_target?: Element): void {
      return notImpl();
    },

    getLoginState(): 'logged_in' | 'logged_out' | 'unknown' {
      const d = doc();
      if (d.querySelector(SELECTORS.input)) return 'logged_in';
      if (d.querySelector(SELECTORS.loginHint)) return 'logged_out';
      return 'unknown';
    },

    getRoomId(): string {
      const seg = location().pathname.split('/').filter(Boolean)[0];
      return seg ?? '';
    },
  };
}