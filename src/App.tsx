import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  initAuthListener,
  signInWithGoogleSupabase,
  signInWithPasswordSupabase,
  signUpWithPasswordSupabase,
  sendPasswordResetSupabase,
  setNewPasswordSupabase,
  readAuthStatus,
  peekAuthStatus,
  writeAuthStatus,
  AuthStatus,
} from './lib/supabase';
import {
  getCachedWorkspaceToken,
  setCachedWorkspaceToken,
  clearWorkspaceTokenState,
  setCurrentWorkspaceAccount,
  isGoogleTokenExpired,
  refreshGoogleTokenSilently,
  resetSignIn,
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
  CategoryDef,
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
  loadLendDeletedIds,
  markLendIdsDeleted,
  unmarkLendIdDeleted,
  exportFullBackupJson,
  saveLastUserEmail,
  loadLastUserEmail
} from './lib/storage';
import { 
  calculateSummary, 
  calculateCategoryBreakdown, 
  calculateWeeklyDailyTrend, 
  calculateRunningBalances,
  filterTransactions,
  formatCurrency,
  sanitizeTransactions,
  getLocalDateString,
  isCarryForwardTransaction
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
  syncViaWebhook,
  createMoneyTrackerSpreadsheet,
  classifySheetError,
  friendlySheetErrorMessage
} from './lib/sheetsApi';
import { generateTransactionSmsText, generateLendSmsText, generateLowBalanceSmsText, triggerDeviceSms } from './lib/smsAlert';
import { 
  generateTransactionTelegramAlert,
  generateDeletedTransactionTelegramAlert,
  generateBulkDeletedTransactionsTelegramAlert,
  generateLendTelegramAlert, 
  generateLowBalanceTelegramAlert, 
  sendTelegramAlert, 
  flushPendingTelegramAlerts 
} from './lib/telegramAlert';
import { createTelegramLink, getTelegramLinkStatus, TelegramLinkStatus } from './lib/telegramConnect';
import { CloudWorkspace, fetchCloudWorkspace, saveCloudWorkspace, subscribeToCloudWorkspace, unsubscribeFromCloudWorkspace } from './lib/cloudWorkspace';
import { AuthProgressOverlay } from './components/AuthProgressOverlay';
import {
  beginOAuthExchange,
  clearAuthPhase,
  failAuthPhase,
  getAuthPhase,
  isAuthPhaseActive,
  isAuthPhaseInFlight,
  restorePersistedPhase,
  subscribeAuthPhase,
} from './lib/authPhase';
import { clearPendingSync, hasPendingSync, loadPendingSync, markLendDelete, markLendUpsert, markSettingsDirty, markTransactionDelete, markTransactionUpsert, mergePendingWorkspace, stageWorkspaceForReplay } from './lib/pendingSync';
import { clearSheetSyncDirty, markSheetSyncDirty, noteSheetSyncAttempt, readSheetOutbox, SHEET_OUTBOX_MAX_BACKOFF_MS } from './lib/sheetOutbox';
import { clearSignedOutWorkspace, loadSignedOutWorkspace, saveSignedOutWorkspace } from './lib/signedOutWorkspace';
import {
  buildCarryForwardTransaction,
  CarryForwardOffer,
  evaluateCarryForward,
  findTodayCarryForward,
  hasCarryPromptFor,
  markCarryPromptShown,
} from './lib/dailyCarryForward';
import { DailyCarryForwardModal } from './components/DailyCarryForwardModal';
import { Header } from './components/Header';
import { SummaryCards } from './components/SummaryCards';
import { BudgetAlerts } from './components/BudgetAlerts';
import { FilterBar } from './components/FilterBar';
import { TransactionTable } from './components/TransactionTable';
import { TransactionModal } from './components/TransactionModal';
import { SheetManagerView } from './components/SheetManagerView';
import { ConfirmModal } from './components/ConfirmModal';
import { SetNewPasswordModal } from './components/SetNewPasswordModal';
import { SmsParserModal } from './components/SmsParserModal';
import { AuthHelpModal } from './components/AuthHelpModal';
import { AdjustBalanceModal } from './components/AdjustBalanceModal';
import { OutOfWalletModal } from './components/OutOfWalletModal';
import { SessionExpiredModal, SessionNoticeKind } from './components/SessionExpiredModal';
import { SheetSetupModal, SheetSetupPhase } from './components/SheetSetupModal';
import { SplashScreen } from './components/SplashScreen';
import { SignInScreen } from './components/SignInScreen';
import { BottomNav } from './components/BottomNav';
import { Sidebar } from './components/Sidebar';
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
  Home,
  Receipt,
  BarChart2,
  FileSpreadsheet,
  Plus
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
  // The Supabase session is the ONLY source of truth for "signed in".
  // A stored profile is a display cache, never an auth signal: restoring it
  // as a live session is exactly what made the app look connected (and
  // silently fail to sync) after a long idle.
  const [user, setUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  // What this device believes about the sign-in:
  //   signed_in  - a live session exists,
  //   signed_out - the user signed out on purpose (local mode, no nagging),
  //   expired    - the session died while the app was closed (local mode, and
  //                the one moment where the app says so out loud).
  // null = first visit on this device (never signed in, never signed out):
  // the sign-in page shows no notice at all in that case.
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(() => peekAuthStatus());
  // The connection-lost alert. A lost session or a revoked Google grant is
  // announced exactly once by a modal; a cooldown stops it nagging on every
  // retry tick, and an intentional sign-out never raises it at all.
  const [connectionNotice, setConnectionNotice] = useState<SessionNoticeKind | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  // Live mirror of the auth phase. App used to read getAuthPhase() only during
  // render, so an exchange that finished without another state change left the
  // screen believing it was still in flight - which held the daily carry
  // popup hostage (never shown, never added, balance Rs 0 all day).
  const [authPhaseState, setAuthPhaseState] = useState(() => getAuthPhase());
  useEffect(() => subscribeAuthPhase(setAuthPhaseState), []);
  const lastConnectionNoticeAtRef = useRef(0);
  const noTokenPushStreakRef = useRef(0);
  // Daily balance carry-forward. Offered once per day per account: yesterday's
  // closing balance becomes today's opening balance as a real ledger row.
  const [carryOffer, setCarryOffer] = useState<CarryForwardOffer | null>(null);
  const [isApplyingCarry, setIsApplyingCarry] = useState(false);
  const carryPersistLockRef = useRef(false);
  // SESSION-ONLY DISMISSAL. The popup is no longer once-per-day: closing the
  // app, reopening it or refreshing brings it back for as long as today still
  // has no carry row of its own. "Not now" only silences it for the current
  // session (a save mid-session must not re-nag), and it can never double-add
  // money because evaluateCarryForward returns null the moment today's carry
  // row exists — accept once and the offer, and therefore the popup, is gone.
  const carryDismissedRef = useRef<{ day: string; scope: string } | null>(null);
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

  // Server-side Telegram link (deep-link flow): chat IDs never live in the browser.
  const [telegramLinkStatus, setTelegramLinkStatus] = useState<TelegramLinkStatus | null>(null);
  // True while the FIRST status lookup for this account is still in flight. Without
  // it the UI renders "Not connected" for the moment before the answer lands -
  // which is what made a connected account look disconnected on every open.
  const [isTelegramStatusLoading, setIsTelegramStatusLoading] = useState(false);

  const refreshTelegramLinkStatus = async (): Promise<TelegramLinkStatus | null> => {
    try {
      const status = await getTelegramLinkStatus();
      setTelegramLinkStatus(status);
      return status;
    } catch (error) {
      // Only a genuine "nobody is signed in" clears the status. A network blip,
      // a cold Supabase function or a 5xx must NOT wipe what we already know:
      // doing so flipped a connected account back to "Not connected" until the
      // next successful lookup, which is the bug users were seeing.
      const status = (error as { context?: { status?: number } })?.context?.status ?? 0;
      const isAuthFailure = status === 401 || status === 403;
      if (isAuthFailure) {
        setTelegramLinkStatus(null);
        return null;
      }
      // Keep the last known state; callers still get null so they know this
      // attempt did not produce fresh data.
      return null;
    }
  };

  useEffect(() => {
    // The Telegram link belongs to an account. Asking for it while nobody is
    // signed in is a guaranteed 401, so the local fallback is used instead.
    if (!user?.id) {
      setTelegramLinkStatus(null);
      setIsTelegramStatusLoading(false);
      return;
    }
    // Start from "unknown", not "disconnected": until the server answers we
    // genuinely do not know, and asserting the wrong answer is the visible bug.
    setTelegramLinkStatus(null);
    setIsTelegramStatusLoading(true);
    void refreshTelegramLinkStatus().finally(() => setIsTelegramStatusLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Automatic alerts are sent when the server-side link is active and its toggle is
  // on; accounts that connected before the deep-link flow keep using the local config.
  const telegramSendActive = telegramLinkStatus?.connected
    ? telegramLinkStatus.alertsEnabled
    : (telegramAlertConfig.enabled && Boolean(telegramAlertConfig.chatId));
  const [budgetConfig, setBudgetConfig] = useState<BudgetConfig>(() => loadStoredBudgetConfig(initialScope));
  const [categories, setCategories] = useState<CategoryDef[]>(() => loadStoredCategoryDefs(initialScope));
  const [currency, setCurrency] = useState<string>('Rs');

  const [currentDateStr, setCurrentDateStr] = useState<string>(() => {
    try {
      if (localStorage.getItem('spenddesk_daily_refresh') === 'off') {
        const locked = localStorage.getItem('spenddesk_locked_date');
        if (locked) return locked;
      }
    } catch {}
    return getLocalDateString();
  });

  // Daily refresh: when ON (default) the dashboard rolls over to the new day automatically
  // (today's spend / balance figures start fresh each day). When switched OFF, date is frozen and will NOT roll over.
  const [dailyRefresh, setDailyRefresh] = useState<boolean>(() => {
    try { return localStorage.getItem('spenddesk_daily_refresh') !== 'off'; } catch { return true; }
  });
  const handleUpdateDailyRefresh = (enabled: boolean) => {
    setDailyRefresh(enabled);
    try {
      localStorage.setItem('spenddesk_daily_refresh', enabled ? 'on' : 'off');
      if (!enabled) {
        localStorage.setItem('spenddesk_locked_date', currentDateStr);
      } else {
        localStorage.removeItem('spenddesk_locked_date');
        const fresh = getLocalDateString();
        setCurrentDateStr(fresh);
      }
    } catch {}
  };
  const [userProfile, setUserProfile] = useState<UserProfile>(() => loadStoredProfile());

  // NOTE: the header, the wallet card, Settings and the Google Sheets page all
  // read the SAME figure (`summary` below) - the balance for the date the
  // header is showing. An all-time variant used to feed Settings and the Sheets
  // page, which is why those two screens showed a different cash number from
  // everywhere else.

  // Default Filter State - always starts on TODAY (the current date), on every
  // app open. Never defaults to the all-time view; the midnight rollover above
  // re-points the 'today' preset when the calendar day changes.
  const DEFAULT_FILTER: FilterState = useMemo(() => {
    const today = getLocalDateString();
    return {
      type: 'today',
      startDate: today,
      endDate: today,
      category: 'All',
      paymentMethod: 'All',
      searchQuery: '',
    };
  }, []);

  // The all-time view, used as the opening state of the look-back sections
  // (Transactions, Analytics). Empty date bounds mean "no date restriction" -
  // filterTransactions only applies a bound when it is a non-empty string.
  const ALL_FILTER: FilterState = useMemo(
    () => ({
      type: 'all',
      startDate: '',
      endDate: '',
      category: 'All',
      paymentMethod: 'All',
      searchQuery: '',
    }),
    []
  );

  type SectionTab = 'dashboard' | 'transactions' | 'analytics';

  // Global HEADER date filter: picked in the header calendar pill, persists
  // across pages (never reset on navigation) and drives the wallet balance and
  // summary cards everywhere.
  const [headerFilter, setHeaderFilter] = useState<FilterState>(DEFAULT_FILTER);

  // Per-SECTION filters: each section's FilterBar edits only its own state, so
  // changing e.g. the Transactions range never touches Dashboard/Analytics.
  //
  // Dashboard opens on TODAY because it is the "what is happening now" view and
  // the wallet balance follows it. Transactions and Analytics open on ALL: they
  // are the look-back views, and defaulting them to a single day meant a fresh
  // open always showed an empty list to anyone whose spending was not today.
  const [sectionFilters, setSectionFilters] = useState<Record<SectionTab, FilterState>>({
    dashboard: DEFAULT_FILTER,
    transactions: ALL_FILTER,
    analytics: ALL_FILTER,
  });
  const setSectionFilter = useCallback((tab: SectionTab, next: FilterState) => {
    setSectionFilters((prev) => ({ ...prev, [tab]: next }));
  }, []);

  // The header filter only ever carries dates; section filters may also carry
  // category / payment-method / search refinements.
  const headerDateFilter = useMemo<FilterState>(() => ({
    ...DEFAULT_FILTER,
    startDate: headerFilter.startDate,
    endDate: headerFilter.endDate,
  }), [headerFilter, DEFAULT_FILTER]);

  // Transactions visible under the global header date - the base for the wallet
  // balance, summary cards and every section (each section then narrows further).
  const dateFilteredTransactions = useMemo(
    () => filterTransactions(transactions, headerDateFilter),
    [transactions, headerDateFilter]
  );

  // Sections filter over ALL transactions (not the header-date subset), so a
  // section's "All" chip really shows the full total. The header calendar keeps
  // driving only the wallet balance / summary cards.
  const filterFor = useCallback(
    (tab: SectionTab) => filterTransactions(transactions, sectionFilters[tab]),
    [transactions, sectionFilters]
  );

  // Modal & View States
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [modalDefaultType, setModalDefaultType] = useState<TransactionType>('cash_expense');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  // Out-of-wallet → "was this borrowed?" prompt (amount + date of the excess).
  const [oowPrompt, setOowPrompt] = useState<{ amount: number; date: string } | null>(null);
  const [isSmsModalOpen, setIsSmsModalOpen] = useState(false);
  const [isAuthHelpOpen, setIsAuthHelpOpen] = useState(false);
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  // The emailed password-reset link returns here with a short recovery
  // session — this card is where the new password is chosen.
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'main' | 'categories' | 'preferences' | 'budget' | 'cloud' | 'data' | 'about' | 'profile'>('main');
  const [deleteCandidate, setDeleteCandidate] = useState<Transaction | null>(null);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  // Friendly "set up your Google Sheet" popup. Replaces the raw Google API
  // error a signed-in account with no sheet (or a dead sheet) used to hit.
  const [sheetSetupPhase, setSheetSetupPhase] = useState<SheetSetupPhase | null>(null);
  const [sheetSetupMessage, setSheetSetupMessage] = useState<string | undefined>(undefined);

  // Branded splash — EVERY load and every refresh, then gone again. It used to
  // be gated by a sessionStorage flag, so only the first visit of a tab ever
  // saw it; a reload dropped straight into the dashboard with no beat.
  const [splashVisible, setSplashVisible] = useState<boolean>(true);

  useEffect(() => {
    if (!splashVisible) return;
    const timer = window.setTimeout(() => {
      setSplashVisible(false);
    }, 1900);
    return () => window.clearTimeout(timer);
  }, [splashVisible]);

  // Status & Syncing
  const [isSyncing, setIsSyncing] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [cloudSyncReady, setCloudSyncReady] = useState(false);
  const [cloudWorkspaceRevision, setCloudWorkspaceRevision] = useState(0);
  const [pendingSheetPushEmail, setPendingSheetPushEmail] = useState<string | null>(loadPendingSheetPushEmail);
  const cloudVersionRef = useRef(0);
  const cloudSyncTimerRef = useRef<number | null>(null);
  // The account that currently owns this device's Google credentials. Used to
  // drop the previous account's token the moment a different account signs in.
  const lastSignedInEmailRef = useRef<string | null>(null);
  const queueSheetPushRef = useRef<((snapshot?: { transactions: Transaction[]; lendItems: LendItem[] }) => void) | null>(null);
  const suppressNextCloudSyncRef = useRef(false);

  const showNotification = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    // Premium toast rules: one compact message at a time, never the same
    // one stacked twice, quick dismissal for ordinary confirmations and a
    // longer life for errors the user still has to read.
    setNotification((curr) => (curr && curr.message === message ? curr : { message, type }));
    const visibleFor = type === 'error' ? 5000 : type === 'info' ? 3500 : 2600;
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, visibleFor);
  };

  // Raise the connection-lost popup for a genuine loss of sync capability.
  //   'session' - the sign-in itself is gone (cloud + sheet both pause),
  //   'google'  - sign-in alive but Google access revoked (sheet pauses).
  // Never twice inside 10 minutes: the sync watchdog retries on a timer, and
  // a modal that re-pops every tick would be worse than the old silent failure.
  const reportConnectionLost = (kind: SessionNoticeKind) => {
    const now = Date.now();
    if (now - lastConnectionNoticeAtRef.current < 10 * 60 * 1000) return;
    // OFFLINE IS NOT A LOST CONNECTION. With no network the session cannot be
    // refreshed, so the device carries on in its own local workspace (see the
    // sign-in gate below) — the offline toast already says what is happening,
    // and a "session expired" modal over it would be a lie.
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    lastConnectionNoticeAtRef.current = now;
    // A beat after paint so the app is on screen first when this fires at boot.
    window.setTimeout(() => setConnectionNotice(kind), kind === 'session' ? 700 : 0);
  };

  // Unified Auth Initialization: Google Workspace (Sheets & Drive) + Supabase
  useEffect(() => {
    // Return-trip handling: the page just came back from Google's OAuth
    // redirect (or a normal boot). Restore the persisted auth phase so the
    // overlay shows "Completing sign-in…" while Supabase exchanges the code,
    // surface Google's error bounces (cancel/denied) instead of silently
    // landing home, and clear stale confirmations from an earlier visit.
    let awaitingRedirectSignIn = false;
    try {
      restorePersistedPhase();
      const pendingFlag = sessionStorage.getItem('spenddesk_signin_pending') === '1';
      const bootPhase = getAuthPhase().phase;
      awaitingRedirectSignIn = pendingFlag || bootPhase === 'redirecting' || bootPhase === 'exchanging';
      if (awaitingRedirectSignIn) {
        // Overlay takes over: "Completing sign-in…" until the session lands,
        // with a 25s watchdog that turns a stuck exchange into a clear error.
        beginOAuthExchange();
      }
      // (Stale connected/error feedback is expired by restorePersistedPhase's
      // TTL, and the overlay auto-clears a fresh "Signed in" confirmation.)
      // Google can bounce back with #error=access_denied (user cancelled) or
      // other OAuth errors - show them instead of quietly loading the app.
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const oauthError = searchParams.get('error') || hashParams.get('error');
      if (oauthError && awaitingRedirectSignIn) {
        failAuthPhase(
          oauthError === 'access_denied'
            ? 'Sign-in was cancelled. You can try again whenever you’re ready.'
            : 'We couldn’t complete Google sign-in. Please try again.'
        );
        awaitingRedirectSignIn = false;
        try {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch {}
      }
    } catch {}

    // THE SINGLE AUTH LISTENER.
    // The Supabase session is the only authority on "is anybody signed in".
    // Google tokens, the stored profile and the sheet pointer are caches that
    // can never fake a sign-in - which is exactly what caused the old
    // "still signed in but nothing syncs" state after a long idle.
    const unsubAuth = initAuthListener({
      onSignedIn: (account, ctx) => {
        const email = account.email;
        if (!email) return;
        const key = email.trim().toLowerCase();

        // A different account just took over this device: drop the previous
        // account's Google token so no credential leaks across accounts.
        const isNewAccount = lastSignedInEmailRef.current !== key;
        if (lastSignedInEmailRef.current && isNewAccount) {
          clearWorkspaceTokenState();
          cloudVersionRef.current = 0;
          // The sheet on screen belongs to the previous account - drop it
          // instead of showing (and pushing into) someone else's spreadsheet.
          setActiveSheet(null);
        }
        lastSignedInEmailRef.current = key;
        // This account now owns the device's Google credentials. The token is
        // bound to it, so a leftover token from an earlier session can never
        // be picked up again.
        setCurrentWorkspaceAccount(key);

        // The session is confirmed. End the single sign-in progress surface
        // and go straight to the dashboard—no redundant success screen or
        // artificial pause after "Signing you in".
        clearAuthPhase();
        setUser({
          id: account.id,
          displayName: account.name,
          email: account.email,
          photoURL: account.picture,
        });
        writeAuthStatus('signed_in');
        setAuthStatus('signed_in');

        if (ctx.providerToken) {
          // Fresh Google token straight from the sign-in exchange (~1h life).
          setCachedWorkspaceToken(ctx.providerToken, undefined, key);
          setAccessToken(ctx.providerToken);
        } else {
          const cached = getCachedWorkspaceToken();
          if (cached) setAccessToken(cached);
          if (!cached || isGoogleTokenExpired()) {
            void refreshGoogleTokenSilently(key, 'signin')
              .then((token) => { if (token) setAccessToken(token); })
              .catch(console.warn);
          }
        }

        saveLastUserEmail(key);
        mergeGuestDataIntoUser(key);
        setOfflineWorkspaceEmail(key);

        if (awaitingRedirectSignIn) {
          awaitingRedirectSignIn = false;
        }

        // Auto-connect THIS account's own sheet - never another account's.
        // Only on a fresh sign-in: a routine token refresh must not re-pick
        // the sheet or re-run the Drive discovery.
        if (isNewAccount) {
          const lastSheet = loadStoredSheetMeta(key);
          if (lastSheet) {
            setActiveSheet(lastSheet);
            saveStoredSheetMeta(lastSheet, key);
          } else {
            // First sign-in for this account: look for a sheet in their Drive.
            void (async () => {
              const token = getCachedWorkspaceToken() || (await refreshGoogleTokenSilently(key, 'discover_sheet'));
              if (!token) return;
              const driveList = await listUserSpreadsheets(token);
              if (!driveList || driveList.length === 0) return;
              const match =
                driveList.find((s) => /spenddesk|cash|wallet|money/i.test(s.name)) || driveList[0];
              const sheetMeta: GoogleSheetMeta = {
                id: match.id,
                name: match.name,
                url: match.webViewLink || `https://docs.google.com/spreadsheets/d/${match.id}/edit`,
                lastSyncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              };
              setActiveSheet(sheetMeta);
              saveStoredSheetMeta(sheetMeta, key);
              saveKnownSpreadsheet(sheetMeta, key);
            })().catch(console.warn);
          }
        }
      },
      onSignedOut: (reason) => {
        if (reason === 'boot') {
          // Return trip from Google: the session is still being exchanged, so
          // the boot snapshot legitimately has no session yet. The SIGNED_IN
          // event follows within a second - this is NOT an expired session.
          if (awaitingRedirectSignIn) return;
          // No session on this device right now. If we believed we were signed
          // in, the session died while the app was closed -> stay in local mode
          // but SAY SO instead of pretending to be connected.
          if (readAuthStatus() === 'signed_in') {
            writeAuthStatus('expired');
            setAuthStatus('expired');
            // Reopening after a few days and finding yourself signed out is
            // exactly the case the user wants TOLD about, not hinted at.
            reportConnectionLost('session');
          }
          return;
        }
        // The session is gone (signed out on purpose, or revoked/expired).
        setUser(null);
        setAccessToken(null);
        // The Google credentials die with the session: a token without a
        // session is exactly the "looks connected, syncs nothing" state.
        clearWorkspaceTokenState();
        setCurrentWorkspaceAccount(null);
        cloudVersionRef.current = 0;
        setCloudSyncReady(false);
        const nextStatus: AuthStatus = reason === 'signed_out' ? 'signed_out' : 'expired';
        writeAuthStatus(nextStatus);
        setAuthStatus(nextStatus);
        // A session that died while the app was running is a real loss of
        // sync - raise the popup. An intentional sign-out is NOT: the user
        // asked for it, so they get local mode and no modal.
        if (nextStatus === 'expired') {
          reportConnectionLost('session');
        } else {
          setConnectionNotice(null);
        }
      },
    });

    return unsubAuth;
  }, []);

  // Stale-version self-heal: GitHub Pages caches index.html for ~10 minutes,
  // so an old tab (or a phone's cached page) can keep running outdated code -
  // including the previous GIS renewal that could pop Google's account
  // chooser on refresh. Check for a newer deployed bundle periodically and
  // whenever the tab regains focus; announce it once, then install it
  // silently the next time the tab is hidden so the user is never
  // interrupted and stale code can't keep running in the background.
  useEffect(() => {
    let reloadPending = false;
    let updateAnnounced = false;

    const getLoadedBundle = () =>
      document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]')?.src || '';

    const checkForUpdate = async () => {
      const loadedBundle = getLoadedBundle();
      if (!loadedBundle || reloadPending) return; // dev server has no hashed bundle
      try {
        const res = await fetch(new URL('index.html', document.baseURI).href, { cache: 'no-store' });
        if (!res.ok) return;
        const html = await res.text();
        const match = html.match(/assets\/index-[^"']+\.js/);
        if (!match) return;
        const deployedBundle = new URL(match[0], res.url).href;
        if (!deployedBundle || deployedBundle === loadedBundle) return;

        const reloadWhenHidden = () => {
          if (reloadPending || document.visibilityState !== 'hidden') return;
          reloadPending = true;
          window.location.reload();
        };
        document.addEventListener('visibilitychange', reloadWhenHidden);
        if (document.visibilityState === 'hidden') {
          reloadWhenHidden();
          return;
        }
        if (!updateAnnounced) {
          updateAnnounced = true;
          showNotification('A new SpendDesk update is ready - it will install automatically when you switch tabs.', 'info');
        }
      } catch {
        // Offline or blocked - the next interval/focus retries silently.
      }
    };

    const interval = window.setInterval(() => void checkForUpdate(), 60000);
    const onFocus = () => void checkForUpdate();
    window.addEventListener('focus', onFocus);
    const initialTimer = window.setTimeout(() => void checkForUpdate(), 8000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(initialTimer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Process URL hash fragment on OAuth redirect return
  useEffect(() => {
    if (!window.location.hash) return;
    try {
      const hash = window.location.hash.replace(/^#/, '');
      const params = new URLSearchParams(hash);

      // Password recovery: the link from the reset email lands here with a
      // RECOVERY session. Show the "new password" card rather than treating
      // it as a normal OAuth return.
      if (params.get('type') === 'recovery') {
        setIsRecoveryOpen(true);
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        return;
      }

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
        // Legacy return path (older Google redirect). The token is kept in
        // memory only: it is not bound to an account yet, and a token without
        // an owner is never cached (that is how a dead session used to look
        // alive). The Supabase session hands over the real, account-bound
        // token a moment later.
        setAccessToken(providerToken);
        if (grantedScope && (!grantedScope.includes('spreadsheets') && !grantedScope.includes('drive'))) {
          showNotification('Notice: Please check "Select all" permissions to enable Google Sheets syncing.', 'info');
        }
      }

      // Clean token hash from browser URL bar cleanly
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch (e) {
      console.warn('Hash parse error:', e);
    }
  }, []);

  // Google Session Persistence: keep a working Sheets/Drive token in hand.
  // The renewal ladder is server-side (zero Google UI); it only ever fails
  // when the account really has to re-consent.
  useEffect(() => {
    if (!user?.email) return;
    if (!accessToken || isGoogleTokenExpired()) {
      void refreshGoogleTokenSilently(user.email, 'token_persistence')
        .then((newToken) => {
          if (newToken) {
            setAccessToken(newToken);
          }
        })
        .catch(console.warn);
    }
  }, [user?.email, accessToken]);

  // Silent renewal watchdog: while the app is open, renew the Google token in
  // the background before it expires, so Sheets/Drive never hit an "expired"
  // state (until the user explicitly signs out).
  //
  // Renewal runs entirely through the backend (`sheets-token` edge function,
  // driven by the offline refresh token stored at sign-in) with ZERO Google UI
  // - no popup, no redirect, no gesture needed. The old Google Identity
  // Services path opened a real window on every renewal, so it was removed;
  // the app now stays exactly as it is after any amount of idle time and
  // nothing ever appears on screen.
  useEffect(() => {
    if (!user?.email) return;

    const check = () => {
      if (!isGoogleTokenExpired()) return;
      void refreshGoogleTokenSilently(user.email, 'renewal_watchdog')
        .then((newToken) => {
          if (newToken) setAccessToken(newToken);
        })
        .catch(() => {});
    };

    check();
    const renewalTimer = window.setInterval(check, 5 * 60 * 1000);
    return () => {
      window.clearInterval(renewalTimer);
    };
  }, [user?.email]);

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
      // Save ONLY into the signed-in account's own scope. This used to mirror
      // the cleaned list into the guest scope too, which quietly put account
      // A's cash into the shared guest bucket - and the next Google sign-in on
      // this device merged that bucket straight into account B (see
      // mergeGuestDataIntoUser), so B opened the dashboard showing A's money.
      // When nobody is signed in, currentUserEmail is null and this key IS the
      // guest key already, so signed-out behaviour is unchanged.
      saveStoredTransactions(sanitized, currentUserEmail);
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
      // Auto-flush any queued offline Telegram alerts when connection
      // restores — silently: routine background sync is not an event.
      void flushPendingTelegramAlerts().catch(console.warn);

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
      // One quiet toast instead of a permanent banner across the top.
      showNotification("You're offline. Changes will sync later.", 'info');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check on mount: if online, flush any pending alerts from prior offline sessions
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      void flushPendingTelegramAlerts().catch(console.warn);
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
    const lendTombstones = loadLendDeletedIds(scope);
    const initialLends = loadStoredLendItems(scope).filter((l) => !lendTombstones.has(l.id));

    setTransactions(initialTxs);
    latestStateRef.current.transactions = initialTxs;
    setLendItems(initialLends);

    setAlertPhone(loadStoredAlertPhone(scope));

    const storedTelegram = loadStoredTelegramAlertConfig(scope);
    setTelegramAlertConfig(storedTelegram);

    setBudgetConfig(loadStoredBudgetConfig(scope));
    setCategories(loadStoredCategoryDefs(scope));
    setUserProfile(loadStoredProfile(scope));
    setLoadedStorageScope(scope);
  }, [currentUserEmail]);

  const handleUpdateProfile = (updated: Partial<UserProfile>) => {
    markSettingsDirty(currentUserEmail);
    const nextProfile = { ...userProfile, ...updated };
    setUserProfile(nextProfile);
    saveStoredProfile(nextProfile, currentUserEmail);
    if (user) {
      const nextUser = {
        ...user,
        displayName: updated.name !== undefined ? updated.name : user.displayName,
        photoURL: updated.avatar !== undefined ? updated.avatar : user.photoURL,
        email: updated.email !== undefined && updated.email ? updated.email : user.email,
      };
      setUser(nextUser);
      try {
        localStorage.setItem('money_tracker_user', JSON.stringify(nextUser));
        localStorage.setItem('money_tracker_user_info', JSON.stringify({
          ...nextUser,
          name: nextUser.displayName,
          picture: nextUser.photoURL,
        }));
      } catch {}
    }
    queueCloudSync();
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
    dailyRefresh,
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
      dailyRefresh,
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
      dailyRefresh: s.dailyRefresh,
      // Tombstones ride along with every push so a delete performed here is
      // never re-applied from a device that still holds the old record.
      deletedTxIds: Array.from(loadDeletedTxIds(s.currentUserEmail)),
      deletedLendIds: Array.from(loadLendDeletedIds(s.currentUserEmail)),
      owner: s.currentUserEmail || '',
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
    // OWNERSHIP GUARD. Never apply another account's snapshot to this one.
    // The realtime/local broadcast channels are shared, so a push from account
    // A can arrive while account B is signed in; taking it would replace B's
    // transactions AND B's profile with A's. Only a mismatching, present owner
    // is rejected - ownerless snapshots from older builds are still accepted.
    const owner = String(workspace.owner || '').trim().toLowerCase();
    const scopeNow = String(currentUserEmail || '').trim().toLowerCase();
    if (owner && scopeNow && owner !== scopeNow) {
      console.warn('Ignored cloud workspace owned by a different account.');
      return;
    }
    // CRITICAL: Reject any remote workspace that is older than or equal to our local version!
    if (workspace.updatedAt <= cloudVersionRef.current) return;
    suppressNextCloudSyncRef.current = true;
    cloudVersionRef.current = workspace.updatedAt;
    const scope = currentUserEmail;
    const remoteTxs = sanitizeTransactions(Array.isArray(workspace.transactions) ? workspace.transactions : []);
    const remoteLends = Array.isArray(workspace.lendItems) ? workspace.lendItems : [];

    // Merge the remote tombstones into the local lists FIRST: they are the
    // shared memory of what was deleted, so records removed on any device can
    // never be resurrected by a stale push or a sheet re-import here.
    if (Array.isArray(workspace.deletedTxIds) && workspace.deletedTxIds.length > 0) {
      markTxIdsDeleted(workspace.deletedTxIds, scope);
    }
    if (Array.isArray(workspace.deletedLendIds) && workspace.deletedLendIds.length > 0) {
      markLendIdsDeleted(workspace.deletedLendIds, scope);
    }
    const deletedIds = loadDeletedTxIds(scope);
    const deletedLendIds = loadLendDeletedIds(scope);

    const filteredRemoteTxs = remoteTxs.filter((t) => !deletedIds.has(t.id));
    const filteredRemoteLends = remoteLends.filter((l) => !deletedLendIds.has(l.id));

    // Never let an empty remote cloud wipe local transactions - UNLESS every
    // local record is tombstoned too (the remote reflects our own delete).
    // The old code pushed local state back in that case, which made a
    // Delete-All bounce back a second later from any tab holding stale data.
    const currentLocalTxs = loadStoredTransactions(scope);
    const localNonDeletedTxs = currentLocalTxs.filter((t) => !deletedIds.has(t.id));
    if (filteredRemoteTxs.length === 0 && localNonDeletedTxs.length > 0) {
      void saveCloudWorkspace(getLatestWorkspace(Date.now() + 100)).catch(console.warn);
      return;
    }

    setTransactions(filteredRemoteTxs);
    latestStateRef.current.transactions = filteredRemoteTxs;
    saveStoredTransactions(filteredRemoteTxs, scope);
    if (workspace.activeSheet?.id) {
      saveSheetTransactions(workspace.activeSheet.id, filteredRemoteTxs);
    }

    setLendItems(filteredRemoteLends);
    latestStateRef.current.lendItems = filteredRemoteLends;
    saveStoredLendItems(filteredRemoteLends, scope);
    if (workspace.activeSheet?.id) {
      saveSheetLendItems(workspace.activeSheet.id, filteredRemoteLends);
    }

    if (Array.isArray(workspace.categories) && workspace.categories.length > 0) {
      saveStoredCategoryDefs(workspace.categories, scope);
      // Keep React state in step with storage: skipping this left the UI
      // showing a category that had already been deleted (or restoring one).
      setCategories(workspace.categories);
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
    if (typeof workspace.dailyRefresh === 'boolean') {
      setDailyRefresh(workspace.dailyRefresh);
      try { localStorage.setItem('spenddesk_daily_refresh', workspace.dailyRefresh ? 'on' : 'off'); } catch {}
    }
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
  }, [transactions, lendItems, categories, budgetConfig, alertPhone, telegramAlertConfig, activeSheet, userProfile, currency, user?.email, cloudSyncReady, queueCloudSync]);

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
      notes: '',
      date: today,
      time: sampleTime,
      paymentMethod: 'Cash',
      createdAt: Date.now(),
    }, currency, calculateSummary(transactions, transactions.filter((t) => t && t.date === today)).currentCashBalance);

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

  // ─── FRIENDLY GOOGLE SHEET SETUP ────────────────────────────────────────────
  // A signed-in account is expected to sync into a sheet. When it has never
  // had one, or the sheet was deleted / lost its permission, the user gets a
  // professional setup popup - never a raw Google API error.
  const hasConnectedSheet = (): boolean =>
    Boolean(activeSheet?.id || loadStoredSheetMeta(currentUserEmail)?.id);

  const needsSheetSetup = (): boolean =>
    Boolean(user?.email) && isOnline && !hasConnectedSheet();

  // MANDATORY SETUP — the moment a signed-in account that has never
  // connected a sheet lands on the dashboard, the onboarding opens. Gated
  // per scope so dismissing it does not make it reappear on every render;
  // it comes back on the next sign-in, reload, or save attempt.
  const setupPromptedScopeRef = useRef<string | null>(null);
  // Re-entry lock for sheet creation: a double tap (or a retried promise)
  // must never produce two Google Sheets.
  const sheetCreatingRef = useRef(false);
  useEffect(() => {
    if (!needsSheetSetup()) {
      setupPromptedScopeRef.current = null;
      return;
    }
    if (loadedStorageScope !== currentStorageScope) return;
    if (setupPromptedScopeRef.current === currentStorageScope) return;
    if (sheetSetupPhase) {
      setupPromptedScopeRef.current = currentStorageScope;
      return;
    }
    setupPromptedScopeRef.current = currentStorageScope;
    openSheetSetup('needed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, isOnline, activeSheet?.id, loadedStorageScope, currentStorageScope]);

  const openSheetSetup = (phase: SheetSetupPhase, message?: string) => {
    setSheetSetupMessage(message);
    setSheetSetupPhase(phase);
  };

  const closeSheetSetup = () => {
    setSheetSetupMessage(undefined);
    setSheetSetupPhase(null);
  };

  // The same creation ladder the Google Sheets Manager runs: usable token ->
  // create -> one consent retry -> connect to this account -> push whatever the
  // ledger already holds, so the transaction that triggered setup is synced
  // without the user re-entering or re-saving anything.
  const handleSheetSetupCreate = async () => {
    if (sheetCreatingRef.current) return;
    sheetCreatingRef.current = true;
    setSheetSetupMessage(undefined);
    setSheetSetupPhase('creating');
    try {
      let token = accessToken;
      if (!token || token === 'local_token' || token.startsWith('eyJ') || token.length < 30) {
        token = await requestGoogleAccessToken(true, 'sheet_setup_create');
      }
      const title = 'SpendDesk - Cash & Card';
      let created;
      try {
        created = await createMoneyTrackerSpreadsheet(token, title);
      } catch (err) {
        const raw = String((err as { message?: string })?.message || err);
        if (!/401|403|UNAUTHENTICATED|PERMISSION_DENIED|INSUFFICIENT|invalid_client/.test(raw)) throw err;
        try { localStorage.removeItem('money_tracker_access_token'); } catch {}
        token = await requestGoogleAccessToken(true, 'sheet_setup_create_retry');
        created = await createMoneyTrackerSpreadsheet(token, title);
      }
      const meta: GoogleSheetMeta = {
        id: created.id,
        name: created.name,
        url: created.url,
        lastSyncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      };
      saveKnownSpreadsheet(meta, currentUserEmail);
      handleSetActiveSheet(meta);
      setSheetSetupPhase('success');
    } catch (err) {
      // The raw error stays in the console for debugging; the popup only ever
      // shows the classified, human sentence.
      console.error('Google Sheet setup failed:', err);
      setSheetSetupMessage(friendlySheetErrorMessage(err));
      setSheetSetupPhase('error');
    } finally {
      sheetCreatingRef.current = false;
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
    // Fall back to the single token cache: after a reload the in-memory token
    // is empty until the silent renewal lands, but the cached one is valid.
    let token = targetToken || accessToken || getCachedWorkspaceToken();
    if (!sId) {
      if (!options.silent) showNotification('Connect a Google Sheet first.', 'info');
      return;
    }

    const hasGoogleSheetsToken = Boolean(token && token !== 'local_token' && !token.startsWith('eyJ'));
    if (!hasGoogleSheetsToken) {
      if (!options.interactive) return;
      try {
        token = await requestGoogleAccessToken(true, 'sheet_push_interactive');
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
      // Deleted lend/borrow records must never come back from the sheet either.
      const lendTombstones = loadLendDeletedIds(currentUserEmail);
      const validRemoteLends = remoteLends.filter((l) => !lendTombstones.has(l.id));

      // If user deleted rows in Google Sheets, detect missing items and mark them deleted so they don't resurrect:
      if (validRemoteTxs.length > 0 && transactions.length > 0) {
        const remoteIdSet = new Set(validRemoteTxs.map((t) => t.id));
        const missingFromSheet = transactions.filter((t) => !remoteIdSet.has(t.id));
        if (missingFromSheet.length > 0) {
          markTxIdsDeleted(missingFromSheet.map((t) => t.id), currentUserEmail);
        }
      }

      // Safety: an EMPTY sheet must never wipe records the app still holds -
      // an unpushed or partially-pushed sheet reads back empty too. Real
      // "delete everything" goes through Delete All (which tombstones first),
      // so keeping non-tombstoned local records on an empty read is correct.
      const localNonDeletedTxs = loadStoredTransactions(currentUserEmail).filter((t) => !deletedIds.has(t.id));
      const localNonDeletedLends = loadStoredLendItems(currentUserEmail).filter((l) => !lendTombstones.has(l.id));
      const effectiveTxs = validRemoteTxs.length === 0 && localNonDeletedTxs.length > 0 ? localNonDeletedTxs : validRemoteTxs;
      const effectiveLends = validRemoteLends.length === 0 && localNonDeletedLends.length > 0 ? localNonDeletedLends : validRemoteLends;

      // Cleanly replace: show ONLY the valid sanitized records from this connected Google Sheet
      const sortedTxs = sanitizeTransactions(effectiveTxs).sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });

      latestStateRef.current.transactions = sortedTxs;
      setTransactions(sortedTxs);
      saveStoredTransactions(sortedTxs, currentUserEmail);
      saveSheetTransactions(sId, sortedTxs);

      setLendItems(effectiveLends);
      saveStoredLendItems(effectiveLends, currentUserEmail);
      saveSheetLendItems(sId, effectiveLends);

      if (user?.email) {
        const nextWs = buildCloudWorkspace(Date.now());
        nextWs.transactions = sortedTxs;
        nextWs.lendItems = effectiveLends;
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
                    raw.includes('INSUFFICIENT') ||
                    raw.includes('OAuth 2 access token');

      if (is401) {
        if (options.interactive) {
          try {
            const fresh = await requestGoogleAccessToken(true, 'sheet_pull_401_retry');
            if (fresh) {
              setAccessToken(fresh);
              await handlePullFromSheet(sId, fresh, { interactive: false, silent: options.silent });
              return;
            }
          } catch {}
        } else {
          try {
            const fresh = await refreshGoogleTokenSilently();
            if (fresh) {
              setAccessToken(fresh);
              await handlePullFromSheet(sId, fresh, { interactive: false, silent: options.silent });
              return;
            }
          } catch {}
        }
      }
      if (!options.silent) {
        if (!is401 && classifySheetError(err) === 'missing' && user?.email) {
          openSheetSetup('needed');
          return;
        }
        const friendlyMsg = is401
          ? 'Google session expired. Tap to reconnect your Google account.'
          : friendlySheetErrorMessage(err);
        showNotification(friendlyMsg, 'error');
      }
    } finally {
      setIsSyncing(false);
    }
  }, [activeSheet, accessToken, currentUserEmail, isPendingSignedOutReplay]);

  const handleManualPullFromSheet = useCallback(
    async (sheetId?: string, token?: string) => {
      let sId = sheetId || activeSheet?.id;
      let tok = token || accessToken;

      // If activeSheet is not yet bound in state, auto-connect from storage or Google Drive
      if (!sId) {
        // THIS account's sheet only (or the signed-out sheet when nobody is
        // signed in) - never the device-wide pointer.
        const stored = loadStoredSheetMeta(currentUserEmail);
        if (stored?.id) {
          sId = stored.id;
          setActiveSheet(stored);
        } else if (tok && tok !== 'local_token' && !tok.startsWith('eyJ')) {
          try {
            const driveSheets = await listUserSpreadsheets(tok);
            if (driveSheets.length > 0) {
              const best = driveSheets.find((s) => /spenddesk|cash|wallet|money/i.test(s.name)) || driveSheets[0];
              const meta: GoogleSheetMeta = {
                id: best.id,
                name: best.name,
                url: best.webViewLink || `https://docs.google.com/spreadsheets/d/${best.id}/edit`,
                lastSyncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              };
              saveStoredSheetMeta(meta, currentUserEmail);
              setActiveSheet(meta);
              sId = meta.id;
            }
          } catch (e) {
            console.warn('Auto-discovery on manual pull note:', e);
          }
        }
      }

      if (!sId) {
        setSheetsSourceTab(activeTab);
        setActiveTab('sheets');
        showNotification('Choose or create a Google Sheet to sync.', 'info');
        return;
      }

      await handlePullFromSheet(sId, tok, { interactive: true, silent: false });
    },
    [activeSheet, accessToken, currentUserEmail, activeTab, handlePullFromSheet],
  );

  const dispatchTransactionDeletedTelegram = (deletedTxs: Transaction[], remaining: Transaction[]) => {
    if (!telegramSendActive || deletedTxs.length === 0) return;
    // The balance reported is the one on screen right after the delete - the
    // same filter-driven figure the header shows - so the alert can never
    // disagree with the app. (An all-time sum would also double-count every
    // historical carry-forward row.)
    const afterDelete = calculateSummary(remaining, filterTransactions(remaining, headerDateFilter));
    const payload =
      deletedTxs.length === 1
        ? generateDeletedTransactionTelegramAlert(deletedTxs[0], currency, afterDelete.currentCashBalance)
        : generateBulkDeletedTransactionsTelegramAlert(deletedTxs, currency, afterDelete.currentCashBalance);
    void sendTelegramAlert({ ...payload, chatId: telegramAlertConfig.chatId })
      .then((res) => {
        if (res.queued) {
          showNotification('Offline: Telegram delete alert queued, will send when online.', 'info');
        }
      })
      .catch((error) => {
        console.error('Telegram delete alert failed:', error);
      });
  };

  const handleBulkDeleteTransactions = (txIds: string[]) => {
    if (!txIds.length) return;
    // Deleting is a transaction action too: without a connected sheet there
    // is nowhere to sync the removal, so setup comes first.
    if (needsSheetSetup()) {
      openSheetSetup('needed');
      return;
    }
    const uniqueIds = Array.from(new Set(txIds));
    const deletedTxs = transactions.filter((t) => uniqueIds.includes(t.id));
    if (deletedTxs.length === 0) return;
    markTxIdsDeleted(uniqueIds, currentUserEmail);
    uniqueIds.forEach((id) => markTransactionDelete(id, currentUserEmail));
    const updated = transactions.filter((t) => !uniqueIds.includes(t.id));
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
    showNotification(`Deleted ${deletedTxs.length} transaction${deletedTxs.length === 1 ? '' : 's'}.`, 'success');
    dispatchTransactionDeletedTelegram(deletedTxs, updated);
  };

  // Unified Single Sign-In with Google via Supabase OAuth: Single redirect to Gmail account chooser.
  // The AuthProgressOverlay (not a toast) now carries the "Redirecting →
  // Completing → Signed in / error" story, with this caller as the cause.
  // TELEGRAM ALERT — the one-tap connect behind the wallet card's "Connect"
  // button. Same server-side deep-link flow as Settings › Automatic Alerts:
  // the browser only ever requests a one-time link, opens it in a new tab,
  // then polls until the user presses Start in Telegram. Chat IDs never reach
  // this code — the status response only ever carries a masked value.
  const [isConnectingTelegramCard, setIsConnectingTelegramCard] = useState(false);
  const telegramPollTimerRef = useRef<number | null>(null);

  // One poll chain at a time: a second Connect tap must not double the timer.
  const pollTelegramUntilConnected = () => {
    if (telegramPollTimerRef.current !== null) return;
    const startedAt = Date.now();
    const tick = async () => {
      telegramPollTimerRef.current = null;
      try {
        const status = await getTelegramLinkStatus();
        if (status?.connected) {
          setTelegramLinkStatus(status);
          showNotification('Telegram connected successfully.', 'success');
          return;
        }
      } catch {
        /* network blip — keep polling until the deadline */
      }
      if (Date.now() - startedAt < 210000) {
        telegramPollTimerRef.current = window.setTimeout(() => void tick(), 3500);
      } else {
        showNotification('Still waiting — tap Connect to try again.', 'info');
      }
    };
    telegramPollTimerRef.current = window.setTimeout(() => void tick(), 2500);
  };

  useEffect(() => () => {
    if (telegramPollTimerRef.current !== null) window.clearTimeout(telegramPollTimerRef.current);
  }, []);

  const handleConnectTelegramCard = async () => {
    if (isConnectingTelegramCard) return;
    if (!user?.email) {
      showNotification('Sign in with Google to connect Telegram alerts.', 'info');
      return;
    }
    setIsConnectingTelegramCard(true);
    try {
      const ticket = await createTelegramLink();
      const opened = window.open(ticket.deepLink, '_blank', 'noopener,noreferrer');
      if (!opened) {
        showNotification('Pop-up blocked — allow pop-ups for this site, then tap Connect again.', 'error');
        return;
      }
      setTelegramLinkStatus((prev) => ({
        connected: false,
        pending: true,
        alertsEnabled: prev?.alertsEnabled ?? true,
        chatIdMasked: prev?.chatIdMasked ?? null,
        linkedAt: prev?.linkedAt ?? null,
      }));
      showNotification('Waiting for you to press Start in Telegram…', 'info');
      pollTelegramUntilConnected();
    } catch (error: any) {
      showNotification(error?.message || 'Could not start the Telegram connection. Try again.', 'error');
    } finally {
      setIsConnectingTelegramCard(false);
    }
  };

  const handleSignIn = async (caller?: unknown) => {
    if (isAuthPhaseInFlight()) return;
    const cause = typeof caller === 'string' && caller ? caller : 'Sign-in button';
    try {
      const res = await signInWithGoogleSupabase(cause);
      if (!res.success && res.errorMessage) {
        failAuthPhase(res.errorMessage);
      }
    } catch (err: any) {
      console.warn('Google Sign-In Exception:', err);
      const msg = String(err?.message || err);
      failAuthPhase(msg);
    }
  };

  // ── Email + password auth: the second door (account creation + recovery).
  // A successful password sign-in opens the app through the same auth
  // listener Google uses, so nothing else here has to react to it.
  const handlePasswordSignIn = (email: string, password: string) =>
    signInWithPasswordSupabase(email, password);

  const handleCreateAccount = (email: string, password: string, fullName: string) =>
    signUpWithPasswordSupabase(email, password, fullName);

  const handleForgotPassword = (email: string) => sendPasswordResetSupabase(email);

  const handleSetNewPassword = async (password: string) => {
    const res = await setNewPasswordSupabase(password);
    if (res.success) {
      showNotification('Your new password is saved — you are signed in.', 'info');
    }
    return res;
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
      // Stage the final local state so the next sign-in replays these edits
      // instead of letting the remote copy silently overwrite them.
      stageWorkspaceForReplay(transactions, lendItems, signedOutScope);
      // Arm the one-time sheet replay too: sheet pushes are blocked while
      // signed out, so without this marker every edit made in local mode
      // would leave the connected Google Sheet behind until the next manual
      // sync. The marker survives until the first push after re-sign-in
      // succeeds (see the pending-replay effect below).
      try {
        localStorage.setItem(PENDING_SHEET_PUSH_KEY, signedOutScope);
      } catch (e) {}
      setPendingSheetPushEmail(signedOutScope);
      try {
        localStorage.setItem(LAST_OFFLINE_WORKSPACE_KEY, signedOutScope);
      } catch (e) {}
    }
    // Drop EVERY credential: the Supabase session, Google's offline refresh
    // token, the cached access token and the in-memory copies. The account's
    // own data stays on this device (local mode) and comes back on the next
    // sign-in.
    await resetSignIn();
    lastSignedInEmailRef.current = null;
    cloudVersionRef.current = 0;
    setCloudSyncReady(false);
    setUser(null);
    setAccessToken(null);
    writeAuthStatus('signed_out');
    setAuthStatus('signed_out');
    showNotification('Signed out. Your transactions remain saved in local storage.', 'info');
  };

  // FULL SIGN-IN RESET: wipes every credential on this device so the next
  // sign-in starts from a clean slate (the "it is stuck / it shows the wrong
  // account" escape hatch). The account's data stays on the device and
  // returns with the next sign-in.
  const handleResetSignIn = async () => {
    // Keep whatever is on screen alive across the wipe: stage it so the next
    // sign-in replays it over the remote copy (same guarantee as sign-out).
    const scope = user?.email ? user.email.trim().toLowerCase() : (offlineWorkspaceEmail || null);
    if (scope && scope !== 'guest') {
      stageWorkspaceForReplay(transactions, lendItems, scope);
    }
    await resetSignIn();
    lastSignedInEmailRef.current = null;
    cloudVersionRef.current = 0;
    setCloudSyncReady(false);
    setUser(null);
    setAccessToken(null);
    writeAuthStatus('signed_out');
    setAuthStatus('signed_out');
    showNotification('Sign-in state cleared. Reloading for a clean start…', 'info');
    setTimeout(() => window.location.reload(), 800);
  };

  // Debug / support hook: `window.__spenddeskAuth.reset()` wipes the sign-in
  // state of this device without touching the account's data. It EXTENDS the
  // diagnostics object that authPhase.ts installs - the phase/trace helpers
  // must keep working.
  const signedInEmailRef = useRef<string | null>(null);
  signedInEmailRef.current = user?.email || null;
  useEffect(() => {
    const w = window as any;
    w.__spenddeskAuth = {
      ...(w.__spenddeskAuth || {}),
      reset: () => { void handleResetSignIn(); },
      status: () => ({ authStatus: readAuthStatus(), user: signedInEmailRef.current }),
    };
  }, []);

  const isPushingToSheetRef = useRef(false);

  // Push & Two-Way Sync Data with Connected Google Sheet (Transactions, Lend/Borrow, and Dashboard KPIs)
  const handlePushToSheet = useCallback(async (
    options: { silent?: boolean; interactive?: boolean } = { silent: true },
    snapshot?: { transactions: Transaction[]; lendItems: LendItem[] }
  ): Promise<boolean> => {
    let sheetToSync = activeSheet;
    if (!sheetToSync) {
      // Only THIS account's sheet - or, when nobody is signed in, the sheet
      // that was connected while signed out. The device-wide "last sheet"
      // pointer belongs to whichever account connected last; using it here
      // leaked one account's sheet into another account's workspace.
      const stored = loadStoredSheetMeta(currentUserEmail);
      if (stored?.id) {
        sheetToSync = stored;
        setActiveSheet(stored);
      }
    }
    if (!sheetToSync) {
      if (!options.silent) {
        // Signed in with no sheet yet: offer the setup popup instead of a toast
        // that sends the user hunting through Settings.
        if (needsSheetSetup()) {
          openSheetSetup('needed');
        } else {
          showNotification('No Google Sheet connected. Go to Settings > Google Sheet to connect a sheet.', 'info');
        }
      }
      return false;
    }
    if (isPushingToSheetRef.current) {
      // Another push is in flight. Mark the sheet dirty so the sync watchdog
      // re-pushes after it finishes instead of silently dropping this change.
      markSheetSyncDirty(currentUserEmail, 'push already in flight');
      return false;
    }
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
        // No token in hand yet (usually right after boot). Run the silent
        // ladder FIRST - cache -> provider token -> server mint - so reopening
        // the app self-heals with no popup and no redirect, the same way a
        // manual push would.
        try {
          const freshToken = await refreshGoogleTokenSilently(currentUserEmail, 'sheet_push_no_token');
          if (freshToken && !freshToken.startsWith('eyJ') && freshToken !== 'local_token' && freshToken.length > 20) {
            sheetToken = freshToken;
            setAccessToken(freshToken);
            hasGoogleSheetsToken = true;
            noTokenPushStreakRef.current = 0;
          }
        } catch {}
      }
      if (!hasGoogleSheetsToken && !options.interactive) {
        // Still nothing: keep the outbox dirty so the watchdog retries once
        // the server-side token mint is ready.
        markSheetSyncDirty(currentUserEmail, 'no google token yet');
        // One empty round right after boot is normal (mint still in flight).
        // Two in a row means the Google grant itself is gone - revoked, or
        // never stored - so raise it ONCE rather than retrying silently for
        // the rest of the session and leaving the sheet stale.
        noTokenPushStreakRef.current += 1;
        if (noTokenPushStreakRef.current >= 2) reportConnectionLost('google');
        isPushingToSheetRef.current = false;
        return false;
      }
    }

    // Interactive path ONLY: a real user tap is the one thing that may open
    // Google. A silent/background push must never get here.
    if (!hasGoogleSheetsToken && options.interactive) {
      try {
        const freshToken = await requestGoogleAccessToken(true, 'sheet_push_401_retry');
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
    noteSheetSyncAttempt(currentUserEmail);
    setIsSyncing(true);
    try {
      const currentLocalTxs = sanitizeTransactions(snapshot?.transactions ?? latestStateRef.current.transactions);
      const currentLocalLends = snapshot?.lendItems ?? latestStateRef.current.lendItems;

      // 1. Write complete records to Transactions sheet (including Out of Wallet, Card Payment & Lend widget)
      await overwriteTransactionsInSheet(sheetToken, sheetToSync.id, currentLocalTxs, currentLocalLends);
      
      // 2. Drop unused Lend_Borrow tab if it still exists (lend data is on Transactions M–P)
      try {
        await overwriteLendItemsInSheet(sheetToken, sheetToSync.id, currentLocalLends);
      } catch (lendErr) {
        console.warn('Lend_Borrow cleanup notice:', lendErr);
      }

      // 3. Update Dashboard KPI Totals & Trends (must not fail silently while txs succeed)
      const allSummary = calculateSummary(currentLocalTxs, currentLocalTxs);
      const catSummary = calculateCategoryBreakdown(currentLocalTxs);
      const { dayTotals } = calculateWeeklyDailyTrend(currentLocalTxs);
      try {
        await syncDashboardStats(sheetToken, sheetToSync.id, allSummary, catSummary, dayTotals, currentLocalTxs, currentLocalLends);
      } catch (dashErr: any) {
        console.error('Dashboard sync failed:', dashErr);
        const dashMsg = dashErr?.message || 'Dashboard rebuild failed';
        // Always surface this — otherwise users only see Transactions update and think deploy failed.
        // The sentence is classified, never the raw API error itself.
        showNotification(friendlySheetErrorMessage(dashErr), 'error');
        markSheetSyncDirty(currentUserEmail, `dashboard failed: ${dashMsg}`);
        return false;
      }

      const updatedMeta: GoogleSheetMeta = {
        ...sheetToSync,
        lastSyncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      saveStoredSheetMeta(updatedMeta, currentUserEmail);
      suppressNextCloudSyncRef.current = true;
      setActiveSheet(updatedMeta);

      clearSheetSyncDirty(currentUserEmail);
      noTokenPushStreakRef.current = 0;
      if (!options.silent) {
        showNotification(`Synced ${currentLocalTxs.length} records with "${sheetToSync.name}"!`, 'success');
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
        const kind = classifySheetError(err);
        if (kind === 'missing' && user?.email) {
          // The sheet was deleted (or never finished being created) - setup it
          // again rather than repeating a technical failure on every sync.
          openSheetSetup('needed');
        } else if ((kind === 'permission' || kind === 'api_disabled') && user?.email) {
          openSheetSetup('error', friendlySheetErrorMessage(err));
        } else {
          showNotification(friendlySheetErrorMessage(err), 'error');
        }
      }
      markSheetSyncDirty(currentUserEmail, raw);
      return false;
    } finally {
      isPushingToSheetRef.current = false;
      setIsSyncing(false);
    }
  }, [activeSheet, accessToken, currentUserEmail, user?.email, buildCloudWorkspace]);

  const sheetPushTimerRef = useRef<number | null>(null);
  const queueSheetPush = useCallback((snapshot?: { transactions: Transaction[]; lendItems: LendItem[] }) => {
    // Mark the sheet dirty FIRST: even if this attempt is skipped (offline,
    // another push in flight, throttled tab, cold token cache), the sync
    // watchdog below will retry automatically until a push succeeds.
    if (activeSheet && user?.email) {
      markSheetSyncDirty(currentUserEmail, 'local change queued');
    }
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
  }, [activeSheet, user?.email, isOnline, currentUserEmail, handlePushToSheet]);

  useEffect(() => {
    queueSheetPushRef.current = queueSheetPush;
  }, [queueSheetPush]);

  // Sheet-sync watchdog: makes Google Sheet push "realtime-safe".
  // Background tabs throttle timers (a 1.2s debounce can stretch to minutes),
  // and any failed/skipped push used to be dropped until the next transaction.
  // The outbox marks the sheet dirty; this watchdog flushes it on a backoff
  // timer (5s → 15s → 45s → 2m → 5m cap) and instantly on every wake-up
  // (tab focus, visibility, back online). Pushes are silent, and since every
  // push is a full overwrite of the sheet, a duplicate retry is idempotent.
  const pushToSheetRef = useRef(handlePushToSheet);
  useEffect(() => {
    pushToSheetRef.current = handlePushToSheet;
  }, [handlePushToSheet]);

  // EVERY open and EVERY refresh re-syncs the sheet - not just the next edit.
  // The watchdog below only flushes instantly when the outbox is already
  // dirty, so a clean sheet would otherwise sit untouched for up to its 45s
  // idle poll after a reopen, which reads as "my sheet stopped updating".
  // One push per signed-in session, late enough for the server-side token
  // mint to have landed, and keyed on the account + sheet so switching
  // accounts gets its own push.
  const didBootSheetPushRef = useRef(false);
  useEffect(() => {
    didBootSheetPushRef.current = false;
  }, [user?.email, activeSheet?.id]);

  useEffect(() => {
    if (!user?.email || !activeSheet || didBootSheetPushRef.current) return;
    didBootSheetPushRef.current = true;
    const timer = window.setTimeout(() => {
      void pushToSheetRef.current({ silent: true }).catch(() => {});
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [user?.email, activeSheet?.id]);

  useEffect(() => {
    if (!user?.email || !activeSheet) return;
    let disposed = false;
    let timer: number | null = null;

    const scheduleNext = () => {
      if (disposed || timer !== null) return;
      const box = readSheetOutbox(currentUserEmail);
      const delay = box.dirty
        ? Math.min(Math.max(box.nextRetryAt - Date.now(), 5_000), SHEET_OUTBOX_MAX_BACKOFF_MS)
        : 45_000; // idle poll: catches dirty marks made by any other path
      timer = window.setTimeout(flush, delay);
    };

    const flush = () => {
      if (disposed) return;
      timer = null;
      // Offline: stay quiet; the 'online' wake handler re-arms immediately.
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const box = readSheetOutbox(currentUserEmail);
      if (!box.dirty || Date.now() < box.nextRetryAt) {
        scheduleNext();
        return;
      }
      void pushToSheetRef.current({ silent: true }).finally(() => {
        if (!disposed) scheduleNext();
      });
    };

    const wake = () => {
      if (disposed) return;
      if (document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const box = readSheetOutbox(currentUserEmail);
      if (!box.dirty) return;
      // User is looking at the app now: retry immediately, ignore backoff.
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      flush();
    };

    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    // Boot: flush a pending outbox (e.g. browser was closed mid-outage).
    scheduleNext();

    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
    };
  }, [user?.email, currentUserEmail, activeSheet, isOnline]);

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
  const handleSaveTransaction = (data: Omit<Transaction, 'id' | 'createdAt'> & { id?: string; sendSmsTo?: string }): boolean => {
    // MANDATORY GOOGLE SHEET SETUP — enforced inside the save logic itself,
    // not just in the UI. A signed-in account with no valid connected sheet
    // cannot add, edit or save anything: the setup onboarding opens instead
    // and the caller keeps its form data (the modal stays open, nothing is
    // written locally, so no half-saved record can ever exist).
    if (needsSheetSetup()) {
      openSheetSetup('needed');
      return false;
    }
    try {
      return recordTransaction(data);
    } catch (err) {
      console.error('Transaction save failed:', err);
      showNotification("Couldn't save transaction", 'error');
      return false;
    }
  };

  const recordTransaction = (data: Omit<Transaction, 'id' | 'createdAt'> & { id?: string; sendSmsTo?: string }): boolean => {
    const { sendSmsTo, ...txData } = data;
    const isNewTransaction = !txData.id;
    const carryDayForSave = txData.date || getLocalDateString();
    if (isNewTransaction && txData.isCarryForward && findTodayCarryForward(latestStateRef.current.transactions, carryDayForSave)) {
      showNotification("Yesterday's balance is already continued.", 'info');
      return;
    }
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
      showNotification(
        recordedTx.isCarryForward
          ? `Yesterday's balance of ${formatCurrency(recordedTx.amount, currency)} continued.`
          : 'Transaction added.',
        'success'
      );
    }

    // TELEGRAM ALERTS ARE PERSISTED SYNCHRONOUSLY, before this handler returns.
    //
    // This whole block used to live inside the setTimeout below. Deferring it
    // meant that saving a transaction and closing the app immediately dropped
    // the alert before it existed anywhere - the timer never fired, so nothing
    // was ever queued and nothing could ever be flushed. sendTelegramAlert
    // writes to the durable outbox before its first await, so calling it
    // directly makes the alert survive a closed tab; only the network attempt
    // stays in the background.
    if (isNewTransaction && telegramSendActive) {
      // Telegram alerts report TODAY's balance only (not the all-time wallet balance).
      const todayStr = getLocalDateString();
      const todayTxs = updatedTxs.filter((t) => t && t.date === todayStr);
      const todaySum = calculateSummary(updatedTxs, todayTxs);
      const telegramAlert = generateTransactionTelegramAlert(recordedTx, currency, todaySum.currentCashBalance);
      void sendTelegramAlert({ ...telegramAlert, chatId: telegramAlertConfig.chatId, txId: recordedTx.id })
        .then((res) => {
          // Only a delayed delivery is worth interrupting for — a delivered
          // alert is normal background sync and gets no toast.
          if (res.queued) {
            showNotification('Offline: Telegram alert queued, will send when online.', 'info');
          }
        })
        .catch((error) => {
          console.error('Telegram alert failed:', error);
        });

      // Trigger Low Balance Alert if balance is below threshold.
      // This check keeps the REAL all-time wallet balance (not the today-only view).
      const walletSum = calculateSummary(updatedTxs, updatedTxs);
      if (
        budgetConfig.lowCashThreshold > 0 &&
        walletSum.currentCashBalance <= budgetConfig.lowCashThreshold
      ) {
        const lowBalAlert = generateLowBalanceTelegramAlert(
          walletSum.currentCashBalance,
          budgetConfig.lowCashThreshold,
          currency
        );
        void sendTelegramAlert({ ...lowBalAlert, chatId: telegramAlertConfig.chatId }).catch(console.warn);
      }
    }

    // Non-blocking background side effects (SMS, Webhook)
    setTimeout(() => {
      if (sendSmsTo) {
        handleUpdateAlertPhone(sendSmsTo);
        const currentSum = calculateSummary(updatedTxs, updatedTxs);
        const smsBody = generateTransactionSmsText(recordedTx, currentSum.currentCashBalance, currency);
        triggerDeviceSms(sendSmsTo, smsBody);
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

    // A signed-in account with no sheet never reaches here — the gate at the
    // top of handleSaveTransaction opens the setup onboarding first.

    // Out-of-wallet flow: when this save makes (or changes) an out-of-wallet
    // amount, immediately ask whether it was borrowed so it can be recorded in
    // the Borrowed list. Edits that leave the amount unchanged never re-ask.
    //
    // The walk is handed every row, carry-forwards included: it seeds each
    // carried day with its opening balance instead of adding it, so this
    // prompt now reads exactly the same maths as the badge on the wallet card
    // (the old "skip the carry rows" filter is what let a Rs 870 wallet book a
    // Rs 1,000 shortfall out of a Rs 130 overspend). A carried save itself
    // never carries out-of-wallet, so it yields 0 and skips the prompt.
    const newOow =
      calculateRunningBalances(updatedTxs).get(recordedTx.id)?.outOfWallet ?? 0;
    const prevOow = txData.id
      ? calculateRunningBalances(transactions).get(txData.id)?.outOfWallet ?? 0
      : 0;
    if (newOow > 0 && newOow !== prevOow) {
      setOowPrompt({ amount: newOow, date: recordedTx.date });
    }
    return true;
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
    // Setup-first, same as saving: the confirmation stays on screen behind
    // the onboarding, so the intent and the row both survive the detour.
    if (needsSheetSetup()) {
      openSheetSetup('needed');
      return;
    }
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
    const deletedTx = deleteCandidate;
    setDeleteCandidate(null);
    showNotification('Transaction deleted.', 'success');
    dispatchTransactionDeletedTelegram([deletedTx], remaining);

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

    if (telegramSendActive) {
      // Alerts show TODAY's balance only, matching the transaction alerts.
      const todayStr = getLocalDateString();
      const todaySum = calculateSummary(transactions, transactions.filter((t) => t && t.date === todayStr));
      const lendAlert = generateLendTelegramAlert(newItem, currency, todaySum.currentCashBalance);
      void sendTelegramAlert({ ...lendAlert, chatId: telegramAlertConfig.chatId })
        .then((res) => {
          if (res.queued) {
            showNotification('Offline: Telegram alert queued, will send when online.', 'info');
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
    const item = lendItems.find((i) => i.id === id);
    if (!item) return;
    const nextStatus: 'pending' | 'settled' = item.status === 'pending' ? 'settled' : 'pending';
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const dateStr = getLocalDateString();

    let updatedTxs = transactions;
    let settlementTxId: string | undefined;

    if (nextStatus === 'settled') {
      // SETTLED = the money actually moved, so it must hit the wallet as a
      // real transaction: a lent amount comes BACK as cash added; a borrowed
      // amount GOES OUT as a cash expense.
      const isLent = item.type === 'lent';
      settlementTxId = item.settlementTxId || `tx-lendset-${item.id}`;
      const existingTx = transactions.find((t) => t.id === settlementTxId);
      if (!existingTx) {
        const settlementTx: Transaction = {
          id: settlementTxId,
          date: dateStr,
          time: timeStr,
          type: isLent ? 'cash_added' : 'cash_expense',
          category: 'Other',
          amount: item.amount,
          paymentMethod: 'Cash',
          notes: isLent
            ? `Settled: received from ${item.personName} — ${item.thingsOrReason}`
            : `Settled: paid to ${item.personName} — ${item.thingsOrReason}`,
          createdAt: Date.now(),
        };
        unmarkTxIdDeleted(settlementTx.id, currentUserEmail);
        updatedTxs = [settlementTx, ...transactions];
        markTransactionUpsert(settlementTx, currentUserEmail);
        latestStateRef.current.transactions = updatedTxs;
        saveStoredTransactions(updatedTxs, currentUserEmail);
        if (activeSheet?.id) {
          saveSheetTransactions(activeSheet.id, updatedTxs);
        }
        setTransactions(updatedTxs);
      }
    } else if (item.settlementTxId) {
      // Un-settling reverses the money movement: remove the auto-created
      // entry and tombstone it so sheet/cloud sync can never bring it back.
      if (transactions.some((t) => t.id === item.settlementTxId)) {
        markTxIdDeleted(item.settlementTxId, currentUserEmail);
        markTransactionDelete(item.settlementTxId, currentUserEmail);
        updatedTxs = transactions.filter((t) => t.id !== item.settlementTxId);
        latestStateRef.current.transactions = updatedTxs;
        saveStoredTransactions(updatedTxs, currentUserEmail);
        if (activeSheet?.id) {
          saveSheetTransactions(activeSheet.id, updatedTxs);
        }
        setTransactions(updatedTxs);
      }
      settlementTxId = undefined;
    }

    const updated = lendItems.map((i) => {
      if (i.id !== id) return i;
      return {
        ...i,
        status: nextStatus,
        settledAt: nextStatus === 'settled' ? now.toISOString() : undefined,
        settlementTxId: nextStatus === 'settled' ? settlementTxId : undefined,
      };
    });
    latestStateRef.current.lendItems = updated;
    saveStoredLendItems(updated, currentUserEmail);
    if (activeSheet?.id) {
      saveSheetLendItems(activeSheet.id, updated);
    }
    setLendItems(updated);

    // Persist the whole change (lend + settlement transaction) to the cloud
    // immediately so other devices see the same movement at the same moment.
    if (user?.email) {
      const nextWs = buildCloudWorkspace(Date.now() + 50);
      nextWs.transactions = updatedTxs;
      nextWs.lendItems = updated;
      cloudVersionRef.current = nextWs.updatedAt;
      void saveCloudWorkspace(nextWs).catch(console.warn);
    }

    const changedItem = updated.find((i) => i.id === id);
    if (changedItem) {
      markLendUpsert(changedItem, currentUserEmail);
      if (telegramSendActive) {
        // Alerts show TODAY's balance only, matching the transaction alerts.
        const todayStr = getLocalDateString();
        const todaySum = calculateSummary(updatedTxs, updatedTxs.filter((t) => t && t.date === todayStr));
        const lendAlert = generateLendTelegramAlert(changedItem, currency, todaySum.currentCashBalance);
        void sendTelegramAlert({ ...lendAlert, chatId: telegramAlertConfig.chatId })
          .then((res) => {
            if (!res.queued) {
              showNotification(
                changedItem.status === 'settled'
                  ? 'Telegram alert: Settled status updated.'
                  : 'Telegram alert: Status updated.',
                'success'
              );
            }
          })
          .catch(console.warn);
      }
    }

    showNotification(
      nextStatus === 'settled'
        ? item.type === 'lent'
          ? `Settled — ${formatCurrency(item.amount, currency)} received and added to cash.`
          : `Settled — ${formatCurrency(item.amount, currency)} paid and deducted from cash.`
        : 'Settled status reverted — the settlement entry was removed.',
      'info'
    );

    if (activeSheet) {
      queueSheetPush({ transactions: updatedTxs, lendItems: updated });
    }
    const webhookUrl = loadStoredWebhookUrl();
    if (webhookUrl) {
      const sum = calculateSummary(updatedTxs, updatedTxs);
      syncViaWebhook(webhookUrl, updatedTxs, sum, updated).catch(console.warn);
    }
  };

  const handleDeleteLendItem = (id: string) => {
    const updated = lendItems.filter((i) => i.id !== id);
    markLendIdsDeleted([id], currentUserEmail);
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
  // The list the active section renders: that section's own filter over ALL
  // transactions, so "All" shows the full total and a section's presets never
  // leak into other sections. The header calendar only drives the balance.
  const filteredTransactions = useMemo(() => {
    const tab: SectionTab = activeTab === 'transactions' || activeTab === 'analytics' ? activeTab : 'dashboard';
    return filterFor(tab);
  }, [activeTab, filterFor]);

  // Summary for cards/badges follows the GLOBAL header date only, so the wallet
  // balance always matches the header calendar (a future date with no
  // transactions correctly shows Rs 0 instead of the all-time balance).
  const summary = useMemo(() => {
    return calculateSummary(transactions, dateFilteredTransactions);
  }, [transactions, dateFilteredTransactions]);

  // Daily refresh (controlled from Settings): refresh the date every 30s / on focus so each
  // new day starts fresh. When switched OFF the dashboard keeps showing the day it was opened on.
  useEffect(() => {
    if (!dailyRefresh) return;
    const updateDate = () => {
      const freshDate = getLocalDateString();
      setCurrentDateStr((prev) => {
        if (prev !== freshDate) {
          const rollPresetDates = (f: FilterState): FilterState => {
            if (f.type === 'today') {
              return { ...f, startDate: freshDate, endDate: freshDate };
            }
            if (f.type === 'yesterday') {
              const y = new Date();
              y.setDate(y.getDate() - 1);
              const yStr = getLocalDateString(y);
              return { ...f, startDate: yStr, endDate: yStr };
            }
            return f;
          };
          setHeaderFilter((f) => rollPresetDates(f));
          setSectionFilters((prev) => ({
            dashboard: rollPresetDates(prev.dashboard),
            transactions: rollPresetDates(prev.transactions),
            analytics: rollPresetDates(prev.analytics),
          }));
          if (activeSheet && user?.email && isOnline) {
            void handlePushToSheet({ silent: true });
          }
          return freshDate;
        }
        return prev;
      });
    };
    updateDate(); // catch up immediately when the toggle is turned back ON
    const interval = setInterval(updateDate, 30000);
    window.addEventListener('focus', updateDate);
    document.addEventListener('visibilitychange', updateDate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', updateDate);
      document.removeEventListener('visibilitychange', updateDate);
    };
  }, [dailyRefresh]);

  // HOME RETURNS TO TODAY. The header date - and therefore the Home
  // transaction log - is a Home-page concept: leaving Home resets it, so
  // coming back (or reopening the app) always starts on Today instead of
  // whatever date was last browsed. Other sections keep their own filters.
  useEffect(() => {
    if (activeTab === 'dashboard') return;
    setHeaderFilter((f) => (f === DEFAULT_FILTER ? f : DEFAULT_FILTER));
    setSectionFilters((prev) =>
      prev.dashboard === DEFAULT_FILTER ? prev : { ...prev, dashboard: DEFAULT_FILTER }
    );
  }, [activeTab, DEFAULT_FILTER]);

  // DAILY BALANCE CARRY-FORWARD
  //
  // The wallet balance follows the header date filter, and the header defaults
  // to "today", so the first open of a new day reads Rs 0.00 even though the
  // user finished yesterday holding cash. Offer yesterday's closing balance as
  // today's opening balance - ONCE per day per account.
  //
  // The day that RECEIVES the carry is the day the BALANCE is showing, never
  // the separate currentDateStr state: those two can diverge (frozen date,
  // daily refresh off), and a row dated a day the header is not showing lands
  // nowhere - Rs 0 on screen with no popup and no row. Only a single-day view
  // of the real calendar today can receive a carry; a range or a historical
  // day already carries its own history.
  //
  // Re-evaluated whenever the ledger, the header filter or the scope changes,
  // and again when the daily-refresh rollover moves the app onto a new day.
  //
  // The OFFER is purely mathematical - it stays alive after a dismissal so the
  // Cash In flow can still offer it. The ALERT shows whenever the offer exists,
  // apart from an explicit "Not now" in THIS session: every fresh open or
  // refresh asks again (the once-per-day flag now only stops the silent
  // auto-carry below from overriding a decline).
  const carryDay = getLocalDateString();

  // THE DAY THAT RECEIVES THE CARRY is the real calendar today, computed from
  // the clock instead of from whichever date the header happens to be
  // browsing. Tying it to the header filter is exactly what made the popup and
  // the Cash In "Continue" button vanish whenever the header sat on a range or
  // on another day.
  const carryOption = useMemo(
    () => evaluateCarryForward({ transactions, today: carryDay, email: currentStorageScope }),
    [transactions, carryDay, currentStorageScope]
  );

  // The ALERT still only fires while the balance on screen IS today's: a row
  // dated today cannot fix a view showing some other day. On the normal open
  // (header defaults to today) this is precisely when it fires.
  const headerShowsCarryDay =
    headerFilter.startDate === carryDay && headerFilter.endDate === carryDay;

  // The Cash In form saves on the header's pinned day, else on today. Its
  // Continue card follows THAT date: whenever the day being edited has a
  // previous-day close and no carry-forward of its own yet, the offer is
  // shown — and it stays shown until it is actually continued (dismissing the
  // daily popup never hides it, and no timing gate can make it vanish).
  // Accepting writes the row on the very date the form is editing.
  const txModalDate =
    headerFilter.startDate && headerFilter.startDate === headerFilter.endDate
      ? headerFilter.startDate
      : carryDay;
  const carryForModal = useMemo(
    () => evaluateCarryForward({ transactions, today: txModalDate, email: currentStorageScope }),
    [transactions, txModalDate, currentStorageScope]
  );

  const carryDismissedThisSession = Boolean(
    carryDismissedRef.current &&
      carryDismissedRef.current.day === carryDay &&
      carryDismissedRef.current.scope === currentStorageScope
  );

  const showCarryAlert = Boolean(carryOption) &&
    headerShowsCarryDay &&
    // "Not now" closes it for this visit only — the next open, refresh or
    // account switch offers it again.
    !carryDismissedThisSession &&
    // Never compete with the connection-lost alert or an in-flight sign-in
    // exchange: a modal stacked on a modal is noise. Both are transient, and
    // authPhaseState is reactive now, so the popup reappears the moment the
    // exchange lands instead of waiting for an unrelated re-render.
    !connectionNotice &&
    !authPhaseState.phase.startsWith('exchang');

  useEffect(() => {
    setCarryOffer(showCarryAlert ? carryOption : null);
  }, [carryOption, showCarryAlert]);

  // Accept: write a real ledger row dated the displayed day, flagged as a
  // carry-forward. It counts towards the wallet balance but is excluded from
  // the Cash In KPI, so the figure on screen is right without pretending new
  // money arrived. The note says "Yesterday balance continued ..." so the
  // ledger itself explains where the money came from.
  const persistCarryForward = (offer: CarryForwardOffer, day: string): boolean => {
    if (carryPersistLockRef.current) return false;
    if (findTodayCarryForward(latestStateRef.current.transactions, day)) {
      markCarryPromptShown(day, currentStorageScope);
      setCarryOffer(null);
      showNotification("Yesterday's balance is already continued.", 'info');
      return true;
    }
    carryPersistLockRef.current = true;
    setIsApplyingCarry(true);
    try {
      const saved = handleSaveTransaction(buildCarryForwardTransaction(offer, day));
      if (!saved) {
        // The save gate (setup required) or a write failure refused it: leave
        // the offer standing so the same Continue can simply be tapped again —
        // and never record the prompt as answered.
        return false;
      }
      markCarryPromptShown(day, currentStorageScope);
      carryDismissedRef.current = null;
      setCarryOffer(null);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not continue yesterday's balance. Try again.";
      showNotification(message, 'error');
      return false;
    } finally {
      carryPersistLockRef.current = false;
      setIsApplyingCarry(false);
    }
  };

  const handleAcceptCarryForward = (offer: CarryForwardOffer) => {
    persistCarryForward(offer, carryDay);
  };

  // Dismiss: close it for THIS session only. The once-per-day flag is still
  // recorded so the silent auto-carry below never overrides an explicit "Not
  // now", but the popup itself comes back on the next open or refresh — asking
  // again is the whole point of the request, and it stays safe because the
  // offer itself disappears the moment today's carry row exists.
  const handleDismissCarryForward = () => {
    markCarryPromptShown(carryDay, currentStorageScope);
    carryDismissedRef.current = { day: carryDay, scope: currentStorageScope };
    setCarryOffer(null);
  };

  // SAFETY NET - "the popup never appeared, but the balance must still be
  // right." While the connection-lost alert or the sign-in exchange owns the
  // screen the popup is deliberately suppressed; if the user starts recording
  // the new day anyway (stale phase, a modal that never re-rendered), carry
  // silently instead of leaving Rs 0 on screen all day.
  //
  // An explicit "Not now" (the per-day prompt marker) or an already-accepted
  // row both opt out, so this can never override a decline, and it never
  // fires while the popup is still able to show.
  useEffect(() => {
    if (!carryOption) return;
    // Only meaningful when today's balance is what the screen is showing.
    if (!headerShowsCarryDay) return;
    if (hasCarryPromptFor(carryDay, currentStorageScope)) return;
    if (findTodayCarryForward(transactions, carryDay)) return;
    const popupSuppressed =
      Boolean(connectionNotice) || authPhaseState.phase.startsWith('exchang');
    const userStartedToday = transactions.some((tx) => tx && tx.date === carryDay);
    if (popupSuppressed && userStartedToday) {
      persistCarryForward(carryOption, carryDay);
    }
  }, [carryDay, carryOption, headerShowsCarryDay, connectionNotice, authPhaseState, transactions, currentStorageScope]);

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
    return calculateCategoryBreakdown(filteredTransactions, categories);
  }, [filteredTransactions, categories]);

  // The Spending Trend shows ONE real week: the Monday–Sunday week that
  // contains the date the Analytics filter points at (today when it has no
  // end date, e.g. "All" / "This month"). It reads the section's non-date
  // refinements over ALL transactions, so a single-day date filter no longer
  // zeroes out the other six bars of the chart.
  const { trendItems } = useMemo(() => {
    const analyticsFilter = sectionFilters.analytics;
    const anchor =
      analyticsFilter.endDate && analyticsFilter.endDate <= todayStr
        ? analyticsFilter.endDate
        : todayStr;
    const base = filterTransactions(transactions, {
      ...analyticsFilter,
      startDate: '',
      endDate: '',
    });
    return calculateWeeklyDailyTrend(base, anchor);
  }, [transactions, sectionFilters, todayStr]);

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

  // Desktop header context: page title + subtitle for the active tab
  const pageMeta = useMemo(() => {
    switch (activeTab) {
      case 'transactions':
        return { title: 'All Records', subtitle: 'Search, filter & manage all your records' };
      case 'lend':
        return { title: 'Lend & Borrow', subtitle: 'Money lent & borrowed, settled simply' };
      case 'analytics':
        return { title: 'Analytics', subtitle: 'Spending trends & category insights' };
      default:
        return { title: 'Dashboard', subtitle: 'Track every rupee across cash & cards' };
    }
  }, [activeTab]);

  // Desktop collapsible sidebar (md+ shell) - persisted locally
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sd-sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const handleToggleSidebar = () => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem('sd-sidebar-collapsed', next ? '1' : '0');
      } catch {
        // storage unavailable - keep in-memory state only
      }
      return next;
    });
  };

  // ── THE SIGN-IN GATE ──────────────────────────────────────────────────
  // The app opens with splash → this page → Google sign-in → the three-step
  // Google Sheet onboarding → dashboard, and signing out lands back here
  // instead of dropping into an anonymous local mode.
  //
  // OFFLINE IS NOT A SIGN-OUT: with the network gone the session cannot be
  // refreshed, so a device that still remembers its account opens straight
  // into that account's own local workspace — identity kept, records intact,
  // sync paused until the connection returns. The moment the connection comes
  // back the gate re-evaluates, so a genuinely dead session still ends up on
  // the sign-in page rather than pretending to be connected.
  const offlineResume =
    !isOnline && authStatus !== 'signed_out' && Boolean(loadLastOfflineWorkspace());
  const showSignInGate = !user && !offlineResume;

  if (showSignInGate) {
    return (
      <div className="min-h-screen bg-white text-slate-900 font-sans antialiased">
        <SignInScreen
          onSignIn={() => void handleSignIn('Sign-in page')}
          isBusy={isAuthPhaseInFlight(authPhaseState.phase)}
          isOffline={!isOnline}
          notice={
            authStatus === 'expired'
              ? 'session'
              : authStatus === 'signed_out'
                ? 'signed_out'
                : null
          }
          onPasswordSignIn={handlePasswordSignIn}
          onCreateAccount={handleCreateAccount}
          onForgotPassword={handleForgotPassword}
        />
        {/* Google sign-in phases (redirecting → exchanging → done/error) stay
            visible above the gate, which is where the round-trip starts. */}
        <AuthProgressOverlay onRetry={() => void handleSignIn('Sign-in page')} />
        {/* Password-reset link opened from the inbox (recovery session) */}
        <SetNewPasswordModal
          isOpen={isRecoveryOpen}
          onClose={() => setIsRecoveryOpen(false)}
          onSave={handleSetNewPassword}
        />
        {/* The splash is the first paint of every load, gate or not. */}
        {splashVisible && <SplashScreen />}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col antialiased pb-20 md:pb-8"
      style={{ '--sidebar-w': sidebarCollapsed ? '5rem' : '15rem' } as import('react').CSSProperties}
    >
      {/* Desktop application shell (md+ only) - mobile keeps Header + BottomNav unchanged */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        activeTab={activeTab}
        onNavigate={(tab) => {
          if (tab === 'sheets') setSheetsSourceTab(activeTab);
          if (tab === 'settings') setSettingsSection('main');
          setActiveTab(tab);
        }}
        pendingLendCount={pendingLendCount}
        activeSheet={activeSheet}
        user={user}
        userProfile={userProfile}
        storageEmail={currentUserEmail}
        isOnline={isOnline}
        isSyncing={isSyncing}
        onQuickSync={() => void handlePushToSheet({ silent: false, interactive: true })}
        onSignIn={handleSignIn}
        onSignOut={() => setIsSignOutConfirmOpen(true)}
        onOpenProfile={() => {
          setSettingsSection('profile');
          setActiveTab('settings');
        }}
        onOpenAuthHelp={() => setIsAuthHelpOpen(true)}
      />
      {/* App Header - Hidden when on Settings page or Google Sheets manager page */}
      {activeTab !== 'settings' && activeTab !== 'sheets' && (
        <Header
          user={user}
          pageTitle={pageMeta.title}
          pageSubtitle={pageMeta.subtitle}            dateFilter={headerFilter}
            onDateFilterChange={(next) => {
              setHeaderFilter(next);
              // HOME ONLY: the Home transaction log follows the header date.
              // Every other section keeps its own filter, so moving the header
              // calendar changes what Home shows and nothing else.
              setSectionFilters((prev) => ({
                ...prev,
                dashboard: {
                  ...prev.dashboard,
                  type: next.type,
                  startDate: next.startDate,
                  endDate: next.endDate,
                },
              }));
            }}
            headerDate={currentDateStr}
          showCash={activeTab !== 'dashboard'}
          userProfile={userProfile}
          storageEmail={currentUserEmail}
          activeSheet={activeSheet}
          isSyncing={isSyncing}
          totalCashBalance={summary.currentCashBalance}
          totalSpend={summary.totalSpend}
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
          onQuickSync={() => void handlePushToSheet({ silent: false, interactive: true })}
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

      {/* Offline is announced once by a toast (see handleOffline) instead of
          a permanent amber banner — fewer competing surfaces per screen. */}

      {/* Connection-lost ALERT - the single surface for a lost sign-in. The
          amber banner that used to sit above it was removed: two warnings for
          one event was noise, and this one is unmissable on its own. Raised
          once per genuine loss of sync (session revoked, or the Google grant
          is gone), never on an intentional sign-out. */}
      <SessionExpiredModal
        kind={isAuthPhaseActive(authPhaseState.phase) ? null : connectionNotice}
        isSigningIn={isReconnecting}
        onSignIn={() => {
          setIsReconnecting(true);
          const caller = connectionNotice === 'google' ? 'Reconnect Google' : 'Sign in again';
          // On success this navigates away to Google; on failure the auth
          // overlay surfaces a friendly retry. Hide this alert while that runs.
          void handleSignIn(caller).finally(() => setIsReconnecting(false));
        }}
        onDismiss={() => setConnectionNotice(null)}
      />

      {/* Daily carry-forward ALERT - offered once per day per account, only
          while today has no rows yet. Accepting writes a flagged ledger row so
          the balance is right and the sheet stays reconcilable; dismissing
          never asks again today and leaves the same option inside Cash In. */}
      <DailyCarryForwardModal
        offer={carryOffer}
        currency={currency}
        isApplying={isApplyingCarry}
        onConfirm={() => { if (carryOffer) handleAcceptCarryForward(carryOffer); }}
        onDismiss={handleDismissCarryForward}
      />

      {/* Dynamic Island Floating Pill Toast (Matching user reference screenshot) */}
      <AnimatePresence>
        {notification && (
          <div className="fixed bottom-20 sm:bottom-8 left-0 right-0 z-50 flex justify-center pointer-events-none px-4 md:pl-[var(--sidebar-w)]">
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
                className="group flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900/95 backdrop-blur-[5px] text-white border border-white/10 shadow-[0_16px_36px_-10px_rgba(15,23,42,0.55)] hover:bg-slate-800 transition-colors cursor-pointer max-w-[19rem] sm:max-w-sm select-none"
              >
                {notification.type === 'error' ? (
                  <svg className="w-4 h-4 shrink-0 drop-shadow-[0_0_8px_rgba(244,63,94,0.35)]" viewBox="0 0 24 24" fill="none">
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
                  <svg className="w-4 h-4 shrink-0 drop-shadow-[0_0_8px_rgba(56,189,248,0.35)]" viewBox="0 0 24 24" fill="none">
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
                  <svg className="w-4 h-4 shrink-0 drop-shadow-[0_0_8px_rgba(16,185,129,0.35)]" viewBox="0 0 24 24" fill="none">
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
                <span className="text-[13px] font-medium text-white tracking-tight leading-snug select-none">
                  {notification.message}
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content with Smooth Page Fade & Slide Transition Animation */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 w-full md:pl-[var(--sidebar-w)] transition-[padding] duration-300 ease-in-out"
        >
          {activeTab === 'sheets' && (
            <SheetManagerView
              onBack={() => setActiveTab(sheetsSourceTab || 'settings')}
              totalCashBalance={summary.currentCashBalance}
              currency={currency}
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
              totalCashBalance={summary.currentCashBalance}
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
              dailyRefresh={dailyRefresh}
              onUpdateDailyRefresh={(enabled) => {
                markSettingsDirty(currentUserEmail);
                handleUpdateDailyRefresh(enabled);
                queueCloudSync();
                showNotification(`Daily refresh turned ${enabled ? 'ON' : 'OFF'}`, 'success');
              }}
              budgetConfig={budgetConfig}
              onUpdateBudgetConfig={handleUpdateBudgetConfig}
              alertPhone={alertPhone}
              onUpdateAlertPhone={handleUpdateAlertPhone}
              telegramAlertConfig={telegramAlertConfig}
              onUpdateTelegramAlertConfig={handleUpdateTelegramAlertConfig}
              onSendTelegramTest={handleSendTelegramTest}
              telegramLinkStatus={telegramLinkStatus}
              isTelegramStatusLoading={isTelegramStatusLoading}
              onRefreshTelegramLink={refreshTelegramLinkStatus}
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
              onUpdateCategories={(newCats) => setCategories(newCats)}
              onResetAllData={() => {
                // 1. BACKUP FIRST - download a full JSON restore point before
                // anything is destroyed, per the safety requirement.
                try {
                  const json = exportFullBackupJson(currentUserEmail);
                  const blob = new Blob([json], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `spenddesk-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 4000);
                } catch (err) {
                  console.error('Backup export failed:', err);
                  showNotification('Backup export failed - nothing was deleted. Try again.', 'error');
                  return;
                }

                // 2. Tombstone every existing record FIRST: even if the Google
                // sheet wipe below fails (expired token / offline), a later
                // two-way sync can NEVER resurrect the cleared records.
                const existingIds = transactions.map((t) => t.id);
                const existingLendIds = lendItems.map((l) => l.id);
                markTxIdsDeleted(existingIds, currentUserEmail);
                markTxIdsDeleted(existingIds, 'guest');
                markLendIdsDeleted(existingLendIds, currentUserEmail);
                markLendIdsDeleted(existingLendIds, 'guest');
                setTransactions([]);
                setLendItems([]);
                latestStateRef.current.transactions = [];
                latestStateRef.current.lendItems = [];
                setSelectedTransactionIds([]);
                saveStoredTransactions([], currentUserEmail);
                saveStoredTransactions([], 'guest');
                saveStoredLendItems([], currentUserEmail);
                saveStoredLendItems([], 'guest');
                clearPendingSync(currentUserEmail);
                clearPendingSync('guest');
                if (activeSheet?.id) {
                  const sheetId = activeSheet.id;
                  clearSheetCache(sheetId);
                  saveSheetTransactions(sheetId, []);
                  saveSheetLendItems(sheetId, []);
                  void (async () => {
                    try {
                      let token = accessToken;
                      if (!token || token === 'local_token' || token.startsWith('eyJ')) {
                        token = await requestGoogleAccessToken(false, 'sheet_sync_silent').catch(() => '');
                      }
                      if (!token) return; // tombstones already guard the re-import
                      await overwriteTransactionsInSheet(token, sheetId, [], []).catch(console.warn);
                      await overwriteLendItemsInSheet(token, sheetId, []).catch(console.warn);
                      await syncDashboardStats(token, sheetId, { currentCashBalance: 0, cashAdded: 0, cashSpent: 0, cardSpend: 0, totalSpend: 0, outOfWallet: 0 }, [], {}).catch(console.warn);
                    } catch {}
                  })();
                }
                if (user?.email) {
                  const wipeTimestamp = Math.max(Date.now(), cloudVersionRef.current + 5000);
                  cloudVersionRef.current = wipeTimestamp;
                  const wipeWs = buildCloudWorkspace(wipeTimestamp);
                  wipeWs.transactions = [];
                  wipeWs.lendItems = [];
                  // Carry the full tombstone list so every other device applies
                  // the wipe too instead of pushing its old records back.
                  wipeWs.deletedTxIds = Array.from(new Set([...(wipeWs.deletedTxIds || []), ...existingIds]));
                  wipeWs.deletedLendIds = Array.from(new Set([...(wipeWs.deletedLendIds || []), ...existingLendIds]));
                  void saveCloudWorkspace(wipeWs).catch(console.warn);
                }
                showNotification('Backup downloaded. All records reset! Storage and Google Sheet refreshed.', 'info');
              }}
              onRestoreTransactions={() => {
                setTransactions(loadStoredTransactions(currentUserEmail));
                setLendItems(loadStoredLendItems(currentUserEmail));
                showNotification('Data restored successfully.', 'success');
              }}
              initialSection={settingsSection}
              onNotification={showNotification}
              onResetSignIn={handleResetSignIn}
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
                telegramConnected={Boolean(telegramLinkStatus?.connected)}
                telegramPending={
                  isConnectingTelegramCard ||
                  Boolean(telegramLinkStatus?.pending && !telegramLinkStatus?.connected)
                }
                telegramChecking={isTelegramStatusLoading && !telegramLinkStatus}
                onConnectTelegram={() => void handleConnectTelegramCard()}
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
                filter={sectionFilters.dashboard}
                onFilterChange={(next) => setSectionFilter('dashboard', next)}
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
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 md:text-sm">
                    Recent Activity
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('transactions')}
                    className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer md:text-sm"
                  >
                    View All ({filteredTransactions.length}) &rarr;
                  </button>
                </div>

                <TransactionTable
                  transactions={filteredTransactions.slice(0, 8)}
                  allTransactions={transactions}
                  currency={currency}
                  categoryDefs={categories}
                  storageEmail={currentUserEmail}
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
                filter={sectionFilters.transactions}
                onFilterChange={(next) => setSectionFilter('transactions', next)}
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
                categoryDefs={categories}
                storageEmail={currentUserEmail}
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
                filter={sectionFilters.analytics}
                onFilterChange={(next) => setSectionFilter('analytics', next)}
                onExportCSV={handleExportCSV}
                totalTransactionsCount={filteredTransactions.length}
                currency={currency}
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
        // When the header is pinned to a single day, new records default to
        // that day (not "today"); ranges fall back to today.
        defaultDate={
          headerFilter.startDate && headerFilter.startDate === headerFilter.endDate
            ? headerFilter.startDate
            : null
        }
        carryForward={carryForModal}
        isApplyingCarry={isApplyingCarry}
        onContinueYesterdayBalance={() => {
          if (!carryForModal) {
            showNotification('No yesterday balance to continue.', 'error');
            return false;
          }
          return persistCarryForward(carryForModal, txModalDate);
        }}
        currency={currency}
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

      {/* Password-reset link opened from the inbox (recovery session) */}
      <SetNewPasswordModal
        isOpen={isRecoveryOpen}
        onClose={() => setIsRecoveryOpen(false)}
        onSave={handleSetNewPassword}
      />

      {/* Sign Out Confirmation Modal */}
      <ConfirmModal
        isOpen={isSignOutConfirmOpen}
        title="Sign Out Confirmation"
        message="Are you sure you want to sign out? Your offline local records will remain safe on your device, but Google Sheets auto-sync will pause."
        confirmLabel="Sign Out"
        cancelLabel="Stay Signed In"
        isDestructive={true}
        icon="logout"
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
        message={`Delete this ${deleteCandidate?.category} transaction of Rs ${deleteCandidate?.amount.toLocaleString()}? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Keep"
        isDestructive={true}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteCandidate(null)}
      />

      {/* Out of wallet → borrowed prompt (auto-records into Borrowed on save) */}
      <OutOfWalletModal
        isOpen={Boolean(oowPrompt)}
        amount={oowPrompt?.amount ?? 0}
        date={oowPrompt?.date ?? getLocalDateString()}
        currency={currency}
        onDismiss={() => setOowPrompt(null)}
        onSaveBorrowed={(data) => {
          handleAddLendItem({
            personName: data.personName,
            thingsOrReason: data.thingsOrReason,
            amount: data.amount,
            type: 'borrowed',
            status: 'pending',
            date: data.date,
          });
          setOowPrompt(null);
        }}
      />

      {/* Google Sheet setup - the friendly replacement for a raw sync error
          when a signed-in account has no sheet (or lost access to one). */}
      <SheetSetupModal
        phase={sheetSetupPhase}
        errorMessage={sheetSetupMessage}
        onCreate={() => { void handleSheetSetupCreate(); }}
        onDismiss={closeSheetSetup}
        onContinue={closeSheetSetup}
      />

      {/* Google sign-in phase overlay: redirecting → exchanging → connected / error */}
      <AuthProgressOverlay onRetry={() => { void handleSignIn('Sign-in button'); }} />

      {/* Branded splash — first paint of the session, above everything else */}
      {splashVisible && <SplashScreen />}
    </div>
  );
}
