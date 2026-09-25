import React from 'react';
import { X, ShieldAlert, CheckCircle2, Download, ExternalLink, HardDrive } from 'lucide-react';

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
  userEmailAttempt = 'your account',
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
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Google Sign-In Status
              </h2>
              <p className="text-xs text-slate-500">
                Error 403: Google Cloud Test Mode
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
          {/* Status Banner */}
          <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl text-amber-900 space-y-1.5">
            <p className="font-bold text-xs sm:text-sm">
              Why did Google show &ldquo;Access blocked (Error 403)&rdquo;?
            </p>
            <p className="text-xs text-amber-800 leading-relaxed">
              Because sensitive Google Drive &amp; Sheets permissions were requested, Google automatically puts the consent screen in <strong>Testing Mode</strong>. In this mode, only email addresses listed under &ldquo;Test Users&rdquo; in Google Cloud Console can sign in.
            </p>
          </div>

          {/* Solution 1: 100% Functional Local-First Mode */}
          <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-emerald-800 font-bold">
              <HardDrive className="w-4 h-4 text-emerald-600" />
              <span>No Sign-In Required: Local Mobile Mode is Active!</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              You do <strong>not</strong> need to sign in to use this app. All your daily cash and card records, SMS alerts, category summaries, and daily trends are safely saved directly in your mobile browser storage.
            </p>
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onExportCSV}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Google Sheets CSV</span>
              </button>
            </div>
          </div>

          {/* Solution 2: For Google Cloud Developer */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs text-slate-600">
            <p className="font-bold text-slate-800 flex items-center gap-1.5">
              <span>To enable Google Sign-In for your email:</span>
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1">
              <li>Open <strong>Google Cloud Console</strong> &rarr; <strong>APIs &amp; Services</strong> &rarr; <strong>OAuth Consent Screen</strong>.</li>
              <li>Under <strong>Test users</strong>, click <strong>+ Add Users</strong>.</li>
              <li>Add your email: <code className="bg-slate-200 px-1 rounded text-slate-800 font-mono text-[11px]">{userEmailAttempt}</code> and save.</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl shadow-xs cursor-pointer"
          >
            Continue with Local Mobile Storage
          </button>
        </div>
      </div>
    </div>
  );
};
