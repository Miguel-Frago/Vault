/* ===== Music: queue, mini-player and lyrics =====
   On Android the native MusicService plays the songs (notification, lock-screen controls, keeps going with the
   screen off or the app closed). The web audio element below is only a fallback for browsers. */
const NM=window.Capacitor?.Plugins?.FileVaultMusic;
let notifAsked=false;
/* If Android is hiding the music notification, offer to open the right settings screen (once per launch). */
function notifCheck(){if(!NM||notifAsked)return;NM.notifStatus().then(s=>{if(s.enabled&&s.channel!==false)return;notifAsked=true;
 if(confirm('Notifications are turned off for FileVault, so the music controls cannot appear in the notification panel, control center or lock screen.\n\nOpen notification settings now? Turn on notifications and the Music playback category, then come back.'))NM.openNotifSettings().catch(()=>{})}).catch(()=>{})}
const AU=new Audio();AU.preload='metadata';
const Q={list:[],i:-1,shuffle:false,repeat:'off'};
const MP={playing:false,pos:0,dur:0};
let MS=null; // the open "now playing" screen
const trackTitle=f=>String(f?.name||'').replace(/\.[^.]+$/,'')||'Unknown track';
const curTrack=()=>Q.list[Q.i];

function musicChanged(){updMini();if(MS)MS.sync(true);psRecord();eqPush()}
function musicState(){updMini();if(MS)MS.sync(false)}
function musicTick(){const b=$('#mini .bar i');if(b&&MP.dur)b.style.width=(MP.pos/MP.dur*100)+'%';if(MS)MS.tick()}

/* ----- web fallback engine ----- */
function webLoad(){const f=curTrack();if(!f)return;AU.src=fileUrl(f.path);AU.play().catch(()=>{});
 try{navigator.mediaSession.metadata=new MediaMetadata({title:trackTitle(f),artist:f.parent||'FileVault'})}catch(e){}musicChanged()}
function webNext(auto){const n=Q.list.length;if(!n)return;
 if(auto&&Q.repeat==='one'){AU.currentTime=0;AU.play().catch(()=>{});return}
 let j;if(Q.shuffle&&n>1){do{j=Math.floor(Math.random()*n)}while(j===Q.i)}
 else{j=Q.i+1;if(j>=n){if(Q.repeat==='all'||!auto)j=0;else{AU.pause();return}}}
 Q.i=j;webLoad()}
function webPrev(){if(AU.currentTime>3){AU.currentTime=0;return}const n=Q.list.length;if(!n)return;Q.i=(Q.i-1+n)%n;webLoad()}
AU.onended=()=>webNext(true);
AU.onplay=AU.onpause=()=>{MP.playing=!AU.paused;musicState()};
AU.ontimeupdate=()=>{MP.pos=AU.currentTime;MP.dur=AU.duration||0;musicTick()};
AU.onerror=()=>{if(!NM&&Q.i>=0){toast('This audio file can’t be played here. Opening it with another app…');const f=curTrack();FV?.openFile({path:f.path}).catch(()=>{})}};
try{const m=navigator.mediaSession;m.setActionHandler('play',()=>AU.play());m.setActionHandler('pause',()=>AU.pause());m.setActionHandler('nexttrack',()=>webNext(false));m.setActionHandler('previoustrack',webPrev)}catch(e){}

/* ----- one engine for both ----- */
const Engine={
 load(list,i){if(NM)NM.setQueue({items:list.map(f=>({path:f.path,title:trackTitle(f),artist:f.parent||'FileVault'})),index:i,shuffle:Q.shuffle,repeat:Q.repeat,play:true}).then(()=>setTimeout(notifCheck,5000)).catch(e=>toast(e.message||'Could not start playback'));else webLoad()},
 toggle(){if(NM)NM.toggle();else AU.paused?AU.play().catch(()=>{}):AU.pause()},
 pause(){if(NM)NM.pause();else AU.pause()},
 next(){if(NM)NM.next();else webNext(false)},
 prev(){if(NM)NM.prev();else webPrev()},
 seek(s){if(NM)NM.seek({ms:Math.round(s*1000)});else AU.currentTime=s},
 mode(){if(NM)NM.setMode({shuffle:Q.shuffle,repeat:Q.repeat})},
 stop(){if(NM)NM.stop();else{AU.pause();AU.removeAttribute('src');AU.load()}}};

function playQueue(list,i,open){
 if(!list.length)return;try{pauseVideo()}catch(e){}
 Q.list=list;Q.i=clamp(i,0,list.length-1);MP.pos=0;MP.dur=0;MP.playing=true;
 Engine.load(list,Q.i);musicChanged();if(open)openMusic()}
const togglePlay=()=>Engine.toggle(),nextTrack=()=>Engine.next(),prevTrack=()=>Engine.prev();
function stopMusic(){Engine.stop();Q.i=-1;Q.list=[];MP.playing=false;MP.pos=0;MP.dur=0;updMini();if(MS)MS.close()}

