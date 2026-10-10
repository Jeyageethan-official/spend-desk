import React from 'react';
import {
  Home,
  Receipt,
  BarChart2,
  HandCoins,
  FileSpreadsheet,
  Settings as SettingsIcon,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { AppTab, GoogleSheetMeta } from '../types/finance';
import { UserProfile } from '../lib/storage';
import { triggerFeedback } from '../lib/haptics';
import { SpendDeskLogo } from './SpendDeskLogo';
import { SidebarProfile } from './SidebarProfile';

interface SidebarProps {
  activeTab: AppTab;
  onNavigate: (tab: AppTab) => void;
  pendingLendCount?: number;
  activeSheet?: GoogleSheetMeta | null;
  user: any;
  userProfile?: UserProfile;
  storageEmail?: string | null;
  isOnline?: boolean;
  isSyncing?: boolean;
  onQuickSync: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenProfile: () => void;
  onOpenAuthHelp: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/**
 * Desktop-only application shell sidebar (md+ / 768px and up).
 * The mobile layout keeps its Header + BottomNav and never renders this.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onNavigate,
  pendingLendCount = 0,
  activeSheet,
  user,
  userProfile,
  storageEmail,
  isOnline = true,
  isSyncing = false,
  onQuickSync,
  onSignIn,
  onSignOut,
  onOpenProfile,
  onOpenAuthHelp,
  collapsed,
  onToggleCollapse,
}) => {
  const sections: {
    label: string;
    items: {
      id: AppTab;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      badge?: number;
      sub?: string;
    }[];
  }[] = [
    {
      label: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: Home },
        { id: 'transactions', label: 'Transactions', icon: Receipt },
        { id: 'analytics', label: 'Analytics', icon: BarChart2 },
      ],
    },
    {
      label: 'Money',
      items: [{ id: 'lend', label: 'Lend & Borrow', icon: HandCoins, badge: pendingLendCount }],
    },
    {
      label: 'Workspace',
      items: [
        { id: 'sheets', label: 'Google Sheets', icon: FileSpreadsheet, sub: activeSheet?.name },
        { id: 'settings', label: 'Settings', icon: SettingsIcon },
      ],
    },
  ];

  return (
    <aside
      className="hidden md:flex fixed inset-y-0 left-0 z-40 w-[var(--sidebar-w)] transition-[width] duration-300 ease-in-out flex-col bg-white/75 backdrop-blur-xl border-r border-slate-200/60 shadow-xl shadow-slate-900/5"
      aria-label="Primary sidebar"
    >
      {/* Brand */}
      <div
        className={`h-16 shrink-0 flex items-center border-b border-slate-100 ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'}`}
      >
        <button
          type="button"
          onClick={() => {
            triggerFeedback('tap');
            onNavigate('dashboard');
          }}
          className={`flex items-center cursor-pointer text-left ${collapsed ? 'justify-center' : 'gap-2.5'}`}
          title="Go to Home"
        >
          <SpendDeskLogo variant="icon" size="md" className="shrink-0" />
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <span className="block text-[15px] font-black text-slate-900 tracking-tight">SpendDesk</span>
              <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-emerald-600">
                Cash &amp; Card
              </span>
            </div>
          )}
        </button>
        {/* Collapse toggle beside the logo (expanded state) */}
        {!collapsed && (
          <button
            type="button"
            onClick={() => {
              triggerFeedback('tap');
              onToggleCollapse();
            }}
            className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 transition-all cursor-pointer shrink-0"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Collapsed state: expand arrow directly below the logo (vertical) */}
      {collapsed && (
        <div className="flex justify-center pt-1 pb-2">
          <button
            type="button"
            onClick={() => {
              triggerFeedback('tap');
              onToggleCollapse();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 transition-all cursor-pointer"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        {sections.map((section, sectionIndex) => (
          <div key={section.label} className={`mb-1 ${collapsed ? 'pt-2' : ''}`}>
            {/* Collapsed mode hides the section labels, so add a real divider between
                groups (e.g. Google Sheets / Settings stay visually separated). */}
            {collapsed && sectionIndex > 0 && (
              <div className="mx-auto mb-2 w-7 border-t border-slate-200/90" aria-hidden="true" />
            )}
            {!collapsed && (
              <p className="px-3 pt-3 pb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                {section.label}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      triggerFeedback('tap');
                      onNavigate(item.id);
                    }}
                    title={item.label}
                    className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 rounded-xl text-[13px] font-bold transition-all cursor-pointer text-left ${
                      isActive
                        ? 'bg-emerald-600/10 text-emerald-900 border border-emerald-600/25 backdrop-blur-md shadow-sm'
                        : 'text-slate-600 border border-transparent hover:text-slate-900 hover:bg-slate-100/70'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'stroke-[2.5]' : ''}`} />
                    {!collapsed && <span className="flex-1 min-w-0 truncate">{item.label}</span>}
                    {!collapsed && typeof item.badge === 'number' && item.badge > 0 && (
                      <span
                        className={`text-[9px] font-black min-w-[17px] h-[17px] px-1 rounded-full flex items-center justify-center ${
                          isActive ? 'bg-emerald-600/15 text-emerald-800' : 'bg-amber-100/80 text-amber-700'
                        }`}
                      >
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: profile bar -> click slides the account panel up */}
      <SidebarProfile
        collapsed={collapsed}
        user={user}
        userProfile={userProfile}
        storageEmail={storageEmail}
        isOnline={isOnline}
        isSyncing={isSyncing}
        activeSheet={activeSheet}
        onQuickSync={onQuickSync}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        onOpenProfile={onOpenProfile}
        onOpenAuthHelp={onOpenAuthHelp}
      />
    </aside>
  );
};
