import React from 'react';
import { 
  Home, 
  Receipt, 
  Plus, 
  HandCoins, 
  BarChart2
} from 'lucide-react';
import { AppTab } from '../types/finance';
import { triggerFeedback } from '../lib/haptics';

interface BottomNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  onQuickAdd: () => void;
  pendingLendCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  onQuickAdd,
  pendingLendCount = 0,
}) => {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200/90 shadow-lg px-2 py-1 safe-area-pb">
      <div className="flex items-center justify-between relative w-full max-w-md mx-auto h-14">
        {/* Tab 1: Dashboard */}
        <button
          type="button"
          onClick={() => {
            triggerFeedback('tap');
            onTabChange('dashboard');
          }}
          className={`flex-1 flex flex-col items-center justify-center h-full transition-all cursor-pointer ${
            activeTab === 'dashboard' ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <Home className={`w-5 h-5 ${activeTab === 'dashboard' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-0.5">Home</span>
        </button>

        {/* Tab 2: Transactions */}
        <button
          type="button"
          onClick={() => {
            triggerFeedback('tap');
            onTabChange('transactions');
          }}
          className={`flex-1 flex flex-col items-center justify-center h-full transition-all cursor-pointer ${
            activeTab === 'transactions' ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <Receipt className={`w-5 h-5 ${activeTab === 'transactions' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-0.5">Records</span>
        </button>

        {/* Central Floating Action Button (+ Add) - Perfectly centered in middle flex slot */}
        <div className="flex-1 flex items-center justify-center relative">
          <button
            type="button"
            onClick={() => {
              triggerFeedback('tap');
              onQuickAdd();
            }}
            className="w-12 h-12 -mt-5 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/35 hover:scale-105 active:scale-95 transition-all cursor-pointer border-2 border-white"
            aria-label="Add transaction"
          >
            <Plus className="w-6 h-6 stroke-[3]" />
          </button>
        </div>

        {/* Tab 3: Lend & Borrow */}
        <button
          type="button"
          onClick={() => {
            triggerFeedback('tap');
            onTabChange('lend');
          }}
          className={`flex-1 relative flex flex-col items-center justify-center h-full transition-all cursor-pointer ${
            activeTab === 'lend' ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-emerald-700'
          }`}
        >
          <div className="relative">
            <HandCoins className={`w-5 h-5 ${activeTab === 'lend' ? 'stroke-[2.5]' : ''}`} />
            {pendingLendCount > 0 && (
              <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 rounded-full bg-red-700 text-white text-[9px] font-bold flex items-center justify-center shadow-xs">
                {pendingLendCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5">Lend/Debt</span>
        </button>

        {/* Tab 4: Analytics */}
        <button
          type="button"
          onClick={() => {
            triggerFeedback('tap');
            onTabChange('analytics');
          }}
          className={`flex-1 flex flex-col items-center justify-center h-full transition-all cursor-pointer ${
            activeTab === 'analytics' ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <BarChart2 className={`w-5 h-5 ${activeTab === 'analytics' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-0.5">Analytics</span>
        </button>
      </div>
    </div>
  );
};