/* ----- events from the native service ----- */
function applyNative(st){
 const prev=Q.i,was=MP.playing;
 Q.i=st.index;Q.shuffle=!!st.shuffle;Q.repeat=st.repeat||'off';
 MP.playing=!!st.playing;MP.pos=(st.position||0)/1000;MP.dur=(st.duration||0)/1000;
 if(Q.i<0){Q.list=[];updMini();if(MS)MS.close();return}
 if(prev!==Q.i)musicChanged();else if(was!==MP.playing)musicState();else musicTick()}
if(NM){
 NM.addListener('state',applyNative);
 NM.addListener('error',()=>{toast('This audio file can’t be played here. Opening it with another app…');const f=curTrack();if(f&&FV)FV.openFile({path:f.path}).catch(()=>{})});
 /* the service may still be playing from an earlier session: pick the queue back up */
 NM.getState().then(async st=>{if(st.index>=0){const r=await NM.getQueue();Q.list=(r.items||[]).map(x=>({path:x.path,name:x.title,parent:x.artist,type:'music'}));applyNative(st);updMini()}}).catch(()=>{});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Q.i>=0){NM.refresh().catch(()=>{});NM.getState().then(applyNative).catch(()=>{})}})}

/* ----- mini-player above the bottom bar ----- */
function updMini(){
 const m=$('#mini');if(!m)return;const f=curTrack();
 if(!f){m.hidden=true;$('#page')?.classList.remove('mp');return}
 m.hidden=false;$('#page')?.classList.add('mp');
 m.innerHTML=`<span style="color:var(--ac)">${ic('music',24)}</span><div class="t"><b>${esc(trackTitle(f))}</b><small>${esc(f.parent||'FileVault')}</small></div><button class="i" data-a="pp" aria-label="Play or pause">${ic(MP.playing?'pause':'play',24,'fl')}</button><button class="i" data-a="nx" aria-label="Next track">${ic('next',22,'fl')}</button><button class="i" data-a="st" aria-label="Stop">${ic('close',20)}</button><div class="bar"><i style="width:${MP.dur?MP.pos/MP.dur*100:0}%"></i></div>`;
 m.onclick=e=>{const a=e.target.closest('[data-a]')?.dataset.a;if(a==='pp')togglePlay();else if(a==='nx')nextTrack();else if(a==='st')stopMusic();else openMusic()}}

/* ----- lyrics ----- */
function parseLyrics(t){
 const out=[];let timed=0;
 for(const ln of String(t).replace(/\r/g,'').split('\n')){
  const m=[...ln.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)],text=ln.replace(/\[[^\]]*\]/g,'').trim();
  if(m.length){timed++;m.forEach(x=>out.push({t:+x[1]*60+ +x[2]+(x[3]?+('0.'+x[3]):0),s:text}))}else out.push({t:null,s:ln})}
 if(timed>=2)return{synced:true,lines:out.filter(x=>x.t!=null).sort((a,b)=>a.t-b.t)};
 return{synced:false,lines:String(t).replace(/\r/g,'').split('\n').map(s=>({t:null,s}))}}

function lyricsEditor(f,done){
 getLyr(f.path).then(cur=>{
  const m=modal('Lyrics · '+trackTitle(f),`<p class="mu">Paste or type the lyrics. Lines that start with a time, like [01:23.45], scroll in time with the song (.lrc format).</p>
   <textarea id="lt" rows="12" placeholder="Paste or type lyrics here…" style="min-height:220px"></textarea>
   <label>Or import a .lrc / .txt file</label><input type="file" id="lf" accept=".lrc,.txt,text/plain">
   <div class="row"><button class="b grow" id="ls">Save lyrics</button>${cur?'<button class="b2 dn" id="ld">Remove</button>':''}</div>`);
  const ta=$('#lt',m.body);ta.value=cur||'';
  $('#lf',m.body).onchange=async e=>{const file=e.target.files[0];if(!file)return;ta.value=await file.text();toast('File loaded. Tap Save lyrics.')};
  $('#ls',m.body).onclick=async()=>{const t=ta.value.trim();if(t)await setLyr(f.path,ta.value);else await delLyr(f.path);m.close();toast(t?'Lyrics saved':'Lyrics removed');done&&done()};
  if($('#ld',m.body))$('#ld',m.body).onclick=async()=>{await delLyr(f.path);m.close();toast('Lyrics removed');done&&done()}})}

