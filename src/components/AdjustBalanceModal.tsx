import React, { useState, useEffect } from 'react';
import { 
  Sliders, 
  X, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle2, 
  Wallet,
  AlertCircle
} from 'lucide-react';
import { formatCurrency } from '../lib/calculations';

interface AdjustBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  currency: string;
  onConfirmAdjustment: (actualCashAmount: number, difference: number) => void;
}

export const AdjustBalanceModal: React.FC<AdjustBalanceModalProps> = ({
  isOpen,
  onClose,
  currentBalance,
  currency,
  onConfirmAdjustment,
}) => {
  const [actualAmountInput, setActualAmountInput] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize or reset input whenever modal opens or currentBalance changes
  useEffect(() => {
    if (isOpen) {
      setActualAmountInput(currentBalance > 0 ? String(currentBalance) : '');
      setErrorMessage(null);
    }
  }, [isOpen, currentBalance]);

  if (!isOpen) return null;

  const parsedActual = parseFloat(actualAmountInput);
  const isValidNumber = !isNaN(parsedActual) && parsedActual >= 0;
  const difference = isValidNumber ? parsedActual - currentBalance : 0;
  const hasChange = isValidNumber && Math.abs(difference) >= 0.001;

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidNumber) {
      setErrorMessage('Please enter a valid positive number or 0');
      return;
    }
    if (!hasChange) {
      setErrorMessage('Actual cash matches your current tracked balance.');
      return;
    }

    onConfirmAdjustment(parsedActual, difference);
    onClose();
  };

  const handleQuickPreset = (value: number) => {
    setActualAmountInput(String(Math.max(0, value)));
    setErrorMessage(null);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 overflow-hidden transform transition-all space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjust-balance-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Sliders className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 id="adjust-balance-title" className="text-base font-bold text-slate-900 leading-snug">
                Adjust Cash Balance
              </h3>
              <p className="text-xs text-slate-500">
                Reconcile physical wallet with app ledger
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Balance Card */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-200/70 text-slate-600 flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Currently Tracked
              </p>
              <p className="text-sm font-bold text-slate-800">
                {formatCurrency(currentBalance, currency)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleQuickPreset(currentBalance)}
            className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
          >
            Copy
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleConfirm} className="space-y-4">
          <div>
            <label htmlFor="actual-cash-input" className="block text-xs font-bold text-slate-700 mb-1.5">
              Actual Cash In Hand
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 select-none">
                {currency}
              </span>
              <input
                id="actual-cash-input"
                type="number"
                step="any"
                min="0"
                value={actualAmountInput}
                onChange={(e) => {
                  setActualAmountInput(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="0.00"
                className="w-full pl-12 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all placeholder:text-slate-300"
                autoFocus
              />
            </div>

            {/* Quick adjust chips */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleQuickPreset(0)}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
              >
                Zero (0)
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset(currentBalance + 100)}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
              >
                +100
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset(currentBalance + 500)}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
              >
                +500
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset(currentBalance + 1000)}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
              >
                +1,000
              </button>
            </div>
          </div>

          {/* Difference Preview Box */}
          {isValidNumber && (
            <div 
              className={`rounded-2xl p-3 border transition-all ${
                difference > 0 
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' 
                  : difference < 0 
                  ? 'bg-rose-50/70 border-rose-200 text-rose-900' 
                  : 'bg-slate-100/70 border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div 
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    difference > 0 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : difference < 0 
                      ? 'bg-rose-100 text-rose-700' 
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {difference > 0 ? (
                    <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
                  ) : difference < 0 ? (
                    <ArrowDownRight className="w-4 h-4 stroke-[2.5]" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  )}
                </div>

                <div className="flex-1 text-xs">
                  <div className="font-bold flex items-center justify-between">
                    <span>
                      {difference > 0 
                        ? 'Surplus Difference' 
                        : difference < 0 
                        ? 'Shortage Difference' 
                        : 'Balances Match'}
                    </span>
                    <span className="tabular-nums font-extrabold">
                      {difference > 0 
                        ? `+${formatCurrency(difference, currency)}` 
                        : difference < 0 
                        ? `-${formatCurrency(Math.abs(difference), currency)}` 
                        : '0.00'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
                    {difference > 0 
                      ? 'Creates a "Cash Added" adjustment entry to raise tracked cash to match your actual cash.'
                      : difference < 0 
                      ? 'Creates a "Cash Expense" adjustment entry to lower tracked cash to match your actual cash.'
                      : 'Physical cash matches your ledger. No adjustment entry is required.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!hasChange}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Apply Adjustment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
