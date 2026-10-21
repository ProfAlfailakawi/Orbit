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
  return fetch(input, { ...init, headers, credentials: init.credentials || 'same-origin' });
}
