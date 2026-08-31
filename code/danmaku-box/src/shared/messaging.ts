// 消息客户端（技术方案 5.2 统一信封）：面板/内容脚本 → service worker。
// chrome.runtime.sendMessage 在无监听者或未回包时返回 undefined，此处归一为错误。

import type { Result } from './types.ts';

export async function sendMessage<T = Record<string, unknown>>(
  type: string,
  payload: Record<string, unknown> = {},
): Promise<Result<T>> {
  let response: unknown;
  try {
    response = await chrome.runtime.sendMessage({ type, payload });
  } catch {
    return { ok: false, error: { code: 'SEND_FAILED', message: '后台服务未就绪，请重试' } };
  }
  if (typeof response === 'object' && response !== null && 'ok' in response) {
    return response as Result<T>;
  }
  return { ok: false, error: { code: 'NO_RESPONSE', message: '服务暂不可用' } };
}
