// Shanta Life Quiz Portal — localStorage + optional Google Sheets (Apps Script) sync
const LS='shanta_quiz_portal_v1';
const TEMPLATES=[
 {id:'tpl-product',kind:'quiz',name:'Product Knowledge Test',desc:'MCQ + True/False, product-wise',questions:[{question:'নমুনা প্রশ্ন: পলিসির গ্রেস পিরিয়ড কত দিন?',options:['A) ১৫ দিন','B) ৩১ দিন','C) ৪৫ দিন'],correct:'B) ৩১ দিন',explanation:'গ্রেস পিরিয়ড ৩১ দিন।',type:'MCQ'}]},
 {id:'tpl-training',kind:'survey',name:'Training Feedback Survey',desc:'Rating + মতামত',questions:[{question:'প্রশিক্ষণটি আপনার কাজে কতটা সহায়ক ছিল?',options:['১ - একদম না','২','৩','৪','৫ - খুবই সহায়ক'],correct:'',type:'Rating'},{question:'আপনার পরামর্শ লিখুন',options:[],correct:'',type:'Text'}]},
 {id:'tpl-compliance',kind:'quiz',name:'Compliance & Ethics Quiz',desc:'Scenario ভিত্তিক',questions:[{question:'গ্রাহকের তথ্য গোপন রাখা উচিত — সত্য/মিথ্যা?',options:['A) সত্য','B) মিথ্যা'],correct:'A) সত্য',explanation:'তথ্য গোপনীয়তা বাধ্যতামূলক।',type:'True/False'}]},
 {id:'tpl-satisfaction',kind:'survey',name:'Employee Satisfaction Survey',desc:'Anonymous মতামত',questions:[{question:'কর্মপরিবেশে আপনি কতটা সন্তুষ্ট?',options:['খুব সন্তুষ্ট','সন্তুষ্ট','মোটামুটি','অসন্তুষ্ট'],correct:'',type:'MCQ'}]},
];
let db=load();
if(!db.pending) db.pending=[];
if(!db.settings.sheetUrl && window.PORTAL_CONFIG && window.PORTAL_CONFIG.appsScriptUrl) db.settings.sheetUrl=window.PORTAL_CONFIG.appsScriptUrl;
// share-link দিয়ে আসা api param (employee device-এর জন্য self-contained link)
try{let api=new URLSearchParams(location.search).get('api'); if(api){db.settings.sheetUrl=decodeURIComponent(api); save();}}catch(e){}
function remoteUrl(){return (db.settings.sheetUrl||(window.PORTAL_CONFIG&&window.PORTAL_CONFIG.appsScriptUrl)||'').trim()}
async function remoteGet(action,params={}){let base=remoteUrl(); if(!base) throw new Error('no-url'); let u=new URL(base); u.searchParams.set('action',action); Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v)); let ctl=new AbortController(); let tm=setTimeout(()=>ctl.abort(),15000); try{let r=await fetch(u.toString(),{signal:ctl.signal}); let j=await r.json(); if(!j.ok) throw new Error(j.error||'remote error'); return j}finally{clearTimeout(tm)}}
async function remotePost(payload){let base=remoteUrl(); if(!base) return {ok:false,error:'no-url'}; try{let r=await fetch(base,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)}); let j=await r.json().catch(()=>({ok:true})); return j}catch(e){return {ok:false,error:String(e)}}}
function sameData_(a,b){try{return JSON.stringify(a)===JSON.stringify(b)}catch(e){return false}}
function mergeRemote(j){let changed=false;
 if(j.supervisors&&j.supervisors.length&&!sameData_(db.supervisors,j.supervisors)){db.supervisors=j.supervisors;changed=true}
 if(j.zones&&j.zones.length&&!sameData_(db.zones,j.zones)){db.zones=j.zones;changed=true}
 if(j.quizzes) j.quizzes.forEach(q=>{sanitizeQuizObject(q); let i=db.quizzes.findIndex(x=>x.id==q.id); if(i>=0){if(!sameData_(db.quizzes[i],q)){db.quizzes[i]=q;changed=true}} else {db.quizzes.push(q);changed=true}});
 if(j.quizzes) sanitizeAllQuizzes(db);
 if(j.activations) j.activations.forEach(a=>{let old=db.activations.find(x=>x.slug==a.slug); if(!old){a.id=a.id||uid('act'); db.activations.push(a); changed=true} else {let merged={...old,...a,id:old.id}; if(!sameData_(old,merged)){Object.assign(old,merged); changed=true}}});
 if(j.results) j.results.forEach(r=>{if(!db.results.find(x=>x.id==r.id)){db.results.push(r); changed=true}});
 if(changed) save(); return changed}
let __bootstrapPromise=null,__bootstrapDone=false;
async function bootstrapRemote(rerender,force=false){if(!remoteUrl()) return false; if(__bootstrapPromise) return __bootstrapPromise; if(__bootstrapDone&&!force) return true;
 __bootstrapPromise=(async()=>{try{let j=await remoteGet('bootstrap'); let c=mergeRemote(j); __bootstrapDone=true;
   let h=location.hash||'#/admin';
   // Create/Take পেজে rerender করলে ফাইল/ফর্ম রিসেট হয়ে blink করে — সেখানে rerender নয়
   if(c&&rerender&&!h.startsWith('#/create')&&!h.startsWith('#/take')) renderAdmin(h);
   return true}catch(e){console.warn('bootstrap failed',e); return false}finally{__bootstrapPromise=null}})();
 return __bootstrapPromise}
async function persistQuiz(q){if(!remoteUrl()) return; let r=await remotePost({action:'saveQuiz',quiz:q}); if(!r.ok) console.warn('saveQuiz failed',r)}

function uid(p='id'){return p+'-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function slug(s){return s.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]+/gi,'-').replace(/^-|-$/g,'').slice(0,40)||uid('q')}

/* ---------- Duplicate protection: একই set-এ একই প্রশ্ন একবারই ---------- */
function bnDigits_(s){return String(s||'').replace(/[০-৯]/g,c=>'০১২৩৪৫৬৭৮৯'.indexOf(c))}
function normalizeQuestion(s){
  let x=bnDigits_(s).toLowerCase().trim();
  // ".... প্রশ্ন 6:" / "Question 12:" জাতীয় serial prefix বাদ — আসল প্রশ্ন অংশটুকু নিই
  let m=x.match(/(?:প্রশ্ন|question)\s*\d+\s*[:：]/);
  if(m && m.index<140) x=x.slice(m.index+m[0].length);
  x=x.replace(/^\s*(?:q\s*)?\d+\s*[.)।:：-]\s*/,'');
  x=x.replace(/&amp;/g,'&').replace(/&[^;]+;/g,' ');
  x=x.replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
  return x;
}
function dedupeQuestions(questions){
  let seen={},unique=[],duplicates=[];
  (questions||[]).forEach((q,i)=>{let key=normalizeQuestion(q.question); if(!key){unique.push(q);return}
    if(seen[key]) duplicates.push({id:q.id||'',index:i,question:q.question,duplicateOf:seen[key].id||'',duplicateOfQuestion:seen[key].question});
    else {seen[key]=q; unique.push(q)}});
  return {unique,duplicates};
}
function sanitizeQuizObject(q){
  if(!q||!Array.isArray(q.questions)) return {quiz:q,removed:0,duplicates:[]};
  let r=dedupeQuestions(q.questions);
  if(r.duplicates.length){q.questions=r.unique; q.duplicateRemoved=(q.duplicateRemoved||0)+r.duplicates.length}
  return {quiz:q,removed:r.duplicates.length,duplicates:r.duplicates};
}
function sanitizeAllQuizzes(target,recordAudit){
  let totalRemoved=0,details=[];
  (target.quizzes||[]).forEach(q=>{let before=(q.questions||[]).length; let r=sanitizeQuizObject(q);
    if(r.removed){totalRemoved+=r.removed; details.push({quizId:q.id,title:q.title||'',product:q.product||'',set:q.set||'',before,after:q.questions.length,removed:r.removed,duplicates:r.duplicates.slice(0,30)})}});
  let report={at:new Date().toISOString(),totalRemoved,affectedSets:details.length,details};
  if(recordAudit!==false && (totalRemoved>0 || !target.duplicateAudit)) target.duplicateAudit=report;
  return report;
}
function duplicateAuditHTML(){
  let a=db.duplicateAudit; if(!a) return '';
  if(!a.totalRemoved) return `<div class="card dup-audit ok"><b>Duplicate Check:</b> একই set-এ কোনো duplicate প্রশ্ন পাওয়া যায়নি। <span class="label">(ভিন্ন set-এ একই প্রশ্ন থাকতে পারে — সেটি allow করা হয়েছে)</span></div>`;
  return `<div class="card dup-audit"><b>Duplicate Audit:</b> মোট <b>${a.totalRemoved}</b>টি duplicate প্রশ্ন ${a.affectedSets}টি set থেকে সরানো/চিহ্নিত হয়েছে।<div class="dup-list">${a.details.map(d=>`<p><b>${esc(d.title)}</b> — ${d.before}টির মধ্যে ${d.after}টি unique, ${d.removed}টি duplicate<br><span class="label">Duplicate IDs: ${d.duplicates.map(x=>esc(x.id||('#'+(x.index+1)))).join(', ')||'—'}</span></p>`).join('')}</div><button class="btn olive" onclick="cleanDuplicates(true)">Clean Duplicates &amp; Sheet-এ Sync করুন</button></div>`;
}
window.cleanDuplicates=async function(sync){
  let report=sanitizeAllQuizzes(db); save();
  if(sync&&remoteUrl()){for(let q of db.quizzes) await persistQuiz(q); toast(report.totalRemoved?`${report.totalRemoved}টি duplicate সরিয়ে Sheet-এ sync হয়েছে`:'Duplicate নেই — সব quiz Sheet-এ sync হয়েছে')}
  else toast(report.totalRemoved?`${report.totalRemoved}টি duplicate সরানো হয়েছে`:'একই set-এ কোনো duplicate পাওয়া যায়নি');
  if((location.hash||'').startsWith('#/bank')) viewBank(); return report;
};

