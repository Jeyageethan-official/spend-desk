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
  Square
} from 'lucide-react';
import { Transaction, Category, FilterState } from '../types/finance';
import { formatCurrency } from '../lib/calculations';
import { triggerFeedback } from '../lib/haptics';

interface TransactionTableProps {
  transactions: Transaction[];
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

const formatSectionDate = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    if (dateStr === todayStr) return 'Today';

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yestStr = yesterday.toISOString().split('T')[0];
    if (dateStr === yestStr) return 'Yesterday';

    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const getCategoryIcon = (cat: Category, colorClass: string) => {
  switch (cat) {
    case 'Food': return <Utensils className={`w-4 h-4 ${colorClass}`} />;
    case 'Transport': return <Car className={`w-4 h-4 ${colorClass}`} />;
    case 'Shopping': return <ShoppingBag className={`w-4 h-4 ${colorClass}`} />;
    case 'Bills': return <Zap className={`w-4 h-4 ${colorClass}`} />;
    case 'Entertainment': return <Film className={`w-4 h-4 ${colorClass}`} />;
    case 'Education': return <GraduationCap className={`w-4 h-4 ${colorClass}`} />;
    default: return <MoreHorizontal className={`w-4 h-4 ${colorClass}`} />;
  }
};

export const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
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
    }
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressStartRef.current = null;
  };

  const handleRowPointerDown = (event: React.PointerEvent<HTMLDivElement>, txId: string) => {
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

  const handleRowPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pressStart = pressStartRef.current;
    if (!pressStart) return;

    // Any real scroll or swipe cancels selection before the long-press timer can fire.
    if (Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 10) {
      clearLongPress();
    }
  };

  useEffect(() => clearLongPress, []);

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
        const dateA = a.date + (a.time || '00:00');
        const dateB = b.date + (b.time || '00:00');
        return sortOrder === 'desc' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
      } else {
        return sortOrder === 'desc' ? b.amount - a.amount : a.amount - b.amount;
      }
    });
  }, [transactions, sortField, sortOrder]);

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
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
      {/* Top Header Bar */}
      {!isSelectionMode && (
        /* Normal Header Bar */
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Transaction Log
              </h3>
              <p className="text-[10px] text-slate-400">
                {transactions.length} entries recorded &bull; Long-press a row for bulk actions
              </p>
            </div>
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
      )}

      {/* Quick Filters directly above transaction list */}
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
          <p className="text-sm font-bold text-slate-800">No transactions yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            Your tracker is clean and ready at Rs 0.00. Tap below to log your first spend!
          </p>
          {onAddNew && (
            <button
              type="button"
              onClick={onAddNew}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Record First Spend</span>
            </button>
          )}
        </div>
      ) : (
        /* Transaction Rows List */
        <div className="divide-y divide-slate-100">
          {sortedTransactions.map((tx) => {
            const isCashIn = tx.type === 'cash_added';
            const isCard = tx.type === 'card_expense' || tx.paymentMethod === 'Card' || tx.paymentMethod === 'Bank Transfer';
            const isSelected = selectedTxIds.includes(tx.id);

            const boxBgClass = isCashIn
              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/80'
              : isCard
              ? 'bg-blue-50 text-blue-600 border border-blue-200/80'
              : 'bg-rose-50 text-rose-600 border border-rose-200/80';

            const textColorClass = isCashIn
              ? 'text-emerald-600'
              : isCard
              ? 'text-blue-600'
              : 'text-rose-600';

            return (
              <div
                key={tx.id}
                className={`transition-colors select-none ${
                  isSelected ? 'bg-slate-100/90' : 'hover:bg-slate-50/60'
                }`}
                onPointerDown={(event) => handleRowPointerDown(event, tx.id)}
                onPointerMove={handleRowPointerMove}
                onPointerUp={clearLongPress}
                onPointerCancel={clearLongPress}
                onPointerLeave={clearLongPress}
              >
                {/* Main Row Display */}
                <div
                  onClick={() => handleRowClick(tx)}
                  className="p-3.5 flex items-center justify-between gap-3 cursor-pointer"
                >
                  {isSelectionMode && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectTx(tx.id);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="p-1 text-slate-600 cursor-pointer shrink-0 touch-manipulation"
                      title={isSelected ? `Deselect ${tx.notes || tx.category}` : `Select ${tx.notes || tx.category}`}
                      aria-label={isSelected ? `Deselect ${tx.notes || tx.category}` : `Select ${tx.notes || tx.category}`}
                      aria-pressed={isSelected}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-slate-900" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-300" />
                      )}
                    </button>
                  )}

                  {/* Left Icon & Category Details */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${boxBgClass}`}>
                      {isCashIn ? (
                        <ArrowDownLeft className="w-5 h-5 stroke-[2.5]" />
                      ) : isCard ? (
                        <CreditCard className="w-5 h-5 stroke-[2.5]" />
                      ) : (
                        getCategoryIcon(tx.category, textColorClass)
                      )}
                    </div>

                    <div className="truncate flex-1">
                      <span className="font-bold text-xs text-slate-900 truncate block">
                        {tx.notes || tx.category}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        {tx.receiptImage && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerFeedback('tap');
                              setViewReceipt(tx.receiptImage!);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 px-1.5 py-0.5 rounded-md cursor-pointer transition-colors shadow-2xs"
                            title="View paper receipt"
                          >
                            <Paperclip className="w-2.5 h-2.5 text-teal-600" />
                            <span>Receipt</span>
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                        <span>{formatSectionDate(tx.date)}</span>
                        {tx.time && <span>&bull; {tx.time}</span>}
                        {tx.notes && <span className="truncate">&bull; {tx.category}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Amount */}
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className={`text-sm font-black ${textColorClass}`}>
                        {isCashIn ? '+' : '-'}
                        {formatCurrency(tx.amount, currency)}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                        isCard ? 'bg-blue-50 text-blue-700 border border-blue-200/60' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {tx.paymentMethod}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(tx);
                      }}
                      onTouchStart={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 active:scale-95 transition-all cursor-pointer"
                      title={`Delete ${tx.notes || tx.category}`}
                      aria-label={`Delete ${tx.notes || tx.category}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
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
              alt="Receipt Full Preview"
              className="w-full h-auto max-h-[80vh] object-contain rounded-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
