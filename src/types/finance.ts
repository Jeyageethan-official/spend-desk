export type TransactionType = 'cash_expense' | 'card_expense' | 'cash_added';

export type StandardCategory = 
  | 'Food'
  | 'Transport'
  | 'Shopping'
  | 'Bills'
  | 'Entertainment'
  | 'Education'
  | 'Other'
  | 'Income / Top-up';

export type Category = StandardCategory | string;

export type PaymentMethod = 'Cash' | 'Card' | 'Bank Transfer';

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  type: TransactionType;
  category: Category;
  amount: number;
  paymentMethod: PaymentMethod;
  notes: string;
  createdAt: number;
}

export type DateFilterType = 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'all';

export interface FilterState {
  type: DateFilterType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  category?: Category | 'All';
  paymentMethod?: PaymentMethod | 'All';
  searchQuery?: string;
}

export interface SpendingSummary {
  currentCashBalance: number;
  cashAdded: number;
  cashSpent: number;
  cardSpend: number;
  totalSpend: number;
  outOfWallet: number;
}

export interface CategorySummary {
  category: Category;
  amount: number;
  percentage: number;
  count: number;
  color: string;
  iconName: string;
}

export interface DailyTrendItem {
  dayLabel: string; // 'Mon', 'Tue', etc.
  dateStr: string;
  cashAmount: number;
  cardAmount: number;
  totalAmount: number;
}

export interface GoogleSheetMeta {
  id: string;
  name: string;
  url: string;
  lastSyncedAt?: string;
}

export interface BudgetConfig {
  monthlyBudget: number;
  lowCashThreshold: number;
  dailySpendLimit: number;
  notifyOnLimit: boolean;
  smsAlertNumber?: string;
}

export interface SmsParsedData {
  amount: number;
  type: TransactionType;
  category: Category;
  paymentMethod: PaymentMethod;
  merchant: string;
  rawText: string;
  date?: string;
}

export type LendType = 'lent' | 'borrowed'; // 'lent' = I gave money to someone; 'borrowed' = I took money from someone
export type LendStatus = 'pending' | 'settled';

export interface LendItem {
  id: string;
  personName: string;
  thingsOrReason: string;
  amount: number;
  type: LendType;
  status: LendStatus;
  date: string;
  dueDate?: string;
  phone?: string;
  settledAt?: string;
  createdAt: number;
}

export type AppTab = 'dashboard' | 'transactions' | 'lend' | 'analytics' | 'settings';
