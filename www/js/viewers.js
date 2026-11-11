/* ===== Viewers: photos, PDF, text, and the dispatcher that opens any file ===== */
const IMG_EXT=new Set(['jpg','jpeg','png','gif','webp','bmp','heic','heif','avif']);
const TXT_EXT=new Set(['txt','md','csv','tsv','json','log','xml','html','htm','js','css','py','java','kt','sh','yml','yaml','ini','srt','vtt','lrc','c','cpp','h']);

async function openFile(path,ctx){
 const f=byPath.get(path);if(!f)return toast('File not found. Scan again to refresh your library.');
 if(!native)return toast('Open this file from the installed Android app.');
 const ext=f.extension||'';
 try{
  if(f.type==='videos')return playVideo(path,{title:f.name});
  if(f.type==='photos'&&IMG_EXT.has(ext)){const l=(ctx||[f]).filter(x=>x.type==='photos'&&IMG_EXT.has(x.extension));const i=l.findIndex(x=>x.path===path);return photoViewer(l.length&&i>=0?l:[f],Math.max(0,i))}
  if(f.type==='music'){const l=(ctx||[f]).filter(x=>x.type==='music'),i=l.findIndex(x=>x.path===path);return playQueue(l.length&&i>=0?l:[f],Math.max(0,i),true)}
  if(ext==='cbz'||ext==='cbr'||ext==='epub')return openReader(path);
  if(ext==='pdf')return viewerSheet(f,pdfFill);
  if(TXT_EXT.has(ext))return viewerSheet(f,textFill);
  await FV.openFile({path});
 }catch(e){toast(e.message||'Could not open this file.')}}

/* header: the title shrinks with “…” so the action buttons can never be pushed off screen */
function viewerSheet(f,fill){
 return sheet(el=>{
  el.innerHTML=`<header class="hd"><button class="i" data-x aria-label="Back">${ic('back',24)}</button><h2><span>${esc(f.name)}</span></h2><button class="i" data-w aria-label="Open with another app">${ic('link',22)}</button><button class="i" data-s aria-label="Share">${ic('share',22)}</button></header><div class="pad" id="vb"></div>`;
  $('[data-x]',el).onclick=()=>el.close();
  $('[data-w]',el).onclick=()=>FV.openFile({path:f.path}).catch(e=>toast(e.message||'No app can open this file.'));
  $('[data-s]',el).onclick=()=>share([f.path]);
  fill($('#vb',el),f).catch(e=>{$('#vb',el).innerHTML=`<div class="empty">${esc(e.message||'Preview unavailable.')}<br><br><button class="b" id="ow">Open with another app</button></div>`;$('#ow',el).onclick=()=>FV.openFile({path:f.path}).catch(()=>{})})})}

async function pdfFill(body,f){
 let start=0,total=0,zoom=1;
 body.innerHTML=`<div class="zbar"><button class="b2" id="zo" aria-label="Zoom out">−</button><button class="b2" id="zr">100%</button><button class="b2" id="zi" aria-label="Zoom in">＋</button></div><div style="overflow-x:auto"><div id="pi" style="width:100%"></div></div><button class="b2 more" id="pm" hidden></button>`;
 const pi=$('#pi',body),pm=$('#pm',body),setZ=()=>{pi.style.width=Math.round(zoom*100)+'%';$('#zr',body).textContent=Math.round(zoom*100)+'%'};
 $('#zi',body).onclick=()=>{zoom=Math.min(4,zoom+.25);setZ()};$('#zo',body).onclick=()=>{zoom=Math.max(.5,zoom-.25);setZ()};$('#zr',body).onclick=()=>{zoom=1;setZ()};
 const more=async()=>{pm.disabled=true;const r=await FV.previewPdf({path:f.path,start,count:6});total=r.totalPages||0;
  pi.insertAdjacentHTML('beforeend',(r.pages||[]).map((p,i)=>`<div class="mu" style="margin:10px 0 4px">Page ${start+i+1} / ${total}</div><img class="pdfp" alt="Page ${start+i+1}" src="data:image/png;base64,${p}">`).join(''));
  start+=(r.pages||[]).length;pm.disabled=false;pm.hidden=start>=total;pm.textContent=`Load more pages (${total-start} left)`};
 pm.onclick=()=>more().catch(e=>toast(e.message));await more()}

async function textFill(body,f){
 body.innerHTML='<p class="mu">Loading…</p>';let t='',note='';
 try{const r=await fetch(fileUrl(f.path),{headers:{Range:'bytes=0-2097151'}});t=(await r.text()).slice(0,2000000);if(f.size>2097152)note='Showing the first 2 MB. Use “Open with” (top right) for the whole file.'}
 catch(e){const d=await FV.readFile({path:f.path});t=d.text??new TextDecoder().decode(Uint8Array.from(atob(d.base64),c=>c.charCodeAt(0)))}
 if(f.extension==='json'&&!note){try{t=JSON.stringify(JSON.parse(t),null,2)}catch(e){}}
 body.innerHTML=(note?`<div class="notice">${esc(note)}</div>`:'')+'<pre class="doc" style="margin:0"></pre>';$('pre',body).textContent=t||'(empty file)'}