/* ----- the "now playing" screen ----- */
function openMusic(){
 if(MS||!curTrack())return;
 MS=sheet(el=>{
  let lyr=null,idx=-1;
  el.innerHTML=`<header class="hd"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><h2><span>Now playing</span></h2><button class="i" data-q aria-label="Queue">${ic('list',22)}</button></header>
  <div class="mpl"><div class="art">${ic('music',84)}</div>
   <div class="mt"><h2 id="mtt"></h2><p id="mts"></p></div>
   <div class="mseek"><span id="mc">0:00</span><input type="range" id="ms" min="0" max="1000" value="0" aria-label="Seek"><span id="md">0:00</span></div>
   <div class="mctl"><button id="msh" aria-label="Shuffle">${ic('shuffle',22)}</button><button id="mpv" aria-label="Previous">${ic('prev',26,'fl')}</button><button id="mp" aria-label="Play or pause"></button><button id="mnx" aria-label="Next">${ic('next',26,'fl')}</button><button id="mrp" aria-label="Repeat"></button></div>
   <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0"><button class="b2 grow" id="le"></button><button class="b2 grow" id="slp"></button><button class="b2 grow" id="eqb">${ic('sliders',18)} Equalizer</button><button class="b2 grow" id="hst">${ic('clock',18)} History</button></div>
   <div class="lyr" id="ly"></div></div>`;
  const ly=$('#ly',el),sk=$('#ms',el);let drag=0;
  const drawLy=async()=>{const f=curTrack();if(!f)return;const t=await getLyr(f.path);lyr=t?parseLyrics(t):null;idx=-1;
   $('#le',el).innerHTML=`${ic('edit',18)} ${t?'Edit lyrics':'Add lyrics'}`;
   ly.className='lyr'+(lyr&&!lyr.synced?' plain':'');
   ly.innerHTML=lyr?lyr.lines.map((l,i)=>`<p data-i="${i}">${esc(l.s)||'&nbsp;'}</p>`).join(''):'<div class="none">No lyrics yet.<br>Tap “Add lyrics” to paste or type them, or import a .lrc / .txt file.</div>';
   ly.scrollTop=0;el.tick()};
  el.tick=()=>{
   const d=MP.dur||0;$('#mc',el).textContent=fmt(MP.pos);$('#md',el).textContent=fmt(d);if(!drag)sk.value=d?MP.pos/d*1000:0;
   slpDraw(el);
   if(lyr&&lyr.synced){let k=-1;for(let i=0;i<lyr.lines.length;i++){if(lyr.lines[i].t<=MP.pos+.25)k=i;else break}
    if(k!==idx){const ps=ly.children;if(ps[idx])ps[idx].classList.remove('on');idx=k;if(ps[k]){ps[k].classList.add('on');ly.scrollTo({top:ps[k].offsetTop-ly.clientHeight/2+ps[k].clientHeight/2,behavior:'smooth'})}}}};
  el.sync=full=>{const f=curTrack();if(!f)return;
   $('#mtt',el).textContent=trackTitle(f);$('#mts',el).textContent=f.parent||'FileVault';
   $('#mp',el).innerHTML=ic(MP.playing?'pause':'play',30,'fl');
   $('#msh',el).className=Q.shuffle?'on':'off';
   $('#mrp',el).className=Q.repeat==='off'?'off':'on';
   $('#mrp',el).innerHTML=ic('repeat',22)+(Q.repeat==='one'?'<b style="font-size:.7rem;margin-left:1px">1</b>':'');
   if(full)drawLy();el.tick()};
  $('[data-x]',el).onclick=()=>el.close();
  $('[data-q]',el).onclick=()=>{const m=modal('Queue',`<div id="ql">${Q.list.map((f,i)=>`<div class="qrow ${i===Q.i?'on':''}" data-i="${i}"><span class="mu" style="width:26px">${i+1}</span><div class="t"><b>${esc(trackTitle(f))}</b></div></div>`).join('')}</div>`);
   m.body.onclick=e=>{const r=e.target.closest('[data-i]');if(!r)return;Q.i=+r.dataset.i;Engine.load(Q.list,Q.i);musicChanged();m.close()}};
  $('#mp',el).onclick=togglePlay;$('#mnx',el).onclick=nextTrack;$('#mpv',el).onclick=prevTrack;
  $('#msh',el).onclick=()=>{Q.shuffle=!Q.shuffle;Engine.mode();el.sync(false)};
  $('#mrp',el).onclick=()=>{Q.repeat=Q.repeat==='off'?'all':Q.repeat==='all'?'one':'off';Engine.mode();el.sync(false)};
  sk.oninput=()=>{drag=1;if(MP.dur){const t=sk.value/1000*MP.dur;Engine.seek(t);MP.pos=t}$('#mc',el).textContent=fmt(MP.pos)};
  sk.onchange=sk.onpointerup=()=>{drag=0};
  $('#le',el).onclick=()=>{const f=curTrack();if(f)lyricsEditor(f,drawLy)};
  $('#slp',el).onclick=sleepModal;$('#eqb',el).onclick=eqModal;$('#hst',el).onclick=()=>historySheet('recent');
  ly.onclick=e=>{const p=e.target.closest('p[data-i]');if(p&&lyr?.synced){const t=lyr.lines[+p.dataset.i].t;Engine.seek(t);MP.pos=t}};
  el.sync(true)},()=>{MS=null});
}
