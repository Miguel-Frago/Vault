/* ===== CineVault inside FileVault =====
   Movies keep their details, poster (a small shrunk image) and cast. The movie video and the
   soundtrack songs are only LINKED to files FileVault already sees, so nothing big is copied. */
let cvTab='movies';const cvUi={q:'',sort:'added',st:'all',genre:'all'};
const SEP='/',par=p=>p.includes(SEP)?p.slice(0,p.lastIndexOf(SEP)):'',base=p=>p.slice(p.lastIndexOf(SEP)+1),kids=p=>cvFolders.filter(x=>par(x)==p),
 inF=p=>cvMovies.filter(m=>m.folder&&(m.folder==p||m.folder.startsWith(p+SEP))),cleanN=s=>s.split(SEP).join('-').trim(),
 sortF=()=>[...cvFolders].sort((a,b)=>{const x=a.split(SEP),y=b.split(SEP);for(let i=0;i<Math.min(x.length,y.length);i++){const c=x[i].localeCompare(y[i]);if(c)return c}return x.length-y.length}),
 ensureAnc=()=>{const s=new Set(cvFolders);cvFolders.forEach(p=>{let c='';p.split(SEP).forEach(x=>{c=c?c+SEP+x:x;s.add(c)})});cvFolders=[...s]},
 saveF=()=>setS('cvFolders',cvFolders),saveC=()=>setS('cvCovers',cvCovers),
 addF=async p=>{let c='';p.split(SEP).forEach(x=>{c=c?c+SEP+x:x;if(!cvFolders.includes(c))cvFolders.push(c)});await saveF()};
const rtS=m=>m.rtSec!=null&&m.rtSec!==''?+m.rtSec:(+m.runtime||0)*60,
 fmtRt=t=>{t=Math.round(t);const h=Math.floor(t/3600),mi=Math.floor(t%3600/60),c=t%60;return[h&&h+'h',mi&&mi+'m',c&&c+'s'].filter(Boolean).join(' ')},
 se=m=>[m.season?'S'+m.season:'',m.episode?'E'+m.episode:''].filter(Boolean).join(' ');
const stars=n=>[1,2,3,4,5].map(i=>`<span class="s ${i<=n?'on':''}" data-s="${i}">★</span>`).join('');
const resT=m=>{const p=m.videoPath&&pos[m.videoPath];return resOK(p)?p.t:0};
/* Season / episode of a CineVault entry: its own fields first, then the title, then the video file name or folder (S01E03, 1x03, Episode 3, Season 2/05.mkv) */
function cvEpInfo(m){
 if(!m)return null;
 const s=Number(m.season),e=Number(m.episode);
 if(m.season!==''&&m.season!=null&&m.episode!==''&&m.episode!=null&&Number.isFinite(s)&&Number.isFinite(e))return{s,e};
 if(typeof parseEp==='function'&&m.videoPath){
  const nm=(byPath.get(m.videoPath)?.name)||m.videoPath.split('/').pop();
  let p=null;try{p=parseEp({name:nm,path:m.videoPath})}catch(x){}
  if(!p)try{p=parseEp({name:String(m.title||'')+'.mkv',path:m.folder?m.folder+'/x':'x'})}catch(x){}
  if(p&&p.episode!=null)return{s:Number.isFinite(s)&&m.season!==''&&m.season!=null?s:p.season,e:p.episode}}
 return null}
const cvSeasonDir=d=>/^(?:season|series|saison|temporada|s)[\s._-]*\d{1,2}$/i.test(String(d||'').trim());
/* All numbered episodes of the series this entry belongs to: same folder, or sibling Season folders (never another show's folder). */
function cvSeries(current,self){
 const cur=cvEpInfo(current);
 if(!cur||!current.folder||!current.videoPath)return[];
 const parent=par(current.folder),curSeasonDir=cvSeasonDir(base(current.folder));
 const sameSeries=x=>x.folder===current.folder||(!!parent&&curSeasonDir&&par(x.folder||'')===parent&&cvSeasonDir(base(x.folder||'')));
 return cvMovies.filter(x=>(self||x.id!==current.id)&&x.videoPath&&x.folder&&sameSeries(x))
  .map(x=>({x,i:cvEpInfo(x)})).filter(o=>o.i)
  .sort((a,b)=>a.i.s-b.i.s||a.i.e-b.i.e||String(a.x.title).localeCompare(String(b.x.title)))}
function cvNextEpisode(current){
 const cur=cvEpInfo(current);if(!cur)return null;
 const hit=cvSeries(current).find(o=>o.i.s>cur.s||(o.i.s===cur.s&&o.i.e>cur.e));
 return hit?hit.x:null}
/* data for the player's Seasons & episodes picker */
function cvEpisodeMenu(current){
 const list=cvSeries(current,true);if(list.length<2)return null;
 const by=new Map();list.forEach(o=>{if(!by.has(o.i.s))by.set(o.i.s,[]);by.get(o.i.s).push(o)});
 return{seasons:[...by.entries()].sort((p,q)=>p[0]-q[0]).map(([sn,arr])=>({label:'Season '+sn,
  eps:arr.map(o=>({path:o.x.videoPath,title:`${o.x.title} · S${sn} E${o.i.e}`,label:'Episode '+o.i.e}))}))}}
