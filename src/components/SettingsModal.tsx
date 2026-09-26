import React, { useState, useMemo } from 'react';
import { 
  X, 
  Settings as SettingsIcon, 
  Tag, 
  Plus, 
  Edit2, 
  Trash2, 
  Check, 
  Search, 
  Download, 
  FileSpreadsheet, 
  Phone, 
  Coins, 
  ShieldAlert, 
  Info, 
  Sliders, 
  Database,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { ICON_CATALOG, ICON_MAP, getCategoryIcon } from '../lib/icons';
import { 
  loadStoredCustomCategoryDefs, 
  saveStoredCustomCategoryDefs, 
  CustomCategoryDef 
} from '../lib/storage';
import { GoogleSheetMeta } from '../types/finance';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currency: string;
  onUpdateCurrency: (curr: string) => void;
  alertPhone: string;
  onUpdateAlertPhone: (phone: string) => void;
  activeSheet: GoogleSheetMeta | null;
  onOpenSyncModal: () => void;
  onExportCSV: () => void;
  onResetAllData?: () => void;
  initialTab?: 'categories' | 'preferences' | 'data' | 'about';
  onCategoriesUpdated?: () => void;
}

const DEFAULT_CATEGORIES = [
  { name: 'Food', iconName: 'Utensils', isDefault: true },
  { name: 'Transport', iconName: 'Car', isDefault: true },
  { name: 'Shopping', iconName: 'ShoppingBag', isDefault: true },
  { name: 'Bills', iconName: 'Zap', isDefault: true },
  { name: 'Entertainment', iconName: 'Film', isDefault: true },
  { name: 'Education', iconName: 'GraduationCap', isDefault: true },
  { name: 'Other', iconName: 'MoreHorizontal', isDefault: true },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currency,
  onUpdateCurrency,
  alertPhone,
  onUpdateAlertPhone,
  activeSheet,
  onOpenSyncModal,
  onExportCSV,
  onResetAllData,
  initialTab = 'categories',
  onCategoriesUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'categories' | 'preferences' | 'data' | 'about'>(initialTab);

  // Category State
  const [customDefs, setCustomDefs] = useState<CustomCategoryDef[]>(() => loadStoredCustomCategoryDefs());
  const [catSearch, setCatSearch] = useState('');
  
  // Category Form State (Add / Edit)
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [selectedIconName, setSelectedIconName] = useState('Tag');
  const [iconSearchQuery, setIconSearchQuery] = useState('');
  const [iconFilterCat, setIconFilterCat] = useState<string>('all');
  
  // Edit Category State
  const [editingCat, setEditingCat] = useState<CustomCategoryDef | null>(null);
  const [editName, setEditName] = useState('');
  const [editIconName, setEditIconName] = useState('Tag');

  // Preferences Form State
  const [phoneInput, setPhoneInput] = useState(alertPhone);
  const [currencyInput, setCurrencyInput] = useState(currency);
  const [savedSuccessMsg, setSavedSuccessMsg] = useState('');

  // Delete Confirm Dialog
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter icons in icon picker
  const filteredCatalog = ICON_CATALOG.filter((item) => {
    if (iconFilterCat !== 'all' && item.category !== iconFilterCat) return false;
    if (iconSearchQuery.trim()) {
      const q = iconSearchQuery.toLowerCase();
      return (
        item.label.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Handle Save New Category
  const handleSaveNewCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCatName.trim();
    if (!trimmed) return;

    // Check duplicate
    if (
      DEFAULT_CATEGORIES.some((c) => c.name.toLowerCase() === trimmed.toLowerCase()) ||
      customDefs.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      alert('A category with this name already exists.');
      return;
    }

    const newDef: CustomCategoryDef = {
      name: trimmed,
      iconName: selectedIconName || 'Tag',
    };
    const updated = [...customDefs, newDef];
    setCustomDefs(updated);
    saveStoredCustomCategoryDefs(updated);
    onCategoriesUpdated?.();

    setNewCatName('');
    setIsAddingCategory(false);
    setIconSearchQuery('');
  };

  // Handle Save Edited Category
  const handleSaveEditedCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCat) return;
    const trimmed = editName.trim();
    if (!trimmed) return;

    const updated = customDefs.map((c) => {
      if (c.name === editingCat.name) {
        return { name: trimmed, iconName: editIconName || 'Tag' };
      }
      return c;
    });

    setCustomDefs(updated);
    saveStoredCustomCategoryDefs(updated);
    onCategoriesUpdated?.();
    setEditingCat(null);
  };

  // Handle Delete Category
  const handleDeleteCategory = (catName: string) => {
    const updated = customDefs.filter((c) => c.name !== catName);
    setCustomDefs(updated);
    saveStoredCustomCategoryDefs(updated);
    onCategoriesUpdated?.();
    setDeleteCandidate(null);
  };

  const handleSavePreferences = () => {
    onUpdateCurrency(currencyInput.trim() || 'Rs');
    onUpdateAlertPhone(phoneInput.trim());
    setSavedSuccessMsg('Preferences saved successfully!');
    setTimeout(() => setSavedSuccessMsg(''), 2500);
  };

  const SelectedPreviewIcon = getCategoryIcon(selectedIconName);
  const EditPreviewIcon = getCategoryIcon(editIconName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg sm:max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-900 text-white">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                Settings &amp; Management
              </h3>
              <p className="text-[11px] text-slate-500">
                Manage categories, preferences, and backups
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top 4 Tabs Navigation */}
        <div className="px-5 pt-3 pb-1 bg-white border-b border-slate-100">
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`py-2 px-1 text-center font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'categories'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Tag className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              <span className="truncate">Categories</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('preferences')}
              className={`py-2 px-1 text-center font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'preferences'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 shrink-0 text-blue-600" />
              <span className="truncate">Preferences</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('data')}
              className={`py-2 px-1 text-center font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'data'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Database className="w-3.5 h-3.5 shrink-0 text-purple-600" />
              <span className="truncate">Data &amp; Sync</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('about')}
              className={`py-2 px-1 text-center font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'about'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Info className="w-3.5 h-3.5 shrink-0 text-slate-500" />
              <span className="truncate">About</span>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm flex-1">
          {savedSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{savedSuccessMsg}</span>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 1: CATEGORIES (Main User Request with Huge Icon Picker)     */}
          {/* ============================================================== */}
          {activeTab === 'categories' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Category Actions Header */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">
                    Expense &amp; Income Categories
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {DEFAULT_CATEGORIES.length} default &bull; {customDefs.length} custom categories
                  </p>
                </div>

                {!isAddingCategory && !editingCat && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCategory(true);
                      setNewCatName('');
                      setSelectedIconName('Tag');
                    }}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>+ Add New Category</span>
                  </button>
                )}
              </div>

              {/* Add New Category Form with Huge Searchable Icon Picker */}
              {isAddingCategory && (
                <form 
                  onSubmit={handleSaveNewCategory}
                  className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-3.5 animate-in fade-in"
                >
                  <div className="flex items-center justify-between border-b border-emerald-200/80 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-600 text-white shadow-2xs">
                        <SelectedPreviewIcon className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-slate-900">
                        Create New Category
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddingCategory(false)}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Name Input */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                      Category Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Gym, Medicine, Pet Food, Coffee, Flight..."
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-hidden focus:border-emerald-600"
                      autoFocus
                    />
                  </div>

                  {/* Huge Icon Library Picker */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Choose Icon ({filteredCatalog.length} available):
                      </label>

                      {/* Icon Search Field */}
                      <div className="relative w-44">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search icon..."
                          value={iconSearchQuery}
                          onChange={(e) => setIconSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden"
                        />
                      </div>
                    </div>

                    {/* Category Filter Chips for Icons */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] font-semibold text-slate-600">
                      {[
                        { id: 'all', label: 'All' },
                        { id: 'food', label: 'Food' },
                        { id: 'transport', label: 'Transport' },
                        { id: 'shopping', label: 'Shopping' },
                        { id: 'bills', label: 'Bills' },
                        { id: 'health', label: 'Health' },
                        { id: 'home', label: 'Home' },
                        { id: 'leisure', label: 'Leisure' },
                        { id: 'finance', label: 'Finance' },
                        { id: 'work', label: 'Work' },
                      ].map((chip) => (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => setIconFilterCat(chip.id)}
                          className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors shrink-0 ${
                            iconFilterCat === chip.id
                              ? 'bg-slate-900 text-white font-bold'
                              : 'bg-white hover:bg-slate-200 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>

                    {/* Icons Grid (Scrollable) */}
                    <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 p-2 bg-white border border-emerald-200/80 rounded-xl max-h-40 overflow-y-auto">
                      {filteredCatalog.map((item) => {
                        const IconComp = item.component;
                        const isSelected = selectedIconName === item.name;
                        return (
                          <button
                            key={item.name}
                            type="button"
                            onClick={() => setSelectedIconName(item.name)}
                            title={item.label}
                            className={`p-2 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-600 text-white shadow-2xs scale-105'
                                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            <IconComp className="w-4 h-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Form Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-emerald-200/60">
                    <button
                      type="button"
                      onClick={() => setIsAddingCategory(false)}
                      className="px-3.5 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newCatName.trim()}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold cursor-pointer shadow-2xs transition-colors"
                    >
                      Create Category
                    </button>
                  </div>
                </form>
              )}

              {/* Edit Category Modal Form */}
              {editingCat && (
                <form 
                  onSubmit={handleSaveEditedCategory}
                  className="p-4 bg-blue-50/80 border border-blue-200 rounded-2xl space-y-3.5 animate-in fade-in"
                >
                  <div className="flex items-center justify-between border-b border-blue-200/80 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-blue-600 text-white shadow-2xs">
                        <EditPreviewIcon className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-slate-900">
                        Edit Category: {editingCat.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingCat(null)}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Name Input */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                      Category Name
                    </label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-hidden focus:border-blue-600"
                    />
                  </div>

                  {/* Icon Selector for Edit */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Choose Icon:
                    </label>
                    <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 p-2 bg-white border border-blue-200/80 rounded-xl max-h-36 overflow-y-auto">
                      {ICON_CATALOG.map((item) => {
                        const IconComp = item.component;
                        const isSelected = editIconName === item.name;
                        return (
                          <button
                            key={item.name}
                            type="button"
                            onClick={() => setEditIconName(item.name)}
                            title={item.label}
                            className={`p-2 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-2xs scale-105'
                                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <IconComp className="w-4 h-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Form Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-blue-200/60">
                    <button
                      type="button"
                      onClick={() => setEditingCat(null)}
                      className="px-3.5 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!editName.trim()}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-2xs transition-colors"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              )}

              {/* Category Search Filter */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={catSearch}
                  onChange={(e) => setCatSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white"
                />
              </div>

              {/* Combined Categories List */}
              <div className="space-y-2">
                {/* Custom Categories Section */}
                {customDefs.length > 0 && (
                  <div>
                    <h5 className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg inline-block mb-2">
                      Custom Categories ({customDefs.length})
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {customDefs
                        .filter((c) => c.name.toLowerCase().includes(catSearch.toLowerCase()))
                        .map((cat) => {
                          const IconComp = getCategoryIcon(cat.iconName);
                          return (
                            <div
                              key={cat.name}
                              className="p-3 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 shadow-2xs flex items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 shrink-0">
                                  <IconComp className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <h6 className="font-bold text-xs text-slate-900 truncate">
                                    {cat.name}
                                  </h6>
                                  <span className="text-[10px] text-slate-400">
                                    Custom Category
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCat(cat);
                                    setEditName(cat.name);
                                    setEditIconName(cat.iconName);
                                    setIsAddingCategory(false);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                                  title="Edit category"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteCandidate(cat.name)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
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

                {/* Default Categories Section */}
                <div className="pt-2">
                  <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Default Standard Categories ({DEFAULT_CATEGORIES.length})
                  </h5>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {DEFAULT_CATEGORIES
                      .filter((c) => c.name.toLowerCase().includes(catSearch.toLowerCase()))
                      .map((cat) => {
                        const IconComp = getCategoryIcon(cat.iconName);
                        return (
                          <div
                            key={cat.name}
                            className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="p-1.5 rounded-lg bg-white text-slate-600 shrink-0">
                                <IconComp className="w-3.5 h-3.5" />
                              </div>
                              <span className="font-semibold text-xs text-slate-800 truncate">
                                {cat.name}
                              </span>
                            </div>
                            <span className="text-[9px] font-bold uppercase text-slate-400 px-1.5 py-0.5 bg-white rounded-md shrink-0">
                              Default
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: PREFERENCES (Currency, Alert Phone)                      */}
          {/* ============================================================== */}
          {activeTab === 'preferences' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Currency Symbol Selection */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-bold text-xs sm:text-sm text-slate-900">
                    Currency Symbol
                  </h4>
                </div>
                <p className="text-[11px] text-slate-500">
                  Select your default currency symbol to display across all cards, ledgers, and modals.
                </p>

                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                  {['Rs', '₹', '$', '€', '£', 'AED', 'SGD', 'MYR'].map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => setCurrencyInput(sym)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                        currencyInput === sym
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-slate-500">Custom Symbol:</span>
                  <input
                    type="text"
                    value={currencyInput}
                    onChange={(e) => setCurrencyInput(e.target.value)}
                    className="w-24 px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-xl font-bold text-center"
                    placeholder="e.g. LKR"
                  />
                </div>
              </div>

              {/* Default Phone for SMS Alerts */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-blue-600" />
                  <h4 className="font-bold text-xs sm:text-sm text-slate-900">
                    Default SMS Alert Phone
                  </h4>
                </div>
                <p className="text-[11px] text-slate-500">
                  Auto-fill this phone number when sending 1-tap reminders for debts or expense notifications.
                </p>

                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    placeholder="0771234567"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Save Preferences Button */}
              <button
                type="button"
                onClick={handleSavePreferences}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs transition-colors"
              >
                Save Preferences
              </button>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: DATA & BACKUP (Export CSV, Google Sheets, Reset)         */}
          {/* ============================================================== */}
          {activeTab === 'data' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Google Sheets Integration Card */}
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                    <h4 className="font-bold text-xs sm:text-sm text-slate-900">
                      Google Sheets Backup
                    </h4>
                  </div>
                  {activeSheet && (
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Connected
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600">
                  {activeSheet
                    ? `Currently linked to "${activeSheet.name}". Sync push and pull data anytime.`
                    : 'Not currently linked to a Google Sheet.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSyncModal();
                  }}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Google Sheets Manager</span>
                </button>
              </div>

              {/* Offline CSV Export */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-900">
                    Offline CSV Export
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Download an Excel-compatible spreadsheet of all your records right now.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onExportCSV}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0 transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>

              {/* Reset Data Danger Zone */}
              {onResetAllData && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-rose-800">
                    <ShieldAlert className="w-4 h-4" />
                    <h4 className="font-bold text-xs sm:text-sm">
                      Danger Zone: Reset Data
                    </h4>
                  </div>
                  <p className="text-[11px] text-rose-700">
                    Clear transactions and reset the ledger. Make sure to download a CSV backup first.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Are you sure you want to clear all transactions? This cannot be undone.')) {
                        onResetAllData();
                        onClose();
                      }
                    }}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  >
                    Clear All Transactions
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: ABOUT & APP INFO                                         */}
          {/* ============================================================== */}
          {activeTab === 'about' && (
            <div className="space-y-3.5 animate-in fade-in duration-150">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-bold text-xs sm:text-sm text-slate-900">
                    SpendDesk (Cash &amp; Card)
                  </h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  A high-speed, offline-first personal finance tracker built for real cash wallet balances, card accounts, debt ledgers, and instant Google Drive synchronization.
                </p>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white text-xs">
                <div className="p-3 flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Application Version</span>
                  <span className="font-bold text-slate-900">v1.2.0</span>
                </div>
                <div className="p-3 flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Storage Engine</span>
                  <span className="font-bold text-emerald-700">Offline LocalStorage + Google Drive</span>
                </div>
                <div className="p-3 flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Data Privacy</span>
                  <span className="font-bold text-slate-900">100% Private (No 3rd-party servers)</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Category Confirmation Dialog */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="w-full max-w-xs bg-white rounded-3xl shadow-2xl border border-slate-200 p-5 space-y-3">
            <h4 className="font-bold text-sm text-slate-900">Delete Category</h4>
            <p className="text-xs text-slate-500">
              Are you sure you want to delete <b>{deleteCandidate}</b>? Existing transactions with this category will remain unchanged.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteCategory(deleteCandidate)}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-2xs"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
