import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = true,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden transform transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full shrink-0 ${isDestructive ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 id="confirm-modal-title" className="text-lg font-semibold text-slate-900">
                {title}
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {message}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`px-4 py-2 text-sm font-medium text-white rounded-xl shadow-xs transition-colors cursor-pointer ${
                isDestructive 
                  ? 'bg-red-600 hover:bg-red-700 active:bg-red-800' 
                  : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
