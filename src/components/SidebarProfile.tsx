import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  ChevronDown,
  CheckCircle2,
  ShieldCheck,
  User as UserIcon,
  HelpCircle,
  LogOut,
  Cloud,
  WifiOff,
} from 'lucide-react';
import { GoogleSheetMeta } from '../types/finance';
import { UserProfile } from '../lib/storage';
import { triggerFeedback } from '../lib/haptics';

interface SidebarProfileProps {
  user: any;
  userProfile?: UserProfile;
  storageEmail?: string | null;
  isOnline?: boolean;
  isSyncing?: boolean;
  activeSheet?: GoogleSheetMeta | null;
  onQuickSync: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenProfile: () => void;
  onOpenAuthHelp: () => void;
  collapsed?: boolean;
}

/**
 * Desktop sidebar footer: quick actions (sync, settings) + profile pill.
 * Clicking the pill slides up an account panel with Sign In / Sign Out.
 * Mobile keeps the original Header dropdown - this renders only inside the md+ sidebar.
 */
export const SidebarProfile: React.FC<SidebarProfileProps> = ({
  user,
  userProfile,
  storageEmail,
  isOnline = true,
  isSyncing = false,
  activeSheet,
  onQuickSync,
  onSignIn,
  onSignOut,
  onOpenProfile,
  onOpenAuthHelp,
  collapsed = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const isOnlineUser = Boolean(user && user.email);
  const effectiveEmail =
    userProfile?.email ||
    (isOnlineUser ? user.email : storageEmail && storageEmail !== 'guest' ? storageEmail : 'Local Offline Mode');
  const effectiveName =
    userProfile?.name && userProfile.name.trim() !== ''
      ? userProfile.name
      : isOnlineUser
        ? user.displayName || user.email?.split('@')[0] || 'Google User'
        : storageEmail && storageEmail !== 'guest'
          ? storageEmail.split('@')[0]
          : 'My Wallet';
  const effectiveAvatar = userProfile?.avatar || user?.photoURL || null;
  const effectiveInitial =
    effectiveName && effectiveName.trim().length > 0
      ? effectiveName.trim().charAt(0).toUpperCase()
      : effectiveEmail && effectiveEmail.includes('@')
        ? effectiveEmail.charAt(0).toUpperCase()
        : 'M';

  const actionBtn =
    'p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/80 transition-all cursor-pointer shrink-0';

  const menuItem =
    'w-full text-left px-3 py-2.5 hover:bg-slate-50 rounded-xl flex items-center gap-2.5 text-slate-800 cursor-pointer transition-colors';

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      {/* Slide-up account panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={`absolute bottom-full mb-2 origin-bottom z-50 ${collapsed ? 'left-2 w-[17rem]' : 'left-3 right-3'}`}
          >
            <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden text-xs">
              {/* Account head */}
              <div className="p-3 border-b border-slate-100 bg-slate-50/70">
                <div className="flex items-center gap-2.5 min-w-0">
                  {effectiveAvatar ? (
                    <img
                      src={effectiveAvatar}
                      alt={effectiveName}
                      className="w-9 h-9 rounded-full object-cover border border-emerald-500/50 shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold text-xs flex items-center justify-center shrink-0">
                      {effectiveInitial}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 truncate">{effectiveName}</p>
                    <p className="text-[10px] text-slate-500 truncate">{effectiveEmail}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {user ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />
                      Google Synced
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-full">
                      <ShieldCheck className="w-3 h-3" />
                      Local Offline Safe
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                    {isOnline ? <Cloud className="w-3 h-3 text-emerald-500" /> : <WifiOff className="w-3 h-3 text-amber-500" />}
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="p-2 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    triggerFeedback('tap');
                    setIsOpen(false);
                    onOpenProfile();
                  }}
                  className={menuItem}
                >
                  <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                    <UserIcon className="w-3.5 h-3.5" />
                  </span>
                  <span className="font-bold">Profile</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerFeedback('tap');
                    setIsOpen(false);
                    onOpenAuthHelp();
                  }}
                  className={menuItem}
                >
                  <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                    <HelpCircle className="w-3.5 h-3.5" />
                  </span>
                  <span className="font-bold">Help &amp; FAQs</span>
                </button>

                <div className="pt-1 border-t border-slate-100">
                  {user ? (
                    <button
                      type="button"
                      onClick={() => {
                        triggerFeedback('tap');
                        setIsOpen(false);
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
                        setIsOpen(false);
                        onSignIn();
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 rounded-xl flex items-center gap-2.5 text-slate-800 hover:text-emerald-900 cursor-pointer transition-colors font-semibold"
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" />
                        <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                      </svg>
                      <span>Sign In with Google</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom action bar: profile pill (left) - sync (right) */}
      <div className={`${collapsed ? 'flex flex-col items-center gap-1.5 p-2' : 'flex items-center gap-1.5 p-3'} border-t border-slate-100`}>
        <button
          type="button"
          onClick={() => {
            triggerFeedback('tap');
            setIsOpen((v) => !v);
          }}
          className={`rounded-full border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer ${collapsed ? 'flex items-center justify-center p-1.5' : 'flex-1 min-w-0 flex items-center gap-2 pl-1.5 pr-2 py-1.5'}`}
          title="Account"
          aria-expanded={isOpen}
        >
          {effectiveAvatar ? (
            <img
              src={effectiveAvatar}
              alt={effectiveName}
              className="w-7 h-7 rounded-full object-cover border border-emerald-500/50 shrink-0"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold text-[11px] flex items-center justify-center shrink-0">
              {effectiveInitial}
            </div>
          )}
          {!collapsed && <span className="flex-1 min-w-0 text-left text-xs font-bold text-slate-800 truncate">{effectiveName}</span>}
          {!collapsed && (
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            triggerFeedback('tap');
            onQuickSync();
          }}
          disabled={isSyncing}
          className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/80 transition-all cursor-pointer shrink-0"
          title="Sync with Google Sheet"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-emerald-600' : ''}`} />
        </button>
      </div>

    </div>
  );
};
