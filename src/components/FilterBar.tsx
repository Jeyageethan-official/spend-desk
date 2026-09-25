import React, { useState } from 'react';
import { 
  Calendar, 
  Search, 
  Download, 
  X, 
  ChevronDown, 
  ChevronUp,
  SlidersHorizontal
} from 'lucide-react';
import { FilterState, DateFilterType, Category, PaymentMethod } from '../types/finance';
import { STANDARD_CATEGORIES } from '../lib/calculations';
import { loadStoredCustomCategories } from '../lib/storage';

interface FilterBarProps {
  filter: FilterState;
  onFilterChange: (newFilter: FilterState) => void;
  onExportCSV: () => void;
  totalFilteredCount: number;
  collapsible?: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filter,
  onFilterChange,
  onExportCSV,
  totalFilteredCount,
  collapsible = true,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(!collapsible);
  const customCategories = loadStoredCustomCategories();

  const getPresetDates = (type: DateFilterType): { startDate: string; endDate: string } => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (type === 'today') {
      return { startDate: todayStr, endDate: todayStr };
    }
    if (type === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      return { startDate: yStr, endDate: yStr };
    }
    if (type === 'week') {
      const curr = new Date(now);
      const day = curr.getDay(); // 0 is Sun
      const diffToMon = curr.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(curr.setDate(diffToMon));
      const monStr = monday.toISOString().split('T')[0];
      return { startDate: monStr, endDate: todayStr };
    }
    if (type === 'month') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      return { startDate: `${year}-${month}-01`, endDate: todayStr };
    }
    if (type === 'all') {
      return { startDate: '', endDate: '' };
    }
    return { startDate: filter.startDate, endDate: filter.endDate };
  };

  const handlePresetClick = (type: DateFilterType) => {
    if (type === 'custom') {
      if (collapsible) setIsExpanded(true);
      onFilterChange({ ...filter, type: 'custom' });
      return;
    }
    const dates = getPresetDates(type);
    onFilterChange({
      ...filter,
      type,
      startDate: dates.startDate,
      endDate: dates.endDate,
    });
  };

  const clearFilters = () => {
    onFilterChange({
      type: 'all',
      startDate: '',
      endDate: '',
      category: 'All',
      paymentMethod: 'All',
      searchQuery: '',
    });
  };

  const hasAdvancedFilters = 
    filter.type === 'custom' ||
    Boolean(filter.startDate) ||
    Boolean(filter.endDate) ||
    (filter.category && filter.category !== 'All') || 
    (filter.paymentMethod && filter.paymentMethod !== 'All') ||
    Boolean(filter.searchQuery);

  const shouldShowExpanded = !collapsible || isExpanded;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-4 shadow-xs space-y-3 transition-all">
      {/* Top Row: Quick Presets */}
      <div className="flex items-center justify-between gap-2">
        {/* Quick Date Presets */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none flex-1 min-w-0">
          {[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'week', label: 'This Week' },
            { id: 'month', label: 'This Month' },
            { id: 'all', label: 'All' },
          ].map((item) => {
            const active = filter.type === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handlePresetClick(item.id as DateFilterType)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white shadow-2xs font-bold'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Expand / Collapse Button with Down Arrow (ONLY on Home when collapsible is true) */}
        <div className="flex items-center gap-1 shrink-0">
          {hasAdvancedFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="p-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              title="Reset filters"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {collapsible && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                isExpanded || hasAdvancedFilters
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              title={isExpanded ? 'Collapse filters' : 'Expand more filters'}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">More Filters</span>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-slate-600 stroke-[2.5]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-600 stroke-[2.5]" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expanded Section (Always shown on Record page, collapsible on Home) */}
      {shouldShowExpanded && (
        <div className="pt-3 border-t border-slate-100 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Custom Date Range */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 flex-1 min-w-[130px]">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 font-medium">From:</span>
              <input
                type="date"
                value={filter.startDate}
                onChange={(e) =>
                  onFilterChange({
                    ...filter,
                    type: 'custom',
                    startDate: e.target.value,
                  })
                }
                className="bg-transparent focus:outline-hidden text-slate-800 text-xs cursor-pointer w-full"
              />
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 flex-1 min-w-[130px]">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 font-medium">To:</span>
              <input
                type="date"
                value={filter.endDate}
                onChange={(e) =>
                  onFilterChange({
                    ...filter,
                    type: 'custom',
                    endDate: e.target.value,
                  })
                }
                className="bg-transparent focus:outline-hidden text-slate-800 text-xs cursor-pointer w-full"
              />
            </div>
          </div>

          {/* Search Bar & Dropdowns */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search notes, category, amount..."
                value={filter.searchQuery || ''}
                onChange={(e) => onFilterChange({ ...filter, searchQuery: e.target.value })}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:ring-1 focus:ring-slate-900"
              />
            </div>

            {/* Dropdowns */}
            <div className="flex items-center gap-2">
              <select
                value={filter.category || 'All'}
                onChange={(e) =>
                  onFilterChange({ ...filter, category: e.target.value as Category | 'All' })
                }
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-hidden cursor-pointer"
              >
                <option value="All">All Categories</option>
                {STANDARD_CATEGORIES.map((c) => (
                  <option key={c.category} value={c.category}>
                    {c.category}
                  </option>
                ))}
                {customCategories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={filter.paymentMethod || 'All'}
                onChange={(e) =>
                  onFilterChange({ ...filter, paymentMethod: e.target.value as PaymentMethod | 'All' })
                }
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-hidden cursor-pointer"
              >
                <option value="All">All Modes</option>
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
              </select>

              <button
                type="button"
                onClick={onExportCSV}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Download CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
