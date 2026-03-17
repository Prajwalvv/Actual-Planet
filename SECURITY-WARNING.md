# ⚠️ SECURITY WARNING - ACTION REQUIRED

## Exposed API Keys Found

The following files contain **hardcoded Firebase API keys** that should be moved to environment variables:

### Files to Update:

1. **`swarm-core/public/site/firebase-init.js`** (lines 27-35)
   - Contains Firebase client config with API key
   
2. **`swarm-core/src/firebase-config.ts`** (line 16)
   - References service account JSON file path

### What You Need To Do:

#### Option 1: Move to Environment Variables (Recommended for Production)
1. Create a `.env` file (already in `.gitignore`)
2. Move sensitive values there
3. Use `process.env.VARIABLE_NAME` to access them

#### Option 2: Keep As-Is But Understand the Risk
- Firebase client API keys are **meant to be public** (they're used in browsers)
- Security is handled by Firebase Security Rules, not by hiding the key
- The service account JSON file is the **real secret** - make sure it's in `.gitignore`

### Current Status:
✅ `.gitignore` created - will exclude:
   - `.env` files
   - `*firebase-adminsdk*.json` files
   - `serviceAccount*.json` files
   - Other sensitive files

✅ `.env.example` created - template for environment variables

### Before Pushing to GitHub:
1. **Check if `rylvo-vid-firebase-adminsdk-fbsvc-298fc1f402.json` exists**
2. **Make sure it's NOT being committed** (it's in `.gitignore`)
3. Consider regenerating service account keys after making repo public

---

**Note:** Firebase client-side API keys are designed to be public. The real security comes from Firebase Security Rules. However, service account keys must NEVER be exposed.