function load(){try{let d=JSON.parse(localStorage.getItem(LS)); if(d){sanitizeAllQuizzes(d); return d}}catch(e){}
 // seed: group SEED_QUESTIONS by product+set
 let quizzes=[]; let groups={};
 (window.SEED_QUESTIONS||[]).forEach(q=>{let k=q.product+'||'+q.set; (groups[k]=groups[k]||[]).push(q)});
 Object.entries(groups).forEach(([k,qs])=>{let [product,set]=k.split('||'); quizzes.push({id:uid('quiz'),kind:'quiz',title:`${product} — ${set}`,product,set,questions:dedupeQuestions(qs).unique,createdAt:new Date().toISOString(),source:'Sample CSV (seed)'})});
 quizzes.push({id:'demo-survey',kind:'survey',title:'Training Feedback — Demo Survey',product:'General',set:'Survey',questions:TEMPLATES[1].questions,createdAt:new Date().toISOString(),source:'Template'});
 return {quizzes,activations:[],results:[],supervisors:['Md. Ariful Islam','Fatema Begum','Tanvir Ahmed','Nusrat Jahan','Md. Kamrul Hasan'],zones:['Dhaka North','Dhaka South','Chattogram','Khulna','Rajshahi','Sylhet','Barishal','Rangpur'],settings:{sheetUrl:'',spreadsheetId:'1LYfXLj3XURSvg8pr2a_uZzVwGlz-dp_Sj2WtdcWzQM0',spreadsheetName:'SLI_Employee Knowledge Test Score Sheet',learningHubId:'1EYJwZDV99DPUcMWdC3LZP_7f1EyVJ2n-Yk_mb0k4Qnc'}}}
function save(){localStorage.setItem(LS,JSON.stringify(db))}
function toast(m){let t=document.createElement('div');t.className='toast';t.textContent=m;document.getElementById('toast').appendChild(t);setTimeout(()=>t.remove(),3200)}
function esc(s){return (s??'').toString().replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function today(){let d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
// CSV parser (quoted fields)
function parseCSV(text){
  text=String(text||'').replace(/^\uFEFF/,'');
  let firstLine=(text.split(/\r?\n/).find(l=>l.trim())||'');
  // delimiter detect (comma / semicolon / tab) — quoted অংশ বাদ দিয়ে গুনে
  let noQ=firstLine.replace(/"[^"]*"/g,'');
  let delim=',',best=0; [',',';','\t'].forEach(d=>{let n=noQ.split(d).length-1; if(n>best){best=n;delim=d}});
  let rows=[],row=[],cur='',q=false;
  for(let i=0;i<text.length;i++){let c=text[i];
    if(q){if(c=='"'){if(text[i+1]=='"'){cur+='"';i++}else q=false}else cur+=c}
    else{if(c=='"')q=true;else if(c===delim){row.push(cur);cur=''}else if(c=='\n'){row.push(cur);rows.push(row);row=[];cur=''}else if(c!='\r')cur+=c}}
  if(cur!==''||row.length){row.push(cur);rows.push(row)}
  rows=rows.filter(r=>r.some(c=>String(c).trim()!==''));
  if(!rows.length) return [];
  let h=rows.shift().map(x=>String(x).replace(/^\uFEFF/,'').trim());
  return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,(r[i]||'').trim()])));
}
function canonKey_(k){return String(k||'').replace(/^\uFEFF/,'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function pickField_(row,aliases){let map={}; Object.keys(row||{}).forEach(k=>{map[canonKey_(k)]=row[k]}); for(let a of aliases){let v=map[canonKey_(a)]; if(v!==undefined&&String(v).trim()!=='') return v} return ''}
function splitOptions_(v){if(Array.isArray(v)) return v.map(x=>typeof x==='object'?(x.text||x.label||x.value||''):x).map(x=>String(x).trim()).filter(Boolean);
 if(v&&typeof v==='object') return Object.keys(v).sort().map(k=>{let val=String(v[k]).trim(); return /^[A-Ea-e]$/.test(k)&&!/^[A-Ea-e][).]/.test(val)?`${k.toUpperCase()}) ${val}`:val}).filter(Boolean);
 return String(v||'').split('|').map(x=>x.trim()).filter(Boolean)}
function withPrefix_(val,letter){let v=String(val||'').trim(); if(!v) return ''; return /^[A-Ea-e][).]/.test(v)?v:`${letter}) ${v}`}
function resolveCorrect_(options,correct){
 let raw=String(correct||'').trim(); if(!raw) return {value:'',ok:true};
 let exact=options.find(o=>o.toLowerCase()===raw.toLowerCase()); if(exact) return {value:exact,ok:true};
 let strip=s=>String(s).replace(/^[A-Ea-e][).]\s*/,'').trim().toLowerCase();
 let byText=options.find(o=>strip(o)===strip(raw)); if(byText) return {value:byText,ok:true};
 let m=raw.match(/^([A-Ea-e]|[1-5])(?:[).:\s]|$)/); if(m){let idx=/[A-Ea-e]/.test(m[1])?m[1].toUpperCase().charCodeAt(0)-65:parseInt(m[1],10)-1; if(options[idx]) return {value:options[idx],ok:true}}
 let contains=options.find(o=>strip(o)&&raw.toLowerCase().includes(strip(o))); if(contains) return {value:contains,ok:true};
 return {value:raw,ok:false};
}
function normalizeImportedRow(r){
 let question=pickField_(r,['question','question_text','prompt','প্রশ্ন']);
 let options=splitOptions_(pickField_(r,['options','choices','option','answers_list']));
 if(!options.length){let cols=[]; ['a','b','c','d','e'].forEach(L=>{let v=pickField_(r,['option_'+L,'option'+L,'opt_'+L,'choice_'+L]); if(String(v||'').trim()) cols.push(withPrefix_(v,L.toUpperCase()))}); options=cols}
 let correctRaw=pickField_(r,['correct_answer','correct','answer','correct_option','right_answer','ans']);
 let rc=resolveCorrect_(options,correctRaw);
 let type=String(pickField_(r,['type','question_type'])||'MCQ');
 let setName=pickField_(r,['set','set_name','tier','level','category','group','module']);
 return {id:pickField_(r,['question_id','id','qid']),product:pickField_(r,['product','product_name','course','topic']),set:setName,type,difficulty:pickField_(r,['difficulty','complexity']),question:String(question||'').trim(),options,correct:rc.value,correctRaw,correctResolved:rc.ok,explanation:pickField_(r,['explanation','rationale','feedback']),source:pickField_(r,['source_citation','source','citation','reference'])};
}
function questionsFromRows(rows){return (rows||[]).map(normalizeImportedRow).filter(q=>q.question)}
async function syncToSheet(rec){let r=await remotePost(Object.assign({action:'submit'},rec)); return !!r.ok}

