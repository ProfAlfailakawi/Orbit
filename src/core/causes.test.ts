import test from 'node:test';
import assert from 'node:assert/strict';
import { explainProblem, explainProgram, probableCause } from './causes.ts';

test('the worst symptom decides the urgency', () => {
  assert.equal(explainProblem('الموقع لا يستجيب').urgency, 'عاجلة');
  assert.equal(explainProblem('[جوال] الصفحة أعرض من شاشة الجوال').urgency, 'مهمة');
  assert.equal(explainProblem('لغة الصفحة (lang) غير محددة').urgency, 'يمكن تأجيلها');
  assert.equal(explainProgram(['لغة الصفحة (lang) غير محددة', 'ملف التطبيق a.js لا يُحمَّل (HTTP 404)'])?.urgency, 'عاجلة');
  assert.equal(explainProgram([]), null);
});

test('a leaked key and an expiring certificate are urgent', () => {
  assert.equal(explainProblem('مفتاح GitHub شخصي ظاهر داخل الملف main.js المُرسل للزوّار').urgency, 'عاجلة');
  assert.equal(explainProblem('شهادة الأمان (HTTPS) للموقع تنتهي بعد يومين').urgency, 'عاجلة');
});

test('several missing files are one cause: an incomplete deploy', () => {
  assert.match(probableCause(['ملف التطبيق a.js لا يُحمَّل (HTTP 404)', 'ملف التطبيق b.css يعيد صفحة بدل الملف (النشر ناقص)']) || '', /نشر ناقص/);
  assert.equal(probableCause(['ملف التطبيق a.js لا يُحمَّل (HTTP 404)']), null);
});

test('page errors next to failing requests point at the backend', () => {
  assert.match(probableCause(['خطأ برمجي ظهر لزوّار الموقع: x', 'طلب من الموقع يفشل عند الزوّار: HTTP 500 /api']) || '', /الواجهة الخلفية/);
  assert.match(probableCause(['الموقع لا يستجيب', 'خطأ برمجي ظهر لزوّار الموقع: x']) || '', /متوقف/);
});