/* a small preview frame of the linked video; the video itself is never copied */
function webThumb(p){return new Promise(res=>{
 const v=document.createElement('video');v.muted=true;v.preload='auto';v.playsInline=true;let done=false;
 const fin=b=>{if(done)return;done=true;try{v.removeAttribute('src');v.load()}catch(e){}res(b)};
 v.onloadeddata=()=>{try{v.currentTime=Math.min(1,(v.duration||2)/2)}catch(e){fin(null)}};
 v.onseeked=()=>{try{const k=Math.min(1,640/(v.videoWidth||640)),c=document.createElement('canvas');c.width=Math.round(v.videoWidth*k)||320;c.height=Math.round(v.videoHeight*k)||180;c.getContext('2d').drawImage(v,0,0,c.width,c.height);c.toBlob(b=>fin(b),'image/jpeg',.8)}catch(e){fin(null)}};
 v.onerror=()=>fin(null);setTimeout(()=>fin(null),9000);v.src=fileUrl(p)})}
async function videoThumbBlob(p){
 if(native){try{const d=await FV.videoThumbnail({path:p});return await shrink(d2b('data:image/jpeg;base64,'+d.base64),640)}catch(e){}}
 return webThumb(p)}
/* fills in thumbnails for movies that were linked before, one at a time */
let cvBusy=false;
async function cvBackfill(){
 if(cvBusy)return;cvBusy=true;let changed=false;
 try{
  for(const m of cvMovies){if(!m.videoPath||m.vthumb||vTried.has(m.id))continue;vTried.add(m.id);
   try{const b=await videoThumbBlob(m.videoPath);if(!b)continue;m.vthumb=b;if(!m.poster){m.poster=b;m.posterAuto=true}await putMovie(m);changed=true}catch(e){console.warn('CineVault thumbnail generation failed:',m.title,e)}
  }
 }finally{cvBusy=false}
 if(changed){await reloadMovies();if(curTab==='cine'&&!layers.length)renderTab()}}
const vTried=new Set();
const reloadMovies=async()=>{cvMovies=await allMovies()};

const cvTabs=()=>`<div class="tabs eq" id="ctabs"><button data-t="movies" class="${cvTab=='movies'?'on':''}">${ic('film',16)} Movies</button><button data-t="folders" class="${cvTab=='folders'?'on':''}">${ic('folder',16)} Folders</button><button data-t="stats" class="${cvTab=='stats'?'on':''}">${ic('sliders',16)} Stats</button></div>`;
const cardH=(m,i)=>`<div class="card" data-id="${m.id}" style="--d:${Math.min(i,12)}">${m.poster?`<img src="${U(m.poster)}" alt="">`:`<div class="ph" ${m.videoPath?`data-p="${esc(m.videoPath)}" data-t="videos"`:''}>${ic('logo',44)}</div>`}<div class="ov"><b>${esc(m.title)}</b><span class="mu">${m.year||''} ${se(m)} ${m.fav?'♥':''} ${m.status=='watched'?'✓':''}</span><div class="sm">${stars(m.rating||0)}</div></div></div>`;

function renderCine(root){
 clr();
 root.innerHTML=`<header class="hd"><h1>${ic('logo',26)} CineVault</h1><button class="i" id="wh" aria-label="Watch history">${ic('clock',22)}</button>${cvTab=='folders'?`<button class="b" id="nf">${ic('plus',16)} Folder</button>`:cvTab=='movies'?`<button class="b" id="ad">${ic('plus',16)} Add</button>`:''}</header><div class="pad">${cvTabs()}<div id="cbody"></div></div>`;
 $('#wh',root).onclick=watchSheet;
 $('#ctabs',root).onclick=e=>{const t=e.target.closest('[data-t]')?.dataset.t;if(t){cvTab=t;renderCine(root)}};
 if($('#ad',root))$('#ad',root).onclick=()=>cvForm();
 if(cvTab=='stats')cvStats($('#cbody',root));else if(cvTab=='folders')cvFoldersView($('#cbody',root),$('#nf',root));else cvMovieList($('#cbody',root))}

function cvMovieList(box){
 const gs=[...new Set(cvMovies.flatMap(m=>m.genres||[]))].sort();
 box.innerHTML=`<div id="cw"></div><input id="q" type="search" placeholder="Search title, actor, character" value="${esc(cvUi.q)}">
 <div class="row" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px"><select id="st">${[['all','All'],['watchlist','Watchlist'],['watched','Watched'],['fav','Favorites']].map(([v,t])=>`<option value="${v}" ${cvUi.st==v?'selected':''}>${t}</option>`).join('')}</select>
 <select id="gn"><option value="all">All genres</option>${gs.map(g=>`<option ${cvUi.genre==g?'selected':''}>${esc(g)}</option>`).join('')}</select>
 <select id="so">${[['added','Newest added'],['title','Title A-Z'],['rating','Top rated'],['year','Year']].map(([v,t])=>`<option value="${v}" ${cvUi.sort==v?'selected':''}>${t}</option>`).join('')}</select></div>
 <div class="grid" id="gr"></div>`;
 $('#q',box).oninput=e=>{cvUi.q=e.target.value;$('#gr',box).classList.add('nm');cvDraw(box)};
 $('#st',box).onchange=e=>{cvUi.st=e.target.value;cvDraw(box)};$('#gn',box).onchange=e=>{cvUi.genre=e.target.value;cvDraw(box)};$('#so',box).onchange=e=>{cvUi.sort=e.target.value;cvDraw(box)};
 box.onclick=e=>{const c=e.target.closest('.card');if(c)cvDetail(c.dataset.id)};
 cvDraw(box);cvBackfill()}
