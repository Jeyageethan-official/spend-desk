import React from 'react';
import { X, CheckCircle2, Download, HardDrive, ShieldCheck, HelpCircle, FileSpreadsheet } from 'lucide-react';

interface AuthHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportCSV: () => void;
  userEmailAttempt?: string;
}

export const AuthHelpModal: React.FC<AuthHelpModalProps> = ({
  isOpen,
  onClose,
  onExportCSV,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#eaf5f0] text-[#116b4e]">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Help &amp; Account Guide
              </h2>
              <p className="text-xs text-slate-500 md:text-sm">
                How SpendDesk keeps your financial records safe
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {/* 1. Offline First Banner */}
          <div className="p-4 bg-[#eaf5f0] border border-[#116b4e]/30 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-[#116b4e] font-bold">
              <ShieldCheck className="w-4 h-4 text-[#116b4e] shrink-0" />
              <span>100% Free &amp; Private — No Sign-In Required</span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed md:text-sm">
              SpendDesk is designed to work completely offline on your device. Every transaction, cash balance, category, and lend/borrow record is saved directly to your private browser storage. You can use all features freely without signing in.
            </p>
          </div>

          {/* 2. Google Sheets Cloud Backup FAQ */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs text-slate-700 md:text-sm">
            <div className="flex items-center gap-2 text-slate-900 font-bold">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>How Google Sheets Sync Works</span>
            </div>
            <p className="leading-relaxed">
              Google Sign-In is an optional feature for users who want automatic cloud backups directly to a personal spreadsheet in their own Google Drive account.
            </p>
            
            <div className="pt-1 space-y-2">
              <div className="p-2.5 rounded-xl bg-white border border-slate-200/80">
                <span className="font-bold text-slate-900 block mb-0.5">
                  &bull; Why did Google show an authorization prompt or warning?
                </span>
                <span className="text-slate-600 text-[11px] block leading-normal md:text-xs">
                  Because Google Sheets and Drive permissions allow creating and updating spreadsheets, Google requires authorization. If your account is not authorized or cloud sync is unavailable, you can use SpendDesk fully in offline mode with complete safety.
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-slate-200/80">
                <span className="font-bold text-slate-900 block mb-0.5">
                  &bull; How can I backup or open my data in Excel / Sheets?
                </span>
                <span className="text-slate-600 text-[11px] block leading-normal md:text-xs">
                  You can click &ldquo;Export CSV&rdquo; anytime on the Records page or Settings to download a standard spreadsheet file compatible with Google Sheets, Microsoft Excel, and Apple Numbers.
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-slate-200/80">
                <span className="font-bold text-slate-900 block mb-0.5">
                  &bull; Will I lose my data if I close the app?
                </span>
                <span className="text-slate-600 text-[11px] block leading-normal md:text-xs">
                  No. All data is automatically saved locally. You can also download a full JSON backup from Settings &rarr; Data &amp; Backups anytime.
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action: Export CSV */}
          <div className="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-2xl">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-slate-600" />
              <span className="font-semibold text-xs text-slate-800 md:text-sm">Export your data right now</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onExportCSV();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#116b4e] hover:bg-[#0d5940] text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer transition-colors md:text-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs cursor-pointer transition-colors md:text-sm"
          >
            Got It, Continue
          </button>
        </div>
      </div>
    </div>
  );
};
