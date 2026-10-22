import React, { useEffect, useRef, useState } from 'react';
import type { PlatformRecord } from '../core/types';
import { displayName } from '../core/displayName';
import { buildCopyText, lastCheckLabel, type ProgramRow, type RowTone, type Summary } from '../core/fleetStatus';

export type Logos = Record<string, { src: string }>;
export interface Explanation { mode: 'rules' | 'gemini'; urgency: string; meaning: string; action: string; text?: string }

interface DashboardProps {
  rows: ProgramRow[];
  logos: Logos;
  summary: Summary;
  platforms: PlatformRecord[];
  tokenMissing: boolean;
  onAdd: (name: string, link: string) => Promise<string>;
  onRemove: (id: string) => Promise<void>;
  onExplain: (id: string) => Promise<Explanation>;
}

const shortName = displayName;

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

const hash = (text: string) => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** The program's logo; when there is none (or it fails to load) a deterministic monogram, so every satellite looks finished. */
function Avatar({ platform, src }: { platform: PlatformRecord; src?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed) {
    return <span className="avatar"><img src={src} alt="" draggable={false} onError={() => setFailed(true)} /></span>;
  }
  const hue = hash(platform.codeName) % 360;
  const letter = ([...shortName(platform)].find(ch => /[\p{L}\p{N}]/u.test(ch)) || '•').toUpperCase();
  return (
    <span className="avatar avatar-mono" style={{ background: `linear-gradient(135deg, hsl(${hue} 62% 36%), hsl(${(hue + 42) % 360} 62% 24%))` }}>{letter}</span>
  );
}

