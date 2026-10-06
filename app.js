/*
 * app.js — 업무 일정 앱 본체
 *  구성: 유틸 → 날짜·주차 → 상태 계산 → 작업 폴더 저장/불러오기 → 화면(상단·간트·편집창) → 팝업(프로젝트·주차·설정)
 *        → 시작 화면 → 서비스 워커(업데이트 안내) → 초기 실행
 *  의존: xlsx.js(window.XL), store.js(window.Store)
 *  데이터 원본: 작업 폴더의 "업무일정_YYYY_Wnn.xlsx" (nn = 주차 번호, 예: 업무일정_2026_W41.xlsx). 브라우저에는 화면 설정과 복구용 사본만 둔다.
 */
(function(){
'use strict';
const DAY=864e5;
const WEEK_START=0;                       // 주 시작 요일: 일요일 고정
const PREF_KEY='work-schedule-prefs-v1';  // 화면 설정(접기·필터·화면 방향)만 저장
const now=new Date();
const TODAY=Math.round(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())/DAY);
const YEAR=now.getFullYear();

/* ---------- 유틸 ---------- */
const dn=s=>{if(!s)return null;const[y,m,d]=s.split('-').map(Number);return Math.round(Date.UTC(y,m-1,d)/DAY)};
const iso=n=>new Date(n*DAY).toISOString().slice(0,10);
const md=n=>{const d=new Date(n*DAY);return (d.getUTCMonth()+1)+'/'+d.getUTCDate()};
const dow=n=>new Date(n*DAY).getUTCDay();
const clone=o=>JSON.parse(JSON.stringify(o));
const $=s=>document.querySelector(s);
const hm=t=>{const d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
const mdhm=t=>{const d=new Date(t);return `${d.getMonth()+1}/${d.getDate()} `+hm(t)};
let uidSeq=0;const uid=p=>p+Date.now().toString(36)+(uidSeq++).toString(36);
// 화면 요소 생성 (사용자 입력은 textContent로만 넣음 → XSS 방지)
function h(tag,props,...kids){
  const el=document.createElement(tag);
  if(props)for(const k in props){const v=props[k];if(v==null||v===false)continue;
    if(k==='class')el.className=v;
    else if(k==='style'&&typeof v==='object')Object.assign(el.style,v);
    else if(k.startsWith('on'))el.addEventListener(k.slice(2),v);
    else if(k==='text')el.textContent=v;
    else el.setAttribute(k,v===true?'':v);}
  for(const c of kids.flat()){if(c==null||c===false)continue;el.append(c instanceof Node?c:document.createTextNode(String(c)))}
  return el;
}
function toast(msg){const old=$('.toast');if(old)old.remove();const t=h('div',{class:'toast',role:'status',text:msg});document.body.append(t);setTimeout(()=>t.remove(),2600)}

/* ---------- 상태 ---------- */
const DEF_FILTERS={currentOnly:true,showPast:false,showDone:false};
const S={projects:[],items:[],fold:{},filters:{...DEF_FILTERS},orient:'auto'};
try{const p=JSON.parse(localStorage.getItem(PREF_KEY)||'null');if(p){S.fold=p.fold||{};S.filters={...DEF_FILTERS,...p.filters};S.orient=p.orient||'auto'}}catch(e){}
function persist(){try{localStorage.setItem(PREF_KEY,JSON.stringify({fold:S.fold,filters:S.filters,orient:S.orient}))}catch(e){}}

let DIR=null;        // 작업 폴더 핸들
let LOADED=null;     // 현재 데이터의 기준 파일 {Y,n,ws,name,mtime}
let DIRTY=false, SAVING=null, SAVE_ERR=false, LAST_SAVE=null, saveTimer=null;

/* ---------- 날짜 · 주차 ---------- */
const JAN1=dn(`${YEAR}-01-01`), DEC31=dn(`${YEAR}-12-31`);
const wsOf=n=>n-((dow(n)-WEEK_START+7)%7);
const gridStart=()=>wsOf(JAN1);
const thisWS=()=>wsOf(TODAY);
// 주차 번호: 그 해 1월 1일이 들어 있는 주가 W01. 주의 마지막 날이 속한 해를 기준으로 함
function weekInfo(ws){const Y=new Date((ws+6)*DAY).getUTCFullYear();const n=Math.floor((ws-wsOf(dn(`${Y}-01-01`)))/7)+1;return{Y,n,tab:'W'+String(n).padStart(2,'0')}}
const wsFromYN=(Y,n)=>wsOf(dn(`${Y}-01-01`))+(n-1)*7;
const viewStart=()=>S.filters.showPast?gridStart():thisWS();

/* ---------- 상태 계산 (목표 대비 실제) ---------- */
function status(it,R=TODAY){
  const ts=dn(it.ts),te=dn(it.te),as=dn(it.as),ae=dn(it.ae);
  if(ae!=null&&ae<=R)return{k:'done',label:'완료',d:te!=null?ae-te:0};
  if(as!=null&&as<=R)return te!=null&&R>te?{k:'late',label:'지연',d:R-te}:{k:'run',label:'진행',d:0};
  if(ts!=null&&R>ts)return{k:'wait',label:'착수지연',d:R-ts};
  return{k:'plan',label:'예정',d:0};
}
function delayText(st){
  if(st.k==='done')return st.d>0?`+${st.d}일`:st.d<0?`${-st.d}일 조기`:'정시';
  if(st.k==='late'||st.k==='wait')return `+${st.d}일`;
  return '';
}
const startOf=it=>Math.min(...[dn(it.ts),dn(it.as)].filter(v=>v!=null));
const endOf=it=>Math.max(...[dn(it.te),dn(it.ae),dn(it.as)].filter(v=>v!=null));
function visible(it,win){
  const f=S.filters,st=status(it);
  if(!f.showDone&&st.k==='done')return false;
  if(f.currentOnly&&st.k!=='done'&&!(st.k==='run'||st.k==='late'||st.k==='wait'||(st.k==='plan'&&dn(it.ts)<=TODAY)))return false;
  if(!f.showPast&&endOf(it)<thisWS()&&st.k==='done')return false;
  if(win){const[a,b]=win;const e=st.k==='done'?endOf(it):Math.max(endOf(it),TODAY);if(startOf(it)>b||e<a)return false}
  return true;
}
const sortItems=arr=>arr.sort((a,b)=>(dn(a.ts)??9e9)-(dn(b.ts)??9e9)||a.name.localeCompare(b.name,'ko'));
const itemsOf=pid=>sortItems(S.items.filter(i=>i.pid===pid));

/* ---------- 엑셀 ↔ 데이터 ---------- */
const SHEET='업무일정';   // 시트 1개. 주차는 파일명으로 구분
const XCOLS=['프로젝트','프로젝트 비고','Action Item','목표 시작','목표 완료','실제 시작','실제 완료','상태','지연(일)','비고'];
const XTYPES=['s','w','s','d','d','d','d','s','n','w'];
const XWIDTHS=[18,30,26,12,12,12,12,9,9,46];
function dataToSheet(data,ws){
  const R=Math.min(ws+6,TODAY),rows=[];
  for(const p of data.projects){
    const its=sortItems(data.items.filter(i=>i.pid===p.id));
    if(!its.length){rows.push([p.name,p.note||'','',null,null,null,null,'',null,'']);continue}
    its.forEach((it,k)=>{const st=status(it,R);
      rows.push([p.name,k===0?(p.note||''):'',it.name,dn(it.ts),dn(it.te),dn(it.as),dn(it.ae),st.label,(st.k==='plan'||st.k==='run')?null:st.d,it.note||''])});
  }
  return{name:SHEET,header:XCOLS,widths:XWIDTHS,types:XTYPES,rows};
}
function cellDate(v){
  if(v==null||v==='')return'';
  if(typeof v==='number'&&isFinite(v))return iso(Math.round(v)-25569);   // 엑셀 날짜 일련번호
  const m=String(v).trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:'';
}
function sheetToData(sh){
  const hdr=(sh.rows[0]||[]).map(v=>String(v??'').trim()),ix=n=>hdr.indexOf(n);
  if(ix('프로젝트')<0||ix('Action Item')<0)throw new Error(`'${sh.name}' 시트에 '프로젝트' 또는 'Action Item' 열이 없습니다.`);
  const g=(r,n)=>{const i=ix(n);return i<0?null:r[i]};
  const projects=[],items=[],byName={};
  for(const r of sh.rows.slice(1)){
    const pn=String(g(r,'프로젝트')??'').trim();if(!pn)continue;
    let p=byName[pn];
    if(!p){p=byName[pn]={id:uid('p'),name:pn,note:''};projects.push(p)}
    const pnote=String(g(r,'프로젝트 비고')??'');if(pnote&&!p.note)p.note=pnote;
    const an=String(g(r,'Action Item')??'').trim();if(!an)continue;
    items.push({id:uid('i'),pid:p.id,name:an,ts:cellDate(g(r,'목표 시작')),te:cellDate(g(r,'목표 완료')),as:cellDate(g(r,'실제 시작')),ae:cellDate(g(r,'실제 완료')),note:String(g(r,'비고')??'')});
  }
  return{projects,items};
}
async function readFileData(f){
  const sheets=await XL.parse(await Store.folder.read(f.handle));
  const sh=sheets.find(s=>String(s.name).trim()===SHEET)||sheets[0];
  if(!sh)throw new Error('시트가 없습니다.');
  return sheetToData(sh);
}
const fileWS=f=>wsFromYN(f.Y,f.n);

/* ---------- 저장 ---------- */
// 저장 대상 주차: 이번 주 (불러온 파일이 더 뒤 주차면 그 주차)
const targetWS=()=>Math.max(thisWS(),LOADED?LOADED.ws:-Infinity);
const liveData=()=>({projects:S.projects,items:S.items});
function cacheSet(dirty){if(DIR)Store.kv.set('cache',{folder:DIR.name,data:clone(liveData()),ts:Date.now(),dirty,file:LOADED&&LOADED.name})}
// 데이터가 바뀔 때마다 호출: 복구용 사본 보관 + 자동 저장 예약
function changed(){
  DIRTY=true;SAVE_ERR=false;cacheSet(true);
  renderStatus();
  clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,400);
}
function saveNow(){
  clearTimeout(saveTimer);
  if(!DIR)return Promise.resolve();
  if(SAVING)return SAVING.then(()=>DIRTY?saveNow():null);
  SAVING=(async()=>{
    const ws=targetWS(),{Y,n}=weekInfo(ws),name=Store.folder.fileName(Y,n);
    const snap=clone(liveData());
    renderStatus('saving');
    try{
      await Store.folder.write(DIR,name,XL.build([dataToSheet(snap,ws)]));
      LAST_SAVE=Date.now();SAVE_ERR=false;
      LOADED={Y,n,ws,name,mtime:LAST_SAVE};
      if(JSON.stringify(snap)===JSON.stringify(liveData())){DIRTY=false;cacheSet(false)}
    }catch(e){
      SAVE_ERR=true;
      toast(e&&e.name==='NotAllowedError'?'폴더 접근 권한이 없습니다. [저장]을 눌러 다시 허용하세요.':'저장하지 못했습니다: '+((e&&e.message)||e));
    }finally{
      SAVING=null;renderStatus();renderBanners();
      if(DIRTY&&!SAVE_ERR){clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,400)}
    }
  })();
  return SAVING;
}
async function saveButton(){
  if(OPEN&&!commit())return;
  render();
  let p='denied';try{p=await Store.folder.permission(DIR,true)}catch(e){}
  if(p!=='granted'){toast('폴더 접근이 허용되지 않아 저장하지 못했습니다.');return}
  DIRTY=true;await saveNow();
  if(!SAVE_ERR)toast('저장했습니다 · '+LOADED.name);
}

