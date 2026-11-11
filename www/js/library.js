/* ===== Library: scan, lists, thumbnails, selection ===== */
const lib={type:'all',q:'',tag:'',album:'',limit:150};
let appsCache=null;
const sel=new Set();
const VIEWS=[['list','list','List'],['s','grid','Small icons'],['m','grid','Medium icons'],['xl','grid','Large icons']];
const viewCls=v=>v==='list'?'l':v==='s'?'g s':v==='xl'?'g xl':'g';

/* ----- thumbnails: made on demand, then kept in a size-capped cache (Settings) ----- */
const thumbCache=new Map();let thumbQ=[],thumbBusy=0;
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){io.unobserve(e.target);hydrate(e.target)}}),{rootMargin:'300px'});
const THUMB_T=['photos','videos','app'];
function observeThumbs(root=document){$$('[data-t][data-p]:not([data-h])',root).forEach(el=>{if(THUMB_T.includes(el.dataset.t)){el.dataset.h='1';io.observe(el)}})}
function setThumb(el,src,type){if(!el.isConnected)return;el.innerHTML=`<img class="${type==='app'?'app':''}" alt="" src="${src}">${type==='videos'&&el.classList.contains('fth')?'<span class="pl">▶</span>':''}`;el.firstChild.onerror=()=>{el.innerHTML=ic(TICON[type]||'apk',24)}}
function memThumb(k,u){thumbCache.set(k,u);if(thumbCache.size>400){const o=thumbCache.keys().next().value;URL.revokeObjectURL(thumbCache.get(o));thumbCache.delete(o)}}
function hydrate(el){
 const p=el.dataset.p,type=el.dataset.t,f=byPath.get(p),key=type==='app'?'app|'+p:`${type}|${p}|${f?f.modified:0}|${f?f.size:0}`;
 if(thumbCache.has(key))return setThumb(el,thumbCache.get(key),type);
 thumbQ.push(async()=>{if(!el.isConnected)return;
  try{const rec=await thumbGet(key);if(rec&&rec.blob){const u=URL.createObjectURL(rec.blob);memThumb(key,u);return setThumb(el,u,type)}}catch(e){}
  if(!native)return;
  let b64;
  try{b64=type==='photos'?(await FV.imageThumbnail({path:p,size:320})).base64:type==='videos'?(await FV.videoThumbnail({path:p})).base64:(await FV.appIcon({packageName:p})).base64}
  catch(e){if(type==='photos'){setThumb(el,fileUrl(p),type);return}if(type==='videos'&&typeof webThumb==='function'){const w=await webThumb(p);if(w){thumbPut(key,w);const u=URL.createObjectURL(w);memThumb(key,u);setThumb(el,u,type)}}return}
  let blob=d2b((type==='app'?'data:image/png;base64,':'data:image/jpeg;base64,')+b64);if(type==='videos')blob=await shrink(blob,480);
  thumbPut(key,blob);const u=URL.createObjectURL(blob);memThumb(key,u);setThumb(el,u,type)});
 pumpThumbs()}
function pumpThumbs(){while(thumbBusy<2&&thumbQ.length){const j=thumbQ.pop();thumbBusy++;j().catch(()=>{}).finally(()=>{thumbBusy--;pumpThumbs()})}}

/* ----- one row / tile, used by library, albums and the file picker ----- */
function fileRow(f,o={}){
 return `<article class="fi ${o.sel?'sel':''}" data-p="${esc(f.path)}"><div class="fth" data-p="${esc(f.path)}" data-t="${f.type}">${ic(TICON[f.type]||'file',24)}</div><div class="fx"><div class="fn">${esc(f.name)}</div><div class="fm">${esc(TLABEL[f.type]||f.type)} · ${bytes(f.size)}${f.parent?' · '+esc(f.parent):''}</div></div>${o.actions||''}${o.check?`<input class="ck" type="checkbox" ${o.sel?'checked':''} aria-label="Select ${esc(f.name)}">`:''}</article>`}
const libActions=f=>`<div class="fa">${lib.type==='movies'?`<button class="i mkep" aria-label="This is an episode">${ic('film',18)}</button>`:''}<button class="i fav ${favs.has(f.path)?'on':''}" aria-label="Favorite">${ic('heart',18)}</button><button class="i shr" aria-label="Share">${ic('share',18)}</button></div>`;

