import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  initSupabaseAuth as initAuth, 
  signInWithGoogleSupabase as googleSignIn, 
  signOutSupabase as logout 
} from './lib/supabase';
import { 
  Transaction, 
  FilterState, 
  GoogleSheetMeta, 
  TransactionType,
  BudgetConfig,
  AppTab,
  LendItem
} from './types/finance';
import { 
  loadStoredTransactions, 
  saveStoredTransactions, 
  loadStoredSheetMeta, 
  saveStoredSheetMeta,
  loadStoredBudgetConfig,
  saveStoredBudgetConfig,
  loadStoredWebhookUrl,
  loadStoredLendItems,
  saveStoredLendItems,
  loadStoredAlertPhone,
  saveStoredAlertPhone,
  loadStoredTelegramAlertConfig,
  saveStoredTelegramAlertConfig,
  TelegramAlertConfig,
  loadStoredCategoryDefs,
  saveStoredCategoryDefs,
  loadStoredProfile,
  saveStoredProfile,
  mergeGuestDataIntoUser,
  UserProfile,
  saveSheetTransactions,
  loadSheetTransactions,
  saveSheetLendItems,
  loadSheetLendItems,
  clearSheetCache
} from './lib/storage';
import { 
  calculateSummary, 
  calculateCategoryBreakdown, 
  calculateWeeklyDailyTrend, 
  filterTransactions,
  formatCurrency 
} from './lib/calculations';
import { 
  syncDashboardStats, 
  overwriteTransactionsInSheet, 
  overwriteLendItemsInSheet,
  fetchAllTransactionsFromSheet,
  fetchAllLendItemsFromSheet,
  listUserSpreadsheets,
  requestGoogleAccessToken,
  fetchGoogleUserInfo,
  syncViaWebhook
} from './lib/sheetsApi';
import { generateTransactionSmsText, triggerDeviceSms } from './lib/smsAlert';
import { generateTransactionTelegramAlert, sendTelegramAlert, flushPendingTelegramAlerts } from './lib/telegramAlert';
import { CloudWorkspace, fetchCloudWorkspace, saveCloudWorkspace, subscribeToCloudWorkspace, unsubscribeFromCloudWorkspace } from './lib/cloudWorkspace';
import { clearPendingSync, hasPendingSync, loadPendingSync, markLendDelete, markLendUpsert, markSettingsDirty, markTransactionDelete, markTransactionUpsert, mergePendingWorkspace, stageWorkspaceForReplay } from './lib/pendingSync';
import { clearSignedOutWorkspace, loadSignedOutWorkspace, saveSignedOutWorkspace } from './lib/signedOutWorkspace';
import { Header } from './components/Header';
import { SummaryCards } from './components/SummaryCards';
import { BudgetAlerts } from './components/BudgetAlerts';
import { FilterBar } from './components/FilterBar';
import { TransactionTable } from './components/TransactionTable';
import { TransactionModal } from './components/TransactionModal';
import { SheetManagerView } from './components/SheetManagerView';
import { ConfirmModal } from './components/ConfirmModal';
import { SmsParserModal } from './components/SmsParserModal';
import { AuthHelpModal } from './components/AuthHelpModal';
import { BottomNav } from './components/BottomNav';
import { LendBorrowView } from './components/LendBorrowView';
import { AnalyticsView } from './components/AnalyticsView';
import { SettingsView } from './components/SettingsView';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, 
  AlertCircle, 
  Download,
  Sparkles,
  HandCoins,
  WifiOff
} from 'lucide-react';

const LAST_OFFLINE_WORKSPACE_KEY = 'money_tracker_last_offline_workspace_v1';
const PENDING_SHEET_PUSH_KEY = 'spenddesk_pending_sheet_push_v1';

const loadPendingSheetPushEmail = (): string | null => {
  try {
    const stored = localStorage.getItem(PENDING_SHEET_PUSH_KEY)?.trim().toLowerCase();
    return stored || null;
  } catch {
    return null;
  }
};

const loadLastOfflineWorkspace = (): string | null => {
  try {
    const stored = localStorage.getItem(LAST_OFFLINE_WORKSPACE_KEY)?.trim().toLowerCase();
    return stored || null;
  } catch {
    return null;
  }
};

