import { getLocalDateString, isCarryForwardTransaction } from './calculations';
import { Transaction } from '../types/finance';

const AMOUNT_LOCK_KEY = 'spenddesk_carry_amount_v1';

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

/**
 * Closing cash as of 23:59:59 on `throughDay`.
 *
 * THE RULE: the wallet holds what every real Cash In minus every real cash
 * Expense added up to by the end of that day. Carry-forward rows are skipped
 * because they only re-open a later day with money already counted here -
 * adding them back is exactly how yesterday's balance used to come out as
 * Rs 4,000 instead of Rs 3,000.
 *
 * It also deliberately walks back over days that hold no rows at all. An empty
 * day does not change the wallet, so its closing balance is the last real
 * close before it - that is what makes "5 Oct closed at 1,500, 6 Oct had no
 * transactions" still offer 1,500 on 7 Oct instead of nothing.
 */
export const closingBalanceThrough = (
  transactions: Transaction[],
  throughDay: string
): number => {
  const eligible = (Array.isArray(transactions) ? transactions : []).filter(
    (tx) =>
      tx &&
      tx.date &&
      tx.date <= throughDay &&
      tx.type !== 'card_expense' &&
      !isCarryForwardTransaction(tx)
  );
  if (eligible.length === 0) return 0;

  const isCashPayment = (method?: string) => !method || method.toLowerCase() === 'cash';
  const sorted = [...eligible].sort((a, b) => {
    const da = a.date || '';
    const db = b.date || '';
    if (da !== db) return da.localeCompare(db);
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

const amountLockKey = (day: string, email?: string | null) =>
  `${AMOUNT_LOCK_KEY}_${(email || 'guest').trim().toLowerCase()}_${day}`;

const readFrozenCarryAmount = (day: string, email?: string | null): number | null => {
  try {
    const raw = localStorage.getItem(amountLockKey(day, email));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { amount?: number };
    return typeof parsed?.amount === 'number' && parsed.amount > 0 ? parsed.amount : null;
  } catch {
    return null;
  }
};

const freezeCarryAmount = (day: string, amount: number, email?: string | null): void => {
  if (!(amount > 0)) return;
  try {
    localStorage.setItem(
      amountLockKey(day, email),
      JSON.stringify({ amount, at: Date.now() })
    );
  } catch {}
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
  /** Account scope for the once-per-day frozen continue amount. */
  email?: string | null;
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

  const frozen = typeof localStorage !== 'undefined' ? readFrozenCarryAmount(today, email) : null;
  // End of the immediately previous calendar day — real cash only, carries
  // excluded, empty days naturally inherited from the last real close.
  const live = Math.round(closingBalanceThrough(transactions, yesterday) * 100) / 100;
  const amount = frozen && frozen > 0 ? frozen : live;
  if (!(amount > 0)) return null;

  if (!frozen) freezeCarryAmount(today, amount, email);

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
