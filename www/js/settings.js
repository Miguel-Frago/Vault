/* ===== Settings, backup and restore ===== */
async function makeBackup(){return{v:2,app:'filevault',createdAt:new Date().toISOString(),albums,tags,fileTags,favorites:[...favs],lyrics:await allLyr(),pos,seen:[...seen],epOver,cv:await cineExport(),rdp:rdProg||(await getS('rdp'))||{},rdf:rdFold||(await getS('rdf'))||[],rdb:rdBm||(await getS('rdb'))||{},wlog:await wlogLoad(),plays:await psLoad(),accent:(await getS('accent'))||'',eq:await eqLoad()}}
async function saveBackup(){
 try{const data=JSON.stringify(await makeBackup());
  const FS=window.Capacitor?.isNativePlatform?.()&&window.Capacitor.Plugins?.Filesystem;
  if(FS){await FS.writeFile({path:'FileVault/FileVault-backup.json',data,directory:'DOCUMENTS',encoding:'utf8',recursive:true});toast('Saved to Documents/FileVault/FileVault-backup.json')}
  else{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));a.download='FileVault-backup.json';a.click();toast('Backup file created')}}
 catch(e){toast('Backup failed: '+(e.message||e))}}
async function restoreBackup(file){
 try{const j=JSON.parse(await file.text());let msg='';
  if(Array.isArray(j.albums)&&Array.isArray(j.tags)&&Array.isArray(j.favorites)){
   albums=j.albums;tags=j.tags;favs=new Set(j.favorites);if(j.fileTags)fileTags=j.fileTags;normAlbums();await saveAll();await setS('fileTags',fileTags);
   for(const k in(j.lyrics||{}))await setLyr(k,j.lyrics[k]);
   if(j.pos){pos={...pos,...j.pos};await savePos(true)}
   if(j.seen){seen=new Set([...seen,...j.seen]);await saveSeen()}if(j.epOver){epOver={...epOver,...j.epOver};await saveOver()}
   if(j.rdf){const have=rdFold||(await getS('rdf'))||[];for(const F of j.rdf)if(!have.some(x=>x.id===F.id))have.push(F);rdFold=have;await setS('rdf',rdFold)}
   if(j.rdp){rdProg={...(rdProg||(await getS('rdp'))||{}),...j.rdp};await setS('rdp',rdProg)}
   if(j.rdb){rdBm={...(rdBm||(await getS('rdb'))||{}),...j.rdb};await setS('rdb',rdBm)}
   if(j.wlog){const cur=await wlogLoad();for(const p in j.wlog)if(!cur[p]||j.wlog[p]>cur[p])cur[p]=j.wlog[p];await setS('wlog',cur)}
   if(j.plays){const cur=await psLoad();for(const p in j.plays){const a=cur[p],b=j.plays[p];if(!a||(b.n||0)>(a.n||0))cur[p]=b}await setS('plays',cur)}
   if(j.accent){applyAccent(j.accent);await setS('accent',j.accent)}
   if(j.eq&&j.eq.levels){eqSet=j.eq;await setS('eq',eqSet);eqPushed=false}
   let n=0;if(j.cv)n=await cineImport(j.cv);msg='Backup restored'+(n?` (${n} movies)`:'')}
  else if(Array.isArray(j.movies)){const n=await cineImport(j);msg=n+' CineVault movies imported. Link each movie to its video in Edit.'}
  else throw Error('This does not look like a FileVault or CineVault backup.');
  toast(msg);renderTab()}
 catch(e){toast(e.message||'Could not restore backup.')}}

