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
  // 飘屏（2026-09-17 实测修正）：命中目标为弹幕项本身，层容器 pointer-events:none
  // 永不成为事件目标；宽选择器 [class*="danmu"] 会误命中 .danmudiv-* 等原生面板类名。
  danmuItem: '[class*="danmuItem"]',
  danmuText: '[class*="textWrap"]',
};

// 冻结记录：元素 → 暂停时刻的 uuid 与 Animation 引用。
// 持有 Animation 对象而非仅元素，配合 uuid 校验规避对象池复用竞态（实测：同元素
// 1.5s 内 uuid 与文本均已更换）。WeakMap 使被回收元素自动出账，无泄漏。
const frozenAnims = new WeakMap<Element, { uuid: string | null; anims: Animation[] }>();

export function createDouyuAdapter(): SiteAdapter {
  return {
    site: 'douyu',

    isLiveRoom(location: Pick<Location, 'pathname'>): boolean {
      // 直播间 URL 形如 /1126960（首段纯数字）；首页/分类目录/个人页/专题页均非直播间
      const seg = location.pathname.split('/').filter(Boolean)[0] ?? '';
      return /^\d+$/.test(seg);
    },

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
      // 飘屏弹幕项本身（特征探测，哈希后缀易变不硬编码）；层容器不在此结构链上。
      // 非空过滤旨在排除对象池的空占位项；纯表情（无文本但含 img/svg）仍可命中
      // （FR-V02：菜单照出、复制置灰、收藏保存空文本条目）。
      const danmu = target.closest(SELECTORS.danmuItem);
      if (
        danmu &&
        ((danmu.textContent ?? '').trim() !== '' || danmu.querySelector('img, svg') !== null)
      ) {
        return danmu;
      }
      return null;
    },

    extract(item: Element): ExtractResult {
      // 聊天区：.Barrage-content（精确锚点，先查）；飘屏：textWrap 纯文本节点；
      // 均缺失回退自身文本。两选择器对各自路径互斥（飘屏项无 .Barrage-content），
      // 先精确后宽泛可消除聊天条目后代含 textWrap 类名时的误提取隐患。
      const source =
        item.querySelector(SELECTORS.content) ?? item.querySelector(SELECTORS.danmuText);
      const text = (source?.textContent ?? item.textContent ?? '').trim();
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

    pauseDanmu(target?: Element): void {
      // 无参调用（聊天区）：无飘屏可冻结，保持 no-op（旧 animation-play-state 实现对
      // WAAPI 驱动位移本就无效，属死代码清除）。
      // 取舍：暂停元素上全部动画；实测每条弹幕仅 1 个 WAAPI 位移动画，
      // 不存在与 CSS 入场动画共存导致误冻结的问题。
      if (!target) return;
      const anims = target.getAnimations();
      if (anims.length === 0) return;
      for (const a of anims) {
        try {
          a.pause();
        } catch {
          /* 已 finished/canceled，静默 */
        }
      }
      frozenAnims.set(target, { uuid: target.getAttribute('data-comment-uuid'), anims });
    },

    resumeDanmu(target?: Element): void {
      if (!target) return;
      const rec = frozenAnims.get(target);
      if (!rec) return;
      frozenAnims.delete(target);
      // 三重校验之二：脱离文档或 uuid 已更换（元素复用给新弹幕）→ 跳过，
      // 宁可漏恢复一条已离场弹幕，不可错动新弹幕的动画
      if (!target.isConnected) return;
      if (target.getAttribute('data-comment-uuid') !== rec.uuid) return;
      for (const a of rec.anims) {
        // 站方可能在 uuid 未变时 cancel 过动画；此时 play() 会从 0 重启（弹幕重飞），跳过。
        // TS lib.dom 的 AnimationPlayState 枚举缺 'canceled'（浏览器规范含），按 string 宽化比较。
        const state = a.playState as string;
        if (state === 'canceled' || state === 'finished') continue;
        try {
          a.play();
        } catch {
          /* noop */
        }
      }
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
