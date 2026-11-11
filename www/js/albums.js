/* ===== Albums: an album can hold any types or one type; a subfolder always holds exactly one type ===== */
const albumCount=a=>a.paths.length+a.folders.reduce((n,f)=>n+f.paths.length,0);
const typeBadge=t=>t==='any'?'Any file types':TLABEL[t]+' only';
const typeOptions=(allowAny,sel)=>(allowAny?`<option value="any" ${sel==='any'?'selected':''}>Any file types</option>`:'')+TYPES.map(([k,n])=>`<option value="${k}" ${sel===k?'selected':''}>${n} only</option>`).join('');
const baseName=p=>String(p).split('/').pop();

function renderAlbums(root){
 root.innerHTML=`<header class="hd"><h1>${ic('album',26)} Albums</h1><button class="b" id="na">${ic('plus',16)} Album</button></header>
 <div class="pad"><p class="mu">Albums group your files without moving, copying or deleting them. An album can hold any file types or just one. Inside an album, each subfolder holds exactly one type.</p>
 ${missingCard()}<div id="al">${albums.length?albums.map(a=>`<div class="pl2" data-a="${esc(a.id)}"><div class="av2">${a.cover?`<img alt="" src="${a.cover}">`:ic(a.type==='any'?'album':TICON[a.type],22)}</div><div class="t"><b>${esc(a.name)}</b>${a.description?`<span class="mu ds">${esc(a.description)}</span>`:''}<span class="mu">${albumCount(a)} files${a.folders.length?` · ${a.folders.length} subfolder${a.folders.length>1?'s':''}`:''} · ${esc(typeBadge(a.type))}</span></div>${ic('chev',20,'')}</div>`).join(''):'<div class="empty">No albums yet. Tap “Album” to create one, for example “Thesis” or “Trip 2026”.</div>'}</div></div>`;
 $('#na',root).onclick=()=>createAlbumModal();
 if($('#mcb',root))$('#mcb',root).onclick=()=>missingModal(()=>renderTab());
 $('#al',root).onclick=e=>{const c=e.target.closest('[data-a]');if(c)albumSheet(c.dataset.a)}}

function createAlbumModal(paths=[]){
 const ts=[...new Set(paths.map(ftype))];
 const m=modal('Create album',`<label>Album name</label><input id="an" placeholder="e.g. Thesis, Trip 2026"><label>What can this album hold?</label><select id="at">${typeOptions(true,'any')}</select><p class="mu">Choose “Any file types” to mix photos, videos, music and documents. Subfolders inside will each hold one type.</p>${paths.length?`<p class="mu">${paths.length} selected file${paths.length>1?'s':''} will be added.</p>`:''}<button class="b" id="ac" style="width:100%">Create album</button>`);
 $('#ac',m.body).onclick=async()=>{const name=$('#an',m.body).value.trim(),type=$('#at',m.body).value;
  if(!name)return toast('Enter an album name.');
  if(type!=='any'&&paths.some(p=>ftype(p)!==type))return toast('Some selected files are not '+TLABEL[type].toLowerCase()+'.');
  const a={id:uid(),name,type,paths:[...paths],folders:[]};albums.push(a);await saveAlbums();m.close();if(paths.length)clearSel();
  toast('Album created');if(curTab==='albums')renderTab();else if(curTab==='lib')renderTab()}}

