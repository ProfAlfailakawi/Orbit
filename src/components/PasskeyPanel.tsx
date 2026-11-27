import React, { useEffect, useRef, useState } from 'react';
import { fetchPasskeys, forgetPasskeyDevice, passkeySupported, PasskeyError, registerPasskey, removePasskey, type PasskeyList } from '../core/passkeys';

/**
 * «الدخول بالبصمة» settings: enable it on this device once (after signing in with the code), see the registered devices
 * (at most three), and remove any of them. A session opened more than ten minutes ago types the code again to enable it.
 */
export default function PasskeyPanel({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [list, setList] = useState<PasskeyList | null>(null);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok?: boolean } | null>(null);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState('');

  const load = async () => {
    try { setList(await fetchPasskeys()); } catch { setMessage({ text: 'تعذّر تحميل قائمة الأجهزة الآن.' }); }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) { try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); } }
    void passkeySupported().then(setSupported);
    void load();
  }, []);

  const enable = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await registerPasskey(needCode ? { code } : {});
      setNeedCode(false);
      setCode('');
      setMessage({ text: 'تم تفعيل الدخول بالبصمة على هذا الجهاز. ستظهر نافذة البصمة عند فتح أوربت.', ok: true });
      await load();
    } catch (error) {
      const failure = error instanceof PasskeyError ? error : null;
      if (failure?.failure === 'code-required' || failure?.failure === 'code-wrong') setNeedCode(true);
      if (failure?.failure === 'code-wrong') setCode('');
      setMessage({ text: failure?.message || 'تعذّر تفعيل الدخول بالبصمة الآن.' });
    } finally { setBusy(false); }
  };

  const remove = async (ref: string, label: string) => {
    if (busy || !window.confirm(`إزالة الدخول بالبصمة من «${label}»؟ سيدخل هذا الجهاز برمز الدخول بعدها.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await removePasskey(ref);
      const next = await fetchPasskeys();
      setList(next);
      // With no passkey left, this device stops offering the button (the server would refuse it anyway).
      if (!next.items.length) forgetPasskeyDevice();
      setMessage({ text: `أُزيل «${label}».`, ok: true });
    } catch (error) {
      setMessage({ text: error instanceof PasskeyError ? error.message : 'تعذّرت الإزالة الآن.' });
    } finally { setBusy(false); }
  };

  const full = Boolean(list && list.items.length >= list.limit);
  const dateText = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ar-KW', { year: 'numeric', month: 'long', day: 'numeric' }) : '');

  return (
    <dialog ref={dialogRef} className="card passkey-panel" aria-labelledby="passkey-panel-title" onClose={onClose} onCancel={onClose} dir="rtl">
      <h2 id="passkey-panel-title">الدخول بالبصمة</h2>
      <p className="passkey-panel-lead">ادخل إلى أوربت ببصمة الوجه أو الإصبع بدل كتابة الرمز. يبقى رمز الدخول متاحًا دائمًا.</p>

      {list && !list.available && <p className="banner banner-warn">الدخول بالبصمة غير متاح على هذا العنوان.</p>}

      {list && list.items.length > 0 && (
        <ul className="passkey-list" aria-label="الأجهزة المسجّلة">
          {list.items.map(item => (
            <li key={item.ref}>
              <div>
                <strong>{item.label}</strong>
                <small>أُضيف {dateText(item.createdAt)}{item.lastUsedAt ? ` · آخر دخول ${dateText(item.lastUsedAt)}` : ''}</small>
              </div>
              <button type="button" className="btn btn-danger" onClick={() => void remove(item.ref, item.label)} disabled={busy}>إزالة</button>
            </li>
          ))}
        </ul>
      )}
      {list && !list.items.length && <p className="passkey-empty">لا يوجد جهاز مسجّل بعد.</p>}

      {list?.available && (supported ? (
        full ? <p className="passkey-empty">بلغتَ الحدّ الأقصى ({list.limit} أجهزة). أزل جهازًا لتضيف غيره.</p> : (
          <form className="passkey-enable" onSubmit={enable}>
            {needCode && (
              <>
                <label htmlFor="passkey-code">رمز الدخول</label>
                <input id="passkey-code" type="password" autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={code} onChange={event => setCode(event.target.value)} required />
              </>
            )}
            <button type="submit" className="btn btn-primary" disabled={busy || (needCode && !code.trim())} aria-busy={busy}>
              {busy ? 'جارٍ التفعيل…' : needCode ? 'تأكيد وتفعيل البصمة' : 'تفعيل الدخول بالبصمة على هذا الجهاز'}
            </button>
          </form>
        )
      ) : <p className="passkey-empty">هذا الجهاز لا يدعم الدخول بالبصمة.</p>)}

      {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'banner' : 'error'}>{message.text}</p>}

      <button type="button" className="btn passkey-close" onClick={() => { dialogRef.current?.close(); onClose(); }}>إغلاق</button>
    </dialog>
  );
}