/* Premium SVG icon set (no emoji) */
const ICONS={grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
layers:'<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
plus:'<path d="M12 5v14M5 12h14"/>',
chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
sliders:'<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
timer:'<path d="M9 2h6M12 6a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z"/><path d="M12 10v4l3 2"/>',
close:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
play:'<path d="M7 4.5v15l13-7.5-13-7.5Z"/>',
eye:'<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
trophy:'<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 5H3a4 4 0 0 0 4 4M17 5h4a4 4 0 0 1-4 4M12 14v3M8 21h8M10 17h4l.7 4H9.3L10 17Z"/>',
check:'<path d="m4 12.5 5 5L20 6.5"/>',
download:'<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16"/>',
cloud:'<path d="M7 18h10a4 4 0 0 0 .8-7.9A6 6 0 0 0 6.2 8.6 4.5 4.5 0 0 0 7 18Z"/>',
link:'<path d="M10 14a4 4 0 0 0 6 .4l3-3a4 4 0 0 0-5.6-5.6L11.7 7.5"/><path d="M14 10a4 4 0 0 0-6-.4l-3 3a4 4 0 0 0 5.6 5.6l1.7-1.7"/>',
calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5M16 4.7a3.5 3.5 0 0 1 0 6.6M17.5 15.4c2 .6 3.5 2.1 4 4.6"/>',
zap:'<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>',
shield:'<path d="M12 3 5 5.8v5.4c0 4.6 3 7.6 7 9.8 4-2.2 7-5.2 7-9.8V5.8L12 3Z"/><path d="m9 11.5 2 2 4-4.5"/>',
book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
clipboard:'<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4a3 3 0 0 1 6 0M9 11h6M9 15h4"/>',
copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
share:'<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="5" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
arrowR:'<path d="M4 12h16m-6-6 6 6-6 6"/>',arrowL:'<path d="M20 12H4m6 6-6-6 6-6"/>',
flag:'<path d="M5 22V4c4-2 7 2 12 0v9c-5 2-8-2-12 0"/>',
refresh:'<path d="M20 12a8 8 0 1 1-2.3-5.6M20 3v5h-5"/>',
alert:'<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17.5v.5"/>',
send:'<path d="m22 2-11 11M22 2 15 22l-4-9-9-4 20-7Z"/>',
target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>'};
function icon(n,cls='ic'){return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]||''}</svg>`}
function isClosed(a){return a&&(a.status==='closed')}
function fmtTime(s){s=Math.max(0,Math.round(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function clearTakeTimers(){if(window.__takeTimer){clearInterval(window.__takeTimer);window.__takeTimer=null}if(window.__takePoll){clearInterval(window.__takePoll);window.__takePoll=null}}

// ---------- Router ----------
function route(){let h=location.hash||'#/admin'; let m=h.match(/#\/take\/(.+)$/); if(m) return renderTake(decodeURIComponent(m[1])); clearTakeTimers(); renderAdmin(h); bootstrapRemote(true)}
window.addEventListener('hashchange',route);

function header(active){return `<header class="topbar"><span class="logo-tile"><img src="assets/logo-white.png" alt="Shanta Life"></span><div class="brand"><b>SHANTA Life</b><span>Employee Knowledge Test • Quiz & Survey Portal</span></div><nav class="nav">
<button onclick="location.hash='#/admin'" class="${active=='dash'?'active':''}">${icon('grid')} Dashboard</button>
<button onclick="location.hash='#/bank'" class="${active=='bank'?'active':''}">${icon('layers')} Quiz/Survey Bank</button>
<button onclick="location.hash='#/create'" class="${active=='create'?'active':''}">${icon('plus')} Create / Import</button>
<button onclick="location.hash='#/results'" class="${active=='results'?'active':''}">${icon('chart')} Results</button>
<button onclick="location.hash='#/settings'" class="${active=='settings'?'active':''}">${icon('sliders')} Supervisors & Sheet</button></nav></header>`}

function renderAdmin(h){
 if(h.startsWith('#/bank')) return viewBank();
 if(h.startsWith('#/create')) return viewCreate();
 if(h.startsWith('#/results')) return viewResults();
 if(h.startsWith('#/settings')) return viewSettings();
 viewDashboard();
}
function stats(){let r=db.results; return {total:r.length,avg:r.length?Math.round(r.reduce((a,x)=>a+(x.percent||0),0)/r.length):0,pass:r.filter(x=>x.percent>=85).length,quizzes:db.quizzes.filter(x=>x.kind=='quiz').length,surveys:db.quizzes.filter(x=>x.kind=='survey').length,active:db.activations.filter(a=>a.date>=today()&&!isClosed(a)).length}}
function viewDashboard(){let s=stats(); document.getElementById('app').innerHTML=header('dash')+`<section class="hero"><span class="eyebrow">Shanta Life · Learning & Assessment</span><h1>নিজের জ্ঞান যাচাই করুন, আরও আত্মবিশ্বাসী হোন!</h1><p>Quiz ও Survey তৈরি করুন, নির্দিষ্ট তারিখের জন্য Active করুন, শেয়ারযোগ্য লিংক পাঠান — ফলাফল স্বয়ংক্রিয়ভাবে রেকর্ড হবে (Google Sheet: <b>${esc(db.settings.spreadsheetName)}</b>)।</p></section>
<div class="wrap"><div class="grid">
<div class="card stat-card"><div class="stat-ic">${icon('layers','ic ic-lg')}</div><div class="kpi">${s.quizzes}</div><div class="label">Quiz Bank-এ Quiz</div></div>
<div class="card stat-card"><div class="stat-ic">${icon('clipboard','ic ic-lg')}</div><div class="kpi">${s.surveys}</div><div class="label">Survey Bank-এ Survey</div></div>
<div class="card stat-card"><div class="stat-ic">${icon('users','ic ic-lg')}</div><div class="kpi">${s.total}</div><div class="label">মোট Participants</div></div>
<div class="card stat-card"><div class="stat-ic">${icon('chart','ic ic-lg')}</div><div class="kpi">${s.avg}%</div><div class="label">গড় স্কোর</div></div>
<div class="card stat-card"><div class="stat-ic">${icon('trophy','ic ic-lg')}</div><div class="kpi">${s.pass}</div><div class="label">🏆 ৮৫%+ স্কোরার</div></div>
<div class="card stat-card"><div class="stat-ic">${icon('link','ic ic-lg')}</div><div class="kpi">${s.active}</div><div class="label">আসন্ন/চলমান Activation</div></div></div>
<h2 class="sec-title">${icon('link')} Active / Scheduled Links</h2>${db.activations.length?db.activations.map(a=>shareCard(a)).join(''):'<div class="card">এখনো কোনো Activation নেই। Quiz Bank থেকে <b>Active</b> চাপ দিন।</div>'}
<h2 class="sec-title">${icon('trophy')} Latest Participants</h2><div class="card">${tableResults(db.results.slice(-8).reverse())}</div></div>`}
function shareLink(s){let base=`${location.origin}${location.pathname}`;let u=remoteUrl(); return base+(u?`?api=${encodeURIComponent(u)}`:'')+`#/take/${encodeURIComponent(s)}`}
function shareCard(a){let q=db.quizzes.find(x=>x.id==a.quizId);let link=shareLink(a.slug);let closed=isClosed(a);let live=!closed&&a.date==today();let upcoming=!closed&&a.date>today();
 return `<div class="card bank-card ${closed?'is-closed-card':''}"><div class="card-head"><b>${esc(q?q.title:a.quizTitle||a.slug)}</b>
 <span class="badge ${closed?'red':live?'green':''}">${closed?icon('close')+' বন্ধ (Closed)':live?'<span class="live-dot"></span> LIVE আজ':icon('calendar')+' '+a.date}</span></div>
 <span class="label">Purpose: ${esc(a.purpose)} • Date: ${a.date}${a.durationMinutes?` • ${icon('timer')} সময়সীমা: ${a.durationMinutes} মিনিট`:''}${closed&&a.closedAt?` • বন্ধ: ${esc(String(a.closedAt).slice(0,16).replace('T',' '))}`:''}</span>
 ${closed?`<div class="closed-note">${icon('shield')} Trainer এই window টি বন্ধ করেছেন — লিংকটি এখন আর কার্যকর নয়।</div>`:`<div class="sharebox">${icon('send')} ${esc(a.message)}<br><a href="${link}">${link}</a></div>`}
 <div class="share-actions"><button class="btn ghost" onclick="copyLink('${a.slug}')">${icon('copy')} Copy Link</button> <button class="btn ghost" onclick="copyMsg('${a.id}')">${icon('share')} Copy Message</button>
 ${closed?`<button class="btn olive" onclick="setActivation('${a.slug}',false)">${icon('refresh')} Re-open করুন</button>`:`<button class="btn danger" onclick="setActivation('${a.slug}',true)">${icon('close')} Close Window</button>`}</div></div>`}
