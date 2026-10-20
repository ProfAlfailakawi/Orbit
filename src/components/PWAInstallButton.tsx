import React, { useEffect, useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return { isInstallable: Boolean(deferredPrompt), isInstalled, isIOS, install };
}

export const PWAInstallButton: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  if (isInstalled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isInstallable) {
            install();
          } else {
            setShowModal(true);
          }
        }}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 border ${
          isDark
            ? 'border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700'
            : 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
        }`}
        aria-label="تثبيت تطبيق ORBIT على الجهاز"
      >
        <Download className="w-3.5 h-3.5 text-sky-400" />
        <span className="hidden sm:inline">{isIOS ? 'تثبيت على آيفون' : 'تثبيت التطبيق (PWA)'}</span>
        <span className="sm:hidden">PWA</span>
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-modal-title"
        >
          <div
            className={`w-full max-w-md rounded-xl border p-6 ${
              isDark ? 'border-slate-800 bg-[#0F172A] text-slate-100' : 'border-slate-200 bg-white text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-sky-400" />
                <h3 id="pwa-modal-title" className="text-base font-semibold">
                  تثبيت ORBIT على الشاشة الرئيسية
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="إغلاق نافذة التثبيت"
                className="p-1 rounded-lg hover:bg-slate-800/40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm leading-relaxed opacity-90">
              <p>
                صُمم <strong>ORBIT | أوربت</strong> كتطبيق ويب تقدمي (PWA) يعمل باستقلالية على الكمبيوتر، الآيفون، والآيباد:
              </p>
              <ol className="list-decimal list-inside space-y-2 text-xs">
                <li>
                  على <strong>iPhone / iPad (Safari)</strong>: اضغط زر <strong>مشاركة (Share)</strong> في شريط المتصفح ثم اختر{' '}
                  <strong>الإضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
                </li>
                <li>
                  على <strong>Chrome / Edge (Desktop & Android)</strong>: اضغط أيقونة التثبيت في شريط العنوان لتشغيل ORBIT في نافذة غرفة عمليات مستقلة.
                </li>
              </ol>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-sky-500 text-slate-950 hover:bg-sky-400 transition-colors"
              >
                حسناً، فهمت
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineConnectivityBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-950/90 px-3.5 py-2 text-xs font-medium text-amber-200">
      <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
      <span>وضع عدم الاتصال (Offline) — يعرض ORBIT آخر لقطة مخزنة بأمان (Cached).</span>
    </div>
  );
};
