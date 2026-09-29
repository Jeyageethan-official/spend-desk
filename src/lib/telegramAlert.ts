import { Transaction } from '../types/finance';
import { getSupabase } from './supabase';

export interface TelegramAlertPayload {
  chatId: string;
  title: string;
  message: string;
}

const formatAmount = (amount: number, currency: string) =>
  `${currency} ${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const generateTransactionTelegramAlert = (tx: Transaction, currency: string): TelegramAlertPayload => {
  const isIncome = tx.type === 'cash_added';
  const direction = isIncome ? 'Income recorded' : 'Expense recorded';
  const signedAmount = `${isIncome ? '+' : '-'}${formatAmount(tx.amount, currency)}`;
  const method = tx.paymentMethod || 'Cash';
  const note = tx.notes?.trim() ? `\n${tx.notes.trim()}` : '';

  return {
    chatId: '',
    title: 'SpendDesk alert',
    message: `${direction}\n${signedAmount} · ${tx.category} · ${method}${note}`,
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
