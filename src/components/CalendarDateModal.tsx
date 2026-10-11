import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight
} from 'lucide-react';
import { DateFilterType } from '../types/finance';

interface CalendarDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  startDate: string;
  endDate: string;
  activeType: DateFilterType;
  onApply: (type: DateFilterType, start: string, end: string) => void;
  /** single = compact mobile-style day picker (no From/To cards, closes on pick). */
  mode?: 'range' | 'single';
}

/** Parse YYYY-MM-DD as a LOCAL date (new Date('YYYY-MM-DD') is UTC and can shift the day). */
const parseLocalDate = (iso: string): Date => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
};

export const CalendarDateModal: React.FC<CalendarDateModalProps> = ({
  isOpen,
  onClose,
  startDate,
  endDate,
  onApply,
  mode = 'range',
}) => {
  const [tempStart, setTempStart] = useState<string>(startDate || '');
  const [tempEnd, setTempEnd] = useState<string>(endDate || '');
  // Range mode: the date tapped FIRST (pending From until a second tap lands).
  const [pickAnchor, setPickAnchor] = useState<string | null>(null);

  // Month navigation for visual interactive calendar view
  const [viewDate, setViewDate] = useState(() => (startDate ? parseLocalDate(startDate) : new Date()));

  // The modal stays mounted while closed, so re-sync with the real filter every time it opens
  // (otherwise it shows stale dates after a preset like Today/Week/Month was used).
  useEffect(() => {
    if (!isOpen) return;
    setTempStart(startDate || '');
    setTempEnd(endDate || '');
    setPickAnchor(null);
    setViewDate(startDate ? parseLocalDate(startDate) : new Date());
  }, [isOpen, startDate, endDate]);

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

  // Local today (YYYY-MM-DD) for the iOS-style subtle "today" emphasis
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const dayToStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // Single mode (header calendar): one tap selects exactly that day and closes.
  const handleSingleDayClick = (day: number) => {
    const dayStr = dayToStr(day);
    setTempStart(dayStr);
    setTempEnd(dayStr);
    onApply('custom', dayStr, dayStr);
    onClose();
  };

  // Range mode (FilterBar calendar): the FIRST tap becomes From and applies as a
  // single-day filter immediately (only that date shows); a SECOND tap becomes To.
  // Tapping an earlier second day swaps the ends, so one press = one date only.
  const handleRangeDayClick = (day: number) => {
    const dayStr = dayToStr(day);
    if (!pickAnchor) {
      setPickAnchor(dayStr);
      setTempStart(dayStr);
      setTempEnd(dayStr);
      onApply('custom', dayStr, dayStr);
      return;
    }
    const start = pickAnchor <= dayStr ? pickAnchor : dayStr;
    const end = pickAnchor <= dayStr ? dayStr : pickAnchor;
    setPickAnchor(null);
    setTempStart(start);
    setTempEnd(end);
    onApply('custom', start, end);
  };

  const handleDayClick = (day: number) => {
    if (mode === 'single') handleSingleDayClick(day);
    else handleRangeDayClick(day);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      {mode === 'single' ? (
      /* iOS-style date sheet: large title, weekday initials, filled-circle
         selection and text-only footer actions (header calendar uses this). */
      <div
        className="w-full max-w-[20rem] bg-white rounded-[28px] shadow-2xl border border-slate-200/70 overflow-hidden px-4 pt-4 pb-3"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a date"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Large title + subtle month steppers */}
        <div className="flex items-center justify-between px-1 pb-2.5">
          <span className="text-lg font-bold text-slate-900 tracking-tight">
            {monthNames[month]} {year}
          </span>
          <div className="flex items-center gap-1 text-slate-500">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-full hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.4]" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-full hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5 stroke-[2.4]" />
            </button>
          </div>
        </div>

        {/* Weekday initials */}
        <div className="grid grid-cols-7">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span
              key={`${d}-${i}`}
              className="h-8 flex items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-slate-400"
            >
              {d}
            </span>
          ))}
        </div>

        {/* Day grid with iOS filled-circle selection */}
        <div className="grid grid-cols-7 gap-y-1 justify-items-center">
          {Array.from({ length: firstDayIndex }).map((_, i) => (
            <div key={`empty-${i}`} className="h-9" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelected = tempStart === dayStr && tempEnd === dayStr;
            const isToday = !isSelected && dayStr === todayStr;
            return (
              <button
                key={day}
                type="button"
                onClick={() => handleDayClick(day)}
                aria-pressed={isSelected}
                aria-label={`${monthNames[month]} ${day}, ${year}`}
                className={`h-9 w-9 rounded-full text-[13px] flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-90 ${
                  isSelected
                    ? 'bg-[#008952] text-white font-semibold shadow-xs'
                    : isToday
                    ? 'text-[#008952] font-bold hover:bg-emerald-50'
                    : 'text-slate-800 font-medium hover:bg-slate-100'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* Text-only footer action (Done) - the app always opens on the current date. */}
        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-end px-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 -mr-1 rounded-lg text-[15px] font-bold text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
      ) : (
      /* iOS-style sheet matching the header calendar; selection is tap-to-pick:
         first tap = From (single day), second tap = To (range). No From/To cards. */
      <div
        className="w-full max-w-[22rem] bg-white rounded-[28px] shadow-2xl border border-slate-200/70 overflow-hidden px-4 pt-4 pb-3"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a date range"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Large title + subtle month steppers */}
        <div className="flex items-center justify-between px-1 pb-2.5">
          <span className="text-lg font-bold text-slate-900 tracking-tight">
            {monthNames[month]} {year}
          </span>
          <div className="flex gap-1 text-slate-500">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-full hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.4]" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-full hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5 stroke-[2.4]" />
            </button>
          </div>
        </div>

        {/* Tap-flow hint: first tap sets From, a second tap sets To */}
        <div className={`pb-1.5 text-[11px] font-semibold flex items-center gap-1.5 ${pickAnchor ? 'text-emerald-700' : 'text-slate-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${pickAnchor ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
          {pickAnchor ? 'Now tap the end date to set the range' : 'Tap a day to filter • tap a second day for a range'}
        </div>

        {/* Weekday initials */}
        <div className="grid grid-cols-7">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span
              key={`${d}-${i}`}
              className="h-8 flex items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-slate-400"
            >
              {d}
            </span>
          ))}
        </div>

        {/* Day grid: filled circles on both endpoints, tinted days in between */}
        <div className="grid grid-cols-7 gap-y-1 justify-items-center">
          {Array.from({ length: firstDayIndex }).map((_, i) => (
            <div key={`empty-${i}`} className="h-9" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayStr = dayToStr(day);
            const isEndpoint = tempStart === dayStr || tempEnd === dayStr || pickAnchor === dayStr;
            const isInRange = Boolean(tempStart && tempEnd && dayStr > tempStart && dayStr < tempEnd);
            const isToday = !isEndpoint && dayStr === todayStr;
            return (
              <button
                key={day}
                type="button"
                onClick={() => handleDayClick(day)}
                aria-pressed={isEndpoint}
                aria-label={`${monthNames[month]} ${day}, ${year}`}
                className={`h-9 w-9 rounded-full text-[13px] flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-90 ${
                  isEndpoint
                    ? 'bg-[#008952] text-white font-semibold shadow-xs'
                    : isInRange
                    ? 'bg-emerald-100/70 text-emerald-950 font-semibold rounded-lg'
                    : isToday
                    ? 'text-[#008952] font-bold hover:bg-emerald-50'
                    : 'text-slate-800 font-medium hover:bg-slate-100'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* Text-only footer action (Done) - the app always opens on the current date. */}
        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-end px-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 -mr-1 rounded-lg text-[15px] font-bold text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
      )}
    </div>
  );
};
