import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';

interface SetNewPasswordModalProps {
  isOpen: boolean;
  /** Closes the modal (after a successful save, or on cancel). */
  onClose: () => void;
  /** Persists the new password. Return false-equivalent message to keep it open. */
  onSave: (password: string) => Promise<{ success: boolean; message?: string }>;
}

/**
 * The screen the emailed "Reset password" link opens.
 *
 * Supabase hands the browser a short-lived RECOVERY session; this card is
 * where that session gets its new password (`auth.updateUser`). Deliberately
 * quiet and single-purpose: one lock glyph, one sentence, two fields, one
 * green button — the same card language as the other dialogs.
 */
export const SetNewPasswordModal: React.FC<SetNewPasswordModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (password.length < 6) {
      setError('Choose a password of at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Both passwords must match.');
      return;
    }
    setBusy(true);
    const res = await onSave(password);
    setBusy(false);
    if (!res.success) {
      setError(res.message || 'Could not save the new password. The link may have expired — request a fresh one.');
      return;
    }
    setPassword('');
    setConfirm('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-[5px] animate-in fade-in duration-150"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="relative w-full max-w-[340px] bg-white rounded-[26px] shadow-[0_32px_70px_-16px_rgba(15,23,42,0.45)] px-6 pt-12 pb-6 animate-in zoom-in-95 fade-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="set-password-title"
      >
        {/* Key glyph breaking the top edge of the card */}
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full flex items-center justify-center ring-4 ring-white shadow-sm bg-emerald-100 text-emerald-700">
          <KeyRound className="w-6 h-6 stroke-[2.2]" />
        </div>

        <h3
          id="set-password-title"
          className="text-[16px] font-bold text-slate-900 tracking-[-0.01em] leading-snug text-center"
        >
          Choose a new password
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-500 text-center">
          Your reset link is valid. Set the new password for your SpendDesk account.
        </p>

        <div className="mt-5 space-y-2.5">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              aria-label="New password"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-4 pr-11 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:text-slate-600 cursor-pointer"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat new password"
              autoComplete="new-password"
              aria-label="Repeat new password"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-4 pr-4 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white"
            />
          </div>
        </div>

        {error && (
          <div
            className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] leading-snug text-rose-600"
            role="alert"
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#10b77f] text-[15px] font-bold text-white shadow-[0_10px_24px_-12px_rgba(16,183,127,0.9)] transition-all hover:bg-[#0ea372] active:scale-[0.99] cursor-pointer disabled:pointer-events-none disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="h-[18px] w-[18px] animate-spin" />
              <span>Saving…</span>
            </>
          ) : (
            <>
              <span>Save new password</span>
              <span aria-hidden="true">→</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="mt-3 block w-full text-center text-xs font-semibold text-slate-400 transition-colors hover:text-slate-600 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default SetNewPasswordModal;
