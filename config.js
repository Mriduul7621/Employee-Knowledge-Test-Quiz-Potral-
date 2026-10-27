// ============================================================
// Shanta Life Quiz Portal — GLOBAL CONFIG
// Apps Script deploy করার পর পাওয়া Web App URL টি এখানে বসান
// এবং Vercel-এ redeploy করুন। তাহলেই শেয়ার করা লিংক যেকোনো
// employee-এর mobile/browser-এ কাজ করবে (শুধু নিজের browser-এ নয়)।
// URL ফাঁকা থাকলে app Local Mode-এ চলবে (ডেটা শুধু এই browser-এ)।
// ============================================================
window.PORTAL_CONFIG = {
  appsScriptUrl: "", // <-- এখানে https://script.google.com/macros/s/.../exec বসান
  spreadsheetId: "1LYfXLj3XURSvg8pr2a_uZzVwGlz-dp_Sj2WtdcWzQM0",
  spreadsheetName: "SLI_Employee Knowledge Test Score Sheet",
  learningHubId: "1EYJwZDV99DPUcMWdC3LZP_7f1EyVJ2n-Yk_mb0k4Qnc"
};
