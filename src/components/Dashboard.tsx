import React, { useEffect, useRef, useState } from 'react';
import type { PlatformRecord } from '../core/types';
import { buildCopyText, lastCheckLabel, type ProgramRow, type RowTone, type Summary } from '../core/fleetStatus';

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

/** One plain shape per state, so meaning never depends on colour alone: ! problem, ? not verified, ✓ working, • local. */
function Badge({ tone }: { tone: RowTone }) {
  const paths: Record<RowTone, React.ReactNode> = {
    bad: <><path d="M12 7v6.2" /><circle cx="12" cy="16.9" r=".6" /></>,
    warn: <><path d="M9.6 9.6a2.6 2.6 0 1 1 3.9 2.2c-.9.5-1.5 1-1.5 2" /><circle cx="12" cy="16.9" r=".6" /></>,
    ok: <path d="m7.8 12.4 2.8 2.8 5.6-6" />,
    local: <circle cx="12" cy="12" r="1.2" />,
  };
  return (
    <span className="badge" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">{paths[tone]}</svg>
    </span>
  );
}

/** How many programs verifiably work, out of those that can be verified. Real counts only. */
function Ring({ working, total }: { working: number; total: number }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <div className="ring-wrap" role="img" aria-label={`${working} من ${total} برامج تعمل`}>
     <div className="ring">
      <svg viewBox="0 0 64 64" width="76" height="76" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" className="ring-track" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" className="ring-fill" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${(c * working) / Math.max(total, 1)} ${c}`} transform="rotate(-90 32 32)" />
      </svg>
      <span className="ring-num"><b>{working}</b><i>من {total}</i></span>
     </div>
     <small aria-hidden="true">تعمل</small>
    </div>
  );
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
  const verifiable = rows.filter(r => r.tone !== 'local');
  const working = verifiable.filter(r => r.tone === 'ok').length;

  return (
    <main className="page">
      <section className={'summary summary-' + summary.tone} aria-live="polite">
        <div className="summary-top">
          {verifiable.length > 0 && <Ring working={working} total={verifiable.length} />}
          <div className="summary-text">
            <h1>{summary.headline}</h1>
            {summary.reason && <p className="reason">{'السبب: ' + summary.reason}</p>}
            <p className="muted"><span className="pulse" aria-hidden="true" />{lastCheckLabel(platforms)}</p>
          </div>
        </div>
        {summary.buttonLabel && (
          <button type="button" className={'btn btn-primary' + (copied === 'all' ? ' is-copied' : '')} onClick={() => void copy('all')}>
            {copied === 'all' ? 'تم النسخ' : summary.buttonLabel}
          </button>
        )}
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
        {rows.map(({ platform: p, tone, text, needsCopy }, index) => (
          <li key={p.id} className={'row program-row row-' + tone} style={{ '--i': index } as React.CSSProperties}>
            <Badge tone={tone} />
            <div className="row-info">
              <strong>{shortName(p)}</strong>
              <span className="row-text">{text}</span>
            </div>
            {needsCopy && (
              <button type="button" className={'btn btn-copy' + (copied === p.id ? ' is-copied' : '')} aria-label={'انسخ مشكلة: ' + shortName(p)} onClick={() => void copy(p.id)}>
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
        <button type="button" className="btn btn-add" onClick={() => setAddOpen(true)}>
          <span aria-hidden="true">＋</span> إضافة برنامج
        </button>
      )}

      <footer className="foot">أوربت يراقب ويقترح فقط، ولا يعدّل برامجك.</footer>
    </main>
  );
}
