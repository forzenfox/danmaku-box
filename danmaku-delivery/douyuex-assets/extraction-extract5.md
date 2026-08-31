
======================================================================
[class nl] @char 479568 (line 2013)
======================================================================
class nl{constructor(e,t){"WebSocket"in window&&(this.timer=0,this.rid=e,this.msgHandler=t,this.reconnectCount=0,this.maxReconnect=10,this.closed=!1,this.connect())}connect(){this.ws=new WebSocket("wss://danmuproxy.douyu.com:850"+String(a(2,5))),this.ws.onopen=()=>{this.reconnectCount=0,this.ws.send(ol("type@=loginreq/roomid@="+this.rid)),this.ws.send(ol("type@=joingroup/rid@="+this.rid+"/gid@=-9999/")),this.timer=setInterval(()=>{this.ws.send(ol("type@=mrkl/"))},4e4)},this.ws.onerror=()=>{if(!this.closed&&this.ws)try{this.ws.close()}catch(e){}},this.ws.onmessage=t=>{if(!this.closed){let e=new FileReader;e.onload=()=>{if(!this.closed){var t=String(e.result).split("\0");e=null;for(let e=0;e<t.length;e++)12<t[e].length&&this.msgHandler(t[e])}},e.readAsText(t.data)}},this.ws.onclose=()=>{clearInterval(this.timer),this.timer=0,this.ws=null,this.closed||this.reconnect()}}reconnect(){var e;this.closed||this.reconnectCount>=this.maxReconnect||(this.reconnectCount++,e=Math.min(3e3*Math.pow(1.5,this.reconnectCount-1),6e4),setTimeout(()=>{this.closed||this.connect()},e))}close(){if(!this.closed&&(this.closed=!0,clearInterval(this.timer),this.timer=0,this.ws)){var e=this.ws;this.ws=null,e.onclose=null,e.onerror=null,e.onmessage=null;try{e.readyState!==WebSocket.OPEN&&e.readyState!==WebSocket.CONNECTING||e.close()}catch(e){}}}}function il(e){if(-1!==String(e).indexOf("yuba.douyu.com"))if(-1!==String(e).indexOf("?exRestore"))wn();else if(-1!==String(e).indexOf("?exClean")){let e=v(window.location.href,"domain=","&");ae(()=>{window.parent.postMessage("yubaCleanOver",decodeURIComponent(e)

### 'bulletscreen': 3 hits

======================================================================
[bulletscreen] @char 166853 (line 430)
======================================================================
ventListener("keyup",()=>{var e=("string"==typeof t.value?t.value:t.innerText).length;o.style.display=25<e?"none":""}),document.getElementsByClassName("ChatSend-button")[0].addEventListener("click",()=>{o.style.display=""}),Qr((e,t)=>{if(e.includes("bulletscreen/query"))return(e=JSON.parse(t)).data.list.unshift(...qe().map(e=>({content:e.content,type:2,id:e.id}))),JSON.stringify(e)}),Qr((e,t,o)=>{if(e.includes("bulletscreen/add"))return 0==(e=JSON.parse(t)).error?t:(t=JSON.parse(o).content,o=t,(t=qe()).unshift({content:o,id:(new Date).getTime()}),localStorage.setItem("ExSave_DanmakuCollect",JSON.stringify(t)),e.msg="收藏成功，云收藏已达上限，将收藏至本地（由DouyuEx插件实现无限收藏）",document.querySelector(".ChatBarrageCollect-tip").click(),document.querySelector(".Chat

======================================================================
[bulletscreen] @char 167018 (line 430)
======================================================================
on")[0].addEventListener("click",()=>{o.style.display=""}),Qr((e,t)=>{if(e.includes("bulletscreen/query"))return(e=JSON.parse(t)).data.list.unshift(...qe().map(e=>({content:e.content,type:2,id:e.id}))),JSON.stringify(e)}),Qr((e,t,o)=>{if(e.includes("bulletscreen/add"))return 0==(e=JSON.parse(t)).error?t:(t=JSON.parse(o).content,o=t,(t=qe()).unshift({content:o,id:(new Date).getTime()}),localStorage.setItem("ExSave_DanmakuCollect",JSON.stringify(t)),e.msg="收藏成功，云收藏已达上限，将收藏至本地（由DouyuEx插件实现无限收藏）",document.querySelector(".ChatBarrageCollect-tip").click(),document.querySelector(".ChatBarrageCollect-tip").click(),JSON.stringify(e))}),Qr((e,t,o)=>{var n;e.includes("bulletscreen/del")&&(e=JSON.parse(o).id,n=e,o=qe(),localStorage.setItem("ExSave_Danm

======================================================================
[bulletscreen] @char 167434 (line 430)
======================================================================
_DanmakuCollect",JSON.stringify(t)),e.msg="收藏成功，云收藏已达上限，将收藏至本地（由DouyuEx插件实现无限收藏）",document.querySelector(".ChatBarrageCollect-tip").click(),document.querySelector(".ChatBarrageCollect-tip").click(),JSON.stringify(e))}),Qr((e,t,o)=>{var n;e.includes("bulletscreen/del")&&(e=JSON.parse(o).id,n=e,o=qe(),localStorage.setItem("ExSave_DanmakuCollect",JSON.stringify(o.filter(e=>e.id!==n))))})}Qr((e,t)=>-1!==e.indexOf("group/getBindGroup")?t.replace('"group_status":4','"group_status":0'):t);{let e=0,t=setInterval(()=>{if(100<++e)clearInterval(t);else if(null!=document.getElementsByClassName("ChatSend-txt")[0]){{let e;null!=(e=document.getElementsByClassName("ChatSend-button")[0])&&(e.className="ChatSend-button"),null!=(e=document.getElementsByClassN

======================================================================
[Va def] @char 438751 (line 1986)
======================================================================
lement("div")).className="combo-item combo-item--more",n.textContent=`+${p} 组重复`,a.appendChild(n))}}function Va(t,i,a,r=!1){if(t&&t.text){let e=i.document.createElement("div");e.className="dm"+(r?" dm-self":""),e.innerText=t.text,e.style.fontSize=R.fontSize+"px",e.style.color=r?"#00ff66":(e=>{switch(e){case 1:return"#ff3b30";case 2:return"#0a84ff";case 3:return"#34c759";case 4:return"#ff9500";case 5:return"#af52de";case 6:return"#ff2d55";default:return"#ffffff"}})(t.color),e.style.visibility="hidden",a.appendChild(e);var r=e.offsetWidth,t=i.innerWidth,a=((e,t)=>{let o=Math.floor(e.innerHeight/R.trackHeight);"half"===R.area?o=Math.floor(o/2):"quarter"===R.area&&(o=Math.floor(o/4)),o=Math.max(1,o),window.__pip_track_state__||(window.__pip_track_state__=[]);var n=window.__pip_track_state__,i=e.innerWidth,e=15/R.speed,a=Math.max(.7*e,Math.min(1.4*e,e+t/120/R.speed)),r=(i+t)/a;let l=-1;for(le

### 'danmuproxy': 1 hits

======================================================================
[danmuproxy] @char 479772 (line 2013)
======================================================================
set(new Uint8Array(i.buffer),8),e.set(o,12),e}class nl{constructor(e,t){"WebSocket"in window&&(this.timer=0,this.rid=e,this.msgHandler=t,this.reconnectCount=0,this.maxReconnect=10,this.closed=!1,this.connect())}connect(){this.ws=new WebSocket("wss://danmuproxy.douyu.com:850"+String(a(2,5))),this.ws.onopen=()=>{this.reconnectCount=0,this.ws.send(ol("type@=loginreq/roomid@="+this.rid)),this.ws.send(ol("type@=joingroup/rid@="+this.rid+"/gid@=-9999/")),this.timer=setInterval(()=>{this.ws.send(ol("type@=mrkl/"))},4e4)},this.ws.onerror=()=>{if(!this.closed&&this.ws)try{this.ws.close()}catch(e){}},this.ws.onmessage=t=>{if(!this.closed){let e=new FileReader;e.onload=()=>{if(!this.closed){var t=Strin

### 'wss://': 1 hits

======================================================================
[wss://] @char 479766 (line 2013)
======================================================================
,4),e.set(new Uint8Array(i.buffer),8),e.set(o,12),e}class nl{constructor(e,t){"WebSocket"in window&&(this.timer=0,this.rid=e,this.msgHandler=t,this.reconnectCount=0,this.maxReconnect=10,this.closed=!1,this.connect())}connect(){this.ws=new WebSocket("wss://danmuproxy.douyu.com:850"+String(a(2,5))),this.ws.onopen=()=>{this.reconnectCount=0,this.ws.send(ol("type@=loginreq/roomid@="+this.rid)),this.ws.send(ol("type@=joingroup/rid@="+this.rid+"/gid@=-9999/")),this.timer=setInterval(()=>{this.ws.send(ol("type@=mrkl/"))},4e4)},this.ws.onerror=()=>{if(!this.closed&&this.ws)try{this.ws.close()}catch(e){}},this.ws.onmessage=t=>{if(!this.closed){let e=new FileReader;e.onload=()=>{if(!this.closed){var t
