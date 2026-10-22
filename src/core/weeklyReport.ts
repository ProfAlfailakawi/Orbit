/** A quiet weekly summary: what went wrong this week, what keeps coming back, and what expires soon. Pure: built from each program's problem log. */
import type { PlatformRecord } from './types.ts';
import { displayName } from './displayName.ts';
import { isInFleet } from './fleetStatus.ts';
import type { PushMessage } from './alerts.ts';

const DAY = 86_400_000;
const KEEP_MS = 14 * DAY;
const MAX_LOG = 40;
/** The same text seen again after this long counts as a new occurrence (a problem that came back), not the same one lingering. */
const RESEEN_MS = 6 * 3_600_000;

const shape = (text: string) => text.replace(/\d+/g, 'N');

/** Add today's problem texts to the program's log: a new text, or one that returned after being quiet. Returns the same object when nothing changed. */
export function logProblems(p: PlatformRecord, texts: string[], nowIso: string): PlatformRecord {
  const now = Date.parse(nowIso);
  const log = (p.problemLog || []).filter(e => now - Date.parse(e.at) < KEEP_MS);
  let changed = log.length !== (p.problemLog || []).length;
  for (const raw of texts) {
    const text = raw.slice(0, 160);
    const last = [...log].reverse().find(e => shape(e.text) === shape(text));
    if (last && now - Date.parse(last.at) < RESEEN_MS) { if (last.text !== text) { last.text = text; } continue; }
    log.push({ at: nowIso, text }); changed = true;
  }
  if (!changed) return p;
  return { ...p, problemLog: log.slice(-MAX_LOG) };
}

export interface Digest { push: PushMessage; text: string }

const latin = (n: number) => String(n);
const dayOf = (iso: string) => iso.slice(0, 10);
const daysLeft = (iso: string | undefined, now: number) => iso && Number.isFinite(Date.parse(iso)) ? Math.floor((Date.parse(iso) - now) / DAY) : null;

export function buildWeeklyDigest(platforms: PlatformRecord[], tokenExpiresAt: string | null | undefined, now = Date.now()): Digest {
  const fleet = platforms.filter(isInFleet).filter(p => p.runtimeMode !== 'local-only' && p.runtimeMode !== 'github-local');
  const since = now - 7 * DAY;
  const weekly = fleet.map(p => {
    const entries = (p.problemLog || []).filter(e => Date.parse(e.at) >= since);
    const groups = new Map<string, { text: string; count: number; last: string }>();
    for (const e of entries) {
      const g = groups.get(shape(e.text));
      if (g) { g.count += 1; if (e.at > g.last) { g.last = e.at; g.text = e.text; } } else groups.set(shape(e.text), { text: e.text, count: 1, last: e.at });
    }
    return { p, groups: [...groups.values()].sort((a, b) => b.count - a.count) };
  });
  const quiet = weekly.filter(w => !w.groups.length);
  const noisy = weekly.filter(w => w.groups.length).sort((a, b) => b.groups.length - a.groups.length);
  const recurring = noisy.flatMap(w => w.groups.filter(g => g.count >= 2).map(g => ({ name: displayName(w.p), ...g }))).sort((a, b) => b.count - a.count);

  const expiries: Array<{ what: string; days: number }> = [];
  for (const p of fleet) {
    const c = daysLeft(p.certExpiresAt, now); if (c !== null && c <= 30) expiries.push({ what: `شهادة موقع ${displayName(p)}`, days: c });
    const d = daysLeft(p.domainExpiresAt, now); if (d !== null && d <= 30) expiries.push({ what: `نطاق ${displayName(p)}`, days: d });
  }
  const t = daysLeft(tokenExpiresAt ?? undefined, now); if (t !== null && t <= 30) expiries.push({ what: 'رمز GitHub لأوربت', days: t });
  expiries.sort((a, b) => a.days - b.days);
  const when = (n: number) => (n < 0 ? 'انتهى' : n === 0 ? 'ينتهي اليوم' : n === 1 ? 'ينتهي غدًا' : `ينتهي بعد ${latin(n)} يومًا`);

  const lines = [`# تقرير أوربت الأسبوعي — ${dayOf(new Date(now).toISOString())}`, '', `برامج بلا أي مشكلة هذا الأسبوع: ${latin(quiet.length)} من ${latin(fleet.length)}${quiet.length ? ' (' + quiet.map(w => displayName(w.p)).join('، ') + ')' : ''}.`];
  if (noisy.length) {
    lines.push('', '## ما حدث');
    for (const w of noisy) {
      lines.push(`### ${displayName(w.p)}`);
      for (const g of w.groups.slice(0, 4)) lines.push(`- ${g.text}${g.count > 1 ? ` — تكرر ${latin(g.count)} مرات` : ''} (آخر مرة ${dayOf(g.last)})`);
    }
  }
  if (recurring.length) {
    lines.push('', '## مشاكل تتكرر (تستحق علاجًا جذريًا)');
    for (const r of recurring.slice(0, 5)) lines.push(`- ${r.name}: ${r.text} — ${latin(r.count)} مرات`);
  }
  if (expiries.length) { lines.push('', '## يقترب موعده'); for (const e of expiries) lines.push(`- ${e.what}: ${when(e.days)}`); }
  if (!noisy.length && !expiries.length) lines.push('', 'أسبوع هادئ: لا مشاكل ولا مواعيد قريبة.');

  const bits = [`${latin(quiet.length)} من ${latin(fleet.length)} برنامجًا بلا مشاكل`];
  if (recurring[0]) bits.push(`الأكثر تكرارًا: ${recurring[0].name} (${latin(recurring[0].count)} مرات)`);
  if (expiries[0]) bits.push(`${expiries[0].what} ${when(expiries[0].days)}`);
  return { text: lines.join('\n'), push: { kind: 'summary', title: 'تقرير أوربت الأسبوعي', body: bits.join(' · ').slice(0, 180), tag: 'orbit-weekly', url: '/' } };
}