/* ===== generic file picker (types locked or chosen; many or one file) ===== */
function pickFiles({title,types,preset=[],exclude,multi=true,label='Add',onDone}){
 const chosen=new Set(preset),allowed=types?new Set(types):null;
 let t=types&&types.length===1?types[0]:'all',q='',limit=150;
 sheet(el=>{
  const chips=!types||types.length>1;
  el.innerHTML=`<header class="hd"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><h2><span>${esc(title)}</span></h2>${multi?`<button class="b" id="pd">${esc(label)} (<span id="pn">0</span>)</button>`:''}</header>
  <div class="pad">${chips?`<div class="tabs" id="pt">${[['all','All types'],...TYPES.filter(x=>!allowed||allowed.has(x[0])).map(x=>[x[0],x[1]])].map(([k,n])=>`<button data-k="${k}" class="${t===k?'on':''}">${esc(n)}</button>`).join('')}</div>`:`<p class="mu">Only ${esc(TLABEL[types[0]].toLowerCase())} can be added here.</p>`}
  <input id="pq" type="search" placeholder="Search by name" autocomplete="off">
  <div class="row"><span class="mu grow" id="pc"></span>${multi?'<button class="b2" id="pa">Select all shown</button>':''}</div>
  <div id="pf" class="files l"></div><div id="pm"></div></div>`;
  const cand=()=>{const ql=q.trim().toLowerCase();return files.filter(f=>(!allowed||allowed.has(f.type))&&(t==='all'||f.type===t)&&!(exclude&&exclude.has(f.path))&&(!ql||f.name.toLowerCase().includes(ql)))};
  const count=()=>{if(multi)$('#pn',el).textContent=chosen.size};
  const draw=()=>{const l=cand(),s=l.slice(0,limit);$('#pc',el).textContent=`${l.length} file${l.length==1?'':'s'}`;
   $('#pf',el).innerHTML=s.length?s.map(f=>fileRow(f,{sel:chosen.has(f.path),check:multi})).join(''):`<div class="empty">${files.length?'No matching files.':'Scan your phone first (Library tab) to see your files here.'}</div>`;
   $('#pm',el).innerHTML=l.length>s.length?`<button class="b2 more" id="pmore">Show more (${l.length-s.length} left)</button>`:'';
   if($('#pmore',el))$('#pmore',el).onclick=()=>{limit+=200;draw()};
   observeThumbs(el);count()};
  $('[data-x]',el).onclick=()=>el.close();
  if(chips)$('#pt',el).onclick=e=>{const b=e.target.closest('[data-k]');if(!b)return;t=b.dataset.k;limit=150;$$('#pt button',el).forEach(x=>x.classList.toggle('on',x===b));draw()};
  $('#pq',el).oninput=e=>{q=e.target.value;limit=150;draw()};
  $('#pf',el).onclick=e=>{const fi=e.target.closest('.fi');if(!fi)return;const p=fi.dataset.p;
   if(!multi){el.close();onDone([p]);return}
   chosen.has(p)?chosen.delete(p):chosen.add(p);fi.classList.toggle('sel',chosen.has(p));$('.ck',fi).checked=chosen.has(p);count()};
  if(multi){$('#pa',el).onclick=()=>{const l=cand().slice(0,limit),all=l.every(f=>chosen.has(f.path));l.forEach(f=>all?chosen.delete(f.path):chosen.add(f.path));draw()};
   $('#pd',el).onclick=()=>{const ps=[...chosen];el.close();onDone(ps)}}
  draw()})}

/* ===== shared pieces: sorting, search, grid size, favorites, details, nesting ===== */
const A_SORTS=[['added','Recently added'],['name','Name A–Z'],['new','Newest file'],['old','Oldest file'],['size','Largest first']];
const rowName=r=>r.f?r.f.name:baseName(r.p);
function rowSort(rows,sort){const arr=[...rows];if(sort==='added'||!sort)return arr.reverse();
 const S={name:(a,b)=>rowName(a).localeCompare(rowName(b)),new:(a,b)=>(b.f?.modified||0)-(a.f?.modified||0),old:(a,b)=>(a.f?.modified||0)-(b.f?.modified||0),size:(a,b)=>(b.f?.size||0)-(a.f?.size||0)};
 return arr.sort(S[sort]||S.name)}
const kidsOf=(a,id)=>a.folders.filter(x=>(x.pid||null)===(id||null));
const descIds=(a,id)=>[id,...a.folders.filter(x=>x.pid===id).flatMap(x=>descIds(a,x.id))];
const folderPath=(a,f)=>{const n=[];let x=f,g=0;while(x&&g++<20){n.unshift(x.name);x=x.pid?a.folders.find(y=>y.id===x.pid):null}return n};
const subCount=(a,id)=>descIds(a,id).length-1;

