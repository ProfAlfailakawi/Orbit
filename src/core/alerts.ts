/** When to tell the owner. Pure: compares what is wrong now with what was wrong last time. */
import type { ProgramRow } from './fleetStatus.ts';
import { displayName } from './displayName.ts';

export interface AlertMemory { initialized: boolean; signatures: Record<string, string> }
export interface PushMessage { kind: 'problem' | 'recovered' | 'summary'; title: string; body: string; tag: string; url: string }

const MAX_SEPARATE = 3;

/**
 * A program's signature is its problem text while it is in trouble, and empty otherwise.
 * A message goes out when a program gets a new or different problem, and when it recovers.
 * The very first run only records the baseline, so enabling alerts never floods the phone.
 */
export function computeAlertChanges(rows: ProgramRow[], memory: AlertMemory | undefined): { messages: PushMessage[]; next: AlertMemory } {
  const signatures: Record<string, string> = {};
  for (const row of rows) signatures[row.platform.id] = row.tone === 'bad' ? row.text : '';
  const next: AlertMemory = { initialized: true, signatures };
  if (!memory?.initialized) return { messages: [], next };

  const problems: PushMessage[] = [];
  const recovered: PushMessage[] = [];
  for (const row of rows) {
    const before = memory.signatures[row.platform.id] ?? '';
    const now = signatures[row.platform.id];
    const name = displayName(row.platform);
    if (now && now !== before) problems.push({ kind: 'problem', title: name, body: now, tag: 'orbit-' + row.platform.id, url: '/' });
    else if (!now && before && row.tone !== 'bad') recovered.push({ kind: 'recovered', title: name, body: 'عاد للعمل', tag: 'orbit-' + row.platform.id, url: '/' });
  }
  const messages = problems.length > MAX_SEPARATE
    ? [{ kind: 'summary' as const, title: 'أوربت', body: `${problems.length} برامج فيها مشاكل جديدة: ${problems.slice(0, 4).map(m => m.title).join('، ')}…`, tag: 'orbit-summary', url: '/' }]
    : problems;
  return { messages: [...messages, ...recovered.slice(0, MAX_SEPARATE)], next };
}
