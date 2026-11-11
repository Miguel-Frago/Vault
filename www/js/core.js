/* ===== FileVault core: helpers, storage, shared state, screens (layers) ===== */
const $=(s,e=document)=>e.querySelector(s),$$=(s,e=document)=>[...e.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const bytes=n=>{if(!n)return '0 B';const u=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return `${n.toFixed(i?1:0)} ${u[i]}`};
const fmt=s=>{s=Math.max(0,Math.floor(s||0));const h=Math.floor(s/3600),mi=Math.floor(s%3600/60),c=String(s%60).padStart(2,'0');return(h?h+':'+String(mi).padStart(2,'0'):mi)+':'+c};
const ic=(n,s=20,c='')=>`<svg class="ic ${c}" width="${s}" height="${s}"><use href="#${n}"/></svg>`;
const FV=window.Capacitor?.Plugins?.FileVault,native=!!FV;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* file types */
const TYPES=[['photos','Photos','image'],['videos','Videos','video'],['music','Music','music'],['documents','Documents','doc'],['apps','APK files','apk'],['other','Other','file']];
const TLABEL=Object.fromEntries(TYPES.map(t=>[t[0],t[1]])),TICON=Object.fromEntries(TYPES.map(t=>[t[0],t[2]]));
const THEMES=[['gold','Midnight Gold','#e8b04a','#0f0e13'],['crimson','Crimson Noir','#ff4d5e','#120a0c'],['ocean','Deep Ocean','#3cc8e6','#08121a'],['forest','Forest','#6fd68b','#0b130e'],['violet','Neon Violet','#b388ff','#0e0a18'],['paper','Paper Light','#b9770e','#f5f1ea']];
const applyTheme=t=>{if(!t||t==='gold'||t==='default')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=t};
const curTheme=()=>document.documentElement.dataset.theme||'gold';

/* a path -> URL the WebView can stream (Capacitor serves local files with Range support) */
const fileUrl=p=>{const e=String(p).split('/').map(x=>encodeURIComponent(x).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())).join('/');const c=window.Capacitor;return c&&c.convertFileSrc?c.convertFileSrc(e):'file://'+e};

/* ===== IndexedDB ===== */
let db;
const openDB=()=>new Promise((res,rej)=>{const r=indexedDB.open('FileVaultLocal',3);
 r.onupgradeneeded=()=>{const d=r.result,has=n=>d.objectStoreNames.contains(n);
  if(!has('settings'))d.createObjectStore('settings');
  if(!has('organization'))d.createObjectStore('organization',{keyPath:'id'});
  if(!has('lyrics'))d.createObjectStore('lyrics');
  if(!has('movies'))d.createObjectStore('movies',{keyPath:'id'});
  if(!has('thumbs')){const t=d.createObjectStore('thumbs',{keyPath:'k'});t.createIndex('at','at')}};
 r.onsuccess=()=>{db=r.result;res()};r.onerror=()=>rej(r.error)});
const dbx=(store,mode,fn)=>new Promise((res,rej)=>{const t=db.transaction(store,mode),o=fn(t.objectStore(store));t.oncomplete=()=>res(o&&o.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)});
const getS=k=>dbx('settings','readonly',s=>s.get(k)),setS=(k,v)=>dbx('settings','readwrite',s=>s.put(v,k));
const getLyr=k=>dbx('lyrics','readonly',s=>s.get(k)),setLyr=(k,v)=>dbx('lyrics','readwrite',s=>s.put(v,k)),delLyr=k=>dbx('lyrics','readwrite',s=>s.delete(k));
const allLyr=()=>new Promise((res,rej)=>{const out={},t=db.transaction('lyrics','readonly'),c=t.objectStore('lyrics').openCursor();c.onsuccess=()=>{const x=c.result;if(x){out[x.key]=x.value;x.continue()}};t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error)});
const allMovies=()=>dbx('movies','readonly',s=>s.getAll()),putMovie=m=>dbx('movies','readwrite',s=>s.put(m)),delMovie=id=>dbx('movies','readwrite',s=>s.delete(id));
const allOrg=()=>dbx('organization','readonly',s=>s.getAll());

