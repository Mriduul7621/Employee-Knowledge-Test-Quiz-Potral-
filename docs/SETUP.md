# 🚀 Setup — Errorless Google Sheet Database (একবারই করতে হবে)

## ধাপ ১: Apps Script আপডেট
1. Sheet খুলুন: **SLI_Employee Knowledge Test Score Sheet**
2. **Extensions → Apps Script** → পুরনো কোড মুছে repo-র `google-apps-script.gs`-এর পুরো কোড পেস্ট → **Save**
3. ⚠️ `doPost` Run করবেন না। উপরের dropdown থেকে **`setupSheets`** সিলেক্ট করে **▶ Run** করুন → Authorization Allow করুন।
   - এতে ৫টি sheet তৈরি/যাচাই হবে: `Quizzes`, `Activations`, `Supervisors`, `Zones`, `Responses`
   - Execution log-এ `✅ setupSheets সম্পন্ন` দেখলেই ঠিক আছে।

## ধাপ ২: Deploy (নতুন version)
1. **Deploy → New deployment → Web app**
2. *Execute as:* **Me** | *Who has access:* **Anyone** → **Deploy**
3. `https://script.google.com/macros/s/.../exec` URL কপি করুন।
> কোড আবার বদলালে: Deploy → Manage deployments → Edit → **New version** → Deploy (নাহলে পুরনো কোড চলবে)।

## ধাপ ৩: URL Portal-এ বসান (সবচেয়ে জরুরি)
দুটি জায়গায় করা যায় — **দুটোই করুন**:
- **(A) স্থায়ী (সব employee-এর জন্য বাধ্যতামূলক):** repo-র `config.js`-এ
  ```js
  appsScriptUrl: "https://script.google.com/macros/s/.../exec"
  ```
  বসিয়ে GitHub-এ push → Vercel redeploy।
- **(B) তাৎক্ষণিক test:** Portal → ⚙️ Supervisors & Sheet → URL বসিয়ে **Save URL** → **🔌 Test Connection** → `✅ Connected!` দেখা উচিত।

## ধাপ ৪: Supervisor যোগ
- **Sheet পদ্ধতি (সেরা):** `Supervisors` শিটে A1-এ `Name` রেখে **A2 থেকে** এক লাইনে একজন করে নাম লিখুন। `Zones` শিটেও একইভাবে zone লিখুন।
- অথবা Portal Settings থেকেই যোগ করুন (Sheet-এ auto-sync হবে)।
- Employee ফর্মের dropdown এখন Sheet থেকেই আসে — যেকোনো device-এ।

## ধাপ ৫: Quiz Active করে শেয়ার
Quiz Bank → **▶ Active** → Purpose + Date → Active হলে `☁️ Google Sheet-এ synced` badge দেখলেই লিংক সব device-এ কাজ করবে।
(`💾 Local mode` badge দেখালে বুঝবেন Sheet sync হয়নি — config.js-এ URL নেই/ভুল।)

## সমস্যা হলে চেকলিস্ট
| লক্ষণ | কারণ/সমাধান |
|---|---|
| `doPost ... postData` error | doPost Run করেছেন — সমস্যা নয়, `setupSheets` Run করুন |
| Test Connection fail | URL `/exec` কিনা, Access **Anyone**, New version deploy হয়েছে কিনা |
| Dropdown-এ নাম নেই | Supervisors শিটে A2 থেকে নাম আছে কিনা; Settings → **☁️ Sheet থেকে Sync** |
| Employee লিংকে "পাওয়া যায়নি" | config.js-এ URL বসিয়ে redeploy হয়নি, অথবা activation synced হয়নি — নতুন করে Active করে নতুন লিংক পাঠান |
| Score Sheet-এ যাচ্ছে না | Employee device config.js-এর URL ব্যবহার করে; submit-এর পর result পেজে `☁️ সংরক্ষিত হয়েছে` দেখেছেন কিনা |
