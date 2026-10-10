import React from 'react';
import { BarChart3, Banknote, CreditCard } from 'lucide-react';
import { DailyTrendItem } from '../types/finance';
import { formatCurrency } from '../lib/calculations';

interface SpendingTrendProps {
  trendItems: DailyTrendItem[];
  currency?: string;
}

export const SpendingTrend: React.FC<SpendingTrendProps> = ({
  trendItems,
  currency = 'Rs',
}) => {
  const maxSpend = Math.max(...trendItems.map((item) => item.totalAmount), 1);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              SPENDING TREND (DAILY)
            </h2>
            <p className="text-xs text-slate-500 md:text-sm">Day-by-day cash vs card expenditure</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Cash</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span>Card</span>
          </div>
        </div>
      </div>

      {/* Visual Bar Columns */}
      <div className="pt-6 pb-2 px-2 flex-1 flex items-end justify-between gap-2 sm:gap-4 min-h-[160px]">
        {trendItems.map((item) => {
          const totalHeightPercent = (item.totalAmount / maxSpend) * 100;
          const cashRatio = item.totalAmount > 0 ? (item.cashAmount / item.totalAmount) : 0;
          const cardRatio = item.totalAmount > 0 ? (item.cardAmount / item.totalAmount) : 0;

          return (
            <div key={item.dayLabel} className="flex-1 flex flex-col items-center gap-2 group">
              {/* Tooltip / amount badge on hover */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-md whitespace-nowrap shadow-xs pointer-events-none md:text-xs">
                {formatCurrency(item.totalAmount, currency)}
              </div>

              {/* Bar Container */}
              <div className="w-full max-w-[36px] bg-slate-100 rounded-lg flex flex-col justify-end h-32 overflow-hidden p-0.5">
                {item.totalAmount > 0 ? (
                  <div
                    className="w-full rounded-md flex flex-col justify-end overflow-hidden transition-all duration-500"
                    style={{ height: `${Math.max(totalHeightPercent, 8)}%` }}
                  >
                    {item.cardAmount > 0 && (
                      <div
                        className="w-full bg-blue-500 hover:bg-blue-600 transition-colors"
                        style={{ height: `${cardRatio * 100}%` }}
                        title={`Card: ${formatCurrency(item.cardAmount, currency)}`}
                      />
                    )}
                    {item.cashAmount > 0 && (
                      <div
                        className="w-full bg-emerald-500 hover:bg-emerald-600 transition-colors"
                        style={{ height: `${cashRatio * 100}%` }}
                        title={`Cash: ${formatCurrency(item.cashAmount, currency)}`}
                      />
                    )}
                  </div>
                ) : (
                  <div className="h-1 bg-slate-200 rounded-full w-full mx-auto" />
                )}
              </div>

              {/* Day Label */}
              <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-900 transition-colors md:text-sm">
                {item.dayLabel}
              </span>
            </div>
          );
        })}
      </div>

      {/* Daily table rows matching CSV layout */}
      <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-7 gap-1 text-center">
        {trendItems.map((item) => (
          <div key={item.dayLabel} className="p-1 rounded-lg hover:bg-slate-50">
            <span className="block text-[11px] font-semibold text-slate-500 md:text-xs">
              {item.dayLabel}
            </span>
            <span className="block text-xs font-bold text-slate-800 mt-0.5 truncate md:text-sm">
              {item.totalAmount > 0 ? formatCurrency(item.totalAmount, currency) : '0'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
