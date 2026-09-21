// M6 站点适配层接口（技术方案 V0.2 8.1）。
// 每个直播站一个适配器实现；一次实例绑定一个站点。

export interface ProbeResult {
  /** 核心锚点冒烟是否通过（整站适配失效判定依据） */
  ok: boolean;
  /** 冒烟失败时的缺失锚点描述（诊断用） */
  missing?: string[];
}

export interface ExtractResult {
  /** 弹幕纯文本（空串 = 纯表情弹幕） */
  text: string;
  /** 是否含表情/图片等富内容（toast 注明「已忽略表情/图片」） */
  hasRichContent: boolean;
}

export interface FillResult {
  ok: boolean;
  truncated: boolean;
  /** 失败原因：NO_INPUT=输入框缺失/空文本；NEED_LOGIN=未登录输入框不渲染 */
  reason?: 'NO_INPUT' | 'NEED_LOGIN';
}

export interface SiteAdapter {
  readonly site: 'douyu' | 'douyin';
  /** 页面是否为直播间 URL（非直播页不挂载 content script 能力，如抽屉把手/右键菜单） */
  isLiveRoom(location: Pick<Location, 'pathname'>): boolean;
  probe(root: Document | HTMLElement): ProbeResult;
  /** 从事件目标定位弹幕条目元素；非弹幕区域返回 null（不拦截原生菜单） */
  findDanmakuItem(target: Element): Element | null;
  extract(item: Element): ExtractResult;
  locateInput(): HTMLElement | null;
  fill(text: string, mode: 'replace' | 'append'): FillResult;
  /** 冻结飘屏弹幕运动；传入目标元素时仅冻结该条（WAAPI），无参调用保持旧语义（no-op） */
  pauseDanmu(target?: Element): void;
  /** 恢复冻结；元素脱离文档或 uuid 变更（对象池复用）时安全跳过 */
  resumeDanmu(target?: Element): void;
  getLoginState(): 'logged_in' | 'logged_out' | 'unknown';
  getRoomId(): string;
}
