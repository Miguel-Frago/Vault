/* ===== Video player: the CineVault player, streaming straight from the phone's storage ===== */
let po='land',hold=0,P=null;
const safeSeen=q=>{try{markSeen(q)}catch(e){try{seen.add(q)}catch(x){}}};
const safeSave=n=>{try{savePos(n)}catch(e){}};
const SOp=()=>window.Capacitor?.Plugins?.ScreenOrientation;
const SPEEDS=[1,1.25,1.5,2,.75];

/* 1) native lock (Capacitor plugin)  2) browser lock  3) fall back to rotating the player with CSS */
async function lockO(o){try{const S=SOp();
 if(!o){if(S)await S.unlock();else screen.orientation?.unlock?.();return 0}
 const n=o=='land'?'landscape':'portrait';
 if(S){await S.lock({orientation:n});return 1}
 if(screen.orientation?.lock){await screen.orientation.lock(n);return 1}}catch(e){}return 0}
function fitP(){const el=$('#vo'),w=$('#vw');if(!el||!w)return;const W=el.clientWidth,H=el.clientHeight,
 r=(po=='land')!=(W>H)&&Date.now()>=hold;
 w.style.cssText=r?`width:${H}px;height:${W}px;transform:translate(${W}px,0) rotate(90deg)`:''}
async function setO(o,save=1){po=o;if(save)setS('vo',o);
 $$('#vo .seg button').forEach(b=>b.classList.toggle('on',b.dataset.o==o));
 const ok=await lockO(o);hold=ok?Date.now()+700:0;fitP();if(hold)setTimeout(fitP,720)}

/* remember where the viewer stopped. Only a few numbers are stored, so the length of the video does not matter */
function saveCur(now){if(!P||!P.v||P.v.ended)return;const v=P.v,d=v.duration||0;
 if(d&&v.currentTime>=RES_MIN(d)&&v.currentTime>=d-RES_END(d)){safeSeen(P.path);delete pos[P.path];safeSave(now);return}
 if(v.currentTime>=RES_MIN(d)){pos[P.path]={t:v.currentTime,d,at:Date.now()};safeSave(now)}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveCur(true)});
addEventListener('pagehide',()=>saveCur(true));
function pauseVideo(){const v=$('#vv');if(v&&!v.paused)v.pause()}