function cvDraw(box){
 const q=cvUi.q.toLowerCase(),S={added:(a,b)=>b.added-a.added,title:(a,b)=>a.title.localeCompare(b.title),rating:(a,b)=>(b.rating||0)-(a.rating||0),year:(a,b)=>(b.year||0)-(a.year||0)};
 const r=cvMovies.filter(m=>(cvUi.st=='all'||(cvUi.st=='fav'?m.fav:m.status==cvUi.st))&&(cvUi.genre=='all'||(m.genres||[]).includes(cvUi.genre))&&(!q||(m.title+' '+(m.cast||[]).map(c=>c.a+' '+c.c).join(' ')).toLowerCase().includes(q))).sort(S[cvUi.sort]);
 const cw=cvUi.q?[]:cvMovies.filter(m=>resT(m)).sort((a,b)=>pos[b.videoPath].at-pos[a.videoPath].at).slice(0,8);
 $('#cw',box).innerHTML=cw.length?`<h3>Continue watching</h3><div class="hs">${cw.map(m=>`<div class="card" data-id="${m.id}">${m.poster?`<img src="${U(m.poster)}" alt="">`:`<div class="ph" ${m.videoPath?`data-p="${esc(m.videoPath)}" data-t="videos"`:''}>${ic('logo',40)}</div>`}<div class="ov"><b>${esc(m.title)}</b><div class="pb"><i style="width:${Math.min(100,pos[m.videoPath].t/(pos[m.videoPath].d||1)*100)}%"></i></div></div></div>`).join('')}</div>`:'';
 $('#gr',box).innerHTML=r.length?r.map(cardH).join(''):`<p class="mu">${cvMovies.length?'No matches.':'No movies yet. Tap + Add to start your shelf. You can link each movie to a video already on your phone, so nothing is copied.'}</p>`;observeThumbs(box)}

function cvStats(box){
 const w=cvMovies.filter(m=>m.status=='watched'),r=cvMovies.filter(m=>m.rating),avg=r.length?(r.reduce((a,m)=>a+m.rating,0)/r.length).toFixed(1):'-',mins=w.reduce((a,m)=>a+rtS(m)/60,0),g={};
 cvMovies.forEach(m=>(m.genres||[]).forEach(x=>g[x]=(g[x]||0)+1));const gs=Object.entries(g).sort((a,b)=>b[1]-a[1]).slice(0,6),mx=gs[0]?.[1]||1;
 box.innerHTML=`<div class="stats">${[[cvMovies.length,'Movies'],[w.length,'Watched'],[avg,'Avg rating'],[Math.round(mins/60)+'h','Watch time'],[cvFolders.length,'Folders'],[cvMovies.filter(m=>m.fav).length,'Favorites']].map(([v,l])=>`<div class="st"><b>${v}</b><span class="mu">${l}</span></div>`).join('')}</div><h3>Top genres</h3>${gs.map(([n,c])=>`<div class="bar"><span>${esc(n)}</span><i style="width:${c/mx*100}%"></i><em>${c}</em></div>`).join('')||'<p class="mu">Add genres to see this.</p>'}`}

/* ----- folders ----- */
const fcH=(n,i)=>{const ms=inF(n),ps=ms.filter(m=>m.poster).slice(0,4),wd=ms.filter(m=>m.status=='watched').length,k=kids(n).length;
 return`<div class="fc" data-p="${esc(n)}" style="--d:${Math.min(i,12)}">${cvCovers[n]?`<img src="${U(cvCovers[n])}" alt="" style="grid-column:span 2;grid-row:span 2">`:ps.length?ps.map(m=>`<img src="${U(m.poster)}" alt=""${ps.length==1?' style="grid-column:span 2;grid-row:span 2"':''}>`).join(''):`<div class="big">${ic('folder',48)}</div>`}<div class="ov"><b>${esc(base(n))}</b><span class="mu">${wd}/${ms.length} watched${k?` · ${k} subfolder${k>1?'s':''}`:''}</span><div class="pb"><i style="width:${ms.length?wd/ms.length*100:0}%"></i></div></div></div>`};
function newFolderRow(box,p,done){
 box.innerHTML=`<div class="row"><input id="nn" class="grow" placeholder="${p?'Subfolder name':'Folder name'}"><button class="b" id="nk">Create</button></div>`;$('#nn',box).focus();
 $('#nk',box).onclick=async()=>{const v=cleanN($('#nn',box).value);if(!v)return;const np=p?p+SEP+v:v;if(cvFolders.includes(np))return toast('Folder already exists');await addF(np);done()}}
