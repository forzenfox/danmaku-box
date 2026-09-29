# 弹幕收藏夹 DanmakuBox 隐私政策 / Privacy Policy

最后更新：2026-09-28
适用范围：浏览器扩展「弹幕收藏夹 DanmakuBox」（Chrome / Microsoft Edge 版本，Manifest V3）

---

## 一、核心承诺

**本扩展不收集、不上传、不共享任何用户数据。** 所有弹幕、分组与设置数据仅保存在你本机的浏览器扩展存储（`chrome.storage.local`）中，开发者没有任何服务器接口可以接收这些数据。

- 零上传：扩展不向开发者或任何第三方服务器发送数据。
- 零埋点：不包含任何统计、分析或崩溃上报 SDK。
- 零凭据：不读取、不存储、不代填你的任何账号密码或 Cookie 内容。

## 二、扩展处理哪些数据、如何使用

| 数据类型 | 处理方式 | 是否离开本机 |
|---|---|---|
| 你主动收藏的弹幕文本、所属分组 | 写入浏览器扩展本地存储，用于弹幕库的展示、检索、编辑与导出备份 | 否 |
| 你在扩展内的设置（回填模式、右键开关等） | 写入浏览器扩展本地存储 | 否 |
| 直播间页面的登录状态（仅判定"已登录/未登录"，用于提示） | 内存中即时判定，不落盘 | 否 |
| 页面 URL 与标签页标识 | 内存/会话存储，用于把回填命令路由到正确的直播间标签页 | 否 |
| 弹幕库用量、操作日志（诊断信息） | 写入浏览器扩展本地存储，仅在你主动"导出诊断信息"时生成文件 | 否 |

补充说明：

1. **回填功能**：当你单击弹幕库中的某条弹幕时，扩展会把该文本写入当前直播间输入框，**发送动作始终由你本人完成**，扩展不会自动发送任何消息。
2. **斗鱼官方收藏导入**：该功能由你主动触发，通过你已登录的斗鱼页面、以同源请求读取你自己的斗鱼收藏列表，仅供本地导入使用；请求不经过开发者服务器。
3. **数据删除**：你可以在扩展设置页"清空全部数据"，或直接卸载扩展，即可彻底删除全部本地数据。导出备份文件由你自行保存和管理。

## 三、权限用途说明

| 权限 | 用途 |
|---|---|
| `storage` | 在本地保存弹幕、分组与设置 |
| `sidePanel` | 以浏览器侧边栏承载弹幕库面板 |
| 站点访问权限 `*://*.douyu.com/*`、`*://*.douyin.com/*` | 仅在斗鱼/抖音页面注入右键收藏菜单与「藏+」入口，并执行回填与官方收藏读取 |

扩展不使用 `cookies`、`webRequest`、`scripting` 等权限，不读取浏览历史，不修改浏览器设置与默认搜索引擎。

## 四、第三方

本扩展不集成任何第三方 SDK、不加载任何远程代码与远程资源、不含广告。弹幕文本始终按不可信文本处理（不执行、不注入），杜绝 XSS 风险。

## 五、未成年人

本扩展不面向未成年人收集任何信息（事实上不收集任何人的信息）。

## 六、政策变更与联系方式

如本政策发生变更，我们会在扩展更新说明与仓库中同步公示。
联系方式：`<待填：支持邮箱或仓库 Issues 地址>`

---

## English Version

**DanmakuBox (弹幕收藏夹) — Privacy Policy**

Last updated: 2026-09-28

DanmakuBox is a browser extension (Chrome / Microsoft Edge, Manifest V3) that helps you collect, organize, and refill live-stream chat messages ("danmaku") on Douyu and Douyin live rooms.

**1. We do not collect your data.** The extension does not collect, transmit, or share any personal information. There is no developer-operated server endpoint. No analytics, tracking, or crash-reporting SDK is included.

**2. Data processed and where it stays.** Danmaku you collect, your groups, and your extension settings are stored only in your browser's local extension storage (`chrome.storage.local`) on your device. Login state on a live page is checked in memory only (to show a "please log in" hint) and is never stored. Page URLs and tab identifiers are used in memory/session storage solely to route the "refill" command to the correct live-room tab. Diagnostic logs stay local and are exported only when you click "Export diagnostics".

**3. What leaves your device.** Nothing sent by the extension to the developer or any third party. If you use "Import Douyu favorites", the extension reads your own favorites through your logged-in Douyu page with a same-origin request, on your explicit action, and imports them locally.

**4. Permissions.** `storage` (save danmaku/groups/settings locally); `sidePanel` (show the library panel in the browser side panel); site access to `*://*.douyu.com/*` and `*://*.douyin.com/*` (inject the right-click collect menu and the "藏+" entry on live-room pages, and perform refill / official-favorites reading). The extension does not use `cookies`, `webRequest`, or `scripting`, does not read browsing history, and does not change browser settings or the default search engine.

**5. Refill is manual-send.** Clicking a stored danmaku only inserts its text into the live-room input box. Sending is always performed by you; the extension never auto-sends messages.

**6. Data deletion.** Use "Clear all data" in the options page, or uninstall the extension, to remove all locally stored data. Exported backup files are managed by you.

**7. Third parties.** No third-party SDKs, no remote code, no remote assets, no ads.

**8. Contact:** `<TO FILL: support email or repository Issues URL>`