import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft,
  Tag, 
  Plus, 
  Edit3, 
  Trash2, 
  Search, 
  Download, 
  Upload,
  FileSpreadsheet, 
  Phone, 
  BellRing,
  Send,
  Loader2,
  Info, 
  Sliders, 
  Database,
  ExternalLink,
  DollarSign,
  AlertTriangle,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  HardDrive,
  Lock,
  CheckCircle2,
  X,
  Camera,
  User as UserIcon,
  Sparkles,
  FileText,
  Pencil,
  Wallet
} from 'lucide-react';
import { ICON_CATALOG, getCategoryIcon } from '../lib/icons';
import { 
  loadStoredCategoryDefs, 
  saveStoredCategoryDefs, 
  resetToDefaultCategoryDefs,
  CategoryDef,
  exportFullBackupJson,
  importFullBackupJson
} from '../lib/storage';
import { GoogleSheetMeta, BudgetConfig, Transaction, LendItem } from '../types/finance';
import { formatCurrency } from '../lib/calculations';
import { ConfirmModal } from './ConfirmModal';
import { UserProfile } from '../lib/storage';
import { TelegramAlertConfig } from '../lib/storage';
import {
  TelegramLinkStatus,
  createTelegramLink,
  getTelegramLinkStatus,
  setTelegramAlertsEnabled,
  sendTelegramTestAlert,
  disconnectTelegram,
} from '../lib/telegramConnect';
import { generateBankStatementPdf } from '../lib/statementPdf';
import { triggerFeedback } from '../lib/haptics';

interface IosSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

const IosSwitch: React.FC<IosSwitchProps> = ({ checked, onChange, disabled }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        triggerFeedback('tap');
        onChange(!checked);
      }}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 ${
        checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
};

interface SettingsViewProps {
  onBack: () => void;
  currency: string;
  onUpdateCurrency: (curr: string) => void;
  dailyRefresh?: boolean;
  onUpdateDailyRefresh?: (enabled: boolean) => void;
  budgetConfig: BudgetConfig;
  onUpdateBudgetConfig: (config: BudgetConfig) => void;
  alertPhone: string;
  onUpdateAlertPhone: (phone: string) => void;
  storageEmail?: string | null;
  telegramAlertConfig: TelegramAlertConfig;
  onUpdateTelegramAlertConfig: (config: TelegramAlertConfig) => void;
  onSendTelegramTest: (chatId: string) => Promise<void>;
  telegramLinkStatus?: TelegramLinkStatus | null;
  onRefreshTelegramLink?: () => Promise<unknown> | void;
  onCloudSyncRequested?: () => void;
  cloudWorkspaceRevision?: number;
  activeSheet: GoogleSheetMeta | null;
  onOpenSyncModal: () => void;
  onExportCSV: () => void;
  transactions: Transaction[];
  lendItems: LendItem[];
  user?: any;
  userProfile?: UserProfile;
  onUpdateProfile?: (updated: Partial<UserProfile>) => void;
  onUpdateCategories?: (cats: CategoryDef[]) => void;
  onResetAllData?: () => void;
  onRestoreTransactions?: (txs: Transaction[], lends?: LendItem[]) => void;
  initialSection?: 'main' | 'categories' | 'preferences' | 'budget' | 'cloud' | 'data' | 'about' | 'profile';
  onNotification?: (msg: string, type?: 'success' | 'info' | 'error') => void;
  totalCashBalance?: number;
}