window.setActivation=async(slug,closeIt)=>{let a=db.activations.find(x=>x.slug==slug); if(!a) return;
 if(closeIt && !confirm('এই Quiz/Survey window বন্ধ করতে চান? বন্ধ হলে participant-রা আর exam শুরু করতে পারবে না, চলমান exam auto-submit হয়ে যাবে।')) return;
 a.status=closeIt?'closed':'active'; a.closedAt=closeIt?new Date().toISOString():''; save();
 let r=await remotePost({action:closeIt?'closeActivation':'reopenActivation',slug,by:'Trainer'});
 toast(r.ok?(closeIt?'Window বন্ধ করা হয়েছে':'Window আবার চালু হয়েছে'):(closeIt?'Local-এ বন্ধ হয়েছে (Sheet sync হয়নি)':'Local-এ চালু হয়েছে'));
 let h=location.hash; if(h.startsWith('#/bank')) viewBank(); else if(h.startsWith('#/take')) renderTake(slug); else viewDashboard();};

window.copyLink=s=>{let link=shareLink(s);navigator.clipboard.writeText(link);toast('লিংক কপি হয়েছে')};
window.copyMsg=id=>{let a=db.activations.find(x=>x.id==id);let link=shareLink(a.slug);navigator.clipboard.writeText(`${a.message}\n👉 ${link}`);toast('মেসেজ কপি হয়েছে')};

function viewBank(){let kind=sessionStorage.getItem('bankKind')||'quiz';let list=db.quizzes.filter(q=>q.kind==kind);
 document.getElementById('app').innerHTML=header('bank')+`<div class="wrap"><h1>${icon('layers','ic ic-lg')} ${kind=='quiz'?'Quiz':'Survey'} Bank</h1>
${duplicateAuditHTML()}<div class="tabs"><button class="${kind=='quiz'?'active':''}" onclick="sessionStorage.setItem('bankKind','quiz');viewBank()">${icon('book')} Quiz Test</button><button class="${kind=='survey'?'active':''}" onclick="sessionStorage.setItem('bankKind','survey');viewBank()">${icon('clipboard')} Survey</button></div>
${list.map(q=>`<div class="card bank-card"><b>${esc(q.title)}</b> <span class="badge">${q.questions.length} unique প্রশ্ন</span>${(()=>{let d=(db.duplicateAudit&&db.duplicateAudit.details||[]).find(x=>x.quizId==q.id); return d?`<span class="badge red">${d.removed} duplicate সরানো</span>`:''})()} <span class="badge green">${esc(q.product||'')}</span><br><span class="label">${esc(q.set||'')} • Source: ${esc(q.source||'Manual')}</span><br><br>
<button class="btn" onclick="openActivate('${q.id}')">${icon('play')} Active করুন</button> <button class="btn ghost" onclick="previewQuiz('${q.id}')">${icon('eye')} Preview</button> <button class="btn ghost" onclick="delQuiz('${q.id}')">${icon('trash')} Delete</button></div>`).join('')||'<div class="card">কিছু নেই — Create/Import থেকে যোগ করুন।</div>'}
<h2 class="sec-title">${icon('timer','ic ic-lg')} এই Bank-এর Active Windows</h2>${db.activations.filter(a=>{let qq=db.quizzes.find(x=>x.id==a.quizId);return qq&&qq.kind==kind}).map(a=>shareCard(a)).join('')||'<div class="card empty-state"><div class="empty-ic">'+icon('clock','ic ic-xl')+'</div>কোনো Active Window নেই</div>'}</div>`}
window.delQuiz=id=>{if(confirm('Delete?')){db.quizzes=db.quizzes.filter(q=>q.id!=id);save();remotePost({action:'deleteQuiz',id});viewBank()}};
window.previewQuiz=id=>{let q=db.quizzes.find(x=>x.id==id); modal(`<h2>${esc(q.title)}</h2>`+q.questions.map((x,i)=>`<p><b>${i+1}. ${esc(x.question)}</b><br>${x.options.map(o=>esc(o)).join('<br>')}<br><span class="badge green">সঠিক: ${esc(x.correct||'—')}</span> <span class="label">${esc(x.explanation||'')}</span></p>`).join(''))};
window.openActivate=id=>{modal(`<h2>${icon('zap','ic ic-lg')} Active করুন</h2><label>Test Purpose *</label><input id="aPurpose" placeholder="যেমন: Monthly Product Training — October">
<label>Active Date * (শুধু এই তারিখেই লিংক কাজ করবে)</label><input type="date" id="aDate" value="${today()}">
<label>Exam Time Limit (ঐচ্ছিক) — participant-এর countdown timer</label>
<div class="time-grid"><select id="aDurPreset"><option value="0">কোনো সময়সীমা নেই</option><option value="5">5 মিনিট</option><option value="10">10 মিনিট</option><option value="15" selected>15 মিনিট</option><option value="20">20 মিনিট</option><option value="30">30 মিনিট</option><option value="45">45 মিনিট</option><option value="60">60 মিনিট</option></select>
<input type="number" id="aDurCustom" min="1" max="300" placeholder="অথবা custom মিনিট"></div>
<p class="label">Time set করলে: exam শুরুর পর participant countdown দেখতে পাবে, সময় শেষ হলে exam <b>auto-submit ও auto-close</b> হবে। খালি রাখলে কোনো timer থাকবে না। Trainer চাইলে মাঝপথে যেকোনো সময় <b>Close Window</b> দিয়ে বন্ধ করতে পারবেন।</p>
<label>উৎসাহমূলক Message</label><textarea id="aMsg" rows="3">🎉 প্রিয় সহকর্মী, নিজের পণ্য-জ্ঞান যাচাই করে আরও আত্মবিশ্বাসী হয়ে উঠুন! এই কুইজে অংশ নিন, স্কোর দেখুন এবং শিখুন প্রতিটি সঠিক উত্তর। আপনার জন্য শুভকামনা! 🌟</textarea>
<br><br><button class="btn" onclick="doActivate('${id}')">${icon('send')} Active Initiate করুন</button>`)};
window.doActivate=async id=>{let purpose=document.getElementById('aPurpose').value.trim(),date=document.getElementById('aDate').value,msg=document.getElementById('aMsg').value.trim(); if(!purpose||!date) return toast('Purpose ও Date দিন'); let q=db.quizzes.find(x=>x.id==id); let durCustom=parseInt(document.getElementById('aDurCustom').value,10); let durationMinutes=durCustom>0?durCustom:parseInt(document.getElementById('aDurPreset').value,10)||0; let a={id:uid('act'),quizId:id,quizTitle:q.title,slug:slug(q.title)+'-'+date,purpose,date,message:msg,durationMinutes,status:'active',createdAt:new Date().toISOString()}; db.activations=db.activations.filter(x=>x.slug!=a.slug); db.activations.push(a);save();closeModal();
 let synced=false; if(remoteUrl()){let r=await remotePost({action:'activate',activation:a,quiz:q}); synced=!!r.ok; if(!synced) toast('Sheet sync হয়নি — config.js-এ URL বসিয়ে redeploy করুন, নাহলে লিংক শুধু এই browser-এ কাজ করবে');}
 document.getElementById('app').innerHTML=header('dash')+`<div class="wrap"><h1>✅ সফলভাবে Active হয়েছে! ${synced?'<span class="badge green">☁️ Google Sheet-এ synced — সব device-এ লিংক কাজ করবে</span>':'<span class="badge">💾 Local mode — লিংক শুধু এই browser-এ কাজ করবে</span>'}</h1>${shareCard(a)}<button class="btn olive" onclick="location.hash='#/admin'">Dashboard-এ যান</button></div>`; confetti();};

