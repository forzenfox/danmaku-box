# 抽屉锚点修正 V4：对齐弹幕列表显示区域（left/top 实时测量 + scroll 跟随）

* 日期：2026-09-02

* 状态：**实现完成（2026-09-02，Task 1-2 编码 + typecheck/test/lint/build 全绿，178 测试通过），待人工浏览器走查验收**

* 关联文档：2026-08-31-drawer-ui-v2-design.md（V2 抽屉）、2026-08-31-drawer-ui-design.md（V1 抽屉）、技术方案 V0.2

## 1. 背景与问题

V2/V3 抽屉定位为 `position: fixed; top: 0; right: 0`，即锚定在**视口右上角**。实测斗鱼直播间（1849×893 视口）真实布局为：

* 播放器 `#js-player-video`：left 152 / top 224 / width 1157 / height 637 / right 1309
* 弹幕列表显示区 `#js-player-barrage`（弹幕栏容器）：**left 1317 / top 376 / width 380 / height 503**，随页面滚动移动（scrollY=0 时 top=376；scrollY=100 时 top=276）
* 弹幕滚动列表 `#js-barrage-list`：top 376 / height 254（其父弹幕栏整体即显示区）

问题：抽屉右缘虽然已通过动态宽度公式（视口 − 播放器右缘）对齐，但 `top:0` 与 `left` 锚点错误，导致整个弹框落在网页右上角，与真实弹幕列表区域（top 376 附近）完全错位。

## 2. 实测数据（2026-09-02 浏览器实测）

| 检测项 | 视口 1849×893 | 视口 1714×?(调整后) |
| ---- | ---- | ---- |
| 播放器 right | 1309 | ~1155 |
| 弹幕区 `#js-player-barrage` left | 1317 | 1222 |
| 弹幕区 width | 380（固定） | 380（固定） |
| 弹幕区 top（scrollY=0） | 376 | 376 |
| 弹幕区 height | 503 | 503 |
| 弹幕栏右缘 → 视口右缘空白 | 152px | 112px |
| 弹幕区随页面滚动 | 是（top 随 scrollY 平移） | 是 |

布局规律：弹幕栏宽固定 **380px**、`margin-left:8px`、flex 布局位于播放器右侧，与视口尺寸解耦 ⇒ 可直接实测弹幕区矩形几何，无需按分辨率硬编码。

## 3. 决策记录（评审裁决）

| # | 决策 | 理由 |
| - | ---- | ---- |
| 1 | 抽屉几何 = 弹幕区几何：`left = 弹幕区.left`，`width = 视口宽 − 弹幕区.left`，`top = 弹幕区.top`（视口坐标），`height = min(弹幕区.height, 62vh, 560px)` | 弹幕区 left 起抽屉左缘与弹幕列表左缘对齐；宽到视口右缘 ⇒ 遮蔽弹幕区且**右侧无空隙**（实测弹幕栏右缘到视口右缘有 112~152px 空白，若 width 取弹幕区宽 380 会留空隙） |
| 2 | `top` 随 `scroll` 事件实时重算（passive） | 弹幕区随页面滚动移动（文档坐标固定、视口坐标随 scrollY 平移），fixed 抽屉必须跟随，否则滚动后错位 |
| 3 | 测量失败回退 CSS 兜底（top:0 / right:0 / width:min(340px,22vw)） | 站点改版/锚点缺失时保持可用的保守定位，与 V2 兜底策略一致 |
| 4 | 测量器注入点由 `measureWidth` 升级为 `measureRect`（返回 `{left,top,width,height} \| null`） | 一个函数交付完整几何，避免三处分散测量；`null`=测量失败语义不变 |
| 5 | 高度保留 V2 约束 `min(62vh, 560px)` 为上限，叠加弹幕区高做 min | 弹幕区 503px < 62vh(553px)，实际取 503 完美遮蔽；若弹幕区异常超高仍受 62vh/560 保护（不遮输入框，V2 决策 1 保留） |
| 6 | 全屏/F11/回填自动收起等既有行为不变 | 本次仅触及抽屉几何锚点与 scroll 跟随，不涉数据流 |

## 4. 目标布局

