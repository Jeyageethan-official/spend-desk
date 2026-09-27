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
  Info, 
  Sliders, 
  Database,
  ExternalLink,
  DollarSign,
  AlertTriangle,
  RotateCcw,
  ChevronRight,
  HardDrive,
  Lock,
  CheckCircle2,
  X,
  Camera,
  User as UserIcon,
  Sparkles
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

interface SettingsViewProps {
  onBack: () => void;
  currency: string;
  onUpdateCurrency: (curr: string) => void;
  budgetConfig: BudgetConfig;
  onUpdateBudgetConfig: (config: BudgetConfig) => void;
  alertPhone: string;
  onUpdateAlertPhone: (phone: string) => void;
  activeSheet: GoogleSheetMeta | null;
  onOpenSyncModal: () => void;
  onExportCSV: () => void;
  transactions: Transaction[];
  lendItems: LendItem[];
  userProfile?: UserProfile;
  onUpdateProfile?: (updated: Partial<UserProfile>) => void;
  onResetAllData?: () => void;
  onRestoreTransactions?: (txs: Transaction[], lends?: LendItem[]) => void;
  initialSection?: 'main' | 'categories' | 'preferences' | 'budget' | 'cloud' | 'data' | 'about' | 'profile';
  onNotification?: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

const COMMON_CURRENCIES = [
  { code: 'Rs', label: 'Rs (Rupees - LKR/INR)', symbol: 'Rs' },
  { code: '$', label: 'USD ($ - Dollar)', symbol: '$' },
  { code: '€', label: 'EUR (€ - Euro)', symbol: '€' },
  { code: '£', label: 'GBP (£ - British Pound)', symbol: '£' },
  { code: 'AED', label: 'AED (Dirham)', symbol: 'AED' },
  { code: 'SAR', label: 'SAR (Saudi Riyal)', symbol: 'SAR' },
  { code: 'SGD', label: 'SGD (Singapore Dollar)', symbol: 'S$' },
  { code: 'MYR', label: 'MYR (Malaysian Ringgit)', symbol: 'RM' },
  { code: 'CAD', label: 'CAD (Canadian Dollar)', symbol: 'C$' },
  { code: 'AUD', label: 'AUD (Australian Dollar)', symbol: 'A$' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  onBack,
  currency,
  onUpdateCurrency,
  budgetConfig,
  onUpdateBudgetConfig,
  alertPhone,
  onUpdateAlertPhone,
  activeSheet,
  onOpenSyncModal,
  onExportCSV,
  transactions,
  lendItems,
  userProfile,
  onUpdateProfile,
  onResetAllData,
  onRestoreTransactions,
  initialSection = 'main',
  onNotification,
}) => {
  // Navigation: 'main' is the WhatsApp-style Profile + options menu; clicking an option opens its sub-page
  const [currentSubPage, setCurrentSubPage] = useState<'main' | 'profile' | 'categories' | 'preferences' | 'budget' | 'cloud' | 'data' | 'about'>(
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

  // Custom Profile Avatar state (synced with userProfile or localStorage)
  const [customAvatar, setCustomAvatar] = useState<string | null>(() => {
    return userProfile?.avatar || localStorage.getItem('money_tracker_custom_avatar') || null;
  });

  // Custom User Profile Name state
  const [profileName, setProfileName] = useState<string>(() => {
    const stored = userProfile?.name || localStorage.getItem('money_tracker_profile_name');
    return stored && stored !== 'Jeyaram Tech' ? stored : 'My Wallet';
  });

  // Profile Email state
  const [profileEmail, setProfileEmail] = useState<string>(() => {
    const stored = userProfile?.email || localStorage.getItem('money_tracker_profile_email');
    return stored && stored !== 'jeyaramantech05@gmail.com' ? stored : '';
  });

  // Edit Form State (for full dedicated profile page)
  const [editModalName, setEditModalName] = useState(profileName);
  const [editModalEmail, setEditModalEmail] = useState(profileEmail);
  const [editModalAvatar, setEditModalAvatar] = useState<string | null>(customAvatar);

  // Unsaved Changes Confirmation State
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<(() => void) | null>(null);

  // Keep in sync with userProfile prop changes
  useEffect(() => {
    const nextName = userProfile?.name && userProfile.name !== 'Jeyaram Tech' ? userProfile.name : 'My Wallet';
    const nextAvatar = userProfile?.avatar || null;
    const nextEmail = userProfile?.email && userProfile.email !== 'jeyaramantech05@gmail.com' ? userProfile.email : '';

    setProfileName(nextName);
    setEditModalName(nextName);
    setCustomAvatar(nextAvatar);
    setEditModalAvatar(nextAvatar);
    setProfileEmail(nextEmail);
    setEditModalEmail(nextEmail);
  }, [userProfile]);

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
  const [categories, setCategories] = useState<CategoryDef[]>(() => loadStoredCategoryDefs());
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

  // Currency & Preferences State
  const [customCurrencyInput, setCustomCurrencyInput] = useState(currency);

  // Budget State
  const [budgetForm, setBudgetForm] = useState<BudgetConfig>(budgetConfig);

  // Alert Phone State
  const [phoneInput, setPhoneInput] = useState(alertPhone);

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
    saveStoredCategoryDefs(updated);
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
    saveStoredCategoryDefs(updated);
    setEditingCategory(null);
    setFormCatName('');
    onNotification?.(`Category updated to "${trimmed}".`, 'success');
  };

  // Delete category
  const handleConfirmDeleteCategory = () => {
    if (!deleteCandidate) return;
    const updated = categories.filter((c) => c.id !== deleteCandidate.id);
    setCategories(updated);
    saveStoredCategoryDefs(updated);
    const candidateName = deleteCandidate.name;
    setDeleteCandidate(null);
    onNotification?.(`Category "${candidateName}" removed.`, 'info');
  };

  // Reset categories to standard preset
  const handleResetCategories = () => {
    const defaults = resetToDefaultCategoryDefs();
    setCategories(defaults);
    setShowResetCatConfirm(false);
    onNotification?.('Categories restored to default standard set.', 'success');
  };

  // Save Currency
  const handleSaveCurrency = (newCurr: string) => {
    onUpdateCurrency(newCurr);
    setCustomCurrencyInput(newCurr);
    onNotification?.(`Currency changed to ${newCurr}`, 'success');
    handleBackToMain();
  };

  // Save Budget
  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateBudgetConfig(budgetForm);
    onNotification?.('Budget configuration saved.', 'success');
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

  // Save Phone
  const handleSavePhone = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateAlertPhone(phoneInput.trim());
    onNotification?.(phoneInput ? `Alert phone number set to ${phoneInput}` : 'Phone number cleared', 'success');
  };