/* ----- scan ----- */
function setStatus(t,cls){const s=$('#st');if(!s)return;s.textContent=t;s.className='notice '+(cls||'')}
async function scan(){
 if(!native){toast('Open the installed Android app to scan phone storage.');return}
 try{setStatus('Checking storage permission…');const p=await FV.hasStorageAccess();
  if(!p.granted){setStatus('Allow “All files access” for FileVault in Android settings, then come back and scan again.','warn');await FV.requestStorageAccess();return}
  setStatus('Scanning your phone. A large library may take a minute…');
  const r=await FV.scanFiles();setFiles((r.files||[]).map(({id,...x})=>x));lastScan=Date.now();
  await setS('fileIndex',files);await setS('lastScan',lastScan);sel.clear();
  setStatus(`Scan complete: ${files.length} files found. Your original files were not changed.`,'good');
  if(curTab==='lib')renderTab()}
 catch(e){setStatus(e.message||'The scan could not be completed.','warn')}}

/* ----- filtering ----- */
function libFiltered(){
 const q=lib.q.trim().toLowerCase();let l=files;
 if(lib.type==='fav')l=l.filter(f=>favs.has(f.path));else if(lib.type==='movies')l=l.filter(f=>f.type==='videos'&&!isEpisode(f.path));else if(lib.type!=='all')l=l.filter(f=>f.type===lib.type);
 if(lib.tag)l=l.filter(f=>(fileTags[f.path]||[]).includes(lib.tag));
 if(lib.album){const a=albums.find(x=>x.id===lib.album);if(a){const set=new Set([...a.paths,...a.folders.flatMap(x=>x.paths)]);l=l.filter(f=>set.has(f.path))}}
 if(q)l=l.filter(f=>f.name.toLowerCase().includes(q)||f.path.toLowerCase().includes(q));
 const S={new:(a,b)=>b.modified-a.modified,old:(a,b)=>a.modified-b.modified,name:(a,b)=>a.name.localeCompare(b.name),size:(a,b)=>b.size-a.size};
 return[...l].sort(S[prefs.sort]||S.new)}
let libShown=[];

function renderLibrary(root){
 const tabs=[['all','All files','grid'],['photos','Photos','image'],['videos','Videos','video'],['shows','Shows','film'],['movies','Movies','video'],['installed','Installed apps','apk'],...TYPES.slice(2).map(t=>[t[0],t[1],t[2]]),['fav','Favorites','heart']];
 const when=lastScan?new Date(lastScan).toLocaleString():'';
 root.innerHTML=`<header class="hd"><h1>${ic('logo',26)} FileVault</h1><button class="i" id="gsB" aria-label="Search everything">${ic('search',22)}</button><button class="i" id="scanB" aria-label="Scan phone">${ic('scan',22)}</button></header>
 <div class="pad">
  ${files.length?'':`<div class="hero"><h2>Your personal file space</h2><p>Browse and organize the files on this phone. Albums, tags and favorites stay inside FileVault; your real files are never moved or copied.</p><div class="row"><button class="b" id="scanBig">${ic('scan',18)} Scan phone</button></div></div>`}
  <div id="st" class="notice ${files.length?'good':'warn'}">${files.length?`${files.length} files in your library${when?' · last scan '+esc(when):''}.`:(native?'First, allow FileVault to access files on your device, then scan your phone.':'Open the installed Android app to scan phone storage.')}</div>
  <div class="stats">${[[files.length,'Files'],[albums.length,'Albums'],[favs.size,'Favorites']].map(([v,l])=>`<div class="st"><b>${v}</b><span class="mu">${l}</span></div>`).join('')}</div>
  <div class="tabs" id="ltabs">${tabs.map(([k,n,i])=>`<button data-k="${k}" class="${lib.type===k?'on':''}">${ic(i,16)} ${esc(n)}</button>`).join('')}</div>
  <input id="q" type="search" placeholder="Search files by name" value="${esc(lib.q)}" autocomplete="off">
  <div class="tools"><select id="so" aria-label="Sort">${[['new','Newest first'],['old','Oldest first'],['name','Name A–Z'],['size','Largest first']].map(([v,t])=>`<option value="${v}" ${prefs.sort==v?'selected':''}>${t}</option>`).join('')}</select>
   <select id="tg" aria-label="Tag filter"><option value="">All tags</option>${tags.map(t=>`<option ${lib.tag==t?'selected':''}>${esc(t)}</option>`).join('')}</select>
   ${albums.length?`<select id="ag" aria-label="Album filter" style="grid-column:span 2"><option value="">All albums</option>${albums.map(a=>`<option value="${esc(a.id)}" ${lib.album==a.id?'selected':''}>Album: ${esc(a.name)}</option>`).join('')}</select>`:''}</div>
  <div class="row"><span class="mu grow" id="cnt"></span><div class="vt2">${VIEWS.map(([k,i,t])=>`<button data-v="${k}" class="${prefs.view===k?'on':''}" aria-label="${t}">${ic(i,16)}</button>`).join('')}</div></div>
  <div id="cw"></div><div id="fl" class="files"></div><div id="fmore"></div>
 </div>`;
 $('#gsB').onclick=openSearch;$('#scanB').onclick=scan;if($('#scanBig'))$('#scanBig').onclick=scan;
 $('#ltabs').onclick=e=>{const b=e.target.closest('[data-k]');if(!b)return;lib.type=b.dataset.k;lib.limit=150;$$('#ltabs button').forEach(x=>x.classList.toggle('on',x===b));drawLib()};
 $('#q').oninput=e=>{lib.q=e.target.value;lib.limit=150;drawLib()};
 $('#so').onchange=e=>{prefs.sort=e.target.value;savePrefs();drawLib()};
 $('#tg').onchange=e=>{lib.tag=e.target.value;drawLib()};
 if($('#ag'))$('#ag').onchange=e=>{lib.album=e.target.value;lib.limit=150;drawLib()};
 $('.vt2').onclick=e=>{const b=e.target.closest('[data-v]');if(!b)return;prefs.view=b.dataset.v;savePrefs();$$('.vt2 button').forEach(x=>x.classList.toggle('on',x===b));drawLib()};
 bindLibList();drawLib()}

