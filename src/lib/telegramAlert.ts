import { Transaction, LendItem } from '../types/finance';
import { formatCurrency, formatDateToDisplayHeader } from './calculations';
import { getSupabase } from './supabase';

const cashTypeLabel = (tx: Pick<Transaction, 'type'>): string => {
  if (tx.type === 'cash_added') return 'Cash In';
  if (tx.type === 'card_expense') return 'Card Spend';
  return 'Cash Out';
};

const txDescription = (tx: Pick<Transaction, 'notes' | 'category'>): string =>
  (tx.notes || '').trim() || tx.category || 'No description';

export interface TelegramAlertPayload {
  chatId: string;
  title: string;
  message: string;
  createdAt?: number;
  /**
   * Outbox identity. Assigned the moment an alert is queued (write-ahead), so
   * the same alert can be located and removed after the server confirms
   * delivery, and a retry never duplicates it.
   */
  id?: string;
  /**
   * The transaction that produced this alert. Diagnostic only: deleting the
   * row does NOT cancel its alert - once queued, every alert is delivered,
   * because the alert announced the record at save time and the delete flow
   * must never silence it.
   */
  txId?: string;
}

export const generateTransactionTelegramAlert = (
  tx: Transaction,
  currency: string = 'Rs',
  currentBalance?: number
): TelegramAlertPayload => {
  const formattedAmt = formatCurrency(tx.amount, currency);
  const dateStr = tx.date || new Date().toISOString().split('T')[0];
  const timeStr = tx.time || new Date(tx.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const categoryStr = tx.category || 'Expense';
  const noteStr = tx.notes?.trim() || '';

  const lines: string[] = [];

  if (tx.type === 'cash_expense') {
    // 1. Cash Spent / Expenses
    const desc = noteStr ? `(${categoryStr} / ${noteStr})` : `(${categoryStr})`;
    const payment = tx.paymentMethod || 'Cash';
    lines.push(`Expense: ${formattedAmt} ${desc}`);
    lines.push(`Payment: ${payment}`);
    lines.push(`Date & Time: ${dateStr} at ${timeStr}`);
  } else if (tx.type === 'card_expense') {
    // 2. Card Spend
    const desc = noteStr ? `(${categoryStr} / ${noteStr})` : `(${categoryStr})`;
    const payment = tx.paymentMethod && tx.paymentMethod !== 'Cash' ? tx.paymentMethod : 'HDFC / Debit Card';
    lines.push(`Card Spend: ${formattedAmt} ${desc}`);
    lines.push(`Payment: ${payment}`);
    lines.push(`Date & Time: ${dateStr} at ${timeStr}`);
  } else {
    // 3. Cash Added / Income
    lines.push(`Cash Added to Wallet: ${formattedAmt}`);
    if (noteStr) {
      lines.push(`Notes: ${noteStr}`);
    }
    lines.push(`Date & Time: ${dateStr} at ${timeStr}`);
  }

  if (typeof currentBalance === 'number') {
    lines.push(`Current Balance: ${formatCurrency(currentBalance, currency)}`);
  }

  return {
    chatId: '',
    title: '[SpendDesk Alert]',
    message: lines.join('\n'),
    createdAt: Date.now(),
  };
};

export const generateDeletedTransactionTelegramAlert = (
  tx: Transaction,
  currency: string = 'Rs',
  updatedBalance?: number
): TelegramAlertPayload => {
  const lines = [
    '🗑️ TRANSACTION DELETED',
    '',
    `Type: ${cashTypeLabel(tx)}`,
    `Deleted Amount: ${formatCurrency(tx.amount, currency)}`,
    `Date: ${formatDateToDisplayHeader(tx.date || '')}`,
    `Description: ${txDescription(tx)}`,
  ];
  if (typeof updatedBalance === 'number') {
    lines.push(`Updated Balance: ${formatCurrency(updatedBalance, currency)}`);
  }

  return {
    chatId: '',
    title: '[SpendDesk Alert]',
    message: lines.join('\n'),
    createdAt: Date.now(),
  };
};

export const generateBulkDeletedTransactionsTelegramAlert = (
  txs: Transaction[],
  currency: string = 'Rs',
  updatedBalance?: number
): TelegramAlertPayload => {
  const count = txs.length;
  const total = txs.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
  const lines = [
    '🗑️ TRANSACTIONS DELETED',
    '',
    `Deleted: ${count} transaction${count === 1 ? '' : 's'}`,
    `Deleted Amount: ${formatCurrency(total, currency)}`,
  ];
  txs.slice(0, 8).forEach((tx) => {
    lines.push(
      `• ${cashTypeLabel(tx)} ${formatCurrency(tx.amount, currency)} — ${txDescription(tx)}`
    );
  });
  if (txs.length > 8) {
    lines.push(`• …and ${txs.length - 8} more`);
  }
  if (typeof updatedBalance === 'number') {
    lines.push(`Updated Balance: ${formatCurrency(updatedBalance, currency)}`);
  }

  return {
    chatId: '',
    title: '[SpendDesk Alert]',
    message: lines.join('\n'),
    createdAt: Date.now(),
  };
};

export const generateLendTelegramAlert = (
  item: LendItem,
  currency: string = 'Rs',
  currentBalance?: number
): TelegramAlertPayload => {
  const formattedAmt = formatCurrency(item.amount, currency);
  const dateStr = item.date || new Date().toISOString().split('T')[0];
  const timeStr = new Date(item.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const person = item.personName?.trim() || 'Friend';

  const lines: string[] = [];

  const statusText = item.status === 'settled' ? 'settled' : (item.type === 'lent' ? 'Pending Return' : 'Pending Payback');

  if (item.type === 'lent') {
    // 4. Money Lended
    lines.push(`Money Lended: ${formattedAmt} (To: ${person})`);
    lines.push(`Status: ${statusText}`);
  } else {
    // 5. Money Borrowed
    lines.push(`Money Borrowed: ${formattedAmt} (From: ${person})`);
    lines.push(`Status: ${statusText}`);
  }

  lines.push(`Date & Time: ${dateStr} at ${timeStr}`);

  if (typeof currentBalance === 'number') {
    lines.push(`Current Balance: ${formatCurrency(currentBalance, currency)}`);
  }

  return {
    chatId: '',
    title: '[SpendDesk Alert]',
    message: lines.join('\n'),
    createdAt: Date.now(),
  };
};

export const generateLowBalanceTelegramAlert = (
  currentBalance: number,
  limit: number,
  currency: string = 'Rs'
): TelegramAlertPayload => {
  const lines = [
    'Warning: Low Balance Alert!',
    `Current Balance: ${formatCurrency(currentBalance, currency)}`,
    `Limit: Below ${formatCurrency(limit, currency)}`,
    'Note: Please top up your wallet soon to avoid low funds.',
  ];

  return {
    chatId: '',
    title: '[SpendDesk Alert]',
    message: lines.join('\n'),
    createdAt: Date.now(),
  };
};

const PENDING_TELEGRAM_ALERTS_KEY = 'spenddesk_pending_telegram_alerts_v1';

export const getPendingTelegramAlerts = (): TelegramAlertPayload[] => {
  try {
    const raw = localStorage.getItem(PENDING_TELEGRAM_ALERTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** Add to the durable outbox. Safe to call often; ids deduplicate retries. */
export const queueOfflineTelegramAlert = (payload: TelegramAlertPayload): void => {
  try {
    const current = getPendingTelegramAlerts();
    const id = payload.id || `tg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (current.some((a) => a.id === id)) return;
    current.push({ ...payload, id, createdAt: payload.createdAt || Date.now() });
    localStorage.setItem(PENDING_TELEGRAM_ALERTS_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('Failed to queue offline Telegram alert:', e);
  }
};

/** Remove one alert from the outbox once it has actually been delivered. */
const removeFromOutbox = (id?: string): void => {
  if (!id) return;
  try {
    const remaining = getPendingTelegramAlerts().filter((a) => a.id !== id);
    if (remaining.length === 0) {
      localStorage.removeItem(PENDING_TELEGRAM_ALERTS_KEY);
    } else {
      localStorage.setItem(PENDING_TELEGRAM_ALERTS_KEY, JSON.stringify(remaining));
    }
  } catch {}
};

// NOTE: an alert is NEVER cancelled because its transaction was deleted.
// The alert announces that the record was made at save time; deleting the row
// later must not silence it (delete pannalum alert poganum). The outbox is
// fire-and-forget: once queued, every alert is delivered.

// Serialises flushes. Two overlapping flushes (boot + the 'online' handler)
// used to both read the same pending list and both send it, doubling alerts.
let flushInFlight: Promise<number> | null = null;

export const flushPendingTelegramAlerts = (): Promise<number> => {
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async (): Promise<number> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;
    const pending = getPendingTelegramAlerts();
    if (pending.length === 0) return 0;

    let sentCount = 0;
    for (const alert of pending) {
      try {
        const { error } = await getSupabase().functions.invoke('telegram-alert', {
          body: alert,
        });
        if (!error) {
          sentCount++;
          // Remove only the one that landed, so an alert queued WHILE this
          // flush was running is never wiped without being sent.
          removeFromOutbox(alert.id);
        }
      } catch {
        // Leave it queued for the next flush.
      }
    }

    return sentCount;
  })().finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
};

/**
 * Send an alert through the Supabase Edge Function.
 *
 * WRITE-AHEAD: the alert is persisted to the durable outbox BEFORE the network
 * call, and only removed once the server confirms delivery. The old order -
 * send first, queue only on failure - lost every alert whose tab was closed
 * while the request was in flight, because nothing had been written yet.
 * Closing the app right after saving a transaction is now safe: the next open
 * (or the next 'online' event) flushes whatever is still queued.
 */
export const sendTelegramAlert = async (
  payload: TelegramAlertPayload
): Promise<{ delivered: boolean; queued: boolean }> => {
  // chatId may be empty in the deep-link flow: the backend resolves the
  // authenticated user's own linked chat server-side (and enforces the
  // per-user alerts toggle there).

  let cleanMessage = payload.message.trim();
  cleanMessage = cleanMessage.replace(/^(\*?\[?SpendDesk Alert\]?\*?\s*\n*)+/i, '').trim();

  const cleanPayload: TelegramAlertPayload = {
    ...payload,
    id: payload.id || `tg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '[SpendDesk Alert]',
    message: cleanMessage,
    createdAt: payload.createdAt || Date.now(),
  };

  // Persist first. This is the whole fix: from this instant the alert survives
  // a closed tab, a killed process or a dead battery.
  queueOfflineTelegramAlert(cleanPayload);

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (isOffline) {
    return { delivered: false, queued: true };
  }

  try {
    const { error } = await getSupabase().functions.invoke('telegram-alert', {
      body: cleanPayload,
    });
    if (error) {
      return { delivered: false, queued: true };
    }
    removeFromOutbox(cleanPayload.id);
    return { delivered: true, queued: false };
  } catch {
    return { delivered: false, queued: true };
  }
};