function cvFoldersView(box,btn){
 const top=kids('');box.innerHTML=`<div id="nr"></div><div class="grid" id="fg">${top.length?top.map(fcH).join(''):''}</div>${top.length?'':'<p class="mu">No folders yet. Tap + Folder to group a series, like a trilogy or franchise. Folders can hold subfolders.</p>'}`;
 $('#fg',box).onclick=e=>{const c=e.target.closest('.fc');if(c)cvFolderSheet(c.dataset.p)};
 btn.onclick=()=>newFolderRow($('#nr',box),'',()=>renderTab())}

function cvFolderSheet(n){
 sheet(el=>{
  const ms=cvMovies.filter(m=>m.folder==n).sort((a,b)=>(a.ord??1e6+(a.year||9999))-(b.ord??1e6+(b.year||9999))||(a.season||0)-(b.season||0)||(a.episode||0)-(b.episode||0)||a.added-b.added),sub=kids(n),pts=n.split(SEP);
  el.innerHTML=`<header class="hd"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><h2><span>${esc(base(n))}</span></h2><button class="b" id="am">${ic('plus',16)} Movie</button></header><div class="pad"><div class="bc">${pts.map((x,i)=>`<span>${esc(x)}</span>`).join('<span>›</span>')}</div><div class="row"><button class="b2" id="sf">${ic('folder',16)} Subfolder</button></div><div id="nr"></div>
  <div class="cvr">${cvCovers[n]?`<img src="${U(cvCovers[n])}" alt="">`:`<div class="cvp">${ic('folder',26)}</div>`}<div class="t"><b>Cover</b><span class="mu">${cvCovers[n]?'Custom':'Posters'}</span></div><button class="b2" id="cvb">${cvCovers[n]?'Change':'Choose image'}</button>${cvCovers[n]?'<button class="b2 dn" id="cvx">Remove</button>':''}<input type="file" id="cvf" accept="image/*" hidden></div>
  ${sub.length?`<h3>Subfolders</h3><div class="grid" id="sg">${sub.map(fcH).join('')}</div><h3>Movies</h3>`:''}
  ${ms.length>1?'<p class="mu">Release order by default. Use the arrows on a card to reorder.</p>':''}<div class="grid" id="gr">${ms.map((m,i)=>cardH(m,i).replace(/<\/div><\/div>$/,'</div><div class="mvb"><button data-mv="-1">‹</button><button data-mv="1">›</button></div></div>')).join('')||(sub.length?'':'<p class="mu">Empty folder. Tap + Movie, or choose this folder when editing a movie.</p>')}</div>
  <div class="row" style="margin-top:20px"><input id="rn" class="grow" value="${esc(base(n))}"><button class="b2" id="rb">Rename</button><button class="b2 dn" id="rd">Delete folder</button></div></div>`;
  $('[data-x]',el).onclick=()=>el.close();$('#am',el).onclick=()=>cvForm(null,n);
  $('#sf',el).onclick=()=>newFolderRow($('#nr',el),n,()=>el.refresh());
  $('#cvb',el).onclick=()=>$('#cvf',el).click();
  $('#cvf',el).onchange=async e=>{const f=e.target.files[0];if(!f)return;cvCovers[n]=await shrink(f);await saveC();el.refresh()};
  if($('#cvx',el))$('#cvx',el).onclick=async()=>{delete cvCovers[n];await saveC();el.refresh()};
  if($('#sg',el))$('#sg',el).onclick=e=>{const c=e.target.closest('.fc');if(c)cvFolderSheet(c.dataset.p)};
  $('#gr',el).addEventListener('click',async e=>{const b=e.target.closest('[data-mv]');if(!b)return;e.stopImmediatePropagation();const i=ms.findIndex(m=>m.id==b.closest('.card').dataset.id),j=i+ +b.dataset.mv;if(j<0||j>=ms.length)return;[ms[i],ms[j]]=[ms[j],ms[i]];for(let k=0;k<ms.length;k++)if(ms[k].ord!==k){ms[k].ord=k;await putMovie(ms[k])}el.refresh()},true);
  $('#gr',el).onclick=e=>{const c=e.target.closest('.card');if(c)cvDetail(c.dataset.id)};
  const remap=async(mp,mm=mp)=>{cvFolders=[...new Set(cvFolders.map(mp).filter(x=>x!=null))];await saveF();const nc={};for(const k in cvCovers){const r=mp(k);if(r!=null)nc[r]=cvCovers[k]}cvCovers=nc;await saveC();for(const m of cvMovies)if(m.folder){const r=mm(m.folder);if(r!==m.folder){m.folder=r||'';await putMovie(m)}}};
  $('#rb',el).onclick=async()=>{const v=cleanN($('#rn',el).value);if(!v||v==base(n))return;const np=par(n)?par(n)+SEP+v:v;if(cvFolders.includes(np))return toast('Name already used');
   await remap(x=>x==n?np:x.startsWith(n+SEP)?np+x.slice(n.length):x);el.close()};
  armBtn($('#rd',el),'Tap again (contents move up)',async()=>{const p=par(n),dm=x=>x.startsWith(n+SEP)?(p?p+SEP:'')+x.slice(n.length+1):x;await remap(x=>x==n?null:dm(x),x=>x==n?p:dm(x));el.close()})},
  ()=>{const t=topLayer();if(t&&t.refresh)t.refresh();else renderTab()})}

