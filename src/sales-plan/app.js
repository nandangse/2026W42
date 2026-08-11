/* ================= MY SALES PLAN · NANDAN GSE =================
   Supabase-backed version. UI ported from the single-file artifact.
   Data lives in Supabase (per-row jsonb); changes auto-save (debounced)
   and stream live to every signed-in teammate via realtime.

   GENIE EDITION — served inside the Sales Genie workspace by /api/sales/plan.
   No module imports: at serve time this file is concatenated after
   seed-data.js (defines SEED) and before boot.js (defines `sb` and calls
   startApp with the Genie session). Tables carry the sp_ prefix in the shared
   Genie database; login and team management belong to Genie itself, so the
   standalone app's login screen and Team tab are gone. */

/* ---------- migrate old data shapes ---------- */
function migrate(d){
  d.meta=d.meta||{version:3,savedAt:null};
  d.owners=d.owners||["Nitu","Santosh","Raghu","Acharya"];
  d.ownerColors=d.ownerColors||{"Nitu":"#1B2D6B","Santosh":"#F04E23","Raghu":"#0E7C7B","Acharya":"#7A1E6C"};
  d.types=d.types||["Client","Prospect","Collaborator"];
  d.stages=d.stages||SEED.stages;
  d.locations=d.locations||[];d.products=d.products||[];d.companies=d.companies||[];d.people=d.people||[];d.todos=d.todos||[];
  d.industries=(d.industries||[]).map(i=>typeof i==='string'
    ?{name:i,sector:'',priority:'None',prospects:0,goal:'',strategy:'',potentials:'',projects:'',notes:(d.industryNotes||{})[i]||''}
    :Object.assign({name:'',sector:'',priority:'None',prospects:0,goal:'',strategy:'',potentials:'',projects:'',notes:''},i));
  delete d.industryNotes;
  d.products.forEach(p=>{p.industries=p.industries||[];p.segment=p.segment||'';p.goal=p.goal||'';p.strategy=p.strategy||'';p.img=p.img||'';p.detail=p.detail||'';});
  d.companies.forEach(c=>{
    c.owners=c.owners||(c.owner?[c.owner]:[]);delete c.owner;
    c.type=c.type||'Prospect';c.productIds=c.productIds||[];c.productNotes=c.productNotes||'';
    c.locations=c.locations||[];c.comments=c.comments||[];c.notes=c.notes||'';
    if(c.offer&&!/[<]/.test(c.offer))c.offer=c.offer.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>');
    c.offer=c.offer||'';
  });
  d.people.forEach(p=>{p.linkedin=p.linkedin||'';});
  return d;
}

/* ---------- state ---------- */
let S=null;
let profile=null, myEmail='';
let currentOwner="all", currentTab="companies", currentUser="";
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

/* ---------- sync layer: debounced diff-save + realtime ---------- */
const ENTITY_TABLES=['industries','products','companies','people','todos'];
let last={masters:'',industries:new Map(),products:new Map(),companies:new Map(),people:new Map(),todos:new Map()};
let saveTimer=null, saving=false, resaveNeeded=false;

