import { getLocalDateString } from './calculations';
import { Transaction } from '../types/finance';

/**
 * Daily balance carry-forward.
 *
 * The wallet balance is computed from the transactions inside the active date
 * filter, and the header defaults to "today" (the daily-refresh rollover). So
 * on the first open of a new day the balance reads Rs 0.00 even though the
 * user finished yesterday holding cash - which reads as "my money vanished".
 *
 * This module answers that with one honest question on the first open of each
 * day: you closed yesterday with Rs X, carry it in? Accepting writes a real
 * ledger row dated today (type cash_added, flagged `isCarryForward`) so the
 * balance is right AND the history shows where it came from - no hidden
 * running total that could never be reconciled against the sheet.
 *
 * The row's note deliberately reads "Yesterday balance continued ..." so the
 * ledger itself says where the money came from instead of pretending new
 * income arrived.
 *
 * Once-only by construction: the prompt is recorded per account scope the
 * moment it is offered, so dismissing it never brings it back later the same
 * day (an explicit "Not now" is respected - no silent carry afterwards). The
 * Cash In flow offers the same carry-forward as a button afterwards, which is
 * the escape hatch for someone who dismissed the popup.
 */

const PROMPT_KEY = 'spenddesk_carry_prompt_v1';

interface PromptState {
  /** Last calendar day (YYYY-MM-DD) this scope was offered the carry-forward. */
  lastPromptedDay: string;
  /** Epoch ms, for debugging only. */
  at: number;
}

const scopeKey = (email?: string | null) =>
  `${PROMPT_KEY}_${(email || 'guest').trim().toLowerCase()}`;

const readPromptState = (email?: string | null): PromptState | null => {
  try {
    const raw = localStorage.getItem(scopeKey(email));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PromptState;
    return parsed && typeof parsed.lastPromptedDay === 'string' ? parsed : null;
  } catch {
    return null;
  }
};

/** Record that this scope has been offered the prompt for `day`. */
export const markCarryPromptShown = (day: string, email?: string | null): void => {
  try {
    localStorage.setItem(scopeKey(email), JSON.stringify({ lastPromptedDay: day, at: Date.now() }));
  } catch {}
};

/** Has this scope already been offered the prompt for `day`? */
export const hasCarryPromptFor = (day: string, email?: string | null): boolean =>
  readPromptState(email)?.lastPromptedDay === day;

/** Yesterday as local YYYY-MM-DD. */
export const getYesterdayString = (from: Date = new Date()): string => {
  const d = new Date(from);
  d.setDate(d.getDate() - 1);
  return getLocalDateString(d);
};

/** "23 Oct" - compact, unambiguous, matches the app's date voice. */
export const formatDayLabel = (dateStr: string): string => {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    if (isNaN(dt.getTime())) return dateStr;
    return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
};

/** The wallet balance as of the last transaction dated on or before `throughDay`. */
export const closingBalanceThrough = (
  transactions: Transaction[],
  throughDay: string
): number => {
  const eligible = (Array.isArray(transactions) ? transactions : []).filter(
    (tx) => tx && tx.date && tx.date <= throughDay
  );
  if (eligible.length === 0) return 0;

  const sorted = [...eligible].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const ta = a.time || '00:00';
    const tb = b.time || '00:00';
    if (ta !== tb) return ta.localeCompare(tb);
    return (a.createdAt || 0) - (b.createdAt || 0);
  });

  // Mirror calculateRunningBalances exactly: cash_added adds, cash payments
  // subtract (never below zero), card spend leaves the cash drawer untouched.
  let balance = 0;
  const isCashPayment = (method?: string) => !method || method.toLowerCase() === 'cash';
  for (const tx of sorted) {
    const amt = Math.abs(tx.amount || 0);
    if (tx.type === 'cash_added') {
      balance += amt;
    } else if (tx.type === 'cash_expense' && isCashPayment(tx.paymentMethod)) {
      balance = Math.max(0, balance - amt);
    }
  }
  return balance;
};