/* opts: {title, sub:Blob, done:fn, next:(path)=>({path,title}|null)} */
async function playVideo(path,opts={}){
 if($('#vo'))return;
 if(!native){toast('Open this video from the installed Android app.');return}
 const title=opts.title||byPath.get(path)?.name||path.split('/').pop();
 const startFor=q=>{const x=pos[q];return resOK(x)?x.t:0},o=await getS('vo');let cp=path,pend=startFor(path);
 try{AU.pause()}catch(e){}
 const el=document.createElement('div');el.className='vo';el.id='vo';
 el.innerHTML=`<div class="vw" id="vw"><video id="vv" playsinline preload="metadata" >${opts.sub?`<track kind="subtitles" label="Subtitles" srclang="en" default src="${U(opts.sub)}">`:''}</video>
 <div class="vc" id="vc">
  <div class="vt"><button class="vi" id="vx" aria-label="Close">${ic('back',24)}</button><div class="vn">${esc(title)}</div>
   <div class="seg"><button data-o="land" aria-label="Landscape">${ic('land',18)}<span>Landscape</span></button><button data-o="port" aria-label="Portrait">${ic('port',18)}<span>Portrait</span></button></div></div>
  <div class="vm"><button id="vb1" aria-label="Back 10 seconds">${ic('rew',30)}</button><button id="vp" aria-label="Play or pause">${ic('play',34,'fl')}</button><button id="vf1" aria-label="Forward 10 seconds">${ic('fwd',30)}</button></div>
  <div class="vb"><div class="vr"><span id="vtc">0:00</span><input type="range" id="vs" min="0" max="1000" value="0" step="1" aria-label="Seek"><span id="vtd">0:00</span>${opts.sub?`<button class="vi" id="vcc" aria-label="Subtitles">${ic('cc',22)}</button>`:''}${opts.next?`<button class="vi" id="vnx" aria-label="Next episode">${ic('next',22,'fl')}</button>`:''}${opts.episodes?`<button class="vi" id="vep" aria-label="Seasons and episodes">${ic('list',22)}</button>`:''}<button class="sp" id="vsp" aria-label="Playback speed">1×</button><button class="vi" id="vft" aria-label="Fit or fill">${ic('fit',22)}</button></div></div>
 </div></div>`;
 pushLayer(el,()=>{ // runs when the player is closed (back button or arrow)
  const v=$('#vv',el);saveCur(true);
  try{v.onloadedmetadata=v.ondurationchange=v.ontimeupdate=v.onplay=v.onpause=v.onended=v.onerror=null;v.pause();v.removeAttribute('src');v.load()}catch(e){}
  clearTimeout(nextTimer);clearInterval(nextTick);clearTimeout(resumeTimer);removeEventListener('resize',fitP);removeEventListener('orientationchange',fitP);
  hold=0;lockO(null);const d=P&&P.done;P=null;if(d)d()});
 document.documentElement.style.overflow='hidden';
 const v=$('#vv',el),vc=$('#vc',el),vp=$('#vp',el),vs=$('#vs',el);let tm=0,drag=0,last=0,sp=0,nextTimer=0,nextTick=0,resumeSeeking=false,startRequested=false,started=false,switching=false,resumeTimer=0;
 P={path,v,done:()=>{document.documentElement.style.overflow='';opts.done&&opts.done()}};
 const show=()=>{vc.classList.remove('h');clearTimeout(tm);if(!v.paused&&!drag)tm=setTimeout(()=>vc.classList.add('h'),3200)},
  upd=()=>{const d=v.duration||0;if(!drag)vs.value=d?v.currentTime/d*1000:0;$('#vtc',el).textContent=fmt(v.currentTime);$('#vtd',el).textContent=fmt(d)},
  ico=()=>vp.innerHTML=ic(v.paused?'play':'pause',34,'fl');
 const beginPlayback=()=>{if(!startRequested||started||resumeSeeking||!v.src||v.readyState<1)return;started=true;v.play().catch(()=>{});show()};
 v.onloadedmetadata=()=>{upd();const target=+pend||0;pend=0;if(Number.isFinite(v.duration)&&target>=RES_MIN(v.duration)&&target<v.duration-RES_END(v.duration)){resumeSeeking=true;try{v.currentTime=target;clearTimeout(resumeTimer);resumeTimer=setTimeout(()=>{if(!resumeSeeking)return;if(Math.abs(v.currentTime-target)<2){resumeSeeking=false;beginPlayback()}else{try{v.currentTime=target}catch(e){}resumeSeeking=false;beginPlayback()}},3500)}catch(e){resumeSeeking=false;beginPlayback()}}else beginPlayback()};
 v.onseeked=()=>{if(resumeSeeking){resumeSeeking=false;clearTimeout(resumeTimer);if(v.currentTime>=RES_MIN(v.duration)){pos[cp]={t:v.currentTime,d:v.duration||0,at:Date.now()};savePos(true)}beginPlayback()}upd()};
 v.ondurationchange=upd;
 v.ontimeupdate=()=>{upd();if(resumeSeeking)return;const n=Date.now();if(n-last<4000)return;last=n;if(v.currentTime>=RES_MIN(v.duration)){pos[cp]={t:v.currentTime,d:v.duration||0,at:n};savePos()}};
 v.onplay=()=>{ico();show()};
 v.onpause=()=>{ico();show();if(!switching&&!v.ended&&!resumeSeeking&&v.currentTime>=RES_MIN(v.duration)){pos[cp]={t:v.currentTime,d:v.duration||0,at:Date.now()};savePos(true)}};
 const stopNext=()=>{clearTimeout(nextTimer);clearInterval(nextTick);nextTimer=nextTick=0;const box=$('#nextcount',el);if(box)box.remove()};
 const loadSrc=(p,t)=>{stopNext();saveCur(true);switching=true;try{v.pause()}catch(e){}cp=p;P.path=p;pend=startFor(p);last=0;started=false;resumeSeeking=false;clearTimeout(resumeTimer);$('.vn',el).textContent=t;v.src=fileUrl(p);v.load();switching=false;show();beginPlayback()};
 const queueNext=n=>{stopNext();if(!n)return;let left=10;const box=document.createElement('div');box.id='nextcount';box.className='nextcount';box.innerHTML=`<div class="nextcard"><div class="nextkicker">UP NEXT IN <b id="nextsecs">10</b> SECONDS</div><div class="nexttitle">${esc(n.title)}</div><div class="nextactions"><button type="button" id="nextcancel" class="nextcancel">Cancel</button><button type="button" id="nextplay" class="nextplay">Play now ${ic('next',17,'fl')}</button></div></div>`;($('#vw',el)||el).appendChild(box);const go=()=>loadSrc(n.path,n.title);$('#nextcancel',box).onclick=()=>{stopNext();vc.classList.remove('h')};$('#nextplay',box).onclick=go;nextTick=setInterval(()=>{left--;const label=$('#nextsecs',box);if(label)label.textContent=left;if(left<=0){stopNext();go()}},1000);show()};
 v.onended=()=>{const ended=cp;let n=null;try{n=opts.next&&opts.next(ended)}catch(e){console.warn('next episode lookup failed',e)}
  try{if(n)queueNext(n);else vc.classList.remove('h')}catch(e){console.warn('countdown failed',e)}
  try{delete pos[ended];safeSeen(ended);safeSave(true)}catch(e){}};
 /* Seasons & episodes picker: choose a season first, then an episode inside it */
 const openEpisodes=()=>{
  let data=null;try{data=opts.episodes&&opts.episodes(cp)}catch(e){console.warn('episode list failed',e)}
  if(!data||!data.seasons||!data.seasons.length)return toast('No other episodes found for this video');
  stopNext();const old=$('#epanel',el);if(old)old.remove();
  const pn=document.createElement('div');pn.id='epanel';pn.className='epanel';
  const close=()=>{pn.remove();show()};
  const curS=data.seasons.find(s=>s.eps.some(e=>e.path===cp))||data.seasons[0];
  const drawSeasons=()=>{
   pn.innerHTML=`<div class="eph"><div class="ept">Choose season</div><button class="vi" id="epx" aria-label="Close">${ic('close',22)}</button></div><div class="epl">${data.seasons.map((s,i)=>`<button class="epi${s===curS?' on':''}" data-s="${i}"><b>${esc(s.label)}</b><span>${s.eps.length} episode${s.eps.length>1?'s':''}${s===curS?' · playing now':''}</span></button>`).join('')}</div>`;
   $('#epx',pn).onclick=close;$$('.epi',pn).forEach(b=>b.onclick=()=>drawEps(data.seasons[+b.dataset.s]))};
  const drawEps=s=>{
   const multi=data.seasons.length>1;
   pn.innerHTML=`<div class="eph">${multi?`<button class="vi" id="epb" aria-label="Back to seasons">${ic('back',22)}</button>`:''}<div class="ept">${esc(s.label)} · choose episode</div><button class="vi" id="epx" aria-label="Close">${ic('close',22)}</button></div><div class="epl">${s.eps.map((e,i)=>{const r=resOK(pos[e.path])?' · resume '+fmt(pos[e.path].t):(seen.has(e.path)?' · watched':'');return`<button class="epi${e.path===cp?' on':''}" data-i="${i}"><b>${esc(e.label)}${e.path===cp?' · playing now':''}</b><span>${esc(e.title)}${r}</span></button>`}).join('')}</div>`;
   $('#epx',pn).onclick=close;const bk=$('#epb',pn);if(bk)bk.onclick=drawSeasons;
   $$('.epi',pn).forEach(b=>b.onclick=()=>{const e=s.eps[+b.dataset.i];if(e.path!==cp)loadSrc(e.path,e.title);close()})};
  pn.onclick=ev=>{ev.stopPropagation();if(ev.target===pn)close()};
  ($('#vw',el)||el).appendChild(pn);
  data.seasons.length>1?drawSeasons():drawEps(data.seasons[0])};
 const epb=$('#vep',el);if(epb)epb.onclick=openEpisodes;
 const nx=$('#vnx',el);if(nx)nx.onclick=()=>{const n=opts.next(cp);if(!n)return toast('No more episodes');saveCur(true);loadSrc(n.path,n.title)};
 v.onerror=()=>{toast('This video format can’t play inside FileVault. Opening it with another app…');FV.openFile({path:cp}).catch(()=>{});closeEl(el)};
 vp.onclick=()=>v.paused?v.play().catch(()=>{}):v.pause();
 $('#vb1',el).onclick=()=>{v.currentTime=Math.max(0,v.currentTime-10);show()};
 $('#vf1',el).onclick=()=>{v.currentTime=Math.min(v.duration||1e9,v.currentTime+10);show()};
 vs.oninput=()=>{drag=1;clearTimeout(tm);if(v.duration)v.currentTime=vs.value/1000*v.duration;$('#vtc',el).textContent=fmt(v.currentTime)};
 vs.onchange=vs.onpointerup=()=>{drag=0;show()};
 $('#vw',el).onclick=e=>{if(e.target.closest('button,input'))return;if(vc.classList.contains('h'))show();else{vc.classList.add('h');clearTimeout(tm)}};
 $('.seg',el).onclick=e=>{const b=e.target.closest('button');if(b){setO(b.dataset.o);show()}};
 $('#vx',el).onclick=()=>closeEl(el);
 $('#vft',el).onclick=()=>{v.style.objectFit=v.style.objectFit=='cover'?'contain':'cover';show()};
 $('#vsp',el).onclick=e=>{sp=(sp+1)%SPEEDS.length;v.playbackRate=SPEEDS[sp];e.currentTarget.textContent=SPEEDS[sp]+'×';show()};
 const cc=$('#vcc',el);if(cc)cc.onclick=()=>{const t=v.textTracks[0];if(t){t.mode=t.mode=='showing'?'hidden':'showing';cc.classList.toggle('off',t.mode!='showing')}show()};
 addEventListener('resize',fitP);addEventListener('orientationchange',fitP);
 // Attach all media listeners before assigning src so fast local files cannot race metadata loading.
 v.src=fileUrl(path);v.load();
 await setO(o||'land',0);
 startRequested=true;beginPlayback();show()}