export default function App() {
  const [user, setUser] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('money_tracker_user') || localStorage.getItem('money_tracker_user_info');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('money_tracker_access_token');
    } catch {
      return null;
    }
  });
  // After sign-out, keep the last account's offline workspace visible. This is
  // intentionally persisted so a refresh also retains the user's local ledger.
  // A later Google sign-in always replaces it with that Google account's scope.
  const [offlineWorkspaceEmail, setOfflineWorkspaceEmail] = useState<string | null>(loadLastOfflineWorkspace);

  // App Navigation Tab (Mobile-first & Full-screen SPA)
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [sheetsSourceTab, setSheetsSourceTab] = useState<AppTab>('settings');

  // Transactions, Debt & Config State
  const initialScope = (user?.email || loadLastOfflineWorkspace() || 'guest').trim().toLowerCase();
  const initialSheet = loadStoredSheetMeta(initialScope);
  const [activeSheet, setActiveSheet] = useState<GoogleSheetMeta | null>(initialSheet);
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    return loadStoredTransactions(initialScope);
  });
  const [lendItems, setLendItems] = useState<LendItem[]>(() => {
    return loadStoredLendItems(initialScope);
  });
  const [alertPhone, setAlertPhone] = useState<string>(() => loadStoredAlertPhone(initialScope));
  const [telegramAlertConfig, setTelegramAlertConfig] = useState<TelegramAlertConfig>(() => loadStoredTelegramAlertConfig(initialScope));
  const [budgetConfig, setBudgetConfig] = useState<BudgetConfig>(() => loadStoredBudgetConfig(initialScope));
  const [currency, setCurrency] = useState<string>('Rs');
  const [userProfile, setUserProfile] = useState<UserProfile>(() => loadStoredProfile());

  const overallSummary = useMemo(() => calculateSummary(transactions, transactions), [transactions]);

  // Filter State
  const [filter, setFilter] = useState<FilterState>({
    type: 'all',
    startDate: '',
    endDate: '',
    category: 'All',
    paymentMethod: 'All',
    searchQuery: '',
  });

  // Modal & View States
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isLendModalOpen, setIsLendModalOpen] = useState(false);
  const [modalDefaultType, setModalDefaultType] = useState<TransactionType>('cash_expense');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isSmsModalOpen, setIsSmsModalOpen] = useState(false);
  const [isAuthHelpOpen, setIsAuthHelpOpen] = useState(false);
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'main' | 'categories' | 'preferences' | 'budget' | 'cloud' | 'data' | 'about' | 'profile'>('main');
  const [deleteCandidate, setDeleteCandidate] = useState<Transaction | null>(null);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);

  // Status & Syncing
  const [isSyncing, setIsSyncing] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [cloudSyncReady, setCloudSyncReady] = useState(false);
  const [cloudWorkspaceRevision, setCloudWorkspaceRevision] = useState(0);
  const [pendingSheetPushEmail, setPendingSheetPushEmail] = useState<string | null>(loadPendingSheetPushEmail);
  const cloudVersionRef = useRef(0);
  const cloudSyncTimerRef = useRef<number | null>(null);
  const suppressNextCloudSyncRef = useRef(false);

  const showNotification = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4000);
  };

  // Auth Initialization
  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser, token) => {
        setUser(authedUser);
        setAccessToken(token);
        setOfflineWorkspaceEmail(null);
        try { localStorage.removeItem(LAST_OFFLINE_WORKSPACE_KEY); } catch {}
        if (window.location.hash && window.location.hash.includes('access_token')) {
          try {
            if (window.history && window.history.replaceState) {
              window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
          } catch (e) {}
        }
      },
      () => {
        // Only clear if no offline stored user
        const storedUser = localStorage.getItem('money_tracker_user');
        if (!storedUser) {
          setUser(null);
          setAccessToken(null);
        }
      }
    );
    return () => unsubscribe();
  }, []);

  // Process URL hash fragment on OAuth redirect return
  useEffect(() => {
    if (!window.location.hash) return;
    try {
      const hash = window.location.hash.replace(/^#/, '');
      const params = new URLSearchParams(hash);
      const errorParam = params.get('error_description') || params.get('error');
      if (errorParam) {
        showNotification(`Sign-in notice: ${decodeURIComponent(errorParam)}`, 'error');
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        return;
      }

      const providerToken = params.get('provider_token');
      if (providerToken) {
        setAccessToken(providerToken);
        try { localStorage.setItem('money_tracker_access_token', providerToken); } catch {}
      }
    } catch (e) {
      console.warn('Hash parse error:', e);
    }
  }, []);

  // Network Connectivity State for Offline Mode & Auto-Sync
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const currentUserEmail = user?.email || offlineWorkspaceEmail || null;
  const currentStorageScope = currentUserEmail || 'guest';
  const [loadedStorageScope, setLoadedStorageScope] = useState<string>('');
  const isPendingSignedOutReplay = Boolean(
    user?.email && pendingSheetPushEmail && user.email.trim().toLowerCase() === pendingSheetPushEmail
  );
  const isSignedOutLocalMode = Boolean(!user?.email && offlineWorkspaceEmail);

  // Realtime Online / Offline Listener & Reconnect Auto-Sync
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-flush any queued offline Telegram alerts when connection restores
      void flushPendingTelegramAlerts().then((count) => {
        if (count > 0) {
          showNotification(`Delivered ${count} queued Telegram alert${count > 1 ? 's' : ''}.`, 'success');
        }
      }).catch(console.warn);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check on mount: if online, flush any pending alerts from prior offline sessions
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      void flushPendingTelegramAlerts().then((count) => {
        if (count > 0) {
          showNotification(`Delivered ${count} queued Telegram alert${count > 1 ? 's' : ''}.`, 'success');
        }
      }).catch(console.warn);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load a clean, strictly account-scoped workspace on every identity change.
  useEffect(() => {
    const scope = currentUserEmail || 'guest';
    setLoadedStorageScope('');
    setSelectedTransactionIds([]);

    const storedSheet = loadStoredSheetMeta(scope);
    setActiveSheet(storedSheet);

    const initialTxs = loadStoredTransactions(scope);
    const initialLends = loadStoredLendItems(scope);

    setTransactions(initialTxs);
    setLendItems(initialLends);

    setAlertPhone(loadStoredAlertPhone(scope));

    const storedTelegram = loadStoredTelegramAlertConfig(scope);
    setTelegramAlertConfig(storedTelegram);

    setBudgetConfig(loadStoredBudgetConfig(scope));
    setUserProfile(loadStoredProfile(scope));
    setLoadedStorageScope(scope);
  }, [currentUserEmail]);

  const handleUpdateProfile = (updated: Partial<UserProfile>) => {
    markSettingsDirty(currentUserEmail);
    const nextProfile = { ...userProfile, ...updated };
    setUserProfile(nextProfile);
    saveStoredProfile(nextProfile, currentUserEmail);
  };

  // Save transactions to user-scoped local storage whenever they change
  useEffect(() => {
    if (loadedStorageScope !== currentStorageScope) return;
    saveStoredTransactions(transactions, currentUserEmail);
  }, [transactions, currentUserEmail, currentStorageScope, loadedStorageScope]);

  // Save lend items to user-scoped local storage
  useEffect(() => {
    if (loadedStorageScope !== currentStorageScope) return;
    saveStoredLendItems(lendItems, currentUserEmail);
  }, [lendItems, currentUserEmail, currentStorageScope, loadedStorageScope]);

  // Save active sheet meta to user-scoped local storage
  useEffect(() => {
    if (loadedStorageScope !== currentStorageScope) return;
    saveStoredSheetMeta(activeSheet, currentUserEmail);
  }, [activeSheet, currentUserEmail, currentStorageScope, loadedStorageScope]);

  const lastSyncedHashRef = useRef<string>('');

  // Scroll to top whenever activeTab changes
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [activeTab]);

  // Save budget configuration
  const handleUpdateBudgetConfig = (config: BudgetConfig) => {
    markSettingsDirty(currentUserEmail);
    setBudgetConfig(config);
    saveStoredBudgetConfig(config, currentUserEmail);
    showNotification('Budget & limits saved.', 'success');
  };

  // Update alert phone
  const handleUpdateAlertPhone = (phone: string) => {
    markSettingsDirty(currentUserEmail);
    setAlertPhone(phone);
    saveStoredAlertPhone(phone, currentUserEmail);
    showNotification(phone ? `Alert number set: ${phone}` : 'Alert number cleared', 'info');
  };

  const handleUpdateTelegramAlertConfig = (config: TelegramAlertConfig) => {
    markSettingsDirty(currentUserEmail);
    const nextConfig = { enabled: Boolean(config.enabled && config.chatId.trim()), chatId: config.chatId.trim() };
    setTelegramAlertConfig(nextConfig);
    saveStoredTelegramAlertConfig(nextConfig, currentUserEmail);
    showNotification(nextConfig.enabled ? 'Telegram transaction alerts enabled.' : 'Telegram transaction alerts saved but disabled.', 'success');
  };

  const buildCloudWorkspace = useCallback((updatedAt: number): CloudWorkspace => ({
    version: 1,
    updatedAt,
    transactions,
    lendItems,
    categories: loadStoredCategoryDefs(currentUserEmail),
    budgetConfig,
    alertPhone,
    telegramAlertConfig,
    activeSheet,
    profile: userProfile,
    currency,
  }), [transactions, lendItems, budgetConfig, alertPhone, telegramAlertConfig, activeSheet, userProfile, currency, currentUserEmail]);

  // Signed-out use is treated exactly like offline use. Keep a complete local
  // workspace snapshot current after every transaction/settings change so a
  // later login restores the user's final local state before any remote pull.
  useEffect(() => {
    if (!isSignedOutLocalMode || !offlineWorkspaceEmail) return;
    saveSignedOutWorkspace(offlineWorkspaceEmail, buildCloudWorkspace(Date.now()));
  }, [isSignedOutLocalMode, offlineWorkspaceEmail, buildCloudWorkspace]);

  const applyCloudWorkspace = useCallback((workspace: CloudWorkspace) => {
    if (!workspace || workspace.version !== 1 || !Number.isFinite(workspace.updatedAt)) return;
    if (workspace.updatedAt <= cloudVersionRef.current) return;
    suppressNextCloudSyncRef.current = true;
    cloudVersionRef.current = workspace.updatedAt;
    const scope = currentUserEmail;
    const remoteTxs = Array.isArray(workspace.transactions) ? workspace.transactions : [];
    const remoteLends = Array.isArray(workspace.lendItems) ? workspace.lendItems : [];

    setTransactions(remoteTxs);
    saveStoredTransactions(remoteTxs, scope);
    if (workspace.activeSheet?.id) {
      saveSheetTransactions(workspace.activeSheet.id, remoteTxs);
    }

    setLendItems(remoteLends);
    saveStoredLendItems(remoteLends, scope);
    if (workspace.activeSheet?.id) {
      saveSheetLendItems(workspace.activeSheet.id, remoteLends);
    }

    if (Array.isArray(workspace.categories) && workspace.categories.length > 0) {
      saveStoredCategoryDefs(workspace.categories, scope);
    }
    const nextBudget = workspace.budgetConfig || loadStoredBudgetConfig(scope);
    setBudgetConfig(nextBudget);
    saveStoredBudgetConfig(nextBudget, scope);
    const nextPhone = typeof workspace.alertPhone === 'string' ? workspace.alertPhone : '';
    setAlertPhone(nextPhone);
    saveStoredAlertPhone(nextPhone, scope);
    setTelegramAlertConfig((prev) => {
      const remote = workspace.telegramAlertConfig;
      if (remote && remote.chatId) {
        saveStoredTelegramAlertConfig(remote, scope);
        return remote;
      }
      if (prev && prev.chatId) {
        saveStoredTelegramAlertConfig(prev, scope);
        return prev;
      }
      const finalCfg = remote || { enabled: false, chatId: '' };
      saveStoredTelegramAlertConfig(finalCfg, scope);
      return finalCfg;
    });

    const nextSheet = workspace.activeSheet ?? null;
    setActiveSheet(nextSheet);
    saveStoredSheetMeta(nextSheet, scope);

    const nextProfile = workspace.profile || loadStoredProfile(scope);
    setUserProfile(nextProfile);
    saveStoredProfile(nextProfile, scope);
    if (typeof workspace.currency === 'string' && workspace.currency.trim()) setCurrency(workspace.currency);
    setCloudWorkspaceRevision((revision) => revision + 1);
  }, [currentUserEmail]);

  const queueCloudSync = useCallback(() => {
    if (!user?.email || !cloudSyncReady) return;
    if (cloudSyncTimerRef.current) window.clearTimeout(cloudSyncTimerRef.current);
    cloudSyncTimerRef.current = window.setTimeout(() => {
      const nextVersion = Math.max(Date.now(), cloudVersionRef.current + 1);
      cloudVersionRef.current = nextVersion;
      void saveCloudWorkspace(buildCloudWorkspace(nextVersion))
        .then(() => clearPendingSync(currentUserEmail))
        .catch((error) => console.error('Cloud workspace sync failed:', error));
    }, 700);
  }, [user?.email, cloudSyncReady, buildCloudWorkspace]);

  useEffect(() => {
    if (!user?.email || !isOnline) {
      setCloudSyncReady(false);
      return;
    }
    let active = true;
    let channel: Awaited<ReturnType<typeof subscribeToCloudWorkspace>> = null;
    void (async () => {
      try {
        const remoteWorkspace = await fetchCloudWorkspace();
        if (!active) return;
        const hasPending = hasPendingSync(currentUserEmail);
        if (remoteWorkspace && hasPending) {
          // Reconnect path: remote is pulled first, then durable offline operations
          // are replayed before fast push to Supabase.
          const merged = mergePendingWorkspace(
            remoteWorkspace,
            buildCloudWorkspace(Date.now()),
            loadPendingSync(currentUserEmail),
            Math.max(Date.now(), remoteWorkspace.updatedAt + 1)
          );
          applyCloudWorkspace(merged);
          await saveCloudWorkspace(merged);
          clearPendingSync(currentUserEmail);
        } else if (remoteWorkspace) {
          applyCloudWorkspace(remoteWorkspace);
        } else {
          // New cloud workspace on Supabase: upload current local data
          const local = buildCloudWorkspace(Date.now());
          await saveCloudWorkspace(local);
          clearPendingSync(currentUserEmail);
        }
        setCloudSyncReady(true);
        channel = await subscribeToCloudWorkspace((workspace) => {
          if (workspace.updatedAt > cloudVersionRef.current) {
            applyCloudWorkspace(workspace);
          }
        });
      } catch (error) {
        console.error('Cloud workspace initialization failed:', error);
      }
    })();

    const handleVisibilityOrFocus = async () => {
      if (document.visibilityState === 'visible' && user?.email && isOnline) {
        try {
          const remoteWorkspace = await fetchCloudWorkspace();
          if (remoteWorkspace && remoteWorkspace.updatedAt > cloudVersionRef.current) {
            applyCloudWorkspace(remoteWorkspace);
          }
        } catch (err) {
          console.warn('Tab focus sync check error:', err);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      if (cloudSyncTimerRef.current) window.clearTimeout(cloudSyncTimerRef.current);
      unsubscribeFromCloudWorkspace(channel);
    };
  }, [user?.email, isOnline, isPendingSignedOutReplay, applyCloudWorkspace, buildCloudWorkspace, currentUserEmail]);

  useEffect(() => {
    if (!user?.email || !cloudSyncReady) return;
    if (suppressNextCloudSyncRef.current) {
      suppressNextCloudSyncRef.current = false;
      return;
    }
    queueCloudSync();
  }, [transactions, lendItems, budgetConfig, alertPhone, telegramAlertConfig, activeSheet, userProfile, currency, user?.email, cloudSyncReady, queueCloudSync]);

  const handleSendTelegramTest = async (chatId: string) => {
    if (!chatId.trim()) {
      throw new Error('Enter a Telegram chat ID first.');
    }
    const sampleTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const today = new Date().toISOString().split('T')[0];
    const balFormatted = formatCurrency(overallSummary.currentCashBalance, currency);
    const res = await sendTelegramAlert({
      chatId: chatId.trim(),
      title: '[SpendDesk Alert]',
      message: `Cash Added to Wallet: ${currency} 500.00\non ${today} at ${sampleTime}.\nCurrent Balance: ${balFormatted}.`,
    });
    if (res.queued) {
      showNotification('Offline: Test alert queued and will send when online.', 'info');
    } else {
      showNotification('Telegram test alert delivered successfully!', 'success');
    }
  };

  // Save active sheet metadata
  const handleSetActiveSheet = (meta: GoogleSheetMeta | null) => {
    markSettingsDirty(currentUserEmail);
    setActiveSheet(meta);
    saveStoredSheetMeta(meta, currentUserEmail);
    // Immediately persist to Supabase cloud workspace so all devices get the sheet update
    if (user?.email) {
      const nextWs = buildCloudWorkspace(Date.now());
      nextWs.activeSheet = meta;
      void saveCloudWorkspace(nextWs).catch((err) => {
        console.warn('Cloud sync of activeSheet note:', err);
      });
    }
    // If a sheet was connected, immediately push current transactions to populate it live
    if (meta?.id) {
      void handlePushToSheet({ silent: true }).catch(console.warn);
    }
  };

  // Pull Data from Connected Google Sheet - ONLY show records from this connected sheet!
  const handlePullFromSheet = useCallback(async (
    targetSheetId?: string,
    targetToken?: string,
    options: { interactive?: boolean; silent?: boolean } = { interactive: false, silent: true },
  ) => {
    if (isPendingSignedOutReplay) return;
    const sId = targetSheetId || activeSheet?.id;
    let token = targetToken || accessToken;
    if (!sId) {
      if (!options.silent) showNotification('Connect a Google Sheet first.', 'info');
      return;
    }

    const hasGoogleSheetsToken = Boolean(token && token !== 'local_token' && !token.startsWith('eyJ'));
    if (!hasGoogleSheetsToken) {
      if (!options.interactive) return;
      try {
        token = await requestGoogleAccessToken();
        setAccessToken(token);
      } catch (error: any) {
        if (!options.silent) showNotification(error?.message || 'Google Sheet permission is required.', 'error');
        return;
      }
    }
    setIsSyncing(true);
    try {
      const remoteTxs = await fetchAllTransactionsFromSheet(token, sId);
      const remoteLends = await fetchAllLendItemsFromSheet(token, sId);

      // Cleanly replace: show ONLY the records from this connected Google Sheet
      const sortedTxs = [...remoteTxs].sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });

      setTransactions(sortedTxs);
      saveStoredTransactions(sortedTxs, currentUserEmail);
      saveSheetTransactions(sId, sortedTxs);

      setLendItems(remoteLends);
      saveStoredLendItems(remoteLends, currentUserEmail);
      saveSheetLendItems(sId, remoteLends);

      const updatedMeta: GoogleSheetMeta = {
        ...(activeSheet || { id: sId, name: 'Connected Sheet', url: `https://docs.google.com/spreadsheets/d/${sId}/edit` }),
        id: sId,
        lastSyncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setActiveSheet(updatedMeta);
      saveStoredSheetMeta(updatedMeta, currentUserEmail);

      if (!options.silent) {
        showNotification(`Loaded ${sortedTxs.length} records from Google Sheet!`, 'success');
      }
    } catch (err: any) {
      console.error('Failed to fetch from sheet:', err);
      const raw = String(err?.message || err);
      const is401 = raw.includes('401') || 
                    raw.includes('UNAUTHENTICATED') || 
                    raw.includes('invalid_client') || 
                    raw.includes('invalid_credentials') ||
                    raw.includes('INSUFFICIENT');

      if (is401) {
        try { localStorage.removeItem('money_tracker_access_token'); } catch (e) {}
        setAccessToken(null);
      }
      if (!options.silent) {
        showNotification(err?.message || 'Could not pull records from Google Sheet.', 'error');
      }
    } finally {
      setIsSyncing(false);
    }
  }, [activeSheet, accessToken, currentUserEmail, isPendingSignedOutReplay]);

  const handleManualPullFromSheet = useCallback(
    (sheetId?: string, token?: string) => handlePullFromSheet(sheetId, token, { interactive: true, silent: false }),
    [handlePullFromSheet],
  );

  const handleBulkDeleteTransactions = (txIds: string[]) => {
    txIds.forEach((id) => markTransactionDelete(id, currentUserEmail));
    setTransactions(prev => {
      const updated = prev.filter(t => !txIds.includes(t.id));
      saveStoredTransactions(updated, currentUserEmail);
      return updated;
    });
    showNotification(`Deleted ${txIds.length} transactions.`, 'info');
  };

  // Google Login handler via working OAuth flow with Account Chooser
  const handleSignIn = async () => {
    try {
      showNotification('Opening Google Sign-In...', 'info');

      // 1. Check if user configured a custom authorized Google Client ID
      const customClientId = localStorage.getItem('money_tracker_google_client_id');
      if (customClientId && !customClientId.includes('403491523597')) {
        try {
          const token = await requestGoogleAccessToken();
          if (token) {
            setAccessToken(token);
            try {
              const profile = await fetchGoogleUserInfo(token);
              if (profile && profile.email) {
                const userObj = {
                  id: profile.sub || 'google-' + Date.now(),
                  email: profile.email,
                  displayName: profile.name || profile.email.split('@')[0],
                  photoURL: profile.picture,
                };
                localStorage.setItem('money_tracker_user_info', JSON.stringify({
                  id: userObj.id,
                  email: userObj.email,
                  name: userObj.displayName,
                  picture: userObj.photoURL,
                }));
                localStorage.setItem('money_tracker_user', JSON.stringify(userObj));
                setUser(userObj);
                showNotification(`Signed in as ${userObj.displayName}!`, 'success');
                return;
              }
            } catch (profileErr) {
              console.warn('Failed to fetch user profile:', profileErr);
            }
          }
        } catch (gisErr: any) {
          console.warn('Custom GIS popup not completed:', gisErr);
        }
      }

      // 2. Primary OAuth flow: Uses Supabase Google OAuth with prompt='select_account consent'
      // This displays the full Google Account Chooser list (all logged-in Gmail accounts + 'Use another account')
      // and eliminates Error 400: origin_mismatch on GitHub Pages / custom domains.
      const res = await googleSignIn();
      if (res && !res.success && res.errorMessage) {
        showNotification(res.errorMessage || 'Sign-in failed. Please try again.', 'error');
      }
    } catch (err: any) {
      console.warn('Google Sign-In Exception:', err);
      showNotification('Google Sign-In cancelled or failed.', 'info');
    }
  };

  const handleSignOut = async () => {
    const signedOutScope = user?.email || currentUserEmail;
    if (signedOutScope) {
      // Keep this exact Gmail user's local workspace on this device
      stageWorkspaceForReplay(transactions, lendItems, signedOutScope);
      setOfflineWorkspaceEmail(signedOutScope);
      try {
        localStorage.setItem(LAST_OFFLINE_WORKSPACE_KEY, signedOutScope);
      } catch {}
    }
    await logout();
    setUser(null);
    setAccessToken(null);
    try {
      localStorage.removeItem('money_tracker_user');
      localStorage.removeItem('money_tracker_user_info');
      localStorage.removeItem('money_tracker_access_token');
    } catch (e) {}
    showNotification('Signed out. Local records for this account remain active on this device.', 'info');
  };

  // Push Data to Connected Google Sheet (Transactions, Lend/Borrow, and Dashboard KPIs) - Silent by default
  const handlePushToSheet = useCallback(async (
    options: { silent?: boolean; interactive?: boolean } = { silent: true },
    snapshot?: { transactions: Transaction[]; lendItems: LendItem[] }
  ): Promise<boolean> => {
    if (!activeSheet) return false;
    let sheetToken = accessToken;
    // Supabase's session JWT (`eyJ…`) authenticates SpendDesk cloud sync but
    // cannot call Google APIs. A Google OAuth token is required separately.
    const hasGoogleSheetsToken = Boolean(sheetToken && sheetToken !== 'local_token' && !sheetToken.startsWith('eyJ'));
    if (!hasGoogleSheetsToken) {
      // Safari blocks account-selection popups unless they come directly from
      // a tap. Background saves stay local and retry after a user taps Push.
      if (!options.interactive) return false;
      try {
        sheetToken = await requestGoogleAccessToken();
        setAccessToken(sheetToken);
      } catch (error: any) {
        if (!options.silent) showNotification(error?.message || 'Google Sheet permission is required.', 'error');
        return false;
      }
    }
    const transactionsToPush = snapshot?.transactions ?? transactions;
    const lendsToPush = snapshot?.lendItems ?? lendItems;
    if (!options.silent) {
      setIsSyncing(true);
    }
    try {
      // 1. Push Transactions & Lend side-by-side to Transactions sheet
      await overwriteTransactionsInSheet(sheetToken, activeSheet.id, transactionsToPush);
      
      // 2. Push Lend & Borrow backup tab records
      await overwriteLendItemsInSheet(sheetToken, activeSheet.id, lendsToPush);

      // 3. Push Dashboard KPI Totals & Trends
      const allSummary = calculateSummary(transactionsToPush, transactionsToPush);
      const catSummary = calculateCategoryBreakdown(transactionsToPush);
      const { dayTotals } = calculateWeeklyDailyTrend(transactionsToPush);
      await syncDashboardStats(sheetToken, activeSheet.id, allSummary, catSummary, dayTotals);

      const updatedMeta: GoogleSheetMeta = {
        ...activeSheet,
        lastSyncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      handleSetActiveSheet(updatedMeta);
      if (!options.silent) {
        showNotification(`Synced all records to "${activeSheet.name}"!`, 'success');
      }
      return true;
    } catch (err: any) {
      console.error('Failed to sync to Google Sheet:', err);
      const raw = String(err?.message || err);
      const is401 = raw.includes('401') || 
                    raw.includes('UNAUTHENTICATED') || 
                    raw.includes('invalid_client') || 
                    raw.includes('invalid_credentials') ||
                    raw.includes('INSUFFICIENT');

      if (is401) {
        try { localStorage.removeItem('money_tracker_access_token'); } catch (e) {}
        setAccessToken(null);
        if (!options.silent) {
          showNotification('Google login session expired. Please sign in to reconnect & sync.', 'error');
        }
      } else if (!options.silent) {
        showNotification('Could not sync to Google Sheet: ' + (err.message || 'Network error'), 'error');
      }
      return false;
    } finally {
      if (!options.silent) {
        setIsSyncing(false);
      }
    }
  }, [activeSheet, accessToken, transactions, lendItems]);

  const sheetPushTimerRef = useRef<number | null>(null);
  const queueSheetPush = useCallback((snapshot?: { transactions: Transaction[]; lendItems: LendItem[] }) => {
    if (!activeSheet) return;
    if (sheetPushTimerRef.current) window.clearTimeout(sheetPushTimerRef.current);
    sheetPushTimerRef.current = window.setTimeout(() => {
      void handlePushToSheet({ silent: true }, snapshot).catch((err) => {
        console.warn('Background sheet push note:', err);
      });
    }, 1200);
  }, [activeSheet, handlePushToSheet]);

  // A sign-out workspace gets priority on the next login: after local/offline
  // data has been reconciled, overwrite the linked Google Sheet once. The
  // marker is removed only after that push succeeds, so retries are automatic.
  useEffect(() => {
    if (!isPendingSignedOutReplay || !user?.email || !accessToken || !activeSheet || !isOnline) return;
    void handlePushToSheet({ silent: true }).then((success) => {
      if (success) {
        try { localStorage.removeItem(PENDING_SHEET_PUSH_KEY); } catch {}
        clearSignedOutWorkspace(user.email);
        setPendingSheetPushEmail(null);
      }
    });
  }, [isPendingSignedOutReplay, user?.email, accessToken, activeSheet, isOnline, handlePushToSheet]);

  // Add / Edit Transaction Handler with SMS Notification
  const handleSaveTransaction = (data: Omit<Transaction, 'id' | 'createdAt'> & { id?: string; sendSmsTo?: string }) => {
    const { sendSmsTo, ...txData } = data;
    const isNewTransaction = !txData.id;
    let updatedTxs: Transaction[];
    let recordedTx: Transaction;

    if (txData.id) {
      const existing = transactions.find((t) => t.id === txData.id);
      const createdAt = existing ? existing.createdAt : Date.now();
      recordedTx = { ...txData, id: txData.id, createdAt } as Transaction;
      updatedTxs = transactions.map((t) => (t.id === txData.id ? recordedTx : t));
      markTransactionUpsert(recordedTx, currentUserEmail);
      saveStoredTransactions(updatedTxs, currentUserEmail);
      if (activeSheet?.id) {
        saveSheetTransactions(activeSheet.id, updatedTxs);
      }
      setTransactions(updatedTxs);
      showNotification('Transaction updated.', 'success');
    } else {
      recordedTx = {
        ...txData,
        id: 'tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        createdAt: Date.now(),
      };
      updatedTxs = [recordedTx, ...transactions];
      markTransactionUpsert(recordedTx, currentUserEmail);
      saveStoredTransactions(updatedTxs, currentUserEmail);
      if (activeSheet?.id) {
        saveSheetTransactions(activeSheet.id, updatedTxs);
      }
      setTransactions(updatedTxs);
      showNotification('Transaction recorded.', 'success');
    }

    // Trigger background SMS notification if phone is configured
    if (sendSmsTo) {
      handleUpdateAlertPhone(sendSmsTo);
      const currentSum = calculateSummary(updatedTxs, updatedTxs);
      const smsBody = generateTransactionSmsText(recordedTx, currentSum.currentCashBalance, currency);
      triggerDeviceSms(sendSmsTo, smsBody);
      showNotification('SMS message is ready to send.', 'info');
    }

    if (isNewTransaction && telegramAlertConfig.enabled && telegramAlertConfig.chatId) {
      const currentSum = calculateSummary(updatedTxs, updatedTxs);
      const telegramAlert = generateTransactionTelegramAlert(recordedTx, currency, currentSum.currentCashBalance);
      void sendTelegramAlert({ ...telegramAlert, chatId: telegramAlertConfig.chatId })
        .then((res) => {
          if (res.queued) {
            showNotification('Offline: Telegram alert queued, will send when online.', 'info');
          } else {
            showNotification('Telegram alert delivered.', 'success');
          }
        })
        .catch((error) => {
          console.error('Telegram alert failed:', error);
          showNotification('Transaction saved. Check Telegram settings.', 'info');
        });
    }

    if (activeSheet) {
      queueSheetPush({ transactions: updatedTxs, lendItems });
    }

    const webhookUrl = loadStoredWebhookUrl();
    if (webhookUrl) {
      const sum = calculateSummary(updatedTxs, updatedTxs);
      syncViaWebhook(webhookUrl, updatedTxs as any, sum, lendItems).catch(console.warn);
    }
  };

  // Safe Deletion Handler
  const handleDeleteTransaction = (tx: Transaction) => {
    setDeleteCandidate(tx);
  };

  const confirmDelete = () => {
    if (!deleteCandidate) return;
    const remaining = transactions.filter((t) => t.id !== deleteCandidate.id);
    markTransactionDelete(deleteCandidate.id, currentUserEmail);
    saveStoredTransactions(remaining, currentUserEmail);
    if (activeSheet?.id) {
      saveSheetTransactions(activeSheet.id, remaining);
    }
    setTransactions(remaining);
    setDeleteCandidate(null);
    showNotification('Transaction deleted.', 'info');

    if (activeSheet) {
      queueSheetPush({ transactions: remaining, lendItems });
    }

    const webhookUrl = loadStoredWebhookUrl();
    if (webhookUrl) {
      const sum = calculateSummary(remaining, remaining);
      syncViaWebhook(webhookUrl, remaining, sum, lendItems).catch(console.warn);
    }
  };

  // Lend & Borrow Handlers
  const handleAddLendItem = (data: Omit<LendItem, 'id' | 'createdAt'>) => {
    const newItem: LendItem = {
      ...data,
      id: 'lend-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      createdAt: Date.now(),
    };
    const updated = [newItem, ...lendItems];
    markLendUpsert(newItem, currentUserEmail);
    saveStoredLendItems(updated, currentUserEmail);
    if (activeSheet?.id) {
      saveSheetLendItems(activeSheet.id, updated);
    }
    setLendItems(updated);
    showNotification(`${data.type === 'lent' ? 'Money Lent' : 'Money Borrowed'} saved.`, 'success');

    if (activeSheet) {
      queueSheetPush({ transactions, lendItems: updated });
    }
    const webhookUrl = loadStoredWebhookUrl();
    if (webhookUrl) {
      const sum = calculateSummary(transactions, transactions);
      syncViaWebhook(webhookUrl, transactions, sum, updated).catch(console.warn);
    }
  };

  const handleToggleLendStatus = (id: string) => {
    const updated = lendItems.map((item) => {
      if (item.id === id) {
        const nextStatus = item.status === 'pending' ? 'settled' : 'pending';
        return {
          ...item,
          status: nextStatus as any,
          settledAt: nextStatus === 'settled' ? new Date().toISOString() : undefined,
        };
      }
      return item;
    });
    saveStoredLendItems(updated, currentUserEmail);
    if (activeSheet?.id) {
      saveSheetLendItems(activeSheet.id, updated);
    }
    const changedItem = updated.find((item) => item.id === id);
    if (changedItem) markLendUpsert(changedItem, currentUserEmail);
    setLendItems(updated);
    showNotification('Status updated.', 'info');

    if (activeSheet) {
      queueSheetPush({ transactions, lendItems: updated });
    }
    const webhookUrl = loadStoredWebhookUrl();
    if (webhookUrl) {
      const sum = calculateSummary(transactions, transactions);
      syncViaWebhook(webhookUrl, transactions, sum, updated).catch(console.warn);
    }
  };

  const handleDeleteLendItem = (id: string) => {
    const updated = lendItems.filter((i) => i.id !== id);
    markLendDelete(id, currentUserEmail);
    saveStoredLendItems(updated, currentUserEmail);
    if (activeSheet?.id) {
      saveSheetLendItems(activeSheet.id, updated);
    }
    setLendItems(updated);
    showNotification('Record deleted.', 'info');

    if (activeSheet) {
      queueSheetPush({ transactions, lendItems: updated });
    }
    const webhookUrl = loadStoredWebhookUrl();
    if (webhookUrl) {
      const sum = calculateSummary(transactions, transactions);
      syncViaWebhook(webhookUrl, transactions, sum, updated).catch(console.warn);
    }
  };

  // Export current view to CSV
  const handleExportCSV = () => {
    const headers = ['ID', 'Date', 'Time', 'Type', 'Category', 'Amount', 'Payment Method', 'Notes'];
    const rows = filteredTransactions.map((tx) => [
      `"${tx.id}"`,
      `"${tx.date}"`,
      `"${tx.time || ''}"`,
      `"${tx.type}"`,
      `"${tx.category}"`,
      tx.amount,
      `"${tx.paymentMethod}"`,
      `"${(tx.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `money_tracker_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('CSV exported successfully!', 'success');
  };

  // Financial Calculations
  const filteredTransactions = useMemo(() => {
    return filterTransactions(transactions, filter);
  }, [transactions, filter]);

  const summary = useMemo(() => {
    return calculateSummary(transactions, filteredTransactions);
  }, [transactions, filteredTransactions]);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const todaySpend = useMemo(() => {
    return transactions
      .filter((t) => t.date === todayStr && (t.type === 'cash_expense' || t.type === 'card_expense'))
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions, todayStr]);

  const categoryBreakdown = useMemo(() => {
    return calculateCategoryBreakdown(filteredTransactions);
  }, [filteredTransactions]);

  const { trendItems } = useMemo(() => {
    return calculateWeeklyDailyTrend(filteredTransactions);
  }, [filteredTransactions]);

  const pendingLendCount = useMemo(() => {
    return lendItems.filter((i) => i.status === 'pending').length;
  }, [lendItems]);

  const selectedTransactions = useMemo(
    () => transactions.filter((tx) => selectedTransactionIds.includes(tx.id)),
    [transactions, selectedTransactionIds]
  );

  const handleEditSelectedTransaction = () => {
    const [selected] = selectedTransactions;
    if (!selected) return;
    setEditingTransaction(selected);
    setSelectedTransactionIds([]);
    setIsTxModalOpen(true);
  };

  const handleDeleteSelectedTransactions = () => {
    if (selectedTransactionIds.length === 0) return;
    handleBulkDeleteTransactions(selectedTransactionIds);
    setSelectedTransactionIds([]);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col antialiased pb-20 md:pb-8">
      {/* App Header - Hidden when on Settings page or Google Sheets manager page */}
      {activeTab !== 'settings' && activeTab !== 'sheets' && (
        <Header
          user={user}
          userProfile={userProfile}
          activeSheet={activeSheet}
          isSyncing={isSyncing}
          totalCashBalance={overallSummary.currentCashBalance}
          totalSpend={overallSummary.totalSpend}
          currency={currency}
          onGoHome={() => setActiveTab('dashboard')}
          onSignIn={handleSignIn}
          onSignOut={() => setIsSignOutConfirmOpen(true)}
          onOpenSyncModal={() => {
            setSheetsSourceTab(activeTab);
            setActiveTab('sheets');
          }}
          onOpenNewTransaction={() => {
            setEditingTransaction(null);
            setModalDefaultType('cash_expense');
            setIsTxModalOpen(true);
          }}
          onOpenSmsModal={() => setIsSmsModalOpen(true)}
          onQuickSync={handleManualPullFromSheet}
          onOpenAuthHelp={() => setIsAuthHelpOpen(true)}
          onOpenSettings={(tab) => {
            setSettingsSection((tab as any) || 'main');
            setActiveTab('settings');
          }}
          onOpenProfileEdit={() => {
            setSettingsSection('profile');
            setActiveTab('settings');
          }}
          selectionCount={selectedTransactionIds.length}
          onCancelSelection={() => setSelectedTransactionIds([])}
          onEditSelection={handleEditSelectedTransaction}
          onDeleteSelection={handleDeleteSelectedTransactions}
        />
      )}

      {/* Offline Status Warning Banner */}
      {!isOnline && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-700 px-4 py-2 flex items-center justify-center gap-2 text-xs sm:text-sm font-medium">
          <WifiOff className="w-4 h-4 text-amber-600 animate-pulse" />
          <span>You are offline. Operating seamlessly in Local Storage mode. Data will auto-sync when online.</span>
        </div>
      )}

      {/* Dynamic Island Floating Pill Toast (Matching user reference screenshot) */}
      <AnimatePresence>
        {notification && (
          <div className="fixed bottom-20 sm:bottom-8 left-0 right-0 z-50 flex justify-center pointer-events-none px-4">
            <motion.div
              key="toast-pill-notification"
              initial={{ opacity: 0, y: 24, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.94 }}
              transition={{ type: 'spring', damping: 25, stiffness: 420 }}
              className="pointer-events-auto"
            >
              <div
                onClick={() => setNotification(null)}
                className="group flex items-center gap-2.5 px-5 py-2.5 sm:py-3 rounded-full bg-[#090d16]/95 backdrop-blur-md text-white border border-slate-700/60 ring-1 ring-white/10 shadow-[0_16px_36px_-6px_rgba(0,0,0,0.65)] hover:bg-[#0e1524] transition-colors cursor-pointer max-w-sm sm:max-w-md select-none"
              >
                {notification.type === 'error' ? (
                  <svg className="w-5 h-5 shrink-0 drop-shadow-[0_0_8px_rgba(244,63,94,0.35)]" viewBox="0 0 24 24" fill="none">
                    <motion.circle
                      cx="12"
                      cy="12"
                      r="9.5"
                      stroke="#f43f5e"
                      strokeWidth="2.3"
                      strokeLinecap="round"
                      style={{ transformOrigin: 'center' }}
                      initial={{ pathLength: 0, rotate: -90 }}
                      animate={{ pathLength: 1, rotate: -90 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                    />
                    <motion.path
                      d="M8.5 8.5l7 7M15.5 8.5l-7 7"
                      stroke="#f43f5e"
                      strokeWidth="2.3"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.16, ease: 'easeOut', delay: 0.08 }}
                    />
                  </svg>
                ) : notification.type === 'info' ? (
                  <svg className="w-5 h-5 shrink-0 drop-shadow-[0_0_8px_rgba(56,189,248,0.35)]" viewBox="0 0 24 24" fill="none">
                    <motion.circle
                      cx="12"
                      cy="12"
                      r="9.5"
                      stroke="#38bdf8"
                      strokeWidth="2.3"
                      strokeLinecap="round"
                      style={{ transformOrigin: 'center' }}
                      initial={{ pathLength: 0, rotate: -90 }}
                      animate={{ pathLength: 1, rotate: -90 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                    />
                    <motion.path
                      d="M12 8v4m0 4h.01"
                      stroke="#38bdf8"
                      strokeWidth="2.3"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.16, ease: 'easeOut', delay: 0.08 }}
                    />
                  </svg>
                ) : (
                  /* Success Animated Draw From Scratch (Exact match to reference pill screenshot) */
                  <svg className="w-5 h-5 shrink-0 drop-shadow-[0_0_8px_rgba(16,185,129,0.35)]" viewBox="0 0 24 24" fill="none">
                    <motion.circle
                      cx="12"
                      cy="12"
                      r="9.5"
                      stroke="#10b981"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      style={{ transformOrigin: 'center' }}
                      initial={{ pathLength: 0, rotate: -90 }}
                      animate={{ pathLength: 1, rotate: -90 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                    />
                    <motion.path
                      d="M8 12.2l2.8 2.8 5.4-5.4"
                      stroke="#10b981"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.16, ease: 'easeOut', delay: 0.08 }}
                    />
                  </svg>
                )}
                <span className="text-xs sm:text-sm font-bold text-white tracking-wide leading-tight select-none">
                  {notification.message}
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Desktop Navigation Bar (Centered, clean workspace tabs) */}
      <div className="hidden md:block max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        <div className="flex items-center justify-center bg-white p-1.5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {[
              { id: 'dashboard', label: 'Overview & Wallet' },
              { id: 'transactions', label: 'Transaction Ledger' },
              { id: 'lend', label: `Lend & Borrow${pendingLendCount > 0 ? ` (${pendingLendCount})` : ''}` },
              { id: 'analytics', label: 'Category & Trends' },
              { id: 'sheets', label: 'Google Sheets' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === 'sheets') {
                    setSheetsSourceTab(activeTab);
                  }
                  setActiveTab(tab.id as AppTab);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content with Smooth Page Fade & Slide Transition Animation */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 w-full"
        >
          {activeTab === 'sheets' && (
            <SheetManagerView
              onBack={() => setActiveTab(sheetsSourceTab || 'settings')}
              accessToken={accessToken}
              activeSheet={activeSheet}
              onSetActiveSheet={handleSetActiveSheet}
              onPushToSheet={() => handlePushToSheet({ silent: false, interactive: true })}
              onPullFromSheet={handleManualPullFromSheet}
              onSignInDirect={handleSignIn}
              onExportCSV={handleExportCSV}
              isSyncing={isSyncing}
              totalTransactionsCount={transactions.length}
              totalLendCount={lendItems.length}
              transactions={transactions}
              lendItems={lendItems}
              onNotification={showNotification}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              user={user}
              storageEmail={currentUserEmail}
              onBack={() => setActiveTab('dashboard')}
              currency={currency}
              onUpdateCurrency={(c) => {
                markSettingsDirty(currentUserEmail);
                setCurrency(c);
                if (user?.email) {
                  const nextWs = buildCloudWorkspace(Date.now());
                  nextWs.currency = c;
                  void saveCloudWorkspace(nextWs).catch(console.warn);
                }
                showNotification(`Currency updated to ${c}`, 'success');
              }}
              budgetConfig={budgetConfig}
              onUpdateBudgetConfig={handleUpdateBudgetConfig}
              alertPhone={alertPhone}
              onUpdateAlertPhone={handleUpdateAlertPhone}
              telegramAlertConfig={telegramAlertConfig}
              onUpdateTelegramAlertConfig={handleUpdateTelegramAlertConfig}
              onSendTelegramTest={handleSendTelegramTest}
              onCloudSyncRequested={() => {
                markSettingsDirty(currentUserEmail);
                queueCloudSync();
              }}
              cloudWorkspaceRevision={cloudWorkspaceRevision}
              activeSheet={activeSheet}
              onOpenSyncModal={() => {
                setSheetsSourceTab('settings');
                setActiveTab('sheets');
              }}
              onExportCSV={handleExportCSV}
              transactions={transactions}
              lendItems={lendItems}
              userProfile={userProfile}
              onUpdateProfile={handleUpdateProfile}
              onResetAllData={() => {
                setTransactions([]);
                setLendItems([]);
                saveStoredTransactions([], currentUserEmail);
                saveStoredLendItems([], currentUserEmail);
                if (activeSheet?.id) {
                  saveSheetTransactions(activeSheet.id, []);
                  saveSheetLendItems(activeSheet.id, []);
                }
                if (user?.email) {
                  void saveCloudWorkspace({
                    version: 1,
                    updatedAt: Date.now(),
                    transactions: [],
                    lendItems: [],
                    categories: loadStoredCategoryDefs(currentUserEmail),
                    budgetConfig,
                    alertPhone,
                    telegramAlertConfig,
                    activeSheet,
                    profile: userProfile,
                    currency,
                  }).catch(console.warn);
                }
                showNotification('All records cleared successfully from device & cloud.', 'info');
              }}
              onRestoreTransactions={() => {
                setTransactions(loadStoredTransactions(currentUserEmail));
                setLendItems(loadStoredLendItems(currentUserEmail));
                showNotification('Data restored successfully.', 'success');
              }}
              initialSection={settingsSection}
              onNotification={showNotification}
            />
          )}

          {activeTab === 'dashboard' && (
            <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
              {/* 1. Summary Cards (Current Cash Balance + 4 breakdown cards + SMS icon) */}
              <SummaryCards
                summary={summary}
                currency={currency}
                onAddCash={() => {
                  setEditingTransaction(null);
                  setModalDefaultType('cash_added');
                  setIsTxModalOpen(true);
                }}
                onAddExpense={() => {
                  setEditingTransaction(null);
                  setModalDefaultType('cash_expense');
                  setIsTxModalOpen(true);
                }}
                onOpenSms={() => setIsSmsModalOpen(true)}
                alertPhone={alertPhone}
                onUpdateAlertPhone={handleUpdateAlertPhone}
              />

              {/* 2. End Money & Runway Tracker */}
              <BudgetAlerts
                summary={summary}
                todaySpend={todaySpend}
                budgetConfig={budgetConfig}
                onUpdateConfig={handleUpdateBudgetConfig}
                currency={currency}
              />

              {/* 3. Filter Bar (With expand/collapse down arrow) */}
              <FilterBar
                filter={filter}
                onFilterChange={setFilter}
                onExportCSV={handleExportCSV}
                totalFilteredCount={filteredTransactions.length}
                transactions={transactions}
                currency={currency}
                onNotification={showNotification}
                showDownload={false}
              />

              {/* 4. Recent Transactions Preview (Top 8 on Dashboard) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Recent Activity
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('transactions')}
                    className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
                  >
                    View All ({filteredTransactions.length}) &rarr;
                  </button>
                </div>

                <TransactionTable
                  transactions={filteredTransactions.slice(0, 8)}
                  currency={currency}
                  onAddNew={() => {
                    setEditingTransaction(null);
                    setModalDefaultType('cash_expense');
                    setIsTxModalOpen(true);
                  }}
                  onEdit={(tx) => {
                    setEditingTransaction(tx);
                    setIsTxModalOpen(true);
                  }}
                  onDelete={handleDeleteTransaction}
                  selectedTxIds={selectedTransactionIds}
                  onSelectedTxIdsChange={setSelectedTransactionIds}
                />
              </div>
            </main>
          )}

          {activeTab === 'transactions' && (
            <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
              <FilterBar
                filter={filter}
                onFilterChange={setFilter}
                onExportCSV={handleExportCSV}
                totalFilteredCount={filteredTransactions.length}
                collapsible={false}
                transactions={transactions}
                currency={currency}
                onNotification={showNotification}
                showDownload={true}
              />
              <TransactionTable
                transactions={filteredTransactions}
                currency={currency}
                onAddNew={() => {
                  setEditingTransaction(null);
                  setModalDefaultType('cash_expense');
                  setIsTxModalOpen(true);
                }}
                onEdit={(tx) => {
                  setEditingTransaction(tx);
                  setIsTxModalOpen(true);
                }}
                onDelete={handleDeleteTransaction}
                selectedTxIds={selectedTransactionIds}
                onSelectedTxIdsChange={setSelectedTransactionIds}
              />
            </main>
          )}

          {activeTab === 'lend' && (
            <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
              <LendBorrowView
                items={lendItems}
                onAddItem={handleAddLendItem}
                onToggleStatus={handleToggleLendStatus}
                onDeleteItem={handleDeleteLendItem}
                currency={currency}
                isAddModalOpen={isLendModalOpen}
                onCloseAddModal={() => setIsLendModalOpen(false)}
                onOpenAddModal={() => setIsLendModalOpen(true)}
              />
            </main>
          )}

          {activeTab === 'analytics' && (
            <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
              <AnalyticsView
                summary={summary}
                categories={categoryBreakdown}
                trendItems={trendItems}
                filter={filter}
                onFilterChange={setFilter}
                onExportCSV={handleExportCSV}
                totalTransactionsCount={filteredTransactions.length}
                currency="Rs"
              />
            </main>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Native Mobile Bottom Navigation Bar */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onQuickAdd={() => {
          if (activeTab === 'lend') {
            setIsLendModalOpen(true);
          } else {
            setEditingTransaction(null);
            setModalDefaultType('cash_expense');
            setIsTxModalOpen(true);
          }
        }}
        pendingLendCount={pendingLendCount}
      />

      {/* Transaction Add / Edit Modal */}
      <TransactionModal
        isOpen={isTxModalOpen}
        storageEmail={currentUserEmail}
        onClose={() => {
          setIsTxModalOpen(false);
          setEditingTransaction(null);
        }}
        onSave={handleSaveTransaction}
        editingTransaction={editingTransaction}
        defaultType={modalDefaultType}
        defaultAlertPhone={alertPhone}
        onOpenSmsReader={() => setIsSmsModalOpen(true)}
        onOpenSettingsCategories={() => {
          setIsTxModalOpen(false);
          setSettingsSection('categories');
          setActiveTab('settings');
        }}
      />

      {/* Bank SMS Alert Auto-Parser Modal */}
      <SmsParserModal
        isOpen={isSmsModalOpen}
        onClose={() => setIsSmsModalOpen(false)}
        onAddTransaction={handleSaveTransaction}
        currency={currency}
      />

      {/* Google Sign-in Help & Local Mode Modal */}
      <AuthHelpModal
        isOpen={isAuthHelpOpen}
        onClose={() => setIsAuthHelpOpen(false)}
        onExportCSV={handleExportCSV}
        userEmailAttempt={user?.email || 'your account'}
      />

      {/* Sign Out Confirmation Modal */}
      <ConfirmModal
        isOpen={isSignOutConfirmOpen}
        title="Sign Out Confirmation"
        message="Are you sure you want to sign out? Your offline local records will remain safe on your device, but Google Sheets auto-sync will pause."
        confirmLabel="Sign Out"
        cancelLabel="Stay Signed In"
        isDestructive={true}
        onConfirm={async () => {
          setIsSignOutConfirmOpen(false);
          await handleSignOut();
        }}
        onCancel={() => setIsSignOutConfirmOpen(false)}
      />

      {/* Safe Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteCandidate)}
        title="Delete Transaction"
        message={`Delete this ${deleteCandidate?.category} transaction of Rs ${deleteCandidate?.amount.toLocaleString()}?`}
        confirmLabel="Delete"
        cancelLabel="Keep"
        isDestructive={true}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteCandidate(null)}
      />
    </div>
  );
}
