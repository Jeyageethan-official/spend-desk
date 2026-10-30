import { 
  Transaction, 
  SpendingSummary, 
  CategorySummary, 
  Category, 
  DailyTrendItem, 
  FilterState 
} from '../types/finance';
import { loadStoredCategoryDefs, CategoryDef } from './storage';

export const STANDARD_CATEGORIES: { category: Category; color: string; iconName: string; bgClass: string; textClass: string }[] = [
  { category: 'Food', color: '#EA580C', iconName: 'Utensils', bgClass: 'bg-orange-50 text-orange-700 border-orange-200', textClass: 'text-orange-600' },
  { category: 'Transport', color: '#0284C7', iconName: 'Car', bgClass: 'bg-sky-50 text-sky-700 border-sky-200', textClass: 'text-sky-600' },
  { category: 'Shopping', color: '#6366F1', iconName: 'ShoppingBag', bgClass: 'bg-indigo-50 text-indigo-700 border-indigo-200', textClass: 'text-indigo-600' },
  { category: 'Bills', color: '#D97706', iconName: 'Zap', bgClass: 'bg-amber-50 text-amber-700 border-amber-200', textClass: 'text-amber-600' },
  { category: 'Entertainment', color: '#7C3AED', iconName: 'Film', bgClass: 'bg-violet-50 text-violet-700 border-violet-200', textClass: 'text-violet-600' },
  { category: 'Education', color: '#0D9488', iconName: 'GraduationCap', bgClass: 'bg-teal-50 text-teal-700 border-teal-200', textClass: 'text-teal-600' },
  { category: 'Other', color: '#64748B', iconName: 'MoreHorizontal', bgClass: 'bg-slate-50 text-slate-700 border-slate-200', textClass: 'text-slate-600' },
];

export const getLocalDateString = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Resolve a quick date preset to inclusive local YYYY-MM-DD bounds. */
export const getPresetRange = (
  type: string,
  now: Date = new Date()
): { startDate: string; endDate: string } | null => {
  const todayStr = getLocalDateString(now);
  if (type === 'today') return { startDate: todayStr, endDate: todayStr };
  if (type === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yStr = getLocalDateString(y);
    return { startDate: yStr, endDate: yStr };
  }
  if (type === 'week') {
    const mon = new Date(now);
    const day = mon.getDay(); // 0 = Sunday
    mon.setDate(mon.getDate() - (day === 0 ? 6 : day - 1));
    return { startDate: getLocalDateString(mon), endDate: todayStr };
  }
  if (type === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: getLocalDateString(first), endDate: todayStr };
  }
  if (type === 'all') return { startDate: '', endDate: '' };
  return null;
};

export const formatDateToDisplayHeader = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parts[2].padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${day} ${months[monthIdx]} ${year}`;
      }
    }
  } catch {}
  return dateStr;
};

export const formatCurrency = (amount: number, currency: string = 'Rs'): string => {
  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? '-' : ''}${currency} ${formatted}`;
};

export const filterTransactions = (
  transactions: Transaction[] = [],
  filter: FilterState
): Transaction[] => {
  if (!Array.isArray(transactions)) return [];
  return transactions.filter((tx) => {
    if (!tx || typeof tx !== 'object') return false;
    const date = tx.date || '';
    const category = tx.category || 'Other';
    const paymentMethod = tx.paymentMethod || 'Cash';
    const notes = tx.notes || '';
    const amount = tx.amount || 0;

    // Date filter
    if (filter?.startDate && date < filter.startDate) return false;
    if (filter?.endDate && date > filter.endDate) return false;

    // Category filter
    if (filter?.category && filter.category !== 'All' && category !== filter.category) {
      return false;
    }

    // Payment method filter
    if (filter?.paymentMethod && filter.paymentMethod !== 'All' && paymentMethod.toLowerCase() !== filter.paymentMethod.toLowerCase()) {
      return false;
    }

    // Search query
    if (filter?.searchQuery && filter.searchQuery.trim() !== '') {
      const q = filter.searchQuery.toLowerCase();
      const matchNotes = notes.toLowerCase().includes(q);
      const matchCat = category.toLowerCase().includes(q);
      const matchAmt = amount.toString().includes(q);
      if (!matchNotes && !matchCat && !matchAmt) return false;
    }

    return true;
  });
};