/* ---------- 상단 ---------- */
let OPEN=null, DRAFT=null, NEWID=null, lastClosed=null, needScroll=true, delArmed=false;
// 키보드가 열려도 바뀌지 않도록 기기 방향 기준으로 판단
const mode=()=>{if(S.orient!=='auto')return S.orient;const o=screen.orientation&&screen.orientation.type;if(o)return o.startsWith('landscape')?'land':'port';return screen.width>screen.height?'land':'port'};

function renderStatus(force){
  const el=$('#fline');if(!el)return;el.textContent='';
  if(!DIR)return;
  const st=h('span',{class:'fst'});
  if(force==='saving'||SAVING)st.append('저장 중…');
  else if(SAVE_ERR)st.append(h('span',{class:'err',text:'저장 실패 · [저장]을 눌러 다시 시도'}));
  else if(DIRTY)st.append(h('span',{class:'dirty',text:'● 저장 안 된 변경 있음'}));
  else if(LAST_SAVE)st.append('저장됨 '+hm(LAST_SAVE));
  else if(LOADED)st.append('불러옴');
  const file=LOADED?LOADED.name:'파일 없음 (저장하면 '+Store.folder.fileName(weekInfo(targetWS()).Y,weekInfo(targetWS()).n)+')';
  el.append(h('span',{class:'fdir',text:'폴더: '+DIR.name}),' · ',h('span',{class:'ffile',text:file}),' · ',st);
  const b=$('#b-save');b.classList.toggle('primary',DIRTY||SAVE_ERR);
}
function renderBanners(){
  const box=$('#banners');box.textContent='';
  const ban=(cls,...kids)=>box.append(h('div',{class:'banner '+cls},...kids));
  if(LOADED&&LOADED.ws<thisWS()){const w=weekInfo(targetWS());
    ban('info',h('span',{text:`최신 파일: ${weekInfo(LOADED.ws).tab} · 수정하면 ${Store.folder.fileName(w.Y,w.n)}로 새로 저장됩니다.`}))}
  if(!S.projects.length)ban('info',h('span',{text:LOADED?'프로젝트가 없습니다. [프로젝트]에서 추가하세요.':'작업 폴더에 업무일정 파일이 없습니다. [프로젝트]에서 시작하세요.'}));
}
function renderHeader(){
  const w=weekInfo(thisWS());
  $('#yr').textContent=`${iso(TODAY).replace(/-/g,'.')} (${w.tab})`;
  document.querySelectorAll('.chip[data-f]').forEach(b=>b.setAttribute('aria-pressed',String(!!S.filters[b.dataset.f])));
  const c={run:0,late:0,wait:0,plan:0,done:0};S.items.forEach(i=>c[status(i).k]++);
  const sum=$('#summary');sum.textContent='';
  [['run','진행'],['late','지연'],['wait','착수지연'],['plan','예정'],['done','완료']].forEach(([k,l])=>
    sum.append(h('span',{class:'sum-i k-'+k},h('span',{class:'dot'}),l,' ',h('b',{text:c[k]}))));
  sum.append(h('span',{class:'legend'},h('span',{class:'sum-i'},h('span',{class:'sw-t'}),'목표'),h('span',{class:'sum-i'},h('span',{class:'sw-a'}),'실제')));
  renderStatus();renderBanners();
}

