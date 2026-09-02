// danmaku-box/src/content/extension-context.ts
// 扩展上下文失效防护（spec: docs/superpowers/specs/2026-09-02-extension-context-guard.md）
//
// 背景：开发流程（重载扩展 / SW 失效）后老 content script 仍驻留页面。
// 老 content script 持有的 chrome.* 引用全部失效，调用时**同步抛出**
// "Extension context invalidated"（不走 promise reject，.catch() 抓不住），
// 错误冒泡到全局污染页面。本模块提供前置 guard 与同步抛错转 catch 的安全包装。
//
// 设计原则（融入而非改造）：
// - 不重试、不弹 UI、不清理老 content script（Chrome 自身已通过世界隔离处理）。
// - 仅在失效场景下静默降级返回 Result.fail。
// - 全部依赖注入（api: typeof chrome）便于单测。

import type { Result } from '../shared/types.ts';

const CONTEXT_INVALIDATED_MSG = 'Extension context invalidated';

/** 检测扩展上下文是否有效：chrome.runtime.id 存在且可访问 */
export function isContextValid(api: unknown): boolean {
  if (api == null) return false;
  const runtime = (api as { runtime?: { id?: unknown } }).runtime;
  if (runtime == null) return false;
  const id = runtime.id;
  return typeof id === 'string' && id.length > 0;
}

/**
 * chrome.runtime.sendMessage 的安全包装：
 * - 启动前 context 已失效 → 立即返回 CONTEXT_INVALIDATED，不调用 sendMessage
 * - 同步 throw（含 "Extension context invalidated"）→ 捕获并返回 CONTEXT_INVALIDATED（识别消息）或 SEND_FAILED
 * - promise reject → SEND_FAILED
 * - 返回 undefined（无监听者）→ NO_RESPONSE
 * - 正常返回 → 透传 Result
 */
export async function safeSendMessage<T = Record<string, unknown>>(
  api: unknown,
  message: { type: string; payload?: Record<string, unknown> },
): Promise<Result<T>> {
  if (!isContextValid(api)) {
    return {
      ok: false,
      error: { code: 'CONTEXT_INVALIDATED', message: '扩展上下文已失效' },
    };
  }
  const sendMessage = (api as { runtime: { sendMessage: (m: unknown) => unknown } }).runtime
    .sendMessage;
  let response: unknown;
  try {
    response = await sendMessage(message);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes(CONTEXT_INVALIDATED_MSG)) {
      return {
        ok: false,
        error: { code: 'CONTEXT_INVALIDATED', message: '扩展上下文已失效' },
      };
    }
    return { ok: false, error: { code: 'SEND_FAILED', message: '后台服务未就绪，请重试' } };
  }
  if (typeof response === 'object' && response !== null && 'ok' in response) {
    return response as Result<T>;
  }
  return { ok: false, error: { code: 'NO_RESPONSE', message: '服务暂不可用' } };
}
