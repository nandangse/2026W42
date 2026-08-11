/* ================= MY SALES PLAN · NANDAN GSE =================
   Supabase-backed version. UI ported from the single-file artifact.
   Data lives in Supabase (per-row jsonb); changes auto-save (debounced)
   and stream live to every signed-in teammate via realtime.

   GENIE EDITION (MSP 3.2) — served inside the Sales Genie workspace by
   /api/sales/plan. No module imports: at serve time this file is concatenated
   after the pure modules (version, plan, deals, geo, eva) and seed-data.js,
   and before boot.js (which defines `sb`, adds body.embed and calls startApp
   with the Genie session). Tables carry the sp_ prefix in the shared Genie
   database; login and team management belong to Genie itself, so the
   standalone app's login screen and Team tab are gone.

   Departure from upstream, deliberate: deals and support are REAL tables
   (sp_deals / sp_support in ENTITY_TABLES — upstream never persisted them),
   and salesStats / salesPlan ride in the settings masters blob. */

/* ---------- migrate old data shapes ---------- */
function migrate(d){
  d.meta=d.meta||{version:3,savedAt:null};
  d.owners=d.owners||["Nitu","Santosh","Raghu","Acharya"];
  d.ownerColors=d.ownerColors||{"Nitu":"#1B2D6B","Santosh":"#F04E23","Raghu":"#0E7C7B","Acharya":"#7A1E6C"};
  d.types=d.types||["Client","Prospect","Collaborator"];
  d.stages=d.stages||SEED.stages;
  d.locations=d.locations||[];d.products=d.products||[];d.companies=d.companies||[];d.people=d.people||[];d.todos=d.todos||[];
  d.deals=d.deals||[];d.salesStats=d.salesStats||{};d.salesPlan=d.salesPlan||{};
  d.support=d.support||[];
  d.support.forEach(x=>{x.task=x.task||'';x.escalation=x.escalation||'Medium';x.requested=x.requested||'';
    x.assignedTo=x.assignedTo||'';x.status=x.status||'open';x.companyId=x.companyId||'';
    x.raisedBy=x.raisedBy||'';x.createdAt=x.createdAt||new Date().toISOString();x.notes=x.notes||'';});
  d.deals.forEach(x=>{
    x.segment=x.segment||'MHE';x.stage=x.stage||'suspecting';x.amount=+x.amount||0;
    x.interactions=+x.interactions||0;x.history=x.history||[];x.createdAt=x.createdAt||new Date().toISOString();
    x.oppNo=x.oppNo||'';x.quoteNo=x.quoteNo||'';x.soNo=x.soNo||'';x.statusNow=x.statusNow||'';x.productIds=x.productIds||[];
    x.chanceSource=x.chanceSource||'auto';
    if(x.chance==null){const l=localChance(x);x.chance=l.chance;x.chanceWhy=l.why;}
  });
  d.industries=(d.industries||[]).map(i=>typeof i==='string'
    ?{name:i,sector:'',priority:'None',prospects:0,goal:'',strategy:'',potentials:'',projects:'',notes:(d.industryNotes||{})[i]||''}
    :Object.assign({name:'',sector:'',priority:'None',prospects:0,goal:'',strategy:'',potentials:'',projects:'',notes:''},i));
  delete d.industryNotes;
  d.products.forEach(p=>{p.industries=p.industries||[];p.segment=p.segment||'';p.goal=p.goal||'';p.strategy=p.strategy||'';p.img=p.img||'';p.detail=p.detail||'';});
  d.companies.forEach(c=>{
    c.owners=c.owners||(c.owner?[c.owner]:[]);delete c.owner;
    c.type=c.type||'Prospect';c.productIds=c.productIds||[];c.productNotes=c.productNotes||'';
    c.locations=c.locations||[];c.comments=c.comments||[];c.notes=c.notes||'';
    c.eva=c.eva||null;
    if(c.offer&&!/[<]/.test(c.offer))c.offer=c.offer.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>');
    c.offer=c.offer||'';
  });
  d.people.forEach(p=>{p.linkedin=p.linkedin||'';});
  return d;
}

/* ---------- state ---------- */
let S=null;
let profile=null, myEmail='';
let currentOwner="all", currentTab="deals", currentUser="";
let detailId=null;                       // open company page
let sortKey='name', sortDir=1;           // companies table
let fType='', fInd='', fStage='';        // companies table filters
let indSortKey='prospects', indSortDir=-1, fSector='', fPriority='', expandedInd=null;
const COLOR_POOL=['#1B2D6B','#F04E23','#0E7C7B','#7A1E6C','#B45309','#2563EB','#DC2626','#059669','#6D28D9','#0891B2'];
const PRIO_ORDER={"Highest":0,"High":1,"Medium":2,"Low":3,"None":4,"":4};

const uid=()=>'id'+Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const esc=s=>(s==null?'':''+s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const enc=encodeURIComponent, dec=decodeURIComponent;
const byName=(a,b)=>(a.name||'').localeCompare(b.name||'');
const mdlite=t=>esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>');
const isAdmin=()=>!!profile&&profile.role==='admin';
const $id=i=>document.getElementById(i);
const val=i=>{const el=$id(i);return el?el.value.trim():'';};
/* Indian date formats: dd/mm/yyyy (+ hh:mm for timestamps) */
const fmtD=iso=>{if(!iso)return '';const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m?`${m[3]}/${m[2]}/${m[1]}`:String(iso);};
const fmtDT=iso=>iso?fmtD(iso)+(String(iso).length>10?' '+String(iso).slice(11,16):''):'';

/* Tell Genie's bell when work is assigned to someone else (fire-and-forget). */
function notifyAssign(kind,who,text,company){
  if(!who||who===currentUser)return;
  fetch('/api/sales/plan/notify',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({assignee:who,kind,text,company:company||''})}).catch(()=>{});
}

/* Voice dictation into a rich-text field (Web Speech API). */
let dictState=null;
function dictate(elId,btn,ev){
  if(ev)ev.preventDefault();
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR)return alert('Voice input needs Chrome or Edge — this browser has no speech recognition.');
  if(dictState){dictState.rec.stop();return;}
  const el=$id(elId);if(!el)return;
  const rec=new SR();rec.lang='en-IN';rec.continuous=true;rec.interimResults=false;
  dictState={rec,btn};btn.classList.add('rec');btn.textContent='◼ stop';
  rec.onresult=e=>{
    let t='';for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)t+=e.results[i][0].transcript;
    t=t.trim();if(!t)return;
    el.innerHTML+=(el.innerHTML?' ':'')+esc(t);
    if(el.id&&el.id.startsWith('offer-'))saveOffer(el.id.slice(6));
  };
  rec.onerror=e=>{if(e.error==='not-allowed')alert('Microphone access was blocked — allow the mic and try again.');};
  rec.onend=()=>{if(dictState){dictState.btn.classList.remove('rec');dictState.btn.textContent='🎤 speak';dictState=null;}};
  rec.start();
}

/* ---------- sync layer: debounced diff-save + realtime ---------- */
const ENTITY_TABLES=['industries','products','companies','people','todos','deals','support'];
let last={masters:'',industries:new Map(),products:new Map(),companies:new Map(),people:new Map(),todos:new Map(),deals:new Map(),support:new Map()};
let saveTimer=null, saving=false, resaveNeeded=false;

function mastersOf(){return {meta:S.meta,owners:S.owners,ownerColors:S.ownerColors,types:S.types,stages:S.stages,locations:S.locations,
  salesStats:S.salesStats,salesPlan:S.salesPlan};}
function snapshot(){
  last.masters=JSON.stringify(mastersOf());
  for(const t of ENTITY_TABLES){const m=new Map();S[t].forEach(o=>m.set(o.id,JSON.stringify(o)));last[t]=m;}
}
function setSync(st){const el=$id('syncStatus');if(!el)return;el.className='sync '+st;
  el.textContent=st==='saving'?'● Saving…':st==='error'?'⚠ Offline — retrying':'✓ Saved';}

function markDirty(){
  setSync('saving');
  if(saveTimer)clearTimeout(saveTimer);
  saveTimer=setTimeout(syncNow,1200);
}
window.addEventListener('beforeunload',e=>{if(saveTimer||saving){e.preventDefault();e.returnValue='';}});

async function syncNow(){
  if(!S)return;
  if(saving){resaveNeeded=true;return;}
  if(saveTimer){clearTimeout(saveTimer);saveTimer=null;}
  saving=true;
  try{
    S.industries.forEach(i=>{if(!i.id)i.id=uid();});
    const now=new Date().toISOString();
    const jobs=[], applied=[];
    const mj=JSON.stringify(mastersOf());
    if(mj!==last.masters){
      jobs.push(sb.from('sp_settings').upsert({id:'masters',data:JSON.parse(mj),updated_at:now}));
      applied.push(()=>{last.masters=mj;});
    }
    for(const t of ENTITY_TABLES){
      const seen=new Set(), ups=[];
      for(const o of S[t]){
        seen.add(o.id);
        const j=JSON.stringify(o);
        if(last[t].get(o.id)!==j)ups.push({id:o.id,json:j});
      }
      const dels=[...last[t].keys()].filter(id=>!seen.has(id));
      for(let i=0;i<ups.length;i+=150){
        const chunk=ups.slice(i,i+150);
        jobs.push(sb.from('sp_'+t).upsert(chunk.map(u=>({id:u.id,data:JSON.parse(u.json),updated_at:now}))));
        applied.push(()=>chunk.forEach(u=>last[t].set(u.id,u.json)));
      }
      if(dels.length){
        jobs.push(sb.from('sp_'+t).delete().in('id',dels));
        applied.push(()=>dels.forEach(id=>last[t].delete(id)));
      }
    }
    if(jobs.length){
      const results=await Promise.all(jobs);
      const bad=results.find(r=>r.error);
      if(bad)throw bad.error;
      applied.forEach(f=>f());
    }
    if(!saveTimer&&!resaveNeeded)setSync('saved');
  }catch(e){
    console.error('sync failed',e);
    setSync('error');
    if(saveTimer)clearTimeout(saveTimer);
    saveTimer=setTimeout(syncNow,8000);
  }
  saving=false;
  if(resaveNeeded){resaveNeeded=false;syncNow();}
}

/* remote changes: apply into S unless they match what we already have (echo) */
let renderPending=false;
function scheduleRender(){
  const ae=document.activeElement;
  const editing=ae&&ae.closest&&ae.closest('#main')&&(ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.isContentEditable);
  if(editing){
    if(!renderPending){renderPending=true;ae.addEventListener('blur',()=>{renderPending=false;render();},{once:true});}
    return;
  }
  render();
}
function startRealtime(){
  sb.channel('sales-plan-sync')
    .on('postgres_changes',{event:'*',schema:'public'},p=>{
      const t=(p.table||'').replace(/^sp_/,''); // sp_deals → deals etc.
      if(t==='settings'){
        const row=p.new;
        if(row&&row.id==='masters'&&row.data){
          const j=JSON.stringify(row.data);
          if(j!==last.masters){last.masters=j;Object.assign(S,row.data);scheduleRender();}
        }
        return;
      }
      if(!ENTITY_TABLES.includes(t))return;
      if(p.eventType==='DELETE'){
        const id=p.old&&p.old.id;if(!id)return;
        if(S[t].some(o=>o.id===id)){S[t]=S[t].filter(o=>o.id!==id);last[t].delete(id);scheduleRender();}
        return;
      }
      const row=p.new;if(!row||!row.data)return;
      const j=JSON.stringify(row.data);
      if(last[t].get(row.id)===j)return; // our own write echoed back
      const ix=S[t].findIndex(o=>o.id===row.id);
      if(ix>=0)S[t][ix]=row.data;else S[t].push(row.data);
      last[t].set(row.id,j);
      scheduleRender();
    })
    .subscribe();
}

/* ---------- boot ---------- */
function bootHtml(h){$id('loginScreen').hidden=true;$id('appRoot').hidden=true;$id('bootScreen').hidden=false;$id('bootCard').innerHTML=h;}
function bootMsg(m){bootHtml(`<div class="login-title">MY SALES <span>PLAN</span></div><div class="login-sub" style="margin:14px 0 0">${esc(m)}</div>`);}
function bootFail(m){bootHtml(`<div class="login-title">MY SALES <span>PLAN</span></div>
  <div class="login-err" style="margin-top:14px">${esc(m)}</div>
  <button class="btn btn-ghost" style="width:100%" onclick="location.reload()">Reload</button>`);}

async function startApp(prof,email){
  profile=prof;myEmail=email||'';currentUser=prof.name||myEmail;
  bootMsg('Loading your sales plan…');
  let results;
  try{
    results=await Promise.all([
      sb.from('sp_settings').select('data').eq('id','masters').maybeSingle(),
      ...ENTITY_TABLES.map(t=>sb.from('sp_'+t).select('id,data'))
    ]);
  }catch(e){return bootFail('Could not load data: '+(e.message||e));}
  const bad=results.find(r=>r.error);
  if(bad)return bootFail('Could not load data: '+bad.error.message);
  const [set,...rows]=results;
  if(!set.data){
    if(isAdmin())return showInitScreen();
    return bootFail('The database has no data yet — ask your admin to sign in once and initialize it.');
  }
  const d=Object.assign({},set.data.data);
  ENTITY_TABLES.forEach((t,i)=>d[t]=rows[i].data.map(r=>r.data));
  S=migrate(d);
  finishBoot();
}

function showInitScreen(){
  bootHtml(`<div class="login-title">MY SALES <span>PLAN</span></div>
    <div class="login-sub">One-time setup</div>
    <p style="font-size:14px;margin:10px 0 16px">The database is empty. Load the starting data into Supabase:
    <b>${SEED.industries.length} industries</b>, <b>${SEED.products.length} products</b>, the 9-stage sales process and the team masters.</p>
    <button class="btn btn-primary" style="width:100%" onclick="initDb()">Load starting data</button>`);
}
async function initDb(){
  bootMsg('Loading starting data into Supabase — this takes a few seconds…');
  try{
    S=migrate(JSON.parse(JSON.stringify(SEED)));
    S.industries.forEach(i=>{if(!i.id)i.id=uid();});
    const now=new Date().toISOString();
    const r0=await sb.from('sp_settings').upsert({id:'masters',data:mastersOf(),updated_at:now});
    if(r0.error)throw r0.error;
    for(const t of ENTITY_TABLES){
      const rows=S[t].map(o=>({id:o.id,data:o,updated_at:now}));
      for(let i=0;i<rows.length;i+=150){
        const r=await sb.from('sp_'+t).upsert(rows.slice(i,i+150));
        if(r.error)throw r.error;
      }
    }
    finishBoot();
  }catch(e){
    bootFail('Initialization failed: '+(e.message||e)+' — check that migrations 0014 and 0015 were run in the Supabase SQL editor.');
  }
}

function finishBoot(){
  S.industries.forEach(i=>{if(!i.id)i.id=uid();});
  snapshot();
  // make sure the signed-in person exists in the owner masters
  if(currentUser&&!S.owners.some(o=>o.toLowerCase()===currentUser.toLowerCase())){
    S.owners.push(currentUser);
    S.ownerColors[currentUser]=profile.color||COLOR_POOL.find(c=>!Object.values(S.ownerColors).includes(c))||'#1B2D6B';
    markDirty();
  }
  startRealtime();
  $id('bootScreen').hidden=true;
  $id('appRoot').hidden=false;
  const vb=$id('verBadge');
  if(vb){vb.textContent=VERSION;vb.title=CHANGELOG.map(([v,w])=>`${v} — ${w}`).join('\n');}
  $id('avatarBtn').textContent=(currentUser||'?').trim().charAt(0).toUpperCase();
  $id('avatarBtn').style.background=S.ownerColors[currentUser]||'#1B2D6B';
  $id('userChip').textContent=`${currentUser}${isAdmin()?' · Admin':''}`;
  $id('userSub').textContent=myEmail;
  if(!saveTimer)setSync('saved');
  render();
}

/* ---------- lookups ---------- */
const companyById=id=>S.companies.find(c=>c.id===id);
const productById=id=>S.products.find(p=>p.id===id);
const indByName=n=>S.industries.find(i=>i.name===n);
const peopleOf=cid=>S.people.filter(p=>p.companyId===cid);
const todosOf=cid=>S.todos.filter(t=>t.companyId===cid);
function allLocations(){const set=new Map();
  S.locations.forEach(l=>set.set(l.toLowerCase(),l));
  S.companies.forEach(c=>(c.locations||[]).forEach(l=>l&&!set.has(l.toLowerCase())&&set.set(l.toLowerCase(),l)));
  S.people.forEach(p=>p.location&&!set.has(p.location.toLowerCase())&&set.set(p.location.toLowerCase(),p.location));
  return [...set.values()].sort();}