/* ---------- 편집창 ---------- */
function editor(it){
  if(!DRAFT||DRAFT.id!==it.id){DRAFT=clone(it);delArmed=false}
  const D=DRAFT;
  const stBox=h('div',{class:'ed-status'}), err=h('div',{class:'ed-err',role:'alert'});
  const upd=()=>{stBox.textContent='';const st=status(D);stBox.append(h('span',{class:'st k-'+st.k,text:st.label}),delayText(st)?'목표 대비 '+delayText(st):'')};
  const inp=(label,key,type)=>h('label',{class:'fld'},h('span',{text:label}),
    (()=>{const i=h('input',{type,id:'ed-'+key});i.value=D[key]||'';i.addEventListener('input',()=>{D[key]=i.value;upd()});return i})());
  const sel=h('select',{id:'ed-pid'},S.projects.map(p=>h('option',{value:p.id,text:p.name})));
  sel.value=D.pid;sel.addEventListener('change',()=>D.pid=sel.value);
  const ta=h('textarea',{id:'ed-note',placeholder:'계획과 결과를 자유롭게 기록하세요.\n예) 계획: …\n    결과: …'});ta.value=D.note||'';ta.addEventListener('input',()=>D.note=ta.value);
  const delBtn=h('button',{class:'danger'+(delArmed?' armed':''),text:delArmed?'한 번 더 누르면 삭제':'삭제',onclick:()=>{
    if(!delArmed){delArmed=true;delBtn.classList.add('armed');delBtn.textContent='한 번 더 누르면 삭제';return}
    S.items=S.items.filter(x=>x.id!==it.id);OPEN=null;DRAFT=null;changed();render();toast('삭제했습니다')}});
  const ed=h('div',{class:'editor'},
    h('div',{class:'ed-top'},inp('Action Item','name','text'),h('label',{class:'fld'},h('span',{text:'프로젝트'}),sel)),
    h('div',{class:'ed-dates'},inp('목표 시작','ts','date'),inp('목표 완료','te','date'),inp('실제 시작','as','date'),inp('실제 완료','ae','date')),
    stBox,
    h('label',{class:'fld'},h('span',{text:'비고 (계획 · 결과)'}),ta),
    err,
    h('div',{class:'ed-foot'},delBtn,h('span',{class:'hint',text:'다른 곳을 누르면 저장 후 닫힙니다'}),h('button',{class:'primary',text:'확인',onclick:()=>{if(commit())render()}})));
  upd();ed._err=err;
  return ed;
}
function validate(D){
  if(!D.name.trim())return'Action Item 이름을 입력하세요.';
  if(!D.ts||!D.te)return'목표 시작일과 목표 완료일을 입력하세요.';
  if(dn(D.te)<dn(D.ts))return'목표 완료일이 목표 시작일보다 빠릅니다.';
  if(D.ae&&!D.as)return'실제 완료일을 넣으려면 실제 시작일이 필요합니다.';
  if(D.as&&D.ae&&dn(D.ae)<dn(D.as))return'실제 완료일이 실제 시작일보다 빠릅니다.';
  return'';
}
function projEditor(p){
  if(!DRAFT||DRAFT.id!==p.id)DRAFT=clone(p);
  const D=DRAFT,err=h('div',{class:'ed-err',role:'alert'});
  const nm=h('input',{type:'text',id:'pe-name'});nm.value=D.name;nm.addEventListener('input',()=>D.name=nm.value);
  const ta=h('textarea',{id:'pe-note',placeholder:'프로젝트 목표, 리스크, 회의 메모 등을 기록하세요.'});ta.value=D.note||'';ta.addEventListener('input',()=>D.note=ta.value);
  const ed=h('div',{class:'editor'},
    h('label',{class:'fld'},h('span',{text:'프로젝트'}),nm),
    h('label',{class:'fld'},h('span',{text:'프로젝트 비고'}),ta),err,
    h('div',{class:'ed-foot'},h('span',{class:'hint',text:'다른 곳을 누르면 저장 후 닫힙니다'}),h('button',{class:'primary',text:'확인',onclick:()=>{if(commit())render()}})));
  ed._err=err;return ed;
}
// 편집 내용 반영 (검증 실패 시 false → 편집창 유지)
function commit(){
  if(!OPEN)return true;
  if(OPEN.startsWith('P:')){
    const p=S.projects.find(x=>'P:'+x.id===OPEN);
    if(!p||!DRAFT){OPEN=null;DRAFT=null;return true}
    if(!DRAFT.name.trim()){const ed=$('.editor');if(ed)ed._err.textContent='프로젝트 이름을 입력하세요.';return false}
    DRAFT.name=DRAFT.name.trim();
    if(JSON.stringify(p)!==JSON.stringify(DRAFT)){Object.assign(p,DRAFT);changed()}
    OPEN=null;DRAFT=null;return true;
  }
  const it=S.items.find(i=>i.id===OPEN);
  if(!it||!DRAFT){OPEN=null;DRAFT=null;return true}
  const e=validate(DRAFT);
  if(e){const ed=$('.editor');if(ed)ed._err.textContent=e;return false}
  DRAFT.name=DRAFT.name.trim();
  if(JSON.stringify(it)!==JSON.stringify(DRAFT)||NEWID===it.id){Object.assign(it,DRAFT);changed()}
  OPEN=null;DRAFT=null;NEWID=null;
  return true;
}
document.addEventListener('click',e=>{
  if(!OPEN)return;
  const ed=$('.editor');
  if(ed&&ed.contains(e.target))return;
  if(e.target.closest&&(e.target.closest('.ov')||e.target.closest('#b-save')))return;
  const prev=OPEN;
  if(!commit()){e.stopPropagation();e.preventDefault();return}
  lastClosed=prev;setTimeout(()=>lastClosed=null,0);
  render();
},true);
function openItem(id){
  if(lastClosed===id)return;
  if(OPEN&&OPEN!==id&&!commit())return;
  OPEN=id;DRAFT=null;render();revealEditor();
}
function revealEditor(){
  const ed=$('.editor'),sc=$('#main').firstElementChild;if(!ed||!sc)return;
  const r=ed.getBoundingClientRect(),s=sc.getBoundingClientRect();
  if(r.bottom>s.bottom)sc.scrollTop+=Math.min(r.bottom-s.bottom+12,r.top-s.top-60);
}
function addItem(pid){
  if(OPEN&&!commit())return;
  delete S.fold[pid];
  const it={id:uid('i'),pid,name:'새 Action Item',ts:iso(TODAY),te:iso(TODAY+6),as:'',ae:'',note:''};
  S.items.push(it);OPEN=it.id;NEWID=it.id;DRAFT=null;render();revealEditor();
  const n=$('#ed-name');if(n){n.focus();n.select()}
}
function foldBtn(p){return h('span',{class:'fold',role:'button',tabindex:'0','aria-label':S.fold[p.id]?'펼치기':'접기',text:S.fold[p.id]?'▶':'▼',onclick:e=>{e.stopPropagation();toggleFold(p.id)}})}
function toggleFold(pid){S.fold[pid]=!S.fold[pid];persist();render()}

