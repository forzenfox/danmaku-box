# 弹幕收藏夹 DanmakuBox

直播弹幕收藏管理 Chrome 扩展：右键一键收藏弹幕、分组管理、点击一键回填到直播输入框。数据完全保存在本地浏览器存储中，零上传、零埋点。

## 功能特性

- **右键收藏**：在斗鱼直播间内选中弹幕文本，通过右键菜单一键收藏

- **分组管理**：弹幕可按主题/分组组织和检索

- **一键回填**：点击已收藏弹幕，自动回填到直播输入框，快速复用

- **本地存储**：全部数据存于浏览器本地（chrome.storage.local），不经过任何服务器

- **侧边栏面板**：基于 Chrome Side Panel API，不遮挡直播画面

## 技术栈

- **语言**：TypeScript（strict 模式）

- **构建**：esbuild（多入口独立打包为 IIFE，适配 MV3）

- **测试**：node:test + TypeScript 直接运行（无额外测试框架）

- **规范**：ESLint 9 + Prettier + tsconfig 严格配置

## 环境要求

- Node.js >= 18（本地构建与测试）

- Chrome >= 114（扩展运行）

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 构建产物到 dist/
npm run build

# 3. 加载扩展：Chrome 打开 chrome://extensions
#    - 开启"开发者模式"
#    - 点击"加载已解压的扩展程序"，选择本目录的 dist/ 文件夹
```

## 常用命令

| 命令                | 说明                                                      |
| ------------------- | --------------------------------------------------------- |
| `npm run check`     | 完整检查：typecheck → lint → test → build，任一失败即中止 |
| `npm run typecheck` | TypeScript 类型检查（tsc --noEmit）                       |
| `npm run lint`      | ESLint 全量检查                                           |
| `npm run test`      | 运行全部单元测试（node:test）                             |
| `npm run build`     | esbuild 构建产物到 dist/                                  |
| `npm run format`    | Prettier 全量格式化（提交前建议执行）                     |

开发常用流程：先 `npm test` 跑单测，再 `npm run check` 做完整门禁；每次修改后建议运行 `npm run format` 保持格式统一。

## 目录结构

```
danmaku-box/
├── public/          # 静态资源（manifest.json、页面 HTML、图标），构建时整体复制到 dist
├── scripts/         # build.mjs 构建脚本 / check.mjs 检查编排
├── src/
│   ├── background/  # Service Worker：存储服务、消息路由、设置管理、备份、诊断
│   ├── content/     # 内容脚本：站点识别适配、右键菜单、弹幕回填引擎
│   ├── panel/       # 侧边栏面板 UI
│   ├── settings/    # 设置页 UI
│   └── shared/      # 共享常量、类型、消息协议、通用 UI 样式
├── tests/           # 单元测试（与 src/ 目录结构对应）
└── dist/            # 构建产物（已 gitignore，可随时由 npm run build 重建）
```

## 架构要点

- **MV3 约束**：由于 content script 与 Service Worker 不支持加载 ES module 共享 chunk，每个入口独立打包为自包含 IIFE。

- **存储抽象**：`storage.service.ts` 提供带依赖注入的存储层，支持 local / session 双区域隔离，便于测试替换。

- **消息路由**：`message-router.ts` 集中处理 content/panel/settings 与 background 之间的消息协议（见 `src/shared/messaging.ts`）。

## 测试

测试全部使用 `node:test` + 原生 `node --test` 运行器，测试辅助通过依赖注入替换存储区域（`tests/helpers/memory-area.ts`），无需真实浏览器环境。

```bash
npm test          # 全量测试
node --test tests/storage/storage.service.test.ts   # 单文件测试
```

> 新功能开发遵循 TDD：先写测试 → 运行失败 → 实现 → 通过 → 运行 `npm run check` 做完整门禁。