/* ----- movie detail ----- */
function cvDetail(id){
 sheet(el=>{
  const m=cvMovies.find(x=>x.id==id);if(!m){setTimeout(()=>el.close(),0);return}
  const pu=m.poster?U(m.poster):'',n=(m.cast||[]).length,sg=(m.songs||[]).length,w=()=>m.status=='watched',
   meta=()=>{const a=[m.year,rtS(m)?fmtRt(rtS(m)):'',w()?'Watched':'Watchlist'].filter(Boolean);return a.map((x,i)=>`<span class="nw">${esc(x)}${i<a.length-1?' •':''}</span>`).join(' ')},
   T=(i,k,l,on)=>`<button data-k="${k}" class="${on?'on':''}">${ic(i,26)}<span>${esc(l)}</span></button>`,
   tl=()=>T('heart','fv','Favorite',m.fav)+T(w()?'check':'bookmark','wt',w()?'Watched':'Watchlist',w())+T('star','rt',m.rating?m.rating+' / 5':'Rate',m.rating)+T('folder','fd',m.folder?base(m.folder):'No folder',m.folder);
  el.innerHTML=`<div class="dv"><div class="bdw"><div class="bdp" ${pu?`style="background-image:url('${pu}')"`:''}></div></div>
  <header class="hd tp" id="tp"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><h2><span>${esc(m.title)}</span></h2><button class="i" id="ed" aria-label="Edit">${ic('edit',22)}</button><button class="i" id="mo" aria-label="More">${ic('more',24)}</button></header>
  <div class="pad">
   <div class="dh">${pu?`<img class="pt" src="${pu}" alt="">`:`<div class="pt">${ic('logo',52)}</div>`}<div class="ti"><h1>${esc(m.title)}</h1>${m.director?`<p>${ic('user',18)}<span>${esc(m.director)}</span></p>`:''}${m.season||m.episode?`<p>${ic('film',18)}<span>${[m.season?'Season '+esc(m.season):'',m.episode?'Episode '+esc(m.episode):''].filter(Boolean).join(' • ')}</span></p>`:''}<p>${ic('clock',18)}<span id="mt">${meta()}</span></p></div></div>
   <div class="ac4" id="ac4">${tl()}</div>
   <div class="rb" id="rbx" hidden><div id="sr">${stars(m.rating||0)}</div></div>
   ${m.videoPath?`<div class="vth" id="vth">${m.vthumb?`<img src="${U(m.vthumb)}" alt="">`:`<div class="ph" data-p="${esc(m.videoPath)}" data-t="videos" style="aspect-ratio:16/9">${ic('video',40)}</div>`}<span class="pbtn">${ic('play',30,'fl')}</span></div><p class="mu" style="margin:6px 0 10px;overflow-wrap:anywhere">${ic('link',14)} ${esc(m.videoName||baseName(m.videoPath))}${byPath.size&&!byPath.has(m.videoPath)?' <span class="dn">(not found in the last scan)</span>':''}</p>`:'<div class="notice">No video linked. Tap the pencil, then “Link a video from FileVault”.</div>'}
   ${m.details?`<p class="ds" id="ds">${esc(m.details)}</p><button class="mr" id="mr" hidden aria-label="Expand">${ic('chev',22)}</button>`:''}
   ${(m.genres||[]).length?`<div class="chips">${m.genres.map(g=>`<span>${esc(g)}</span>`).join('')}</div>`:''}
   ${n?`<h3 class="sh">${n} cast member${n>1?'s':''}</h3>${m.cast.map(c=>`<div class="li"><div class="av">${esc((c.a.trim()[0]||'?').toUpperCase())}</div><div class="t"><b>${esc(c.a)}</b>${c.c?`<small>as ${esc(c.c)}</small>`:''}</div></div>`).join('')}`:''}
   ${sg?`<h3 class="sh">Soundtrack · ${sg} track${sg>1?'s':''}</h3><div class="pl">${m.songs.map((s,i)=>`<div class="li tk" data-i="${i}"><div class="t"><b>${esc(s.t)}</b><small>${s.path?'Track '+(i+1):'Not linked to a file'}</small></div>${ic('play',20)}</div>`).join('')}</div>`:''}
   ${m.review||m.watched?`<h3 class="sh">My notes</h3>${m.watched?`<p class="mu">Watched on ${esc(m.watched)}</p>`:''}${m.review?`<p style="white-space:pre-wrap">${esc(m.review)}</p>`:''}`:''}
  </div>
  ${m.videoPath?`<button class="fab" id="go">${ic('play',22,'fl')}<span id="gol">${resT(m)?'Resume · '+fmt(resT(m)):'Play'}</span></button>`:''}</div>`;
  $('[data-x]',el).onclick=()=>el.close();
  $('#ed',el).onclick=()=>cvForm(m);
  el.onscroll=()=>$('#tp',el).classList.toggle('sc',el.scrollTop>180);
  $('#mo',el).onclick=()=>popMenu([{label:'Delete movie',icon:'trash',cls:'dn',fn:()=>deleteModal('Delete “'+m.title+'”?',async()=>{await delMovie(m.id);await reloadMovies();el.close()})}]);
  const ref=()=>{$('#ac4',el).innerHTML=tl();$('#mt',el).innerHTML=meta()};
  $('#ac4',el).onclick=async e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.k;
   if(k=='rt'){$('#rbx',el).hidden=!$('#rbx',el).hidden;return}
   if(k=='fd')return m.folder?cvFolderSheet(m.folder):toast('Not in a folder. Tap Edit to add one');
   if(k=='fv')m.fav=!m.fav;else m.status=w()?'watchlist':'watched';
   await putMovie(m);ref()};
  $('#sr',el).onclick=async e=>{const s=+e.target.dataset.s;if(!s)return;m.rating=m.rating==s?0:s;await putMovie(m);$('#sr',el).innerHTML=stars(m.rating);ref()};
  const ds=$('#ds',el);if(ds){const mr=$('#mr',el);requestAnimationFrame(()=>{if(ds.scrollHeight>ds.clientHeight+2)mr.hidden=false});mr.onclick=()=>{ds.classList.toggle('ex');mr.classList.toggle('up')}}
  const play=()=>playVideo(m.videoPath,{title:m.title,sub:m.sub,next:(playingPath)=>{const current=cvMovies.find(x=>x.videoPath===playingPath)||m;const n=cvNextEpisode(current);return n?{path:n.videoPath,title:n.title}:null},episodes:(pp)=>cvEpisodeMenu(cvMovies.find(x=>x.videoPath===pp)||m),done:()=>{const f=$('#gol',el);if(f)f.textContent=resT(m)?'Resume · '+fmt(resT(m)):'Play'}});
  observeThumbs(el);const go=$('#go',el);if(go)go.onclick=play;const vt=$('#vth',el);if(vt)vt.onclick=play;
  if(m.videoPath&&!m.vthumb&&!vTried.has(m.id)){vTried.add(m.id);videoThumbBlob(m.videoPath).then(async b=>{if(!b)return;m.vthumb=b;if(!m.poster){m.poster=b;m.posterAuto=true}await putMovie(m);await reloadMovies();if(el.isConnected)el.refresh()})}
  const pl=$('.pl',el);if(pl)pl.onclick=e=>{const t=e.target.closest('.tk');if(!t)return;const i=+t.dataset.i;if(!m.songs[i].path)return toast('Link this song to a file first (Edit)');
   const list=[],map=[];m.songs.forEach((s,k)=>{if(s.path){map.push(k);list.push({path:s.path,name:s.t,parent:m.title,type:'music'})}});playQueue(list,map.indexOf(i),true)}},
  ()=>{const t=topLayer();if(t&&t.refresh)t.refresh();else renderTab()})}

