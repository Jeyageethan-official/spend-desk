import React from 'react';
import { 
  BarChart2, 
  PieChart, 
  CreditCard, 
  Wallet, 
  TrendingUp, 
  Calendar,
  Flame
} from 'lucide-react';
import { 
  CategorySummary, 
  DailyTrendItem, 
  SpendingSummary, 
  Category, 
  FilterState 
} from '../types/finance';
import { formatCurrency } from '../lib/calculations';
import { getCategoryIcon as getRegisteredCategoryIcon, resolveCategoryIcon } from '../lib/icons';
import { FilterBar } from './FilterBar';

interface AnalyticsViewProps {
  summary: SpendingSummary;
  categories: CategorySummary[];
  trendItems: DailyTrendItem[];
  filter: FilterState;
  onFilterChange: (newFilter: FilterState) => void;
  onExportCSV: () => void;
  totalTransactionsCount: number;
  currency?: string;
}

const resolveCategoryIconComp = (iconName?: string, categoryName?: string) => {
  return resolveCategoryIcon(categoryName, iconName);
};

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  summary,
  categories,
  trendItems,
  filter,
  onFilterChange,
  onExportCSV,
  totalTransactionsCount,
  currency = 'Rs',
}) => {
  const totalSpend = summary.totalSpend;
  const cashSpendPercent = totalSpend > 0 ? (summary.cashSpent / totalSpend) * 100 : 0;
  const cardSpendPercent = totalSpend > 0 ? (summary.cardSpend / totalSpend) * 100 : 0;

  // Find top spending category
  const sortedCategories = [...categories].sort((a, b) => b.amount - a.amount);
  const topCategory = sortedCategories.find((c) => c.amount > 0);

  // Highest spend day
  const maxDaySpend = Math.max(...trendItems.map((t) => t.totalAmount), 1);

  return (
    <div className="space-y-4">
      {/* 1. Date Filter Controls */}
      <FilterBar
        filter={filter}
        onFilterChange={onFilterChange}
        onExportCSV={onExportCSV}
        totalFilteredCount={totalTransactionsCount}
        showDownload={false}
      />

      {/* 2. Top Analytics Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block md:text-xs">
            Total Expenditure
          </span>
          <p className="text-lg sm:text-xl font-black text-slate-900 mt-0.5 truncate">
            {formatCurrency(totalSpend, currency)}
          </p>
          <span className="text-[10px] text-slate-400 md:text-xs">In selected period</span>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block md:text-xs">
            Top Spending Area
          </span>
          <p className="text-base sm:text-lg font-bold text-slate-900 mt-0.5 truncate flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>{topCategory ? topCategory.category : 'None yet'}</span>
          </p>
          <span className="text-[10px] text-slate-400 md:text-xs">
            {topCategory ? formatCurrency(topCategory.amount, currency) : 'Rs 0.00'}
          </span>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block md:text-xs">
            Cash Outflow
          </span>
          <p className="text-base sm:text-lg font-bold text-emerald-700 mt-0.5 truncate">
            {formatCurrency(summary.cashSpent, currency)}
          </p>
          <span className="text-[10px] text-slate-400 md:text-xs">{cashSpendPercent.toFixed(0)}% of expenses</span>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block md:text-xs">
            Card Outflow
          </span>
          <p className="text-base sm:text-lg font-bold text-blue-700 mt-0.5 truncate">
            {formatCurrency(summary.cardSpend, currency)}
          </p>
          <span className="text-[10px] text-slate-400 md:text-xs">{cardSpendPercent.toFixed(0)}% of expenses</span>
        </div>
      </div>

      {/* 3. Cash vs Card Payment Ratio Bar Card */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-slate-600" />
            <span>Payment Method Split</span>
          </h3>
          <span className="text-xs font-semibold text-slate-500 md:text-sm">
            Cash vs Card
          </span>
        </div>

        {/* Dual Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex">
            {totalSpend > 0 ? (
              <>
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${cashSpendPercent}%` }}
                />
                <div
                  className="h-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${cardSpendPercent}%` }}
                />
              </>
            ) : (
              <div className="h-full bg-slate-200 w-full" />
            )}
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="font-semibold text-slate-700">Cash:</span>
              <span className="font-bold text-slate-900">{formatCurrency(summary.cashSpent, currency)}</span>
              <span className="text-[11px] text-slate-400 md:text-xs">({cashSpendPercent.toFixed(0)}%)</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="font-semibold text-slate-700">Card:</span>
              <span className="font-bold text-slate-900">{formatCurrency(summary.cardSpend, currency)}</span>
              <span className="text-[11px] text-slate-400 md:text-xs">({cardSpendPercent.toFixed(0)}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Daily Spending Trend (Mobile Optimized Bar Visualization) */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-blue-50 text-blue-700">
              <BarChart2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-900">
                SPENDING TREND (DAILY)
              </h3>
              <p className="text-[11px] text-slate-400 md:text-xs">Daily Cash vs Card outflow</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-[11px] text-slate-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Cash
            </span>
            <span className="flex items-center gap-1 text-[11px] text-slate-600">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> Card
            </span>
          </div>
        </div>

        {/* Mobile-Friendly Bar Columns with numbers directly visible */}
        <div className="pt-4 pb-2 px-1 flex items-end justify-between gap-1.5 sm:gap-3 min-h-[170px]">
          {trendItems.map((item) => {
            const heightPercent = maxDaySpend > 0 ? (item.totalAmount / maxDaySpend) * 100 : 0;
            const cardHeightRatio = item.totalAmount > 0 ? (item.cardAmount / item.totalAmount) : 0;
            const cashHeightRatio = item.totalAmount > 0 ? (item.cashAmount / item.totalAmount) : 0;

            return (
              <div key={item.dayLabel} className="flex-1 flex flex-col items-center gap-1">
                {/* Clear readable amount directly above bar */}
                <span className="text-[9px] sm:text-[10px] font-bold text-slate-700 truncate max-w-full">
                  {item.totalAmount > 0 ? Math.round(item.totalAmount).toLocaleString() : ''}
                </span>

                {/* Bar */}
                <div className="w-full max-w-[34px] bg-slate-100 rounded-xl flex flex-col justify-end h-28 overflow-hidden p-0.5">
                  {item.totalAmount > 0 ? (
                    <div
                      className="w-full rounded-lg flex flex-col justify-end overflow-hidden transition-all duration-500"
                      style={{ height: `${Math.max(heightPercent, 10)}%` }}
                    >
                      {item.cardAmount > 0 && (
                        <div
                          className="w-full bg-blue-500"
                          style={{ height: `${cardHeightRatio * 100}%` }}
                        />
                      )}
                      {item.cashAmount > 0 && (
                        <div
                          className="w-full bg-emerald-500"
                          style={{ height: `${cashHeightRatio * 100}%` }}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="h-1 bg-slate-200 rounded-full w-full mx-auto" />
                  )}
                </div>

                {/* Day Name */}
                <span className="text-[11px] font-bold text-slate-700 mt-1 md:text-xs">
                  {item.dayLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Spending by Category (Clean Cards List with Progress Meters) */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-purple-50 text-purple-700">
              <PieChart className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-900">
                SPENDING BY CATEGORY
              </h3>
              <p className="text-[11px] text-slate-400 md:text-xs">Expense distribution across categories</p>
            </div>
          </div>
          <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-800 rounded-lg md:text-sm">
            {categories.filter((c) => c.amount > 0).length} active
          </span>
        </div>

        {/* List of categories */}
        <div className="space-y-3 pt-1">
          {categories.map((cat) => {
            const percent = totalSpend > 0 ? (cat.amount / totalSpend) * 100 : 0;

            return (
              <div
                key={cat.category}
                className="p-2.5 rounded-2xl bg-slate-50/70 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                      {(() => {
                        const IconComp = resolveCategoryIconComp(cat.iconName, cat.category);
                        return <IconComp className="w-4 h-4" style={{ color: cat.color || '#0ea5e9' }} />;
                      })()}
                    </div>
                    <div>
                      <span className="font-bold text-xs sm:text-sm text-slate-900 block leading-tight">
                        {cat.category}
                      </span>
                      {cat.count > 0 && (
                        <span className="text-[10px] text-slate-400 md:text-xs">
                          {cat.count} {cat.count === 1 ? 'transaction' : 'transactions'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-black text-xs sm:text-sm text-slate-900 block">
                      {formatCurrency(cat.amount, currency)}
                    </span>
                    <span className="text-[11px] text-slate-400 font-semibold md:text-xs">
                      {percent.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(percent, percent > 0 ? 3 : 0))}%`,
                      backgroundColor: cat.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
