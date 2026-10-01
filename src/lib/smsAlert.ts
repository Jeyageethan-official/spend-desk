import { Transaction, LendItem } from '../types/finance';
import { formatCurrency } from './calculations';

export const generateTransactionSmsText = (tx: Transaction, currentCashBalance?: number, currency: string = 'Rs'): string => {
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
    let source = 'Salary / Top-up';
    if (categoryStr && categoryStr !== 'Cash Added' && noteStr) {
      source = `${categoryStr} / ${noteStr}`;
    } else if (noteStr) {
      source = noteStr;
    } else if (categoryStr && categoryStr !== 'Cash Added') {
      source = categoryStr;
    }
    lines.push(`Cash Added to Wallet: ${formattedAmt}`);
    lines.push(`Source: ${source}`);
    lines.push(`Date & Time: ${dateStr} at ${timeStr}`);
  }

  if (typeof currentCashBalance === 'number') {
    lines.push(`Current Balance: ${formatCurrency(currentCashBalance, currency)}`);
  }

  return lines.join('\n');
};

export const generateLendSmsText = (item: LendItem, currentCashBalance?: number, currency: string = 'Rs'): string => {
  const formattedAmt = formatCurrency(item.amount, currency);
  const dateStr = item.date || new Date().toISOString().split('T')[0];
  const timeStr = new Date(item.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const person = item.personName?.trim() || 'Friend';

  const lines: string[] = ['[SpendDesk Alert]'];

  if (item.type === 'lent') {
    // 4. Money Lended
    const statusText = item.status === 'settled' ? 'Settled' : 'Pending Return';
    lines.push(`Money Lended: ${formattedAmt} (To: ${person})`);
    lines.push(`Status: ${statusText}`);
  } else {
    // 5. Money Borrowed
    const statusText = item.status === 'settled' ? 'Settled' : 'Pending Payback';
    lines.push(`Money Borrowed: ${formattedAmt} (From: ${person})`);
    lines.push(`Status: ${statusText}`);
  }

  lines.push(`Date & Time: ${dateStr} at ${timeStr}`);

  if (typeof currentCashBalance === 'number') {
    lines.push(`Current Balance: ${formatCurrency(currentCashBalance, currency)}`);
  }

  return lines.join('\n');
};

export const generateLowBalanceSmsText = (currentBalance: number, limit: number, currency: string = 'Rs'): string => {
  const lines = [
    '[SpendDesk Alert]',
    'Warning: Low Balance Alert!',
    `Current Balance: ${formatCurrency(currentBalance, currency)}`,
    `Limit: Below ${formatCurrency(limit, currency)}`,
    'Note: Please top up your wallet soon to avoid low funds.',
  ];

  return lines.join('\n');
};

export const generateLendReminderText = (item: LendItem, currency: string = 'Rs'): string => {
  const formattedAmt = formatCurrency(item.amount, currency);
  if (item.type === 'lent') {
    return `Hi ${item.personName}, friendly reminder regarding ${formattedAmt} for "${item.thingsOrReason}" on ${item.date}. Please let me know once settled. Thank you!`;
  } else {
    return `Hi ${item.personName}, note regarding ${formattedAmt} borrowed for "${item.thingsOrReason}" on ${item.date}. I will settle this soon. Thank you!`;
  }
};

export const triggerDeviceSms = (phoneNumber: string, bodyText: string) => {
  if (!phoneNumber) return;
  const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');
  if (!cleanPhone) return;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const separator = isIOS ? '&' : '?';
  const url = `sms:${cleanPhone}${separator}body=${encodeURIComponent(bodyText)}`;
  
  try {
    const link = document.createElement('a');
    link.href = url;
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try { document.body.removeChild(link); } catch {}
    }, 100);
  } catch (e) {
    console.warn('Could not launch SMS link:', e);
  }
};
