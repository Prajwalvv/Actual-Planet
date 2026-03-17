/**
 * auth-nav.js — Lightweight auth-aware navigation
 * Include on any public page to swap "Log in / Get Started" with "Console" when logged in.
 * Works independently of firebase-init.js (uses its own Firebase app instance).
 */
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyDw6suBO9JCaRNMsBeq2_19ImHOY-A9plg",
  authDomain: "rylvo-vid.firebaseapp.com",
  projectId: "rylvo-vid",
  storageBucket: "rylvo-vid.firebasestorage.app",
  messagingSenderId: "955502335900",
  appId: "1:955502335900:web:2400135866d41d63ca1a59",
  measurementId: "G-29GKL11H7K"
};

// Reuse existing Firebase app if already initialized, otherwise create one
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

let currentUser = null;

function updateNavCtas() {
  const navCtas = document.querySelectorAll('.nav-cta');
  navCtas.forEach(cta => {
    if (cta.dataset.authHandled === (currentUser ? 'logged-in' : 'logged-out')) return;
    if (currentUser) {
      cta.innerHTML = `<a href="/console" class="btn btn-primary btn-sm">Console</a>`;
      cta.dataset.authHandled = 'logged-in';
    } else {
      if (!cta.querySelector('a[href="/login"]')) {
        cta.innerHTML = `
          <a href="/login" class="btn btn-ghost">Log in</a>
          <a href="/signup" class="btn btn-primary btn-sm">Get Started</a>`;
      }
      cta.dataset.authHandled = 'logged-out';
    }
  });

  // Update mobile menu CTA section
  const mobileCtas = document.querySelectorAll('.mobile-menu-cta');
  mobileCtas.forEach(cta => {
    if (cta.dataset.authHandled === (currentUser ? 'logged-in' : 'logged-out')) return;
    if (currentUser) {
      cta.innerHTML = `<a href="/console" class="btn btn-primary">Console</a>`;
      cta.dataset.authHandled = 'logged-in';
    } else {
      if (!cta.querySelector('a[href="/login"]')) {
        cta.innerHTML = `
          <a href="/login" class="btn btn-ghost">Log in</a>
          <a href="/signup" class="btn btn-primary">Get Started</a>`;
      }
      cta.dataset.authHandled = 'logged-out';
    }
  });

  // Also update hero CTA "Deploy agents" → "Open Console" if logged in
  if (currentUser) {
    document.querySelectorAll('a[href="signup.html"], a[href="/signup"]').forEach(a => {
      if (a.classList.contains('btn-primary') && a.closest('.hero-cta')) {
        a.href = '/console';
        a.textContent = 'Open Console';
      }
    });
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  updateNavCtas();
});

// Watch for dynamically rendered .nav-cta and .mobile-menu-cta (React apps render after this script)
const observer = new MutationObserver(() => {
  const ctas = document.querySelectorAll('.nav-cta, .mobile-menu-cta');
  if (ctas.length > 0) updateNavCtas();
});
observer.observe(document.body, { childList: true, subtree: true });

// Stop observing after 10s to avoid unnecessary overhead
setTimeout(() => observer.disconnect(), 10000);
