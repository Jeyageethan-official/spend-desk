import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStorage } from './helpers/browserStorage';

installBrowserStorage();

const {
  SHEET_OUTBOX_MAX_BACKOFF_MS,
  clearSheetSyncDirty,
  markSheetSyncDirty,
  noteSheetSyncAttempt,
  readSheetOutbox,
  sheetOutboxRetryDelayMs,
} = await import('../src/lib/sheetOutbox');

test('Sheet outbox persists dirty state and escalates retry backoff', () => {
  localStorage.clear();
  const email = 'sync@example.com';
  markSheetSyncDirty(email, 'network unavailable');
  noteSheetSyncAttempt(email);
  const first = readSheetOutbox(email);
  noteSheetSyncAttempt(email);
  const second = readSheetOutbox(email);

  assert.equal(first.dirty, true);
  assert.equal(first.attempts, 1);
  assert.equal(second.attempts, 2);
  assert.ok(second.nextRetryAt > first.nextRetryAt);
  assert.ok(sheetOutboxRetryDelayMs(second) <= SHEET_OUTBOX_MAX_BACKOFF_MS);
});

test('a successful Sheet push clears retry state for only its own account', () => {
  localStorage.clear();
  markSheetSyncDirty('one@example.com');
  markSheetSyncDirty('two@example.com');
  clearSheetSyncDirty('one@example.com');

  assert.equal(readSheetOutbox('one@example.com').dirty, false);
  assert.equal(readSheetOutbox('two@example.com').dirty, true);
});