/* ----- add / edit form ----- */
function cvForm(m,pf){
 const f=m?{...m,g:(m.genres||[]).join(', '),hh:Math.floor(rtS(m)/3600)||'',mm:Math.floor(rtS(m)%3600/60)||'',ss:rtS(m)%60||'',cast:(m.cast||[]).map(c=>({...c})),songs:(m.songs||[]).map(s=>({...s}))}:{id:uid(),title:'',year:'',season:'',episode:'',hh:'',mm:'',ss:'',g:'',details:'',status:'watchlist',fav:false,rating:0,review:'',watched:'',cast:[{a:'',c:''}],songs:[],folder:pf||'',added:Date.now(),videoPath:'',videoName:''};
 sheet(el=>{
  el.innerHTML=`<header class="hd"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><h2><span>${m?'Edit movie':'Add movie'}</span></h2><button class="b" id="sv">Save</button></header><div class="pad" id="fm">
 <input data-k="title" placeholder="Title" value="${esc(f.title)}">
 <div class="cr" style="grid-template-columns:1fr 2fr"><input data-k="year" type="number" placeholder="Year" value="${esc(f.year)}"><input data-k="g" placeholder="Genres (comma separated)" value="${esc(f.g)}"></div>
 <div class="cr" style="grid-template-columns:1fr 1fr"><input data-k="season" type="number" min="0" inputmode="numeric" placeholder="Season" value="${esc(f.season||'')}"><input data-k="episode" type="number" min="0" inputmode="numeric" placeholder="Episode" value="${esc(f.episode||'')}"></div>
 <input data-k="director" placeholder="Director" value="${esc(f.director||'')}">
 <span class="mu hint">Runtime (hh / mm / ss)</span><div class="cr" style="grid-template-columns:1fr 1fr 1fr"><input data-k="hh" type="number" min="0" inputmode="numeric" placeholder="HH" value="${esc(f.hh)}"><input data-k="mm" type="number" min="0" max="59" inputmode="numeric" placeholder="MM" value="${esc(f.mm)}"><input data-k="ss" type="number" min="0" max="59" inputmode="numeric" placeholder="SS" value="${esc(f.ss)}"></div>
 <textarea data-k="details" rows="4" placeholder="Details / synopsis">${esc(f.details)}</textarea>
 <div class="cr" style="grid-template-columns:1fr 1fr"><select data-k="status"><option value="watchlist" ${f.status=='watchlist'?'selected':''}>Watchlist</option><option value="watched" ${f.status=='watched'?'selected':''}>Watched</option></select><input data-k="watched" type="date" value="${esc(f.watched)}"></div>
 <select data-k="folder"><option value="">No folder</option>${sortF().map(n=>`<option value="${esc(n)}" ${f.folder==n?'selected':''}>${esc('\u00a0\u00a0'.repeat(n.split(SEP).length-1)+base(n))}</option>`).join('')}</select><input id="nfd" placeholder="New folder (use / for subfolders, e.g. Marvel/Phase 1)">
 <button type="button" class="b2 fvt ${f.fav?'on':''}" id="fav" aria-pressed="${!!f.fav}">${ic('heart',22)}<span>Favorite</span></button>
 <div id="sr">${stars(f.rating)}</div>
 <h3>Movie file</h3><div class="vth" id="vth" hidden><img id="vti" alt="" hidden><div class="ph" id="vtp" style="aspect-ratio:16/9">${ic('video',40)}</div><span class="pbtn">${ic('play',30,'fl')}</span></div><p class="mu" id="vn"></p><div class="row"><button class="b2 grow" id="vl">${ic('link',16)} Link a video from FileVault</button><button class="b2 dn" id="vx">Unlink</button></div>
 <p class="mu">Only the location is saved, so the movie is never copied and uses no extra storage.</p>
 <h3>Poster</h3><img class="heroimg" id="pv" ${f.poster?`src="${U(f.poster)}"`:'hidden'} alt=""><div class="row"><button class="b2 grow" id="pp">${ic('image',16)} Pick from FileVault photos</button></div><input type="file" id="pf" accept="image/*"><p class="mu">Posters are shrunk to a small image before saving.</p>
 <h3>Cast</h3><div id="cast"></div><button class="b2" id="ac">+ Add actor</button>
 <h3>My review</h3><textarea data-k="review" rows="3" placeholder="Personal notes">${esc(f.review)}</textarea>
 <h3>Soundtrack / OST</h3><div id="songs"></div><button class="b2" id="sl">${ic('music',16)} Link songs from FileVault</button>
 <h3>Subtitles</h3><p class="mu" id="sn">${f.sub?'✓ Subtitle attached':'None (.srt or .vtt, a few KB)'}</p><input type="file" id="sbf" accept=".srt,.vtt"><div style="height:40px"></div></div>`;
  const rows=()=>{
   $('#cast',el).innerHTML=f.cast.map((c,i)=>`<div class="cr"><input data-cf="a" data-i="${i}" placeholder="Actor" value="${esc(c.a)}"><input data-cf="c" data-i="${i}" placeholder="Character" value="${esc(c.c)}"><button class="i dn" data-rc="${i}">✕</button></div>`).join('');
   $('#songs',el).innerHTML=f.songs.map((s,i)=>`<div class="sr"><input data-st="${i}" value="${esc(s.t)}"><button class="i dn" data-rs="${i}">✕</button></div><div class="mu" style="margin:0 0 8px">${s.path?'✓ '+esc(baseName(s.path)):`<a data-ls="${i}" style="color:var(--ac)">Not linked. Tap to link a file</a>`}</div>`).join('')||'<p class="mu">No songs added.</p>'};
  const vlabel=()=>{$('#vn',el).textContent=f.videoPath?'✓ '+(f.videoName||baseName(f.videoPath)):'No video linked';$('#vx',el).hidden=!f.videoPath};
  const vthumbUi=()=>{$('#vth',el).hidden=!f.videoPath;const has=!!f.vthumb;$('#vti',el).hidden=!has;$('#vtp',el).hidden=has;if(has)$('#vti',el).src=U(f.vthumb)};
  const setPoster=b=>{f.poster=b;const pv=$('#pv',el);if(b){pv.src=U(b);pv.hidden=false}else pv.hidden=true};
  const setVideo=async p=>{f.videoPath=p;f.videoName=byPath.get(p)?.name||baseName(p);f.vthumb=null;vlabel();vthumbUi();
   const t=await videoThumbBlob(p);if(t&&f.videoPath===p){f.vthumb=t;if(!f.poster||f.posterAuto){f.posterAuto=true;setPoster(t)}vthumbUi()}};
  rows();vlabel();vthumbUi();if(f.videoPath&&!f.vthumb)f._tp=videoThumbBlob(f.videoPath).then(t=>{if(t&&!f.vthumb){f.vthumb=t;if(!f.poster){f.posterAuto=true;setPoster(t)}vthumbUi()}});const fm=$('#fm',el);
  fm.oninput=e=>{const d=e.target.dataset;if(d.k)f[d.k]=e.target.value;if(d.cf)f.cast[d.i][d.cf]=e.target.value;if(d.st)f.songs[d.st].t=e.target.value};
  fm.onclick=e=>{const d=e.target.dataset,n=+d.s;
   if(n){f.rating=f.rating==n?0:n;$('#sr',el).innerHTML=stars(f.rating)}
   if(d.rc!==undefined){f.cast.splice(d.rc,1);rows()}if(d.rs!==undefined){f.songs.splice(d.rs,1);rows()}
   if(d.ls!==undefined)pickFiles({title:'Link song',types:['music'],multi:false,onDone:([p])=>{f.songs[+d.ls].path=p;rows()}})};
  $('#fav',el).onclick=e=>{f.fav=!f.fav;e.currentTarget.classList.toggle('on',f.fav);e.currentTarget.setAttribute('aria-pressed',f.fav)};
  $('#ac',el).onclick=()=>{f.cast.push({a:'',c:''});rows()};
  $('#pf',el).onchange=async e=>{const b=e.target.files[0];if(!b)return;f.posterAuto=false;setPoster(await shrink(b))};
  $('#pp',el).onclick=()=>pickFiles({title:'Choose poster',types:['photos'],multi:false,onDone:async([p])=>{try{const b=await shrink(await blobFromPath(p));f.posterAuto=false;setPoster(b)}catch(e){toast('Could not read that photo')}}});
  $('#vl',el).onclick=()=>pickFiles({title:'Link a video',types:['videos'],multi:false,onDone:([p])=>{const nm=byPath.get(p)?.name||baseName(p);if(!f.title.trim()){f.title=nm.replace(/\.[^.]+$/,'').replace(/[._]+/g,' ').trim();$('[data-k=title]',el).value=f.title}f._tp=setVideo(p)}});
  $('#vx',el).onclick=()=>{f.videoPath='';f.videoName='';f.vthumb=null;if(f.posterAuto){f.posterAuto=false;setPoster(null)}vlabel();vthumbUi()};
  $('#sl',el).onclick=()=>pickFiles({title:'Link songs',types:['music'],label:'Link',onDone:ps=>{ps.forEach(p=>f.songs.push({t:trackTitle(byPath.get(p)||{name:baseName(p)}),path:p}));rows()}});
  $('#sbf',el).onchange=async e=>{const b=e.target.files[0];if(!b)return;let t=await b.text();if(!/^\uFEFF?WEBVTT/.test(t))t='WEBVTT\n\n'+t.replace(/\r/g,'').replace(/(\d\d:\d\d:\d\d),(\d{3})/g,'$1.$2');f.sub=new Blob([t],{type:'text/vtt'});$('#sn',el).textContent='✓ '+b.name};
  $('[data-x]',el).onclick=()=>el.close();
  $('#sv',el).onclick=async()=>{if(!f.title.trim())return toast('Please enter a title');if(f._tp){toast('Making thumbnail…');try{await f._tp}catch(e){}}
   const nn=$('#nfd',el).value.trim();if(nn){const pp=nn.split(SEP).map(x=>x.trim()).filter(Boolean).join(SEP);if(pp){f.folder=pp;await addF(pp)}}
   const{g,hh,mm,ss,_tp,...r}=f;r.title=f.title.trim();r.year=+f.year||'';r.season=+f.season||'';r.episode=+f.episode||'';const tot=(+hh||0)*3600+(+mm||0)*60+(+ss||0);r.rtSec=tot||'';r.runtime=tot?Math.round(tot/60):'';r.genres=g.split(',').map(x=>x.trim()).filter(Boolean);r.cast=f.cast.filter(c=>c.a.trim());r.songs=f.songs.filter(s=>s.t.trim());
   try{await putMovie(r)}catch(e){return toast('Could not save (storage full?)')}
   await reloadMovies();el.close();toast('Saved')}},
  ()=>{const t=topLayer();if(t&&t.refresh)t.refresh();else renderTab()})}