function viewCreate(){document.getElementById('app').innerHTML=header('create')+`<div class="wrap"><h1>${icon('spark','ic ic-lg')} Quiz / Survey Generate করুন</h1>
<div class="grid">${TEMPLATES.map(t=>`<div class="card"><h3>${t.name}</h3><p class="label">${t.desc}</p><button class="btn olive" onclick="useTemplate('${t.id}')">এই Template ব্যবহার করুন</button></div>`).join('')}</div>
<div class="card" style="margin-top:16px"><h2>${icon('plus','ic ic-lg')} Manual Create</h2>
<label>ধরন</label><select id="cKind"><option value="quiz">Quiz Test</option><option value="survey">Survey</option></select>
<label>Title *</label><input id="cTitle" placeholder="যেমন: Shanta Endowment — Set 1">
<label>Product</label><input id="cProduct" placeholder="Shanta Endowment">
<div id="qBuilder"></div><button class="btn ghost" onclick="addQ()">+ প্রশ্ন যোগ করুন</button> <button class="btn" onclick="saveManual()">${icon('check')} Bank-এ Save করুন</button></div>
<div class="card" style="margin-top:16px"><h2>${icon('download','ic ic-lg')} CSV / JSON Upload করে Import</h2>
<p class="label"><b>Format A:</b> question_id, product, set, type, difficulty, question, options ( <b>|</b> দিয়ে আলাদা ), correct_answer, explanation, source_citation<br>
<b>Format B:</b> question_id, product, tier, difficulty, type, question, option_a, option_b, option_c, option_d, correct_answer, explanation, source_citation<br>
Delimiter comma / semicolon / tab — তিনটিই চলবে। correct_answer-এ পুরো উত্তর, শুধু <b>B</b> অথবা <b>2</b> — সবই মিলিয়ে নেওয়া হবে। <a href="data/sample_questions.csv" download>Sample CSV (Format A)</a> • <a href="data/sample_questions_format_b.csv" download>Sample CSV (Format B)</a></p>
<input type="file" id="fileUp" accept=".csv,.json,.txt,text/csv,application/json"><br><br><button class="btn" id="importBtn" onclick="importFile()">Import করুন</button> <span id="importSync" class="label"></span><div id="importOut"></div></div></div>`; addQ();}
window.useTemplate=id=>{let t=TEMPLATES.find(x=>x.id==id); let nq={id:uid('quiz'),kind:t.kind,title:t.name.replace(/^[^ ]+ /,'')+' — '+new Date().toLocaleDateString(),product:'General',set:'Template',questions:JSON.parse(JSON.stringify(t.questions)),source:'Template: '+t.name,createdAt:new Date().toISOString()}; db.quizzes.push(nq); persistQuiz(nq); save(); toast('Template থেকে Bank-এ যোগ হয়েছে'); location.hash='#/bank'; sessionStorage.setItem('bankKind',t.kind)};
let qn=0; window.addQ=()=>{qn++; let d=document.createElement('div'); d.className='qbox'; d.innerHTML=`<label>প্রশ্ন ${qn}</label><input class="qq" placeholder="প্রশ্ন লিখুন"><label>Options (| দিয়ে)</label><input class="qo" placeholder="A) ... | B) ... | C) ..."><label>সঠিক উত্তর (Quiz হলে)</label><input class="qc" placeholder="B) ..."><label>ব্যাখ্যা</label><input class="qe" placeholder="ব্যাখ্যা">`; document.getElementById('qBuilder').appendChild(d)};
window.saveManual=()=>{let title=document.getElementById('cTitle').value.trim(); if(!title) return toast('Title দিন'); let qs=[...document.querySelectorAll('.qbox')].map(b=>({question:b.querySelector('.qq').value,options:b.querySelector('.qo').value.split('|').map(x=>x.trim()).filter(Boolean),correct:b.querySelector('.qc').value,explanation:b.querySelector('.qe').value,type:'MCQ'})).filter(q=>q.question); if(!qs.length) return toast('অন্তত ১টি প্রশ্ন দিন'); let dd=dedupeQuestions(qs); if(dd.duplicates.length) toast(dd.duplicates.length+'টি duplicate প্রশ্ন বাদ দেওয়া হয়েছে'); qs=dd.unique; let mq={id:uid('quiz'),kind:document.getElementById('cKind').value,title,product:document.getElementById('cProduct').value,questions:qs,source:'Manual',createdAt:new Date().toISOString()}; db.quizzes.push(mq); persistQuiz(mq); save(); toast('Bank-এ সেভ হয়েছে'); location.hash='#/bank'};
window.importFile=async()=>{
 let btn=document.getElementById('importBtn'), out=document.getElementById('importOut'), syncEl=document.getElementById('importSync');
 let f=document.getElementById('fileUp').files[0]; if(!f) return toast('আগে একটি CSV/JSON ফাইল সিলেক্ট করুন');
 let name=f.name.toLowerCase(); if(!/\.(csv|json|txt)$/.test(name)){out.innerHTML='<div class="dup-report">শুধু <b>.csv</b> অথবা <b>.json</b> ফাইল import হবে। Excel ফাইল হলে আগে <b>Save As → CSV UTF-8</b> করে নিন।</div>'; return}
 if(btn){btn.disabled=true; btn.textContent='Import হচ্ছে…'}
 try{
  let text=await f.text(); let qs=[];
  if(name.endsWith('.json')){let j=JSON.parse(text); let arr=Array.isArray(j)?j:(j.questions||j.quizzes||j.data||[]); if(!Array.isArray(arr)||!arr.length) throw new Error('JSON-এ questions array পাওয়া যায়নি'); qs=arr.map(normalizeImportedRow).filter(q=>q.question)}
  else {let rows=parseCSV(text); if(!rows.length) throw new Error('CSV-তে কোনো data row পাওয়া যায়নি (header ঠিক আছে তো?)'); qs=questionsFromRows(rows)}
  if(!qs.length) throw new Error('কোনো প্রশ্ন পাওয়া যায়নি — question column-এর নাম/বানান চেক করুন');
  // validation warnings (exam নষ্ট না করে report-এ দেখাই)
  let warnings=[]; qs.forEach((q,i)=>{let isText=/text|essay|rating|survey/i.test(q.type||''); if(!isText&&q.options.length<2) warnings.push(`Row ${i+1} (${q.id||'no-id'}): options পাওয়া যায়নি`); if(!isText&&q.options.length>=2&&!q.correct) warnings.push(`Row ${i+1} (${q.id||'no-id'}): correct_answer খালি`); else if(!isText&&q.correct&&!q.correctResolved) warnings.push(`Row ${i+1} (${q.id||'no-id'}): correct_answer (${q.correctRaw}) কোনো option-এর সাথে মেলেনি`)});
  let groups={}; qs.forEach(q=>{let k=(q.product||'Imported')+'||'+(q.set||'Set 1'); (groups[k]=groups[k]||[]).push(q)});
  let totalAdded=0,totalSkipped=0,report=[],toSync=[];
  for(let [k,v] of Object.entries(groups)){
    let [prod,setName]=k.split('||'); let clean=dedupeQuestions(v); totalSkipped+=clean.duplicates.length;
    let existing=db.quizzes.find(x=>x.kind=='quiz'&&(x.product||'')==prod&&(x.set||'')==setName);
    if(existing){let before=existing.questions.length; let merged=dedupeQuestions([...existing.questions,...clean.unique]); existing.questions=merged.unique; existing.source='Import: '+f.name; let added=existing.questions.length-before; totalAdded+=added; totalSkipped+=merged.duplicates.length; report.push({prod,setName,found:v.length,uniqueInFile:clean.unique.length,added,skipped:clean.duplicates.length,duplicates:clean.duplicates,mergedInto:existing.title}); toSync.push(existing)}
    else {let iq={id:uid('quiz'),kind:'quiz',title:`${prod} — ${setName}`,product:prod,set:setName,questions:clean.unique,source:'Import: '+f.name,createdAt:new Date().toISOString()}; db.quizzes.push(iq); totalAdded+=clean.unique.length; report.push({prod,setName,found:v.length,uniqueInFile:clean.unique.length,added:clean.unique.length,skipped:clean.duplicates.length,duplicates:clean.duplicates,mergedInto:''}); toSync.push(iq)}
  }
  sanitizeAllQuizzes(db); save(); // আগে local save — Sheet sync ধীর হলেও import সফল দেখাবে
  let detail=report.map(r=>`<div class="dup-set"><b>${esc(r.prod)} — ${esc(r.setName)}</b><br><span class="label">ফাইলে ${r.found}টি • unique ${r.uniqueInFile}টি • Bank-এ যোগ/আপডেট ${r.added}টি • duplicate skip ${r.skipped}টি${r.mergedInto?' • বিদ্যমান set-এ merge হয়েছে':''}</span>${r.duplicates.length?`<div class="dup-list">${r.duplicates.slice(0,12).map(d=>`<p>Duplicate skip: <b>${esc(d.id||('#'+(d.index+1)))}</b> — ${esc(String(d.question).slice(0,110))}…</p>`).join('')}${r.duplicates.length>12?`<p class="label">…আরও ${r.duplicates.length-12}টি</p>`:''}</div>`:''}</div>`).join('');
  out.innerHTML=`<div class="dup-report"><p><span class="badge green">Import সম্পন্ন</span> <b>${totalAdded}</b>টি unique প্রশ্ন Bank-এ যোগ হয়েছে • <b>${totalSkipped}</b>টি duplicate skip করা হয়েছে • <b>${Object.keys(groups).length}</b>টি set।</p><p class="label">নিয়ম: একই Product + একই Set-এ একই প্রশ্ন একবারই; ভিন্ন Set-এ থাকতে পারে। Quiz Bank-এ গিয়ে set গুলো দেখুন।</p>${warnings.length?`<p><b>সতর্কতা (${warnings.length}টি):</b></p><div class="dup-list">${warnings.slice(0,10).map(w=>`<p>${esc(w)}</p>`).join('')}${warnings.length>10?`<p class="label">…আরও ${warnings.length-10}টি</p>`:''}</div>`:''}${detail}</div>`;
  toast(`Import সম্পন্ন: ${totalAdded}টি যোগ, ${totalSkipped}টি duplicate skip`);
  // Sheet sync background-এ (UI আটকে রাখি না)
  if(remoteUrl()&&toSync.length){if(syncEl)syncEl.textContent='Sheet-এ sync হচ্ছে…'; (async()=>{let ok=0; for(let q of toSync){await persistQuiz(q); ok++} let el=document.getElementById('importSync'); if(el) el.textContent=`Sheet sync শেষ (${ok}/${toSync.length} set)`; toast('Sheet-এ sync সম্পন্ন')})()}
  else if(syncEl) syncEl.textContent='Local mode — Sheet sync হয়নি (config.js-এ URL নেই)';
 }catch(e){out.innerHTML=`<div class="dup-report"><b>Import ব্যর্থ হয়েছে:</b> ${esc(String(e.message||e))}<br><span class="label">ফাইলের header ও format উপরের Format A/B-এর সাথে মিলিয়ে আবার চেষ্টা করুন।</span></div>`; toast('Import ব্যর্থ: '+(e.message||e))}
 finally{if(btn){btn.disabled=false; btn.textContent='Import করুন'}}
};

