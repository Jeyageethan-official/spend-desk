import { getLocalDateString, isCarryForwardTransaction } from './calculations';
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
 * OFFERED ON EVERY OPEN: the popup appears whenever the offer exists —
 * closing the app, reopening it or refreshing asks again while today still has
 * no carry row of its own. The recorded prompt marker (markCarryPromptShown /
 * hasCarryPromptFor) no longer gates showing it; it only stops the silent
 * auto-carry in App from overriding an explicit "Not now" in that visit.
 * Accepting is safe by construction: evaluateCarryForward returns null as
 * soon as today's carry row exists, so the money can never be added twice,
 * and a mid-session "Not now" still closes the popup until the next load. The
 * Cash In flow offers the same carry-forward as the escape hatch.
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

const isCashPayment = (method?: string) => !method || method.toLowerCase() === 'cash';

/** That calendar day's own wallet close — never a sum of older days. */
export const closingBalanceForDay = (
  transactions: Transaction[],
  day: string
): number => {
  const dayTxs = (Array.isArray(transactions) ? transactions : []).filter(
    (tx) => tx && tx.date === day
  );
  if (dayTxs.length === 0) return 0;

  const sorted = [...dayTxs].sort((a, b) => {
    const ta = a.time || '00:00';
    const tb = b.time || '00:00';
    if (ta !== tb) return ta.localeCompare(tb);
    return (a.createdAt || 0) - (b.createdAt || 0);
  });

  let balance = 0;
  for (const tx of sorted) {
    const amt = Math.abs(tx.amount || 0);
    if (tx.type === 'cash_added') {
      balance += amt;
    } else if (tx.type === 'cash_expense' && isCashPayment(tx.paymentMethod)) {
      balance = Math.max(0, balance - amt);
    }
  }
  return Math.round(balance * 100) / 100;
};

/** Does this row touch the physical cash drawer on its day? */
const isCashDrawerRow = (tx?: Transaction | null): boolean => {
  if (!tx) return false;
  if (tx.type === 'cash_added') return true;
  return tx.type === 'cash_expense' && isCashPayment(tx.paymentMethod);
};

/** The calendar day before `dateStr` as local YYYY-MM-DD. */
const previousDayString = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() - 1);
  return getLocalDateString(dt);
};

/**
 * Closing cash as of 23:59:59 on `throughDay` — THE PREVIOUS DAY'S OWN
 * DISPLAYED CLOSE, never a sum of older days.
 *
 * THE RULE (the one the whole feature exists to honour): today's offer is
 * exactly the balance the app showed as yesterday's closing balance. It is
 * computed by looking at that ONE day: its carry-forward row (if one was
 * accepted) is that day's opening balance, its own Cash Ins add, its own
 * cash Expenses subtract. Older days are never re-walked, so no carried amount
 * can ever be counted twice and no ledger history can leak into the offer -
 * Rs 500 closing on the 25th and Rs 800 on the 26th means the 27th offers
 * Rs 800, never Rs 1,300/1,400.
 *
 * Days that do NOT close the wallet are stepped over rather than summed:
 * an empty day and a card-only day leave the cash drawer untouched, so the
 * walk keeps going back until it finds the most recent day that actually
 * moved cash. That preserves "5 Oct closed at 1,500, 6 Oct had no
 * transactions" → 7 Oct still offers 1,500.
 */
export const closingBalanceThrough = (
  transactions: Transaction[],
  throughDay: string
): number => {
  const txs = (Array.isArray(transactions) ? transactions : []).filter(
    (tx) => tx && tx.date
  );
  if (txs.length === 0) return 0;

  // Earliest day in the ledger bounds the walk-back.
  let earliest = throughDay;
  for (const tx of txs) {
    if (tx.date && tx.date < earliest) earliest = tx.date;
  }

  let day = throughDay;
  while (day >= earliest) {
    const dayTxs = txs.filter((tx) => tx.date === day);
    const closedCash = dayTxs.some(isCashDrawerRow);
    if (closedCash) {
      // That day's own close: the carry row (00:00) opens it, the day's real
      // rows move it. Exactly what the single-day balance view displayed.
      return closingBalanceForDay(txs, day);
    }
    // Empty day or card-only day: the wallet did not move — step back.
    if (day === earliest) break;
    day = previousDayString(day);
  }
  return 0;
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
  /** Account scope (unused for the amount itself, kept for call-site clarity). */
  email?: string | null;
}

/**
 * Is a carry-forward mathematically available today, and for how much?
 *
 * Note this deliberately does NOT consider whether the popup was already
 * shown. Two different things need the answer:
 *   - the popup shows whenever this returns an offer (each fresh open too),
 *   - the same option must stay reachable from Cash In after a dismissal.
 * Folding a prompt guard in here would silently kill that escape hatch — and
 * returning null once today's carry row exists is what makes repeating the
 * popup impossible to double-count.
 *
 * Returns null when there is nothing to carry: no history on or before
 * yesterday, yesterday closed at zero, or a carry-forward is already saved
 * today. Today's new / edited / deleted rows must never change the amount and
 * must never hide the offer — that amount is yesterday's own close only.
 */
export const evaluateCarryForward = ({
  transactions,
  today = getLocalDateString(),
  email = null,
}: EvaluateCarryArgs): CarryForwardOffer | null => {
  if (!Array.isArray(transactions) || transactions.length === 0) return null;

  const yesterday = getYesterdayString(new Date(`${today}T12:00:00`));
  const hasHistory = transactions.some((tx) => tx && tx.date && tx.date <= yesterday);
  if (!hasHistory) return null;

  if (findTodayCarryForward(transactions, today)) return null;

  // ALWAYS the live close of yesterday — never a figure frozen at the first
  // evaluation of the day. Freezing meant any later correction to yesterday's
  // rows (or rows that simply arrived afterwards from the Sheet / cloud) left
  // the popup and the Cash In button offering a stale amount forever. This is
  // a useMemo over `transactions`, so the offer now changes in real time with
  // every save — and it can only ever move with YESTERDAY's data, because the
  // walk below never reads a day after `yesterday`.
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
  isCarryForwardTransaction(tx);

/** Today's carry-forward row for this scope, if one exists. */
export const findTodayCarryForward = (
  transactions: Transaction[],
  today: string = getLocalDateString()
): Transaction | undefined =>
  (Array.isArray(transactions) ? transactions : []).find(
    (tx) => tx && tx.date === today && isCarryForwardTx(tx)
  );