function allIndustryNames(){return S.industries.map(i=>i.name).sort();}
function canonLoc(v){v=(v||'').trim();if(!v)return '';
  const hit=allLocations().find(l=>l.toLowerCase()===v.toLowerCase());return hit||v;}
const q=()=>$id('searchBox').value.trim().toLowerCase();
const match=(...f)=>{const s=q();return !s||f.some(x=>(x||'').toLowerCase().includes(s));};

/* ---------- owner filter ---------- */
/** Salesperson filter — lives inside each tab, not in the top bar.
    `only` narrows the list to the names that actually appear in that tab. */
function ownerFilter(only){
  const base=only&&only.length?only:S.owners;
  const list=[...new Set([...base,...(currentOwner!=='all'&&currentOwner!=='none'?[currentOwner]:[])])].sort();
  return `<select class="fsel" onchange="setOwner(this.value)" title="Filter by salesperson">
    <option value="all" ${currentOwner==='all'?'selected':''}>All salespeople</option>
    <option value="none" ${currentOwner==='none'?'selected':''}>Unassigned</option>
    ${list.map(o=>`<option value="${esc(o)}" ${currentOwner===o?'selected':''}>${esc(o)}</option>`).join('')}
  </select>`;
}
function setOwner(o){currentOwner=o;render();}
const ownersUsedBy=arr=>[...new Set(arr.map(x=>x.owner).filter(Boolean))];
const ownerOk=o=>currentOwner==='all'||(currentOwner==='none'?!o:o===currentOwner);
const ownersOk=arr=>currentOwner==='all'||(currentOwner==='none'?!(arr&&arr.length):(arr||[]).includes(currentOwner));
const ownerPill=o=>o?`<span class="owner-pill" style="background:${S.ownerColors[o]||'#666'}">${esc(o)}</span>`:'';
const ownerPills=arr=>(arr||[]).map(ownerPill).join(' ');
function addOwnerMaster(){
  if(!isAdmin())return alert('Only an admin can add to the team list.');
  const n=(prompt('Add a salesperson to the master list (name only — logins & access are managed in the Genie admin tab):')||'').trim();if(!n)return;
  if(S.owners.some(o=>o.toLowerCase()===n.toLowerCase()))return alert(n+' is already in the team list.');
  S.owners.push(n);
  S.ownerColors[n]=COLOR_POOL.find(c=>!Object.values(S.ownerColors).includes(c))||'#'+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');
  markDirty();render();}

/* ---------- tabs ---------- */
const BASE_TABS=[["deals","Deals"],["companies","Companies"],["industries","Industries"],["people","People"],
  ["locations","Locations"],["products","Products"],["process","Sales Process"],["todos","ToDo"],
  ["support","Support Needed"],["stats","Salespersons Plan"]];
const TAB_COLOR={deals:'#F04E23',companies:'#1B2D6B',industries:'#0B9B93',people:'#7A1E6C',
  locations:'#B45309',products:'#2A46A8',process:'#1a7f4e',todos:'#C2185B',
  support:'#DC2626',stats:'#6D28D9',team:'#0891B2'};
const tabColor=t=>TAB_COLOR[t]||'#F04E23';
/* The tab bar is sticky ("frozen"), collapsed by default; ☰ opens it and 📌
   freezes it open. Both choices persist per browser. */
let tabsPinned=localStorage.getItem('msp-tabs-pin')==='1';
let tabsOpen=tabsPinned||localStorage.getItem('msp-tabs-open')==='1';
function toggleTabs(){tabsOpen=!tabsOpen;localStorage.setItem('msp-tabs-open',tabsOpen?'1':'0');renderTabs();}
function pinTabs(){tabsPinned=!tabsPinned;localStorage.setItem('msp-tabs-pin',tabsPinned?'1':'0');
  if(tabsPinned){tabsOpen=true;localStorage.setItem('msp-tabs-open','1');}renderTabs();}
function renderTabs(){
  const tabs=BASE_TABS; // team management lives in the Genie admin tab
  const counts={companies:S.companies.filter(c=>ownersOk(c.owners)).length,industries:S.industries.length,
    people:S.people.filter(p=>ownerOk(p.owner)).length,locations:allLocations().length,
    products:S.products.length,process:'',todos:S.todos.filter(t=>ownerOk(t.owner)&&t.status!=='done').length,
    deals:S.deals.filter(d=>ownerOk(d.owner)&&isOpen(d)).length,stats:'',
    support:S.support.filter(x=>ownerOk(x.assignedTo)&&x.status!=='done').length};
  const burger=`<button class="tabtoggle" onclick="toggleTabs()" title="${tabsOpen?'Collapse the tab bar':'Open the tab bar'}">☰</button>`;
  const pin=`<button class="tabpin ${tabsPinned?'on':''}" onclick="pinTabs()" title="${tabsPinned?'Unfreeze — bar collapses after you pick a tab':'Freeze the tab bar open'}">📌</button>`;
  if(!tabsOpen){
    const cur=BASE_TABS.find(([k])=>k===currentTab);
    $id('tabs').innerHTML=burger+`<button class="active" style="--tabc:${tabColor(currentTab)}" onclick="toggleTabs()">${cur?cur[1]:''}${counts[currentTab]!==''&&counts[currentTab]!==undefined?`<span class="cnt">${counts[currentTab]}</span>`:''}</button>`;
  }else{
    $id('tabs').innerHTML=burger+tabs.map(([k,l])=>
      `<button class="${currentTab===k?'active':''}" style="--tabc:${tabColor(k)}" onclick="setTab('${k}')">${l}${counts[k]!==''?`<span class="cnt">${counts[k]}</span>`:''}</button>`).join('')+pin;
  }
  $id('main').style.setProperty('--tabc',tabColor(currentTab));
}
function setTab(t){currentTab=t;detailId=null;
  if(!tabsPinned&&tabsOpen){tabsOpen=false;localStorage.setItem('msp-tabs-open','0');}
  render();}

/* ---------- filter setters (inline handlers can't touch module vars) ---------- */
function _setF(k,v){
  if(k==='fType')fType=v;else if(k==='fInd')fInd=v;else if(k==='fStage')fStage=v;
  else if(k==='fSector')fSector=v;else if(k==='fPriority')fPriority=v;
}
function setFilter(k,v){_setF(k,v);render();}
function clearFilters(...ks){ks.forEach(k=>_setF(k,''));render();}
function closeCompanyPage(){detailId=null;render();}

/* ---------- shared widgets ---------- */
function typeSelect(id,sel){return `<select id="${id}">${S.types.map(t=>`<option ${t===sel?'selected':''}>${esc(t)}</option>`).join('')}</select>`;}
const typeTag=t=>t?`<span class="t-tag t-${esc(t)}">${esc(t)}</span>`:'';
function ownerSelect(id,sel){return `<select id="${id}">${S.owners.map(o=>`<option ${o===sel?'selected':''}>${esc(o)}</option>`).join('')}</select>`;}
function stageSelect(id,sel){return `<select id="${id}">${S.stages.map(s=>`<option value="${s.n}" ${s.n==sel?'selected':''}>${s.n}. ${esc(s.name)}</option>`).join('')}</select>`;}
function industrySelect(id,sel){return `<select id="${id}"><option value="">— choose —</option>${allIndustryNames().map(i=>`<option ${i===sel?'selected':''}>${esc(i)}</option>`).join('')}<option value="__new__">+ New industry…</option></select>`;}
function toggleForm(id){$id(id).classList.toggle('open');}
function toggleCard(el){el.closest('.card').classList.toggle('open');}
const prioTag=p=>({Highest:'<span class="prio p0">Highest</span>',High:'<span class="prio p1">High</span>',Medium:'<span class="prio p2">Medium</span>',Low:'<span class="prio p3">Low</span>'}[p]||'<span class="prio p4">—</span>');
const goalTag=g=>g?`<span class="tag ${g==='FOCUS'?'orange':''}" style="font-size:11px">${esc(g)}</span>`:'';
function showImg(src){const lb=$id('lightbox');$id('lightimg').src=src;lb.style.display='flex';}
function rtc(cmd,ev){ev.preventDefault();document.execCommand(cmd,false,null);}
const rtToolbar=(voiceTarget)=>`<div class="rt-toolbar">
  <button type="button" onmousedown="rtc('bold',event)"><b>B</b></button>
  <button type="button" onmousedown="rtc('italic',event)"><i>I</i></button>
  <button type="button" onmousedown="rtc('underline',event)"><u>U</u></button>
  <button type="button" onmousedown="rtc('insertUnorderedList',event)">• List</button>
  <button type="button" onmousedown="rtc('removeFormat',event)">Clear</button>${voiceTarget?`
  <button type="button" class="mic" onmousedown="dictate('${voiceTarget}',this,event)" title="Dictate — speak and it types">🎤 speak</button>`:''}</div>`;

/* ---------- autocomplete (masters-first, add-if-missing) ---------- */
function acHtml(id,kind,ctx,placeholder){
  return `<div class="ac"><input id="${id}" data-kind="${kind}" data-ctx="${ctx}" placeholder="${esc(placeholder)}" autocomplete="off"
    oninput="acShow(this)" onfocus="acShow(this)" onblur="acHide(this)"><div class="acdd" id="${id}-dd"></div></div>`;
}
function acShow(inp){
  const dd=$id(inp.id+'-dd');if(!dd)return;
  const kind=inp.dataset.kind, qv=inp.value.trim(), ql=qv.toLowerCase();
  const items=kind==='loc'?allLocations():S.products.map(p=>p.name).sort();
  const matches=items.filter(x=>x.toLowerCase().includes(ql)).slice(0,10);
  const exact=items.some(x=>x.toLowerCase()===ql);
  let h=matches.map(x=>`<div class="aci" onmousedown="acPick('${inp.id}','${enc(x)}')">${kind==='loc'?'📍 ':''}${esc(x)}</div>`).join('');
  if(qv&&!exact)h+=`<div class="aci add" onmousedown="acAdd('${inp.id}')">＋ Add ${kind==='loc'?'location':'product'} “${esc(qv)}”</div>`;
  if(!h)h=`<div class="aci" style="color:var(--muted);cursor:default">Type to search ${kind==='loc'?'locations':'products'}…</div>`;
  dd.innerHTML=h;dd.classList.add('open');
}
function acHide(inp){setTimeout(()=>{const dd=$id(inp.id+'-dd');if(dd)dd.classList.remove('open');},180);}
function acPick(id,v){acCommit(id,dec(v));}
function acAdd(id){const inp=$id(id);acCommit(id,inp.value.trim());}
function acCommit(id,v){
  if(!v)return;
  const inp=$id(id), kind=inp.dataset.kind, ctx=inp.dataset.ctx;
  if(kind==='loc'){
    v=canonLoc(v);
    if(!allLocations().some(l=>l.toLowerCase()===v.toLowerCase()))S.locations.push(v);
    if(ctx==='form'){if(!formLocs.some(l=>l.toLowerCase()===v.toLowerCase()))formLocs.push(v);inp.value='';drawFormLocs();markDirty();renderTabs();return;}
    if(ctx==='person'){inp.value=v;markDirty();return;}
    if(ctx==='master'){markDirty();render();return;}
    const c=companyById(ctx);if(!c)return;
    if(!c.locations.some(l=>l.toLowerCase()===v.toLowerCase()))c.locations.push(v);
    markDirty();render();
  }else{ /* product */
    let pr=S.products.find(p=>p.name.toLowerCase()===v.toLowerCase());
    if(!pr){pr={id:uid(),name:v,segment:'',goal:'',strategy:'',img:'',detail:'',industries:[]};S.products.push(pr);}
    const c=companyById(ctx);if(!c)return;
    if(!c.productIds.includes(pr.id))c.productIds.push(pr.id);
    markDirty();render();
  }
}

/* ---------- COMPANIES: table ---------- */
function stageName(n){const s=S.stages.find(x=>x.n==n);return s?s.n+'. '+s.name:'—';}
function viewCompanies(){
  if(detailId){const c=companyById(detailId);if(c)return viewCompanyPage(c);detailId=null;}
  let list=S.companies.filter(c=>ownersOk(c.owners)
    &&(!fType||c.type===fType)&&(!fInd||c.industry===fInd)&&(!fStage||c.stage==fStage)
    &&match(c.name,c.industry,c.offer,c.type,(c.owners||[]).join(' '),(c.locations||[]).join(' ')));
  const dir=sortDir;
  list.sort((a,b)=>{
    const v={name:x=>x.name||'',type:x=>x.type||'',industry:x=>x.industry||'',stage:x=>+x.stage||0,
      owners:x=>(x.owners||[]).join(','),locations:x=>(x.locations||[]).join(','),
      people:x=>peopleOf(x.id).length,todos:x=>todosOf(x.id).filter(t=>t.status!=='done').length}[sortKey];
    const av=v(a),bv=v(b);return (typeof av==='number'?av-bv:(''+av).localeCompare(''+bv))*dir;});
  const arrow=k=>sortKey===k?(sortDir>0?' ▲':' ▼'):'';
  const th=(k,l)=>`<th onclick="setSort('${k}')">${l}${arrow(k)}</th>`;
  const usedInds=[...new Set(S.companies.map(c=>c.industry).filter(Boolean))].sort();
  return `
  <div class="toolrow"><h2>Companies</h2><span class="hint">${list.length} shown · click a row to open the full page</span>
    <div class="spacer"></div><button class="btn btn-primary" onclick="toggleForm('cform')">+ Add company</button></div>
  ${companyForm()}
  <div class="filters">
    ${ownerFilter()}
    <select onchange="setFilter('fType',this.value)"><option value="">All types</option>${S.types.map(t=>`<option ${fType===t?'selected':''}>${esc(t)}</option>`).join('')}</select>
    <select onchange="setFilter('fInd',this.value)"><option value="">All industries</option>${usedInds.map(i=>`<option ${fInd===i?'selected':''}>${esc(i)}</option>`).join('')}</select>
    <select onchange="setFilter('fStage',this.value)"><option value="">All stages</option>${S.stages.map(s=>`<option value="${s.n}" ${fStage==s.n?'selected':''}>${s.n}. ${esc(s.name)}</option>`).join('')}</select>
    ${(fType||fInd||fStage)?`<button class="btn btn-ghost btn-sm" onclick="clearFilters('fType','fInd','fStage')">✕ Clear filters</button>`:''}
  </div>
  ${list.length?`<div class="tblwrap"><table class="tbl">
    <thead><tr>${th('name','Company')}${th('type','Type')}${th('industry','Industry')}${th('stage','Stage')}${th('owners','Owners')}${th('locations','Locations')}${th('people','People')}${th('todos','To-dos')}</tr></thead>
    <tbody>${list.map(c=>`<tr onclick="openCompany('${c.id}')">
      <td class="cname">${esc(c.name)}</td>
      <td>${typeTag(c.type)}</td>
      <td>${esc(c.industry||'—')}</td>
      <td><span class="tag stage">${stageName(c.stage)}</span></td>
      <td>${ownerPills(c.owners)||'<span class="hint">—</span>'}</td>
      <td class="hint">${(c.locations||[]).map(esc).join(', ')||'—'}</td>
      <td style="text-align:center">${peopleOf(c.id).length}</td>
      <td style="text-align:center">${todosOf(c.id).filter(t=>t.status!=='done').length}</td>
    </tr>`).join('')}</tbody></table></div>`
  :`<div class="empty"><b>No companies match.</b><br>Click <b>+ Add company</b> to start, or clear the filters.</div>`}`;
}
function setSort(k){if(sortKey===k)sortDir=-sortDir;else{sortKey=k;sortDir=1;}render();}
function openCompany(id){detailId=id;currentTab='companies';render();window.scrollTo(0,0);}
function companyForm(){
  return `<div class="addform" id="cform"><h3>New company</h3>
    <div class="grid">
      <div class="field"><label>Company name *</label><input id="c_name" placeholder="e.g. Air Works India"></div>
      <div class="field"><label>Industry</label>${industrySelect('c_ind','')}</div>
      <div class="field"><label>Type</label>${typeSelect('c_type','Prospect')}</div>
      <div class="field"><label>Stage</label>${stageSelect('c_stage',1)}</div>
    </div>
    <div class="field" style="margin-bottom:10px"><label>Owners — choose one or more</label>
      <div class="chkrow">${S.owners.map(o=>`<label class="ownchk"><input type="checkbox" class="c_own_chk" value="${esc(o)}" ${currentOwner===o?'checked':''}> ${esc(o)}</label>`).join('')}</div></div>
    <div class="field" style="margin-bottom:10px"><label>Locations — picks from masters; add if missing</label>
      ${acHtml('c_loc','loc','form','Start typing a city / site…')}
      <div id="c_locchips"></div></div>
    <div class="field"><label>What we can do for them — rich text</label>
      ${rtToolbar('c_offer')}<div class="richtext rt-lg" id="c_offer" contenteditable="true"></div></div>
    <div style="margin-top:10px"><button class="btn btn-primary" onclick="addCompany()">Save company</button>
    <button class="btn btn-ghost" onclick="toggleForm('cform')">Cancel</button></div>
  </div>`;
}
let formLocs=[];
function drawFormLocs(){const el=$id('c_locchips');
  if(el)el.innerHTML=formLocs.map((l,i)=>`<span class="locchip">📍 ${esc(l)}<button class="x" onclick="dropFormLoc(${i})">✕</button></span>`).join('');}
