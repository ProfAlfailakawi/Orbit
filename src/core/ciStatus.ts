/** A cancelled, skipped or neutral run says nothing about code health (newer pushes cancel older runs). */
const NON_VERDICT_CONCLUSIONS = new Set(['cancelled', 'skipped', 'neutral', 'stale']);

export function hasCiVerdict(run: { status?: string; conclusion?: string | null }): boolean {
  return run.status === 'completed' && !NON_VERDICT_CONCLUSIONS.has(String(run.conclusion || ''));
}