```
┌─ 视口 ────────────────────────────────────────────────────┐
│ header (60px)                                            │
│ ┌── 舞台 ────────────────────────────────┐                │
│ │ 播放器                              │ ┌─弹幕区(380px)─┐│
│ │                                    │ │ 抽屉          ││
│ │                                    │ │ (左缘对齐弹幕区 ││
│ │                                    │ │  右缘贴齐视口) ││
│ │                                    │ └───────────────┘│
│ └────────────────────────────────────────────────────┘  │
│           弹幕区右缘→视口右缘空白（不遮挡，抽屉右缘贴齐视口）       │
└───────────────────────────────────────────────────────────┘
```

## 5. 变更清单

### 5.1 drawer-host.ts

* 新增导出 `defaultMeasureRect(doc, view): () => DrawerRect | null`：
  * 锚点顺序：`#js-player-barrage`（弹幕栏容器，遮蔽目标）→ 回退 `#js-player-video` / `video`（V2 既有回退）
  * 返回 `{ left, top, width, height }`：
    * `left = barrageRect.left`
    * `top = barrageRect.top`（getBoundingClientRect 视口坐标，天然含当前 scroll）
    * `width = Math.round(clientWidth − barrageRect.left)`（右缘贴齐布局视口右缘，复用 V2 关于 clientWidth 而非 innerWidth 的教训）
    * `height = Math.round(min(barrageRect.height, view.innerHeight * 0.62, 560))`
  * 无效（无锚点/clientWidth 非有限/width≤0）→ `null`
* 新增 `DrawerRect` 类型；`DrawerHostDeps.measureWidth` → `measureRect?: () => DrawerRect | null`
* `applyWidth()` → `applyRect()`：测量成功则内联 `left/top/width/height`（px）；失败清除全部四个内联（回退 CSS 兜底）
* 新增 `scroll` 监听（passive: true，window）：`onScroll = () => applyRect()`；dispose 移除
* `fullscreenchange` / `resize` 处理函数更新为调用 `applyRect()`
* CSS 兜底保留：`top: 0; right: 0; width: min(340px, 22vw); height: min(62vh, 560px)`

### 5.2 明确不改

* content/index.ts（装配处签名变更但调用传参不变，measureRect 生产实现由缺省 defaultMeasureRect 提供）
* service worker / 消息协议 / panel.ts / 设置页
* sidePanel 兜底行为

## 6. 测试策略（TDD）

`drawer-host.test.ts`（node:test + fake doc，新增/改造用例）：

| 用例 | 断言 |
| ---- | ---- |
| defaultMeasureRect 命中弹幕区 | 返回 `{left:1317, top:376, width:532, height:min(503,62vh,560)}`（视口 1849 样例） |
| defaultMeasureRect 无弹幕区回退 video | left=1309（播放器右缘）、width=540（1849−1309）、top 取播放器 top、height 取 62vh 约束 |
| defaultMeasureRect 测量失败（无锚点） | 返回 null |
| 矩形应用：measureRect 返回矩形时内联四值 | style.left/top/width/height 均写入 px |
| 矩形应用失败回退 | 四个内联样式全部清空（回退 CSS 兜底） |
| scroll 触发后重算 | 注册 scroll 监听；scroll 回调触发后新 top 应用 |
| resize / fullscreenchange 沿用矩形重算 | 既有用例改造为矩形语义 |
| dispose 移除 scroll 监听 | removeEventListener 收到 'scroll' |

面板逻辑/既有用例（mount/toggle/全屏/hide/会话）全部回归。

## 7. 里程碑拆解

| 里程碑 | 内容 | 验证 |
| ---- | ---- | ---- |
| V4.1 | defaultMeasureRect 纯函数 + 契约测试 | 单测红→绿 |
| V4.2 | drawer-host 矩形定位应用 + scroll 监听 | draw-host 全量单测绿 |
| V4.3 | 全量门禁 + 浏览器人工走查 | npm run check 全绿；抽屉左缘对齐弹幕列表、右缘贴齐视口、滚动跟随 |

## 8. 明确不做（YAGNI）

* 不做 draggable 抽屉位置记忆（跨分辨率自适应，无必要）
* 不做抖音/多站弹幕区锚点（一期保持弹幕区容器 `#js-player-barrage` 与回退链）
* 不改动 V2 的 62vh/560 高度约束语义（仅叠加弹幕区高）