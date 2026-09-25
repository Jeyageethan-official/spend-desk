import React, { useState } from 'react';
import { 
  X, 
  MessageSquare, 
  Check, 
  ArrowDownLeft, 
  CreditCard, 
  ArrowUpRight, 
  Sparkles, 
  Zap, 
  CornerDownRight 
} from 'lucide-react';
import { Transaction, Category, PaymentMethod, TransactionType } from '../types/finance';
import { parseBankSms, SAMPLE_SMS_TEMPLATES } from '../lib/smsParser';
import { formatCurrency, STANDARD_CATEGORIES } from '../lib/calculations';

interface SmsParserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  currency?: string;
}

export const SmsParserModal: React.FC<SmsParserModalProps> = ({
  isOpen,
  onClose,
  onAddTransaction,
  currency = 'Rs',
}) => {
  const [smsInput, setSmsInput] = useState('');
  const [parsed, setParsed] = useState(() => parseBankSms(''));

  const handleInputChange = (text: string) => {
    setSmsInput(text);
    if (text.trim()) {
      const res = parseBankSms(text);
      setParsed(res);
    }
  };

  const handleApplyTemplate = (templateText: string) => {
    setSmsInput(templateText);
    const res = parseBankSms(templateText);
    setParsed(res);
  };

  const handleConfirmAdd = () => {
    if (parsed.amount <= 0) return;

    onAddTransaction({
      amount: parsed.amount,
      type: parsed.type,
      category: parsed.category,
      paymentMethod: parsed.paymentMethod,
      date: parsed.date || new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().substring(0, 5),
      notes: parsed.merchant,
    });

    setSmsInput('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Header - Blue Theme */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-blue-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Bank SMS &amp; Alert Reader
              </h2>
              <p className="text-xs text-slate-500">
                Paste bank SMS or transaction alert to auto-fill
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {/* Quick Preset Samples */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-blue-600" />
              Try Example SMS:
            </span>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {SAMPLE_SMS_TEMPLATES.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyTemplate(sample.text)}
                  className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded-lg whitespace-nowrap text-slate-700 transition-colors cursor-pointer shrink-0"
                >
                  {sample.title}
                </button>
              ))}
            </div>
          </div>

          {/* SMS Paste Textarea */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Paste SMS or Notification Text
            </label>
            <textarea
              rows={3}
              value={smsInput}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="e.g. A/C *5678 debited for LKR 2,500.00 at Keells Super on 25-SEP-2026..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-xs sm:text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* Parsed Preview Card */}
          {smsInput.trim() && (
            <div className="bg-slate-50 border border-blue-200/80 rounded-2xl p-4 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-blue-600" />
                  Auto-Detected Details
                </span>
                <span className="text-base font-extrabold text-slate-900">
                  {formatCurrency(parsed.amount, currency)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-white rounded-xl border border-slate-100">
                  <span className="text-[10px] uppercase text-slate-400 font-semibold block">
                    Type
                  </span>
                  <div className="flex items-center gap-1.5 font-bold mt-0.5">
                    {parsed.type === 'cash_added' ? (
                      <>
                        <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Cash Top-up</span>
                      </>
                    ) : parsed.type === 'card_expense' ? (
                      <>
                        <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-blue-700">Card Spend</span>
                      </>
                    ) : (
                      <>
                        <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                        <span className="text-rose-700">Cash Spent</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-2 bg-white rounded-xl border border-slate-100">
                  <span className="text-[10px] uppercase text-slate-400 font-semibold block">
                    Category
                  </span>
                  <p className="font-bold text-slate-900 mt-0.5">
                    {parsed.category}
                  </p>
                </div>

                <div className="p-2 bg-white rounded-xl border border-slate-100">
                  <span className="text-[10px] uppercase text-slate-400 font-semibold block">
                    Payment Method
                  </span>
                  <p className="font-bold text-slate-900 mt-0.5">
                    {parsed.paymentMethod}
                  </p>
                </div>

                <div className="p-2 bg-white rounded-xl border border-slate-100">
                  <span className="text-[10px] uppercase text-slate-400 font-semibold block">
                    Merchant / Note
                  </span>
                  <p className="font-bold text-slate-900 mt-0.5 truncate">
                    {parsed.merchant || 'None'}
                  </p>
                </div>
              </div>

              {parsed.amount > 0 ? (
                <button
                  type="button"
                  onClick={handleConfirmAdd}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    Auto-Fill &amp; Record {formatCurrency(parsed.amount, currency)}
                  </span>
                </button>
              ) : (
                <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-xl text-center">
                  Could not parse amount from this SMS. Try another sample or edit manual.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
