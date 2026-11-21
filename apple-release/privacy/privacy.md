# الخصوصية — أوربت

- **التتبع (ATT):** لا. لا SDK إعلانات أو تتبع في الغلاف الأصلي.
- **Privacy Manifest:** `apple/ios/App/App/PrivacyInfo.xcprivacy` — UserDefaults (CA92.1) لحفظ آخر صفحة. Capacitor يضمّن ملفاته الخاصة عبر SPM.
- **أذونات الجهاز:** لا شيء.
- **بيانات يجمعها الموقع المستضاف (المعلنة في App Store Connect):** Device ID (رمز الإشعارات، لتنبيهات التطبيق) و Other User Content (أسماء المواقع والمستودعات التي يضيفها المشغّل) و User ID (جلسة الدخول). كلها لوظائف التطبيق فقط، بلا تتبّع ولا إعلانات ولا تحليلات.
- **الحساب والحذف:** خاص بالمالك.
- **التشفير:** HTTPS فقط → `ITSAppUsesNonExemptEncryption = false`.
