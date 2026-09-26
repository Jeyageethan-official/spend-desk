import { Transaction, GoogleSheetMeta, BudgetConfig, LendItem } from '../types/finance';

const TX_STORAGE_KEY = 'money_tracker_transactions_v2';
const SHEET_META_KEY = 'money_tracker_active_sheet_v2';
const BUDGET_CONFIG_KEY = 'money_tracker_budget_config_v2';
const WEBHOOK_URL_KEY = 'money_tracker_webhook_url_v2';
const LEND_STORAGE_KEY = 'money_tracker_lend_items_v2';
const ALERT_PHONE_KEY = 'money_tracker_alert_phone_v2';
const CUSTOM_CATEGORIES_KEY = 'money_tracker_custom_categories_v2';
const UNIFIED_CATEGORIES_KEY = 'money_tracker_unified_categories_v3';
const PROFILE_NAME_KEY = 'money_tracker_profile_name';
const CUSTOM_AVATAR_KEY = 'money_tracker_custom_avatar';
const PROFILE_EMAIL_KEY = 'money_tracker_profile_email';

export interface UserProfile {
  name: string;
  email: string;
  avatar: string | null;
}

export const loadStoredProfile = (): UserProfile => {
  try {
    let name = localStorage.getItem(PROFILE_NAME_KEY);
    if (!name || name === 'Jeyaram Tech') {
      name = 'My Wallet';
    }
    const avatar = localStorage.getItem(CUSTOM_AVATAR_KEY) || null;
    let email = localStorage.getItem(PROFILE_EMAIL_KEY);
    if (!email || email === 'jeyaramantech05@gmail.com') {
      email = '';
    }
    return { name, avatar, email };
  } catch {
    return { name: 'My Wallet', avatar: null, email: '' };
  }
};

export const saveStoredProfile = (profile: Partial<UserProfile>) => {
  try {
    if (profile.name !== undefined) localStorage.setItem(PROFILE_NAME_KEY, profile.name);
    if (profile.avatar !== undefined) {
      if (profile.avatar) {
        localStorage.setItem(CUSTOM_AVATAR_KEY, profile.avatar);
      } else {
        localStorage.removeItem(CUSTOM_AVATAR_KEY);
      }
    }
    if (profile.email !== undefined) localStorage.setItem(PROFILE_EMAIL_KEY, profile.email);
  } catch (e) {
    console.error('Failed to save profile to storage', e);
  }
};

export interface CategoryDef {
  id: string;
  name: string;
  iconName: string;
  color?: string;
}

export const DEFAULT_INITIAL_CATEGORIES: CategoryDef[] = [
  { id: 'cat-food', name: 'Food', iconName: 'Utensils', color: '#ea580c' },
  { id: 'cat-transport', name: 'Transport', iconName: 'Car', color: '#0284c7' },
  { id: 'cat-shopping', name: 'Shopping', iconName: 'ShoppingBag', color: '#6366f1' },
  { id: 'cat-bills', name: 'Bills', iconName: 'Zap', color: '#d97706' },
  { id: 'cat-entertainment', name: 'Entertainment', iconName: 'Film', color: '#7c3aed' },
  { id: 'cat-education', name: 'Education', iconName: 'GraduationCap', color: '#0d9488' },
  { id: 'cat-health', name: 'Healthcare', iconName: 'HeartPulse', color: '#0284c7' },
  { id: 'cat-groceries', name: 'Groceries', iconName: 'Apple', color: '#16a34a' },
  { id: 'cat-other', name: 'Other', iconName: 'MoreHorizontal', color: '#64748b' },
];