export interface RunningBalanceItem {
  balance: number;       // Running cash balance (minimum 0)
  /**
   * This row's CONTRIBUTION to the outstanding out-of-wallet amount:
   *   +excess  - a cash expense that spent beyond the wallet
   *   -paid    - a Cash In whose note says "Out of Wallet" (it pays the
   *              shortfall down, clamped so the total can never go below 0)
   *   0        - nothing
   * The badge is the SUM of these across history, so a repayment genuinely
   * subtracts: spend 4,000 on a 3,000 wallet (+1,000), then Cash In 500
   * marked "Out of Wallet" (-500) => the app shows Rs 500 outstanding.
   */
  outOfWallet: number;
}

/** Does this Cash In say it is paying down the out-of-wallet shortfall? */
export const isOutOfWalletRepayment = (tx?: Transaction | null): boolean => {
  if (!tx || tx.type !== 'cash_added') return false;
  if (isCarryForwardTransaction(tx)) return false;
  return /out\s+of\s*wallet/i.test(tx.notes || '');
};

/**
 * Sorts transactions chronologically (earliest to latest)
 */
export const sortTransactionsChronological = (transactions: Transaction[]): Transaction[] => {
  return [...transactions].sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const timeA = a.time || '00:00';
    const timeB = b.time || '00:00';
    if (timeA !== timeB) return timeA.localeCompare(timeB);
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
};

/**
 * Calculates chronological running cash balance and out-of-wallet excess.
 * Cash balance never drops below 0 (reflecting a real-world physical wallet).
 * Any expense exceeding available cash is recorded in Out of Wallet.
 * Fresh Cash In (Income) directly increments wallet cash balance without eating past out-of-wallet expenses.
 */
export const calculateRunningBalances = (
  transactions: Transaction[]
): Map<string, RunningBalanceItem> => {
  const sorted = sortTransactionsChronological(transactions);
  const result = new Map<string, RunningBalanceItem>();

  let runningCash = 0;
  // Outstanding shortfall carried across the walk, so a Cash In marked
  // "Out of Wallet" can pay it down (and never below zero).
  let oowDebt = 0;
  const isCashPayment = (method?: string) => !method || method.toLowerCase() === 'cash';

  // CARRY-FORWARD ROWS ARE AN OPENING BALANCE, NOT NEW MONEY.
  //
  // Each date that starts with a carried row is seeded ONCE, before its first
  // row, with the largest amount carried into it. When the earlier days are
  // still in the ledger the walk already holds exactly that figure, so the
  // seed is a no-op and nothing is counted twice. When the ledger holds ONLY
  // the carried row (a fresh device, a restored sheet, a pruned history) the
  // day still opens with yesterday's close instead of Rs 0 - which is what
  // made a Rs 870 wallet book a Rs 1,000 shortfall on a Rs 1,000 spend.
  //
  // Seeding at the first row of the date (rather than when the carry row
  // happens to sort) keeps the opening ahead of every expense that day, and
  // seeding only once stops a later row from restoring money already spent.
  const carriedOpening = new Map<string, number>();
  for (const tx of sorted) {
    if (!tx || !isCarryForwardTransaction(tx)) continue;
    const date = tx.date || '';
    const amt = Math.abs(tx.amount || 0);
    const known = carriedOpening.get(date);
    if (known === undefined || known < amt) carriedOpening.set(date, amt);
  }
  const seededDates = new Set<string>();

  for (const tx of sorted) {
    if (!tx || !tx.id) continue;
    const txDate = tx.date || '';
    if (!seededDates.has(txDate)) {
      seededDates.add(txDate);
      const opening = carriedOpening.get(txDate);
      if (opening !== undefined && runningCash < opening) runningCash = opening;
    }
    // The carry row writes no money of its own - its amount was applied as the
    // opening above - so it only records where the walk stands that day.
    if (isCarryForwardTransaction(tx)) {
      result.set(tx.id, { balance: runningCash, outOfWallet: 0 });
      continue;
    }
    const amt = Math.abs(tx.amount || 0);

    if (tx.type === 'cash_added') {
      runningCash += amt;
      if (isOutOfWalletRepayment(tx)) {
        const paid = Math.min(amt, oowDebt);
        oowDebt -= paid;
        result.set(tx.id, {
          balance: runningCash,
          outOfWallet: -paid,
        });
      } else {
        result.set(tx.id, {
          balance: runningCash,
          outOfWallet: 0,
        });
      }
    } else if (tx.type === 'cash_expense' && isCashPayment(tx.paymentMethod)) {
      if (runningCash >= amt) {
        runningCash -= amt;
        result.set(tx.id, {
          balance: runningCash,
          outOfWallet: 0,
        });
      } else {
        const excessSpent = amt - runningCash;
        runningCash = 0; // Balance never goes below 0!
        oowDebt += excessSpent;
        result.set(tx.id, {
          balance: 0,
          outOfWallet: excessSpent,
        });
      }
    } else {
      // Card / Bank Transfer expense: does not deduct from physical cash drawer
      result.set(tx.id, {
        balance: runningCash,
        outOfWallet: 0,
      });
    }
  }

  return result;
};

