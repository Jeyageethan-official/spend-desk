import { Transaction, LendItem } from '../types/finance';
import { formatCurrency } from './calculations';

export const generateTransactionSmsText = (tx: Transaction, currentCashBalance: number, currency: string = 'Rs'): string => {
  const typeText = 
    tx.type === 'cash_added' ? 'Cash Added to Wallet' :
    tx.type === 'card_expense' ? 'Card Spend' : 'Cash Spent';
  
  const formattedAmt = formatCurrency(tx.amount, currency);
  const formattedBal = formatCurrency(currentCashBalance, currency);
  const notePart = tx.notes ? ` (${tx.notes})` : '';

  return `[SpendDesk Alert] ${typeText}: ${formattedAmt}${notePart} on ${tx.date}${tx.time ? ' ' + tx.time : ''}. Current Cash Balance: ${formattedBal}.`;
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
