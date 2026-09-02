// M7 站点探测 SiteDetector（技术方案 V0.2 4.M7）。
// 职责：识别当前页面站点并判定适配状态。
// 边界：只读探测；不执行任何业务操作；不触发网络请求。

import type { SiteAdapter } from './adapters/types.ts';

export interface DetectedSite {
  site: 'douyu' | 'douyin';
  /** ok=必需锚点（输入框）冒烟通过；adapter_down=必需锚点缺失（A 起仅由输入框判定） */
  status: 'ok' | 'adapter_down';
  adapter: SiteAdapter;
}

export interface SiteDetector {
  detect(location: Location, root: Document): DetectedSite | null;
}

export function createSiteDetector(adapters: { douyu: SiteAdapter; douyin?: SiteAdapter }) {
  return {
    detect(location: Location, root: Document): DetectedSite | null {
      const host = location.hostname;
      if (/(^|\.)douyu\.com$/.test(host)) {
        const adapter = adapters.douyu;
        // 非直播间 URL（首页/目录/个人页等）不挂载任何 content script 能力（走查反馈修复）
        if (!adapter.isLiveRoom(location)) return null;
        const probe = adapter.probe(root);
        return { site: 'douyu', status: probe.ok ? 'ok' : 'adapter_down', adapter };
      }
      if (/(^|\.)douyin\.com$/.test(host) && adapters.douyin) {
        const adapter = adapters.douyin;
        if (!adapter.isLiveRoom(location)) return null;
        const probe = adapter.probe(root);
        return { site: 'douyin', status: probe.ok ? 'ok' : 'adapter_down', adapter };
      }
      return null;
    },
  };
}
