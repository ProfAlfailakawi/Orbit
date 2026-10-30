import { HEALTH_PATH, isPlatformUpdating, showUpdatingNotice, UPDATING_MESSAGE } from './updatingNotice';

const ORBIT_SESSION_KEY = 'orbit.operator.session';

export function setOrbitSessionToken(token: string) {
  if (typeof window !== 'undefined' && token) window.sessionStorage.setItem(ORBIT_SESSION_KEY, token);
}

export function clearOrbitSessionToken() {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(ORBIT_SESSION_KEY);
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  const isApiRequest = typeof input === 'string' ? input.startsWith('/api/') : new URL(input instanceof Request ? input.url : input.toString(), window.location.href).pathname.startsWith('/api/');
  if (isApiRequest && typeof window !== 'undefined') {
    const token = window.sessionStorage.getItem(ORBIT_SESSION_KEY);
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(input, { ...init, headers, credentials: init.credentials || 'same-origin' });
  // Our /api routes answer JSON. A 5xx page in HTML is the platform swapping
  // servers mid-deploy: one calm notice instead of an error. (An unhandled throw
  // gets Express's HTML 500 too; the notice then clears on the first health check.)
  if (isApiRequest && isPlatformUpdating(response.status, response.headers.get('content-type'))) {
    showUpdatingNotice(serverAnswers);
    return new Response(JSON.stringify({ error: UPDATING_MESSAGE }), { status: 503, statusText: 'Updating', headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Orbit-Updating': '1' } });
  }
  return response;
}

/** Is the server answering at all? Public, no-store, before auth. */
const serverAnswers = () => fetch(HEALTH_PATH, { cache: 'no-store', credentials: 'same-origin' }).then(response => response.ok, () => false);
