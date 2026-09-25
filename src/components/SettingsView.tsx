import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  onResetAllData?: () => void;
  onRestoreTransactions?: (txs: Transaction[], lends?: LendItem[]) => void;
  initialSection?: 'main' | 'categories' | 'preferences' | 'budget' | 'cloud' | 'data' | 'about';
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
  onResetAllData,
  onRestoreTransactions,
  initialSection = 'main',
  onNotification,
}) => {
  // Navigation: 'main' is the WhatsApp-style Profile + options menu; clicking an option opens its sub-page
  const [currentSubPage, setCurrentSubPage] = useState<'main' | 'categories' | 'preferences' | 'budget' | 'cloud' | 'data' | 'about'>(
    initialSection || 'main'
  );

  // If initialSection changes (e.g. opened from Record Transaction modal to categories), update subpage
  useEffect(() => {
    if (initialSection) {
      setCurrentSubPage(initialSection);
    }
  }, [initialSection]);

  // Custom Profile Avatar state (stored in localStorage)
  const [customAvatar, setCustomAvatar] = useState<string | null>(() => {
    try {
      return localStorage.getItem('money_tracker_custom_avatar') || null;
    } catch {
      return null;
    }
  });

  // Custom User Profile Name state
  const [profileName, setProfileName] = useState<string>(() => {
    try {
      return localStorage.getItem('money_tracker_profile_name') || 'Money Tracker User';
    } catch {
      return 'Money Tracker User';
    }
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profileName);

  // Avatar file input ref
  const avatarInputRef = useRef<HTMLInputElement>(null);

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

  // Handle Avatar Image File Upload
  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        setCustomAvatar(dataUrl);
        try {
          localStorage.setItem('money_tracker_custom_avatar', dataUrl);
          onNotification?.('Profile image updated successfully.', 'success');
        } catch (err) {
          console.error(err);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // Remove Avatar
  const handleRemoveAvatar = () => {
    setCustomAvatar(null);
    try {
      localStorage.removeItem('money_tracker_custom_avatar');
      onNotification?.('Profile image removed.', 'info');
    } catch (err) {
      console.error(err);
    }
  };

  // Save Profile Name
  const handleSaveProfileName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setProfileName(trimmed);
    setIsEditingName(false);
    try {
      localStorage.setItem('money_tracker_profile_name', trimmed);
      onNotification?.('Name updated.', 'success');
    } catch (err) {
      console.error(err);
    }
  };

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
  };

  // Save Budget
  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateBudgetConfig(budgetForm);
    onNotification?.('Budget configuration saved.', 'success');
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
    a.download = `money_tracker_backup_${new Date().toISOString().split('T')[0]}.json`;
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
      <div className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          {currentSubPage === 'main' ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors cursor-pointer py-1.5 px-2 rounded-xl hover:bg-slate-100"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Dashboard</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentSubPage('main')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer py-1.5 px-2 rounded-xl hover:bg-emerald-50"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Settings</span>
            </button>
          )}

          <h1 className="text-sm font-bold text-slate-900 capitalize">
            {currentSubPage === 'main' && 'Settings'}
            {currentSubPage === 'categories' && 'Manage Categories'}
            {currentSubPage === 'preferences' && 'Currency & Format'}
            {currentSubPage === 'budget' && 'Budget & Limits'}
            {currentSubPage === 'cloud' && 'Google Sheets Sync'}
            {currentSubPage === 'data' && 'Data & Backups'}
            {currentSubPage === 'about' && 'About & Privacy'}
          </h1>

          <div className="w-14" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {/* ============================================================== */}
        {/* VIEW 0: MAIN SETTINGS PAGE (WhatsApp-style Hero Profile Card)  */}
        {/* ============================================================== */}
        {currentSubPage === 'main' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* WhatsApp Centered Profile Hero Card */}
            <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-xs text-center relative overflow-hidden">
              <input
                type="file"
                ref={avatarInputRef}
                onChange={handleAvatarFileChange}
                accept="image/*"
                className="hidden"
              />

              {/* Centered Circular Avatar with Camera Edit Icon */}
              <div className="relative inline-block mx-auto mb-3">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-emerald-500/80 p-0.5 shadow-sm bg-slate-100 flex items-center justify-center">
                  {customAvatar ? (
                    <img
                      src={customAvatar}
                      alt="Profile Avatar"
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-2xl sm:text-3xl">
                      {profileName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Camera / Edit Badge Button */}
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-md border-2 border-white transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                  title="Upload Custom Profile Photo"
                  aria-label="Upload Custom Profile Photo"
                >
                  <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.2]" />
                </button>
              </div>

              {/* Profile Name & Edit */}
              <div>
                {isEditingName ? (
                  <div className="flex items-center justify-center gap-1.5 max-w-xs mx-auto mb-1">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Enter your name"
                      className="px-3 py-1 text-xs font-bold text-slate-900 border border-emerald-500 rounded-xl focus:outline-hidden text-center bg-white"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleSaveProfileName}
                      className="px-2.5 py-1 bg-emerald-600 text-white text-xs font-bold rounded-xl cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-1.5">
                    <h2 className="text-base sm:text-lg font-bold text-slate-900">
                      {profileName}
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setNameInput(profileName);
                        setIsEditingName(true);
                      }}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded-md cursor-pointer"
                      title="Edit name"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <p className="text-xs text-slate-500 mt-0.5">
                  Personal Cash &amp; Spend Tracker
                </p>

                {/* Status indicator */}
                <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{activeSheet ? 'Google Sheets Synced' : 'Offline Local Storage'}</span>
                </div>

                {customAvatar && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      className="text-[10px] text-rose-500 hover:text-rose-700 underline cursor-pointer"
                    >
                      Remove custom photo
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* WhatsApp / iOS Grouped Settings Menu List */}
            <div className="space-y-1">
              <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Preferences &amp; Control
              </div>

              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
                {/* 1. Manage Categories */}
                <button
                  type="button"
                  onClick={() => setCurrentSubPage('categories')}
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
                  onClick={() => setCurrentSubPage('preferences')}
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
                  onClick={() => setCurrentSubPage('budget')}
                  className="w-full px-4 py-3.5 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                      <Sliders className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">Budget &amp; Limits</h4>
                      <p className="text-[11px] text-slate-400">
                        Monthly budget limits, low cash warnings &amp; SMS alerts
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                {/* 4. Google Sheets Sync */}
                <button
                  type="button"
                  onClick={() => setCurrentSubPage('cloud')}
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

                {/* 5. Data & Backups */}
                <button
                  type="button"
                  onClick={() => setCurrentSubPage('data')}
                  className="w-full px-4 py-3.5 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                      <Database className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">Data Management &amp; Backups</h4>
                      <p className="text-[11px] text-slate-400">
                        Export CSV, download JSON snapshot, restore records
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                {/* 6. About & Security */}
                <button
                  type="button"
                  onClick={() => setCurrentSubPage('about')}
                  className="w-full px-4 py-3.5 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                      <Info className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">About &amp; Offline Privacy</h4>
                      <p className="text-[11px] text-slate-400">
                        Local storage: {storageUsageKb} KB · v3.2 PRO
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>
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

            {/* Alert Phone */}
            <form onSubmit={handleSavePhone} className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900">SMS Alert Phone Number</h3>
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+94 77 123 4567 or +91 98765 43210"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 focus:outline-hidden bg-slate-50"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer"
                >
                  Save Phone
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ============================================================== */}
        {/* SUB-PAGE 4: GOOGLE SHEETS SYNC                                 */}
        {/* ============================================================== */}
        {currentSubPage === 'cloud' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Google Drive &amp; Sheets</h3>
              <p className="text-xs text-slate-500">Live backup of transactions, debt logs, and KPI summary.</p>

              {activeSheet ? (
                <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">{activeSheet.name}</h4>
                      <span className="text-[10px] text-slate-500 font-mono">ID: {activeSheet.id}</span>
                    </div>
                    <a
                      href={activeSheet.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-emerald-300 text-emerald-800 text-xs font-bold hover:bg-emerald-50"
                    >
                      <span>Open Sheet</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenSyncModal}
                    className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Sync Now or Change Sheet &rarr;
                  </button>
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-3">
                  <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-600">No Google Sheet connected to this device.</p>
                  <button
                    type="button"
                    onClick={onOpenSyncModal}
                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                  >
                    Connect Google Sheets
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* SUB-PAGE 5: DATA MANAGEMENT & BACKUPS                          */}
        {/* ============================================================== */}
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
                Money Tracker operates offline-first. Your financial data, debts, and categories never leave your browser storage unless you choose to sync with your personal Google Sheets account.
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
      </div>

      {/* Delete Category Confirm Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-rose-600">
              <Trash2 className="w-5 h-5" />
              <h3 className="font-bold text-sm text-slate-900">Delete Category?</h3>
            </div>
            <p className="text-xs text-slate-600">
              Remove &quot;{deleteCandidate.name}&quot;? Existing past transactions will keep their label.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCategory}
                className="px-4 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Defaults Confirm Modal */}
      {showResetCatConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <RotateCcw className="w-5 h-5 text-emerald-600" />
              <h3 className="font-bold text-sm text-slate-900">Restore Standard Categories</h3>
            </div>
            <p className="text-xs text-slate-600">
              Reset category catalog back to Food, Transport, Bills, Shopping, Entertainment, etc.?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetCatConfirm(false)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetCategories}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
};