export const loadStoredCategoryDefs = (): CategoryDef[] => {
  try {
    const raw = localStorage.getItem(UNIFIED_CATEGORIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }

    // Migration from legacy custom categories if exists
    const legacyRaw = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    const legacyDefs: CategoryDef[] = [];
    if (legacyRaw) {
      const parsedLegacy = JSON.parse(legacyRaw);
      if (Array.isArray(parsedLegacy)) {
        parsedLegacy.forEach((item, idx) => {
          if (typeof item === 'string') {
            legacyDefs.push({ id: `legacy-${idx}`, name: item, iconName: 'Tag' });
          } else if (item && item.name) {
            legacyDefs.push({ id: `legacy-${idx}`, name: item.name, iconName: item.iconName || 'Tag' });
          }
        });
      }
    }

    // Merge default categories + legacy custom
    const initial = [...DEFAULT_INITIAL_CATEGORIES];
    legacyDefs.forEach((leg) => {
      if (!initial.some((c) => c.name.toLowerCase() === leg.name.toLowerCase())) {
        initial.push(leg);
      }
    });

    localStorage.setItem(UNIFIED_CATEGORIES_KEY, JSON.stringify(initial));
    return initial;
  } catch (e) {
    console.error('Failed to load category definitions:', e);
    return DEFAULT_INITIAL_CATEGORIES;
  }
};

export const saveStoredCategoryDefs = (categories: CategoryDef[]) => {
  try {
    localStorage.setItem(UNIFIED_CATEGORIES_KEY, JSON.stringify(categories));
    // Keep custom categories in sync for backwards compatibility
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(categories));
  } catch (e) {
    console.error('Failed to save category definitions:', e);
  }
};

export const resetToDefaultCategoryDefs = (): CategoryDef[] => {
  try {
    localStorage.setItem(UNIFIED_CATEGORIES_KEY, JSON.stringify(DEFAULT_INITIAL_CATEGORIES));
  } catch (e) {
    console.error('Failed to reset categories:', e);
  }
  return DEFAULT_INITIAL_CATEGORIES;
};

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  monthlyBudget: 0,
  lowCashThreshold: 1000,
  dailySpendLimit: 0,
  notifyOnLimit: true,
  smsAlertNumber: '',
};

export const INITIAL_SAMPLE_TRANSACTIONS: Transaction[] = [];

