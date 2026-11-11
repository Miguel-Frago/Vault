/* ===== App shell: bottom navigation and start-up ===== */
let curTab='lib';window.appBooted=false;
const NAV=[['lib','Library','grid'],['albums','Albums','album'],['cine','CineVault','film'],['reader','Reader','book'],['set','Settings','sliders']];
function renderTab(){
 const root=$('#page');
 ({lib:renderLibrary,albums:renderAlbums,cine:renderCine,reader:renderReader,set:renderSettings})[curTab](root);
 $$('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.t===curTab))}
function go(t){curTab=t;sel.clear();renderSelbar();scrollTo(0,0);renderTab()}
function bootApp(){
 window.appBooted=true;$('#app').hidden=false;
 $('#nav').innerHTML=NAV.map(([k,n,i])=>`<button data-t="${k}">${ic(i,22)}<span>${n}</span></button>`).join('');
 $('#nav').onclick=e=>{const b=e.target.closest('[data-t]');if(b)go(b.dataset.t)};
 renderTab();updMini();renderSelbar()}
(async()=>{
 try{await openDB();await loadState()}catch(e){console.error(e)}
 try{navigator.storage?.persist?.()}catch(e){}
 showLock()})();

/* ===== Back-to-top button: shows after scrolling down a long list (page, sheets and dialogs) ===== */
(()=>{
 const b=document.createElement('button');b.className='totop';b.hidden=true;b.setAttribute('aria-label','Back to top');b.innerHTML=ic('up',22);document.body.append(b);
 let tgt='win';
 const pick=t=>t===document||t===document.documentElement||t===document.body||t===window?'win':(t.classList&&(t.classList.contains('sheet')||t.classList.contains('mb'))?t:null);
 const place=()=>{const m=$('#mini');b.style.bottom=`calc(${m&&!m.hidden?150:84}px + env(safe-area-inset-bottom,0px))`};
 addEventListener('scroll',e=>{const s=pick(e.target);if(!s)return;tgt=s;place();b.hidden=(s==='win'?(window.scrollY||document.documentElement.scrollTop):s.scrollTop)<600},true);
 b.onclick=()=>{(tgt==='win'||!tgt.isConnected?window:tgt).scrollTo({top:0,behavior:'smooth'})};
 setInterval(()=>{if(tgt!=='win'&&!tgt.isConnected){tgt='win';b.hidden=(window.scrollY||0)<600}},700);
})();
