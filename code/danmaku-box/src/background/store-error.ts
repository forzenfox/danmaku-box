// 业务异常：携带稳定错误码（shared/constants ERROR_CODES），
// 由消息路由层捕获并转换为统一信封 {ok:false, error:{code,message}}。
export class StoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}
