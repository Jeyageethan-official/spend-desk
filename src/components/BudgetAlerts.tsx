import React, { useState } from 'react';
import { 
  AlertTriangle, 
  TrendingUp, 
  CalendarDays, 
  Settings2, 
  Check, 
  Sparkles,
  ShieldAlert
} from 'lucide-react';
import { BudgetConfig, SpendingSummary } from '../types/finance';
import { formatCurrency } from '../lib/calculations';

interface BudgetAlertsProps {
  summary: SpendingSummary;
  todaySpend: number;
  budgetConfig: BudgetConfig;
  onUpdateConfig: (config: BudgetConfig) => void;
  currency?: string;
}

export const BudgetAlerts: React.FC<BudgetAlertsProps> = ({
  summary,
  todaySpend,
  budgetConfig,
  onUpdateConfig,
  currency = 'Rs',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [monthlyBudgetInput, setMonthlyBudgetInput] = useState(budgetConfig.monthlyBudget.toString());
  const [lowCashInput, setLowCashInput] = useState(budgetConfig.lowCashThreshold.toString());
  const [dailyLimitInput, setDailyLimitInput] = useState(budgetConfig.dailySpendLimit.toString());

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const daysRemaining = Math.max(1, daysInMonth - currentDay);

  // Remaining budget calculations
  const remainingBudget = Math.max(0, budgetConfig.monthlyBudget - summary.totalSpend);
  const safeDailySpend = Math.round(remainingBudget / daysRemaining);
  const budgetUsedPercent = Math.min(100, (summary.totalSpend / Math.max(budgetConfig.monthlyBudget, 1)) * 100);

  // Alert triggers
  const isCashLow = summary.currentCashBalance <= budgetConfig.lowCashThreshold;
  const isDailyLimitExceeded = budgetConfig.dailySpendLimit > 0 && todaySpend > budgetConfig.dailySpendLimit;
  const isBudgetNearlyFinished = budgetUsedPercent >= 85;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig({
      monthlyBudget: parseFloat(monthlyBudgetInput) || 50000,
      lowCashThreshold: parseFloat(lowCashInput) || 1500,
      dailySpendLimit: parseFloat(dailyLimitInput) || 3000,
      notifyOnLimit: true,
    });
    setIsEditing(false);
  };

  return (
    <div className="space-y-3">
      {/* Alert Banners (if cash is ending or limits exceeded) */}
      {isCashLow && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 flex items-start gap-3 text-amber-900 animate-in fade-in">
          <div className="p-2 bg-amber-500 text-white rounded-xl shrink-0 mt-0.5 shadow-xs">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div className="flex-1 text-xs">
            <p className="font-bold text-amber-950 text-sm">
              Low Cash Warning (End of Cash)
            </p>
            <p className="text-amber-800 mt-0.5">
              Wallet cash is down to <strong>{formatCurrency(summary.currentCashBalance, currency)}</strong> (below alert limit {formatCurrency(budgetConfig.lowCashThreshold, currency)}). Consider withdrawing ATM cash or using card.
            </p>
          </div>
        </div>
      )}

      {isDailyLimitExceeded && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex items-start gap-3 text-rose-900 animate-in fade-in">
          <div className="p-2 bg-rose-600 text-white rounded-xl shrink-0 mt-0.5 shadow-xs">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="flex-1 text-xs">
            <p className="font-bold text-rose-950 text-sm">
              Daily Spend Limit Reached
            </p>
            <p className="text-rose-800 mt-0.5">
              Today&apos;s spending ({formatCurrency(todaySpend, currency)}) has exceeded your daily target of {formatCurrency(budgetConfig.dailySpendLimit, currency)}.
            </p>
          </div>
        </div>
      )}

      {/* Monthly Budget & Daily Runway Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                End-Money &amp; Runway Tracker
              </h3>
              <p className="text-[11px] text-slate-400">
                {daysRemaining} days left in {now.toLocaleString('default', { month: 'short' })}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-xs flex items-center gap-1"
            title="Configure monthly budget limits"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Set Limits</span>
          </button>
        </div>

        {/* Edit Limits Popdown */}
        {isEditing && (
          <form onSubmit={handleSave} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
            <p className="font-bold text-slate-800">Adjust Monthly Limits</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                  Monthly Budget (Rs)
                </label>
                <input
                  type="number"
                  value={monthlyBudgetInput}
                  onChange={(e) => setMonthlyBudgetInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-medium text-slate-800 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                  Low Cash Alert At (Rs)
                </label>
                <input
                  type="number"
                  value={lowCashInput}
                  onChange={(e) => setLowCashInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-medium text-slate-800 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                  Daily Spend Target (Rs)
                </label>
                <input
                  type="number"
                  value={dailyLimitInput}
                  onChange={(e) => setDailyLimitInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-medium text-slate-800 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1 bg-slate-200 text-slate-700 rounded-lg font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 bg-slate-900 text-white rounded-lg font-medium flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>
            </div>
          </form>
        )}

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-500 font-medium">Monthly Budget Spent</span>
            <span className="font-bold text-slate-800">
              {formatCurrency(summary.totalSpend, currency)} / {formatCurrency(budgetConfig.monthlyBudget, currency)}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${
                isBudgetNearlyFinished ? 'bg-rose-500' : budgetUsedPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(2, budgetUsedPercent))}%` }}
            />
          </div>
        </div>

        {/* 2 Micro KPI Badges */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700 shrink-0">
              <CalendarDays className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                Safe Daily Runway
              </span>
              <span className="text-xs font-bold text-slate-900">
                {formatCurrency(safeDailySpend, currency)} / day
              </span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                Remaining Budget
              </span>
              <span className="text-xs font-bold text-emerald-700">
                {formatCurrency(remainingBudget, currency)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
