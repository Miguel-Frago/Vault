/* ===== Reader 3.0: Mihon-style library and series pages =====
   Ported from Star Stream's Manhua and Novel pages (cover grid with unread/total badges, category tabs,
   search, filter & sort, blurred-cover series page, synopsis + genres, chapter list with read marks,
   floating Resume button). Colors come from FileVault's own theme variables, so every theme and accent works.
   Files are still opened in place, nothing is imported or copied.
   Loaded after reader.js: it replaces renderReader, rdDraw and rdFolderSheet. The manga/novel readers are unchanged. */

let rdCats=null,rdSheetEl=null;
const rdTocFail=new Set();

async function rdLoad2(){
 await rdLoad();
 if(rdCats)return;
 rdCats=(await getS('rdc'))||[];
 if(!rdSet.cat)rdSet.cat={manga:'default',novel:'default'};
 if(!rdSet.flt)rdSet.flt={unread:false,started:false,completed:false,fav:false,sort:rdSet.sort==='name'?'title':'recent'};
 if(rdSet.desc===undefined)rdSet.desc=true}
const rdSaveCats=()=>setS('rdc',rdCats).catch(()=>{});
const rdKey=p=>{const f=byPath.get(p);return f?f.size+'|'+f.modified:''};
const rdCatsOf=k=>(rdCats||[]).filter(c=>c.kind===k);
const rdSplit=g=>String(g||'').split(',').map(x=>x.trim()).filter(Boolean);
const rdDate=t=>t?new Date(t).toLocaleDateString(undefined,{month:'numeric',day:'numeric',year:'2-digit'}):'';
const rdBlob=async p=>new Blob([await rdFetchBytes(p)],{type:rdMime(p)});
const rdFiltered=()=>{const f=rdSet.flt;return !!(f.unread||f.started||f.completed||f.fav||f.sort!=='recent')};

/* ---------- novel chapter list (cached table of contents) and reading position ---------- */
function rdTocOf(path){const m=rdMeta[path];return m&&m.toc&&m.k===rdKey(path)?m.toc:null}
function rdNovelPos(path){
 const x=rdProg[path]||{},toc=rdTocOf(path);
 if(!toc||!toc.length)return null;
 const N=toc.length;
 if(x.done)return{total:N,read:N,cur:-1,frac:0,toc};
 if(x.c==null)return{total:N,read:0,cur:-1,frac:0,toc};
 let k=0;toc.forEach((t,i)=>{if(t.i<=x.c)k=i});
 if((x.r||0)>=.97&&k<N-1)return{total:N,read:k+1,cur:k+1,frac:0,toc}; /* scrolled to the end: that chapter counts as read */
 return{total:N,read:k,cur:k,frac:x.r||0,toc}}
async function rdLoadToc(path){
 try{
  const bk=await rdOpenEpub(path);
  rdMeta[path]={...(rdMeta[path]||{}),t:bk.title||'',a:bk.author||'',d:bk.desc||'',g:(bk.subjects||[]).slice(0,12).join(', '),n:bk.spine.length,toc:bk.toc.map(t=>({t:t.title,i:t.idx})),k:rdKey(path)};
  rdMetaSave();return true}
 catch(e){return false}}

/* counts for a folder: total chapters, how many are read, how many were started */
function rdStats(F){
 const list=rdFlat(F);let read=0,started=0;
 list.forEach(f=>{const x=rdProg[f.path];if(x){started++;if(x.done)read++}});
 const S={total:list.length,read,started,list,single:null,pos:null};
 if(F.kind==='novel'&&list.length===1&&['epub','txt'].includes(list[0].extension)){
  const f=list[0],x=rdProg[f.path]||{},p=rdNovelPos(f.path);S.single=f;
  if(p){S.total=p.total;S.read=p.read;S.pos=p}
  else if(x.n){S.total=x.n;S.read=x.done?x.n:Math.min(x.c||0,x.n)}}
 return S}
const rdStatus=S=>S.total&&S.read>=S.total?'Completed':(S.started?'Reading':'Not started');

