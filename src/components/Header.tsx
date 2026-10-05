import React, { useState, useRef, useEffect } from 'react';
import { 
  Wallet, 
  FileSpreadsheet, 
  Plus, 
  RefreshCw, 
  LogOut, 
  LogIn,
  CheckCircle2,
  HelpCircle,
  Settings as SettingsIcon,
  User as UserIcon,
  ChevronDown,
  ShieldCheck,
  Tag,
  Sliders,
  X,
  Trash2
} from 'lucide-react';
import { GoogleSheetMeta } from '../types/finance';
import { UserProfile } from '../lib/storage';
import { formatCurrency } from '../lib/calculations';
import { triggerFeedback } from '../lib/haptics';
import { SpendDeskLogo } from './SpendDeskLogo';

interface HeaderProps {
  user: any;
  userProfile?: UserProfile;
  storageEmail?: string | null;
  activeSheet: GoogleSheetMeta | null;
  isSyncing: boolean;
  totalCashBalance?: number;
  totalSpend?: number;
  currency?: string;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenSyncModal: () => void;
  onOpenNewTransaction: () => void;
  onOpenSmsModal: () => void;
  onQuickSync: () => void;
  onOpenAuthHelp: () => void;
  onOpenSettings: (tab?: 'main' | 'categories' | 'preferences' | 'budget' | 'cloud' | 'data' | 'about' | 'profile') => void;
  onOpenProfileEdit?: () => void;
  onGoHome?: () => void;
  selectionCount?: number;
  onCancelSelection?: () => void;
  onEditSelection?: () => void;
  onDeleteSelection?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  userProfile,
  storageEmail,
  activeSheet,
  isSyncing,
  totalCashBalance = 0,
  totalSpend = 0,
  currency = 'Rs',
  onSignIn,
  onSignOut,
  onOpenSyncModal,
  onOpenNewTransaction,
  onOpenSmsModal: _onOpenSmsModal,
  onQuickSync,
  onOpenAuthHelp,
  onOpenSettings,
  onOpenProfileEdit,
  onGoHome,
  selectionCount = 0,
  onCancelSelection,
  onEditSelection,
  onDeleteSelection,
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    if (isProfileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileOpen]);

  // Determine effective display name, avatar, and email strictly isolated per account
  const isOnlineUser = Boolean(user && user.email);
  const effectiveEmail = isOnlineUser 
    ? user.email 
    : (storageEmail && storageEmail !== 'guest' ? storageEmail : 'Local Offline Mode');
    
  const effectiveName = isOnlineUser
    ? (user.displayName || user.email?.split('@')[0] || 'Google User')
    : (userProfile?.name && userProfile.name !== 'Jeyaram Tech' && userProfile.name !== 'My Wallet'
        ? userProfile.name
        : (storageEmail && storageEmail !== 'guest' ? storageEmail.split('@')[0] : 'My Wallet'));

  const effectiveAvatar = isOnlineUser 
    ? (user.photoURL || userProfile?.avatar || null) 
    : (userProfile?.avatar || null);

  const effectiveInitial = (effectiveName && effectiveName.trim().length > 0 
    ? effectiveName.trim().charAt(0).toUpperCase() 
    : (effectiveEmail && effectiveEmail.includes('@') ? effectiveEmail.charAt(0).toUpperCase() : 'M'));

  const handleGoToProfile = () => {
    setIsProfileOpen(false);
    if (onOpenProfileEdit) {
      onOpenProfileEdit();
    } else {
      onOpenSettings('profile');
    }
  };

  if (selectionCount > 0) {
    return (
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onCancelSelection}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 active:scale-95 transition-all cursor-pointer"
                title="Cancel selection"
                aria-label="Cancel selection"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 whitespace-nowrap">
                {selectionCount} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              {selectionCount === 1 && (
                <button type="button" onClick={onEditSelection} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold active:scale-95 transition-all cursor-pointer">
                  Edit
                </button>
              )}
              <button type="button" onClick={onDeleteSelection} className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo & App Title */}
          <div 
            onClick={onGoHome}
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer select-none"
            role="button"
            tabIndex={0}
            title="Go to Home"
          >
            <SpendDeskLogo size="md" />
            <div className="hidden sm:block">
              <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#e8f8f3] text-[#10B77F] border border-[#10B77F]/30">
                Cash &amp; Card Spending
              </span>
            </div>
          </div>

          {/* Right Action Controls: ONLY 3 ITEMS (Reload/Sync, Settings, Profile Dropdown) */}
          <div className="flex items-center gap-2">
            {/* 1. Reload / Quick Sync Button */}
            <button
              type="button"
              onClick={onQuickSync || onOpenSyncModal}
              disabled={isSyncing}
              className="p-2 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded-xl border border-slate-200/80 transition-colors cursor-pointer disabled:opacity-50"
              title="Quick Sync / Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-emerald-600' : ''}`} />
            </button>

            {/* 2. Settings Icon */}
            <button
              type="button"
              onClick={() => onOpenSettings('main')}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200/80 transition-colors cursor-pointer"
              title="Settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>

            {/* 3. Profile Avatar Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => {
                  triggerFeedback('tap');
                  setIsProfileOpen(!isProfileOpen);
                }}
                className="flex items-center gap-1.5 p-1 sm:pr-2.5 rounded-full border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer shadow-2xs group"
                title="Account & Profile"
                aria-expanded={isProfileOpen}
              >
                {effectiveAvatar ? (
                  <img
                    src={effectiveAvatar}
                    alt={effectiveName}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-emerald-500/50"
                  />
                ) : (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold text-xs flex items-center justify-center shadow-2xs">
                    {effectiveInitial}
                  </div>
                )}
                <span className="hidden sm:inline-block text-xs font-bold text-slate-800 max-w-[110px] truncate">
                  {effectiveName}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Click-outside backdrop without blur */}
              {isProfileOpen && (
                <div
                  className="fixed inset-0 z-40 bg-transparent"
                  onClick={() => setIsProfileOpen(false)}
                  aria-hidden="true"
                />
              )}

              {/* Profile Dropdown Menu - Professionally styled & responsive */}
              {isProfileOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 max-w-[calc(100vw-1.25rem)] bg-white rounded-3xl shadow-2xl border border-slate-200/90 z-50 animate-in fade-in zoom-in-95 duration-100 overflow-hidden text-xs">
                  {/* Top Profile Card with Default details */}
                  <div className="p-4 border-b border-slate-100 bg-gradient-to-b from-slate-50/90 to-white">
                    <div className="flex items-start gap-3">
                      {effectiveAvatar ? (
                        <img
                          src={effectiveAvatar}
                          alt={effectiveName}
                          className="w-12 h-12 rounded-2xl object-cover border-2 border-emerald-500/40 shadow-xs shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold text-base flex items-center justify-center shadow-xs shrink-0">
                          {effectiveInitial}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="font-bold text-slate-900 text-sm truncate">
                            {effectiveName}
                          </h4>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {effectiveEmail}
                        </p>
                        
                        <div className="mt-2">
                          {user ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>Google Synced</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-full">
                              <ShieldCheck className="w-3 h-3 text-blue-600 shrink-0" />
                              <span>Local Offline Safe</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Navigation & Action Options */}
                  <div className="p-2 space-y-1">
                    {/* Profile Option (Navigates directly to Edit Profile Page) */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerFeedback('tap');
                        handleGoToProfile();
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 rounded-xl flex items-center justify-between text-slate-800 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                          <UserIcon className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <span className="font-bold text-xs block text-slate-900">Profile</span>
                          <span className="text-[10px] text-slate-400 block">Edit photo, name &amp; Gmail</span>
                        </div>
                      </div>
                    </button>

                    {/* Google Sheets Manager */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerFeedback('tap');
                        setIsProfileOpen(false);
                        onOpenSyncModal();
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 rounded-xl flex items-center justify-between text-slate-800 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <span className="font-bold text-xs block text-slate-900">Google Sheets Manager</span>
                          <span className="text-[10px] text-slate-400 block">
                            {activeSheet ? activeSheet.name : 'Connect spreadsheet'}
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Help & FAQs */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerFeedback('tap');
                        setIsProfileOpen(false);
                        onOpenAuthHelp();
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 rounded-xl flex items-center gap-2.5 text-slate-700 hover:text-slate-900 cursor-pointer transition-colors font-medium"
                    >
                      <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </div>
                      <span>Help &amp; FAQs</span>
                    </button>

                    {/* Sign In / Sign Out Button */}
                    <div className="pt-1 border-t border-slate-100">
                      {user ? (
                        <button
                          type="button"
                          onClick={() => {
                            triggerFeedback('tap');
                            setIsProfileOpen(false);
                            onSignOut();
                          }}
                          className="w-full text-left px-3 py-2.5 hover:bg-rose-50 rounded-xl flex items-center gap-2.5 text-rose-600 hover:text-rose-700 cursor-pointer transition-colors font-semibold"
                        >
                          <LogOut className="w-4 h-4 text-rose-500 shrink-0" />
                          <span>Sign Out</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            triggerFeedback('tap');
                            setIsProfileOpen(false);
                            onSignIn();
                          }}
                          className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 rounded-xl flex items-center gap-2.5 text-slate-800 hover:text-emerald-900 cursor-pointer transition-colors font-semibold"
                        >
                          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"/>
                            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                          </svg>
                          <span>Sign In with Google</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
