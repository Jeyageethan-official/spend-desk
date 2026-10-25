/**
 * SpendDesk behaviour checks — `npm test`
 *
 * Covers the rules the app must never break:
 *   1. Telegram alerts for single + bulk deletion (and still for additions)
 *   2. Yesterday Balance Continue: one auto-saved row, never a duplicate
 *   3. Friendly Google Sheet setup (error classification, no raw API text)
 *   4. Yesterday Balance = end of the immediately previous calendar day only
 *   5. Popup / Continue availability rules (cash-in-only days, Not Now, reload)
 *
 * Browser globals are polyfilled BEFORE the app modules load, so the real
 * production code paths (storage, outbox, classification) are what runs.
 *
 * Each scenario uses its own account scope: the per-day frozen amount is
 * real behaviour, and a shared scope would let an earlier freeze answer a later
 * assertion instead of the calculation under test.
 */

const store = new Map<string, string>();
const localStoragePolyfill = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    store.set(k, String(v));
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() {
    return store.size;
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStoragePolyfill,
  configurable: true,
  writable: true,
});
// Offline: sendTelegramAlert writes to the durable outbox and never touches
// the network, so these checks can never reach a real Telegram chat.
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: false, userAgent: 'node-verify' },
  configurable: true,
  writable: true,
});

const { calculateSummary, filterTransactions, formatCurrency, formatDateToDisplayHeader } =
  await import('../src/lib/calculations');
const {
  evaluateCarryForward,
  buildCarryForwardTransaction,
  findTodayCarryForward,
  hasCarryPromptFor,
  markCarryPromptShown,
  closingBalanceThrough,
} = await import('../src/lib/dailyCarryForward');
const {
  generateTransactionTelegramAlert,
  generateDeletedTransactionTelegramAlert,
  generateBulkDeletedTransactionsTelegramAlert,
  sendTelegramAlert,
  getPendingTelegramAlerts,
} = await import('../src/lib/telegramAlert');
const { classifySheetError, friendlySheetErrorMessage } = await import('../src/lib/sheetsApi');

type AnyTx = {
  id: string;
  createdAt: number;
  date: string;
  time?: string;
  type: 'cash_added' | 'cash_expense' | 'card_expense';
  category?: string;
  amount: number;
  paymentMethod?: string;
  notes?: string;
  isCarryForward?: boolean;
};

let seq = 0;
const tx = (t: Partial<AnyTx> & Pick<AnyTx, 'date' | 'type' | 'amount'>): AnyTx => ({
  id: `tx-${++seq}`,
  createdAt: Date.now() + seq,
  category: 'Other',
  paymentMethod: 'Cash',
  ...t,
});

let passed = 0;
const failures: string[] = [];
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};
const section = (title: string) => console.log(`\n${title}`);

