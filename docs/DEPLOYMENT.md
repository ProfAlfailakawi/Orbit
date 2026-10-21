# ORBIT deployment status

ORBIT is deployed as a standalone production app at <https://orbitq8.web.app>.

- Firebase Hosting serves the React application.
- Cloud Run runs the authenticated Express API with `min-instances=0`.
- Cloud Firestore stores the persistent application state.
- A GitHub Actions schedule invokes the authenticated read-only GitHub monitor daily; a Firestore gate limits full scans to once every 72 hours. A manual GitHub sync is also available in the dashboard.

Deploy from GitHub Actions using **Deploy ORBIT production**. The workflow runs `npm ci` and `npm run check`, deploys Cloud Run and Hosting, then verifies that the build ID served by both matches the deployed commit. It uses Workload Identity Federation; no Google service-account key or browser Firebase API key is required.

Cloud Run scales to zero, but this project uses Google Cloud billing. Costs can occur if usage exceeds free quotas; a budget alert is not a hard spending cap. See [the Arabic deployment guide](PRODUCTION-DEPLOYMENT-AR.md) for setup and cost details.
