// Shanta Life Quiz Portal — localStorage + optional Google Sheets (Apps Script) sync
const LS='shanta_quiz_portal_v1';
const TEMPLATES=[
 {id:'tpl-product',kind:'quiz',name:'📚 Product Knowledge Test',desc:'MCQ + True/False, product-wise',questions:[{question:'নমুনা প্রশ্ন: পলিসির গ্রেস পিরিয়ড কত দিন?',options:['A) ১৫ দিন','B) ৩১ দিন','C) ৪৫ দিন'],correct:'B) ৩১ দিন',explanation:'গ্রেস পিরিয়ড ৩১ দিন।',type:'MCQ'}]},
 {id:'tpl-training',kind:'survey',name:'🎓 Training Feedback Survey',desc:'Rating + মতামত',questions:[{question:'প্রশিক্ষণটি আপনার কাজে কতটা সহায়ক ছিল?',options:['১ - একদম না','২','৩','৪','৫ - খুবই সহায়ক'],correct:'',type:'Rating'},{question:'আপনার পরামর্শ লিখুন',options:[],correct:'',type:'Text'}]},
 {id:'tpl-compliance',kind:'quiz',name:'🛡️ Compliance & Ethics Quiz',desc:'Scenario ভিত্তিক',questions:[{question:'গ্রাহকের তথ্য গোপন রাখা উচিত — সত্য/মিথ্যা?',options:['A) সত্য','B) মিথ্যা'],correct:'A) সত্য',explanation:'তথ্য গোপনীয়তা বাধ্যতামূলক।',type:'True/False'}]},
 {id:'tpl-satisfaction',kind:'survey',name:'😊 Employee Satisfaction Survey',desc:'Anonymous মতামত',questions:[{question:'কর্মপরিবেশে আপনি কতটা সন্তুষ্ট?',options:['খুব সন্তুষ্ট','সন্তুষ্ট','মোটামুটি','অসন্তুষ্ট'],correct:'',type:'MCQ'}]},
];
let db=load();
function uid(p='id'){return p+'-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function slug(s){return s.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]+/gi,'-').replace(/^-|-$/g,'').slice(0,40)||uid('q')}
function load(){try{let d=JSON.parse(localStorage.getItem(LS)); if(d) return d}catch(e){}
 // seed: group SEED_QUESTIONS by product+set
 let quizzes=[]; let groups={};
 (window.SEED_QUESTIONS||[]).forEach(q=>{let k=q.product+'||'+q.set; (groups[k]=groups[k]||[]).push(q)});
 Object.entries(groups).forEach(([k,qs])=>{let [product,set]=k.split('||'); quizzes.push({id:uid('quiz'),kind:'quiz',title:`${product} — ${set}`,product,set,questions:qs,createdAt:new Date().toISOString(),source:'Sample CSV (seed)'})});
 quizzes.push({id:'demo-survey',kind:'survey',title:'Training Feedback — Demo Survey',product:'General',set:'Survey',questions:TEMPLATES[1].questions,createdAt:new Date().toISOString(),source:'Template'});
 return {quizzes,activations:[],results:[],supervisors:['Md. Ariful Islam','Fatema Begum','Tanvir Ahmed','Nusrat Jahan','Md. Kamrul Hasan'],zones:['Dhaka North','Dhaka South','Chattogram','Khulna','Rajshahi','Sylhet','Barishal','Rangpur'],settings:{sheetUrl:'',spreadsheetId:'1LYfXLj3XURSvg8pr2a_uZzVwGlz-dp_Sj2WtdcWzQM0',spreadsheetName:'SLI_Employee Knowledge Test Score Sheet',learningHubId:'1EYJwZDV99DPUcMWdC3LZP_7f1EyVJ2n-Yk_mb0k4Qnc'}}}
function save(){localStorage.setItem(LS,JSON.stringify(db))}
function toast(m){let t=document.createElement('div');t.className='toast';t.textContent=m;document.getElementById('toast').appendChild(t);setTimeout(()=>t.remove(),3200)}
function esc(s){return (s??'').toString().replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function today(){return new Date().toISOString().slice(0,10)}
// CSV parser (quoted fields)
function parseCSV(text){let rows=[],row=[],cur='',q=false;for(let i=0;i<text.length;i++){let c=text[i];if(q){if(c=='"'){if(text[i+1]=='"'){cur+='"';i++}else q=false}else cur+=c}else{if(c=='"')q=true;else if(c==','){row.push(cur);cur=''}else if(c=='\n'){row.push(cur);rows.push(row);row=[];cur=''}else if(c!='\r')cur+=c}}if(cur||row.length){row.push(cur);rows.push(row)}let h=rows.shift().map(x=>x.trim());return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,(r[i]||'').trim()])))}
function questionsFromRows(rows){return rows.map(r=>({id:r.question_id||uid('q'),product:r.product||'',set:r.set||'',type:r.type||'MCQ',difficulty:r.difficulty||'',question:r.question||r.Question||'',options:(r.options||'').split('|').map(x=>x.trim()).filter(Boolean),correct:r.correct_answer||'',explanation:r.explanation||'',source:r.source_citation||''})).filter(q=>q.question)}
async function syncToSheet(payload){let url=db.settings.sheetUrl; if(!url) return false; try{await fetch(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify(payload)});return true}catch(e){return false}}

