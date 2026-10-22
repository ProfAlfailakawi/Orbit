/** Early warning: learn each site's normal speed and size, and say so when it drifts, before it turns into an outage. */
import type { PlatformRecord } from './types.ts';

export type VitalSample = NonNullable<PlatformRecord['vitals']>[number];

const MAX_SAMPLES = 96; // a day of 15-minute visits
const MIN_SAMPLES = 16;
const RECENT = 4;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const seconds = (ms: number) => (ms / 1000).toFixed(1).replace(/\.0$/, '') + ' ث';

export function addVital(samples: VitalSample[] | undefined, sample: VitalSample): VitalSample[] {
  return [...(samples || []), sample].slice(-MAX_SAMPLES);
}

/** Plain-Arabic drift warnings for a program, or []. Compares the last few visits with the median of the earlier ones. */
export function detectDrift(samples: VitalSample[] | undefined): string[] {
  if (!samples || samples.length < MIN_SAMPLES) return [];
  const recent = samples.slice(-RECENT);
  const base = samples.slice(0, -RECENT);
  const out: string[] = [];

  const baseMs = median(base.map(s => s.ms));
  const recentMs = median(recent.map(s => s.ms));
  if (recentMs > Math.max(baseMs * 3, baseMs + 1500)) out.push(`الموقع يتباطأ: ${seconds(recentMs)} للاستجابة بدل ${seconds(baseMs)} المعتادة، وقد يتعطل إن استمر`);

  const baseBytes = median(base.map(s => s.bytes));
  const recentBytes = median(recent.map(s => s.bytes));
  const steady = recent.every(s => Math.abs(s.bytes - recentBytes) <= recentBytes * 0.1);
  if (baseBytes > 500 && steady && Math.abs(recentBytes - baseBytes) / baseBytes > 0.4) {
    out.push(`حجم الصفحة الرئيسية تغيّر ${Math.round(Math.abs(recentBytes - baseBytes) / baseBytes * 100)}% ${recentBytes > baseBytes ? 'للأكبر' : 'للأصغر'} (غالبًا بعد نشر جديد)، راجع أن النشر كامل`);
  }
  return out;
}

/** Drift warnings that are still current (the watch records a sample every 15 minutes; a stale history says nothing). */
export function driftWarnings(p: PlatformRecord, now = Date.now()): string[] {
  const last = p.vitals?.[p.vitals.length - 1];
  return last && now - Date.parse(last.at) < 3 * 3_600_000 ? detectDrift(p.vitals) : [];
}

const median12 = (v: number[]) => median(v.slice(-12));
const latestCommit = (p: PlatformRecord) => (p.recentCommits || []).find(c => c.dataIntegrity === 'Live' && /^[a-f0-9]{7,64}$/i.test(c.sha) && Number.isFinite(Date.parse(c.timestamp)));

/** Remember how fast the site was just before the newest commit, so a later slowdown can be tied to that release. */
export function trackRelease(p: PlatformRecord): PlatformRecord['releaseWatch'] {
  const commit = latestCommit(p);
  if (!commit) return p.releaseWatch;
  if (p.releaseWatch?.sha === commit.sha) return p.releaseWatch;
  const before = (p.vitals || []).filter(s => Date.parse(s.at) < Date.parse(commit.timestamp)).map(s => s.ms);
  return { sha: commit.sha, at: commit.timestamp, ...(before.length >= 6 ? { beforeMs: median12(before) } : {}) };
}

const RELEASE_SETTLE_MS = 10 * 60_000;
const RELEASE_WATCH_MS = 48 * 3_600_000;

/** «The site got slower after commit X»: the last few visits made after the release, against the speed before it. */
export function releaseSlowdown(p: PlatformRecord, now = Date.now()): string[] {
  const w = p.releaseWatch;
  if (!w || w.beforeMs === undefined || now - Date.parse(w.at) > RELEASE_WATCH_MS) return [];
  const after = (p.vitals || []).filter(s => Date.parse(s.at) > Date.parse(w.at) + RELEASE_SETTLE_MS);
  if (after.length < RECENT) return [];
  const recent = median(after.slice(-RECENT).map(s => s.ms));
  if (recent <= Math.max(w.beforeMs * 1.5, w.beforeMs + 400)) return [];
  return [`الموقع أبطأ بعد آخر تعديل (${w.sha.slice(0, 7)}): ${seconds(recent)} للاستجابة بدل ${seconds(w.beforeMs)} قبله`];
}
