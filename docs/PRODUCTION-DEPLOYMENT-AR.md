# حالة ORBIT وخطوات النشر

## الحالة الفعلية

- مشروع Firebase مستقل باسم `orbit-one-orbit-2026`، منفصل عن NAHJ. تم ربطه بحساب فوترة مستقل فارغ بناءً على موافقتك، مع حد إنفاق Cloud Run موثق أدناه.
- موقع Hosting الفعلي: `https://orbitq8.web.app`. تم التحقق من الصفحة وAPI الصحة والجلسة عبر HTTPS. اسم `orbit-one.web.app` غير متاح.
- تم تسجيل تطبيق الويب ORBIT وإنشاء قاعدة Firestore `(default)` في `me-central1` على المستوى القياسي مع `freeTier: true`. إعداد النشر يضع Cloud Run وCloud Scheduler في المنطقة نفسها لتقليل زمن الاتصال وتكاليف نقل البيانات.
- نُشرت قواعد Firestore الحالية على المشروع المستقل. القراءة والكتابة تتطلبان مستخدماً موثقاً، وبيانات مساحة العمل مقيدة بمالكها/المشرف.
- رُبط المشروع بحساب الفوترة الفارغ `My Billing Account 1` (`01FBE0-42DCB4-1AA803`) لتظل تكاليف ORBIT منفصلة. أُنشئ حد إنفاق شهري فعلي لخدمة Cloud Run وحده بقيمة **2 USD**، مع تنبيهات عند 50% و80% و100%. يوجد أيضاً تنبيه حساب عام عند 5 USD. حد Cloud Run يوقف استخدام هذه الخدمة عند بلوغ الحد التقديري؛ قد يبقى فرق محدود بسبب الطلبات الجارية وتأخر تقدير الكلفة، ولا يغطي الخدمات الأخرى.

- نُشرت الواجهة إلى Firebase Hosting وخدمة `orbit-api` إلى Cloud Run في `me-central1`، مع Firestore كحفظ دائم و`min-instances=0` و`max-instances=1`. تم التحقق من `/healthz/` على الرابط العام وCloud Run ومن عدم المصادقة قبل الدخول.
- أُنشئت وظيفة Cloud Scheduler باسم `orbit-github-sync`، باستدعاء يومي 08:00 بتوقيت الكويت. قفل Firestore يجعل فحص GitHub الفعلي مستحقاً كل 72 ساعة فقط، مع Retry مرتين وهوية OIDC مخصصة. نتيجة أول استدعاء مجدول تحتاج التحقق بعد أول تشغيل زمني.
- مستودعات GitHub العامة تعمل دون رمز، وتستهلك المزامنة الحالية نحو 4 طلبات API لكل مستودع؛ رمز `GITHUB_READ_ONLY_TOKEN` اختياري للمستودعات الخاصة لاحقاً.
- جلسات المشغل محفوظة في Firestore وتستمر بعد إعادة تشغيل الخدمة. Firebase Hosting يزيل الكوكيز عادةً عند تمرير الطلبات إلى Cloud Run؛ لذلك يعيد الخادم رمز جلسة عشوائياً محدوداً بثماني ساعات إلى واجهة المتصفح، وتحتفظ به في `sessionStorage` وتُرسله في ترويسة Authorization. الكوكي `HttpOnly` يبقى احتياطياً للوصول المباشر إلى Cloud Run. يلزم حماية الواجهة من XSS لأن رمز الجلسة في المتصفح.

## النشر والحالة التشغيلية

التطبيق يعمل الآن على البنية المطلوبة: Firebase Hosting يوجّه `/api/**` إلى Express على Cloud Run، والحالات المهمة في Firestore. المشروع على Blaze وحساب فوترة مربوط؛ الميزانية لا توقف جميع الخدمات.

الخيار الأنسب هنا فحص تلقائي كل 72 ساعة، مع زر المزامنة اليدوية الموجود في اللوحة للفحص الفوري عند الحاجة. Cloud Scheduler يستدعي الخدمة يومياً الساعة 08:00 بتوقيت الكويت، لكن الخادم لا ينفذ فحص GitHub إلا إذا مرّت 72 ساعة على آخر فحص ناجح؛ وهذا يتجنب مشكلة `*/3` التي تعيد العد عند بداية الشهر. إذا فشل الفحص، لا يُحدّث وقت النجاح وتُعاد المحاولة في موعد Scheduler التالي. هذا رصد دوري وليس مراقبة لحظية.

