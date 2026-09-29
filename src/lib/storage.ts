import { Transaction, GoogleSheetMeta, BudgetConfig, LendItem } from '../types/finance';

const TX_STORAGE_KEY = 'money_tracker_transactions_v2';
const SHEET_META_KEY = 'money_tracker_active_sheet_v2';
const BUDGET_CONFIG_KEY = 'money_tracker_budget_config_v2';
const WEBHOOK_URL_KEY = 'money_tracker_webhook_url_v2';
const LEND_STORAGE_KEY = 'money_tracker_lend_items_v2';
const ALERT_PHONE_KEY = 'money_tracker_alert_phone_v2';
const TELEGRAM_ALERT_KEY = 'money_tracker_telegram_alert_v1';
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

const getScopedKey = (baseKey: string, email?: string | null): string => {
  if (!email || !email.trim()) return `${baseKey}_guest`;
  return `${baseKey}_${email.trim().toLowerCase()}`;
};

export const loadStoredProfile = (email?: string | null): UserProfile => {
  try {
    const nameKey = getScopedKey(PROFILE_NAME_KEY, email);
    const avatarKey = getScopedKey(CUSTOM_AVATAR_KEY, email);
    const emailKey = getScopedKey(PROFILE_EMAIL_KEY, email);

    let name = localStorage.getItem(nameKey);
    if (!name || name === 'Jeyaram Tech') {
      name = email ? email.split('@')[0] : 'My Wallet';
    }
    const avatar = localStorage.getItem(avatarKey);
    const storedEmail = localStorage.getItem(emailKey) || email || '';
    return { name, avatar, email: storedEmail };
  } catch {
    return { name: email ? email.split('@')[0] : 'My Wallet', avatar: null, email: email || '' };
  }
};

