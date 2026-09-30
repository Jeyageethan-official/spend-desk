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

// Remove all legacy service workers and CacheStorage to guarantee fresh bundles
try {
  if (typeof caches !== 'undefined' && caches.keys) {
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).catch(() => {});
  }
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations?.().then((registrations) =>
      Promise.all(registrations.map((r) => r.unregister()))
    ).catch(() => {});
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
