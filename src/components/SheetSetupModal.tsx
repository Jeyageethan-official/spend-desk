import React from 'react';
import { Loader2 } from 'lucide-react';

export type SheetSetupPhase = 'needed' | 'creating' | 'success' | 'error';

interface SheetSetupModalProps {
  phase: SheetSetupPhase | null;
  errorMessage?: string;
  onCreate: () => void;
  onDismiss: () => void;
  onContinue: () => void;
}

export const SheetSetupModal: React.FC<SheetSetupModalProps> = ({
  phase,
  errorMessage,
  onCreate,
  onDismiss,
  onContinue,
}) => {
  if (!phase) return null;

  const isBusy = phase === 'creating';

  return (
    <div
      className="fixed inset-0 z-[72] flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-md animate-in fade-in duration-200"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy && phase !== 'success') onDismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-setup-title"
        aria-describedby="sheet-setup-message"
        className="w-full max-w-[320px] bg-white rounded-[22px] shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)] px-6 pt-7 pb-5 text-center animate-in zoom-in-95 fade-in duration-200"
      >
        {phase === 'success' ? (
          <>
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path
                  d="M4.5 10.5 8 14l7.5-8"
                  stroke="#047857"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p id="sheet-setup-title" className="text-[16px] font-semibold text-slate-900 tracking-[-0.02em]">
              Google Sheet created
            </p>
            <p id="sheet-setup-message" className="mt-1.5 text-[13px] leading-snug text-slate-500">
              You can now start saving your transactions.
            </p>
            <button
              type="button"
              onClick={onContinue}
              className="mt-6 w-full h-9 rounded-full bg-slate-900 text-white text-[14px] font-medium hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
            >
              Continue
            </button>
          </>
        ) : (
          <>
            <p id="sheet-setup-title" className="text-[16px] font-semibold text-slate-900 tracking-[-0.02em]">
              Set up your Google Sheet
            </p>
            <p id="sheet-setup-message" className="mt-1.5 text-[13px] leading-snug text-slate-500">
              {phase === 'error'
                ? errorMessage || 'Could not create a Google Sheet. You can try again.'
                : 'Create a Google Sheet to securely save and manage your transactions.'}
            </p>
            <div className="mt-6 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={onCreate}
                disabled={isBusy}
                className="w-full h-9 rounded-full bg-slate-900 text-white text-[14px] font-medium flex items-center justify-center gap-1.5 hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer disabled:opacity-60"
              >
                {isBusy ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Creating…
                  </>
                ) : phase === 'error' ? (
                  'Try again'
                ) : (
                  'Create Google Sheet'
                )}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                disabled={isBusy}
                className="w-full h-9 rounded-full text-slate-500 text-[14px] font-medium hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer disabled:opacity-40"
              >
                Not now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