/* ----- thumbnail cache: small images on disk, capped in size, oldest removed first ----- */
let thumbBytes=-1;
const thumbGet=k=>dbx('thumbs','readonly',s=>s.get(k));
const thumbStats=()=>new Promise((res,rej)=>{let bytes=0,count=0;const t=db.transaction('thumbs','readonly'),c=t.objectStore('thumbs').openCursor();c.onsuccess=()=>{const x=c.result;if(x){bytes+=x.value.size||0;count++;x.continue()}};t.oncomplete=()=>res({bytes,count});t.onerror=()=>rej(t.error)});
async function thumbTrim(){const cap=(prefs.cacheMB||300)*1048576*.9;let total=(await thumbStats()).bytes;
 if(total<=cap){thumbBytes=total;return}
 await new Promise(res=>{const t=db.transaction('thumbs','readwrite'),c=t.objectStore('thumbs').index('at').openCursor();c.onsuccess=()=>{const x=c.result;if(x&&total>cap){total-=x.value.size||0;x.delete();x.continue()}};t.oncomplete=()=>{thumbBytes=total;res()};t.onerror=()=>res()})}
async function thumbPut(k,blob){try{await dbx('thumbs','readwrite',s=>s.put({k,blob,size:blob.size,at:Date.now()}));
 if(thumbBytes>=0)thumbBytes+=blob.size;if(thumbBytes<0||thumbBytes>(prefs.cacheMB||300)*1048576)await thumbTrim()}catch(e){}}
async function thumbClear(){await dbx('thumbs','readwrite',s=>s.clear());thumbBytes=0;if(typeof thumbCache!=='undefined')thumbCache.clear()}

/* ===== shared state ===== */
let files=[],byPath=new Map(),seen=new Set(),epOver={},showsCache=null,albums=[],tags=[],fileTags={},favs=new Set(),pos={},lastScan=0;
let cvMovies=[],cvFolders=[],cvCovers={};
let prefs={view:'list',sort:'new',cacheMB:300};
const saveAlbums=()=>setS('albums',albums),saveTags=()=>Promise.all([setS('tags',tags),setS('fileTags',fileTags)]),saveFavs=()=>setS('favorites',[...favs]);
const saveAll=()=>Promise.all([saveAlbums(),saveTags(),saveFavs()]);
const savePrefs=()=>setS('prefs',prefs);
/* resume rules that scale with the video length (short clips included) */
const RES_MIN=d=>d&&d<60?1.5:5,RES_END=d=>d?Math.min(10,Math.max(2,d*.08)):10,resOK=x=>!!(x&&x.t>=RES_MIN(x.d)&&(!x.d||x.t<x.d-RES_END(x.d)));
let posT=0;const savePos=(now)=>{clearTimeout(posT);if(now)return setS('pos',pos);posT=setTimeout(()=>setS('pos',pos),400)};
const setFiles=list=>{showsCache=null;files=list;byPath=new Map(list.map(f=>[f.path,f]))};
const saveSeen=()=>setS('seen',[...seen]),saveOver=()=>{showsCache=null;return setS('epOver',epOver)};
const markSeen=p=>{if(!seen.has(p)){seen.add(p);saveSeen()}if(typeof wlogSet==='function')wlogSet(p)};
const ftype=p=>byPath.get(p)?.type;

function normAlbums(){
 albums.forEach(a=>{a.paths=a.paths||[];a.folders=a.folders||[];a.type=a.type||'any';
  a.folders.forEach(f=>{f.paths=f.paths||[];f.id=f.id||uid();
   if(!f.type||f.type==='any'){const ts=[...new Set(f.paths.map(ftype).filter(Boolean))];f.type=ts.length===1?ts[0]:(a.type!=='any'?a.type:'any')}})})}

async function loadState(){
 albums=(await getS('albums'))||[];tags=(await getS('tags'))||[];favs=new Set((await getS('favorites'))||[]);
 fileTags=await getS('fileTags');
 if(!fileTags){fileTags={};try{for(const o of await allOrg())if(o.tags?.length)fileTags[o.id]=o.tags}catch(e){}await setS('fileTags',fileTags)}
 const p=(await getS('prefs'))||{};prefs={view:p.view||(await getS('viewMode'))||'list',sort:p.sort||'new',cacheMB:p.cacheMB||300};
 pos=(await getS('pos'))||{};seen=new Set((await getS('seen'))||[]);epOver=(await getS('epOver'))||{};lastScan=(await getS('lastScan'))||0;
 const idx=await getS('fileIndex');if(idx?.length)setFiles(idx);
 cvFolders=(await getS('cvFolders'))||[];cvCovers=(await getS('cvCovers'))||{};cvMovies=await allMovies();
 normAlbums();applyTheme(await getS('theme'));applyAccent(await getS('accent'))}