export interface CarryForwardOffer {
  /** Cash carried into today. Always > 0. */
  amount: number;
  /** The day whose closing balance is being carried. */
  fromDay: string;
  /** Human label for fromDay, e.g. "23 Oct". */
  fromLabel: string;
}

export interface EvaluateCarryArgs {
  transactions: Transaction[];
  /** The calendar day being evaluated (defaults to today, local time). */
  today?: string;
}

/**
 * Is a carry-forward mathematically available today, and for how much?
 *
 * Note this deliberately does NOT consider whether the popup was already
 * shown. Two different things need the answer:
 *   - the popup must fire at most once per day (gated by `hasCarryPromptFor`),
 *   - the same option must stay reachable from Cash In after a dismissal.
 * Folding the prompt guard in here would silently kill that escape hatch.
 *
 * Returns null when there is nothing to carry: no history before today, rows
 * already recorded today (the balance on screen is then meaningful and a
 * carry-forward would double-count), or a zero closing balance.
 */
export const evaluateCarryForward = ({
  transactions,
  today = getLocalDateString(),
}: EvaluateCarryArgs): CarryForwardOffer | null => {
  if (!Array.isArray(transactions) || transactions.length === 0) return null;

  const yesterday = getYesterdayString(new Date(`${today}T12:00:00`));
  // Need at least one row before today to carry anything from.
  const hasHistory = transactions.some((tx) => tx && tx.date && tx.date <= yesterday);
  if (!hasHistory) return null;

  // Today already has a MANUAL Cash Added row: that row IS today's opening
  // float, so carrying yesterday's close on top of it would double-count.
  //
  // Expenses (or any other non-opening row) do NOT block the offer: today's
  // spend simply comes out of yesterday's close. Blocking on "any row today"
  // is what made the carry silently vanish when the popup missed the very
  // first records of a new day - the balance then showed Rs 0 all day with no
  // popup and no row, which is the bug users reported.
  const hasManualOpening = transactions.some(
    (tx) => tx && tx.date === today && tx.type === 'cash_added' && !tx.isCarryForward
  );
  if (hasManualOpening) return null;

  // Already carried in today -> nothing left to offer.
  if (findTodayCarryForward(transactions, today)) return null;

  const amount = Math.round(closingBalanceThrough(transactions, yesterday) * 100) / 100;
  if (!(amount > 0)) return null;

  return { amount, fromDay: yesterday, fromLabel: formatDayLabel(yesterday) };
};

/**
 * The ledger row an accepted carry-forward becomes.
 *
 * Dated at 00:00 on purpose: this is an OPENING balance, so it must sort
 * before every other row of the day. Timestamping it with the moment it was
 * accepted made any transaction recorded earlier the same day run first -
 * against an empty drawer that clamps to Rs 0 - so the carried money never
 * paid for it and the balance read wrong.
 */
export const buildCarryForwardTransaction = (
  offer: CarryForwardOffer,
  today: string = getLocalDateString()
): Omit<Transaction, 'id' | 'createdAt'> => {
  return {
    date: today,
    time: '00:00',
    type: 'cash_added',
    category: 'Cash Added',
    amount: offer.amount,
    paymentMethod: 'Cash',
    notes: `Yesterday balance continued from ${offer.fromLabel}`,
    isCarryForward: true,
  };
};

/** Is this row the auto-generated opening balance rather than real new money? */
export const isCarryForwardTx = (tx?: Transaction | null): boolean =>
  Boolean(tx && tx.isCarryForward && tx.type === 'cash_added');

/** Today's carry-forward row for this scope, if one exists. */
export const findTodayCarryForward = (
  transactions: Transaction[],
  today: string = getLocalDateString()
): Transaction | undefined =>
  (Array.isArray(transactions) ? transactions : []).find(
    (tx) => tx && tx.date === today && isCarryForwardTx(tx)
  );
