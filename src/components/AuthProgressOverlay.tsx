import React, { useEffect, useRef } from 'react';
import {
  AuthPhaseState,
  clearAuthPhase,
  failAuthPhase,
  subscribeAuthPhase,
} from '../lib/authPhase';

const EXCHANGE_TIMEOUT_MS = 25000;
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

const AuthSpinner: React.FC = () => (
  <div className="auth-spinner" aria-hidden="true" />
);

const AuthMark: React.FC<{ kind: 'success' | 'error' }> = ({ kind }) => (
  <div className={`auth-mark auth-mark--${kind}`} aria-hidden="true">
    {kind === 'success' ? (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M4 9.2 7.2 12.4 14 5.4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ) : (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M5 5l8 8M13 5l-8 8"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    )}
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
          {busy && <AuthSpinner />}
          {state.phase === 'connected' && <AuthMark kind="success" />}
          {state.phase === 'error' && <AuthMark kind="error" />}
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
