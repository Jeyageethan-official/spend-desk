import { Transaction, GoogleSheetMeta, BudgetConfig, LendItem } from '../types/finance';

const TX_STORAGE_KEY = 'money_tracker_transactions_v2';
const DELETED_TX_IDS_KEY = 'spenddesk_deleted_tx_ids_v1';
const LAST_USER_EMAIL_KEY = 'spenddesk_last_user_email_v1';
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
  const cleanEmail = email && email !== 'guest' ? email.trim().toLowerCase() : null;
  if (!cleanEmail) {
    return { name: 'My Wallet', avatar: null, email: '' };
  }
  try {
    const nameKey = getScopedKey(PROFILE_NAME_KEY, cleanEmail);
    const avatarKey = getScopedKey(CUSTOM_AVATAR_KEY, cleanEmail);
    const emailKey = getScopedKey(PROFILE_EMAIL_KEY, cleanEmail);

    let name = localStorage.getItem(nameKey);
    if (!name || name === 'Jeyaram Tech' || name === 'My Wallet') {
      name = cleanEmail.split('@')[0];
    }
    const avatar = localStorage.getItem(avatarKey);
    const storedEmail = localStorage.getItem(emailKey) || cleanEmail;
    return { name, avatar, email: storedEmail };
  } catch {
    return { name: cleanEmail.split('@')[0], avatar: null, email: cleanEmail };
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
  dailyBalanceReset: true,
  smsAlertNumber: '',
};

export const INITIAL_SAMPLE_TRANSACTIONS: Transaction[] = [];

const SHEET_TX_STORAGE_KEY = 'spenddesk_sheet_txs_v1';
const SHEET_LEND_STORAGE_KEY = 'spenddesk_sheet_lends_v1';

export const saveSheetTransactions = (sheetId: string, transactions: Transaction[]) => {
  try {
    if (!sheetId) return;
    localStorage.setItem(`${SHEET_TX_STORAGE_KEY}_${sheetId}`, JSON.stringify(transactions));
  } catch (e) {
    console.error('Failed to save sheet transactions:', e);
  }
};

