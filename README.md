# Employee-Knowledge-Test-Quiz-Potral-
# 🌟 Shanta Life — Employee Knowledge Test Quiz & Survey Portal

Brand: Olive Green `#978C21` • Sunset Orange `#F37021` • Charcoal Grey `#3C3C3B` (Shanta_Life_Brand_Guidelines.pdf অনুযায়ী), Logo: Google Drive-এর `Shanta Life Logo.png` / White Logo (`assets/`-এ কপি করা)।

## যা যা আছে
- **Dashboard** — KPI, Active links, latest participants
- **Quiz Bank / Survey Bank (আলাদা Tab)** — list, Preview, Delete, **▶ Active** বাটন
- **Active Initiate** — Test Purpose + নির্দিষ্ট **Date** (শুধু ঐ তারিখেই লিংক কাজ করবে) + উৎসাহমূলক Message → Quiz-এর নামে **Sharable Link** (`#/take/<slug>`)
- **Create** — Manual builder, **Template** (Product Knowledge, Training Feedback, Compliance, Satisfaction), **CSV/JSON Upload** (product+set অনুযায়ী auto-group, প্রতি set আলাদা Quiz)
- **Participant Experience (Interactive)** — Employee Name, Mobile, Employee ID/Producer Code (ঐচ্ছিক), **Supervisor Dropdown**, Zone/Area → একে একে প্রশ্ন, Progress bar → Submit-এ স্কোর; **>85% হলে Confetti + Knowledge Champion বার্তা**; **"সঠিক উত্তর ও ব্যাখ্যা দেখুন"** বাটনে Answer Review (source citation সহ)
- **Admin Analytics** — Date/Month/Year, Purpose, Supervisor, Zone filter; supervisor-wise chart; **CSV Export**
- **Supervisors & Sheet Settings** — Supervisor/Zone তালিকা edit (dropdown-এর source)

## Google Sheet
- Score Sheet: `SLI_Employee Knowledge Test Score Sheet` (`1LYfXLj3XURSvg8pr2a_uZzVwGlz-dp_Sj2WtdcWzQM0`)
- Learning Hub DB: `1EYJwZDV99DPUcMWdC3LZP_7f1EyVJ2n-Yk_mb0k4Qnc`
- Live sync: `google-apps-script.gs` Sheet-এ Deploy করে Web App URL Settings-এ বসান। না বসালে ডেটা browser localStorage-এ থাকে + CSV Export করে Sheet-এ Import করা যায়। Sheet-এ `Supervisors` শিটে নাম রাখলে dropdown-এর source হিসেবে ব্যবহারের নির্দেশনা Apps Script-এ আছে।

## Sample Data
আপনার দেওয়া CSV থেকে seed তৈরি (`data/sample_questions.csv`, `data/seed.js`) — Endowment Set 1-এর আসল প্রশ্নসহ ৫টি product-এর নমুনা। পুরো ৩০০ প্রশ্নের CSV ফাইলটি **Create → CSV Upload**-এ দিলেই product/set-wise সব Quiz Bank-এ চলে আসবে।

## Run
```bash
python3 -m http.server 8000 --bind 0.0.0.0
# http://localhost:8000
```

## ☁️ v2 — Sheet-backed Database (Errorless)
- Backend: `google-apps-script.gs` v2 — sheets: `Quizzes | Activations | Supervisors | Zones | Responses` (auto-create)
- Editor-এ `doPost` নয়, **`setupSheets`** Run করুন (doPost এখন Run করলেও error দেবে না)।
- Participant link এখন Sheet থেকে quiz + supervisor list আনে — **যেকোনো device-এ কাজ করে**; শেয়ার-লিংকের সাথে API URL-ও encoded থাকে।
- স্থায়ী setup: deploy URL `config.js`-এর `appsScriptUrl`-এ বসিয়ে Vercel redeploy — ধাপে ধাপে নির্দেশনা: **docs/SETUP.md**
- Settings-এ **🔌 Test Connection**, **☁️ Sheet থেকে Sync**, **🔄 Sync All** ও pending-sync indicator আছে; submit fail হলে pending queue-তে থেকে পরে sync হয়।
