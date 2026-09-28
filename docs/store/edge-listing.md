# Edge 商店文案与申报材料（Partner Center 可直接复制）

> 对应扩展：弹幕收藏夹 DanmakuBox v0.1.0（Manifest V3）
> 待填项统一标记为 `<待填：...>`，提交前必须替换为真实值。

## 1. 基础属性

| 字段 | 填写内容 |
|---|---|
| 类别（Category） | 生产力 / Productivity |
| 可见性（Visibility） | 公共 / Public |
| 市场（Markets） | 全部市场（扩展本身面向中文直播平台，市场选择不影响审核） |
| 网站（Website，可选） | `<待填：GitHub 仓库地址>` |
| 支持联系人 | `<待填：支持邮箱 或 仓库 Issues 地址>` |
| 成人内容 | 否 |

## 2. 名称与描述

**扩展名称**（与 manifest 一致，Partner Center 中只读）：
弹幕收藏夹 DanmakuBox

**短描述**（manifest `description`，≤132 字符）：
- 中文：直播弹幕右键收藏、分组管理、一键回填。数据完全本地存储，零上传、零埋点。
- English: Collect, organize, and refill live chat danmaku on Douyu and Douyin. All data stays local — no upload, no tracking.

**长描述（中文，≥250 字符）**：

```
弹幕收藏夹 DanmakuBox 是为斗鱼、抖音直播间打造的弹幕收藏与管理工具。

在看直播时，你经常会遇到想留着以后用的弹幕——一句好笑的梗、一条有用的信息、一个想回应的观点。DanmakuBox 让你无需截图、无需复制粘贴：

· 右键收藏：在直播间弹幕（聊天区与视频区飘屏）上右键，即可把这条弹幕存入指定分组；
· 弹幕库面板：点击浏览器工具栏图标打开侧边栏面板，或在直播间点击聊天工具栏的「藏+」入口就地展开；支持关键词搜索、分组管理（新建/重命名/删除/排序）、批量移动与删除；
· 一键回填：单击弹幕库中的任意一条弹幕，文字自动填入直播间输入框，由你确认后自行发送，全程不会代你发送任何消息；
· 数据管理：支持导出/导入 JSON 备份、清空数据、导出诊断信息；斗鱼官方收藏可一键导入。

隐私优先是 DanmakuBox 的设计底线：所有弹幕、分组与设置只保存在你的浏览器本地，零上传、零埋点，不含任何统计 SDK、不加载任何远程代码、不含广告；扩展只申请运行所必需的最小权限。

支持平台：斗鱼（douyu.com）与抖音（douyin.com）直播间。收藏与弹幕库功能无需登录即可使用；回填与官方收藏导入需要你在对应平台处于登录状态。
```

**长描述（English，≥250 字符）**：

```
DanmakuBox is a live-chat danmaku manager for Douyu and Douyin live rooms.

While watching a live stream, you often want to keep a message — a joke you loved, a useful tip, or something you plan to reply to. DanmakuBox makes it effortless:

· Collect by right-click: right-click any danmaku in the chat area or scrolling overlay and save it into a group.
· Your library, anywhere: open the side panel from the toolbar icon, or use the "藏+" entry on the live-room chat toolbar to expand the library right where you are. Search, organize with groups (create / rename / delete / reorder), and manage messages in batches.
· One-click refill: click any stored danmaku and its text is inserted into the live-room input box. You always review and press send yourself — the extension never auto-sends messages.
· Data management: export / import JSON backups, clear all data, export diagnostics; import your official Douyu favorites in one click.

Privacy by design: everything you collect stays in your browser's local extension storage. No upload, no analytics, no tracking SDK, no remote code, no ads — only the minimal permissions required to work.

Supported platforms: Douyu (douyu.com) and Douyin (douyin.com) live rooms. Collecting and library management work without signing in; refill and official-favorites import require you to be logged in on that platform.
```

**搜索词建议**（Partner Center 的 search terms 字段，逗号分隔）：
`弹幕, 弹幕收藏, 斗鱼, 抖音, 直播, 回填, danmaku, douyu, douyin, live chat`

## 3. 隐私页（Privacy）逐项文案

### 3.1 单一用途说明（Single Purpose，中英双版本，建议填英文）

