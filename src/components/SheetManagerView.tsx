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
  Calendar,
  ShieldCheck,
  Unlink
} from 'lucide-react';
import { GoogleSheetMeta } from '../types/finance';
import { 
  listUserSpreadsheets, 
  createMoneyTrackerSpreadsheet, 
  requestGoogleAccessToken,
  DriveSpreadsheetItem,
  GOOGLE_APPS_SCRIPT_TEMPLATE
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
  onPushToSheet: () => Promise<void>;
  onPullFromSheet: () => Promise<void>;
  onSignInDirect: () => void;
  onExportCSV: () => void;
  isSyncing: boolean;
  totalTransactionsCount?: number;
  totalLendCount?: number;
  onNotification?: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

type SheetMenuTab = 'sync' | 'drive' | 'webhook';

export const SheetManagerView: React.FC<SheetManagerViewProps> = ({
  onBack,
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
  onNotification,
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

  const [customClientIdInput, setCustomClientIdInput] = useState(() => localStorage.getItem('money_tracker_google_client_id') || '');
  const [showClientIdConfig, setShowClientIdConfig] = useState(false);

  // Auto load Drive sheets when clicking on the 'drive' tab
  useEffect(() => {
    if (accessToken && activeTab === 'drive' && spreadsheets.length === 0) {
      loadDriveSheets();
    }
  }, [accessToken, activeTab]);

  const handleSaveCustomClientId = () => {
    const trimmed = customClientIdInput.trim();
    if (trimmed) {
      localStorage.setItem('money_tracker_google_client_id', trimmed);
      setSuccessMsg('Custom Google Client ID saved successfully!');
      onNotification?.('Custom Google Client ID saved!', 'success');
    } else {
      localStorage.removeItem('money_tracker_google_client_id');
      setSuccessMsg('Custom Client ID cleared. Using default.');
      onNotification?.('Custom Client ID cleared.', 'info');
    }
  };

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

      // If token is missing, expired, or local, prompt for Google token
      if (!token || token === 'local_token' || token.length < 30) {
        onNotification?.('Requesting Google Drive permission...', 'info');
        token = await requestGoogleAccessToken();
      }

      let created;
      try {
        created = await createMoneyTrackerSpreadsheet(token, title);
      } catch (err: any) {
        // Retry with fresh token if expired, scope insufficient, or unauthenticated (401 / 403)
        const errStr = String(err?.message || err);
        if (
          errStr.includes('401') || 
          errStr.includes('403') || 
          errStr.includes('UNAUTHENTICATED') || 
          errStr.includes('INSUFFICIENT') ||
          errStr.includes('PERMISSION_DENIED')
        ) {
          onNotification?.('Requesting Google Drive permission popup...', 'info');
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

      // Open newly created Google Sheet in a new tab for immediate verification!
      if (created.url) {
        window.open(created.url, '_blank');
      }

      setActiveTab('sync');
    } catch (err: any) {
      console.error(err);
      const msg = err.message || 'Could not create Google Sheet.';
      if (msg.includes('invalid_client') || msg.includes('401') || msg.includes('OAuth client was not found')) {
        setErrorMsg('OAuth Client Error (401: invalid_client). Google Cloud project Client ID not found. Use Apps Script Webhook (Option 1) or enter your Client ID below (Option 2).');
        setShowClientIdConfig(true);
      } else {
        setErrorMsg(msg);
      }
      onNotification?.(msg, 'error');
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
    setSuccessMsg(`Connected to "${item.name}"`);
    onNotification?.(`Connected to "${item.name}"`, 'success');
    setActiveTab('sync');
  };

  const handleSaveWebhook = () => {
    const url = webhookInput.trim();
    saveStoredWebhookUrl(url);
    setSuccessMsg(url ? 'Apps Script Webhook URL saved!' : 'Webhook URL cleared.');
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
    setSuccessMsg('Google Sheet disconnected from this device.');
    onNotification?.('Google Sheet disconnected.', 'info');
  };

  const filteredDriveSheets = spreadsheets.filter((s) =>
    s.name.toLowerCase().includes(driveSearch.toLowerCase())
  );

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

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {/* Main Card with Consistent Height */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs flex flex-col min-h-[580px] overflow-hidden">
          {/* Top Status Banner */}
          <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-slate-50 flex items-center justify-between">
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
                      Live Sync Active · Last synced: {activeSheet.lastSyncedAt || 'Just now'}
                    </span>
                  ) : (
                    'Connect a Google Sheet to enable 2-way cloud synchronization'
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
                <span>Open</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            )}
          </div>

          {/* 3 Short Menu Tabs with Fixed Sizing */}
          <div className="px-5 pt-3.5 pb-2 bg-white border-b border-slate-100">
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100/90 rounded-2xl">
              <button
                type="button"
                onClick={() => setActiveTab('sync')}
                className={`py-2 px-2 text-center font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'sync'
                    ? 'bg-white text-emerald-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UploadCloud className="w-4 h-4 shrink-0 text-emerald-600" />
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

          {/* Body Content with Fixed Sizing */}
          <div className="p-5 sm:p-6 space-y-4 flex-1 flex flex-col justify-between">
            <div>
              {errorMsg && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* ==================== TAB 1: SYNC ==================== */}
              {activeTab === 'sync' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  {activeSheet ? (
                    <div className="space-y-4">
                      {/* Active Sheet Card */}
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                              Connected Spreadsheet
                            </span>
                            <h4 className="font-bold text-sm text-slate-900 mt-0.5">
                              {activeSheet.name}
                            </h4>
                            <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate max-w-xs">
                              ID: {activeSheet.id}
                            </p>
                          </div>
                          <a
                            href={activeSheet.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-emerald-700 shadow-2xs"
                            title="Open in Google Sheets"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-200">
                          <div>
                            <span className="text-slate-400 block text-[10px]">Local Records</span>
                            <span className="font-bold text-slate-800">{totalTransactionsCount} items</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Lend/Debt</span>
                            <span className="font-bold text-slate-800">{totalLendCount} items</span>
                          </div>
                        </div>
                      </div>

                      {/* Push & Pull Actions */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={onPushToSheet}
                          disabled={isSyncing}
                          className="p-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
                        >
                          <UploadCloud className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
                          <span>{isSyncing ? 'Syncing...' : 'Push to Sheet'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={onPullFromSheet}
                          disabled={isSyncing}
                          className="p-4 rounded-2xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
                        >
                          <DownloadCloud className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
                          <span>Pull from Sheet</span>
                        </button>
                      </div>

                      {/* Disconnect Option */}
                      <div className="pt-2 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={handleDisconnect}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1.5 cursor-pointer py-1.5"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                          <span>Disconnect Sheet</span>
                        </button>

                        <button
                          type="button"
                          onClick={onExportCSV}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer py-1.5"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-500" />
                          <span>Download CSV</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 rounded-3xl bg-slate-50/70 border border-slate-200 text-center space-y-4">
                      <div className="w-14 h-14 rounded-3xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
                        <FileSpreadsheet className="w-7 h-7" />
                      </div>
                      <div className="max-w-xs mx-auto">
                        <h4 className="font-bold text-slate-900 text-sm">
                          Connect Google Sheets
                        </h4>
                        <p className="text-xs text-slate-500 mt-1">
                          Select an existing spreadsheet from your Google Drive or create a new dedicated SpendDesk sheet with one click.
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                        {accessToken ? (
                          <button
                            type="button"
                            onClick={() => setActiveTab('drive')}
                            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer"
                          >
                            Browse Google Drive Sheets
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={onSignInDirect}
                            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <span>Sign in with Google</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ==================== TAB 2: DRIVE ==================== */}
              {activeTab === 'drive' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  {/* Create New Sheet Section */}
                  <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-3">
                    <h4 className="font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Create New Dedicated Spreadsheet</span>
                    </h4>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="e.g. My Expense Tracker 2026"
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

                  {/* Custom Client ID Collapsible / Config Section */}
                  <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/90 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                        <h4 className="font-bold text-xs text-amber-950">
                          Google OAuth Client ID Configuration
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowClientIdConfig(!showClientIdConfig)}
                        className="text-[11px] font-bold text-amber-800 hover:underline cursor-pointer"
                      >
                        {showClientIdConfig ? 'Hide Settings' : 'Configure Custom Client ID'}
                      </button>
                    </div>

                    {(showClientIdConfig || errorMsg.includes('invalid_client')) && (
                      <div className="space-y-2 pt-1 border-t border-amber-200/60 animate-in fade-in duration-150">
                        <p className="text-[11px] text-amber-900/90 leading-relaxed">
                          If Google OAuth shows <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">Error 401: invalid_client</code>, enter your own Google OAuth 2.0 Web Client ID from <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline font-bold text-amber-950">Google Cloud Console</a>:
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={customClientIdInput}
                            onChange={(e) => setCustomClientIdInput(e.target.value)}
                            placeholder="e.g. 123456789-abc.apps.googleusercontent.com"
                            className="flex-1 px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={handleSaveCustomClientId}
                            className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs rounded-xl cursor-pointer"
                          >
                            Save Client ID
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Search Existing Sheets in Drive */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-slate-700">
                        Spreadsheets in your Drive
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

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        value={driveSearch}
                        onChange={(e) => setDriveSearch(e.target.value)}
                        placeholder="Search spreadsheets..."
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden"
                      />
                    </div>

                    <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100">
                      {loadingList ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          Loading spreadsheets from Google Drive...
                        </div>
                      ) : filteredDriveSheets.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          {accessToken ? 'No spreadsheets found matching your search.' : 'Sign in with Google to view your Drive sheets.'}
                        </div>
                      ) : (
                        filteredDriveSheets.map((item) => (
                          <div
                            key={item.id}
                            className="pt-2 flex items-center justify-between hover:bg-slate-50 p-2 rounded-xl transition-colors"
                          >
                            <div className="min-w-0 pr-2">
                              <span className="font-bold text-xs text-slate-800 block truncate">
                                {item.name}
                              </span>
                              <span className="text-[10px] text-slate-400 block">
                                Modified: {item.modifiedTime ? new Date(item.modifiedTime).toLocaleDateString() : 'N/A'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSelectExisting(item)}
                              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 text-xs font-bold cursor-pointer transition-colors shrink-0"
                            >
                              Connect
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ==================== TAB 3: WEBHOOK ==================== */}
              {activeTab === 'webhook' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200/80 space-y-2">
                    <h4 className="font-bold text-xs text-indigo-950 flex items-center gap-1.5">
                      <Link className="w-3.5 h-3.5 text-indigo-700" />
                      <span>Google Apps Script Webhook (OAuth-free)</span>
                    </h4>
                    <p className="text-[11px] text-indigo-900/80 leading-relaxed">
                      If you cannot sign in with Google or prefer automated background syncing, you can deploy a free Google Apps Script web app and paste its URL below.
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
                      Google Apps Script Code Template
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
                <span>Encrypted Client-Side Storage</span>
              </span>
              <span>All records synced safely</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
