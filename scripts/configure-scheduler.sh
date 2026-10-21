#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${REGION:=me-central1}"
: "${SCHEDULE_CRON:=0 8 * * *}"
: "${TIME_ZONE:=Asia/Kuwait}"
: "${SERVICE_ACCOUNT:?Set scheduler service account email}"
: "${SERVICE_URL:?Set the deployed Cloud Run service URL}"

ARGS=(--project "$PROJECT_ID" --location "$REGION" --schedule "$SCHEDULE_CRON" --time-zone "$TIME_ZONE"
  --uri "${SERVICE_URL}/internal/scheduler/github-sync" --http-method POST
  --oidc-service-account-email "$SERVICE_ACCOUNT" --oidc-token-audience "$SERVICE_URL"
  --attempt-deadline 300s --max-backoff 600s --max-retry-attempts 2)
if gcloud scheduler jobs describe orbit-github-sync --project "$PROJECT_ID" --location "$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http orbit-github-sync "${ARGS[@]}"
else
  gcloud scheduler jobs create http orbit-github-sync "${ARGS[@]}"
fi
