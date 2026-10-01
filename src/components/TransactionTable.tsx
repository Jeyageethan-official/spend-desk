import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  ArrowDownLeft, 
  CreditCard, 
  Trash2, 
  Wallet, 
  Layers, 
  ArrowUpDown, 
  Plus, 
  Utensils, 
  Car, 
  ShoppingBag, 
  Zap, 
  Film, 
  GraduationCap, 
  MoreHorizontal, 
  ChevronDown, 
  Check, 
  Calendar,
  CalendarDays,
  Paperclip,
  X,
  CheckSquare,
  Square,
  Edit2,
  Table as TableIcon,
  LayoutGrid
} from 'lucide-react';
import { Transaction, Category, FilterState } from '../types/finance';
import { formatCurrency, calculateRunningBalances, formatDateToDisplayHeader } from '../lib/calculations';
import { triggerFeedback } from '../lib/haptics';

interface TransactionTableProps {
  transactions: Transaction[];
  allTransactions?: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onBulkDelete?: (txIds: string[]) => void;
  onAddNew?: () => void;
  currency?: string;
  filter?: FilterState;
  onFilterChange?: (newFilter: FilterState) => void;
  selectedTxIds?: string[];
  onSelectedTxIdsChange?: (txIds: string[]) => void;
}

const getCategoryIcon = (cat: Category, colorClass: string) => {
  switch (cat) {
    case 'Food': return <Utensils className={`w-3.5 h-3.5 ${colorClass}`} />;
    case 'Transport': return <Car className={`w-3.5 h-3.5 ${colorClass}`} />;
    case 'Shopping': return <ShoppingBag className={`w-3.5 h-3.5 ${colorClass}`} />;
    case 'Bills': return <Zap className={`w-3.5 h-3.5 ${colorClass}`} />;
    case 'Entertainment': return <Film className={`w-3.5 h-3.5 ${colorClass}`} />;
    case 'Education': return <GraduationCap className={`w-3.5 h-3.5 ${colorClass}`} />;
    default: return <MoreHorizontal className={`w-3.5 h-3.5 ${colorClass}`} />;
  }
};

