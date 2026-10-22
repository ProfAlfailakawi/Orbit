/** From a list of symptoms to one probable cause, and a plain-Arabic explanation of how serious a problem is. Deterministic. */

export interface Explanation { urgency: 'عاجلة' | 'مهمة' | 'يمكن تأجيلها'; meaning: string; action: string }

const RULES: Array<{ test: RegExp; urgency: Explanation['urgency']; meaning: string; action: string }> = [
  { test: /لا يستجيب|تعذر فتح الموقع|HTTP 5\d\d|خطأ في الخادم/, urgency: 'عاجلة', meaning: 'الزائر لا يستطيع فتح الموقع أصلًا.', action: 'افحص حالة الاستضافة والنشر الآن.' },
  { test: /اسم النطاق.*(انتهى|ينتهي بعد (يوم|يومين|3|4|5|6|7 ))/, urgency: 'عاجلة', meaning: 'الموقع سيختفي للجميع عند انتهاء اسم النطاق.', action: 'جدّد النطاق لدى المسجّل اليوم.' },
  { test: /شهادة الأمان.*(انتهت|غير موثوقة|تنتهي بعد (يوم|يومين|3))/, urgency: 'عاجلة', meaning: 'المتصفح يحذّر الزائر من الموقع أو سيفعل قريبًا.', action: 'جدّد شهادة HTTPS أو تحقق من التجديد التلقائي.' },
  { test: /مفتاح .*ظاهر داخل الملف|private key/i, urgency: 'عاجلة', meaning: 'سرّ منشور للعموم يمكن لأي شخص استخدامه.', action: 'أزل المفتاح من الكود وأبطله وأنشئ بديلًا فورًا.' },
  { test: /ملف التطبيق|يعيد صفحة بدل الملف|فشل تحميل|لا يُحمَّل/, urgency: 'عاجلة', meaning: 'النشر ناقص: الصفحة تفتح لكن ملفات البرنامج لا تصل، فيظهر فارغًا أو معطلًا.', action: 'أعد النشر كاملًا وتأكد أن مجلد البناء كله مرفوع.' },
  { test: /فارغة|تظهر فارغة/, urgency: 'عاجلة', meaning: 'الزائر يرى شاشة بيضاء.', action: 'افحص خطأ JavaScript الأول في وحدة تحكم المتصفح.' },
  { test: /خطأ برمجي|خطأ في الصفحة|عملية داخل الموقع فشلت|أخطاء في المتصفح|رسالة خطأ يطلقها/, urgency: 'مهمة', meaning: 'زائرون يصطدمون بخطأ برمجي أثناء الاستخدام.', action: 'افتح المسار المذكور وأعد الخطوات التي سبقت الخطأ.' },
  { test: /طلب من الموقع يفشل|HTTP 404|HTTP 5/, urgency: 'مهمة', meaning: 'جزء من الموقع يطلب بيانات لا تصل.', action: 'افحص الواجهة الخلفية أو الرابط المذكور.' },
  { test: /الجوال|أعرض من شاشة/, urgency: 'مهمة', meaning: 'المستخدمون على الجوال، وهم الأغلبية، يرون تجربة أسوأ.', action: 'اختبر الصفحة بعرض 390 بكسل وأصلح التجاوز.' },
  { test: /يتباطأ|بطيئة|ثانية للتحميل/, urgency: 'مهمة', meaning: 'الموقع أبطأ من المعتاد وقد يتعطل إن استمر.', action: 'راجع آخر نشر، وحجم الملفات، واستهلاك الخادم.' },
  { test: /نص مؤقت|undefined|NaN|object Object|صور لا تُحمَّل/, urgency: 'مهمة', meaning: 'الزائر يرى محتوى غير مكتمل يضعف الثقة بالموقع.', action: 'استبدل النص أو الصورة أو أصلح مصدر البيانات.' },
  { test: /اختبارات GitHub|لم ينجح|عملية فاشلة/, urgency: 'مهمة', meaning: 'آخر تعديل لم يمرّ باختباراته أو لم يُنشر.', action: 'افتح سجل العملية في GitHub Actions.' },
];

export function explainProblem(text: string): Explanation {
  const rule = RULES.find(r => r.test.test(text));
  return rule
    ? { urgency: rule.urgency, meaning: rule.meaning, action: rule.action }
    : { urgency: 'يمكن تأجيلها', meaning: 'ملاحظة تحسينية لا تمنع الزائر من الاستخدام.', action: 'أصلحها ضمن أقرب تعديل مناسب.' };
}

const URGENCY_RANK = { 'عاجلة': 0, 'مهمة': 1, 'يمكن تأجيلها': 2 } as const;

/** One deterministic explanation for a program: the worst symptom decides the urgency. */
export function explainProgram(problems: string[]): Explanation | null {
  if (!problems.length) return null;
  return problems.map(explainProblem).sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency])[0];
}

/** When several symptoms share one explanation, say so once instead of leaving the owner to connect them. */
export function probableCause(problems: string[]): string | null {
  const files = problems.filter(p => /ملف التطبيق|يعيد صفحة بدل الملف|فشل تحميل|لا يُحمَّل|صور لا تُحمَّل/.test(p)).length;
  if (files >= 2) return 'نشر ناقص: عدة ملفات لا تصل للزائر، والأرجح أن البناء لم يُرفع كاملًا أو أن مسارات الملفات تغيّرت';
  const errors = problems.filter(p => /خطأ برمجي|خطأ في الصفحة|أخطاء في المتصفح|عملية داخل الموقع فشلت/.test(p)).length;
  const requests = problems.filter(p => /طلب من الموقع يفشل|HTTP 5\d\d/.test(p)).length;
  if (errors >= 1 && requests >= 1) return 'الواجهة الخلفية أو الـ API تعيد أخطاء، والأخطاء البرمجية في الصفحة على الأرجح نتيجة لذلك';
  if (problems.some(p => /لا يستجيب|تعذر فتح الموقع/.test(p)) && problems.length > 1) return 'الموقع نفسه متوقف، وبقية الأعراض ناتجة عنه على الأرجح';
  return null;
}
