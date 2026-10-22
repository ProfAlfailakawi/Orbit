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
const cardId = (p: PlatformRecord) => 'program-' + p.id.replace(/[^\w-]/g, '_');

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
function Glyph({ tone, size = 24 }: { tone: RowTone; size?: number }) {
  const paths: Record<RowTone, React.ReactNode> = {
    bad: <><path d="M12 7v6.2" /><circle cx="12" cy="16.9" r=".6" /></>,
    warn: <><path d="M9.6 9.6a2.6 2.6 0 1 1 3.9 2.2c-.9.5-1.5 1-1.5 2" /><circle cx="12" cy="16.9" r=".6" /></>,
    ok: <path d="m7.8 12.4 2.8 2.8 5.6-6" />,
    local: <circle cx="12" cy="12" r="1.2" />,
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[tone]}</svg>
  );
}

/**
 * The orbit: every program is a satellite whose colour and shape are its real status.
 * Redundant with the cards below (so it is hidden from assistive tech); hovering or tapping a satellite names it and jumps to its card.
 */
function Orbit({ rows, working, total, activeId, onActive }: {
  rows: ProgramRow[]; working: number; total: number; activeId: string | null; onActive: (id: string | null, jump?: boolean) => void;
}) {
  const inner = rows.length > 4 ? Math.round(rows.length * 0.36) : 0;
  const active = rows.find(r => r.platform.id === activeId);
  return (
    <div className="orbit" role="img" aria-label={`${working} من ${total} برامج تعمل`}>
      <svg className="orbit-art" viewBox="0 0 320 320" aria-hidden="true">
        <defs>
          <radialGradient id="orb-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#7c8bff" stopOpacity=".42" /><stop offset=".55" stopColor="#6a3fe0" stopOpacity=".14" /><stop offset="1" stopColor="#6a3fe0" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="orb-core" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2a2f86" /><stop offset="1" stopColor="#120f45" />
          </linearGradient>
        </defs>
        <circle cx="160" cy="160" r="158" fill="url(#orb-glow)" />
        <g className="spin-slow"><circle cx="160" cy="160" r="146" className="orbit-line" strokeDasharray="1 9" strokeLinecap="round" /></g>
        <g className="spin-rev"><circle cx="160" cy="160" r="92" className="orbit-line" strokeDasharray="2 7" strokeLinecap="round" /></g>
        <circle cx="160" cy="160" r="146" className="orbit-line orbit-line-soft" />
        <circle cx="160" cy="160" r="92" className="orbit-line orbit-line-soft" />
        <g className="comet"><circle cx="160" cy="14" r="3.2" fill="#fff" /><circle cx="160" cy="14" r="8" fill="#9fb0ff" opacity=".25" /></g>
        <circle cx="160" cy="160" r="58" fill="url(#orb-core)" className="orbit-core-disc" />
      </svg>
      <div className="orbit-center" aria-hidden="true">
        {active ? (
          <>
            <span className={'orbit-name orbit-name-' + active.tone}>{shortName(active.platform)}</span>
            <small>{active.text}</small>
          </>
        ) : (
          <>
            <b>{total ? working : '—'}</b>
            <small>{total ? `تعمل من ${total}` : 'لا برامج'}</small>
          </>
        )}
      </div>
      <div className="orbit-nodes" aria-hidden="true">
        {rows.map((r, i) => {
          const isInner = i < inner;
          const count = isInner ? inner : rows.length - inner;
          const k = isInner ? i : i - inner;
          const angle = ((-90 + (360 / count) * k + (isInner ? 20 : 0)) * Math.PI) / 180;
          const radius = isInner ? 28.75 : 45.6;
          return (
            <button key={r.platform.id} type="button" tabIndex={-1}
              className={'node node-' + r.tone + (activeId === r.platform.id ? ' is-active' : '')}
              style={{ left: `${50 + radius * Math.cos(angle)}%`, top: `${50 + radius * Math.sin(angle)}%`, '--d': `${(i % 5) * -0.7}s` } as React.CSSProperties}
              onMouseEnter={() => onActive(r.platform.id)} onMouseLeave={() => onActive(null)}
              onClick={() => onActive(r.platform.id, true)}>
              <span className="node-in"><Glyph tone={r.tone} size={16} /></span>
            </button>
          );
        })}
      </div>
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const flashTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => { window.clearTimeout(timer.current); window.clearTimeout(flashTimer.current); }, []);

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

  const onActive = (id: string | null, jump = false) => {
    setActiveId(id);
    const row = rows.find(r => r.platform.id === id);
    if (!jump || !row) return;
    document.getElementById(cardId(row.platform))?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    setFlashId(id);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashId(null), 1600);
  };

  const mine = platforms.filter(p => p.isCustomAdded && p.lifecycleState !== 'unlinked' && p.lifecycleState !== 'archived');
  const verifiable = rows.filter(r => r.tone !== 'local');
  const working = verifiable.filter(r => r.tone === 'ok').length;

  return (
    <main className="page">
      <section className={'summary hero hero-' + summary.tone} aria-live="polite">
        <div className="hero-stars" aria-hidden="true" />
        <Orbit rows={rows} working={working} total={verifiable.length} activeId={activeId} onActive={onActive} />
        <div className="hero-text">
          <h1>{summary.headline}</h1>
          {summary.reason && <p className="reason">{'السبب: ' + summary.reason}</p>}
          <p className="hero-muted"><span className="pulse" aria-hidden="true" />{lastCheckLabel(platforms)}</p>
          {summary.buttonLabel && (
            <button type="button" className={'btn btn-primary' + (copied === 'all' ? ' is-copied' : '')} onClick={() => void copy('all')}>
              {copied === 'all' ? 'تم النسخ' : summary.buttonLabel}
            </button>
          )}
          {tokenMissing && <p className="notice">لم يُضبط توكن GitHub على الخادم، لذلك لا تُقرأ المستودعات الخاصة.</p>}
        </div>
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
          <li key={p.id} id={cardId(p)} className={'program-row pcard pcard-' + tone + (flashId === p.id ? ' is-flash' : '') + (activeId === p.id ? ' is-active' : '')}
            style={{ '--i': index } as React.CSSProperties}
            onMouseEnter={() => setActiveId(p.id)} onMouseLeave={() => setActiveId(null)}>
            <span className="badge" aria-hidden="true"><Glyph tone={tone} /></span>
            <div className="pcard-info">
              <strong>{shortName(p)}</strong>
              <span className="pcard-text" title={text}>{text}</span>
            </div>
            {needsCopy && (
              <button type="button" className={'btn btn-copy' + (copied === p.id ? ' is-copied' : '')} aria-label={'انسخ مشكلة: ' + shortName(p)} onClick={() => void copy(p.id)}>
                {copied === p.id ? 'تم النسخ' : 'انسخ'}
              </button>
            )}
          </li>
        ))}
        {!addOpen && (
          <li className="pcard pcard-add" style={{ '--i': rows.length } as React.CSSProperties}>
            <button type="button" className="add-tile" onClick={() => setAddOpen(true)}>
              <span aria-hidden="true">＋</span>
              إضافة برنامج
            </button>
          </li>
        )}
      </ul>

      {addOpen && (
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
      )}

      <footer className="foot">أوربت يراقب ويقترح فقط، ولا يعدّل برامجك.</footer>
    </main>
  );
}