/* search + sort + grid size + favorites + the file list, for an album or a subfolder (o) */
function mountList(host,{o,getRows,label,onRemove,onFlt}){
 let q='',fv=false;
 host.innerHTML=`<input class="aq" type="search" placeholder="Search in ${esc(label)}" autocomplete="off">
  <div class="tools"><select class="asr" aria-label="Sort">${A_SORTS.map(([v,t])=>`<option value="${v}" ${(o.sort||'added')===v?'selected':''}>${t}</option>`).join('')}</select>
  <select class="avw" aria-label="Grid size">${VIEWS.map(([v,,t])=>`<option value="${v}" ${(o.view||'list')===v?'selected':''}>${t}</option>`).join('')}</select></div>
  <label class="row mu"><input type="checkbox" class="afv" style="width:auto"> Favorites only</label><div class="afl files l"></div>`;
 const L=$('.afl',host);
 const draw=()=>{let rows=getRows();const ql=q.trim().toLowerCase();
  if(ql)rows=rows.filter(r=>rowName(r).toLowerCase().includes(ql));if(fv)rows=rows.filter(r=>favs.has(r.p));
  rows=rowSort(rows,o.sort);L.className='afl files '+viewCls(o.view||'list');
  L.innerHTML=rows.length?rows.map(r=>{const rm=`<div class="fa"><button class="i rm" aria-label="Remove">${ic('trash',18)}</button></div>`;
   return r.f?fileRow(r.f,{actions:rm}):`<article class="fi" data-p="${esc(r.p)}"><div class="fth">${ic('file',24)}</div><div class="fx"><div class="fn">${esc(baseName(r.p))}</div><div class="fm">Missing: moved or deleted outside FileVault</div></div>${rm}</article>`}).join('')
   :`<div class="empty">${q||fv?'Nothing matches.':'Nothing here yet.'}</div>`;
  L.onclick=async e=>{const fi=e.target.closest('.fi');if(!fi)return;const p=fi.dataset.p;
   if(e.target.closest('.rm'))return onRemove(p);
   if(byPath.has(p))openFile(p,rows.map(r=>r.f).filter(Boolean))};
  observeThumbs(host)};
 $('.aq',host).oninput=e=>{q=e.target.value;draw()};
 $('.afv',host).onchange=e=>{fv=e.target.checked;draw()};
 $('.asr',host).onchange=async e=>{o.sort=e.target.value;await saveAlbums();draw()};
 $('.avw',host).onchange=async e=>{o.view=e.target.value;await saveAlbums();draw()};
 host.draw=draw;draw()}

/* name, description and cover photo (works for albums and subfolders) */
function detailsModal(o,title,done,save){
 let cover=o.cover||'';
 const m=modal(title,`<label>Name</label><input id="dn" value="${esc(o.name)}"><label>Description</label><textarea id="dd" rows="3" placeholder="Optional">${esc(o.description||'')}</textarea>
  <label>Cover photo</label><div class="row"><div class="av2" id="dp">${cover?`<img alt="" src="${cover}">`:ic('image',22)}</div><button class="b2 grow" id="dc">Choose a photo</button><button class="b2 dn" id="dx">Remove</button></div>
  <p class="mu">Only a small copy of the picture is kept inside FileVault. The original photo is not touched.</p><button class="b" id="ds" style="width:100%">Save</button>`);
 const pv=()=>{$('#dp',m.body).innerHTML=cover?`<img alt="" src="${cover}">`:ic('image',22)};
 $('#dc',m.body).onclick=()=>pickFiles({title:'Pick a cover photo',types:['photos'],multi:false,onDone:async([p])=>{try{cover=await b2d(await shrink(await blobFromPath(p),360));pv()}catch(e){toast('Could not read that photo.')}}});
 $('#dx',m.body).onclick=()=>{cover='';pv()};
 $('#ds',m.body).onclick=async()=>{const n=$('#dn',m.body).value.trim();if(!n)return toast('Enter a name.');
  o.name=n;o.description=$('#dd',m.body).value.trim();o.cover=cover;await(save||saveAlbums)();m.close();done&&done()}}