// ---------- Router ----------
function route(){let h=location.hash||'#/admin'; let m=h.match(/#\/take\/([\w-]+)/); if(m) return renderTake(m[1]); renderAdmin(h)}
window.addEventListener('hashchange',route);

function header(active){return `<header class="topbar"><img src="assets/logo-white.png" alt="Shanta Life"><div class="brand"><b>SHANTA Life</b><span>Employee Knowledge Test • Quiz & Survey Portal</span></div><nav class="nav">
<button onclick="location.hash='#/admin'" class="${active=='dash'?'active':''}">🏠 Dashboard</button>
<button onclick="location.hash='#/bank'" class="${active=='bank'?'active':''}">🗂️ Quiz/Survey Bank</button>
<button onclick="location.hash='#/create'" class="${active=='create'?'active':''}">➕ Create / Import</button>
<button onclick="location.hash='#/results'" class="${active=='results'?'active':''}">📊 Results</button>
<button onclick="location.hash='#/settings'" class="${active=='settings'?'active':''}">⚙️ Supervisors & Sheet</button></nav></header>`}

function renderAdmin(h){
 if(h.startsWith('#/bank')) return viewBank();
 if(h.startsWith('#/create')) return viewCreate();
 if(h.startsWith('#/results')) return viewResults();
 if(h.startsWith('#/settings')) return viewSettings();
 viewDashboard();
}
function stats(){let r=db.results; return {total:r.length,avg:r.length?Math.round(r.reduce((a,x)=>a+(x.percent||0),0)/r.length):0,pass:r.filter(x=>x.percent>=85).length,quizzes:db.quizzes.filter(x=>x.kind=='quiz').length,surveys:db.quizzes.filter(x=>x.kind=='survey').length,active:db.activations.filter(a=>a.date>=today()).length}}
function viewDashboard(){let s=stats(); document.getElementById('app').innerHTML=header('dash')+`<section class="hero"><h1>🌟 নিজের জ্ঞান যাচাই করুন, আরও আত্মবিশ্বাসী হোন!</h1><p>Quiz ও Survey তৈরি করুন, নির্দিষ্ট তারিখের জন্য Active করুন, শেয়ারযোগ্য লিংক পাঠান — ফলাফল স্বয়ংক্রিয়ভাবে রেকর্ড হবে (Google Sheet: <b>${esc(db.settings.spreadsheetName)}</b>)।</p></section>
<div class="wrap"><div class="grid">
<div class="card"><div class="kpi">${s.quizzes}</div><div class="label">Quiz Bank-এ Quiz</div></div>
<div class="card"><div class="kpi">${s.surveys}</div><div class="label">Survey Bank-এ Survey</div></div>
<div class="card"><div class="kpi">${s.total}</div><div class="label">মোট Participants</div></div>
<div class="card"><div class="kpi">${s.avg}%</div><div class="label">গড় স্কোর</div></div>
<div class="card"><div class="kpi">${s.pass}</div><div class="label">🏆 ৮৫%+ স্কোরার</div></div>
<div class="card"><div class="kpi">${s.active}</div><div class="label">আসন্ন/চলমান Activation</div></div></div>
<h2>🔗 Active / Scheduled Links</h2>${db.activations.length?db.activations.map(a=>shareCard(a)).join(''):'<div class="card">এখনো কোনো Activation নেই। Quiz Bank থেকে <b>▶ Active</b> চাপ দিন।</div>'}
<h2>🏅 Latest Participants</h2><div class="card">${tableResults(db.results.slice(-8).reverse())}</div></div>`}
function shareCard(a){let q=db.quizzes.find(x=>x.id==a.quizId);let link=`${location.origin}${location.pathname}#/take/${a.slug}`;let live=a.date==today();return `<div class="card"><b>${esc(q?q.title:a.slug)}</b> <span class="badge ${live?'green':''}">${live?'🟢 LIVE আজ':'📅 '+a.date}</span><br><span class="label">Purpose: ${esc(a.purpose)} • Date: ${a.date}</span><div class="sharebox">📩 ${esc(a.message)}<br><a href="${link}">${link}</a></div><button class="btn ghost" onclick="copyLink('${a.slug}')">📋 Copy Link</button> <button class="btn ghost" onclick="copyMsg('${a.id}')">💬 Copy Message</button></div>`}
window.copyLink=s=>{let link=`${location.origin}${location.pathname}#/take/${s}`;navigator.clipboard.writeText(link);toast('✅ লিংক কপি হয়েছে')};
window.copyMsg=id=>{let a=db.activations.find(x=>x.id==id);let link=`${location.origin}${location.pathname}#/take/${a.slug}`;navigator.clipboard.writeText(`${a.message}\n👉 ${link}`);toast('✅ মেসেজ কপি হয়েছে')};

function viewBank(){let kind=sessionStorage.getItem('bankKind')||'quiz';let list=db.quizzes.filter(q=>q.kind==kind);
 document.getElementById('app').innerHTML=header('bank')+`<div class="wrap"><h1>🗂️ ${kind=='quiz'?'Quiz':'Survey'} Bank</h1>
<div class="tabs"><button class="${kind=='quiz'?'active':''}" onclick="sessionStorage.setItem('bankKind','quiz');viewBank()">📝 Quiz Test</button><button class="${kind=='survey'?'active':''}" onclick="sessionStorage.setItem('bankKind','survey');viewBank()">📋 Survey</button></div>
${list.map(q=>`<div class="card" style="margin-bottom:12px"><b>${esc(q.title)}</b> <span class="badge">${q.questions.length} প্রশ্ন</span> <span class="badge green">${esc(q.product||'')}</span><br><span class="label">${esc(q.set||'')} • Source: ${esc(q.source||'Manual')}</span><br><br>
<button class="btn" onclick="openActivate('${q.id}')">▶ Active করুন</button> <button class="btn ghost" onclick="previewQuiz('${q.id}')">👁️ Preview</button> <button class="btn ghost" onclick="delQuiz('${q.id}')">🗑️ Delete</button></div>`).join('')||'<div class="card">কিছু নেই — Create/Import থেকে যোগ করুন।</div>'}</div>`}
window.delQuiz=id=>{if(confirm('Delete?')){db.quizzes=db.quizzes.filter(q=>q.id!=id);save();viewBank()}};
window.previewQuiz=id=>{let q=db.quizzes.find(x=>x.id==id); modal(`<h2>${esc(q.title)}</h2>`+q.questions.map((x,i)=>`<p><b>${i+1}. ${esc(x.question)}</b><br>${x.options.map(o=>esc(o)).join('<br>')}<br><span class="badge green">সঠিক: ${esc(x.correct||'—')}</span> <span class="label">${esc(x.explanation||'')}</span></p>`).join(''))};
window.openActivate=id=>{modal(`<h2>▶ Active করুন</h2><label>Test Purpose *</label><input id="aPurpose" placeholder="যেমন: Monthly Product Training — October">
<label>Active Date * (শুধু এই তারিখেই লিংক কাজ করবে)</label><input type="date" id="aDate" value="${today()}">
<label>উৎসাহমূলক Message</label><textarea id="aMsg" rows="3">🎉 প্রিয় সহকর্মী, নিজের পণ্য-জ্ঞান যাচাই করে আরও আত্মবিশ্বাসী হয়ে উঠুন! এই কুইজে অংশ নিন, স্কোর দেখুন এবং শিখুন প্রতিটি সঠিক উত্তর। আপনার জন্য শুভকামনা! 🌟</textarea>
<br><br><button class="btn" onclick="doActivate('${id}')">🚀 Active Initiate করুন</button>`)};
window.doActivate=id=>{let purpose=document.getElementById('aPurpose').value.trim(),date=document.getElementById('aDate').value,msg=document.getElementById('aMsg').value.trim(); if(!purpose||!date) return toast('⚠️ Purpose ও Date দিন'); let q=db.quizzes.find(x=>x.id==id); let a={id:uid('act'),quizId:id,slug:slug(q.title)+'-'+date,purpose,date,message:msg,createdAt:new Date().toISOString()}; db.activations.push(a);save();closeModal(); document.getElementById('app').innerHTML=header('dash')+`<div class="wrap"><h1>✅ সফলভাবে Active হয়েছে!</h1>${shareCard(a)}<button class="btn olive" onclick="location.hash='#/admin'">Dashboard-এ যান</button></div>`; confetti();};

function viewCreate(){document.getElementById('app').innerHTML=header('create')+`<div class="wrap"><h1>➕ Quiz / Survey Generate করুন</h1>
<div class="grid">${TEMPLATES.map(t=>`<div class="card"><h3>${t.name}</h3><p class="label">${t.desc}</p><button class="btn olive" onclick="useTemplate('${t.id}')">এই Template ব্যবহার করুন</button></div>`).join('')}</div>
<div class="card" style="margin-top:16px"><h2>✍️ Manual Create</h2>
<label>ধরন</label><select id="cKind"><option value="quiz">Quiz Test</option><option value="survey">Survey</option></select>
<label>Title *</label><input id="cTitle" placeholder="যেমন: Shanta Endowment — Set 1">
<label>Product</label><input id="cProduct" placeholder="Shanta Endowment">
<div id="qBuilder"></div><button class="btn ghost" onclick="addQ()">+ প্রশ্ন যোগ করুন</button> <button class="btn" onclick="saveManual()">💾 Bank-এ Save করুন</button></div>
<div class="card" style="margin-top:16px"><h2>📤 CSV / JSON Upload করে Import</h2><p class="label">CSV header: question_id,product,set,type,difficulty,question,options,correct_answer,explanation,source_citation — options আলাদা করুন <b>|</b> দিয়ে। <a href="data/sample_questions.csv" download>Sample CSV ডাউনলোড</a></p>
<input type="file" id="fileUp" accept=".csv,.json"><br><br><button class="btn" onclick="importFile()">Import করুন</button><div id="importOut"></div></div></div>`; addQ();}
window.useTemplate=id=>{let t=TEMPLATES.find(x=>x.id==id); db.quizzes.push({id:uid('quiz'),kind:t.kind,title:t.name.replace(/^[^ ]+ /,'')+' — '+new Date().toLocaleDateString(),product:'General',set:'Template',questions:JSON.parse(JSON.stringify(t.questions)),source:'Template: '+t.name,createdAt:new Date().toISOString()}); save(); toast('✅ Template থেকে Bank-এ যোগ হয়েছে'); location.hash='#/bank'; sessionStorage.setItem('bankKind',t.kind)};
let qn=0; window.addQ=()=>{qn++; let d=document.createElement('div'); d.className='qbox'; d.innerHTML=`<label>প্রশ্ন ${qn}</label><input class="qq" placeholder="প্রশ্ন লিখুন"><label>Options (| দিয়ে)</label><input class="qo" placeholder="A) ... | B) ... | C) ..."><label>সঠিক উত্তর (Quiz হলে)</label><input class="qc" placeholder="B) ..."><label>ব্যাখ্যা</label><input class="qe" placeholder="ব্যাখ্যা">`; document.getElementById('qBuilder').appendChild(d)};
window.saveManual=()=>{let title=document.getElementById('cTitle').value.trim(); if(!title) return toast('⚠️ Title দিন'); let qs=[...document.querySelectorAll('.qbox')].map(b=>({question:b.querySelector('.qq').value,options:b.querySelector('.qo').value.split('|').map(x=>x.trim()).filter(Boolean),correct:b.querySelector('.qc').value,explanation:b.querySelector('.qe').value,type:'MCQ'})).filter(q=>q.question); if(!qs.length) return toast('⚠️ অন্তত ১টি প্রশ্ন দিন'); db.quizzes.push({id:uid('quiz'),kind:document.getElementById('cKind').value,title,product:document.getElementById('cProduct').value,questions:qs,source:'Manual',createdAt:new Date().toISOString()}); save(); toast('✅ Bank-এ সেভ হয়েছে'); location.hash='#/bank'};
window.importFile=async()=>{let f=document.getElementById('fileUp').files[0]; if(!f) return toast('⚠️ ফাইল সিলেক্ট করুন'); let text=await f.text(); let rows,qs; try{ if(f.name.endsWith('.json')){let j=JSON.parse(text); rows=Array.isArray(j)?j:j.questions; qs=rows.map(r=>({question:r.question,options:r.options||[],correct:r.correct_answer||r.correct||'',explanation:r.explanation||'',product:r.product||'',set:r.set||'',type:r.type||'MCQ'}))} else {rows=parseCSV(text); qs=questionsFromRows(rows)} }catch(e){return toast('❌ ফাইল পড়া যায়নি')}
 if(!qs.length) return toast('❌ কোনো প্রশ্ন পাওয়া যায়নি');
 // group by product+set if available
 let groups={}; qs.forEach(q=>{let k=(q.product||'Imported')+'||'+(q.set||'Set 1'); (groups[k]=groups[k]||[]).push(q)});
 Object.entries(groups).forEach(([k,v])=>{let [p,s]=k.split('||'); db.quizzes.push({id:uid('quiz'),kind:'quiz',title:`${p} — ${s}`,product:p,set:s,questions:v,source:'Import: '+f.name,createdAt:new Date().toISOString()})});
 save(); document.getElementById('importOut').innerHTML=`<p class="badge green">✅ ${qs.length}টি প্রশ্ন, ${Object.keys(groups).length}টি Quiz হিসেবে Bank-এ যোগ হয়েছে!</p>`; toast('✅ Import সম্পন্ন')};

// ---------- Take / Participant ----------
let takeState=null;
function renderTake(s){let a=db.activations.find(x=>x.slug==s); let app=document.getElementById('app');
 if(!a){app.innerHTML=`<div class="wrap"><div class="card"><h1>❌ লিংকটি পাওয়া যায়নি</h1><p>অনুগ্রহ করে সঠিক শেয়ার করা লিংক ব্যবহার করুন।</p></div></div>`;return}
 let q=db.quizzes.find(x=>x.id==a.quizId); let isToday=a.date==today();
 if(!isToday){app.innerHTML=`<div class="wrap"><div class="card" style="text-align:center"><img src="assets/logo-dark.png" style="width:110px;height:110px;object-fit:cover;border-radius:16px"><h1>⏰ এই ${q.kind=='quiz'?'কুইজ':'সার্ভে'}টি শুধুমাত্র ${a.date} তারিখে Active থাকবে</h1><p>${esc(a.message)}</p><p class="label">আজকের তারিখ: ${today()} • নির্ধারিত তারিখ: ${a.date}</p></div></div>`;return}
 takeState={a,q,answers:{},idx:0,emp:null,started:null};
 app.innerHTML=`<header class="topbar"><img src="assets/logo-white.png"><div class="brand"><b>${esc(q.title)}</b><span>${esc(a.purpose)} • ${a.date}</span></div></header>
 <div class="wrap"><div class="card"><h1>👋 স্বাগতম!</h1><p>📩 ${esc(a.message)}</p><p class="label">${q.questions.length}টি প্রশ্ন • সাবমিটের পরই স্কোর ও সঠিক উত্তর দেখতে পাবেন</p>
 <label>Employee Name *</label><input id="eName" placeholder="আপনার নাম">
 <label>Mobile Number *</label><input id="eMobile" placeholder="01XXXXXXXXX">
 <label>Employee ID / Producer Code (যদি থাকে)</label><input id="eCode" placeholder="ঐচ্ছিক">
 <label>Supervisor Name *</label><select id="eSup"><option value="">-- সিলেক্ট করুন --</option>${db.supervisors.map(s=>`<option>${esc(s)}</option>`).join('')}</select>
 <label>Zone / Area *</label><select id="eZone"><option value="">-- সিলেক্ট করুন --</option>${db.zones.map(z=>`<option>${esc(z)}</option>`).join('')}</select>
 <br><br><button class="btn" style="font-size:17px" onclick="startQuiz()">🚀 ${q.kind=='quiz'?'Quiz':'Survey'} শুরু করুন</button></div></div>`}
window.startQuiz=()=>{let emp={name:val('eName'),mobile:val('eMobile'),code:val('eCode'),supervisor:val('eSup'),zone:val('eZone')}; if(!emp.name||!emp.mobile||!emp.supervisor||!emp.zone) return toast('⚠️ * চিহ্নিত সব তথ্য দিন'); takeState.emp=emp; takeState.started=Date.now(); showQ();}
function val(id){return document.getElementById(id).value.trim()}
function showQ(){let {q,idx}=takeState; let app=document.getElementById('app'); if(idx>=q.questions.length) return submitTake(); let ques=q.questions[idx]; let pct=Math.round(idx/q.questions.length*100);
 app.innerHTML=`<header class="topbar"><img src="assets/logo-white.png"><div class="brand"><b>${esc(q.title)}</b><span>প্রশ্ন ${idx+1} / ${q.questions.length} • ${esc(takeState.emp.name)}</span></div></header>
 <div class="wrap"><div class="progress"><i style="width:${pct}%"></i></div><div class="card" style="margin-top:16px"><span class="badge">${esc(ques.type||'MCQ')}</span> <span class="badge green">${esc(ques.difficulty||'')}</span><h2>${idx+1}. ${esc(ques.question)}</h2>
 ${ques.options.length?ques.options.map(o=>`<label class="option ${takeState.answers[idx]==o?'sel':''}"><input type="radio" name="opt" ${takeState.answers[idx]==o?'checked':''} onchange="takeState.answers[${idx}]=this.value" value="${esc(o)}"> ${esc(o)}</label>`).join(''):`<textarea id="txtAns" rows="4" placeholder="আপনার মতামত লিখুন..." oninput="takeState.answers[${idx}]=this.value">${esc(takeState.answers[idx]||'')}</textarea>`}
 <div style="display:flex;gap:8px;margin-top:14px">${idx>0?'<button class="btn ghost" onclick="takeState.idx--;showQ()">⬅️ আগেরটি</button>':''}<button class="btn" onclick="nextQ()">${idx==q.questions.length-1?'✅ Submit করুন':'পরের প্রশ্ন ➡️'}</button></div></div></div>`}
window.nextQ=()=>{if(takeState.q.kind=='quiz' && !takeState.answers[takeState.idx]) {if(!confirm('উত্তর না দিয়ে এগিয়ে যাবেন?')) return} takeState.idx++; showQ()};
async function submitTake(){let {q,a,emp}=takeState; let total=q.questions.length; let correct=0; q.questions.forEach((ques,i)=>{if(ques.correct && takeState.answers[i]==ques.correct) correct++}); let percent=q.kind=='quiz'?Math.round(correct/total*100):100;
 let rec={id:uid('res'),date:a.date,purpose:a.purpose,quizTitle:q.title,kind:q.kind,...emp,score:correct,total,percent,answers:takeState.answers,submittedAt:new Date().toISOString()}; db.results.push(rec); save(); syncToSheet({sheet:db.settings.spreadsheetName,...rec});
 let app=document.getElementById('app'); let excellent=percent>85;
 app.innerHTML=`<div class="wrap"><div class="card" style="text-align:center"><img src="assets/logo-dark.png" style="width:100px;height:100px;object-fit:cover;border-radius:14px">
 ${q.kind=='quiz'?`<h1>${excellent?'🎉🏆 অসাধারণ! আপনি একজন Shanta Life Knowledge Champion!':'✅ Quiz সম্পন্ন হয়েছে!'}</h1><div class="kpi" style="font-size:56px">${percent}%</div><p>আপনার স্কোর: <b>${correct} / ${total}</b></p>${excellent?'<p style="font-size:18px;color:var(--olive-d)"><b>🌟 ৮৫%-এর বেশি স্কোর! আপনার পণ্য-জ্ঞান সত্যিই প্রশংসনীয় — এভাবেই গ্রাহকের আস্থা অর্জন করুন, Shanta Life-এর গর্ব হয়ে উঠুন! 🚀</b></p>':percent>=60?'<p>👏 ভালো করেছেন! আরেকটু অনুশীলনেই আপনি টপ স্কোরার হবেন ইনশাআল্লাহ!</p>':'<p>💪 অংশ নেওয়ার জন্য ধন্যবাদ! সঠিক উত্তরগুলো দেখে শিখে নিন — পরের বার আরও ভালো হবে!</p>'}
 <button class="btn olive" onclick="showReview()">📖 সঠিক উত্তর ও ব্যাখ্যা দেখুন</button>`:`<h1>🎉 ধন্যবাদ! Survey সম্পন্ন হয়েছে</h1><p>আপনার মূল্যবান মতামত আমাদের আরও ভালো করতে সাহায্য করবে।</p>`}
 <div id="review"></div></div></div>`; if(excellent) confetti();}
window.showReview=()=>{let {q}=takeState; document.getElementById('review').innerHTML='<h2 style="text-align:left">📖 Answer Review</h2>'+q.questions.map((ques,i)=>{let mine=takeState.answers[i];let ok=mine==ques.correct;return `<div class="card" style="text-align:left;margin-top:10px"><b>${i+1}. ${esc(ques.question)}</b><br>আপনার উত্তর: <span class="${ok?'':' '}" style="color:${ok?'green':'red'}">${esc(mine||'—')} ${ques.correct?(ok?'✅':'❌'):''}</span><br>সঠিক উত্তর: <b style="color:green">${esc(ques.correct||'—')}</b><br><span class="label">💡 ${esc(ques.explanation||'')} ${ques.source?'• 📚 '+esc(ques.source):''}</span></div>`}).join('')};

// ---------- Results / Dashboard analytics ----------
function tableResults(list){if(!list.length) return '<p class="label">এখনো কোনো রেজাল্ট নেই।</p>'; return `<table><tr><th>নাম</th><th>Quiz/Survey</th><th>Purpose</th><th>Supervisor</th><th>Zone</th><th>স্কোর</th><th>তারিখ</th></tr>${list.map(r=>`<tr><td>${esc(r.name)}<br><span class="label">${esc(r.mobile)}</span></td><td>${esc(r.quizTitle)}</td><td>${esc(r.purpose)}</td><td>${esc(r.supervisor)}</td><td>${esc(r.zone)}</td><td><b>${r.kind=='survey'?'—':r.percent+'%'}</b></td><td>${esc(r.date)}</td></tr>`).join('')}</table>`}
function viewResults(){let f=JSON.parse(sessionStorage.getItem('rf')||'{}'); let list=db.results.filter(r=>(!f.date||r.date==f.date)&&(!f.month||r.date.startsWith(f.month))&&(!f.purpose||r.purpose==f.purpose)&&(!f.supervisor||r.supervisor==f.supervisor)&&(!f.zone||r.zone==f.zone));
 let purposes=[...new Set(db.results.map(r=>r.purpose))];
 let bySup={}; list.forEach(r=>{bySup[r.supervisor]=(bySup[r.supervisor]||0)+1});
 document.getElementById('app').innerHTML=header('results')+`<div class="wrap"><h1>📊 Admin Dashboard — Results & Analytics</h1>
<div class="card"><b>🔎 Filter</b><div class="grid">
<div><label>নির্দিষ্ট Date</label><input type="date" id="fDate" value="${f.date||''}"></div>
<div><label>Month (YYYY-MM)</label><input type="month" id="fMonth" value="${f.month||''}"></div>
<div><label>Purpose / Training</label><select id="fPurpose"><option value="">সব</option>${purposes.map(p=>`<option ${f.purpose==p?'selected':''}>${esc(p)}</option>`).join('')}</select></div>
<div><label>Supervisor</label><select id="fSup"><option value="">সব</option>${db.supervisors.map(s=>`<option ${f.supervisor==s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
<div><label>Zone/Area</label><select id="fZone"><option value="">সব</option>${db.zones.map(z=>`<option ${f.zone==z?'selected':''}>${esc(z)}</option>`).join('')}</select></div></div>
<br><button class="btn" onclick="applyF()">Filter করুন</button> <button class="btn ghost" onclick="sessionStorage.removeItem('rf');viewResults()">Reset</button> <button class="btn olive" onclick="exportCSV()">⬇️ CSV Export (Sheet-এর জন্য)</button></div>
<div class="grid" style="margin-top:16px"><div class="card"><div class="kpi">${list.length}</div><div class="label">Participants (filtered)</div></div><div class="card"><div class="kpi">${list.length?Math.round(list.reduce((a,x)=>a+(x.percent||0),0)/list.length):0}%</div><div class="label">গড় স্কোর</div></div><div class="card"><div class="kpi">${list.filter(x=>x.percent>=85).length}</div><div class="label">🏆 ৮৫%+ Achievers</div></div></div>
<div class="card" style="margin-top:16px"><h3>👥 Supervisor-wise Participants</h3>${Object.entries(bySup).map(([k,v])=>`<div class="bar-row"><span style="width:180px">${esc(k)}</span><div class="bar progress"><i style="width:${list.length?v/list.length*100:0}%"></i></div><b>${v}</b></div>`).join('')||'—'}</div>
<div class="card" style="margin-top:16px">${tableResults(list.slice().reverse())}</div></div>`}
window.applyF=()=>{sessionStorage.setItem('rf',JSON.stringify({date:val('fDate'),month:val('fMonth'),purpose:val('fPurpose'),supervisor:val('fSup'),zone:val('fZone')})); viewResults()};
window.exportCSV=()=>{let rows=[['date','purpose','quiz','name','mobile','employee_id','supervisor','zone','score','total','percent','submittedAt'],...db.results.map(r=>[r.date,r.purpose,r.quizTitle,r.name,r.mobile,r.code,r.supervisor,r.zone,r.score,r.total,r.percent,r.submittedAt])]; let csv=rows.map(r=>r.map(x=>`"${(x??'').toString().replace(/"/g,'""')}"`).join(',')).join('\n'); let a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv'})); a.download='shanta_quiz_results.csv'; a.click(); toast('✅ CSV ডাউনলোড হয়েছে — Google Sheet-এ Import করুন')};

function viewSettings(){document.getElementById('app').innerHTML=header('settings')+`<div class="wrap"><h1>⚙️ Supervisors, Zones & Google Sheet</h1>
<div class="card"><h2>👨‍💼 Supervisor তালিকা (Employee ফর্মের Dropdown)</h2><p class="label">মূল Sheet-এ Supervisor শিটে নাম রাখলে এখানেও একই তালিকা ব্যবহার করুন।</p><div id="supList">${db.supervisors.map((s,i)=>`<p>• ${esc(s)} <button class="btn ghost" onclick="db.supervisors.splice(${i},1);save();viewSettings()">✕</button></p>`).join('')}</div>
<input id="newSup" placeholder="নতুন Supervisor-এর নাম"><br><br><button class="btn" onclick="if(val('newSup')){db.supervisors.push(val('newSup'));save();viewSettings()}">+ যোগ করুন</button>
<h2>🗺️ Zone / Area</h2><div>${db.zones.map((z,i)=>`<span class="badge">${esc(z)} <a href="#" onclick="db.zones.splice(${i},1);save();viewSettings();return false">✕</a></span> `).join('')}</div><input id="newZone" placeholder="নতুন Zone"><br><br><button class="btn" onclick="if(val('newZone')){db.zones.push(val('newZone'));save();viewSettings()}">+ যোগ করুন</button></div>
<div class="card" style="margin-top:16px"><h2>📗 Google Sheet Integration</h2>
<p>Score Sheet: <a target="_blank" href="https://docs.google.com/spreadsheets/d/${db.settings.spreadsheetId}">SLI_Employee Knowledge Test Score Sheet</a><br>Learning Hub DB: <a target="_blank" href="https://docs.google.com/spreadsheets/d/${db.settings.learningHubId}">Shanta Life Learning Hub</a></p>
<label>Apps Script Web App URL (সেট করলে প্রতিটি Submit সরাসরি Sheet-এ যাবে)</label><input id="sheetUrl" value="${esc(db.settings.sheetUrl)}" placeholder="https://script.google.com/macros/s/.../exec">
<br><br><button class="btn" onclick="db.settings.sheetUrl=val('sheetUrl');save();toast('✅ Saved')">Save</button>
<p class="label">সেটআপ: repo-র <b>google-apps-script.gs</b> ফাইলটি Sheet → Extensions → Apps Script-এ পেস্ট করে Web App হিসেবে Deploy করুন, URL এখানে বসান। URL না থাকলে ডেটা ব্রাউজারে সেভ হবে ও CSV Export করে Sheet-এ তোলা যাবে।</p>
<button class="btn ghost" onclick="if(confirm('সব ডেটা রিসেট?')){localStorage.removeItem(LS);location.reload()}">🗑️ Reset Demo Data</button></div></div>`}

function modal(html){document.getElementById('modalRoot').innerHTML=`<div class="modalBg" onclick="if(event.target==this)closeModal()"><div class="modal">${html}<br><button class="btn ghost" onclick="closeModal()">বন্ধ করুন</button></div></div>`}
window.closeModal=()=>document.getElementById('modalRoot').innerHTML='';
function confetti(){let c=document.getElementById('confetti'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;let p=Array.from({length:140},()=>({x:Math.random()*c.width,y:-20-Math.random()*c.height,w:8,h:12,vy:2+Math.random()*3,vx:-1+Math.random()*2,col:['#F37021','#978C21','#3C3C3B','#005BAA'][Math.floor(Math.random()*4)],r:Math.random()*3}));let t=0;(function f(){x.clearRect(0,0,c.width,c.height);p.forEach(o=>{o.y+=o.vy;o.x+=o.vx;x.save();x.translate(o.x,o.y);x.rotate(o.r+=.05);x.fillStyle=o.col;x.fillRect(-o.w/2,-o.h/2,o.w,o.h);x.restore()});if(t++<220)requestAnimationFrame(f);else x.clearRect(0,0,c.width,c.height)})()}
route();