/* ---------- 간트 (가로: 연간 / 세로: 금주부터 3주) ---------- */
const PORT_WEEKS=3;
function renderGantt(root,port){
  const NW=port?136:200;
  const vs=port?thisWS():viewStart();
  const nW=port?PORT_WEEKS:Math.max(1,Math.ceil((DEC31-vs+1)/7));
  const W=port?Math.max(63,Math.floor((root.clientWidth-NW-1)/nW/7)*7):36, DW=W/7, tw=nW*W, ve=vs+nW*7-1;
  const x=n=>(n-vs)*DW;
  const seg=(a,b)=>{const s=Math.max(a,vs),e=Math.min(b,ve);return e<s?null:{left:x(s)+'px',width:(e-s+1)*DW+'px'}};
  const win=port?[vs,ve]:null;
  const sc=h('div',{class:'g-scroll'+(port?' port':'')});
  sc.style.setProperty('--NW',NW+'px');sc.style.setProperty('--W',W+'px');sc.style.setProperty('--DW',DW+'px');
  const inner=h('div',{class:'g-inner',style:{width:`calc(var(--NW) + ${tw}px)`}});
  const ht=h('div',{class:'g-ht',style:{width:tw+'px'}});
  for(let m=0;m<13;m++){
    const a=Math.round(Date.UTC(YEAR,m,1)/DAY),b=Math.round(Date.UTC(YEAR,m+1,1)/DAY)-1;
    const s=seg(a,b);if(s)ht.append(h('div',{class:'g-month',style:s,text:(m%12+1)+'월'}));
  }
  const tws=thisWS(), DN=['일','월','화','수','목','금','토'];
  for(let i=0;i<nW;i++){const ws=vs+7*i;
    ht.append(h('div',{class:'g-wk'+(ws===tws?' now':''),style:{left:i*W+'px'}},h('b',{text:weekInfo(ws).tab}),port?`${md(ws)}~${md(ws+6)}`:md(ws)));
    if(port)for(let d=0;d<7;d++){const n=ws+d;ht.append(h('div',{class:'g-day'+(n===TODAY?' today':''),style:{left:x(n)+'px'},text:DN[dow(n)]}))}}
  inner.append(h('div',{class:'g-head'},h('div',{class:'g-corner',text:port?'Action Item · 3주':'Action Item'}),ht));
  const track=()=>{const t=h('div',{class:'g-track',style:{width:tw+'px'}});
    if(tws>=vs)t.append(h('div',{class:'nowband',style:{left:x(tws)+'px'}}));
    if(TODAY>=vs&&TODAY<=ve)t.append(h('div',{class:'todayline',style:{left:(x(TODAY)+DW/2-1)+'px'}}));return t};
  const cut=(a,b)=>(a<vs?' cl':'')+(b>ve?' cr':'');
  for(const p of S.projects){
    const all=itemsOf(p.id), vis=all.filter(i=>visible(i,win));
    const pt=track();
    if(vis.length){const s=seg(Math.min(...vis.map(startOf)),Math.max(...vis.map(endOf)));if(s)pt.append(h('div',{class:'bar-p',style:s}))}
    inner.append(h('div',{class:'g-row proj'+(OPEN==='P:'+p.id?' open':'')},
      h('div',{class:'g-name',onclick:()=>openItem('P:'+p.id)},foldBtn(p),h('span',{class:'nm',text:p.name}),p.note?h('span',{class:'pn',title:'프로젝트 비고 있음',text:'비고'}):null,h('span',{class:'cnt',text:vis.length+(vis.length!==all.length?'/'+all.length:'')}),
        h('button',{class:'add',text:'+','aria-label':p.name+'에 할일 추가',onclick:e=>{e.stopPropagation();addItem(p.id)}})),pt));
    if(OPEN==='P:'+p.id)inner.append(h('div',{class:'detail'},projEditor(p)));
    if(S.fold[p.id])continue;
    for(const it of vis){
      const st=status(it),t=track();
      const ts=dn(it.ts),te=dn(it.te),as=dn(it.as),ae=dn(it.ae);
      if(ts!=null&&te!=null){const s=seg(ts,te);if(s)t.append(h('div',{class:'bar-t'+cut(ts,te),style:s}))}
      if(as!=null){const e=ae??TODAY;if(e>=as){const s=seg(as,e);if(s)t.append(h('div',{class:'bar-a k-'+st.k+(ae==null?' ongoing':'')+cut(as,e),style:s}))}}
      const dt=delayText(st);
      inner.append(h('div',{class:'g-row item'+(st.k==='done'?' done':'')+(OPEN===it.id?' open':''),onclick:()=>openItem(it.id)},
        h('div',{class:'g-name k-'+st.k},h('span',{class:'dot'}),h('span',{class:'nm',text:it.name}),(dt&&st.k!=='done')?h('span',{class:'dl',text:dt}):null),t));
      if(OPEN===it.id)inner.append(h('div',{class:'detail'},editor(it)));
    }
  }
  sc.append(inner);root.append(sc);
  sc.querySelectorAll('.detail').forEach(d=>d.style.width=sc.clientWidth+'px');
  return{sc,x,W};
}
function render(){
  renderHeader();
  const main=$('#main'),old=main.firstElementChild,oldMode=main.dataset.mode;
  const sl=old?old.scrollLeft:0,st=old?old.scrollTop:0;
  main.textContent='';const m=mode();main.dataset.mode=m;
  const g=renderGantt(main,m==='port');
  if(m==='land'){
    if(needScroll||oldMode!==m){g.sc.scrollLeft=Math.max(0,g.x(thisWS())-g.W*3);needScroll=false}
    else{g.sc.scrollLeft=sl;g.sc.scrollTop=st}}
  else{if(oldMode===m)g.sc.scrollTop=st;needScroll=true}
}

