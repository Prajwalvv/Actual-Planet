#!/bin/bash
# ═══════════════════════════════════════════════
# Deploy Firestore rules + indexes
# ═══════════════════════════════════════════════
set -e

echo "🔒 Deploying Firestore rules + indexes..."

firebase deploy --only firestore --project rylvo-vid

echo "✅ Firestore rules and indexes deployed!"
