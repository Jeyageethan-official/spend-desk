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

/** Stacked-coins illustration — the same friendly money mark as the design. */
const CoinsGlyph: React.FC = () => (
  <svg width="46" height="46" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <ellipse cx="24" cy="34.5" rx="14" ry="6" fill="#F5B942" />
    <ellipse cx="24" cy="31" rx="14" ry="6" fill="#FACC15" />
    <ellipse cx="24" cy="31" rx="14" ry="6" stroke="#EAB308" strokeWidth="1.2" />
    <ellipse cx="24" cy="25" rx="11" ry="4.8" fill="#FDE68A" />
    <ellipse cx="24" cy="22" rx="11" ry="4.8" fill="#FACC15" />
    <ellipse cx="24" cy="16.5" rx="8" ry="3.6" fill="#FDE68A" />
    <ellipse cx="24" cy="14" rx="8" ry="3.6" fill="#FBBF24" />
  </svg>
);

/** "25 Oct 2024" — the day whose close is being carried, unambiguous. */
const formatFullDay = (dateStr: string): string => {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    if (isNaN(dt.getTime())) return dateStr;
    return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

/**
 * The daily "carry yesterday's balance into today" confirmation — a centered
 * alert card, matching the design's "Continue Yesterday's Balance" screen:
 * coins illustration, the figure, the closing-balance caption, one note line
 * explaining what accepting does, then Cancel / Continue.
 *
 * Accepting writes a real ledger row dated today flagged `isCarryForward`;
 * cancelling is respected for the rest of the day and the same option stays
 * reachable as a button inside Cash In.
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
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-[5px] animate-in fade-in duration-150"
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
        className="relative w-full max-w-[312px] bg-white rounded-[26px] shadow-[0_32px_70px_-16px_rgba(15,23,42,0.45)] px-6 pt-7 pb-6 text-center animate-in zoom-in-95 fade-in duration-200"
      >
        <button
          type="button"
          onClick={onDismiss}
          disabled={isApplying}
          aria-label="Close"
          className="absolute right-4 top-4 h-7 w-7 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40"
        >
          <svg className="mx-auto h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-100">
          <CoinsGlyph />
        </div>

        <p id="carry-forward-title" className="text-[17px] font-bold text-slate-900 tracking-[-0.02em]">
          Yesterday&apos;s Balance
        </p>
        <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums">
          {amountLabel}
        </p>
        <p id="carry-forward-message" className="mt-1.5 text-[13px] leading-snug text-slate-500">
          {formatFullDay(offer.fromDay)} (Closing Balance)
        </p>

        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-slate-50 border border-slate-200/80 px-3.5 py-3 text-left">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M4.5 10.5 8 14l7.5-8"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-[12px] leading-snug text-slate-500">
            This will be set as today&apos;s opening balance.
          </p>
        </div>

        <div className="mt-5 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onDismiss}
            disabled={isApplying}
            className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 text-[14px] font-semibold transition-colors cursor-pointer disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isApplying}
            className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[14px] font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer active:scale-[0.98] disabled:opacity-60"
          >
            {isApplying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Continue'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