/* ---------- 팝업 공통 ---------- */
let modalRender=null;
function modal(title,build){
  closeModal();
  const ov=h('div',{class:'ov',onclick:e=>{if(e.target===ov)closeModal()}});
  const draw=()=>{ov.textContent='';const{body,foot}=build();
    ov.append(h('div',{class:'panel',role:'dialog','aria-label':title},
      h('div',{class:'panel-h'},h('span',{text:title}),h('button',{class:'ghost',text:'닫기',onclick:closeModal})),
      h('div',{class:'panel-b'},body),foot?h('div',{class:'panel-f'},foot):null))};
  modalRender=draw;draw();document.body.append(ov);
}
function closeModal(){const o=$('.ov');if(o)o.remove();modalRender=null}

/* ---------- 주차 보기 ---------- */
let WEEKCUR=null;
function weekModal(){
  WEEKCUR=thisWS();
  modal('주차 보기',()=>{
    const a=WEEKCUR,b=a+6;
    const body=[h('div',{class:'wk-nav'},
      h('button',{text:'◀ 이전',onclick:()=>{WEEKCUR-=7;modalRender()}}),
      h('b',{text:`${weekInfo(a).tab} · ${md(a)} ~ ${md(b)}`}),
      h('button',{text:'다음 ▶',onclick:()=>{WEEKCUR+=7;modalRender()}}))];
    let any=false;
    for(const p of S.projects){
      const list=itemsOf(p.id).filter(it=>{const st=status(it);const e=st.k==='done'?endOf(it):Math.max(endOf(it),a<=TODAY?TODAY:endOf(it));return startOf(it)<=b&&e>=a&&(S.filters.showDone||st.k!=='done')});
      if(!list.length)continue;any=true;
      body.push(h('div',{class:'grp',text:p.name}));
      for(const it of list){const st=status(it);
        body.push(h('div',{class:'wli k-'+st.k,onclick:()=>{closeModal();delete S.fold[it.pid];openItem(it.id)}},
          h('span',{class:'st',text:st.label}),h('span',{class:'nm',text:it.name}),h('span',{class:'dl',text:delayText(st)}),
          h('small',{text:`목표 ${md(dn(it.ts))}–${md(dn(it.te))} · `+(it.as?`실제 ${md(dn(it.as))}–${it.ae?md(dn(it.ae)):'진행중'}`:'실제 미착수')})))}
    }
    if(!any)body.push(h('div',{class:'note',text:'이 주에 걸친 할일이 없습니다.'}));
    return{body,foot:[h('button',{text:'금주로',onclick:()=>{WEEKCUR=thisWS();modalRender()}})]};
  });
}

