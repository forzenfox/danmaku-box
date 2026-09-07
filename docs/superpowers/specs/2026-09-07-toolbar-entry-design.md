# 工具栏「藏+」入口与官方锚定弹层 · 设计规格（2026-09-07）

> 状态：实现完成（2026-09-07，npm run check 全绿，213 测试）。
> 关联：原型 `docs/product/popup-prototype.html`；计划 `docs/superpowers/plans/2026-09-07-toolbar-entry.md`。

## 1. 目标与背景

斗鱼直播间内，弹幕收藏夹面板的入口与形态从「右侧悬浮抽屉（DrawerHost：把手 + Shadow DOM + 固定 iframe）」**替换**为「原生聊天工具栏『藏+』按钮 + 官方锚定弹层」：

- 入口与直播页融为一体（借鉴 DouyuEx `.ChatToolBar__left` 注入范式）；
- 弹层外观对齐斗鱼官方收藏弹窗（实测基线 378×254、8px 顶圆角/底直角、底边贴工具栏上沿）；
- 保留全局兜底：非斗鱼站点仍有插件图标/面板入口（本规格不涉及）。

**实测基线（2026-09-07 真实斗鱼直播间 5720533，登录/未登录双态）：**

| 项 | 实测值 |
|---|---|
| 工具栏左容器 | `.ChatToolBar__left`（hi 稳定锚点，7 个子元素） |
| 子元素顺序 | 表情 → 喇叭 → 贵族 → 粉丝 → 高能(`.PopularBarrage`) → `BarrageWord`(display:none) → 官方收藏(`.ChatBarrageCollect`) |
| 按钮规格 | 全部 18×18，灰色 #bbb，hover 加深 |
| 注入点 | `.PopularBarrage` 之后、`.ChatBarrageCollect` 之前 |
| 官方弹窗 | `.ChatBarrageCollectPop` 固定 378×254、顶圆角 8px、底直角、无 footer、贴工具栏上沿向上弹出 |
| 未登录行为 | 点击官方收藏按钮无弹窗（前端拦截） |

## 2. 变更清单

### 2.1 新增：ToolbarEntry（content script 弹层宿主）

| 项 | 设计 |
|---|---|
| 文件 | `src/content/toolbar-entry/toolbar-entry.ts` |
| 职责 | 向 `.ChatToolBar__left` 注入「藏+」入口按钮；托管官方锚定弹层（壳 + panel.html iframe） |
| 开关 | 页面内局部状态，不经 service worker；**不持久化**（去 session 存储） |
| 降级 | `.ChatToolBar__left` 缺失 → mount 静默不注入（不抛错）；`.ChatBarrageCollect` 缺失 → 按钮 append 到工具栏末尾 |

### 2.2 入口按钮

- class：`cang-entry`；尺寸 CSS 18×18、圆角 4px、灰色图标、hover 主色 `#1652f0`、打开态加 `is-on`；
- 图标：星形 outline + 右下角主色小加号徽标（SVG，内联构建）；
- `title`/`aria-label = 藏+（弹幕收藏夹）`；插入位置：`.ChatBarrageCollect` 之前（`insertBefore`）。

### 2.3 弹层宿主（官方锚定）

- 挂载：作为 `.ChatToolBar__left` 子节点（工具栏 `position: relative` 成为包含块）；
- 几何（CSS 类 `.cang-pop`）：
  - `bottom: calc(100% + 6px)` → 底边贴工具栏上沿（6px 呼吸）；
  - `left: -6px` → 对齐官方弹窗实测左缘（官方 x=358 vs 工具栏 x=364）；
  - `width: 378px` → 对齐官方；
  - 顶部圆角 8px、底部直角、白底、`box-shadow: 0 -6px 24px rgba(0,0,0,.10)`、`z-index` 高于页面浮层（跟随既有 2147483647 语义，此处 `2147483647`）；
  - `max-height` 由 JS 写入：`computeMaxHeight(toolbarTop)` = clamp(toolbarTop − 6, 0, 480)，即「min(480, 工具栏上方可用高度 − 6px)」，窄视口自适应降高；
- 内部：`panel.html` iframe（复用 `getURL('panel.html')` + `web_accessible_resources` 既有配置）；
- 开合：点击「藏+」toggle；`Esc` / 面板 ✕ 关闭；`FILL_ACTION` 回填成功约 0.9s 收起；外部 `mousedown`（目标不在宿主子树）收起；`fullscreenchange` 进入全屏收起（退出不自动恢复——无 lastOpen 语义）。

### 2.4 删除：DrawerHost 及关联

- `src/content/drawer/drawer-host.ts` + `src/content/drawer/drawer-host.test.ts` 删除；
- `content/index.ts` 装配：`createDrawerHost(...)` → `createToolbarEntry({ doc, getURL })`；`drawer.hide()` → `host.hide()`；
- 不再需要：Shadow DOM 壳、把手（`.drawer-handle`）、动态视频区测量（`defaultMeasureRect`/`DrawerRect`）、会话持久化、side-left、弹幕区 scroll 跟随。

## 3. 模块接口

```ts
export interface ToolbarEntryDeps {
  doc: Document;                 // 注入（测试用 fake）
  getURL: (path: string) => string; // iframe src 组装
  win?: Window | null;           // 事件源（全屏/外部点击；测试可注入或 null）
}

export interface ToolbarEntry {
  mount(): void;
  hide(): void;
  isOpen(): boolean;
  dispose(): void;
}

// 纯函数：弹层高度上限 = min(480, 工具栏顶部到视口顶的距离 − 6)，下限 0
export function computeMaxHeight(toolbarTop: number, cap = 480): number;
```

`FILL_ACTION` 之外的业务（收藏/回填/导入）零改动；`visibility-refresher` 等面板内逻辑零改动。

## 4. 测试策略（契约分类）

1. **注入序**：按钮位于 `.ChatBarrageCollect` 之前；collector 缺失时末尾追加；
2. **挂载**：弹层宿主 + iframe（src=getURL 结果）挂进 `.ChatToolBar__left`；
3. **开关**：toggle / Esc / 外部 mousedown（子树内不关）/ hide 幂等 / dispose 根除节点；
4. **几何**：`computeMaxHeight` 纯函数（cap 480、可用空间小时收敛、0/负 clamp）；
5. **降级**：工具栏缺失 mount 不抛错、零创建；
6. **全屏**：fullscreenchange 进全屏收起（win 为 null 时跳过事件注册）。

不引入 jsdom；沿用 `drawer-host.test.ts` 的 fake doc 桩（需增强 `querySelector`/`insertBefore`/`contains`）。DOM 副作用（真实浏览器内视觉效果）留人工走查。

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| `.ChatToolBar__left` 结构变更（平台改版） | 锚点缺失 → mount 静默跳过，插件图标入口兜底；适配器 probe 不依赖该锚点（改版不影响回填/收藏） |
| 弹层 z-index 与直播浮层冲突 | 沿用 `2147483647` 最大层级；iframe 内面板与页面浮层互不干扰（附录：走查项） |
| 高度降级后列表过短 | 内部滚动；`min-height` 不设，内容不足时按内容高度（`max-height` 仅为上限） |