export const loadSheetTransactions = (sheetId: string): Transaction[] | null => {
  try {
    if (!sheetId) return null;
    const raw = localStorage.getItem(`${SHEET_TX_STORAGE_KEY}_${sheetId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to load sheet transactions:', e);
  }
  return null;
};

export const saveSheetLendItems = (sheetId: string, items: LendItem[]) => {
  try {
    if (!sheetId) return;
    localStorage.setItem(`${SHEET_LEND_STORAGE_KEY}_${sheetId}`, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save sheet lend items:', e);
  }
};

export const loadSheetLendItems = (sheetId: string): LendItem[] | null => {
  try {
    if (!sheetId) return null;
    const raw = localStorage.getItem(`${SHEET_LEND_STORAGE_KEY}_${sheetId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to load sheet lend items:', e);
  }
  return null;
};

export const clearSheetCache = (sheetId: string) => {
  try {
    if (!sheetId) return;
    localStorage.removeItem(`${SHEET_TX_STORAGE_KEY}_${sheetId}`);
    localStorage.removeItem(`${SHEET_LEND_STORAGE_KEY}_${sheetId}`);
  } catch (e) {}
};

export const loadStoredTransactions = (email?: string | null): Transaction[] => {
  try {
    const key = getScopedKey(TX_STORAGE_KEY, email);
    const raw = localStorage.getItem(key);
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
    const serialized = JSON.stringify(transactions);
    localStorage.setItem(key, serialized);
  } catch (e) {
    console.error('Failed to store transactions:', e);
  }
};

export const saveLastUserEmail = (email?: string | null) => {
  try {
    if (email && email.trim() && email !== 'guest') {
      localStorage.setItem(LAST_USER_EMAIL_KEY, email.trim().toLowerCase());
    }
  } catch {}
};

export const loadLastUserEmail = (): string | null => {
  try {
    const email = localStorage.getItem(LAST_USER_EMAIL_KEY);
    return email && email.trim() ? email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
};

export const loadDeletedTxIds = (email?: string | null): Set<string> => {
  try {
    const key = getScopedKey(DELETED_TX_IDS_KEY, email);
    const raw = localStorage.getItem(key);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {}
  return new Set();
};

export const markTxIdDeleted = (id: string, email?: string | null) => {
  if (!id) return;
  try {
    const key = getScopedKey(DELETED_TX_IDS_KEY, email);
    const set = loadDeletedTxIds(email);
    set.add(id);
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {}
};

export const markTxIdsDeleted = (ids: string[], email?: string | null) => {
  if (!ids || ids.length === 0) return;
  try {
    const key = getScopedKey(DELETED_TX_IDS_KEY, email);
    const set = loadDeletedTxIds(email);
    ids.forEach((id) => set.add(id));
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {}
};

export const unmarkTxIdDeleted = (id: string, email?: string | null) => {
  if (!id) return;
  try {
    const key = getScopedKey(DELETED_TX_IDS_KEY, email);
    const set = loadDeletedTxIds(email);
    if (set.has(id)) {
      set.delete(id);
      localStorage.setItem(key, JSON.stringify(Array.from(set)));
    }
  } catch {}
};

export const loadStoredLendItems = (email?: string | null): LendItem[] => {
  try {
    const key = getScopedKey(LEND_STORAGE_KEY, email);
    const raw = localStorage.getItem(key);
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
    const serialized = JSON.stringify(items);
    localStorage.setItem(key, serialized);
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
    const key = getScopedKey(TELEGRAM_ALERT_KEY, email);
    const raw = localStorage.getItem(key);
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
    const key = getScopedKey(TELEGRAM_ALERT_KEY, email);
    const data = JSON.stringify({ enabled: Boolean(config.enabled), chatId: config.chatId.trim() });
    localStorage.setItem(key, data);
  } catch (e) {
    console.error('Failed to save Telegram alert settings:', e);
  }
};

export const loadStoredSheetMeta = (email?: string | null): GoogleSheetMeta | null => {
  try {
    const key = getScopedKey(SHEET_META_KEY, email);
    const raw = localStorage.getItem(key);
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
      const serialized = JSON.stringify(meta);
      localStorage.setItem(key, serialized);
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
  if (!userEmail) return { txCount: 0, lendCount: 0, mergedTxs: [], mergedLends: [] };
  try {
    const guestTxs = loadStoredTransactions('guest');
    const guestLends = loadStoredLendItems('guest');
    const userTxs = loadStoredTransactions(userEmail);
    const userLends = loadStoredLendItems(userEmail);

    if (guestTxs.length === 0 && guestLends.length === 0) {
      return { txCount: userTxs.length, lendCount: userLends.length, mergedTxs: userTxs, mergedLends: userLends };
    }

    // Merge non-duplicate transactions
    const existingTxIds = new Set(userTxs.map((t) => t.id));
    const newTxs = guestTxs.filter((t) => !existingTxIds.has(t.id));
    const mergedTxs = [...userTxs, ...newTxs];

    // Merge non-duplicate lend items
    const existingLendIds = new Set(userLends.map((l) => l.id));
    const newLends = guestLends.filter((l) => !existingLendIds.has(l.id));
    const mergedLends = [...userLends, ...newLends];

    saveStoredTransactions(mergedTxs, userEmail);
    saveStoredLendItems(mergedLends, userEmail);

    // Clear guest storage after successful migration so it doesn't duplicate on future logins
    saveStoredTransactions([], 'guest');
    saveStoredLendItems([], 'guest');

    return { txCount: mergedTxs.length, lendCount: mergedLends.length, mergedTxs, mergedLends };
  } catch (e) {
    console.error('Failed to merge guest data into user:', e);
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

// Known Google Spreadsheets Registry (Strictly isolated per account)
const KNOWN_SPREADSHEETS_KEY = 'spenddesk_known_spreadsheets_v2';
try {
  localStorage.removeItem(KNOWN_SPREADSHEETS_KEY);
} catch {}

export interface KnownSpreadsheetItem {
  id: string;
  name: string;
  url?: string;
  modifiedTime?: string;
  createdAt: number;
}

export const loadKnownSpreadsheets = (email?: string | null): KnownSpreadsheetItem[] => {
  try {
    const key = getScopedKey(KNOWN_SPREADSHEETS_KEY, email);
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveKnownSpreadsheet = (
  sheet: { id: string; name: string; url?: string; modifiedTime?: string },
  email?: string | null
) => {
  if (!sheet?.id) return;
  try {
    const key = getScopedKey(KNOWN_SPREADSHEETS_KEY, email);
    const existing = loadKnownSpreadsheets(email);
    const updated: KnownSpreadsheetItem[] = [
      {
        id: sheet.id,
        name: sheet.name || 'SpendDesk Spreadsheet',
        url: sheet.url || `https://docs.google.com/spreadsheets/d/${sheet.id}/edit`,
        modifiedTime: sheet.modifiedTime || new Date().toISOString(),
        createdAt: Date.now(),
      },
      ...existing.filter((s) => s.id !== sheet.id),
    ];
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {
    console.warn('Could not save known spreadsheet:', e);
  }
};

export const removeKnownSpreadsheet = (sheetId: string, email?: string | null) => {
  if (!sheetId) return;
  try {
    const key = getScopedKey(KNOWN_SPREADSHEETS_KEY, email);
    const existing = loadKnownSpreadsheets(email);
    const updated = existing.filter((s) => s.id !== sheetId);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {
    console.warn('Could not remove known spreadsheet:', e);
  }
};