/* ---------- 프로젝트 관리 ---------- */
let projDelArm=null;
function projModal(){
  if(OPEN&&!commit())return;
  projDelArm=null;
  modal('프로젝트 관리',()=>{
    const body=[h('div',{class:'note',text:'위에서부터 화면에 표시되는 순서입니다. 이름은 입력 후 다른 곳을 누르면 반영됩니다.'})];
    S.projects.forEach((p,i)=>{
      const nm=h('input',{id:'pn-'+p.id,'aria-label':'프로젝트 이름'});nm.value=p.name;
      nm.addEventListener('change',()=>{if(nm.value.trim()){p.name=nm.value.trim();changed();render()}else nm.value=p.name});
      const mv=d=>{const j=i+d;if(j<0||j>=S.projects.length)return;[S.projects[i],S.projects[j]]=[S.projects[j],S.projects[i]];projDelArm=null;changed();render();modalRender()};
      const n=S.items.filter(it=>it.pid===p.id).length, armed=projDelArm===p.id;
      const del=h('button',{class:'danger del'+(armed?' armed':''),text:armed?'확인':'삭제','aria-label':p.name+' 삭제',onclick:()=>{
        if(!armed){projDelArm=p.id;modalRender();return}
        S.projects=S.projects.filter(x=>x.id!==p.id);S.items=S.items.filter(x=>x.pid!==p.id);delete S.fold[p.id];
        projDelArm=null;OPEN=null;DRAFT=null;changed();render();modalRender();toast(`'${p.name}' 프로젝트를 삭제했습니다`)}});
      body.push(h('div',{class:'prow'},h('button',{text:'▲','aria-label':'위로',disabled:i===0?true:null,onclick:()=>mv(-1)}),h('button',{text:'▼','aria-label':'아래로',disabled:i===S.projects.length-1?true:null,onclick:()=>mv(1)}),nm,del));
      if(armed)body.push(h('div',{class:'ed-err',text:n?`할일 ${n}건도 함께 삭제됩니다. [확인]을 누르면 삭제합니다.`:'[확인]을 누르면 삭제합니다.'}));
    });
    if(!S.projects.length)body.push(h('div',{class:'note',text:'프로젝트가 없습니다. 아래에서 추가하세요.'}));
    const np=h('input',{id:'new-proj',placeholder:'새 프로젝트 이름'});
    const add=()=>{const v=np.value.trim();if(!v)return;S.projects.push({id:uid('p'),name:v,note:''});projDelArm=null;changed();render();modalRender();toast('프로젝트를 추가했습니다')};
    np.addEventListener('keydown',e=>{if(e.key==='Enter')add()});
    body.push(h('div',{class:'grp',text:'새 프로젝트'}),h('div',{class:'prow'},np,h('button',{text:'추가',class:'wide',onclick:add})));
    return{body};
  });
}

