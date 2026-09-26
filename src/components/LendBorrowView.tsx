import React, { useState } from 'react';
import { 
  Plus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckCircle2, 
  Trash2, 
  Search, 
  User, 
  Calendar, 
  Phone, 
  Tag, 
  X, 
  HandCoins, 
  MessageSquare,
  ArrowLeftRight
} from 'lucide-react';
import { LendItem, LendType, LendStatus } from '../types/finance';
import { formatCurrency } from '../lib/calculations';
import { generateLendReminderText, triggerDeviceSms } from '../lib/smsAlert';
import { ConfirmModal } from './ConfirmModal';

interface LendBorrowViewProps {
  items: LendItem[];
  onAddItem: (item: Omit<LendItem, 'id' | 'createdAt'>) => void;
  onToggleStatus: (id: string) => void;
  onDeleteItem: (id: string) => void;
  currency?: string;
  isAddModalOpen?: boolean;
  onCloseAddModal?: () => void;
  onOpenAddModal?: (presetType?: LendType) => void;
}

export const LendBorrowView: React.FC<LendBorrowViewProps> = ({
  items,
  onAddItem,
  onToggleStatus,
  onDeleteItem,
  currency = 'Rs',
  isAddModalOpen: controlledModalOpen,
  onCloseAddModal,
  onOpenAddModal,
}) => {
  const [filterMode, setFilterMode] = useState<'status' | 'type'>('status');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'settled'>('all');
  const [filterType, setFilterType] = useState<'all' | 'lent' | 'borrowed'>('all');
  const [search, setSearch] = useState('');
  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<LendItem | null>(null);

  const isModalOpen = controlledModalOpen !== undefined ? controlledModalOpen : internalModalOpen;
  const setIsModalOpen = (open: boolean) => {
    if (controlledModalOpen !== undefined && onCloseAddModal && !open) {
      onCloseAddModal();
    } else {
      setInternalModalOpen(open);
    }
  };

  // Toggle between Status menu (All / Pending / Settled) and Type menu (All / Lent / Borrowed)
  const handleToggleMenu = () => {
    if (filterMode === 'status') {
      setFilterMode('type');
      setFilterStatus('all');
    } else {
      setFilterMode('status');
      setFilterType('all');
    }
  };

  // Form State
  const [type, setType] = useState<LendType>('lent');
  const [personName, setPersonName] = useState('');
  const [thingsOrReason, setThingsOrReason] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [formError, setFormError] = useState('');

  // Calculations: Pending items only for active debt
  const pendingItems = items.filter((i) => i.status === 'pending');
  const totalLentToReceive = pendingItems
    .filter((i) => i.type === 'lent')
    .reduce((sum, i) => sum + i.amount, 0);

  const totalBorrowedToPay = pendingItems
    .filter((i) => i.type === 'borrowed')
    .reduce((sum, i) => sum + i.amount, 0);

  const netBalance = totalLentToReceive - totalBorrowedToPay;

  // Filtered List
  const filteredItems = items.filter((i) => {
    if (filterStatus !== 'all' && i.status !== filterStatus) return false;
    if (filterType !== 'all' && i.type !== filterType) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchPerson = i.personName.toLowerCase().includes(q);
      const matchReason = i.thingsOrReason.toLowerCase().includes(q);
      const matchAmt = i.amount.toString().includes(q);
      const matchPhone = (i.phone || '').includes(q);
      if (!matchPerson && !matchReason && !matchAmt && !matchPhone) return false;
    }
    return true;
  });

  const handleOpenModal = (presetType: LendType = 'lent') => {
    if (onOpenAddModal) {
      onOpenAddModal(presetType);
    }
    setType(presetType);
    setPersonName('');
    setThingsOrReason('');
    setAmountStr('');
    setPhone('');
    setDate(new Date().toISOString().split('T')[0]);
    setDueDate('');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amountStr);
    if (!personName.trim()) {
      setFormError('Please enter person name');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('Please enter a valid amount');
      return;
    }

    onAddItem({
      personName: personName.trim(),
      thingsOrReason: thingsOrReason.trim() || (type === 'lent' ? 'Money Lent' : 'Money Borrowed'),
      amount: parsedAmount,
      type,
      status: 'pending',
      date,
      dueDate: dueDate || undefined,
      phone: phone.trim() || undefined,
    });

    setIsModalOpen(false);
  };

  const handleSendSmsReminder = (item: LendItem) => {
    const text = generateLendReminderText(item, currency);
    if (item.phone) {
      triggerDeviceSms(item.phone, text);
    } else {
      const entered = prompt(`Send SMS to ${item.personName}. Enter phone number:`, '');
      if (entered) {
        triggerDeviceSms(entered, text);
      }
    }
  };

  return (
    <div className="space-y-3.5">
      {/* 1. Executive Summary Cards (Clean short headings, no bracket Tamil) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {/* I LENT */}
        <div className="bg-white rounded-2xl p-4 border border-emerald-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
            </span>
            <span className="text-[10px] font-bold uppercase text-emerald-800 bg-emerald-100/60 px-2 py-0.5 rounded-full">
              To Receive
            </span>
          </div>
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            I Lent
          </span>
          <p className="text-lg sm:text-2xl font-black text-emerald-700 mt-0.5 truncate">
            {formatCurrency(totalLentToReceive, currency)}
          </p>
        </div>

        {/* I BORROWED */}
        <div className="bg-white rounded-2xl p-4 border border-red-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-red-700 mb-1">
            <span className="p-1.5 rounded-lg bg-red-50 text-red-700">
              <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
            </span>
            <span className="text-[10px] font-bold uppercase text-red-800 bg-red-100/60 px-2 py-0.5 rounded-full">
              To Return
            </span>
          </div>
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            I Borrowed
          </span>
          <p className="text-lg sm:text-2xl font-black text-red-700 mt-0.5 truncate">
            {formatCurrency(totalBorrowedToPay, currency)}
          </p>
        </div>

        {/* NET BALANCE */}
        <div className="col-span-2 sm:col-span-1 bg-slate-900 text-white rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-300 mb-1">
            <span className="p-1.5 rounded-lg bg-slate-800 text-emerald-400">
              <HandCoins className="w-4 h-4" />
            </span>
            <span className="text-[10px] font-bold uppercase text-slate-400">
              Balance
            </span>
          </div>
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Net Position
          </span>
          <p className={`text-lg sm:text-2xl font-black mt-0.5 truncate ${netBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatCurrency(netBalance, currency)}
          </p>
        </div>
      </div>

      {/* 2. Action Buttons (Clean single plus icon, short labels) */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => handleOpenModal('lent')}
          className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-all"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>I Lent</span>
        </button>

        <button
          type="button"
          onClick={() => handleOpenModal('borrowed')}
          className="py-2.5 px-4 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all border border-red-800/40"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>I Borrowed</span>
        </button>
      </div>

      {/* 3. Filter Row with Single Menu & Switch Arrow Icon */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* Main active filter menu */}
          <div className="flex-1 flex items-center gap-2">
            {filterMode === 'status' ? (
              /* All | Pending | Settled */
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600 flex-1">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'pending', label: 'Pending' },
                  { id: 'settled', label: 'Settled' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterStatus(tab.id as any)}
                    className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                      filterStatus === tab.id ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ) : (
              /* All | Lent | Borrowed */
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600 flex-1">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'lent', label: 'Lent' },
                  { id: 'borrowed', label: 'Borrowed' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterType(tab.id as any)}
                    className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                      filterType === tab.id ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Switch Arrow Icon Button */}
            <button
              type="button"
              onClick={handleToggleMenu}
              className="p-2 sm:px-2.5 sm:py-1.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
              title={filterMode === 'status' ? 'Switch to Lent / Borrowed filter' : 'Switch to All / Pending / Settled filter'}
            >
              <ArrowLeftRight className="w-4 h-4 text-slate-700" />
              <span className="hidden sm:inline text-[11px] text-slate-600 font-semibold">
                {filterMode === 'status' ? 'Type' : 'Status'}
              </span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search person name, reason, amount, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white"
          />
        </div>
      </div>

      {/* 4. Debt Cards List: Clearly shows Amount, Person Name, Reason, Phone, Date */}
      {filteredItems.length === 0 ? (
        <div className="py-12 px-4 text-center bg-white rounded-3xl border border-slate-200/80">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-2.5">
            <HandCoins className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-800">No records found</p>
          <p className="text-xs text-slate-400 mt-1">
            Tap I Lent or I Borrowed above to record a transaction.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map((item) => {
            const isLent = item.type === 'lent';
            const isSettled = item.status === 'settled';

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl p-4 border transition-all ${
                  isSettled
                    ? 'border-slate-200 bg-slate-50/50'
                    : isLent
                    ? 'border-emerald-200/80 hover:border-emerald-300'
                    : 'border-red-200/80 hover:border-red-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left Person, Reason, Phone & Date */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-sm text-slate-900 truncate">
                        {item.personName}
                      </h4>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isSettled
                            ? 'bg-slate-200 text-slate-700'
                            : isLent
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {isSettled ? 'Settled' : isLent ? 'Lent' : 'Borrowed'}
                      </span>
                    </div>

                    {/* Reason */}
                    <p className="text-xs text-slate-600 font-medium truncate flex items-center gap-1">
                      <Tag className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{item.thingsOrReason}</span>
                    </p>

                    {/* Metadata: Phone & Dates */}
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-0.5 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{item.date}</span>
                      </span>

                      {item.phone && (
                        <span className="flex items-center gap-1 text-slate-600 font-semibold bg-slate-100 px-1.5 py-0.5 rounded-md">
                          <Phone className="w-3 h-3 text-emerald-600" />
                          <span>{item.phone}</span>
                        </span>
                      )}

                      {item.dueDate && (
                        <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-md font-semibold">
                          Due: {item.dueDate}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Amount */}
                  <div className="text-right shrink-0">
                    <span
                      className={`text-base sm:text-lg font-black block ${
                        isSettled
                          ? 'text-slate-400 line-through'
                          : isLent
                          ? 'text-emerald-700'
                          : 'text-red-700'
                      }`}
                    >
                      {formatCurrency(item.amount, currency)}
                    </span>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleStatus(item.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isSettled
                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isSettled ? 'Re-open' : 'Mark Settled'}</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {!isSettled && (
                      <button
                        type="button"
                        onClick={() => handleSendSmsReminder(item)}
                        className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                        title="Send SMS Reminder"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">SMS Reminder</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setItemToDelete(item)}
                      className="p-1.5 text-slate-300 hover:text-red-700 rounded-lg cursor-pointer transition-colors"
                      title="Delete record"
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

      {/* 5. Add Record Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700">
                {type === 'lent' ? 'Record Money Lent' : 'Record Money Borrowed'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSubmit} className="p-5 overflow-y-auto space-y-3.5 text-xs sm:text-sm">
              {/* Type Switch */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setType('lent')}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    type === 'lent' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  I Lent
                </button>
                <button
                  type="button"
                  onClick={() => setType('borrowed')}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    type === 'borrowed' ? 'bg-white text-red-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  I Borrowed
                </button>
              </div>

              {/* Amount */}
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                  Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400">Rs</span>
                  <input
                    type="number"
                    step="any"
                    required
                    autoFocus
                    placeholder="0"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 text-xl font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Person Name */}
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                  Person Name
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kumar, Ravi, Keells..."
                    value={personName}
                    onChange={(e) => setPersonName(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Reason / Item */}
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                  Reason / Item
                </label>
                <div className="relative">
                  <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="e.g. Dinner bill, Grocery, Cash loan..."
                    value={thingsOrReason}
                    onChange={(e) => setThingsOrReason(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                  Phone Number (for SMS Reminder)
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    placeholder="0771234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Date & Due Date */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Due Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
              </div>

              {formError && (
                <p className="text-xs text-red-700 font-semibold">{formError}</p>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs shadow-xs cursor-pointer"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Universal Delete Item Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(itemToDelete)}
        title="Delete Record?"
        message={`Delete record of ${itemToDelete ? formatCurrency(itemToDelete.amount, currency) : ''} (${itemToDelete?.type === 'lent' ? 'Lent to' : 'Borrowed from'} ${itemToDelete?.personName})? This action cannot be undone.`}
        confirmLabel="Delete Record"
        cancelLabel="Cancel"
        isDestructive={true}
        icon="trash"
        onConfirm={() => {
          if (itemToDelete) {
            onDeleteItem(itemToDelete.id);
            setItemToDelete(null);
          }
        }}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
};