function dropFormLoc(i){formLocs.splice(i,1);drawFormLocs();}
function addCompany(){
  const name=$id('c_name').value.trim();if(!name)return alert('Company name is required.');
  let ind=$id('c_ind').value;
  if(ind==='__new__'){ind=(prompt('New industry name:')||'').trim();
    if(ind&&!indByName(ind))S.industries.push({id:uid(),name:ind,sector:'',priority:'None',prospects:0,goal:'',strategy:'',potentials:'',projects:'',notes:''});}
  const owners=[...document.querySelectorAll('.c_own_chk:checked')].map(x=>x.value);
  if(!owners.length)return alert('Choose at least one owner.');
  const leftover=canonLoc($id('c_loc').value);
  if(leftover&&!formLocs.some(l=>l.toLowerCase()===leftover.toLowerCase()))formLocs.push(leftover);
  const c={id:uid(),name,industry:ind,type:$id('c_type').value,owners,
    stage:+$id('c_stage').value,locations:[...formLocs],
    offer:$id('c_offer').innerHTML,notes:'',productIds:[],productNotes:'',comments:[]};
  S.companies.push(c);
  formLocs.forEach(l=>{if(!S.locations.some(x=>x.toLowerCase()===l.toLowerCase()))S.locations.push(l);});
  formLocs=[];markDirty();openCompany(c.id);
}

