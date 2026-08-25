(() => {
  'use strict';

  const STORAGE_KEY = 'vivaTrackerDB';
  const DB_VERSION = 1;
  const TODAY = () => localDateISO(new Date());
  const fmt = new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short'});
  const fmtLong = new Intl.DateTimeFormat(undefined,{weekday:'short',day:'numeric',month:'short'});

  let state = loadDB();
  let ui = { screen:'home', modal:null, historyQuery:'', calendarMonth:startOfMonth(new Date()), calendarSelected:TODAY() };

  function defaultDB(){
    return { version:DB_VERSION, settings:{dailyGoal:3}, vivas:[], reviews:[] };
  }
  function loadDB(){
    try {
      const raw=localStorage.getItem(STORAGE_KEY); if(!raw) return defaultDB();
      return migrate(JSON.parse(raw));
    } catch(e){ console.error(e); return defaultDB(); }
  }
  function migrate(db){
    if(!db || typeof db!=='object') return defaultDB();
    if(!db.version) db.version=1;
    db.settings={dailyGoal:3,...(db.settings||{})}; db.vivas=db.vivas||[]; db.reviews=db.reviews||[];
    db.version=DB_VERSION; return db;
  }
  function saveDB(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
  function id(){ return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function localDateISO(d){ const x=new Date(d); const y=x.getFullYear(); const m=String(x.getMonth()+1).padStart(2,'0'); const da=String(x.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; }
  function parseDate(s){ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
  function addDays(s,n){ const d=parseDate(s); d.setDate(d.getDate()+n); return localDateISO(d); }
  function addMonths(s,n){ const d=parseDate(s); d.setMonth(d.getMonth()+n); return localDateISO(d); }
  function startOfMonth(d){ return new Date(d.getFullYear(),d.getMonth(),1); }
  function esc(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function prettyDate(s){ return fmt.format(parseDate(s)); }
  function performanceHTML(p){ if(!p) return ''; const map={needs:'🔴 Needs work',okay:'🟠 Okay',strong:'🟢 Strong'}; return `<span class="perf ${p==='needs'?'red':p==='okay'?'amber':'green'}">${map[p]}</span>`; }
  function directionLabel(d){ return d==='given'?'Given':'Received'; }
  function reverseDirection(d){ return d==='given'?'received':'given'; }

  function dayCount(date){ return state.vivas.filter(v=>v.date===date).length; }
  function weekStart(d=new Date()){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
  function weekVivas(){ const s=weekStart(), e=new Date(s); e.setDate(e.getDate()+7); return state.vivas.filter(v=>{const d=parseDate(v.date);return d>=s&&d<e}).length; }
  function streak(){
    const goal=Number(state.settings.dailyGoal)||1; let count=0; let d=parseDate(TODAY());
    if(dayCount(localDateISO(d))<goal) d.setDate(d.getDate()-1);
    while(dayCount(localDateISO(d))>=goal){count++;d.setDate(d.getDate()-1);} return count;
  }
  function dueReviews(){ return state.reviews.filter(r=>r.active && r.nextReview<=TODAY()).sort((a,b)=>a.nextReview.localeCompare(b.nextReview)); }
  function upcomingReviews(){ return state.reviews.filter(r=>r.active && r.nextReview>TODAY()).sort((a,b)=>a.nextReview.localeCompare(b.nextReview)); }

  function createViva(data){
    const viva={id:id(),createdAt:new Date().toISOString(),date:data.date||TODAY(),direction:data.direction,topic:data.topic.trim(),domain:(data.domain||'').trim(),questions:(data.questions||'').trim(),revisionPoint:(data.revisionPoint||'').trim(),performance:data.performance||'',sourceReviewId:data.sourceReviewId||null};
    state.vivas.push(viva); saveDB(); return viva;
  }
  function scheduleReviewFromViva(viva,nextReview){
    if(!nextReview) return null;
    const r={id:id(),topic:viva.topic,domain:viva.domain,questions:viva.questions,revisionPoint:viva.revisionPoint,originalDirection:viva.direction,lastDirection:viva.direction,nextDirection:reverseDirection(viva.direction),nextReview,active:true,createdFromVivaId:viva.id,updatedAt:new Date().toISOString()};
    state.reviews.push(r); saveDB(); return r;
  }
  function completeReview(review){
    const viva=createViva({date:TODAY(),direction:review.nextDirection,topic:review.topic,domain:review.domain,questions:review.questions,revisionPoint:review.revisionPoint,sourceReviewId:review.id});
    review.lastDirection=viva.direction; review.nextDirection=reverseDirection(viva.direction); review.updatedAt=new Date().toISOString(); saveDB();
    ui.modal={type:'return',reviewId:review.id}; render();
  }
  function setReviewReturn(reviewId,value){
    const r=state.reviews.find(x=>x.id===reviewId); if(!r) return;
    if(value==='done'){r.active=false;} else {r.nextReview=value; r.active=true;} r.updatedAt=new Date().toISOString(); saveDB(); ui.modal=null; render();
  }

  function nav(){
    return `<nav class="nav"><div class="navInner">${[['home','Home'],['review','Review'],['calendar','Calendar'],['history','History'],['settings','Settings']].map(([k,l])=>`<button data-nav="${k}" class="${ui.screen===k?'active':''}">${l}</button>`).join('')}</div></nav>`;
  }
  function top(title,sub=''){ return `<header class="topbar"><h1>${title}</h1>${sub?`<div class="sub">${sub}</div>`:''}</header>`; }

  function render(){
    let html='';
    if(ui.screen==='home') html=homeScreen();
    if(ui.screen==='review') html=reviewScreen();
    if(ui.screen==='calendar') html=calendarScreen();
    if(ui.screen==='history') html=historyScreen();
    if(ui.screen==='settings') html=settingsScreen();
    document.getElementById('app').innerHTML=html+nav()+(ui.modal?modalHTML(ui.modal):''); bind();
  }

  function homeScreen(){
    const goal=Number(state.settings.dailyGoal)||1, today=dayCount(TODAY()), pct=Math.min(100,today/goal*100), due=dueReviews();
    const ws=weekStart(); let week='';
    for(let i=0;i<7;i++){const d=new Date(ws);d.setDate(d.getDate()+i);const iso=localDateISO(d),c=dayCount(iso);week+=`<div class="dayCell"><div class="dayDot ${c>=goal?'hit':''}">${c||'·'}</div>${d.toLocaleDateString(undefined,{weekday:'narrow'})}</div>`}
    return `${top('Viva Tracker','Minimum viable log. Maximum chance you actually use it.')}
    <main>
      <section class="card"><div class="progressWrap"><div><div class="hint">Today</div><div class="progressNum">${today} / ${goal}</div></div><div class="hint">${today>=goal?'Goal achieved ✓':`${goal-today} to go`}</div></div><div class="progressBar"><div style="width:${pct}%"></div></div></section>
      <div class="grid2"><div class="stat"><strong>${streak()}</strong><span>day streak</span></div><div class="stat"><strong>${weekVivas()}</strong><span>vivas this week</span></div></div>
      <div class="primaryRow"><button class="btn primary" data-open-log="received">Receive Viva</button><button class="btn secondary" data-open-log="given">Give Viva</button></div>
      <section class="card"><h2 class="sectionTitle">Quick Log</h2><form id="quickForm"><div class="quickGrid"><select class="select" name="direction"><option value="received">Received</option><option value="given">Given</option></select><input class="input" name="topic" autocomplete="off" placeholder="Viva topic" required></div><button class="btn primary full" style="margin-top:9px" type="submit">Save</button></form></section>
      <section class="card"><h2 class="sectionTitle">Last 7 days</h2><div class="week">${week}</div></section>
      <section class="card"><div class="itemTop"><h2 class="sectionTitle" style="margin:0">Due for revision</h2>${due.length?`<span class="badge due">${due.length} due</span>`:''}</div>${due.length?`<div class="list" style="margin-top:10px">${due.slice(0,4).map(reviewItemCompact).join('')}</div>`:`<div class="empty">Nothing due. Keep logging.</div>`}</section>
      <section class="card"><div class="legend"><span>🔴 Needs work</span><span>🟠 Okay</span><span>🟢 Strong</span><span><i class="dot red"></i> Due</span><span><i class="dot blue"></i> Upcoming/completed</span></div></section>
    </main>`;
  }

  function reviewItemCompact(r){ return `<div class="item"><div class="itemTop"><div><div class="topic">${esc(r.topic)}</div><div class="meta">Previously ${directionLabel(r.lastDirection)}${r.domain?` · ${esc(r.domain)}`:''}</div></div><span class="badge due">Due ${r.nextReview===TODAY()?'today':prettyDate(r.nextReview)}</span></div><div class="actions"><button class="btn primary small" data-complete-review="${r.id}">${r.nextDirection==='given'?'Give':'Receive'} this viva →</button></div></div>`; }

  function reviewScreen(){
    const due=dueReviews(), up=upcomingReviews();
    return `${top('Review','Reverse-viva revision: alternate Give ↔ Receive.')}
    <main><section class="card"><h2 class="sectionTitle">Due</h2>${due.length?`<div class="list">${due.map(reviewItemFull).join('')}</div>`:`<div class="empty">No reviews due today.</div>`}</section>
    <section class="card"><h2 class="sectionTitle">Upcoming</h2>${up.length?`<div class="list">${up.slice(0,20).map(reviewItemFull).join('')}</div>`:`<div class="empty">No upcoming reviews.</div>`}</section></main>`;
  }
  function reviewItemFull(r){
    const due=r.nextReview<=TODAY(); return `<div class="item"><div class="itemTop"><div><div class="topic">${esc(r.topic)}</div><div class="meta">${r.domain?esc(r.domain)+' · ':''}Originally ${directionLabel(r.originalDirection)} · Last ${directionLabel(r.lastDirection)}</div></div><span class="badge ${due?'due':'upcoming'}">${due?'Due':'Upcoming'} · ${prettyDate(r.nextReview)}</span></div>${r.questions?`<div class="meta" style="margin-top:8px"><b>Questions:</b> ${esc(r.questions)}</div>`:''}${r.revisionPoint?`<div class="meta"><b>Revise:</b> ${esc(r.revisionPoint)}</div>`:''}<div class="actions"><button class="btn primary small" data-complete-review="${r.id}">${r.nextDirection==='given'?'Give':'Receive'} this viva</button><button class="btn ghost small" data-change-date="${r.id}">Change date</button></div></div>`;
  }

  function calendarScreen(){
    const month=ui.calendarMonth, y=month.getFullYear(), m=month.getMonth(), firstDay=(new Date(y,m,1).getDay()+6)%7, days=new Date(y,m+1,0).getDate(), prevDays=new Date(y,m,0).getDate();
    const cells=[]; for(let i=0;i<42;i++){let dnum,dt,muted=false;if(i<firstDay){dnum=prevDays-firstDay+i+1;dt=new Date(y,m-1,dnum);muted=true}else if(i>=firstDay+days){dnum=i-firstDay-days+1;dt=new Date(y,m+1,dnum);muted=true}else{dnum=i-firstDay+1;dt=new Date(y,m,dnum)} const iso=localDateISO(dt); const hasV=state.vivas.some(v=>v.date===iso), hasR=state.reviews.some(r=>r.active&&r.nextReview===iso); cells.push(`<button class="calDay ${muted?'muted':''} ${ui.calendarSelected===iso?'selected':''}" data-caldate="${iso}">${dnum}<span class="dots">${hasV?'<i class="dot blue"></i>':''}${hasR?'<i class="dot red"></i>':''}</span></button>`)}
    const selected=ui.calendarSelected, vivas=state.vivas.filter(v=>v.date===selected), reviews=state.reviews.filter(r=>r.active&&r.nextReview===selected);
    return `${top('Calendar','Blue = completed viva · Red = revision due')}
    <main><section class="card"><div class="calendarHead"><button class="btn ghost small" data-month="-1">‹</button><b>${month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</b><button class="btn ghost small" data-month="1">›</button></div><div class="calendarGrid">${['M','T','W','T','F','S','S'].map(x=>`<div class="calDow">${x}</div>`).join('')}${cells.join('')}</div></section>
    <section class="card"><h2 class="sectionTitle">${fmtLong.format(parseDate(selected))}</h2>${!vivas.length&&!reviews.length?'<div class="empty">Nothing logged or scheduled.</div>':''}${vivas.length?`<div class="label">Completed</div><div class="list">${vivas.map(vivaItem).join('')}</div>`:''}${reviews.length?`<div class="label">Scheduled review</div><div class="list">${reviews.map(reviewItemFull).join('')}</div>`:''}</section></main>`;
  }

  function historyScreen(){
    const q=ui.historyQuery.trim().toLowerCase(); let items=[...state.vivas].sort((a,b)=>(b.date+b.createdAt).localeCompare(a.date+a.createdAt));
    if(q) items=items.filter(v=>[v.topic,v.domain,v.questions,v.revisionPoint].some(x=>(x||'').toLowerCase().includes(q)));
    return `${top('History','Every viva, searchable.')}
    <main><div class="search"><input class="input" id="historySearch" value="${esc(ui.historyQuery)}" placeholder="Search topic, domain, questions, notes"></div><section class="card">${items.length?`<div class="list">${items.map(vivaItem).join('')}</div>`:`<div class="empty">${q?'No matching vivas.':'No vivas logged yet.'}</div>`}</section></main>`;
  }
  function vivaItem(v){ return `<div class="item"><div class="itemTop"><div><div class="topic">${esc(v.topic)}</div><div class="meta">${prettyDate(v.date)}${v.domain?` · ${esc(v.domain)}`:''}</div></div><span class="badge ${v.direction}">${directionLabel(v.direction)}</span></div>${v.questions?`<div class="meta" style="margin-top:7px"><b>Questions:</b> ${esc(v.questions)}</div>`:''}${v.revisionPoint?`<div class="meta"><b>Revise:</b> ${esc(v.revisionPoint)}</div>`:''}${v.performance?`<div style="margin-top:7px">${performanceHTML(v.performance)}</div>`:''}</div>`; }

  function settingsScreen(){
    const g=state.settings.dailyGoal;
    return `${top('Settings','Simple controls, portable data.')}
    <main><section class="card"><h2 class="sectionTitle">Daily viva goal</h2><div class="chips">${[1,2,3].map(n=>`<button class="chip ${g===n?'active':''}" data-goal="${n}">${n} / day</button>`).join('')}<button class="chip ${![1,2,3].includes(g)?'active':''}" data-custom-goal>Custom</button></div><div class="hint" style="margin-top:10px">A day counts toward your streak only when you reach this goal. Extra vivas still count.</div></section>
    <section class="card"><h2 class="sectionTitle">Backup</h2><button class="btn primary full" data-export>Export Backup (.json)</button><label class="btn ghost full" style="display:flex;align-items:center;justify-content:center;margin-top:9px">Import Backup<input id="importFile" type="file" accept="application/json,.json" hidden></label><div class="hint" style="margin-top:10px">Backups are versioned and include history, revisions and settings.</div></section>
    <section class="card"><h2 class="sectionTitle">Storage</h2><div class="meta">Version ${DB_VERSION} · ${state.vivas.length} viva entries · ${state.reviews.filter(r=>r.active).length} active reviews</div><div class="hint" style="margin-top:8px">This version stores data locally on this device. The data layer is kept separate so a future cloud sync service can replace local storage without changing the screens.</div></section></main>`;
  }

  function modalHTML(m){
    if(m.type==='log') return logModal(m.direction);
    if(m.type==='schedule') return scheduleModal(m.vivaId);
    if(m.type==='return') return returnModal(m.reviewId);
    if(m.type==='changeDate') return changeDateModal(m.reviewId);
    if(m.type==='customGoal') return customGoalModal();
    return '';
  }
  function logModal(direction){
    return `<div class="modalBackdrop" data-close-modal><div class="sheet" data-sheet><div class="sheetHandle"></div><div class="sheetTitle">Log viva</div><div class="hint">Topic is the only field you need.</div><form id="logForm"><div class="seg" style="margin-top:12px"><button type="button" class="${direction==='received'?'active':''}" data-log-dir="received">Received</button><button type="button" class="${direction==='given'?'active':''}" data-log-dir="given">Given</button></div><input type="hidden" name="direction" value="${direction}"><div class="label">Viva topic *</div><input class="input" name="topic" autofocus required placeholder="e.g. Cerebral blood flow"><button class="btn primary full" style="margin-top:10px" type="submit" name="saveTopicOnly" value="1">Save topic only</button><hr><details><summary style="font-weight:800;cursor:pointer">Add optional details</summary><div class="label">Domain</div><input class="input" name="domain" placeholder="e.g. Physiology"><div class="label">Questions asked</div><textarea class="textarea" name="questions" placeholder="Only if useful — no need to transcribe everything"></textarea><div class="label">One thing to revise</div><input class="input" name="revisionPoint" placeholder="Key gap or follow-up"><div class="label">Performance</div><div class="chips"><button type="button" class="chip" data-perf="needs">🔴 Needs work</button><button type="button" class="chip" data-perf="okay">🟠 Okay</button><button type="button" class="chip" data-perf="strong">🟢 Strong</button></div><input type="hidden" name="performance"><div class="label">Date</div><input class="input" type="date" name="date" value="${TODAY()}"><button class="btn secondary full" style="margin-top:12px" type="submit">Save with details</button></details></form></div></div>`;
  }
  function scheduleModal(vivaId){
    return `<div class="modalBackdrop"><div class="sheet" data-sheet><div class="sheetHandle"></div><div class="sheetTitle">When should this return?</div><div class="hint">Optional. Reverse direction will be suggested next time.</div><div class="list" style="margin-top:12px">${[['Tomorrow',addDays(TODAY(),1)],['3 days',addDays(TODAY(),3)],['1 week',addDays(TODAY(),7)],['2 weeks',addDays(TODAY(),14)],['1 month',addMonths(TODAY(),1)]].map(([l,d])=>`<button class="btn ghost full" data-schedule-viva="${vivaId}" data-date="${d}">${l}</button>`).join('')}<button class="btn ghost full" data-custom-schedule="${vivaId}">Choose a custom date</button><button class="btn full" data-skip-schedule>Not now</button></div><div id="customScheduleSlot"></div></div></div>`;
  }
  function returnModal(reviewId){
    return `<div class="modalBackdrop"><div class="sheet" data-sheet><div class="sheetHandle"></div><div class="sheetTitle">When should this topic return?</div><div class="list" style="margin-top:12px">${[['Tomorrow',addDays(TODAY(),1)],['3 days',addDays(TODAY(),3)],['1 week',addDays(TODAY(),7)],['2 weeks',addDays(TODAY(),14)]].map(([l,d])=>`<button class="btn ghost full" data-return-review="${reviewId}" data-date="${d}">${l}</button>`).join('')}<button class="btn primary full" data-return-review="${reviewId}" data-date="done">Done for now</button></div></div></div>`;
  }
  function changeDateModal(reviewId){ const r=state.reviews.find(x=>x.id===reviewId); return `<div class="modalBackdrop" data-close-modal><div class="sheet" data-sheet><div class="sheetHandle"></div><div class="sheetTitle">Change review date</div><form id="changeDateForm"><input type="hidden" name="reviewId" value="${reviewId}"><input class="input" type="date" name="date" value="${r?.nextReview||TODAY()}" required style="margin-top:12px"><button class="btn primary full" style="margin-top:10px">Save date</button></form></div></div>`; }
  function customGoalModal(){ return `<div class="modalBackdrop" data-close-modal><div class="sheet" data-sheet><div class="sheetHandle"></div><div class="sheetTitle">Custom daily goal</div><form id="customGoalForm"><input class="input" type="number" name="goal" min="1" max="99" value="${state.settings.dailyGoal}" required style="margin-top:12px"><button class="btn primary full" style="margin-top:10px">Save goal</button></form></div></div>`; }

  function bind(){
    document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{ui.screen=b.dataset.nav;ui.modal=null;render()});
    document.querySelectorAll('[data-open-log]').forEach(b=>b.onclick=()=>{ui.modal={type:'log',direction:b.dataset.openLog};render()});
    const qf=document.getElementById('quickForm'); if(qf) qf.onsubmit=e=>{e.preventDefault();const f=new FormData(qf);const topic=(f.get('topic')||'').trim();if(!topic)return;const v=createViva({date:TODAY(),direction:f.get('direction'),topic});ui.modal={type:'schedule',vivaId:v.id};render()};
    const lf=document.getElementById('logForm'); if(lf) lf.onsubmit=e=>{e.preventDefault();const f=new FormData(lf);const v=createViva({date:f.get('date')||TODAY(),direction:f.get('direction'),topic:f.get('topic'),domain:f.get('domain'),questions:f.get('questions'),revisionPoint:f.get('revisionPoint'),performance:f.get('performance')});ui.modal={type:'schedule',vivaId:v.id};render()};
    document.querySelectorAll('[data-log-dir]').forEach(b=>b.onclick=()=>{ui.modal.direction=b.dataset.logDir;render()});
    document.querySelectorAll('[data-perf]').forEach(b=>b.onclick=()=>{const form=b.closest('form');form.elements.performance.value=b.dataset.perf;form.querySelectorAll('[data-perf]').forEach(x=>x.classList.toggle('active',x===b))});
    document.querySelectorAll('[data-schedule-viva]').forEach(b=>b.onclick=()=>{const v=state.vivas.find(x=>x.id===b.dataset.scheduleViva);scheduleReviewFromViva(v,b.dataset.date);ui.modal=null;render()});
    document.querySelectorAll('[data-custom-schedule]').forEach(b=>b.onclick=()=>{const slot=document.getElementById('customScheduleSlot');slot.innerHTML=`<form id="customScheduleForm" style="margin-top:10px"><input type="hidden" name="vivaId" value="${b.dataset.customSchedule}"><input class="input" type="date" name="date" min="${TODAY()}" required><button class="btn primary full" style="margin-top:8px">Schedule</button></form>`;document.getElementById('customScheduleForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),v=state.vivas.find(x=>x.id===f.get('vivaId'));scheduleReviewFromViva(v,f.get('date'));ui.modal=null;render()}});
    document.querySelectorAll('[data-skip-schedule]').forEach(b=>b.onclick=()=>{ui.modal=null;render()});
    document.querySelectorAll('[data-complete-review]').forEach(b=>b.onclick=()=>{const r=state.reviews.find(x=>x.id===b.dataset.completeReview);if(r)completeReview(r)});
    document.querySelectorAll('[data-return-review]').forEach(b=>b.onclick=()=>setReviewReturn(b.dataset.returnReview,b.dataset.date));
    document.querySelectorAll('[data-change-date]').forEach(b=>b.onclick=()=>{ui.modal={type:'changeDate',reviewId:b.dataset.changeDate};render()});
    const cdf=document.getElementById('changeDateForm'); if(cdf)cdf.onsubmit=e=>{e.preventDefault();const f=new FormData(cdf),r=state.reviews.find(x=>x.id===f.get('reviewId'));if(r){r.nextReview=f.get('date');r.active=true;r.updatedAt=new Date().toISOString();saveDB()}ui.modal=null;render()};
    document.querySelectorAll('[data-month]').forEach(b=>b.onclick=()=>{ui.calendarMonth=new Date(ui.calendarMonth.getFullYear(),ui.calendarMonth.getMonth()+Number(b.dataset.month),1);render()});
    document.querySelectorAll('[data-caldate]').forEach(b=>b.onclick=()=>{ui.calendarSelected=b.dataset.caldate;const d=parseDate(b.dataset.caldate);ui.calendarMonth=startOfMonth(d);render()});
    const hs=document.getElementById('historySearch');if(hs)hs.oninput=e=>{ui.historyQuery=e.target.value; const pos=e.target.selectionStart; render(); const n=document.getElementById('historySearch');n.focus();n.setSelectionRange(pos,pos)};
    document.querySelectorAll('[data-goal]').forEach(b=>b.onclick=()=>{state.settings.dailyGoal=Number(b.dataset.goal);saveDB();render()});
    document.querySelectorAll('[data-custom-goal]').forEach(b=>b.onclick=()=>{ui.modal={type:'customGoal'};render()});
    const cgf=document.getElementById('customGoalForm');if(cgf)cgf.onsubmit=e=>{e.preventDefault();const f=new FormData(cgf);state.settings.dailyGoal=Math.max(1,Number(f.get('goal'))||1);saveDB();ui.modal=null;render()};
    document.querySelectorAll('[data-export]').forEach(b=>b.onclick=exportBackup);
    const imp=document.getElementById('importFile');if(imp)imp.onchange=importBackup;
    document.querySelectorAll('[data-close-modal]').forEach(x=>x.onclick=e=>{if(e.target===x){ui.modal=null;render()}});document.querySelectorAll('[data-sheet]').forEach(x=>x.onclick=e=>e.stopPropagation());
  }

  function exportBackup(){
    const payload={backupFormat:'viva-tracker',version:DB_VERSION,exportedAt:new Date().toISOString(),data:state};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`viva-tracker-backup-${TODAY()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function importBackup(e){
    const file=e.target.files?.[0]; if(!file)return; const reader=new FileReader();
    reader.onload=()=>{try{const p=JSON.parse(reader.result);if(p.backupFormat!=='viva-tracker'||!p.data)throw new Error('Invalid backup');state=migrate(p.data);saveDB();alert('Backup restored successfully.');render()}catch(err){alert('Could not import this backup. Please choose a valid Viva Tracker JSON backup.')}};reader.readAsText(file);
  }

  if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  render();
})();
