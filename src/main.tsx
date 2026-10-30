import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import './index.css';

// Make the app light-only before the first React paint.
try {
  document.documentElement.classList.remove('dark');
  localStorage.setItem('spenddesk_theme', 'light');
} catch {}

// Automatically purge legacy unscoped keys and reset active sheets for fresh setup
try {
  const PURGE_FLAG = 'spenddesk_legacy_cleanup_v8';
  if (localStorage.getItem(PURGE_FLAG) !== 'true') {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes('active_sheet') || k === 'money_tracker_active_sheet_v2')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(PURGE_FLAG, 'true');
  }
} catch (e) {}

// THE UI IS STORED IN THE BROWSER, ON PURPOSE.
// public/sw.js caches the app shell so a later open - with no wifi, no data,
// or a dead tab - paints the same interface instead of a blank page, and the
// ledger keeps running on local storage until the connection returns.
// Navigations are network-first inside the worker, so a fresh deploy is still
// picked up straight away. Development never registers it: the dev server
// must never be answered from a cache, and any stale worker is dropped.
try {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    if (import.meta.env.PROD) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
      });
    } else {
      navigator.serviceWorker.getRegistrations?.().then((registrations) =>
        Promise.all(registrations.map((r) => r.unregister()))
      ).catch(() => {});
    }
  }
} catch (e) {}

// Block touch pinch zoom and gesture zooming on iOS Safari / Mobile browsers
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());
document.addEventListener('touchstart', (e) => {
  if (e.touches && e.touches.length > 1) {
    e.preventDefault();
  }
}, { passive: false });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