/* ---------- Reader tab: library ---------- */
async function renderReader(root){
 await rdLoad2();
 if(rd.tab!=='novel')rd.tab='manga';
 root.innerHTML=`<header class="hd"><h1>${ic('book',26)} Reader</h1><button class="i" id="rls" aria-label="Search">${ic('search',22)}</button><button class="i" id="rlf" aria-label="Filter and sort">${ic('sort',22)}</button><button class="i" id="rlm" aria-label="More options">${ic('more',22)}</button></header>
 <div class="pad"><div id="rsb" ${rd.q?'':'hidden'}><input id="rq" type="search" placeholder="Search folders…" value="${esc(rd.q)}" autocomplete="off"></div>
  <div class="tabs eq" id="rtabs"><button data-k="manga">${ic('image',16)} Manga</button><button data-k="novel">${ic('book',16)} Novels</button></div>
  <div class="tabs" id="rcats"></div><div id="rcw"></div><div id="rl"></div></div>`;
 $('#rtabs',root).onclick=e=>{const b=e.target.closest('[data-k]');if(!b)return;rd.tab=b.dataset.k;rd.q='';$('#rq',root).value='';$('#rsb',root).hidden=true;rdDraw(root)};
 $('#rls',root).onclick=()=>{const bar=$('#rsb',root);bar.hidden=!bar.hidden;if(bar.hidden){rd.q='';$('#rq',root).value='';rdDraw(root)}else $('#rq',root).focus()};
 $('#rq',root).oninput=e=>{rd.q=e.target.value;rdDraw(root)};
 $('#rlf',root).onclick=()=>rdFilterModal();
 $('#rlm',root).onclick=()=>popMenu([
  {icon:'folder',label:'Manage categories',fn:()=>rdCatsModal(rd.tab)},
  {icon:'plus',label:rd.tab==='manga'?'New manga folder':'New novel folder',fn:()=>rdNewFolder(rd.tab,F=>{
    const t=rdSet.cat[rd.tab];if(t&&t!=='default'){F.cat=t;rdSaveF()}
    rdDraw($('#page'));rdFolderSheet(F.id);setTimeout(()=>rdAddFiles(F.id,'',()=>{const s=topLayer();if(s&&s.refresh)s.refresh()}),250)})}]);
 $('#rcats',root).onclick=e=>{
  if(e.target.closest('[data-add]'))return rdCatsModal(rd.tab);
  const b=e.target.closest('[data-c]');if(!b)return;
  rdSet.cat[rd.tab]=b.dataset.c;rdSetSave();rdDraw(root)};
 $('#rl',root).onclick=e=>{const c=e.target.closest('.lc');if(c)rdFolderSheet(c.dataset.f)};
 rdDraw(root)}

function rdLibCard(F,S){
 const unread=Math.max(0,S.total-S.read),first=S.list[0];
 return `<article class="lc" data-f="${esc(F.id)}" aria-label="${esc(F.name)}, ${unread} unread of ${S.total}"><div class="rcv" ${F.cover||!first?'':`data-cp="${esc(first.path)}"`}>${F.cover?`<img alt="" src="${F.cover}">`:ic(F.kind==='manga'?'image':'book',30)}</div>${S.total?`<div class="lcb">${unread?`<span class="u">${unread}</span>`:''}<span class="t">${S.total}</span></div>`:''}${F.fav?`<span class="lcf">${ic('heart',14,'fl')}</span>`:''}<div class="lct"><span>${esc(F.name)}</span></div></article>`}

