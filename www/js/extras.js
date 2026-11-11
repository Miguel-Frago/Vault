/* ===== Extras: accent color, play history, sleep timer, equalizer, search everything, storage dashboard =====
   Everything here only reads FileVault's own index and organization data. No original file is changed or copied. */

/* ----- accent color (overrides the theme's accent) ----- */
const ACCENTS=['#e8b04a','#ff4d5e','#3cc8e6','#6fd68b','#b388ff','#ff8a3d','#ff6fb5','#4f8cff'];
function onColor(h){const n=parseInt(h.slice(1),16);return(0.299*(n>>16)+0.587*(n>>8&255)+0.114*(n&255))>150?'#1a1206':'#fff'}
function applyAccent(c){const s=document.documentElement.style;
 if(!/^#[0-9a-f]{6}$/i.test(c||'')){s.removeProperty('--ac');s.removeProperty('--on');return}
 s.setProperty('--ac',c);s.setProperty('--on',onColor(c))}

/* ----- play history (recently played / most played) ----- */
let playStats=null,psLast={p:'',t:0};
const psLoad=async()=>playStats||(playStats=(await getS('plays'))||{});
function psRecord(){const f=curTrack();if(!f||!MP.playing)return;const now=Date.now();
 if(psLast.p===f.path&&now-psLast.t<4000)return;psLast={p:f.path,t:now};
 psLoad().then(s=>{const o=s[f.path]||{n:0};o.n++;o.last=now;s[f.path]=o;setS('plays',s)})}
async function psSongs(kind){const s=await psLoad();
 const l=Object.entries(s).map(([p,o])=>({f:byPath.get(p),...o})).filter(x=>x.f);
 return(kind==='most'?l.sort((a,b)=>b.n-a.n||b.last-a.last):l.sort((a,b)=>b.last-a.last)).slice(0,60)}

function historySheet(start='recent'){
 let kind=start;
 sheet(el=>{
  el.innerHTML=`<header class="hd"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><h2><span>Music history</span></h2></header>
   <div class="pad"><div class="tabs" id="ht"><button data-k="recent" class="${kind==='recent'?'on':''}">Recently played</button><button data-k="most" class="${kind==='most'?'on':''}">Most played</button></div><div id="hl"></div></div>`;
  $('[data-x]',el).onclick=()=>el.close();
  const draw=async()=>{const l=await psSongs(kind),box=$('#hl',el);
   $$('#ht button',el).forEach(b=>b.classList.toggle('on',b.dataset.k===kind));
   box.innerHTML=l.length?l.map((x,i)=>`<div class="gs" data-i="${i}">${ic('music',22)}<div class="t"><b>${esc(trackTitle(x.f))}</b><small>${esc(x.f.parent||'')}${kind==='most'?' · '+x.n+(x.n===1?' play':' plays'):''}</small></div></div>`).join('')
    :'<p class="mu">Nothing here yet. Songs you play will appear in this list.</p>';
   box.onclick=e=>{const r=e.target.closest('[data-i]');if(r)playQueue(l.map(x=>x.f),+r.dataset.i,true)}};
  $('#ht',el).onclick=e=>{const b=e.target.closest('[data-k]');if(b){kind=b.dataset.k;draw()}};
  draw()})}

/* ----- sleep timer (the Android service enforces it, so it works with the screen off) ----- */
let sleepAt=0,sleepT=0;
const sleepLeft=()=>sleepAt?sleepAt-Date.now():0;
async function sleepSet(min){
 clearTimeout(sleepT);sleepAt=min?Date.now()+min*60000:0;
 const web=()=>{if(min)sleepT=setTimeout(()=>{Engine.pause();sleepAt=0;if(MS)MS.tick()},min*60000)};
 if(NM){try{await NM.setSleep({minutes:min})}catch(e){web()}}else web();
 toast(min?`Music will stop in ${min} minutes`:'Sleep timer off');if(MS)MS.tick()}
function sleepModal(){
 const m=modal('Sleep timer',`<p class="mu">Music pauses by itself after the time you choose.</p><div class="row" style="flex-wrap:wrap">${[15,30,45,60].map(v=>`<button class="b2" data-m="${v}">${v} min</button>`).join('')}${sleepLeft()>0?'<button class="b2 dn" data-m="0">Turn off</button>':''}</div>`);
 m.body.onclick=e=>{const b=e.target.closest('[data-m]');if(!b)return;m.close();sleepSet(+b.dataset.m)}}
function slpDraw(el){const b=$('#slp',el);if(!b)return;const l=sleepLeft();
 b.innerHTML=ic('clock',18)+' '+(l>0?`Sleep · ${Math.ceil(l/60000)} min`:'Sleep timer');b.classList.toggle('on',l>0)}
if(NM&&NM.getSleep)NM.getSleep().then(r=>{if(r.left>0)sleepAt=Date.now()+r.left}).catch(()=>{});

/* ----- equalizer (Android only; settings are re-sent to the service once per app launch) ----- */
let eqSet=null,eqPushed=false;
const EQ_PRESETS=[['Flat',[0,0,0,0,0]],['Bass boost',[1,.6,0,0,0]],['Treble boost',[0,0,0,.6,1]],['Vocal',[-.4,0,.7,.5,-.2]],['Rock',[.7,.3,-.3,.4,.7]]];
async function eqLoad(){return eqSet||(eqSet=(await getS('eq'))||{on:false,levels:null})}
async function eqPush(){if(!NM||eqPushed)return;const s=await eqLoad();if(!s.levels)return;eqPushed=true;NM.setEq({enabled:!!s.on,levels:s.levels}).catch(()=>{})}
async function eqModal(){
 if(!NM)return toast('The equalizer is available in the Android app.');
 let info;try{info=await NM.eqInfo()}catch(e){return toast(e.message||'No equalizer on this device')}
 const s=await eqLoad(),n=info.bands,mid=Math.round((info.min+info.max)/2);
 if(!s.levels||s.levels.length!==n)s.levels=Array(n).fill(0);
 const m=modal('Equalizer',`<label class="row"><input type="checkbox" id="eqo" style="width:auto"> Equalizer on</label>
  <div class="row" style="flex-wrap:wrap">${EQ_PRESETS.map(([t],i)=>`<button class="b2" data-pr="${i}">${t}</button>`).join('')}</div>
  <div id="eqb">${s.levels.map((v,i)=>`<label class="mu" style="display:block;margin-top:10px">${info.freqs[i]>=1000?(info.freqs[i]/1000).toFixed(info.freqs[i]%1000?1:0)+' kHz':info.freqs[i]+' Hz'}<input type="range" data-b="${i}" min="${info.min}" max="${info.max}" value="${v}"></label>`).join('')}</div>`);
 const save=()=>{setS('eq',s);NM.setEq({enabled:s.on,levels:s.levels}).catch(()=>{});eqPushed=true};
 const eo=$('#eqo',m.body);eo.checked=!!s.on;eo.onchange=()=>{s.on=eo.checked;save()};
 m.body.oninput=e=>{const r=e.target.closest('[data-b]');if(!r)return;s.levels[+r.dataset.b]=+r.value;if(!s.on){s.on=true;eo.checked=true}save()};
 m.body.onclick=e=>{const b=e.target.closest('[data-pr]');if(!b)return;const p=EQ_PRESETS[+b.dataset.pr][1];
  s.levels=s.levels.map((_,i)=>{const x=n>1?i/(n-1)*(p.length-1):0,a=Math.floor(x),k=p[a]+((p[Math.min(a+1,p.length-1)]-p[a])*(x-a));return Math.round(k>=0?k*info.max:-k*info.min)});
  $$('[data-b]',m.body).forEach((r,i)=>r.value=s.levels[i]);s.on=true;eo.checked=true;save()}}

/* ----- global search: files, albums, movies and Reader collections in one place ----- */
async function openSearch(){
 const RF=rdFold||(await getS('rdf'))||[];
 sheet(el=>{
  el.innerHTML=`<header class="hd"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><h2><span>Search everything</span></h2></header>
   <div class="pad"><input id="gq" type="search" placeholder="Photos, music, books, albums, movies…" autocomplete="off">
   <div id="gr"></div></div>`;
  $('[data-x]',el).onclick=()=>el.close();
  const box=$('#gr',el),open={};
  const shortcuts=()=>{box.innerHTML=`<div class="gsc">
   <button data-go="fav">${ic('heart',22)}<span>Favorites</span></button>
   <button data-go="recent">${ic('music',22)}<span>Recently played</span></button>
   <button data-go="most">${ic('shuffle',22)}<span>Most played</span></button>
   <button data-go="storage">${ic('grid',22)}<span>Storage</span></button></div>`};
  const draw=()=>{const q=$('#gq',el).value.trim().toLowerCase();if(!q)return shortcuts();
   const hit=s=>String(s||'').toLowerCase().includes(q),G=[];
   const al=albums.filter(a=>hit(a.name));if(al.length)G.push({k:'al',t:'Albums',i:'album',l:al.map(a=>({id:a.id,n:a.name,m:albumCount(a)+' files'}))});
   const mv=cvMovies.filter(m=>hit(m.title));if(mv.length)G.push({k:'mv',t:'Movies & TV (CineVault)',i:'film',l:mv.map(m=>({id:m.id,n:m.title,m:[m.year,m.fav?'Favorite':''].filter(Boolean).join(' · ')}))});
   const rd=RF.filter(f=>hit(f.name));if(rd.length)G.push({k:'rd',t:'Reader collections',i:'book',l:rd.map(f=>({id:f.id,n:f.name,m:(f.kind==='manga'?'Manga':'Novels')+' · '+(f.paths.length+f.folders.reduce((a,s)=>a+s.paths.length,0))+' files'}))});
   for(const[t,name,ico]of TYPES){const l=files.filter(f=>f.type===t&&(hit(f.name)||hit(f.path)));
    if(l.length)G.push({k:'f'+t,t:name,i:ico,files:l,l:l.map(f=>({p:f.path,n:f.name,m:bytes(f.size)+(favs.has(f.path)?' · ♥':'')}))})}
   box.innerHTML=G.length?G.map(g=>{const all=open[g.k],l=all?g.l:g.l.slice(0,6);
    return`<h3 class="gh">${ic(g.i,16)} ${esc(g.t)} <span class="mu">${g.l.length}</span></h3>`+l.map((x,j)=>`<div class="gs" data-g="${g.k}" data-j="${j}">${ic(g.i,22)}<div class="t"><b>${esc(x.n)}</b><small>${esc(x.m||'')}</small></div></div>`).join('')+(g.l.length>6&&!all?`<button class="b2" data-more="${g.k}" style="width:100%">Show all ${g.l.length}</button>`:'')}).join(''):'<p class="mu">No matches.</p>';
   box._G=G};
  box.onclick=e=>{
   const act=e.target.closest('[data-go]')?.dataset.go;
   if(act==='fav'){closeAll();lib.type='fav';lib.q='';go('lib');return}
   if(act==='recent'||act==='most'){historySheet(act);return}
   if(act==='storage'){storageSheet();return}
   const more=e.target.closest('[data-more]');if(more){open[more.dataset.more]=1;const y=el.scrollTop;draw();el.scrollTop=y;return}
   const r=e.target.closest('[data-g]');if(!r)return;const g=box._G.find(x=>x.k===r.dataset.g),x=g.l[+r.dataset.j];
   if(g.k==='al')albumSheet(x.id);else if(g.k==='mv')cvDetail(x.id);else if(g.k==='rd')rdFolderSheet(x.id);
   else openFile(x.p,g.files)};
  $('#gq',el).oninput=draw;draw();setTimeout(()=>$('#gq',el).focus(),250)})}
const closeAll=()=>[...layers].reverse().forEach(l=>closeEl(l.el));

/* ----- storage dashboard ----- */
const SCOL={photos:'#4f8cff',videos:'#ff6fb5',music:'#e8b04a',documents:'#6fd68b',apps:'#b388ff',other:'#9c97a6'};
const dirOf=p=>String(p).split('/').slice(0,-1).join('/');
async function storageSheet(){
 let dev=null;if(native)try{dev=await FV.storageInfo()}catch(e){}
 sheet(el=>{
  const by={},tot={n:0,b:0};files.forEach(f=>{const o=by[f.type]||(by[f.type]={n:0,b:0});o.n++;o.b+=f.size||0;tot.n++;tot.b+=f.size||0});
  const dirs={};files.forEach(f=>{const d=dirOf(f.path);dirs[d]=(dirs[d]||0)+(f.size||0)});
  const topDirs=Object.entries(dirs).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const big=[...files].sort((a,b)=>b.size-a.size).slice(0,10),rec=[...files].sort((a,b)=>b.modified-a.modified).slice(0,8);
  const row=f=>`<div class="gs" data-p="${esc(f.path)}">${ic(TICON[f.type]||'file',22)}<div class="t"><b>${esc(f.name)}</b><small>${bytes(f.size)} · ${esc(dirOf(f.path).split('/').slice(-2).join('/'))}</small></div></div>`;
  const kinds=TYPES.map(t=>t[0]).filter(k=>by[k]);
  el.innerHTML=`<header class="hd"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><h2><span>Storage</span></h2></header><div class="pad">
   ${dev?`<div class="card2"><h3>Phone storage</h3><div class="sbar"><i style="width:${Math.min(100,(dev.total-dev.free)/dev.total*100)}%;background:var(--ac)"></i></div><p class="mu">${bytes(dev.total-dev.free)} used of ${bytes(dev.total)} · ${bytes(dev.free)} free</p></div>`:''}
   <div class="card2"><h3>FileVault library</h3><p class="mu">${tot.n} files · ${bytes(tot.b)}</p>
    ${tot.b?`<div class="sbar">${kinds.map(k=>`<i style="width:${by[k].b/tot.b*100}%;background:${SCOL[k]}"></i>`).join('')}</div>`:''}
    ${kinds.map(k=>`<div class="sl"><span class="dot" style="background:${SCOL[k]}"></span><b>${esc(TLABEL[k])}</b><span class="mu">${by[k].n} ${by[k].n===1?'file':'files'}</span><span>${bytes(by[k].b)}</span></div>`).join('')||'<p class="mu">Scan your phone from the Library tab first.</p>'}</div>
   ${topDirs.length?`<div class="card2"><h3>Biggest folders</h3>${topDirs.map(([d,b])=>`<div class="sl"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.split('/').slice(-2).join('/')||'/')}</b><span>${bytes(b)}</span></div>`).join('')}</div>`:''}
   ${big.length?`<div class="card2"><h3>Largest files</h3>${big.map(row).join('')}</div><div class="card2"><h3>Recently added</h3>${rec.map(row).join('')}</div>`:''}
   <p class="mu">Calculated on this phone from FileVault's index. Nothing is uploaded.</p></div>`;
  $('[data-x]',el).onclick=()=>el.close();
  el.onclick=e=>{const r=e.target.closest('[data-p]');if(r)openFile(r.dataset.p)}})}