export const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
  allTransactions,
  onEdit,
  onDelete,
  onBulkDelete,
  onAddNew,
  currency = 'Rs',
  filter,
  onFilterChange,
  selectedTxIds: controlledSelectedTxIds,
  onSelectedTxIdsChange,
}) => {
  const [sortField, setSortField] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [viewReceipt, setViewReceipt] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'sheet' | 'cards'>('sheet');
  const [internalSelectedTxIds, setInternalSelectedTxIds] = useState<string[]>([]);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  const didLongPressRef = useRef(false);

  const selectedTxIds = controlledSelectedTxIds ?? internalSelectedTxIds;
  const updateSelectedTxIds = (next: string[] | ((current: string[]) => string[])) => {
    const resolved = typeof next === 'function' ? next(selectedTxIds) : next;
    if (controlledSelectedTxIds === undefined) setInternalSelectedTxIds(resolved);
    onSelectedTxIdsChange?.(resolved);
  };

  const isSelectionMode = selectedTxIds.length > 0;

  const toggleSelectTx = (txId: string) => {
    triggerFeedback('tap');
    updateSelectedTxIds(prev =>
      prev.includes(txId) ? prev.filter(id => id !== txId) : [...prev, txId]
    );
  };

  const handleRowClick = (tx: Transaction) => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    if (isSelectionMode) {
      toggleSelectTx(tx.id);
    } else {
      onEdit(tx);
    }
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressStartRef.current = null;
  };

  const handleRowPointerDown = (event: React.PointerEvent<HTMLElement>, txId: string) => {
    if (event.button !== 0 || isSelectionMode) return;
    didLongPressRef.current = false;
    pressStartRef.current = { x: event.clientX, y: event.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      pressStartRef.current = null;
      didLongPressRef.current = true;
      triggerFeedback('warning');
      updateSelectedTxIds(prev => prev.includes(txId) ? prev : [...prev, txId]);
    }, 650);
  };

  const handleRowPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const pressStart = pressStartRef.current;
    if (!pressStart) return;
    if (Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 10) {
      clearLongPress();
    }
  };

  useEffect(() => clearLongPress, []);

  // Compute accurate running balances across full transaction dataset
  const runningBalances = useMemo(() => {
    return calculateRunningBalances(allTransactions && allTransactions.length > 0 ? allTransactions : transactions);
  }, [allTransactions, transactions]);

  // Quick Filter active states
  const isWeekActive = filter?.type === 'week';
  const isMonthActive = filter?.type === 'month';
  const isCashOnlyActive = filter?.paymentMethod === 'Cash';
  const isCardOnlyActive = filter?.paymentMethod === 'Card';

  const getPresetDates = (type: 'week' | 'month'): { startDate: string; endDate: string } => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (type === 'week') {
      const curr = new Date(now);
      const day = curr.getDay();
      const diffToMon = curr.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(curr.setDate(diffToMon));
      const monStr = monday.toISOString().split('T')[0];
      return { startDate: monStr, endDate: todayStr };
    } else {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      return { startDate: `${year}-${month}-01`, endDate: todayStr };
    }
  };

  const handleToggleDatePreset = (preset: 'week' | 'month') => {
    triggerFeedback('tap');
    if (!filter || !onFilterChange) return;
    if (filter.type === preset) {
      onFilterChange({
        ...filter,
        type: 'all',
        startDate: '',
        endDate: '',
      });
    } else {
      const dates = getPresetDates(preset);
      onFilterChange({
        ...filter,
        type: preset,
        startDate: dates.startDate,
        endDate: dates.endDate,
      });
    }
  };

  const handleTogglePayment = (method: 'Cash' | 'Card') => {
    triggerFeedback('tap');
    if (!filter || !onFilterChange) return;
    if (filter.paymentMethod === method) {
      onFilterChange({
        ...filter,
        paymentMethod: 'All',
      });
    } else {
      onFilterChange({
        ...filter,
        paymentMethod: method,
      });
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setIsSortOpen(false);
      }
    };
    if (isSortOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSortOpen]);

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => {
      if (sortField === 'date') {
        const dateA = (a.date || '') + (a.time || '00:00');
        const dateB = (b.date || '') + (b.time || '00:00');
        return sortOrder === 'desc' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
      } else {
        return sortOrder === 'desc' ? b.amount - a.amount : a.amount - b.amount;
      }
    });
  }, [transactions, sortField, sortOrder]);

  // Group transactions by date for the Google Sheet date banners
  const groupedByDate = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    sortedTransactions.forEach((tx) => {
      const d = tx.date || '';
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(tx);
    });
    return Array.from(map.entries());
  }, [sortedTransactions]);

  const handleExecuteBulkDelete = () => {
    if (selectedTxIds.length === 0) return;
    triggerFeedback('warning');
    if (onBulkDelete) {
      onBulkDelete(selectedTxIds);
    } else {
      selectedTxIds.forEach(id => {
        const item = transactions.find(t => t.id === id);
        if (item) onDelete(item);
      });
    }
    updateSelectedTxIds([]);
  };

  const singleSelectedTx = selectedTxIds.length === 1 ? transactions.find(t => t.id === selectedTxIds[0]) : null;

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
      {/* Top Header & Action Bar */}
      {isSelectionMode ? (
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateSelectedTxIds([])}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold">
              {selectedTxIds.length} item{selectedTxIds.length > 1 ? 's' : ''} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            {singleSelectedTx && (
              <button
                type="button"
                onClick={() => {
                  onEdit(singleSelectedTx);
                  updateSelectedTxIds([]);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExecuteBulkDelete}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete ({selectedTxIds.length})</span>
            </button>
          </div>
        </div>
      ) : (
        /* Normal Header Bar */
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-[#0f355c] flex items-center justify-center text-white">
              <TableIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Transaction Ledger
              </h3>
              <p className="text-[10px] text-slate-400">
                {transactions.length} records &bull; Google Sheet Styled Highlights
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Switcher: Sheet vs Cards */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => {
                  triggerFeedback('tap');
                  setViewMode('sheet');
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'sheet'
                    ? 'bg-white text-[#0f355c] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Spreadsheet Grid View"
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sheet Grid</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerFeedback('tap');
                  setViewMode('cards');
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white text-[#0f355c] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Cards View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="relative" ref={sortDropdownRef}>
              <button
                type="button"
                onClick={() => setIsSortOpen(!isSortOpen)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowUpDown className="w-3 h-3 text-slate-500" />
                <span>
                  {sortField === 'date'
                    ? (sortOrder === 'desc' ? 'Newest' : 'Oldest')
                    : (sortOrder === 'desc' ? 'Highest' : 'Lowest')
                  }
                </span>
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
              </button>

              {isSortOpen && (
                <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-20 animate-in fade-in duration-100 text-xs">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Sort Records
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSortField('date'); setSortOrder('desc'); setIsSortOpen(false); }}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 cursor-pointer ${
                      sortField === 'date' && sortOrder === 'desc' ? 'font-bold text-slate-900 bg-slate-50' : 'text-slate-600'
                    }`}
                  >
                    <span>Date: Newest first</span>
                    {sortField === 'date' && sortOrder === 'desc' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSortField('date'); setSortOrder('asc'); setIsSortOpen(false); }}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 cursor-pointer ${
                      sortField === 'date' && sortOrder === 'asc' ? 'font-bold text-slate-900 bg-slate-50' : 'text-slate-600'
                    }`}
                  >
                    <span>Date: Oldest first</span>
                    {sortField === 'date' && sortOrder === 'asc' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    type="button"
                    onClick={() => { setSortField('amount'); setSortOrder('desc'); setIsSortOpen(false); }}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 cursor-pointer ${
                      sortField === 'amount' && sortOrder === 'desc' ? 'font-bold text-slate-900 bg-slate-50' : 'text-slate-600'
                    }`}
                  >
                    <span>Amount: High to Low</span>
                    {sortField === 'amount' && sortOrder === 'desc' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSortField('amount'); setSortOrder('asc'); setIsSortOpen(false); }}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 cursor-pointer ${
                      sortField === 'amount' && sortOrder === 'asc' ? 'font-bold text-slate-900 bg-slate-50' : 'text-slate-600'
                    }`}
                  >
                    <span>Amount: Low to High</span>
                    {sortField === 'amount' && sortOrder === 'asc' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Filters */}
      {onFilterChange && !isSelectionMode && (
        <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
            Quick:
          </span>

          <button
            type="button"
            onClick={() => handleToggleDatePreset('week')}
            className={`px-2.5 py-1 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              isWeekActive
                ? 'bg-slate-900 text-white font-bold shadow-2xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80 font-medium'
            }`}
          >
            <Calendar className="w-3 h-3 text-emerald-500" />
            <span>This Week</span>
            {isWeekActive && <Check className="w-3 h-3 text-emerald-400" />}
          </button>

          <button
            type="button"
            onClick={() => handleToggleDatePreset('month')}
            className={`px-2.5 py-1 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              isMonthActive
                ? 'bg-slate-900 text-white font-bold shadow-2xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80 font-medium'
            }`}
          >
            <CalendarDays className="w-3 h-3 text-blue-500" />
            <span>This Month</span>
            {isMonthActive && <Check className="w-3 h-3 text-emerald-400" />}
          </button>

          <button
            type="button"
            onClick={() => handleTogglePayment('Cash')}
            className={`px-2.5 py-1 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              isCashOnlyActive
                ? 'bg-slate-900 text-white font-bold shadow-2xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80 font-medium'
            }`}
          >
            <Wallet className="w-3 h-3 text-emerald-600" />
            <span>Cash Only</span>
            {isCashOnlyActive && <Check className="w-3 h-3 text-emerald-400" />}
          </button>

          <button
            type="button"
            onClick={() => handleTogglePayment('Card')}
            className={`px-2.5 py-1 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              isCardOnlyActive
                ? 'bg-slate-900 text-white font-bold shadow-2xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80 font-medium'
            }`}
          >
            <CreditCard className="w-3 h-3 text-blue-600" />
            <span>Card Only</span>
            {isCardOnlyActive && <Check className="w-3 h-3 text-emerald-400" />}
          </button>
        </div>
      )}

      {/* Empty State */}
      {transactions.length === 0 ? (
        <div className="py-12 px-4 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <Wallet className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-800">No transactions recorded yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            Your tracker is clean and ready. Tap below to log your first spend or cash-in!
          </p>
          {onAddNew && (
            <button
              type="button"
              onClick={onAddNew}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[#116b4e] hover:bg-[#0d5940] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Record First Spend</span>
            </button>
          )}
        </div>
      ) : viewMode === 'sheet' ? (
        /* EXACT Google Sheets Table View (as shown in user screenshot) */
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs border-collapse min-w-[860px]">
            {/* Dark Navy Blue Header Row */}
            <thead>
              <tr className="bg-[#0f355c] text-white font-bold text-[11px] select-none border-b border-[#0b2744]">
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
                <th className="py-2.5 px-3">Note</th>
                <th className="py-2.5 px-3">Payment Method</th>
                <th className="py-2.5 px-3 text-right">Balance</th>
                <th className="py-2.5 px-3 text-right text-rose-300">Out of Wallet</th>
                <th className="py-2.5 px-3 text-right text-sky-200">Card Payment</th>
                <th className="py-2.5 px-3 text-center w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupedByDate.map(([dateStr, dayTxs]) => {
                const displayDateHeader = formatDateToDisplayHeader(dateStr);
                return (
                  <React.Fragment key={dateStr}>
                    {/* Centered Bold Date Banner matching screenshot */}
                    <tr className="bg-slate-100/90 border-y border-slate-200/90 font-bold select-none">
                      <td colSpan={12} className="py-2 px-3 text-center">
                        <span className="text-xs font-bold text-[#0f355c] tracking-wide inline-flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-[#0f355c]" />
                          {displayDateHeader}
                        </span>
                      </td>
                    </tr>

                    {/* Transaction Data Rows for this Date */}
                    {dayTxs.map((tx) => {
                      const isCashIn = tx.type === 'cash_added';
                      const isCard = tx.type === 'card_expense' || tx.paymentMethod === 'Card' || tx.paymentMethod === 'Bank Transfer';
                      const rb = runningBalances.get(tx.id);
                      const balanceVal = rb ? rb.balance : 0;
                      const oowVal = rb ? rb.outOfWallet : 0;
                      const isSelected = selectedTxIds.includes(tx.id);

                      return (
                        <tr
                          key={tx.id}
                          onClick={() => handleRowClick(tx)}
                          onPointerDown={(e) => handleRowPointerDown(e, tx.id)}
                          onPointerMove={handleRowPointerMove}
                          onPointerUp={clearLongPress}
                          onPointerCancel={clearLongPress}
                          onPointerLeave={clearLongPress}
                          className={`border-b border-slate-100 hover:bg-sky-50/40 transition-colors cursor-pointer select-none ${
                            isSelected ? 'bg-amber-50/80' : 'even:bg-slate-50/30'
                          }`}
                        >
                          {/* Selection Checkbox */}
                          <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => toggleSelectTx(tx.id)}
                              className="text-slate-400 hover:text-slate-700 cursor-pointer"
                              title={isSelected ? 'Deselect' : 'Select'}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-[#0f355c]" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300" />
                              )}
                            </button>
                          </td>

                          {/* Date */}
                          <td className="py-2 px-3 text-[#0284c7] font-medium whitespace-nowrap">
                            {displayDateHeader}
                          </td>

                          {/* Time */}
                          <td className="py-2 px-3 text-[#0284c7] whitespace-nowrap font-mono text-[11px]">
                            {tx.time || '--:--'}
                          </td>

                          {/* Type (IN / OUT badge with dropdown chevron look) */}
                          <td className="py-2 px-3 whitespace-nowrap">
                            {isCashIn ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-[#dcfce7] text-[#15803d] border border-[#86efac]">
                                <span>IN</span>
                                <ChevronDown className="w-3 h-3 text-[#15803d]" />
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-[#fee2e2] text-[#dc2626] border border-[#fca5a5]">
                                <span>OUT</span>
                                <ChevronDown className="w-3 h-3 text-[#dc2626]" />
                              </span>
                            )}
                          </td>

                          {/* Category */}
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                              {getCategoryIcon(tx.category, isCashIn ? 'text-emerald-600' : 'text-slate-500')}
                              <span>{tx.category || (isCashIn ? 'Cash In' : 'Other')}</span>
                            </span>
                          </td>

                          {/* Amount (Green for IN, Red for OUT) */}
                          <td className="py-2 px-3 text-right whitespace-nowrap">
                            <span className={`font-bold font-mono ${
                              isCashIn ? 'text-[#15803d]' : 'text-[#dc2626]'
                            }`}>
                              {currency} {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </span>
                          </td>

                          {/* Note */}
                          <td className="py-2 px-3 text-slate-800 max-w-[200px] truncate" title={tx.notes}>
                            {tx.notes ? (
                              <span className="text-slate-800">{tx.notes}</span>
                            ) : (
                              <span className="text-slate-300 italic">--</span>
                            )}
                            {tx.receiptImage && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerFeedback('tap');
                                  setViewReceipt(tx.receiptImage!);
                                }}
                                className="ml-1 inline-flex items-center text-teal-600 hover:text-teal-800"
                                title="View Receipt"
                              >
                                <Paperclip className="w-3 h-3" />
                              </button>
                            )}
                          </td>

                          {/* Payment Method (Green pill for Cash, Blue pill for Card) */}
                          <td className="py-2 px-3 whitespace-nowrap">
                            {tx.paymentMethod === 'Cash' || !tx.paymentMethod ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#dcfce7] text-[#15803d] border border-[#86efac]">
                                <span>Cash</span>
                                <ChevronDown className="w-2.5 h-2.5 text-[#15803d]" />
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#dbeafe] text-[#1d4ed8] border border-[#93c5fd]">
                                <span>{tx.paymentMethod}</span>
                                <ChevronDown className="w-2.5 h-2.5 text-[#1d4ed8]" />
                              </span>
                            )}
                          </td>

                          {/* Balance (Blue font) */}
                          <td className="py-2 px-3 text-right whitespace-nowrap font-mono font-semibold text-[#0284c7]">
                            {currency} {balanceVal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </td>

                          {/* Out of Wallet (Red font like in user screenshot) */}
                          <td className="py-2 px-3 text-right whitespace-nowrap font-mono font-bold text-[#dc2626]">
                            {oowVal > 0 ? (
                              <span>-{currency} {oowVal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                            ) : (
                              <span className="text-slate-200">--</span>
                            )}
                          </td>

                          {/* Card Payment Column */}
                          <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-[#0284c7]">
                            {isCard ? (
                              <span>{currency} {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                            ) : (
                              <span className="text-slate-200">--</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-2 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => onEdit(tx)}
                                className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDelete(tx)}
                                className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Mobile Cards View (with the exact same color highlights) */
        <div className="divide-y divide-slate-100">
          {groupedByDate.map(([dateStr, dayTxs]) => {
            const displayDateHeader = formatDateToDisplayHeader(dateStr);
            return (
              <div key={dateStr} className="space-y-1">
                {/* Centered Date Banner */}
                <div className="py-2 px-4 bg-slate-100/90 border-y border-slate-200 text-center font-bold text-xs text-[#0f355c] tracking-wide flex items-center justify-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#0f355c]" />
                  <span>{displayDateHeader}</span>
                </div>

                {dayTxs.map((tx) => {
                  const isCashIn = tx.type === 'cash_added';
                  const isCard = tx.type === 'card_expense' || tx.paymentMethod === 'Card' || tx.paymentMethod === 'Bank Transfer';
                  const isSelected = selectedTxIds.includes(tx.id);
                  const rb = runningBalances.get(tx.id);
                  const bal = rb ? rb.balance : 0;
                  const oow = rb ? rb.outOfWallet : 0;

                  return (
                    <div
                      key={tx.id}
                      onClick={() => handleRowClick(tx)}
                      onPointerDown={(event) => handleRowPointerDown(event, tx.id)}
                      onPointerMove={handleRowPointerMove}
                      onPointerUp={clearLongPress}
                      onPointerCancel={clearLongPress}
                      onPointerLeave={clearLongPress}
                      className={`p-3.5 transition-colors cursor-pointer select-none ${
                        isSelected ? 'bg-amber-50/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        {/* Left: Type badge + Category + Notes */}
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          {/* Selection Checkbox */}
                          {isSelectionMode && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectTx(tx.id);
                              }}
                              className="text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-[#0f355c]" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300" />
                              )}
                            </button>
                          )}

                          {/* IN / OUT Badge */}
                          {isCashIn ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#dcfce7] text-[#15803d] border border-[#86efac] shrink-0">
                              IN
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#fee2e2] text-[#dc2626] border border-[#fca5a5] shrink-0">
                              OUT
                            </span>
                          )}

                          <div className="truncate flex-1">
                            <span className="font-bold text-xs text-slate-900 truncate block">
                              {tx.notes || tx.category}
                            </span>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                              {tx.time && <span className="font-mono text-[#0284c7]">{tx.time}</span>}
                              <span>&bull;</span>
                              <span>{tx.category}</span>
                              <span>&bull;</span>
                              <span className={`px-1.5 py-0.2 rounded font-semibold text-[10px] ${
                                tx.paymentMethod === 'Cash' || !tx.paymentMethod
                                  ? 'bg-[#dcfce7] text-[#15803d] border border-[#86efac]'
                                  : 'bg-[#dbeafe] text-[#1d4ed8] border border-[#93c5fd]'
                              }`}>
                                {tx.paymentMethod || 'Cash'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right: Amount & Running Balance */}
                        <div className="flex flex-col items-end shrink-0">
                          <span className={`text-sm font-black font-mono ${
                            isCashIn ? 'text-[#15803d]' : 'text-[#dc2626]'
                          }`}>
                            {isCashIn ? '+' : '-'}{currency} {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </span>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono mt-0.5">
                            <span className="text-[#0284c7] font-semibold">Bal: {currency} {bal.toLocaleString('en-US')}</span>
                            {oow > 0 && (
                              <span className="text-[#dc2626] font-bold bg-rose-50 px-1 rounded border border-rose-200">
                                OOW: -{currency} {oow.toLocaleString('en-US')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Receipt Full Preview Overlay */}
      {viewReceipt && (
        <div
          onClick={() => setViewReceipt(null)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="relative max-w-lg w-full bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-700/80 p-2">
            <button
              type="button"
              onClick={() => setViewReceipt(null)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white cursor-pointer shadow-md"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={viewReceipt}
              alt="Receipt Preview"
              className="w-full h-auto max-h-[80vh] object-contain rounded-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