function rdDraw(root){
 root=root||$('#page');const L=root&&$('#rl',root);
 if(L&&rdSet&&rdCats){
  const kind=rd.tab,manga=kind==='manga',flt=rdSet.flt,q=rd.q.trim().toLowerCase();
  $$('#rtabs [data-k]',root).forEach(b=>b.classList.toggle('on',b.dataset.k===kind));
  const fb=$('#rlf',root);if(fb)fb.classList.toggle('act',rdFiltered());
  /* category tabs */
  const cats=rdCatsOf(kind);let tab=rdSet.cat[kind]||'default';
  if(tab!=='default'&&!cats.some(c=>c.id===tab))tab='default';
  const ct=$('#rcats',root);
  ct.innerHTML=[{id:'default',name:'Default'},...cats].map(c=>`<button data-c="${esc(c.id)}" class="${c.id===tab&&!q?'on':''}">${esc(c.name)}</button>`).join('')+`<button data-add="1" aria-label="Add category">${ic('plus',16)}</button>`;
  const on=$('.on',ct);if(on)ct.scrollLeft=on.offsetLeft-ct.clientWidth/2+on.offsetWidth/2;
  /* continue reading: one card per collection of the CURRENT tab (manga or novels), newest first */
  const CW=$('#rcw',root);
  const cont=(rdFold||[]).filter(F=>F.kind===kind&&rdLast(F)>0&&rdContinue(F)).sort((a,b)=>rdLast(b)-rdLast(a)).slice(0,10);
  CW.innerHTML=(cont.length&&!q)?`<h3 class="rh">Continue Reading</h3><div class="rcr">${cont.map(F=>{
   const c=rdContinue(F),mg=F.kind==='manga',n=rdFlat(F).length,pc=mg?(n?Math.round(rdResume(c.flat).read/n*100):0):rdPct(rdProg[c.file.path]),rc=Math.max(1,rdRecentCount(F));
   const nb=rdAllPaths(F).filter(p=>byPath.has(p)).length;
   const sub=mg?`Manga · ${rc} chapter${rc===1?'':'s'} recently read`:`Novels · ${nb} book${nb===1?'':'s'}`;
   return `<article class="crd" data-c="${esc(F.id)}"><div class="rcv crc" ${F.cover?'':`data-cp="${esc(c.file.path)}"`}>${F.cover?`<img alt="" src="${F.cover}">`:ic(mg?'image':'book',24)}</div><div class="crx"><b>${esc(F.name)}</b><span class="crs">${esc(sub)}</span><span class="crb">${ic('play',14,'fl')} ${mg?'Continue '+esc(c.label):'Continue reading'}</span>${pc?`<div class="rcp"><i style="width:${pc}%"></i></div>`:''}</div><button class="i cro" aria-label="Open collection">${ic('folder',18)}</button></article>`}).join('')}</div>`:'';
  CW.onclick=e=>{const c=e.target.closest('.crd');if(!c)return;const F=rdFold.find(x=>x.id===c.dataset.c);if(!F)return;
   if(e.target.closest('.cro'))return rdFolderSheet(F.id);rdResumeCollection(F)};
  /* grid */
  const all=(rdFold||[]).filter(F=>F.kind===kind);
  let list=q?all.filter(F=>F.name.toLowerCase().includes(q)):all.filter(F=>tab==='default'?(!F.cat||!cats.some(c=>c.id===F.cat)):F.cat===tab);
  const S=new Map(list.map(F=>[F.id,rdStats(F)]));
  if(flt.unread)list=list.filter(F=>{const s=S.get(F.id);return s.total-s.read>0});
  if(flt.started)list=list.filter(F=>S.get(F.id).started>0);
  if(flt.completed)list=list.filter(F=>{const s=S.get(F.id);return s.total>0&&s.read>=s.total});
  if(flt.fav)list=list.filter(F=>F.fav);
  if(flt.sort==='title')list.sort((a,b)=>rdNat(a.name,b.name));
  else if(flt.sort==='chapters')list.sort((a,b)=>S.get(b.id).total-S.get(a.id).total||rdNat(a.name,b.name));
  else if(flt.sort==='added')list.sort((a,b)=>String(b.id).localeCompare(String(a.id)));
  else list.sort((a,b)=>rdActive(b)-rdActive(a)||rdNat(a.name,b.name));
  if(!all.length)L.innerHTML=`<div class="empty">No ${manga?'manga':'novel'} folders yet.<br>Tap <b>⋮</b> then <b>New ${manga?'manga':'novel'} folder</b>, name it${manga?' after your manga':' (for example a series)'}, then pick the ${manga?'.cbz / .cbr chapters':'.epub, .txt or .pdf books'} to put inside.${files.length?'':'<br><br>Scan your phone from the Library tab first so your files can be found.'}</div>`;
  else if(!list.length)L.innerHTML=`<div class="empty">${q||rdFiltered()?'No folders match your search or filters.':'No folders in this category yet.'}</div>`;
  else L.innerHTML=`<div class="rlg">${list.map(F=>rdLibCard(F,S.get(F.id))).join('')}</div>`;
  rdWatch(root)}
 /* keep an open series page up to date when a reader closes */
 if(rdSheetEl&&rdSheetEl.isConnected&&rdSheetEl.refresh)rdSheetEl.refresh()}