const COMMON_CURRENCIES = [
  { code: 'Rs', label: 'Rs (Rupees - LKR/INR/PKR)', symbol: 'Rs' },
  { code: 'INR', label: '₹ (INR - Indian Rupee)', symbol: '₹' },
  { code: 'USD', label: '$ (USD - US Dollar)', symbol: '$' },
  { code: 'EUR', label: '€ (EUR - Euro)', symbol: '€' },
  { code: 'GBP', label: '£ (GBP - British Pound)', symbol: '£' },
  { code: 'AED', label: 'AED (UAE Dirham)', symbol: 'AED' },
  { code: 'SAR', label: 'SAR (Saudi Riyal)', symbol: 'SAR' },
  { code: 'QAR', label: 'QAR (Qatari Riyal)', symbol: 'QAR' },
  { code: 'KWD', label: 'KD (Kuwaiti Dinar)', symbol: 'KD' },
  { code: 'OMR', label: 'OMR (Omani Rial)', symbol: 'OMR' },
  { code: 'BHD', label: 'BHD (Bahraini Dinar)', symbol: 'BHD' },
  { code: 'SGD', label: 'S$ (SGD - Singapore Dollar)', symbol: 'S$' },
  { code: 'MYR', label: 'RM (MYR - Malaysian Ringgit)', symbol: 'RM' },
  { code: 'CAD', label: 'C$ (CAD - Canadian Dollar)', symbol: 'C$' },
  { code: 'AUD', label: 'A$ (AUD - Australian Dollar)', symbol: 'A$' },
  { code: 'NZD', label: 'NZ$ (New Zealand Dollar)', symbol: 'NZ$' },
  { code: 'JPY', label: '¥ (JPY - Japanese Yen)', symbol: '¥' },
  { code: 'CHF', label: 'CHF (Swiss Franc)', symbol: 'CHF' },
  { code: 'BDT', label: '৳ (BDT - Bangladeshi Taka)', symbol: '৳' },
  { code: 'PHP', label: '₱ (PHP - Philippine Peso)', symbol: '₱' },
  { code: 'THB', label: '฿ (THB - Thai Baht)', symbol: '฿' },
  { code: 'IDR', label: 'Rp (IDR - Indonesian Rupiah)', symbol: 'Rp' },
  { code: 'ZAR', label: 'R (ZAR - South African Rand)', symbol: 'R' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  onBack,
  currency,
  totalCashBalance = 0,
  onUpdateCurrency,
  dailyRefresh = true,
  onUpdateDailyRefresh,
  budgetConfig,
  onUpdateBudgetConfig,
  alertPhone,
  onUpdateAlertPhone,
  storageEmail,
  telegramAlertConfig,
  onUpdateTelegramAlertConfig,
  onSendTelegramTest,
  telegramLinkStatus,
  onRefreshTelegramLink,
  onCloudSyncRequested,
  cloudWorkspaceRevision = 0,
  activeSheet,
  onOpenSyncModal,
  onExportCSV,
  transactions,
  lendItems,
  user,
  userProfile,
  onUpdateProfile,
  onUpdateCategories,
  onResetAllData,
  onRestoreTransactions,
  initialSection = 'main',
  onNotification,
}) => {
  const workspaceEmail = storageEmail || user?.email || 'guest';
  // Navigation: 'main' is the WhatsApp-style Profile + options menu; clicking an option opens its sub-page
  const [currentSubPage, setCurrentSubPage] = useState<'main' | 'profile' | 'categories' | 'preferences' | 'budget' | 'alerts' | 'cloud' | 'data' | 'about'>(
    initialSection || 'main'
  );

  // Preserve scroll position of main settings list so back returns to exact location
  const mainScrollPosRef = useRef<number>(0);

  const handleOpenSubPage = (sub: typeof currentSubPage) => {
    mainScrollPosRef.current = window.scrollY || document.documentElement.scrollTop || 0;
    setCurrentSubPage(sub);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };

  const handleBackToMain = () => {
    setCurrentSubPage('main');
    requestAnimationFrame(() => {
      window.scrollTo({ top: mainScrollPosRef.current, left: 0, behavior: 'instant' });
    });
  };

  // If initialSection changes, update subpage
  useEffect(() => {
    if (initialSection) {
      if (initialSection !== 'main') {
        mainScrollPosRef.current = window.scrollY || 0;
        setCurrentSubPage(initialSection);
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      } else {
        setCurrentSubPage('main');
      }
    }
  }, [initialSection]);

  // Custom Profile Avatar state (synced with user, userProfile or localStorage)
  const [customAvatar, setCustomAvatar] = useState<string | null>(() => {
    return userProfile?.avatar || localStorage.getItem('money_tracker_custom_avatar') || user?.photoURL || null;
  });

  // Custom User Profile Name state
  const [profileName, setProfileName] = useState<string>(() => {
    const stored = userProfile?.name || localStorage.getItem('money_tracker_profile_name') || user?.displayName;
    return stored && stored.trim() !== '' ? stored : 'My Wallet';
  });

  // Profile Email state
  const [profileEmail, setProfileEmail] = useState<string>(() => {
    const stored = userProfile?.email || localStorage.getItem('money_tracker_profile_email') || user?.email;
    return stored || '';
  });

  // Edit Form State (for full dedicated profile page)
  const [editModalName, setEditModalName] = useState(profileName);
  const [editModalEmail, setEditModalEmail] = useState(profileEmail);
  const [editModalAvatar, setEditModalAvatar] = useState<string | null>(customAvatar);

  // Unsaved Changes Confirmation State
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<(() => void) | null>(null);

  // Keep in sync with user & userProfile prop changes
  useEffect(() => {
    const nextName = userProfile?.name || localStorage.getItem('money_tracker_profile_name') || user?.displayName || 'My Wallet';
    const nextAvatar = userProfile?.avatar || localStorage.getItem('money_tracker_custom_avatar') || user?.photoURL || null;
    const nextEmail = userProfile?.email || localStorage.getItem('money_tracker_profile_email') || user?.email || '';

    setProfileName(nextName);
    setEditModalName(nextName);
    setCustomAvatar(nextAvatar);
    setEditModalAvatar(nextAvatar);
    setProfileEmail(nextEmail);
    setEditModalEmail(nextEmail);
  }, [user, userProfile]);

  // Profile avatar file input ref
  const modalAvatarInputRef = useRef<HTMLInputElement>(null);

  // Handle Full Profile Save
  const handleSaveFullProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = editModalName.trim();
    if (!trimmedName) {
      onNotification?.('Please enter your name.', 'error');
      return;
    }
    const trimmedEmail = editModalEmail.trim();

    setProfileName(trimmedName);
    setProfileEmail(trimmedEmail);
    setCustomAvatar(editModalAvatar);

    onUpdateProfile?.({
      name: trimmedName,
      email: trimmedEmail,
      avatar: editModalAvatar,
    });

    try {
      localStorage.setItem('money_tracker_profile_name', trimmedName);
      localStorage.setItem('money_tracker_profile_email', trimmedEmail);
      if (editModalAvatar) {
        localStorage.setItem('money_tracker_custom_avatar', editModalAvatar);
      } else {
        localStorage.removeItem('money_tracker_custom_avatar');
      }
      onNotification?.('Profile updated successfully.', 'success');
    } catch (e) {
      console.error(e);
    }

    handleBackToMain();
  };

  const handleModalAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      onNotification?.('Image size should be less than 2MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setEditModalAvatar(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  // Unified Categories State (All categories are fully editable and removable!)
  const [categories, setCategories] = useState<CategoryDef[]>(() => loadStoredCategoryDefs(workspaceEmail));
  const [categorySearch, setCategorySearch] = useState('');

  // Category Add / Edit State
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDef | null>(null);
  const [formCatName, setFormCatName] = useState('');
  const [formCatIcon, setFormCatIcon] = useState('Tag');
  const [iconPickerFilter, setIconPickerFilter] = useState('all');
  const [iconPickerSearch, setIconPickerSearch] = useState('');

  // Delete Candidate Confirmation
  const [deleteCandidate, setDeleteCandidate] = useState<CategoryDef | null>(null);

  // Reset Categories Confirmation
  const [showResetCatConfirm, setShowResetCatConfirm] = useState(false);

  // Reset All App Data Confirmation
  const [showResetDataConfirm, setShowResetDataConfirm] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');

  // Budget State
  const [budgetForm, setBudgetForm] = useState<BudgetConfig>(budgetConfig);

  // Alert Phone State
  const [phoneInput, setPhoneInput] = useState(alertPhone);
  // Telegram deep-link connection state (chat IDs and tokens stay on the server)
  const [isConnectingTelegram, setIsConnectingTelegram] = useState(false);
  const [isWaitingForTelegram, setIsWaitingForTelegram] = useState(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [isTogglingTelegram, setIsTogglingTelegram] = useState(false);
  const [isDisconnectingTelegram, setIsDisconnectingTelegram] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const telegramConnected = Boolean(telegramLinkStatus?.connected);
  const telegramPending =
    isWaitingForTelegram || Boolean(telegramLinkStatus?.pending && !telegramConnected);

  // Mirror a pending server-side link request (e.g. page reopened mid-flow).
  useEffect(() => {
    if (telegramLinkStatus?.pending && !telegramConnected) setIsWaitingForTelegram(true);
    if (telegramConnected) setIsWaitingForTelegram(false);
  }, [telegramLinkStatus?.pending, telegramConnected]);

  // While waiting for the user to press Start in Telegram, poll the backend (no
  // page reloads) and flip to Connected automatically.
  useEffect(() => {
    if (!isWaitingForTelegram) return;
    let cancelled = false;
    let timeoutId: number | undefined;
    const startedAt = Date.now();
    const poll = async () => {
      try {
        const status = await getTelegramLinkStatus();
        if (cancelled) return;
        if (status.connected) {
          setIsWaitingForTelegram(false);
          onNotification?.('Telegram connected successfully.', 'success');
          void onRefreshTelegramLink?.();
          return;
        }
      } catch {
        /* keep polling until the deadline */
      }
      if (Date.now() - startedAt < 210000) {
        timeoutId = window.setTimeout(poll, 3500);
      } else if (!cancelled) {
        setIsWaitingForTelegram(false);
        onNotification?.('Still waiting — tap Connect Telegram to try again.', 'info');
      }
    };
    timeoutId = window.setTimeout(poll, 2500);
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWaitingForTelegram]);

  const handleConnectTelegram = async () => {
    if (isConnectingTelegram || telegramPending) return; // never mint duplicate tokens
    setIsConnectingTelegram(true);
    try {
      const ticket = await createTelegramLink();
      const opened = window.open(ticket.deepLink, '_blank', 'noopener,noreferrer');
      if (!opened) {
        onNotification?.('Pop-up blocked — allow pop-ups for this site, then tap Connect Telegram again.', 'error');
        return;
      }
      setIsWaitingForTelegram(true);
      onNotification?.('Waiting for you to press Start in Telegram…', 'info');
    } catch (error: any) {
      onNotification?.(error?.message || 'Could not start the Telegram connection. Try again.', 'error');
    } finally {
      setIsConnectingTelegram(false);
    }
  };

  const handleToggleTelegramAlerts = async (checked: boolean) => {
    if (!telegramConnected || isTogglingTelegram) return;
    setIsTogglingTelegram(true);
    try {
      await setTelegramAlertsEnabled(checked);
      await onRefreshTelegramLink?.();
      onNotification?.(checked ? 'Transaction alerts enabled.' : 'Transaction alerts paused.', 'success');
    } catch (error: any) {
      onNotification?.(error?.message || 'Could not save your alert preference.', 'error');
    } finally {
      setIsTogglingTelegram(false);
    }
  };

  const handleTestTelegramAlert = async () => {
    if (isTestingTelegram) return;
    setIsTestingTelegram(true);
    try {
      await sendTelegramTestAlert();
      onNotification?.('Test alert delivered to Telegram.', 'success');
    } catch (error: any) {
      onNotification?.(error?.message || 'Telegram test failed. Try reconnecting.', 'error');
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const handleDisconnectTelegram = async () => {
    setShowDisconnectConfirm(false);
    setIsDisconnectingTelegram(true);
    try {
      await disconnectTelegram();
      setIsWaitingForTelegram(false);
      await onRefreshTelegramLink?.();
      onNotification?.('Telegram disconnected. Your records and settings are untouched.', 'success');
    } catch (error: any) {
      onNotification?.(error?.message || 'Could not disconnect Telegram. Try again.', 'error');
    } finally {
      setIsDisconnectingTelegram(false);
    }
  };

  // When another signed-in device changes settings, refresh this page's local
  // form state too instead of waiting for the user to close and reopen it.
  useEffect(() => {
    setCategories(loadStoredCategoryDefs(workspaceEmail));
    setBudgetForm(budgetConfig);
    setPhoneInput(alertPhone);
  }, [cloudWorkspaceRevision, workspaceEmail, budgetConfig, currency, alertPhone]);

  // File Input Ref for JSON Restore
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate usage count and total amount per category
  const categoryStats = useMemo(() => {
    const stats: Record<string, { count: number; total: number }> = {};
    transactions.forEach((tx) => {
      if (!stats[tx.category]) {
        stats[tx.category] = { count: 0, total: 0 };
      }
      stats[tx.category].count += 1;
      stats[tx.category].total += tx.amount;
    });
    return stats;
  }, [transactions]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    const q = categorySearch.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, categorySearch]);

  // Filtered Icon Catalog for Icon Picker
  const filteredIcons = useMemo(() => {
    return ICON_CATALOG.filter((item) => {
      if (iconPickerFilter !== 'all' && item.category !== iconPickerFilter) return false;
      if (iconPickerSearch.trim()) {
        const q = iconPickerSearch.toLowerCase();
        return (
          item.label.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.keywords.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [iconPickerFilter, iconPickerSearch]);

  // Save new category
  const handleSaveNewCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = formCatName.trim();
    if (!trimmed) return;

    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      onNotification?.('A category with this name already exists.', 'error');
      return;
    }

    const newDef: CategoryDef = {
      id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: trimmed,
      iconName: formCatIcon || 'Tag',
      color: '#0ea5e9',
    };

    const updated = [...categories, newDef];
    setCategories(updated);
    saveStoredCategoryDefs(updated, workspaceEmail);
    onUpdateCategories?.(updated);
    onCloudSyncRequested?.();
    setFormCatName('');
    setFormCatIcon('Tag');
    setIsAddingCategory(false);
    onNotification?.(`Category "${trimmed}" created successfully.`, 'success');
  };

  // Save edited category
  const handleSaveEditedCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    const trimmed = formCatName.trim();
    if (!trimmed) return;

    if (categories.some((c) => c.id !== editingCategory.id && c.name.toLowerCase() === trimmed.toLowerCase())) {
      onNotification?.('Another category already uses this name.', 'error');
      return;
    }

    const updated = categories.map((c) => {
      if (c.id === editingCategory.id) {
        return {
          ...c,
          name: trimmed,
          iconName: formCatIcon || 'Tag',
        };
      }
      return c;
    });

    setCategories(updated);
    saveStoredCategoryDefs(updated, workspaceEmail);
    onUpdateCategories?.(updated);
    onCloudSyncRequested?.();
    setEditingCategory(null);
    setFormCatName('');
    onNotification?.(`Category updated to "${trimmed}".`, 'success');
  };

  // Delete category
  const handleConfirmDeleteCategory = () => {
    if (!deleteCandidate) return;
    const updated = categories.filter((c) => c.id !== deleteCandidate.id);
    setCategories(updated);
    saveStoredCategoryDefs(updated, workspaceEmail);
    onUpdateCategories?.(updated);
    onCloudSyncRequested?.();
    const candidateName = deleteCandidate.name;
    setDeleteCandidate(null);
    onNotification?.(`Category "${candidateName}" removed.`, 'info');
  };

  // Reset categories to standard preset
  const handleResetCategories = () => {
    const defaults = resetToDefaultCategoryDefs(workspaceEmail);
    setCategories(defaults);
    saveStoredCategoryDefs(defaults, workspaceEmail);
    onUpdateCategories?.(defaults);
    setShowResetCatConfirm(false);
    onCloudSyncRequested?.();
    onNotification?.('Categories restored to default standard set.', 'success');
  };

  // Save Currency
  const handleSaveCurrency = (newCurr: string) => {
    onUpdateCurrency(newCurr);
    onNotification?.(`Currency changed to ${newCurr}`, 'success');
  };

  // Save Budget & Financial Targets
  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateBudgetConfig(budgetForm);
    onNotification?.('Financial targets saved successfully.', 'success');
    handleBackToMain();
  };

  // Unsaved Changes Flags and Safe Navigation Logic
  const hasUnsavedProfile =
    currentSubPage === 'profile' &&
    (editModalName.trim() !== profileName.trim() ||
     editModalEmail.trim() !== profileEmail.trim() ||
     editModalAvatar !== customAvatar);

  const hasUnsavedBudget =
    currentSubPage === 'budget' &&
    (budgetForm.monthlyBudget !== (budgetConfig.monthlyBudget || 0) ||
     budgetForm.lowCashThreshold !== (budgetConfig.lowCashThreshold || 0) ||
     budgetForm.notifyOnLimit !== (budgetConfig.notifyOnLimit ?? true));

  const hasUnsavedCategory =
    currentSubPage === 'categories' &&
    (isAddingCategory || editingCategory !== null) &&
    formCatName.trim() !== '';

  const safeNavigateBack = (action: () => void) => {
    if (hasUnsavedProfile || hasUnsavedBudget || hasUnsavedCategory) {
      setPendingLeaveAction(() => action);
      setShowUnsavedConfirm(true);
    } else {
      action();
    }
  };

  const handleDiscardAndLeave = () => {
    if (hasUnsavedProfile) {
      setEditModalName(profileName);
      setEditModalEmail(profileEmail);
      setEditModalAvatar(customAvatar);
    }
    if (hasUnsavedBudget) {
      setBudgetForm({
        ...budgetConfig,
        monthlyBudget: budgetConfig.monthlyBudget || 0,
        lowCashThreshold: budgetConfig.lowCashThreshold || 0,
        notifyOnLimit: budgetConfig.notifyOnLimit ?? true,
      });
    }
    if (hasUnsavedCategory) {
      setIsAddingCategory(false);
      setEditingCategory(null);
      setFormCatName('');
    }
    setShowUnsavedConfirm(false);
    if (pendingLeaveAction) {
      pendingLeaveAction();
      setPendingLeaveAction(null);
    } else {
      handleBackToMain();
    }
  };

  const handleSaveAndLeave = (e: React.FormEvent) => {
    if (hasUnsavedProfile) {
      handleSaveFullProfile(e);
    } else if (hasUnsavedBudget) {
      handleSaveBudget(e);
    } else if (hasUnsavedCategory) {
      if (editingCategory) {
        handleSaveEditedCategory(e);
      } else {
        handleSaveNewCategory(e);
      }
    }
    setShowUnsavedConfirm(false);
    if (pendingLeaveAction) {
      pendingLeaveAction();
      setPendingLeaveAction(null);
    } else {
      handleBackToMain();
    }
  };

  // JSON Full Backup Download
  const handleDownloadBackup = () => {
    const jsonStr = exportFullBackupJson(workspaceEmail);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spenddesk_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotification?.('Full backup downloaded.', 'success');
  };

  // Export PDF Statement
  const handleExportPdfStatement = () => {
    generateBankStatementPdf(
      transactions,
      userProfile || { name: profileName, email: profileEmail, avatar: customAvatar || undefined },
      currency
    );
    onNotification?.('Opening printable bank statement...', 'info');
  };

  // JSON Restore
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;
      const res = importFullBackupJson(content, workspaceEmail);
      if (res.success) {
        setCategories(loadStoredCategoryDefs(workspaceEmail));
        onCloudSyncRequested?.();
        onRestoreTransactions?.(transactions, lendItems);
        onNotification?.(res.message, 'success');
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        onNotification?.(res.message, 'error');
      }
    };
    reader.readAsText(file);
  };

  // Reset All App Data Confirm
  const handleResetData = () => {
    if (resetConfirmInput.trim().toUpperCase() !== 'RESET') {
      onNotification?.('Please type RESET to confirm data deletion.', 'error');
      return;
    }
    onResetAllData?.();
    setShowResetDataConfirm(false);
    setResetConfirmInput('');
    onNotification?.('All transaction data has been permanently cleared.', 'info');
  };

  // Calculate local storage size in KB
  const storageUsageKb = useMemo(() => {
    try {
      let total = 0;
      for (const key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          total += (localStorage[key].length + key.length) * 2;
        }
      }
      return (total / 1024).toFixed(1);
    } catch {
      return '0';
    }
  }, [transactions, categories, lendItems]);

  const activeUserAvatar = customAvatar || userProfile?.avatar || user?.photoURL || null;
  const activeUserEmail = profileEmail || userProfile?.email || user?.email || '';
  const activeUserName = profileName || userProfile?.name || user?.displayName || 'My Wallet';

  return (
    <div className="min-h-screen bg-slate-50/80 dark:bg-slate-950 pb-20 transition-colors">
      {/* ============================================================== */}
      {/* 1. TOP MINIMALIST APP BAR (WhatsApp / iOS Style)               */}
      {/* ============================================================== */}
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-xs">
        <div className="max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => safeNavigateBack(currentSubPage === 'main' ? onBack : handleBackToMain)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all cursor-pointer border border-slate-200/90 dark:border-slate-700 shadow-2xs md:hidden"
            title="Back"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
          </button>

          <div className="flex items-center gap-2.5 min-w-0">
          {currentSubPage !== 'main' && (
            <button
              type="button"
              onClick={() => safeNavigateBack(handleBackToMain)}
              className="hidden md:flex items-center justify-center w-9 h-9 rounded-xl bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl border border-slate-200/70 dark:border-slate-700 shadow-xs text-slate-600 dark:text-slate-300 hover:text-emerald-700 hover:border-emerald-300 hover:bg-white/90 transition-all cursor-pointer active:scale-95 shrink-0"
              title="Back to Settings"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="min-w-0">
            <h1 className="text-sm font-bold text-slate-900 dark:text-white capitalize md:text-[15px] md:font-black md:tracking-tight">
            {currentSubPage === 'main' && 'Settings'}
            {currentSubPage === 'profile' && 'Edit Profile'}
            {currentSubPage === 'categories' && 'Manage Categories'}
            {currentSubPage === 'budget' && 'Financial Targets & Currency'}
            {currentSubPage === 'alerts' && 'Automatic Alerts'}
            {currentSubPage === 'cloud' && 'Google Sheets Manager'}
            {currentSubPage === 'data' && 'Data & Backups'}
            {currentSubPage === 'about' && 'About & Privacy'}
            </h1>
            {currentSubPage === 'main' && (
              <p className="hidden md:block text-[11px] md:text-xs text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5">
                Account, preferences &amp; workspace data
              </p>
            )}
          </div>
          </div>

          {/* Desktop actions: glass backup button (sub-pages) + cash chip */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50/90 border border-emerald-200/70" title="Current cash in hand">
              <Wallet className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[10px] font-black uppercase tracking-wide text-emerald-600 md:text-xs">Cash</span>
              <span className="text-xs font-black text-emerald-800 tabular-nums md:text-sm">{formatCurrency(totalCashBalance, currency)}</span>
            </div>

            <div className="w-9 lg:hidden" />
          </div>
        </div>
      </div>

      <div className="max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto px-4 pt-6 space-y-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSubPage}
            initial={{ opacity: 0, y: 8, scale: 0.995 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.995 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-6"
          >
            {/* ============================================================== */}
            {/* VIEW 0: MAIN SETTINGS PAGE (WhatsApp-style Hero Profile Card)  */}
            {/* ============================================================== */}
            {currentSubPage === 'main' && (
              <div className="grid grid-cols-1 gap-6">
                {/* Left Column on Desktop: Profile Card & Quick Info */}
                <div className="space-y-4">
                  {/* Profile overview */}
                  <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-xs relative group">
                    <button
                      type="button"
                      onClick={() => {
                        setEditModalName(activeUserName);
                        setEditModalEmail(activeUserEmail);
                        setEditModalAvatar(activeUserAvatar);
                        handleOpenSubPage('profile');
                      }}
                      className="absolute top-4 right-4 p-2 rounded-xl bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 transition-all cursor-pointer shadow-2xs active:scale-95"
                      title="Edit Profile"
                      aria-label="Edit Profile"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 pr-8">
                      {/* Left: Avatar Circle */}
                      <div className="relative shrink-0">
                        <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full overflow-hidden border-2 border-emerald-500/80 p-0.5 shadow-2xs bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                          {activeUserAvatar ? (
                            <img
                              src={activeUserAvatar}
                              alt={activeUserName}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-xl sm:text-2xl">
                              {activeUserName.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Profile Name on top, Gmail underneath */}
                      <div className="min-w-0 flex-1">
                        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                          {activeUserName}
                        </h2>
                        {activeUserEmail && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 font-medium md:text-sm">
                            {activeUserEmail}
                          </p>
                        )}

                        {/* Status indicator */}
                        <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/70 dark:border-emerald-800 px-2 py-0.5 rounded-full md:text-xs">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span className="truncate">{activeSheet ? 'Google Sheets Synced' : 'Offline Storage'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Group 1: Financial Preferences */}
                  <div className="space-y-1.5">
                    <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 md:text-xs">
                      Financial Configuration
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                      {/* 1. Manage Categories */}
                      <button
                        type="button"
                        onClick={() => handleOpenSubPage('categories')}
                        className="w-full px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <Tag className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-slate-900 dark:text-white md:text-sm">Manage Categories</h4>
                            <p className="text-[11px] text-slate-400 md:text-xs">
                              {categories.length} categories · All editable &amp; removable
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>

                      {/* 2. Financial Targets & Currency (Merged) */}
                      <button
                        type="button"
                        onClick={() => handleOpenSubPage('budget')}
                        className="w-full px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 flex items-center justify-center shrink-0">
                            <Sliders className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-slate-900 dark:text-white md:text-sm">Financial Targets &amp; Currency</h4>
                            <p className="text-[11px] text-slate-400 md:text-xs">
                              Currency ({currency}), monthly budget &amp; cash alerts
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>

                    </div>
                  </div>

                </div>

                {/* Right Column on Desktop: Grouped Settings Menu List */}
                <div className="space-y-4">
                  {/* Group 2: Cloud & Connectivity */}
                  <div className="space-y-1.5">
                    <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 md:text-xs">
                      Cloud &amp; Sync
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => handleOpenSubPage('alerts')}
                        className="w-full px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0">
                            <BellRing className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-slate-900 dark:text-white md:text-sm">Automatic Alerts</h4>
                            <p className="text-[11px] text-slate-400 md:text-xs">
                              {telegramConnected ? 'Telegram connected — alerts on' : 'Connect Telegram for free alerts'}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>
                      {/* Google Sheets Manager */}
                      <button
                        type="button"
                        onClick={onOpenSyncModal}
                        className="w-full px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
                            <FileSpreadsheet className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-slate-900 dark:text-white md:text-sm">Google Sheets Sync</h4>
                            <p className="text-[11px] text-slate-400 md:text-xs">
                              {activeSheet ? `Connected: ${activeSheet.name}` : 'Connect spreadsheet'}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>
                    </div>
                  </div>

                  {/* Group 3: Data & Privacy */}
                  <div className="space-y-1.5">
                    <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 md:text-xs">
                      Data Vault &amp; System
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                      {/* Data Management & Backups */}
                      <button
                        type="button"
                        onClick={() => handleOpenSubPage('data')}
                        className="w-full px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 flex items-center justify-center shrink-0">
                            <Database className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-slate-900 dark:text-white md:text-sm">Backup, PDF Statement &amp; Data</h4>
                            <p className="text-[11px] text-slate-400 md:text-xs">
                              PDF bank statement, CSV export, JSON backup &amp; restore
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>

                      {/* About & Security */}
                      <button
                        type="button"
                        onClick={() => handleOpenSubPage('about')}
                        className="w-full px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                            <Info className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-slate-900 dark:text-white md:text-sm">App Info &amp; Privacy</h4>
                            <p className="text-[11px] text-slate-400 md:text-xs">
                              Storage: {storageUsageKb} KB · Private offline vault
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Desktop Quick Workspace Info Card */}
                <div className="hidden md:block bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-3">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 md:text-xs">
                    Workspace Summary
                  </h4>
                  <div className="space-y-2 text-xs md:text-sm">
                    <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400">Local Database</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{storageUsageKb} KB</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400">Total Transactions</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{transactions.length} items</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-slate-500 dark:text-slate-400">Active Currency</span>
                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{currency}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* SUB-PAGE: EDIT PROFILE                                         */}
            {/* ============================================================== */}
            {currentSubPage === 'profile' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-5">
                  {/* Horizontal Profile Header */}
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                    {/* Profile Circle with WhatsApp-style camera overlay button */}
                    <div className="relative shrink-0">
                      <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-emerald-500/80 p-0.5 shadow-sm bg-white dark:bg-slate-800 flex items-center justify-center">
                        {editModalAvatar ? (
                          <img
                            src={editModalAvatar}
                            alt="Avatar Preview"
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-2xl">
                            {editModalName.charAt(0).toUpperCase() || 'J'}
                          </div>
                        )}
                      </div>

                      <input
                        type="file"
                        ref={modalAvatarInputRef}
                        onChange={handleModalAvatarFileChange}
                        accept="image/*"
                        className="hidden"
                      />

                      <button
                        type="button"
                        onClick={() => modalAvatarInputRef.current?.click()}
                        className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white flex items-center justify-center shadow-md cursor-pointer border-2 border-white dark:border-slate-900 transition-all"
                        title="Change profile photo"
                        aria-label="Change profile photo"
                      >
                        <Camera className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                        {editModalName || 'Your Name'}
                      </h3>
                      {editModalEmail && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 md:text-sm">
                          {editModalEmail}
                        </p>
                      )}
                      {editModalAvatar && (
                        <button
                          type="button"
                          onClick={() => setEditModalAvatar(null)}
                          className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-semibold mt-1 inline-block cursor-pointer md:text-xs"
                        >
                          Remove photo
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Form to update Name & Email */}
                  <form onSubmit={handleSaveFullProfile} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 md:text-sm">
                        Display Name
                      </label>
                      <div className="relative">
                        <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                        <input
                          type="text"
                          required
                          value={editModalName}
                          onChange={(e) => setEditModalName(e.target.value)}
                          placeholder="e.g. My Wallet"
                          className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-600 bg-slate-50 dark:bg-slate-800 transition-all md:text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 md:text-sm">
                        Gmail / Email Address (Optional)
                      </label>
                      <input
                        type="email"
                        value={editModalEmail}
                        onChange={(e) => setEditModalEmail(e.target.value)}
                        placeholder="e.g. your.email@gmail.com"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-600 bg-slate-50 dark:bg-slate-800 transition-all md:text-sm"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => safeNavigateBack(handleBackToMain)}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors md:text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold cursor-pointer shadow-xs transition-all flex items-center gap-2 md:text-sm"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Save Changes</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* SUB-PAGE 1: MANAGE CATEGORIES                                  */}
            {/* ============================================================== */}
            {currentSubPage === 'categories' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Expense &amp; Income Categories</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 md:text-xs">Every category is editable and removable.</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowResetCatConfirm(true)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer md:text-sm"
                      title="Restore Defaults"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Defaults</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingCategory(true);
                        setEditingCategory(null);
                        setFormCatName('');
                        setFormCatIcon('Tag');
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs md:text-sm"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>

                {(isAddingCategory || editingCategory) && (
                  <form
                    onSubmit={editingCategory ? handleSaveEditedCategory : handleSaveNewCategory}
                    className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-emerald-500/80 p-4 shadow-md space-y-3"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                          {React.createElement(getCategoryIcon(formCatIcon), { className: 'w-4 h-4' })}
                        </div>
                        <span className="font-bold text-xs text-slate-900 dark:text-white md:text-sm">
                          {editingCategory ? `Edit: ${editingCategory.name}` : 'New Category'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingCategory(false);
                          setEditingCategory(null);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 md:text-xs">
                          Category Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={formCatName}
                          onChange={(e) => setFormCatName(e.target.value)}
                          placeholder="e.g. Dining Out, Gym, Freelance..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-600 bg-slate-50 dark:bg-slate-800 md:text-sm"
                          autoFocus
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 md:text-xs">
                          Pick Icon: <span className="font-mono text-emerald-700 dark:text-emerald-400">{formCatIcon}</span>
                        </label>
                        <div className="relative mb-2">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                          <input
                            type="text"
                            value={iconPickerSearch}
                            onChange={(e) => setIconPickerSearch(e.target.value)}
                            placeholder="Search 80+ icons (food, fuel, gym)..."
                            className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden bg-white dark:bg-slate-800 md:text-sm"
                          />
                        </div>

                        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] scrollbar-none mb-2 md:text-xs">
                          {['all', 'food', 'transport', 'shopping', 'bills', 'health', 'home', 'leisure', 'finance', 'work'].map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setIconPickerFilter(f)}
                              className={`px-2 py-0.5 rounded-lg capitalize whitespace-nowrap cursor-pointer ${
                                iconPickerFilter === f
                                  ? 'bg-slate-900 dark:bg-emerald-600 text-white font-bold'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                              }`}
                            >
                              {f}
                            </button>
                          ))}
                        </div>

                        <div className="max-h-40 overflow-y-auto p-1.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-6 sm:grid-cols-8 gap-1.5">
                          {filteredIcons.map((item) => {
                            const IconComponent = item.component;
                            const isSelected = formCatIcon === item.name;
                            return (
                              <button
                                key={item.name}
                                type="button"
                                onClick={() => setFormCatIcon(item.name)}
                                title={`${item.label} (${item.name})`}
                                className={`p-1.5 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                <IconComponent className="w-4 h-4" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingCategory(false);
                          setEditingCategory(null);
                        }}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs cursor-pointer md:text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer shadow-xs md:text-sm"
                      >
                        {editingCategory ? 'Update' : 'Save'}
                      </button>
                    </div>
                  </form>
                )}

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder="Search category list..."
                    className="w-full pl-8 pr-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-hidden md:text-sm"
                  />
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                  {filteredCategories.map((cat) => {
                    const IconComp = getCategoryIcon(cat.iconName);
                    const stats = categoryStats[cat.name] || { count: 0, total: 0 };
                    return (
                      <div
                        key={cat.id}
                        className="p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate md:text-sm">
                              {cat.name}
                            </h4>
                            <span className="text-[11px] text-slate-400 md:text-xs">
                              {stats.count} {stats.count === 1 ? 'tx' : 'txs'} · {formatCurrency(stats.total, currency)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategory(cat);
                              setFormCatName(cat.name);
                              setFormCatIcon(cat.iconName || 'Tag');
                              setIsAddingCategory(false);
                            }}
                            className="p-1.5 text-slate-500 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                            title="Edit category"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteCandidate(cat)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                            title="Delete category"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* SUB-PAGE 2: FINANCIAL TARGETS & CURRENCY (MERGED)             */}
            {/* ============================================================== */}
            {currentSubPage === 'budget' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <form onSubmit={handleSaveBudget} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-5">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Financial Targets &amp; Currency</h3>

                  {/* Currency Selection Dropdown */}
                  <div className="space-y-2 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 md:text-sm">
                      Primary Currency
                    </label>
                    <div className="relative max-w-md">
                      <select
                        value={currency}
                        onChange={(e) => handleSaveCurrency(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer appearance-none pr-9 md:text-sm"
                      >
                        {COMMON_CURRENCIES.map((c) => (
                          <option key={c.code} value={c.symbol}>
                            {c.label}
                          </option>
                        ))}
                        {!COMMON_CURRENCIES.some((c) => c.symbol === currency) && (
                          <option value={currency}>{currency}</option>
                        )}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  {/* Budget Limits Inputs */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 md:text-sm">
                        Monthly Expense Budget ({currency})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={budgetForm.monthlyBudget || ''}
                        onChange={(e) => setBudgetForm({ ...budgetForm, monthlyBudget: parseFloat(e.target.value) || 0 })}
                        placeholder="e.g. 50000"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden bg-slate-50 dark:bg-slate-800 md:text-sm"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block md:text-xs">Set 0 to clear or disable monthly budget tracking.</span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 md:text-sm">
                        Low Cash Wallet Warning ({currency})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={budgetForm.lowCashThreshold || ''}
                        onChange={(e) => setBudgetForm({ ...budgetForm, lowCashThreshold: parseFloat(e.target.value) || 0 })}
                        placeholder="e.g. 1000"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden bg-slate-50 dark:bg-slate-800 md:text-sm"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block md:text-xs">Warns when cash balance drops below this amount.</span>
                    </div>

                    <div className="pt-2 space-y-3">
                      <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                        <div className="pr-2">
                          <span className="block text-xs font-bold text-slate-800 dark:text-slate-100 md:text-sm">
                            Daily refresh
                          </span>
                          <span className="block text-[10px] text-slate-400 mt-0.5 leading-relaxed md:text-xs">
                            {dailyRefresh
                              ? 'ON: Every new day, dashboard automatically refreshes and today’s figures start fresh at 0.00.'
                              : 'OFF: Refresh is disabled. Date is locked and will NOT refresh or roll over to new days.'}
                          </span>
                        </div>
                        <IosSwitch
                          checked={dailyRefresh}
                          onChange={(checked) => onUpdateDailyRefresh?.(checked)}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                        <div>
                          <span className="block text-xs font-bold text-slate-800 dark:text-slate-100 md:text-sm">
                            Show limit alerts
                          </span>
                          <span className="block text-[10px] text-slate-400 mt-0.5 md:text-xs">
                            Show warning alert banners when exceeding limits
                          </span>
                        </div>
                        <IosSwitch
                          checked={budgetForm.notifyOnLimit}
                          onChange={(checked) => setBudgetForm({ ...budgetForm, notifyOnLimit: checked })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer shadow-xs transition-colors md:text-sm"
                    >
                      Save Configuration
                    </button>
                  </div>
                </form>
              </div>
            )}

            {currentSubPage === 'alerts' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0">
                      <BellRing className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Automatic Alerts</h3>
                      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 mt-1 md:text-xs">
                        Get instant Telegram notifications whenever you save a transaction.
                      </p>
                    </div>
                  </div>

                  {/* Connection status */}
                  <div
                    className={`rounded-2xl border p-4 flex items-start gap-3 ${
                      telegramConnected
                        ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                        telegramConnected
                          ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
                      }`}
                      aria-hidden="true"
                    >
                      {telegramPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : telegramConnected ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 dark:text-white md:text-sm">
                          {telegramConnected
                            ? 'Telegram connected successfully'
                            : telegramPending
                            ? 'Waiting for Telegram connection'
                            : 'Not connected'}
                        </span>
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full md:text-xs ${
                            telegramConnected
                              ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-300'
                              : telegramPending
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {telegramConnected ? 'Connected' : telegramPending ? 'Connecting…' : 'Not connected'}
                        </span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 mt-1 md:text-xs">
                        {telegramConnected
                          ? 'Your chat is linked only to your account. No chat IDs to manage.'
                          : telegramPending
                          ? 'Press Start in the Telegram chat we just opened — this page updates automatically.'
                          : 'One tap connects the bot to your account securely — nothing to copy or paste.'}
                      </p>
                    </div>
                  </div>

                  {/* Primary action: not connected */}
                  {!telegramConnected && !telegramPending && (
                    <button
                      type="button"
                      onClick={handleConnectTelegram}
                      disabled={isConnectingTelegram}
                      className="w-full px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait md:text-sm"
                    >
                      {isConnectingTelegram ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Preparing secure link…</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Connect Telegram</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Waiting state: retry / cancel */}
                  {telegramPending && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={handleConnectTelegram}
                        disabled={isConnectingTelegram}
                        className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer disabled:opacity-60 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 md:text-sm"
                      >
                        {isConnectingTelegram ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Sending…</span>
                          </>
                        ) : (
                          <span>Resend link</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsWaitingForTelegram(false)}
                        disabled={isConnectingTelegram}
                        className="px-4 py-2.5 rounded-2xl text-slate-500 dark:text-slate-400 text-xs font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors md:text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Connected state: toggle + test + disconnect */}
                  {telegramConnected && (
                    <>
                      <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                        <div>
                          <span className="block text-xs font-bold text-slate-800 dark:text-slate-100 md:text-sm">
                            Enable transaction alerts
                          </span>
                          <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 md:text-xs">
                            Only new saved transactions send an alert.
                          </span>
                        </div>
                        <IosSwitch
                          checked={telegramLinkStatus?.alertsEnabled ?? false}
                          disabled={isTogglingTelegram}
                          onChange={handleToggleTelegramAlerts}
                        />
                      </div>

                      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => setShowDisconnectConfirm(true)}
                          disabled={isDisconnectingTelegram}
                          className="px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/70 text-rose-600 dark:text-rose-400 text-xs font-bold cursor-pointer disabled:opacity-60 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors md:text-sm"
                        >
                          {isDisconnectingTelegram ? 'Disconnecting…' : 'Disconnect Telegram'}
                        </button>
                        <button
                          type="button"
                          onClick={handleTestTelegramAlert}
                          disabled={isTestingTelegram}
                          className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer disabled:opacity-60 disabled:cursor-wait hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors md:text-sm"
                        >
                          {isTestingTelegram ? 'Sending test…' : 'Send Test Alert'}
                        </button>
                      </div>
                    </>
                  )}

                  <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-3 text-[11px] leading-relaxed text-amber-900 dark:text-amber-200 md:text-xs">
                    The bot token stays on the secure server and is never saved on this device.
                    Alerts and preferences apply only to your signed-in account.
                  </div>
                </div>

                <ConfirmModal
                  isOpen={showDisconnectConfirm}
                  title="Disconnect Telegram?"
                  message="Future transaction alerts will stop immediately. Your records, sheets and other settings stay untouched."
                  confirmLabel="Disconnect"
                  cancelLabel="Keep Connected"
                  isDestructive
                  icon="warning"
                  onConfirm={handleDisconnectTelegram}
                  onCancel={() => setShowDisconnectConfirm(false)}
                />
              </div>
            )}

            {/* ============================================================== */}
            {/* SUB-PAGE 3: APP THEME & APPEARANCE                             */}
            {/* ============================================================== */}
            {/* SUB-PAGE 4: DATA MANAGEMENT & BACKUPS                          */}
            {/* ============================================================== */}
            {currentSubPage === 'data' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Export &amp; Bank Statement</h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Official PDF Bank Statement */}
                    <button
                      type="button"
                      onClick={handleExportPdfStatement}
                      className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/40 text-left hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 transition-colors cursor-pointer space-y-1 group"
                    >
                      <FileText className="w-5 h-5 text-emerald-700 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                      <span className="font-bold text-xs text-slate-900 dark:text-white block md:text-sm">Official Bank Statement (PDF)</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block md:text-xs">Printable detailed audit report</span>
                    </button>

                    {/* CSV Export */}
                    <button
                      type="button"
                      onClick={onExportCSV}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer space-y-1"
                    >
                      <Download className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      <span className="font-bold text-xs text-slate-900 dark:text-white block md:text-sm">Export CSV File</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block md:text-xs">Spreadsheet for Excel &amp; Numbers</span>
                    </button>

                    {/* JSON Full Backup */}
                    <button
                      type="button"
                      onClick={handleDownloadBackup}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer space-y-1"
                    >
                      <HardDrive className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      <span className="font-bold text-xs text-slate-900 dark:text-white block md:text-sm">Download Full JSON</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block md:text-xs">Backup of all data &amp; settings</span>
                    </button>
                  </div>

                  {/* Restore */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".json"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-center gap-2 md:text-sm"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Restore from JSON Backup File</span>
                    </button>
                  </div>

                  {/* Danger */}
                  <div className="pt-4 border-t border-rose-200 dark:border-rose-900">
                    <button
                      type="button"
                      onClick={() => setShowResetDataConfirm(true)}
                      className="w-full py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold cursor-pointer md:text-sm"
                    >
                      Clear All Transaction Records
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* SUB-PAGE 5: ABOUT & PRIVACY                                    */}
            {/* ============================================================== */}
            {currentSubPage === 'about' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-4">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
                    <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>100% Local-First Privacy</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed md:text-sm">
                    SpendDesk operates offline-first. Your financial data, debts, and categories never leave your browser storage unless you choose to sync with your personal Google Sheets account.
                  </p>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold md:text-xs">Storage Used</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">{storageUsageKb} KB</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold md:text-xs">App Version</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">v3.2 PRO</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Delete Category Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteCandidate)}
        title="Delete Category?"
        message={`Remove "${deleteCandidate?.name}"? Existing past transactions will keep their label.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDestructive={true}
        icon="trash"
        onConfirm={handleConfirmDeleteCategory}
        onCancel={() => setDeleteCandidate(null)}
      />

      {/* Restore Defaults Confirm Modal */}
      <ConfirmModal
        isOpen={showResetCatConfirm}
        title="Restore Standard Categories"
        message="Reset category catalog back to Food, Transport, Bills, Shopping, Entertainment, etc.?"
        confirmLabel="Restore"
        cancelLabel="Cancel"
        isDestructive={false}
        icon="reset"
        onConfirm={handleResetCategories}
        onCancel={() => setShowResetCatConfirm(false)}
      />

      {/* Clear All Data Confirm */}
      {showResetDataConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-rose-200 dark:border-rose-900 space-y-3">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-sm text-rose-900 dark:text-rose-200">Wipe All Records?</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 md:text-sm">
              Type <strong className="font-mono text-rose-700 dark:text-rose-400">RESET</strong> to permanently delete all {transactions.length} transactions.
            </p>
            <input
              type="text"
              value={resetConfirmInput}
              onChange={(e) => setResetConfirmInput(e.target.value)}
              placeholder="Type RESET"
              className="w-full px-3 py-2 rounded-xl border border-rose-300 dark:border-rose-800 font-mono text-xs focus:outline-hidden bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white md:text-sm"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowResetDataConfirm(false);
                  setResetConfirmInput('');
                }}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer text-slate-700 dark:text-slate-300 md:text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetConfirmInput.trim().toUpperCase() !== 'RESET'}
                onClick={handleResetData}
                className="px-4 py-1.5 rounded-xl bg-rose-600 disabled:opacity-50 text-white text-xs font-bold cursor-pointer md:text-sm"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Confirmation Modal */}
      {showUnsavedConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Unsaved Changes</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed md:text-sm">
              You have unsaved changes. Do you want to discard your edits and leave, or save them before leaving?
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowUnsavedConfirm(false)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-center md:text-sm"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={handleDiscardAndLeave}
                className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-700 dark:text-rose-300 text-xs font-bold cursor-pointer transition-colors text-center md:text-sm"
              >
                Discard &amp; Leave
              </button>
              <button
                type="button"
                onClick={(e) => handleSaveAndLeave(e)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer transition-colors shadow-xs text-center md:text-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
