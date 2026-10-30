import React, { useEffect, useRef } from 'react';
import {
  AuthPhaseState,
  clearAuthPhase,
  failAuthPhase,
  subscribeAuthPhase,
} from '../lib/authPhase';
import { SpendDeskLogo } from './SpendDeskLogo';

// A cancelled Google chooser returns to the app without a session.  Keep this
// short so the person sees the retry action instead of a long frozen loader.
const EXCHANGE_TIMEOUT_MS = 7000;
const SUCCESS_DISMISS_MS = 1600;

const friendlyAuthMessage = (raw?: string): string => {
  const msg = (raw || '').toLowerCase();
  if (!raw) return 'We couldn’t connect to Google. Please try again.';
  if (
    msg.includes('cancelled') ||
    msg.includes('canceled') ||
    msg.includes('access_denied') ||
    msg.includes('closed')
  ) {
    return 'Sign-in was cancelled. You can try again whenever you’re ready.';
  }
  if (msg.includes('taking too long') || msg.includes('timeout')) {
    return 'This is taking longer than expected. Please try again.';
  }
  if (msg.includes('gesture') || msg.includes('tap inside') || msg.includes('tap "connect')) {
    return 'Tap Sign in with Google to continue.';
  }
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('offline')) {
    return 'Check your connection and try again.';
  }
  if (
    msg.includes('oauth') ||
    msg.includes('supabase') ||
    msg.includes('provider') ||
    msg.includes('invalid') ||
    msg.includes('exception') ||
    msg.includes('failed to initialize')
  ) {
    return 'We couldn’t complete Google sign-in. Please try again.';
  }
  if (raw.length > 140) return 'We couldn’t connect to Google. Please try again.';
  return raw;
};

const copyFor = (state: AuthPhaseState): { title: string; subtitle: string } => {
  const cause = (state.cause || '').toLowerCase();
  const reconnect = /reconnect|connect google|session|sign in again|expired/.test(cause);

  switch (state.phase) {
    case 'redirecting':
      return reconnect
        ? { title: 'Reconnecting Google', subtitle: 'Securely restoring your account…' }
        : { title: 'Connecting to Google', subtitle: 'Securely connecting your account…' };
    case 'exchanging':
      return reconnect
        ? { title: 'Reconnecting', subtitle: 'Finishing a secure connection…' }
        : { title: 'Signing you in', subtitle: 'Finishing a secure connection…' };
    case 'connected':
      return {
        title: 'You’re signed in',
        subtitle: state.email || 'Your account is ready.',
      };
    case 'error':
      return { title: 'Couldn’t connect', subtitle: friendlyAuthMessage(state.message) };
    default:
      return { title: '', subtitle: '' };
  }
};

const GoogleMark: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.86 2.7-6.62Z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z"
    />
    <path
      fill="#FBBC05"
      d="M3.95 10.7A5.41 5.41 0 0 1 3.66 9c0-.59.1-1.16.29-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.03l2.99-2.33Z"
    />
    <path
      fill="#EA4335"
      d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58Z"
    />
  </svg>
);

const AuthLink: React.FC<{ status: 'connecting' | 'success' | 'error' }> = ({ status }) => (
  <div className={`auth-link auth-link--${status}`} aria-hidden="true">
    <span className="auth-link__mark auth-link__mark--logo">
      <SpendDeskLogo variant="icon" size="sm" />
    </span>
    <span className="auth-link__line">
      <span className="auth-link__fill" />
      {status === 'success' && (
        <span className="auth-link__check">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M2.4 7.2 5.4 10.1 11.6 3.6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
    </span>
    <span className="auth-link__mark">
      <GoogleMark />
    </span>
  </div>
);

/**
 * Compact SpendDesk Google authentication modal.
 *
 * Phases are owned by authPhase.ts; this component only presents them.
 * In-flight states time out after 25s so the overlay cannot stick forever.
 */
export const AuthProgressOverlay: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => {
  const [state, setState] = React.useState<AuthPhaseState | null>(null);
  const timerRef = useRef<number | null>(null);

  React.useEffect(() => subscribeAuthPhase(setState), []);

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (state?.phase === 'exchanging' || state?.phase === 'redirecting') {
      timerRef.current = window.setTimeout(() => {
        failAuthPhase(
          'Sign-in is taking too long — it may have been cancelled. Try again.'
        );
      }, EXCHANGE_TIMEOUT_MS);
    }
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [state?.phase, state?.at]);

  useEffect(() => {
    if (state?.phase !== 'connected') return;
    const t = window.setTimeout(() => clearAuthPhase(), SUCCESS_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [state?.phase, state?.at]);

  if (!state || state.phase === 'idle') return null;

  const copy = copyFor(state);
  const busy = state.phase === 'redirecting' || state.phase === 'exchanging';
  const statusLabel =
    state.phase === 'connected'
      ? 'Signed in'
      : state.phase === 'error'
        ? 'Sign-in did not finish'
        : copy.title;

  return (
    <div
      className="auth-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && state.phase === 'error') clearAuthPhase();
      }}
    >
      <div
        className="auth-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-progress-title"
        aria-describedby="auth-progress-message"
        aria-live="polite"
        aria-busy={busy}
        aria-label={statusLabel}
      >
        <div className="auth-card__glyph">
          <AuthLink
            status={busy ? 'connecting' : state.phase === 'connected' ? 'success' : 'error'}
          />
        </div>

        <p id="auth-progress-title" className="auth-card__title">
          {copy.title}
        </p>
        <p id="auth-progress-message" className="auth-card__subtitle">
          {copy.subtitle}
        </p>

        {state.phase === 'error' && (
          <div className="auth-card__actions">
            <button
              type="button"
              className="auth-card__primary"
              onClick={() => {
                if (onRetry) onRetry();
              }}
            >
              Retry
            </button>
            <button
              type="button"
              className="auth-card__secondary"
              onClick={() => clearAuthPhase()}
            >
              Not now
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthProgressOverlay;
