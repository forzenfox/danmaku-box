# 抖音 DOM 选择器字典

> 依据抖音直播网页版（live.douyin.com）实地验证（2026.09.21）整理。用于本地开发创建抖音适配器（`douyin.ts`）。
> **验证方法/会话:**
> ① 已登录态 —— TRAE-browseruse 控制外部 Chrome,实测 `live.douyin.com/492632285289`(直播中);
> ② 未登录态 —— chrome-devtools 插件全新浏览器(无 sessionid/uid cookie),实测
> `live.douyin.com/831242120377`(未开播)、`/411770527302`(央视网)、`/148266540556`(艺然,均直播中)。
> 对聊天区 / 输入框 / 右键 contextmenu 注入探针实测。

## 稳定性标注

- **hi**:语义类名/稳定 ID,实测仍有效,作为适配器主锚点。
- **mid**:语义类名但依赖交互触发或登录态,待补测。
- **verify**:带哈希后缀的 CSS Modules 类名,随前端构建易变,仅作运行时探测项。

## 直播间判定

| 规则 | 说明 | 稳定性 |
|------|------|--------|
| URL 首段为纯数字(`/{roomId}`,如 `/492632285289`) | 实测与斗鱼同范式,`isLiveRoom` 判定逻辑可直接复用 | hi |

## 聊天区(核心交互)

> 实测布局: 桌面端为「视频区(约1473×805)左侧 + 聊天区右侧(约391×657)」。
> 聊天区为**虚拟列表**(DOM 恒约 21 条 item,节点复用,`data-id` 随复用清空——见【风险】)。

| 选择器 | 作用 | 稳定性 |
|--------|------|--------|
| `.webcast-chatroom` | 聊天区容器(含列表 + 输入栏) | hi |
| `.webcast-chatroom___list` | 弹幕列表滚动容器(`overflow-y: auto`) | hi |
| `.webcast-chatroom___item` | 单条弹幕条目(DIV,含状态变体 `webcast-chatroom___item_new`) | hi |
| `.webcast-chatroom___content-with-emoji-text` | 弹幕文本节点(SPAN,仅文本弹幕存在) | hi |
| `.webcast-chatroom___content-with-emoji-emoji` | 弹幕表情节点(DIV,内含 IMG,仅表情弹幕存在) | hi |
| `.webcast-chatroom___input-container` | 输入栏容器(含输入框/表情/设置入口)**——仅已登录存在** | hi |
| `[contenteditable=true]` | 弹幕输入框(DIV,React 受控,placeholder「与大家互动一下...」)**——仅已登录存在** | hi |
| `.webcast-chatroom___emoji-icon` | 表情面板入口 | hi |
| `.cjR8oGui`(内含 `.LGWzuUuN` → `SPAN.niaw6Avc`) | **登录提示条**(文本「需先登录，才能开始聊天」)**——仅未登录存在**,替代输入栏 | hi |
| `[data-e2e=danmaku-setting-icon]` | 弹幕设置入口(抖音自带测试锚点) | mid |
| `[data-e2e=live-chatting]` | 输入交互区 e2e 锚点(位于 input-container 内) | verify |

### 弹幕条目内部结构(实测 2026.09.21)

```
DIV.webcast-chatroom___item  (data-id 属性:最新条目有值,复用条目置空)
└─ DIV.webcast-chatroom___item-wrapper (哈希 `Cl4EfhXg`)
   └─ DIV (哈希 `NkS2Invn`)
      ├─ SPAN (空)
      │  ├─ SPAN.eReAkD7x (哈希,礼物/徽标预留)
      │  └─ SPAN.uVbVarFF (哈希,内含 IMG —— 团队徽章/图标)
      ├─ SPAN.v8LY0gZF (哈希 —— **昵称**,文本形如「z*****：」)
      └─ SPAN.cL385mHb (哈希 —— 内容区)
         ├─ SPAN.webcast-chatroom___content-with-emoji-text (文本弹幕锚点)
         └─ DIV.webcast-chatroom___content-with-emoji-emoji(×N,内含 IMG,表情弹幕锚点)
```

- 昵称与内容区的两个外层 SPAN 均为**哈希类名**,不可硬编码;文本/表情子节点类名才是语义锚点。
- 富内容判定:item 内存在 `IMG` 即 `hasRichContent = true`(表情弹幕 FR-V02 语义与斗鱼一致)。

## 输入框与回填(React 受控,实测警戒)

| 验证项 | 实测结果 | 结论 |
|--------|----------|------|
| 直写 `innerText` + 派发 `InputEvent('input')` | 文本进入 DOM,但 **React 未感知**(发送按钮不出现) | 不可直接照搬斗鱼「写值+派发 input」范式 |
| `document.execCommand('insertText', ...)` | 文本进入且 React 感知 | 可行降级方案 |
| 真实键盘输入 | 完全感知(出现发送按钮 svg) | 基准 |
| 发送按钮 | 输入非空时出现(svg,无稳定 e2e/语义类) | 仅作感知佐证,不作锚点 |

> 结论:抖音输入框的受控更新机制比斗鱼严格,适配器 `fill()` 需在
> 「直写 + 触发 React 事件」组合上独立验证(暂以 execCommand 兜底),与斗鱼实现分叉。

## 飘屏弹幕

> **2026.09.21 实测:** 抖音 PC 直播**无独立飘屏弹幕层** ——
> `[class*="danmu"]` / `[class*="barrage"]` / `[class*="bullet"]` 均无命中;
> 视频容器类名为 `pip-anchor`,其下仅 `VIDEO`。`pauseDanmu` / `resumeDanmu` 降级为 no-op。

