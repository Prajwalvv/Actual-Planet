/**
 * FIREBASE CLIENT SDK — Shared by all site pages
 * 
 * Architecture:
 * - Client handles ONLY authentication (Firebase Auth)
 * - ALL Firestore writes go through the server API (Admin SDK)
 * - After every auth action, calls POST /api/sync-user to create/update user doc
 * - Console reads go through server API endpoints (/api/me, /api/keys, etc.)
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-analytics.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  GithubAuthProvider,
  signOut,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';

// ─── Firebase Config ─────────────────────────

const firebaseConfig = {
  apiKey: "AIzaSyDw6suBO9JCaRNMsBeq2_19ImHOY-A9plg",
  authDomain: "rylvo-vid.firebaseapp.com",
  projectId: "rylvo-vid",
  storageBucket: "rylvo-vid.firebasestorage.app",
  messagingSenderId: "955502335900",
  appId: "1:955502335900:web:2400135866d41d63ca1a59",
  measurementId: "G-29GKL11H7K"
};

const app = initializeApp(firebaseConfig);
let analytics;
try { analytics = getAnalytics(app); } catch(e) { console.warn('[SwarmAuth] Analytics not available:', e.message); }
const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

// ─── API Base ────────────────────────────────
// In production (Firebase Hosting), API is on same origin.
// In local dev, API server runs on port 3388 regardless of which port serves the HTML.
const API_BASE = (() => {
  const loc = window.location;
  if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
    return `${loc.protocol}//localhost:3388`;
  }
  return loc.origin;
})();

// ─── Server Sync ─────────────────────────────
// Called after EVERY auth action. Server creates/updates user doc via Admin SDK.
// This bypasses Firestore rules entirely — no client-side Firestore writes needed.

async function syncToServer(user, provider = 'email') {
  try {
    const token = await user.getIdToken();
    const res = await fetch(`${API_BASE}/api/sync-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        displayName: user.displayName || null,
        photoURL: user.photoURL || null,
        provider,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('[SwarmAuth] sync-user failed:', data.error);
    }
    return data;
  } catch (err) {
    console.error('[SwarmAuth] sync-user network error:', err);
    return { ok: false, error: err.message };
  }
}

// ─── Auth Functions ──────────────────────────

async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await syncToServer(cred.user, 'email');
  return cred.user;
}

async function signupWithEmail(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  await syncToServer(cred.user, 'email');
  return cred.user;
}

async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  await syncToServer(result.user, 'google.com');
  return result.user;
}

async function loginWithGithub() {
  const result = await signInWithPopup(auth, githubProvider);
  await syncToServer(result.user, 'github.com');
  return result.user;
}

async function logout() {
  await signOut(auth);
  window.location.href = '/login';
}

// ─── Auth State Observer ─────────────────────

function onAuth(callback) {
  onAuthStateChanged(auth, callback);
}

function getCurrentUser() {
  return auth.currentUser;
}

async function getIdToken() {
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken();
}

// ─── Export to window (for non-module pages) ──

window.SwarmAuth = {
  loginWithEmail,
  signupWithEmail,
  loginWithGoogle,
  loginWithGithub,
  logout,
  onAuth,
  getCurrentUser,
  getIdToken,
  syncToServer,
  auth,
};
