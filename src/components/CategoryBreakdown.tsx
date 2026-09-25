import React from 'react';
import { 
  PieChart
} from 'lucide-react';
import { CategorySummary, Category } from '../types/finance';
import { formatCurrency } from '../lib/calculations';
import { getCategoryIcon } from '../lib/icons';

interface CategoryBreakdownProps {
  categories: CategorySummary[];
  totalSpend: number;
  currency?: string;
  onSelectCategory?: (category: Category) => void;
}

export const CategoryBreakdown: React.FC<CategoryBreakdownProps> = ({
  categories,
  totalSpend,
  currency = 'Rs',
  onSelectCategory,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
            <PieChart className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              SPENDING BY CATEGORY
            </h2>
            <p className="text-xs text-slate-500">Distribution of expenses</p>
          </div>
        </div>
        <span className="text-xs font-semibold px-2 py-1 bg-slate-100 text-slate-700 rounded-lg">
          Total: {formatCurrency(totalSpend, currency)}
        </span>
      </div>

      {/* Category List & Progress Bars */}
      <div className="space-y-3.5 flex-1">
        {categories.map((cat) => {
          const percent = totalSpend > 0 ? (cat.amount / totalSpend) * 100 : 0;
          const IconComp = getCategoryIcon(cat.iconName);
          return (
            <div 
              key={cat.category}
              onClick={() => onSelectCategory?.(cat.category)}
              className="group p-2 -mx-2 rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs sm:text-sm font-medium mb-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-slate-100 group-hover:bg-white border border-transparent group-hover:border-slate-200 transition-colors">
                    <IconComp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <span className="text-slate-800 font-semibold group-hover:text-emerald-700 transition-colors">
                    {cat.category}
                  </span>
                  {cat.count > 0 && (
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">
                      {cat.count} {cat.count === 1 ? 'tx' : 'txs'}
                    </span>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-slate-900 font-bold">
                    {formatCurrency(cat.amount, currency)}
                  </span>
                  <span className="text-slate-400 text-xs ml-2 font-normal">
                    {percent.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
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
  );
};
