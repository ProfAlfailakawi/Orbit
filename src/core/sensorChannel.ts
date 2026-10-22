/**
 * Is the browser sensor's channel alive? Once a day the robot visitor makes the program's own page throw a marked test error.
 * If the sensor is installed and allowed to reach ORBIT, the note arrives and is recorded here as proof, never as a finding.
 * A site whose sensor is missing, or whose security policy blocks the beacon, would otherwise look «quiet» when it is only deaf.
 */
import type { PlatformRecord } from './types.ts';
import type { SensorReport } from './sensor.ts';

export const PROBE_MARK = 'ORBIT-SELFTEST';

/** Separate the self-test note from real reports: the test never becomes a finding. */
export function splitProbe(reports: SensorReport[]): { probe: boolean; rest: SensorReport[] } {
  const rest = reports.filter(r => !r.message.includes(PROBE_MARK));
  return { probe: rest.length !== reports.length, rest };
}

export function applyProbe(p: PlatformRecord, nowIso: string): PlatformRecord {
  return { ...p, sensorProbeAt: nowIso };
}

const VISIT_FRESH_MS = 36 * 3_600_000;
/** The robot posts its results when its whole run ends, up to ~20 minutes after the test note was sent. */
const BEFORE_MS = 25 * 60_000;
const AFTER_MS = 10 * 60_000;

export function sensorChannelWarnings(p: PlatformRecord, now = Date.now()): string[] {
  const v = p.browserVisit;
  if (!v?.sensor || now - Date.parse(v.at) > VISIT_FRESH_MS) return [];
  if (v.sensor === 'absent') return ['حساس أوربت غير مركّب في صفحات الموقع، فلن تصل أخطاء الزوّار الحقيقيين'];
  const at = Date.parse(v.at);
  const probe = p.sensorProbeAt ? Date.parse(p.sensorProbeAt) : NaN;
  if (Number.isFinite(probe) && probe >= at - BEFORE_MS && probe <= at + AFTER_MS) return [];
  return ['حساس أوربت مركّب لكن بلاغه التجريبي لم يصل (غالبًا سياسة الأمان CSP تمنع الاتصال بأوربت، أو عنوان الموقع غير مطابق)'];
}