function mastersOf(){return {meta:S.meta,owners:S.owners,ownerColors:S.ownerColors,types:S.types,stages:S.stages,locations:S.locations};}
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
      const t=(p.table||'').replace(/^sp_/,''); // sp_companies → companies etc.
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
    bootFail('Initialization failed: '+(e.message||e)+' — check that migration 0014 was run in the Supabase SQL editor.');
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
  $id('userChip').textContent=`👤 ${currentUser}${isAdmin()?' · Admin':''}`;
  $id('userChip').title=myEmail;
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
function renderOwners(){
  const el=$id('ownerChips');
  const chips=[['all','All'],['none','None'],...S.owners.map(o=>[o,o])];
  el.innerHTML=chips.map(([v,l])=>{
    const dot=(v!=='all'&&v!=='none')?`<span class="dot" style="background:${S.ownerColors[v]||'#999'}"></span>`:'';
    return `<button class="chip ${currentOwner===v?'active':''}" onclick="setOwner(dec('${enc(v)}'))">${dot}${esc(l)}</button>`;
  }).join('')+(isAdmin()?`<button class="chip" style="border-style:dashed;color:var(--muted)" title="Add a salesperson name (logins & access are managed in the Genie admin tab)" onclick="addOwnerMaster()">＋ Add</button>`:'');
}
function setOwner(o){currentOwner=o;render();}
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
const BASE_TABS=[["companies","Companies"],["industries","Industries"],["people","People"],["locations","Locations"],["products","Products"],["process","Sales Process"],["todos","To-Do"]];
function renderTabs(){
  const tabs=BASE_TABS; // team management lives in the Genie admin tab
  const counts={companies:S.companies.filter(c=>ownersOk(c.owners)).length,industries:S.industries.length,
    people:S.people.filter(p=>ownerOk(p.owner)).length,locations:allLocations().length,
    products:S.products.length,process:'',todos:S.todos.filter(t=>ownerOk(t.owner)&&t.status!=='done').length};
  $id('tabs').innerHTML=tabs.map(([k,l])=>
    `<button class="${currentTab===k?'active':''}" onclick="setTab('${k}')">${l}${counts[k]!==''?`<span class="cnt">${counts[k]}</span>`:''}</button>`).join('');
}
function setTab(t){currentTab=t;detailId=null;render();}

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
const rtToolbar=()=>`<div class="rt-toolbar">
  <button type="button" onmousedown="rtc('bold',event)"><b>B</b></button>
  <button type="button" onmousedown="rtc('italic',event)"><i>I</i></button>
  <button type="button" onmousedown="rtc('underline',event)"><u>U</u></button>
  <button type="button" onmousedown="rtc('insertUnorderedList',event)">• List</button>
  <button type="button" onmousedown="rtc('removeFormat',event)">Clear</button></div>`;

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
      ${rtToolbar()}<div class="richtext rt-lg" id="c_offer" contenteditable="true"></div></div>
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
  const ind=indByName(c.industry);
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
          ${rtToolbar()}<div class="richtext rt-lg" id="offer-${c.id}" contenteditable="true" onblur="saveOffer('${c.id}')">${c.offer||''}</div></div>

        <div class="panel"><div class="st">Locations & people</div>
          ${(c.locations&&c.locations.length)?c.locations.map(loc=>{
            const here=ppl.filter(p=>p.location===loc);
            return `<div class="mini"><span class="tag orange">📍 ${esc(loc)}</span>
              ${here.length?here.map(p=>`<span>${esc(p.name)}${p.designation?` <span class="hint">(${esc(p.designation)})</span>`:''}${p.linkedin?` <a class="lnk" href="${esc(p.linkedin)}" target="_blank">in↗</a>`:''}</span>`).join(' · '):'<span class="hint">no people here yet</span>'}
              <span class="rowbtns"><button class="del" onclick="removeLocation('${c.id}','${enc(loc)}')">remove</button></span></div>`;}).join('')
            :'<div class="hint">No locations yet.</div>'}
          <div class="inline-add">${acHtml('loc-'+c.id,'loc',c.id,'Add a location — picks from masters…')}</div>
          ${ppl.filter(p=>!p.location||!(c.locations||[]).includes(p.location)).map(p=>`<div class="mini"><span class="who">${esc(p.name)}</span><span class="hint">${esc(p.designation||'')} ${p.location?'· '+esc(p.location):'· location not set'}</span></div>`).join('')}
          <div class="inline-add">
            <input id="pn-${c.id}" placeholder="Person name">
            <input id="pd-${c.id}" placeholder="Designation">
            <select id="pl-${c.id}"><option value="">Location…</option>${(c.locations||[]).map(l=>`<option>${esc(l)}</option>`).join('')}</select>
            <button class="btn btn-ghost btn-sm" onclick="quickAddPerson('${c.id}')">Add person</button></div></div>

        <div class="panel"><div class="st">Products for this customer — type to add multiple</div>
          <div>${(c.productIds||[]).map(pid=>{const pr=productById(pid);if(!pr)return '';
            return `<span class="prodchip">${pr.img?`<img src="${pr.img}">`:''}${esc(pr.name)}<button class="x" onclick="unlinkProduct('${c.id}','${pid}')">✕</button></span>`;}).join('')||'<span class="hint">No products linked yet.</span>'}</div>
          <div class="inline-add">${acHtml('pp-'+c.id,'prod',c.id,'Type a product — picks from masters, adds if missing…')}</div>
          <textarea id="pnotes-${c.id}" rows="3" placeholder="Continuous notes — how these products fit this customer…" onchange="saveProdNotes('${c.id}')">${esc(c.productNotes||'')}</textarea></div>

        <div class="panel"><div class="st">To-dos</div>
          ${tds.map(t=>`<div class="mini"><span>${t.status==='done'?'✅':'⬜'} ${esc(t.text)}</span>${ownerPill(t.owner)}${t.due?`<span class="hint">due ${esc(t.due)}</span>`:''}</div>`).join('')||'<div class="hint">None yet.</div>'}
          <div class="inline-add"><input id="td-${c.id}" placeholder="New to-do for this company…"><button class="btn btn-ghost btn-sm" onclick="quickAddTodo('${c.id}')">Add to-do</button></div></div>

        <div class="panel"><div class="st">Comments — team discussion</div>
          ${(c.comments||[]).map(cm=>`<div class="comment"><div class="cmeta">${ownerPill(cm.author)}<span class="hint">${esc((cm.at||'').slice(0,16).replace('T',' '))}</span></div><div>${esc(cm.text)}</div></div>`).join('')||'<div class="hint">No comments yet.</div>'}
          <div class="inline-add"><input id="cm-${c.id}" placeholder="Write a comment as ${esc(currentUser)}…" onkeydown="if(event.key==='Enter')addComment('${c.id}')"><button class="btn btn-ghost btn-sm" onclick="addComment('${c.id}')">Post</button></div></div>
      </div>
      <div>
        <div class="panel"><div class="st">Account settings</div>
          <div class="kv"><div class="k">Owners</div>
            <div class="chkrow" style="margin-top:4px">${S.owners.map(o=>`<label class="ownchk"><input type="checkbox" class="ownchk-${c.id}" value="${esc(o)}" ${(c.owners||[]).includes(o)?'checked':''} onchange="updateOwners('${c.id}')"> ${esc(o)}</label>`).join('')}</div></div>
          <div class="kv"><div class="k">Stage</div>${stageSelect('stg-'+c.id,c.stage)}<button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="setStage('${c.id}')">Update stage</button></div>
          <div class="kv"><div class="k">Type</div>${typeSelect('typ-'+c.id,c.type)}<button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="setCompanyType('${c.id}')">Update type</button></div>
          <div class="kv"><div class="k">Industry</div>${industrySelect('cind-'+c.id,c.industry)}<button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="setCompanyIndustry('${c.id}')">Update industry</button></div></div>
        ${evaBriefPanel(c,ind)}
      </div>
    </div>
  </div>`;
}
function evaBriefPanel(c,ind){
  const ppl=peopleOf(c.id), open=todosOf(c.id).filter(t=>t.status!=='done');
  const prods=(c.productIds||[]).map(productById).filter(Boolean);
  const gaps=[];
  if(!c.offer)gaps.push('What we can do for them');
  if(!(c.locations||[]).length)gaps.push('Locations');
  if(!ppl.length)gaps.push('Contact people (MAN)');
  if(!prods.length)gaps.push('Products / opportunity');
  if(!(c.comments||[]).length)gaps.push('Team comments');
  return `<div class="panel eva">
    <div class="st" style="display:flex;align-items:center">EVA BRIEF — auto-generated
      <button class="btn btn-navy btn-sm" style="margin-left:auto" onclick="copyEva('${c.id}')">Copy brief</button></div>
    <div class="evasec"><b>1 · Executive summary</b><br>
      ${esc(c.name)} is a <b>${esc(c.type||'Prospect')}</b> in <b>${esc(c.industry||'—')}</b>${ind&&ind.sector?` (${esc(ind.sector)} sector, ${esc(ind.priority)} priority for Nandan)`:''}, currently at <b>${stageName(c.stage)}</b>.
      Presence: ${(c.locations||[]).map(esc).join(', ')||'not recorded'}. Owned by ${(c.owners||[]).map(esc).join(', ')||'—'}.</div>
    <div class="evasec"><b>2 · What we can do for them</b><div class="rt-view">${c.offer||'<i>Not filled in yet</i>'}</div></div>
    <div class="evasec"><b>3 · Industry intelligence</b><br>
      ${ind?`Prospects in ERP: <b>${ind.prospects||0}</b>${ind.goal?` · Goal: <b>${esc(ind.goal)}</b>`:''}
      ${ind.strategy?`<div class="hint" style="margin-top:4px">${mdlite(ind.strategy)}</div>`:''}
      ${ind.potentials?`<div style="margin-top:4px"><u>Potentials:</u> ${mdlite(ind.potentials)}</div>`:''}
      ${ind.projects?`<div style="margin-top:4px"><u>Past projects:</u> ${mdlite(ind.projects)}</div>`:''}`:'No industry data.'}</div>
    <div class="evasec"><b>4 · People intelligence</b><br>
      ${ppl.length?ppl.map(p=>`${esc(p.name)}${p.designation?` — ${esc(p.designation)}`:''}${p.location?` (${esc(p.location)})`:''}${p.linkedin?` <a class="lnk" href="${esc(p.linkedin)}" target="_blank">in↗</a>`:''}`).join('<br>'):'No contacts recorded yet.'}</div>
    <div class="evasec"><b>5 · Products & opportunity</b><br>
      ${prods.length?prods.map(p=>`${esc(p.name)}${p.goal?` (${esc(p.goal)})`:''}`).join(' · '):'No products linked yet.'}
      ${c.productNotes?`<div class="hint" style="margin-top:4px">${esc(c.productNotes)}</div>`:''}</div>
    <div class="evasec"><b>6 · Next actions</b><br>
      ${open.length?open.map(t=>`⬜ ${esc(t.text)}${t.owner?` — ${esc(t.owner)}`:''}${t.due?` (due ${esc(t.due)})`:''}`).join('<br>'):'No open to-dos — set the next dated action.'}</div>
    ${gaps.length?`<div class="evasec gap"><b>⚠ Data gaps</b><br>${gaps.map(esc).join(' · ')}</div>`:''}
  </div>`;
}
function copyEva(cid){const c=companyById(cid);const ind=indByName(c.industry)||{};
  const ppl=peopleOf(cid), open=todosOf(cid).filter(t=>t.status!=='done');
  const prods=(c.productIds||[]).map(productById).filter(Boolean);
  const strip=h=>{const d=document.createElement('div');d.innerHTML=h||'';return d.textContent.trim();};
  const txt=`EVA BRIEF — ${c.name}
