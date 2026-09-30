import { Transaction } from '../types/finance';
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
  const typeText = 
    tx.type === 'cash_added' ? 'Cash Added to Wallet' :
    tx.type === 'card_expense' ? 'Card Spend' : 'Cash Spent';

  const formattedAmt = formatCurrency(tx.amount, currency);
  const timeStr = tx.time || new Date(tx.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const noteStr = tx.notes?.trim() ? ` (${tx.notes.trim()})` : '';

  const messageLines = [
    `${typeText}: ${formattedAmt}${noteStr}`,
    `on ${tx.date} at ${timeStr}.`,
  ];

  if (typeof currentBalance === 'number') {
    messageLines.push(`Current Balance: ${formatCurrency(currentBalance, currency)}.`);
  }

  return {
    chatId: '',
    title: '[SpendDesk Alert]',
    message: messageLines.join('\n'),
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
