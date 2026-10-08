import React from 'react';
import { Calendar } from 'lucide-react';
import { DateFilterType, FilterState } from '../types/finance';
import { getPresetRange } from '../lib/calculations';
import { triggerFeedback } from '../lib/haptics';

interface HeaderDateFilterProps {
  /** The filter after presets have been resolved to real dates. */
  filter: FilterState;
  onFilterChange: (next: FilterState) => void;
}

const PRESETS: { id: DateFilterType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
];

export const HeaderDateFilter: React.FC<HeaderDateFilterProps> = ({ filter, onFilterChange }) => {
  const applyPreset = (type: DateFilterType) => {
    triggerFeedback('tap');
    const range = getPresetRange(type) ?? { startDate: '', endDate: '' };
    onFilterChange({ ...filter, type, ...range });
  };

  // Typing/picking a From or To date switches the filter to "custom".
  const changeDate = (field: 'startDate' | 'endDate', value: string) => {
    const next = { ...filter, type: 'custom' as DateFilterType, [field]: value };
    // Keep the range valid: if From > To, move the other end along.
    if (next.startDate && next.endDate && next.startDate > next.endDate) {
      if (field === 'startDate') next.endDate = value;
      else next.startDate = value;
    }
    onFilterChange(next);
  };

  const isCustom = filter.type === 'custom';

  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-2 py-2 border-t border-slate-100">
      {/* Quick presets */}
      <div className="flex items-center p-1 bg-slate-100 rounded-xl gap-0.5 overflow-x-auto scrollbar-none self-start">
        {PRESETS.map((item) => {
          const active = filter.type === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => applyPreset(item.id)}
              className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-all cursor-pointer ${
                active
                  ? 'bg-emerald-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-medium'
              }`}
            >
              {item.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            triggerFeedback('tap');
            if (!isCustom) {
              const range = filter.startDate || filter.endDate ? filter : { ...filter, ...(getPresetRange('month') as object) };
              onFilterChange({ ...range, type: 'custom' });
            }
          }}
          className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 ${
            isCustom
              ? 'bg-emerald-600 text-white font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-medium'
          }`}
        >
          <Calendar className="w-3 h-3" />
          Custom
        </button>
      </div>

      {/* From / To date pickers */}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          From
          <input
            type="date"
            value={filter.startDate || ''}
            max={filter.endDate || undefined}
            onChange={(e) => changeDate('startDate', e.target.value)}
            className="px-2.5 py-1.5 text-xs font-medium normal-case tracking-normal text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          To
          <input
            type="date"
            value={filter.endDate || ''}
            min={filter.startDate || undefined}
            onChange={(e) => changeDate('endDate', e.target.value)}
            className="px-2.5 py-1.5 text-xs font-medium normal-case tracking-normal text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
          />
        </label>
      </div>
    </div>
  );
};
