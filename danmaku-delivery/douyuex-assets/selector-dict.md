# 斗鱼 DOM 选择器字典

> 综合 DouyuEx 逆向报告（2026.06）与直播间实地验证（2026.08.28）整理。用于本地开发创建斗鱼适配器。
> 验证方法见《斗鱼_抖音直播间_实地验证报告》。

## 稳定性标注

- **hi**：语义类名/稳定 ID，实测仍有效，作为适配器主锚点。
- **mid**：语义类名但依赖登录态或需触发后出现，待登录态复测。
- **verify**：带哈希后缀的 CSS Modules 类名，随前端构建易变，仅作运行时探测项。

## 聊天区（核心交互）

| 选择器 | 作用 | 稳定性 |
|--------|------|--------|
| `.ChatSend-txt` | 弹幕输入框（实测为 DIV + contenteditable） | hi |
| `.ChatSend-button` | 发送按钮（未登录时 `is-gray` 置灰） | hi |
| `#js-barrage-list` / `.Barrage-list` | 弹幕列表容器 / UL | hi |
| `.Barrage-listItem` | 单条弹幕行 LI | hi |
| `.Barrage-content` | 弹幕文本（含 `--color0/5` 颜色变体） | hi |
| `.Barrage-nickName` | 弹幕昵称（含 `--blue` 变体、`js-nick`） | hi |
| `.is-self` | 自己发送的弹幕标记 | hi |
| `.ChatBarrageCollect` | 官方弹幕收藏入口按钮 | hi |
| `.ChatToolBar__left` | 聊天工具栏左侧容器（自定义入口锚点） | hi |
| `.ChatBarrageCollectPop-title` | 官方收藏弹窗标题（需触发后出现） | mid |
| `.Barrage-topFloater` | 锁屏/解锁悬浮工具条（实测会拦截弹幕点击） | hi |
| `.Barrage-topFloaterList` | 工具条内列表 | hi |

## 视频区（飘屏弹幕）

| 选择器 | 作用 | 稳定性 |
|--------|------|--------|
| `.danmu-fbb2a3` | 飘屏弹幕元素（2026.06 为 `.danmu-e7f029`，已变更——哈希易变实证） | verify |
| `.showdanmuWrap-9c22cd` | 飘屏展示容器 | verify |
| `[class*="danmu"]` | 飘屏语义探测兜底 | mid |

## 原生右键面板（需登录态验证）

| 选择器 | 作用 | 稳定性 |
|--------|------|--------|
| `.danmudiv-32f498`（记录值） | 原生弹幕右键面板容器（2026.08 未登录未触发，待登录复测） | verify |
| `.danmuAuthor-*` / `.danmuContent-*` / `.buttonGroup-*` | 面板内昵称 / 文本 / 按钮组（哈希后缀，随构建变更） | verify |

## 策略要点

1. 以 **hi 级语义类名** 为选择器主干。
2. 哈希类名用多候选数组 + 特征探测（`document.querySelectorAll('[class*="关键词"]')`）动态发现，不硬编码。
3. 实例化前用迷你冒烟检测（是否存在 `.ChatSend-txt` 与 `.Barrage-list`）判定站点当前是否符合斗鱼适配器。