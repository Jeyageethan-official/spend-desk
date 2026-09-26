import React, { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  X
} from 'lucide-react';
import { DateFilterType } from '../types/finance';

interface CalendarDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  startDate: string;
  endDate: string;
  activeType: DateFilterType;
  onApply: (type: DateFilterType, start: string, end: string) => void;
}

export const CalendarDateModal: React.FC<CalendarDateModalProps> = ({
  isOpen,
  onClose,
  startDate,
  endDate,
  onApply,
}) => {
  const [tempStart, setTempStart] = useState<string>(() => {
    if (startDate) return startDate;
    return new Date().toISOString().split('T')[0];
  });
  const [tempEnd, setTempEnd] = useState<string>(() => endDate || '');

  // Month navigation for visual interactive calendar view
  const [viewDate, setViewDate] = useState(() => {
    if (startDate) return new Date(startDate);
    return new Date();
  });

  if (!isOpen) return null;

  // Calendar calculations
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleDayClick = (day: number) => {
    const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    let newStart = tempStart;
    let newEnd = tempEnd;

    if (!tempStart || (tempStart && tempEnd)) {
      newStart = dayStr;
      newEnd = '';
    } else if (tempStart && !tempEnd) {
      if (dayStr >= tempStart) {
        newEnd = dayStr;
      } else {
        newEnd = tempStart;
        newStart = dayStr;
      }
    }

    setTempStart(newStart);
    setTempEnd(newEnd);
    onApply('custom', newStart, newEnd);
  };

  const handleManualStartChange = (val: string) => {
    setTempStart(val);
    onApply('custom', val, tempEnd);
  };

  const handleManualEndChange = (val: string) => {
    setTempEnd(val);
    onApply('custom', tempStart, val);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden p-5 space-y-4"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Calendar Section matching Screenshot */}
        <div className="border border-slate-200/90 rounded-2xl p-4 bg-white shadow-2xs">
          {/* Month Header with Controls */}
          <div className="flex items-center justify-between mb-4">
            <span className="font-bold text-sm sm:text-base text-slate-900 tracking-tight">
              {monthNames[month]} {year}
            </span>
            <div className="flex items-center gap-1 text-slate-600">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Next month"
              >
                <ChevronRight className="w-5 h-5 stroke-[2.2]" />
              </button>
            </div>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400 mb-2">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-y-1.5 gap-x-1">
            {/* Empty slots for leading days */}
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div key={`empty-${i}`} className="h-8 w-8" />
            ))}

            {/* Month Days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              
              const isSelectedStart = tempStart === dayStr;
              const isSelectedEnd = tempEnd === dayStr;
              const isInRange = tempStart && tempEnd && dayStr > tempStart && dayStr < tempEnd;
              const isOnlyStart = isSelectedStart && !tempEnd;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className={`h-8 w-8 sm:h-9 sm:w-9 mx-auto rounded-full text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${
                    isSelectedStart || isSelectedEnd || isOnlyStart
                      ? 'bg-[#008952] text-white font-bold shadow-xs'
                      : isInRange
                      ? 'bg-emerald-100/70 text-emerald-950 font-bold rounded-lg'
                      : 'text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom FROM DATE and TO DATE Cards matching Screenshot */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          {/* FROM DATE Card */}
          <div className="p-3 bg-white border border-slate-200/90 rounded-2xl shadow-2xs relative flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
              FROM DATE
            </span>
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-xs sm:text-sm">
                {tempStart || 'yyyy-mm-dd'}
              </span>
              <CalendarIcon className="w-4 h-4 text-slate-700 shrink-0 ml-1" />
            </div>
            <input
              type="date"
              value={tempStart}
              onChange={(e) => handleManualStartChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </div>

          {/* TO DATE Card */}
          <div className="p-3 bg-white border border-slate-200/90 rounded-2xl shadow-2xs relative flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
              TO DATE
            </span>
            <div className="flex items-center justify-between">
              <span className={`text-xs sm:text-sm ${tempEnd ? 'font-bold text-slate-900' : 'font-medium text-slate-400'}`}>
                {tempEnd || 'yyyy-mm-dd'}
              </span>
              <CalendarIcon className="w-4 h-4 text-slate-700 shrink-0 ml-1" />
            </div>
            <input
              type="date"
              value={tempEnd}
              onChange={(e) => handleManualEndChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
