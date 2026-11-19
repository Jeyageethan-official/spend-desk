import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStorage } from './helpers/browserStorage';

installBrowserStorage();

const {
  hasPendingSync,
  loadPendingSync,
  markTransactionDelete,
  markTransactionUpsert,
  mergePendingWorkspace,
  stageWorkspaceForReplay,
} = await import('../src/lib/pendingSync');

const transaction = (id: string, createdAt: number) => ({
  id,
  date: '2026-11-18',
  time: '09:00',
  type: 'cash_expense' as const,
  category: 'Food',
  amount: 100,
  paymentMethod: 'Cash' as const,
  notes: id,
  createdAt,
});

const workspace = (transactions: ReturnType<typeof transaction>[]) => ({
  version: 1 as const,
  updatedAt: 1,
  transactions,
  lendItems: [],
  categories: [],
  budgetConfig: { monthlyBudget: 0, lowCashThreshold: 0, dailySpendLimit: 0, notifyOnLimit: false },
  alertPhone: '',
  telegramAlertConfig: { enabled: false, chatId: '' },
  activeSheet: null,
  profile: { name: 'Test', email: 'test@example.com', avatar: null },
  currency: 'Rs',
});

test('offline deletion wins over a stale remote workspace and remains tombstoned', () => {
  localStorage.clear();
  markTransactionDelete('remote-delete', 'person@example.com');
  markTransactionUpsert(transaction('offline-add', 30), 'person@example.com');

  const remote = workspace([transaction('remote-delete', 10), transaction('remote-keep', 20)]);
  const local = workspace([transaction('offline-add', 30)]);
  const merged = mergePendingWorkspace(remote, local, loadPendingSync('person@example.com'), 100);

  assert.deepEqual(merged.transactions.map((tx) => tx.id), ['offline-add', 'remote-keep']);
  assert.equal(merged.deletedTxIds?.includes('remote-delete'), true);
});

test('sign-out staging creates a replayable, account-scoped offline baseline', () => {
  localStorage.clear();
  stageWorkspaceForReplay([transaction('offline-one', 10), transaction('offline-two', 20)], [], 'PERSON@example.com');

  assert.equal(hasPendingSync('person@example.com'), true);
  assert.deepEqual(Object.keys(loadPendingSync('person@example.com').transactionUpserts).sort(), ['offline-one', 'offline-two']);
  assert.equal(hasPendingSync('other@example.com'), false);
});
