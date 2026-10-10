import React, { useState, useEffect } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  ExternalLink, 
  RefreshCw, 
  DownloadCloud, 
  UploadCloud, 
  Check, 
  AlertCircle,
  Copy,
  Download,
  FolderOpen,
  Link,
  Plus,
  Search,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import { GoogleSheetMeta } from '../types/finance';
import { 
  listUserSpreadsheets, 
  createMoneyTrackerSpreadsheet, 
  DriveSpreadsheetItem,
  GOOGLE_APPS_SCRIPT_TEMPLATE
} from '../lib/sheetsApi';
import { 
  loadStoredWebhookUrl, 
  saveStoredWebhookUrl 
} from '../lib/storage';

interface SheetSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string | null;
  activeSheet: GoogleSheetMeta | null;
  onSetActiveSheet: (sheet: GoogleSheetMeta | null) => void;
  onPushToSheet: () => Promise<void>;
  onPullFromSheet: () => Promise<void>;
  onSignInDirect: () => void;
  onExportCSV: () => void;
  isSyncing: boolean;
  totalTransactionsCount?: number;
  totalLendCount?: number;
}

type SheetMenuTab = 'sync' | 'drive' | 'webhook';

export const SheetSyncModal: React.FC<SheetSyncModalProps> = ({
  isOpen,
  onClose,
  accessToken,
  activeSheet,
  onSetActiveSheet,
  onPushToSheet,
  onPullFromSheet,
  onSignInDirect,
  onExportCSV,
  isSyncing,
  totalTransactionsCount = 0,
  totalLendCount = 0,
}) => {
  const [activeTab, setActiveTab] = useState<SheetMenuTab>('sync');
  const [spreadsheets, setSpreadsheets] = useState<DriveSpreadsheetItem[]>([]);
  const [driveSearch, setDriveSearch] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [newTitle, setNewTitle] = useState('SpendDesk - Cash & Card');
  const [isCreating, setIsCreating] = useState(false);
  const [webhookInput, setWebhookInput] = useState(() => loadStoredWebhookUrl());
  const [copiedScript, setCopiedScript] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Auto load Drive sheets when clicking on the 'drive' tab
  useEffect(() => {
    if (isOpen && accessToken && activeTab === 'drive' && spreadsheets.length === 0) {
      loadDriveSheets();
    }
  }, [isOpen, accessToken, activeTab]);

  const loadDriveSheets = async () => {
    if (!accessToken) return;
    setLoadingList(true);
    setErrorMsg('');
    try {
      const items = await listUserSpreadsheets(accessToken);
      setSpreadsheets(items);
    } catch (err: any) {
      console.warn(err);
      setErrorMsg('Could not list Google Drive spreadsheets.');
    } finally {
      setLoadingList(false);
    }
  };

  const handleCreateNewSheet = async () => {
    if (!accessToken) {
      onSignInDirect();
      return;
    }
    setIsCreating(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const title = newTitle.trim() || 'SpendDesk - Cash & Card';
      const created = await createMoneyTrackerSpreadsheet(accessToken, title);
      const newMeta: GoogleSheetMeta = {
        id: created.id,
        name: created.name,
        url: created.url,
        lastSyncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      onSetActiveSheet(newMeta);
      setSuccessMsg(`Created and connected "${created.name}"!`);
      await onPushToSheet();
      setActiveTab('sync');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to create spreadsheet.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelectExisting = async (item: DriveSpreadsheetItem) => {
    const meta: GoogleSheetMeta = {
      id: item.id,
      name: item.name,
      url: item.webViewLink || `https://docs.google.com/spreadsheets/d/${item.id}/edit`,
      lastSyncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    onSetActiveSheet(meta);
    setSuccessMsg(`Connected to "${item.name}". Loading records...`);
    setActiveTab('sync');
    try {
      await onPullFromSheet();
      setSuccessMsg(`Connected to "${item.name}"! Showing only this sheet's records.`);
    } catch (e: any) {
      console.warn('Pull on select error:', e);
    }
  };

  const handleSaveWebhook = () => {
    const url = webhookInput.trim();
    saveStoredWebhookUrl(url);
    setSuccessMsg(url ? 'Apps Script Webhook URL saved!' : 'Webhook URL cleared.');
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const filteredDriveSheets = spreadsheets.filter((s) =>
    s.name.toLowerCase().includes(driveSearch.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-md sm:max-w-lg h-[580px] max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                Google Sheets Manager
              </h3>
              <p className="text-[11px] text-slate-500 md:text-xs">
                {activeSheet ? (
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Connected to {activeSheet.name}
                  </span>
                ) : (
                  'Sync your finance data with Google Drive'
                )}
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

        {/* 3 Short Menu Tabs with Fixed Layout */}
        <div className="px-5 pt-3.5 pb-1 bg-white shrink-0">
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => setActiveTab('sync')}
              className={`py-2 px-1 text-center font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'sync'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              } md:text-sm`}
            >
              <UploadCloud className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              <span>Sync</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('drive');
                if (accessToken && spreadsheets.length === 0) {
                  loadDriveSheets();
                }
              }}
              className={`py-2 px-1 text-center font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'drive'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              } md:text-sm`}
            >
              <FolderOpen className="w-3.5 h-3.5 shrink-0 text-blue-600" />
              <span>Sheets</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('webhook')}
              className={`py-2 px-1 text-center font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'webhook'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              } md:text-sm`}
            >
              <Link className="w-3.5 h-3.5 shrink-0 text-purple-600" />
              <span>Webhook</span>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm flex-1">
          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2 md:text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 md:text-sm">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ==================== TAB 1: GOOGLE SYNC ==================== */}
          {activeTab === 'sync' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {activeSheet ? (
                /* Connected Sheet Card */
                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider md:text-xs">
                          Active Google Sheet
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm sm:text-base truncate mt-0.5">
                        {activeSheet.name}
                      </h4>
                      {activeSheet.lastSyncedAt && (
                        <p className="text-[11px] text-slate-500 mt-0.5 md:text-xs">
                          Last synchronized: {activeSheet.lastSyncedAt}
                        </p>
                      )}
                    </div>

                    <a
                      href={activeSheet.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-emerald-700 rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer md:text-sm"
                    >
                      <span>Open Sheet</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  {/* Sync Actions Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-200/60">
                    <button
                      type="button"
                      onClick={onPushToSheet}
                      disabled={isSyncing}
                      className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 transition-all md:text-sm"
                    >
                      <UploadCloud className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
                      <span>{isSyncing ? 'Syncing...' : 'Sync to Sheet (Push)'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={onPullFromSheet}
                      disabled={isSyncing}
                      className="py-2.5 px-3 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all md:text-sm"
                    >
                      <DownloadCloud className="w-4 h-4 text-blue-600" />
                      <span>Pull Data (Fetch)</span>
                    </button>
                  </div>

                  {/* Tab Breakdown Summary */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1 text-center">
                    <div className="bg-white/90 border border-emerald-100 p-2 rounded-xl">
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase md:text-xs">Dashboard</span>
                      <span className="text-xs font-bold text-emerald-800 md:text-sm">Auto KPIs</span>
                    </div>
                    <div className="bg-white/90 border border-emerald-100 p-2 rounded-xl">
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase md:text-xs">Transactions</span>
                      <span className="text-xs font-bold text-slate-800 md:text-sm">{totalTransactionsCount} rows</span>
                    </div>
                    <div className="bg-white/90 border border-emerald-100 p-2 rounded-xl">
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase md:text-xs">Lend & Debt</span>
                      <span className="text-xs font-bold text-slate-800 md:text-sm">{totalLendCount} rows</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Not Connected Card */
                <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-2xs">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-base">
                      No Google Sheet Connected
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto md:text-sm">
                      Automatically sync and backup all your cash, card, and debt entries to your Google Drive account.
                    </p>
                  </div>

                  {accessToken ? (
                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={handleCreateNewSheet}
                        disabled={isCreating}
                        className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs cursor-pointer disabled:opacity-50 transition-all flex items-center justify-center gap-2 md:text-sm"
                      >
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                        <span>{isCreating ? 'Creating in Google Drive...' : '1-Tap Create & Connect Sheet'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('drive')}
                        className="text-xs text-emerald-700 hover:underline font-semibold block mx-auto cursor-pointer md:text-sm"
                      >
                        Or choose an existing spreadsheet from Drive →
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={onSignInDirect}
                      className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs shadow-xs cursor-pointer transition-all flex items-center justify-center gap-2.5 md:text-sm"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                      </svg>
                      <span>Sign In with Google to Connect</span>
                    </button>
                  )}
                </div>
              )}

              {/* Quick Offline CSV Backup Link */}
              <div className="pt-1 flex items-center justify-between border-t border-slate-100">
                <button
                  type="button"
                  onClick={onExportCSV}
                  className="font-bold text-xs text-slate-700 hover:text-emerald-700 flex items-center gap-1.5 cursor-pointer py-1 md:text-sm"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Download Offline CSV Backup</span>
                </button>
                {activeSheet && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('drive')}
                    className="font-bold text-xs text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer py-1 md:text-sm"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Change Sheet</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ==================== TAB 2: DRIVE SHEETS ==================== */}
          {activeTab === 'drive' && (
            <div className="space-y-3.5 animate-in fade-in duration-150">
              {/* Create New Sheet Input */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <label className="text-[11px] font-bold uppercase text-slate-500 block md:text-xs">
                  Create New Tracker Sheet
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Spreadsheet Title..."
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 md:text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleCreateNewSheet}
                    disabled={isCreating}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0 disabled:opacity-50 transition-colors flex items-center gap-1 md:text-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isCreating ? 'Creating...' : 'Create'}</span>
                  </button>
                </div>
              </div>

              {/* List of existing drive sheets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-slate-700 md:text-sm">
                    Existing Drive Spreadsheets:
                  </span>
                  {accessToken && (
                    <button
                      type="button"
                      onClick={loadDriveSheets}
                      className="text-xs text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer font-semibold md:text-sm"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingList ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                  )}
                </div>

                {!accessToken ? (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-2">
                    <p className="text-xs text-slate-500 md:text-sm">Sign in with Google to view your Drive sheets.</p>
                    <button
                      type="button"
                      onClick={onSignInDirect}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer md:text-sm"
                    >
                      Sign In with Google
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Search inside drive list */}
                    {spreadsheets.length > 0 && (
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search spreadsheets..."
                          value={driveSearch}
                          onChange={(e) => setDriveSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white md:text-sm"
                        />
                      </div>
                    )}

                    {loadingList ? (
                      <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
                        <span>Searching your Google Drive spreadsheets...</span>
                      </div>
                    ) : filteredDriveSheets.length > 0 ? (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl max-h-56 overflow-y-auto bg-white shadow-2xs">
                        {filteredDriveSheets.map((item) => {
                          const isCurrentlyActive = activeSheet?.id === item.id;
                          return (
                            <div 
                              key={item.id} 
                              className={`p-3 flex items-center justify-between hover:bg-slate-50 transition-colors ${
                                isCurrentlyActive ? 'bg-emerald-50/60' : ''
                              }`}
                            >
                              <div className="min-w-0 pr-2">
                                <div className="flex items-center gap-1.5">
                                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span className="font-semibold text-xs text-slate-800 truncate md:text-sm">
                                    {item.name}
                                  </span>
                                  {isCurrentlyActive && (
                                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded-full md:text-xs">
                                      Active
                                    </span>
                                  )}
                                </div>
                                {item.modifiedTime && (
                                  <p className="text-[10px] text-slate-400 pl-5 mt-0.5 md:text-xs">
                                    Modified: {new Date(item.modifiedTime).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleSelectExisting(item)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer shrink-0 transition-colors ${
                                  isCurrentlyActive
                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                    : 'bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700'
                                } md:text-sm`}
                              >
                                {isCurrentlyActive ? 'Connected' : 'Link'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200 md:text-sm">
                        {spreadsheets.length === 0 
                          ? 'No spreadsheets found in your Google Drive.' 
                          : 'No spreadsheets matched your search.'}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ==================== TAB 3: WEBHOOK & CSV ==================== */}
          {activeTab === 'webhook' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Offline CSV Export Box */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-slate-900 text-xs sm:text-sm">
                    Offline CSV Backup
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 md:text-xs">
                    Export all transactions to an Excel-compatible CSV file instantly.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onExportCSV}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0 transition-colors flex items-center gap-1.5 shadow-2xs md:text-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download CSV</span>
                </button>
              </div>

              {/* Apps Script Webhook Configuration */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div>
                  <h4 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                    <Link className="w-4 h-4 text-purple-600" />
                    <span>Apps Script Webhook URL</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 md:text-xs">
                    Optional direct Webhook for automated background syncing without Google Drive sign-in popup.
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={webhookInput}
                    onChange={(e) => setWebhookInput(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:border-purple-500 font-mono md:text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleSaveWebhook}
                    className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0 transition-colors shadow-2xs md:text-sm"
                  >
                    Save URL
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-medium md:text-xs">
                    Need the Apps Script code?
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyScript}
                    className="text-xs text-purple-700 hover:text-purple-800 font-bold flex items-center gap-1 cursor-pointer bg-purple-50 px-2.5 py-1.5 rounded-lg border border-purple-200/60 md:text-sm"
                  >
                    {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedScript ? 'Code Copied!' : 'Copy Script Code'}</span>
                  </button>
                </div>

                {/* 3 Steps Guide */}
                <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-1.5 text-[11px] text-slate-600 md:text-xs">
                  <div className="font-bold text-slate-800 text-xs mb-1 md:text-sm">Quick Setup in 3 Steps:</div>
                  <div className="flex items-start gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-purple-100 text-purple-800 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5 md:text-xs">1</span>
                    <span>In Google Sheet, click <b>Extensions &gt; Apps Script</b>.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-purple-100 text-purple-800 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5 md:text-xs">2</span>
                    <span>Paste copied code and click <b>Deploy &gt; New deployment</b> (Web App, Access: Anyone).</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-purple-100 text-purple-800 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5 md:text-xs">3</span>
                    <span>Paste Web App URL above and click <b>Save URL</b>.</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