function continueRow(){
 if(lib.type!=='videos'||lib.q)return '';
 const items=Object.entries(pos).filter(([p,x])=>byPath.has(p)&&resOK(x)).sort((a,b)=>b[1].at-a[1].at).slice(0,8);
 if(!items.length)return '';
 return `<h3 class="sh">Continue watching</h3><div class="hs vid">${items.map(([p,x])=>{const f=byPath.get(p);return `<div class="card" data-play="${esc(p)}"><div class="ph" data-p="${esc(p)}" data-t="videos">${ic('video',34)}</div><div class="ov"><b>${esc(f.name)}</b><span class="mu">${fmt(x.t)} / ${fmt(x.d)}</span><div class="pb"><i style="width:${Math.min(100,x.t/(x.d||1)*100)}%"></i></div></div></div>`}).join('')}</div>`}

async function drawApps(){
 const fl=$('#fl');$('#cw').innerHTML='';$('#fmore').innerHTML='';fl.className='';
 if(!native){fl.innerHTML='<div class="empty">Installed apps are listed in the Android app.</div>';return}
 fl.innerHTML='<p class="mu">Loading apps…</p>';
 try{if(!appsCache){const r=await FV.listApps();appsCache=(r.apps||[]).sort((a,b)=>a.name.localeCompare(b.name))}}catch(e){fl.innerHTML='<div class="empty">Could not list installed apps.</div>';return}
 if(lib.type!=='installed')return;
 const q=lib.q.trim().toLowerCase(),l=appsCache.filter(a=>!q||a.name.toLowerCase().includes(q));
 $('#cnt').textContent=`${l.length} app${l.length==1?'':'s'}`;fl.className='files g';
 fl.innerHTML=l.map(a=>`<div class="fi" data-app="${esc(a.packageName)}"><div class="fth" data-p="${esc(a.packageName)}" data-t="app">${ic('apk',24)}</div><div class="fx"><div class="fn">${esc(a.name)}</div></div></div>`).join('')||'<div class="empty" style="grid-column:1/-1">No apps match.</div>';
 observeThumbs($('#page'))}

