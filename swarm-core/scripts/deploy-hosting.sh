#!/bin/bash
# ═══════════════════════════════════════════════
# Deploy static site to Firebase Hosting
# ═══════════════════════════════════════════════
set -e

echo "🔥 Deploying to Firebase Hosting..."

# Ensure firebase CLI is available
if ! command -v firebase &> /dev/null; then
  echo "❌ Firebase CLI not found. Install: npm install -g firebase-tools"
  exit 1
fi

# Deploy hosting only (not functions/firestore)
firebase deploy --only hosting --project rylvo-vid

echo "✅ Hosting deployed!"
echo "🌐 https://rylvo-vid.web.app"