/* ----- backup helpers (used by Settings) ----- */
async function cineExport(){
 const out=[];for(const m of cvMovies){const{sub,...r}=m;r.poster=m.poster?await b2d(m.poster):null;r.vthumb=m.vthumb?await b2d(m.vthumb):null;r.sub=sub?await sub.text():null;out.push(r)}
 const cv={};for(const k in cvCovers)cv[k]=await b2d(cvCovers[k]);return{folders:cvFolders,covers:cv,movies:out}}
async function cineImport(j,fromOldApp){
 let n=0;(j.folders||[]).forEach(x=>{if(!cvFolders.includes(x))cvFolders.push(x)});
 for(const k in(j.covers||{}))cvCovers[k]=d2b(j.covers[k]);await saveC();
 for(const r of(j.movies||[])){
  r.poster=r.poster?d2b(r.poster):null;r.vthumb=r.vthumb?d2b(r.vthumb):null;
  if(typeof r.sub==='string')r.sub=new Blob([r.sub],{type:'text/vtt'});else delete r.sub;
  /* songs from the old CineVault app were stored inside the backup; keep only the titles so they can be linked to real files */
  r.songs=(r.songs||[]).map(s=>({t:s.t,path:s.path||null}));
  if(r.folder&&!cvFolders.includes(r.folder))cvFolders.push(r.folder);
  const old=cvMovies.find(x=>x.id==r.id);if(old){if(old.videoPath&&!r.videoPath){r.videoPath=old.videoPath;r.videoName=old.videoName}if(old.sub&&!r.sub)r.sub=old.sub}
  await putMovie(r);n++}
 ensureAnc();await saveF();await reloadMovies();return n}
