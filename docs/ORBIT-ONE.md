# ORBIT ONE — hidden intelligence and verification

Visible daily UI: ONE quiet dashboard. The entire عيون أوربت section is removed. No new nav, named-engine panels or complex controls. Existing orbital infographic remains and has visual refinements.

Implemented server-only functions:
- GHOST: external opt-in GitHub Actions runner performs safe GET-only reachability checks; it does not simulate authenticated user journeys or payments.
- TRUTH: compare explicitly supplied UI success with negative authoritative server confirmation; no fabricated error when outcome is unknown.
- CINEMA: privacy-safe action metadata timeline from authenticated sensor breadcrumbs only; not screen recording, DOM capture or session replay.
- BUTTERFLY: advisory-only cross-app dependency overlap, NOT proven failure of other programs.
- REPAIR: automatically append verified evidence, available metadata, regression requirements and uncertainty to one-click repair prompt.
- SELF GUARDIAN: public /healthz liveness endpoint and independent scheduled GitHub runner, opt-in.
- FUTURE RADAR: evidence-qualified risk checks based on real Live GitHub commits only.

Optional GitHub repository secrets required for independent checks:
ORBIT_HEALTHCHECK_URL = https://your-orbit-production-host/healthz
ORBIT_GHOST_TARGETS = JSON array containing up to 15 publicly accessible HTTPS read-only URLs.
Until those secrets are configured, this external guard reports UNCONFIGURED. A successful GET does NOT establish that user journeys work. GitHub Actions schedule can run late; external push delivery remains unconfigured.

Optional authenticated server-side sensor payload: outcomeEvidence: {uiReportedSuccess: true, serverRecordConfirmed: false, httpStatus: 200}; breadcrumbs: [{kind:'ui_action',operation:'save.click',outcome:'success'}]. Sensor app-scoped token must never be included in client/browser JS.

No changes to any monitored app repository or real payment/auth/data flows. Real synthetic user journey testing would require a dedicated sandbox, designated test users and application-specific integration (not performed). No automatic deploy or fix. Production URL not established by repository tests.