function drawLib(){
 if(lib.type==='installed'){drawApps();return}
 if(lib.type==='shows'){const fl=$('#fl');$('#cw').innerHTML='';fl.className='';fl.innerHTML=showsListHtml(lib.q);$("#cnt").textContent=`${buildShows().shows.length} show${buildShows().shows.length==1?"":"s"}`;$('#fmore').innerHTML='';observeThumbs($('#page'));return}
 const list=libFiltered();libShown=list;const shown=list.slice(0,lib.limit);
 $('#cnt').textContent=`${list.length} item${list.length==1?'':'s'}`;
 $('#cw').innerHTML=continueRow();
 const fl=$('#fl');fl.className='files '+viewCls(prefs.view);
 fl.innerHTML=shown.length?shown.map(f=>fileRow(f,{sel:sel.has(f.path),check:true,actions:libActions(f)})).join(''):`<div class="empty" style="grid-column:1/-1">${files.length?'No matching files. Try another search or filter.':'No files listed yet. Tap the scan button to begin.'}</div>`;
 $('#fmore').innerHTML=list.length>shown.length?`<button class="b2 more" id="moreB">Show more (${list.length-shown.length} left)</button>`:'';
 if($('#moreB'))$('#moreB').onclick=()=>{lib.limit+=200;drawLib()};
 observeThumbs($('#page'))}

function bindLibList(){
 const fl=$('#fl');let lpT=0,lpFired=0;
 const stop=()=>clearTimeout(lpT);
 fl.onpointerdown=e=>{const fi=e.target.closest('.fi');if(!fi||e.target.closest('.fa,.ck'))return;lpFired=0;lpT=setTimeout(()=>{lpFired=1;navigator.vibrate?.(15);toggleSel(fi.dataset.p,fi)},450)};
 fl.onpointerup=fl.onpointercancel=fl.onpointerleave=stop;
 fl.onscroll=stop;
 fl.onclick=async e=>{const ap=e.target.closest('[data-app]');if(ap){FV.launchApp({packageName:ap.dataset.app}).catch(er=>toast(er.message||'This app cannot be launched.'));return}const sh=e.target.closest('[data-show]');if(sh){showSheet(sh.dataset.show);return}const fi=e.target.closest('.fi');if(!fi)return;if(lpFired){lpFired=0;return}const p=fi.dataset.p;
  if(e.target.closest('.ck')){toggleSel(p,fi);return}
  if(e.target.closest('.fav')){favs.has(p)?favs.delete(p):favs.add(p);await saveFavs();if(lib.type==='fav')drawLib();else e.target.closest('.fav').classList.toggle('on',favs.has(p));return}
  if(e.target.closest('.mkep')){const f=byPath.get(p);editEpisode({f,show:'',season:1,episode:''},()=>drawLib());return}
  if(e.target.closest('.shr')){share([p]);return}
  if(sel.size){toggleSel(p,fi);return}
  openFile(p,libShown)};
 $('#cw').onclick=e=>{const c=e.target.closest('[data-play]');if(c)playVideo(c.dataset.play,{title:byPath.get(c.dataset.play)?.name})}}

/* ----- selection bar ----- */
function toggleSel(p,el){sel.has(p)?sel.delete(p):sel.add(p);if(el){el.classList.toggle('sel',sel.has(p));const c=$('.ck',el);if(c)c.checked=sel.has(p)}renderSelbar()}
function clearSel(){sel.clear();$$('.fi.sel').forEach(x=>{x.classList.remove('sel');const c=$('.ck',x);if(c)c.checked=false});renderSelbar()}
function renderSelbar(){const b=$('#selbar');if(!sel.size){b.hidden=true;document.body.classList.remove('sel');return}
 b.hidden=false;document.body.classList.add('sel');
 b.innerHTML=`<b>${sel.size} selected</b><button class="i" data-a="album" aria-label="Add to album">${ic('album',22)}</button><button class="i" data-a="tag" aria-label="Tags">${ic('tag',22)}</button><button class="i" data-a="fav" aria-label="Favorite">${ic('heart',22)}</button><button class="i" data-a="share" aria-label="Share">${ic('share',22)}</button><button class="i" data-a="clear" aria-label="Clear selection">${ic('close',22)}</button>`;
 b.onclick=async e=>{const a=e.target.closest('[data-a]')?.dataset.a;if(!a)return;const ps=[...sel];
  if(a==='clear')clearSel();
  else if(a==='share')share(ps);
  else if(a==='album')addToAlbumFlow(ps);
  else if(a==='tag')tagFlow(ps);
  else if(a==='fav'){const all=ps.every(p=>favs.has(p));ps.forEach(p=>all?favs.delete(p):favs.add(p));await saveFavs();toast(all?'Removed from favorites':'Added to favorites');clearSel();if(curTab==='lib')drawLib()}}}

