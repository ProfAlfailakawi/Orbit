# Deployment status

ORBIT is configured for the standalone Firebase project `orbit-one-orbit-2026`. It is **not deployed**. Firebase Hosting is prepared to rewrite `/api/**` to Express on Cloud Run, but Cloud Run/Cloud Scheduler deployment requires Firebase Blaze/Google Cloud billing. The project currently has billing disabled to honor the no-cost requirement.

See [the Arabic deployment and status guide](PRODUCTION-DEPLOYMENT-AR.md) for the verified project state, free-tier limits, and remaining work. Do not deploy Hosting alone: the current frontend depends on Express APIs for authentication and dashboard operations.
