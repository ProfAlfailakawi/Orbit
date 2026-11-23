/** الكاشف الوحيد لغلاف Capacitor (WKWebView) في أوربت، وتعليمات التنبيهات بحسب البيئة. */
type CapacitorLike = { isNativePlatform?: () => boolean; getPlatform?: () => string };

const capacitor = (): CapacitorLike | undefined => {
  try { return (globalThis as unknown as { Capacitor?: CapacitorLike }).Capacitor; } catch { return undefined; }
};

/** داخل تطبيق iOS الأصلي. */
export const isNativeShell = (): boolean => {
  try { return !!capacitor()?.isNativePlatform?.(); } catch { return false; }
};

export const isNativeIOS = (): boolean => {
  try { return isNativeShell() && capacitor()?.getPlatform?.() === 'ios'; } catch { return false; }
};

export const PUSH_BLOCKED_NATIVE = 'التنبيهات محجوبة. فعّلها من «الإعدادات ‹ الإشعارات ‹ Orbit».';
export const PUSH_BLOCKED_WEB = 'التنبيهات محجوبة. فعّلها من إعدادات المتصفح لهذا الموقع.';
export const PUSH_IOS_INSTALL_WEB = 'لتفعيل التنبيهات على الآيفون: من Safari اضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية»، وافتح أوربت من هناك.';

export const pushBlockedMessage = (native = isNativeShell()): string => (native ? PUSH_BLOCKED_NATIVE : PUSH_BLOCKED_WEB);
/** داخل التطبيق لا توجد حالة «ios-install» أصلاً؛ نص احتياطي بلا ذكر للمتصفح. */
export const pushInstallMessage = (native = isNativeShell()): string => (native ? 'حدّث التطبيق لتفعيل التنبيهات.' : PUSH_IOS_INSTALL_WEB);