export const saveStoredProfile = (profile: Partial<UserProfile>, email?: string | null) => {
  try {
    const userEmail = email || profile.email || null;
    const nameKey = getScopedKey(PROFILE_NAME_KEY, userEmail);
    const avatarKey = getScopedKey(CUSTOM_AVATAR_KEY, userEmail);
    const emailKey = getScopedKey(PROFILE_EMAIL_KEY, userEmail);

    if (profile.name !== undefined) localStorage.setItem(nameKey, profile.name);
    if (profile.avatar !== undefined) {
      if (profile.avatar) {
        localStorage.setItem(avatarKey, profile.avatar);
      } else {
        localStorage.removeItem(avatarKey);
      }
    }
    if (profile.email !== undefined) localStorage.setItem(emailKey, profile.email);
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

export const loadStoredCategoryDefs = (email?: string | null): CategoryDef[] => {
  try {
    const key = getScopedKey(UNIFIED_CATEGORIES_KEY, email);
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }

    // Migration from legacy custom categories if exists
    const legacyRaw = !email || !email.trim() ? localStorage.getItem(CUSTOM_CATEGORIES_KEY) : null;
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

    localStorage.setItem(key, JSON.stringify(initial));
    return initial;
  } catch (e) {
    console.error('Failed to load category definitions:', e);
    return DEFAULT_INITIAL_CATEGORIES;
  }
};

export const saveStoredCategoryDefs = (categories: CategoryDef[], email?: string | null) => {
  try {
    const key = getScopedKey(UNIFIED_CATEGORIES_KEY, email);
    localStorage.setItem(key, JSON.stringify(categories));
  } catch (e) {
    console.error('Failed to save category definitions:', e);
  }
};

export const resetToDefaultCategoryDefs = (email?: string | null): CategoryDef[] => {
  try {
    const key = getScopedKey(UNIFIED_CATEGORIES_KEY, email);
    localStorage.setItem(key, JSON.stringify(DEFAULT_INITIAL_CATEGORIES));
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

export const loadStoredTransactions = (email?: string | null): Transaction[] => {
  try {
    const key = getScopedKey(TX_STORAGE_KEY, email);
    let raw = localStorage.getItem(key);
    if (!raw && (!email || !email.trim())) {
      raw = localStorage.getItem(TX_STORAGE_KEY);
    }
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

export const saveStoredTransactions = (transactions: Transaction[], email?: string | null) => {
  try {
    const key = getScopedKey(TX_STORAGE_KEY, email);
    localStorage.setItem(key, JSON.stringify(transactions));
  } catch (e) {
    console.error('Failed to store transactions:', e);
  }
};

export const loadStoredLendItems = (email?: string | null): LendItem[] => {
  try {
    const key = getScopedKey(LEND_STORAGE_KEY, email);
    let raw = localStorage.getItem(key);
    if (!raw && (!email || !email.trim())) {
      raw = localStorage.getItem(LEND_STORAGE_KEY);
    }
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

export const saveStoredLendItems = (items: LendItem[], email?: string | null) => {
  try {
    const key = getScopedKey(LEND_STORAGE_KEY, email);
    localStorage.setItem(key, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save lend items:', e);
  }
};

export const loadStoredAlertPhone = (email?: string | null): string => {
  try {
    return localStorage.getItem(getScopedKey(ALERT_PHONE_KEY, email)) || '';
  } catch (e) {
    return '';
  }
};

export const saveStoredAlertPhone = (phone: string, email?: string | null) => {
  try {
    localStorage.setItem(getScopedKey(ALERT_PHONE_KEY, email), phone);
  } catch (e) {
    console.error('Failed to save alert phone:', e);
  }
};

export interface TelegramAlertConfig {
  enabled: boolean;
  chatId: string;
}

const DEFAULT_TELEGRAM_ALERT_CONFIG: TelegramAlertConfig = {
  enabled: false,
  chatId: '',
};

export const loadStoredTelegramAlertConfig = (email?: string | null): TelegramAlertConfig => {
  try {
    const raw = localStorage.getItem(getScopedKey(TELEGRAM_ALERT_KEY, email));
    if (!raw) return DEFAULT_TELEGRAM_ALERT_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed?.enabled),
      chatId: typeof parsed?.chatId === 'string' ? parsed.chatId.trim() : '',
    };
  } catch {
    return DEFAULT_TELEGRAM_ALERT_CONFIG;
  }
};

export const saveStoredTelegramAlertConfig = (config: TelegramAlertConfig, email?: string | null) => {
  try {
    localStorage.setItem(
      getScopedKey(TELEGRAM_ALERT_KEY, email),
      JSON.stringify({ enabled: Boolean(config.enabled), chatId: config.chatId.trim() })
    );
  } catch (e) {
    console.error('Failed to save Telegram alert settings:', e);
  }
};

export const loadStoredSheetMeta = (email?: string | null): GoogleSheetMeta | null => {
  try {
    const key = getScopedKey(SHEET_META_KEY, email);
    let raw = localStorage.getItem(key);
    if (!raw && (!email || !email.trim())) {
      raw = localStorage.getItem(SHEET_META_KEY);
    }
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse sheet meta:', e);
  }
  return null;
};

export const saveStoredSheetMeta = (meta: GoogleSheetMeta | null, email?: string | null) => {
  try {
    const key = getScopedKey(SHEET_META_KEY, email);
    if (meta) {
      localStorage.setItem(key, JSON.stringify(meta));
    } else {
      localStorage.removeItem(key);
    }
  } catch (e) {
    console.error('Failed to save sheet meta:', e);
  }
};

export const mergeGuestDataIntoUser = (
  userEmail: string
): { txCount: number; lendCount: number; mergedTxs: Transaction[]; mergedLends: LendItem[] } => {
  try {
    if (!userEmail || !userEmail.trim()) {
      return { txCount: 0, lendCount: 0, mergedTxs: [], mergedLends: [] };
    }

    // Only merge unassigned guest & legacy root data created while signed out
    const guestTxs = loadStoredTransactions('guest');
    const legacyTxs = loadStoredTransactions(null);
    const offlineTxsToMerge = [...guestTxs, ...legacyTxs];

    const guestLends = loadStoredLendItems('guest');
    const legacyLends = loadStoredLendItems(null);
    const offlineLendsToMerge = [...guestLends, ...legacyLends];

    const existingUserTxs = loadStoredTransactions(userEmail);
    const existingUserLends = loadStoredLendItems(userEmail);

    const txMap = new Map<string, Transaction>();
    existingUserTxs.forEach(t => { if (t && t.id) txMap.set(t.id, t); });
    let newTxCount = 0;
    offlineTxsToMerge.forEach(t => {
      if (t && t.id && !txMap.has(t.id)) {
        txMap.set(t.id, t);
        newTxCount++;
      }
    });
    const finalMergedTxs = Array.from(txMap.values());

    const lendMap = new Map<string, LendItem>();
    existingUserLends.forEach(l => { if (l && l.id) lendMap.set(l.id, l); });
    let newLendCount = 0;
    offlineLendsToMerge.forEach(l => {
      if (l && l.id && !lendMap.has(l.id)) {
        lendMap.set(l.id, l);
        newLendCount++;
      }
    });
    const finalMergedLends = Array.from(lendMap.values());

    saveStoredTransactions(finalMergedTxs, userEmail);
    saveStoredLendItems(finalMergedLends, userEmail);

    // Clear guest and root legacy keys after successful merge so next user doesn't get old guest data
    try {
      saveStoredTransactions([], 'guest');
      saveStoredLendItems([], 'guest');
      localStorage.removeItem(TX_STORAGE_KEY);
      localStorage.removeItem(LEND_STORAGE_KEY);
    } catch (e) {}

    return {
      txCount: newTxCount,
      lendCount: newLendCount,
      mergedTxs: finalMergedTxs,
      mergedLends: finalMergedLends
    };
  } catch (e) {
    console.error('Failed to merge guest data into user storage:', e);
    return { txCount: 0, lendCount: 0, mergedTxs: [], mergedLends: [] };
  }
};

export const loadStoredBudgetConfig = (email?: string | null): BudgetConfig => {
  try {
    const key = getScopedKey(BUDGET_CONFIG_KEY, email);
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse budget config:', e);
  }
  return DEFAULT_BUDGET_CONFIG;
};

export const saveStoredBudgetConfig = (config: BudgetConfig, email?: string | null) => {
  try {
    const key = getScopedKey(BUDGET_CONFIG_KEY, email);
    localStorage.setItem(key, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save budget config:', e);
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

export const exportFullBackupJson = (email?: string | null): string => {
  const data: FullAppDataBackup = {
    version: '3.0.0',
    exportedAt: new Date().toISOString(),
    transactions: loadStoredTransactions(email),
    lendItems: loadStoredLendItems(email),
    categories: loadStoredCategoryDefs(email),
    budgetConfig: loadStoredBudgetConfig(email),
    alertPhone: loadStoredAlertPhone(email),
  };
  return JSON.stringify(data, null, 2);
};

export const importFullBackupJson = (jsonString: string, email?: string | null): { success: boolean; message: string; count?: number } => {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') {
      return { success: false, message: 'Invalid JSON format.' };
    }
    if (Array.isArray(data.transactions)) {
      saveStoredTransactions(data.transactions, email);
    }
    if (Array.isArray(data.lendItems)) {
      saveStoredLendItems(data.lendItems, email);
    }
    if (Array.isArray(data.categories) && data.categories.length > 0) {
      saveStoredCategoryDefs(data.categories, email);
    }
    if (data.budgetConfig && typeof data.budgetConfig === 'object') {
      saveStoredBudgetConfig(data.budgetConfig, email);
    }
    if (typeof data.alertPhone === 'string') {
      saveStoredAlertPhone(data.alertPhone, email);
    }
    const txCount = Array.isArray(data.transactions) ? data.transactions.length : 0;
    return { success: true, message: `Successfully restored ${txCount} transactions and system settings.`, count: txCount };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to parse backup JSON.' };
  }
};
