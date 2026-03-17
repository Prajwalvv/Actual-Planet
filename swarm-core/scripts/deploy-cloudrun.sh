#!/bin/bash
# ═══════════════════════════════════════════════
# Deploy Swarm API + Engine to Cloud Run
# ═══════════════════════════════════════════════
set -e

PROJECT_ID="rylvo-vid"
REGION="us-central1"
SERVICE_NAME="swarm-api"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🐜 Building container image..."
gcloud builds submit --tag "${IMAGE}" --project "${PROJECT_ID}"

echo "🚀 Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --min-instances 1 \
  --max-instances 5 \
  --set-env-vars "NODE_ENV=production,SWARM_API_PORT=8080" \
  --port 8080

echo ""
echo "✅ Cloud Run deployed!"
echo "🔗 URL: $(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --project ${PROJECT_ID} --format 'value(status.url)')"
echo ""
echo "Next: Run deploy-hosting.sh to point Firebase Hosting at this service."
