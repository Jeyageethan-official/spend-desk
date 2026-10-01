import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  initSupabaseAuth, 
  signInWithGoogleSupabase, 
  signOutSupabase 
} from './lib/supabase';
import {
  signInWithGoogleWorkspace,
  initWorkspaceAuth,
  signOutGoogleWorkspace,
  getCachedWorkspaceToken,
} from './lib/workspaceAuth';
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
  clearSheetCache,
  saveKnownSpreadsheet,
  loadDeletedTxIds,
  markTxIdDeleted,
  markTxIdsDeleted,
  unmarkTxIdDeleted,
  saveLastUserEmail,
  loadLastUserEmail
} from './lib/storage';
import { 
  calculateSummary, 
  calculateCategoryBreakdown, 
  calculateWeeklyDailyTrend, 
  filterTransactions,
  formatCurrency,
  sanitizeTransactions,
  getLocalDateString
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
import { generateTransactionSmsText, generateLendSmsText, generateLowBalanceSmsText, triggerDeviceSms } from './lib/smsAlert';
import { 
  generateTransactionTelegramAlert, 
  generateLendTelegramAlert, 
  generateLowBalanceTelegramAlert, 
  sendTelegramAlert, 
  flushPendingTelegramAlerts 
} from './lib/telegramAlert';
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
import { AdjustBalanceModal } from './components/AdjustBalanceModal';
import { BottomNav } from './components/BottomNav';
import { AnalyticsView } from './components/AnalyticsView';
import { SettingsView } from './components/SettingsView';
import { LendBorrowView } from './components/LendBorrowView';
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
    if (stored) return stored;
    const lastUser = loadLastUserEmail();
    return lastUser || null;
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
    return sanitizeTransactions(loadStoredTransactions(initialScope));
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
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
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
  const queueSheetPushRef = useRef<((snapshot?: { transactions: Transaction[]; lendItems: LendItem[] }) => void) | null>(null);
  const suppressNextCloudSyncRef = useRef(false);

  const showNotification = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4000);
  };

  // Unified Auth Initialization: Google Workspace (Sheets & Drive) + Supabase
  useEffect(() => {
    // 1. Listen for Google Workspace Auth
    const unsubWorkspace = initWorkspaceAuth(
      (wsUser, token) => {
        const email = wsUser.email ? wsUser.email.trim().toLowerCase() : '';
        setUser({
          displayName: wsUser.name,
          email: wsUser.email,
          photoURL: wsUser.picture,
        });
        if (token) setAccessToken(token);
        if (email) {
          saveLastUserEmail(email);
          mergeGuestDataIntoUser(email);
          setOfflineWorkspaceEmail(email);
        }
      },
      () => {
        // Workspace not signed in
      }
    );

    // 2. Listen for Supabase session if present
    const unsubSupabase = initSupabaseAuth(
      (authedUser, token) => {
        const email = authedUser.email ? authedUser.email.trim().toLowerCase() : '';
        setUser((prev) => prev || authedUser);
        if (token && (!accessToken || accessToken === 'local_token')) setAccessToken(token);
        if (email) {
          saveLastUserEmail(email);
          mergeGuestDataIntoUser(email);
          setOfflineWorkspaceEmail(email);
        }
      },
      () => {
        // Supabase signed out
      }
    );

    return () => {
      unsubWorkspace();
      unsubSupabase();
    };
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
      const grantedScope = params.get('scope') || '';
      if (providerToken) {
        setAccessToken(providerToken);
        try { localStorage.setItem('money_tracker_access_token', providerToken); } catch {}
        if (grantedScope && (!grantedScope.includes('spreadsheets') && !grantedScope.includes('drive'))) {
          showNotification('Notice: Please check "Select all" permissions to enable Google Sheets syncing.', 'info');
        }
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

  // Automatic one-time cleanup on startup to remove any ghost/corrupt records from localStorage and Supabase
  useEffect(() => {
    const rawStored = loadStoredTransactions(currentUserEmail);
    const sanitized = sanitizeTransactions(rawStored);
    if (sanitized.length !== rawStored.length) {
      setTransactions(sanitized);
      saveStoredTransactions(sanitized, currentUserEmail);
      saveStoredTransactions(sanitized, 'guest');
      if (activeSheet?.id) {
        saveSheetTransactions(activeSheet.id, sanitized);
      }
      if (user?.email) {
        const nextWs = buildCloudWorkspace(Date.now() + 20);
        nextWs.transactions = sanitized;
        void saveCloudWorkspace(nextWs).catch(console.warn);
      }
    }
  }, [currentUserEmail, activeSheet?.id, user?.email]);

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

      // Automatically push pending offline updates to cloud workspace & connected Google Sheet
      if (currentUserEmail) {
        const local = getLatestWorkspace(Date.now());
        void saveCloudWorkspace(local).then(() => {
          clearPendingSync(currentUserEmail);
          if (activeSheet && queueSheetPushRef.current) {
            queueSheetPushRef.current();
          }
        }).catch(console.warn);
      }
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

    const rawTxs = loadStoredTransactions(scope);
    const deletedIds = loadDeletedTxIds(scope);
    const initialTxs = sanitizeTransactions(rawTxs.filter((t) => !deletedIds.has(t.id)));
    const initialLends = loadStoredLendItems(scope);

    setTransactions(initialTxs);
    latestStateRef.current.transactions = initialTxs;
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

  const latestStateRef = useRef({
    transactions,
    lendItems,
    budgetConfig,
    alertPhone,
    telegramAlertConfig,
    activeSheet,
    userProfile,
    currency,
    currentUserEmail,
  });

  useEffect(() => {
    latestStateRef.current = {
      transactions,
      lendItems,
      budgetConfig,
      alertPhone,
      telegramAlertConfig,
      activeSheet,
      userProfile,
      currency,
      currentUserEmail,
    };
  });

  const getLatestWorkspace = useCallback((updatedAt: number): CloudWorkspace => {
    const s = latestStateRef.current;
    return {
      version: 1,
      updatedAt,
      transactions: s.transactions,
      lendItems: s.lendItems,
      categories: loadStoredCategoryDefs(s.currentUserEmail),
      budgetConfig: s.budgetConfig,
      alertPhone: s.alertPhone,
      telegramAlertConfig: s.telegramAlertConfig,
      activeSheet: s.activeSheet,
      profile: s.userProfile,
      currency: s.currency,
    };
  }, []);

  const buildCloudWorkspace = getLatestWorkspace;

  // Signed-out use is treated exactly like offline use. Keep a complete local
  // workspace snapshot current after every transaction/settings change so a
  // later login restores the user's final local state before any remote pull.
  useEffect(() => {
    if (!isSignedOutLocalMode || !offlineWorkspaceEmail) return;
    saveSignedOutWorkspace(offlineWorkspaceEmail, getLatestWorkspace(Date.now()));
  }, [isSignedOutLocalMode, offlineWorkspaceEmail, transactions, lendItems, budgetConfig, activeSheet, userProfile, currency, getLatestWorkspace]);

  const applyCloudWorkspace = useCallback((workspace: CloudWorkspace) => {
    if (!workspace || workspace.version !== 1 || !Number.isFinite(workspace.updatedAt)) return;
    // CRITICAL: Reject any remote workspace that is older than or equal to our local version!
    if (workspace.updatedAt <= cloudVersionRef.current) return;
    suppressNextCloudSyncRef.current = true;
    cloudVersionRef.current = workspace.updatedAt;
    const scope = currentUserEmail;
    const remoteTxs = sanitizeTransactions(Array.isArray(workspace.transactions) ? workspace.transactions : []);
    const remoteLends = Array.isArray(workspace.lendItems) ? workspace.lendItems : [];

    const deletedIds = loadDeletedTxIds(scope);
    const filteredRemoteTxs = remoteTxs.filter((t) => !deletedIds.has(t.id));

    // Never let an empty remote cloud wipe local transactions
    const currentLocalTxs = loadStoredTransactions(scope);
    if (filteredRemoteTxs.length === 0 && currentLocalTxs.length > 0) {
      void saveCloudWorkspace(getLatestWorkspace(Date.now() + 100)).catch(console.warn);
      return;
    }

    setTransactions(filteredRemoteTxs);
    latestStateRef.current.transactions = filteredRemoteTxs;
    saveStoredTransactions(filteredRemoteTxs, scope);
    if (workspace.activeSheet?.id) {
      saveSheetTransactions(workspace.activeSheet.id, filteredRemoteTxs);
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

  const queueCloudSync = useCallback((customWorkspace?: CloudWorkspace) => {
    if (!user?.email || !cloudSyncReady) return;
    if (cloudSyncTimerRef.current) window.clearTimeout(cloudSyncTimerRef.current);
    
    // Bump version immediately to stamp freshness and reject any older remote incoming messages
    const nextVersion = Math.max(Date.now(), cloudVersionRef.current + 1);
    cloudVersionRef.current = nextVersion;

    cloudSyncTimerRef.current = window.setTimeout(() => {
      const ws = customWorkspace || getLatestWorkspace(nextVersion);
      ws.updatedAt = nextVersion;
      void saveCloudWorkspace(ws)
        .then(() => {
          clearPendingSync(currentUserEmail);
        })
        .catch((error) => console.error('Cloud workspace sync failed:', error));
    }, 600);
  }, [user?.email, cloudSyncReady, currentUserEmail, getLatestWorkspace]);

  // Cloud Workspace Subscription: runs strictly on user login or network status changes
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
          // Reconnect path: merge pending local edits over remote
          const merged = mergePendingWorkspace(
            remoteWorkspace,
            getLatestWorkspace(Date.now()),
            loadPendingSync(currentUserEmail),
            Math.max(Date.now(), remoteWorkspace.updatedAt + 1)
          );
          applyCloudWorkspace(merged);
          await saveCloudWorkspace(merged);
          clearPendingSync(currentUserEmail);
        } else if (remoteWorkspace) {
          if (remoteWorkspace.updatedAt > cloudVersionRef.current) {
            applyCloudWorkspace(remoteWorkspace);
          }
        } else {
          // New cloud workspace on Supabase: upload current local data
          const local = getLatestWorkspace(Date.now());
          await saveCloudWorkspace(local);
          clearPendingSync(currentUserEmail);
        }

        setCloudSyncReady(true);
        channel = await subscribeToCloudWorkspace((workspace) => {
          if (workspace && workspace.updatedAt > cloudVersionRef.current) {
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
      unsubscribeFromCloudWorkspace(channel);
    };
  }, [user?.email, isOnline, currentUserEmail, applyCloudWorkspace, getLatestWorkspace]);

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
    const testPayload = generateTransactionTelegramAlert({
      id: 'test',
      amount: 100,
      type: 'cash_added',
      category: 'Other',
      notes: 'Salary / Top-up',
      date: today,
      time: sampleTime,
      paymentMethod: 'Cash',
      createdAt: Date.now(),
    }, currency, overallSummary.currentCashBalance);

    const res = await sendTelegramAlert({
      ...testPayload,
      chatId: chatId.trim(),
    });
    if (res.queued) {
      showNotification('Offline: Test alert queued and will send when online.', 'info');
    } else {
      showNotification('Telegram test alert delivered successfully!', 'success');
    }
  };

  // Save active sheet metadata
  const handleSetActiveSheet = (meta: GoogleSheetMeta | null) => {
    const isNewSheet = Boolean(meta?.id && meta.id !== activeSheet?.id);
    markSettingsDirty(currentUserEmail);
    setActiveSheet(meta);
    saveStoredSheetMeta(meta, currentUserEmail);
    if (meta?.id) {
      saveKnownSpreadsheet(meta, currentUserEmail);
    }
    // Immediately persist to Supabase cloud workspace so all devices get the sheet update
    if (user?.email) {
      const nextWs = buildCloudWorkspace(Date.now());
      nextWs.activeSheet = meta;
      void saveCloudWorkspace(nextWs).catch((err) => {
        console.warn('Cloud sync of activeSheet note:', err);
      });
    }
    // When a sheet is connected, sync immediately (imports any existing rows and pushes full records)
    if (meta?.id) {
      void handlePushToSheet({ silent: false, interactive: false }).catch(console.warn);
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
      const remoteTxs = await fetchAllTransactionsFromSheet(token, sId, currentUserEmail || undefined);
      const remoteLends = await fetchAllLendItemsFromSheet(token, sId);

      const deletedIds = loadDeletedTxIds(currentUserEmail);
      const validRemoteTxs = remoteTxs.filter((t) => !deletedIds.has(t.id));

      // If user deleted rows in Google Sheets, detect missing items and mark them deleted so they don't resurrect:
      if (validRemoteTxs.length > 0 && transactions.length > 0) {
        const remoteIdSet = new Set(validRemoteTxs.map((t) => t.id));
        const missingFromSheet = transactions.filter((t) => !remoteIdSet.has(t.id));
        if (missingFromSheet.length > 0) {
          markTxIdsDeleted(missingFromSheet.map((t) => t.id), currentUserEmail);
        }
      }

      // Cleanly replace: show ONLY the valid sanitized records from this connected Google Sheet
      const sortedTxs = sanitizeTransactions(validRemoteTxs).sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });

      latestStateRef.current.transactions = sortedTxs;
      setTransactions(sortedTxs);
      saveStoredTransactions(sortedTxs, currentUserEmail);
      saveSheetTransactions(sId, sortedTxs);

      setLendItems(remoteLends);
      saveStoredLendItems(remoteLends, currentUserEmail);
      saveSheetLendItems(sId, remoteLends);

      if (user?.email) {
        const nextWs = buildCloudWorkspace(Date.now());
        nextWs.transactions = sortedTxs;
        nextWs.lendItems = remoteLends;
        void saveCloudWorkspace(nextWs).catch(console.warn);
      }

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
    markTxIdsDeleted(txIds, currentUserEmail);
    txIds.forEach((id) => markTransactionDelete(id, currentUserEmail));
    const updated = transactions.filter((t) => !txIds.includes(t.id));
    latestStateRef.current.transactions = updated;
    setTransactions(updated);
    saveStoredTransactions(updated, currentUserEmail);
    if (activeSheet?.id) {
      saveSheetTransactions(activeSheet.id, updated);
    }
    setSelectedTransactionIds([]);
    if (user?.email) {
      const nextWs = buildCloudWorkspace(Date.now() + 50);
      nextWs.transactions = updated;
      cloudVersionRef.current = nextWs.updatedAt;
      void saveCloudWorkspace(nextWs).catch(console.warn);
    }
    if (activeSheet) {
      void handlePushToSheet({ silent: true }, { transactions: updated, lendItems });
    }
    showNotification(`Deleted ${txIds.length} transactions.`, 'info');
  };

  // Google Login handler via Supabase Google OAuth (shows all Gmails, zero origin_mismatch)
  const handleSignIn = async () => {
    try {
      showNotification('Opening Google Sign-In... Please check "Select all" on the screen.', 'info');
      const res = await signInWithGoogleSupabase();
      if (!res.success && res.errorMessage) {
        showNotification(res.errorMessage, 'error');
      }
    } catch (err: any) {
      console.warn('Google Sign-In Exception:', err);
      const msg = String(err?.message || err);
      if (!msg.includes('closed') && !msg.includes('cancelled')) {
        showNotification('Google Sign-In notice: ' + msg, 'error');
      }
    }
  };

  const handleSignOut = async () => {
    const signedOutScope = user?.email ? user.email.trim().toLowerCase() : (offlineWorkspaceEmail || null);
    if (signedOutScope && signedOutScope !== 'guest') {
      saveStoredTransactions(transactions, signedOutScope);
      saveStoredLendItems(lendItems, signedOutScope);
      if (activeSheet) {
        saveStoredSheetMeta(activeSheet, signedOutScope);
      }
      saveStoredProfile(userProfile, signedOutScope);
      saveStoredBudgetConfig(budgetConfig, signedOutScope);
      saveLastUserEmail(signedOutScope);
      setOfflineWorkspaceEmail(signedOutScope);
      try {
        localStorage.setItem(LAST_OFFLINE_WORKSPACE_KEY, signedOutScope);
      } catch (e) {}
    }
    try {
      localStorage.removeItem('money_tracker_user');
      localStorage.removeItem('money_tracker_user_info');
      localStorage.removeItem('spenddesk_google_token');
      localStorage.removeItem('money_tracker_access_token');
    } catch (e) {}
    await signOutGoogleWorkspace();
    await signOutSupabase();
    setUser(null);
    setAccessToken(null);
    showNotification('Signed out. Your transactions remain saved in local storage.', 'info');
  };

  const isPushingToSheetRef = useRef(false);

  // Push & Two-Way Sync Data with Connected Google Sheet (Transactions, Lend/Borrow, and Dashboard KPIs)
  const handlePushToSheet = useCallback(async (
    options: { silent?: boolean; interactive?: boolean } = { silent: true },
    snapshot?: { transactions: Transaction[]; lendItems: LendItem[] }
  ): Promise<boolean> => {
    if (!activeSheet) return false;
    if (isPushingToSheetRef.current) return false;
    isPushingToSheetRef.current = true;

    let sheetToken = accessToken;
    let hasGoogleSheetsToken = Boolean(sheetToken && sheetToken !== 'local_token' && !sheetToken.startsWith('eyJ') && sheetToken.length > 20);
    if (!hasGoogleSheetsToken) {
      const cached = getCachedWorkspaceToken();
      if (cached && !cached.startsWith('eyJ') && cached !== 'local_token' && cached.length > 20) {
        sheetToken = cached;
        setAccessToken(cached);
        hasGoogleSheetsToken = true;
      }
    }

    if (!hasGoogleSheetsToken) {
      if (!options.interactive) {
        isPushingToSheetRef.current = false;
        return false;
      }
      try {
        const freshToken = await requestGoogleAccessToken(true);
        if (freshToken && !freshToken.startsWith('eyJ') && freshToken !== 'local_token' && freshToken.length > 20) {
          sheetToken = freshToken;
          setAccessToken(freshToken);
          hasGoogleSheetsToken = true;
        }
      } catch (err: any) {
        if (!options.silent) {
          showNotification(err?.message || 'Google Sheet permission is required.', 'error');
        }
      }
    }

    if (!hasGoogleSheetsToken) {
      isPushingToSheetRef.current = false;
      return false;
    }
    
    // Always trigger visual sync indicator on header icon
    setIsSyncing(true);
    try {
      const currentLocalTxs = sanitizeTransactions(snapshot?.transactions ?? latestStateRef.current.transactions);
      const currentLocalLends = snapshot?.lendItems ?? latestStateRef.current.lendItems;

      // 1. Write complete records to Transactions sheet (including Out of Wallet, Card Payment & Lend widget)
      await overwriteTransactionsInSheet(sheetToken, activeSheet.id, currentLocalTxs, currentLocalLends);
      
      // 2. Write Lend & Borrow records to dedicated Lend_Borrow tab
      await overwriteLendItemsInSheet(sheetToken, activeSheet.id, currentLocalLends);

      // 3. Update Dashboard KPI Totals & Trends
      const allSummary = calculateSummary(currentLocalTxs, currentLocalTxs);
      const catSummary = calculateCategoryBreakdown(currentLocalTxs);
      const { dayTotals } = calculateWeeklyDailyTrend(currentLocalTxs);
      await syncDashboardStats(sheetToken, activeSheet.id, allSummary, catSummary, dayTotals);

      const updatedMeta: GoogleSheetMeta = {
        ...activeSheet,
        lastSyncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      saveStoredSheetMeta(updatedMeta, currentUserEmail);
      suppressNextCloudSyncRef.current = true;
      setActiveSheet(updatedMeta);

      if (!options.silent) {
        showNotification(`Synced ${currentLocalTxs.length} records with "${activeSheet.name}"!`, 'success');
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
      isPushingToSheetRef.current = false;
      setIsSyncing(false);
    }
  }, [activeSheet, accessToken, currentUserEmail, user?.email, buildCloudWorkspace]);

  const sheetPushTimerRef = useRef<number | null>(null);
  const queueSheetPush = useCallback((snapshot?: { transactions: Transaction[]; lendItems: LendItem[] }) => {
    // Only queue background Google Sheet push if user is signed in, online, and active sheet exists
    if (!activeSheet || !user?.email || !isOnline) return;
    if (sheetPushTimerRef.current) window.clearTimeout(sheetPushTimerRef.current);
    const currentSnapshot = snapshot || {
      transactions: latestStateRef.current.transactions,
      lendItems: latestStateRef.current.lendItems,
    };
    sheetPushTimerRef.current = window.setTimeout(() => {
      void handlePushToSheet({ silent: true }, currentSnapshot).catch((err) => {
        console.warn('Background sheet push note:', err);
      });
    }, 1200);
  }, [activeSheet, user?.email, isOnline, handlePushToSheet]);

  useEffect(() => {
    queueSheetPushRef.current = queueSheetPush;
  }, [queueSheetPush]);

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
      unmarkTxIdDeleted(recordedTx.id, currentUserEmail);
      updatedTxs = transactions.map((t) => (t.id === txData.id ? recordedTx : t));
      markTransactionUpsert(recordedTx, currentUserEmail);
      latestStateRef.current.transactions = updatedTxs;
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
      unmarkTxIdDeleted(recordedTx.id, currentUserEmail);
      updatedTxs = [recordedTx, ...transactions];
      markTransactionUpsert(recordedTx, currentUserEmail);
      latestStateRef.current.transactions = updatedTxs;
      saveStoredTransactions(updatedTxs, currentUserEmail);
      if (activeSheet?.id) {
        saveSheetTransactions(activeSheet.id, updatedTxs);
      }
      setTransactions(updatedTxs);
      showNotification('Transaction recorded.', 'success');
    }

    // Non-blocking background side effects (SMS, Telegram, Webhook)
    setTimeout(() => {
      if (sendSmsTo) {
        handleUpdateAlertPhone(sendSmsTo);
        const currentSum = calculateSummary(updatedTxs, updatedTxs);
        const smsBody = generateTransactionSmsText(recordedTx, currentSum.currentCashBalance, currency);
        triggerDeviceSms(sendSmsTo, smsBody);
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
          });

        // Trigger Low Balance Alert if balance is below threshold
        if (
          budgetConfig.lowCashThreshold > 0 &&
          currentSum.currentCashBalance <= budgetConfig.lowCashThreshold
        ) {
          const lowBalAlert = generateLowBalanceTelegramAlert(
            currentSum.currentCashBalance,
            budgetConfig.lowCashThreshold,
            currency
          );
          void sendTelegramAlert({ ...lowBalAlert, chatId: telegramAlertConfig.chatId }).catch(console.warn);
        }
      }

      const webhookUrl = loadStoredWebhookUrl();
      if (webhookUrl) {
        const sum = calculateSummary(updatedTxs, updatedTxs);
        syncViaWebhook(webhookUrl, updatedTxs as any, sum, lendItems).catch(console.warn);
      }
    }, 0);

    if (activeSheet) {
      queueSheetPush({ transactions: updatedTxs, lendItems });
    }
  };

  const handleConfirmBalanceAdjustment = (actualCashAmount: number, difference: number) => {
    if (Math.abs(difference) < 0.001) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const dateStr = now.toISOString().split('T')[0];

    handleSaveTransaction({
      date: dateStr,
      time: timeStr,
      type: difference > 0 ? 'cash_added' : 'cash_expense',
      category: 'Other',
      amount: Math.abs(difference),
      paymentMethod: 'Cash',
      notes: 'Cash Balance Adjustment',
    });
    showNotification(`Cash in hand adjusted to ${formatCurrency(actualCashAmount, currency)}`, 'success');
  };

  // Safe Deletion Handler
  const handleDeleteTransaction = (tx: Transaction) => {
    setDeleteCandidate(tx);
  };

  const confirmDelete = () => {
    if (!deleteCandidate) return;
    const delId = deleteCandidate.id;
    markTxIdDeleted(delId, currentUserEmail);
    markTransactionDelete(delId, currentUserEmail);
    const remaining = transactions.filter((t) => t.id !== delId);
    latestStateRef.current.transactions = remaining;
    setTransactions(remaining);
    saveStoredTransactions(remaining, currentUserEmail);
    if (activeSheet?.id) {
      saveSheetTransactions(activeSheet.id, remaining);
    }
    setDeleteCandidate(null);
    showNotification('Transaction deleted.', 'info');

    if (user?.email) {
      const nextWs = buildCloudWorkspace(Date.now() + 50);
      nextWs.transactions = remaining;
      cloudVersionRef.current = nextWs.updatedAt;
      void saveCloudWorkspace(nextWs).catch(console.warn);
    }

    if (activeSheet) {
      void handlePushToSheet({ silent: true }, { transactions: remaining, lendItems });
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

    if (telegramAlertConfig.enabled && telegramAlertConfig.chatId) {
      const currentSum = calculateSummary(transactions, transactions);
      const lendAlert = generateLendTelegramAlert(newItem, currency, currentSum.currentCashBalance);
      void sendTelegramAlert({ ...lendAlert, chatId: telegramAlertConfig.chatId })
        .then((res) => {
          if (!res.queued) {
            showNotification('Telegram alert delivered.', 'success');
          }
        })
        .catch(console.warn);
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

  const [currentDateStr, setCurrentDateStr] = useState<string>(() => getLocalDateString());

  // Automatically refresh date every 30s or on window focus so every day starts fresh with 0 daily spend
  useEffect(() => {
    const updateDate = () => {
      const freshDate = getLocalDateString();
      setCurrentDateStr((prev) => (prev !== freshDate ? freshDate : prev));
    };
    const interval = setInterval(updateDate, 30000);
    window.addEventListener('focus', updateDate);
    document.addEventListener('visibilitychange', updateDate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', updateDate);
      document.removeEventListener('visibilitychange', updateDate);
    };
  }, []);

  const todayStr = currentDateStr;

  const todaySpend = useMemo(() => {
    return transactions
      .filter((t) => t.date === todayStr && (t.type === 'cash_expense' || t.type === 'card_expense'))
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions, todayStr]);

  const thisMonthSpend = useMemo(() => {
    const currentMonthPrefix = todayStr.substring(0, 7);
    return transactions
      .filter((t) => (t.date || '').startsWith(currentMonthPrefix) && (t.type === 'cash_expense' || t.type === 'card_expense'))
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
          storageEmail={currentUserEmail}
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
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'transactions', label: 'Transactions' },
              { id: 'lend', label: 'Lend & Borrow' },
              { id: 'analytics', label: 'Analytics' },
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
              storageEmail={currentUserEmail}
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
                setSelectedTransactionIds([]);
                saveStoredTransactions([], currentUserEmail);
                saveStoredTransactions([], 'guest');
                saveStoredLendItems([], currentUserEmail);
                saveStoredLendItems([], 'guest');
                clearPendingSync(currentUserEmail);
                clearPendingSync('guest');
                if (activeSheet?.id) {
                  clearSheetCache(activeSheet.id);
                  saveSheetTransactions(activeSheet.id, []);
                  saveSheetLendItems(activeSheet.id, []);
                  if (accessToken) {
                    void overwriteTransactionsInSheet(accessToken, activeSheet.id, [], []).catch(console.warn);
                    void overwriteLendItemsInSheet(accessToken, activeSheet.id, []).catch(console.warn);
                    void syncDashboardStats(accessToken, activeSheet.id, { currentCashBalance: 0, cashAdded: 0, cashSpent: 0, cardSpend: 0, totalSpend: 0, outOfWallet: 0 }, [], {}).catch(console.warn);
                  }
                }
                if (user?.email) {
                  const wipeTimestamp = Math.max(Date.now(), cloudVersionRef.current + 5000);
                  cloudVersionRef.current = wipeTimestamp;
                  void saveCloudWorkspace({
                    version: 1,
                    updatedAt: wipeTimestamp,
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
                showNotification('All records reset successfully! Storage and Google Sheet refreshed.', 'info');
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
                onAdjustBalance={() => setIsAdjustModalOpen(true)}
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
                  allTransactions={transactions}
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
                  onBulkDelete={handleBulkDeleteTransactions}
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
                allTransactions={transactions}
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
                onBulkDelete={handleBulkDeleteTransactions}
                selectedTxIds={selectedTransactionIds}
                onSelectedTxIdsChange={setSelectedTransactionIds}
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

          {activeTab === 'lend' && (
            <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
              <LendBorrowView
                items={lendItems}
                onAddItem={handleAddLendItem}
                onToggleStatus={handleToggleLendStatus}
                onDeleteItem={handleDeleteLendItem}
                currency={currency}
              />
            </main>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Native Mobile Bottom Navigation Bar */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pendingLendCount={pendingLendCount}
        onQuickAdd={() => {
          setEditingTransaction(null);
          setModalDefaultType('cash_expense');
          setIsTxModalOpen(true);
        }}
      />

      {/* Quick Cash Balance Adjustment Modal */}
      <AdjustBalanceModal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        currentBalance={summary.currentCashBalance}
        currency={currency}
        onConfirmAdjustment={handleConfirmBalanceAdjustment}
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
