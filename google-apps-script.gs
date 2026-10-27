/**
 * Shanta Life Quiz Portal → Google Sheet Sync
 * Setup: আপনার Sheet (SLI_Employee Knowledge Test Score Sheet) খুলুন →
 * Extensions → Apps Script → এই কোড পেস্ট → Deploy → Web app (Execute as: Me, Access: Anyone)
 * পাওয়া URL টি Portal-এর Settings-এ বসান।
 * Sheets auto-create হবে: Responses, Supervisors
 */
function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = JSON.parse(e.postData.contents);
  let sh = ss.getSheetByName('Responses') || ss.insertSheet('Responses');
  if (sh.getLastRow() === 0) sh.appendRow(['Date','Purpose','Quiz/Survey','Name','Mobile','Employee ID','Supervisor','Zone','Score','Total','Percent','Submitted At']);
  sh.appendRow([data.date,data.purpose,data.quizTitle,data.name,data.mobile,data.code,data.supervisor,data.zone,data.score,data.total,data.percent,data.submittedAt]);
  return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
}
function doGet() { // Supervisor dropdown source
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Supervisors') || ss.insertSheet('Supervisors');
  const names = sh.getDataRange().getValues().flat().filter(String);
  return ContentService.createTextOutput(JSON.stringify({supervisors:names})).setMimeType(ContentService.MimeType.JSON);
}
