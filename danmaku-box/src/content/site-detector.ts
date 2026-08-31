// M7 站点探测 SiteDetector（技术方案 V0.2 4.M7）。
// 职责：识别当前页面站点并判定适配状态。
// 边界：只读探测；不执行任何业务操作；不触发网络请求。

import type { SiteAdapter } from './adapters/types.ts';

export interface DetectedSite {
  site: 'douyu' | 'douyin';
  /** ok=核心锚点冒烟通过；adapter_down=整站适配失效（两级降级第一级） */
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
        const probe = adapter.probe(root);
        return { site: 'douyu', status: probe.ok ? 'ok' : 'adapter_down', adapter };
      }
      if (/(^|\.)douyin\.com$/.test(host) && adapters.douyin) {
        const adapter = adapters.douyin;
        const probe = adapter.probe(root);
        return { site: 'douyin', status: probe.ok ? 'ok' : 'adapter_down', adapter };
      }
      return null;
    },
  };
}
