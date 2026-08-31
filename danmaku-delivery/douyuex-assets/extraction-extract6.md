
======================================================================
[function ol (STT编码)] @char 478908
======================================================================
function ol(e){var t=(t=>{var o,n,i=new Array;o=t.length;for(let e=0;e<o;e++)65536<=(n=String(t).charCodeAt(e))&&n<=1114111?(i.push(n>>18&7|240),i.push(n>>12&63|128),i.push(n>>6&63|128),i.push(63&n|128)):2048<=n&&n<=65535?(i.push(n>>12&15|224),i.push(n>>6&63|128),i.push(63&n|128)):128<=n&&n<=2047?(i.push(n>>6&31|192),i.push(63&n|128)):i.push(255&n);return i})(e),e=new Uint8Array(t.length+4+4+2+1+1+1),o=new Uint8Array(t.length);for(let e=0;e<o.length;e++)o[e]=t[e];var n=new Uint32Array([t.length+4+2+1+1+1]),i=new Uint32Array([689]);return e.set(new Uint8Array(n.buffer),0),e.set(new Uint8Array(n.buffer),4),e.set(new Uint8Array(i.buffer),8),e.set(o,12),e}class nl{constructor(e,t){"WebSocket"in window&&(this.timer=0,this.rid=e,this.msgHandler=t,this.reconnectCount=0,this.maxReconnect=10,this.c

======================================================================
[function N (取type)] @char 273823
======================================================================
function N(e){return v(e,"type@=","/")}let no=!1,L={},io={},ao=[];function ro(){var e=L;localStorage.setItem("ExSave_Mute",JSON.stringify(e))}function lo(e,o,n){return new Promise(t=>{fetch("https://www.douyu.com/room/roomSetting/addMuteUser",{method:"POST",mode:"no-cors",credentials:"include",heade

======================================================================
[function v (取字段)] @char 228244
======================================================================
function v(e,t,o){e=e.match(new RegExp(t+"(.*?)"+o));return!!e&&e[1]}function x(e){var e=new RegExp("(^| )"+e+"=([^;]*)(;|$)");return(e=document.cookie.match(e))?unescape(e[2]):null}function w(){let e=x("acf_ccn");var t,o,n;return null==e&&(t="acf_ccn",o="1",(n=new Date).setTime(n.getTime()+108e5),d

### 'ChatBarrageCollect': 9 hits

======================================================================
[ChatBarrageCollect] @char 166056
======================================================================
2227.png"/>
			</div>
		</div>
	`,(i=document.querySelector("body")).insertBefore(l,i.childNodes[0]);{let e=document.getElementsByClassName("weeklypanel__panel-wrap")[0];document.getElementsByClassName("weeklypanel__close")[0].addEventListener("click",()=>{e.style.display="none"})}}{{let e=setInterval(()=>{void 0!==document.getElementsByClassName("ChatBarrageCollect")[0]&&(clearInterval(e),new q(".ChatBarrageCollect",!1,e=>{var t,o=document.getElementsByClassName("ChatBarrageCollectPop-title");o?0!==o.length&&((t=document.createElement("input")).id="ex-danmaku-collect-search",t.placeholder="搜索弹幕",t.style.marginLeft="6px",o[0].appendChild(t),t.addEventListener("input",Ve)):document.getElementById("ex-danmaku-collect-search").removeEventListener("input",Ve)}))},1e3)}let t=document.getElementsByClassName("ChatSend-txt")[0],o=document.getElem

======================================================================
[ChatBarrageCollect] @char 166107
======================================================================
Selector("body")).insertBefore(l,i.childNodes[0]);{let e=document.getElementsByClassName("weeklypanel__panel-wrap")[0];document.getElementsByClassName("weeklypanel__close")[0].addEventListener("click",()=>{e.style.display="none"})}}{{let e=setInterval(()=>{void 0!==document.getElementsByClassName("ChatBarrageCollect")[0]&&(clearInterval(e),new q(".ChatBarrageCollect",!1,e=>{var t,o=document.getElementsByClassName("ChatBarrageCollectPop-title");o?0!==o.length&&((t=document.createElement("input")).id="ex-danmaku-collect-search",t.placeholder="搜索弹幕",t.style.marginLeft="6px",o[0].appendChild(t),t.addEventListener("input",Ve)):document.getElementById("ex-danmaku-collect-search").removeEventListener("input",Ve)}))},1e3)}let t=document.getElementsByClassName("ChatSend-txt")[0],o=document.getElementsByClassName("ChatBarrageCollect")[0];t.addEvent

======================================================================
[ChatBarrageCollect] @char 166175
======================================================================
tElementsByClassName("weeklypanel__panel-wrap")[0];document.getElementsByClassName("weeklypanel__close")[0].addEventListener("click",()=>{e.style.display="none"})}}{{let e=setInterval(()=>{void 0!==document.getElementsByClassName("ChatBarrageCollect")[0]&&(clearInterval(e),new q(".ChatBarrageCollect",!1,e=>{var t,o=document.getElementsByClassName("ChatBarrageCollectPop-title");o?0!==o.length&&((t=document.createElement("input")).id="ex-danmaku-collect-search",t.placeholder="搜索弹幕",t.style.marginLeft="6px",o[0].appendChild(t),t.addEventListener("input",Ve)):document.getElementById("ex-danmaku-collect-search").removeEventListener("input",Ve)}))},1e3)}let t=document.getElementsByClassName("ChatSend-txt")[0],o=document.getElementsByClassName("ChatBarrageCollect")[0];t.addEventListener("keyup",()=>{var e=("string"==typeof t.value?t.value:t.inne

======================================================================
[Pe(Oe()) 历史入栈] @char 163358
======================================================================
ow.location.reload()},50));break;case"deleteOver":ie(),T("【账号管理】删除完毕","success")}})}document.getElementsByClassName("ChatSend-txt")[0].addEventListener("keydown",e=>{var t=e.target,o="TEXTAREA"===t.tagName;38==e.keyCode?0==$(t)&&(C=0<C?C-1:C,ze()):40==e.keyCode?(o=(o?t.value:t.innerText).length,$(t)==o&&(C=C<De.length-1?C+1:C,ze())):13==e.keyCode&&Pe(Oe())}),document.getElementsByClassName("ChatSend-button")[0].addEventListener("click",()=>{Pe(Oe())});i=document.createElement("span"),i.className="month-cost",i.innerHTML=`
	本月消费 <span id="monthcost__money">***</span> 元
	<span class="monthcost__icon"></span>
	`,i.title="数据每日更新，根据个人中心消费数据统计",l=E(["#js-backpack-enter"]),(l=l&&l.parentElement)&&l

======================================================================
[Pe(Oe()) 历史入栈] @char 163453
======================================================================
tElementsByClassName("ChatSend-txt")[0].addEventListener("keydown",e=>{var t=e.target,o="TEXTAREA"===t.tagName;38==e.keyCode?0==$(t)&&(C=0<C?C-1:C,ze()):40==e.keyCode?(o=(o?t.value:t.innerText).length,$(t)==o&&(C=C<De.length-1?C+1:C,ze())):13==e.keyCode&&Pe(Oe())}),document.getElementsByClassName("ChatSend-button")[0].addEventListener("click",()=>{Pe(Oe())});i=document.createElement("span"),i.className="month-cost",i.innerHTML=`
	本月消费 <span id="monthcost__money">***</span> 元
	<span class="monthcost__icon"></span>
	`,i.title="数据每日更新，根据个人中心消费数据统计",l=E(["#js-backpack-enter"]),(l=l&&l.parentElement)&&l.insertBefore(i,l.childNodes[0]),i=Ho();if(i&&i.addEventListener("click",()=>{Ro=1===Ro?0:1,loc
