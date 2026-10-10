import React, { useState } from 'react';
import { 
  X, 
  MessageSquare, 
  ArrowDownLeft, 
  CreditCard, 
  ArrowUpRight, 
  Sparkles, 
  Zap, 
  Clipboard,
  CheckCircle2
} from 'lucide-react';
import { Transaction } from '../types/finance';
import { parseBankSms, SAMPLE_SMS_TEMPLATES } from '../lib/smsParser';
import { formatCurrency } from '../lib/calculations';

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

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          handleInputChange(text);
        }
      }
    } catch {
      // ignore
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden max-h-[92vh] flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Sleek Minimalist Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                Bank SMS Reader
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5 md:text-xs">
                Auto-extract amount, category &amp; payment method
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {/* Quick Example Templates */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5 flex items-center gap-1 md:text-xs">
              <Sparkles className="w-3 h-3 text-blue-600" />
              Quick Templates
            </span>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {SAMPLE_SMS_TEMPLATES.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyTemplate(sample.text)}
                  className="px-2.5 py-1 text-xs bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200/80 rounded-xl whitespace-nowrap text-slate-700 font-medium transition-colors cursor-pointer shrink-0 md:text-sm"
                >
                  {sample.title}
                </button>
              ))}
            </div>
          </div>

          {/* SMS Paste Textarea */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 md:text-xs">
                SMS / Alert Text
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="text-[10px] font-semibold text-blue-600 hover:underline cursor-pointer flex items-center gap-1 md:text-xs"
                >
                  <Clipboard className="w-3 h-3" />
                  <span>Paste</span>
                </button>
                {smsInput && (
                  <button
                    type="button"
                    onClick={() => setSmsInput('')}
                    className="text-[10px] font-semibold text-rose-600 hover:underline cursor-pointer md:text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <textarea
              rows={3}
              value={smsInput}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="Paste SMS here (e.g. A/C *5678 debited for LKR 2,500.00 at Keells Super on 25-SEP-2026...)"
              className="w-full p-3 bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-200 rounded-2xl text-slate-800 text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900/5 focus:border-slate-400 transition-all resize-none"
            />
          </div>

          {/* Parsed Preview Card */}
          {smsInput.trim() ? (
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 space-y-3.5 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 md:text-sm">
                  <Zap className="w-3.5 h-3.5 text-blue-600" />
                  Detected Transaction
                </span>
                <span className="text-base sm:text-lg font-black text-slate-900 tabular-nums">
                  {formatCurrency(parsed.amount, currency)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block md:text-xs">
                    Type
                  </span>
                  <div className="flex items-center gap-1 font-bold mt-0.5">
                    {parsed.type === 'cash_added' ? (
                      <>
                        <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Cash Added</span>
                      </>
                    ) : parsed.type === 'card_expense' ? (
                      <>
                        <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-blue-700">Card Spend</span>
                      </>
                    ) : (
                      <>
                        <ArrowUpRight className="w-3.5 h-3.5 text-red-600" />
                        <span className="text-red-600">Cash Spent</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block md:text-xs">
                    Category
                  </span>
                  <p className="font-bold text-slate-900 mt-0.5 truncate">
                    {parsed.category}
                  </p>
                </div>

                <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block md:text-xs">
                    Payment Mode
                  </span>
                  <p className="font-bold text-slate-900 mt-0.5">
                    {parsed.paymentMethod}
                  </p>
                </div>

                <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block md:text-xs">
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
                  className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all md:text-sm"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>
                    Confirm &amp; Record {formatCurrency(parsed.amount, currency)}
                  </span>
                </button>
              ) : (
                <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-xl text-center font-medium border border-amber-200/80 md:text-sm">
                  Could not parse amount from this SMS. Please check text or enter manually.
                </p>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center">
              <p className="text-xs text-slate-500 font-medium md:text-sm">
                Copy and paste your bank debit SMS or ATM withdrawal alert above.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
