# ORBIT operator access

Set `ORBIT_OPERATOR_PASSKEY` as a unique random secret of at least 16 characters in the server environment. Do not commit the value or expose it through Vite variables.

This security change removes the hardcoded default credential and locks all `/api` endpoints behind an HTTP-only same-site operator session. The session is in memory and expires after eight hours; restarting the server requires logging in again.

Before deployment, verify login, refresh/session recovery, all dashboard reads, event streaming, Google cloud sync, and incident/fleet operations. Sensor ingestion from external applications is intentionally disabled until a separately authenticated integration endpoint is implemented.

**Important:** Existing seed data represents examples, not independently verified live incidents. Do not rely on seed metrics as production truth. Additional work is required to isolate all demonstration data and complete monitoring integrations.

No changes were made to the eleven monitored application repositories.