/**
 * Is this row the auto-generated opening balance rather than real new money?
 *
 * Recognised from the flag written at save time, or - for a row that came back
 * from a Google Sheet with the flag stripped - from its fixed note text.
 */
const CARRY_NOTE_PATTERN = /yesterday balance continued/i;
export const isCarryForwardTransaction = (tx?: Transaction | null): boolean => {
  if (!tx || tx.type !== 'cash_added') return false;
  if (tx.isCarryForward) return true;
  return CARRY_NOTE_PATTERN.test(tx.notes || '');
};

export const calculateSummary = (
  allTransactions: Transaction[] = [],
  filteredTransactions: Transaction[] = []
): SpendingSummary => {
  const allTxs = Array.isArray(allTransactions) ? allTransactions : [];
  const filtTxs = Array.isArray(filteredTransactions) ? filteredTransactions : [];

  const isCashPayment = (method?: string) => !method || method.toLowerCase() === 'cash';
  const isCardOrBankPayment = (method?: string) => method && (method.toLowerCase() === 'card' || method.toLowerCase() === 'bank' || method.toLowerCase().includes('transfer'));

  // Chronological running balances across ALL transactions keep the out-of-wallet
  // history accurate (an expense earlier in the month still counts even when the
  // date filter only shows today).
  //
  // The history pass walks EVERY row, carry-forwards included: the walk seeds
  // each carried day with its opening balance instead of adding it, so the
  // money can never be counted twice - and, just as importantly, can never
  // vanish. Excluding the carry rows outright is what let a ledger whose only
  // history was the carried row book a Rs 1,000 shortfall out of a Rs 130 one:
  // the balance pass counted the carried money, the out-of-wallet pass did not.
  // Both now read the same walk, so the badge and the balance always agree.
  const historyTxs = allTxs;
  const runningBalances = calculateRunningBalances(historyTxs);
  const sortedAll = sortTransactionsChronological(historyTxs);

  let totalOutOfWalletAll = 0;
  for (const tx of sortedAll) {
    const rb = runningBalances.get(tx.id);
    if (rb) {
      totalOutOfWalletAll += rb.outOfWallet;
    }
  }

  // The cash balance must respect the active date filter: with no filter it is
  // the real wallet balance; with a filter it is the balance of just the filtered
  // period (e.g. a future date with no transactions correctly shows 0 instead of
  // the all-time balance).
  const isUnfiltered = filtTxs.length === allTxs.length;
  const balanceTxs = isUnfiltered ? historyTxs : filtTxs;
  const balanceRunning = isUnfiltered ? runningBalances : calculateRunningBalances(filtTxs);
  let finalCashBalance = 0;
  for (const tx of sortTransactionsChronological(balanceTxs)) {
    const rb = balanceRunning.get(tx.id);
    if (rb) finalCashBalance = rb.balance;
  }

  const cashAdded = filtTxs
    // A carried-forward opening balance is not new money, so it must not
    // inflate the Cash In KPI (or the sheet column derived from it) - it
    // still counts towards the wallet balance via the running-balance pass.
    .filter((tx) => tx && tx.type === 'cash_added' && !tx.isCarryForward)
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);

  const cashSpent = filtTxs
    .filter((tx) => tx && tx.type === 'cash_expense' && isCashPayment(tx.paymentMethod))
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);

  const cardSpend = filtTxs
    .filter((tx) => tx && (tx.type === 'card_expense' || (tx.type === 'cash_expense' && isCardOrBankPayment(tx.paymentMethod))))
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);

  // Out of wallet for filtered range (or all-time if no specific filter)
  let outOfWallet = 0;
  if (isUnfiltered) {
    outOfWallet = totalOutOfWalletAll;
  } else {
    for (const tx of filtTxs) {
      const rb = runningBalances.get(tx.id);
      if (rb) {
        outOfWallet += rb.outOfWallet;
      }
    }
  }

  const totalSpend = cashSpent + cardSpend;

  return {
    currentCashBalance: finalCashBalance,
    cashAdded,
    cashSpent,
    cardSpend,
    totalSpend,
    outOfWallet,
  };
};

