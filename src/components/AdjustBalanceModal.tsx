import React, { useState } from 'react';
import { Wallet, X, Check, ArrowRight } from 'lucide-react';
import { formatCurrency } from '../lib/calculations';
import { triggerFeedback } from '../lib/haptics';

interface AdjustBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  currency?: string;
  onConfirmAdjustment: (actualCashAmount: number, difference: number) => void;
}

export const AdjustBalanceModal: React.FC<AdjustBalanceModalProps> = ({
  isOpen,
  onClose,
  currentBalance,
  currency = 'Rs',
  onConfirmAdjustment,
}) => {
  const [amountStr, setAmountStr] = useState<string>(currentBalance > 0 ? String(currentBalance) : '');
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const parsedAmount = parseFloat(amountStr) || 0;
  const difference = parsedAmount - currentBalance;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setError('Please enter a valid cash amount (minimum 0)');
      return;
    }

    if (Math.abs(difference) < 0.001) {
      onClose();
      return;
    }

    triggerFeedback('success');
    onConfirmAdjustment(parsedAmount, difference);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div 
        className="bg-white rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjust-modal-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h3 id="adjust-modal-title" className="text-base font-bold text-slate-900">
              Adjust Cash in Hand
            </h3>
            <p className="text-xs text-slate-500">
              Set your actual physical wallet cash
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Current Tracked Cash:</span>
              <span className="font-bold text-slate-800">
                {formatCurrency(currentBalance, currency)}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Count the physical notes and coins in your pocket or cash drawer right now.
            </div>
          </div>

          <div>
            <label htmlFor="adjust-cash-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Actual Cash in Hand ({currency})
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                {currency}
              </span>
              <input
                id="adjust-cash-input"
                type="number"
                step="any"
                min="0"
                autoFocus
                placeholder="e.g. 500"
                value={amountStr}
                onChange={(e) => {
                  setAmountStr(e.target.value);
                  setError('');
                }}
                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-300 rounded-xl text-base font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              />
            </div>
            {error && <p className="text-xs text-rose-600 font-medium mt-1">{error}</p>}
          </div>

          {/* Difference Preview */}
          {amountStr !== '' && !isNaN(parsedAmount) && (
            <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-600">
              <span>Adjustment Entry:</span>
              <span className={`font-bold flex items-center gap-1 ${
                difference > 0 ? 'text-emerald-600' : difference < 0 ? 'text-rose-600' : 'text-slate-600'
              }`}>
                {difference > 0 ? `+${formatCurrency(difference, currency)} (Cash In)` : difference < 0 ? `-${formatCurrency(Math.abs(difference), currency)} (Spend)` : 'No change'}
                <ArrowRight className="w-3 h-3 inline" />
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Update Balance</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
