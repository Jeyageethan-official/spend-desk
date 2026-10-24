import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileText, User, X } from 'lucide-react';
import { formatCurrency } from '../lib/calculations';

export interface OutOfWalletBorrowPayload {
  amount: number;
  personName: string;
  thingsOrReason: string;
  date: string;
}

interface OutOfWalletModalProps {
  isOpen: boolean;
  /** The out-of-wallet amount produced by the just-recorded transaction. */
  amount: number;
  /** Date of that transaction; used as the date of the Borrowed record. */
  date: string;
  currency?: string;
  onDismiss: () => void;
  onSaveBorrowed: (payload: OutOfWalletBorrowPayload) => void;
}

/**
 * Appears whenever a transaction spends beyond the wallet balance.
 *
 * Step 1 asks whether the out-of-wallet amount was borrowed.
 * Step 2 (Yes) prefills that amount and asks for the reason and the person's
 * name; saving creates the record directly inside the Borrowed list.
 */
export const OutOfWalletModal: React.FC<OutOfWalletModalProps> = ({
  isOpen,
  amount,
  date,
  currency = 'Rs',
  onDismiss,
  onSaveBorrowed,
}) => {
  const [step, setStep] = useState<'ask' | 'details'>('ask');
  const [amountStr, setAmountStr] = useState('');
  const [reason, setReason] = useState('');
  const [name, setName] = useState('');

  // Reset every time a new out-of-wallet event opens the sheet, so the amount
  // is always freshly prefilled with the latest excess.
  useEffect(() => {
    if (isOpen) {
      setStep('ask');
      setAmountStr(String(amount || 0));
      setReason('');
      setName('');
    }
  }, [isOpen, amount]);

  if (!isOpen) return null;

  const parsedAmount = parseFloat(amountStr) || 0;
  const canSave = parsedAmount > 0 && reason.trim().length > 0 && name.trim().length > 0;

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canSave) return;
    onSaveBorrowed({
      amount: parsedAmount,
      personName: name.trim(),
      thingsOrReason: reason.trim(),
      date,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-2">
            {step === 'details' && (
              <button
                type="button"
                onClick={() => setStep('ask')}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 md:text-sm">
              {step === 'ask' ? 'Out of Wallet' : 'Record Borrowed Money'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'ask' ? (
          <div className="p-5 space-y-4 text-xs sm:text-sm">
            {/* Amount highlight */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
              <AlertTriangle className="w-5 h-5 text-amber-600 mx-auto mb-1" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                Spent beyond wallet
              </p>
              <p className="text-2xl font-black text-amber-800 mt-0.5 tabular-nums">
                {formatCurrency(amount, currency)}
              </p>
              <p className="text-[11px] text-amber-700 mt-1 md:text-xs">
                This transaction spent more cash than your wallet had.
              </p>
            </div>

            {/* The question */}
            <p className="font-bold text-slate-900 text-sm md:text-base text-center">
              Is this {formatCurrency(amount, currency)} borrowed?
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={onDismiss}
                className="py-3 px-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold text-xs transition-all cursor-pointer md:text-sm"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => setStep('details')}
                className="py-3 px-4 rounded-2xl bg-red-700 hover:bg-red-800 active:bg-red-900 text-white font-bold text-xs transition-all cursor-pointer shadow-sm md:text-sm"
              >
                Yes, it is borrowed
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-5 space-y-3.5 text-xs sm:text-sm">
            {/* Amount (prefilled with the out-of-wallet amount, still editable) */}
            <div>
              <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1 md:text-xs">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400">
                  {currency}
                </span>
                <input
                  type="number"
                  step="any"
                  required
                  autoFocus
                  placeholder="0"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="w-full pl-12 pr-3 py-2.5 text-xl font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                />
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1 md:text-xs">
                Reason
              </label>
              <div className="relative">
                <FileText className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Emergency expense, Bill payment..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl placeholder-slate-400 focus:bg-white focus:outline-hidden"
                />
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1 md:text-xs">
                Name
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="Who did you borrow from?"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl placeholder-slate-400 focus:bg-white focus:outline-hidden"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSave}
              className="w-full py-3 px-4 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white rounded-2xl font-black text-sm shadow-md cursor-pointer disabled:opacity-40 transition-all flex items-center justify-center gap-2 mt-1"
            >
              <CheckCircle2 className="w-4.5 h-4.5 text-red-200 stroke-[2.5]" />
              <span>Save to Borrowed</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