/* ===== photo viewer: swipe, pinch / double-tap zoom, slideshow ===== */
function photoViewer(list,start){
 let i=start,sc=1,tx=0,ty=0,slide=0;
 const el=document.createElement('div');el.className='pv';
 el.innerHTML=`<div class="pv-stage" id="pvs"><img id="pvi" alt=""></div>
 <div class="pv-top" id="pvt"><button class="vi" id="pvx" aria-label="Back">${ic('back',24)}</button><div class="pv-title" id="pvn"></div><span class="pv-n" id="pvc"></span><button class="vi" id="pvsl" aria-label="Slideshow">${ic('play',22,'fl')}</button><button class="vi" id="pvfs" aria-label="Full screen">${ic('expand',22)}</button><button class="vi" id="pvsh" aria-label="Share">${ic('share',22)}</button></div>
 <div class="pv-err" id="pve" hidden><div>This image format can’t be shown inside FileVault.</div><div><button class="b" id="pvo">Open with another app</button></div></div>`;
 const stage=$('#pvs',el),img=$('#pvi',el),top=$('#pvt',el),err=$('#pve',el);
 const apply=()=>{img.style.transform=`translate(${tx}px,${ty}px) scale(${sc})`};
 const reset=()=>{sc=1;tx=ty=0;apply()};
 const show=()=>{const f=list[i];reset();err.hidden=true;img.hidden=false;img.src=fileUrl(f.path);$('#pvn',el).textContent=f.name;$('#pvc',el).textContent=`${i+1} / ${list.length}`};
 const go=(d,wrap)=>{const n=list.length;let j=i+d;if(j<0||j>=n){if(!wrap){reset();return}j=(j+n)%n}i=j;show()};
 img.onerror=()=>{img.hidden=true;err.hidden=false};
 $('#pvo',el).onclick=()=>FV.openFile({path:list[i].path}).catch(e=>toast(e.message));
 const stopSlide=()=>{if(slide){clearInterval(slide);slide=0}$('#pvsl',el).innerHTML=ic('play',22,'fl')};
 $('#pvsl',el).onclick=()=>{if(slide)return stopSlide();if(list.length<2)return toast('Only one photo in this list');slide=setInterval(()=>go(1,true),3500);$('#pvsl',el).innerHTML=ic('pause',22,'fl');top.classList.add('h')};
 $('#pvfs',el).onclick=()=>top.classList.toggle('h');
 $('#pvsh',el).onclick=()=>share([list[i].path]);
 $('#pvx',el).onclick=()=>closeEl(el);
 /* gestures */
 const pts=new Map();let d0=1,s0=1,x0=0,y0=0,tx0=0,ty0=0,moved=false,lastTap=0,tapT=0;
 stage.onpointerdown=e=>{stage.setPointerCapture(e.pointerId);pts.set(e.pointerId,[e.clientX,e.clientY]);
  if(pts.size===2){const[a,b]=[...pts.values()];d0=Math.hypot(a[0]-b[0],a[1]-b[1])||1;s0=sc;moved=true}
  else if(pts.size===1){x0=e.clientX;y0=e.clientY;tx0=tx;ty0=ty;moved=false}};
 stage.onpointermove=e=>{if(!pts.has(e.pointerId))return;pts.set(e.pointerId,[e.clientX,e.clientY]);
  if(pts.size===2){const[a,b]=[...pts.values()];sc=clamp(s0*Math.hypot(a[0]-b[0],a[1]-b[1])/d0,1,6);apply()}
  else if(pts.size===1){const dx=e.clientX-x0,dy=e.clientY-y0;if(Math.abs(dx)+Math.abs(dy)>10)moved=true;
   if(sc>1.02){tx=tx0+dx;ty=ty0+dy;apply()}else if(moved){img.style.transform=`translate(${dx}px,0)`}}};
 const end=e=>{if(!pts.has(e.pointerId))return;const was=pts.size;pts.delete(e.pointerId);
  if(was===2){if(sc<1.05)reset();const r=[...pts.values()][0];if(r){x0=r[0];y0=r[1];tx0=tx;ty0=ty}return}
  const dx=e.clientX-x0;
  if(!moved){const now=Date.now();
   if(now-lastTap<300){clearTimeout(tapT);lastTap=0;if(sc>1.05)reset();else{sc=2.5;tx=ty=0;apply()}}
   else{lastTap=now;tapT=setTimeout(()=>top.classList.toggle('h'),300)}}
  else if(sc<=1.02){if(Math.abs(dx)>70){stopSlide();go(dx<0?1:-1)}else reset()}};
 stage.onpointerup=stage.onpointercancel=end;
 show();pushLayer(el,stopSlide)}