## 右键菜单

| 验证项 | 实测结果 | 结论 |
|--------|----------|------|
| contextmenu 事件 | 注入捕获探针实测弹幕条目右键:`prevented: false`(站方未拦截) | 原生菜单不会被替代,插件可挂载自定义收藏菜单 |
| 命中目标 | `e.target` 为 item 内 SPAN,`closest('.webcast-chatroom___item')` 可回退 | 标准化命中链路可行 |

## 登录态(2026.09.21 未登录实测补全:chrome-devtools 全新会话,无 sessionid/uid cookie)

**实测直播间:** ①`live.douyin.com/831242120377`(未开播·预约房) ②`live.douyin.com/411770527302`(央视网·直播中) ③`live.douyin.com/148266540556`(艺然·直播中)。

| 验证项 | 实测结果 | 结论 |
|--------|----------|------|
| 已登录会话 | 存在 `.webcast-chatroom___input-container` + `[contenteditable=true]`,placeholder「与大家互动一下...」 | 输入框为锚点 `hi` |
| **未登录(核心差异)** | **输入框整体不渲染**:无 `input-container`、无 `contenteditable`;聊天区底部被替换为登录提示条 | 判定信号 `hi` |
| 登录提示条 | `.cjR8oGui`(内含 `.LGWzuUuN` → `SPAN.niaw6Avc` 文本「需先登录，才能开始聊天」),不可点击纯占位 | hi |
| 未登录弹幕可见性 | 弹幕列表仍渲染、可滚动(虚拟列表,条目结构与已登录一致) | ✓ 可离线收藏 |
| 未登录右键 | contextmenu 探针实测:`prevented: false`,`target` 命中 `.webcast-chatroom___item` | ✓ 与已登录一致,可挂菜单 |
| 未登录飘屏 | 视频区无 `[class*=danmu/barrage/bullet]`,与已登录一致 | ✓ 无飘屏结论不变 |
| 未登录在线观众 | 显示「登录查看我的排名」「还有 N 名未登录用户正在观看」(`.kbfHnZLv`) | mid(辅助信号) |
| 登录态区分 | 输入框存在 = 已登录;登录提示条存在 = 未登录 | 可作 `getLoginState` 判定依据 |

> **重要:** 未登录时 `locateInput()` / `fill()` 均无目标(输入框缺失)。与斗鱼不同(未登录亦可收藏与回填),
> **抖音适配器需真实返回登录态**:`logged_in`(输入框存在)/ `logged_out`(登录提示条存在)。
> 未登录时收藏弹幕仍可进行(弹幕可见),但回填需引导登录。

## 风险与待补测项

1. **虚拟列表节点复用** —— DOM 恒约 21 条、`data-id` 随复用清空:
   斗鱼「uuid 三重校验」式安全防护在抖音无稳定标识可用,需改用「`isConnected` + 文本一致性」兜底。
2. **React 受控回填** —— 直写派发事件不感知,需独立验证事件序列(见上)。
3. **data-e2e 锚点** —— 抖音自带 `data-e2e=*` 测试锚点(chat/输入区),稳定性优于哈希类名,可作探测兜底;
   但属站点内部约定,随版本可能变更,仅辅助不依赖。
4. **弹幕量低直播间** —— 央视网等媒体直播间弹幕被限流,`probe` 冒烟不应依赖弹幕条目数量;
   未登录弹幕低流与登录无关(已隔离验证),勿将其误判为登录墙。已实测此误判排除。

## 适配器映射(对照 SiteAdapter 接口)

| 接口方法 | 抖音映射 | 与斗鱼差异 |
|----------|----------|------------|
| `isLiveRoom` | URL 首段纯数字 | 无(同范式) |
| `probe` | 必需锚点:输入框或登录提示条(二选一,任一存在即适配存活);可选锚点:`.webcast-chatroom___list` | **与斗鱼分叉**:斗鱼必需=输入框,抖音未登录无输入框,须降级以登录提示条兜底 |
| `findDanmakuItem` | `target.closest('.webcast-chatroom___item')`(含表情/spans 非空过滤) | 选择器替换,逻辑复用 |
| `extract` | 先 `.webcast-chatroom___content-with-emoji-text`,回退 `textContent`;`hasRichContent` 判 `IMG` | 选择器替换,逻辑复用 |
| `locateInput` | `[contenteditable=true]`(未登录返回 null) | 选择器替换 + 归一无输入框 |
| `fill` | **需验证 React 事件序列**(execCommand 兜底);无输入框返回 `NO_INPUT` | **分叉点** |
| `pauseDanmu` / `resumeDanmu` | no-op(无飘屏层) | 降级 |
| `getLoginState` | 输入框存在 → `logged_in`;`.cjR8oGui` 登录提示条存在 → `logged_out` | **分叉点**(斗鱼恒 unknown,抖音需真实判定) |
| `getRoomId` | URL 首段 | 无(同范式) |

## 策略要点

1. 以 **hi 级语义类名**(`webcast-chatroom___*`)为选择器主干,哈希类名(`Cl4EfhXg` / `NkS2Invn` / `v8LY0gZF` / `cL385mHb` 等)一律不硬编码。
2. 列表为虚拟列表,元素事件绑定用事件委托(容器级),避免对复用的 item 直接挂监听。
3. 冒烟检测(probe):核心锚点取输入框;列表缺失仅记录不判失效(同斗鱼 A 起语义)。
4. 实例化前确认 URL 为直播间(`/^\d+$/`),非直播间不挂载 content script 能力(同斗鱼)。