/* ===== album screen ===== */
function albumSheet(aid){
 let flt='all';
 const el=sheet(el=>{
  const a=albums.find(x=>x.id===aid);if(!a){setTimeout(()=>el.close(),0);return}
  const all=a.paths.map(p=>({p,f:byPath.get(p)}));
  const present=[...new Set(all.filter(r=>r.f).map(r=>r.f.type))];if(flt!=='all'&&!present.includes(flt))flt='all';
  const top=kidsOf(a,null);
  el.innerHTML=`<header class="hd"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><h2><span>${esc(a.name)}</span></h2><button class="i" data-m aria-label="More">${ic('more',24)}</button></header>
  <div class="pad">${a.cover?`<img class="acv" alt="" src="${a.cover}">`:''}${a.description?`<p class="mu" style="white-space:pre-wrap">${esc(a.description)}</p>`:''}
  <div class="row"><span class="badge">${esc(typeBadge(a.type))}</span><span class="mu">${albumCount(a)} files · ${a.folders.length} subfolder${a.folders.length==1?'':'s'}</span></div>
  <div class="row"><button class="b grow" id="af">${ic('plus',16)} Add files</button><button class="b2 grow" id="sf">${ic('folder',16)} Subfolder</button></div>
  ${top.length?`<h3 class="sh">Subfolders</h3>${top.map(f=>folderRow(a,f)).join('')}`:''}
  <h3 class="sh">Files in this album</h3>
  ${a.type==='any'&&present.length>1?`<div class="tabs" id="ft">${[['all','All'],...present.map(k=>[k,TLABEL[k]])].map(([k,n])=>`<button data-k="${k}" class="${flt===k?'on':''}">${esc(n)}</button>`).join('')}</div>`:''}
  <div id="atl"></div></div>`;
  $('[data-x]',el).onclick=()=>el.close();
  $('[data-m]',el).onclick=()=>popMenu([{label:'Edit name, description, cover',icon:'edit',fn:()=>detailsModal(a,'Album details',()=>el.refresh())},{label:'Delete album',icon:'trash',cls:'dn',fn:()=>deleteModal('Delete album “'+a.name+'”?',async()=>{albums=albums.filter(x=>x.id!==a.id);await saveAlbums();el.close()})}]);
  $('#af',el).onclick=()=>pickFiles({title:'Add to '+a.name,types:a.type==='any'?null:[a.type],exclude:new Set(a.paths),onDone:async ps=>{if(!ps.length)return;a.paths=[...new Set([...a.paths,...ps])];await saveAlbums();el.refresh();toast(ps.length+' file(s) added. Originals were not moved.')}});
  $('#sf',el).onclick=()=>folderModal(a,()=>el.refresh(),null);
  const host=$('#atl',el);
  mountList(host,{o:a,label:'this album',getRows:()=>all.filter(r=>flt==='all'||(r.f&&r.f.type===flt)),
   onRemove:async p=>{a.paths=a.paths.filter(x=>x!==p);await saveAlbums();el.refresh();toast('Removed from album. The file itself was not touched.')}});
  const ft=$('#ft',el);if(ft)ft.onclick=e=>{const b=e.target.closest('[data-k]');if(b){flt=b.dataset.k;$$('#ft button',el).forEach(x=>x.classList.toggle('on',x===b));host.draw()}};
  $$('[data-f]',el).forEach(x=>x.onclick=()=>folderSheet(a.id,x.dataset.f))},
  ()=>{if(curTab==='albums'||curTab==='lib')renderTab()});
 return el}

function folderRow(a,f){const n=subCount(a,f.id);
 return `<div class="pl2" data-f="${esc(f.id)}"><div class="av2">${f.cover?`<img alt="" src="${f.cover}">`:ic('folder',22)}</div><div class="t"><b>${esc(f.name)}</b>${f.description?`<span class="mu ds">${esc(f.description)}</span>`:''}<span class="mu">${f.paths.length} file${f.paths.length==1?'':'s'}${n?` · ${n} subfolder${n>1?'s':''}`:''} · ${esc(f.type==='any'?'type not set':typeBadge(f.type))}</span></div>${ic('chev',20)}</div>`}

