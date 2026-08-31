
### keyword '右键': 1 hits -> lines [7]

======================================================================
[右键] @char 5535 (line 7)
======================================================================
jMyMzA3NjkgNTMuMTY5MjMwNyw0My4zMjMwNzY5IEM0Ny43MzEzNTAxLDQzLjMyMzA3NjkgNDMuMzIzMDc2OSw0Ny43MzEzNTAxIDQzLjMyMzA3NjksNTMuMTY5MjMwNyBaIiBpZD0i6Lev5b6EIiBmaWxsPSIjMzMzNjNBIj48L3BhdGg+CiAgICAgICAgPC9nPgogICAgPC9nPgo8L3N2Zz4=
// @version      2026.06.03.01
// @description  斗鱼直播间增强插件，功能：弹幕自动变色防检测循环发送 一键续牌 查看真实人数/查看主播数据 已播时长 一键签到(直播间/车队/鱼吧/客户端) 一键领取鱼粮(宝箱/气泡/任务) 一键寻宝 送出指定数量的礼物 一键清空背包 屏蔽广告 调节弹幕大小 自动更新 同屏画中画/多直播间小窗观看/可在斗鱼看多个平台直播(虎牙/b站) 获取真实直播流地址 自动抢礼物红包 背包信息扩展 简洁模式 夜间模式 开播提醒 幻神模式 关键词回复 关键词禁言 自动谢礼物 自动抢宝箱 弹幕右键信息扩展 防止下播自动跳转 影院模式 直播时间流控制 弹幕投票 直播滤镜 直播音频流 账号多开/切换 显示粉丝牌获取日期 月消费数据显示 弹幕时速 相机截图录制gif 全景播放器 斗鱼视频下载/弹幕ass下载 直播画面局部缩放 全站抽奖信息 直播音效增强 阻止P2P上传 显示贡献榜贡献值 恢复弹幕显示 斗鱼视频弹幕高能进度条 检测弹幕是否发送成功 查看主播配置信息 自动网页全屏 自动最高画质 弹幕无限收藏 收藏弹幕搜索 支持弹幕带图片 屏蔽弹幕背景 弹幕+1 房间VIP到期提醒 自动钓鱼 防止自动暂停直播 恢复已关闭鱼吧 弹幕小尾巴 屏蔽重复弹幕 画质增强 画中画增强
// @author       小淳
// @match			*://*.douyu.com/0*
// @match			*://*.douyu.com/1*
// @match			*://*.douyu.com/2*
// @match			*://*.douyu.com/3*
// @match			*://*.douyu.com/4*
// @match			*://*.douyu.com/5*
// @match			*://*.douyu.com/6*
// @match			*://*.douyu.com/7*
// @match			*://*.douyu.com/8*
// @match			*://*.douyu.com/9*
// @match			*://*.douyu.com/beta/*
// @match			*://*.douyu.com/topic/*
// @match        *://www.douyu.com/member/cp/getFansBadgeList
// @match        *://passport.douyu.com/*
// @match        *://msg.douyu.com/*
// @match        *://yuba.douyu.com/*
// @match        *://v.douyu.com/*
// @match        *://cz.douyu.com/*
// @require      https://registry.npmmirror.com/flv.js/1.6.

### keyword 'danmu-menu': 0 hits -> lines []

### keyword 'DanmuMenu': 0 hits -> lines []

### keyword 'barrage-menu': 0 hits -> lines []

### keyword 'menu-item': 1 hits -> lines [1155]

