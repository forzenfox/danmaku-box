# 弹幕收藏管理插件 · 交付文件下载说明

> 面向本地开发归档。所有文件已存放在工作区，可直接下载对应目录，或将本目录整体打包下载。

## 一、报告文档（纯内容，本地可直接打开）

| 文件 | 说明 | 用途 |
|------|------|------|
| `danmaku-collector-prd/PRD.md` | 产品需求文档 V1.2（评审修订稿，含实地验证结论与评审修正） | 本地开发的需求基准 |
| `danmaku-collector-prd/prototype-design.md` | 原型设计文档 V0.2（信息架构 + 6 页面原型 + 交互状态 + G1-G5 验收映射） | 交互与视觉设计基准 |
| `danmaku-collector-prd/technical-design.md` | 技术方案设计文档 V0.2（MV3 + sidePanel 架构、10 模块、消息协议、数据设计、适配器、风险与里程碑） | 研发实现基准 |
| `danmaku-collector-prd/test-cases-p7.md` | P7 验证阶段测试用例 V0.1（功能回归/G1-G5/性能/兼容/安全/稳定性/登录态复测 Q1/Q5/诊断） | 发版前验收基准 |
| `douyu-danmaku-extension-feasibility/` | 斗鱼可行性分析报告（HTML） | 一期技术依据 |
| `douyin-danmaku-extension-feasibility/` | 抖音可行性分析报告（HTML） | 二期技术依据 |
| `douyuex-script-analysis/` | DouyuEx 缓存脚本逆向分析（HTML） | 参考实现思路 |
| `live-site-verification/` | 斗鱼·抖音直播间实地验证报告（HTML） | 选择器与登录态实测结论 |

4 份 HTML 报告均有配套 `_shared/`（含字体、图表库）、`assets/`（图表脚本、截图），需整目录下载。

## 二、可复用源码资产（DouyuEx 逆向提取，供本地重写参考）

| 文件 | 内容 | 用途 |
|------|------|------|
| `douyuex-assets/douyuex-script.txt` | 用户上传的 DouyuEx 缓存脚本原件（485KB） | 逆向参考原始素材 |
| `douyuex-assets/selector-dict.md` | 斗鱼 DOM 选择器字典（2026.06 版，含实测时效标注） | 创建斗鱼适配器的选择器清单 |
| `douyuex-assets/api-endpoints.md` | 斗鱼接口与 WebSocket 协议端点清单 | 弹幕数据通道参考 |
| `douyuex-assets/extraction-extract1..6.md` | 逆向提取代码片段 6 份（收藏/右键面板/STT 编码/变体色等） | 重写核心模块的范本 |

## 三、扩展代码工程（P0-P6 全部里程碑已完成）

| 目录/文件 | 内容 | 用途 |
|-----------|------|------|
| `danmaku-box/src/` | 25 个源文件：background（M1 存储/M2 弹幕库/M8 备份/M9 设置/M10 诊断/路由）、content（M3 右键菜单/M5 回填/M6 斗鱼适配器/M7 站点探测）、panel（M4 面板 UI）、settings（设置页）、shared（常量/类型/消息/备份 UI） | 全部模块实现 |
| `danmaku-box/tests/` | 9 个测试文件、123 个测试（TDD 产出：常量契约、存储、弹幕库、路由、备份合并算法、回填文本、菜单定位、诊断） | 保护消息协议与业务规则 |
| `danmaku-box/dist/` | 构建产物（13 个文件，manifest 引用全部核对存在） | chrome://extensions 加载此目录 |

**已实现功能**：右键收藏（聊天区+飘屏+遮挡兜底+Shadow DOM 菜单）、弹幕库面板（分组/搜索/排序/分页/批量/行内编辑/空态）、分组管理（新建/重命名/拖拽排序/删除）、回填引擎（双形态输入框+替换/追加+截断）、备份（导出/导入合并/覆盖/临时备份/清空）、设置页、诊断日志。

**验证方式**：`npm install --maxsockets=2` → `npm run check`（typecheck+lint+123 测试+构建）→ 浏览器"加载已解压的扩展程序"选择 `dist/`。

**待人工验证项（技术方案 P7）**：斗鱼直播间人工走查（飘屏收藏、遮挡场景、回填双形态）、性能打点对照 PRD 第 7 章、Chrome/Edge 双内核冒烟、**登录态复测（Q1 斗鱼原生右键面板共存 / Q5 抖音飘屏路径）**——需真实登录会话，属发版前必做。

## 四、关于"构建本地开发"

文档与代码工程均已就绪。后续按技术方案 V0.2 第 11 章推进 P7 验证；二期抖音适配（M4 里程碑）新增 DouyinAdapter 即可，通用层零改动。

---

*本说明由 Trae Work 生成 · 2026-08-28*