تفعيل الجدولة يتطلب Cloud Scheduler وCloud Run، وهما يحتاجان ربط Billing account/Blaze حتى لو ضُبط Cloud Run على `min-instances=0`. لدى Cloud Scheduler أول 3 وظائف مجانية على مستوى حساب الفوترة؛ وتُحاسب الوظائف الزائدة. حد الإنفاق الفعلي الحالي يخص Cloud Run فقط، بينما تنبيه 5 USD لبقية تكاليف الحساب تنبيه وليس إيقافاً آلياً. لذلك تظل رسوم خدمات أخرى أو تجاوز تأخر التقدير ممكنة.

## ما يفعله الكود وما يحتاج إعداد الحساب

الشيفرة المنشورة تجهز Cloud Run وFirestore وHosting وواجهة مزامنة GitHub اليدوية والمجدولة. الجلسات ومحاولات الدخول والقفل الموزع وحالة المراقبة تستمر في Firestore. وظيفة Scheduler تتحقق من هوية خدمة محددة وتنفذ فحصاً تلقائياً بعد 72 ساعة من آخر نجاح، ولا تسمح بتزامن المزامنة اليدوية والمجدولة.

## تهيئة النشر عند قبول استخدام رصيد التجربة

هذه الخطوات تُفعّل خدمات Google وقد تترتب عليها رسوم بعد تجاوز الحصص/الرصيد، أو بعد انتهاء التجربة. **لا تنفذها إن كان شرطك عدم ربط حساب فوترة مطلقاً.** الرصيد التجريبي ليس حد إنفاق، وتنبيه الميزانية لا يوقف الموارد تلقائياً.

1. من Google Cloud Console، افتح المشروع `orbit-one-orbit-2026` وحدد أهلية Free Trial. لا تربط Billing إلا إذا قبلت شروط التجربة واحتمال الفوترة بعد انتهائها. أنشئ Budget منخفضاً وتنبيهات عند 50% و90% و100% من صفحة **Billing → Budgets & alerts**.
2. بعد ربط الفوترة، فعّل APIs المطلوبة:

   ```bash
   PROJECT_ID=orbit-one-orbit-2026
   gcloud services enable --project "$PROJECT_ID" \
     run.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com \
     iamcredentials.googleapis.com sts.googleapis.com cloudbuild.googleapis.com \
     artifactregistry.googleapis.com firestore.googleapis.com firebasehosting.googleapis.com
   ```

3. أنشئ حسابي خدمة منفصلين في المنطقة `me-central1`: واحد لتشغيل Cloud Run ويحتاج `roles/datastore.user` و`roles/secretmanager.secretAccessor`، وآخر لـCloud Scheduler ويحتاج `roles/run.invoker` على خدمة `orbit-api` فقط. لا تستخدم حساب المستخدم الشخصي كهوية تشغيل.
4. أنشئ في Secret Manager السر `ORBIT_OPERATOR_PASSKEY` (طول 16 حرفاً أو أكثر). بما أن المستودعات الحالية عامة، لا يلزم GitHub token للتشغيل الأولي؛ يستخدم ORBIT GitHub API العام. عند إضافة مستودعات خاصة، أنشئ `GITHUB_READ_ONLY_TOKEN` كـfine-grained token بصلاحية **Contents: Read-only** و**Actions: Read-only** للمستودعات المختارة. Workflow النشر يضيفه تلقائياً إلى Cloud Run عند وجود السر. لا تضع الأسرار في متغيرات Vite أو GitHub logs.
5. أنشئ GitHub Workload Identity Pool/Provider لمصدر `https://token.actions.githubusercontent.com`، واقصر شرطه على `ProfAlfailakawi/Orbit` وعلى فرع `main`. اربط principalSet بحساب النشر، مع أقل الأدوار اللازمة: Cloud Run Admin، Firebase Hosting Admin، Secret Accessor، Service Account User لحساب تشغيل Cloud Run، وصلاحية البناء. أضف `GCP_WIF_PROVIDER` و`GCP_DEPLOY_SERVICE_ACCOUNT` كـGitHub Actions secrets، وأضف `GCP_PROJECT_ID` و`FIREBASE_DATABASE_ID=(default)` و`ORBIT_RUNTIME_SERVICE_ACCOUNT` و`ORBIT_SCHEDULER_SERVICE_ACCOUNT` كـActions variables.
   أضف كذلك `VITE_FIREBASE_API_KEY` كـActions variable عام للبناء فقط. مفتاح Firebase للويب مُعرّف مشروع عام يظهر في ملفات المتصفح؛ قيّده في Google Cloud بمراجع `orbitq8.web.app` وFirebase APIs اللازمة. لا تستخدمه كمصادقة أو كبديل لقواعد Firestore، ولا تضع أسرار الخادم في متغيرات `VITE_*`.
