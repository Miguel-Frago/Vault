/* ===== Shows: group videos into Show > Season > Episode from file and folder names ===== */
const JUNK=/[\s._\-\[(]*(480p|576p|720p|1080p|2160p|4k|x264|x265|h\.?264|h\.?265|hevc|web[ ._-]?dl|webrip|bluray|brrip|bdrip|hdtv|dvdrip|aac|ac3|amzn|nf|proper|repack)\b.*$/i;
const cleanShow=s=>String(s||'').replace(/[._]+/g,' ').replace(JUNK,'').replace(/\[[^\]]*\]|\([^)]*\)/g,' ').replace(/^[\s\-–]+|[\s\-–]+$/g,'').replace(/\s+/g,' ').trim();
const seasonDir=d=>{const m=String(d||'').match(/^(?:season|series|saison|temporada|s)[\s._-]*(\d{1,2})$/i);return m?+m[1]:null};
const p2=n=>String(n).padStart(2,'0');

/* understands Show.Name.S01E03, Show 1x03, Season 1 Episode 3, Show Ep 05, and Show/Season 2/05.mkv */
function parseEp(f){
 const base=f.name.replace(/\.[^.]+$/,''),dirs=f.path.split('/');dirs.pop();
 const dir=dirs[dirs.length-1]||'',up=dirs[dirs.length-2]||'',sd=seasonDir(dir);
 let m,show='',season=null,ep=null;
 if(m=base.match(/^(.*?)[\s._\-\[(]*\bS(\d{1,2})[\s._-]*E(\d{1,3})/i)){show=m[1];season=+m[2];ep=+m[3]}
 else if(m=base.match(/^(.*?)[\s._\-\[(]*(?<!\d)(\d{1,2})x(\d{2,3})(?!\d)/i)){show=m[1];season=+m[2];ep=+m[3]}
 else if(m=base.match(/^(.*?)[\s._\-\[(]*\bseason[\s._-]*(\d{1,2})[\s._-]*(?:episode|ep)[\s._-]*(\d{1,3})/i)){show=m[1];season=+m[2];ep=+m[3]}
 else if(m=base.match(/^(.*?)[\s._\-\[(]*\b(?:episode|ep)[\s._-]*(\d{1,3})(?!\d)/i)){show=m[1];season=sd;ep=+m[2]}
 else if(sd!=null&&(m=base.match(/^\D*?(\d{1,3})(?!\d)/))){ep=+m[1];season=sd}
 if(ep==null)return null;
 let name=cleanShow(show);if(!name)name=cleanShow(sd!=null?up:dir);if(!name)return null;
 return{show:name,season:season??sd??1,episode:ep}}

function buildShows(){
 if(showsCache)return showsCache;
 const map=new Map(),epOf=new Map();
 for(const f of files){
  if(f.type!=='videos')continue;const o=epOver[f.path];if(o&&o.movie)continue;
  let p=parseEp(f);if(o&&(o.show||o.season!=null||o.episode!=null)){p=p||{show:'',season:1,episode:0};if(o.show)p.show=o.show;if(o.season!=null)p.season=o.season;if(o.episode!=null)p.episode=o.episode}
  if(!p||!p.show)continue;
  const key=p.show.toLowerCase().replace(/[^a-z0-9]+/g,'')||p.show;
  let sh=map.get(key);if(!sh){sh={key,name:p.show,eps:[]};map.set(key,sh)}
  const e={f,show:p.show,season:p.season,episode:p.episode,key};sh.eps.push(e);epOf.set(f.path,e)}
 const shows=[...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
 shows.forEach(s=>s.eps.sort((a,b)=>a.season-b.season||a.episode-b.episode||a.f.name.localeCompare(b.f.name)));
 return showsCache={shows,epOf}}
const isEpisode=p=>buildShows().epOf.has(p);
const epLabel=e=>`S${p2(e.season)}E${p2(e.episode)}`,epTitle=e=>`${e.show} · ${epLabel(e)}`;
const resumable=p=>resOK(pos[p]);
function nextEp(path){const{epOf,shows}=buildShows(),e=epOf.get(path);if(!e)return null;const sh=shows.find(s=>s.key===e.key);return sh?sh.eps[sh.eps.indexOf(e)+1]||null:null}
function continueEp(sh){
 const part=sh.eps.filter(e=>resumable(e.f.path)).sort((a,b)=>pos[b.f.path].at-pos[a.f.path].at)[0];if(part)return part;
 let last=-1;sh.eps.forEach((e,i)=>{if(seen.has(e.f.path))last=i});
 return sh.eps.slice(last+1).find(e=>!seen.has(e.f.path))||sh.eps.find(e=>!seen.has(e.f.path))||sh.eps[0]}

function playEpisode(path){
 const e=buildShows().epOf.get(path);
 playVideo(path,{title:e?epTitle(e):undefined,
  next:cur=>{const n=nextEp(cur);return n?{path:n.f.path,title:epTitle(n)}:null},
  done:()=>{const t=topLayer();if(t&&t.refresh)t.refresh()}})}

/* ----- list of shows (Library > Shows) ----- */
function showsListHtml(q){
 const ql=(q||'').trim().toLowerCase(),list=buildShows().shows.filter(s=>!ql||s.name.toLowerCase().includes(ql));
 if(!list.length)return `<div class="empty">${files.length?'No shows found. Videos named like Show.Name.S01E03, 1x03, or kept in Show/Season 2/ folders are grouped here. Everything else is under Movies.':'Scan your phone first to find your videos.'}</div>`;
 return list.map(s=>{const done=s.eps.filter(e=>seen.has(e.f.path)).length,ns=new Set(s.eps.map(e=>e.season)).size;
  return `<div class="pl2" data-show="${esc(s.key)}"><div class="fth" data-p="${esc(s.eps[0].f.path)}" data-t="videos">${ic('video',22)}</div><div class="t"><b>${esc(s.name)}</b><span class="mu">${ns} season${ns>1?'s':''} · ${s.eps.length} episode${s.eps.length>1?'s':''} · ${done} watched</span><div class="pb"><i style="width:${done/s.eps.length*100}%"></i></div></div>${ic('chev',20)}</div>`}).join('')}

/* ----- one show ----- */
function showSheet(key){
 let season=null;
 sheet(el=>{
  const sh=buildShows().shows.find(s=>s.key===key);if(!sh){setTimeout(()=>el.close(),0);return}
  const seasons=[...new Set(sh.eps.map(e=>e.season))].sort((a,b)=>a-b),cont=continueEp(sh);
  if(season==null||!seasons.includes(season))season=cont?cont.season:seasons[0];
  const list=sh.eps.filter(e=>e.season===season),done=sh.eps.filter(e=>seen.has(e.f.path)).length;
  const row=e=>{const p=e.f.path,r=resumable(p)?pos[p]:null;
   return `<div class="pl2 ep" data-p="${esc(p)}"><div class="fth" data-p="${esc(p)}" data-t="videos">${ic('video',22)}</div><div class="t"><b>${epLabel(e)} · ${esc(e.f.name)}</b><span class="mu">${seen.has(p)?'✓ Watched · ':''}${bytes(e.f.size)}${r?' · '+fmt(r.t)+' / '+fmt(r.d):''}</span>${r?`<div class="pb"><i style="width:${Math.min(100,r.t/(r.d||1)*100)}%"></i></div>`:''}</div><button class="i em" aria-label="Episode options">${ic('more',22)}</button></div>`};
  el.innerHTML=`<header class="hd"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><h2><span>${esc(sh.name)}</span></h2><button class="i" data-m aria-label="More">${ic('more',24)}</button></header>
  <div class="pad"><p class="mu">${seasons.length} season${seasons.length>1?'s':''} · ${sh.eps.length} episodes · ${done} watched</p>
  ${cont?`<button class="b" id="cn" style="width:100%;margin-bottom:10px">${ic('play',18,'fl')} ${resumable(cont.f.path)?'Resume':done?'Continue':'Start'} · ${epLabel(cont)}</button>`:''}
  <div class="tabs" id="sn">${seasons.map(n=>`<button data-s="${n}" class="${n===season?'on':''}">Season ${n}</button>`).join('')}</div>
  <div id="eps">${list.map(row).join('')}</div></div>`;
  $('[data-x]',el).onclick=()=>el.close();
  if($('#cn',el))$('#cn',el).onclick=()=>playEpisode(cont.f.path);
  $('#sn',el).onclick=e=>{const b=e.target.closest('[data-s]');if(b){season=+b.dataset.s;el.refresh()}};
  $('[data-m]',el).onclick=()=>popMenu([
   {label:'Rename show',icon:'edit',fn:()=>renameModal('Rename show',sh.name,async n=>{sh.eps.forEach(e=>{epOver[e.f.path]={...(epOver[e.f.path]||{}),show:n}});await saveOver();el.close()})},
   {label:'Mark all watched',icon:'check',fn:async()=>{sh.eps.forEach(e=>{seen.add(e.f.path);delete pos[e.f.path]});await saveSeen();await savePos(true);el.refresh()}},
   {label:'Mark all not watched',icon:'close',fn:async()=>{sh.eps.forEach(e=>seen.delete(e.f.path));await saveSeen();el.refresh()}}]);
  $('#eps',el).onclick=e=>{const r=e.target.closest('.ep');if(!r)return;const p=r.dataset.p,ep=buildShows().epOf.get(p);
   if(e.target.closest('.em'))return popMenu([
    {label:seen.has(p)?'Mark as not watched':'Mark as watched',icon:'check',fn:async()=>{if(seen.has(p))seen.delete(p);else{seen.add(p);delete pos[p]}await saveSeen();await savePos(true);el.refresh()}},
    {label:'Edit show, season or episode',icon:'edit',fn:()=>editEpisode(ep,()=>el.close())}]);
   playEpisode(p)};
  observeThumbs(el)},()=>{if(curTab==='lib')renderTab()})}

/* ----- correct a show name, season or episode by hand ----- */
function editEpisode(e,done){
 const m=modal('Episode details',`<p class="mu" style="overflow-wrap:anywhere">${esc(e.f.name)}</p><label>Show name</label><input id="es" value="${esc(e.show)}">
  <div class="cr" style="grid-template-columns:1fr 1fr"><div><label>Season</label><input id="en" type="number" min="0" inputmode="numeric" value="${esc(e.season)}"></div><div><label>Episode</label><input id="ee" type="number" min="0" inputmode="numeric" value="${esc(e.episode)}"></div></div>
  <div class="row"><button class="b grow" id="esv">Save</button></div>
  <div class="row"><button class="b2 grow" id="emv">This is a movie</button><button class="b2 grow" id="ers">Back to automatic</button></div>`);
 const fin=async()=>{await saveOver();m.close();done&&done()};
 $('#esv',m.body).onclick=()=>{const show=$('#es',m.body).value.trim(),s=$('#en',m.body).value,n=$('#ee',m.body).value;
  if(!show||s===''||n==='')return toast('Fill in show, season and episode.');
  epOver[e.f.path]={show,season:+s,episode:+n};fin()};
 $('#emv',m.body).onclick=()=>{epOver[e.f.path]={movie:true};fin()};
 $('#ers',m.body).onclick=()=>{delete epOver[e.f.path];fin()}}