/* ---------- filter & sort, categories ---------- */
function rdFilterModal(){
 const f=rdSet.flt,SORTS=[['recent','Last read'],['title','Title (A–Z)'],['chapters','Most chapters'],['added','Date added']];
 const chk=(k,l)=>`<label class="mfr"><input type="checkbox" data-f="${k}" ${f[k]?'checked':''}><span>${l}</span></label>`;
 const m=modal('Filter & sort',`<h3 class="rh" style="margin-top:0">Filter</h3>${chk('unread','Has unread chapters')}${chk('started','Started')}${chk('completed','Completed')}${chk('fav','Favorites only')}
  <h3 class="rh">Sort by</h3>${SORTS.map(([k,n])=>`<label class="mfr"><input type="radio" name="rs" value="${k}" ${f.sort===k?'checked':''}><span>${n}</span></label>`).join('')}
  <div class="row"><button class="b2 grow" id="mfz">Reset</button><button class="b grow" data-x>Done</button></div>`);
 const read=()=>{$$('[data-f]',m.body).forEach(i=>f[i.dataset.f]=i.checked);const r=$('[name=rs]:checked',m.body);f.sort=r?r.value:'recent';rdSetSave();rdDraw($('#page'))};
 m.body.onchange=read;
 $('#mfz',m.body).onclick=()=>{$$('[data-f]',m.body).forEach(i=>i.checked=false);const r=$('[name=rs][value=recent]',m.body);if(r)r.checked=true;read()}}

function rdCatsModal(kind){
 const draw=()=>{const L=rdCatsOf(kind);return L.length?L.map((c,i)=>`<div class="mcat" data-id="${esc(c.id)}"><input data-n value="${esc(c.name)}" maxlength="40" aria-label="Category name"><button class="i" data-up ${i?'':'disabled'} aria-label="Move up">${ic('chev',18)}</button><button class="i" data-dn ${i<L.length-1?'':'disabled'} aria-label="Move down">${ic('chevd',18)}</button><button class="i dn" data-del aria-label="Delete category">${ic('trash',18)}</button></div>`).join(''):'<p class="mu">No categories yet. Add one below, for example a series name or genre.</p>'};
 const m=modal(kind==='manga'?'Manga categories':'Novel categories',`<p class="mu" style="margin-top:0">Folders with no category stay in Default. Deleting a category never deletes folders.</p><div id="mcl">${draw()}</div><div class="row"><input id="mcn" class="grow" placeholder="New category name" maxlength="40" autocomplete="off" style="margin:0;width:auto"><button class="b" id="mca">Add</button></div><button class="b2" data-x style="width:100%;margin-top:6px">Done</button>`);
 const redo=()=>{$('#mcl',m.body).innerHTML=draw();rdDraw($('#page'))};
 const idOf=el=>{const r=el.closest('.mcat');return r&&r.dataset.id};
 $('#mca',m.body).onclick=async()=>{
  const n=$('#mcn',m.body).value.trim();if(!n)return;
  if(rdCatsOf(kind).some(c=>c.name.toLowerCase()===n.toLowerCase()))return toast('That category already exists.');
  rdCats.push({id:uid(),kind,name:n});await rdSaveCats();$('#mcn',m.body).value='';redo()};
 m.body.onclick=async e=>{
  const id=idOf(e.target);if(!id)return;
  const L=rdCatsOf(kind),i=L.findIndex(c=>c.id===id),mv=async d=>{const j=i+d;if(i<0||j<0||j>=L.length)return;[L[i],L[j]]=[L[j],L[i]];rdCats=[...rdCats.filter(c=>c.kind!==kind),...L];await rdSaveCats();redo()};
  if(e.target.closest('[data-up]'))return mv(-1);
  if(e.target.closest('[data-dn]'))return mv(1);
  if(e.target.closest('[data-del]')){const c=L[i];if(!c)return;
   deleteModal('Delete category “'+c.name+'”?',async()=>{rdCats=rdCats.filter(x=>x.id!==id);(rdFold||[]).forEach(F=>{if(F.cat===id)delete F.cat});if(rdSet.cat[kind]===id)rdSet.cat[kind]='default';await rdSaveCats();await rdSaveF();rdSetSave();redo()})}};
 m.body.onchange=async e=>{
  const inp=e.target.closest('[data-n]');if(!inp)return;
  const c=rdCats.find(x=>x.id===idOf(inp));if(!c)return;
  const n=inp.value.trim();if(!n){inp.value=c.name;return}
  c.name=n;await rdSaveCats();rdDraw($('#page'))}}

function rdCatPicker(F,done){
 const cats=rdCatsOf(F.kind),cur=F.cat&&cats.some(c=>c.id===F.cat)?F.cat:'default';
 const m=modal('Set category',`<p class="mu" style="margin-top:0">${esc(F.name)}</p>${[{id:'default',name:'Default'},...cats].map(c=>`<label class="mfr"><input type="radio" name="cp" value="${esc(c.id)}" ${c.id===cur?'checked':''}><span>${esc(c.name)}</span></label>`).join('')}${cats.length?'':'<p class="mu">No categories yet. Add some from the Reader tab (the + tab).</p>'}<div class="row"><button class="b2 grow" data-x>Cancel</button><button class="b grow" id="cps">Save</button></div>`);
 $('#cps',m.body).onclick=async()=>{const r=$('[name=cp]:checked',m.body),v=r?r.value:'default';if(v==='default')delete F.cat;else F.cat=v;await rdSaveF();m.close();done&&done()}}

