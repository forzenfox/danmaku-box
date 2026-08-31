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
  reason?: 'NO_INPUT';
}

export interface SiteAdapter {
  readonly site: 'douyu' | 'douyin';
  probe(root: Document | HTMLElement): ProbeResult;
  /** 从事件目标定位弹幕条目元素；非弹幕区域返回 null（不拦截原生菜单） */
  findDanmakuItem(target: Element): Element | null;
  extract(item: Element): ExtractResult;
  locateInput(): HTMLElement | null;
  fill(text: string, mode: 'replace' | 'append'): FillResult;
  pauseDanmu(): void;
  resumeDanmu(): void;
  getLoginState(): 'logged_in' | 'logged_out' | 'unknown';
  getRoomId(): string;
}