// ---------- Take / Participant ----------
let takeState=null;
async function renderTake(s){let app=document.getElementById('app');
 app.innerHTML=`<div class="wrap"><div class="card" style="text-align:center"><h1>লোড হচ্ছে...</h1><p class="label">Quiz ও Supervisor তালিকা আনা হচ্ছে</p></div></div>`;
 // প্রথমে Sheet (remote) থেকে, না পেলে local থেকে
 if(remoteUrl()){try{let j=await remoteGet('take',{slug:s}); if(j.activation&&j.quiz){mergeRemote({quizzes:[j.quiz],activations:[j.activation],supervisors:j.supervisors,zones:j.zones});}}catch(e){console.warn('remote take failed',e)}}
 let a=db.activations.find(x=>x.slug==s);
 if(a&&isClosed(a)){clearTakeTimers(); app.innerHTML=`<div class="wrap quiz-shell"><div class="card result-card"><div class="inline-logo"><img src="assets/logo-dark.png" alt="Shanta Life"></div><div class="closed-hero">${icon('shield','ic ic-xl')}</div><h1>এই ${'window'} টি বন্ধ করা হয়েছে</h1><p>Trainer/Admin এই Quiz/Survey-এর window বন্ধ করেছেন। অংশ নেওয়ার জন্য ধন্যবাদ। নতুন লিংক পেলে আবার চেষ্টা করুন।</p><p class="label">${esc(a.quizTitle||'')} • ${esc(a.purpose||'')}</p></div></div>`; return}
 if(!a){app.innerHTML=`<div class="wrap"><div class="card"><h1>❌ লিংকটি পাওয়া যায়নি</h1><p>সম্ভাব্য কারণ: Quiz-টি Sheet-এ sync হয়নি, অথবা লিংকটি ভুল। Admin-কে config.js-এ Apps Script URL বসিয়ে redeploy করতে বলুন, তারপর নতুন করে Active করে নতুন লিংক শেয়ার করুন।</p></div></div>`;return}
 let q=db.quizzes.find(x=>x.id==a.quizId); if(!q){app.innerHTML=`<div class="wrap"><div class="card"><h1>❌ Quiz পাওয়া যায়নি</h1></div></div>`;return} q=JSON.parse(JSON.stringify(q)); sanitizeQuizObject(q);
 let isToday=a.date==today();
 if(!isToday){app.innerHTML=`<div class="wrap"><div class="card" style="text-align:center"><div class="inline-logo"><img src="assets/logo-dark.png" alt="Shanta Life"></div><h1>এই ${q.kind=='quiz'?'কুইজ':'সার্ভে'}টি শুধুমাত্র ${a.date} তারিখে Active থাকবে</h1><p>${esc(a.message)}</p><p class="label">আজকের তারিখ: ${today()} • নির্ধারিত তারিখ: ${a.date}</p></div></div>`;return}
 takeState={a,q,answers:{},idx:0,emp:null,started:null};
 app.innerHTML=`<header class="topbar"><span class="logo-tile"><img src="assets/logo-white.png" alt="Shanta Life"></span><div class="brand"><b>${esc(q.title)}</b><span>${esc(a.purpose)} • ${a.date}</span></div></header>
 <div class="wrap quiz-shell"><div class="card form-card"><h1>স্বাগতম!</h1><p>${icon('send')} ${esc(a.message)}</p><div class="meta-chips"><span class="chip">${icon('clipboard')} ${q.questions.length}টি প্রশ্ন</span><span class="chip">${icon('calendar')} ${a.date}</span>${a.durationMinutes?`<span class="chip chip-time">${icon('timer')} সময়: ${a.durationMinutes} মিনিট</span>`:`<span class="chip">${icon('clock')} কোনো সময়সীমা নেই</span>`}</div><p class="label">সাবমিটের পরই স্কোর ও সঠিক উত্তর দেখতে পাবেন${a.durationMinutes?' • সময় শেষ হলে exam স্বয়ংক্রিয়ভাবে submit হবে':''}</p>
 <label>Employee Name *</label><input id="eName" placeholder="আপনার নাম">
 <label>Mobile Number *</label><input id="eMobile" placeholder="01XXXXXXXXX">
 <label>Employee ID / Producer Code (যদি থাকে)</label><input id="eCode" placeholder="ঐচ্ছিক">
 <label>Supervisor Name *</label><select id="eSup"><option value="">-- সিলেক্ট করুন --</option>${db.supervisors.map(s=>`<option>${esc(s)}</option>`).join('')}</select>
 <label>Zone / Area *</label><select id="eZone"><option value="">-- সিলেক্ট করুন --</option>${db.zones.map(z=>`<option>${esc(z)}</option>`).join('')}</select>
 <br><br><button class="btn" style="font-size:17px" onclick="startQuiz()">${icon('play')} ${q.kind=='quiz'?'Quiz':'Survey'} শুরু করুন</button></div></div>`}
window.startQuiz=()=>{let emp={name:val('eName'),mobile:val('eMobile'),code:val('eCode'),supervisor:val('eSup'),zone:val('eZone')}; if(!emp.name||!emp.mobile||!emp.supervisor||!emp.zone) return toast('* চিহ্নিত সব তথ্য দিন'); takeState.emp=emp; takeState.started=Date.now(); takeState.submitting=false;
 takeState.durationSec=(takeState.a.durationMinutes||0)*60; takeState.deadline=takeState.durationSec?Date.now()+takeState.durationSec*1000:null;
 showQ(); startTakeTimer(); startTakePoll();}
function val(id){return document.getElementById(id).value.trim()}

function startTakeTimer(){clearInterval(window.__takeTimer); const tick=()=>{if(!takeState||takeState.submitting) return;
  let el=document.getElementById('timerTime'), bar=document.getElementById('timerBar'), dock=document.getElementById('timerDock'); if(!el) return;
  if(takeState.deadline){let remain=(takeState.deadline-Date.now())/1000; el.textContent=fmtTime(remain);
    if(bar) bar.style.width=Math.max(0,remain/takeState.durationSec*100)+'%';
    if(dock){dock.classList.toggle('warn',remain<=60&&remain>10); dock.classList.toggle('danger',remain<=10)}
    if(remain<=0){submitTake('time_expired')}}
  else {el.textContent=fmtTime((Date.now()-takeState.started)/1000); if(bar) bar.style.width='100%'}};
 tick(); window.__takeTimer=setInterval(tick,500)}
function startTakePoll(){clearInterval(window.__takePoll); if(!remoteUrl()) return;
 window.__takePoll=setInterval(async()=>{if(!takeState||takeState.submitting) return;
  try{let j=await remoteGet('take',{slug:takeState.a.slug}); if(j.closed||(j.activation&&isClosed(j.activation))){mergeRemote(j.activation?{activations:[j.activation]}:{}); submitTake('trainer_closed')}}catch(e){/* network hiccup: চলমান exam ব্যাহত নয় */}},20000)}

