import React, { useEffect, useRef, useState } from 'react';
import type { PlatformRecord } from '../core/types';
import { buildCopyText, lastCheckLabel, type ProgramRow, type Summary } from '../core/fleetStatus';

interface DashboardProps {
  rows: ProgramRow[];
  summary: Summary;
  platforms: PlatformRecord[];
  tokenMissing: boolean;
  onAdd: (name: string, link: string) => Promise<string>;
  onRemove: (id: string) => Promise<void>;
}

const shortName = (p: PlatformRecord) => p.nameAr.replace(/\s*\([^)]*\)/g, '');

async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through to the legacy path */ }
  try {
    const area = document.createElement('textarea');
    area.value = text; area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(area); area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch { return false; }
}

export function Dashboard({ rows, summary, platforms, tokenMissing, onAdd, onRemove }: DashboardProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [manualText, setManualText] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async (scope: 'all' | string) => {
    const text = buildCopyText(rows, scope);
    if (await copyToClipboard(text)) {
      setManualText(null);
      setCopied(scope);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(null), 2500);
    } else setManualText(text);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setFeedback('');
    try { setFeedback(await onAdd(name, link)); setName(''); setLink(''); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'تعذر إضافة البرنامج'); }
    finally { setBusy(false); }
  };

  const mine = platforms.filter(p => p.isCustomAdded && p.lifecycleState !== 'unlinked' && p.lifecycleState !== 'archived');

  return (
    <main className="page">
      <section className={'summary summary-' + summary.tone} aria-live="polite">
        <h1>{summary.headline}</h1>
        {summary.buttonLabel && (
          <button type="button" className="btn btn-primary" onClick={() => void copy('all')}>
            {copied === 'all' ? 'تم النسخ' : summary.buttonLabel}
          </button>
        )}
        {summary.reason && <p className="reason">{'السبب: ' + summary.reason}</p>}
        <p className="muted">{lastCheckLabel(platforms)}</p>
        {tokenMissing && <p className="notice">لم يُضبط توكن GitHub على الخادم، لذلك لا تُقرأ المستودعات الخاصة.</p>}
      </section>

      {manualText !== null && (
        <section className="manual" role="status">
          <p>تعذر النسخ تلقائيًا. حدّد النص التالي وانسخه:</p>
          <textarea readOnly value={manualText} rows={8} onFocus={event => event.currentTarget.select()} dir="auto" aria-label="نص التقرير"/>
          <button type="button" className="btn" onClick={() => setManualText(null)}>إغلاق</button>
        </section>
      )}

      <ul className="rows">
        {rows.map(({ platform: p, tone, text, needsCopy }) => (
          <li key={p.id} className={'row program-row row-' + tone}>
            <div className="row-info">
              <strong>{shortName(p)}</strong>
              <span className="row-text">{text}</span>
            </div>
            {needsCopy && (
              <button type="button" className="btn btn-copy" aria-label={'انسخ مشكلة: ' + shortName(p)} onClick={() => void copy(p.id)}>
                {copied === p.id ? 'تم النسخ' : 'انسخ'}
              </button>
            )}
          </li>
        ))}
      </ul>

      {addOpen ? (
        <form className="card add" onSubmit={submit} aria-label="إضافة برنامج جديد">
          <label>اسم البرنامج
            <input type="text" value={name} maxLength={100} required onChange={event => setName(event.target.value)} placeholder="مثال: برنامجي الجديد"/>
          </label>
          <label>رابط GitHub أو الموقع
            <input type="url" value={link} required dir="ltr" onChange={event => setLink(event.target.value)} placeholder="https://github.com/owner/project"/>
          </label>
          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'جارٍ الإضافة…' : 'إضافة'}</button>
            <button className="btn" type="button" onClick={() => { setAddOpen(false); setFeedback(''); }}>إغلاق</button>
          </div>
          {feedback && <p className="muted" role="status">{feedback}</p>}
          {mine.length > 0 && (
            <div className="mine">
              <p className="muted">برامج أضفتها</p>
              {mine.map(p => (
                <div className="mine-row" key={p.id}>
                  <span>{shortName(p)}</span>
                  {removing === p.id
                    ? <button type="button" className="btn btn-danger" onClick={() => { setRemoving(null); void onRemove(p.id); }}>تأكيد الإزالة</button>
                    : <button type="button" className="btn" onClick={() => setRemoving(p.id)}>إزالة</button>}
                </div>
              ))}
            </div>
          )}
        </form>
      ) : (
        <button type="button" className="btn btn-link" onClick={() => setAddOpen(true)}>إضافة برنامج</button>
      )}

      <footer className="muted foot">أوربت يراقب ويقترح فقط، ولا يعدّل برامجك.</footer>
    </main>
  );
}
