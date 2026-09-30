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

// Automatically purge legacy caches and stale storage on app boot
try {
  const PURGE_FLAG = 'spenddesk_cache_purged_v6';
  if (localStorage.getItem(PURGE_FLAG) !== 'true') {
    const keysToPurge: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (
        k.startsWith('money_tracker_transactions') ||
        k.startsWith('money_tracker_lend') ||
        k.startsWith('money_tracker_last_offline') ||
        k.startsWith('spenddesk_pending') ||
        k.startsWith('spenddesk_sheet') ||
        k.startsWith('money_tracker_pending') ||
        k === 'spenddesk_workspace_sync' ||
        k === 'money_tracker_transactions_v2' ||
        k === 'money_tracker_lend_items_v2'
      )) {
        keysToPurge.push(k);
      }
    }
    keysToPurge.forEach((key) => localStorage.removeItem(key));
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