function renderSettings(root){
 root.innerHTML=`<header class="hd"><h1>${ic('sliders',26)} Settings</h1></header><div class="pad">
 <div class="card2"><h3>Theme</h3><div class="sws">${THEMES.map(([k,n,a,b])=>`<button class="sw ${curTheme()==k?'sel':''}" data-th="${k}" style="background:linear-gradient(135deg,${b} 50%,${a} 50%)"><span>${n}</span></button>`).join('')}</div></div>
 <div class="card2"><h3>Accent color</h3><p class="mu">Replaces the theme's highlight color. Choosing a theme above resets it.</p><div class="sws acs">${ACCENTS.map(c=>`<button class="ac${(getComputedStyle(document.documentElement).getPropertyValue('--ac').trim().toLowerCase()===c)?' on':''}" data-ac="${c}" aria-label="Accent ${c}" style="background:${c}"></button>`).join('')}<label class="ac cu" aria-label="Custom accent color"><input type="color" id="acc" value="${getComputedStyle(document.documentElement).getPropertyValue('--ac').trim()||'#e8b04a'}"></label></div><div class="row"><button class="b2" id="acr">Back to theme color</button></div></div>
 <div class="card2"><h3>Tools</h3><div class="row" style="flex-wrap:wrap"><button class="b2" id="gso">${ic('search',16)} Search everything</button><button class="b2" id="sto">${ic('grid',16)} Storage dashboard</button><button class="b2" id="mhs">${ic('music',16)} Music history</button><button class="b2" id="wts">${ic('clock',16)} Watch history</button><button class="b2" id="eqs">${ic('sliders',16)} Equalizer</button></div></div>
 <div class="card2"><h3>About this build</h3><div class="mu">FileVault 2.9 · albums (nesting, covers, sort), Reader (TXT, PDF, CBR, bookmarks, covers), watch history, biometric unlock, sleep timer, equalizer, search, storage</div></div>
 <div class="card2"><h3>Music notification</h3><p class="mu" id="mns">Checking…</p><div class="row"><button class="b2" id="mnn">Notification settings</button><button class="b2" id="mnb">App &amp; battery settings</button><button class="b2" id="mnr">Check again</button><button class="b2" id="mnt">Send test notification</button></div></div>
 <div class="card2"><h3>Lock</h3><div class="row"><button class="b2" id="lk">${ic('lock',16)} Lock now</button><button class="b2" id="cp">Change pattern</button></div>
  <label class="row"><input type="checkbox" id="al" style="width:auto"> Auto-lock after leaving the app</label><label class="row"><input type="checkbox" id="hl" style="width:auto"> Hide the pattern line while drawing</label>
  <label class="row"><input type="checkbox" id="bio" style="width:auto"> Unlock with fingerprint or face (pattern still works)</label></div>
 <div class="card2"><h3>Backup &amp; restore</h3><p class="mu">Saves albums, subfolders, tags, favorites, lyrics, video resume points and your CineVault shelf (posters, cast, notes, links). Your real files are never included, so the backup stays small.</p>
  <div class="row"><button class="b" id="ex">Save backup</button></div><label class="mu">Restore a FileVault backup, or import a backup from the old CineVault app</label><input type="file" id="im" accept=".json,application/json"></div>
 <div class="card2"><h3>Storage access</h3><p class="mu">Android needs “All files access” to let FileVault list your files. Nothing is copied or uploaded.</p><button class="b2" id="pm">Open storage permission settings</button></div>
 <div class="card2"><h3>Thumbnail cache</h3><p class="mu" id="tcs">Calculating…</p><label class="mu">Maximum size</label><select id="tcm">${[100,300,500,1000].map(v=>`<option value="${v}" ${prefs.cacheMB==v?'selected':''}>${v>=1000?'1 GB':v+' MB'}</option>`).join('')}</select><div class="row"><button class="b2" id="tcc">Clear cache</button></div><p class="mu">Thumbnails are small previews, never your real files. The oldest are removed when the limit is reached.</p></div>
 <div class="card2"><h3>Missing files</h3><p class="mu">Entries in albums, favorites or tags whose file is no longer on the phone.</p><div class="row"><button class="b2" id="mfc">Check &amp; clean up</button></div></div>
 <div class="card2"><h3>About</h3><p class="mu">Library index: ${files.length} files. FileVault stores only your organization data and small thumbnails.</p></div></div>`;
 const mns=async()=>{const el=$('#mns',root);if(!el)return;
  if(!NM){el.textContent='The Android music engine is not loaded in this build, so songs play inside the app only and no notification can be shown.';return}
  try{const s=await NM.notifStatus();el.textContent=(!s.enabled?'Notifications are OFF for FileVault. Tap “Notification settings” and turn them on.':s.channel===false?'The “Music playback” notification category is turned OFF. Tap “Notification settings” and switch it on.':'Notifications are ON for FileVault.')+' Music service: '+(s.service?'running':'not running (play a song first)')+(s.error?' · last error: '+s.error:'')+'\nPlaying: '+(s.playing?'yes':'no')+' · Music notification posted: '+(s.posted?'YES':'NO')+' · Channel importance: '+s.importance+' · Android '+s.sdk}
  catch(e){el.textContent='Could not check: '+(e.message||e)}};mns();
 $('#mnn',root).onclick=()=>NM?NM.openNotifSettings().catch(e=>toast(e.message)):toast('Not available in this build');
 $('#mnb',root).onclick=()=>NM?NM.openAppSettings().catch(e=>toast(e.message)):toast('Not available in this build');
 $('#mnr',root).onclick=mns;
 $('#mnt',root).onclick=()=>NM?NM.testNotification().then(()=>toast('Test sent. Pull down the notification panel.')).catch(e=>toast(e.message||'Could not send')):toast('Not available in this build');
 const tcs=()=>thumbStats().then(t=>{const el=$('#tcs',root);if(el)el.textContent=`${bytes(t.bytes)} used of ${prefs.cacheMB>=1000?'1 GB':prefs.cacheMB+' MB'} · ${t.count} thumbnails`});tcs();
 $('#tcm',root).onchange=async e=>{prefs.cacheMB=+e.target.value;await savePrefs();await thumbTrim();tcs()};
 $('#tcc',root).onclick=async()=>{await thumbClear();tcs();toast('Thumbnail cache cleared')};
 $('#mfc',root).onclick=()=>missingModal();
 $('.sws',root).onclick=async e=>{const b=e.target.closest('.sw');if(!b)return;applyTheme(b.dataset.th);applyAccent(null);await setS('accent','');await setS('theme',b.dataset.th);$$('.sw',root).forEach(x=>x.classList.toggle('sel',x==b))};
 $('.acs',root).onclick=async e=>{const b=e.target.closest('[data-ac]');if(!b)return;applyAccent(b.dataset.ac);$$('.ac[data-ac]',root).forEach(x=>x.classList.toggle('on',x===b));await setS('accent',b.dataset.ac)};
 $('#acc',root).oninput=e=>applyAccent(e.target.value);$('#acc',root).onchange=e=>setS('accent',e.target.value);
 $('#acr',root).onclick=async()=>{applyAccent(null);await setS('accent','');toast('Using the theme color')};
 $('#gso',root).onclick=openSearch;$('#sto',root).onclick=storageSheet;$('#mhs',root).onclick=()=>historySheet('recent');$('#wts',root).onclick=watchSheet;$('#eqs',root).onclick=eqModal;
 $('#lk',root).onclick=()=>showLock();$('#cp',root).onclick=()=>showLock('set');
 getS('bio').then(v=>$('#bio',root).checked=!!v);
 $('#bio',root).onchange=async e=>{const c=e.target;if(!c.checked){await setS('bio',0);return}
  if(!native||!FV.biometricAuth){c.checked=false;return toast('Available in the Android app.')}
  try{await FV.biometricAuth({title:'Turn on biometric unlock',cancel:'Cancel'});await setS('bio',1);toast('Biometric unlock is on. Your pattern still works.')}catch(err){c.checked=false;toast('Could not turn it on: '+(err.message||err))}};
 getS('al').then(v=>$('#al',root).checked=v!==0);getS('hl').then(v=>$('#hl',root).checked=!!v);
 $('#al',root).onchange=e=>setS('al',e.target.checked?1:0);$('#hl',root).onchange=e=>setS('hl',e.target.checked?1:0);
 $('#ex',root).onclick=saveBackup;$('#im',root).onchange=e=>{const f=e.target.files[0];if(f)restoreBackup(f);e.target.value=''};
 $('#pm',root).onclick=()=>native?FV.requestStorageAccess():toast('Available in the Android app.')}
