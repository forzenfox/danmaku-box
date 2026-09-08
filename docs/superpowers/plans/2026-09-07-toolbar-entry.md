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

***

## 追加修复（2026-09-08）：hydration 替换导致「藏+」按钮丢失

**现象：** 刷新斗鱼页面后「藏+」按钮不出现（右键收藏菜单正常）；用户在 chrome://extensions 观察到 Service Worker「无效」并误关联为根因。

**根因分层：**

1. **SW「无效」= MV3 正常生命周期**（非 bug）：SW 空闲约 30s 被 Chrome 终止、事件到达时重新唤醒，扩展管理页显示「无效」即已停止状态。
2. **按钮丢失的机制级根因**：斗鱼直播间为 SSR 直出（初始 HTML 含 `.ChatToolBar__left`），content script 于 document_idle 注入按钮成功；随后 Vue hydration 用客户端渲染子树整体替换 SSR DOM（佐证：`Barrage-list` 不在 SSR HTML 中），注入的 style/按钮/弹层随 SSR 子树脱离文档；首次挂载成功后无任何守护机制，按钮永久丢失。

**修复（机制级：事件驱动实时判定，非定时轮询/延迟重试）：**

- `build()` 幂等守卫由「引用存在」改为「`btn?.isConnected || pop?.isConnected`」——断连允许重建，build 前清孤儿引用；
- `mount()` 无论首次挂载成功与否都注册**常驻守护 MutationObserver**（原「注入成功即 disconnect」契约废除）；
- 守护回调 `onDomMutated()` 三分支：按钮健在 → O(1) 快速路径无操作；已挂载但断连 → 仅重建 DOM 节点（doc/view 级事件监听不受子树替换影响，不重复注册）并重算高度；未挂载且锚点出现 → 完成首次挂载。

**测试：** `toolbar-entry.test.ts` 新增 hydration 守护用例（fake 子树递归断连模拟级联 isConnected）；「延迟渲染」用例断言由「注入成功后应断开观察器」更新为「保持守护观察器」。全量 216 用例 PASS；tsc/eslint/prettier 全绿；dist 已重新构建。

***

## 追加调整（2026-09-08 v2）：图标升级 + 弹框高度锁定

**用户反馈（真实浏览器人工走查）：**

1. 「藏+」按钮图标在工具栏里非常淡（看不出星形/加号），期望与官方 ChatBarrageCollect 18×18 单色收藏 icon 同风格；
2. 弹框高度被压扁（仅 ~220px），不达 spec 480 上限。

**根因：**

- 图标：原方案 15×15 outline 星 + 8×8 绝对定位蓝点双 SVG 拼接，outline 描边 + 浅灰 baseColor = 视觉对比度过低。
- 弹框：原 `pop.style.maxHeight = '480px'` 仅设上限，未指定 `height`；cang-pop 内部 flex column + iframe 100% 跟随时，因 pop 无明确 height 而塌缩到 iframe 内容自然高度；外部 CSS 又因 toolbarTop − 6 < 480 被覆盖为更小值，弹框进一步被压扁。

**修复：**

- 图标改为单一 18×18 SVG：圆角底（4px rx，opacity 0.12 浅底）+ 实心五角星（24×24 viewBox），统一 `fill=currentColor`。按钮主色由 `#bbb` 调整为 `#1652f0`（与官方 ChatBarrageCollect 高亮态同色，icon 透出蓝色，更醒目且 hover/打开态加深刻 `#0d3fc9`）。
- 弹框：`applyMaxHeight()` 改写 `pop.style.height`（而非 max-height），内联锁定 `min(480, toolbarTop − 6)`；CSS 兜底 `height: 480px` 防首帧塌缩。iframe 100% 跟满 pop 高度后内部滚动。

**测试：** 新增 3 用例覆盖「单 SVG + 实心 fill」「mount 写内联 height（294px 收敛）」「工具栏上方空间充足时撑到 480」。全量 219 用例 PASS；tsc/eslint/prettier 全绿；dist 已重新构建。
