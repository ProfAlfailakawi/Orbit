# ORBIT | أوربت

غرفة عمليات عربية خاصة لمراقبة أسطول البرامج بأدلة قابلة للتتبع: كل برنامج قمرٌ صناعي في مدار واحد، وأي مشكلة لها تقرير جاهز للنسخ. أوربت يقرأ ويقترح فقط؛ لا يعدّل المستودعات المراقبة ولا يدمج ولا ينشر عنها.

- **الموقع الإنتاجي:** <https://orbitq8.web.app> (يتطلب مفتاح المشغّل، أو زر «تجربة بدون حساب» للوضع التجريبي المعزول)
- **إصدار الخادم الحالي:** <https://orbitq8.web.app/api/version>

[![ORBIT quality gate](https://github.com/ProfAlfailakawi/Orbit/actions/workflows/orbit-quality.yml/badge.svg)](.github/workflows/orbit-quality.yml)
[![ORBIT browser and visual smoke](https://github.com/ProfAlfailakawi/Orbit/actions/workflows/orbit-visual.yml/badge.svg)](.github/workflows/orbit-visual.yml)
[![Deploy ORBIT production](https://github.com/ProfAlfailakawi/Orbit/actions/workflows/deploy-production.yml/badge.svg)](.github/workflows/deploy-production.yml)
[![ORBIT daily browser visitor](https://github.com/ProfAlfailakawi/Orbit/actions/workflows/orbit-visitor.yml/badge.svg)](.github/workflows/orbit-visitor.yml)
[![ORBIT frequent site watch](https://github.com/ProfAlfailakawi/Orbit/actions/workflows/orbit-watch.yml/badge.svg)](.github/workflows/orbit-watch.yml)
[![ORBIT scheduled GitHub monitoring](https://github.com/ProfAlfailakawi/Orbit/actions/workflows/orbit-monitor.yml/badge.svg)](.github/workflows/orbit-monitor.yml)
[![ORBIT weekly report](https://github.com/ProfAlfailakawi/Orbit/actions/workflows/orbit-weekly.yml/badge.svg)](.github/workflows/orbit-weekly.yml)
[![ORBIT independent guardian](https://github.com/ProfAlfailakawi/Orbit/actions/workflows/orbit-guardian.yml/badge.svg)](.github/workflows/orbit-guardian.yml)

> لا يعني نجاح GitHub أو غياب الحوادث أن الموقع الإنتاجي سليم. «يعمل» في أوربت تعني أن GitHub مربوط وأن الموقع استجاب ولا يوجد فحص فاشل؛ رحلة المستخدم الكاملة لا تُختبر.

## خريطة الميزات / Feature map

الواجهة صفحة واحدة (`/`)؛ لذلك معظم الميزات تظهر داخلها وليس لها مسار مستقل. «تجريبي» = موجود في الكود لكنه غير مكتمل أو غير منشور أو يحتاج إعدادًا خارجيًا لم يُتحقق منه هنا.

| الميزة | ما تفعله | الرابط المباشر | الشيفرة | الحالة |
|---|---|---|---|---|
| لوحة المدار | كل برنامج قمر صناعي بشعاره حول كوكب أوربت؛ اضغط أي قمر لبطاقة التفاصيل. شريط ملخص (عدّاد الحالات) ومخطط حسب عرض النافذة | [/](https://orbitq8.web.app/) | [src/App.tsx](src/App.tsx)، [src/components/Dashboard.tsx](src/components/Dashboard.tsx)، [src/components/Mark.tsx](src/components/Mark.tsx)، [src/core/fleetStatus.ts](src/core/fleetStatus.ts) | يعمل |
| دخول المشغّل | مفتاح `ORBIT_OPERATOR_PASSKEY` على الخادم وجلسة HTTP-only (تُحفظ في Firestore في الإنتاج)، مع فحص Origin لكل طلب كتابة | [/](https://orbitq8.web.app/) | [server.ts](server.ts) (`/api/auth/verify`، `/api/auth/session`، `/api/auth/logout`)، [src/core/api.ts](src/core/api.ts) | يعمل |
| الوضع التجريبي المعزول | زر «تجربة بدون حساب» يفتح صندوقًا خاصًا لكل زائر ببيانات وهمية؛ طلبات الترويسة `x-orbit-demo` لا تصل أبدًا إلى المسارات الحقيقية، وزر التقرير الأسبوعي مخفي فيه | [/](https://orbitq8.web.app/)، [/api/demo/config](https://orbitq8.web.app/api/demo/config) | [src/server/demoSandbox.ts](src/server/demoSandbox.ts)، [src/core/demoTransport.ts](src/core/demoTransport.ts)، [scripts/verify-demo-entry.mjs](scripts/verify-demo-entry.mjs) | يعمل |
| تقرير «انسخ» | لكل مشكلة تقرير كامل (السبب المحتمل، آخر commit سبقها برابطه، ما فعله الزائر قبل الخطأ) يُلصق في كلود أو غيره؛ وزر أعلى الصفحة ينسخ كل المشاكل | — | [src/core/fleetStatus.ts](src/core/fleetStatus.ts)، [src/core/causes.ts](src/core/causes.ts) | يعمل |
| زر «اشرح» | الخطورة وماذا يحدث للزائر وأول خطوة؛ بـ Gemini إن ضُبط المفتاح وبقواعد ثابتة إن لم يُضبط | — | [server.ts](server.ts) (`/api/explain`)، [src/core/causes.ts](src/core/causes.ts) | يعمل |
| إضافة / إزالة برنامج | إضافة بالاسم والرابط فقط ثم الربط تلقائيًا، وإزالة ما أضفته (فكّ الربط) | — | [src/App.tsx](src/App.tsx)، [server.ts](server.ts) (`/api/fleet/add`، `/api/fleet/:id/lifecycle`) | يعمل |
| قراءة GitHub | المستودعات وعمليات Actions وآخر تعديل بصلاحية قراءة فقط، مع تتبع إعادة تسمية المستودعات؛ الفحص الكامل مرة كل 72 ساعة كحد أقصى (قفل Firestore)، وزر «تحديث» يدويًا | — | [src/core/repoReader.ts](src/core/repoReader.ts)، [src/core/ciStatus.ts](src/core/ciStatus.ts)، [src/core/repoRenames.ts](src/core/repoRenames.ts)، [server.ts](server.ts) (`/api/github/sync`) | يعمل |
| اكتشاف المواقع والزائر الخفيف | يكتشف رابط موقع كل برنامج (مع قائمة مواقع المالك المؤكدة) ويفحصه: الاستجابة، 5xx مع إعادة محاولة واحدة، شهادة HTTPS | — | [src/core/siteDiscovery.ts](src/core/siteDiscovery.ts)، [src/core/siteService.ts](src/core/siteService.ts)، [src/core/ownerSites.ts](src/core/ownerSites.ts)، [src/core/visitor.ts](src/core/visitor.ts)، [src/core/watch.ts](src/core/watch.ts)، [src/core/tlsExpiry.ts](src/core/tlsExpiry.ts) | يعمل |
| زائر بمتصفح حقيقي | Playwright على سطح المكتب وجوال وجوال باتصال ضعيف: أخطاء JS، صفحة فارغة، تجاوز العرض، صور مكسورة، نصوص منسية، RTL، أسماء الأزرار، رؤوس الأمان، مفاتيح مسرّبة، تغيّر الشكل عن الأمس، واختبار الحساس الذاتي (`ORBIT-SELFTEST`) | — | [scripts/browser-visitor.mjs](scripts/browser-visitor.mjs)، [src/core/browserVisit.ts](src/core/browserVisit.ts)، [src/core/pageAudit.ts](src/core/pageAudit.ts)، [.github/workflows/orbit-visitor.yml](.github/workflows/orbit-visitor.yml) | يعمل |
| زائر ذكي بـ Gemini | يلعب دور مستخدم كويتي فضولي؛ الكود (لا النموذج) يقرر المسموح: لا حذف ولا دفع ولا خروج ولا كلمات سر ولا مغادرة الموقع، والكتابة مغلقة افتراضيًا. ملاحظات النموذج تحذيرات فقط | — | [scripts/ai-visit.mjs](scripts/ai-visit.mjs)، [src/core/aiExplorer.ts](src/core/aiExplorer.ts) | اختياري (لا يعمل قبل ضبط `GEMINI_API_KEY`) |
| حساس المتصفح | سطر يُركّب في الموقع المراقَب بموافقتك؛ يرسل أخطاء مجهولة (بلا نص مكتوب ولا روابط بمعاملاتها). خطأ رآه زائر واحد «ملاحظة»، وزائران «مشكلة»؛ فشل طلب يحتاج 3 زوار خلال ساعة؛ البلاغ يزول بعد 6 ساعات | [/orbit-sensor.js](https://orbitq8.web.app/orbit-sensor.js) | [public/orbit-sensor.js](public/orbit-sensor.js)، [src/core/sensor.ts](src/core/sensor.ts)، [src/core/sensorChannel.ts](src/core/sensorChannel.ts)، [server.ts](server.ts) (`/api/public-sensor`، `/api/sensor/ingest`) | يعمل (يحتاج تركيبًا في كل موقع) |
| الإنذار المبكر ومقارنة ما بعد النشر | يتعلم سرعة كل موقع وحجم صفحته وينبّه عند التباطؤ المستمر، ويحذّر باسم الـ commit إن صار الموقع أبطأ بعده | — | [src/core/vitals.ts](src/core/vitals.ts) | يعمل |
| انتهاء النطاق وتوكن GitHub | RDAP للنطاق مع تحذير قبل 30 يومًا (نطاقات الاستضافة مثل `web.app` لا تُفحص، و`.kw` يبقى «غير معروف»)، وتنبيه قبل 14 يومًا من انتهاء توكن GitHub | — | [src/core/expiry.ts](src/core/expiry.ts)، [src/core/rdap.ts](src/core/rdap.ts)، [src/core/tokenWatch.ts](src/core/tokenWatch.ts) | يعمل |
| سجلات الخادم (Cloud Run) | يقرأ أخطاء `ERROR` لآخر يوم من البرامج المعرّفة في `ORBIT_LOG_SOURCES`؛ 3 تكرارات خلال نصف ساعة مشكلة، وخطأ نسخة لا تخدم الزوار تحذير فقط (يدعم أيضًا Cloud Functions الجيل الأول) | — | [src/core/cloudLogs.ts](src/core/cloudLogs.ts) | يعمل (يحتاج دور Logs Viewer) |
| تنبيهات الجوال | Web Push عند ظهور مشكلة جديدة، تنبيه واحد لكل خطأ وليس لكل زائر | — | [src/core/pushService.ts](src/core/pushService.ts)، [src/core/pushClient.ts](src/core/pushClient.ts)، [src/core/alerts.ts](src/core/alerts.ts)، [public/sw.js](public/sw.js) | يعمل |
| التقرير الأسبوعي | ملخص كل اثنين على الجوال (ما حدث، ما يتكرر، ما يقترب موعده)، وزر «تقرير الأسبوع» ينسخ نصه | — | [src/core/weeklyReport.ts](src/core/weeklyReport.ts)، [.github/workflows/orbit-weekly.yml](.github/workflows/orbit-weekly.yml) | يعمل |
| شعارات البرامج | شعار كل قمر يُجلب تلقائيًا من مستودع البرنامج نفسه | — | [src/core/logo.ts](src/core/logo.ts)، [src/core/logoService.ts](src/core/logoService.ts) | يعمل |
| مراقبة المراقِب | تنبيه أعلى الصفحة إن صمتت المراقبة أكثر من 26 ساعة، ونبضة اختيارية إلى `ORBIT_HEARTBEAT_URL`، وحارس خارجي مستقل اختياري | — | [src/core/fleetStatus.ts](src/core/fleetStatus.ts)، [scripts/guardian-probe.mjs](scripts/guardian-probe.mjs)، [.github/workflows/orbit-guardian.yml](.github/workflows/orbit-guardian.yml) | يعمل (الحارس لا يفعل شيئًا قبل ضبط أسراره) |
| صفحة «نُحدّث البرنامج» | بدل صفحة Google الإنجليزية أثناء النشر: صفحة بهوية أوربت تعود تلقائيًا عند رجوع الخادم | [/updating.html](https://orbitq8.web.app/updating.html) | [public/updating.html](public/updating.html)، [src/core/updatingNotice.ts](src/core/updatingNotice.ts) | يعمل |
| PWA والتصميم | قابل للتثبيت، RTL، فاتح وداكن حسب الجهاز، تخطيط حسب عرض النافذة (منها أوضاع iPhone Duo) | [/manifest.json](https://orbitq8.web.app/manifest.json) | [public/manifest.json](public/manifest.json)، [public/sw.js](public/sw.js)، [src/app.css](src/app.css) | يعمل |
| سياسة الخصوصية | صفحة مستقلة غير مربوطة من الواجهة (لمتطلبات المتجر) | [/privacy-policy.html](https://orbitq8.web.app/privacy-policy.html) | [public/privacy-policy.html](public/privacy-policy.html) | يعمل |
| تطبيق Apple (iOS / iPadOS / Mac) | غلاف Capacitor أصلي معزول يفتح `orbitq8.web.app` مع شريط عدم الاتصال والسحب للتحديث، وسكربت إصدار (preflight/build-sim/archive/upload) وبيانات المتجر | — | [apple/](apple/)، [apple/apple-release.sh](apple/apple-release.sh)، [apple/ios/App/App/MainViewController.swift](apple/ios/App/App/MainViewController.swift)، [apple-release/](apple-release/) | تجريبي (لم يُنشر في المتجر؛ يحتاج Xcode على Mac) |
| نقاط محاكاة قديمة | `canary/run`، `github/webhook-simulate`، `self-health/simulate-outage`، `twin/run`، `security/scan`، `ai/diagnose`، `stream` ما زالت مركّبة خلف الدخول لكن الواجهة الحالية لا تستخدمها؛ وحزمة [src/sdk/orbit-sensor.ts](src/sdk/orbit-sensor.ts) القديمة غير مستخدمة (الحساس الفعلي هو `public/orbit-sensor.js`) | — | [server.ts](server.ts) | قديم / محاكاة |

## البنية

- **الواجهة:** React 19 + Vite 8 + Tailwind 4، صفحة واحدة في [src/](src/) تُبنى إلى `dist/` وتُقدَّم من Firebase Hosting (الموقع `orbitq8`).
- **الخادم:** Express في ملف واحد [server.ts](server.ts) (helmet، حد 256kb للـ JSON) يُحزم بـ esbuild إلى `dist/server.mjs` ويعمل على Cloud Run (`orbit-api`، منطقة `me-central1`) عبر [Dockerfile](Dockerfile). [firebase.json](firebase.json) يحوّل `/api/**` و`/healthz` إلى Cloud Run.
- **التخزين:** Cloud Firestore في الإنتاج ([firestore.rules](firestore.rules))، وملفات JSON محلية (`.orbit-*.json`، متجاهلة في git) أثناء التطوير.
- **المنطق:** وحدات صغيرة قابلة للاختبار في [src/core/](src/core/)؛ وبوابة الوضع التجريبي في [src/server/](src/server/).

نقاط الخادم الرئيسية (كلها في [server.ts](server.ts)):

| المسار | الغرض | الحماية |
|---|---|---|
| `GET /healthz/` | فحص الحياة فقط (استخدم الشرطة المائلة الأخيرة؛ `/healthz` بدونها يعيد 404 على الإنتاج) | عام |
| `GET /api/version` | رقم الإصدار (commit) لتحديث الصفحات المفتوحة تلقائيًا | عام |
| `GET /api/demo/config`، `POST /api/demo/enter` | الوضع التجريبي | عام، بحدود معدل |
| `POST /api/public-sensor` | استقبال حساس المتصفح | عام، مقيّد بالمواقع المسجّلة |
| `POST /api/sensor/ingest` | أحداث حساسات مصادق عليها لكل برنامج | مفتاح لكل برنامج |
| `POST /api/auth/verify` · `GET /api/auth/session` · `POST /api/auth/logout` | الجلسة | — |
| `GET /api/state` · `POST /api/github/sync` · `POST /api/watch/run` · `POST /api/sites/refresh` · `GET/POST /api/logos…` · `POST /api/explain` · `POST /api/fleet/add` · `POST /api/fleet/:id/lifecycle` · `GET /api/weekly-report` · `/api/push/*` | عمل اللوحة | جلسة المشغّل |
| `POST /internal/scheduler/{github-sync,watch,visit-targets,visit-results,weekly-report}` | تشغيلات مجدولة | رمز هوية OIDC لحساب خدمة المجدول |

## التشغيل المحلي

```bash
cp .env.example .env
npm ci
npm run dev
```

يجب إعداد `ORBIT_OPERATOR_PASSKEY` بقيمة عشوائية لا تقل عن 16 محرفًا (انظر [.env.example](.env.example)). لا تضع مفاتيح الحساس أو GitHub أو Gemini في متغيرات Vite أو كود المتصفح.

| الأمر | ما يفعله |
|---|---|
| `npm run dev` | خادم التطوير (`tsx server.ts`) مع Vite middleware |
| `npm run build` | بناء الواجهة (`vite build`) وتحزيم الخادم إلى `dist/server.mjs` |
| `npm start` | تشغيل النسخة المبنية `node dist/server.mjs` |
| `npm run preview` | معاينة الواجهة المبنية بـ Vite |
| `npm run lint` | فحص الأنواع `tsc --noEmit` |
| `npm test` | اختبارات `node --test` (31 ملفًا) |
| `npm run check` | lint ثم test ثم build (نفسه ما يشغّله النشر) |
| `npm run clean` | حذف `dist` |

## الاختبارات وبوابات الجودة

- اختبارات الوحدات: [src/core/](src/core/) (ملفات `*.test.ts`) و[src/server/demoSandbox.test.ts](src/server/demoSandbox.test.ts). الاختبار [src/core/testRegistry.test.ts](src/core/testRegistry.test.ts) يفشل إن أُضيف ملف اختبار لم يُسجَّل في سكربت `npm test`.
- [.github/workflows/orbit-quality.yml](.github/workflows/orbit-quality.yml): على كل push وpull request إلى `main`: lint وtest وbuild وفحص صياغة `guardian-probe.mjs`.
- [.github/workflows/orbit-visual.yml](.github/workflows/orbit-visual.yml): على push وpull request إلى `main`: يشغّل الخادم بمفتاح عشوائي ثم [scripts/visual-smoke.mjs](scripts/visual-smoke.mjs) بمتصفح حقيقي.
- يدويًا على خادم يعمل:

```bash
ORBIT_OPERATOR_PASSKEY="<test-passkey>" PORT=3100 npm run dev
# في طرفية أخرى:
ORBIT_OPERATOR_PASSKEY="<test-passkey>" node scripts/visual-smoke.mjs
node scripts/verify-demo-entry.mjs http://127.0.0.1:3100
```

## النشر والجدولة

**النشر الإنتاجي يدوي فقط**: [.github/workflows/deploy-production.yml](.github/workflows/deploy-production.yml) (**Deploy ORBIT production**، `workflow_dispatch`). يشغّل `npm ci` و`npm run check`، ثم ينشر Cloud Run عبر Workload Identity Federation (بلا مفتاح حساب خدمة)، ثم Firebase Hosting، ويتحقق أن `/api/version` يطابق الـ commit؛ وعند الفشل يعيد الحركة إلى النسخة السابقة من Cloud Run أو Hosting. التفاصيل في [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) و[docs/PRODUCTION-DEPLOYMENT-AR.md](docs/PRODUCTION-DEPLOYMENT-AR.md).

الجدولة الفعلية حسب ملفات `cron` الحالية (لتوفير دقائق GitHub Actions؛ التعليقات داخل بعض الملفات ما زالت تقول «يوميًا»):

| الملف | التوقيت (بتوقيت الكويت) | ما يفعله |
|---|---|---|
| [orbit-watch.yml](.github/workflows/orbit-watch.yml) | شهريًا، يوم 1 الساعة 06:30 | فحص كل المواقع (`/internal/scheduler/watch`) |
| [orbit-visitor.yml](.github/workflows/orbit-visitor.yml) | أسبوعيًا، الأحد 07:00 | الزائر بمتصفح حقيقي والزائر الذكي |
| [orbit-monitor.yml](.github/workflows/orbit-monitor.yml) | شهريًا، يوم 1 الساعة 08:00 | قراءة GitHub (`/internal/scheduler/github-sync`) |
| [orbit-weekly.yml](.github/workflows/orbit-weekly.yml) | أسبوعيًا، الاثنين 08:00 | التقرير الأسبوعي على الجوال |
| [orbit-guardian.yml](.github/workflows/orbit-guardian.yml) | يوميًا 07:13 | حارس خارجي مستقل؛ يخرج بلا عمل إن لم تُضبط أسراره |

كلها تقبل التشغيل اليدوي أيضًا. زر «تحديث» في اللوحة يقرأ GitHub ويفحص المواقع فورًا، وفتح الصفحة يفحص المواقع ويعيد الربط إن كانت البيانات أقدم من 6 ساعات. يوجد سكربت لإعداد Cloud Scheduler بديلًا في [scripts/configure-scheduler.sh](scripts/configure-scheduler.sh)، لكن [docs/PRODUCTION-DEPLOYMENT-AR.md](docs/PRODUCTION-DEPLOYMENT-AR.md) يذكر أن وظائفه أُوقفت.

## الوثائق

- [الأمان والربط](security_spec.md)
- [تدرج تفعيل المراقبة](SECURITY-ROLL_OUT.md)
- [النشر والإعداد الخارجي](docs/DEPLOYMENT.md) · [دليل النشر بالعربية](docs/PRODUCTION-DEPLOYMENT-AR.md)
- [ORBIT ONE](docs/ORBIT-ONE.md)
- [قائمة إصدار تطبيق Apple](apple-release/checklists/release.md)

## تشغيل الزائر الذكي

1. أضف سر GitHub Actions باسم `GEMINI_API_KEY`.
2. أنشئ **حساب اختبار مخصصًا** في كل موقع يحتاج دخولًا (لا تستخدم حسابك الشخصي)، بصلاحيات محدودة وبلا بيانات حقيقية، ثم أضف السر `ORBIT_TEST_LOGINS` بهذا الشكل (المفتاح هو الاسم الرمزي للبرنامج في أوربت):
   `{"NAHJ":{"email":"orbit-test@example.com","password":"..."}}`
3. متغيرات اختيارية: `ORBIT_AI_EXPLORE=0` لإيقافه، `ORBIT_AI_MAX_CALLS` (الافتراضي 40 استدعاءً للتشغيلة كلها)، `ORBIT_AI_ALLOW_WRITES=1` للسماح بالحفظ والإرسال (على حساب اختبار فقط).

الدخول بزر «Google» غير مدعوم، لأن Google يمنع الأتمتة غالبًا.

## تركيب حساس المتصفح (اختياري، لكل موقع بموافقتك)

أضف هذا السطر قبل `</body>` في الموقع المراقَب. بدونه لا يرى أوربت ما يحدث للمستخدمين أثناء الاستخدام، بل ما يراه الزائر الآلي فقط:

```html
<script src="https://orbitq8.web.app/orbit-sensor.js" async></script>
```

يُبلَّغ عن خطأ برمجي من كود الموقع نفسه من أول زائر، وعن غيره عند زائرَين مختلفين. ذاكرة التجميع تُمسح مع إعادة تشغيل الخادم، فالنتائج تُحفظ على سجل البرنامج 6 ساعات.

## سجلات الخادم

عرّف البرامج في `ORBIT_LOG_SOURCES` (مثال: `ORDER=مشروعي/order-api;ADMIN=مشروعي/admin-api`)، ويحتاج حساب تشغيل أوربت دور «Logs Viewer» فقط. إن تعذرت القراءة يظهر تحذير بدل أن يُظن أن لا أخطاء. وإن مُنح الحساب أيضًا دور «Cloud Run Viewer» عرف أوربت أي نسخة تخدم الزوار؛ بدونه تُعامَل كل الأخطاء كأنها من نسخة حية.

## الوضع التجريبي المعزول (لمراجعي المتجر)

- التعطيل: `ORBIT_DEMO_ENABLED=0` (الافتراضي مفعّل). يختفي الزر ويُرفض الدخول.
- الحدود: 30 دقيقة لكل صندوق، 200 صندوق كحد أقصى، 20 دخولًا لكل 15 دقيقة لكل عنوان.
- أي مسار غير مدرج في قائمة السماح يُرفض بـ403: لا توكنات ولا GitHub ولا Cloud Run ولا Firestore ولا جلسة المشغّل.

## حدود صريحة

- الزائر الذكي لا يعمل قبل ضبط `GEMINI_API_KEY`، ولا يدخل المواقع التي تتطلب حسابًا قبل ضبط `ORBIT_TEST_LOGINS`. مفتاح Gemini وتوكنات الخدمات الأخرى لا تُفحص تواريخ انتهائها.
- أوربت يقرأ ويقترح فقط؛ لا يعدّل البرامج المراقبة ولا يدمج ولا ينشر عنها.
- لا تُركب الحساسات في البرامج المراقبة دون موافقة مستقلة.
- المراقبة المجدولة على GitHub Actions الآن شهرية/أسبوعية (انظر الجدول أعلاه)؛ الفحص الأحدث يأتي من فتح الصفحة أو زر «تحديث».

---

آخر تحديث للتوثيق: 2026-11-12
