import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft,
  FileSpreadsheet, 
  ExternalLink, 
  RefreshCw, 
  UploadCloud, 
  DownloadCloud,
  Check, 
  AlertCircle,
  Copy,
  Download,
  FolderOpen,
  Link,
  Plus,
  Search,
  CheckCircle2,
  ShieldCheck,
  Unlink,
  Table2,
  HandCoins,
  Trash2
} from 'lucide-react';
import { GoogleSheetMeta, LendItem, Transaction } from '../types/finance';
import { 
  listUserSpreadsheets, 
  createMoneyTrackerSpreadsheet, 
  requestGoogleAccessToken,
  deleteUserSpreadsheet,
  DriveSpreadsheetItem,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  extractSpreadsheetId,
  fetchSpreadsheetTitle
} from '../lib/sheetsApi';
import { 
  loadStoredWebhookUrl, 
  saveStoredWebhookUrl 
} from '../lib/storage';

interface SheetManagerViewProps {
  onBack: () => void;
  accessToken: string | null;
  activeSheet: GoogleSheetMeta | null;
  onSetActiveSheet: (sheet: GoogleSheetMeta | null) => void;
  onPushToSheet: () => Promise<unknown>;
  onPullFromSheet: (sheetId?: string, token?: string) => Promise<unknown>;
  onSignInDirect?: () => void;
  onExportCSV?: () => void;
  isSyncing?: boolean;
  totalTransactionsCount?: number;
  totalLendCount?: number;
  transactions?: Transaction[];
  lendItems?: LendItem[];
  onNotification?: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

type SheetMenuTab = 'sheets' | 'drive' | 'webhook';

export const SheetManagerView: React.FC<SheetManagerViewProps> = ({
  onBack,
  accessToken,
  activeSheet,
  onSetActiveSheet,
  onPushToSheet,
  onPullFromSheet,
  onSignInDirect = () => undefined,
  onExportCSV = () => undefined,
  isSyncing = false,
  totalTransactionsCount = 0,
  totalLendCount = 0,
  transactions = [],
  lendItems = [],
  onNotification,
}) => {
  const [activeTab, setActiveTab] = useState<SheetMenuTab>('sheets');
  const [spreadsheets, setSpreadsheets] = useState<DriveSpreadsheetItem[]>([]);
  const [driveSearch, setDriveSearch] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [newTitle, setNewTitle] = useState('SpendDesk - Cash & Card');
  const [isCreating, setIsCreating] = useState(false);
  const [deletingSheetId, setDeletingSheetId] = useState<string | null>(null);
  const [webhookInput, setWebhookInput] = useState(() => loadStoredWebhookUrl());
  const [linkUrlInput, setLinkUrlInput] = useState('');
  const [isLinkingUrl, setIsLinkingUrl] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Auto load Drive sheets when switching to 'drive' tab or authenticated
  useEffect(() => {
    if (accessToken && activeTab === 'drive' && spreadsheets.length === 0) {
      loadDriveSheets();
    }
  }, [accessToken, activeTab]);

  const loadDriveSheets = async () => {
    if (!accessToken || accessToken === 'local_token') return;
    setLoadingList(true);
    setErrorMsg('');
    try {
      const items = await listUserSpreadsheets(accessToken);
      setSpreadsheets(items);
    } catch (err: any) {
      console.warn('Google Drive list error:', err);
    } finally {
      setLoadingList(false);
    }
  };

  const handleCreateNewSheet = async () => {
    setIsCreating(true);
    setErrorMsg('');
    setSuccessMsg('');
    const title = newTitle.trim() || 'SpendDesk - Cash & Card';

    try {
      let token = accessToken;

      if (!token || token === 'local_token' || token.length < 30) {
        token = await requestGoogleAccessToken();
      }

      let created;
      try {
        created = await createMoneyTrackerSpreadsheet(token, title);
      } catch (err: any) {
        const errStr = String(err?.message || err);
        if (
          errStr.includes('401') || 
          errStr.includes('403') || 
          errStr.includes('UNAUTHENTICATED') || 
          errStr.includes('INSUFFICIENT') ||
          errStr.includes('PERMISSION_DENIED')
        ) {
          try { localStorage.removeItem('money_tracker_access_token'); } catch (e) {}
          token = await requestGoogleAccessToken();
          created = await createMoneyTrackerSpreadsheet(token, title);
        } else {
          throw err;
        }
      }

      const newMeta: GoogleSheetMeta = {
        id: created.id,
        name: created.name,
        url: created.url,
        lastSyncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      onSetActiveSheet(newMeta);
      setSuccessMsg(`Created "${created.name}" in your Google Drive!`);
      onNotification?.(`Created "${created.name}" in your Google Drive!`, 'success');

      try { await onPushToSheet(); } catch (e) { console.warn(e); }

      if (created.url) {
        window.open(created.url, '_blank');
      }
    } catch (err: any) {
      console.error(err);
      const raw = String(err?.message || err);
      if (raw.includes('sheets.googleapis.com') || raw.includes('GOOGLE_SHEETS_API_DISABLED')) {
        setErrorMsg('Google Sheets API is not enabled in your Google Cloud account. Please click the button below to enable it.');
      } else if (raw.includes('drive.googleapis.com') || raw.includes('GOOGLE_DRIVE_API_DISABLED')) {
        setErrorMsg('Google Drive API is not enabled in your Google Cloud account. Please click the button below to enable it.');
      } else if (raw.includes('invalid_client') || raw.includes('401')) {
        setErrorMsg('Google Sign-In session expired or permission denied. Please sign in again.');
      } else {
        setErrorMsg('Unable to connect to Google Sheets. Please check your network connection and try again.');
      }
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
    setSuccessMsg(`Connecting to "${item.name}" and fetching records...`);
    onNotification?.(`Connecting to "${item.name}"...`, 'info');
    setActiveTab('sheets');
    try {
      await onPullFromSheet(item.id, accessToken || undefined);
      setSuccessMsg(`Connected to "${item.name}"! Showing only this sheet's records.`);
      onNotification?.(`Loaded records from "${item.name}"!`, 'success');
    } catch (e: any) {
      console.warn('Pull on select error:', e);
      setErrorMsg(e?.message || 'Could not load records from this sheet.');
    }
  };

  const handleSaveWebhook = () => {
    const url = webhookInput.trim();
    saveStoredWebhookUrl(url);
    setSuccessMsg(url ? 'Apps Script Webhook URL saved successfully!' : 'Webhook URL cleared.');
    onNotification?.(url ? 'Webhook URL saved.' : 'Webhook cleared.', 'info');
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
    onNotification?.('Apps Script code copied to clipboard!', 'success');
  };

  const handleDisconnect = () => {
    onSetActiveSheet(null);
    setSuccessMsg('Google Sheet disconnected.');
    onNotification?.('Google Sheet disconnected.', 'info');
  };

  const handleLinkSheetByUrl = async () => {
    const raw = linkUrlInput.trim();
    if (!raw) return;
    const sheetId = extractSpreadsheetId(raw);
    if (!sheetId) {
      setErrorMsg('Invalid Google Sheet link or ID. Please paste a valid link like https://docs.google.com/spreadsheets/d/.../edit');
      return;
    }

    setIsLinkingUrl(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      let token = accessToken;
      let title = 'Linked Google Sheet';

      if (token && token !== 'local_token' && token.length > 20) {
        try {
          title = await fetchSpreadsheetTitle(token, sheetId);
        } catch {}
      }

      const meta: GoogleSheetMeta = {
        id: sheetId,
        name: title,
        url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
        lastSyncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      onSetActiveSheet(meta);
      setLinkUrlInput('');
      const msg = `Connected to "${title}"! Loading records...`;
      setSuccessMsg(msg);
      onNotification?.(msg, 'info');
      try {
        await onPullFromSheet(sheetId, token || undefined);
        setSuccessMsg(`Connected to "${title}"! Showing only this sheet's records.`);
        onNotification?.(`Loaded records from "${title}"!`, 'success');
      } catch (e: any) {
        console.warn('Pull on link error:', e);
        setErrorMsg(e?.message || 'Could not load records from this sheet.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not connect spreadsheet.');
    } finally {
      setIsLinkingUrl(false);
    }
  };

  const handleDeleteDriveSheet = async (item: DriveSpreadsheetItem) => {
    if (!window.confirm(`Permanently delete "${item.name}" from Google Drive? This cannot be undone.`)) return;
    setDeletingSheetId(item.id);
    setErrorMsg('');
    try {
      let token = accessToken;
      if (!token || token === 'local_token') token = await requestGoogleAccessToken();
      await deleteUserSpreadsheet(token, item.id);
      setSpreadsheets((current) => current.filter((sheet) => sheet.id !== item.id));
      if (activeSheet?.id === item.id) onSetActiveSheet(null);
      const message = `Deleted "${item.name}" from Google Drive.`;
      setSuccessMsg(message);
      onNotification?.(message, 'success');
    } catch (error: any) {
      setErrorMsg(error?.message || 'Could not delete this spreadsheet.');
    } finally {
      setDeletingSheetId(null);
    }
  };

  const filteredDriveSheets = spreadsheets.filter((s) =>
    s.name.toLowerCase().includes(driveSearch.toLowerCase())
  );
  const recentTransactions = [...transactions].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  const recentLends = [...lendItems].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const formatAmount = (amount: number) => `Rs ${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen bg-slate-50/60 pb-24 animate-in fade-in duration-200">
      {/* Top Minimalist App Bar */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer flex items-center justify-center"
            title="Back"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
          </button>

          <h1 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Google Sheets Manager</span>
          </h1>

          <div className="w-9" />
        </div>
      </div>

      <div className="max-w-2xl md:max-w-4xl mx-auto px-4 pt-6 space-y-6">
        {/* Main Card */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs flex flex-col min-h-[580px] overflow-hidden">
          {/* Connected spreadsheet header */}
          <div className="p-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100/70 text-emerald-800 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {activeSheet ? activeSheet.name : 'No Spreadsheet Connected'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {activeSheet ? (
                    <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Connected · Last saved: {activeSheet.lastSyncedAt || 'Not yet'}
                    </span>
                  ) : (
                    'Choose a Google Sheet as your personal backup ledger'
                  )}
                </p>
              </div>
            </div>

            {activeSheet && (
              <a
                href={activeSheet.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 shadow-2xs transition-colors"
              >
                <span>Open Sheet</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            )}
          </div>

          {/* 3 Menu Tabs: Sheets | Drive | Webhook */}
          <div className="px-5 pt-3.5 pb-2 bg-white border-b border-slate-100">
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100/90 rounded-2xl">
              <button
                type="button"
                onClick={() => setActiveTab('sheets')}
                className={`py-2 px-2 text-center font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'sheets'
                    ? 'bg-white text-emerald-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>Sheets</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('drive');
                  if (accessToken && spreadsheets.length === 0) {
                    loadDriveSheets();
                  }
                }}
                className={`py-2 px-2 text-center font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'drive'
                    ? 'bg-white text-emerald-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FolderOpen className="w-4 h-4 shrink-0 text-blue-600" />
                <span>Drive</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('webhook')}
                className={`py-2 px-2 text-center font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'webhook'
                    ? 'bg-white text-emerald-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Link className="w-4 h-4 shrink-0 text-indigo-600" />
                <span>Webhook</span>
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-5 sm:p-6 space-y-4 flex-1 flex flex-col justify-between">
            <div>
              {/* Error Alert Banner */}
              {errorMsg && (
                <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold text-rose-900">
                        Connection Update Required
                      </p>
                      <p className="mt-1 text-[11px] text-rose-700 leading-relaxed">
                        {errorMsg}
                      </p>
                    </div>
                  </div>

                  {(errorMsg.includes('Google Sheets API') || errorMsg.includes('Google Drive API')) && (
                    <div className="pt-2 border-t border-rose-200/80 flex flex-wrap items-center gap-2">
                      <a
                        href="https://console.cloud.google.com/apis/library/sheets.googleapis.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold text-[11px] inline-flex items-center gap-1 shadow-2xs"
                      >
                        <span>Enable Google Sheets API</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <a
                        href="https://console.cloud.google.com/apis/library/drive.googleapis.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-[11px] inline-flex items-center gap-1 shadow-2xs"
                      >
                        <span>Enable Google Drive API</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Success Alert Banner */}
              {successMsg && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* ==================== TAB 1: SHEETS ==================== */}
              {activeTab === 'sheets' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  {/* Connected Sheet Controls */}
                  {activeSheet ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 border border-slate-200 rounded-2xl overflow-hidden bg-white divide-x divide-slate-100">
                        <div className="p-3.5"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Transactions</span><span className="mt-1 block text-lg font-black text-slate-900">{totalTransactionsCount}</span></div>
                        <div className="p-3.5"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Lend / Borrow</span><span className="mt-1 block text-lg font-black text-slate-900">{totalLendCount}</span></div>
                        <div className="hidden sm:block p-3.5"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Sync status</span><span className="mt-1 flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Ready</span></div>
                      </div>

                      {/* Push & Pull Buttons */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => void onPushToSheet()}
                          disabled={isSyncing}
                          className="p-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
                        >
                          <UploadCloud className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
                          <span>{isSyncing ? 'Syncing...' : 'Push to Sheet'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void onPullFromSheet()}
                          disabled={isSyncing}
                          className="p-4 rounded-2xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
                        >
                          <DownloadCloud className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
                          <span>Pull from Sheet</span>
                        </button>
                      </div>

                      <div className="pt-1 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={handleDisconnect}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1.5 cursor-pointer py-1"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                          <span>Disconnect Sheet</span>
                        </button>

                        <button
                          type="button"
                          onClick={onExportCSV}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer py-1"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-500" />
                          <span>Download CSV Backup</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 rounded-3xl bg-slate-50/70 border border-slate-200 text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
                        <FileSpreadsheet className="w-6 h-6" />
                      </div>
                      <div className="max-w-xs mx-auto">
                        <h4 className="font-bold text-slate-900 text-sm">
                          No Sheet Connected
                        </h4>
                        <p className="text-xs text-slate-500 mt-1">
                          Create a new dedicated SpendDesk sheet below or select an existing sheet from the Drive tab.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Create New Dedicated Sheet Block */}
                  <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-3">
                    <h4 className="font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Create New SpendDesk Spreadsheet</span>
                    </h4>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="e.g. SpendDesk - My Wallet 2026"
                        className="flex-1 px-3 py-2 rounded-xl border border-emerald-300/80 bg-white text-xs font-medium text-slate-900 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={handleCreateNewSheet}
                        disabled={isCreating}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        {isCreating ? 'Creating...' : 'Create & Link'}
                      </button>
                    </div>
                  </div>

                  {/* Link Existing Sheet by URL / ID Block */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
                    <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <Link className="w-3.5 h-3.5 text-slate-600" />
                      <span>Link Existing Google Sheet via URL or ID</span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Already have a spreadsheet? Paste its link or Spreadsheet ID below to connect it directly.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={linkUrlInput}
                        onChange={(e) => setLinkUrlInput(e.target.value)}
                        placeholder="Paste https://docs.google.com/spreadsheets/d/.../edit"
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-900 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={handleLinkSheetByUrl}
                        disabled={isLinkingUrl || !linkUrlInput.trim()}
                        className="px-4 py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer disabled:opacity-40 whitespace-nowrap"
                      >
                        {isLinkingUrl ? 'Connecting...' : 'Connect Sheet'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ==================== TAB 2: DRIVE ==================== */}
              {activeTab === 'drive' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-slate-700">
                        Connect Existing Google Drive Sheet
                      </h4>
                      <button
                        type="button"
                        onClick={loadDriveSheets}
                        disabled={loadingList}
                        className="text-[11px] font-semibold text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${loadingList ? 'animate-spin' : ''}`} />
                        <span>Refresh List</span>
                      </button>
                    </div>

                    {accessToken ? (
                      <>
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                          <input
                            type="text"
                            value={driveSearch}
                            onChange={(e) => setDriveSearch(e.target.value)}
                            placeholder="Search your Google Drive spreadsheets..."
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden"
                          />
                        </div>

                        <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100">
                          {loadingList ? (
                            <div className="p-6 text-center text-xs text-slate-400">
                              Loading spreadsheets from your Google Drive...
                            </div>
                          ) : filteredDriveSheets.length === 0 ? (
                            <div className="p-6 text-center text-xs text-slate-400">
                              No spreadsheets found matching your search.
                            </div>
                          ) : (
                            filteredDriveSheets.map((item) => {
                              const isConnected = activeSheet?.id === item.id;
                              return (
                                <div
                                  key={item.id}
                                  className={`pt-2 flex items-center justify-between p-2.5 rounded-xl transition-colors ${
                                    isConnected
                                      ? 'bg-emerald-50/80 border border-emerald-200/90'
                                      : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="min-w-0 pr-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-xs text-slate-800 block truncate">
                                        {item.name}
                                      </span>
                                      {isConnected && (
                                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold inline-flex items-center gap-1 shrink-0">
                                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                          Connected
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-slate-400 block mt-0.5">
                                      Modified: {item.modifiedTime ? new Date(item.modifiedTime).toLocaleDateString() : 'N/A'}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {isConnected ? (
                                      <span className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1">
                                        <CheckCircle2 className="w-3.5 h-3.5" /> Active
                                      </span>
                                    ) : (
                                      <button type="button" onClick={() => handleSelectExisting(item)} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 text-xs font-bold cursor-pointer transition-colors">
                                        Connect
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteDriveSheet(item)}
                                      disabled={deletingSheetId === item.id}
                                      title={`Delete ${item.name}`}
                                      aria-label={`Delete ${item.name}`}
                                      className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-3">
                        <p className="text-xs text-slate-500">
                          Sign in with Google to automatically browse and connect existing spreadsheets from your Drive.
                        </p>
                        <button
                          type="button"
                          onClick={onSignInDirect}
                          className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-xs inline-flex items-center gap-2 cursor-pointer"
                        >
                          <span>Sign in with Google</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ==================== TAB 3: WEBHOOK ==================== */}
              {activeTab === 'webhook' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200/80 space-y-2">
                    <h4 className="font-bold text-xs text-indigo-950 flex items-center gap-1.5">
                      <Link className="w-3.5 h-3.5 text-indigo-700" />
                      <span>Google Apps Script Webhook (Zero OAuth Setup)</span>
                    </h4>
                    <p className="text-[11px] text-indigo-900/80 leading-relaxed">
                      If you prefer automatic background syncing without popup logins, deploy a free Google Apps Script web app and paste its URL below.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Webhook URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={webhookInput}
                        onChange={(e) => setWebhookInput(e.target.value)}
                        placeholder="https://script.google.com/macros/s/.../exec"
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={handleSaveWebhook}
                        className="px-4 py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-medium">
                      Apps Script Code Template
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyScript}
                      className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedScript ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>Copy Script</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom info footer */}
            <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Encrypted Local & Cloud Sync</span>
              </span>
              <span>All records synced safely</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
