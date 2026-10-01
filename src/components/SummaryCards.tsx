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
  Edit2,
  Sliders,
  AlertCircle,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { SpendingSummary } from '../types/finance';
import { formatCurrency } from '../lib/calculations';

interface SummaryCardsProps {
  summary: SpendingSummary;
  currency?: string;
  onAddCash: () => void;
  onAddExpense: () => void;
  onOpenSms?: () => void;
  onAdjustBalance?: () => void;
  alertPhone?: string;
  onUpdateAlertPhone?: (phone: string) => void;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  summary,
  currency = 'Rs',
  onAddCash,
  onAddExpense,
  onOpenSms,
  onAdjustBalance,
  alertPhone = '',
  onUpdateAlertPhone,
}) => {
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState(alertPhone);

  const safeSummary: SpendingSummary = summary || {
    currentCashBalance: 0,
    cashAdded: 0,
    cashSpent: 0,
    cardSpend: 0,
    totalSpend: 0,
    outOfWallet: 0,
  };

  const isBalanceNegative = safeSummary.currentCashBalance < 0;
  const isBalanceLow = safeSummary.currentCashBalance > 0 && safeSummary.currentCashBalance < 1500;
  const isBalanceZero = safeSummary.currentCashBalance === 0;

  const handleSavePhone = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateAlertPhone) {
      onUpdateAlertPhone(phoneInput.trim());
    }
    setIsEditingPhone(false);
  };

  return (
    <div className="space-y-3.5">
      {/* 1. Executive Wallet Hero Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-950 text-white p-5 sm:p-7 border border-slate-800/80 shadow-lg">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          {/* Top Bar: Badge & Adjust Cash Button */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Physical Cash Wallet
              </span>

              {isBalanceNegative ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  <AlertCircle className="w-3 h-3" /> Deficit
                </span>
              ) : isBalanceZero ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-500/20 text-slate-300 border border-slate-500/30">
                  Zero Balance
                </span>
              ) : isBalanceLow ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Low Cash
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <ShieldCheck className="w-3 h-3" /> Healthy
                </span>
              )}
            </div>

            {onAdjustBalance && (
              <button
                type="button"
                onClick={onAdjustBalance}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 active:scale-95 text-slate-200 border border-white/15 transition-all cursor-pointer shadow-xs"
                title="Adjust actual cash in hand"
              >
                <Sliders className="w-3.5 h-3.5 text-emerald-300" />
                <span>Adjust Cash</span>
              </button>
            )}
          </div>

          {/* Current Balance Typography */}
          <div className="space-y-0.5">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Current Available Cash
            </p>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white flex items-baseline gap-2">
              <span className="tabular-nums">
                {formatCurrency(safeSummary.currentCashBalance, currency)}
              </span>
            </div>
          </div>

          {/* Out of Wallet Alert if active */}
          {safeSummary.outOfWallet > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/35 text-rose-200 text-xs font-semibold">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>Out of Wallet: <strong>-{formatCurrency(safeSummary.outOfWallet, currency)}</strong> (Spent while wallet was empty)</span>
            </div>
          )}

          {/* Fast Action Buttons */}
          <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center gap-2.5">
            <button
              type="button"
              onClick={onAddCash}
              className="flex-1 py-2.5 sm:py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-emerald-500/20 transition-all cursor-pointer"
            >
              <ArrowDownLeft className="w-4 h-4 stroke-[3]" />
              <span>+ Cash In</span>
            </button>

            <button
              type="button"
              onClick={onAddExpense}
              className="flex-1 py-2.5 sm:py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-rose-600/20 transition-all cursor-pointer"
            >
              <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
              <span>- Record Spend</span>
            </button>

            {onOpenSms && (
              <button
                type="button"
                onClick={onOpenSms}
                className="w-11 h-10 sm:w-12 sm:h-11 rounded-xl bg-blue-600/20 hover:bg-blue-600/35 text-blue-300 border border-blue-400/30 flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0"
                title="Paste Bank SMS to Auto-Fill"
                aria-label="Paste Bank SMS"
              >
                <MessageSquare className="w-4 h-4 text-blue-300" />
              </button>
            )}
          </div>

          {/* SMS Notification Quick Settings */}
          <div className="mt-3.5 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
            {isEditingPhone ? (
              <form onSubmit={handleSavePhone} className="flex items-center gap-2 w-full">
                <input
                  type="tel"
                  placeholder="Enter phone for SMS alerts (e.g. 0771234567)"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-hidden focus:border-emerald-500"
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingPhone(false)}
                  className="px-2.5 py-1.5 text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-2 truncate">
                  <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-slate-300 text-[11px] sm:text-xs">
                    {alertPhone ? `SMS Alert: ${alertPhone}` : 'No SMS notification number set'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPhoneInput(alertPhone);
                    setIsEditingPhone(true);
                  }}
                  className="text-emerald-400 hover:text-emerald-300 text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>{alertPhone ? 'Change' : 'Set Phone'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. Key Financial KPIs Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* CASH ADDED */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-emerald-300/80 transition-all">
          <div className="flex items-center justify-between text-emerald-600 mb-2">
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60">
              <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50/80 px-2 py-0.5 rounded-full">
              Cash In
            </span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              CASH ADDED
            </span>
            <p className="text-lg sm:text-xl font-black text-slate-900 mt-0.5 truncate tabular-nums">
              {formatCurrency(safeSummary.cashAdded, currency)}
            </p>
          </div>
        </div>

        {/* CASH SPENT */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-rose-300/80 transition-all">
          <div className="flex items-center justify-between text-rose-600 mb-2">
            <span className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200/60">
              <TrendingDown className="w-4 h-4 stroke-[2.5]" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50/80 px-2 py-0.5 rounded-full">
              Cash Out
            </span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              CASH SPENT
            </span>
            <p className="text-lg sm:text-xl font-black text-rose-600 mt-0.5 truncate tabular-nums">
              {formatCurrency(safeSummary.cashSpent, currency)}
            </p>
          </div>
        </div>

        {/* CARD SPEND */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-blue-300/80 transition-all">
          <div className="flex items-center justify-between text-blue-600 mb-2">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200/60">
              <CreditCard className="w-4 h-4 stroke-[2.5]" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded-full">
              Digital / Bank
            </span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              CARD & DIGITAL
            </span>
            <p className="text-lg sm:text-xl font-black text-blue-600 mt-0.5 truncate tabular-nums">
              {formatCurrency(safeSummary.cardSpend, currency)}
            </p>
          </div>
        </div>

        {/* TOTAL SPEND */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-400/80 transition-all">
          <div className="flex items-center justify-between text-slate-700 mb-2">
            <span className="p-2 rounded-xl bg-slate-100 text-slate-700 border border-slate-200/80">
              <Receipt className="w-4 h-4 stroke-[2.5]" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
              Total Out
            </span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              TOTAL SPEND
            </span>
            <p className="text-lg sm:text-xl font-black text-slate-900 mt-0.5 truncate tabular-nums">
              {formatCurrency(safeSummary.totalSpend, currency)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
