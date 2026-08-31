# 斗鱼接口与协议端点清单

> 依据 DouyuEx 逆向报告整理，用于弹幕数据通道参考（关键词自动收藏等高阶需求）。未在 2026.08 实地验证中重新核对，端点可能变化，使用前需实测。

## WebSocket 弹幕协议

| 项 | 值 |
|----|-----|
| 地址模板 | `wss://danmuproxy.douyu.com:850x`（x = 1-8，容错） |
| 认证参数 | `type=gettoken&rid={roomId}` 获取 token |
| 编码 | 自定义二进制协议（request 头 + 8 字节序），`switch` 位标识压缩 |
| 登录包 | `type@=loginreq/`，低序号注册 |
| 心跳 | 45 秒间隔（`type@=mrkl/`），防掉线 |
| 断线重连 | 指数退避 |
| 弹幕消息类型 | `type@=dgb`（普通弹幕）、`chatmsg`、`SGG`（礼物）等 |

## HTTP/HTTPS 接口（站内）

| 端点前缀 | 用途 | 说明 |
|----------|------|------|
| `https://bulletscreen/...` 相关 | 官方弹幕收藏列表 | 云端收藏有上限，DouyuEx 通过 XHR 拦截超限转存 localStorage |
| 房间热门/连接信息 | `api` 鉴权 token | 用于开启 WSS 弹幕流 |

## 前端数据注入

- 直播间页面会预先注入 `room_id` / `roomInfo` / `jsontoken` 等全局变量或 JSON 块，脚本可直接读取而免打接口。

## 本地开发注意

1. WSS 弹幕协议为斗鱼私有二进制编码，实现成本高于 DOM 路径，D1 建议优先走 DOM MutationObserver 采集。
2. 若对接官方收藏接口，涉及账号数据与风控，建议仅保留"本地收藏"完全自主，不依赖云接口。