```
DanmakuBox has one narrow purpose: let users collect, organize, and refill live-chat danmaku on Douyu and Douyin live-room pages. It saves collected messages locally in the browser, shows them in a side panel / in-page library, and inserts a chosen message back into the live-room input box at the user's request.
```

（中文：本扩展仅有一个狭窄用途——让用户在斗鱼/抖音直播间收藏、管理弹幕，并按需把选中的弹幕回填到直播间输入框。所有数据仅存本地。）

### 3.2 权限理由（Permission justification）

| 权限 | 理由（建议填英文） |
|---|---|
| `storage` | Save the user's collected danmaku, groups, and settings locally in the browser. No data leaves the device. |
| `sidePanel` | Host the danmaku library UI in the browser side panel so users can manage messages alongside the live page. |
| `*://*.douyu.com/*` host permission | Required to inject the right-click collect menu and the in-page library entry on Douyu live-room pages, and to perform refill / read the user's own official favorites via same-origin requests. |
| `*://*.douyin.com/*` host permission | Required to inject the right-click collect menu and the in-page library entry on Douyin live-room pages, and to perform refill into the live-room input box. |

补充说明（如表单允许额外备注）：
`web_accessible_resources` 中的 `panel.html/css/js` 仅对上述两个站点开放，用于在直播间页面内嵌「藏+」弹层复用面板 UI，属功能必需的本地资源。

### 3.3 远程代码声明

选择 **No, I am not using remote code**。（MV3，全部脚本随包分发，无远程加载。）

### 3.4 数据使用申报（Data usage）

扩展确实会**访问**页面上的弹幕文本（网站内容）用于收藏，但**仅在设备本地处理、不传输、不与第三方共享**，开发者无任何服务端接口。按此事实申报：

- 若表单将"本地处理"不计入"收集"：选择"不收集任何用户数据"，同时确认其余披露项均与[隐私政策](./privacy-policy.md)一致。
- 若表单要求勾选数据类型：勾选"网站内容（Website content）"，并在说明中注明 *processed and stored locally on device only; never transmitted off the device*。

**注意**：两种填法必须与隐私政策、扩展实际行为三者一致——这是 Edge 审核重点（信息不准确会直接导致延迟或拒审）。

### 3.5 隐私政策 URL

`<待填：托管后的隐私政策公网 URL（如 GitHub Pages / 仓库 raw 链接）>`
文案见 [privacy-policy.md](./privacy-policy.md)，托管后需确认外网可直接打开。

## 4. 商店素材清单

| 素材 | 规格 | 状态 |
|---|---|---|
| 扩展 Logo | 1:1，建议 300×300，最小 128×128 | ✅ 已生成 `docs/store/assets/logo-300.png` |
| 截图 | 1280×800 或 640×400，PNG/JPEG，1–10 张 | ✅ 已生成 2 张（`screenshot-1/2`），可按需补充真实实拍图 |
| 小促销图（可选） | 440×280 | ✅ 已生成 `promo-440x280.png` |
| 大促销图（可选） | 1400×560 | ✅ 已生成 `promo-1400x560.png` |
| 演示视频（可选但强烈建议） | YouTube 链接 | ⬜ `<待填>`，同时填入测试说明 |

素材再生成方式：`powershell -ExecutionPolicy Bypass -File docs/store/assets/generate-assets.ps1`（品牌色 #322A7F 采样自扩展图标，Logo 为矢量重绘）。
截图 2 内容为直播间公屏文本抽样（含用户发言），若审核对页面文本有内容顾虑，可仅提交截图 1（满足最少 1 张要求）。

## 5. 提交前检查清单

- [ ] 所有 `<待填>` 已替换（支持联系方式、隐私政策 URL、视频链接）
- [ ] 隐私政策 URL 外网可访问且内容与申报一致
- [ ] 素材尺寸逐张复核（Logo 1:1；截图 1280×800 或 640×400）
- [ ] 上传包为 CI 产物 zip（根目录即 manifest.json），版本号高于已发布版本
- [ ] 测试说明按 [certification-notes.md](./certification-notes.md) 填写
- [ ] 提交后跟踪认证状态（最长 7 个工作日）；被驳回时对照邮件逐条整改