1 EXECUTIVE SUMMARY
${c.name} · ${c.type} · ${c.industry||'—'}${ind.sector?` (${ind.sector}, ${ind.priority} priority)`:''} · ${stageName(c.stage)}
Locations: ${(c.locations||[]).join(', ')||'—'} · Owners: ${(c.owners||[]).join(', ')||'—'}
2 WHAT WE CAN DO
${strip(c.offer)||'Not filled in yet'}
3 INDUSTRY INTELLIGENCE
Prospects in ERP: ${ind.prospects||0}${ind.goal?` · Goal: ${ind.goal}`:''}
${ind.strategy||''}
${ind.potentials?'Potentials: '+ind.potentials:''}
${ind.projects?'Past projects: '+ind.projects:''}
4 PEOPLE
${ppl.map(p=>`${p.name}${p.designation?' — '+p.designation:''}${p.location?' ('+p.location+')':''}${p.linkedin?' '+p.linkedin:''}`).join('\n')||'None recorded'}
5 PRODUCTS & OPPORTUNITY
${prods.map(p=>p.name).join(', ')||'None linked'}
${c.productNotes||''}
6 NEXT ACTIONS
${open.map(t=>`- ${t.text}${t.owner?' — '+t.owner:''}${t.due?' (due '+t.due+')':''}`).join('\n')||'None open'}`;
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
  const c=companyById(cid);
  S.people.push({id:uid(),name:n,companyId:cid,designation:$id('pd-'+cid).value.trim(),
    location:$id('pl-'+cid).value,owner:currentUser||(c.owners||[])[0]||S.owners[0],phone:'',email:'',linkedin:'',notes:''});
  markDirty();render();}
function quickAddTodo(cid){const v=$id('td-'+cid).value.trim();if(!v)return;
  const c=companyById(cid);
  S.todos.push({id:uid(),text:v,companyId:cid,owner:currentUser||(c.owners||[])[0]||S.owners[0],due:'',status:'open'});markDirty();render();}
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
      <span class="name">${esc(p.name)}</span>
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
        <div style="display:flex;gap:8px;margin-top:8px"><button class="edit" onclick="editPerson('${p.id}')">edit</button>
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
  return `
  <div class="toolrow"><h2>Locations</h2><span class="hint">Master list — every tab picks from here</span>
    <div class="spacer"></div>
    <div style="min-width:260px">${acHtml('newLoc','loc','master','Add a location to masters…')}</div></div>
  ${locs.length?locs.map(loc=>{
    const comps=S.companies.filter(c=>(c.locations||[]).includes(loc)&&ownersOk(c.owners)).sort(byName);
    const ppl=S.people.filter(p=>p.location===loc&&ownerOk(p.owner)).sort(byName);
    return `<div class="card"><div class="card-head" onclick="toggleCard(this)">
      <span class="name">📍 ${esc(loc)}</span><span class="tag">${comps.length} companies</span><span class="tag orange">${ppl.length} people</span><span class="caret">▶</span></div>
      <div class="card-body">
        <div class="subsec"><div class="st">Companies here</div>
        ${comps.length?comps.map(c=>`<div class="mini"><span class="who">${esc(c.name)}</span>${typeTag(c.type)}<span class="hint">${esc(c.industry||'')}</span>${ownerPills(c.owners)}<span class="rowbtns"><button class="edit" onclick="openCompany('${c.id}')">open</button></span></div>`).join(''):'<div class="hint">None recorded.</div>'}</div>
        <div class="subsec"><div class="st">People here</div>
        ${ppl.length?ppl.map(p=>{const c=companyById(p.companyId);
          return `<div class="mini"><span class="who">${esc(p.name)}</span><span class="hint">${esc(p.designation||'')}${c?' · '+esc(c.name):''}</span>${ownerPill(p.owner)}</div>`;}).join(''):'<div class="hint">None recorded.</div>'}</div>
        ${(!comps.length&&!ppl.length&&S.locations.includes(loc))?`<button class="del" style="margin-top:8px" onclick="delMasterLoc('${enc(loc)}')">delete location</button>`:''}
      </div></div>`;}).join(''):'<div class="empty"><b>No locations yet.</b><br>Add one above — every company, person and form then picks from this master list.</div>'}`;
}
function delMasterLoc(e){const l=dec(e);S.locations=S.locations.filter(x=>x!==l);markDirty();render();}

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
  <div class="toolrow"><h2>To-Do</h2><span class="hint">${list.filter(t=>t.status!=='done').length} open</span>
    <div class="spacer"></div>
    <button class="btn btn-navy" onclick="copyTodosForGenie()">Copy to-dos for Sales Genie</button>
    <button class="btn btn-primary" onclick="toggleForm('tform')">+ Add to-do</button></div>
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
      <div style="flex:1"><div class="txt">${esc(t.text)}</div>
        <div class="meta">${ownerPill(t.owner)}${c?`<span class="tag" style="cursor:pointer" onclick="openCompany('${c.id}')">${esc(c.name)}</span>`:''}
        ${t.due?`<span class="${overdue?'overdue':''}">${overdue?'⚠ overdue ':''}due ${esc(t.due)}</span>`:''}</div></div>
      <button class="del" onclick="delTodo('${t.id}')">delete</button></div>`;}).join('')
   :'<div class="empty"><b>No to-dos.</b><br>Add tasks here or from inside a company page.</div>'}`;
}
function addTodo(){const v=$id('t_text').value.trim();if(!v)return alert('Task text is required.');
  S.todos.push({id:uid(),text:v,owner:$id('t_own').value,
    companyId:$id('t_comp').value,due:$id('t_due').value,status:'open'});
  markDirty();render();}
function toggleTodo(id){const t=S.todos.find(x=>x.id===id);t.status=t.status==='done'?'open':'done';markDirty();render();}
function delTodo(id){S.todos=S.todos.filter(t=>t.id!==id);markDirty();render();}
function copyTodosForGenie(){
  const payload=S.todos.map(t=>({id:t.id,task:t.text,owner:t.owner,company:(companyById(t.companyId)||{}).name||null,due:t.due||null,status:t.status,source:"my-sales-plan"}));
  navigator.clipboard.writeText(JSON.stringify(payload,null,2)).then(()=>alert('To-dos copied as JSON — paste into Sales Genie / share with Claude to sync.'))
  .catch(()=>alert(JSON.stringify(payload,null,2)));
}

/* ---------- render ---------- */
const VIEWS={companies:viewCompanies,industries:viewIndustries,people:viewPeople,locations:viewLocations,products:viewProducts,process:viewProcess,todos:viewTodos};
function render(){
  if(!S)return;
  if(!VIEWS[currentTab])currentTab='companies';
  renderOwners();renderTabs();
  $id('main').innerHTML=VIEWS[currentTab]();
  if(currentTab==='companies'&&!detailId)drawFormLocs();
}

/* ---------- expose handlers for inline on* attributes ---------- */
Object.assign(window,{render,setOwner,addOwnerMaster,setTab,setFilter,clearFilters,closeCompanyPage,
  toggleForm,toggleCard,showImg,rtc,acShow,acHide,acPick,acAdd,
  setSort,openCompany,addCompany,dropFormLoc,saveOffer,copyEva,addComment,renameCompany,delCompany,
  removeLocation,quickAddPerson,quickAddTodo,setStage,setCompanyType,setCompanyIndustry,updateOwners,
  unlinkProduct,saveProdNotes,jumpToCompany,setIndSort,toggleInd,addIndustry,delIndustry,renameIndustry,
  saveIndNote,jumpToProduct,addPerson,editPerson,delPerson,delMasterLoc,readProdImage,openProductForm,
  closeProductForm,editProduct,saveProduct,delProduct,linkIndToProduct,unlinkIndFromProduct,moveStage,
  addTodo,toggleTodo,delTodo,copyTodosForGenie,initDb,enc,dec,esc});