/* a subfolder can sit inside another subfolder (pid = the parent's id) */
function folderModal(a,done,pid){
 const par=pid?a.folders.find(x=>x.id===pid):null;
 const m=modal(par?'New subfolder in '+par.name:'New subfolder',`<label>Subfolder name</label><input id="fn" placeholder="e.g. Chapter 1, Vacation"><label>Type of file inside</label><select id="ft" ${a.type!=='any'?'disabled':''}>${typeOptions(false,a.type!=='any'?a.type:(par&&par.type!=='any'?par.type:'photos'))}</select><p class="mu">${a.type==='any'?'A subfolder holds one type of file only. Pick the type now; you choose which files of that type to add afterwards.':'This album only holds '+esc(TLABEL[a.type].toLowerCase())+', so its subfolders do too.'}</p><button class="b" id="fs" style="width:100%">Create subfolder</button>`);
 $('#fs',m.body).onclick=async()=>{const name=$('#fn',m.body).value.trim(),type=a.type!=='any'?a.type:$('#ft',m.body).value;
  if(!name)return toast('Enter a subfolder name.');
  if(kidsOf(a,pid).some(f=>f.name.toLowerCase()===name.toLowerCase()))return toast('A subfolder with that name exists here.');
  a.folders.push({id:uid(),name,type,paths:[],pid:pid||null});await saveAlbums();m.close();toast('Subfolder created');done&&done()}}

function renameModal(title,cur,fn){
 const m=modal(title,`<input id="rn" value="${esc(cur)}"><button class="b" id="rs" style="width:100%;margin-top:8px">Save name</button>`);
 $('#rs',m.body).onclick=()=>{const v=$('#rn',m.body).value.trim();if(!v)return;m.close();fn(v)}}
function deleteModal(title,fn){
 const m=modal(title,`<p class="mu">Your original files are not deleted. Only this organization inside FileVault is removed.</p><div class="row"><button class="b2 grow" data-x>Cancel</button><button class="b dn grow" id="dy" style="background:var(--dn);color:#fff;box-shadow:none">Delete</button></div>`);
 $('#dy',m.body).onclick=()=>{m.close();fn()}}