function showQ(){let {q,idx}=takeState; let app=document.getElementById('app'); if(idx>=q.questions.length) return submitTake(); let ques=q.questions[idx]; let pct=Math.round(idx/q.questions.length*100);
 app.innerHTML=`<header class="topbar"><span class="logo-tile"><img src="assets/logo-white.png" alt="Shanta Life"></span><div class="brand"><b>${esc(q.title)}</b><span>প্রশ্ন ${idx+1} / ${q.questions.length} • ${esc(takeState.emp.name)}</span></div></header>
 <div class="wrap quiz-shell"><div class="timer-dock" id="timerDock"><span class="timer-ic">${icon('timer')}</span><div class="timer-main"><b id="timerTime">${takeState&&takeState.durationSec?fmtTime(takeState.durationSec):'00:00'}</b><span>${takeState&&takeState.durationSec?'সময় বাকি':'অতিবাহিত সময়'}</span><div class="timer-track"><i id="timerBar"></i></div></div><span class="chip">${idx+1}/${q.questions.length}</span></div><div class="progress"><i style="width:${pct}%"></i></div><div class="progress-meta"><span>প্রশ্ন ${idx+1} / ${q.questions.length}</span><span>${pct}% সম্পন্ন</span></div><div class="card question-card"><span class="badge">${esc(ques.type||'MCQ')}</span> <span class="badge green">${esc(ques.difficulty||'')}</span><h2>${idx+1}. ${esc(ques.question)}</h2>
 ${ques.options.length?ques.options.map((o,oi)=>`<label class="option ${takeState.answers[idx]==o?'sel':''}" style="--i:${oi}"><input type="radio" name="opt" ${takeState.answers[idx]==o?'checked':''} onchange="takeState.answers[${idx}]=this.value" value="${esc(o)}"> ${esc(o)}</label>`).join(''):`<textarea id="txtAns" rows="4" placeholder="আপনার মতামত লিখুন..." oninput="takeState.answers[${idx}]=this.value">${esc(takeState.answers[idx]||'')}</textarea>`}
 <div class="quiz-actions">${idx>0?'<button class="btn ghost" onclick="takeState.idx--;showQ()">'+icon('arrowL')+' আগেরটি</button>':''}<button class="btn" onclick="nextQ()">${idx==q.questions.length-1?icon('check')+' Submit করুন':'পরের প্রশ্ন '+icon('arrowR')}</button></div></div></div>`}
window.nextQ=()=>{if(takeState.q.kind=='quiz' && !takeState.answers[takeState.idx]) {if(!confirm('উত্তর না দিয়ে এগিয়ে যাবেন?')) return} takeState.idx++; showQ()};
async function submitTake(reason='submitted'){if(!takeState||takeState.submitting) return; takeState.submitting=true; clearTakeTimers(); let {q,a,emp}=takeState; let total=q.questions.length; let correct=0; q.questions.forEach((ques,i)=>{if(ques.correct && takeState.answers[i]==ques.correct) correct++}); let percent=q.kind=='quiz'?Math.round(correct/total*100):100;
 let rec={id:uid('res'),date:a.date,purpose:a.purpose,quizTitle:q.title,kind:q.kind,...emp,score:correct,total,percent,answers:takeState.answers,completionStatus:reason,submittedAt:new Date().toISOString()}; db.results.push(rec); save(); let synced=await syncToSheet(rec); if(!synced){db.pending.push(rec.id); save();}
 let app=document.getElementById('app'); let excellent=percent>85;
 app.innerHTML=`<div class="wrap quiz-shell"><div class="card result-card"><div class="result-logo"><img src="assets/logo-dark.png" alt="Shanta Life"></div>
 ${q.kind=='quiz'?`<h1>${excellent?'🎉🏆 অসাধারণ! আপনি একজন Shanta Life Knowledge Champion!':'Quiz সম্পন্ন হয়েছে!'}</h1><div class="score-ring" style="--p:${percent}"><div class="score-inner"><strong>${percent}%</strong><span>Score</span></div></div><p>আপনার স্কোর: <b>${correct} / ${total}</b></p>${excellent?'<p class="grade-banner excellent"><b>🌟 ৮৫%-এর বেশি স্কোর! আপনার পণ্য-জ্ঞান সত্যিই প্রশংসনীয় — এভাবেই গ্রাহকের আস্থা অর্জন করুন, Shanta Life-এর গর্ব হয়ে উঠুন! 🚀</b></p>':percent>=60?'<p class="grade-banner good">👏 ভালো করেছেন! আরেকটু অনুশীলনেই আপনি টপ স্কোরার হবেন ইনশাআল্লাহ!</p>':'<p class="grade-banner retry">💪 অংশ নেওয়ার জন্য ধন্যবাদ! সঠিক উত্তরগুলো দেখে শিখে নিন — পরের বার আরও ভালো হবে!</p>'}
 <button class="btn olive" onclick="showReview()">${icon('book')} সঠিক উত্তর ও ব্যাখ্যা দেখুন</button>`:`<h1>🎉 ধন্যবাদ! Survey সম্পন্ন হয়েছে</h1><p>আপনার মূল্যবান মতামত আমাদের আরও ভালো করতে সাহায্য করবে।</p>`}
 ${reason==='time_expired'?`<p class="grade-banner retry">${icon('timer')} <b>সময় শেষ:</b> আপনার উত্তরগুলো স্বয়ংক্রিয়ভাবে submit হয়েছে।</p>`:reason==='trainer_closed'?`<p class="grade-banner retry">${icon('shield')} <b>Trainer window বন্ধ করেছেন:</b> আপনার উত্তরগুলো স্বয়ংক্রিয়ভাবে submit হয়েছে।</p>`:''}
 <p class="label">${synced?icon('cloud')+' আপনার ফলাফল Google Sheet-এ সংরক্ষিত হয়েছে':icon('cloud')+' ফলাফল এই ডিভাইসে সংরক্ষিত হয়েছে (Sheet sync পরে হবে)'}</p><div id="review"></div></div></div>`; if(excellent) confetti();}
window.showReview=()=>{let {q}=takeState; document.getElementById('review').innerHTML='<h2 class="sec-title">Answer Review</h2>'+q.questions.map((ques,i)=>{let mine=takeState.answers[i];let ok=mine==ques.correct;return `<div class="card review-item ${ok?'is-correct':'is-wrong'}"><b>${i+1}. ${esc(ques.question)}</b><br> <div class="answer-line ${ok?'correct':'wrong'}">আপনার উত্তর: <b>${esc(mine||'—')} ${ques.correct?(ok?'✅':'❌'):''}</b></div><div class="answer-line correct">সঠিক উত্তর: <b>${esc(ques.correct||'—')}</b></div><span class="label">💡 ${esc(ques.explanation||'')} ${ques.source?'• 📚 '+esc(ques.source):''}</span></div>`}).join('')};

// ---------- Results / Dashboard analytics ----------
function tableResults(list){if(!list.length) return '<p class="label">এখনো কোনো রেজাল্ট নেই।</p>'; return `<table><tr><th>নাম</th><th>Quiz/Survey</th><th>Purpose</th><th>Supervisor</th><th>Zone</th><th>স্কোর</th><th>তারিখ</th></tr>${list.map(r=>`<tr><td>${esc(r.name)}<br><span class="label">${esc(r.mobile)}</span></td><td>${esc(r.quizTitle)}</td><td>${esc(r.purpose)}</td><td>${esc(r.supervisor)}</td><td>${esc(r.zone)}</td><td><span class="score-pill ${r.percent>=85?'high':r.percent<50?'low':''}">${r.kind=='survey'?'—':r.percent+'%'}</span></td><td>${esc(r.date)}</td></tr>`).join('')}</table>`}
function viewResults(){let f=JSON.parse(sessionStorage.getItem('rf')||'{}'); let list=db.results.filter(r=>(!f.date||r.date==f.date)&&(!f.month||r.date.startsWith(f.month))&&(!f.purpose||r.purpose==f.purpose)&&(!f.supervisor||r.supervisor==f.supervisor)&&(!f.zone||r.zone==f.zone));
 let purposes=[...new Set(db.results.map(r=>r.purpose))];
 let bySup={}; list.forEach(r=>{bySup[r.supervisor]=(bySup[r.supervisor]||0)+1});
 document.getElementById('app').innerHTML=header('results')+`<div class="wrap"><h1>${icon('chart','ic ic-lg')} Admin Dashboard — Results & Analytics</h1>
<div class="card"><b>Filter</b><div class="grid">
<div><label>নির্দিষ্ট Date</label><input type="date" id="fDate" value="${f.date||''}"></div>
<div><label>Month (YYYY-MM)</label><input type="month" id="fMonth" value="${f.month||''}"></div>
<div><label>Purpose / Training</label><select id="fPurpose"><option value="">সব</option>${purposes.map(p=>`<option ${f.purpose==p?'selected':''}>${esc(p)}</option>`).join('')}</select></div>
<div><label>Supervisor</label><select id="fSup"><option value="">সব</option>${db.supervisors.map(s=>`<option ${f.supervisor==s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
<div><label>Zone/Area</label><select id="fZone"><option value="">সব</option>${db.zones.map(z=>`<option ${f.zone==z?'selected':''}>${esc(z)}</option>`).join('')}</select></div></div>
<br><button class="btn" onclick="applyF()">Filter করুন</button> <button class="btn ghost" onclick="sessionStorage.removeItem('rf');viewResults()">Reset</button> <button class="btn olive" onclick="exportCSV()">${icon('download')} CSV Export</button></div>
<div class="grid" style="margin-top:16px"><div class="card"><div class="kpi">${list.length}</div><div class="label">Participants (filtered)</div></div><div class="card"><div class="kpi">${list.length?Math.round(list.reduce((a,x)=>a+(x.percent||0),0)/list.length):0}%</div><div class="label">গড় স্কোর</div></div><div class="card"><div class="kpi">${list.filter(x=>x.percent>=85).length}</div><div class="label">🏆 ৮৫%+ Achievers</div></div></div>
<div class="card" style="margin-top:16px"><h3>${icon('users','ic ic-lg')} Supervisor-wise Participants</h3>${Object.entries(bySup).map(([k,v])=>`<div class="bar-row"><span style="width:180px">${esc(k)}</span><div class="bar progress"><i style="width:${list.length?v/list.length*100:0}%"></i></div><b>${v}</b></div>`).join('')||'—'}</div>
<div class="card" style="margin-top:16px">${tableResults(list.slice().reverse())}</div></div>`}
window.applyF=()=>{sessionStorage.setItem('rf',JSON.stringify({date:val('fDate'),month:val('fMonth'),purpose:val('fPurpose'),supervisor:val('fSup'),zone:val('fZone')})); viewResults()};
window.exportCSV=()=>{let rows=[['date','purpose','quiz','name','mobile','employee_id','supervisor','zone','score','total','percent','submittedAt'],...db.results.map(r=>[r.date,r.purpose,r.quizTitle,r.name,r.mobile,r.code,r.supervisor,r.zone,r.score,r.total,r.percent,r.submittedAt])]; let csv=rows.map(r=>r.map(x=>`"${(x??'').toString().replace(/"/g,'""')}"`).join(',')).join('\n'); let a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv'})); a.download='shanta_quiz_results.csv'; a.click(); toast('CSV ডাউনলোড হয়েছে — Google Sheet-এ Import করুন')};

