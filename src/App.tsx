import { useState, useEffect, useMemo, useCallback } from 'react';
import { User } from 'firebase/auth';
import { 
  initAuth, 
  googleSignIn, 
  logout, 
  getAccessToken 
} from './lib/firebase';
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
  loadStoredProfile,
  saveStoredProfile,
  UserProfile
} from './lib/storage';
import { 
  calculateSummary, 
  calculateCategoryBreakdown, 
  calculateWeeklyDailyTrend, 
  filterTransactions 
} from './lib/calculations';
import { 
  syncDashboardStats, 
  overwriteTransactionsInSheet, 
  overwriteLendItemsInSheet,
  fetchAllTransactionsFromSheet,
  syncViaWebhook
} from './lib/sheetsApi';
import { generateTransactionSmsText, triggerDeviceSms } from './lib/smsAlert';
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
  HandCoins
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('money_tracker_user_info');
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

  // App Navigation Tab (Mobile-first & Full-screen SPA)
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');

  // Transactions, Debt & Config State
  const [transactions, setTransactions] = useState<Transaction[]>(() => loadStoredTransactions());
  const [lendItems, setLendItems] = useState<LendItem[]>(() => loadStoredLendItems());
  const [alertPhone, setAlertPhone] = useState<string>(() => loadStoredAlertPhone());
  const [activeSheet, setActiveSheet] = useState<GoogleSheetMeta | null>(() => loadStoredSheetMeta());
  const [budgetConfig, setBudgetConfig] = useState<BudgetConfig>(() => loadStoredBudgetConfig());
  const [currency, setCurrency] = useState<string>('Rs');
  const [userProfile, setUserProfile] = useState<UserProfile>(() => loadStoredProfile());

  const handleUpdateProfile = (updated: Partial<UserProfile>) => {
    const nextProfile = { ...userProfile, ...updated };
    setUserProfile(nextProfile);
    saveStoredProfile(nextProfile);
  };

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

  // Status & Syncing
  const [isSyncing, setIsSyncing] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

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
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Save transactions to local storage whenever they change
  useEffect(() => {
    saveStoredTransactions(transactions);
  }, [transactions]);

  // Save lend items to local storage
  useEffect(() => {
    saveStoredLendItems(lendItems);
  }, [lendItems]);

  // Scroll to top whenever activeTab changes
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [activeTab]);

  // Save budget configuration
  const handleUpdateBudgetConfig = (config: BudgetConfig) => {
    setBudgetConfig(config);
    saveStoredBudgetConfig(config);
    showNotification('Budget & limits saved.', 'success');
  };

  // Update alert phone
  const handleUpdateAlertPhone = (phone: string) => {
    setAlertPhone(phone);
    saveStoredAlertPhone(phone);
    showNotification(phone ? `Alert number set: ${phone}` : 'Alert number cleared', 'info');
  };

  // Save active sheet metadata
  const handleSetActiveSheet = (meta: GoogleSheetMeta | null) => {
    setActiveSheet(meta);
    saveStoredSheetMeta(meta);
  };

  // Google Login handler with helpful fallback for Error 403 (Test user mode)
  const handleSignIn = async () => {
    try {
      const res = await googleSignIn();
      if (res.success && res.user && res.accessToken) {
        setUser(res.user);
        setAccessToken(res.accessToken);
        showNotification('Signed in! Google Sheets is connected.', 'success');
        setActiveTab('sheets');
      } else if (res.errorType === 'access_denied_test_user') {
        setIsAuthHelpOpen(true);
      } else if (res.errorType !== 'popup_closed') {
        showNotification(res.errorMessage || 'Sign-in failed. Local mode active.', 'error');
      }
    } catch (err: any) {
      console.error(err);
      setIsAuthHelpOpen(true);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
    showNotification('Signed out. Local data preserved.', 'info');
  };

  // Push Data to Connected Google Sheet (Transactions, Lend/Borrow, and Dashboard KPIs)
  const handlePushToSheet = useCallback(async () => {
    if (!activeSheet || !accessToken) return;
    setIsSyncing(true);
    try {
      // 1. Push Transactions
      await overwriteTransactionsInSheet(accessToken, activeSheet.id, transactions);
      
      // 2. Push Lend & Borrow records
      await overwriteLendItemsInSheet(accessToken, activeSheet.id, lendItems);

      // 3. Push Dashboard KPI Totals & Trends
      const allSummary = calculateSummary(transactions, transactions);
      const catSummary = calculateCategoryBreakdown(transactions);
      const { dayTotals } = calculateWeeklyDailyTrend(transactions);
      await syncDashboardStats(accessToken, activeSheet.id, allSummary, catSummary, dayTotals);

      const updatedMeta: GoogleSheetMeta = {
        ...activeSheet,
        lastSyncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      handleSetActiveSheet(updatedMeta);
      showNotification(`Synced all records to "${activeSheet.name}"!`, 'success');
    } catch (err: any) {
      console.error('Failed to sync to Google Sheet:', err);
      if (String(err).includes('401')) {
        showNotification('Google session expired. Please sign in again.', 'error');
        handleSignIn();
      } else {
        showNotification('Could not sync to Google Sheet: ' + err.message, 'error');
      }
    } finally {
      setIsSyncing(false);
    }
  }, [activeSheet, accessToken, transactions, lendItems]);

  // Pull Data from Connected Google Sheet
  const handlePullFromSheet = async () => {
    if (!activeSheet || !accessToken) return;
    setIsSyncing(true);
    try {
      const remoteTxs = await fetchAllTransactionsFromSheet(accessToken, activeSheet.id);
      if (remoteTxs.length > 0) {
        setTransactions(remoteTxs);
        showNotification(`Loaded ${remoteTxs.length} records from Google Sheets!`, 'success');
      } else {
        showNotification('No transactions found in this Google Sheet yet.', 'info');
      }
    } catch (err: any) {
      console.error('Failed to fetch from sheet:', err);
      showNotification('Failed to read from sheet: ' + err.message, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Add / Edit Transaction Handler with SMS Notification
  const handleSaveTransaction = (data: Omit<Transaction, 'id' | 'createdAt'> & { id?: string; sendSmsTo?: string }) => {
    const { sendSmsTo, ...txData } = data;
    let updatedTxs: Transaction[];
    let recordedTx: Transaction;

    if (txData.id) {
      updatedTxs = transactions.map((t) => (t.id === txData.id ? { ...t, ...txData } : t));
      recordedTx = { ...txData, id: txData.id, createdAt: Date.now() };
      setTransactions(updatedTxs);
      showNotification('Transaction updated.', 'success');
    } else {
      recordedTx = {
        ...txData,
        id: 'tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        createdAt: Date.now(),
      };
      updatedTxs = [recordedTx, ...transactions];
      setTransactions(updatedTxs);
      showNotification('Transaction recorded.', 'success');
    }

    // Trigger background SMS notification if phone is configured
    if (sendSmsTo) {
      handleUpdateAlertPhone(sendSmsTo);
      const currentSum = calculateSummary(updatedTxs, updatedTxs);
      const smsBody = generateTransactionSmsText(recordedTx, currentSum.currentCashBalance, 'Rs');
      triggerDeviceSms(sendSmsTo, smsBody);
    }

    if (activeSheet && accessToken) {
      setTimeout(() => {
        getAccessToken().then((token) => {
          if (token) handlePushToSheet().catch(console.error);
        });
      }, 500);
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
    setTransactions(remaining);
    setDeleteCandidate(null);
    showNotification('Transaction deleted.', 'info');

    if (activeSheet && accessToken) {
      setTimeout(() => {
        handlePushToSheet().catch(console.error);
      }, 500);
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
    setLendItems(updated);
    showNotification(`${data.type === 'lent' ? 'Money Lent' : 'Money Borrowed'} saved.`, 'success');

    if (activeSheet && accessToken) {
      overwriteLendItemsInSheet(accessToken, activeSheet.id, updated).catch(console.error);
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
    setLendItems(updated);
    showNotification('Status updated.', 'info');

    if (activeSheet && accessToken) {
      overwriteLendItemsInSheet(accessToken, activeSheet.id, updated).catch(console.error);
    }
    const webhookUrl = loadStoredWebhookUrl();
    if (webhookUrl) {
      const sum = calculateSummary(transactions, transactions);
      syncViaWebhook(webhookUrl, transactions, sum, updated).catch(console.warn);
    }
  };

  const handleDeleteLendItem = (id: string) => {
    const updated = lendItems.filter((i) => i.id !== id);
    setLendItems(updated);
    showNotification('Record deleted.', 'info');

    if (activeSheet && accessToken) {
      overwriteLendItemsInSheet(accessToken, activeSheet.id, updated).catch(console.error);
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
          onSignIn={handleSignIn}
          onSignOut={() => setIsSignOutConfirmOpen(true)}
          onOpenSyncModal={() => setActiveTab('sheets')}
          onOpenNewTransaction={() => {
            setEditingTransaction(null);
            setModalDefaultType('cash_expense');
            setIsTxModalOpen(true);
          }}
          onOpenSmsModal={() => setIsSmsModalOpen(true)}
          onQuickSync={handlePushToSheet}
          onOpenAuthHelp={() => setIsAuthHelpOpen(true)}
          onOpenSettings={(tab) => {
            setSettingsSection((tab as any) || 'main');
            setActiveTab('settings');
          }}
          onOpenProfileEdit={() => {
            setSettingsSection('profile');
            setActiveTab('settings');
          }}
        />
      )}

      {/* Floating Notification */}
      {notification && (
        <div className="fixed top-18 right-4 left-4 sm:left-auto sm:right-6 z-50 animate-in slide-in-from-top duration-200">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border text-xs sm:text-sm font-semibold ${
              notification.type === 'error'
                ? 'bg-red-50 text-red-800 border-red-200'
                : notification.type === 'info'
                ? 'bg-slate-900 text-white border-slate-800'
                : 'bg-emerald-50 text-emerald-900 border-emerald-200'
            }`}
          >
            {notification.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* Main Content Dashboard, Full-screen Google Sheets Manager, or Settings View */}
      {activeTab === 'sheets' ? (
        <SheetManagerView
          onBack={() => setActiveTab('dashboard')}
          accessToken={accessToken}
          activeSheet={activeSheet}
          onSetActiveSheet={handleSetActiveSheet}
          onPushToSheet={handlePushToSheet}
          onPullFromSheet={handlePullFromSheet}
          onSignInDirect={handleSignIn}
          onExportCSV={handleExportCSV}
          isSyncing={isSyncing}
          totalTransactionsCount={transactions.length}
          totalLendCount={lendItems.length}
          onNotification={showNotification}
        />
      ) : activeTab === 'settings' ? (
        <SettingsView
          onBack={() => setActiveTab('dashboard')}
          currency={currency}
          onUpdateCurrency={(c) => {
            setCurrency(c);
            showNotification(`Currency updated to ${c}`, 'success');
          }}
          budgetConfig={budgetConfig}
          onUpdateBudgetConfig={handleUpdateBudgetConfig}
          alertPhone={alertPhone}
          onUpdateAlertPhone={handleUpdateAlertPhone}
          activeSheet={activeSheet}
          onOpenSyncModal={() => setActiveTab('sheets')}
          onExportCSV={handleExportCSV}
          transactions={transactions}
          lendItems={lendItems}
          userProfile={userProfile}
          onUpdateProfile={handleUpdateProfile}
          onResetAllData={() => {
            setTransactions([]);
            setLendItems([]);
            showNotification('All local transaction records cleared.', 'info');
          }}
          onRestoreTransactions={() => {
            setTransactions(loadStoredTransactions());
            setLendItems(loadStoredLendItems());
            showNotification('Data restored successfully.', 'success');
          }}
          initialSection={settingsSection}
          onNotification={showNotification}
        />
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
          {/* Desktop Tab Selector Bar */}
          <div className="hidden md:flex items-center justify-between bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-1">
              {[
                { id: 'dashboard', label: 'Overview & Wallet' },
                { id: 'transactions', label: 'Transaction Ledger' },
                { id: 'lend', label: `Lend & Borrow${pendingLendCount > 0 ? ` (${pendingLendCount})` : ''}` },
                { id: 'analytics', label: 'Category & Trends' },
                { id: 'settings', label: 'Settings & Profile' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (tab.id === 'settings') {
                      setSettingsSection('main');
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

          <div className="flex items-center gap-2 pr-2">
            <button
              type="button"
              onClick={() => setIsSmsModalOpen(true)}
              className="px-3 py-1.5 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Paste Bank SMS</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* View 1: DASHBOARD (Home View) */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4 sm:space-y-6">
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
              />
            </div>
          </div>
        )}

        {/* View 2: TRANSACTIONS TAB */}
        {activeTab === 'transactions' && (
          <div className="space-y-4">
            <FilterBar
              filter={filter}
              onFilterChange={setFilter}
              onExportCSV={handleExportCSV}
              totalFilteredCount={filteredTransactions.length}
              collapsible={false}
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
            />
          </div>
        )}

        {/* View 3: LEND & BORROW (Debt Tracker) */}
        {activeTab === 'lend' && (
          <div className="space-y-4">
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
          </div>
        )}

        {/* View 4: ANALYTICS & TRENDS TAB (Mobile-Optimized) */}
        {activeTab === 'analytics' && (
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
        )}
      </main>
      )}

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
        currency="Rs"
      />

      {/* Google Sign-in Help & Local Mode Modal */}
      <AuthHelpModal
        isOpen={isAuthHelpOpen}
        onClose={() => setIsAuthHelpOpen(false)}
        onExportCSV={handleExportCSV}
        userEmailAttempt={user?.email || 'jeyageethan03@gmail.com'}
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
