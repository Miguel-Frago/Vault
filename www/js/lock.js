/* ===== App lock (same pattern lock as CineVault) ===== */
let unl=false,hid=0,AC;
const NOTES=[262,294,330,392,440,523,587,659,784];
function snd(f,d=.2,t='sine',v=.12,at=0){try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();if(AC.state=='suspended')AC.resume();const o=AC.createOscillator(),g=AC.createGain(),n=AC.currentTime+at;o.type=t;o.frequency.value=f;g.gain.setValueAtTime(v,n);g.gain.exponentialRampToValueAtTime(.001,n+d);o.connect(g).connect(AC.destination);o.start(n);o.stop(n+d)}catch(e){}}

function hideLock(){const el=$('#lockscr');el.innerHTML='';el.hidden=true}
function unlockDone(){unl=true;hideLock();if(!window.appBooted)bootApp()}

/* mode: undefined = normal unlock (or first-time setup), 'set' = change pattern, 'reset' = forgot pattern */
async function showLock(mode){
 const el=$('#lockscr');el.hidden=false;
 try{pauseVideo()}catch(e){}
 if(!mode)unl=false;
 const h=mode?null:await getS('pat'),hl=await getS('hl'),rec=await getS('rec');let first=null;
 el.innerHTML=`<div class="lock"><div class="lg">${ic('logo',76)}</div><h1>FileVault</h1><p class="mu" id="msg">${h?'Draw your pattern to unlock':'Create a lock pattern (connect at least 4 tiles)'}</p><div class="pg" id="pg">${'<i class="dt"></i>'.repeat(9)}<svg id="pl"></svg></div>${mode?'<button class="b2" id="cn">Cancel</button>':h&&rec?'<button class="b2" id="fg">Forgot pattern?</button>':''}</div>`;
 if(mode)$('#cn').onclick=()=>mode=='set'?hideLock():showLock();
 if($('#fg'))$('#fg').onclick=()=>{$('#fg').outerHTML='<div class="row"><input id="rw" placeholder="Recovery word" class="grow"><button class="b" id="rk">Reset</button></div>';$('#rk').onclick=async()=>{if(await sha('r:'+$('#rw').value.trim().toLowerCase())==rec)showLock('reset');else{toast('Wrong recovery word');fb(0)}}};
 const pg=$('#pg'),dots=[...pg.children].slice(0,9),pl=$('#pl');let seq=[],on=0;
 const dpos=d=>{const r=pg.getBoundingClientRect(),b=d.getBoundingClientRect();return[b.left+b.width/2-r.left,b.top+b.height/2-r.top]};
 const line=(x,y)=>{if(hl)return;pl.innerHTML=`<polyline points="${seq.map(i=>dpos(dots[i]).join(',')).concat(x==null?[]:[x+','+y]).join(' ')}"/>`};
 const hit=e=>{const r=pg.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;dots.forEach((d,i)=>{if(seq.includes(i))return;const[cx,cy]=dpos(d);if(Math.hypot(cx-x,cy-y)<36){seq.push(i);d.classList.add('on');snd(NOTES[i]);navigator.vibrate?.(10)}});line(x,y)};
 const fb=t=>{if(t==1){[523,659,784,1047].forEach((f,i)=>snd(f,.35,'sine',.1,i*.09));pg.classList.add('ok')}else if(t==0){snd(150,.3,'sawtooth',.08);snd(120,.3,'sawtooth',.08,.12);navigator.vibrate?.([60,40,60]);pg.classList.add('bad')}else{snd(660,.15);snd(880,.25,'sine',.1,.12)}
  setTimeout(()=>{pg.classList.remove('ok','bad');dots.forEach(d=>d.classList.remove('on'));pl.innerHTML='';seq=[]},t==1?500:700)};
 pg.onpointerdown=e=>{if(on)return;e.preventDefault();seq=[];dots.forEach(d=>d.classList.remove('on'));pg.setPointerCapture(e.pointerId);on=1;hit(e)};
 pg.onpointermove=e=>{if(on==1)hit(e)};
 pg.onpointerup=pg.onpointercancel=async()=>{if(on!=1)return;on=2;line();const m=$('#msg');
  if(seq.length<4){fb(0);m.textContent='Connect at least 4 tiles'}
  else{const x=await sha(seq.join(''));
   if(h){if(x==h){fb(1);setTimeout(unlockDone,550)}else{fb(0);m.textContent='Wrong pattern, try again'}}
   else if(!first){first=x;fb(2);m.textContent='Draw it again to confirm'}
   else if(x==first){await setS('pat',x);fb(1);setTimeout(()=>recStep(mode),550)}
   else{first=null;fb(0);m.textContent='Did not match. Draw a new pattern'}}
  setTimeout(()=>on=0,720)};
 /* optional fingerprint / face unlock; the pattern always still works */
 if(h&&!mode&&native&&FV.biometricAuth&&await getS('bio')){
  const bb=document.createElement('button');bb.className='b2';bb.id='bio';bb.innerHTML=ic('lock',16)+' Use fingerprint / face';$('.lock',el).append(bb);
  const tryBio=()=>FV.biometricAuth({title:'Unlock FileVault',cancel:'Use pattern'}).then(()=>{fb(1);setTimeout(unlockDone,300)}).catch(()=>{});
  bb.onclick=tryBio;setTimeout(tryBio,350)}
}

function recStep(mode){
 const el=$('#lockscr');
 el.innerHTML=`<div class="lock"><div class="lg">${ic('logo',60)}</div><h2>Recovery word</h2><p class="mu">If you forget your pattern, this word lets you reset it. Pick something you will remember.</p><input id="rw" placeholder="Recovery word"><button class="b" id="rs">Save</button><button class="b2" id="rk">Skip</button></div>`;
 const nx=()=>{if(mode=='set'){hideLock();toast('Pattern updated')}else unlockDone()};
 $('#rk').onclick=nx;
 $('#rs').onclick=async()=>{const v=$('#rw').value.trim().toLowerCase();if(!v)return toast('Type a word or tap Skip');await setS('rec',await sha('r:'+v));nx()}}

/* auto-lock after leaving the app for 20 seconds */
document.addEventListener('visibilitychange',async()=>{
 if(document.hidden){hid=Date.now();return}
 if(unl&&hid&&Date.now()-hid>20000&&(await getS('al'))!==0)showLock()});