const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
const todayFilter = (d: string) => ({
  type: 'today' as const,
  startDate: d,
  endDate: d,
  category: 'All',
  paymentMethod: 'All',
  searchQuery: '',
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. YESTERDAY BALANCE = END OF THE IMMEDIATELY PREVIOUS CALENDAR DAY
// ─────────────────────────────────────────────────────────────────────────────
section('4 · Yesterday balance calculation');

// Example A: 25 Oct closes at 3,000 → 26 Oct offers 3,000.
const ledgerA = [
  tx({ date: day(23), type: 'cash_added', amount: 1000, category: 'Cash Added' }),
  tx({ date: day(25), type: 'cash_added', amount: 2000, category: 'Cash Added' }),
];
const offerA = evaluateCarryForward({ transactions: ledgerA, today: day(26), email: 'scope-a' });
check('A · offer equals the 25 Oct close (3,000)', offerA?.amount === 3000, String(offerA?.amount));

// Example B: 23 Oct = 1,000, 25 Oct closes at 3,000 → 26 Oct must be 3,000,
// never 4,000 (older balances are not added again).
const ledgerB = [
  tx({ date: day(23), type: 'cash_added', amount: 1000, category: 'Cash Added' }),
  // carry row re-opens 25 Oct with 1,000 — the double-count trap
  tx({ date: day(25), type: 'cash_added', amount: 1000, category: 'Cash Added', isCarryForward: true, notes: 'Yesterday balance continued from 23 Oct' }),
  tx({ date: day(25), type: 'cash_added', amount: 2000, category: 'Cash Added' }),
];
const offerB = evaluateCarryForward({ transactions: ledgerB, today: day(26), email: 'scope-b' });
check('B · older balances are not double-counted (3,000, not 4,000)', offerB?.amount === 3000, String(offerB?.amount));
check('B · label points at the immediately previous day',
  Boolean(offerB?.fromLabel.includes('25') && offerB?.fromLabel.includes('Oct')),
  String(offerB?.fromLabel));

// Example C: 5 Oct closes at 1,500, 6 Oct has NO transactions → 7 Oct still
// offers 1,500 (an empty day does not change the wallet).
const ledgerC = [tx({ date: day(5), type: 'cash_added', amount: 1500, category: 'Cash Added' })];
check('C · empty previous day still offers the last real close (1,500)',
  evaluateCarryForward({ transactions: ledgerC, today: day(7), email: 'scope-c' })?.amount === 1500,
  String(evaluateCarryForward({ transactions: ledgerC, today: day(7), email: 'scope-c' })?.amount));

// Requirement 5 example: 5 Oct cash-in only, no expense → 6 Oct offers 1,500.
check('5 · cash-in-only yesterday offers its close (1,500)',
  evaluateCarryForward({ transactions: ledgerC, today: day(6), email: 'scope-d' })?.amount === 1500);

// Requirement: never depend on the last transaction type — yesterday with only
// a CARD expense leaves the cash drawer untouched, so the offer survives.
const ledgerCard = [
  ...ledgerC,
  tx({ date: day(6), type: 'card_expense', amount: 400, category: 'Food', paymentMethod: 'Card' }),
];
check('5 · yesterday with only a card expense still offers 1,500',
  evaluateCarryForward({ transactions: ledgerCard, today: day(7), email: 'scope-e' })?.amount === 1500,
  String(evaluateCarryForward({ transactions: ledgerCard, today: day(7), email: 'scope-e' })?.amount));

// Today's own rows must never move the amount (fresh scope → live calculation).
const withTodayRows = [
  ...ledgerA,
  tx({ date: day(26), type: 'cash_added', amount: 5000, category: 'Cash Added' }),
  tx({ date: day(26), type: 'cash_expense', amount: 2500, category: 'Food' }),
];
check('A · today\'s transactions never change the offer',
  evaluateCarryForward({ transactions: withTodayRows, today: day(26), email: 'scope-a2' })?.amount === 3000);

// The amount is frozen for the day: editing YESTERDAY after the freeze must
// not move today's Continue amount.
const frozenScope = 'scope-frozen';
const firstOffer = evaluateCarryForward({ transactions: ledgerA, today: day(26), email: frozenScope })!;
const editedYesterday = [
  ...ledgerA,
  tx({ date: day(25), type: 'cash_added', amount: 9999, category: 'Cash Added' }),
];
check('4 · offer is frozen for the calendar day',
  evaluateCarryForward({ transactions: editedYesterday, today: day(26), email: frozenScope })?.amount === firstOffer.amount,
  String(evaluateCarryForward({ transactions: editedYesterday, today: day(26), email: frozenScope })?.amount));

// Positive balance only, and no offer without history before today.
const zeroClose = [
  tx({ date: day(25), type: 'cash_added', amount: 500, category: 'Cash Added' }),
  tx({ date: day(25), type: 'cash_expense', amount: 500, category: 'Food' }),
];
check('no offer when yesterday closed at zero',
  evaluateCarryForward({ transactions: zeroClose, today: day(26), email: 'scope-zero' }) === null &&
    closingBalanceThrough(zeroClose, day(25)) === 0);
check('no offer without history before today',
  evaluateCarryForward({ transactions: [tx({ date: day(26), type: 'cash_added', amount: 100, category: 'Cash Added' })], today: day(26), email: 'scope-none' }) === null);

// ─────────────────────────────────────────────────────────────────────────────
// 4b · HISTORICAL CARRY-FORWARD ROWS ARE NEVER COUNTED TWICE
// ─────────────────────────────────────────────────────────────────────────────
section('4 · carry-forward rows are not counted twice');

const dayOne = tx({ date: day(25), type: 'cash_added', amount: 1500, category: 'Cash Added' });
const carryRow = tx({
  date: day(26),
  type: 'cash_added',
  amount: 1500,
  category: 'Cash Added',
  isCarryForward: true,
  notes: 'Yesterday balance continued from 25 Oct',
});
const allTime = calculateSummary([dayOne, carryRow], [dayOne, carryRow]);
check('all-time balance after a carry stays 1,500 (not 3,000)', allTime.currentCashBalance === 1500, String(allTime.currentCashBalance));
const todayView = calculateSummary([dayOne, carryRow], [carryRow]);
check('single-day view still opens with the carried 1,500', todayView.currentCashBalance === 1500, String(todayView.currentCashBalance));
check('Cash In KPI ignores the carried row', todayView.cashAdded === 0, String(todayView.cashAdded));

// ─────────────────────────────────────────────────────────────────────────────
// 5 · POPUP / CONTINUE AVAILABILITY
// ─────────────────────────────────────────────────────────────────────────────
section('5 · popup and Continue availability');

check('5 · offer survives an explicit Not Now (Continue stays in Cash In)',
  (() => {
    const d = day(27);
    const scope = 'notnow@test';
    markCarryPromptShown(d, scope);
    const stillOffered = evaluateCarryForward({ transactions: ledgerC, today: d, email: scope });
    return hasCarryPromptFor(d, scope) && Boolean(stillOffered);
  })());

check('5 · prompt marker is scoped per calendar day',
  !hasCarryPromptFor(day(28), 'notnow@test'));

check('5 · a successful carry removes the option (no duplicate Continue)',
  (() => {
    const d = day(29);
    const scope = 'carry@test';
    const offer = evaluateCarryForward({ transactions: ledgerC, today: d, email: scope })!;
    const saved = { ...buildCarryForwardTransaction(offer, d), id: 'carry-1', createdAt: 1 } as AnyTx;
    const after = [...ledgerC, saved];
    return Boolean(findTodayCarryForward(after, d)) &&
      evaluateCarryForward({ transactions: after, today: d, email: scope }) === null;
  })());

check('2 · the saved carry row is dated today at 00:00 and flagged',
  (() => {
    const d = day(30);
    const offer = evaluateCarryForward({ transactions: ledgerC, today: d, email: 'row@test' })!;
    const row = buildCarryForwardTransaction(offer, d);
    return row.date === d && row.time === '00:00' && row.isCarryForward === true && row.type === 'cash_added';
  })());

check('2 · a second identical save is detected as a duplicate',
  (() => {
    const d = day(31);
    const offer = evaluateCarryForward({ transactions: ledgerC, today: d, email: 'dupe@test' })!;
    const row = { ...buildCarryForwardTransaction(offer, d), id: 'dup-1', createdAt: 1 } as AnyTx;
    return Boolean(findTodayCarryForward([row], d));
  })());

// ─────────────────────────────────────────────────────────────────────────────
// 1 · TELEGRAM ALERTS ON DELETE
// ─────────────────────────────────────────────────────────────────────────────
section('1 · Telegram deletion alerts');

const deleted = tx({ date: '2026-10-25', type: 'cash_expense', amount: 500, category: 'Food', notes: 'Food Expense' });
const remaining = [tx({ date: '2026-10-25', type: 'cash_added', amount: 3000, category: 'Cash Added' })];
const afterSingle = calculateSummary(remaining, filterTransactions(remaining, todayFilter('2026-10-25')));
const singleMsg = generateDeletedTransactionTelegramAlert(deleted, 'Rs', afterSingle.currentCashBalance).message;

check('single delete announces DELETED', singleMsg.includes('TRANSACTION DELETED'));
check('single delete carries the type', singleMsg.includes('Type: Cash Out'), singleMsg);
check('single delete carries the amount', singleMsg.includes(`Deleted Amount: ${formatCurrency(500, 'Rs')}`), singleMsg);
check('single delete carries the date', singleMsg.includes(`Date: ${formatDateToDisplayHeader('2026-10-25')}`), singleMsg);
check('single delete carries the description', singleMsg.includes('Description: Food Expense'), singleMsg);
check('single delete carries the updated balance', singleMsg.includes(`Updated Balance: ${formatCurrency(afterSingle.currentCashBalance, 'Rs')}`), singleMsg);

const bulkDeleted = [
  tx({ date: '2026-10-25', type: 'cash_expense', amount: 500, category: 'Food', notes: 'Food Expense' }),
  tx({ date: '2026-10-25', type: 'cash_added', amount: 200, category: 'Cash Added' }),
  tx({ date: '2026-10-24', type: 'cash_expense', amount: 100, category: 'Travel' }),
];
const bulkRemaining = [tx({ date: '2026-10-25', type: 'cash_added', amount: 3000, category: 'Cash Added' })];
const afterBulk = calculateSummary(bulkRemaining, filterTransactions(bulkRemaining, todayFilter('2026-10-25')));
const bulkMsg = generateBulkDeletedTransactionsTelegramAlert(bulkDeleted, 'Rs', afterBulk.currentCashBalance).message;

check('bulk delete announces DELETED', bulkMsg.includes('TRANSACTIONS DELETED'));
check('bulk delete counts the rows', bulkMsg.includes('Deleted: 3 transactions'), bulkMsg);
check('bulk delete carries the updated balance', bulkMsg.includes(`Updated Balance: ${formatCurrency(afterBulk.currentCashBalance, 'Rs')}`), bulkMsg);
check('bulk delete lists the individual rows', bulkMsg.includes('Food Expense') && bulkMsg.includes('Travel'), bulkMsg);

section('1 · existing addition alerts still work');
const addedMsg = generateTransactionTelegramAlert(
  tx({ date: '2026-10-25', type: 'cash_expense', amount: 250, category: 'Food', notes: 'Lunch' }) as any,
  'Rs',
  2500
).message;
check('addition alert keeps its expense line', addedMsg.includes('Expense:') && addedMsg.includes('Food'), addedMsg);
check('addition alert keeps its balance line', addedMsg.includes('Current Balance: Rs 2,500.00'), addedMsg);

section('1 · no duplicate delivery');
await sendTelegramAlert({ chatId: '', title: '[SpendDesk Alert]', message: '🗑️ TRANSACTION DELETED\n\nType: Cash Out' });
const outboxAfterOne = getPendingTelegramAlerts().length;
check('an offline delete alert is queued exactly once', outboxAfterOne === 1, String(outboxAfterOne));
await sendTelegramAlert({ chatId: '', title: '[SpendDesk Alert]', message: '🗑️ TRANSACTION DELETED\n\nType: Cash Out' });
const outboxAfterTwo = getPendingTelegramAlerts().length;
check('a second, separate alert gets its own outbox slot', outboxAfterTwo === 2, String(outboxAfterTwo));
const ids = getPendingTelegramAlerts().map((a) => a.id);
check('every queued alert has a unique id', new Set(ids).size === ids.length);

// ─────────────────────────────────────────────────────────────────────────────
// 3 · FRIENDLY GOOGLE SHEET SETUP
// ─────────────────────────────────────────────────────────────────────────────
section('3 · sheet errors are classified, never raw');

const raw404 = new Error('GET https://sheets.googleapis.com/v4/spreadsheets/abc 404 Not Found: {"error":{"message":"Requested entity was not found."}}');
const raw403 = new Error('Failed to update: 403 PERMISSION_DENIED: The caller does not have permission');
const raw401 = new Error('Request had invalid authentication credentials: 401 UNAUTHENTICATED');
const rawOther = new Error('TypeError: Failed to fetch at overwriteTransactionsInSheet');

check('a missing sheet is detected as needing setup', classifySheetError(raw404) === 'missing');
check('a permission failure is detected', classifySheetError(raw403) === 'permission');
check('an expired session is detected', classifySheetError(raw401) === 'auth');
check('the missing-sheet message is human and raw-free',
  friendlySheetErrorMessage(raw404).includes('Your Google Sheet is not ready yet') &&
  !friendlySheetErrorMessage(raw404).includes('sheets.googleapis.com'));
check('the permission message is human and raw-free',
  !friendlySheetErrorMessage(raw403).includes('403') && !friendlySheetErrorMessage(raw403).includes('PERMISSION_DENIED'));
check('an unknown failure never leaks the exception text',
  !friendlySheetErrorMessage(rawOther).includes('Failed to fetch') &&
  !friendlySheetErrorMessage(rawOther).includes('overwriteTransactionsInSheet'));

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
if (failures.length === 0) {
  console.log(`All ${passed} checks passed.`);
} else {
  console.log(`${failures.length} FAILED (${passed} passed):`);
  failures.forEach((f) => console.log(`  ✗ ${f}`));
  process.exitCode = 1;
}
