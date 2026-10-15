import React, { useEffect, useRef } from 'react';
import {
  AuthPhaseState,
  clearAuthPhase,
  failAuthPhase,
  subscribeAuthPhase,
} from '../lib/authPhase';

/**
 * Full-screen sign-in progress overlay.
 *
 * Makes every phase of the Google round-trip visible:
 *  - redirecting: "Redirecting to Google…" + who started it (cause)
 *  - exchanging:  "Completing sign-in…" while Supabase swaps the code
 *  - connected:   green confirmation with the account, auto-dismisses
 *  - error:       what went wrong + Try again / Continue without signing in
 *
 * A stuck exchange (user closed Google's window, network died) surfaces as a
 * timeout error after 25s instead of leaving a silently half-booted screen.
 */
export const AuthProgressOverlay: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => {
  const [state, setState] = React.useState<AuthPhaseState | null>(null);
  const timerRef = useRef<number | null>(null);

  React.useEffect(() => subscribeAuthPhase(setState), []);

  // Exchange watchdog: in-flight phases must land within 25 seconds.
  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (state?.phase === 'exchanging' || state?.phase === 'redirecting') {
      timerRef.current = window.setTimeout(() => {
        failAuthPhase(
          'Sign-in is taking too long - it may have been cancelled or closed at Google. Try again.'
        );
      }, 25000);
    }
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [state?.phase, state?.at]);

  // "Connected" confirmation auto-clears back to the app.
  useEffect(() => {
    if (state?.phase !== 'connected') return;
    const t = window.setTimeout(() => clearAuthPhase(), 1800);
    return () => window.clearTimeout(t);
  }, [state?.phase, state?.at]);

  if (!state || state.phase === 'idle') return null;

  const cause = state.cause ? state.cause : '';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs px-4"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
    >
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 text-center">
        {state.phase === 'redirecting' && (
          <>
            <div className="mx-auto mb-4 h-10 w-10 rounded-full border-[3px] border-slate-200 border-t-slate-900 animate-spin" />
            <h3 className="text-sm font-bold text-slate-900">Redirecting to Google…</h3>
            <p className="mt-1.5 text-xs text-slate-500">
              Google's sign-in page will open. You'll come right back here.
            </p>
            {cause && (
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Started by: {cause}
              </p>
            )}
          </>
        )}

        {state.phase === 'exchanging' && (
          <>
            <div className="mx-auto mb-4 h-10 w-10 rounded-full border-[3px] border-slate-200 border-t-emerald-600 animate-spin" />
            <h3 className="text-sm font-bold text-slate-900">Completing sign-in…</h3>
            <p className="mt-1.5 text-xs text-slate-500">
              Securely finishing the Google handshake. One moment.
            </p>
            {cause && (
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Started by: {cause}
              </p>
            )}
          </>
        )}

        {state.phase === 'connected' && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
              ✓
            </div>
            <h3 className="text-sm font-bold text-slate-900">Signed in</h3>
            {state.email && <p className="mt-1 text-xs text-slate-500">{state.email}</p>}
          </>
        )}

        {state.phase === 'error' && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-xl text-red-600">
              !
            </div>
            <h3 className="text-sm font-bold text-slate-900">Sign-in didn't finish</h3>
            <p className="mt-1.5 text-xs text-slate-500">{state.message || 'Something went wrong.'}</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  clearAuthPhase();
                  if (onRetry) onRetry();
                }}
                className="flex-1 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white cursor-pointer hover:bg-slate-800"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => clearAuthPhase()}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 cursor-pointer hover:bg-slate-50"
              >
                Continue
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthProgressOverlay;