function viewSettings(){document.getElementById('app').innerHTML=header('settings')+`<div class="wrap"><h1>${icon('sliders','ic ic-lg')} Supervisors, Zones & Google Sheet</h1>
<div class="card"><h2>${icon('users','ic ic-lg')} Supervisor তালিকা (Employee ফর্মের Dropdown)</h2><p class="label">এখানে অথবা Google Sheet-এর <b>Supervisors</b> শিটে (A2 থেকে) নাম লিখুন — Sheet-এর তালিকাই সব ডিভাইসে dropdown-এ আসবে। তালিকা: ${db.supervisors.length} জন</p><div id="supList">${db.supervisors.map((s,i)=>`<p>• ${esc(s)} <button class="btn ghost" onclick="db.supervisors.splice(${i},1);save();saveListsRemote();viewSettings()">✕</button></p>`).join('')||'<p class="label">কেউ নেই — নিচে যোগ করুন অথবা Sheet থেকে Sync করুন</p>'}</div>
<input id="newSup" placeholder="নতুন Supervisor-এর নাম"><br><br><button class="btn" onclick="if(val('newSup')){db.supervisors.push(val('newSup'));save();saveListsRemote();viewSettings()}">+ যোগ করুন</button> <button class="btn ghost" onclick="syncListsFromSheet()">${icon('cloud')} Sheet থেকে Sync করুন</button>
<h2>Zone / Area</h2><div>${db.zones.map((z,i)=>`<span class="badge">${esc(z)} <a href="#" onclick="db.zones.splice(${i},1);save();saveListsRemote();viewSettings();return false">✕</a></span> `).join('')}</div><input id="newZone" placeholder="নতুন Zone"><br><br><button class="btn" onclick="if(val('newZone')){db.zones.push(val('newZone'));save();saveListsRemote();viewSettings()}">+ যোগ করুন</button></div>
<div class="card" style="margin-top:16px"><h2>${icon('cloud','ic ic-lg')} Google Sheet Integration</h2>
<p>Mode: ${remoteUrl()?'<span class="badge green">☁️ Sheet-connected</span>':'<span class="badge">💾 Local only</span>'} ${db.pending&&db.pending.length?`<span class="badge">⏳ Pending sync: ${db.pending.length}</span>`:''}<br>
Score Sheet: <a target="_blank" href="https://docs.google.com/spreadsheets/d/${db.settings.spreadsheetId}">SLI_Employee Knowledge Test Score Sheet</a><br>Learning Hub DB: <a target="_blank" href="https://docs.google.com/spreadsheets/d/${db.settings.learningHubId}">Shanta Life Learning Hub</a></p>
<label>Apps Script Web App URL (../exec)</label><input id="sheetUrl" value="${esc(remoteUrl())}" placeholder="https://script.google.com/macros/s/.../exec">
<br><br><button class="btn" onclick="saveSheetUrl()">${icon('check')} Save URL</button> <button class="btn olive" onclick="testConnection()">${icon('zap')} Test Connection</button> <button class="btn ghost" onclick="syncAll()">${icon('refresh')} Sync All (Quiz+Results)</button> <span id="testOut"></span>
<p class="label"><b>সব employee-এর device-এ কাজ করাতে:</b> এই URL-টি repo-র <b>config.js</b>-এর <code>appsScriptUrl</code>-এ বসিয়ে Vercel-এ redeploy করুন (docs/SETUP.md দেখুন)। Settings-এর URL শুধু এই browser-এর জন্য; তবে শেয়ার-লিংকের সাথে URL-টি encoded আকারে যায়, তাই Active করার সময় Sheet-synced থাকলেই employee লিংক থেকে ডেটা পাবে। Script-এ <b>setupSheets</b> Run করুন (doPost নয়), তারপর Deploy → Web app (Anyone)।</p>
<button class="btn ghost" onclick="if(confirm('সব local ডেটা রিসেট?')){localStorage.removeItem(LS);location.reload()}">${icon('trash')} Reset Local Data</button></div></div>`}
window.saveSheetUrl=()=>{db.settings.sheetUrl=val('sheetUrl'); save(); toast('URL Saved'); bootstrapRemote(true,true)};
window.testConnection=async()=>{db.settings.sheetUrl=val('sheetUrl'); save(); let o=document.getElementById('testOut'); o.innerHTML='⏳...'; try{let j=await remoteGet('health'); o.innerHTML=`<span class="badge green">✅ Connected! Sheets: ${esc((j.sheets||[]).join(', '))} • Supervisors: ${j.supervisors}</span>`}catch(e){o.innerHTML=`<span class="badge">❌ Connect হয়নি: ${esc(String(e))} — URL (../exec), Access: Anyone ও New version deploy চেক করুন</span>`}};
window.saveListsRemote=async()=>{let r=await remotePost({action:'saveLists',supervisors:db.supervisors,zones:db.zones}); if(r.ok) toast('☁️ Sheet-এ list sync হয়েছে')};
window.syncListsFromSheet=async()=>{try{let j=await remoteGet('supervisors'); mergeRemote(j); toast('Sheet থেকে '+db.supervisors.length+' জন supervisor এসেছে'); viewSettings()}catch(e){toast('Sync হয়নি: '+e)}};
window.syncAll=async()=>{for(let q of db.quizzes) await persistQuiz(q); for(let a of db.activations){let q=db.quizzes.find(x=>x.id==a.quizId); if(q) await remotePost({action:'activate',activation:a,quiz:q})} let still=[]; for(let id of (db.pending||[])){let r=db.results.find(x=>x.id==id); if(r && !(await syncToSheet(r))) still.push(id)} db.pending=still; save(); await remoteGet('results').then(j=>mergeRemote(j)).catch(()=>{}); toast(still.length?'⚠️ কিছু pending আছে':'Sync সম্পন্ন'); viewSettings()};

function modal(html){document.getElementById('modalRoot').innerHTML=`<div class="modalBg" onclick="if(event.target==this)closeModal()"><div class="modal">${html}<br><button class="btn ghost" onclick="closeModal()">বন্ধ করুন</button></div></div>`}
window.closeModal=()=>document.getElementById('modalRoot').innerHTML='';
function confetti(){let c=document.getElementById('confetti'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;let p=Array.from({length:140},()=>({x:Math.random()*c.width,y:-20-Math.random()*c.height,w:8,h:12,vy:2+Math.random()*3,vx:-1+Math.random()*2,col:['#F37021','#978C21','#3C3C3B','#005BAA'][Math.floor(Math.random()*4)],r:Math.random()*3}));let t=0;(function f(){x.clearRect(0,0,c.width,c.height);p.forEach(o=>{o.y+=o.vy;o.x+=o.vx;x.save();x.translate(o.x,o.y);x.rotate(o.r+=.05);x.fillStyle=o.col;x.fillRect(-o.w/2,-o.h/2,o.w,o.h);x.restore()});if(t++<220)requestAnimationFrame(f);else x.clearRect(0,0,c.width,c.height)})()}
route();
