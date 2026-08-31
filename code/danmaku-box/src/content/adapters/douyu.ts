// 斗鱼适配器 DouyuAdapter（技术方案 V0.2 8.2 / P3-P5 里程碑）。
// 选择器主干为 hi 级语义类名（《斗鱼 DOM 选择器字典》）：
// .Barrage-listItem（条目）、.Barrage-content（文本）、.ChatSend-txt（输入框）、
// .Barrage-list（列表）。
// 输入框双形态兼容（技术方案 8.2）：当前线上为 DIV+contenteditable，历史版本为
// textarea；两分支均保留。写入范式为实测验证的「写值 + 派发 input 事件」。

import { DANMAKU_MAX_LENGTH } from '../../shared/constants.ts';
import { buildFillText } from '../build-fill-text.ts';
import type { ExtractResult, FillResult, ProbeResult, SiteAdapter } from './types.ts';

const SELECTORS = {
  listItem: '.Barrage-listItem',
  content: '.Barrage-content',
  input: '.ChatSend-txt',
  list: '.Barrage-list, #js-barrage-list',
  danmuLayer: '[class*="danmu"]',
  danmuItem: '[class*="danmu-"]',
};

export function createDouyuAdapter(): SiteAdapter {
  return {
    site: 'douyu',

    probe(root: Document | HTMLElement): ProbeResult {
      // A：回填仅依赖输入框（必需锚点）；弹幕列表随 WebSocket 首条消息延迟渲染
      // （实测约 9s），列为可选锚点——缺失仅记录，不影响适配判定。
      const input = root.querySelector(SELECTORS.input);
      const list = root.querySelector(SELECTORS.list);
      const missing: string[] = [];
      if (!input) missing.push(SELECTORS.input);
      if (!list) missing.push(SELECTORS.list);
      // ok 只由必需锚点（输入框）决定；列表缺失不判适配失效
      return { ok: input !== null, missing };
    },

    findDanmakuItem(target: Element): Element | null {
      // 聊天区弹幕条目（静止可悬停）
      const chatItem = target.closest(SELECTORS.listItem);
      if (chatItem) return chatItem;
      // 飘屏弹幕：哈希类名 .danmu-*（2026.06 为 .danmu-e7f029，已变更 → 特征探测兜底，不硬编码）
      const danmu = target.closest(SELECTORS.danmuItem);
      if (danmu && (danmu.textContent ?? '').trim() !== '') return danmu;
      return null;
    },

    extract(item: Element): ExtractResult {
      const content = item.querySelector(SELECTORS.content);
      // 飘屏条目无 .Barrage-content，回退到元素自身文本
      const text = (content?.textContent ?? item.textContent ?? '').trim();
      // 富内容判定：条目内存在图片/表情等非文本元素（FR-01 边界）
      const hasRichContent = item.querySelector('img, svg') !== null;
      return { text, hasRichContent };
    },

    locateInput(): HTMLElement | null {
      return document.querySelector<HTMLElement>(SELECTORS.input);
    },

    fill(incoming: string, mode: 'replace' | 'append'): FillResult {
      const input = this.locateInput();
      if (!input || incoming === '') {
        return { ok: false, truncated: false, reason: 'NO_INPUT' };
      }

      // 双形态归一：contenteditable（当前线上）或 textarea（历史版本）
      const editable = input.isContentEditable;
      const current = editable
        ? (input as HTMLElement).innerText
        : (input as HTMLTextAreaElement).value;
      const { text, truncated } = buildFillText({
        current,
        incoming,
        mode,
        maxLength: DANMAKU_MAX_LENGTH,
      });

      if (editable) {
        // 实测范式：写 innerText + 派发 input 事件（React 受控组件可感知）
        (input as HTMLElement).innerText = text;
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      } else {
        const textarea = input as HTMLTextAreaElement;
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value',
        )?.set;
        if (setter) setter.call(textarea, text);
        else textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // 聚焦并置光标于末尾（PRD FR-04：回填后行为）
      input.focus();
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return { ok: true, truncated };
    },

    pauseDanmu(): void {
      // P5 里程碑实现（飘屏暂停-操作-恢复）
      document.querySelectorAll(SELECTORS.danmuLayer).forEach((el) => {
        (el as HTMLElement).style.setProperty('animation-play-state', 'paused');
      });
    },

    resumeDanmu(): void {
      document.querySelectorAll(SELECTORS.danmuLayer).forEach((el) => {
        (el as HTMLElement).style.removeProperty('animation-play-state');
      });
    },

    getLoginState(): 'unknown' {
      // 斗鱼未登录亦可收藏与回填（实地验证），无需登录态检测
      return 'unknown';
    },

    getRoomId(): string {
      // 直播间 URL 形如 /1234567 或 /topic/xxx；取首个路径段
      const seg = window.location.pathname.split('/').filter(Boolean)[0];
      return seg ?? '';
    },
  };
}
