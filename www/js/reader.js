/* ===== Reader: manga (.cbz) and novels (.epub), read straight from the phone =====
   No import and no copies: files are opened in place with a tiny built-in ZIP reader (range reads + native inflate),
   so even big volumes open fast. Reading position is remembered per file. */

/* ---------- ZIP reader ---------- */
const RD_IMG=/\.(jpe?g|png|webp|gif|bmp|avif)$/i,RD_JUNK=/(^|\/)(__MACOSX|\.DS_Store|\._[^/]*|Thumbs\.db)(\/|$)/i;
const rdNat=(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'});
const rdMime=n=>({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',bmp:'image/bmp',avif:'image/avif',svg:'image/svg+xml'})[(String(n).split('.').pop()||'').toLowerCase()]||'application/octet-stream';

async function rdInflate(u8){
 if(typeof DecompressionStream==='undefined')throw Error('This phone’s WebView is too old to open compressed books. Update Android System WebView.');
 const ds=new DecompressionStream('deflate-raw'),w=ds.writable.getWriter();
 w.write(u8).catch(()=>{});w.close().catch(()=>{});
 return new Uint8Array(await new Response(ds.readable).arrayBuffer())}

class RdZip{
 static async open(path){
  const z=new RdZip();z.url=fileUrl(path);
  const r=await fetch(z.url,{headers:{Range:'bytes=0-0'}});
  if(r.status>=400)throw Error('Could not read this file.');
  const m=(r.headers.get('Content-Range')||'').match(/\/(\d+)$/);
  if(r.status===206&&m){z.size=+m[1];try{await r.arrayBuffer()}catch(e){}}
  else if(r.status===206){
   // Some WebView file handlers omit Content-Range; fetch the complete archive
   // rather than mistaking the one-byte probe for the whole book.
   const full=await fetch(z.url);if(!full.ok)throw Error('Could not read this file.');
   z._data=new Uint8Array(await full.arrayBuffer());z.size=z._data.byteLength;
  }else{z._data=new Uint8Array(await r.arrayBuffer());z.size=z._data.byteLength}
  await z.dir();return z}
 static async fromBlob(b){const z=new RdZip();z._data=new Uint8Array(await b.arrayBuffer());z.size=z._data.byteLength;await z.dir();return z}
 async part(a,b){
  if(this._data)return this._data.slice(a,b);
  const r=await fetch(this.url,{headers:{Range:`bytes=${a}-${b-1}`}});
  if(r.status===206)return new Uint8Array(await r.arrayBuffer());
  if(r.status===200){this._data=new Uint8Array(await r.arrayBuffer());this.size=this._data.byteLength;return this._data.slice(a,b)}
  throw Error('Could not read this file.')}
 async dir(){
  const tail=await this.part(Math.max(0,this.size-70000),this.size),dv=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);
  let e=-1;for(let i=tail.length-22;i>=0;i--){if(dv.getUint32(i,true)===0x06054b50){e=i;break}}
  if(e<0)throw Error('This is not a valid book or comic archive.');
  let n=dv.getUint16(e+10,true),cdSize=dv.getUint32(e+12,true),cdOff=dv.getUint32(e+16,true);
  if(n===0xFFFF||cdOff===0xFFFFFFFF||cdSize===0xFFFFFFFF){
   const l=e-20;
   if(l>=0&&dv.getUint32(l,true)===0x07064b50){
    const off=Number(dv.getBigUint64(l+8,true)),z=await this.part(off,off+56),zv=new DataView(z.buffer,z.byteOffset,z.byteLength);
    if(zv.getUint32(0,true)===0x06064b50){n=Number(zv.getBigUint64(32,true));cdSize=Number(zv.getBigUint64(40,true));cdOff=Number(zv.getBigUint64(48,true))}}}
  const cd=await this.part(cdOff,cdOff+cdSize),cv=new DataView(cd.buffer,cd.byteOffset,cd.byteLength),td=new TextDecoder();
  this.files=new Map();let p=0;
  for(let i=0;i<n&&p+46<=cd.length;i++){
   if(cv.getUint32(p,true)!==0x02014b50)break;
   const flags=cv.getUint16(p+8,true),method=cv.getUint16(p+10,true);
   let csize=cv.getUint32(p+20,true),usize=cv.getUint32(p+24,true),off=cv.getUint32(p+42,true);
   const nl=cv.getUint16(p+28,true),el=cv.getUint16(p+30,true),cl=cv.getUint16(p+32,true);
   const name=td.decode(cd.subarray(p+46,p+46+nl));
   if(csize===0xFFFFFFFF||usize===0xFFFFFFFF||off===0xFFFFFFFF){
    let q=p+46+nl;const end=q+el;
    while(q+4<=end){const id=cv.getUint16(q,true),sz=cv.getUint16(q+2,true);
     if(id===1){let r=q+4;
      if(usize===0xFFFFFFFF){usize=Number(cv.getBigUint64(r,true));r+=8}
      if(csize===0xFFFFFFFF){csize=Number(cv.getBigUint64(r,true));r+=8}
      if(off===0xFFFFFFFF){off=Number(cv.getBigUint64(r,true))}}
     q+=4+sz}}
   if(!name.endsWith('/'))this.files.set(name,{name,flags,method,csize,usize,off});
   p+=46+nl+el+cl}}
 find(name){
  const f=this.files.get(name);if(f)return f;
  const l=String(name).toLowerCase();for(const v of this.files.values())if(v.name.toLowerCase()===l)return v;return null}
 async read(name){
  const f=this.find(name);if(!f)throw Error('Missing in archive: '+name);
  if(f.flags&1)throw Error('This file is password protected.');
  const h=await this.part(f.off,f.off+30),hv=new DataView(h.buffer,h.byteOffset,h.byteLength);
  if(hv.getUint32(0,true)!==0x04034b50)throw Error('Corrupt archive.');
  const start=f.off+30+hv.getUint16(26,true)+hv.getUint16(28,true),raw=await this.part(start,start+f.csize);
  if(f.method===0)return raw;
  if(f.method===8)return rdInflate(raw);
  throw Error('Unsupported compression in this archive.')}
 async blob(name,type){return new Blob([await this.read(name)],{type:type||rdMime(name)})}
 async text(name){return new TextDecoder().decode(await this.read(name)).replace(/^\uFEFF/,'')}
 images(){return [...this.files.keys()].filter(n=>RD_IMG.test(n)&&!RD_JUNK.test(n)).sort(rdNat)}}

/* ---------- EPUB package parsing (regex based, no XML parser needed) ---------- */
const rdAttr=(t,n)=>{const m=String(t).match(new RegExp('(?:^|[\\s<])'+n+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')','i'));return m?(m[1]!==undefined?m[1]:m[2]):''};
const rdTags=(x,n)=>String(x).match(new RegExp('<(?:[\\w-]+:)?'+n+'(?=[\\s>/])[^>]*>','gi'))||[];
const rdDec=s=>String(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(m,d)=>String.fromCharCode(+d)).replace(/&amp;/g,'&');
const rdStrip=s=>rdDec(String(s).replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
function rdRes(base,href){
 let h=String(href).split('#')[0];try{h=decodeURIComponent(h)}catch(e){}
 if(!h)return base;
 const parts=(h.startsWith('/')?h.slice(1):base.split('/').slice(0,-1).join('/')+'/'+h).split('/'),out=[];
 for(const p of parts){if(p===''||p==='.')continue;if(p==='..')out.pop();else out.push(p)}
 return out.join('/')}
const rdFrag=href=>{const i=String(href).indexOf('#');if(i<0)return '';try{return decodeURIComponent(String(href).slice(i+1))}catch(e){return String(href).slice(i+1)}};

async function rdParseEpub(zip){
 const cont=await zip.text('META-INF/container.xml'),rf=rdTags(cont,'rootfile')[0],opfPath=rf&&rdAttr(rf,'full-path');
 if(!opfPath)throw Error('This EPUB has no package file.');
 const opf=await zip.text(opfPath),man=new Map();
 for(const t of rdTags(opf,'item')){const id=rdAttr(t,'id');man.set(id,{id,path:rdRes(opfPath,rdAttr(t,'href')),type:rdAttr(t,'media-type'),props:rdAttr(t,'properties')})}
 const spineTag=rdTags(opf,'spine')[0]||'';
 const spine=rdTags(opf,'itemref').map(t=>man.get(rdAttr(t,'idref'))).filter(m=>m&&/x?html/i.test(m.type));
 if(!spine.length)throw Error('This EPUB has no readable chapters.');
 const pathIdx=new Map();spine.forEach((s,i)=>pathIdx.set(s.path.toLowerCase(),i));
 const meta=n=>{const m=opf.match(new RegExp('<(?:\\w+:)?'+n+'\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?'+n+'>','i'));return m?rdStrip(m[1]):''};
 const items=[...man.values()];let cover='';
 const ci=items.find(m=>/cover-image/.test(m.props));
 if(ci)cover=ci.path;
 else{const mt=rdTags(opf,'meta').find(t=>rdAttr(t,'name')==='cover'),id=mt&&rdAttr(mt,'content'),m=id&&man.get(id);if(m&&/^image\//.test(m.type))cover=m.path}
 if(!cover){const g=items.find(m=>/^image\//.test(m.type)&&/cover/i.test(m.id+' '+m.path));if(g)cover=g.path}
 if(cover&&!zip.find(cover))cover='';
 let toc=[];
 const addToc=(base,title,href)=>{const p=rdRes(base,href).toLowerCase();if(pathIdx.has(p)&&title)toc.push({title,idx:pathIdx.get(p),frag:rdFrag(href)})};
 const navItem=items.find(m=>/\bnav\b/.test(m.props));
 if(navItem&&zip.find(navItem.path)){
  try{const x=await zip.text(navItem.path),blk=(x.match(/<nav\b[^>]*epub:type\s*=\s*["'][^"']*toc[^"']*["'][\s\S]*?<\/nav>/i)||x.match(/<nav\b[\s\S]*?<\/nav>/i)||[''])[0];
   for(const m of blk.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi))addToc(navItem.path,rdStrip(m[2]),m[1])}catch(e){}}
 if(!toc.length){
  const ncx=man.get(rdAttr(spineTag,'toc'))||items.find(m=>/dtbncx/.test(m.type));
  if(ncx&&zip.find(ncx.path)){try{const x=await zip.text(ncx.path);
   for(const m of x.matchAll(/<navPoint\b[\s\S]*?<text[^>]*>([\s\S]*?)<\/text>[\s\S]*?<content\b[^>]*src\s*=\s*["']([^"']*)["']/gi))addToc(ncx.path,rdStrip(m[1]),m[2])}catch(e){}}}
 if(!toc.length)toc=spine.map((s,i)=>({title:'Section '+(i+1),idx:i,frag:''}));
 return{zip,title:meta('title'),author:meta('creator'),cover,spine,toc,pathIdx}}
const rdOpenEpub=async path=>rdParseEpub(await RdZip.open(path));

/* ---------- state: progress, settings, titles ---------- */
let rdProg=null,rdSet=null,rdMeta=null,rdFold=null;
async function rdLoad(){
 if(rdProg)return;
 rdProg=(await getS('rdp'))||{};rdMeta=(await getS('rdm'))||{};rdFold=(await getS('rdf'))||[];
 rdSet={mode:'web',fit:'screen',nsize:19,nline:1.7,nfont:'serif',ntheme:'app',...((await getS('rds'))||{})}}
let rdPT=0,rdMT=0;
const rdSave=()=>{clearTimeout(rdPT);rdPT=setTimeout(()=>setS('rdp',rdProg).catch(()=>{}),500)};
const rdMetaSave=()=>{clearTimeout(rdMT);rdMT=setTimeout(()=>setS('rdm',rdMeta).catch(()=>{}),800)};
const rdSetSave=()=>setS('rds',rdSet).catch(()=>{});
const rdSaveF=()=>setS('rdf',rdFold).catch(()=>{});

/* ---------- naming helpers ---------- */
function rdName(n){
 const base=String(n).replace(/\.(cbz|epub)$/i,'').replace(/_+/g,' ').trim();
 const m=base.match(/(?:chapter|chap|ch|episode|ep)\.?\s*#?0*(\d+(?:\.\d+)?)/i)||base.match(/(?:^|[\s\-#])0*(\d+(?:\.\d+)?)\s*$/);
 return{num:m?Number(m[1]):null,series:m?base.slice(0,m.index).replace(/[\s\-–—:]+$/,'').trim():base}}
const rdTitle=f=>(rdMeta&&rdMeta[f.path]&&rdMeta[f.path].t)||f.name.replace(/\.epub$/i,'').replace(/_+/g,' ');
const rdChLabel=f=>{const n=rdName(f.name).num;return n!=null?'Chapter '+n:f.name.replace(/\.cbz$/i,'')};
const rdPct=p=>{if(!p)return 0;if(p.done)return 100;if(p.c!=null&&p.n)return Math.min(99,Math.round((p.c+(p.r||0))/p.n*100));if(p.p!=null&&p.n)return Math.min(99,Math.round((p.p+1)/p.n*100));return 0};

/* ---------- your folders (like Albums): you decide what goes where ----------
   rdFold = [{id, kind:'manga'|'novel', name, paths:[…], folders:[{id,name,paths:[…]}]}] */
const rdKindExt={manga:['cbz'],novel:['epub']};
const rdAllPaths=F=>[...F.paths,...F.folders.flatMap(s=>s.paths)];
function rdSortPaths(kind,paths){
 const L=paths.filter(p=>byPath.has(p)).map(p=>byPath.get(p));
 if(kind==='manga')L.sort((a,b)=>{const x=rdName(a.name).num,y=rdName(b.name).num;return(x!=null&&y!=null&&x!==y)?x-y:rdNat(a.name,b.name)});
 else L.sort((a,b)=>rdNat(rdTitle(a),rdTitle(b)));
 return L}
const rdFlat=F=>[...rdSortPaths(F.kind,F.paths),...F.folders.flatMap(s=>rdSortPaths(F.kind,s.paths))];
const rdFolderOf=(path,kind)=>(rdFold||[]).find(F=>(!kind||F.kind===kind)&&rdAllPaths(F).includes(path));
function rdResume(list){ // list = files in reading order
 let best=-1,at=0;list.forEach((f,i)=>{const p=rdProg[f.path];if(p&&p.at>at){at=p.at;best=i}});
 const read=list.filter(f=>rdProg[f.path]&&rdProg[f.path].done).length;
 if(best<0)return{idx:0,fresh:true,read};
 let idx=best;if(rdProg[list[best].path].done&&best+1<list.length)idx=best+1;
 return{idx,fresh:false,read}}
function rdNovelResume(F){
 const list=rdSortPaths('novel',rdAllPaths(F));
 if(!list.length)return{file:null,pct:0,fresh:true,read:0};
 let best=-1,at=0;
 list.forEach((f,i)=>{const p=rdProg[f.path];if(p&&p.at>at){at=p.at;best=i}});
 const read=list.filter(f=>rdProg[f.path]?.done).length;
 if(best<0)return{file:list[0],pct:0,fresh:true,read};
 let idx=best;
 if(rdProg[list[best].path]?.done&&best+1<list.length)idx=best+1;
 const f=list[idx],x=rdProg[f.path]||{};
 return{file:f,pct:rdPct(x),fresh:false,read}}

/* ---------- covers ---------- */
async function rdCover(f){
 const key='rd|'+f.path+'|'+f.modified+'|'+f.size;
 if(thumbCache.has(key))return thumbCache.get(key);
 try{const rec=await thumbGet(key);if(rec&&rec.blob){const u=URL.createObjectURL(rec.blob);memThumb(key,u);return u}}catch(e){}
 let blob=null;
 try{
  if(f.extension==='cbz'){const z=await RdZip.open(f.path),pg=z.images()[0];if(pg)blob=await z.blob(pg)}
  else{const bk=await rdOpenEpub(f.path);rdMeta[f.path]={t:bk.title||'',a:bk.author||''};rdMetaSave();if(bk.cover)blob=await bk.zip.blob(bk.cover)}
  if(blob)blob=await shrink(blob,360)}
 catch(e){return null}
 if(!blob)return null;
 thumbPut(key,blob);const u=URL.createObjectURL(blob);memThumb(key,u);return u}
const rdCovQ=[];let rdCovBusy=0;
const rdIO=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){rdIO.unobserve(e.target);rdCovQ.push(()=>rdHydrate(e.target));rdPump()}}),{rootMargin:'300px'});
async function rdHydrate(el){
 const f=byPath.get(el.dataset.cp);if(!f||!el.isConnected)return;
 const u=await rdCover(f);if(!el.isConnected)return;
 if(u)el.innerHTML=`<img alt="" src="${u}">`;
 const m=rdMeta[f.path];const t=el.closest('.rc')&&el.closest('.rc').querySelector('.rct');if(t&&f.extension==='epub'&&m&&m.t)t.textContent=m.t}
function rdPump(){while(rdCovBusy<2&&rdCovQ.length){const j=rdCovQ.pop();rdCovBusy++;j().catch(()=>{}).finally(()=>{rdCovBusy--;rdPump()})}}
const rdWatch=root=>$$('.rcv[data-cp]:not([data-h])',root).forEach(el=>{el.dataset.h='1';rdIO.observe(el)});

/* ---------- Reader tab: your manga folders and novel folders ---------- */
const rd={tab:'manga',q:''};
async function renderReader(root){
 await rdLoad();
 root.innerHTML=`<header class="hd"><h1>${ic('book',26)} Reader</h1><button class="b" id="rnf">${ic('plus',16)} Folder</button></header><div class="pad">
  <p class="mu">Make a folder for each manga or novel, then add your .cbz / .epub files to it. Your files are never moved or copied.</p>
  <div class="tabs" id="rtabs"><button data-k="manga" class="${rd.tab==='manga'?'on':''}">${ic('image',16)} Manga</button><button data-k="novel" class="${rd.tab==='novel'?'on':''}">${ic('book',16)} Novels</button></div>
  <input id="rq" type="search" placeholder="Search folders…" value="${esc(rd.q)}" autocomplete="off">
  <div id="rcw"></div><div id="rl"></div></div>`;
 $('#rtabs',root).onclick=e=>{const b=e.target.closest('[data-k]');if(!b)return;rd.tab=b.dataset.k;rd.q='';renderReader(root)};
 $('#rq',root).oninput=e=>{rd.q=e.target.value;rdDraw(root)};
 $('#rnf',root).onclick=()=>rdNewFolder(rd.tab,F=>{rdFolderSheet(F.id);setTimeout(()=>rdAddFiles(F.id,'',()=>{const t=topLayer();if(t&&t.refresh)t.refresh()}),250)});
 rdDraw(root)}
function rdCard(o){return `<article class="rc" data-k="${esc(o.key)}"><div class="rcv" ${o.cover?`data-cp="${esc(o.cover)}"`:''}>${ic(o.icon,30)}</div>${o.badge?`<span class="rcb">${esc(o.badge)}</span>`:''}<div class="rct">${esc(o.title)}</div><div class="rcs">${esc(o.sub)}</div>${o.pct?`<div class="rcp"><i style="width:${o.pct}%"></i></div>`:''}</article>`}
function rdDraw(root){
 const q=rd.q.trim().toLowerCase(),L=$('#rl',root),CW=$('#rcw',root),kind=rd.tab,manga=kind==='manga';
 const mine=(rdFold||[]).filter(F=>F.kind===kind).sort((a,b)=>rdNat(a.name,b.name)),list=q?mine.filter(F=>F.name.toLowerCase().includes(q)):mine;
 // Resume is intentionally shown inside each collection folder, not as separate
 // chapter/book cards on the Reader landing page. This prevents one manga series
 // from appearing multiple times in Continue Reading.
 CW.innerHTML='';
 if(!mine.length)L.innerHTML=`<div class="empty">No ${manga?'manga':'novel'} folders yet.<br>Tap <b>+ Folder</b>, name it${manga?' after your manga':' (for example a series)'}, then pick the ${manga?'.cbz chapters':'.epub books'} to put inside.${files.length?'':'<br><br>Scan your phone from the Library tab first so your files can be found.'}</div>`;
 else if(!list.length)L.innerHTML=`<div class="empty">No folder matches “${esc(rd.q)}”.</div>`;
 else L.innerHTML=`<h3 class="rh">${manga?'Manga':'Novels'} <span class="mu">· ${list.length} folder${list.length>1?'s':''}</span></h3><div class="rgrid">${list.map(F=>{
   const flat=rdFlat(F),st=rdResume(flat),n=flat.length,unread=n-st.read;
   return rdCard({key:'f|'+F.id,cover:flat[0]?flat[0].path:'',icon:'folder',title:F.name,sub:n+(manga?' chapter':' book')+(n===1?'':'s')+(F.folders.length?' · '+F.folders.length+' sub':''),badge:manga&&unread>0?String(unread):'',pct:n?Math.round(st.read/n*100):0})}).join('')}</div>`;
 L.onclick=CW.onclick=e=>{const c=e.target.closest('.rc');if(!c)return;const k=c.dataset.k;
  if(k.startsWith('f|'))return rdFolderSheet(k.slice(2));
  const p=k.slice(2);
  if(!manga)return openNovel(p);
  const F=rdFolderOf(p,'manga'),flat=F?rdFlat(F):[byPath.get(p)];openManga(flat,Math.max(0,flat.findIndex(f=>f.path===p)),F?F.name:rdTitle(byPath.get(p)))};
 rdWatch(root)}

/* create / pick / edit */
function rdNewFolder(kind,done){
 const m=modal(kind==='manga'?'New manga folder':'New novel folder',`<label>Folder name</label><input id="rfn" placeholder="${kind==='manga'?'e.g. Solo Leveling':'e.g. Danmachi'}" autocomplete="off"><p class="mu">${kind==='manga'?'Put all chapters of one manga in one folder. You can add subfolders later, for example one per season or volume.':'Group books together, for example all volumes of one series. You can add subfolders later.'}</p><button class="b" id="rfs" style="width:100%;margin-top:8px">Create folder</button>`);
 $('#rfs',m.body).onclick=async()=>{const name=$('#rfn',m.body).value.trim();
  if(!name)return toast('Enter a folder name.');
  if(rdFold.some(f=>f.kind===kind&&f.name.toLowerCase()===name.toLowerCase()))return toast('A folder with that name already exists.');
  const F={id:uid(),kind,name,paths:[],folders:[]};rdFold.push(F);await rdSaveF();m.close();toast('Folder created');done&&done(F)}}
function rdPick({title,exts,exclude,onDone}){
 const chosen=new Set();let q='',limit=150;
 sheet(el=>{
  el.innerHTML=`<header class="hd"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><h2><span>${esc(title)}</span></h2><button class="b" id="pd">Add (<span id="pn">0</span>)</button></header>
  <div class="pad"><p class="mu">Only ${esc(exts.map(x=>'.'+x).join(', '))} files found on your phone are listed.</p><input id="pq" type="search" placeholder="Search by name" autocomplete="off">
  <div class="row"><span class="mu grow" id="pc"></span><button class="b2" id="pa">Select all shown</button></div><div id="pf" class="files l"></div><div id="pm"></div></div>`;
  const cand=()=>{const ql=q.trim().toLowerCase();return files.filter(f=>exts.includes(f.extension)&&!exclude.has(f.path)&&(!ql||f.name.toLowerCase().includes(ql))).sort((a,b)=>rdNat(a.name,b.name))};
  const count=()=>{$('#pn',el).textContent=chosen.size};
  const draw=()=>{const l=cand(),s=l.slice(0,limit);$('#pc',el).textContent=`${l.length} file${l.length==1?'':'s'}`;
   $('#pf',el).innerHTML=s.length?s.map(f=>fileRow(f,{sel:chosen.has(f.path),check:true})).join(''):`<div class="empty">${files.length?'No matching files. Scan again from the Library tab if you added new ones.':'Scan your phone first (Library tab) to see your files here.'}</div>`;
   $('#pm',el).innerHTML=l.length>s.length?`<button class="b2 more" id="pmore">Show more (${l.length-s.length} left)</button>`:'';
   if($('#pmore',el))$('#pmore',el).onclick=()=>{limit+=200;draw()};
   observeThumbs(el);count()};
  $('[data-x]',el).onclick=()=>el.close();
  $('#pq',el).oninput=e=>{q=e.target.value;limit=150;draw()};
  $('#pf',el).onclick=e=>{const fi=e.target.closest('.fi');if(!fi)return;const p=fi.dataset.p;chosen.has(p)?chosen.delete(p):chosen.add(p);fi.classList.toggle('sel',chosen.has(p));const ck=$('.ck',fi);if(ck)ck.checked=chosen.has(p);count()};
  $('#pa',el).onclick=()=>{const l=cand().slice(0,limit),all=l.every(f=>chosen.has(f.path));l.forEach(f=>all?chosen.delete(f.path):chosen.add(f.path));draw()};
  $('#pd',el).onclick=()=>{const ps=[...chosen];el.close();onDone(ps)};
  draw()})}
function rdAddFiles(fid,sid,done){
 const F=rdFold.find(x=>x.id===fid);if(!F)return;
 if(!files.length)return toast('Scan your phone first (Library tab) to find your files.');
 rdPick({title:F.kind==='manga'?'Add .cbz chapters':'Add .epub books',exts:rdKindExt[F.kind],exclude:new Set(rdAllPaths(F)),onDone:async ps=>{
  if(!ps.length)return;const tgt=sid?F.folders.find(s=>s.id===sid):F;if(!tgt)return;
  tgt.paths.push(...ps);await rdSaveF();toast(ps.length+' added');done&&done()}})}

/* a folder: resume button, files, subfolders */
function rdFolderSheet(fid){
 let edit=false;
 return sheet(el=>{
  const F=rdFold.find(x=>x.id===fid);if(!F){el.close();return}
  const manga=F.kind==='manga',flat=rdFlat(F),st=rdResume(flat);
  const idxOf=p=>flat.findIndex(f=>f.path===p);
  const rm=(p,sid)=>edit?`<button class="i rmx" data-rm="${esc(p)}" data-s="${esc(sid)}" aria-label="Remove from folder">${ic('trash',18)}</button>`:'';
  const items=(paths,sid)=>{
   const L=rdSortPaths(F.kind,paths);
   if(!L.length)return `<div class="mu" style="padding:8px 2px">Nothing here yet.</div>`;
   if(manga)return `<div class="rcl">${L.map(f=>{const x=rdProg[f.path],pc=rdPct(x);return `<div class="rch ${x&&x.done?'dn':''}" data-p="${esc(f.path)}"><div class="grow"><b>${esc(rdChLabel(f))}</b><div class="mu">${x&&x.done?'Read':pc?pc+'% · page '+((x.p||0)+1)+'/'+(x.n||'?'):esc(bytes(f.size))}</div></div>${x&&x.done?ic('check',18):''}${rm(f.path,sid)}</div>`}).join('')}</div>`;
   return `<div class="rgrid">${L.map(f=>{const x=rdProg[f.path],a=(rdMeta[f.path]||{}).a;return `<div class="rcw"><article class="rc" data-p="${esc(f.path)}"><div class="rcv" data-cp="${esc(f.path)}">${ic('book',30)}</div>${x&&x.done?'<span class="rcb">✓</span>':''}<div class="rct">${esc(rdTitle(f))}</div><div class="rcs">${esc(a||bytes(f.size))}</div>${rdPct(x)?`<div class="rcp"><i style="width:${rdPct(x)}%"></i></div>`:''}</article>${rm(f.path,sid)}</div>`}).join('')}</div>`};
  const head=(title,count,sid)=>`<div class="row rfh"><b class="grow">${esc(title)}</b><span class="mu">${count}</span><button class="b2" data-add="${esc(sid)}">${ic('plus',14)} Add</button>${edit&&sid?`<button class="i" data-rs="${esc(sid)}" aria-label="Rename subfolder">${ic('edit',18)}</button><button class="i" data-ds="${esc(sid)}" aria-label="Delete subfolder">${ic('trash',18)}</button>`:''}</div>`;
  const nr=manga?null:rdNovelResume(F);
  el.innerHTML=`<header class="hd"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><h2><span>${esc(F.name)}</span></h2><button class="i" id="rfe" aria-label="${edit?'Done editing':'Edit'}">${ic(edit?'check':'edit',22)}</button><button class="i" id="rfm" aria-label="More">${ic('more',22)}</button></header>
  <div class="pad">${manga&&flat.length?`<div class="rsh"><div class="rcv rsc" data-cp="${esc(flat[0].path)}">${ic('image',30)}</div><div class="grow"><div class="mu">${flat.length} chapter${flat.length>1?'s':''} · ${st.read} read</div><div class="row"><button class="b" id="rsr">${ic('play',16,'fl')} ${st.fresh?'Start reading':'Resume · '+esc(rdChLabel(flat[st.idx]))}</button></div></div></div>`:(!manga&&nr.file?`<div class="rsh"><div class="rcv rsc" data-cp="${esc(nr.file.path)}">${ic('book',30)}</div><div class="grow"><div class="mu">${flat.length} book${flat.length===1?'':'s'} · ${nr.read} finished</div><div class="row"><button class="b" id="rsr">${ic('play',16,'fl')} ${nr.fresh?'Start reading':`Continue · ${esc(rdTitle(nr.file))}`}</button></div></div></div>`:'')}
   ${head(manga?'Chapters':'Books',F.paths.filter(p=>byPath.has(p)).length,'')}${items(F.paths,'')}
   ${F.folders.map(s=>head(s.name,s.paths.filter(p=>byPath.has(p)).length,s.id)+items(s.paths,s.id)).join('')}
   ${!F.paths.length&&!F.folders.length?'':''}</div>`;
  $('[data-x]',el).onclick=()=>el.close();
  $('#rfe',el).onclick=()=>{edit=!edit;el.refresh()};
  $('#rfm',el).onclick=()=>{
   const m=modal('Folder options',`<button class="b2" id="fo1" style="width:100%;margin:4px 0">New subfolder</button><button class="b2" id="fo2" style="width:100%;margin:4px 0">Rename folder</button><button class="b2" id="fo3" style="width:100%;margin:4px 0;color:var(--dn)">Delete folder</button>`);
   $('#fo1',m.body).onclick=()=>{m.close();renameModal('New subfolder','',async v=>{if(F.folders.some(s=>s.name.toLowerCase()===v.toLowerCase()))return toast('A subfolder with that name exists.');F.folders.push({id:uid(),name:v,paths:[]});await rdSaveF();el.refresh()})};
   $('#fo2',m.body).onclick=()=>{m.close();renameModal('Rename folder',F.name,async v=>{F.name=v;await rdSaveF();el.refresh()})};
   $('#fo3',m.body).onclick=()=>{m.close();deleteModal('Delete this folder?',async()=>{rdFold=rdFold.filter(x=>x.id!==F.id);await rdSaveF();el.close()})}};
  el.onclick=e=>{
   if(e.target.closest('#rfe,#rfm,[data-x]'))return;
   const add=e.target.closest('[data-add]');if(add)return rdAddFiles(F.id,add.dataset.add,()=>el.refresh());
   const r=e.target.closest('[data-rm]');
   if(r){const tgt=r.dataset.s?F.folders.find(s=>s.id===r.dataset.s):F;if(tgt){tgt.paths=tgt.paths.filter(p=>p!==r.dataset.rm);rdSaveF();el.refresh()}return}
   const rs=e.target.closest('[data-rs]');if(rs){const s=F.folders.find(x=>x.id===rs.dataset.rs);if(s)renameModal('Rename subfolder',s.name,async v=>{s.name=v;await rdSaveF();el.refresh()});return}
   const ds=e.target.closest('[data-ds]');if(ds){const s=F.folders.find(x=>x.id===ds.dataset.ds);if(s)deleteModal('Delete subfolder “'+s.name+'”?',async()=>{F.folders=F.folders.filter(x=>x.id!==s.id);await rdSaveF();el.refresh()});return}
   if(e.target.closest('#rsr'))return manga?openManga(flat,st.idx,F.name):openNovel(nr.file.path);
   const row=e.target.closest('[data-p]');if(!row||edit)return;
   if(manga)openManga(flat,Math.max(0,idxOf(row.dataset.p)),F.name);else openNovel(row.dataset.p)};
  rdWatch(el)},()=>{if(curTab==='reader')rdDraw($('#page'))})}

/* open a .cbz / .epub from anywhere (for example straight from the Library) */
async function openReader(path){
 await rdLoad();
 const f=byPath.get(path);if(!f)return toast('File not found. Scan again to refresh your library.');
 if(f.extension==='epub')return openNovel(path);
 const F=rdFolderOf(path,'manga');
 if(F){const flat=rdFlat(F);return openManga(flat,Math.max(0,flat.findIndex(x=>x.path===path)),F.name)}
 return openManga([f],0,f.name.replace(/\.cbz$/i,''))}

/* ---------- shared reader chrome ---------- */
function rdOverlay(cls){
 const el=document.createElement('div');el.className='rdv '+cls;return el}
const rdPanel=(el,html)=>{const old=$('.rdpn',el);if(old)old.remove();const p=document.createElement('div');p.className='rdpn';p.innerHTML='<div class="rdpi">'+html+'</div>';p.onclick=e=>{e.stopPropagation();if(e.target===p)p.remove()};el.append(p);return p}

/* ---------- MANGA reader (.cbz) ---------- */
async function openManga(list,startIdx,seriesTitle){
 await rdLoad();
 const el=rdOverlay('mg');
 el.innerHTML=`<div class="rdtop"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><div class="rdtt"><b id="rdt1"></b><span id="rdt2"></span></div><button class="i" id="rdl" aria-label="Chapters">${ic('list',22)}</button><button class="i" id="rds" aria-label="Reader settings">${ic('sliders',22)}</button></div>
  <div class="rdb" id="rdb"></div>
  <div class="rdbot"><button class="i" id="rdp" aria-label="Previous chapter">${ic('prev',20,'fl')}</button><span class="rdn1" id="rdc">–</span><input type="range" id="rdr" min="1" max="1" value="1" aria-label="Page"><span class="rdn1" id="rdm">–</span><button class="i" id="rdx" aria-label="Next chapter">${ic('next',20,'fl')}</button></div>`;
 let idx=startIdx,zip=null,pages=[],cur=0,dead=false,wraps=[],pio=null,cio=null,loadTok=0,urls=new Map(),jump=false;
 const b=$('#rdb',el),slider=$('#rdr',el);
 const F=()=>list[idx],label=()=>{const c=rdName(F().name);return c.num!=null?'Chapter '+c.num:F().name.replace(/\.cbz$/i,'')};
 const bars=on=>el.classList.toggle('bh',on===undefined?!el.classList.contains('bh'):!on);
 const freeUrl=i=>{const u=urls.get(i);if(u&&u.url){URL.revokeObjectURL(u.url)}urls.delete(i)};
 const getUrl=i=>{
  let u=urls.get(i);if(u)return u.p;
  u={url:'',p:null};
  u.p=zip.blob(pages[i]).then(bl=>{u.url=URL.createObjectURL(bl);if(dead||urls.get(i)!==u)URL.revokeObjectURL(u.url);return u.url});
  urls.set(i,u);u.p.catch(()=>urls.delete(i));return u.p};
 let lastTop=0;b.addEventListener('scroll',()=>{if(jump)return;if(Math.abs(b.scrollTop-lastTop)>60){if(!el.classList.contains('bh'))bars(false);lastTop=b.scrollTop}},{passive:true});
 const ui=()=>{slider.max=Math.max(1,pages.length);slider.value=cur+1;$('#rdc',el).textContent=cur+1;$('#rdm',el).textContent=pages.length||'–';
  $('#rdt1',el).textContent=seriesTitle||'';$('#rdt2',el).textContent=label()+' · '+(cur+1)+'/'+(pages.length||'?');
  $('#rdp',el).disabled=idx<=0;$('#rdx',el).disabled=idx>=list.length-1};
 const save=(done)=>{const p=rdProg[F().path]||{};rdProg[F().path]={...p,p:cur,n:pages.length,at:Date.now(),done:done||p.done||false};rdSave()};
 const setCur=i=>{if(i===cur)return;cur=i;ui();save(cur>=pages.length-1)};

 /* --- webtoon (continuous vertical scroll) --- */
 const loadPage=async i=>{
  const w=wraps[i];if(!w||w.dataset.l)return;w.dataset.l='1';
  try{const u=await getUrl(i);if(dead||!w.isConnected||!w.dataset.l)return;
   w.innerHTML=`<img alt="" src="${u}">`;const im=w.firstChild;
   im.onload=()=>{w.style.height='';w.style.minHeight='0'};
   im.onerror=()=>{w.innerHTML=`<span class="rdph">Page ${i+1} could not be shown</span>`;delete w.dataset.l}}
  catch(e){if(!dead&&w.isConnected){w.innerHTML=`<span class="rdph">Page ${i+1} could not be loaded</span>`;delete w.dataset.l}}};
 const unloadPage=i=>{
  const w=wraps[i];if(!w||!w.dataset.l)return;
  if(w.firstChild&&w.firstChild.tagName==='IMG')w.style.height=w.offsetHeight+'px';
  w.innerHTML=`<span class="rdph">${i+1}</span>`;delete w.dataset.l;freeUrl(i)};
 const buildWeb=()=>{
  b.className='rdb web';b.innerHTML='';
  wraps=pages.map((p,i)=>{const w=document.createElement('div');w.className='rdp';w.dataset.i=i;w.innerHTML=`<span class="rdph">${i+1}</span>`;b.append(w);return w});
  const end=document.createElement('div');end.className='rdend';
  end.innerHTML=idx<list.length-1?`<p>End of ${esc(label())}</p><button class="b" id="rdn">Next chapter ${ic('next',16,'fl')}</button>`:`<p>You reached the last chapter.</p>`;
  b.append(end);
  const nb=$('#rdn',end);if(nb)nb.onclick=()=>loadChapter(idx+1);
  pio=new IntersectionObserver(es=>es.forEach(e=>{const i=+e.target.dataset.i;if(e.isIntersecting)loadPage(i);else unloadPage(i)}),{root:b,rootMargin:'2200px 0px'});
  cio=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting&&!jump)setCur(+e.target.dataset.i)}),{root:b,rootMargin:'-50% 0px -50% 0px'});
  wraps.forEach(w=>{pio.observe(w);cio.observe(w)});
  new IntersectionObserver((es,o)=>{if(es[0].isIntersecting){save(true);ui()}},{root:b,threshold:.2}).observe(end);
  jump=true;if(cur>0&&wraps[cur]){loadPage(cur);wraps[cur].scrollIntoView()}else b.scrollTop=0;setTimeout(()=>jump=false,400)};

 /* --- paged (left-to-right or right-to-left) --- */
 let tx=0,ty=0;
 const dirRtl=()=>rdSet.mode==='rtl';
 const preload=i=>{for(const j of[i+1,i+2])if(j<pages.length)getUrl(j).catch(()=>{});for(const k of[...urls.keys()])if(k<i-2||k>i+4)freeUrl(k)};
 const showPage=async i=>{
  cur=i;ui();save(cur>=pages.length-1);
  const img=$('#rdi',b);if(!img)return;img.classList.add('ld');
  try{const u=await getUrl(i);if(dead||cur!==i)return;img.onload=()=>img.classList.remove('ld');img.src=u;$('.rdst',b).scrollTop=0;preload(i)}catch(e){toast('Page '+(i+1)+' could not be loaded')}};
 const step=d=>{
  const n=cur+d;
  if(n<0){if(idx>0){toast('Previous chapter');loadChapter(idx-1,true)}return}
  if(n>=pages.length){save(true);if(idx<list.length-1){toast('Next chapter');loadChapter(idx+1)}else toast('End of the last chapter');return}
  showPage(n)};
 const buildPaged=()=>{
  b.className='rdb paged fit-'+rdSet.fit;
  b.innerHTML=`<div class="rdst"><img id="rdi" alt=""></div>`;
  const side=s=>step((s==='l')!==dirRtl()?-1:1);
  $('.rdst',b).onclick=e=>{const x=e.clientX/innerWidth;if(x<.33)side('l');else if(x>.67)side('r');else bars()};
  b.ontouchstart=e=>{tx=e.changedTouches[0].clientX;ty=e.changedTouches[0].clientY};
  b.ontouchend=e=>{const dx=e.changedTouches[0].clientX-tx,dy=e.changedTouches[0].clientY-ty;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.6){const left=dx>0;step(left!==dirRtl()?-1:1)}};
  showPage(Math.min(cur,pages.length-1))};

 const render=()=>{
  if(pio)pio.disconnect();if(cio)cio.disconnect();pio=cio=null;
  for(const k of[...urls.keys()])freeUrl(k);b.onclick=null;
  if(rdSet.mode==='web'){buildWeb();b.onclick=e=>{if(!e.target.closest('button'))bars()}}else buildPaged();ui()};
 async function loadChapter(i,last){
  const tok=++loadTok;idx=i;pages=[];cur=0;ui();b.className='rdb';b.innerHTML=`<div class="rdload">Opening ${esc(label())}…</div>`;
  try{
   const z=await RdZip.open(F().path);if(dead||tok!==loadTok)return;
   zip=z;pages=z.images();if(!pages.length)throw Error('No pages found in this file.');
   const sv=rdProg[F().path];cur=last?pages.length-1:(sv&&!sv.done&&sv.p?Math.min(sv.p,pages.length-1):0);
   save(false);render()}
  catch(e){if(tok===loadTok){b.innerHTML=`<div class="rdload">${esc(e.message||'Could not open this chapter.')}<br><br><button class="b2" id="rdo">Open with another app</button></div>`;const o=$('#rdo',b);if(o)o.onclick=()=>FV.openFile({path:F().path}).catch(()=>{})}}}

 /* --- panels --- */
 const chapters=()=>{
  const p=rdPanel(el,`<div class="rdph2"><b>Chapters</b><span class="grow"></span><button class="b2" id="rtop">Top</button><button class="b2" id="rcur">Current</button><button class="i" data-c aria-label="Close">${ic('close',20)}</button></div><div class="rdlist" id="rdlist">${list.map((f,i)=>{const c=rdName(f.name),x=rdProg[f.path];return `<div class="rch ${i===idx?'on':''} ${x&&x.done?'dn':''}" data-i="${i}"><div class="grow"><b>${esc(c.num!=null?'Chapter '+c.num:f.name.replace(/\.cbz$/i,''))}</b><div class="mu">${x&&x.done?'Read':x&&x.n?(x.p+1)+'/'+x.n+' pages':''}</div></div>${x&&x.done?ic('check',18):''}</div>`}).join('')}</div>`);
  const L=$('#rdlist',p),cur0=L.querySelector('.on');if(cur0)cur0.scrollIntoView({block:'center'});
  $('[data-c]',p).onclick=()=>p.remove();$('#rtop',p).onclick=()=>L.scrollTo({top:0,behavior:'smooth'});$('#rcur',p).onclick=()=>{const c=L.querySelector('.on');if(c)c.scrollIntoView({block:'center',behavior:'smooth'})};
  L.onclick=e=>{const r=e.target.closest('.rch');if(r){p.remove();const i=+r.dataset.i;if(i!==idx)loadChapter(i)}}};
 const settings=()=>{
  const p=rdPanel(el,`<div class="rdph2"><b>Reading mode</b><span class="grow"></span><button class="i" data-c aria-label="Close">${ic('close',20)}</button></div>
   <div class="rdopt">${[['web','Webtoon','Scroll down'],['ltr','Paged ▶','Left to right'],['rtl','Paged ◀','Right to left (manga)']].map(([k,n,s])=>`<button class="rdo ${rdSet.mode===k?'on':''}" data-m="${k}"><b>${n}</b><span>${s}</span></button>`).join('')}</div>
   <div class="rdph2" style="margin-top:14px"><b>Page fit (paged modes)</b></div>
   <div class="rdopt">${[['screen','Fit screen'],['width','Fit width']].map(([k,n])=>`<button class="rdo ${rdSet.fit===k?'on':''}" data-f="${k}"><b>${n}</b></button>`).join('')}</div>`);
  $('[data-c]',p).onclick=()=>p.remove();
  p.onclick=e=>{e.stopPropagation();if(e.target===p){p.remove();return}
   const m=e.target.closest('[data-m]'),f=e.target.closest('[data-f]');
   if(m){rdSet.mode=m.dataset.m;rdSetSave();p.remove();render()}
   if(f){rdSet.fit=f.dataset.f;rdSetSave();p.remove();render()}}};

 $('[data-x]',el).onclick=()=>closeEl(el);
 $('#rdl',el).onclick=chapters;$('#rds',el).onclick=settings;
 $('#rdp',el).onclick=()=>loadChapter(idx-1);$('#rdx',el).onclick=()=>loadChapter(idx+1);
 slider.oninput=()=>{const i=+slider.value-1;$('#rdc',el).textContent=i+1;if(rdSet.mode==='web'){if(wraps[i]){jump=true;loadPage(i);wraps[i].scrollIntoView();setTimeout(()=>jump=false,300);cur=i;ui()}}else showPage(i)};
 pushLayer(el,()=>{dead=true;if(pio)pio.disconnect();if(cio)cio.disconnect();for(const k of[...urls.keys()])freeUrl(k);rdSave();if(curTab==='reader')rdDraw($('#page'))});
 loadChapter(idx)}

/* ---------- NOVEL reader (.epub) ---------- */
async function rdChapterNodes(bk,i){
 const it=bk.spine[i],raw=await bk.zip.text(it.path);
 let doc=new DOMParser().parseFromString(raw,'application/xhtml+xml');
 if(doc.querySelector('parsererror'))doc=new DOMParser().parseFromString(raw,'text/html');
 const body=doc.body||doc.documentElement;
 body.querySelectorAll('script,style,link,meta,base,iframe,object,embed,form,audio,video,noscript,title,head').forEach(n=>n.remove());
 body.querySelectorAll('svg').forEach(s=>{
  const im=s.querySelector('image');
  if(im){const href=im.getAttribute('xlink:href')||im.getAttribute('href')||'',n=document.createElement('img');n.setAttribute('data-zip',rdRes(it.path,href));s.replaceWith(n)}else s.remove()});
 body.querySelectorAll('img').forEach(im=>{
  const src=im.getAttribute('src')||'';
  if(/^data:/i.test(src))return;
  const z=im.getAttribute('data-zip')||(src?rdRes(it.path,src):'');
  im.removeAttribute('src');im.removeAttribute('srcset');im.removeAttribute('width');im.removeAttribute('height');if(z)im.setAttribute('data-zip',z);else im.remove()});
 body.querySelectorAll('a').forEach(a=>{
  const h=a.getAttribute('href')||'';a.removeAttribute('href');
  if(!h)return;
  if(/^[a-z][a-z0-9+.-]*:/i.test(h)||h.startsWith('//'))a.setAttribute('data-ext',h);
  else a.setAttribute('data-ep',(h.startsWith('#')?it.path:rdRes(it.path,h))+(h.includes('#')?'#'+h.split('#')[1]:''))});
 body.querySelectorAll('*').forEach(n=>{for(const a of[...n.attributes]){const k=a.name.toLowerCase();if(k.startsWith('on')||k==='style'||k==='class'||k==='srcdoc')n.removeAttribute(a.name)}});
 return document.importNode(body,true).innerHTML}

async function openNovel(path,startCh,startRatio){
 await rdLoad();
 const f=byPath.get(path);
 let bk;
 try{toast('Opening book…');bk=await rdOpenEpub(path)}catch(e){return toast(e.message||'Could not open this book.')}
 rdMeta[path]={t:bk.title||'',a:bk.author||''};rdMetaSave();
 const el=rdOverlay('nv');
 el.dataset.nt=rdSet.ntheme;
 el.innerHTML=`<div class="rdtop"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><div class="rdtt"><b id="rdt1">${esc(bk.title||(f?f.name:''))}</b><span id="rdt2"></span></div><button class="i" id="rdl" aria-label="Contents">${ic('list',22)}</button><button class="i" id="rds" aria-label="Text settings">${ic('textsize',22)}</button></div>
  <div class="rdsc" id="rdsc"><article class="rdn" id="rdn"></article><div class="rdnx" id="rdnx"></div></div>
  <div class="rdbot"><button class="i" id="rdp" aria-label="Previous chapter">${ic('prev',20,'fl')}</button><span class="rdn1" id="rdc">0%</span><input type="range" id="rdr" min="0" max="1000" value="0" aria-label="Position in chapter"><span class="rdn1" id="rdm">–</span><button class="i" id="rdx" aria-label="Next chapter">${ic('next',20,'fl')}</button></div>`;
 const sc=$('#rdsc',el),art=$('#rdn',el),nx=$('#rdnx',el),slider=$('#rdr',el);
 const sv=rdProg[path];
 let ci=startCh!=null?startCh:(sv&&!sv.done&&sv.c!=null?sv.c:0),dead=false,tok=0,blobs=[],touched=false,ready=false;
 ci=Math.max(0,Math.min(ci,bk.spine.length-1));
 const applyStyle=()=>{el.dataset.nt=rdSet.ntheme;el.style.setProperty('--rn-fs',rdSet.nsize+'px');el.style.setProperty('--rn-lh',rdSet.nline);el.style.setProperty('--rn-ff',({serif:'Georgia,"Times New Roman",serif',sans:'system-ui,-apple-system,Roboto,sans-serif',mono:'ui-monospace,Menlo,monospace'})[rdSet.nfont]||'Georgia,serif')};
 applyStyle();
 const ratio=()=>{const m=sc.scrollHeight-sc.clientHeight;return m>4?Math.min(1,Math.max(0,sc.scrollTop/m)):1};
 const overall=()=>Math.min(100,Math.round((ci+ratio())/bk.spine.length*100));
 const chTitle=i=>{const t=bk.toc.find(x=>x.idx===i);return t?t.title:'Section '+(i+1)};
 const ui=()=>{slider.value=Math.round(ratio()*1000);$('#rdm',el).textContent=overall()+'%';$('#rdc',el).textContent=Math.round(ratio()*100)+'%';$('#rdt2',el).textContent=chTitle(ci)+' · '+(ci+1)+'/'+bk.spine.length;$('#rdp',el).disabled=ci<=0;$('#rdx',el).disabled=ci>=bk.spine.length-1};
 const save=()=>{if(!ready)return;const r=ratio(),done=ci>=bk.spine.length-1&&r>.97;rdProg[path]={c:ci,r,n:bk.spine.length,at:Date.now(),done:done||(rdProg[path]&&rdProg[path].done&&ci>=bk.spine.length-1)||false};rdSave()};
 const setScroll=r=>{sc.scrollTop=r*Math.max(0,sc.scrollHeight-sc.clientHeight)};
 async function loadCh(i,r,frag){
  const t=++tok;ci=i;ready=false;touched=false;ui();
  art.innerHTML='<p class="rdload">Loading…</p>';nx.innerHTML='';sc.scrollTop=0;
  blobs.forEach(u=>URL.revokeObjectURL(u));blobs=[];
  let html;try{html=await rdChapterNodes(bk,i)}catch(e){if(t===tok)art.innerHTML=`<p class="rdload">${esc(e.message||'Could not read this chapter.')}</p>`;return}
  if(dead||t!==tok)return;
  art.innerHTML=html||'<p class="rdload">This section is empty.</p>';
  nx.innerHTML=i<bk.spine.length-1?`<button class="b" id="rdgo">Next: ${esc(chTitle(i+1))} ${ic('next',16,'fl')}</button>`:'<p class="mu">The end.</p>';
  const go=$('#rdgo',nx);if(go)go.onclick=()=>loadCh(i+1,0);
  const restore=()=>{if(touched)return;if(frag){const e=art.querySelector('[id="'+(window.CSS&&CSS.escape?CSS.escape(frag):frag)+'"]');if(e){e.scrollIntoView();return}}if(r)setScroll(r)};
  restore();ready=true;ui();
  art.querySelectorAll('img[data-zip]').forEach(async im=>{
   try{const bl=await bk.zip.blob(im.getAttribute('data-zip'));if(dead||t!==tok)return;const u=URL.createObjectURL(bl);blobs.push(u);im.onload=()=>{restore();ui()};im.src=u}catch(e){im.remove()}});
  if(r||frag)setTimeout(restore,350);
  save()}
 let st=0,lastTop=0;
 sc.addEventListener('scroll',()=>{if(!ready)return;if(touched&&Math.abs(sc.scrollTop-lastTop)>60){if(!el.classList.contains('bh'))el.classList.add('bh');lastTop=sc.scrollTop}clearTimeout(st);st=setTimeout(()=>{ui();save()},180)},{passive:true});
 sc.addEventListener('touchstart',()=>{touched=true},{passive:true});sc.addEventListener('wheel',()=>{touched=true},{passive:true});
 sc.addEventListener('click',e=>{
  const a=e.target.closest('a');
  if(a){e.preventDefault();const ep=a.getAttribute('data-ep'),ex=a.getAttribute('data-ext');
   if(ep){const p=rdRes('',ep.split('#')[0]).toLowerCase(),fr=ep.includes('#')?decodeURIComponent(ep.split('#')[1]):'';const k=bk.pathIdx.get(p);if(k!=null){if(k===ci&&fr){const t=art.querySelector('[id="'+(window.CSS&&CSS.escape?CSS.escape(fr):fr)+'"]');if(t)t.scrollIntoView()}else loadCh(k,0,fr)}}
   else if(ex)toast('External links are turned off while reading.');return}
  if(String(getSelection&&getSelection())!=='')return;
  el.classList.toggle('bh')});
 slider.oninput=()=>{touched=true;setScroll(slider.value/1000)};
 $('[data-x]',el).onclick=()=>closeEl(el);
 $('#rdp',el).onclick=()=>loadCh(ci-1,0);$('#rdx',el).onclick=()=>loadCh(ci+1,0);
 $('#rdl',el).onclick=()=>{
  let curK=0;bk.toc.forEach((t,k)=>{if(t.idx<=ci)curK=k});
  const p=rdPanel(el,`<div class="rdph2"><b>Contents</b><span class="grow"></span><button class="b2" id="rtop">Top</button><button class="b2" id="rcur">Current</button><button class="i" data-c aria-label="Close">${ic('close',20)}</button></div><div class="rdlist" id="rdlist">${bk.toc.map((t,k)=>`<div class="rch ${k===curK?'on':''}" data-k="${k}"><div class="grow"><b>${esc(t.title)}</b></div></div>`).join('')}</div>`);
  const L=$('#rdlist',p),c0=L.querySelector('.on');if(c0)c0.scrollIntoView({block:'center'});
  $('[data-c]',p).onclick=()=>p.remove();$('#rtop',p).onclick=()=>L.scrollTo({top:0,behavior:'smooth'});$('#rcur',p).onclick=()=>{const c=L.querySelector('.on');if(c)c.scrollIntoView({block:'center',behavior:'smooth'})};
  L.onclick=e=>{const r=e.target.closest('.rch');if(r){const t=bk.toc[+r.dataset.k];p.remove();loadCh(t.idx,0,t.frag)}}};
 $('#rds',el).onclick=()=>{
  const draw=()=>`<div class="rdph2"><b>Text</b><span class="grow"></span><button class="i" data-c aria-label="Close">${ic('close',20)}</button></div>
   <div class="rdrow"><span>Size</span><button class="b2" data-a="fs-">A−</button><b>${rdSet.nsize}</b><button class="b2" data-a="fs+">A+</button></div>
   <div class="rdrow"><span>Line spacing</span>${[1.4,1.6,1.8,2].map(v=>`<button class="b2 ${rdSet.nline==v?'sel':''}" data-lh="${v}">${v}</button>`).join('')}</div>
   <div class="rdrow"><span>Font</span>${[['serif','Serif'],['sans','Sans'],['mono','Mono']].map(([k,n])=>`<button class="b2 ${rdSet.nfont===k?'sel':''}" data-ff="${k}">${n}</button>`).join('')}</div>
   <div class="rdrow"><span>Background</span>${[['app','App theme'],['paper','Paper'],['black','Black']].map(([k,n])=>`<button class="b2 ${rdSet.ntheme===k?'sel':''}" data-th="${k}">${n}</button>`).join('')}</div>`;
  const p=rdPanel(el,draw());p.classList.add('low');
  const bind=()=>{$('[data-c]',p).onclick=()=>p.remove()};bind();
  p.onclick=e=>{e.stopPropagation();if(e.target===p){p.remove();return}
   const a=e.target.closest('[data-a]'),lh=e.target.closest('[data-lh]'),ff=e.target.closest('[data-ff]'),th=e.target.closest('[data-th]');
   if(a)rdSet.nsize=Math.max(13,Math.min(32,rdSet.nsize+(a.dataset.a==='fs+'?1:-1)));
   else if(lh)rdSet.nline=+lh.dataset.lh;else if(ff)rdSet.nfont=ff.dataset.ff;else if(th)rdSet.ntheme=th.dataset.th;else return;
   rdSetSave();const r=ratio();applyStyle();$('.rdpi',p).innerHTML=draw();bind();requestAnimationFrame(()=>{setScroll(r);ui()})}};
 pushLayer(el,()=>{dead=true;save();blobs.forEach(u=>URL.revokeObjectURL(u));rdSave();if(curTab==='reader')rdDraw($('#page'))});
 loadCh(ci,sv&&!sv.done&&startCh==null?sv.r||0:(startRatio||0))}