/* ===== subfolder screen: exactly one file type, and it can hold more subfolders ===== */
function folderSheet(aid,fid){
 sheet(el=>{
  const a=albums.find(x=>x.id===aid),f=a&&a.folders.find(x=>x.id===fid);if(!f){setTimeout(()=>el.close(),0);return}
  const rows=f.paths.map(p=>({p,f:byPath.get(p)})),kids=kidsOf(a,f.id);
  el.innerHTML=`<header class="hd"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><h2><span>${esc(a.name)} / ${esc(folderPath(a,f).join(' / '))}</span></h2><button class="i" data-m aria-label="More">${ic('more',24)}</button></header>
  <div class="pad">${f.cover?`<img class="acv" alt="" src="${f.cover}">`:''}${f.description?`<p class="mu" style="white-space:pre-wrap">${esc(f.description)}</p>`:''}
  <div class="row"><span class="badge">${esc(f.type==='any'?'Type not set':typeBadge(f.type))}</span><span class="mu">${f.paths.length} file${f.paths.length==1?'':'s'}</span></div>
  ${f.type==='any'?`<div class="notice warn">This subfolder was made before types were required. Choose what it holds:<div class="row"><select class="grow" id="st">${typeOptions(false,a.type!=='any'?a.type:'photos')}</select><button class="b" id="ss">Set type</button></div></div>`
  :`<div class="row"><button class="b grow" id="af">${ic('plus',16)} Add ${esc(TLABEL[f.type].toLowerCase())}</button><button class="b2 grow" id="sf">${ic('folder',16)} Subfolder</button></div>`}
  ${kids.length?`<h3 class="sh">Subfolders</h3>${kids.map(k=>folderRow(a,k)).join('')}`:''}
  <div id="atl"></div></div>`;
  $('[data-x]',el).onclick=()=>el.close();
  $('[data-m]',el).onclick=()=>popMenu([{label:'Edit name, description, cover',icon:'edit',fn:()=>detailsModal(f,'Subfolder details',()=>el.refresh())},{label:'Delete subfolder',icon:'trash',cls:'dn',fn:()=>deleteModal('Delete subfolder “'+f.name+'”?',async()=>{const gone=new Set(descIds(a,f.id));a.folders=a.folders.filter(x=>!gone.has(x.id));await saveAlbums();el.close()})}]);
  if($('#ss',el))$('#ss',el).onclick=async()=>{const t=$('#st',el).value;if(f.paths.some(p=>ftype(p)!==t))return toast('Some files already inside are not '+TLABEL[t].toLowerCase()+'.');f.type=t;await saveAlbums();el.refresh()};
  if($('#af',el))$('#af',el).onclick=()=>pickFiles({title:'Add to '+f.name,types:[f.type],exclude:new Set(f.paths),onDone:async ps=>{if(!ps.length)return;f.paths=[...new Set([...f.paths,...ps])];await saveAlbums();el.refresh();toast(ps.length+' file(s) added. Originals were not moved.')}});
  if($('#sf',el))$('#sf',el).onclick=()=>folderModal(a,()=>el.refresh(),f.id);
  $$('[data-f]',el).forEach(x=>x.onclick=()=>folderSheet(a.id,x.dataset.f));
  mountList($('#atl',el),{o:f,label:'this subfolder',getRows:()=>rows,
   onRemove:async p=>{f.paths=f.paths.filter(x=>x!==p);await saveAlbums();el.refresh();toast('Removed. The file itself was not touched.')}})},
  ()=>{const t=topLayer();if(t&&t.refresh)t.refresh()});
}

/* ===== missing files: listed in an album, favorites or tags, but not found in the last scan ===== */
function missingPaths(){
 if(!files.length)return[];const m=new Set(),chk=p=>{if(!byPath.has(p))m.add(p)};
 albums.forEach(a=>{a.paths.forEach(chk);a.folders.forEach(f=>f.paths.forEach(chk))});favs.forEach(chk);Object.keys(fileTags).forEach(chk);return[...m]}
async function cleanMissing(){
 const m=new Set(missingPaths());albums.forEach(a=>{a.paths=a.paths.filter(p=>!m.has(p));a.folders.forEach(f=>{f.paths=f.paths.filter(p=>!m.has(p))})});
 m.forEach(p=>{favs.delete(p);delete fileTags[p]});await saveAll();await setS('fileTags',fileTags);return m.size}
function missingCard(){
 const n=missingPaths().length;if(!n)return '';
 return `<div class="notice warn" id="mc">${n} file${n>1?'s':''} listed in your albums, favorites or tags ${n>1?'were':'was'} not found in the last scan (moved or deleted outside FileVault). <div class="row"><button class="b2" id="mcb">Review &amp; clean up</button></div></div>`}
function missingModal(done){
 const l=missingPaths();if(!l.length){toast('No missing files');return done&&done()}
 const m=modal('Missing files',`<p class="mu">These are only entries inside FileVault. Removing them never touches your real files.</p><div style="max-height:40vh;overflow:auto">${l.slice(0,60).map(p=>`<div class="fm" style="padding:4px 0;white-space:normal;overflow-wrap:anywhere">${esc(baseName(p))}</div>`).join('')}${l.length>60?`<div class="mu">…and ${l.length-60} more</div>`:''}</div><div class="row"><button class="b2 grow" data-x>Keep</button><button class="b grow" id="mcl">Remove ${l.length} entr${l.length>1?'ies':'y'}</button></div>`);
 $('#mcl',m.body).onclick=async()=>{const n=await cleanMissing();m.close();toast(n+' missing entr'+(n==1?'y':'ies')+' removed');done&&done()}}