6. شغّل Workflow **Deploy ORBIT production** يدوياً من GitHub Actions. يفحص الخادم وHosting ويعيد Cloud Run إلى النسخة السابقة عند فشل الفحص؛ ونشر Hosting يتم بعد نشر backend والتحقق من `/healthz`.
7. بعد ظهور عنوان Cloud Run ونجاح نشر Hosting، أنشئ Scheduler عبر الأمر التالي. سيعمل استدعاء يومي رخيص، لكن الخادم لن يطلب GitHub إلا كل 72 ساعة من آخر نجاح:

   ```bash
   PROJECT_ID=orbit-one-orbit-2026 \
   REGION=me-central1 \
   SERVICE_ACCOUNT='orbit-scheduler@orbit-one-orbit-2026.iam.gserviceaccount.com' \
   SERVICE_URL='ضع-عنوان-Cloud-Run-هنا' \
   bash scripts/configure-scheduler.sh
   ```

8. اختبر `/healthz` و`/api/auth/session` بعد النشر، ثم سجّل الدخول وراقب سجل Scheduler ووقت آخر نجاح. ابدأ بإضافة المستودعات التي تريد مراقبتها وتحقق من كل واحد يدوياً. يقتصر التكامل على القراءة من GitHub.

إذا كان المطلوب **صفر فوترة وربط حساب Billing**، يبقى النشر الآمن الكامل غير ممكن على بنية Firebase Hosting → Cloud Run المطلوبة. حد Cloud Run البالغ 2 USD يقلل خطر ارتفاع تكلفته ويوقف الخدمة عند بلوغه، لكنه ليس سقفاً إجمالياً على جميع خدمات المشروع. يمكن حجز اسم Hosting مجاناً، لكن نشر ملفات الواجهة وحدها سيعطي موقعاً معطلاً لأن تسجيل الدخول وواجهات API موجودة في Express.

## أوامر التحقق الحالية

```bash
npm ci
npm run check
firebase projects:list
firebase hosting:sites:list --project orbit-one-orbit-2026
gcloud firestore databases describe --project orbit-one-orbit-2026 --database='(default)'
```

عنوان Hosting الأقصر المحجوز: `https://orbitq8.web.app`. لا تفتح نشر الواجهة منفردة قبل توفير API متوافق. لا ترسل `GITHUB_READ_ONLY_TOKEN` إلى Vite أو المتصفح.

## ملاحظات التكلفة والتراجع

ملفات `firebase.json` و`Dockerfile` وworkflow النشر اليدوي تجهز المسار الأصلي. يعمل Scheduler يومياً (`0 8 * * *` بتوقيت `Asia/Kuwait`) بينما يضمن الخادم ألا يحدث فحص GitHub التلقائي إلا كل 72 ساعة من آخر نجاح. نشر المسار يتطلب ربط Billing account بخطة Blaze أولاً. لا يُنشئ workflow خدمات Google أو الأسرار تلقائياً، وهو يدوي فقط. فشل فحص Cloud Run يعيد المرور إلى الـrevision السابق، وفشل فحص Hosting يستعيد آخر نسخة منشورة من Hosting API إذا كانت هناك نسخة سابقة.

قد تكون خدمات Firebase المجانية ضمن حدودها بلا تكلفة، لكن هذا لا يجعل Cloud Run وCloud Scheduler وSecret Manager مجانية بلا شرط. التنبيه المالي ليس حد إنفاق ولا يوقف الخدمة تلقائياً.
