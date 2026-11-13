# ORBIT deployment status

ORBIT is deployed as a standalone production app at <https://orbitq8.web.app>.

- Firebase Hosting serves the React application.
- Cloud Run runs the authenticated Express API with `min-instances=0`.
- Cloud Firestore stores the persistent application state.
- GitHub Actions schedules invoke the authenticated endpoints: the site watch (`orbit-watch.yml`) and the read-only GitHub monitor (`orbit-monitor.yml`) monthly on the 1st, the real-browser visitor (`orbit-visitor.yml`) weekly on Sunday. A Firestore gate also limits full GitHub scans to once every 72 hours. Opening the dashboard and its «تحديث» button run the watch and GitHub sync on demand. The dashboard's "monitoring went silent" warning follows the monthly watch schedule (`WATCH_STALE_MINUTES` in `src/core/fleetStatus.ts`).

Deploy from GitHub Actions using **Deploy ORBIT production**. The workflow runs `npm ci` and `npm run check`, deploys Cloud Run and Hosting, then verifies that the build ID served by both matches the deployed commit. It uses Workload Identity Federation; no Google service-account key or browser Firebase API key is required.

Cloud Run scales to zero, but this project uses Google Cloud billing. Costs can occur if usage exceeds free quotas; a budget alert is not a hard spending cap. See [the Arabic deployment guide](PRODUCTION-DEPLOYMENT-AR.md) for setup and cost details.
