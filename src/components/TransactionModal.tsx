import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  ArrowDownLeft, 
  ArrowUpRight, 
  CreditCard, 
  Calendar, 
  FileText, 
  Utensils, 
  Car, 
  ShoppingBag, 
  Zap, 
  Film, 
  GraduationCap, 
  MoreHorizontal, 
  Tag,
  Settings as SettingsIcon
} from 'lucide-react';
import { Transaction, TransactionType, Category, PaymentMethod } from '../types/finance';
import { 
  loadStoredCustomCategoryDefs, 
  CustomCategoryDef 
} from '../lib/storage';
import { getCategoryIcon } from '../lib/icons';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: Omit<Transaction, 'id' | 'createdAt'> & { id?: string; sendSmsTo?: string }) => void;
  editingTransaction?: Transaction | null;
  defaultType?: TransactionType;
  defaultAlertPhone?: string;
  onOpenSmsReader?: () => void;
  onOpenSettingsCategories?: () => void;
}

const DEFAULT_CATEGORIES: { label: string; iconName: string }[] = [
  { label: 'Food', iconName: 'Utensils' },
  { label: 'Transport', iconName: 'Car' },
  { label: 'Shopping', iconName: 'ShoppingBag' },
  { label: 'Bills', iconName: 'Zap' },
  { label: 'Entertainment', iconName: 'Film' },
  { label: 'Education', iconName: 'GraduationCap' },
  { label: 'Other', iconName: 'MoreHorizontal' },
];

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingTransaction,
  defaultType = 'cash_expense',
  defaultAlertPhone = '',
  onOpenSettingsCategories,
}) => {
  const [type, setType] = useState<TransactionType>(defaultType);
  const [amountStr, setAmountStr] = useState<string>('');
  const [category, setCategory] = useState<Category>('Food');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [date, setDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  
  // Custom categories state loaded from storage
  const [customCategoryDefs, setCustomCategoryDefs] = useState<CustomCategoryDef[]>(() => loadStoredCustomCategoryDefs());

  const amountInputRef = useRef<HTMLInputElement>(null);

  // Reload custom categories when modal opens
  useEffect(() => {
    if (isOpen) {
      setCustomCategoryDefs(loadStoredCustomCategoryDefs());
    }
  }, [isOpen]);

  useEffect(() => {
    if (editingTransaction) {
      setType(editingTransaction.type);
      setAmountStr(editingTransaction.amount.toString());
      setCategory(editingTransaction.category);
      setPaymentMethod(editingTransaction.paymentMethod);
      setDate(editingTransaction.date);
      setNotes(editingTransaction.notes);
    } else {
      setType(defaultType);
      setAmountStr('');
      const now = new Date();
      setDate(now.toISOString().split('T')[0]);
      setNotes('');

      if (defaultType === 'cash_added') {
        setCategory('Income / Top-up');
        setPaymentMethod('Cash');
      } else if (defaultType === 'card_expense') {
        setCategory('Shopping');
        setPaymentMethod('Card');
      } else {
        setCategory('Food');
        setPaymentMethod('Cash');
      }
    }
  }, [editingTransaction, defaultType, isOpen]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    if (newType === 'cash_added') {
      setCategory('Income / Top-up');
      setPaymentMethod('Cash');
    } else if (newType === 'card_expense') {
      if (category === 'Income / Top-up') setCategory('Shopping');
      setPaymentMethod('Card');
    } else {
      if (category === 'Income / Top-up') setCategory('Food');
      setPaymentMethod('Cash');
    }
  };

  const handleQuickAdd = (addVal: number) => {
    const num = parseFloat(amountStr) || 0;
    setAmountStr((num + addVal).toString());
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const parsed = parseFloat(amountStr);
    if (isNaN(parsed) || parsed <= 0) {
      return;
    }

    const txDate = date || new Date().toISOString().split('T')[0];
    const nowTime = new Date().toTimeString().substring(0, 5);

    onSave({
      id: editingTransaction ? editingTransaction.id : undefined,
      type,
      amount: parsed,
      category,
      paymentMethod,
      date: txDate,
      time: nowTime,
      notes: notes.trim(),
      sendSmsTo: defaultAlertPhone ? defaultAlertPhone : undefined,
    });

    onClose();
  };

  if (!isOpen) return null;

  const currentAmountNum = parseFloat(amountStr) || 0;

  // Build combined categories
  const allCategories = [
    ...DEFAULT_CATEGORIES.map(c => ({ label: c.label, iconName: c.iconName })),
    ...customCategoryDefs.map(c => ({
      label: c.name,
      iconName: c.iconName || 'Tag'
    }))
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[94vh] flex flex-col transition-all"
        role="dialog"
        aria-modal="true"
      >
        {/* Header Bar */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            {editingTransaction ? 'Edit Transaction' : 'Record Transaction'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {/* 1. Transaction Type Toggle */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => handleTypeChange('cash_expense')}
              className={`py-2 px-1 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                type === 'cash_expense'
                  ? 'bg-white text-rose-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5 text-rose-600" />
              <span>Cash Out</span>
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('card_expense')}
              className={`py-2 px-1 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                type === 'card_expense'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5 text-blue-600" />
              <span>Card / Bank</span>
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('cash_added')}
              className={`py-2 px-1 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                type === 'cash_added'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
              <span>Add Cash</span>
            </button>
          </div>

          {/* 2. Amount Input Box */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 text-center">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Amount
            </label>
            <div className="flex items-center justify-center relative max-w-xs mx-auto">
              <span className="text-xl font-bold text-slate-400 mr-2">Rs</span>
              <input
                ref={amountInputRef}
                type="number"
                step="any"
                required
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className={`w-44 text-3xl sm:text-4xl font-black bg-transparent text-center focus:outline-hidden ${
                  type === 'cash_added' 
                    ? 'text-emerald-600' 
                    : type === 'card_expense' 
                    ? 'text-blue-600' 
                    : 'text-rose-600'
                }`}
              />
            </div>

            {/* Quick Add Increment Chips */}
            <div className="flex items-center justify-center gap-1.5 mt-3 flex-wrap">
              {[100, 500, 1000, 5000].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleQuickAdd(chip)}
                  className="px-2.5 py-1 text-xs font-bold bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl transition-all shadow-2xs cursor-pointer"
                >
                  +{chip.toLocaleString()}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmountStr('')}
                className="px-2.5 py-1 text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* 3. Category Picker (Clean & Fast, with Link to Manage in Settings) */}
          {type !== 'cash_added' ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Select Category
                </span>
                {onOpenSettingsCategories && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSettingsCategories();
                    }}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer hover:underline"
                  >
                    <SettingsIcon className="w-3 h-3" />
                    <span>Manage Categories</span>
                  </button>
                )}
              </div>

              {/* Categories Grid */}
              <div className="grid grid-cols-4 gap-2">
                {allCategories.map((item) => {
                  const active = category === item.label;
                  const Icon = getCategoryIcon(item.iconName);

                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => setCategory(item.label)}
                      className={`w-full flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all cursor-pointer ${
                        active
                          ? 'bg-slate-900 border-slate-900 text-white shadow-sm scale-102'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className={`w-4 h-4 mb-1 ${active ? 'text-emerald-400' : 'text-slate-500'}`} />
                      <span className="text-[11px] font-bold truncate max-w-full">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Topping up physical wallet. This adds directly to <strong>Current Cash Balance</strong>.
              </span>
            </div>
          )}

          {/* 4. Notes & Date Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Date
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Payment Mode
              </label>
              <div className="grid grid-cols-2 gap-1 bg-slate-100 p-0.5 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Cash')}
                  className={`py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    paymentMethod === 'Cash' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Card')}
                  className={`py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    paymentMethod === 'Card' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Card/Bank
                </button>
              </div>
            </div>
          </div>

          {/* 5. Notes */}
          <div>
            <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
              Notes (Optional)
            </label>
            <div className="relative">
              <FileText className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="e.g. Dinner with friends, Keells grocery..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white"
              />
            </div>
          </div>

          {/* Footer Submit */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={currentAmountNum <= 0}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs shadow-xs cursor-pointer disabled:opacity-40 transition-all"
            >
              {editingTransaction ? 'Save Changes' : 'Record Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
