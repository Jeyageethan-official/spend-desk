import { Category, PaymentMethod, SmsParsedData, TransactionType } from '../types/finance';

export const parseBankSms = (text: string): SmsParsedData => {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // 1. Detect Amount
  // Matches "LKR 1,500.00", "Rs. 2500", "Rs 5,000", "1250.00 LKR", "Amount: Rs 3400"
  let amount = 0;
  const amountRegex = /(?:rs\.?|lkr|inr|\$)\s*([0-9,]+(?:\.[0-9]{1,2})?)|([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:rs\.?|lkr|inr)/i;
  const match = lower.match(amountRegex);

  if (match) {
    const rawNum = (match[1] || match[2]).replace(/,/g, '');
    amount = parseFloat(rawNum) || 0;
  } else {
    // Fallback: look for general number
    const numRegex = /\b([0-9]{2,7}(?:\.[0-9]{1,2})?)\b/;
    const numMatch = clean.match(numRegex);
    if (numMatch) {
      amount = parseFloat(numMatch[1]) || 0;
    }
  }

  // 2. Detect Type & Payment Method
  let type: TransactionType = 'card_expense';
  let paymentMethod: PaymentMethod = 'Card';

  const isAtmWithdrawal = 
    lower.includes('atm') || 
    lower.includes('withdrawal') || 
    lower.includes('withdrawn') ||
    lower.includes('cash in') ||
    lower.includes('cash out');

  const isDeposit = 
    lower.includes('credited') || 
    lower.includes('salary') || 
    lower.includes('received');

  const isCashPaid = 
    lower.includes('cash paid') || 
    lower.includes('paid in cash') ||
    lower.includes('by cash');

  if (isAtmWithdrawal) {
    // ATM withdrawal puts physical cash into the wallet!
    type = 'cash_added';
    paymentMethod = 'Cash';
  } else if (isDeposit) {
    type = 'cash_added';
    paymentMethod = 'Bank Transfer';
  } else if (isCashPaid) {
    type = 'cash_expense';
    paymentMethod = 'Cash';
  } else {
    // Default to card expense for typical POS / card debits
    type = 'card_expense';
    paymentMethod = 'Card';
  }

  // 3. Detect Category & Merchant
  let category: Category = 'Other';
  let merchant = '';

  if (type === 'cash_added') {
    category = 'Income / Top-up';
    merchant = isAtmWithdrawal ? 'ATM Cash Withdrawal' : 'Bank Credit';
  } else if (
    lower.includes('keells') || 
    lower.includes('cargills') || 
    lower.includes('spar') || 
    lower.includes('arpico') ||
    lower.includes('food') || 
    lower.includes('restaurant') || 
    lower.includes('cafe') || 
    lower.includes('kfc') || 
    lower.includes('mcdonald') || 
    lower.includes('pizza') ||
    lower.includes('lunch') ||
    lower.includes('dinner') ||
    lower.includes('bakery')
  ) {
    category = 'Food';
    merchant = extractMerchant(clean, ['keells', 'cargills', 'spar', 'arpico', 'kfc', 'pizza hut', 'mcdonalds']) || 'Food & Dining';
  } else if (
    lower.includes('uber') || 
    lower.includes('pickme') || 
    lower.includes('petrol') || 
    lower.includes('fuel') || 
    lower.includes('ceypetco') || 
    lower.includes('ioc') ||
    lower.includes('taxi') ||
    lower.includes('bus')
  ) {
    category = 'Transport';
    merchant = extractMerchant(clean, ['uber', 'pickme', 'ceypetco', 'ioc', 'fuel station']) || 'Transport';
  } else if (
    lower.includes('dialog') || 
    lower.includes('mobitel') || 
    lower.includes('slt') || 
    lower.includes('ceb') || 
    lower.includes('water board') || 
    lower.includes('electricity') ||
    lower.includes('bill') ||
    lower.includes('utility')
  ) {
    category = 'Bills';
    merchant = extractMerchant(clean, ['dialog', 'mobitel', 'slt', 'ceb', 'water board']) || 'Utility Bill';
  } else if (
    lower.includes('daraz') || 
    lower.includes('clothing') || 
    lower.includes('fashion') || 
    lower.includes('store') || 
    lower.includes('mall') ||
    lower.includes('supermarket') ||
    lower.includes('shopping')
  ) {
    category = 'Shopping';
    merchant = extractMerchant(clean, ['daraz', 'glitz', 'nolimit', 'cotton collection', 'store']) || 'Shopping';
  } else if (
    lower.includes('cinema') || 
    lower.includes('movie') || 
    lower.includes('netflix') || 
    lower.includes('spotify') || 
    lower.includes('theatre') ||
    lower.includes('scope')
  ) {
    category = 'Entertainment';
    merchant = extractMerchant(clean, ['cinema', 'scope', 'netflix', 'spotify']) || 'Entertainment';
  } else if (
    lower.includes('class') || 
    lower.includes('tuition') || 
    lower.includes('school') || 
    lower.includes('institute') || 
    lower.includes('book') ||
    lower.includes('course')
  ) {
    category = 'Education';
    merchant = 'Education';
  }

  if (!merchant) {
    merchant = clean.length > 40 ? clean.substring(0, 37) + '...' : clean;
  }

  return {
    amount,
    type,
    category,
    paymentMethod,
    merchant,
    rawText: clean,
    date: new Date().toISOString().split('T')[0],
  };
};

function extractMerchant(text: string, keywords: string[]): string {
  for (const k of keywords) {
    const idx = text.toLowerCase().indexOf(k);
    if (idx !== -1) {
      // Return capitalized word
      return text.substring(idx, idx + k.length).toUpperCase();
    }
  }
  return '';
}

export const SAMPLE_SMS_TEMPLATES = [
  {
    title: 'ATM Cash Withdrawal (Cash Top-up)',
    text: 'A/C *5678: Cash withdrawal of LKR 10,000.00 from ATM on 25-SEP-2026. Avail Bal: LKR 45,200.00',
  },
  {
    title: 'Keells Supermarket (Card Spend)',
    text: 'Debit Card *4321 used for LKR 3,850.00 at KEELLS SUPER on 25-SEP-2026 18:24. Ref: 98124',
  },
  {
    title: 'Uber Ride (Card Spend)',
    text: 'Your Card was charged LKR 850.00 for UBER TRIP on 25-SEP-2026.',
  },
  {
    title: 'Dialog Mobile Bill (Bills)',
    text: 'Payment received: LKR 2,450.00 towards DIALOG bill #0771234567 on 25-SEP-2026. Thank you.',
  },
  {
    title: 'Cash Paid for Lunch (Cash Spend)',
    text: 'Paid in cash Rs 650 for office lunch and tea on 25-09-2026',
  },
];