export const calculateCategoryBreakdown = (
  transactions: Transaction[] = [],
  categoryDefsOrEmail?: CategoryDef[] | string | null
): CategorySummary[] => {
  const txs = Array.isArray(transactions) ? transactions : [];
  const expenseTxs = txs.filter(
    (tx) => tx && (tx.type === 'cash_expense' || tx.type === 'card_expense')
  );

  const totalExpense = expenseTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);

  const map = new Map<Category, { amount: number; count: number }>();
  
  const currentDefs = Array.isArray(categoryDefsOrEmail)
    ? categoryDefsOrEmail
    : loadStoredCategoryDefs(typeof categoryDefsOrEmail === 'string' ? categoryDefsOrEmail : null) || [];
  const defMap = new Map(currentDefs.map(d => [d.name.toLowerCase().trim(), d]));
  currentDefs.forEach(({ name }) => {
    if (name) map.set(name, { amount: 0, count: 0 });
  });

  expenseTxs.forEach((tx) => {
    const cat = tx.category || 'Other';
    const amt = tx.amount || 0;
    const existing = map.get(cat) || { amount: 0, count: 0 };
    map.set(cat, {
      amount: existing.amount + amt,
      count: existing.count + 1,
    });
  });

  return Array.from(map.entries()).map(([cat, data]) => {
    const def = defMap.get(cat.toLowerCase().trim()) || STANDARD_CATEGORIES.find((c) => c.category.toLowerCase() === cat.toLowerCase());
    const percentage = totalExpense > 0 ? (data.amount / totalExpense) * 100 : 0;

    return {
      category: cat,
      amount: data.amount,
      percentage,
      count: data.count,
      color: def?.color || '#0ea5e9',
      iconName: def?.iconName || cat || 'Tag',
    };
  });
};

/**
 * The seven days of the Monday–Sunday week that CONTAINS `anchorDate` — one
 * bucket per real calendar day.
 *
 * The old version grouped by weekday NAME, so every Monday inside the filter
 * pooled into the single "Mon" bar and the chart quietly mixed up to five
 * different weeks together. This version pins the chart to one week: pick a
 * date in the filter and you see THAT date's week, day by day, with the
 * weekday and the date number both available for the axis label (Mon / 23).
 */
export const calculateWeeklyDailyTrend = (
  transactions: Transaction[] = [],
  anchorDate: string = getLocalDateString()
): { trendItems: DailyTrendItem[]; dayTotals: { [key: string]: number } } => {
  const txs = Array.isArray(transactions) ? transactions : [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Anchor at noon so DST edges cannot shift the day, then walk back to Monday.
  let anchor = new Date(`${anchorDate || getLocalDateString()}T12:00:00`);
  if (isNaN(anchor.getTime())) anchor = new Date();
  const monday = new Date(anchor);
  const dow = monday.getDay(); // 0 = Sunday
  monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      dateStr: getLocalDateString(d),
      dayLabel: dayNames[d.getDay()],
      cash: 0,
      card: 0,
      total: 0,
    };
  });
  const byDate = new Map(days.map((d) => [d.dateStr, d]));

  txs.forEach((tx) => {
    if (!tx || (tx.type !== 'cash_expense' && tx.type !== 'card_expense')) return;
    const bucket = byDate.get(tx.date || getLocalDateString());
    if (!bucket) return; // outside the shown week
    const amt = tx.amount || 0;
    if (tx.type === 'cash_expense') bucket.cash += amt;
    else bucket.card += amt;
    bucket.total += amt;
  });

  const trendItems: DailyTrendItem[] = days.map((d) => ({
    dayLabel: d.dayLabel,
    dateStr: d.dateStr,
    cashAmount: d.cash,
    cardAmount: d.card,
    totalAmount: d.total,
  }));

  const flatTotals: { [key: string]: number } = {};
  days.forEach((d) => {
    flatTotals[d.dateStr] = d.total;
  });

  return { trendItems, dayTotals: flatTotals };
};

/**
 * Strictly sanitizes transaction list:
 * Removes ghost/corrupt records with amount <= 0, invalid dates (1899/1900/1970/blank),
 * and phantom rows caused by Google Sheets formula/grid artifacts.
 */
export const sanitizeTransactions = (txs: Transaction[]): Transaction[] => {
  if (!Array.isArray(txs)) return [];
  return txs.filter((tx) => {
    if (!tx || typeof tx !== 'object') return false;
    if (typeof tx.amount !== 'number' || isNaN(tx.amount) || tx.amount <= 0) return false;
    const date = String(tx.date || '').trim();
    if (!date || date.startsWith('1899') || date.startsWith('1900') || date.startsWith('1970')) return false;
    const year = parseInt(date.split('-')[0], 10);
    if (isNaN(year) || year < 2000 || year > 2100) return false;
    if (tx.notes === '1000' && (tx.category === '1000' || !tx.category)) return false;
    return true;
  });
};
