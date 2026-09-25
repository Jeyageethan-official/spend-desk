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
  ShieldCheck
} from 'lucide-react';
import { GoogleSheetMeta } from '../types/finance';

interface HeaderProps {
  user: any;
  activeSheet: GoogleSheetMeta | null;
  isSyncing: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenSyncModal: () => void;
  onOpenNewTransaction: () => void;
  onOpenSmsModal: () => void;
  onQuickSync: () => void;
  onOpenAuthHelp: () => void;
  onOpenSettings: (tab?: 'categories' | 'preferences' | 'data' | 'about') => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  activeSheet,
  isSyncing,
  onSignIn,
  onSignOut,
  onOpenSyncModal,
  onOpenNewTransaction,
  onOpenSmsModal: _onOpenSmsModal,
  onQuickSync,
  onOpenAuthHelp,
  onOpenSettings,
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

  const userInitial = user?.displayName
    ? user.displayName.charAt(0).toUpperCase()
    : user?.email
    ? user.email.charAt(0).toUpperCase()
    : 'U';

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo & App Title */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-xs">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 leading-none">
                  MONEY TRACKER
                </h1>
                <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  Cash &amp; Card
                </span>
              </div>
              <p className="text-[10px] text-slate-500 hidden sm:block">
                Daily Cash Wallet + Card Tracker
              </p>
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

            {/* Settings Quick Button */}
            <button
              type="button"
              onClick={() => onOpenSettings('categories')}
              className="p-1.5 sm:p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
              title="Settings & Categories"
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

            {/* Profile Avatar Button with Dropdown Menu */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-1 p-1 rounded-full border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer shadow-2xs"
                title="Account, Sign In & Help"
                aria-expanded={isProfileOpen}
              >
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Profile'}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover"
                  />
                ) : user ? (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shadow-2xs">
                    {userInitial}
                  </div>
                ) : (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                    <UserIcon className="w-4 h-4" />
                  </div>
                )}
                <ChevronDown className={`w-3 h-3 text-slate-400 mr-0.5 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Profile Dropdown Menu */}
              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-1 z-50 animate-in fade-in duration-100 text-xs">
                  {user ? (
                    // Signed In State
                    <>
                      <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/50">
                        <div className="flex items-center gap-2">
                          {user.photoURL ? (
                            <img
                              src={user.photoURL}
                              alt={user.displayName || 'User'}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
                              {userInitial}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-slate-900 text-xs truncate">
                              {user.displayName || 'Google Account'}
                            </h4>
                            <p className="text-[10px] text-slate-500 truncate">
                              {user.email}
                            </p>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-semibold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>Signed in with Google</span>
                        </div>
                      </div>

                      <div className="py-1">
                        {/* Help & FAQs Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setIsProfileOpen(false);
                            onOpenAuthHelp();
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700 hover:text-slate-900 cursor-pointer transition-colors font-medium text-xs"
                        >
                          <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>Help &amp; FAQs</span>
                        </button>

                        {/* Sign Out Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setIsProfileOpen(false);
                            onSignOut();
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-rose-50 flex items-center gap-2 text-rose-600 hover:text-rose-700 cursor-pointer transition-colors font-semibold text-xs border-t border-slate-100 mt-1"
                        >
                          <LogOut className="w-4 h-4 text-rose-500 shrink-0" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    // Not Signed In State
                    <div className="py-1">
                      {/* 1. Sign In Option with Official Google Logo */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileOpen(false);
                          onSignIn();
                        }}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-emerald-50/80 flex items-center gap-2.5 text-slate-800 hover:text-emerald-900 cursor-pointer transition-colors group font-semibold text-xs"
                      >
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"/>
                          <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                        </svg>
                        <span>Sign In with Google</span>
                      </button>

                      {/* 2. Help & FAQs Option */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileOpen(false);
                          onOpenAuthHelp();
                        }}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 hover:text-slate-900 cursor-pointer transition-colors font-medium text-xs border-t border-slate-100"
                      >
                        <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>Help &amp; FAQs</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