======================================================================
[menu-item] @char 309768 (line 1155)
======================================================================
ant;}
    .Chat{border-top: 1px solid rgb(47,48,53) !important;}
    .DiamondsFansRankInfo-txt, .DiamondsFansRankList-policyText{color: #7f7f7f !important;opacity: 1 !important;}

    .snapbarMenu__szc-e{color: rgb(187,187,187) !important;}
    .snapbarMenu__szc-e div:before{background-color: var(--ex-night-third-bg) !important;}
    .FansMedalPanel-container:after{background: var(--ex-night-third-bg) !important;}
    .snapbarMenu__szc-e{border: 1px solid var(--ex-night-third-bg);}
    .snapbar-menu-item:before{background: var(--ex-night-scroll-bg) !important;}

    /* 滚动条 */
    .Barrage-scroll--bar,.GiftExpandPanelScroll-bar,.InteractEntryScrollThumb{background: var(--ex-night-scroll-bg);transition: all 0.1s;}
    .Barrage-scroll--bar:hover,.GiftExpandPanelScroll-bar:hover,.InteractEntryScrollThumb:hover{background: var(--ex-night-third-bg);}
    .Barrage-main>div>div,.GiftExpandPanel-giftTabsList>div>div,
    .GiftExpandPanel-giftListWrap>div>div,
    .InteractEntryPanel>div>div,
    .BackpackExpandPanel-giftListWrap>div>div,
    .NobleRank-scroll>div
    {margin-bottom: -16px !important;margin-right: -16px !important;}
    /* 滚动条结束 */

    .BatchGiveForm-manual{background: var(--page-background-color) !important;border: none !important;}
    .ToolbarBackpack-giftItem--count, .BatchGiveForm-num{border: 1px solid var(--ex-night-third-bg) !important;}
    .menu-da2a9e{background: #fff !important;}
    .real-audience{color: rgb(187,187,187) !important;}
    .ChatRankDayWeekLi

======================================================================
[function qe] @char 245008 (line 903)
======================================================================
function qe(){let t=localStorage.getItem("ExSave_DanmakuCollect");try{t=JSON.parse(t)||[]}catch(e){t=[]}return t}function Ue(){var e={isTailEnabled:document.getElementById("DanmakuTail-checkbox").checked,tailContent:document.getElementById("DanmakuTail-input").value,type:document.querySelector('input[name="DanmakuTailType"]:checked').value};localStorage.setItem("ExSave_DanmakuTail",JSON.stringify(e))}function We(e,o){return new Promise(t=>{fetch("https://v.douyu.com/api/stream/getStreamUrl",{met

### keyword 'Barrage-list': 15 hits -> lines [399, 886, 886, 964, 1272, 1272, 1272, 1272, 1272, 1272]

======================================================================
[Barrage-list] @char 126820 (line 399)
======================================================================
assName("extool")[0],i.insertBefore(l,i.childNodes[0]),l=document.createElement("div"),l.className="ex_giftAnimation",i=document.getElementsByClassName("Barrage-main")[0],i.insertBefore(l,i.childNodes[0]),document.getElementById("extool__gold_start").addEventListener("click",async function(){var e;1==document.getElementById("extool__gold_start").checked?(ft=new q(".danmu-e7f029",!0,xt),yt=new q(".Barrage-list",!0,vt),document.getElementsByClassName("FansMedalEnter-enterContent")[0].setAttribute("data-medal-level","50")):(ft.closeHook(),yt.closeHook()),e={isGold:e=document.getElementById("extool__gold_start").checked},localStorage.setItem("ExSave_Gold",JSON.stringify(e))}),document.getElementById("extool__goldGift_start").addEventListener("click",async function(){var e;gt=await K(),1==document.getElementById("extool__goldGift_start").checked?bt=new q(".BarrageBanner",!0,wt):bt.closeHook(),e={isGoldGift:e=document.getElementById("extool__goldGift_start").checked},localStorage.setItem("ExSave_GoldGift",JSON.stringify(e))}),l=localStorage.getItem("ExSave_Gold"),null!=l&&1==JSON.parse(l).isGold&&document.getElementById("extool__gold_start").click(),null!=(l=localStorage.getItem("ExSave_

======================================================================
[Barrage-list] @char 239835 (line 886)
======================================================================
/${o.slice(0,4)+"/"+o.slice(4,6)+"/"+o.slice(6,8)+"/"+o}.200x0.`+t[1])).replace("200x0.","")}" target="_blank"><img class="ex-image-danmaku" src="${o}" alt=""></a>`,DOMPurify.sanitize(t)):""}))!==e&&(o.innerHTML=t)}function Ce(t,e){null==t.querySelector("#barragePanel__id")&&(t.childNodes&&0<t.childNodes.length&&t.removeChild(t.childNodes[0]),n=(t=>{let o="";var n=document.getElementsByClassName("Barrage-listItem");for(let e=n.length-1;0<=e;e--){var i=n[e].lastElementChild;if(null!=i&&-1!=i.innerHTML.indexOf(t)){0<i.getElementsByClassName("Barrage-icon--roomAdmin").length&&(o+="【房管】");var a=i.getElementsByClassName("Barrage-nobleImg"),a=(0<a.length&&(o+=`【${a[0].title}】`),i.getElementsByClassName("UserLevel"));0<a.length&&(o+=a[0].title);break}}return o})(e),(o=document.createElement("span")).innerHTML=e,o.title=n,o.id="barragePanel__id",t.insertBefore(o,t.childNodes[0]||null));var o,n=(t=>{let o=!1;var n=document.getElementsByClassName("Barrage-listItem");for(let e=n.length-1;0<=e;e--){var i=n[e].lastElementChild;if(null!=i&&-1!=i.innerHTML.indexOf(t)){i=i.getElementsByClassName("FansMedalWrap");if(0<i.length){o=i[0].cloneNode(!0);break}}}return o})(e);if(0!=n){let e=t.querySelect

### keyword 'js-barrage': 8 hits -> lines [92, 92, 258, 258, 1298, 1299, 1330, 1393]

======================================================================
[js-barrage] @char 28357 (line 92)
======================================================================
iv></div></div>',document.getElementsByClassName("Title-col")[4]);t&&1<t.childNodes.length?t.insertBefore(e,t.childNodes[1]):(t=E([".subTitleContainer__-vzhr"])).appendChild(e)}document.getElementById("ex-audio-line").addEventListener("click",le);{let o=setInterval(()=>{if(null!=E([".PlayerToolbar-ContentCell .PlayerToolbar-Wealth","#js-backpack-enter"])){clearInterval(o),document.getElementById("js-barrage-list").parentNode.id="js-barrage-list-parent";var e=document.createElement("div"),t=(e.style="position: absolute;right: 5px;top: 40px;cursor: pointer;",e.id="ex-removeMsgNotice",e.innerHTML='<label id="msg-removeNotice" style="cursor: pointer;"><input type="checkbox" />关闭角标提醒</label>',e.title="关闭角标提醒",document.getElementsByClassName("PrivateLetter-frame")[0]),t=(t&&t.appendChild(e),document.getElementById("msg-removeNotice"));if(t){let e=t.querySelector("input");t.addEventListener("click",()=>{1==e.checked?(vn=1,xn()):(vn=0,U("Ex_Style_RemoveMsgNotice")),localStorage.setItem("ExSave_isRemoveMsgNotice",vn)})}e=localStorage.getItem("ExSave_isRemoveMsgNotice");e&&"1"==e&&(vn=1,xn(),e=document.getElementById("msg-removeNotice"))&&(e.querySelector("input").checked=!0)}},1e3)}{let e=s

======================================================================
[js-barrage] @char 28390 (line 92)
======================================================================
entsByClassName("Title-col")[4]);t&&1<t.childNodes.length?t.insertBefore(e,t.childNodes[1]):(t=E([".subTitleContainer__-vzhr"])).appendChild(e)}document.getElementById("ex-audio-line").addEventListener("click",le);{let o=setInterval(()=>{if(null!=E([".PlayerToolbar-ContentCell .PlayerToolbar-Wealth","#js-backpack-enter"])){clearInterval(o),document.getElementById("js-barrage-list").parentNode.id="js-barrage-list-parent";var e=document.createElement("div"),t=(e.style="position: absolute;right: 5px;top: 40px;cursor: pointer;",e.id="ex-removeMsgNotice",e.innerHTML='<label id="msg-removeNotice" style="cursor: pointer;"><input type="checkbox" />关闭角标提醒</label>',e.title="关闭角标提醒",document.getElementsByClassName("PrivateLetter-frame")[0]),t=(t&&t.appendChild(e),document.getElementById("msg-removeNotice"));if(t){let e=t.querySelector("input");t.addEventListener("click",()=>{1==e.checked?(vn=1,xn()):(vn=0,U("Ex_Style_RemoveMsgNotice")),localStorage.setItem("ExSave_isRemoveMsgNotice",vn)})}e=localStorage.getItem("ExSave_isRemoveMsgNotice");e&&"1"==e&&(vn=1,xn(),e=document.getElementById("msg-removeNotice"))&&(e.querySelector("input").checked=!0)}},1e3)}{let e=setInterval(()=>{void 0!==document
