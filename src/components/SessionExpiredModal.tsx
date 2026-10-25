import React from 'react';
import { Loader2 } from 'lucide-react';

export type SessionNoticeKind = 'session' | 'google';

interface SessionExpiredModalProps {
  /** null = nothing to report. */
  kind: SessionNoticeKind | null;
  /** True while the reconnect action is running. */
  isSigningIn?: boolean;
  onSignIn: () => void;
  onDismiss: () => void;
}

/**
 * The connection-lost alert.
 *
 * Deliberately an Apple-style alert: one short title, one short sentence, two
 * actions. Earlier versions carried a status banner, a Paused/Still-working
 * panel and a header bar - more surface than the moment deserves, and it read
 * like a system error rather than a routine re-auth prompt.
 *
 * Two shapes, because they need different words:
 *   'session' - the sign-in itself died (long idle, revoked on another
 *               device). Cloud backup and Google Sheet sync are both paused.
 *   'google'  - the sign-in is alive but Google access is gone, so only the
 *               Google Sheet stops updating.
 *
 * It never blocks the app: dismissing returns the user straight to their data
 * exactly as it was.
 */
export const SessionExpiredModal: React.FC<SessionExpiredModalProps> = ({
  kind,
  isSigningIn = false,
  onSignIn,
  onDismiss,
}) => {
  if (!kind) return null;

  const isSession = kind === 'session';
  const title = isSession ? 'Session expired' : 'Google access expired';
  const message = isSession
    ? 'Sign in again to resume syncing.'
    : 'Reconnect Google to resume sheet sync.';
  const primaryLabel = isSession ? 'Sign in again' : 'Reconnect Google';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/20 backdrop-blur-[5px] animate-in fade-in duration-150"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSigningIn) onDismiss();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="connection-alert-title"
        aria-describedby="connection-alert-message"
        className="w-full max-w-[300px] bg-white rounded-[22px] shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)] px-6 pt-7 pb-5 text-center animate-in zoom-in-95 fade-in duration-200"
      >
        <p
          id="connection-alert-title"
          className="text-[16px] font-semibold text-slate-900 tracking-[-0.01em]"
        >
          {title}
        </p>
        <p id="connection-alert-message" className="mt-1.5 text-[13px] leading-snug text-slate-500">
          {message}
        </p>

        <div className="mt-6 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onSignIn}
            disabled={isSigningIn}
            className="w-full h-9 rounded-full bg-slate-900 text-white text-[14px] font-medium flex items-center justify-center gap-1.5 hover:bg-slate-800 active:scale-[0.97] transition cursor-pointer disabled:opacity-60"
          >
            {isSigningIn ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Signing in…
              </>
            ) : (
              primaryLabel
            )}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={isSigningIn}
            className="w-full h-9 rounded-full text-slate-500 text-[14px] font-medium hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer disabled:opacity-40"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};