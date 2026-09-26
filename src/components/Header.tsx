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
  Sliders
} from 'lucide-react';
import { GoogleSheetMeta } from '../types/finance';
import { UserProfile } from '../lib/storage';
import { formatCurrency } from '../lib/calculations';
import { triggerFeedback } from '../lib/haptics';
import { SpendDeskLogo } from './SpendDeskLogo';

interface HeaderProps {
  user: any;
  userProfile?: UserProfile;
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
}

export const Header: React.FC<HeaderProps> = ({
  user,
  userProfile,
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

  // Determine effective display name, avatar, and email
  const effectiveName = userProfile?.name || user?.displayName || 'Jeyaram Tech';
  const effectiveAvatar = userProfile?.avatar || user?.photoURL || null;
  const effectiveEmail = userProfile?.email || user?.email || 'jeyaramantech05@gmail.com';
  const effectiveInitial = effectiveName.charAt(0).toUpperCase() || 'J';

  const handleGoToProfile = () => {
    setIsProfileOpen(false);
    if (onOpenProfileEdit) {
      onOpenProfileEdit();
    } else {
      onOpenSettings('profile');
    }
  };

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo & App Title */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <SpendDeskLogo size="md" />
            <div className="hidden sm:block">
              <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200/60">
                Cash &amp; Card Spending
              </span>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Sheets Connection Quick Button (If signed in) */}
            {user && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onOpenSyncModal}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                  title="Google Sheets Sync"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden md:inline max-w-[100px] truncate">
                    {activeSheet ? activeSheet.name : 'Connect Sheet'}
                  </span>
                  {activeSheet && (
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  )}
                </button>

                {activeSheet && (
                  <button
                    type="button"
                    onClick={onQuickSync}
                    disabled={isSyncing}
                    className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    title="Quick sync to Google Sheet"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-600' : ''}`} />
                  </button>
                )}
              </div>
            )}

            {/* Quick Sign In button (if not signed in) */}
            {!user && (
              <button
                type="button"
                onClick={onSignIn}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-xs transition-all cursor-pointer"
                title="Sign in with Google"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                <span>Sign In</span>
              </button>
            )}

            {/* Desktop + Log Spend Action */}
            <button
              type="button"
              onClick={onOpenNewTransaction}
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>+ Log Spend</span>
            </button>

            {/* Settings Quick Button - Opens Settings Main Page */}
            <button
              type="button"
              onClick={() => onOpenSettings('main')}
              className="p-1.5 sm:p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
              title="Settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>

            {/* Sign Out Button (When user is signed in) */}
            {user && (
              <button
                type="button"
                onClick={onSignOut}
                className="p-1.5 sm:p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}

            {/* Profile Avatar Pill Button with Dynamic Details */}
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
                          <span>Sign Out from Google</span>
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

