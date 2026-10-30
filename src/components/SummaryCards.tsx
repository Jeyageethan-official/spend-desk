import React, { useEffect, useRef, useState } from 'react';
import { 
  Wallet, 
  ArrowDownLeft, 
  ArrowUpRight, 
  CreditCard, 
  Receipt, 
  TrendingDown,
  MessageSquare,
  AlertCircle,
  ShieldCheck,
  Check,
  Loader2,
  Send
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
  /** Server-side Telegram link state (chat IDs never reach the browser). */
  telegramConnected?: boolean;
  /** The link was just minted and we are waiting for Start in Telegram. */
  telegramPending?: boolean;
  /** First status lookup still in flight — neither connected nor off yet. */
  telegramChecking?: boolean;
  onConnectTelegram?: () => void;
}

/**
 * Smoothly counts the wallet balance from its previous value to the new one.
 * A balance that jumps feels like a different number; easing into it reads as
 * the same money moving — the one piece of motion a finance dashboard earns.
 */
const useCountUp = (value: number): number => {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = value;
    if (from === value) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplay(value);
      return;
    }
    const startAt = performance.now();
    const duration = 480;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - startAt) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return display;
};

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  summary,
  currency = 'Rs',
  onAddCash,
  onAddExpense,
  onOpenSms,
  onAdjustBalance,
  telegramConnected = false,
  telegramPending = false,
  telegramChecking = false,
  onConnectTelegram,
}) => {
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
  const animatedBalance = useCountUp(safeSummary.currentCashBalance);

  // Telegram Alert: one row, one word of state, one action. Connected accounts
  // see a confirmation pill; everyone else gets a single Connect tap that
  // starts the server-side deep-link flow (Settings › Automatic Alerts has the
  // full controls).
  const telegramCheckingNow = telegramChecking && !telegramConnected && !telegramPending;

  return (
    <div className="space-y-3.5">
      {/* 1. Executive Wallet Hero Card */}
      <div className="relative overflow-hidden rounded-3xl bg-[#131f2b] text-white p-5 sm:p-7 border border-[#1e2d3b] shadow-xl">
        <div className="relative z-10">
          {/* Top Bar: Title on left & Status Badge on top right */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#0e3528] text-[#2bd98d] border border-[#1b5e48] md:text-sm">
              <Wallet className="w-3.5 h-3.5 text-[#2bd98d]" />
              Cash Wallet
            </span>

            {/* Top Right Status Badge */}
            <div>
              {isBalanceNegative ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#3f1d24] text-[#f87171] border border-[#672733] md:text-xs">
                  <AlertCircle className="w-3 h-3" /> Deficit
                </span>
              ) : isBalanceZero ? null : isBalanceLow ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#382a13] text-[#eab308] border border-[#5e431c] md:text-xs">
                  Low Cash
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#0e3528] text-[#34d399] border border-[#1b5e48] md:text-xs">
                  <ShieldCheck className="w-3 h-3" /> Healthy
                </span>
              )}
            </div>
          </div>

          {/* Current Balance Typography */}
          <div className="space-y-0.5">
            <p className="text-[11px] uppercase tracking-wider text-[#8fa1b3] font-semibold md:text-xs">
              Current Balance
            </p>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white flex items-baseline gap-2">
              <span className="tabular-nums">
                {formatCurrency(animatedBalance, currency)}
              </span>
            </div>
          </div>

          {/* Out of Wallet Alert if active */}
          {safeSummary.outOfWallet > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#3f1d24] border border-[#672733] text-[#f87171] text-xs font-semibold md:text-sm">
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

          {/* Telegram Alert — a line of copy under the label, and a plain green
              text action instead of a filled button (quieter, still obvious). */}
          <div className="mt-3.5 pt-3 border-t border-[#1c2c3b] flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="mt-0.5 w-6 h-6 rounded-lg bg-[#1a3650] border border-[#264e73] text-[#5fa1d5] flex items-center justify-center shrink-0">
                <Send className="w-3 h-3" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] sm:text-xs font-bold text-[#c6d2de]">
                  Telegram Alert
                </span>
                <span className="block text-[10px] sm:text-[11px] leading-snug text-[#6f8296] truncate">
                  {telegramConnected
                    ? 'Private to your chat'
                    : telegramPending
                      ? 'Press Start in Telegram'
                      : telegramCheckingNow
                        ? 'Checking your link'
                        : 'Alerts on every save'}
                </span>
              </span>
            </div>

            {telegramConnected ? (
              <span className="inline-flex items-center gap-1 text-[#2bd98d] text-[11px] sm:text-xs font-black shrink-0">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                Connected
              </span>
            ) : telegramPending ? (
              <span className="inline-flex items-center gap-1.5 text-[#eab308] text-[11px] sm:text-xs font-black shrink-0">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Connecting…
              </span>
            ) : telegramCheckingNow ? (
              <span className="inline-flex items-center gap-1.5 text-[#6f8296] text-[11px] sm:text-xs font-bold shrink-0">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Checking…
              </span>
            ) : (
              <button
                type="button"
                onClick={onConnectTelegram}
                className="text-[#2bd98d] hover:text-[#25be7b] text-[11px] sm:text-xs font-black shrink-0 underline-offset-2 hover:underline transition-colors cursor-pointer"
                title="Connect Telegram alerts"
              >
                Connect
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Key Financial KPIs Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* CASH IN */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-emerald-300/80 transition-all sd-lift">
          <div className="flex items-center justify-between text-emerald-600 mb-2">
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60">
              <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50/80 px-2 py-0.5 rounded-full md:text-xs">
              Cash In
            </span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide md:text-xs">
              CASH IN
            </span>
            <p className="text-lg sm:text-xl font-black text-slate-900 mt-0.5 truncate tabular-nums">
              {formatCurrency(safeSummary.cashAdded, currency)}
            </p>
          </div>
        </div>

        {/* CASH SPENT */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-rose-300/80 transition-all sd-lift">
          <div className="flex items-center justify-between text-rose-600 mb-2">
            <span className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200/60">
              <TrendingDown className="w-4 h-4 stroke-[2.5]" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50/80 px-2 py-0.5 rounded-full md:text-xs">
              Cash Out
            </span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide md:text-xs">
              CASH SPENT
            </span>
            <p className="text-lg sm:text-xl font-black text-rose-600 mt-0.5 truncate tabular-nums">
              {formatCurrency(safeSummary.cashSpent, currency)}
            </p>
          </div>
        </div>

        {/* CARD SPEND */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-blue-300/80 transition-all sd-lift">
          <div className="flex items-center justify-between text-blue-600 mb-2">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200/60">
              <CreditCard className="w-4 h-4 stroke-[2.5]" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded-full md:text-xs">
              Digital / Bank
            </span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide md:text-xs">
              CARD & DIGITAL
            </span>
            <p className="text-lg sm:text-xl font-black text-blue-600 mt-0.5 truncate tabular-nums">
              {formatCurrency(safeSummary.cardSpend, currency)}
            </p>
          </div>
        </div>

        {/* TOTAL SPEND */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-400/80 transition-all sd-lift">
          <div className="flex items-center justify-between text-slate-700 mb-2">
            <span className="p-2 rounded-xl bg-slate-100 text-slate-700 border border-slate-200/80">
              <Receipt className="w-4 h-4 stroke-[2.5]" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full md:text-xs">
              Total Out
            </span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide md:text-xs">
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
