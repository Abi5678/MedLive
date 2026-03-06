#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# MedLive — Build + Deploy to Cloud Run
# Usage: bash scripts/deploy.sh [--skip-build] [--skip-seed]
# ---------------------------------------------------------------------------
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-medlive-488722}"
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
SERVICE_NAME="medlive"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

SKIP_BUILD=false
SKIP_SEED=false

for arg in "$@"; do
  case $arg in
    --skip-build) SKIP_BUILD=true ;;
    --skip-seed)  SKIP_SEED=true  ;;
  esac
done

echo "🚀 MedLive Deploy — project: ${PROJECT_ID}, region: ${REGION}"
echo ""

# ---------------------------------------------------------------------------
# 1. Build + push Docker image via Cloud Build
# ---------------------------------------------------------------------------
if [ "${SKIP_BUILD}" = false ]; then
  echo "1️⃣  Building Docker image with Cloud Build..."
  gcloud builds submit \
    --tag "${IMAGE}" \
    --project "${PROJECT_ID}" \
    .
  echo "   ✓ Image built: ${IMAGE}"
else
  echo "1️⃣  Skipping build (--skip-build)"
fi

# ---------------------------------------------------------------------------
# 2. Deploy to Cloud Run
# ---------------------------------------------------------------------------
echo "2️⃣  Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 1 \
  --max-instances 10 \
  --concurrency 80 \
  --timeout 3600 \
  --memory 2Gi \
  --cpu 2 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${REGION},GOOGLE_GENAI_USE_VERTEXAI=FALSE,MEDLIVE_MODEL=gemini-2.5-flash-native-audio-latest,USE_FIRESTORE=true,GOOGLE_APPLICATION_CREDENTIALS=/secrets/firebase-admin-sdk.json" \
  --set-secrets "GOOGLE_API_KEY=medlive-google-api-key:latest,/secrets/firebase-admin-sdk.json=medlive-firebase-admin:latest,REMINDERS_TRIGGER_SECRET=medlive-reminders-secret:latest" \
  --project "${PROJECT_ID}"

echo "   ✓ Cloud Run service deployed"

# ---------------------------------------------------------------------------
# 3. Get the service URL
# ---------------------------------------------------------------------------
echo "3️⃣  Fetching service URL..."
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format "value(status.url)")

echo ""
echo "✅  Live at: ${SERVICE_URL}"
echo ""

# ---------------------------------------------------------------------------
# 4. Seed Firestore with demo data (first deploy only)
# ---------------------------------------------------------------------------
if [ "${SKIP_SEED}" = false ]; then
  echo "4️⃣  Seeding Firestore with demo data..."
  if [ -f ".env" ]; then
    # Source .env so GOOGLE_APPLICATION_CREDENTIALS is set for the seed script
    set -a; source .env; set +a
  fi
  uv run python scripts/seed_firestore.py && echo "   ✓ Demo data seeded" || echo "   ⚠️  Seed failed — check GOOGLE_APPLICATION_CREDENTIALS"
else
  echo "4️⃣  Skipping seed (--skip-seed)"
fi

# ---------------------------------------------------------------------------
# 5. Reminder
# ---------------------------------------------------------------------------
echo ""
echo "📋  Post-deploy checklist:"
echo "   [ ] Enable Google Sign-In in Firebase Console → Authentication → Sign-in providers"
echo "   [ ] Add ${SERVICE_URL} to Firebase Authorized Domains"
echo "   [ ] Update MEDLIVE_APP_URL to ${SERVICE_URL} in Cloud Scheduler job"
echo "   [ ] Set VAPID_KEY env var for push notifications (Firebase Console → Project Settings → Cloud Messaging)"
echo ""
echo "🔗  Firebase Console: https://console.firebase.google.com/project/${PROJECT_ID}"
echo "🔗  Cloud Run: https://console.cloud.google.com/run/detail/${REGION}/${SERVICE_NAME}?project=${PROJECT_ID}"
