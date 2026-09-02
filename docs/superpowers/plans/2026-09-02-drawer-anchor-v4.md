# 抽屉锚点修正 V4（对齐弹幕列表显示区域）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将抽屉定位从「视口右上角（top:0/right:0）」修正为「遮蔽实际弹幕列表显示区域」：`left = #js-player-barrage.left`、`top = 弹幕区视口 top`（随 scroll 跟随）、右缘贴齐视口（无空隙）、高度 `min(弹幕区高, 62vh, 560px)`。

**Architecture:** 数据/渲染分离——`defaultMeasureRect` 纯函数（可单测）返回 `{left,top,width,height}`，`drawer-host` 只负责把测量结果应用为内联样式并监听 scroll/resize/fullscreenchange 重算。

**Tech Stack:** TypeScript 5、Chrome MV3、无框架（原生 DOM）、node:test 单测、esbuild/prettier/eslint。

**规格依据:** `docs/superpowers/specs/2026-09-02-drawer-anchor-v4-design.md`（§5 变更清单 / §6 测试策略）。

***

## 文件结构

| 文件                                                        | 动作 | 职责                                                                                                                                 |
| --------------------------------------------------------- | -- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `code/danmaku-box/src/content/drawer/drawer-host.ts`      | 修改 | 新增 `defaultMeasureRect`/`DrawerRect`；`measureWidth`→`measureRect`；`applyWidth`→`applyRect`（写 left/top/width/height）；新增 `scroll` 监听 |
| `code/danmaku-box/src/content/drawer/drawer-host.test.ts` | 修改 | 新增 defaultMeasureRect 契约测试；既有动态宽度测试升级为矩形语义；新增 scroll 跟随测试                                                                          |

所有 npm 命令在 `code/danmaku-box` 目录内执行（cwd: `D:\File\workSpace\AI-test\直播弹幕收藏插件可行性分析\code\danmaku-box`）。

***

### Task 1: defaultMeasureRect 纯函数 + 契约测试

**Files:**

- Modify: `code/danmaku-box/src/content/drawer/drawer-host.ts`（新增导出）

- Modify: `code/danmaku-box/src/content/drawer/drawer-host.test.ts`（新增用例）

- [x] **Step 1: 写失败测试**

新增 5 个契约用例（V4 spec §6）：命中 `#js-player-barrage` 返回 `{left,top,width,height}`（left=1317/top=376/width=1849−1317/heigh=min(503,62vh,560)）；无弹幕栏回退 video（left=播放器右缘1309/width=540/高=62vh）；无锚点返回 null；view=null 返回 null；宽度非正返回 null。

- [x] **Step 2: 运行验证失败**

`node --test src/content/drawer/drawer-host.test.ts` → FAIL（`does not provide an export named 'defaultMeasureRect'`）

- [x] **Step 3: 写最小实现**

`defaultMeasureRect(doc, view)`：锚点链 `#js-player-barrage → #js-player-video → video`；左缘对齐（弹幕栏=rect.left / 回退=rect.right）、宽=clientWidth−左缘、高=min(rect.height 或 62vh, 62vh, 560)；任何无效→null。

- [x] **Step 4: 运行验证通过**

全部 25 用例 PASS。

- [x] **Step 5: 提交**

`git add src/content/drawer/drawer-host.ts src/content/drawer/drawer-host.test.ts` → commit（见最终 Git 提交说明）

***

### Task 2: drawer-host 矩形定位应用 + scroll 跟随

**Files:**

- Modify: `code/danmaku-box/src/content/drawer/drawer-host.ts`

- Modify: `code/danmaku-box/src/content/drawer/drawer-host.test.ts`

- [x] **Step 1: 更新既有测试为矩形语义**

删除 3 个旧「动态宽度」测试；新增 6 个矩形用例：内联四值写入 / null 回退四值清空 / scroll 重算（passive 断言）/ resize 重算 / fullscreenchange 重算 / dispose 移除 scroll 监听 / 展开态 scroll 跟随不漂移。

- [x] **Step 2: 运行验证失败**（红：实现仍为 measureWidth）

- [x] **Step 3: 改造实现**

`DrawerHostDeps.measureWidth` → `measureRect?: () => DrawerRect | null`；`applyWidth`→`applyRect`（成功写四个内联 px，失败清空）；`mount` 注册 `scroll`（passive:true）；`dispose` 移除；`onFullscreen`/`onResize` 改调 `applyRect`；CSS 兜底（top:0/right:0/width:min(340px,22vw)/height:min(62vh,560px)）保留。

- [x] **Step 4: 运行验证通过**

27 用例 PASS；typecheck/lint/check 全绿（178 测试）。

- [x] **Step 5: 提交**

***

### Task 3: 文档同步

**Files:**

- Modify: `docs/superpowers/specs/2026-09-02-drawer-anchor-v4-design.md`（状态→验收/走查）

- Create: `docs/superpowers/plans/2026-09-02-drawer-anchor-v4.md`（本计划）

- [x] **Step 1: 更新 spec 状态为实现完成**

- [x] **Step 2: 建立本计划并勾选执行状态**

***

## Self-Review

- **Spec 覆盖：** §5.1 变更（defaultMeasureRect/measureRect 注入/applyRect/scroll 监听）→ Task 1/2；§5.2 不改清单全部未触碰；§6 测试策略 8 类契约→Task 1（5 个纯函数）+ Task 2（6 个应用用例 + 回归）；§7 里程碑 V4.1/4.2/4.3 → Task 1/2/3。

- **无占位符：** 所有步骤含完整语义描述与验证命令。

- **类型一致性：** `measureRect` 返回 `DrawerRect | null` 由 `defaultMeasureRect` 与测试注入共用；`DrawerRect` 导出统一消费；旧 `defaultMeasureWidth` 无引用已删除。