/* ---------- edit info (name, synopsis, genres, cover) ---------- */
function rdInfoModal(F,done){
 let cover=F.cover||'';
 const m=modal('Edit info',`<label>Name</label><input id="in" value="${esc(F.name)}" maxlength="120" autocomplete="off">
  <label>Synopsis</label><textarea id="id" rows="6" maxlength="3000" placeholder="Optional">${esc(F.description||'')}</textarea>
  <label>Genres (comma separated)</label><input id="ig" value="${esc(F.genres||'')}" maxlength="200" placeholder="Action, Adventure, Fantasy" autocomplete="off">
  <label>Cover photo</label><div class="row"><div class="av2" id="ip">${cover?`<img alt="" src="${cover}">`:ic('image',22)}</div><button class="b2 grow" id="ic">Choose a photo</button><button class="b2 dn" id="ix">Remove</button></div>
  <p class="mu">Only a small copy of the picture is kept inside FileVault. Without one, the first file's own cover is used.</p><button class="b" id="is" style="width:100%">Save</button>`);
 const pv=()=>{$('#ip',m.body).innerHTML=cover?`<img alt="" src="${cover}">`:ic('image',22)};
 $('#ic',m.body).onclick=()=>pickFiles({title:'Pick a cover photo',types:['photos'],multi:false,onDone:async([p])=>{try{cover=await b2d(await shrink(await rdBlob(p),360));pv()}catch(e){toast('Could not read that photo.')}}});
 $('#ix',m.body).onclick=()=>{cover='';pv()};
 $('#is',m.body).onclick=async()=>{
  const n=$('#in',m.body).value.trim();if(!n)return toast('Enter a name.');
  if(rdFold.some(x=>x.id!==F.id&&x.kind===F.kind&&x.name.toLowerCase()===n.toLowerCase()))return toast('A folder with that name already exists.');
  F.name=n;F.description=$('#id',m.body).value.trim();F.genres=rdSplit($('#ig',m.body).value).slice(0,12).join(', ');
  if(cover)F.cover=cover;else delete F.cover;
  await rdSaveF();m.close();toast('Saved');done&&done()}}

/* ---------- one row's menu: mark read / unread, remove ---------- */
function rdRowMenu(F,o,done){
 const btn=(id,l,cls='')=>`<button class="b2 ${cls}" id="${id}" style="width:100%;margin:4px 0">${l}</button>`;
 const m=modal(o.title,`${o.toc?btn('rm1','Mark read up to here')+btn('rm2','Mark this and later chapters unread'):btn('rm1',o.read?'Mark as unread':'Mark as read')}${o.remove?btn('rm3','Remove from folder','dn'):''}`);
 const save=async()=>{await setS('rdp',rdProg);m.close();done&&done()};
 const x=rdProg[o.path]||{};
 if(o.toc){
  const toc=o.toc,k=o.k,N=toc.length;
  $('#rm1',m.body).onclick=()=>{ if(k+1>=N)rdProg[o.path]={...x,c:toc[N-1].i,r:1,done:true,at:Date.now()};else rdProg[o.path]={...x,c:toc[k+1].i,r:0,done:false,at:Date.now()};save()};
  $('#rm2',m.body).onclick=()=>{ if(k===0)delete rdProg[o.path];else rdProg[o.path]={...x,c:toc[k].i,r:0,done:false,at:x.at||Date.now()};save()}}
 else $('#rm1',m.body).onclick=()=>{
  if(o.read)delete rdProg[o.path];
  else rdProg[o.path]={...x,done:true,at:Date.now(),...(F.kind==='manga'&&x.n?{p:x.n-1}:{})};
  save()};
 if(o.remove)$('#rm3',m.body).onclick=async()=>{
  const tgt=o.sid?F.folders.find(s=>s.id===o.sid):F;
  if(tgt)tgt.paths=tgt.paths.filter(p=>p!==o.path);
  await rdSaveF();m.close();done&&done()}}

