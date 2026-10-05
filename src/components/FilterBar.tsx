import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  Search, 
  X, 
  ChevronDown, 
  ChevronUp,
  SlidersHorizontal,
  RotateCcw,
  Download
} from 'lucide-react';
import { FilterState, DateFilterType, Category, Transaction } from '../types/finance';
import { STANDARD_CATEGORIES } from '../lib/calculations';
import { loadStoredCustomCategories } from '../lib/storage';
import { CalendarDateModal } from './CalendarDateModal';
import { DownloadRecordsModal } from './DownloadRecordsModal';

interface FilterBarProps {
  filter: FilterState;
  onFilterChange: (newFilter: FilterState) => void;
  onExportCSV?: () => void;
  totalFilteredCount: number;
  collapsible?: boolean;
  transactions?: Transaction[];
  currency?: string;
  onNotification?: (msg: string, type?: 'success' | 'info' | 'error') => void;
  showDownload?: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filter,
  onFilterChange,
  onExportCSV: _onExportCSV,
  totalFilteredCount,
  collapsible = true,
  transactions = [],
  currency = 'Rs',
  onNotification,
  showDownload = false,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(!collapsible);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState<boolean>(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState<boolean>(false);
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
      setIsCalendarModalOpen(true);
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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filter.type !== 'all') count++;
    if (filter.startDate || filter.endDate) count++;
    if (filter.category && filter.category !== 'All') count++;
    if (filter.paymentMethod && filter.paymentMethod !== 'All') count++;
    if (filter.searchQuery?.trim()) count++;
    return count;
  }, [filter]);

  const hasAdvancedFilters = activeFilterCount > 0;
  const shouldShowExpanded = !collapsible || isExpanded;
  const hasCustomDateRange = Boolean(filter.startDate || filter.endDate);

  return (
    <>
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 p-3.5 sm:p-4 shadow-xs space-y-3 transition-all">
        {/* 1. Primary Filter Bar (Search + Quick Range Segmented Controls + Actions) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Search Input with Inset Icon and Clear Action */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search transactions, notes, merchant..."
              value={filter.searchQuery || ''}
              onChange={(e) => onFilterChange({ ...filter, searchQuery: e.target.value })}
              className="w-full pl-10 pr-8 py-2 text-xs bg-slate-50/80 hover:bg-slate-50 border border-slate-200/90 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5 transition-all"
            />
            {filter.searchQuery && (
              <button
                type="button"
                onClick={() => onFilterChange({ ...filter, searchQuery: '' })}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg cursor-pointer transition-colors"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Date Scope Segmented Controls */}
          <div className="flex items-center gap-1.5 justify-between sm:justify-start">
            <div className="flex items-center p-1 bg-slate-100 rounded-xl overflow-x-auto scrollbar-none gap-0.5">
              {[
                { id: 'all', label: 'All' },
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'Week' },
                { id: 'month', label: 'Month' },
              ].map((item) => {
                const active = filter.type === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handlePresetClick(item.id as DateFilterType)}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-emerald-600 text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 font-medium hover:bg-slate-200/50'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* 1. Calendar Date Trigger Button (Opens Custom Calendar Popup) */}
            <button
              type="button"
              onClick={() => setIsCalendarModalOpen(true)}
              className={`p-2 sm:px-3 sm:py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer shrink-0 flex items-center gap-1.5 border ${
                hasCustomDateRange
                  ? 'bg-[#eaf5f0] text-[#116b4e] border-[#116b4e]/40 font-bold shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border-slate-200/90'
              }`}
              title="Pick Custom Calendar Date Range"
            >
              <Calendar className="w-3.5 h-3.5 text-[#116b4e]" />
              <span className="hidden sm:inline font-bold">
                {hasCustomDateRange ? (filter.startDate === filter.endDate ? filter.startDate : 'Custom') : 'Date'}
              </span>
            </button>

            {/* 2. Filters Dropdown Expand Button (Next to Calendar Icon) */}
            {collapsible && (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 ${
                  isExpanded || hasAdvancedFilters
                    ? 'bg-slate-50 border-slate-300 text-slate-900 font-bold'
                    : 'bg-white hover:bg-slate-50 border-slate-200/90 text-slate-700'
                }`}
                title={isExpanded ? 'Collapse filters' : 'Expand more filters'}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Filters</span>
                {isExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 stroke-[2.2] text-slate-500" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 stroke-[2.2] text-slate-500" />
                )}
              </button>
            )}

            {/* 3. Download Export Button (Shown only when showDownload is enabled, e.g., on Records page) */}
            {showDownload && (
              <button
                type="button"
                onClick={() => setIsDownloadModalOpen(true)}
                className="p-2 sm:px-3 sm:py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer shrink-0 flex items-center gap-1.5 border text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border-slate-200/90 shadow-2xs"
                title="Download Records (CSV or PDF)"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span className="hidden sm:inline font-bold">Export</span>
              </button>
            )}
          </div>
        </div>

        {/* 2. Expanded / Secondary Drawer Filters */}
        {shouldShowExpanded && (
          <div className="pt-3 border-t border-slate-100 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Category Dropdown */}
              <div>
                <select
                  value={filter.category || 'All'}
                  onChange={(e) =>
                    onFilterChange({ ...filter, category: e.target.value as Category | 'All' })
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200/90 rounded-xl text-slate-800 font-medium focus:outline-hidden focus:bg-white cursor-pointer"
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
              </div>

              {/* Payment Method Segmented Controls */}
              <div className="flex items-center gap-2">
                <div className="flex-1 p-1 bg-slate-100 rounded-xl flex items-center justify-between text-xs">
                  {(['All', 'Cash', 'Card'] as const).map((mode) => {
                    const active = (filter.paymentMethod || 'All') === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onFilterChange({ ...filter, paymentMethod: mode })}
                        className={`flex-1 py-1 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                          active
                            ? 'bg-white text-slate-900 shadow-2xs font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>

                {/* Settled Red Reset Filters Icon Button */}
                {hasAdvancedFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="p-2 text-xs font-bold text-red-700 hover:bg-red-50 border border-red-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                    title="Reset all filters"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-red-700" />
                    <span className="hidden sm:inline">Reset</span>
                  </button>
                )}
              </div>
            </div>

            {/* Active Result Status Line */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>
                Showing <strong className="text-slate-700 font-bold">{totalFilteredCount}</strong> filtered transactions
              </span>
              {hasAdvancedFilters && (
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active filters applied
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Custom Calendar Date Modal Popup */}
      <CalendarDateModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        startDate={filter.startDate || ''}
        endDate={filter.endDate || ''}
        activeType={filter.type}
        onApply={(type, start, end) => {
          onFilterChange({
            ...filter,
            type,
            startDate: start,
            endDate: end,
          });
        }}
      />

      {/* Download / Export Records Modal Popup */}
      {showDownload && (
        <DownloadRecordsModal
          isOpen={isDownloadModalOpen}
          onClose={() => setIsDownloadModalOpen(false)}
          transactions={transactions}
          currency={currency}
          onNotification={onNotification}
        />
      )}
    </>
  );
};