/* ---------- 설정 ---------- */
let SW_VERSION='',SW_WAITING_VERSION='';
function setModal(){
  modal('설정',()=>{
    const seg=(opts,cur,fn)=>h('div',{class:'seg'},opts.map(([v,l])=>h('button',{class:cur===v?'on':null,text:l,onclick:()=>{fn(v);needScroll=true;persist();render();modalRender()}})));
    const body=[
      h('div',{class:'sec'},h('div',{class:'grp',text:'작업 폴더'}),
        h('div',{class:'prow'},h('span',{class:'fname',text:DIR?DIR.name:'-'}),h('button',{text:'변경',class:'wide',onclick:changeFolder})),
        h('div',{class:'note',text:'브라우저 보안 정책상 폴더 이름만 표시됩니다.'})),
      h('div',{class:'sec'},h('div',{class:'grp',text:'화면 방향'}),
        h('div',{},seg([['auto','자동'],['land','가로'],['port','세로']],S.orient,v=>S.orient=v)),
        h('div',{class:'note',text:'자동: 기기를 가로로 들면 1년 간트, 세로로 들면 금주부터 3주 간트를 보여줍니다.'})),
      h('div',{class:'sec last'},h('div',{class:'grp',text:'앱 정보'}),
        h('div',{class:'note','data-ver':'1',text:`버전 ${SW_VERSION||'확인 중'} · 주 시작 요일: 일요일`}))];
    return{body};
  });
}
async function changeFolder(){
  if(OPEN&&!commit())return;
  if(DIRTY)await saveNow();
  closeModal();pickFolder();
}

/* ---------- 시작 화면 ---------- */
function showStart(kind,o={}){
  const box=$('#start'),card=$('#start-card');card.textContent='';box.hidden=false;
  const title=h('h1',{text:'업무 일정'});
  const p=t=>h('p',{text:t});
  const acts=(...b)=>h('div',{class:'acts'},...b);
  if(kind==='unsupported')card.append(title,p('이 브라우저는 작업 폴더 저장 기능을 지원하지 않습니다.'),p('갤럭시 탭의 Chrome(최신 버전)으로 열어 주세요. 삼성 인터넷은 지원하지 않습니다.'));
  else if(kind==='first')card.append(title,p('작업 폴더를 지정하세요.'),p(`주차별 엑셀 파일을 이 폴더에서 읽고 저장합니다. 이번 주 파일 이름: ${Store.folder.fileName(weekInfo(thisWS()).Y,weekInfo(thisWS()).n)} (주차 번호는 매주 바뀝니다)`),acts(h('button',{class:'primary',text:'폴더 선택',onclick:pickFolder})));
  else if(kind==='resume')card.append(title,p('작업 폴더: '+o.dir.name),p('폴더 접근을 확인하려면 [계속]을 누르세요.'),acts(h('button',{class:'primary',text:'계속',onclick:()=>resumeFolder(o.dir)}),h('button',{text:'다른 폴더 선택',onclick:pickFolder})));
  else if(kind==='loading')card.append(title,p('작업 폴더를 읽는 중…'));
  else if(kind==='error')card.append(title,p(o.msg),acts(h('button',{class:'primary',text:'폴더 다시 선택',onclick:pickFolder})));
  else if(kind==='broken'){
    card.append(h('h1',{text:'파일을 읽지 못했습니다'}),p(`${o.f.name} 파일이 손상된 것 같습니다. (${o.err&&o.err.message||'알 수 없는 오류'})`));
    if(o.cache){card.append(p(`앱에 보관된 마지막 상태: ${mdhm(o.cache.ts)} · 프로젝트 ${o.cache.data.projects.length}개 · 할일 ${o.cache.data.items.length}건`),
      acts(h('button',{class:'primary',text:'복구해서 다시 저장',onclick:()=>{apply(o.cache.data,o.f);DIRTY=true;saveNow()}}),h('button',{text:'폴더 다시 선택',onclick:pickFolder})))}
    else card.append(p('복구할 수 있는 보관 상태가 없습니다. PC의 엑셀에서 파일을 열어 확인하거나 다른 폴더를 선택하세요.'),acts(h('button',{class:'primary',text:'폴더 다시 선택',onclick:pickFolder})));
  }
  else if(kind==='unsaved'){
    card.append(h('h1',{text:'저장되지 않은 변경이 있습니다'}),
      p(`앱에 보관된 상태: ${mdhm(o.cache.ts)} · 할일 ${o.cache.data.items.length}건`),
      p(o.f?`폴더의 파일: ${o.f.name} · 수정 ${mdhm(o.f.mtime)}`:'폴더에 업무일정 파일이 없습니다.'),
      acts(h('button',{class:'primary',text:'보관된 내용으로 복구해서 저장',onclick:()=>{apply(o.cache.data,o.f);DIRTY=true;saveNow()}}),
        h('button',{text:'파일 내용 사용',onclick:()=>apply(o.data||{projects:[],items:[]},o.f)})));
  }
}
const hideStart=()=>{$('#start').hidden=true};
async function pickFolder(){
  let dir;
  try{dir=await Store.folder.pick()}catch(e){if(e&&e.name==='AbortError')return;toast('폴더를 열지 못했습니다: '+((e&&e.message)||e));return}
  await Store.kv.set('dir',dir);
  openFolder(dir);
}
async function resumeFolder(dir){
  let p='denied';try{p=await Store.folder.permission(dir,true)}catch(e){}
  if(p==='granted')openFolder(dir);
  else toast('폴더 접근이 허용되지 않았습니다. 다시 시도하거나 다른 폴더를 선택하세요.');
}
async function openFolder(dir){
  showStart('loading');
  DIR=dir;
  let files;
  try{files=await Store.folder.list(dir)}catch(e){showStart('error',{msg:'폴더를 읽지 못했습니다: '+((e&&e.message)||e)});return}
  const c=await Store.kv.get('cache'),cache=c&&c.folder===dir.name&&c.data?c:null;
  const f=files[files.length-1]||null;
  let data=null,err=null;
  if(f){try{data=await readFileData(f)}catch(e){err=e}}
  if(err){showStart('broken',{f,err,cache});return}
  if(cache&&cache.dirty&&(!f||cache.ts>f.mtime)){showStart('unsaved',{f,cache,data});return}
  apply(data||{projects:[],items:[]},f);
}
// 불러온 데이터를 화면에 적용
function apply(data,f){
  S.projects=clone(data.projects);S.items=clone(data.items);
  LOADED=f?{Y:f.Y,n:f.n,ws:fileWS(f),name:f.name,mtime:f.mtime}:null;
  DIRTY=false;SAVE_ERR=false;LAST_SAVE=null;OPEN=null;DRAFT=null;needScroll=true;
  cacheSet(false);hideStart();render();
}

