# 直播弹幕收藏插件 · 工作区

本仓库承载"直播弹幕收藏管理插件"从可行性分析、设计、开发到验证的全部产物。

## 目录导航

| 目录 | 类型 | 说明 |
| --- | --- | --- |
| [`danmaku-box/`](danmaku-box/) | 代码工程 | Chrome MV3 扩展「弹幕收藏夹 DanmakuBox」完整源码，TypeScript + esbuild，含单元测试与完整检查门禁 |
| [`danmaku-collector-prd/`](danmaku-collector-prd/) | 产品文档 | PRD、原型设计、技术设计、P7 阶段测试用例 |
| [`danmaku-delivery/`](danmaku-delivery/) | 逆向分析 | 斗鱼极速版 DouyuEx 缓存脚本分析（API 端点、选择器词典、下载指引） |
| [`douyin-danmaku-extension-feasibility/`](douyin-danmaku-extension-feasibility/) | 可行性报告 | 抖音弹幕收藏可行性分析（HTML） |
| [`douyu-danmaku-extension-feasibility/`](douyu-danmaku-extension-feasibility/) | 可行性报告 | 斗鱼弹幕收藏可行性分析（HTML） |
| [`douyuex-script-analysis/`](douyuex-script-analysis/) | 可行性报告 | DouyuEx 缓存脚本辅助开发价值分析（HTML） |
| [`live-site-verification/`](live-site-verification/) | 验证报告 | 斗鱼/抖音直播间实地验证报告（HTML） |
| [`_shared/`](_shared/) | 共享资源 | 报告通用字体与 JS 库（echarts、mermaid），各报告 HTML 通过 `../_shared/` 引用 |

## 快速入口

- **开发主工程**：进入 [danmaku-box](danmaku-box/README.md) 查看构建、测试与加载说明
- **查看可行性报告**：直接以静态服务器方式打开对应子目录的 HTML（如 `douyu-danmaku-extension-feasibility/`），即可在浏览器查看

## 约定

- 各 HTML 分析报告共享 `_shared/` 静态资源，如需新增共享资源（字体/JS 库），统一放入 `_shared/`，报告中以 `../_shared/<path>` 引用，避免重复拷贝
- 文档类产出建议存放于对应子目录，行文保持中文
- 全部代码遵循 TDD 与 ESLint/Prettier 规范（见 danmaku-box/README.md）