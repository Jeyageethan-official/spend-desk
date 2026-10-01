import { Transaction, LendItem } from '../types/finance';
import { formatCurrency } from './calculations';
import { getSupabase } from './supabase';

export interface TelegramAlertPayload {
  chatId: string;
  title: string;
  message: string;
  createdAt?: number;
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

  const lines: string[] = ['[SpendDesk Alert]'];

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

export const generateLendTelegramAlert = (
  item: LendItem,
  currency: string = 'Rs',
  currentBalance?: number
): TelegramAlertPayload => {
  const formattedAmt = formatCurrency(item.amount, currency);
  const dateStr = item.date || new Date().toISOString().split('T')[0];
  const timeStr = new Date(item.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const person = item.personName?.trim() || 'Friend';

  const lines: string[] = ['[SpendDesk Alert]'];

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
    '[SpendDesk Alert]',
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
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const queueOfflineTelegramAlert = (payload: TelegramAlertPayload): void => {
  try {
    const current = getPendingTelegramAlerts();
    current.push({ ...payload, createdAt: payload.createdAt || Date.now() });
    localStorage.setItem(PENDING_TELEGRAM_ALERTS_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('Failed to queue offline Telegram alert:', e);
  }
};

export const flushPendingTelegramAlerts = async (): Promise<number> => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 0;
  }
  const pending = getPendingTelegramAlerts();
  if (pending.length === 0) return 0;

  const remaining: TelegramAlertPayload[] = [];
  let sentCount = 0;

  for (const alert of pending) {
    try {
      const { error } = await getSupabase().functions.invoke('telegram-alert', {
        body: alert,
      });
      if (error) {
        remaining.push(alert);
      } else {
        sentCount++;
      }
    } catch {
      remaining.push(alert);
    }
  }

  try {
    if (remaining.length === 0) {
      localStorage.removeItem(PENDING_TELEGRAM_ALERTS_KEY);
    } else {
      localStorage.setItem(PENDING_TELEGRAM_ALERTS_KEY, JSON.stringify(remaining));
    }
  } catch {}

  return sentCount;
};

/**
 * Sends alert through Supabase Edge Function.
 * If offline or if the network fails, it queues the alert persistently in localStorage
 * so it will automatically be sent once internet connectivity is restored.
 */
export const sendTelegramAlert = async (
  payload: TelegramAlertPayload
): Promise<{ delivered: boolean; queued: boolean }> => {
  if (!payload.chatId.trim()) {
    throw new Error('Telegram Chat ID is empty.');
  }

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (isOffline) {
    queueOfflineTelegramAlert(payload);
    return { delivered: false, queued: true };
  }

  try {
    const { error } = await getSupabase().functions.invoke('telegram-alert', {
      body: payload,
    });
    if (error) {
      queueOfflineTelegramAlert(payload);
      return { delivered: false, queued: true };
    }
    return { delivered: true, queued: false };
  } catch {
    queueOfflineTelegramAlert(payload);
    return { delivered: false, queued: true };
  }
};