/* ===== small UI helpers ===== */
function toast(t){$$('.toast').forEach(x=>x.remove());const d=document.createElement('div');d.className='toast';d.textContent=t;document.body.append(d);setTimeout(()=>d.remove(),2600)}
const b2d=b=>new Promise(r=>{const x=new FileReader();x.onload=()=>r(x.result);x.readAsDataURL(b)});
const d2b=d=>{const[h,v]=d.split(','),m=h.match(/:(.*?);/)[1],a=atob(v),u=new Uint8Array(a.length);for(let i=0;i<a.length;i++)u[i]=a.charCodeAt(i);return new Blob([u],{type:m})};
const sha=async s=>{try{return[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('fv:'+s)))].map(x=>x.toString(16).padStart(2,'0')).join('')}catch(e){return btoa('fv:'+s)}};
const shrink=(f,max=700)=>new Promise(r=>{const i=new Image(),u=URL.createObjectURL(f);i.onload=()=>{try{const k=Math.min(1,max/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=Math.round(i.width*k);c.height=Math.round(i.height*k);c.getContext('2d').drawImage(i,0,0,c.width,c.height);c.toBlob(b=>{URL.revokeObjectURL(u);r(b||f)},'image/jpeg',.86)}catch(e){URL.revokeObjectURL(u);r(f)}};i.onerror=()=>{URL.revokeObjectURL(u);r(f)};i.src=u});
const blobFromPath=async p=>(await fetch(fileUrl(p))).blob();
let urls=[];const U=b=>{const u=URL.createObjectURL(b);urls.push(u);return u};const clr=()=>{urls.forEach(u=>URL.revokeObjectURL(u));urls=[]};

/* ===== screens: a stack of layers that the Android Back button closes one by one ===== */
const layers=[];let backN=0,queued=[];
function pushLayer(el,cb){layers.push({el,cb});document.body.append(el);const f=()=>history.pushState({fv:1},'');backN?queued.push(f):f();return el}
function popTop(){const l=layers.pop();if(!l)return;l.el.remove();l.cb&&l.cb()}
function closeEl(el){const i=layers.findIndex(l=>l.el===el);if(i<0)return;const[l]=layers.splice(i,1);l.el.remove();backN++;history.back();l.cb&&l.cb()}
addEventListener('popstate',()=>{if(backN){backN--;if(!backN){const q=queued.splice(0);q.forEach(f=>f())}return}popTop()});
const topLayer=()=>layers.length?layers[layers.length-1].el:null;

/* a full-screen page. render(el) fills it; el.refresh() redraws and keeps the scroll position */
function sheet(render,onClose){const el=document.createElement('div');el.className='sheet';
 el.refresh=()=>{const st=el.scrollTop;render(el);el.scrollTop=st};el.close=()=>closeEl(el);render(el);pushLayer(el,onClose);return el}

/* a small dialog */
function modal(title,html){const el=document.createElement('div');el.className='mdl';
 el.innerHTML=`<div class="mbx"><div class="row" style="margin-top:0"><h2 class="grow" style="margin:0;overflow:hidden;text-overflow:ellipsis">${esc(title)}</h2><button class="i" data-x aria-label="Close">${ic('close',22)}</button></div><div class="mb">${html}</div></div>`;
 el.onclick=e=>{if(e.target===el||e.target.closest('[data-x]'))closeEl(el)};pushLayer(el);
 return{el,body:$('.mb',el),close:()=>closeEl(el)}}

function popMenu(items){const d=document.createElement('div');d.className='pop';
 d.innerHTML=items.map((x,i)=>`<button class="${x.cls||''}" data-i="${i}">${x.icon?ic(x.icon,18):''}${esc(x.label)}</button>`).join('');
 const off=e=>{if(!d.contains(e.target)){d.remove();document.removeEventListener('pointerdown',off,true)}};
 d.onclick=e=>{const b=e.target.closest('button');if(!b)return;d.remove();document.removeEventListener('pointerdown',off,true);items[+b.dataset.i].fn()};
 document.body.append(d);setTimeout(()=>document.addEventListener('pointerdown',off,true),0)}

/* two-tap confirm used for destructive buttons */
function armBtn(btn,label,action){let armed=0,orig=btn.innerHTML;btn.onclick=()=>{if(!armed){armed=1;btn.textContent=label;setTimeout(()=>{armed=0;btn.innerHTML=orig},3000);return}action()}}
