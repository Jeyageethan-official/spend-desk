import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  CreditCard, 
  Edit3, 
  Trash2, 
  Wallet, 
  Clock, 
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
  SlidersHorizontal,
  Calendar,
  CalendarDays,
  Paperclip,
  X,
  ExternalLink
} from 'lucide-react';
import { Transaction, Category, FilterState } from '../types/finance';
import { formatCurrency, STANDARD_CATEGORIES } from '../lib/calculations';
import { triggerFeedback } from '../lib/haptics';

interface TransactionTableProps {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onAddNew?: () => void;
  currency?: string;
  filter?: FilterState;
  onFilterChange?: (newFilter: FilterState) => void;
}

const getCategoryIcon = (cat: Category) => {
  switch (cat) {
    case 'Food': return <Utensils className="w-4 h-4 text-red-500" />;
    case 'Transport': return <Car className="w-4 h-4 text-blue-500" />;
    case 'Shopping': return <ShoppingBag className="w-4 h-4 text-purple-500" />;
    case 'Bills': return <Zap className="w-4 h-4 text-amber-500" />;
    case 'Entertainment': return <Film className="w-4 h-4 text-violet-500" />;
    case 'Education': return <GraduationCap className="w-4 h-4 text-emerald-500" />;
    default: return <MoreHorizontal className="w-4 h-4 text-gray-500" />;
  }
};

export const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
  onEdit,
  onDelete,
  onAddNew,
  currency = 'Rs',
  filter,
  onFilterChange,
}) => {
  const [sortField, setSortField] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [viewReceipt, setViewReceipt] = useState<string | null>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

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
      const day = curr.getDay(); // 0 is Sun
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
        return sortOrder === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
      } else {
        return sortOrder === 'asc' ? a.amount - b.amount : b.amount - a.amount;
      }
    });
  }, [transactions, sortField, sortOrder]);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  const formatSectionDate = (dateStr: string) => {
    if (dateStr === todayStr) return 'Today';
    if (dateStr === yesterdayStr) return 'Yesterday';
    return dateStr;
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Table Header Controls */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-slate-100 text-slate-700">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-900">
              TRANSACTION LOG
            </h2>
            <p className="text-[11px] text-slate-400">
              {transactions.length} {transactions.length === 1 ? 'entry' : 'entries'} recorded
            </p>
          </div>
        </div>

        {/* Sort Filter Dropdown */}
        <div className="relative" ref={sortDropdownRef}>
          <button
            type="button"
            onClick={() => setIsSortOpen(!isSortOpen)}
            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
            title="Sort transactions"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[11px] font-bold text-slate-700 hidden sm:inline">
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

      {/* Quick Filters directly above transaction list */}
      {onFilterChange && (
        <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
            Quick:
          </span>

          {/* This Week */}
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

          {/* This Month */}
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

          {/* Cash Only */}
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

          {/* Card Only */}
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
            Your tracker is clean and ready at Rs 0.00. Tap below to log your first cash or card spend!
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
        <>
          {/* Mobile Native Card View (md:hidden) */}
          <div className="md:hidden divide-y divide-slate-100">
            {sortedTransactions.map((tx) => {
              const isCashIn = tx.type === 'cash_added';
              const isCard = tx.type === 'card_expense';

              return (
                <div
                  key={tx.id}
                  className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                >
                  {/* Left Icon & Category Details */}
                  <div 
                    onClick={() => onEdit(tx)}
                    className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                  >
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                        isCashIn
                          ? 'bg-emerald-100 text-emerald-700'
                          : isCard
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {isCashIn ? (
                        <ArrowDownLeft className="w-5 h-5 stroke-[2.5]" />
                      ) : isCard ? (
                        <CreditCard className="w-5 h-5 stroke-[2.5]" />
                      ) : (
                        getCategoryIcon(tx.category)
                      )}
                    </div>

                    <div className="truncate flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {tx.notes || tx.category}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-md font-semibold bg-slate-100 text-slate-600">
                          {tx.paymentMethod}
                        </span>
                        {tx.receiptImage && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerFeedback('tap');
                              setViewReceipt(tx.receiptImage!);
                            }}
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

                  {/* Right Amount & Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      onClick={() => onEdit(tx)}
                      className={`text-sm font-extrabold cursor-pointer ${
                        isCashIn
                          ? 'text-emerald-600'
                          : isCard
                          ? 'text-blue-600'
                          : 'text-slate-900'
                      }`}
                    >
                      {isCashIn ? '+' : '-'}
                      {formatCurrency(tx.amount, currency)}
                    </span>

                    <button
                      type="button"
                      onClick={() => onDelete(tx)}
                      className="p-1.5 text-slate-300 hover:text-rose-600 active:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (hidden md:block) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4 sm:px-6">Type &amp; Category</th>
                  <th className="py-3 px-4">Description / Notes</th>
                  <th className="py-3 px-4">Date &amp; Time</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4 text-right">Amount ({currency})</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                {sortedTransactions.map((tx) => {
                  const stdCat = STANDARD_CATEGORIES.find((c) => c.category === tx.category);
                  const isCashIn = tx.type === 'cash_added';
                  const isCard = tx.type === 'card_expense';

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="py-3 px-4 sm:px-6">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                              isCashIn
                                ? 'bg-emerald-100 text-emerald-700'
                                : isCard
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {isCashIn ? (
                              <ArrowDownLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                            ) : isCard ? (
                              <CreditCard className="w-3.5 h-3.5 stroke-[2.5]" />
                            ) : (
                              <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
                            )}
                          </div>
                          <div>
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                isCashIn
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : stdCat
                                  ? stdCat.bgClass
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {tx.category}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-700 font-medium max-w-[200px] truncate">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{tx.notes || '—'}</span>
                          {tx.receiptImage && (
                            <button
                              type="button"
                              onClick={() => {
                                triggerFeedback('tap');
                                setViewReceipt(tx.receiptImage!);
                              }}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 px-1.5 py-0.5 rounded-md cursor-pointer transition-colors shadow-2xs shrink-0"
                              title="View paper receipt"
                            >
                              <Paperclip className="w-2.5 h-2.5 text-teal-600" />
                              <span>Receipt</span>
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        <span className="font-semibold text-slate-700 block">{tx.date}</span>
                        {tx.time && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {tx.time}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                          {tx.paymentMethod}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span
                          className={`text-sm font-bold ${
                            isCashIn
                              ? 'text-emerald-600'
                              : isCard
                              ? 'text-blue-600'
                              : 'text-slate-900'
                          }`}
                        >
                          {isCashIn ? '+' : '-'}
                          {formatCurrency(tx.amount, currency)}
                        </span>
                      </td>

                      <td className="py-3 px-4 sm:px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onEdit(tx)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(tx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Full Paper Receipt Image Viewer Modal */}
      {viewReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Paper Receipt Photo
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={viewReceipt}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer"
                  title="Open full resolution in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setViewReceipt(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-auto flex items-center justify-center bg-slate-900/5 min-h-[220px]">
              <img
                src={viewReceipt}
                alt="Receipt Full View"
                className="max-h-[65vh] w-auto object-contain rounded-2xl shadow-md border border-slate-200 bg-white"
              />
            </div>
            <div className="p-3 border-t border-slate-100 bg-white flex justify-between items-center text-xs">
              <span className="text-slate-400 text-[11px]">Business Expense Attachment</span>
              <button
                type="button"
                onClick={() => setViewReceipt(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-900 text-white font-bold cursor-pointer hover:bg-slate-800 transition-colors shadow-2xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
