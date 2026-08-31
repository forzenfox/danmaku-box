# 直播弹幕收藏插件 · 工作区

本仓库承载"直播弹幕收藏管理插件"从可行性分析、设计、开发到验证的全部产物。

## 目录导航

顶层按**四大类**归拢，新增内容请按类别存放：

| 目录 | 类型 | 说明 |
| --- | --- | --- |
| [`code/`](code/) | 代码工程 | [`danmaku-box/`](code/danmaku-box/)：Chrome MV3 扩展「弹幕收藏夹 DanmakuBox」完整源码，TypeScript + esbuild，含单元测试与完整检查门禁 |
| [`docs/`](docs/) | 文档 | 全工作区文档统一目录，按类别分 `product/`（PRD、原型、技术设计、测试用例）、`research/`（逆向分析）、`superpowers/`（实施计划与设计规格），见 [docs/README.md](docs/README.md) |
| [`reports/`](reports/) | 验证报告 | 4 份 HTML 分析/验证报告：斗鱼/抖音可行性、DouyuEx 分析、实地验证 |
| [`assets/`](assets/) | 共享资源 | 报告通用字体与 JS 库（echarts、mermaid），各报告 HTML 通过 `../../assets/` 引用 |

## 快速入口

- **开发主工程**：进入 [code/danmaku-box](code/danmaku-box/README.md) 查看构建、测试与加载说明
- **查看可行性报告**：以静态服务器方式打开 `reports/` 下的对应 HTML（如 `reports/douyu-feasibility/`），即可在浏览器查看
- **文档导航**：见 [docs/README.md](docs/README.md)

## 约定

- 顶层分类：`code/` 代码工程、`docs/` 文档、`reports/` HTML 报告、`assets/` 共享静态资源，新增内容按类别归入
- 各 HTML 分析报告共享 `assets/` 静态资源，如需新增共享资源（字体/JS 库），统一放入 `assets/`，报告中以 `../../assets/<path>` 引用，避免重复拷贝
- 文档类产出统一存放于 `docs/` 对应子目录，行文保持中文
- 全部代码遵循 TDD 与 ESLint/Prettier 规范（见 code/danmaku-box/README.md）