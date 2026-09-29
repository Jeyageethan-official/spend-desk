import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
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
  Camera,
  Paperclip,
  CheckCircle2,
  Settings as SettingsIcon
} from 'lucide-react';
import { Transaction, TransactionType, Category, PaymentMethod } from '../types/finance';
import { 
  loadStoredCategoryDefs, 
  CategoryDef 
} from '../lib/storage';
import { getCategoryIcon } from '../lib/icons';
import { triggerFeedback } from '../lib/haptics';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: Omit<Transaction, 'id' | 'createdAt'> & { id?: string; sendSmsTo?: string; receiptImage?: string }) => void;
  editingTransaction?: Transaction | null;
  defaultType?: TransactionType;
  defaultAlertPhone?: string;
  onOpenSmsReader?: () => void;
  onOpenSettingsCategories?: () => void;
  storageEmail?: string | null;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingTransaction,
  defaultType = 'cash_expense',
  defaultAlertPhone = '',
  onOpenSettingsCategories,
  storageEmail,
}) => {
  const [type, setType] = useState<TransactionType>(defaultType);
  const [amountStr, setAmountStr] = useState<string>('');
  const [category, setCategory] = useState<Category>('Food');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [date, setDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [receiptImage, setReceiptImage] = useState<string | undefined>(undefined);
  
  // Unified categories state loaded from storage
  const [categoryDefs, setCategoryDefs] = useState<CategoryDef[]>(() => loadStoredCategoryDefs(storageEmail));
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const handleClose = () => {
    if (amountStr.trim() !== '' || notes.trim() !== '') {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const amountInputRef = useRef<HTMLInputElement>(null);
  const receiptFileRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 900;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.72);
          setReceiptImage(compressed);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Reload categories when modal opens
  useEffect(() => {
    if (isOpen) {
      const stored = loadStoredCategoryDefs(storageEmail);
      setCategoryDefs(stored);
      if (!editingTransaction && stored.length > 0 && !stored.some(c => c.name === category)) {
        setCategory(stored[0].name);
      }
    }
  }, [isOpen, storageEmail]);

  useEffect(() => {
    if (editingTransaction) {
      setType(editingTransaction.type);
      setAmountStr(editingTransaction.amount.toString());
      setCategory(editingTransaction.category);
      setPaymentMethod(editingTransaction.paymentMethod);
      setDate(editingTransaction.date);
      setNotes(editingTransaction.notes);
      setReceiptImage(editingTransaction.receiptImage);
    } else {
      setType(defaultType);
      setAmountStr('');
      const now = new Date();
      setDate(now.toISOString().split('T')[0]);
      setNotes('');
      setReceiptImage(undefined);

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

  // Lock body scroll when modal is open to prevent page movement/shift
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      const previousHtmlOverflow = document.documentElement.style.overflow;
      const previousBodyOverflow = document.body.style.overflow;
      const previousBodyPosition = document.body.style.position;
      const previousBodyTop = document.body.style.top;
      const previousBodyWidth = document.body.style.width;

      // On mobile Safari, overflow:hidden alone still permits the page behind a
      // bottom sheet to rubber-band. Fix the document in place while this sheet is open.
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';

      // Prevent a swipe on the sheet header/backdrop from moving the page behind
      // the modal. The form itself keeps normal vertical scrolling.
      const blockBackgroundTouch = (event: TouchEvent) => {
        if (!formRef.current?.contains(event.target as Node)) {
          event.preventDefault();
        }
      };
      const overlay = overlayRef.current;
      overlay?.addEventListener('touchmove', blockBackgroundTouch, { passive: false });

      return () => {
        overlay?.removeEventListener('touchmove', blockBackgroundTouch);
        document.documentElement.style.overflow = previousHtmlOverflow;
        document.body.style.overflow = previousBodyOverflow;
        document.body.style.position = previousBodyPosition;
        document.body.style.top = previousBodyTop;
        document.body.style.width = previousBodyWidth;
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    if (newType === 'cash_added') {
      setCategory('Income / Top-up');
      setPaymentMethod('Cash');
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

    triggerFeedback('success');

    onSave({
      id: editingTransaction ? editingTransaction.id : undefined,
      type,
      amount: parsed,
      category,
      paymentMethod,
      date: txDate,
      time: nowTime,
      notes: notes.trim(),
      receiptImage: receiptImage || undefined,
      sendSmsTo: defaultAlertPhone ? defaultAlertPhone : undefined,
    });

    onClose();
  };

  if (!isOpen) return null;

  const currentAmountNum = parseFloat(amountStr) || 0;

  // Both payment choices intentionally share the same neutral interaction state.
  // Payment method is data, not a visual status, so Card must not turn blue on hover.
  const paymentModeButtonClass = (method: 'Cash' | 'Card') => (
    `py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
      paymentMethod === method
        ? 'bg-slate-900 text-white shadow-xs font-black'
        : 'text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
    }`
  );

  // Build combined categories from unified list
  const allCategories = categoryDefs.map(c => ({
    label: c.name,
    iconName: c.iconName || 'Tag'
  }));

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-xs overscroll-none animate-in fade-in duration-150">
      <motion.div
        initial={{ opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[94vh] flex flex-col touch-pan-y"
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
            onClick={handleClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form ref={formRef} id="transaction-form" onSubmit={handleSubmit} className="p-5 overflow-y-auto overscroll-contain flex-1 space-y-4 text-xs sm:text-sm touch-pan-y">
          {/* 1. Transaction Type Toggle (2 Tabs: Spend vs Add Cash) */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => handleTypeChange('cash_expense')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                type === 'cash_expense'
                  ? 'bg-white text-rose-700 shadow-sm font-extrabold'
                  : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
              }`}
            >
              <ArrowDownLeft className="w-4 h-4 text-rose-600" />
              <span>Spend / Cash Out</span>
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('cash_added')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                type === 'cash_added'
                  ? 'bg-white text-emerald-700 shadow-sm font-extrabold'
                  : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
              }`}
            >
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              <span>Add Cash / Income</span>
            </button>
          </div>

          {/* 2. Amount Input Box */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 text-center">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Amount
            </label>
            <div className="flex items-center justify-center relative max-w-xs mx-auto">
              <input
                ref={amountInputRef}
                type="number"
                step="any"
                required
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className={`w-48 text-3xl sm:text-4xl font-black bg-transparent text-center focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                  type === 'cash_added' 
                    ? 'text-emerald-600' 
                    : type === 'card_expense' 
                    ? 'text-blue-600' 
                    : 'text-rose-600'
                }`}
              />

              {/* Unique Sleek Instant Clear Button */}
              {amountStr && (
                <button
                  type="button"
                  onClick={() => {
                    setAmountStr('');
                    amountInputRef.current?.focus();
                  }}
                  className="absolute right-4 w-7 h-7 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                  title="Clear amount"
                  aria-label="Clear amount"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              )}
            </div>

            {/* Quick Add Increment Chips */}
            <div className="flex items-center justify-center gap-1.5 mt-3 flex-wrap">
              {[100, 500, 1000, 5000].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleQuickAdd(chip)}
                  className="px-3 py-1 text-xs font-bold bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl transition-all shadow-2xs cursor-pointer"
                >
                  +{chip.toLocaleString()}
                </button>
              ))}
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
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-2 text-xs text-left font-medium bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Payment Mode
              </label>
              <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Cash')}
                  className={paymentModeButtonClass('Cash')}
                >
                  Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Card')}
                  className={paymentModeButtonClass('Card')}
                >
                  Card
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

          {/* 6. Receipt / Bill Photo Attachment */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1.5">
                <Paperclip className="w-3 h-3 text-slate-400" />
                <span>Receipt / Bill Photo (Optional)</span>
              </label>
              {receiptImage && (
                <button
                  type="button"
                  onClick={() => setReceiptImage(undefined)}
                  className="text-[10px] text-rose-600 hover:text-rose-700 font-semibold cursor-pointer"
                >
                  Remove Receipt
                </button>
              )}
            </div>

            <input
              type="file"
              ref={receiptFileRef}
              onChange={handleReceiptUpload}
              accept="image/*"
              className="hidden"
            />

            {receiptImage ? (
              <div className="rounded-2xl overflow-hidden border border-emerald-300 bg-emerald-50/50 p-2.5 flex items-center gap-3">
                <img
                  src={receiptImage}
                  alt="Receipt Preview"
                  className="w-14 h-14 object-cover rounded-xl border border-emerald-300 shadow-2xs shrink-0 cursor-pointer"
                  onClick={() => window.open(receiptImage, '_blank')}
                  title="Click to view full image"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-emerald-800 font-bold text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Receipt Attached</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Paper receipt photo saved with this transaction record.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => receiptFileRef.current?.click()}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0 cursor-pointer shadow-2xs"
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => receiptFileRef.current?.click()}
                className="w-full py-2.5 px-3 rounded-2xl border border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/30 flex items-center justify-center gap-2 text-slate-600 hover:text-emerald-700 text-xs font-semibold transition-all cursor-pointer group"
              >
                <Camera className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                <span>Snap or Attach Paper Receipt Photo</span>
              </button>
            )}
          </div>
        </form>

        {/* Fixed Sticky Bottom Bar */}
        <div className="p-4 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shrink-0 shadow-xs">
          <button
            type="submit"
            form="transaction-form"
            disabled={currentAmountNum <= 0}
            className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 active:scale-[0.99] text-white rounded-2xl font-black text-sm shadow-md cursor-pointer disabled:opacity-40 transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-200 stroke-[2.5]" />
            <span>{editingTransaction ? 'Save Changes' : 'Save Transaction'}</span>
          </button>
        </div>

        {/* Discard Confirmation Popup */}
        {showDiscardConfirm && (
          <div className="absolute inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-5 max-w-xs w-full shadow-2xl space-y-3 border border-slate-200 animate-in fade-in zoom-in-95 duration-100">
              <h4 className="font-bold text-slate-900 text-sm">Discard Transaction?</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                You have entered details. Leaving now will discard this record.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDiscardConfirm(false);
                    onClose();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
