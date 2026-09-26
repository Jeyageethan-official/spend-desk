import React, { useState } from 'react';
import { 
  Wallet, 
  ArrowDownLeft, 
  ArrowUpRight, 
  CreditCard, 
  Receipt, 
  TrendingDown,
  MessageSquare,
  Phone,
  Edit2
} from 'lucide-react';
import { SpendingSummary } from '../types/finance';
import { formatCurrency } from '../lib/calculations';

interface SummaryCardsProps {
  summary: SpendingSummary;
  currency?: string;
  onAddCash: () => void;
  onAddExpense: () => void;
  onOpenSms?: () => void;
  alertPhone?: string;
  onUpdateAlertPhone?: (phone: string) => void;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  summary,
  currency = 'Rs',
  onAddCash,
  onAddExpense,
  onOpenSms,
  alertPhone = '',
  onUpdateAlertPhone,
}) => {
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState(alertPhone);

  const isBalanceNegative = summary.currentCashBalance < 0;
  const isBalanceLow = summary.currentCashBalance < 1500;

  const handleSavePhone = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateAlertPhone) {
      onUpdateAlertPhone(phoneInput.trim());
    }
    setIsEditingPhone(false);
  };

  return (
    <div className="space-y-3">
      {/* 1. Main Hero Wallet Card - Mobile First */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-slate-700/60 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Wallet className="w-3 h-3" />
              Cash Wallet
            </span>

            {isBalanceNegative ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Negative Cash
              </span>
            ) : isBalanceLow ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Low Cash
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Healthy
              </span>
            )}
          </div>

          <p className="text-[11px] uppercase tracking-wider text-slate-300 font-semibold">
            CURRENT BALANCE (CASH)
          </p>

          <div className="mt-1 text-2xl sm:text-4xl font-extrabold tracking-tight text-white flex items-baseline gap-2">
            <span>{formatCurrency(summary.currentCashBalance, currency)}</span>
          </div>

          {/* Quick Action Buttons: Cash In, Spend, and sleek SMS Icon Button */}
          <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center gap-2">
            <button
              type="button"
              onClick={onAddCash}
              className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <ArrowDownLeft className="w-4 h-4 stroke-[3]" />
              <span>+ Cash In</span>
            </button>

            <button
              type="button"
              onClick={onAddExpense}
              className="flex-1 py-2.5 px-3 rounded-xl bg-red-700 hover:bg-red-800 active:bg-red-900 border border-red-800/40 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <ArrowUpRight className="w-4 h-4 text-white stroke-[2.5]" />
              <span>- Spend</span>
            </button>

            {onOpenSms && (
              <button
                type="button"
                onClick={onOpenSms}
                className="w-11 h-10 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 active:bg-blue-600 text-blue-200 flex items-center justify-center border border-blue-400/30 transition-all cursor-pointer shadow-sm shrink-0"
                title="Paste Bank SMS to Auto-Fill"
                aria-label="Paste Bank SMS"
              >
                <MessageSquare className="w-4 h-4 text-blue-300" />
              </button>
            )}
          </div>

          {/* SMS Notification Phone Setup (Compact) */}
          <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            {isEditingPhone ? (
              <form onSubmit={handleSavePhone} className="flex items-center gap-1.5 w-full">
                <input
                  type="tel"
                  placeholder="Enter phone for SMS alerts (e.g. 0771234567)"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="flex-1 px-2.5 py-1 text-xs bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-hidden focus:border-emerald-500"
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-2 py-1 bg-emerald-500 text-slate-950 font-bold rounded-lg text-[10px] cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingPhone(false)}
                  className="px-2 py-1 text-slate-400 hover:text-white text-[10px] cursor-pointer"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-1.5 truncate">
                  <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="text-slate-300">
                    {alertPhone ? `SMS Alert: ${alertPhone}` : 'No SMS notification number set'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPhoneInput(alertPhone);
                    setIsEditingPhone(true);
                  }}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-0.5 cursor-pointer shrink-0"
                >
                  <Edit2 className="w-2.5 h-2.5" />
                  <span>{alertPhone ? 'Edit' : 'Set Phone'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. Grid of 4 Metric Breakdown Cards (Removed Out of Wallet as requested) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* CASH ADDED */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <ArrowDownLeft className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] font-bold uppercase text-slate-400">In</span>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            CASH ADDED
          </span>
          <p className="text-base sm:text-lg font-bold text-slate-900 mt-0.5 truncate">
            {formatCurrency(summary.cashAdded, currency)}
          </p>
        </div>

        {/* CASH SPENT */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-red-700 mb-1">
            <span className="p-1.5 rounded-lg bg-red-50 text-red-700">
              <TrendingDown className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] font-bold uppercase text-slate-400">Out</span>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            CASH SPENT
          </span>
          <p className="text-base sm:text-lg font-bold text-red-700 mt-0.5 truncate">
            {formatCurrency(summary.cashSpent, currency)}
          </p>
        </div>

        {/* CARD SPEND */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-blue-600 mb-1">
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
              <CreditCard className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] font-bold uppercase text-slate-400">Bank</span>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            CARD SPEND
          </span>
          <p className="text-base sm:text-lg font-bold text-blue-600 mt-0.5 truncate">
            {formatCurrency(summary.cardSpend, currency)}
          </p>
        </div>

        {/* TOTAL SPEND */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-700 mb-1">
            <span className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
              <Receipt className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] font-bold uppercase text-slate-400">All</span>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            TOTAL SPEND
          </span>
          <p className="text-base sm:text-lg font-bold text-slate-900 mt-0.5 truncate">
            {formatCurrency(summary.totalSpend, currency)}
          </p>
        </div>
      </div>
    </div>
  );
};