/* ---------- series page ---------- */
function rdFolderSheet(fid){
 let descOpen=false,coverUrl='',coverTried=false,tocBusy=false;
 {const F0=rdFold.find(x=>x.id===fid);if(F0){F0.opened=Date.now();rdSaveF()}}
 const sh=sheet(el=>{
  const F=rdFold.find(x=>x.id===fid);if(!F){setTimeout(()=>el.close(),0);return}
  const manga=F.kind==='manga',S=rdStats(F),flat=S.list,st=manga?rdResume(flat):null,nr=manga?null:rdNovelResume(F);
  const cat=F.cat&&rdCatsOf(F.kind).find(c=>c.id===F.cat);
  const meta=S.single?(rdMeta[S.single.path]||{}):{};
  const desc=(F.description||meta.d||'').trim(),genres=rdSplit(F.genres||meta.g||'');
  const cover=F.cover||coverUrl;
  const author=!manga&&flat[0]?((rdMeta[flat[0].path]||{}).a||''):'';
  const fmtN=manga?(flat.some(f=>f.extension==='cbr')&&!flat.some(f=>f.extension==='cbz')?'CBR':'CBZ'):(S.single?S.single.extension.toUpperCase():'EPUB');
  const unitN=S.single&&!manga?'chapter':(manga?'chapter':'book');
  const pcDone=S.total?Math.round(S.read/S.total*100):0;
  const canResume=manga?flat.length>0:!!nr.file,fresh=manga?st.fresh:nr.fresh;
  const T=(i,k,l,on)=>`<button data-k="${k}" class="${on?'on':''}">${ic(i,26)}<span>${esc(l)}</span></button>`;

  /* rows */
  const R=o=>`<div class="mhw"><div class="mhr ${o.read?'rd':''} ${o.cur?'on':''}" data-p="${esc(o.p)}" ${o.k!=null?`data-k="${o.k}"`:''}><span class="mht"><b>${esc(o.t)}</b>${o.s?`<small>${esc(o.s)}</small>`:''}</span><span class="mhk">${o.read?ic('check',22):(o.part?`<i class="mhg" style="--p:${o.pct}"></i>`:'')}</span></div><button class="i mhm" data-m="${esc(o.p)}" ${o.k!=null?`data-k="${o.k}"`:''} data-s="${esc(o.sid||'')}" aria-label="Options">${ic('more',18)}</button></div>`;
  const fileRows=(paths,sid)=>{
   const L=rdSortPaths(F.kind,paths);if(!L.length)return `<div class="mu" style="padding:8px 2px">Nothing here yet.</div>`;
   const rows=L.map(f=>{
    const x=rdProg[f.path],pc=rdPct(x),read=!!(x&&x.done),part=!read&&pc>0;
    if(manga){
     const cur=!read&&!st.fresh&&flat[st.idx]&&flat[st.idx].path===f.path;
     return R({p:f.path,sid,t:rdChLabel(f),read,part,pct:pc,cur,s:read?('Read'+(x.at?' · '+rdDate(x.at):'')):part?'Page '+((x.p||0)+1)+' / '+(x.n||'?'):bytes(f.size)})}
    const a=(rdMeta[f.path]||{}).a;
    return R({p:f.path,sid,t:rdTitle(f),read,part,pct:pc,cur:false,s:read?('Finished'+(x.at?' · '+rdDate(x.at):'')):part?pc+'% read':(a||bytes(f.size))})});
   return `<div class="mhl">${rdSet.desc?rows.reverse().join(''):rows.join('')}</div>`};
  const head=(title,count,sid)=>`<div class="sh"><span>${esc(title)}</span><span class="mu">${count}</span><span class="grow"></span><button class="b2" data-add="${esc(sid)}">${ic('plus',14)} Add</button>${sid?`<button class="i" data-rs="${esc(sid)}" aria-label="Rename subfolder">${ic('edit',18)}</button><button class="i" data-ds="${esc(sid)}" aria-label="Delete subfolder">${ic('trash',18)}</button>`:''}</div>`;
  let body='';
  if(!flat.length&&!F.folders.length)body=`<div class="empty">Nothing in this folder yet.<br>Tap <b>Add</b> to pick your ${manga?'.cbz / .cbr chapters':'.epub, .txt or .pdf books'}.${files.length?'':'<br><br>Scan your phone from the Library tab first so your files can be found.'}</div>`;
  else if(S.single&&!manga&&S.pos){
   const toc=S.pos.toc,p=S.pos,book=S.single.path,x=rdProg[book]||{};
   const rows=toc.map((t,k)=>{
    const read=k<p.read||(x.done===true),cur=!read&&k===p.cur,part=cur&&p.frac>.01;
    return R({p:book,k,t:t.t||('Section '+(k+1)),read,part,pct:Math.round(p.frac*100),cur,s:read?'Read':(part?Math.round(p.frac*100)+'% read':'')})});
   body=`<h3 class="sh"><span>${p.total} chapter${p.total===1?'':'s'}</span></h3><div class="mhl">${rdSet.desc?rows.reverse().join(''):rows.join('')}</div>`}
  else if(S.single&&!manga&&!rdTocFail.has(S.single.path)){
   body=`<h3 class="sh"><span>Chapters</span></h3><p class="mu" style="padding:10px 2px">Loading chapters…</p>`;
   if(!tocBusy){tocBusy=true;rdLoadToc(S.single.path).then(ok=>{tocBusy=false;if(!ok)rdTocFail.add(S.single.path);if(el.isConnected)el.refresh()})}}
  else if(!F.folders.length)body=`<h3 class="sh"><span>${S.total} ${unitN}${S.total===1?'':'s'}</span></h3>${fileRows(F.paths,'')}`;
  else body=head(manga?'Chapters':'Books',F.paths.filter(p=>byPath.has(p)).length,'')+fileRows(F.paths,'')+F.folders.map(s=>head(s.name,s.paths.filter(p=>byPath.has(p)).length,s.id)+fileRows(s.paths,s.id)).join('');

  el.innerHTML=`<div class="dv"><div class="bdw"><div class="bdp" ${cover?`style="background-image:url('${cover}')"`:''}></div></div>
  <header class="hd tp" id="tp"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><h2><span>${esc(F.name)}</span></h2><button class="i" id="mhe" aria-label="Edit info">${ic('edit',22)}</button><button class="i" id="mhs" aria-label="Reverse order">${ic('sort',22)}</button><button class="i" id="mho" aria-label="More">${ic('more',24)}</button></header>
  <div class="pad">
   <div class="dh"><div class="pt" id="mhc">${cover?`<img alt="" src="${cover}">`:ic(manga?'image':'book',48)}</div><div class="ti"><h1>${esc(F.name)}</h1>${author?`<p>${ic('user',18)}<span>${esc(author)}</span></p>`:''}<p>${ic('list',18)}<span>${S.total} ${unitN}${S.total===1?'':'s'}</span></p><p>${ic('clock',18)}<span>${rdStatus(S)} · ${fmtN}</span></p>${cat?`<p>${ic('folder',18)}<span>${esc(cat.name)}</span></p>`:''}</div></div>
   <div class="ac4" id="ac4">${T('heart','fv','Favorite',F.fav)}${T('folder','ct',cat?cat.name:'Default',false)}${T('hourglass','pg',pcDone+'%',false)}${T('plus','ad','Add',false)}</div>
   ${desc?`<p class="ds ${descOpen?'ex':''}" id="mds">${esc(desc)}</p><button class="mr ${descOpen?'up':''}" id="mmr" aria-label="${descOpen?'Collapse':'Expand'} synopsis" hidden>${ic('chev',22)}</button>`:`<p class="mu">No synopsis yet. Use the pencil to add one.</p>`}
   ${genres.length?`<div class="chips">${genres.map(g=>`<span>${esc(g)}</span>`).join('')}</div>`:''}
   <div id="mhb">${body}</div>
  </div>
  ${canResume?`<button class="fab" id="mhf">${ic('play',22,'fl')}<span>${fresh?'Start':'Resume'}</span></button>`:''}</div>`;

  /* header + scroll */
  el.onscroll=()=>{const t=$('#tp',el);if(t)t.classList.toggle('sc',el.scrollTop>180)};el.onscroll();
  $('[data-x]',el).onclick=()=>el.close();
  $('#mhe',el).onclick=()=>rdInfoModal(F,()=>el.refresh());
  $('#mhs',el).onclick=()=>{rdSet.desc=!rdSet.desc;rdSetSave();toast(rdSet.desc?'Newest first':'Oldest first');el.refresh()};
  $('#mho',el).onclick=()=>popMenu([
   {icon:'edit',label:'Edit info',fn:()=>rdInfoModal(F,()=>el.refresh())},
   {icon:'image',label:'Change cover',fn:()=>pickFiles({title:'Pick a cover photo',types:['photos'],multi:false,onDone:async([p])=>{try{F.cover=await b2d(await shrink(await rdBlob(p),360));await rdSaveF();el.refresh()}catch(e){toast('Could not read that photo.')}}})},
   {icon:'folder',label:'New subfolder',fn:()=>renameModal('New subfolder','',async v=>{if(F.folders.some(s=>s.name.toLowerCase()===v.toLowerCase()))return toast('A subfolder with that name exists.');F.folders.push({id:uid(),name:v,paths:[]});await rdSaveF();el.refresh()})},
   {icon:'heart',label:F.fav?'Remove from favorites':'Add to favorites',fn:async()=>{F.fav=!F.fav;await rdSaveF();toast(F.fav?'Added to favorites':'Removed from favorites');el.refresh()}},
   {icon:'trash',cls:'dn',label:'Delete folder',fn:()=>deleteModal('Delete this folder?',async()=>{rdFold=rdFold.filter(x=>x.id!==F.id);await rdSaveF();el.close()})}]);

  /* description expand / collapse (only shown when the text is long enough to be cut) */
  const ds=$('#mds',el),mr=$('#mmr',el);
  if(ds&&mr){if(descOpen||ds.scrollHeight>ds.clientHeight+1)mr.hidden=false;mr.onclick=()=>{descOpen=!descOpen;ds.classList.toggle('ex',descOpen);mr.classList.toggle('up',descOpen)}}

  /* action row */
  $('#ac4',el).onclick=async e=>{
   const b=e.target.closest('[data-k]');if(!b)return;
   if(b.dataset.k==='fv'){F.fav=!F.fav;await rdSaveF();el.refresh()}
   else if(b.dataset.k==='ct')rdCatPicker(F,()=>el.refresh());
   else if(b.dataset.k==='pg')toast(S.total?`${S.read} of ${S.total} ${unitN}s read`:'Nothing to read yet');
   else if(b.dataset.k==='ad')rdAddFiles(F.id,'',()=>el.refresh())};

  /* list */
  $('#mhb',el).onclick=e=>{
   const add=e.target.closest('[data-add]');if(add)return rdAddFiles(F.id,add.dataset.add,()=>el.refresh());
   const rs=e.target.closest('[data-rs]');if(rs){const s=F.folders.find(x=>x.id===rs.dataset.rs);if(s)renameModal('Rename subfolder',s.name,async v=>{s.name=v;await rdSaveF();el.refresh()});return}
   const ds2=e.target.closest('[data-ds]');if(ds2){const s=F.folders.find(x=>x.id===ds2.dataset.ds);if(s)deleteModal('Delete subfolder “'+s.name+'”?',async()=>{F.folders=F.folders.filter(x=>x.id!==s.id);await rdSaveF();el.refresh()});return}
   const mo=e.target.closest('[data-m]');
   if(mo){
    const p=mo.dataset.m,k=mo.dataset.k!=null?+mo.dataset.k:null,x=rdProg[p];
    if(k!=null&&S.pos)return rdRowMenu(F,{title:S.pos.toc[k].t||'Chapter',path:p,toc:S.pos.toc,k},()=>el.refresh());
    const f=byPath.get(p);return rdRowMenu(F,{title:f?(manga?rdChLabel(f):rdTitle(f)):'File',path:p,read:!!(x&&x.done),remove:true,sid:mo.dataset.s},()=>el.refresh())}
   const row=e.target.closest('.mhr');if(!row)return;
   const p=row.dataset.p;
   if(manga){const fl=rdFlat(F);return openManga(fl,Math.max(0,fl.findIndex(f=>f.path===p)),F.name)}
   if(row.dataset.k!=null&&S.pos){const k=+row.dataset.k;return openNovel(p,S.pos.toc[k].i,k===S.pos.cur?S.pos.frac:0)}
   openNovel(p)};
  const fab=$('#mhf',el);
  if(fab)fab.onclick=()=>{
   if(S.single&&S.pos&&S.pos.cur>=0){F.opened=Date.now();rdSaveF();return openNovel(S.single.path,S.pos.toc[S.pos.cur].i,S.pos.frac)}
   rdResumeCollection(F)};

  /* cover: use the first file's own cover when no custom one was chosen */
  if(!cover&&flat[0]&&!coverTried){coverTried=true;
   rdCover(flat[0]).then(u=>{if(!u)return;coverUrl=u;if(!el.isConnected)return;const pt=$('#mhc',el),bd=$('.bdp',el);if(pt&&!$('img',pt))pt.innerHTML=`<img alt="" src="${u}">`;if(bd)bd.style.backgroundImage=`url('${u}')`}).catch(()=>{})}
 },()=>{if(rdSheetEl===sh)rdSheetEl=null;if(curTab==='reader')rdDraw($('#page'))});
 rdSheetEl=sh;
 return sh}