export const loadStoredTransactions = (): Transaction[] => {
  try {
    const raw = localStorage.getItem(TX_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to parse stored transactions:', e);
  }
  return [];
};

export const saveStoredTransactions = (transactions: Transaction[]) => {
  try {
    localStorage.setItem(TX_STORAGE_KEY, JSON.stringify(transactions));
  } catch (e) {
    console.error('Failed to store transactions:', e);
  }
};

export const loadStoredLendItems = (): LendItem[] => {
  try {
    const raw = localStorage.getItem(LEND_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to parse lend items:', e);
  }
  return [];
};

export const saveStoredLendItems = (items: LendItem[]) => {
  try {
    localStorage.setItem(LEND_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save lend items:', e);
  }
};

export const loadStoredAlertPhone = (): string => {
  try {
    return localStorage.getItem(ALERT_PHONE_KEY) || '';
  } catch (e) {
    return '';
  }
};

export const saveStoredAlertPhone = (phone: string) => {
  try {
    localStorage.setItem(ALERT_PHONE_KEY, phone);
  } catch (e) {
    console.error('Failed to save alert phone:', e);
  }
};

export const loadStoredSheetMeta = (): GoogleSheetMeta | null => {
  try {
    const raw = localStorage.getItem(SHEET_META_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse sheet meta:', e);
  }
  return null;
};

export const saveStoredSheetMeta = (meta: GoogleSheetMeta | null) => {
  try {
    if (meta) {
      localStorage.setItem(SHEET_META_KEY, JSON.stringify(meta));
    } else {
      localStorage.removeItem(SHEET_META_KEY);
    }
  } catch (e) {
    console.error('Failed to save sheet meta:', e);
  }
};

export const loadStoredWebhookUrl = (): string => {
  try {
    return localStorage.getItem(WEBHOOK_URL_KEY) || '';
  } catch (e) {
    return '';
  }
};

export const saveStoredWebhookUrl = (url: string) => {
  try {
    if (url) {
      localStorage.setItem(WEBHOOK_URL_KEY, url);
    } else {
      localStorage.removeItem(WEBHOOK_URL_KEY);
    }
  } catch (e) {
    console.error('Failed to save webhook URL:', e);
  }
};

export const loadStoredBudgetConfig = (): BudgetConfig => {
  try {
    const raw = localStorage.getItem(BUDGET_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse budget config:', e);
  }
  return DEFAULT_BUDGET_CONFIG;
};

export const saveStoredBudgetConfig = (config: BudgetConfig) => {
  try {
    localStorage.setItem(BUDGET_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save budget config:', e);
  }
};

export interface CustomCategoryDef {
  name: string;
  iconName: string;
}

export const loadStoredCustomCategoryDefs = (): CustomCategoryDef[] => {
  return loadStoredCategoryDefs().map((c) => ({
    name: c.name,
    iconName: c.iconName,
  }));
};

export const saveStoredCustomCategoryDefs = (categories: CustomCategoryDef[]) => {
  const current = loadStoredCategoryDefs();
  const currentMap = new Map(current.map(c => [c.name.toLowerCase(), c]));
  const updated: CategoryDef[] = categories.map((cat, idx) => {
    const existing = currentMap.get(cat.name.toLowerCase());
    return {
      id: existing?.id || `cat-custom-${Date.now()}-${idx}`,
      name: cat.name,
      iconName: cat.iconName || 'Tag',
      color: existing?.color || '#0ea5e9'
    };
  });
  saveStoredCategoryDefs(updated);
};

export const loadStoredCustomCategories = (): string[] => {
  return loadStoredCategoryDefs().map((c) => c.name);
};

export const saveStoredCustomCategories = (categoryNames: string[]) => {
  const current = loadStoredCategoryDefs();
  const defMap = new Map(current.map(d => [d.name.toLowerCase(), d]));
  const updated: CategoryDef[] = categoryNames.map((name, idx) => {
    const existing = defMap.get(name.toLowerCase());
    return {
      id: existing?.id || `cat-${Date.now()}-${idx}`,
      name,
      iconName: existing?.iconName || 'Tag',
      color: existing?.color || '#0ea5e9'
    };
  });
  saveStoredCategoryDefs(updated);
};

// Full Application JSON Backup & Restore Helpers
export interface FullAppDataBackup {
  version: string;
  exportedAt: string;
  transactions: Transaction[];
  lendItems: LendItem[];
  categories: CategoryDef[];
  budgetConfig: BudgetConfig;
  alertPhone: string;
}

export const exportFullBackupJson = (): string => {
  const data: FullAppDataBackup = {
    version: '3.0.0',
    exportedAt: new Date().toISOString(),
    transactions: loadStoredTransactions(),
    lendItems: loadStoredLendItems(),
    categories: loadStoredCategoryDefs(),
    budgetConfig: loadStoredBudgetConfig(),
    alertPhone: loadStoredAlertPhone(),
  };
  return JSON.stringify(data, null, 2);
};

export const importFullBackupJson = (jsonString: string): { success: boolean; message: string; count?: number } => {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') {
      return { success: false, message: 'Invalid JSON format.' };
    }
    if (Array.isArray(data.transactions)) {
      saveStoredTransactions(data.transactions);
    }
    if (Array.isArray(data.lendItems)) {
      saveStoredLendItems(data.lendItems);
    }
    if (Array.isArray(data.categories) && data.categories.length > 0) {
      saveStoredCategoryDefs(data.categories);
    }
    if (data.budgetConfig && typeof data.budgetConfig === 'object') {
      saveStoredBudgetConfig(data.budgetConfig);
    }
    if (typeof data.alertPhone === 'string') {
      saveStoredAlertPhone(data.alertPhone);
    }
    const txCount = Array.isArray(data.transactions) ? data.transactions.length : 0;
    return { success: true, message: `Successfully restored ${txCount} transactions and system settings.`, count: txCount };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to parse backup JSON.' };
  }
};
