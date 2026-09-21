// 抖音适配器 DouyinAdapter（PRD-douyin-adapter V1.0 / selector-dict 2026-09-21）。
// 登录态双形态兼容（FR-D01）：已登录时输入框 [contenteditable=true] 存在；未登录
// 时输入框不渲染、被登录提示条 .cjR8oGui 替代。故 probe 必需锚点是「输入框 **或**
// 提示条」二选一，任一存在即适配存活；弹幕列表随 WebSocket 延迟渲染，列为可选锚点。

import type { ExtractResult, FillResult, ProbeResult, SiteAdapter } from './types.ts';
import { buildFillText } from '../build-fill-text.ts';

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

// 抖音输入框字数上限（Q-D1 未实测，抖音专属占位，独立于斗鱼 DANMAKU_MAX_LENGTH；
// 值同源于巧合，Task 0 实测对齐后回填此常量）。
export const DOUYIN_MAX_LENGTH = 50;

export interface DouyinAdapterDeps {
  doc?: Document;
  location?: Pick<Location, 'pathname'>;
  reactWrite?: (input: HTMLElement, text: string) => boolean;
}

const notImpl = (): never => {
  throw new Error('not implemented');
};

/** 默认 React 受控写入（Task 0 实测定稿：execCommand('insertText') 覆盖全选区，React 感知；
 *  直写 innerText + input 事件抖音不感知，不可照搬斗鱼范式）。
 *  注：写路径作用于真实 window/document（非 deps.doc）——生产环境 deps.doc===document、
 *  未注入 reactWrite 时行为正确；测试一律注入 reactWrite spy，本默认实现不单测。 */
function defaultReactWrite(input: HTMLElement, text: string): boolean {
  input.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(input);
  sel?.removeAllRanges();
  sel?.addRange(range);
  return document.execCommand('insertText', false, text);
}

export function createDouyinAdapter(deps: DouyinAdapterDeps = {}): SiteAdapter {
  const doc = () => deps.doc ?? document;
  const location = () => deps.location ?? window.location;
  const reactWrite = deps.reactWrite ?? defaultReactWrite;

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

    findDanmakuItem(target: Element): Element | null {
      // FR-D02：命中条目本身；非空过滤排除虚拟列表空占位（纯表情含 img 仍命中）
      const item = target.closest(SELECTORS.item);
      if (
        item &&
        ((item.textContent ?? '').trim() !== '' || item.querySelector('img, svg') !== null)
      ) {
        return item;
      }
      return null;
    },

    extract(item: Element): ExtractResult {
      // 仅取文本锚点，不回退 textContent（条目 textContent 含昵称，会污染收藏）。
      // 无文本锚点 → 空串（表情/占位）：纯表情 text='' + hasRichContent=true。
      const textAnchor = item.querySelector(SELECTORS.text);
      const text = textAnchor ? (textAnchor.textContent ?? '').trim() : '';
      const hasRichContent = item.querySelector('img, svg') !== null;
      return { text, hasRichContent };
    },
    locateInput(): HTMLElement | null {
      return doc().querySelector<HTMLElement>(SELECTORS.input);
    },

    fill(incoming: string, mode: 'replace' | 'append'): FillResult {
      const input = this.locateInput();
      // FR-D03：未登录输入框不渲染 → NEED_LOGIN 引导；其余无目标/空文本 → NO_INPUT
      if (!input || incoming === '') {
        return this.getLoginState() === 'logged_out'
          ? { ok: false, truncated: false, reason: 'NEED_LOGIN' }
          : { ok: false, truncated: false, reason: 'NO_INPUT' };
      }
      const current = input.innerText;
      const { text, truncated } = buildFillText({
        current,
        incoming,
        mode,
        maxLength: DOUYIN_MAX_LENGTH,
      });
      const ok = reactWrite(input, text);
      return { ok, truncated };
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
