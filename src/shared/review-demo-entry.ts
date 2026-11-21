/**
 * Reviewer demo access for Apple App Review (and the owner's own tour).
 *
 * There is NO visible demo button in the app. The isolated demo sandbox opens
 * when this reserved access code is typed in the login field («رمز الدخول»)
 * and the normal «دخول» button is tapped. The code is documented only in the
 * App Review notes (apple-release/review/review-notes.md) of each release.
 *
 * It is not a credential: it opens the isolated sandbox (synthetic data only,
 * nothing real is reachable — see src/server/demoSandbox.ts). The server checks
 * it too, so /api/demo/enter cannot be called by someone who does not know it.
 * It is long and random on purpose, so nobody can stumble on it.
 */
export const REVIEW_DEMO_ACCESS_CODE = 'qg4qv2ggpbxxqb';

/** Case/space-insensitive on purpose: iOS capitalises the first letter of text fields. */
export function normalizeReviewDemoCandidate(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '').toLowerCase();
}

/** True only for exactly the reserved code. Length is checked first, then every char (no early exit on mismatch). */
export function isReviewDemoAccessCode(value: unknown): boolean {
  // Strings only: String([code]) / String({toString}) coercions must never match.
  if (typeof value !== 'string') return false;
  const a = normalizeReviewDemoCandidate(value);
  const b = REVIEW_DEMO_ACCESS_CODE;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