async function share(paths){
 if(!paths.length)return toast('Select at least one file first.');
 if(!native)return toast('Sharing is available in the Android app.');
 try{await FV.shareFiles({paths})}catch(e){toast(e.message||'Could not open sharing.')}}

/* ----- add selected files to an album / subfolder ----- */
function targetsFor(paths){
 const ts=new Set(paths.map(ftype)),one=ts.size===1?[...ts][0]:null,out=[];
 albums.forEach(a=>{
  if(a.type==='any'||(one&&a.type===one))out.push({a,f:null,label:a.name,sub:'Album · '+(a.type==='any'?'any file types':TLABEL[a.type]+' only')});
  a.folders.forEach(f=>{if(one&&f.type===one)out.push({a,f,label:a.name+' / '+f.name,sub:'Subfolder · '+TLABEL[f.type]+' only'})})});
 return out}
function addToAlbumFlow(paths){
 const t=targetsFor(paths),mixed=new Set(paths.map(ftype)).size>1;
 const m=modal('Add to album',`<p class="mu">${paths.length} file${paths.length>1?'s':''} selected. Your real files stay where they are.</p>
  ${t.length?t.map((x,i)=>`<button class="pl2" style="width:100%;text-align:left;color:inherit" data-i="${i}"><div class="av2">${ic(x.f?'folder':'album',22)}</div><div class="t"><b>${esc(x.label)}</b><span class="mu">${esc(x.sub)}</span></div></button>`).join(''):'<div class="empty">No album accepts these files yet.</div>'}
  ${mixed?'<p class="notice warn">You selected different file types. Only albums that accept any type are shown. Subfolders hold one type, so select one type to add to a subfolder.</p>':''}
  <button class="b" id="na" style="width:100%;margin-top:8px">${ic('plus',18)} New album with these files</button>`);
 m.body.onclick=async e=>{const b=e.target.closest('[data-i]');if(!b)return;const x=t[+b.dataset.i];const dst=x.f||x.a;
  const before=dst.paths.length;dst.paths=[...new Set([...dst.paths,...paths])];await saveAlbums();m.close();clearSel();
  toast(`${dst.paths.length-before} file(s) added to ${x.label}`);if(curTab==='albums')renderTab()};
 $('#na',m.body).onclick=()=>{m.close();createAlbumModal(paths)}}

/* ----- tags ----- */
function tagFlow(paths){
 const state=t=>{const n=paths.filter(p=>(fileTags[p]||[]).includes(t)).length;return n===paths.length?'all':n?'some':'none'};
 const st={};tags.forEach(t=>st[t]=state(t));
 const m=modal('Tags',`<p class="mu">Tap a tag to add it to, or remove it from, the ${paths.length} selected file${paths.length>1?'s':''}.</p><div id="tl"></div><div class="row"><input id="nt" class="grow" placeholder="New tag, e.g. To review"><button class="b2" id="at">Add</button></div><button class="b" id="ts" style="width:100%">Save tags</button>`);
 const draw=()=>{$('#tl',m.body).innerHTML=Object.keys(st).length?Object.keys(st).map(t=>`<button class="pl2" style="width:100%;text-align:left;color:inherit" data-t="${esc(t)}"><div class="av2">${st[t]==='all'?'✓':st[t]==='some'?'–':''}</div><div class="t"><b>${esc(t)}</b></div></button>`).join(''):'<p class="mu">No tags yet. Add your first one below.</p>'};draw();
 m.body.onclick=e=>{const b=e.target.closest('[data-t]');if(!b)return;const t=b.dataset.t;st[t]=st[t]==='all'?'none':'all';draw()};
 $('#at',m.body).onclick=()=>{const v=$('#nt',m.body).value.trim();if(!v)return;if(!(v in st))st[v]='all';else st[v]='all';$('#nt',m.body).value='';draw()};
 $('#ts',m.body).onclick=async()=>{
  Object.keys(st).forEach(t=>{if(!tags.includes(t))tags.push(t);
   paths.forEach(p=>{const cur=new Set(fileTags[p]||[]);if(st[t]==='all')cur.add(t);else if(st[t]==='none')cur.delete(t);if(cur.size)fileTags[p]=[...cur];else delete fileTags[p]})});
  await saveTags();m.close();clearSel();toast('Tags saved');if(curTab==='lib')renderTab()}}
