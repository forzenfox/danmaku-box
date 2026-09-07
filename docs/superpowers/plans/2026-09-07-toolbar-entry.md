# 工具栏「藏+」入口与官方锚定弹层（替代 DrawerHost）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 斗鱼页弹幕收藏夹入口由「右侧悬浮抽屉 DrawerHost」替换为「原生聊天工具栏『藏+』按钮 + 官方锚定弹层」：向 `.ChatToolBar__left` 注入 18×18 按钮（位于 `.PopularBarrage` 之后、`.ChatBarrageCollect` 之前），点击后弹层贴工具栏上沿向上展开（宽 378 对齐官方、高 min(480, 工具栏上方可用−6)、顶圆角8px/底直角），并删除 DrawerHost 及其测试。

**Architecture:** 弹层宿主 ToolbarEntry 直接挂载为 `.ChatToolBar__left` 子节点（工具栏 `position:relative` 即 CSS 包含块），几何由 CSS（bottom/left/width）静态表达；唯一需要 JS 的量是高度上限——抽出纯函数 `computeMaxHeight(toolbarTop, cap=480)` 便于单测。无 Shadow DOM、无把手、无视频区测量、无会话持久化、无 side-left。

**Tech Stack:** TypeScript 5、Chrome MV3、无框架（原生 DOM）、node:test 单测（fake doc 桩，无 jsdom）、esbuild/prettier/eslint。

**规格依据:** `docs/superpowers/specs/2026-09-07-toolbar-entry-design.md`（§2 变更清单 / §3 接口 / §4 测试策略 / §5 风险）。

***

## 文件结构

| 文件 | 动作 | 职责 |
| --- | -- | --- |
| `code/danmaku-box/src/content/toolbar-entry/toolbar-entry.ts` | 新增 | 「藏+」按钮注入 + 弹层宿主（CSS 类 + iframe），导出 `computeMaxHeight` |
| `code/danmaku-box/src/content/toolbar-entry/toolbar-entry.test.ts` | 新增 | 契约测试（注入序/挂载/开关/几何/降级/全屏） |
| `code/danmaku-box/src/content/index.ts` | 修改 | `createDrawerHost` → `createToolbarEntry`；`drawer.hide()` → `host.hide()` |
| `code/danmaku-box/src/content/drawer/drawer-host.ts` | 删除 | DrawerHost 已废弃 |
| `code/danmaku-box/src/content/drawer/drawer-host.test.ts` | 删除 | 已废弃 |
| `docs/product/technical-design.md` / `docs/product/prototype-design.md` | 已并行更新 | 文档同步（见 Task 4） |

所有 npm 命令在 `code/danmaku-box` 目录内执行（cwd: `D:\File\workSpace\AI-test\直播弹幕收藏插件可行性分析\code\danmaku-box`）。

***

### Task 1: 契约测试（红灯）

**Files:**

- Create: `code/danmaku-box/src/content/toolbar-entry/toolbar-entry.test.ts`

- [x] **Step 1: 写失败测试**

基于既有 `drawer-host.test.ts` 的 fake doc 桩增强（补充 `querySelector`/`querySelectorAll`/`insertBefore`/`contains`/`parentElement`），新增以下契约用例：

1. **注入序**：容器 `.ChatToolBar__left` 含子元素序列 `[..., collect=ChatBarrageCollect]`；`mount()` 后按钮 `.cang-entry` 位于 collect 之前的 index；collect 缺失 → 按钮 append 至末尾。
2. **挂载**：弹层宿主（`.cang-pop`）为 `.ChatToolBar__left` 的子节点；其内 iframe `src` === `getURL('panel.html')`。
3. **按钮可访问性**：`aria-label`/`title` 含「藏+」；class 为 `cang-entry`。
4. **toggle**：点击按钮 → 宿主 class 含 `open`；再点 → 移除。
5. **Esc 关闭**：`open` 态派发 `keydown/Escape`（document 级）→ 移除 `open`。
6. **外部 mousedown 收起；内部不收起**：`open` 态，mousedown 的 composedPath/target 落在宿主子树内 → 保持 open；在子树外 → 关闭。若 view 为 null 则不注册该监听（断言无监听副作用无从谈起，以「不抛错」兜底）。
7. **hide 幂等**：`hide()` 两次均无异常，open 移除。
8. **FILL 语义无关**：宿主不监听消息（由 index.ts 调用 `host.hide()`），故此处仅验证 `hide()` 公开能力。
9. **几何纯函数**：`computeMaxHeight(800)`=480（cap）；`computeMaxHeight(300)`=294（顶部→300−6）；`computeMaxHeight(-10)`=0；`computeMaxHeight(0)`=0。
10. **降级**：fake doc 无 `.ChatToolBar__left` → `mount()` 不抛错、不创建任何元素。
11. **dispose**：移除注入节点（宿主/按钮 `removed === true`）。

