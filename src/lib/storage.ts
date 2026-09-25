import { Transaction, GoogleSheetMeta, BudgetConfig, LendItem } from '../types/finance';

const TX_STORAGE_KEY = 'money_tracker_transactions_v2';
const SHEET_META_KEY = 'money_tracker_active_sheet_v2';
const BUDGET_CONFIG_KEY = 'money_tracker_budget_config_v2';
const WEBHOOK_URL_KEY = 'money_tracker_webhook_url_v2';
const LEND_STORAGE_KEY = 'money_tracker_lend_items_v2';
const ALERT_PHONE_KEY = 'money_tracker_alert_phone_v2';
const CUSTOM_CATEGORIES_KEY = 'money_tracker_custom_categories_v2';

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
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => {
          if (typeof item === 'string') {
            return { name: item, iconName: 'Tag' };
          }
          return { name: item.name || 'Custom', iconName: item.iconName || 'Tag' };
        });
      }
    }
  } catch (e) {
    console.error('Failed to parse custom categories:', e);
  }
  return [];
};

export const saveStoredCustomCategoryDefs = (categories: CustomCategoryDef[]) => {
  try {
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(categories));
  } catch (e) {
    console.error('Failed to save custom categories:', e);
  }
};

export const loadStoredCustomCategories = (): string[] => {
  return loadStoredCustomCategoryDefs().map((c) => c.name);
};

export const saveStoredCustomCategories = (categories: string[]) => {
  const currentDefs = loadStoredCustomCategoryDefs();
  const defMap = new Map(currentDefs.map(d => [d.name.toLowerCase(), d.iconName]));
  const updatedDefs: CustomCategoryDef[] = categories.map(name => ({
    name,
    iconName: defMap.get(name.toLowerCase()) || 'Tag'
  }));
  saveStoredCustomCategoryDefs(updatedDefs);
};