function Orbit({ rows, logos, working, total, selectedId, onSelect }: {
  rows: ProgramRow[]; logos: Logos; working: number; total: number; selectedId: string | null; onSelect: (id: string | null) => void;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const active = rows.find(r => r.platform.id === (hoverId ?? selectedId));
  // Problems come first, so they sit on the inner ring, nearest the core.
  const inner = rows.length > 4 ? Math.round(rows.length * 0.36) : 0;
  // The inner ring is drawn last, so satellites with problems are never hidden when the rings cross.
  const rings = [
    { key: 'out', items: rows.slice(inner), phase: 0 },
    { key: 'inn', items: rows.slice(0, inner), phase: 24 },
  ].filter(ring => ring.items.length);
  const frac = total ? working / total : 0;
  const arc = 2 * Math.PI * 74;
  return (
    <div className={'orbit' + (selectedId ? ' has-sel' : '') + (total && working === total ? ' is-calm' : '')} role="group" aria-label="برامجك" onClick={event => { if (event.target === event.currentTarget) onSelect(null); }}>
      <svg className="orbit-art" viewBox="0 0 360 360" aria-hidden="true">
        <defs>
          <radialGradient id="orb-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#69ffcd" stopOpacity=".26" /><stop offset=".6" stopColor="#33bfa6" stopOpacity=".08" /><stop offset="1" stopColor="#33bfa6" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="orb-core" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2b6a69" /><stop offset=".55" stopColor="#133d49" /><stop offset="1" stopColor="#142c40" />
          </linearGradient>
        </defs>
        <circle cx="180" cy="180" r="178" fill="url(#orb-glow)" className="orbit-breathe" />
        <circle cx="180" cy="180" r="106" className="orbit-line orbit-line-fill" />
        <circle cx="180" cy="180" r="62" fill="url(#orb-core)" className="orbit-core-disc" />
        <circle cx="180" cy="180" r="74" className="orbit-arc-track" />
        <circle cx="180" cy="180" r="74" className="orbit-arc" strokeDasharray={`${arc * frac} ${arc}`} transform="rotate(-90 180 180)" />
      </svg>
      <div className={'orbit-core' + (active ? ' is-named' : '')} data-tone={active?.tone} aria-hidden="true">
        {active ? (
          <>
            <strong className={'orbit-name orbit-name-' + active.tone} dir="ltr">{shortName(active.platform)}</strong>
            <small>{active.text}</small>
          </>
        ) : (
          <>
            <i>ORBIT ONE</i>
            <b>{total ? working : '—'}</b>
            <small>{total ? (working === total ? 'كلها تعمل، كل شيء بخير' : `تعمل من ${total}`) : 'لا برامج'}</small>
          </>
        )}
      </div>
      {rings.map(({ key, items, phase }) => (
        <div key={key} className={'ring ring-' + key}>
          {items.map((row, k) => {
            const angle = ((-90 + (360 / items.length) * k + phase) * Math.PI) / 180;
            const p = row.platform;
            return (
              <button key={p.id} type="button" className={'sat sat-' + row.tone + (selectedId === p.id ? ' is-selected' : '')}
                style={{ left: `${50 + 50 * Math.cos(angle)}%`, top: `${50 + 50 * Math.sin(angle)}%`, '--k': k } as React.CSSProperties}
                aria-pressed={selectedId === p.id} aria-label={`${shortName(p)}: ${row.text}`}
                onMouseEnter={() => setHoverId(p.id)} onMouseLeave={() => setHoverId(null)}
                onFocus={() => setHoverId(p.id)} onBlur={() => setHoverId(null)}
                onClick={() => onSelect(selectedId === p.id ? null : p.id)}>
                <span className="sat-in">
                  <span className="sat-bob">
                    <span className="sat-dot">
                      <Avatar platform={p} src={logos[p.id]?.src} />
                      <span className="sat-flag"><Glyph tone={row.tone} size={11} /></span>
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function Dashboard({ rows, logos, summary, platforms, tokenMissing, onAdd, onRemove, onExplain }: DashboardProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [manualText, setManualText] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [explained, setExplained] = useState<{ id: string; state: 'loading' | 'failed' | Explanation } | null>(null);
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

  const [weekly, setWeekly] = useState<'idle' | 'loading' | 'copied' | 'failed'>('idle');
  const copyWeekly = async () => {
    setWeekly('loading');
    try {
      const response = await fetch('/api/weekly-report', { credentials: 'same-origin' });
      const { text } = await response.json() as { text?: string };
      if (!response.ok || !text) throw new Error('empty');
      if (await copyToClipboard(text)) { setManualText(null); setWeekly('copied'); window.setTimeout(() => setWeekly('idle'), 2500); }
      else { setManualText(text); setWeekly('idle'); }
    } catch { setWeekly('failed'); window.setTimeout(() => setWeekly('idle'), 2500); }
  };

  const explain = async (id: string) => {
    setExplained({ id, state: 'loading' });
    try { setExplained({ id, state: await onExplain(id) }); } catch { setExplained({ id, state: 'failed' }); }
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
  const selected = rows.find(r => r.platform.id === selectedId);

  return (
    <main className="page">
      <section className={'summary hero hero-' + summary.tone}>
        <div className="hero-stars" aria-hidden="true" />
        <div className="hero-aura" aria-hidden="true" />
        <div className="hero-text">
          {selected ? (
            <div className={'detail detail-' + selected.tone} role="status" key={selected.platform.id}>
              <span className="detail-badge" aria-hidden="true">
                <Avatar platform={selected.platform} src={logos[selected.platform.id]?.src} />
                <span className="sat-flag"><Glyph tone={selected.tone} size={11} /></span>
              </span>
              <div className="detail-info">
                <strong dir="ltr">{shortName(selected.platform)}</strong>
                <span>{selected.text}</span>
              </div>
              {selected.needsCopy && (
                <span className="detail-actions">
                  <button type="button" className="btn btn-explain" aria-label={'اشرح مشكلة: ' + shortName(selected.platform)} disabled={explained?.id === selected.platform.id && explained.state === 'loading'} onClick={() => void explain(selected.platform.id)}>اشرح</button>
                  <button type="button" className={'btn btn-copy' + (copied === selected.platform.id ? ' is-copied' : '')} aria-label={'انسخ مشكلة: ' + shortName(selected.platform)} onClick={() => void copy(selected.platform.id)}>
                    {copied === selected.platform.id ? 'نُسخ' : 'انسخ'}
                  </button>
                </span>
              )}
              <button type="button" className="detail-close" aria-label="إغلاق" onClick={() => setSelectedId(null)}>×</button>
            </div>
          ) : (
            <p className="hero-hint">اضغط أي قمر لترى اسمه ومشكلته</p>
          )}
          {selected && explained?.id === selected.platform.id && (
            <div className="explain" role="status" aria-live="polite">
              {explained.state === 'loading' && <p className="explain-wait">جارٍ الشرح…</p>}
              {explained.state === 'failed' && <p>تعذر الشرح الآن، حاول بعد قليل.</p>}
              {typeof explained.state === 'object' && (
                <>
                  <span className={'explain-chip explain-' + (explained.state.urgency === 'عاجلة' ? 'hot' : explained.state.urgency === 'مهمة' ? 'mid' : 'low')}>{explained.state.urgency}</span>
                  {explained.state.text
                    ? <p className="explain-text">{explained.state.text}</p>
                    : <><p>{explained.state.meaning}</p><p className="explain-act">الخطوة: {explained.state.action}</p></>}
                </>
              )}
            </div>
          )}
          <h1>{summary.headline}</h1>
          {summary.reason && <p className="reason">{'السبب: ' + summary.reason}</p>}
          <p className="hero-muted" aria-live="polite"><span className="pulse" aria-hidden="true" />{lastCheckLabel(platforms)}</p>
          {summary.buttonLabel && (
            <button type="button" className={'btn btn-primary' + (copied === 'all' ? ' is-copied' : summary.tone === 'bad' ? ' btn-attn' : '')} onClick={() => void copy('all')}>
              {copied === 'all' ? 'نُسخ — الصقه في كلود' : summary.buttonLabel}
            </button>
          )}
          {tokenMissing && <p className="notice">لم يُضبط توكن GitHub على الخادم، لذلك لا تُقرأ المستودعات الخاصة.</p>}
        </div>
        <Orbit rows={rows} logos={logos} working={working} total={verifiable.length} selectedId={selectedId} onSelect={setSelectedId} />
      </section>

      {manualText !== null && (
        <section className="manual" role="status">
          <p>تعذر النسخ تلقائيًا. حدّد النص التالي وانسخه:</p>
          <textarea readOnly value={manualText} rows={8} onFocus={event => event.currentTarget.select()} dir="auto" aria-label="نص التقرير"/>
          <button type="button" className="btn" onClick={() => setManualText(null)}>إغلاق</button>
        </section>
      )}

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
                  <bdi dir="ltr">{shortName(p)}</bdi>
                  {removing === p.id
                    ? <button type="button" className="btn btn-danger" onClick={() => { setRemoving(null); void onRemove(p.id); }}>تأكيد الإزالة</button>
                    : <button type="button" className="btn" onClick={() => setRemoving(p.id)}>إزالة</button>}
                </div>
              ))}
            </div>
          )}
        </form>
      ) : (
        <div className="row-center">
          <button type="button" className="btn btn-add" onClick={() => setAddOpen(true)}><span aria-hidden="true">＋</span> إضافة برنامج</button>
          <button type="button" className="btn btn-add" disabled={weekly === 'loading'} onClick={() => void copyWeekly()}>
            {weekly === 'copied' ? 'نُسخ تقرير الأسبوع' : weekly === 'failed' ? 'تعذر جلب التقرير' : 'تقرير الأسبوع'}
          </button>
        </div>
      )}

      <footer className="foot">أوربت يراقب ويقترح فقط، ولا يعدّل برامجك.</footer>
    </main>
  );
}
