# ORBIT operator access

Set `ORBIT_OPERATOR_PASSKEY` as a unique random secret of at least 16 characters in the server environment. Do not commit the value or expose it through Vite variables.

The server removes hardcoded credentials and locks `/api` endpoints behind an HTTP-only, same-site operator session. In Cloud Run production, hashed session identifiers and expiry values are persisted in Firestore so sessions survive instance replacement and restart. Local development keeps sessions in memory. Sessions expire after eight hours. The standalone Firebase project is provisioned, but the app is not deployed and billing is disabled; Cloud Run is therefore not active.

Before production deployment, verify login, refresh/session recovery, all dashboard reads, event streaming, Firestore persistence, and incident/fleet operations. The code has an OIDC-verified scheduler endpoint, but no Cloud Scheduler job is deployed. Sensor ingestion remains separately credentialed.

**Important:** Existing seed data represents examples, not independently verified live incidents. Do not rely on seed metrics as production truth. Additional work is required to isolate all demonstration data and complete monitoring integrations.

No changes were made to the eleven monitored application repositories.
