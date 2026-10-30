import React from 'react';
import { Trash2, AlertTriangle, RotateCcw, LogOut } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  icon?: 'trash' | 'warning' | 'reset' | 'logout';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The confirmation alert — a CENTERED card, not a bottom sheet.
 *
 * Shaped like the design's "Delete Transaction" screen: the action icon sits
 * in a coloured circle that pops over the top edge of the card, one short
 * title, one short sentence, then Cancel / confirm side by side. Backdrop tap
 * cancels; destructive confirm stays on the right where the thumb lands.
 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  isDestructive = true,
  icon = 'trash',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  // The logout glyph is never "delete"-coloured: signing out is not a
  // destructive act on the data, so it reads amber like a caution, not rose.
  const iconTone =
    icon === 'logout'
      ? 'bg-amber-100 text-amber-700'
      : isDestructive
        ? 'bg-rose-100 text-rose-600'
        : icon === 'reset'
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-amber-100 text-amber-700';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-[5px] animate-in fade-in duration-150"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="relative w-full max-w-[312px] bg-white rounded-[26px] shadow-[0_32px_70px_-16px_rgba(15,23,42,0.45)] px-6 pt-12 pb-6 text-center animate-in zoom-in-95 fade-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        {/* Action icon breaking the top edge of the card */}
        <div
          className={`absolute -top-7 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full flex items-center justify-center ring-4 ring-white shadow-sm ${iconTone}`}
        >
          {icon === 'trash' ? (
            <Trash2 className="w-6 h-6 stroke-[2.2]" />
          ) : icon === 'reset' ? (
            <RotateCcw className="w-6 h-6 stroke-[2.2]" />
          ) : icon === 'logout' ? (
            <LogOut className="w-6 h-6 stroke-[2.2]" />
          ) : (
            <AlertTriangle className="w-6 h-6 stroke-[2.2]" />
          )}
        </div>

        <h3 id="confirm-modal-title" className="text-[16px] font-bold text-slate-900 tracking-[-0.01em] leading-snug">
          {title}
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{message}</p>

        <div className="mt-5 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 text-[13px] font-semibold transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 h-10 rounded-xl text-[13px] font-bold text-white shadow-xs transition-colors cursor-pointer active:scale-[0.98] ${
              isDestructive
                ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800'
                : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