  // JSON Full Backup Download
  const handleDownloadBackup = () => {
    const jsonStr = exportFullBackupJson();
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

  // JSON Restore
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;
      const res = importFullBackupJson(content);
      if (res.success) {
        setCategories(loadStoredCategoryDefs());
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

  return (
    <div className="min-h-screen bg-slate-50/80 pb-20">
      {/* ============================================================== */}
      {/* 1. TOP MINIMALIST APP BAR (WhatsApp / iOS Style)               */}
      {/* ============================================================== */}
      <div className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => safeNavigateBack(currentSubPage === 'main' ? onBack : handleBackToMain)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer border border-slate-200/90 shadow-2xs"
            title="Back"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
          </button>

          <h1 className="text-sm font-bold text-slate-900 capitalize">
            {currentSubPage === 'main' && 'Settings'}
            {currentSubPage === 'profile' && 'Edit Profile'}
            {currentSubPage === 'categories' && 'Manage Categories'}
            {currentSubPage === 'preferences' && 'Currency & Format'}
            {currentSubPage === 'budget' && 'Budget & Limits'}
            {currentSubPage === 'cloud' && 'Google Sheets Manager'}
            {currentSubPage === 'data' && 'Data & Backups'}
            {currentSubPage === 'about' && 'About & Privacy'}
          </h1>

          <div className="w-9" />
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
            {/* ============================================================== */}
            {/* VIEW 0: MAIN SETTINGS PAGE (WhatsApp-style Hero Profile Card)  */}
            {/* ============================================================== */}
            {currentSubPage === 'main' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Left Column on Desktop: Profile Card & Quick Info */}
                <div className="md:col-span-5 space-y-4">
                  {/* WhatsApp-Style Hero Profile Card */}
                  <div 
                    onClick={() => {
                      setEditModalName(profileName);
                      setEditModalEmail(profileEmail);
                      setEditModalAvatar(customAvatar);
                      handleOpenSubPage('profile');
                    }}
                    className="bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-4 cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                      {/* Left: Avatar Circle with WhatsApp-style camera badge */}
                      <div className="relative shrink-0">
                        <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full overflow-hidden border-2 border-emerald-500/80 p-0.5 shadow-2xs bg-slate-100 flex items-center justify-center">
                          {customAvatar ? (
                            <img
                              src={customAvatar}
                              alt={profileName}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-xl sm:text-2xl">
                              {profileName.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs border-2 border-white">
                          <Camera className="w-3 h-3" />
                        </div>
                      </div>

                      {/* Right: Profile Name on top, Gmail underneath */}
                      <div className="min-w-0 flex-1">
                        <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate group-hover:text-emerald-700 transition-colors">
                          {profileName}
                        </h2>
                        <p className="text-xs text-slate-500 truncate mt-0.5 font-medium">
                          {profileEmail}
                        </p>

                        {/* Status indicator */}
                        <div className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span className="truncate">{activeSheet ? 'Google Sheets Synced' : 'Offline Storage'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-700">
                      <span>Edit Profile Details</span>
                      <Edit3 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    </div>
                  </div>

                  {/* Desktop Quick Workspace Info Card */}
                  <div className="hidden md:block bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-5 shadow-xs space-y-3">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Workspace Summary
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between py-1 border-b border-slate-700/60">
                        <span className="text-slate-300">Local Database</span>
                        <span className="font-mono font-bold text-emerald-400">{storageUsageKb} KB</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-slate-700/60">
                        <span className="text-slate-300">Total Transactions</span>
                        <span className="font-mono font-bold text-white">{transactions.length} items</span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-slate-300">Active Currency</span>
                        <span className="font-mono font-bold text-amber-400">{currency}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column on Desktop: Grouped Settings Menu List */}
                <div className="md:col-span-7 space-y-4">
                  {/* Group 1: Financial Preferences */}
                  <div className="space-y-1.5">
                    <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Financial Configuration
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
                      {/* 1. Manage Categories */}
                      <button
                        type="button"
                        onClick={() => handleOpenSubPage('categories')}
                        className="w-full px-4 py-3.5 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                            <Tag className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-slate-900">Manage Categories</h4>
                            <p className="text-[11px] text-slate-400">
                              {categories.length} categories · All editable &amp; removable
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>

                      {/* 2. Currency & Format */}
                      <button
                        type="button"
                        onClick={() => handleOpenSubPage('preferences')}
                        className="w-full px-4 py-3.5 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                            <DollarSign className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-slate-900">Currency &amp; Format</h4>
                            <p className="text-[11px] text-slate-400">
                              Active currency: <span className="font-mono font-bold text-slate-700">{currency}</span>
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>

                      {/* 3. Budget & Limits */}
                      <button
                        type="button"
                        onClick={() => handleOpenSubPage('budget')}
                        className="w-full px-4 py-3.5 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                            <Sliders className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-slate-900">Budget Targets &amp; Alerts</h4>
                            <p className="text-[11px] text-slate-400">
                              Monthly targets, low cash warnings &amp; SMS alerts
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>
                    </div>
                  </div>

                  {/* Group 2: Cloud & Connectivity */}
                  <div className="space-y-1.5">
                    <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Cloud &amp; Sync
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
                      {/* Google Sheets Manager (Opens SheetManagerView directly) */}
                      <button
                        type="button"
                        onClick={onOpenSyncModal}
                        className="w-full px-4 py-3.5 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                            <FileSpreadsheet className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-slate-900">Google Sheets Sync</h4>
                            <p className="text-[11px] text-slate-400">
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
                    <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Data Vault &amp; System
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
                      {/* Data Management & Backups */}
                      <button
                        type="button"
                        onClick={() => handleOpenSubPage('data')}
                        className="w-full px-4 py-3.5 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                            <Database className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-slate-900">Backup &amp; Restore</h4>
                            <p className="text-[11px] text-slate-400">
                              Export CSV, download JSON snapshot, restore records
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>

                      {/* About & Security */}
                      <button
                        type="button"
                        onClick={() => handleOpenSubPage('about')}
                        className="w-full px-4 py-3.5 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                            <Info className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-slate-900">App Info &amp; Privacy</h4>
                            <p className="text-[11px] text-slate-400">
                              Storage: {storageUsageKb} KB · Private offline vault
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

        {/* ============================================================== */}
        {/* SUB-PAGE: EDIT PROFILE (Horizontal layout, WhatsApp camera badge) */}
        {/* ============================================================== */}
        {currentSubPage === 'profile' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-5">
              {/* Horizontal Profile Header (Avatar on Left, Name & Gmail on Right) */}
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50/90 border border-slate-200/80">
                {/* Profile Circle with WhatsApp-style camera overlay button */}
                <div className="relative shrink-0">
                  <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-emerald-500/80 p-0.5 shadow-sm bg-white flex items-center justify-center">
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

                  {/* WhatsApp-Style Camera Icon Button on Avatar */}
                  <button
                    type="button"
                    onClick={() => modalAvatarInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white flex items-center justify-center shadow-md cursor-pointer border-2 border-white transition-all"
                    title="Change profile photo"
                    aria-label="Change profile photo"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Right: Display Name on top, Gmail underneath */}
                <div className="min-w-0 flex-1">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                    {editModalName || 'Your Name'}
                  </h3>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {editModalEmail || 'your.email@gmail.com'}
                  </p>
                  {editModalAvatar && (
                    <button
                      type="button"
                      onClick={() => setEditModalAvatar(null)}
                      className="text-[11px] text-rose-600 hover:underline font-semibold mt-1 inline-block cursor-pointer"
                    >
                      Remove photo
                    </button>
                  )}
                </div>
              </div>

              {/* Form to update Name & Email */}
              <form onSubmit={handleSaveFullProfile} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
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
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-hidden focus:border-emerald-600 bg-slate-50 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Gmail / Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    value={editModalEmail}
                    onChange={(e) => setEditModalEmail(e.target.value)}
                    placeholder="e.g. your.email@gmail.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 focus:outline-hidden focus:border-emerald-600 bg-slate-50 focus:bg-white transition-all"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => safeNavigateBack(handleBackToMain)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-xs font-bold cursor-pointer shadow-xs transition-all flex items-center gap-2"
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
        {/* SUB-PAGE 1: MANAGE CATEGORIES (ALL EDITABLE & REMOVABLE!)      */}
        {/* ============================================================== */}
        {currentSubPage === 'categories' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Header info & action */}
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Expense &amp; Income Categories</h3>
                <p className="text-[11px] text-slate-500">Every category is editable and removable.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowResetCatConfirm(true)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1 cursor-pointer"
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
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Add</span>
                </button>
              </div>
            </div>

            {/* Add / Edit Category Form */}
            {(isAddingCategory || editingCategory) && (
              <form
                onSubmit={editingCategory ? handleSaveEditedCategory : handleSaveNewCategory}
                className="bg-white rounded-2xl border-2 border-emerald-500/80 p-4 shadow-md space-y-3"
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                      {React.createElement(getCategoryIcon(formCatIcon), { className: 'w-4 h-4' })}
                    </div>
                    <span className="font-bold text-xs text-slate-900">
                      {editingCategory ? `Edit: ${editingCategory.name}` : 'New Category'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCategory(false);
                      setEditingCategory(null);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Category Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formCatName}
                      onChange={(e) => setFormCatName(e.target.value)}
                      placeholder="e.g. Dining Out, Gym, Freelance..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 focus:outline-hidden focus:border-emerald-600 bg-slate-50"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Pick Icon: <span className="font-mono text-emerald-700">{formCatIcon}</span>
                    </label>
                    <div className="relative mb-2">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={iconPickerSearch}
                        onChange={(e) => setIconPickerSearch(e.target.value)}
                        placeholder="Search 80+ icons (food, fuel, gym)..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden bg-white"
                      />
                    </div>

                    {/* Icon Category Filter Tabs */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] scrollbar-none mb-2">
                      {['all', 'food', 'transport', 'shopping', 'bills', 'health', 'home', 'leisure', 'finance', 'work'].map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setIconPickerFilter(f)}
                          className={`px-2 py-0.5 rounded-lg capitalize whitespace-nowrap cursor-pointer ${
                            iconPickerFilter === f
                              ? 'bg-slate-900 text-white font-bold'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>

                    {/* Icon Catalog Grid */}
                    <div className="max-h-40 overflow-y-auto p-1.5 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-6 sm:grid-cols-8 gap-1.5">
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
                                : 'bg-white hover:bg-emerald-50 text-slate-700 border border-slate-200'
                            }`}
                          >
                            <IconComponent className="w-4 h-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCategory(false);
                      setEditingCategory(null);
                    }}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer shadow-xs"
                  >
                    {editingCategory ? 'Update' : 'Save'}
                  </button>
                </div>
              </form>
            )}

            {/* Search Categories */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Search category list..."
                className="w-full pl-8 pr-3 py-2 rounded-2xl border border-slate-200 text-xs bg-white focus:outline-hidden"
              />
            </div>

            {/* Unified Categories List */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
              {filteredCategories.map((cat) => {
                const IconComp = getCategoryIcon(cat.iconName);
                const stats = categoryStats[cat.name] || { count: 0, total: 0 };
                return (
                  <div
                    key={cat.id}
                    className="p-3.5 hover:bg-slate-50 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-2xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-emerald-600 shrink-0">
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-slate-900 truncate">
                          {cat.name}
                        </h4>
                        <span className="text-[11px] text-slate-400">
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
                        className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer"
                        title="Edit category"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteCandidate(cat)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
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
        {/* SUB-PAGE 2: CURRENCY & FORMAT                                  */}
        {/* ============================================================== */}
        {currentSubPage === 'preferences' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Primary Currency</h3>
              <p className="text-xs text-slate-500">Select standard preset or type your custom symbol.</p>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {COMMON_CURRENCIES.map((c) => {
                  const isSelected = currency === c.symbol;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => handleSaveCurrency(c.symbol)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <span className="text-base font-bold block">{c.symbol}</span>
                      <span className="text-[10px] text-slate-500 block truncate">{c.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Custom Currency Symbol
                </label>
                <div className="flex items-center gap-2 max-w-xs">
                  <input
                    type="text"
                    value={customCurrencyInput}
                    onChange={(e) => setCustomCurrencyInput(e.target.value)}
                    placeholder="e.g. Rs, INR, $"
                    className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold font-mono text-slate-900 focus:outline-hidden bg-slate-50 flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customCurrencyInput.trim()) {
                        handleSaveCurrency(customCurrencyInput.trim());
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* Preview */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Preview</span>
                  <span className="font-mono font-bold text-slate-900 text-base">
                    {formatCurrency(18500.5, currency)}
                  </span>
                </div>
                <span className="text-emerald-700 bg-emerald-100 font-semibold px-2 py-0.5 rounded-md text-[10px]">
                  Applied Everywhere
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* SUB-PAGE 3: BUDGET & LIMITS                                    */}
        {/* ============================================================== */}
        {currentSubPage === 'budget' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <form onSubmit={handleSaveBudget} className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Budget Limits</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Monthly Expense Budget ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={budgetForm.monthlyBudget || ''}
                    onChange={(e) => setBudgetForm({ ...budgetForm, monthlyBudget: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g. 50000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-hidden bg-slate-50"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Set 0 to disable monthly budget tracking.</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Low Cash Wallet Alert ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={budgetForm.lowCashThreshold || ''}
                    onChange={(e) => setBudgetForm({ ...budgetForm, lowCashThreshold: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g. 1000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-hidden bg-slate-50"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Warns when cash in wallet drops below this amount.</span>
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={budgetForm.notifyOnLimit}
                      onChange={(e) => setBudgetForm({ ...budgetForm, notifyOnLimit: e.target.checked })}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-bold text-slate-800">
                      Show alert banners when exceeding limits
                    </span>
                  </label>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  Save Budget
                </button>
              </div>
            </form>
          </div>
        )}

        {/* SUB-PAGE: DATA MANAGEMENT & BACKUPS */}
        {currentSubPage === 'data' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Export &amp; Backups</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={onExportCSV}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50 text-left hover:bg-slate-100 transition-colors cursor-pointer space-y-1"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-xs text-slate-900 block">Export CSV File</span>
                  <span className="text-[11px] text-slate-500 block">Spreadsheet for Excel &amp; Numbers</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50 text-left hover:bg-slate-100 transition-colors cursor-pointer space-y-1"
                >
                  <HardDrive className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold text-xs text-slate-900 block">Download Full JSON</span>
                  <span className="text-[11px] text-slate-500 block">Complete backup of all data &amp; settings</span>
                </button>
              </div>

              {/* Restore */}
              <div className="pt-2 border-t border-slate-100">
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
                  className="w-full py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>Restore from JSON Backup File</span>
                </button>
              </div>

              {/* Danger */}
              <div className="pt-4 border-t border-rose-200">
                <button
                  type="button"
                  onClick={() => setShowResetDataConfirm(true)}
                  className="w-full py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold cursor-pointer"
                >
                  Clear All Transaction Records
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* SUB-PAGE 6: ABOUT & PRIVACY                                    */}
        {/* ============================================================== */}
        {currentSubPage === 'about' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Lock className="w-4 h-4 text-emerald-600" />
                <span>100% Local-First Privacy</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                SpendDesk operates offline-first. Your financial data, debts, and categories never leave your browser storage unless you choose to sync with your personal Google Sheets account.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Storage Used</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">{storageUsageKb} KB</span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">App Version</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">v3.2 PRO</span>
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
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-rose-200 space-y-3">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-sm text-rose-900">Wipe All Records?</h3>
            </div>
            <p className="text-xs text-slate-600">
              Type <strong className="font-mono text-rose-700">RESET</strong> to permanently delete all {transactions.length} transactions.
            </p>
            <input
              type="text"
              value={resetConfirmInput}
              onChange={(e) => setResetConfirmInput(e.target.value)}
              placeholder="Type RESET"
              className="w-full px-3 py-2 rounded-xl border border-rose-300 font-mono text-xs focus:outline-hidden"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowResetDataConfirm(false);
                  setResetConfirmInput('');
                }}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetConfirmInput.trim().toUpperCase() !== 'RESET'}
                onClick={handleResetData}
                className="px-4 py-1.5 rounded-xl bg-rose-600 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
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
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-sm text-slate-900">Unsaved Changes</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              You have unsaved changes. Do you want to discard your edits and leave, or save them before leaving?
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowUnsavedConfirm(false)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 cursor-pointer text-center"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={handleDiscardAndLeave}
                className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold cursor-pointer transition-colors text-center"
              >
                Discard &amp; Leave
              </button>
              <button
                type="button"
                onClick={(e) => handleSaveAndLeave(e)}
                className="px-4 py-2 rounded-xl bg-[#116b4e] hover:bg-[#0d5940] text-white text-xs font-bold cursor-pointer transition-colors shadow-xs text-center"
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