/* ---------- 서비스 워커 (오프라인 · 업데이트는 사용자 확인 후) ---------- */
function registerSW(){
  if(!('serviceWorker' in navigator))return;
  const sw=navigator.serviceWorker;
  sw.addEventListener('message',e=>{const d=e.data||{};
    if(d.type!=='VERSION')return;
    if(d.role==='waiting'){SW_WAITING_VERSION=d.version;const v=$('#upd-ver');if(v)v.textContent=d.version}
    else{SW_VERSION=d.version;if(modalRender&&$('.ov [data-ver]'))modalRender()}});
  let reloading=false;
  sw.addEventListener('controllerchange',()=>{if(reloading)return;reloading=true;location.reload()});
  sw.register('./sw.js').then(reg=>{
    const offer=()=>{if(reg.waiting&&sw.controller)showUpdate(reg.waiting)};
    const track=w=>{if(w)w.addEventListener('statechange',()=>{if(w.state==='installed')offer()})};
    offer();track(reg.installing);
    reg.addEventListener('updatefound',()=>track(reg.installing));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reg.update().catch(()=>{})});
  }).catch(()=>{});
  sw.ready.then(r=>{const a=sw.controller||r.active;if(a)a.postMessage({type:'GET_VERSION',role:'active'})});
}
function showUpdate(w){
  const b=$('#update');b.textContent='';b.hidden=false;
  w.postMessage({type:'GET_VERSION',role:'waiting'});
  b.append(h('span',{},'새 버전(',h('b',{id:'upd-ver',text:SW_WAITING_VERSION||'…'}),')이 준비되었습니다. 직접 코드를 올린 경우에만 업데이트하세요.'),
    h('button',{class:'primary',text:'업데이트',onclick:async()=>{if(OPEN)commit();if(DIRTY)await saveNow();w.postMessage({type:'SKIP_WAITING'})}}),
    h('button',{class:'ghost',text:'나중에',onclick:()=>{b.hidden=true}}));
}

/* ---------- 이벤트 연결 · 시작 ---------- */
document.querySelectorAll('.chip[data-f]').forEach(b=>b.addEventListener('click',()=>{const f=b.dataset.f;S.filters[f]=!S.filters[f];if(f==='showPast')needScroll=true;persist();render()}));
$('#b-week').addEventListener('click',weekModal);
$('#b-proj').addEventListener('click',projModal);
$('#b-set').addEventListener('click',setModal);
$('#b-save').addEventListener('click',saveButton);
let lastMode=mode(),lastW=innerWidth;
addEventListener('resize',()=>{if(!DIR)return;const m=mode();
  if(m!==lastMode){lastMode=m;lastW=innerWidth;needScroll=true;render();return}
  if(m==='port'&&innerWidth!==lastW&&!OPEN){lastW=innerWidth;render();return}
  document.querySelectorAll('.g-scroll .detail').forEach(d=>d.style.width=d.closest('.g-scroll').clientWidth+'px')});
addEventListener('keydown',e=>{if(e.key==='Escape'){if($('.ov'))closeModal();else if(OPEN&&commit())render()}});
// 앱을 벗어날 때 저장, 날짜가 바뀌었으면 다시 시작(주차 파일 갱신)
document.addEventListener('visibilitychange',async()=>{
  if(document.visibilityState==='hidden'){if(DIRTY)saveNow();return}
  const d=new Date(),t=Math.round(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/DAY);
  if(t!==TODAY&&DIR){if(OPEN)commit();if(DIRTY)await saveNow();location.reload()}
});
addEventListener('beforeunload',e=>{if(DIRTY){e.preventDefault();e.returnValue=''}});

(async function boot(){
  registerSW();
  if(!Store.folder.supported()){showStart('unsupported');return}
  try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()}catch(e){}
  const dir=await Store.kv.get('dir');
  if(!dir){showStart('first');return}
  let p='prompt';try{p=await Store.folder.permission(dir,false)}catch(e){}
  if(p==='granted')openFolder(dir);else showStart('resume',{dir});
})();
})();
