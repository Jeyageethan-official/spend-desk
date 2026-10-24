import React from 'react';
import { Loader2 } from 'lucide-react';
import { formatCurrency } from '../lib/calculations';
import { CarryForwardOffer } from '../lib/dailyCarryForward';

interface DailyCarryForwardModalProps {
  /** null = nothing to offer. */
  offer: CarryForwardOffer | null;
  currency?: string;
  isApplying?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

/**
 * The daily "carry your balance into today" alert.
 *
 * The wallet balance is computed from the transactions inside the active date
 * filter, and the header defaults to today - so the first open of a new day
 * reads Rs 0.00 even though the user finished yesterday holding cash. That
 * reads as "my money vanished", and the only fix was a manual Cash In that
 * quietly pretended to be new income.
 *
 * This asks once, in the same Apple-style alert voice as the session notice:
 * a short title, one sentence carrying the actual figure, and two actions.
 * Accepting writes a real ledger row dated today flagged `isCarryForward`, so
 * the balance is right AND the history shows where it came from - the sheet
 * can always be reconciled against the app. Dismissing never asks again today;
 * the same option stays available as a button inside Cash In.
 */
export const DailyCarryForwardModal: React.FC<DailyCarryForwardModalProps> = ({
  offer,
  currency = 'Rs',
  isApplying = false,
  onConfirm,
  onDismiss,
}) => {
  if (!offer) return null;

  const amountLabel = formatCurrency(offer.amount, currency);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isApplying) onDismiss();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="carry-forward-title"
        aria-describedby="carry-forward-message"
        className="w-full max-w-[300px] bg-white rounded-[22px] shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)] px-6 pt-7 pb-5 text-center animate-in zoom-in-95 fade-in duration-200"
      >
        <p
          id="carry-forward-title"
          className="text-[16px] font-semibold text-slate-900 tracking-[-0.01em]"
        >
          Continue your balance?
        </p>
        <p id="carry-forward-message" className="mt-1.5 text-[13px] leading-snug text-slate-500">
          You closed {offer.fromLabel} with {amountLabel}. Carry it into today?
        </p>

        <div className="mt-6 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isApplying}
            className="w-full h-9 rounded-full bg-slate-900 text-white text-[14px] font-medium flex items-center justify-center gap-1.5 hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer disabled:opacity-60"
          >
            {isApplying ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Adding…
              </>
            ) : (
              `Continue with ${amountLabel}`
            )}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={isApplying}
            className="w-full h-9 rounded-full text-slate-500 text-[14px] font-medium hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer disabled:opacity-40"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};