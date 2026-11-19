import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStorage } from './helpers/browserStorage';

installBrowserStorage();

const {
  loadDeletedTxIds,
  loadStoredTransactions,
  markTxIdsDeleted,
  saveStoredTransactions,
} = await import('../src/lib/storage');

const transaction = (id: string, amount = 100) => ({
  id,
  date: '2026-11-18',
  time: '09:00',
  type: 'cash_expense' as const,
  category: 'Food',
  amount,
  paymentMethod: 'Cash' as const,
  notes: 'Test expense',
  createdAt: 1,
});

test('account-scoped transactions do not leak to another account or guest storage', () => {
  localStorage.clear();
  saveStoredTransactions([transaction('alice-tx')], 'Alice@Example.com');
  saveStoredTransactions([transaction('bob-tx')], 'bob@example.com');

  assert.deepEqual(loadStoredTransactions('alice@example.com').map((tx) => tx.id), ['alice-tx']);
  assert.deepEqual(loadStoredTransactions('bob@example.com').map((tx) => tx.id), ['bob-tx']);
  assert.deepEqual(loadStoredTransactions('guest'), []);
});

test('deletion tombstones are scoped and survive a storage reload', () => {
  localStorage.clear();
  markTxIdsDeleted(['alice-tx'], 'alice@example.com');

  assert.equal(loadDeletedTxIds('alice@example.com').has('alice-tx'), true);
  assert.equal(loadDeletedTxIds('bob@example.com').has('alice-tx'), false);
});
