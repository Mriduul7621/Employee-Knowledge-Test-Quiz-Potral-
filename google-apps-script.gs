/**
 * ============================================================
 * Shanta Life Quiz & Survey Portal — Backend v2 (Google Sheet DB)
 * ============================================================
 * SETUP (একবারই):
 *  1) Sheet খুলুন: SLI_Employee Knowledge Test Score Sheet
 *  2) Extensions → Apps Script → পুরনো কোড মুছে এই পুরো কোড পেস্ট → Save (Ctrl+S)
 *  3) উপরের function dropdown থেকে "setupSheets" সিলেক্ট করে ▶ Run করুন
 *     (doPost Run করবেন না — ওটা শুধু Portal থেকে POST এলে চলে।
 *      Run করলে এখন আর error দেবে না, শুধু guidance message দেখাবে।)
 *     প্রথমবার Authorization চাইবে → Review permissions → Allow
 *  4) Deploy → New deployment → Web app
 *     Execute as: Me | Who has access: Anyone → Deploy
 *  5) পাওয়া .../exec URL টি Portal-এর config.js-এ appsScriptUrl-এ বসিয়ে
 *     Vercel redeploy করুন (অথবা Settings-এ বসিয়ে test করুন)।
 *
 * কোড বদলালে: Deploy → Manage deployments → Edit → New version → Deploy
 * Sheets (auto-create): Quizzes | Activations | Supervisors | Zones | Responses
 * Supervisors/Zones শিটে A2 থেকে এক লাইনে একটি করে নাম লিখুন (A1 = header)।
 * ============================================================
 */

var HEADERS = {
  Quizzes:     ['ID','Kind','Title','Product','Set','Source','QuestionsJSON','CreatedAt','UpdatedAt'],
  Activations: ['Slug','QuizID','QuizTitle','Purpose','Date','Message','CreatedAt','DurationMinutes','Status','ClosedAt','ClosedBy'],
  Supervisors: ['Name'],
  Zones:       ['Name'],
  Responses:   ['ID','Date','Purpose','Quiz/Survey','Kind','Name','Mobile','Employee ID','Supervisor','Zone','Score','Total','Percent','AnswersJSON','Submitted At','CompletionStatus']
};

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name) {
  var s = ss_().getSheetByName(name) || ss_().insertSheet(name);
  if (s.getLastRow() === 0) s.appendRow(HEADERS[name]);
  else s.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]);
  return s;
}
function ensureAllSheets_() { Object.keys(HEADERS).forEach(sheet_); }

/** ▶ Editor থেকে এটাই Run করুন — সব sheet + header তৈরি/যাচাই করে। */
function setupSheets() {
  ensureAllSheets_();
  var sup = sheet_('Supervisors');
  if (sup.getLastRow() < 2) {
    sup.getRange(2, 1, 2, 1).setValues([['উদাহরণ: Md. Ariful Islam'], ['উদাহরণ: Fatema Begum']]);
  }
  Logger.log('✅ setupSheets সম্পন্ন। Sheets: ' + ss_().getSheets().map(function(s){return s.getName();}).join(', '));
  return 'OK — sheets ready';
}

/** চাইলে Editor থেকে doPost-এর বদলে এটি Run করে test করুন — Responses-এ test row যাবে। */
function testSubmit() {
  var res = doPost({ postData: { contents: JSON.stringify({ action: 'submit',
    id: 'test-' + Date.now(), date: Utilities.formatDate(new Date(), 'Asia/Dhaka', 'yyyy-MM-dd'),
    purpose: 'Script Test', quizTitle: 'Demo Quiz', kind: 'quiz', name: 'Test User',
    mobile: '01700000000', code: 'TEST', supervisor: 'Test Supervisor', zone: 'Dhaka North',
    score: 18, total: 20, percent: 90, answers: {}, submittedAt: new Date().toISOString() }) } });
  Logger.log(res.getContent());
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function list_(name) { // header বাদে A column-এর নামগুলো
  var s = sheet_(name), last = s.getLastRow();
  if (last < 2) return [];
  return s.getRange(2, 1, last - 1, 1).getValues().map(function(r){ return String(r[0]).trim(); }).filter(String);
}
function setList_(name, arr) {
  var s = sheet_(name), last = s.getLastRow();
  if (last > 1) s.getRange(2, 1, last - 1, 1).clearContent();
  if (arr && arr.length) s.getRange(2, 1, arr.length, 1).setValues(arr.map(function(x){ return [x]; }));
}
function rows_(name) {
  var s = sheet_(name), last = s.getLastRow();
  if (last < 2) return [];
  return s.getRange(2, 1, last - 1, HEADERS[name].length).getValues();
}
function upsert_(name, keyIdx, key, row) {
  var s = sheet_(name), data = rows_(name);
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][keyIdx]) === String(key)) { s.getRange(i + 2, 1, 1, row.length).setValues([row]); return 'updated'; }
  }
  s.appendRow(row); return 'inserted';
}
function parseQuiz_(r) {
  var qs = []; try { qs = JSON.parse(r[6] || '[]'); } catch (e) {}
  return { id: r[0], kind: r[1], title: r[2], product: r[3], set: r[4], source: r[5], questions: qs, createdAt: r[7] };
}
function parseAct_(r) { return { slug: r[0], quizId: r[1], quizTitle: r[2], purpose: r[3], date: String(r[4]), message: r[5], createdAt: r[6], durationMinutes: Number(r[7] || 0), status: String(r[8] || 'active'), closedAt: r[9] || '', closedBy: r[10] || '' }; }