/* ---------- COMPANY: full page ---------- */
function viewCompanyPage(c){
  const ppl=peopleOf(c.id), tds=todosOf(c.id);
  return `
  <button class="btn btn-ghost" onclick="closeCompanyPage()">← Back to companies</button>
  <div class="page">
    <div class="pagehead">
      <h1>${esc(c.name)}</h1>
      ${typeTag(c.type)} ${c.industry?`<span class="tag">${esc(c.industry)}</span>`:''} <span class="tag stage">${stageName(c.stage)}</span> ${ownerPills(c.owners)}
      ${isAdmin()?`<span class="rowbtns"><button class="edit" onclick="renameCompany('${c.id}')">✏ rename</button>
      <button class="del" onclick="delCompany('${c.id}')">delete company</button></span>`
      :'<span class="hint" style="margin-left:auto">rename / delete — admin only</span>'}
    </div>
    <div class="pagegrid">
      <div>
        <div class="panel"><div class="st">What we can do for them — rich text</div>
          ${rtToolbar('offer-'+c.id)}<div class="richtext rt-lg" id="offer-${c.id}" contenteditable="true" onblur="saveOffer('${c.id}')">${c.offer||''}</div></div>

        <div class="panel"><div class="st">Locations & people</div>
          ${(c.locations&&c.locations.length)?c.locations.map(loc=>{
            const here=ppl.filter(p=>p.location===loc);
            return `<div class="mini"><span class="tag orange">📍 ${esc(loc)}</span>
              ${here.length?here.map(p=>`<span class="linkish" onclick="openPersonModal('${p.id}')">${esc(p.name)}</span>${p.designation?` <span class="hint">(${esc(p.designation)})</span>`:''}${p.linkedin?` <a class="lnk" href="${esc(p.linkedin)}" target="_blank">in↗</a>`:''}`).join(' · '):'<span class="hint">no people here yet</span>'}
              <span class="rowbtns"><button class="del" onclick="removeLocation('${c.id}','${enc(loc)}')">remove</button></span></div>`;}).join('')
            :'<div class="hint">No locations yet.</div>'}
          <div class="inline-add">${acHtml('loc-'+c.id,'loc',c.id,'Add a location — picks from masters…')}</div>
          ${ppl.filter(p=>!p.location||!(c.locations||[]).includes(p.location)).map(p=>`<div class="mini"><span class="who linkish" onclick="openPersonModal('${p.id}')">${esc(p.name)}</span><span class="hint">${esc(p.designation||'')} ${p.location?'· '+esc(p.location):'· location not set'}</span></div>`).join('')}
          <div class="inline-add">
            <input id="pn-${c.id}" placeholder="Person name" onkeydown="if(event.key==='Enter')quickAddPerson('${c.id}')">
            <input id="pd-${c.id}" placeholder="Designation" onkeydown="if(event.key==='Enter')quickAddPerson('${c.id}')">
            <select id="pl-${c.id}"><option value="">Location…</option>${(c.locations||[]).map(l=>`<option>${esc(l)}</option>`).join('')}</select>
            ${ownerSelect('po-'+c.id,currentUser||(c.owners||[])[0]||S.owners[0])}
            <button class="btn btn-ghost btn-sm" onclick="quickAddPerson('${c.id}')">Add person</button></div></div>

        <div class="panel"><div class="st">Products for this customer — type to add multiple</div>
          <div>${(c.productIds||[]).map(pid=>{const pr=productById(pid);if(!pr)return '';
            return `<span class="prodchip">${pr.img?`<img src="${pr.img}">`:''}${esc(pr.name)}<button class="x" onclick="unlinkProduct('${c.id}','${pid}')">✕</button></span>`;}).join('')||'<span class="hint">No products linked yet.</span>'}</div>
          <div class="inline-add">${acHtml('pp-'+c.id,'prod',c.id,'Type a product — picks from masters, adds if missing…')}</div>
          <textarea id="pnotes-${c.id}" rows="3" placeholder="Continuous notes — how these products fit this customer…" onchange="saveProdNotes('${c.id}')">${esc(c.productNotes||'')}</textarea></div>

        <div class="panel"><div class="st">Deals</div>
          ${(()=>{const ds=S.deals.filter(x=>x.companyId===c.id).sort((a,b)=>(+b.amount||0)-(+a.amount||0));
            if(!ds.length)return '<div class="hint">No deals for this customer yet.</div>';
            const open=ds.filter(isOpen);
            return `<div class="hint" style="margin-bottom:6px">${open.length} open · ${fmtMoney(open.reduce((s,d)=>s+(+d.amount||0),0))} in play</div>`+
              ds.map(d=>{const ch=d.chance??localChance(d).chance;
              return `<div class="mini"><span class="who linkish" onclick="openDealModal('${d.id}')">${esc(d.name)}</span>
                <span class="tag stage">${esc(dealStageName(d.stage))}</span>
                <span class="damt" style="font-weight:800;color:var(--orange)">${fmtMoney(d.amount)}</span>
                <span class="chip-chance" style="background:${chanceColor(ch)}">${ch}%</span>
                ${ownerPill(d.owner)}</div>`;}).join('');})()}
          <div class="inline-add"><button class="btn btn-ghost btn-sm" onclick="openDealModal(null,'${c.id}')">+ Add a deal for ${esc(c.name)}</button></div></div>

        <div class="panel"><div class="st">To-dos</div>
          ${tds.map(t=>`<div class="mini"><input type="checkbox" style="width:16px;height:16px;accent-color:var(--orange)" ${t.status==='done'?'checked':''} onclick="event.stopPropagation();toggleTodo('${t.id}')"><span class="linkish" onclick="openTodoModal('${t.id}')">${esc(t.text)}</span>${ownerPill(t.owner)}${t.due?`<span class="hint">due ${esc(fmtD(t.due))}</span>`:''}</div>`).join('')||'<div class="hint">None yet.</div>'}
          <div class="inline-add"><input id="td-${c.id}" placeholder="New to-do — press Enter to add another…" onkeydown="if(event.key==='Enter')quickAddTodo('${c.id}')">
            ${ownerSelect('to-'+c.id,currentUser||(c.owners||[])[0]||S.owners[0])}
            <button class="btn btn-ghost btn-sm" onclick="quickAddTodo('${c.id}')">Add to-do</button></div></div>

        <div class="panel"><div class="st">Comments — team discussion</div>
          ${(c.comments||[]).map(cm=>`<div class="comment"><div class="cmeta">${ownerPill(cm.author)}<span class="hint">${esc(fmtDT(cm.at))}</span></div><div>${esc(cm.text)}</div></div>`).join('')||'<div class="hint">No comments yet.</div>'}
          <div class="inline-add"><input id="cm-${c.id}" placeholder="Write a comment as ${esc(currentUser)}…" onkeydown="if(event.key==='Enter')addComment('${c.id}')"><button class="btn btn-ghost btn-sm" onclick="addComment('${c.id}')">Post</button></div></div>
      </div>
      <div>
        <div class="panel"><div class="st">Account settings</div>
          <div class="kv"><div class="k">Owners</div>
            <div class="chkrow" style="margin-top:4px">${S.owners.map(o=>`<label class="ownchk"><input type="checkbox" class="ownchk-${c.id}" value="${esc(o)}" ${(c.owners||[]).includes(o)?'checked':''} onchange="updateOwners('${c.id}')"> ${esc(o)}</label>`).join('')}</div></div>
          <div class="kv"><div class="k">Stage</div>${stageSelect('stg-'+c.id,c.stage)}<button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="setStage('${c.id}')">Update stage</button></div>
          <div class="kv"><div class="k">Type</div>${typeSelect('typ-'+c.id,c.type)}<button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="setCompanyType('${c.id}')">Update type</button></div>
          <div class="kv"><div class="k">Industry</div>${industrySelect('cind-'+c.id,c.industry)}<button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="setCompanyIndustry('${c.id}')">Update industry</button></div></div>
        ${evaBriefPanel(c)}
      </div>
    </div>
  </div>`;
}
function evaCtx(c){
  return {industry:indByName(c.industry)||null, people:peopleOf(c.id), todos:todosOf(c.id),
    products:(c.productIds||[]).map(productById).filter(Boolean), stages:S.stages};
}
const fmtDay=d=>{if(!d)return '—';const x=new Date(d);
  return isNaN(x)?'—':x.toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'});};

function evaBriefPanel(c){
  const live=buildEva(c,evaCtx(c));
  const eva=c.eva;
  const head=`<div class="st" style="display:flex;align-items:center;gap:6px">EVA BRIEF
    <span style="margin-left:auto"></span>
    <button class="btn btn-ghost btn-sm" id="evaresbtn-${c.id}" onclick="researchEva('${c.id}')" title="Search the web and write a Nandan-specific brief on this company">🌐 Research</button>
    <button class="btn btn-navy btn-sm" onclick="copyEva('${c.id}')">Copy brief</button></div>`;

  // First time: no cadence choice — just generate it.
  if(!eva)return `<div class="panel eva">${head}
    <div class="evanote">Live preview — not saved yet. <b>Generate</b> it once and it will then refresh
      automatically on a schedule you choose.</div>
    ${live.html}
    <div style="margin-top:12px"><button class="btn btn-primary btn-sm" onclick="generateEva('${c.id}')">✨ Generate EVA brief</button></div>
  </div>`;

  // After the first time: cadence dropdown + refresh state.
  const due=isDue(eva), stale=eva.text!==live.text;
  return `<div class="panel eva">${head}
    <div class="evabar">
      <span class="hint">Last refreshed <b>${fmtDay(eva.at)}</b> · next ${fmtDay(nextDueAt(eva))}</span>
      <span class="evafreq">Refresh every
        <select id="evafreq-${c.id}" onchange="setEvaFreq('${c.id}')">${EVA_FREQ.map(f=>
          `<option value="${f.key}" ${f.key===(eva.freq||DEFAULT_FREQ)?'selected':''}>${f.label}</option>`).join('')}</select></span>
      <button class="btn btn-ghost btn-sm" onclick="refreshEva('${c.id}')">⟳ Refresh now</button>
    </div>
    ${due?'<div class="evaflag due">⚠ Due for refresh — tonight&rsquo;s run will rebuild it, or refresh now.</div>'
      :stale?'<div class="evaflag stale">● The plan changed since this brief was built.</div>':''}
    ${eva.html}
  </div>`;
}
function generateEva(cid){const c=companyById(cid);if(!c)return;
  c.eva=makeEva(c,evaCtx(c));markDirty();render();}
const refreshEva=generateEva;
function setEvaFreq(cid){const c=companyById(cid);if(!c||!c.eva)return;
  c.eva.freq=$id('evafreq-'+cid).value;markDirty();render();}
function copyEva(cid){const c=companyById(cid);if(!c)return;
  const txt=(c.eva&&c.eva.text)||buildEva(c,evaCtx(c)).text;
  navigator.clipboard.writeText(txt).then(()=>alert('EVA brief copied — paste into email / WhatsApp / doc.')).catch(()=>alert(txt));}
function saveOffer(cid){const el=$id('offer-'+cid);if(!el)return;
  const c=companyById(cid);if(c.offer!==el.innerHTML){c.offer=el.innerHTML;markDirty();}}
function addComment(cid){if(!currentUser)return alert('You are not signed in.');
  const inp=$id('cm-'+cid);const v=inp.value.trim();if(!v)return;
  companyById(cid).comments.push({id:uid(),author:currentUser,text:v,at:new Date().toISOString()});
  markDirty();render();}
function renameCompany(cid){if(!isAdmin())return alert('Only an admin can rename a company.');
  const c=companyById(cid);const nn=(prompt('Rename company:',c.name)||'').trim();
  if(nn&&nn!==c.name){c.name=nn;markDirty();render();}}
function delCompany(cid){if(!isAdmin())return alert('Only an admin can delete a company.');
  const c=companyById(cid);if(!confirm(`Delete ${c.name}? Its people and to-dos will also be removed.`))return;
  S.companies=S.companies.filter(x=>x.id!==cid);S.people=S.people.filter(p=>p.companyId!==cid);
  S.todos=S.todos.filter(t=>t.companyId!==cid);detailId=null;markDirty();render();}
function removeLocation(cid,e){const loc=dec(e);const c=companyById(cid);c.locations=c.locations.filter(l=>l!==loc);markDirty();render();}
function quickAddPerson(cid){const n=$id('pn-'+cid).value.trim();if(!n)return;
  const c=companyById(cid), own=$id('po-'+cid);
  S.people.push({id:uid(),name:n,companyId:cid,designation:$id('pd-'+cid).value.trim(),
    location:$id('pl-'+cid).value,owner:(own&&own.value)||currentUser||(c.owners||[])[0]||S.owners[0],
    phone:'',email:'',linkedin:'',notes:''});
  markDirty();render();focusAfterRender('pn-'+cid);}
function quickAddTodo(cid){const v=$id('td-'+cid).value.trim();if(!v)return;
  notifyAssign('todo',currentUser||((companyById(cid)||{}).owners||[])[0],v,(companyById(cid)||{}).name);
  const c=companyById(cid), own=$id('to-'+cid);
  S.todos.push({id:uid(),text:v,companyId:cid,owner:(own&&own.value)||currentUser||(c.owners||[])[0]||S.owners[0],due:'',status:'open'});
  markDirty();render();focusAfterRender('td-'+cid);}
function focusAfterRender(id){const el=$id(id);if(el){el.value='';el.focus();}}
function setStage(cid){companyById(cid).stage=+$id('stg-'+cid).value;markDirty();render();}
function setCompanyType(cid){companyById(cid).type=$id('typ-'+cid).value;markDirty();render();}
function setCompanyIndustry(cid){let v=$id('cind-'+cid).value;
  if(v==='__new__'){v=(prompt('New industry name:')||'').trim();
    if(v&&!indByName(v))S.industries.push({id:uid(),name:v,sector:'',priority:'None',prospects:0,goal:'',strategy:'',potentials:'',projects:'',notes:''});}
  companyById(cid).industry=v;markDirty();render();}
function updateOwners(cid){const owners=[...document.querySelectorAll('.ownchk-'+CSS.escape(cid)+':checked')].map(x=>x.value);
  if(!owners.length){alert('A company needs at least one owner.');render();return;}
  companyById(cid).owners=owners;markDirty();render();}
function unlinkProduct(cid,pid){const c=companyById(cid);c.productIds=(c.productIds||[]).filter(x=>x!==pid);markDirty();render();}
function saveProdNotes(cid){companyById(cid).productNotes=$id('pnotes-'+cid).value;markDirty();renderTabs();}
function jumpToCompany(cid){openCompany(cid);}

/* ---------- INDUSTRIES: table with highlights ---------- */
function viewIndustries(){
  let list=S.industries.filter(i=>(!fSector||i.sector===fSector)&&(!fPriority||i.priority===fPriority)&&match(i.name,i.sector,i.priority,i.goal,i.notes));
  const cCount=n=>S.companies.filter(c=>c.industry===n&&ownersOk(c.owners)).length;
  const pCount=n=>S.products.filter(p=>(p.industries||[]).includes(n)).length;
  list.sort((a,b)=>{
    const v={name:x=>x.name,sector:x=>x.sector||'',priority:x=>PRIO_ORDER[x.priority]??4,prospects:x=>x.prospects||0,
      goal:x=>x.goal||'',companies:x=>cCount(x.name),products:x=>pCount(x.name)}[indSortKey];
    const av=v(a),bv=v(b);return (typeof av==='number'?av-bv:(''+av).localeCompare(''+bv))*indSortDir;});
  const focus=S.industries.filter(i=>i.goal==='FOCUS');
  const highest=S.industries.filter(i=>i.priority==='Highest');
  const totProspects=S.industries.reduce((s,i)=>s+(i.prospects||0),0);
  const sectors=[...new Set(S.industries.map(i=>i.sector).filter(Boolean))].sort();
  const arrow=k=>indSortKey===k?(indSortDir>0?' ▲':' ▼'):'';
  const th=(k,l)=>`<th onclick="setIndSort('${k}')">${l}${arrow(k)}</th>`;
  return `
  <div class="toolrow"><h2>Industries</h2><span class="hint">${list.length} shown · click a row to open</span>
    <div class="spacer"></div>
    <div class="inline-add" style="margin:0"><input id="newInd" placeholder="New industry…" style="min-width:170px"><button class="btn btn-primary" onclick="addIndustry()">+ Add</button></div></div>
  <div class="tiles">
    <div class="tile"><div class="big">${S.industries.length}</div><div class="sm">Industries</div></div>
    <div class="tile o"><div class="big">${focus.length}</div><div class="sm">FOCUS industries</div></div>
    <div class="tile"><div class="big">${highest.length}</div><div class="sm">Highest priority</div></div>
    <div class="tile o"><div class="big">${totProspects.toLocaleString('en-IN')}</div><div class="sm">Prospects in ERP</div></div>
    <div class="tile"><div class="big">${S.companies.length}</div><div class="sm">Companies in plan</div></div>
  </div>
  <div class="filters">
    <select onchange="setFilter('fSector',this.value)"><option value="">All sectors</option>${sectors.map(s=>`<option ${fSector===s?'selected':''}>${esc(s)}</option>`).join('')}</select>
    <select onchange="setFilter('fPriority',this.value)"><option value="">All priorities</option>${['Highest','High','Medium','Low'].map(p=>`<option ${fPriority===p?'selected':''}>${p}</option>`).join('')}</select>
    ${(fSector||fPriority)?`<button class="btn btn-ghost btn-sm" onclick="clearFilters('fSector','fPriority')">✕ Clear</button>`:''}
  </div>
  <div class="tblwrap"><table class="tbl">
    <thead><tr>${th('name','Industry')}${th('sector','Sector')}${th('priority','Priority')}${th('prospects','Prospects in ERP')}${th('goal','Goal')}${th('companies','Our companies')}${th('products','Products')}</tr></thead>
    <tbody>${list.map(i=>{
      const open=expandedInd===i.name;
      return `<tr class="${open?'sel':''}" onclick="toggleInd('${enc(i.name)}')">
        <td class="cname">${esc(i.name)}</td><td>${esc(i.sector||'—')}</td><td>${prioTag(i.priority)}</td>
        <td style="text-align:center">${i.prospects||0}</td><td>${goalTag(i.goal)||'—'}</td>
        <td style="text-align:center">${cCount(i.name)}</td><td style="text-align:center">${pCount(i.name)}</td></tr>
      ${open?`<tr class="detailrow"><td colspan="7">${indDetail(i)}</td></tr>`:''}`;}).join('')}</tbody></table></div>`;
}
function setIndSort(k){if(indSortKey===k)indSortDir=-indSortDir;else{indSortKey=k;indSortDir=k==='name'?1:-1;}render();}
function toggleInd(e){const n=dec(e);expandedInd=expandedInd===n?null:n;render();}
function indDetail(i){
  const comps=S.companies.filter(c=>c.industry===i.name&&ownersOk(c.owners)).sort(byName);
  const prods=S.products.filter(p=>(p.industries||[]).includes(i.name)).sort(byName);
  return `<div class="inddetail" onclick="event.stopPropagation()">
    <div class="field indnote"><label>What we do for this industry — and what happens</label>
      <textarea rows="3" data-ind="${enc(i.name)}" onchange="saveIndNote(this)" placeholder="Our offering for this industry, typical wins, what usually happens…">${esc(i.notes||'')}</textarea></div>
    ${i.strategy?`<div class="kv"><div class="k">Strategy for growth (from ERP)</div><div class="v hint">${mdlite(i.strategy)}</div></div>`:''}
    ${i.potentials?`<div class="kv"><div class="k">Potentials</div><div class="v">${mdlite(i.potentials)}</div></div>`:''}
    ${i.projects?`<div class="kv"><div class="k">Existing projects we have done</div><div class="v">${mdlite(i.projects)}</div></div>`:''}
    <div class="subsec"><div class="st">Our companies in ${esc(i.name)} — and where they are</div>
      ${comps.length?comps.map(c=>`<div class="mini"><span class="who">${esc(c.name)}</span>${typeTag(c.type)}
        <span class="tag orange">📍 ${(c.locations||[]).map(esc).join(' · ')||'no location'}</span>${ownerPills(c.owners)}
        <span class="rowbtns"><button class="edit" onclick="openCompany('${c.id}')">open</button></span></div>`).join('')
      :'<div class="hint">None yet for the selected owner filter.</div>'}</div>
    ${prods.length?`<div class="subsec"><div class="st">Products for this industry</div>
      ${prods.map(p=>`<div class="mini">${p.img?`<img class="prodthumb" style="width:26px;height:26px" src="${p.img}">`:''}<span class="who">${esc(p.name)}</span>${goalTag(p.goal)}
      <span class="rowbtns"><button class="edit" onclick="jumpToProduct('${p.id}')">open</button></span></div>`).join('')}</div>`:''}
    <div style="display:flex;gap:10px;margin-top:10px">
      <button class="edit" onclick="renameIndustry('${enc(i.name)}')">✏ rename industry</button>
      ${!S.companies.some(c=>c.industry===i.name)?`<button class="del" onclick="delIndustry('${enc(i.name)}')">delete industry</button>`:''}
    </div></div>`;
}
function addIndustry(){const v=$id('newInd').value.trim();if(!v)return;
  if(!S.industries.some(i=>i.name.toLowerCase()===v.toLowerCase()))
    S.industries.push({id:uid(),name:v,sector:'',priority:'None',prospects:0,goal:'',strategy:'',potentials:'',projects:'',notes:''});
  markDirty();render();}
function delIndustry(e){const n=dec(e);S.industries=S.industries.filter(i=>i.name!==n);
  S.products.forEach(p=>{p.industries=(p.industries||[]).filter(x=>x!==n);});
  if(expandedInd===n)expandedInd=null;markDirty();render();}
function renameIndustry(e){const old=dec(e);
  const nn=(prompt('Rename industry:',old)||'').trim();if(!nn||nn===old)return;
  const i=indByName(old);if(i)i.name=nn;
  S.companies.forEach(c=>{if(c.industry===old)c.industry=nn;});
  S.products.forEach(p=>{p.industries=(p.industries||[]).map(x=>x===old?nn:x);});
  if(expandedInd===old)expandedInd=nn;markDirty();render();}
function saveIndNote(el){const i=indByName(dec(el.dataset.ind));if(i){i.notes=el.value;markDirty();}}
function jumpToProduct(pid){currentTab='products';detailId=null;$id('searchBox').value=(productById(pid)||{}).name||'';render();
  const el=$id('card-'+pid);if(el)el.classList.add('open');}

/* ---------- PEOPLE ---------- */
function viewPeople(){
  const list=S.people.filter(p=>{const c=companyById(p.companyId);
    return ownerOk(p.owner)&&match(p.name,p.designation,p.location,c?c.name:'',p.email,p.phone,p.linkedin);}).sort(byName);
  return `
  <div class="toolrow"><h2>People</h2><span class="hint">${list.length} shown</span>
    <div class="spacer"></div><button class="btn btn-primary" onclick="toggleForm('pform')">+ Add person</button></div>
  <div class="filters">${ownerFilter(ownersUsedBy(S.people))}</div>
  <div class="addform" id="pform"><h3>New person</h3>
    <div class="grid">
      <div class="field"><label>Name *</label><input id="p_name"></div>
      <div class="field"><label>Company</label><select id="p_comp"><option value="">— none yet —</option>${S.companies.slice().sort(byName).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Designation</label><input id="p_desig" placeholder="e.g. Head of Procurement"></div>
      <div class="field"><label>Location</label>${acHtml('p_loc','loc','person','Picks from masters…')}</div>
      <div class="field"><label>Mobile</label><input id="p_phone"></div>
      <div class="field"><label>Email</label><input id="p_email"></div>
      <div class="field"><label>LinkedIn URL</label><input id="p_link" placeholder="https://www.linkedin.com/in/…"></div>
      <div class="field"><label>Owner</label>${ownerSelect('p_own',currentUser||(currentOwner!=='all'&&currentOwner!=='none'?currentOwner:''))}</div>
    </div>
    <div class="field"><label>Notes</label><textarea id="p_notes" rows="2" placeholder="Role in the deal, MAN status, coach?…"></textarea></div>
    <div style="margin-top:10px"><button class="btn btn-primary" onclick="addPerson()">Save person</button>
    <button class="btn btn-ghost" onclick="toggleForm('pform')">Cancel</button></div>
  </div>
  ${list.length?list.map(p=>{const c=companyById(p.companyId);
    return `<div class="card"><div class="card-head" onclick="toggleCard(this)">
      <span class="name linkish" onclick="event.stopPropagation();openPersonModal('${p.id}')">${esc(p.name)}</span>
      ${p.designation?`<span class="hint">${esc(p.designation)}</span>`:''}
      ${c?`<span class="tag">${esc(c.name)}</span>`:''}
      ${p.location?`<span class="tag orange">📍 ${esc(p.location)}</span>`:''}
      ${p.linkedin?`<a class="lnk" href="${esc(p.linkedin)}" target="_blank" onclick="event.stopPropagation()">in LinkedIn ↗</a>`:''}
      ${ownerPill(p.owner)}<span class="caret">▶</span></div>
      <div class="card-body">
        <div class="grid" style="margin-top:10px">
          <div class="kv"><div class="k">Mobile</div><div class="v">${esc(p.phone)||'—'}</div></div>
          <div class="kv"><div class="k">Email</div><div class="v">${p.email?`<a class="lnk" href="mailto:${esc(p.email)}">${esc(p.email)}</a>`:'—'}</div></div>
          <div class="kv"><div class="k">LinkedIn</div><div class="v">${p.linkedin?`<a class="lnk" href="${esc(p.linkedin)}" target="_blank">${esc(p.linkedin)}</a>`:'—'}</div></div>
          <div class="kv"><div class="k">Company</div><div class="v">${c?esc(c.name):'—'}</div></div>
        </div>
        ${p.notes?`<div class="kv"><div class="k">Notes</div><div class="v">${esc(p.notes)}</div></div>`:''}
        <div style="display:flex;gap:8px;margin-top:8px"><button class="edit" onclick="openPersonModal('${p.id}')">edit</button>
        <button class="del" onclick="delPerson('${p.id}')">delete</button></div>
      </div></div>`;}).join('')
   :'<div class="empty"><b>No people yet.</b><br>Add contacts here, or inside a company page.</div>'}`;
}
function addPerson(){const n=$id('p_name').value.trim();if(!n)return alert('Name is required.');
  const loc=canonLoc($id('p_loc').value);
  const cid=$id('p_comp').value;
  let link=$id('p_link').value.trim();
  if(link&&!/^https?:\/\//i.test(link))link='https://'+link;
  S.people.push({id:uid(),name:n,companyId:cid,designation:$id('p_desig').value.trim(),
    location:loc,phone:$id('p_phone').value.trim(),email:$id('p_email').value.trim(),
    linkedin:link,owner:$id('p_own').value,notes:$id('p_notes').value.trim()});
  if(loc){if(!S.locations.some(l=>l.toLowerCase()===loc.toLowerCase()))S.locations.push(loc);
    const c=companyById(cid);if(c){c.locations=c.locations||[];if(!c.locations.some(l=>l.toLowerCase()===loc.toLowerCase()))c.locations.push(loc);}}
  markDirty();render();}
function editPerson(pid){const p=S.people.find(x=>x.id===pid);
  const f=(label,cur)=>{const v=prompt(label,cur||'');return v===null?cur:v;};
  p.name=f('Name:',p.name);p.designation=f('Designation:',p.designation);p.location=canonLoc(f('Location:',p.location));
  p.phone=f('Mobile:',p.phone);p.email=f('Email:',p.email);p.linkedin=f('LinkedIn URL:',p.linkedin);p.notes=f('Notes:',p.notes);markDirty();render();}
function delPerson(pid){if(!confirm('Delete this person?'))return;S.people=S.people.filter(p=>p.id!==pid);markDirty();render();}

/* ---------- LOCATIONS ---------- */
function viewLocations(){
  const locs=allLocations().filter(l=>match(l));
  const rows=locs.map(loc=>({loc,
    comps:S.companies.filter(c=>(c.locations||[]).includes(loc)&&ownersOk(c.owners)).sort(byName),
    ppl:S.people.filter(p=>p.location===loc&&ownerOk(p.owner)).sort(byName),
    coords:coordsFor(loc)}));
  const onMap=rows.filter(r=>r.coords), offMap=rows.filter(r=>!r.coords);
  return `
  <div class="toolrow"><h2>Locations</h2><span class="hint">Master list — every tab picks from here</span>
    <div class="spacer"></div>
    <div style="min-width:260px">${acHtml('newLoc','loc','master','Add a location to masters…')}</div></div>
  <div class="locgrid">
    <div>${rows.length?rows.map(r=>`<div class="card" id="loc-${enc(r.loc)}"><div class="card-head" onclick="toggleCard(this)">
      <span class="name">📍 ${esc(r.loc)}</span><span class="tag">${r.comps.length} companies</span>
      <span class="tag orange">${r.ppl.length} people</span>
      ${r.coords?'':'<span class="hint">not on the map</span>'}
      ${isAdmin()?`<button class="edit" onclick="event.stopPropagation();renameLocation('${enc(r.loc)}')">✏ edit</button>`:''}<span class="caret">▶</span></div>
      <div class="card-body">
        <div class="subsec"><div class="st">Companies here</div>
        ${r.comps.length?r.comps.map(c=>`<div class="mini"><span class="who">${esc(c.name)}</span>${typeTag(c.type)}<span class="hint">${esc(c.industry||'')}</span>${ownerPills(c.owners)}<span class="rowbtns"><button class="edit" onclick="openCompany('${c.id}')">open</button></span></div>`).join(''):'<div class="hint">None recorded.</div>'}</div>
        <div class="subsec"><div class="st">People here</div>
        ${r.ppl.length?r.ppl.map(p=>{const c=companyById(p.companyId);
          return `<div class="mini"><span class="who linkish" onclick="openPersonModal('${p.id}')">${esc(p.name)}</span><span class="hint">${esc(p.designation||'')}${c?' · '+esc(c.name):''}</span>${ownerPill(p.owner)}</div>`;}).join(''):'<div class="hint">None recorded.</div>'}</div>
        ${(!r.comps.length&&!r.ppl.length&&S.locations.includes(r.loc))?`<button class="del" style="margin-top:8px" onclick="delMasterLoc('${enc(r.loc)}')">delete location</button>`:''}
      </div></div>`).join(''):'<div class="empty"><b>No locations yet.</b><br>Add one above — every company, person and form then picks from this master list.</div>'}
    </div>
    ${locationMap(onMap,offMap)}
  </div>`;
}

function locationMap(onMap,offMap){
  const W=420,H=Math.round(W*GEO.aspect);
  const toPath=poly=>poly.map(([nx,ny],i)=>`${i?'L':'M'}${(nx/1000*W).toFixed(1)},${(ny/1000*H).toFixed(1)}`).join('')+'Z';
  const path=toPath(INDIA_OUTLINE);
  const peak=Math.max(1,...onMap.map(r=>r.comps.length+r.ppl.length));
  return `<div class="mapcard">
    <div class="st">Where we are</div>
    <div class="hint">${onMap.length} of ${onMap.length+offMap.length} locations placed · dot size = companies + people</div>
    <div style="position:relative">
      <svg class="mapsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of India (Survey of India boundary) showing our locations">
        <path class="land" d="${path}"></path>
        ${INDIA_ISLANDS.map(p=>`<path class="land" d="${toPath(p)}"></path>`).join('')}
        ${onMap.map(r=>{const [x,y]=project(r.coords[0],r.coords[1],W,H);
          const n=r.comps.length+r.ppl.length;
          const rad=(5+Math.sqrt(n/peak)*9).toFixed(1);
          return `<circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad}"
            onmousemove="mapTip(event,'${esc(r.loc)}','${r.comps.length}','${r.ppl.length}')"
            onmouseleave="mapTipOff()" onclick="jumpToLocation('${enc(r.loc)}')"></circle>`;}).join('')}
      </svg>
      <div class="maptip" id="maptip"></div>
    </div>
    <div class="hint" style="margin-top:8px">Boundary traced from the Survey of India Political Map of India, 13th Edition (2026).</div>
    ${offMap.length?`<div class="hint" style="margin-top:6px">Not placed: ${offMap.map(r=>esc(r.loc)).join(', ')}</div>`:''}
  </div>`;
}
function mapTip(ev,loc,comps,ppl){
  const tip=$id('maptip');if(!tip)return;
  const box=tip.parentElement.getBoundingClientRect();
  tip.innerHTML=`<b>${loc}</b><br>${comps} compan${comps==1?'y':'ies'} · ${ppl} ${ppl==1?'person':'people'}`;
  tip.style.left=(ev.clientX-box.left)+'px';tip.style.top=(ev.clientY-box.top)+'px';
  tip.classList.add('on');
}
function mapTipOff(){const t=$id('maptip');if(t)t.classList.remove('on');}
function jumpToLocation(e){
  const el=$id('loc-'+e);if(!el)return;
  el.classList.add('open');el.scrollIntoView({behavior:'smooth',block:'center'});
}

function delMasterLoc(e){const l=dec(e);S.locations=S.locations.filter(x=>x!==l);markDirty();render();}
function renameLocation(e){
  if(!isAdmin())return alert('Only an admin can edit locations.');
  const old=dec(e);
  const nn=(prompt('Rename location:',old)||'').trim();
  if(!nn||nn===old)return;
  const existing=allLocations().find(l=>l.toLowerCase()===nn.toLowerCase()&&l.toLowerCase()!==old.toLowerCase());
  const target=existing||nn;
  if(existing&&!confirm(`"${existing}" already exists.\n\nMerge "${old}" into "${existing}"? Every company and person here moves over.`))return;
  S.locations=S.locations.filter(l=>l.toLowerCase()!==old.toLowerCase());
  if(!S.locations.some(l=>l.toLowerCase()===target.toLowerCase()))S.locations.push(target);
  S.companies.forEach(c=>{
    if(!(c.locations||[]).length)return;
    const had=c.locations.some(l=>l.toLowerCase()===old.toLowerCase());
    if(!had)return;
    c.locations=c.locations.filter(l=>l.toLowerCase()!==old.toLowerCase());
    if(!c.locations.some(l=>l.toLowerCase()===target.toLowerCase()))c.locations.push(target);
  });
  S.people.forEach(p=>{if((p.location||'').toLowerCase()===old.toLowerCase())p.location=target;});
  markDirty();render();
}

/* ---------- PRODUCTS ---------- */
let editingProduct=null,pendingImg='';
function viewProducts(){
  const list=S.products.filter(p=>match(p.name,p.detail,p.segment,p.goal,(p.industries||[]).join(' '))).sort(byName);
  const focus=S.products.filter(p=>p.goal==='FOCUS').length;
  return `
  <div class="toolrow"><h2>Products</h2><span class="hint">${list.length} shown · ${focus} FOCUS</span>
    <div class="spacer"></div><button class="btn btn-primary" onclick="openProductForm()">+ Add product</button></div>
  <div class="addform" id="prform"><h3 id="prtitle">New product</h3>
    <div class="grid">
      <div class="field"><label>Product name *</label><input id="pr_name"></div>
      <div class="field"><label>Small image</label><input type="file" id="pr_img" accept="image/*" onchange="readProdImage(this)">
        <div id="pr_imgprev" style="margin-top:6px"></div></div>
    </div>
    <div class="field"><label>Detail (rich text)</label>
      ${rtToolbar()}<div class="richtext" id="pr_detail" contenteditable="true"></div></div>
    <div style="margin-top:10px"><button class="btn btn-primary" onclick="saveProduct()">Save product</button>
    <button class="btn btn-ghost" onclick="closeProductForm()">Cancel</button></div>
  </div>
  ${list.length?list.map(pr=>{
    const linked=S.companies.filter(c=>(c.productIds||[]).includes(pr.id)&&ownersOk(c.owners)).sort(byName);
    return `<div class="card" id="card-${pr.id}"><div class="card-head" onclick="toggleCard(this)">
      ${pr.img?`<img class="prodthumb zoomable" src="${pr.img}" onclick="event.stopPropagation();showImg(this.src)">`:`<div class="prodthumb noimg">${esc((pr.name||'?')[0].toUpperCase())}</div>`}
      <span class="name">${esc(pr.name)}</span>
      ${pr.segment?`<span class="tag">${esc(pr.segment)}</span>`:''}${goalTag(pr.goal)}
      ${(pr.industries||[]).slice(0,3).map(i=>`<span class="tag">${esc(i)}</span>`).join('')}
      <span class="tag orange">${linked.length} customer${linked.length===1?'':'s'}</span>
      <span class="caret">▶</span></div>
      <div class="card-body">
        ${pr.img?`<img class="prodimg-lg zoomable" src="${pr.img}" title="Click to enlarge" onclick="showImg(this.src)">`:''}
        <div class="kv"><div class="k">Detail</div><div class="rt-view">${pr.detail||'<i style="color:#999">No detail yet</i>'}</div></div>
        ${pr.strategy?`<div class="kv"><div class="k">Strategy (from ERP)</div><div class="v hint">${mdlite(pr.strategy)}</div></div>`:''}
        <div class="subsec"><div class="st">Industries where this product plays</div>
          <div>${(pr.industries||[]).map(i=>`<span class="prodchip">${esc(i)}<button class="x" onclick="unlinkIndFromProduct('${pr.id}','${enc(i)}')">✕</button></span>`).join('')||'<span class="hint">No industries tagged yet.</span>'}</div>
          <div class="inline-add">
            <select id="li-${pr.id}"><option value="">Tag an industry…</option>${allIndustryNames().filter(i=>!(pr.industries||[]).includes(i)).map(i=>`<option value="${enc(i)}">${esc(i)}</option>`).join('')}</select>
            <button class="btn btn-ghost btn-sm" onclick="linkIndToProduct('${pr.id}')">Tag industry</button></div></div>
        <div class="subsec"><div class="st">Linked customers</div>
          ${linked.length?linked.map(c=>`<div class="mini"><span class="who">${esc(c.name)}</span>${typeTag(c.type)}
            ${c.productNotes?`<span class="hint" style="flex-basis:100%;white-space:pre-wrap">${esc(c.productNotes)}</span>`:''}
            <span class="rowbtns"><button class="edit" onclick="openCompany('${c.id}')">open</button></span></div>`).join('')
          :'<div class="hint">Not linked to any customer yet — type the product name inside a company page.</div>'}</div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="edit" onclick="editProduct('${pr.id}')">edit</button>
          <button class="del" onclick="delProduct('${pr.id}')">delete</button></div>
      </div></div>`;}).join('')
   :'<div class="empty"><b>No products match.</b></div>'}`;
}
function readProdImage(input){const f=input.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=()=>{const img=new Image();
    img.onload=()=>{const max=280;const sc=Math.min(1,max/Math.max(img.width,img.height));
      const cv=document.createElement('canvas');cv.width=Math.round(img.width*sc);cv.height=Math.round(img.height*sc);
      cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
      pendingImg=cv.toDataURL('image/jpeg',0.82);
      $id('pr_imgprev').innerHTML=`<img class="prodthumb" style="width:56px;height:56px" src="${pendingImg}">`;};
    img.src=r.result;};
  r.readAsDataURL(f);}
function openProductForm(){editingProduct=null;pendingImg='';
  $id('prform').classList.add('open');
  $id('prtitle').textContent='New product';
  $id('pr_name').value='';$id('pr_detail').innerHTML='';
  $id('pr_imgprev').innerHTML='';$id('pr_img').value='';}
function closeProductForm(){$id('prform').classList.remove('open');editingProduct=null;pendingImg='';}
function editProduct(pid){const pr=productById(pid);editingProduct=pid;pendingImg=pr.img||'';
  $id('prform').classList.add('open');
  $id('prtitle').textContent='Edit product';
  $id('pr_name').value=pr.name;
  $id('pr_detail').innerHTML=pr.detail||'';
  $id('pr_imgprev').innerHTML=pr.img?`<img class="prodthumb" style="width:56px;height:56px" src="${pr.img}">`:'';
  window.scrollTo({top:0,behavior:'smooth'});}
function saveProduct(){const name=$id('pr_name').value.trim();if(!name)return alert('Product name is required.');
  const detail=$id('pr_detail').innerHTML;
  if(editingProduct){const pr=productById(editingProduct);pr.name=name;pr.detail=detail;pr.img=pendingImg;}
  else S.products.push({id:uid(),name,detail,img:pendingImg,segment:'',goal:'',strategy:'',industries:[]});
  closeProductForm();markDirty();render();}
function delProduct(pid){const pr=productById(pid);if(!confirm(`Delete product “${pr.name}”? It will be unlinked from all customers.`))return;
  S.products=S.products.filter(p=>p.id!==pid);
  S.companies.forEach(c=>{c.productIds=(c.productIds||[]).filter(x=>x!==pid);});markDirty();render();}
function linkIndToProduct(pid){const v=$id('li-'+pid).value;if(!v)return;
  const pr=productById(pid);const ind=dec(v);
  if(!pr.industries.includes(ind))pr.industries.push(ind);
  markDirty();render();const el=$id('card-'+pid);if(el)el.classList.add('open');}
function unlinkIndFromProduct(pid,e){const pr=productById(pid);
  pr.industries=(pr.industries||[]).filter(x=>x!==dec(e));
  markDirty();render();const el=$id('card-'+pid);if(el)el.classList.add('open');}

/* ---------- SALES PROCESS ---------- */
function viewProcess(){
  const comps=S.companies.filter(c=>ownersOk(c.owners));
  return `
  <div class="toolrow"><h2>Sales Process 2026 — Pipeline</h2><span class="hint">9 stages · 4 gates · read left to right</span></div>
  <div class="board">${S.stages.map(st=>{
    const here=comps.filter(c=>c.stage==st.n).sort(byName);
    return `<div class="col"><h4><span class="num">${st.n}</span>${esc(st.name)}</h4><div class="gate">${esc(st.gate)}</div>
      ${here.map(c=>`<div class="pcard"><div class="nm" style="cursor:pointer" onclick="openCompany('${c.id}')">${esc(c.name)}</div>
        <div class="hint">${esc(c.industry||'')}</div>${typeTag(c.type)} ${ownerPills(c.owners)}
        <div class="mv">${st.n>1?`<button onclick="moveStage('${c.id}',-1)">◀ Back</button>`:''}${st.n<9?`<button onclick="moveStage('${c.id}',1)">Next ▶</button>`:''}</div></div>`).join('')||'<div class="hint" style="font-size:12px">—</div>'}
    </div>`;}).join('')}</div>
  <div class="toolrow" style="margin-top:26px"><h2>Stage reference</h2><span class="hint">Condensed from the Nandan Sales Process 2026 (04 Aug 2026)</span></div>
  <div class="stagegrid">${S.stages.map(st=>`
    <div class="stg"><div class="top"><span class="n">${st.n}</span><h4>${esc(st.name)}</h4>${st.gate?`<span class="g">${esc(st.gate)}</span>`:''}</div>
    <div class="tagline">${esc(st.tagline)}</div>
    <ul>${st.pts.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}</div>
  <div class="toolrow" style="margin-top:26px"><h2>Standards</h2></div>
  <div class="bandrow">
    <div class="band"><div class="big">20%</div><div class="sm">Advance</div></div>
    <div class="band"><div class="big">30%</div><div class="sm">GAD approval</div></div>
    <div class="band"><div class="big">40%</div><div class="sm">Delivery + full GST</div></div>
    <div class="band o"><div class="big">10%</div><div class="sm">Commissioning</div></div>
  </div>
  <div class="weekrow">
    ${[["40","Prospect calls"],["50","Prospect emails"],["25","Follow-up calls"],["5","Screen recordings"],["4","Customer visits"],["5","Zoom calls"],["50+","Prospect bucket"],["2·2·1","Prospect·Learn·Strategy hrs"]].map(([b,s])=>`<div class="wk"><div class="big">${b}</div><div class="sm">${s}</div></div>`).join('')}
  </div>
  <div class="genie-note" style="margin-top:16px"><b>Rules that never change:</b> If it is not in ERP, it did not happen · One named owner, one dated next action · Every customer-facing number traces to an approved source · Know the margin on every case.</div>`;
}
function moveStage(cid,d){const c=companyById(cid);c.stage=Math.min(9,Math.max(1,(+c.stage||1)+d));markDirty();render();}

/* ---------- TODOS ---------- */
function viewTodos(){
  const list=S.todos.filter(t=>ownerOk(t.owner)&&match(t.text,(companyById(t.companyId)||{}).name)).sort((a,b)=>(a.status==='done')-(b.status==='done')||(a.due||'9999').localeCompare(b.due||'9999'));
  const today=new Date().toISOString().slice(0,10);
  return `
  <div class="toolrow"><h2>ToDo</h2><span class="hint">${list.filter(t=>t.status!=='done').length} open</span>
    <div class="spacer"></div>
    <button class="btn btn-navy" onclick="copyTodosForGenie()">Copy to-dos for Sales Genie</button>
    <button class="btn btn-primary" onclick="toggleForm('tform')">+ Add to-do</button></div>
  <div class="filters">${ownerFilter(ownersUsedBy(S.todos))}</div>
  <div class="genie-note">These to-dos are structured (id, owner, company, due date, status) so they can be synced into the main Sales Genie to-do list.</div>
  <div class="addform" id="tform"><h3>New to-do</h3>
    <div class="grid">
      <div class="field" style="grid-column:1/-1"><label>Task *</label><input id="t_text" placeholder="e.g. Send techno-commercial offer to…"></div>
      <div class="field"><label>Owner</label>${ownerSelect('t_own',currentUser||(currentOwner!=='all'&&currentOwner!=='none'?currentOwner:''))}</div>
      <div class="field"><label>Company</label><select id="t_comp"><option value="">— general —</option>${S.companies.slice().sort(byName).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Due date</label><input type="date" id="t_due"></div>
    </div>
    <div style="margin-top:6px"><button class="btn btn-primary" onclick="addTodo()">Save to-do</button>
    <button class="btn btn-ghost" onclick="toggleForm('tform')">Cancel</button></div>
  </div>
  ${list.length?list.map(t=>{const c=companyById(t.companyId);
    const overdue=t.due&&t.due<today&&t.status!=='done';
    return `<div class="todo ${t.status==='done'?'done':''}">
      <input type="checkbox" ${t.status==='done'?'checked':''} onchange="toggleTodo('${t.id}')">
      <div style="flex:1"><div class="txt linkish" onclick="openTodoModal('${t.id}')">${esc(t.text)}</div>
        <div class="meta">${ownerPill(t.owner)}${c?`<span class="tag" style="cursor:pointer" onclick="openCompany('${c.id}')">${esc(c.name)}</span>`:''}
        ${t.due?`<span class="${overdue?'overdue':''}">${overdue?'⚠ overdue ':''}due ${esc(fmtD(t.due))}</span>`:''}</div></div>
      ${isAdmin()?`<button class="del" onclick="delTodo('${t.id}')">delete</button>`:''}</div>`;}).join('')
   :'<div class="empty"><b>No to-dos.</b><br>Add tasks here or from inside a company page.</div>'}`;
}
function addTodo(){const v=$id('t_text').value.trim();if(!v)return alert('Task text is required.');
  const owner=$id('t_own').value;
  S.todos.push({id:uid(),text:v,owner,
    companyId:$id('t_comp').value,due:$id('t_due').value,status:'open'});
  notifyAssign('todo',owner,v,(companyById($id('t_comp').value)||{}).name);
  markDirty();render();}
function toggleTodo(id){const t=S.todos.find(x=>x.id===id);t.status=t.status==='done'?'open':'done';markDirty();render();}
function delTodo(id){if(!isAdmin())return alert('Only an admin can delete a to-do.');
  S.todos=S.todos.filter(t=>t.id!==id);markDirty();render();}
function copyTodosForGenie(){
  const payload=S.todos.map(t=>({id:t.id,task:t.text,owner:t.owner,company:(companyById(t.companyId)||{}).name||null,due:t.due||null,status:t.status,source:"my-sales-plan"}));
  navigator.clipboard.writeText(JSON.stringify(payload,null,2)).then(()=>alert('To-dos copied as JSON — paste into Sales Genie / share with Claude to sync.'))
  .catch(()=>alert(JSON.stringify(payload,null,2)));
}

/* ---------- modal: person & to-do lightboxes ---------- */
function toggleUserMenu(){const b=$id('userMenuBox');if(b)b.hidden=!b.hidden;}
document.addEventListener('click',e=>{
  const box=$id('userMenuBox');
  if(box&&!box.hidden&&!e.target.closest('.usermenu'))box.hidden=true;
});

function openModal(html){const w=$id('modal');$id('modalbox').innerHTML=html;w.classList.add('open');}
function closeModal(){$id('modal').classList.remove('open');render();}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$id('modal').classList.contains('open'))closeModal();});

function openPersonModal(pid){
  const p=S.people.find(x=>x.id===pid);if(!p)return;
  const c=companyById(p.companyId);
  const locs=[...new Set([...(c?c.locations||[]:[]),...allLocations()])];
  openModal(`
    <div class="modalhead"><h3>${esc(p.name)}</h3>${ownerPill(p.owner)}
      <button class="x" onclick="closeModal()">✕</button></div>
    <div class="modalbody">
      <div class="grid">
        <div class="field"><label>Name *</label><input id="m_pname" value="${esc(p.name)}"></div>
        <div class="field"><label>Designation</label><input id="m_pdesig" value="${esc(p.designation||'')}"></div>
        <div class="field"><label>Company</label><select id="m_pcomp"><option value="">— none —</option>${S.companies.slice().sort(byName).map(x=>`<option value="${x.id}" ${x.id===p.companyId?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Location</label><select id="m_ploc"><option value="">— none —</option>${locs.map(l=>`<option ${l===p.location?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label>Mobile</label><input id="m_pphone" value="${esc(p.phone||'')}"></div>
        <div class="field"><label>Email</label><input id="m_pemail" value="${esc(p.email||'')}"></div>
        <div class="field"><label>LinkedIn</label><input id="m_plink" value="${esc(p.linkedin||'')}" placeholder="https://www.linkedin.com/in/…"></div>
        <div class="field"><label>Salesperson</label>${ownerSelect('m_pown',p.owner||currentUser)}</div>
      </div>
      <div class="field" style="margin-top:10px"><label>Notes</label><textarea id="m_pnotes" rows="3" placeholder="Role in the deal, MAN status, coach?…">${esc(p.notes||'')}</textarea></div>
      ${c?`<div class="hint" style="margin-top:10px">Works at <b>${esc(c.name)}</b> · <span class="linkish" onclick="closeModal();openCompany('${c.id}')">open the company page</span></div>`:''}
    </div>
    <div class="modalfoot">
      <button class="btn btn-primary btn-sm" onclick="savePersonModal('${p.id}')">Save</button>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancel</button>
      <span class="spacer"></span>
      <button class="del" onclick="delPersonModal('${p.id}')">delete person</button>
    </div>`);
  setTimeout(()=>{const el=$id('m_pname');if(el)el.focus();},30);
}
function savePersonModal(pid){
  const p=S.people.find(x=>x.id===pid);if(!p)return;
  const n=val('m_pname');if(!n)return alert('Name is required.');
  let link=val('m_plink');if(link&&!/^https?:\/\//i.test(link))link='https://'+link;
  Object.assign(p,{name:n,designation:val('m_pdesig'),companyId:val('m_pcomp'),location:val('m_ploc'),
    phone:val('m_pphone'),email:val('m_pemail'),linkedin:link,owner:val('m_pown'),notes:$id('m_pnotes').value.trim()});
  if(p.location){
    if(!allLocations().some(l=>l.toLowerCase()===p.location.toLowerCase()))S.locations.push(p.location);
    const c=companyById(p.companyId);
    if(c){c.locations=c.locations||[];if(!c.locations.some(l=>l.toLowerCase()===p.location.toLowerCase()))c.locations.push(p.location);}
  }
  markDirty();closeModal();
}
function delPersonModal(pid){
  const p=S.people.find(x=>x.id===pid);if(!p)return;
  if(!confirm(`Delete ${p.name}?`))return;
  S.people=S.people.filter(x=>x.id!==pid);markDirty();closeModal();
}

function openTodoModal(tid){
  const t=S.todos.find(x=>x.id===tid);if(!t)return;
  const c=companyById(t.companyId);
  openModal(`
    <div class="modalhead"><h3>To-do</h3>${ownerPill(t.owner)}
      ${t.status==='done'?'<span class="tag" style="background:#e3f5eb;color:var(--green)">Done</span>':'<span class="tag orange">Open</span>'}
      <button class="x" onclick="closeModal()">✕</button></div>
    <div class="modalbody">
      <div class="field" style="margin-bottom:10px"><label>Task *</label><input id="m_ttext" value="${esc(t.text)}"></div>
      <div class="grid">
        <div class="field"><label>Salesperson</label>${ownerSelect('m_town',t.owner||currentUser)}</div>
        <div class="field"><label>Company</label><select id="m_tcomp"><option value="">— general —</option>${S.companies.slice().sort(byName).map(x=>`<option value="${x.id}" ${x.id===t.companyId?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Due date</label><input type="date" id="m_tdue" value="${esc(t.due||'')}"></div>
        <div class="field"><label>Status</label><select id="m_tstatus"><option value="open" ${t.status!=='done'?'selected':''}>Open</option><option value="done" ${t.status==='done'?'selected':''}>Done</option></select></div>
      </div>
      ${c?`<div class="hint" style="margin-top:10px">For <b>${esc(c.name)}</b> · <span class="linkish" onclick="closeModal();openCompany('${c.id}')">open the company page</span></div>`:''}
    </div>
    <div class="modalfoot">
      <button class="btn btn-primary btn-sm" onclick="saveTodoModal('${t.id}')">Save</button>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancel</button>
      <span class="spacer"></span>
      ${isAdmin()?`<button class="del" onclick="delTodoModal('${t.id}')">delete to-do</button>`:''}
    </div>`);
  setTimeout(()=>{const el=$id('m_ttext');if(el)el.focus();},30);
}
function saveTodoModal(tid){
  const t=S.todos.find(x=>x.id===tid);if(!t)return;
  const v=val('m_ttext');if(!v)return alert('Task text is required.');
  const prevOwner=t.owner;
  Object.assign(t,{text:v,owner:val('m_town'),companyId:val('m_tcomp'),due:val('m_tdue'),status:val('m_tstatus')});
  if(t.owner!==prevOwner)notifyAssign('todo',t.owner,t.text,(companyById(t.companyId)||{}).name);
  markDirty();closeModal();
}
function delTodoModal(tid){
  if(!isAdmin())return alert('Only an admin can delete a to-do.');
  if(!confirm('Delete this to-do?'))return;
  S.todos=S.todos.filter(x=>x.id!==tid);markDirty();closeModal();
}

/* ---------- EVA: internet-driven research ---------- */
async function researchEva(cid){
  const c=companyById(cid);if(!c)return;
  const btn=$id('evaresbtn-'+cid);
  if(btn){btn.disabled=true;btn.textContent='🌐 Researching…';}
  try{
    // Genie edition: the route authenticates via the Genie session cookie
    const ind=indByName(c.industry);
    const r=await fetch('/api/eva/research',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({company:{
        name:c.name,type:c.type,industry:c.industry,locations:c.locations||[],
        offer:buildEva(c,evaCtx(c)).text.split('\n2 WHAT WE CAN DO\n')[1]||'',
        products:(c.productIds||[]).map(pid=>(productById(pid)||{}).name).filter(Boolean),
        people:peopleOf(c.id).map(p=>({name:p.name,designation:p.designation||''})),
        industryIntel:ind?{sector:ind.sector,priority:ind.priority,goal:ind.goal,
          strategy:ind.strategy,potentials:ind.potentials,projects:ind.projects}:null
      }})
    });
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||('Research failed (HTTP '+r.status+')'));
    if(!c.eva)c.eva=makeEva(c,evaCtx(c));
    c.eva.research=j.research;
    c.eva=makeEva(c,{...evaCtx(c),research:j.research});
    markDirty();render();
  }catch(e){
    alert('Could not research this company: '+e.message);
    if(btn){btn.disabled=false;btn.textContent='🌐 Research';}
  }
}


/* ================= DEALS ================= */
let dealSegs=new Set(SEGMENTS), dragDealId=null, statsMonth=null;
let dealInd='', dealProd='', dealFormProds=[];

const dealIndustry=d=>(companyById(d.companyId)||{}).industry||'';
const dealsInScope=()=>S.deals.filter(d=>ownerOk(d.owner)&&dealSegs.has(d.segment)
  &&(!dealInd||dealIndustry(d)===dealInd)
  &&(!dealProd||(d.productIds||[]).includes(dealProd))
  &&match(d.name,(companyById(d.companyId)||{}).name,d.oppNo,d.quoteNo,d.soNo,d.statusNow,d.owner,
    (d.productIds||[]).map(pid=>(productById(pid)||{}).name).join(' ')));
function setDealFilter(k,v){if(k==='ind')dealInd=v;else dealProd=v;render();}
const chanceColor=p=>p>=80?'#1a7f4e':p>=50?'#B45309':p>=25?'#F04E23':'#8a8f9c';

function toggleSeg(seg){dealSegs.has(seg)?dealSegs.delete(seg):dealSegs.add(seg);
  if(!dealSegs.size)dealSegs=new Set(SEGMENTS);render();}

function viewDeals(){
  const list=dealsInScope();
  const open=list.filter(isOpen);
  const total=open.reduce((s,d)=>s+(+d.amount||0),0);
  const wtd=open.reduce((s,d)=>s+weighted(d),0);
  const ends=nextMonthEnds(3);
  const byEnd=ends.map(e=>{const k=iso(e);const hit=open.filter(d=>d.due&&d.due<=k);
    return {label:monthLabel(e),n:hit.length,val:hit.reduce((s,d)=>s+(+d.amount||0),0)};});

  // dropdowns list only what actually appears on a deal
  const usedInds=[...new Set(S.deals.map(dealIndustry).filter(Boolean))].sort();
  const usedProds=[...new Set(S.deals.flatMap(d=>d.productIds||[]))]
    .map(pid=>productById(pid)).filter(Boolean).sort(byName);

  return `
  <div class="toolrow"><h2>Deals</h2><span class="hint">${open.length} open · drag a card to move it</span>
    <div class="spacer"></div><button class="btn btn-primary" onclick="openDealModal()">+ Add deal</button></div>
  <div class="filters">
    <details class="segdd"><summary>Segments: ${dealSegs.size===SEGMENTS.length?'All':[...dealSegs].join(', ')} ▾</summary>
      <div class="segbox">${SEGMENTS.map(sg=>`<label><input type="checkbox" ${dealSegs.has(sg)?'checked':''} onchange="toggleSeg('${sg}')"> ${sg}</label>`).join('')}</div>
    </details>
    ${ownerFilter(ownersUsedBy(S.deals))}
    <select onchange="setDealFilter('ind',this.value)" title="Filter by industry">
      <option value="">All industries</option>
      ${usedInds.map(i=>`<option ${dealInd===i?'selected':''}>${esc(i)}</option>`).join('')}</select>
    <select onchange="setDealFilter('prod',this.value)" title="Filter by product">
      <option value="">All products</option>
      ${usedProds.map(pr=>`<option value="${pr.id}" ${dealProd===pr.id?'selected':''}>${esc(pr.name)}</option>`).join('')}</select>
    ${(dealInd||dealProd||dealSegs.size!==SEGMENTS.length||currentOwner!=='all')?`<button class="btn btn-ghost btn-sm" onclick="clearDealFilters()">✕ Clear filters</button>`:''}
  </div>

  <div class="tiles">
    <div class="tile"><div class="big">${open.length}</div><div class="sm">Open deals</div></div>
    <div class="tile o"><div class="big">${fmtMoney(total)}</div><div class="sm">Total value</div></div>
    <div class="tile"><div class="big">${fmtMoney(wtd)}</div><div class="sm">Weighted by % chance</div></div>
  </div>
  <div class="tiles">
    ${byEnd.map((b,i)=>`<div class="tile ${i===0?'o':''}"><div class="big">${fmtMoney(b.val)}</div>
      <div class="sm">${b.n} deal${b.n===1?'':'s'} due by ${b.label}</div></div>`).join('')}
  </div>

  <div class="board">${DEAL_STAGES.map(st=>{
    const here=list.filter(d=>d.stage===st.key).sort((a,b)=>(+b.amount||0)-(+a.amount||0));
    const sum=here.reduce((s,d)=>s+(+d.amount||0),0);
    return `<div class="col dealcol" id="col-${st.key}"
        ondragover="dealDragOver(event,'${st.key}')" ondragleave="dealDragLeave('${st.key}')" ondrop="dealDrop(event,'${st.key}')">
      <h4>${esc(st.name)}</h4>
      <div class="colsum"><span>${here.length} deal${here.length===1?'':'s'}</span><span>${fmtMoney(sum)}</span></div>
      ${here.map(d=>{
        const co=companyById(d.companyId);
        const ch=d.chance??localChance(d).chance;
        return `<div class="dcard" draggable="true" id="dc-${d.id}"
            style="border-left-color:${S.ownerColors[d.owner]||'#1B2D6B'}"
            ondragstart="dealDragStart(event,'${d.id}')" ondragend="dealDragEnd('${d.id}')"
            onclick="openDealModal('${d.id}')">
          <div class="dn">${esc(d.name)}</div>
          <div class="hint">${esc(co?co.name:'no customer')}</div>
          <div class="drow"><span class="damt">${fmtMoney(d.amount)}</span>
            <span class="seg-tag">${esc(d.segment)}</span>
            <span class="chip-chance" style="background:${chanceColor(ch)}" title="${esc(d.chanceWhy||'')}">${ch}%${d.chanceSource==='ai'?' AI':''}</span></div>
          ${(d.productIds||[]).length?`<div class="drow">${(d.productIds||[]).slice(0,3).map(pid=>{const pr=productById(pid);
            return pr?`<span class="seg-tag" style="background:var(--orange-soft);color:#c23c14">${esc(pr.name)}</span>`:'';}).join('')}
            ${(d.productIds||[]).length>3?`<span class="hint">+${(d.productIds||[]).length-3}</span>`:''}</div>`:''}
          <div class="drow"><span class="hint">${d.due?'due '+esc(d.due):'no due date'} · ${d.interactions||0} touch${(d.interactions||0)===1?'':'es'}</span></div>
          <div class="drow">${ownerPill(d.owner)}</div>
        </div>`;}).join('')||'<div class="hint" style="font-size:12px">—</div>'}
    </div>`;}).join('')}</div>

  <div class="toolrow" style="margin-top:26px"><h2>Pipeline movements</h2><span class="hint">every stage change, newest first</span></div>
  ${movementLog(list)}`;
}

function movementLog(list){
  const evs=[];
  list.forEach(d=>(d.history||[]).forEach(h=>evs.push({...h,deal:d})));
  evs.sort((a,b)=>(b.at||'').localeCompare(a.at||''));
  if(!evs.length)return '<div class="hint">No movements recorded yet — drag a deal to another stage and it will be logged here.</div>';
  return `<div class="dealtl">${evs.slice(0,80).map(e=>`<div class="ev">
    <b class="linkish" onclick="openDealModal('${e.deal.id}')">${esc(e.deal.name)}</b>
    ${e.from?`moved <b>${esc(dealStageName(e.from))}</b> → <b>${esc(dealStageName(e.to))}</b>`:`created at <b>${esc(dealStageName(e.to))}</b>`}
    <span class="when">· ${esc(fmtDT(e.at))}${e.by?' · '+esc(e.by):''}</span></div>`).join('')}</div>`;
}

/* ---------- drag & drop ---------- */
function dealDragStart(ev,id){dragDealId=id;ev.dataTransfer.effectAllowed='move';
  try{ev.dataTransfer.setData('text/plain',id);}catch(e){}
  const el=$id('dc-'+id);if(el)el.classList.add('dragging');}
function dealDragEnd(id){const el=$id('dc-'+id);if(el)el.classList.remove('dragging');dragDealId=null;}
function dealDragOver(ev,stage){ev.preventDefault();ev.dataTransfer.dropEffect='move';
  const c=$id('col-'+stage);if(c)c.classList.add('over');}
function dealDragLeave(stage){const c=$id('col-'+stage);if(c)c.classList.remove('over');}
function dealDrop(ev,stage){
  ev.preventDefault();
  const id=dragDealId||(ev.dataTransfer&&ev.dataTransfer.getData('text/plain'));
  const c=$id('col-'+stage);if(c)c.classList.remove('over');
  moveDeal(id,stage);
}
function moveDeal(id,stage){
  const d=S.deals.find(x=>x.id===id);if(!d||d.stage===stage)return;
  d.history=d.history||[];
  d.history.push({at:new Date().toISOString(),from:d.stage,to:stage,by:currentUser});
  d.stage=stage;
  if(d.chanceSource!=='manual'){const l=localChance(d);d.chance=l.chance;d.chanceWhy=l.why;d.chanceSource='auto';}
  markDirty();render();
}

/* ---------- deal modal ---------- */
function openDealModal(id,presetCompany){
  const d=id?S.deals.find(x=>x.id===id):null;
  if(!d&&presetCompany)setTimeout(()=>{const el=$id('d_comp');if(el)el.value=presetCompany;},0);
  const v=(k,dflt='')=>d?(d[k]??dflt):dflt;
  const ch=d?(d.chance??localChance(d).chance):null;
  openModal(`
    <div class="modalhead"><h3>${d?esc(d.name):'New deal'}</h3>
      ${d?`<span class="chip-chance" style="background:${chanceColor(ch)}">${ch}% ${d.chanceSource==='ai'?'AI':d.chanceSource==='manual'?'set':'auto'}</span>`:''}
      <button class="x" onclick="closeModal()">✕</button></div>
    <div class="modalbody">
      <div class="field" style="margin-bottom:10px"><label>Deal name *</label><input id="d_name" value="${esc(v('name'))}" placeholder="e.g. 12 × chair lift — Air India Nagpur"></div>
      <div class="grid">
        <div class="field"><label>Customer</label><select id="d_comp"><option value="">— none —</option>${S.companies.slice().sort(byName).map(c=>`<option value="${c.id}" ${d&&c.id===d.companyId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Segment</label><select id="d_seg">${SEGMENTS.map(sg=>`<option ${v('segment','MHE')===sg?'selected':''}>${sg}</option>`).join('')}</select></div>
        <div class="field"><label>Deal stage</label><select id="d_stage">${DEAL_STAGES.map(st=>`<option value="${st.key}" ${v('stage','suspecting')===st.key?'selected':''}>${esc(st.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Amount (₹ Lakhs)</label><input id="d_amt" type="number" min="0" step="0.5" value="${(v('amount',0)/100000)||''}" placeholder="e.g. 25 = ₹25 L"></div>
        <div class="field"><label>Due date</label><input id="d_due" type="date" value="${esc(v('due'))}"></div>
        <div class="field"><label>Salesperson</label>${ownerSelect('d_own',v('owner',currentUser))}</div>
        <div class="field"><label>Opportunity No</label><input id="d_opp" value="${esc(v('oppNo'))}" placeholder="if an opportunity"></div>
        <div class="field"><label>Quotation No</label><input id="d_quote" value="${esc(v('quoteNo'))}" placeholder="if quotation sent"></div>
        <div class="field"><label>Sales Order No</label><input id="d_so" value="${esc(v('soNo'))}" placeholder="if order received"></div>
        <div class="field"><label>No of interactions</label><input id="d_ix" type="number" min="0" value="${v('interactions',0)}"></div>
      </div>
      <div class="field" style="margin-top:10px"><label>Products in this deal</label>
        <div id="d_prodchips" style="margin-bottom:6px"></div>
        <div class="inline-add" style="margin-top:0">
          <select id="d_prodsel"><option value="">Add a product…</option>${S.products.slice().sort(byName).map(pr=>`<option value="${pr.id}">${esc(pr.name)}</option>`).join('')}</select>
          <button class="btn btn-ghost btn-sm" onclick="addDealProd()">Add</button></div></div>
      <div class="field" style="margin-top:10px"><label>Status now — where it actually stands</label>
        <textarea id="d_status" rows="3" placeholder="Last conversation, what they said, what is blocking it…">${esc(v('statusNow'))}</textarea></div>
      ${d?`
      <div class="field" style="margin-top:14px"><label>% chance</label>
        <div class="inline-add" style="align-items:center">
          <input id="d_chance" type="number" min="0" max="100" value="${ch}" style="max-width:110px">
          <button class="btn btn-ghost btn-sm" id="d_aibtn" onclick="scoreDeal('${d.id}')">✨ Calculate with AI</button>
          <button class="btn btn-ghost btn-sm" onclick="recalcChance('${d.id}')">↺ Recalculate</button>
        </div>
        <div class="hint" style="margin-top:6px">${esc(d.chanceWhy||localChance(d).why)}</div></div>
      <div class="subsec" style="margin-top:14px"><div class="st">History — how it moved</div>
        ${(d.history||[]).length?`<div class="dealtl">${d.history.slice().reverse().map(h=>`<div class="ev">
          ${h.from?`<b>${esc(dealStageName(h.from))}</b> → <b>${esc(dealStageName(h.to))}</b>`:`created at <b>${esc(dealStageName(h.to))}</b>`}
          <span class="when">· ${esc(fmtDT(h.at))}${h.by?' · '+esc(h.by):''}</span></div>`).join('')}</div>`
        :'<div class="hint">Created but not moved yet.</div>'}</div>`:''}
    </div>
    <div class="modalfoot">
      <button class="btn btn-primary btn-sm" onclick="saveDeal(${d?`'${d.id}'`:'null'})">Save deal</button>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancel</button>
      <span class="spacer"></span>
      ${d?`<button class="del" onclick="delDeal('${d.id}')">delete deal</button>`:''}
    </div>`);
  dealFormProds=d?[...(d.productIds||[])]:[];
  drawDealProds();
  setTimeout(()=>{const el=$id('d_name');if(el)el.focus();},30);
}
function drawDealProds(){
  const el=$id('d_prodchips');if(!el)return;
  el.innerHTML=dealFormProds.map((pid,i)=>{const pr=productById(pid);
    return `<span class="prodchip">${pr&&pr.img?`<img src="${pr.img}">`:''}${esc(pr?pr.name:pid)}<button class="x" onclick="dropDealProd(${i})">✕</button></span>`;}).join('')
    ||'<span class="hint">No products linked yet.</span>';
}
function addDealProd(){const sel=$id('d_prodsel');const v=sel.value;if(!v)return;
  if(!dealFormProds.includes(v))dealFormProds.push(v);sel.value='';drawDealProds();}
function dropDealProd(i){dealFormProds.splice(i,1);drawDealProds();}
function clearDealFilters(){dealInd='';dealProd='';dealSegs=new Set(SEGMENTS);currentOwner='all';render();}
function saveDeal(id){
  const name=val('d_name');if(!name)return alert('Deal name is required.');
  const stage=val('d_stage');
  const fields={name,companyId:val('d_comp'),segment:val('d_seg'),stage,
    amount:Math.round((+val('d_amt')||0)*100000),due:val('d_due'),owner:val('d_own'),
    oppNo:val('d_opp'),quoteNo:val('d_quote'),soNo:val('d_so'),
    interactions:+val('d_ix')||0,statusNow:$id('d_status').value.trim(),productIds:[...dealFormProds]};
  let d=id?S.deals.find(x=>x.id===id):null;
  if(!d){
    d={id:uid(),createdAt:new Date().toISOString(),history:[{at:new Date().toISOString(),from:null,to:stage,by:currentUser}],chanceSource:'auto'};
    S.deals.push(d);
  }else if(d.stage!==stage){
    d.history=d.history||[];
    d.history.push({at:new Date().toISOString(),from:d.stage,to:stage,by:currentUser});
  }
  Object.assign(d,fields);
  const typed=$id('d_chance');
  const auto=localChance(d);
  if(typed&&id&&+typed.value!==(d.chance??auto.chance)){
    d.chance=Math.max(0,Math.min(100,+typed.value||0));d.chanceSource='manual';d.chanceWhy='Set by '+(currentUser||'a user')+'.';
  }else if(d.chanceSource!=='manual'&&d.chanceSource!=='ai'){
    d.chance=auto.chance;d.chanceWhy=auto.why;
  }
  notifyAssign('deal',d.owner,d.name,(companyById(d.companyId)||{}).name);
  markDirty();closeModal();
}
function delDeal(id){
  const d=S.deals.find(x=>x.id===id);if(!d)return;
  if(!confirm(`Delete the deal "${d.name}"? Its history goes with it.`))return;
  S.deals=S.deals.filter(x=>x.id!==id);markDirty();closeModal();
}
function recalcChance(id){
  const d=S.deals.find(x=>x.id===id);if(!d)return;
  const l=localChance(d);d.chance=l.chance;d.chanceWhy=l.why;d.chanceSource='auto';
  markDirty();openDealModal(id);
}
async function scoreDeal(id){
  const d=S.deals.find(x=>x.id===id);if(!d)return;
  const btn=$id('d_aibtn');if(btn){btn.disabled=true;btn.textContent='✨ Thinking…';}
  try{
    // Genie edition: the route authenticates via the Genie session cookie
    const co=companyById(d.companyId);
    const r=await fetch('/api/deals/score',{method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({deal:{
        name:d.name,segment:d.segment,stage:dealStageName(d.stage),amount:d.amount,due:d.due,
        interactions:d.interactions,statusNow:d.statusNow,oppNo:d.oppNo,quoteNo:d.quoteNo,soNo:d.soNo,
        createdAt:d.createdAt,lastMovedAt:lastMovedAt(d),
        history:(d.history||[]).map(h=>({at:h.at,from:h.from?dealStageName(h.from):null,to:dealStageName(h.to)})),
        customer:co?{name:co.name,type:co.type,industry:co.industry,
          comments:(co.comments||[]).slice(-6).map(c=>`${c.author}: ${c.text}`)}:null,
        baseline:localChance(d)
      }})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||('Scoring failed (HTTP '+r.status+')'));
    d.chance=Math.max(0,Math.min(100,Math.round(j.chance)));
    d.chanceWhy=j.why;d.chanceSource='ai';
    markDirty();openDealModal(id);
  }catch(e){
    alert('Could not calculate the chance: '+e.message);
    if(btn){btn.disabled=false;btn.textContent='✨ Calculate with AI';}
  }
}


/* ================= SUPPORT NEEDED ================= */
const ESCALATIONS=['Low','Medium','High','Critical'];

function viewSupport(){
  const list=S.support.filter(x=>ownerOk(x.assignedTo)
    &&match(x.task,x.assignedTo,x.escalation,(companyById(x.companyId)||{}).name,x.raisedBy,x.notes))
    .sort((a,b)=>(a.status==='done')-(b.status==='done')
      ||ESCALATIONS.indexOf(b.escalation)-ESCALATIONS.indexOf(a.escalation)
      ||(a.requested||'9999').localeCompare(b.requested||'9999'));
  const open=list.filter(x=>x.status!=='done');
  const today=new Date().toISOString().slice(0,10);
  return `
  <div class="toolrow"><h2>Support Needed</h2><span class="hint">${open.length} open · what sales needs from the rest of the business</span>
    <div class="spacer"></div>${ownerFilter(ownersUsedBy(S.support.map(x=>({owner:x.assignedTo}))))}
    <button class="btn btn-navy" onclick="copySupportForGenie()">Copy for Sales Genie</button>
    <button class="btn btn-primary" onclick="openSupportModal()">+ Add request</button></div>
  <div class="genie-note">Every request carries a task, an escalation level, the date it is needed by and who it is assigned to —
    the same shape as a Sales Genie to-do, so <b>Copy for Sales Genie</b> hands it straight over.</div>
  ${list.length?`<div class="tblwrap"><table class="tbl">
    <thead><tr><th>Task</th><th>Escalation</th><th>Requested date</th><th>Assigned to</th><th>Customer</th><th>Raised by</th><th>Status</th></tr></thead>
    <tbody>${list.map(x=>{
      const c=companyById(x.companyId);
      const late=x.requested&&x.requested<today&&x.status!=='done';
      return `<tr class="${x.status==='done'?'supdone':''}" onclick="openSupportModal('${x.id}')">
        <td class="cname">${esc(x.task)}</td>
        <td><span class="esc esc-${esc((x.escalation||'Medium').toLowerCase())}">${esc(x.escalation||'Medium')}</span></td>
        <td class="${late?'':'hint'}" style="${late?'color:#c0392b;font-weight:800':''}">${x.requested?(late?'⚠ ':'')+esc(fmtD(x.requested)):'—'}</td>
        <td>${x.assignedTo?ownerPill(x.assignedTo):'<span class="hint">unassigned</span>'}</td>
        <td class="hint">${c?esc(c.name):'—'}</td>
        <td class="hint">${esc(x.raisedBy||'—')}</td>
        <td>${x.status==='done'?'<span class="tag" style="background:#e3f5eb;color:var(--green)">Done</span>':'<span class="tag orange">Open</span>'}</td>
      </tr>`;}).join('')}</tbody></table></div>`
   :'<div class="empty"><b>Nothing pending.</b><br>Raise what sales needs from production, design, finance or service — and who owes it.</div>'}`;
}

function openSupportModal(id){
  const x=id?S.support.find(y=>y.id===id):null;
  const v=(k,d='')=>x?(x[k]??d):d;
  openModal(`
    <div class="modalhead"><h3>${x?'Support request':'New support request'}</h3>
      ${x?`<span class="esc esc-${esc((x.escalation||'Medium').toLowerCase())}">${esc(x.escalation)}</span>`:''}
      <button class="x" onclick="closeModal()">✕</button></div>
    <div class="modalbody">
      <div class="field" style="margin-bottom:10px"><label>Task — what is needed *</label>
        <input id="s_task" value="${esc(v('task'))}" placeholder="e.g. Drawing approval for the 4-unit chair lift"></div>
      <div class="grid">
        <div class="field"><label>Escalation</label><select id="s_esc">${ESCALATIONS.map(e=>`<option ${v('escalation','Medium')===e?'selected':''}>${e}</option>`).join('')}</select></div>
        <div class="field"><label>Requested date</label><input id="s_req" type="date" value="${esc(v('requested'))}"></div>
        <div class="field"><label>Assigned to</label>${ownerSelect('s_assign',v('assignedTo',currentUser))}</div>
        <div class="field"><label>Raised by</label>${ownerSelect('s_by',v('raisedBy',currentUser))}</div>
        <div class="field"><label>Customer</label><select id="s_comp"><option value="">— none —</option>${S.companies.slice().sort(byName).map(c=>`<option value="${c.id}" ${x&&c.id===x.companyId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Status</label><select id="s_status"><option value="open" ${v('status','open')!=='done'?'selected':''}>Open</option><option value="done" ${v('status')==='done'?'selected':''}>Done</option></select></div>
      </div>
      <div class="field" style="margin-top:10px"><label>Notes</label>
        <textarea id="s_notes" rows="3" placeholder="Context, what has been tried, what is blocking it…">${esc(v('notes'))}</textarea></div>
    </div>
    <div class="modalfoot">
      <button class="btn btn-primary btn-sm" onclick="saveSupport(${x?`'${x.id}'`:'null'})">Save</button>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancel</button>
      <span class="spacer"></span>
      ${x?`<button class="del" onclick="delSupport('${x.id}')">delete request</button>`:''}
    </div>`);
  setTimeout(()=>{const el=$id('s_task');if(el)el.focus();},30);
}
function saveSupport(id){
  const task=val('s_task');if(!task)return alert('Say what is needed.');
  const fields={task,escalation:val('s_esc'),requested:val('s_req'),assignedTo:val('s_assign'),
    raisedBy:val('s_by'),companyId:val('s_comp'),status:val('s_status'),notes:$id('s_notes').value.trim()};
  let x=id?S.support.find(y=>y.id===id):null;
  if(!x){x={id:uid(),createdAt:new Date().toISOString()};S.support.push(x);}
  const prevAssign=x.assignedTo;
  Object.assign(x,fields);
  if(x.assignedTo&&x.assignedTo!==prevAssign)
    notifyAssign('support',x.assignedTo,x.task,(companyById(x.companyId)||{}).name);
  markDirty();closeModal();
}
function delSupport(id){
  if(!confirm('Delete this support request?'))return;
  S.support=S.support.filter(x=>x.id!==id);markDirty();closeModal();
}
function copySupportForGenie(){
  const payload=S.support.map(x=>({id:x.id,task:x.task,escalation:x.escalation,
    requested_date:x.requested||null,assigned_to:x.assignedTo||null,raised_by:x.raisedBy||null,
    company:(companyById(x.companyId)||{}).name||null,status:x.status,notes:x.notes||null,
    source:'my-sales-plan/support'}));
  navigator.clipboard.writeText(JSON.stringify(payload,null,2))
    .then(()=>alert('Support requests copied as JSON — paste into Sales Genie to add them to the to-do list.'))
    .catch(()=>alert(JSON.stringify(payload,null,2)));
}

/* ================= SALESPERSONS PLAN ================= */
const STAT_FIELDS=[['booking','Booking','money'],['billing','Billing','money'],['collections','Collection','money'],
  ['enquiries','Enquiries allocated','num'],['visitsDone','Visits done','num'],['visitsPlanned','Visits planned','num']];
const PROSPECT_TARGET=50;
let planFy=null;

function curMonth(){if(!statsMonth){const n=new Date();statsMonth=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;}return statsMonth;}
function curFy(){return planFy||(planFy=fyKeyOf());}
function setPlanFy(v){planFy=v;render();}
function statOf(who,month){const m=month||curMonth();S.salesStats[who]=S.salesStats[who]||{};S.salesStats[who][m]=S.salesStats[who][m]||{};return S.salesStats[who][m];}
function setStat(who,key,v){statOf(who)[key]=+v||0;markDirty();render();}
function setStatsMonth(v){statsMonth=v;render();}

/** Who the plan is showing: everyone (manager view) or the filtered salesperson. */
const planPeople=()=>S.owners.filter(o=>currentOwner==='all'||currentOwner==='none'||o===currentOwner);

function planOf(who,fy){S.salesPlan[who]=S.salesPlan[who]||{};S.salesPlan[who][fy]=S.salesPlan[who][fy]||{};return S.salesPlan[who][fy];}
function planCell(who,fy,metric,period){
  const p=planOf(who,fy);p[metric]=p[metric]||{};p[metric][period]=p[metric][period]||{plan:0,target:0};
  return p[metric][period];
}
function setPlan(who,metric,period,field,v){
  planCell(who,curFy(),metric,period)[field]=+v||0;markDirty();render();
}
/** Same cell summed across everyone on screen — the manager's roll-up. */
const planSum=(metric,period,field)=>planPeople().reduce((s,o)=>s+(+planCell(o,curFy(),metric,period)[field]||0),0);
const actualSum=(metric,months)=>planPeople().reduce((s,o)=>
  s+months.reduce((t,mk)=>t+(+((S.salesStats[o]||{})[mk]||{})[metric]||0),0),0);

function variance(a,b){
  if(!b)return '<span class="varline var-none">no target set</span>';
  const p=pct(a,b);
  return `<span class="varline ${p>=100?'var-over':'var-under'}">${p}% of target</span>`;
}

function viewStats(){
  const fy=curFy(), months=fyMonths(fy), done=elapsedMonths(fy);
  const quarters=remainingQuarters();
  const single=planPeople().length===1?planPeople()[0]:null;
  const who=single||'the team';
  const fyOpts=[fyKeyOf(new Date(new Date().getFullYear()-1,0,1)),fyKeyOf(),fyKeyOf(new Date(new Date().getFullYear()+1,5,1))];

  return `
  <div class="toolrow"><h2>Salespersons Plan</h2>
    <span class="hint">${single?esc(single):'all salespeople'} · FY ${esc(fy)}</span>
    <div class="spacer"></div>
    ${ownerFilter()}
    <select class="fsel" onchange="setPlanFy(this.value)" title="Financial year">${[...new Set(fyOpts)].map(f=>`<option ${f===fy?'selected':''}>${f}</option>`).join('')}</select>
    ${isAdmin()?`<button class="btn btn-ghost btn-sm" onclick="addOwnerMaster()">+ Add salesperson</button>`:''}
  </div>

  <div class="tblwrap" style="margin-bottom:18px"><table class="plantbl">
    <thead><tr><th>Metric</th><th>YTD actual</th>
      ${quarters.map(q=>`<th>${q.label} target<br><span style="font-weight:600;text-transform:none;letter-spacing:0;opacity:.75">${q.span}</span></th>`).join('')}
      <th>Annual</th></tr></thead>
    <tbody>${PLAN_METRICS.map(mt=>{
      const ytd=actualSum(mt.key,done);
      const annualTarget=planSum(mt.key,'annual','target');
      return `<tr>
        <td><span class="metricdot" style="background:${mt.color}"></span>${mt.label}</td>
        <td><div class="ytd">${fmtMoney(ytd)}</div>${variance(ytd,annualTarget)}</td>
        ${quarters.map(q=>{
          const plan=planSum(mt.key,q.key,'plan'), target=planSum(mt.key,q.key,'target');
          return `<td><div class="pcell">
            ${single?`
              <div class="prow"><span class="k">Plan</span><input type="number" min="0" step="100000" value="${plan}"
                onchange="setPlan('${esc(single)}','${mt.key}','${q.key}','plan',this.value)"></div>
              <div class="prow"><span class="k">Target</span><input type="number" min="0" step="100000" value="${target}"
                onchange="setPlan('${esc(single)}','${mt.key}','${q.key}','target',this.value)"></div>`
            :`<div class="prow"><span class="k">Plan</span><b>${fmtMoney(plan)}</b></div>
              <div class="prow"><span class="k">Target</span><b>${fmtMoney(target)}</b></div>`}
            ${variance(plan,target)}</div></td>`;}).join('')}
        <td><div class="pcell">
          ${single?`
            <div class="prow"><span class="k">Plan</span><input type="number" min="0" step="100000" value="${planSum(mt.key,'annual','plan')}"
              onchange="setPlan('${esc(single)}','${mt.key}','annual','plan',this.value)"></div>
            <div class="prow"><span class="k">Target</span><input type="number" min="0" step="100000" value="${annualTarget}"
              onchange="setPlan('${esc(single)}','${mt.key}','annual','target',this.value)"></div>`
          :`<div class="prow"><span class="k">Plan</span><b>${fmtMoney(planSum(mt.key,'annual','plan'))}</b></div>
            <div class="prow"><span class="k">Target</span><b>${fmtMoney(annualTarget)}</b></div>`}
          ${variance(planSum(mt.key,'annual','plan'),annualTarget)}</div></td>
      </tr>`;}).join('')}</tbody></table></div>
  ${single?'':`<div class="hint" style="margin:-10px 0 14px">Showing the whole team added together.${isAdmin()?' Set each person&rsquo;s numbers below.':' Pick one salesperson above to see their plan.'}</div>`}
  ${(!single&&isAdmin())?targetEditor(fy,quarters):''}

  <div class="toolrow"><h2 style="font-size:16px">Month by month — FY ${esc(fy)}</h2>
    <span class="hint">booking, billing and collection actuals for ${esc(who)}</span></div>
  ${monthlyChart(fy,months)}

  <div class="toolrow" style="margin-top:26px"><h2 style="font-size:16px">Activity</h2>
    <span class="hint">the numbers behind the plan</span>
    <div class="spacer"></div>
    <div class="field" style="margin:0"><label>Month</label><input type="month" value="${curMonth()}" onchange="setStatsMonth(this.value)" style="width:auto"></div></div>
  <div class="genie-note">Booking, billing, collections, enquiries and visits are typed in from the ERP or your own count.
    Interactions, deals, pipeline and companies for prospecting are calculated live. Prospecting target is <b>${PROSPECT_TARGET}+ companies</b> per person.</div>
  ${activityTable()}`;
}

/** Manager view: set every salesperson's plan and target, one metric at a time. */
let targetMetric='booking';
function setTargetMetric(v){targetMetric=v;render();}
function targetEditor(fy,quarters){
  const mt=PLAN_METRICS.find(m=>m.key===targetMetric)||PLAN_METRICS[0];
  return `
  <div class="toolrow" style="margin-top:4px"><h2 style="font-size:16px">Set targets by salesperson</h2>
    <span class="hint">manager view · type a number and it saves</span>
    <div class="spacer"></div>
    <select class="fsel" onchange="setTargetMetric(this.value)" title="Metric">
      ${PLAN_METRICS.map(m=>`<option value="${m.key}" ${m.key===mt.key?'selected':''}>${m.label}</option>`).join('')}</select></div>
  <div class="tblwrap" style="margin-bottom:20px"><table class="tbl statstbl">
    <thead><tr><th>Salesperson</th>
      ${quarters.map(q=>`<th>${q.label} plan</th><th>${q.label} target</th>`).join('')}
      <th>Annual plan</th><th>Annual target</th></tr></thead>
    <tbody>${S.owners.map(o=>`<tr style="cursor:default">
      <td class="cname">${ownerPill(o)}</td>
      ${[...quarters.map(q=>q.key),'annual'].flatMap(pk=>['plan','target'].map(f=>
        `<td><input type="number" min="0" step="100000" value="${planCell(o,fy,mt.key,pk)[f]||0}"
          onchange="setPlan('${esc(o)}','${mt.key}','${pk}','${f}',this.value)"></td>`)).join('')}
    </tr>`).join('')}
    <tr style="cursor:default;background:var(--navy-soft);font-weight:800">
      <td>Team total</td>
      ${[...quarters.map(q=>q.key),'annual'].flatMap(pk=>['plan','target'].map(f=>
        `<td style="text-align:right">${fmtMoney(S.owners.reduce((s,o)=>s+(+planCell(o,fy,mt.key,pk)[f]||0),0))}</td>`)).join('')}
    </tr></tbody></table></div>`;
}

function activityTable(){
  const rows=planPeople().map(o=>{
    const st=statOf(o);
    const deals=S.deals.filter(d=>d.owner===o&&isOpen(d));
    const won=S.deals.filter(d=>d.owner===o&&d.stage==='won');
    return {o,st,deals:deals.length,pipeline:deals.reduce((s,d)=>s+(+d.amount||0),0),
      won:won.reduce((s,d)=>s+(+d.amount||0),0),
      interactions:S.deals.filter(d=>d.owner===o).reduce((s,d)=>s+(+d.interactions||0),0),
      prospects:S.companies.filter(c=>(c.owners||[]).includes(o)).length};});
  const sum=k=>rows.reduce((s,r)=>s+(typeof k==='function'?k(r):(+r.st[k]||0)),0);
  return `<div class="tblwrap"><table class="tbl statstbl">
    <thead><tr><th>Salesperson</th>${STAT_FIELDS.map(([k,l])=>`<th>${l}</th>`).join('')}
      <th>Interactions</th><th>Open deals</th><th>Pipeline</th><th>Order received</th><th>Companies for prospecting</th></tr></thead>
    <tbody>${rows.map(r=>`<tr style="cursor:default">
      <td class="cname">${ownerPill(r.o)}</td>
      ${STAT_FIELDS.map(([k,l,kind])=>`<td><input type="number" min="0" ${kind==='money'?'step="1000"':''} value="${r.st[k]||0}"
        onchange="setStat('${esc(r.o)}','${k}',this.value)"></td>`).join('')}
      <td style="text-align:right">${r.interactions}</td>
      <td style="text-align:right">${r.deals}</td>
      <td style="text-align:right">${fmtMoney(r.pipeline)}</td>
      <td style="text-align:right">${fmtMoney(r.won)}</td>
      <td style="text-align:right">${r.prospects} ${r.prospects>=PROSPECT_TARGET?'<span class="okmark">✓</span>':`<span class="short">need ${PROSPECT_TARGET-r.prospects} more</span>`}</td>
    </tr>`).join('')}
    <tr style="cursor:default;background:var(--navy-soft);font-weight:800">
      <td>${planPeople().length===1?'Total':'Team total'}</td>
      ${STAT_FIELDS.map(([k,l,kind])=>`<td style="text-align:right">${kind==='money'?fmtMoney(sum(k)):sum(k)}</td>`).join('')}
      <td style="text-align:right">${sum(r=>r.interactions)}</td>
      <td style="text-align:right">${sum(r=>r.deals)}</td>
      <td style="text-align:right">${fmtMoney(sum(r=>r.pipeline))}</td>
      <td style="text-align:right">${fmtMoney(sum(r=>r.won))}</td>
      <td style="text-align:right">${sum(r=>r.prospects)}</td>
    </tr></tbody></table></div>`;
}

/* ---------- monthly chart: grouped bars, one group per month ---------- */
function monthlyChart(fy,months){
  const W=980,H=300,PADL=64,PADR=12,PADT=12,PADB=34;
  const data=months.map(mk=>({mk,label:monthShort(mk),
    vals:PLAN_METRICS.map(m=>actualSum(m.key,[mk]))}));
  const peak=Math.max(1,...data.flatMap(d=>d.vals));
  const step=Math.pow(10,Math.floor(Math.log10(peak)));
  const top=Math.ceil(peak/step)*step;
  const plotW=W-PADL-PADR, plotH=H-PADT-PADB;
  const groupW=plotW/months.length;
  const gap=2, barW=Math.max(4,(groupW*0.62-gap*2)/3);
  const y=v=>PADT+plotH-(v/top)*plotH;
  const ticks=[0,.25,.5,.75,1].map(f=>Math.round(top*f));

  return `<div class="chartwrap">
    <div class="chartlegend">${PLAN_METRICS.map(m=>`<span><i style="background:${m.color}"></i>${m.label}</span>`).join('')}</div>
    <svg class="chartsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly booking, billing and collection for FY ${esc(fy)}">
      ${ticks.map(t=>`<g><line class="grid" x1="${PADL}" x2="${W-PADR}" y1="${y(t)}" y2="${y(t)}"></line>
        <text class="axis" x="${PADL-8}" y="${y(t)+4}" text-anchor="end">${t?fmtMoney(t):'0'}</text></g>`).join('')}
      ${data.map((d,gi)=>{
        const gx=PADL+gi*groupW;
        return `<g>${d.vals.map((v,si)=>{
          const bx=gx+groupW*0.19+si*(barW+gap);
          const bh=Math.max(v>0?2:0,plotH-(y(v)-PADT));
          return v>0?`<rect class="bar" x="${bx.toFixed(1)}" y="${(PADT+plotH-bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}"
            rx="4" fill="${PLAN_METRICS[si].color}"
            onmousemove="chartTip(event,'${esc(d.label)} ${esc(fy.slice(0,4))}','${esc(PLAN_METRICS[si].label)}','${esc(fmtMoneyFull(v))}')"
            onmouseleave="chartTipOff()"></rect>`:'';}).join('')}
        <text class="axis" x="${(gx+groupW/2).toFixed(1)}" y="${H-PADB+18}" text-anchor="middle">${esc(d.label)}</text></g>`;}).join('')}
      <line class="grid" x1="${PADL}" x2="${W-PADR}" y1="${PADT+plotH}" y2="${PADT+plotH}" stroke="var(--muted)"></line>
    </svg>
    <div class="charttip" id="charttip"></div>
    ${data.every(d=>d.vals.every(v=>!v))?'<div class="hint" style="margin:-140px 0 120px;text-align:center">No booking, billing or collection entered for this year yet — fill the Activity table below, month by month.</div>':''}
  </div>`;
}
function chartTip(ev,month,series,value){
  const tip=$id('charttip');if(!tip)return;
  const box=tip.parentElement.getBoundingClientRect();
  tip.innerHTML=`<b>${month}</b><br>${series}: <b>${value}</b>`;
  tip.style.left=(ev.clientX-box.left)+'px';
  tip.style.top=(ev.clientY-box.top)+'px';
  tip.classList.add('on');
}
function chartTipOff(){const t=$id('charttip');if(t)t.classList.remove('on');}

/* ---------- render ---------- */
const VIEWS={companies:viewCompanies,deals:viewDeals,industries:viewIndustries,people:viewPeople,locations:viewLocations,
  products:viewProducts,process:viewProcess,todos:viewTodos,support:viewSupport,stats:viewStats};
function render(){
  if(!S)return;
  if(!VIEWS[currentTab])currentTab='companies';
  renderTabs();
  $id('main').innerHTML=VIEWS[currentTab]();
  if(currentTab==='companies'&&!detailId)drawFormLocs();
}

/* ---------- expose handlers for inline on* attributes ---------- */
Object.assign(window,{render,setOwner,addOwnerMaster,setTab,setFilter,clearFilters,closeCompanyPage,
  toggleForm,toggleCard,showImg,rtc,acShow,acHide,acPick,acAdd,
  setSort,openCompany,addCompany,dropFormLoc,saveOffer,copyEva,generateEva,refreshEva,setEvaFreq,
  addComment,renameCompany,delCompany,
  removeLocation,quickAddPerson,quickAddTodo,setStage,setCompanyType,setCompanyIndustry,updateOwners,
  unlinkProduct,saveProdNotes,jumpToCompany,setIndSort,toggleInd,addIndustry,delIndustry,renameIndustry,
  saveIndNote,jumpToProduct,addPerson,editPerson,delPerson,delMasterLoc,renameLocation,readProdImage,openProductForm,
  dictate,toggleTabs,pinTabs,
  closeProductForm,editProduct,saveProduct,delProduct,linkIndToProduct,unlinkIndFromProduct,moveStage,
  addTodo,toggleTodo,delTodo,copyTodosForGenie,initDb,
  openModal,closeModal,openPersonModal,savePersonModal,delPersonModal,
  openTodoModal,saveTodoModal,delTodoModal,researchEva,focusAfterRender,
  toggleSeg,openDealModal,saveDeal,delDeal,recalcChance,scoreDeal,moveDeal,
  ownerFilter,setDealFilter,clearDealFilters,addDealProd,dropDealProd,drawDealProds,
  setPlan,setPlanFy,chartTip,chartTipOff,setTargetMetric,
  openSupportModal,saveSupport,delSupport,copySupportForGenie,toggleUserMenu,
  mapTip,mapTipOff,jumpToLocation,
  dealDragStart,dealDragEnd,dealDragOver,dealDragLeave,dealDrop,setStat,setStatsMonth,
  enc,dec,esc});
