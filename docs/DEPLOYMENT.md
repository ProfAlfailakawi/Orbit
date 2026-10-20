# النشر والإعداد الخارجي

لا يحتوي المستودع حاليًا على workflow نشر أو رابط إنتاج موثق؛ لذلك لا يجوز الادعاء أن ORBIT منشور.

## المتغيرات الإلزامية

- `ORBIT_OPERATOR_PASSKEY`: سر عشوائي لا يقل عن 16 محرفًا.
- `NODE_ENV=production` في بيئة الإنتاج.

## الربط الاختياري

- `GITHUB_READ_ONLY_TOKEN`: Fine-grained PAT للقراءة فقط.
- `ORBIT_SENSOR_CREDENTIALS`: JSON يربط كل رمز برنامج بمفتاح مستقل 32+ محرفًا.
- `ORBIT_WEBHOOK_SECRET`: سر 32+ محرفًا لمحاكي HMAC؛ لا توجد حاليًا قناة webhook إنتاجية عامة.
- `GEMINI_API_KEY`: تشخيص اختياري عند الطلب فقط.
- `ORBIT_TRUST_PROXY_HOPS`: عدد hops الموثوق بها، ولا يفعّل إلا بعد معرفة البنية الفعلية.

## ضوابط ما قبل النشر

1. `npm ci --no-audit --no-fund`.
2. `npm run check`.
3. تشغيل browser smoke ببيانات اعتماد مؤقتة.
4. التحقق من أن رمز GitHub قراءة فقط.
5. عدم تركيب أي حساس في البرامج الـ11 دون موافقة مستقلة.
6. اختبار login rate limiting وSecure cookie خلف الـingress الفعلي.
7. التحقق من قواعد Firestore وقيود Firebase API key والدومينات المسموحة.
8. التحقق من URL الإنتاج نفسه بعد النشر، لا من نجاح workflow فقط.

## ما يحتاج قرار المالك

- منصة الاستضافة والرابط الرسمي.
- قناة إدارة الأسرار.
- أي تركيب لـORBIT Sensor.
- تفعيل Gemini أو Push Notifications أو خدمة مدفوعة.