/* ---------------- GET API ---------------- */
function doGet(e) {
  try {
    ensureAllSheets_();
    var p = (e && e.parameter) || {}, action = p.action || 'bootstrap';
    if (action === 'health') return json_({ ok: true, app: 'Shanta Life Quiz Portal', sheets: ss_().getSheets().map(function(s){return s.getName();}), supervisors: list_('Supervisors').length, time: new Date().toISOString() });
    if (action === 'supervisors') return json_({ ok: true, supervisors: list_('Supervisors'), zones: list_('Zones') });
    if (action === 'take') {
      var acts = rows_('Activations').map(parseAct_), act = null;
      for (var i = 0; i < acts.length; i++) if (acts[i].slug === p.slug) act = acts[i];
      if (!act) return json_({ ok: false, error: 'Activation not found', slug: p.slug });
      if (act.status === 'closed') return json_({ ok: true, closed: true, activation: act, supervisors: list_('Supervisors'), zones: list_('Zones') });
      var quiz = null, qs = rows_('Quizzes').map(parseQuiz_);
      for (var j = 0; j < qs.length; j++) if (qs[j].id === act.quizId) quiz = qs[j];
      if (!quiz) return json_({ ok: false, error: 'Quiz not found for activation' });
      return json_({ ok: true, activation: act, quiz: quiz, supervisors: list_('Supervisors'), zones: list_('Zones') });
    }
    if (action === 'results') {
      return json_({ ok: true, results: rows_('Responses').map(function(r){ return { id: r[0], date: String(r[1]), purpose: r[2], quizTitle: r[3], kind: r[4], name: r[5], mobile: String(r[6]), code: String(r[7]), supervisor: r[8], zone: r[9], score: r[10], total: r[11], percent: r[12], submittedAt: r[14] }; }) });
    }
    // bootstrap (default)
    return json_({ ok: true,
      quizzes: rows_('Quizzes').map(parseQuiz_),
      activations: rows_('Activations').map(parseAct_),
      supervisors: list_('Supervisors'), zones: list_('Zones') });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

/* ---------------- POST API ---------------- */
function doPost(e) {
  // Editor থেকে সরাসরি Run করলে e থাকে না — error না দিয়ে guidance ফেরত দিই
  if (!e || !e.postData || !e.postData.contents) {
    return json_({ ok: false, error: 'doPost সরাসরি Run করার জন্য নয়। setupSheets Run করুন, অথবা Portal থেকে submit করুন।' });
  }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    ensureAllSheets_();
    var d = JSON.parse(e.postData.contents), action = d.action || 'submit', now = new Date().toISOString();
    if (action === 'saveQuiz' && d.quiz) {
      var q = d.quiz;
      upsert_('Quizzes', 0, q.id, [q.id, q.kind || 'quiz', q.title || '', q.product || '', q.set || '', q.source || '', JSON.stringify(q.questions || []), q.createdAt || now, now]);
      return json_({ ok: true, saved: q.id });
    }
    if (action === 'deleteQuiz') {
      var s = sheet_('Quizzes'), data = rows_('Quizzes');
      for (var i = data.length - 1; i >= 0; i--) if (String(data[i][0]) === String(d.id)) s.deleteRow(i + 2);
      return json_({ ok: true, deleted: d.id });
    }
    if (action === 'activate' && d.activation) {
      var a = d.activation;
      if (d.quiz) { var q2 = d.quiz; upsert_('Quizzes', 0, q2.id, [q2.id, q2.kind || 'quiz', q2.title || '', q2.product || '', q2.set || '', q2.source || '', JSON.stringify(q2.questions || []), q2.createdAt || now, now]); }
      upsert_('Activations', 0, a.slug, [a.slug, a.quizId, a.quizTitle || '', a.purpose || '', a.date || '', a.message || '', a.createdAt || now, Number(a.durationMinutes || 0), a.status || 'active', a.closedAt || '', a.closedBy || '']);
      return json_({ ok: true, slug: a.slug });
    }
    if (action === 'saveLists') {
      if (d.supervisors) setList_('Supervisors', d.supervisors);
      if (d.zones) setList_('Zones', d.zones);
      return json_({ ok: true, supervisors: list_('Supervisors'), zones: list_('Zones') });
    }
    if (action === 'closeActivation' || action === 'reopenActivation') {
      var acts2 = rows_('Activations');
      for (var k = 0; k < acts2.length; k++) {
        if (String(acts2[k][0]) === String(d.slug)) {
          var sh2 = sheet_('Activations'), isClose = action === 'closeActivation';
          sh2.getRange(k + 2, 9).setValue(isClose ? 'closed' : 'active');
          sh2.getRange(k + 2, 10).setValue(isClose ? now : '');
          sh2.getRange(k + 2, 11).setValue(isClose ? (d.by || 'Trainer') : '');
          return json_({ ok: true, slug: d.slug, status: isClose ? 'closed' : 'active' });
        }
      }
      return json_({ ok: false, error: 'Activation not found' });
    }
    // default: submit (পুরনো payload-ও support করি)
    sheet_('Responses').appendRow([d.id || ('res-' + Date.now()), d.date || '', d.purpose || '', d.quizTitle || '', d.kind || 'quiz',
      d.name || '', d.mobile || '', d.code || '', d.supervisor || '', d.zone || '',
      d.score || 0, d.total || 0, d.percent || 0, JSON.stringify(d.answers || {}), d.submittedAt || now, d.completionStatus || 'submitted']);
    return json_({ ok: true, submitted: d.id || true });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
  finally { try { lock.releaseLock(); } catch (e2) {} }
}
