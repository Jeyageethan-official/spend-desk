import { Transaction } from '../types/finance';
import { formatCurrency } from './calculations';
import { getSupabase } from './supabase';

export interface TelegramAlertPayload {
  chatId: string;
  title: string;
  message: string;
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
    `[SpendDesk Alert]`,
    `${typeText}: ${formattedAmt}${noteStr}`,
    `on ${tx.date} at ${timeStr}.`,
  ];

  if (typeof currentBalance === 'number') {
    messageLines.push(`Current Balance: ${formatCurrency(currentBalance, currency)}.`);
  }

  return {
    chatId: '',
    title: 'SpendDesk Alert',
    message: messageLines.join('\n'),
  };
};

/**
 * Sends through a Supabase Edge Function. The Telegram bot token never reaches
 * the browser; it must be configured as TELEGRAM_BOT_TOKEN on the function.
 */
export const sendTelegramAlert = async (payload: TelegramAlertPayload): Promise<void> => {
  const { error } = await getSupabase().functions.invoke('telegram-alert', {
    body: payload,
  });
  if (error) throw error;
};
