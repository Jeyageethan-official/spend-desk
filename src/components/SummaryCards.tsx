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
      <div className="relative overflow-hidden rounded-3xl bg-[#131f2b] text-white p-5 sm:p-7 border border-[#1e2d3b] shadow-xl">
        <div className="relative z-10">
          {/* Top Bar: Title on left & Status Badge on top right */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#0e3528] text-[#2bd98d] border border-[#1b5e48]">
              <Wallet className="w-3.5 h-3.5 text-[#2bd98d]" />
              Cash Wallet
            </span>

            {/* Top Right Status Badge */}
            <div>
              {isBalanceNegative ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#3f1d24] text-[#f87171] border border-[#672733]">
                  <AlertCircle className="w-3 h-3" /> Deficit
                </span>
              ) : isBalanceZero ? null : isBalanceLow ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#382a13] text-[#eab308] border border-[#5e431c]">
                  Low Cash
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#0e3528] text-[#34d399] border border-[#1b5e48]">
                  <ShieldCheck className="w-3 h-3" /> Healthy
                </span>
              )}
            </div>
          </div>

          {/* Current Balance Typography */}
          <div className="space-y-0.5">
            <p className="text-[11px] uppercase tracking-wider text-[#8fa1b3] font-semibold">
              Current Balance
            </p>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white flex items-baseline gap-2">
              <span className="tabular-nums">
                {formatCurrency(safeSummary.currentCashBalance, currency)}
              </span>
            </div>
          </div>

          {/* Out of Wallet Alert if active */}
          {safeSummary.outOfWallet > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#3f1d24] border border-[#672733] text-[#f87171] text-xs font-semibold">
              <AlertCircle className="w-3.5 h-3.5 text-[#f87171] shrink-0" />
              <span>Out of Wallet: <strong>-{formatCurrency(safeSummary.outOfWallet, currency)}</strong></span>
            </div>
          )}

          {/* Fast Action Buttons */}
          <div className="mt-5 pt-4 border-t border-[#1c2c3b] flex items-center gap-2.5">
            <button
              type="button"
              onClick={onAddCash}
              className="flex-1 py-3 px-4 rounded-2xl bg-[#06be70] hover:bg-[#05a863] active:bg-[#049154] text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <ArrowDownLeft className="w-4 h-4 stroke-[3]" />
              <span>+ Cash In</span>
            </button>

            <button
              type="button"
              onClick={onAddExpense}
              className="flex-1 py-3 px-4 rounded-2xl bg-[#c52222] hover:bg-[#b01c1c] active:bg-[#991717] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
              <span>- Spend</span>
            </button>

            {onOpenSms && (
              <button
                type="button"
                onClick={onOpenSms}
                className="w-12 h-12 rounded-2xl bg-[#1a3650] hover:bg-[#204261] text-[#5fa1d5] border border-[#264e73] flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0"
                title="Paste Bank SMS to Auto-Fill"
                aria-label="Paste Bank SMS"
              >
                <MessageSquare className="w-5 h-5 text-[#5fa1d5]" />
              </button>
            )}
          </div>

          {/* SMS Notification Quick Settings */}
          <div className="mt-3.5 pt-3 border-t border-[#1c2c3b] flex items-center justify-between text-xs text-[#8fa1b3]">
            {isEditingPhone ? (
              <form onSubmit={handleSavePhone} className="flex items-center gap-2 w-full">
                <input
                  type="tel"
                  placeholder="Enter phone for SMS alerts (e.g. 0771234567)"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs bg-[#1a2938] text-white rounded-lg border border-[#243a4e] focus:outline-hidden focus:border-[#06be70]"
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-[#06be70] text-slate-950 font-bold rounded-lg text-xs cursor-pointer hover:bg-[#05a863]"
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
                  <Phone className="w-3.5 h-3.5 text-[#2bd98d] shrink-0" />
                  <span className="text-[#8fa1b3] text-[11px] sm:text-xs">
                    {alertPhone ? `SMS Alert: ${alertPhone}` : 'No SMS notification number set'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPhoneInput(alertPhone);
                    setIsEditingPhone(true);
                  }}
                  className="text-[#2bd98d] hover:text-[#25be7b] text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
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
        {/* CASH IN */}
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
              CASH IN
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
