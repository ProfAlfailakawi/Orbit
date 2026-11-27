/**
 * What the iPhone app does about alerts on start, after a login or while already logged in. Pure, so it can be tested.
 *  - granted  → register silently (fetch the token and send it to the server; the server ignores a token it already has)
 *  - not decided yet → ask once, and remember that it was asked
 *  - denied → nothing (the bell explains how to enable it in Settings)
 * The owner switching alerts off from the bell is respected: nothing is registered again until he switches them on.
 */
export type NativePushPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';
export type NativePushPlan = 'register' | 'ask' | 'skip';

export function planNativePush(input: { permission: NativePushPermissionState; askedBefore: boolean; switchedOff: boolean }): NativePushPlan {
  if (input.switchedOff || input.permission === 'unsupported' || input.permission === 'denied') return 'skip';
  if (input.permission === 'granted') return 'register';
  return input.askedBefore ? 'skip' : 'ask';
}

/** The body for /api/push/subscribe-native: `replaces` only when iOS handed this device a different token. */
export function nativeSubscribeBody(token: string, previous: string): { token: string; replaces?: string } {
  return previous && previous !== token ? { token, replaces: previous } : { token };
}