- [x] **Step 2: 运行验证失败**

`node --test src/content/toolbar-entry/toolbar-entry.test.ts` → FAIL（模块不存在 / import 报错）。

***

### Task 2: 实现 ToolbarEntry（绿灯）

**Files:**

- Create: `code/danmaku-box/src/content/toolbar-entry/toolbar-entry.ts`

- [x] **Step 1: 实现模块**

`createToolbarEntry(deps: ToolbarEntryDeps): ToolbarEntry`：
- **锚点解析**：`doc.querySelector('.ChatToolBar__left')` → null 时 mount 静默返回（降级）；
- **按钮构建**：`insertBefore` 到 `.ChatBarrageCollect`（缺失则 `appendChild`）；添加 `.cang-entry`；SVG 星形+加号徽标；`title`/`aria-label`；
- **弹层宿主**：`.cang-pop` 元素（样式由内嵌 `<style>` 注入页面根，类作用域 `cang-` 前缀防污染）；下拉 iframe `src=getURL('panel.html')`；`mount()` 时把宿主与 `<style>` append 进 `.ChatToolBar__left`（宿主 absolute 脱离 flex 流）；
- **高度上限**：`applyMaxHeight()` 读取 `toolbar.getBoundingClientRect().top` → 内联 `max-height = computeMaxHeight(top)px`；在 mount/resize 时调用；
- **开合**：`toggle()` 维护内部 `open`，切换宿主 `.open` / 按钮 `.is-on`；`Esc`、外部 `mousedown`（capture，`hostRoot.contains(target)`）、`fullscreenchange`（进入全屏收起）、`hide()`；
- **dispose**：移除 `style`/按钮/宿主节点与全部监听。

CSS（`.cang-pop`）：`position:absolute; bottom:calc(100% + 6px); left:-6px; width:378px; z-index:2147483647; border-radius:8px 8px 0 0; border:1px solid #e5e6eb; border-bottom:0; box-shadow:0 -6px 24px rgba(0,0,0,.10); background:#fff; display:none; flex-direction:column; overflow:hidden;`；`.open{display:flex}`。`computeMaxHeight(top,cap=480) = Math.max(0, Math.min(cap, top - 6))`（导出，供单测与 resize 复用）。

- [x] **Step 2: 运行验证通过**

`node --test src/content/toolbar-entry/toolbar-entry.test.ts` → 全部用例 PASS。

***

### Task 3: 装配替换 + 删除 DrawerHost

**Files:**

- Modify: `code/danmaku-box/src/content/index.ts`

- [x] **Step 1: 替换装配**

`createDrawerHost({ doc, getURL, session })` 块 → `createToolbarEntry({ doc, getURL })`；FILL_ACTION 成功分支 `setTimeout(() => drawer.hide(), 900)` → `toolbarEntry.hide()`；其余消息路由不变。

- [x] **Step 2: 删除废弃文件**

删除 `src/content/drawer/drawer-host.ts` 与 `src/content/drawer/drawer-host.test.ts`（目录一并清理，若为空）。

- [x] **Step 3: 全量门禁**

`npm run check`（typecheck + lint + test + build）全绿；旧 drawer 测试计数移除后总用例数回落（约 −28）。

***

### Task 4: 文档同步与提交

**Files:**

- Modify: `docs/product/technical-design.md`、`docs/product/prototype-design.md`（背景：已由并行文档子代理更新，此处核对一致性）
- Create: `docs/superpowers/plans/2026-09-07-toolbar-entry.md`（本计划）
- Create: `docs/superpowers/specs/2026-09-07-toolbar-entry-design.md`（已建，本 Task 复核状态收敛）

- [ ] **Step 1: 核对两处产品文档与实现一致性**（入口/尺寸/降级口径）
- [ ] **Step 2: 更新规格状态为「实现完成」**（若实现无偏差）
- [ ] **Step 3: 提交**

`git add code/danmaku-box/src/content src/... `（按实际变更文件），commit message 如 `feat(content): 工具栏「藏+」入口 + 官方锚定弹层，移除 DrawerHost`。

***

## Self-Review

- **Spec 覆盖：** §2.1-2.4 变更 → Task 1/2/3；§3 接口（deps/host/computeMaxHeight）→ Task 2；§4 测试策略 6 类 → Task 1（11 用例）；§5 风险（锚点缺失静默降级）→ Task 1 用例 10/11。
- **无占位符：** 所有 Step 含语义描述与验证命令。
- **类型一致性：** `ToolbarEntryDeps/ToolbarEntry/computeMaxHeight` 导出供 index.ts 与测试共用；删除 `DrawerHost` 时 `index.ts` 无残留引用（typecheck 兜底）。
- **未触碰：** 弹幕渲染、消息协议、panel.ts、适配器、右键菜单、回填引擎零改动。
