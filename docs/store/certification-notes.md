# 认证测试说明与提交操作（Certification testing notes）

> 用途：提交 Edge Partner Center 第 8 步「Certification testing notes」时可直接粘贴英文部分；
> 末尾附提交操作清单。演示视频链接 `<待填>` 必须替换。

## Certification testing notes (English, for reviewers)

### Environment

- Microsoft Edge 114+ (Chromium 114+) on Windows 11.
- Supported sites: Douyu (https://www.douyu.com/ ) and Douyin Live (https://live.douyin.com/ ). Both are Chinese-language live-streaming platforms.

### Important notes before testing

- **No test account can be provided.** Accounts on both platforms require a Chinese mainland mobile number with real-name verification, which we cannot issue to reviewers. The core features (collect danmaku, manage library, search, groups, backup) are fully testable **without signing in** — see Test A. Login is required only for two flows: refilling text into Douyin's input box, and importing official Douyu favorites.
- **Geo/availability note.** If the live pages are unreachable from your region or no room is currently live, please use the recorded demo video: `<待填：YouTube 视频链接>`. In that case you can still verify: the extension installs cleanly, the side panel and options pages render, the toolbar icon toggles the side panel, and the in-page entry appears on any reachable live-room page.
- The extension requests host access **only** to douyu.com and douyin.com. It makes **no** outbound requests to third-party servers; you can confirm in DevTools → Network (no requests when using the side panel or collecting messages).

### How to open the extension UI

1. After installation, pin the extension: toolbar **Extensions** (puzzle icon) → pin **弹幕收藏夹 DanmakuBox**.
2. Click the pinned icon → the library opens in the **side panel** (toggles on/off). You can also right-click the icon → **Open in sidebar**, or use the Extensions hub → **Open in sidebar** next to the extension name.

### Test A — Douyin, no login required (primary test path)

1. Open https://live.douyin.com/ and click any live room that is currently streaming.
   - **Expected:** the live chat renders danmaku messages; a small star button appears in the chat toolbar area.
2. **Right-click any danmaku message** in the chat.
   - **Expected:** a custom collect menu appears (title "收藏到…" with the group list; a "＋ 新建分组" option is available). The page's native menu may also appear — the extension's menu is the custom one with the star styling.
3. Choose a group (create one if the library is empty).
   - **Expected:** a brief success toast; the item is stored locally.
4. Click the **star button** in the chat toolbar.
   - **Expected:** an in-page library popup expands above the toolbar (about 378×480). The collected message is listed.
5. In the popup, verify: keyword search; create / rename / delete a group (group actions appear on hover as a "⋮" icon); batch select → move / delete.
   - **Expected:** all operations apply immediately and persist after reopening the popup.
6. **Single-click the stored message's text.**
   - **Expected:** the text is inserted into the live-room input box and a "已回填" toast appears; the popup auto-collapses after ~0.9s so you can review and press send yourself. The extension never auto-sends messages.
7. (Logged-out variant) If not signed in on Douyin: clicking a stored message shows a "登录后才能回填" prompt instead of inserting text.
   - **Expected:** a clear guidance message; collecting and library management still work.

### Test B — Douyu

1. Open https://www.douyu.com/ and enter any live room.
   - **Expected:** danmaku messages appear in the chat area and as scrolling overlay comments; a blue star button appears in the chat toolbar (between "高能" and the official favorite buttons).
2. Repeat the collect / library / refill steps from Test A (steps 2–6). Right-click works on both chat-area messages and scrolling overlay comments.
3. (Logged-out variant) Clicking the star button while logged out shows a clear prompt explaining that login is needed for the full flow.
   - **Expected:** no silent failure; the prompt is visible.

### Test C — side panel and options

1. Click the pinned toolbar icon → the **side panel** opens with the same library.
2. Open the options page (Extensions hub → extension → **Extension options**, or right-click the toolbar icon → **Options**).
   - **Expected:** settings page shows fill mode, fill-after behavior, right-click toggle; Data management section shows storage usage; "导出备份" downloads a JSON file; "导入恢复" accepts it; "清空全部数据" empties the library after downloading a temporary backup.

### Compliance spot checks

- No auto-send: refill only inserts text into the input box; sending is always a manual user action.
- No remote code: all scripts ship inside the package; the extension loads no remote scripts or assets.
- Minimal host access: only `*://*.douyu.com/*` and `*://*.douyin.com/*`.

---

## 提交操作清单（中文）

1. 注册 / 登录 Partner Center（Microsoft 账号，Edge 计划免费），创建新扩展。
2. 上传包：使用 CI 打 tag 后产出的 `danmaku-box-v<版本>.zip`（zip 根目录即 `manifest.json`，无需再加工）。
3. 可用性：Public + 全部市场。
4. 属性：类别「生产力」；填写网站与支持联系方式。
5. 隐私页：粘贴 [edge-listing.md §3](./edge-listing.md) 的单一用途说明、逐权限理由、远程代码=否、数据使用申报；填入隐私政策 URL。
6. Store Listing：粘贴名称/短描述/长描述（中英），上传 Logo 300×300、截图、促销图，填写搜索词。
7. 测试说明：粘贴本文英文部分，替换演示视频链接；提交。
8. 跟踪认证（最长 7 个工作日）；通过后状态变为 In the Store。后续更新：递增版本号 → 重新打 tag → 上传新包。