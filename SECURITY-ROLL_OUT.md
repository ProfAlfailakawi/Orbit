# ORBIT operator access

Set `ORBIT_OPERATOR_PASSKEY` as a unique random secret of at least 16 characters in the server environment. Do not commit the value or expose it through Vite variables.

The server removes hardcoded credentials and locks `/api` endpoints behind an HTTP-only, same-site operator session. In Cloud Run production, hashed session identifiers and expiry values are persisted in Firestore so sessions survive instance replacement and restart. Local development keeps sessions in memory. Sessions expire after eight hours. The standalone Firebase project is provisioned, but the app is not deployed and billing is disabled; Cloud Run is therefore not active.

Before production deployment, verify login, refresh/session recovery, all dashboard reads, event streaming, Firestore persistence, and incident/fleet operations. The code has an OIDC-verified scheduler endpoint, but no Cloud Scheduler job is deployed. Sensor ingestion remains separately credentialed.

**Important:** Existing seed data represents examples, not independently verified live incidents. Do not rely on seed metrics as production truth. Additional work is required to isolate all demonstration data and complete monitoring integrations.

No changes were made to the eleven monitored application repositories.

## Passkey sign-in («الدخول بالبصمة»)

After signing in with the operator code, the operator can register up to three WebAuthn passkeys (Face ID / Touch ID / device code) from «البصمة» in the header. Implementation: `src/server/passkeys.ts` with `@simplewebauthn/server`.

- Public keys only are stored, in Firestore `orbit/passkeys` (process memory in local development). Challenges live in `orbitPasskeyChallenges`, keyed by a hash of a random id, single use, five minutes.
- User verification is required for registration and sign-in. The RP ID and origin come from `ORBIT_PRODUCTION_URL` (`orbitq8.web.app`), never from the request; a mismatching `Origin` header is refused.
- Registration needs an operator session opened within the last ten minutes, or the operator code typed again (same lockout as the code login). The challenge is bound to that session.
- A passkey sign-in opens the same eight-hour operator session as the code login and is written to the audit log. The code login remains available as the fallback.
- The iPhone app declares `webcredentials:orbitq8.web.app`; Firebase Hosting serves `/.well-known/apple-app-site-association` as JSON for app `55V8UB9X3H.com.dralfailakawi.orbit`.
