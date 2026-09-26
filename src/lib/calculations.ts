import { 
  Transaction, 
  SpendingSummary, 
  CategorySummary, 
  Category, 
  DailyTrendItem, 
  FilterState 
} from '../types/finance';
import { loadStoredCategoryDefs } from './storage';

export const STANDARD_CATEGORIES: { category: Category; color: string; iconName: string; bgClass: string; textClass: string }[] = [
  { category: 'Food', color: '#EA580C', iconName: 'Utensils', bgClass: 'bg-orange-50 text-orange-700 border-orange-200', textClass: 'text-orange-600' },
  { category: 'Transport', color: '#0284C7', iconName: 'Car', bgClass: 'bg-sky-50 text-sky-700 border-sky-200', textClass: 'text-sky-600' },
  { category: 'Shopping', color: '#6366F1', iconName: 'ShoppingBag', bgClass: 'bg-indigo-50 text-indigo-700 border-indigo-200', textClass: 'text-indigo-600' },
  { category: 'Bills', color: '#D97706', iconName: 'Zap', bgClass: 'bg-amber-50 text-amber-700 border-amber-200', textClass: 'text-amber-600' },
  { category: 'Entertainment', color: '#7C3AED', iconName: 'Film', bgClass: 'bg-violet-50 text-violet-700 border-violet-200', textClass: 'text-violet-600' },
  { category: 'Education', color: '#0D9488', iconName: 'GraduationCap', bgClass: 'bg-teal-50 text-teal-700 border-teal-200', textClass: 'text-teal-600' },
  { category: 'Other', color: '#64748B', iconName: 'MoreHorizontal', bgClass: 'bg-slate-50 text-slate-700 border-slate-200', textClass: 'text-slate-600' },
];

export const formatCurrency = (amount: number, currency: string = 'Rs'): string => {
  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? '-' : ''}${currency} ${formatted}`;
};

export const filterTransactions = (
  transactions: Transaction[],
  filter: FilterState
): Transaction[] => {
  return transactions.filter((tx) => {
    // Date filter
    if (filter.startDate && tx.date < filter.startDate) return false;
    if (filter.endDate && tx.date > filter.endDate) return false;

    // Category filter
    if (filter.category && filter.category !== 'All' && tx.category !== filter.category) {
      return false;
    }

    // Payment method filter
    if (filter.paymentMethod && filter.paymentMethod !== 'All' && tx.paymentMethod !== filter.paymentMethod) {
      return false;
    }

    // Search query
    if (filter.searchQuery && filter.searchQuery.trim() !== '') {
      const q = filter.searchQuery.toLowerCase();
      const matchNotes = tx.notes.toLowerCase().includes(q);
      const matchCat = tx.category.toLowerCase().includes(q);
      const matchAmt = tx.amount.toString().includes(q);
      if (!matchNotes && !matchCat && !matchAmt) return false;
    }

    return true;
  });
};

export const calculateSummary = (
  allTransactions: Transaction[],
  filteredTransactions: Transaction[]
): SpendingSummary => {
  // Cash balance is calculated from all-time physical cash transactions
  const allCashAdded = allTransactions
    .filter((tx) => tx.type === 'cash_added')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const allCashSpent = allTransactions
    .filter((tx) => tx.type === 'cash_expense')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const currentCashBalance = allCashAdded - allCashSpent;

  // Filtered period statistics
  const cashAdded = filteredTransactions
    .filter((tx) => tx.type === 'cash_added')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const cashSpent = filteredTransactions
    .filter((tx) => tx.type === 'cash_expense')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const cardSpend = filteredTransactions
    .filter((tx) => tx.type === 'card_expense')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalSpend = cashSpent + cardSpend;
  const outOfWallet = cashSpent;

  return {
    currentCashBalance,
    cashAdded,
    cashSpent,
    cardSpend,
    totalSpend,
    outOfWallet,
  };
};

export const calculateCategoryBreakdown = (
  transactions: Transaction[]
): CategorySummary[] => {
  const expenseTxs = transactions.filter(
    (tx) => tx.type === 'cash_expense' || tx.type === 'card_expense'
  );

  const totalExpense = expenseTxs.reduce((sum, tx) => sum + tx.amount, 0);

  const map = new Map<Category, { amount: number; count: number }>();
  
  // Seed with all configured categories
  const currentDefs = loadStoredCategoryDefs();
  const defMap = new Map(currentDefs.map(d => [d.name, d]));
  currentDefs.forEach(({ name }) => {
    map.set(name, { amount: 0, count: 0 });
  });

  expenseTxs.forEach((tx) => {
    const existing = map.get(tx.category) || { amount: 0, count: 0 };
    map.set(tx.category, {
      amount: existing.amount + tx.amount,
      count: existing.count + 1,
    });
  });

  return Array.from(map.entries()).map(([cat, data]) => {
    const def = defMap.get(cat) || STANDARD_CATEGORIES.find((c) => c.category === cat);
    const percentage = totalExpense > 0 ? (data.amount / totalExpense) * 100 : 0;

    return {
      category: cat,
      amount: data.amount,
      percentage,
      count: data.count,
      color: def?.color || '#0ea5e9',
      iconName: def?.iconName || 'Tag',
    };
  });
};

export const calculateWeeklyDailyTrend = (
  transactions: Transaction[]
): { trendItems: DailyTrendItem[]; dayTotals: { [key: string]: number } } => {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const templateDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const dayTotals: { [key: string]: { cash: number; card: number; total: number } } = {
    Mon: { cash: 0, card: 0, total: 0 },
    Tue: { cash: 0, card: 0, total: 0 },
    Wed: { cash: 0, card: 0, total: 0 },
    Thu: { cash: 0, card: 0, total: 0 },
    Fri: { cash: 0, card: 0, total: 0 },
    Sat: { cash: 0, card: 0, total: 0 },
    Sun: { cash: 0, card: 0, total: 0 },
  };

  transactions.forEach((tx) => {
    if (tx.type === 'cash_expense' || tx.type === 'card_expense') {
      const d = new Date(tx.date + 'T12:00:00');
      const dayLabel = dayNames[d.getDay()];
      if (dayTotals[dayLabel]) {
        if (tx.type === 'cash_expense') {
          dayTotals[dayLabel].cash += tx.amount;
        } else {
          dayTotals[dayLabel].card += tx.amount;
        }
        dayTotals[dayLabel].total += tx.amount;
      }
    }
  });

  const trendItems: DailyTrendItem[] = templateDays.map((day) => ({
    dayLabel: day,
    dateStr: '',
    cashAmount: dayTotals[day].cash,
    cardAmount: dayTotals[day].card,
    totalAmount: dayTotals[day].total,
  }));

  const flatTotals: { [key: string]: number } = {};
  templateDays.forEach((d) => {
    flatTotals[d] = dayTotals[d].total;
  });

  return { trendItems, dayTotals: flatTotals };
};
