# ORBIT — حالة الإنتاج والنشر

## الحالة الحالية

- المشروع المستقل: `orbit-one-orbit-2026`، منفصل عن NAHJ.
- رابط التطبيق المنشور: [https://orbitq8.web.app](https://orbitq8.web.app). اسم `orbit-one.web.app` غير متاح.
- Firebase Hosting يقدّم واجهة React/Vite ويوجّه `/api/**` إلى خدمة Express على Cloud Run: `orbit-api` في `me-central1`.
- Cloud Run يعمل بـ`min-instances=0` و`max-instances=1`. الحالة الدائمة والجلسات وقفل المزامنة وبيانات المستودعات محفوظة في Firestore.
- تم التحقق من HTTPS، وواجهة الصحة، والدخول والخروج، واستمرار الجلسة، وإضافة مستودع ORBIT ومزامنته فعلياً مع GitHub. ظهرت الحالة `Live` وآخر Commit وحالة Actions من GitHub API.
- قراءة المستودعات العامة تعمل بلا رمز. يمكن إضافة `GITHUB_READ_ONLY_TOKEN` لاحقاً للمستودعات الخاصة بصلاحيات قراءة Contents وActions فقط.
- لا ينفذ ORBIT أي Push أو Merge أو تعديل للمستودعات المراقبة.

## المراقبة المجدولة

يعمل الملف `.github/workflows/orbit-monitor.yml` تلقائياً يومياً الساعة 08:00 بتوقيت الكويت باستخدام GitHub Actions القياسي لمستودع ORBIT العام. التشغيل لا يعتمد على فتح لوحة التحكم. يطلب Workflow رمز هوية قصير الأجل عبر Workload Identity Federation، ثم يستدعي endpoint داخلياً بهوية حساب خدمة المجدول. يرفض الخادم أي هوية غير مطابقة.

يحتفظ الخادم بقفل Firestore وشرط 72 ساعة بين الفحوص الناجحة؛ لذلك يُنفذ فحص GitHub الفعلي كل ثلاثة أيام تقريباً، ويُتخطى التشغيل اليومي عندما لا يحين موعده. إذا تعذر الفحص لا يسجل نجاحاً، ويُعاد الطلب في اليوم التالي. توجد أيضاً مزامنة يدوية من زر اللوحة. GitHub يذكر أن أحداث الجدولة قد تتأخر أحياناً عند ضغط الخدمة؛ لذلك هذا رصد دوري وليس مراقبة لحظية.

أُنشئت وظيفتا Cloud Scheduler أثناء اختبار الإعداد، لكنهما أُوقفتا بعد أن لم تنتجا أي محاولة تنفيذ أو سجل وصول إلى Cloud Run. لا نعتمد عليهما في المراقبة الفعلية. استخدم مسار GitHub Actions المجدول أعلاه، وهو مجاني للمستودعات العامة مع Standard GitHub-hosted runners.

## تسجيل الدخول والجلسة

- مفتاح `ORBIT_OPERATOR_PASSKEY` مخزن في Secret Manager ولا يصل إلى المتصفح.
- الجلسة عشوائية، صالحة 8 ساعات، ويُحفظ digest الرمز وموعد الانتهاء في Firestore حتى تبقى صالحة بعد إعادة تشغيل Cloud Run.
- Firebase Hosting يزيل الكوكيز عادة عند تمرير الطلبات إلى Cloud Run. لذلك تعيد استجابة الدخول رمز الجلسة إلى الواجهة، تحفظه في `sessionStorage`، وترسله في ترويسة `Authorization`. يبقى الكوكي الآمن `HttpOnly` متاحاً للاتصال المباشر بـCloud Run. الطلبات المعدلة تتحقق من Origin.
- لأن رمز جلسة Hosting موجود في `sessionStorage`، ينبغي حماية الواجهة من XSS وعدم إدخال HTML غير موثوق.

## التكلفة والحدود

- مشروع Google Cloud مربوط بحساب فوترة منفصل `My Billing Account 1` (`01FBE0-42DCB4-1AA803`) بموافقتك.
- يوجد حد إنفاق فعلي شهري لخدمة Cloud Run بقيمة **2 USD**، وتنبيهات عند 50% و80% و100%. يوجد كذلك تنبيه حساب عام عند **5 USD**، لكنه تنبيه وليس سقفاً.
- سقف Cloud Run لا يوقف Firestore أو Secret Manager أو Firebase أو الخدمات الأخرى، وقد يحدث تأخر في تقدير الإنفاق أو كلفة لطلبات بدأت قبل تطبيق السقف. لا أضمن أن المشروع مجاني بالكامل.
- GitHub Actions القياسي للمستودعات العامة مجاني وفق [توثيق GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job)، ويمكن تأخير الأحداث المجدولة عند ضغط GitHub وفق [دليل الاستكشاف](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows).
- Cloud Run وCloud Scheduler يتطلبان تفعيل Billing/Blaze حتى لو لم تُستخدم موارد مدفوعة؛ Cloud Scheduler غير مستخدم الآن والوظائف القديمة موقوفة.

## إعداد GitHub Actions وWIF

الإعداد الحالي يتطلب هذه القيم في إعدادات مستودع `ProfAlfailakawi/Orbit`:

- Secrets: `GCP_WIF_PROVIDER` و`GCP_DEPLOY_SERVICE_ACCOUNT`.
- Variables: `GCP_PROJECT_ID` و`ORBIT_SCHEDULER_SERVICE_ACCOUNT` و`ORBIT_RUNTIME_SERVICE_ACCOUNT` و`FIREBASE_DATABASE_ID` و`VITE_FIREBASE_API_KEY`.

مزود WIF يسمح بفرع `main` للمستودع نفسه فقط. حساب النشر يستطيع إصدار رمز قصير الأجل لهوية خدمة المراقبة، وحساب خدمة المراقبة يملك `roles/run.invoker` على خدمة `orbit-api`. لا تستخدم مفاتيح JSON طويلة العمر.

عند الانتقال إلى مستودعات خاصة، أضف سر `GITHUB_READ_ONLY_TOKEN` في Secret Manager بصلاحيات Contents: Read-only وActions: Read-only للمستودعات المعنية فقط، ثم أعد تشغيل Workflow النشر. لا تضعه في `VITE_*` أو مخرجات Workflow.

## النشر والتراجع

Workflow **Deploy ORBIT production** يفحص `npm ci` و`npm run check` أولاً، ثم ينشر Cloud Run وبعد نجاح فحص `/healthz/` ينشر Firebase Hosting. المصادقة إلى Google تتم عبر WIF. عند فشل Backend يعيد المرور إلى آخر revision معروف، وعند فشل فحص Hosting يحاول استعادة آخر release.

لإعادة النشر: افتح GitHub Actions، اختر **Deploy ORBIT production**، ثم **Run workflow** على `main`. لا يملك Workflow صلاحية كتابة في المستودعات المراقبة.

## الأوامر المحلية

```bash
npm ci
npm run check
bash -n scripts/configure-scheduler.sh
```

إعداد Firebase وCloud Run الحالي موجود في `firebase.json` و`Dockerfile` و`.github/workflows/deploy-production.yml`. لا تستخدم `scripts/configure-scheduler.sh` ما دام المجدول المعتمد هو GitHub Actions.
