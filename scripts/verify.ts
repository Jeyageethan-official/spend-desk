/**
 * SpendDesk behaviour checks — `npm test`
 *
 * Covers the rules the app must never break:
 *   1. Telegram alerts for single + bulk deletion (and still for additions)
 *   2. Yesterday Balance Continue: one auto-saved row, never a duplicate
 *   3. Friendly Google Sheet setup (error classification, no raw API text)
 *   4. Yesterday Balance = end of the immediately previous calendar day only
 *   5. Popup / Continue availability rules (cash-in-only days, Not Now, reload)
 *   6. Cash In marked "Out of Wallet" pays the out-of-wallet shortfall down
 *   7. The carry amount is live — corrections to yesterday move it at once
 *
 * Browser globals are polyfilled BEFORE the app modules load, so the real
 * production code paths (storage, outbox, classification) are what runs.
 *
 * Each scenario uses its own account scope so one scenario's state can never
 * answer another's assertions.
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

const {
  calculateSummary,
  calculateRunningBalances,
  isOutOfWalletRepayment,
  filterTransactions,
  formatCurrency,
  formatDateToDisplayHeader,
} = await import('../src/lib/calculations');
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

// Example A: 23 Oct = 1,000 (never continued), 25 Oct = 2,000 own activity.
// The 25 Oct CLOSE as displayed on the day = 2,000 → 26 Oct offers 2,000.
// (The offer is the previous day's own displayed close — older days are
// never re-walked into the amount.)
const ledgerA = [
  tx({ date: day(23), type: 'cash_added', amount: 1000, category: 'Cash Added' }),
  tx({ date: day(25), type: 'cash_added', amount: 2000, category: 'Cash Added' }),
];
const offerA = evaluateCarryForward({ transactions: ledgerA, today: day(26), email: 'scope-a' });
check('A · offer equals the 25 Oct close (2,000 — not older days summed)', offerA?.amount === 2000, String(offerA?.amount));

// Example B: 23 Oct = 1,000 real, 25 Oct carries 1,000 in + 2,000 own = the
// 25th displayed a 3,000 close → 26 Oct offers 3,000, never 4,000.
const ledgerB = [
  tx({ date: day(23), type: 'cash_added', amount: 1000, category: 'Cash Added' }),
  // carry row re-opens 25 Oct with 1,000 — the double-count trap
  tx({ date: day(25), type: 'cash_added', amount: 1000, category: 'Cash Added', isCarryForward: true, notes: 'Yesterday balance continued from 23 Oct' }),
  tx({ date: day(25), type: 'cash_added', amount: 2000, category: 'Cash Added' }),
];
const offerB = evaluateCarryForward({ transactions: ledgerB, today: day(26), email: 'scope-b' });
check('B · carried money is counted once (3,000, not 4,000)', offerB?.amount === 3000, String(offerB?.amount));
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
  evaluateCarryForward({ transactions: withTodayRows, today: day(26), email: 'scope-a2' })?.amount === 2000);

// Corrections to YESTERDAY must move today's Continue amount immediately. The
// offer used to be frozen in localStorage at first sight, so a fixed (or
// later-synced) yesterday kept offering a stale figure for the rest of the day.
const frozenScope = 'scope-frozen';
const firstOffer = evaluateCarryForward({ transactions: ledgerA, today: day(26), email: frozenScope })!;
const editedYesterday = [
  ...ledgerA,
  tx({ date: day(25), type: 'cash_added', amount: 9999, category: 'Cash Added' }),
];
check('4 · the offer follows a correction to yesterday in real time',
  firstOffer.amount === 2000 &&
    evaluateCarryForward({ transactions: editedYesterday, today: day(26), email: frozenScope })?.amount === 11999,
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
// 4c · THE USER'S REPORT: 25th closes 500, 26th closes 800 → 27th offers 800,
// never a sum of previous days (the reported Rs 1,400 bug).
// ─────────────────────────────────────────────────────────────────────────────
section('4c · previous day\'s close only — never a sum of older days');

const real25 = tx({ date: day(20), type: 'cash_added', amount: 500, category: 'Cash Added', time: '09:00' });
const carry26 = tx({
  date: day(21), type: 'cash_added', amount: 500, category: 'Cash Added', time: '00:00',
  isCarryForward: true, notes: 'Yesterday balance continued from 20 Oct',
});
const real26 = tx({ date: day(21), type: 'cash_added', amount: 300, category: 'Cash Added', time: '11:00' });
const ledgerReport = [real25, carry26, real26];
check('25th closes 500, 26th closes 800 → 27th offers 800',
  evaluateCarryForward({ transactions: ledgerReport, today: day(22), email: 'scope-report' })?.amount === 800,
  String(evaluateCarryForward({ transactions: ledgerReport, today: day(22), email: 'scope-report' })?.amount));

// THE KILLER CASE: the carry row lost BOTH its flag and its note (edited in
// the app or re-imported from the sheet). The old full-history walk then
// counted it as new income: 500 + 500 + 300 = 1,300 (user saw ~1,400).
// The day's own close is immune — the row is the day's opening either way.
const strippedCarry = { ...carry26, isCarryForward: undefined, notes: 'rent share' } as AnyTx;
const ledgerStripped = [real25, strippedCarry, real26];
check('carry row with flag+note lost still offers 800 (was 1,300)',
  evaluateCarryForward({ transactions: ledgerStripped, today: day(22), email: 'scope-stripped' })?.amount === 800,
  String(evaluateCarryForward({ transactions: ledgerStripped, today: day(22), email: 'scope-stripped' })?.amount));
check('stripped-carry single-day view of the 26th still opens at 800',
  calculateSummary(ledgerStripped, ledgerStripped.filter((t) => t.date === day(21))).currentCashBalance === 800,
  String(calculateSummary(ledgerStripped, ledgerStripped.filter((t) => t.date === day(21))).currentCashBalance));

// Manual re-add after a declined carry: the 26th's own close is what the
// screen showed that day — the 27th must offer that, not 500 + 800.
const manual26 = tx({ date: day(21), type: 'cash_added', amount: 800, category: 'Cash Added', time: '10:00' });
check('declined-carry day offers its own close (800, not 1,300)',
  evaluateCarryForward({ transactions: [real25, manual26], today: day(22), email: 'scope-manual' })?.amount === 800,
  String(evaluateCarryForward({ transactions: [real25, manual26], today: day(22), email: 'scope-manual' })?.amount));

// Three consecutive carried days never compound: 500 → 800 → 950 → offer 950.
const carry27 = tx({
  date: day(22), type: 'cash_added', amount: 800, category: 'Cash Added', time: '00:00',
  isCarryForward: true, notes: 'Yesterday balance continued from 21 Oct',
});
const real27 = tx({ date: day(22), type: 'cash_added', amount: 150, category: 'Cash Added', time: '12:00' });
check('three carried days never compound (23rd offers 950)',
  evaluateCarryForward({ transactions: [...ledgerReport, carry27, real27], today: day(23), email: 'scope-chain' })?.amount === 950,
  String(evaluateCarryForward({ transactions: [...ledgerReport, carry27, real27], today: day(23), email: 'scope-chain' })?.amount));

// Card-only previous day leaves the drawer untouched: the walk finds the
// last real cash close (the 500) instead of offering the card day's 0.
check('card-only previous day still offers the last cash close (500)',
  evaluateCarryForward({
    transactions: [real25, tx({ date: day(21), type: 'card_expense', amount: 400, category: 'Food', paymentMethod: 'Card', time: '09:00' })],
    today: day(22), email: 'scope-cardonly',
  })?.amount === 500);

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
// 6 · OUT OF WALLET IS PAID DOWN BY A CASH-IN MARKED "OUT OF WALLET"
// ─────────────────────────────────────────────────────────────────────────────
section('6 · Cash In marked Out of Wallet subtracts from the shortfall');

// The user's exact scenario: Rs 3,000 in the wallet, Rs 4,000 spent in cash
// => Rs 1,000 beyond the wallet. A Rs 500 Cash In whose note says
// "Out of Wallet" pays part of it down => the badge reads Rs 500, not 1,000.
const oowLedger = [
  tx({ date: day(25), type: 'cash_added', amount: 3000, category: 'Cash Added' }),
  tx({ date: day(25), type: 'cash_expense', amount: 4000, category: 'Other' }),
];
const oowBefore = calculateSummary(oowLedger, oowLedger);
check('OOW · overspending past the wallet records Rs 1,000', oowBefore.outOfWallet === 1000, String(oowBefore.outOfWallet));
check('OOW · and clamps the wallet at Rs 0', oowBefore.currentCashBalance === 0, String(oowBefore.currentCashBalance));

const oowRepay = [
  ...oowLedger,
  tx({ date: day(25), type: 'cash_added', amount: 500, category: 'Cash Added', notes: 'Out of Wallet' }),
];
const oowAfter = calculateSummary(oowRepay, oowRepay);
check('OOW · a Rs 500 Out-of-Wallet cash-in drops the badge to Rs 500', oowAfter.outOfWallet === 500, String(oowAfter.outOfWallet));
check('OOW · the cash itself still reaches the wallet (Rs 500)', oowAfter.currentCashBalance === 500, String(oowAfter.currentCashBalance));

const oowPlain = [
  ...oowLedger,
  tx({ date: day(25), type: 'cash_added', amount: 500, category: 'Cash Added', notes: 'Salary' }),
];
const oowPlainSummary = calculateSummary(oowPlain, oowPlain);
check('OOW · an ordinary cash-in leaves the shortfall at Rs 1,000', oowPlainSummary.outOfWallet === 1000, String(oowPlainSummary.outOfWallet));
check('OOW · an ordinary cash-in still adds Rs 500 to the wallet', oowPlainSummary.currentCashBalance === 500, String(oowPlainSummary.currentCashBalance));

const oowOverpay = [
  ...oowLedger,
  tx({ date: day(25), type: 'cash_added', amount: 5000, category: 'Cash Added', notes: 'Out of Wallet' }),
];
check('OOW · a repayment can never push the badge below zero',
  calculateSummary(oowOverpay, oowOverpay).outOfWallet === 0,
  String(calculateSummary(oowOverpay, oowOverpay).outOfWallet));

// Marker recognition: the carry-forward note is NOT a repayment, and the
// marker is matched on the note text the Cash In button writes.
check('OOW · the carry-forward note is never read as a repayment',
  !isOutOfWalletRepayment(tx({ date: day(25), type: 'cash_added', amount: 500, isCarryForward: true, notes: 'Yesterday balance continued from 24 Oct' })));
check('OOW · "Out of Wallet" in the note is recognised',
  isOutOfWalletRepayment(tx({ date: day(25), type: 'cash_added', amount: 500, notes: 'Salary, Out of Wallet' })));
check('OOW · a cash EXPENSE mentioning it is not a repayment',
  !isOutOfWalletRepayment(tx({ date: day(25), type: 'cash_expense', amount: 500, notes: 'Out of Wallet' })));

// Per-row contributions must SUM to the outstanding figure (the Google Sheet
// Dashboard reads SUM(Transactions!J:J) and the balance KPI reads SUMIF(J,">0")).
const oowRuns = calculateRunningBalances(oowRepay);
const oowSum = oowRepay.reduce((sum, t) => sum + (oowRuns.get(t.id)?.outOfWallet || 0), 0);
check('OOW · per-row contributions sum to the badge (Rs 500)', Math.abs(oowSum - 500) < 0.001, String(oowSum));

// THE CARRY-ROW HISTORY BUG: when the ledger's only history is the carried
// opening balance (fresh device, restored sheet, pruned history), the walk
// used to start at Rs 0 and book the WHOLE spend as out-of-wallet. Rs 870
// carried in and Rs 1,000 spent is Rs 130 beyond the wallet, never Rs 1,000.
const carryOnlyLedger = [
  tx({ date: day(25), type: 'cash_added', amount: 870, category: 'Cash Added', isCarryForward: true, notes: 'Yesterday balance continued from 24 Oct' }),
  tx({ date: day(25), type: 'cash_expense', amount: 1000, category: 'Other' }),
];
const carryOnlySummary = calculateSummary(carryOnlyLedger, carryOnlyLedger);
check('OOW · a carried-only ledger books Rs 130, not Rs 1,000', carryOnlySummary.outOfWallet === 130, String(carryOnlySummary.outOfWallet));
check('OOW · the carried wallet is spent down to Rs 0', carryOnlySummary.currentCashBalance === 0, String(carryOnlySummary.currentCashBalance));
check('OOW · the carried day opens at Rs 870',
  calculateSummary(carryOnlyLedger, [carryOnlyLedger[0]]).currentCashBalance === 870,
  String(calculateSummary(carryOnlyLedger, [carryOnlyLedger[0]]).currentCashBalance));

// With the earlier days still present the very same carry row must NOT add a
// second helping of the same money (the original double-count regression).
const carryWithHistory = [
  tx({ date: day(24), type: 'cash_added', amount: 870, category: 'Cash Added' }),
  ...carryOnlyLedger,
];
const carryWithHistorySummary = calculateSummary(carryWithHistory, carryWithHistory);
check('OOW · history + carry still reads Rs 130 (no double count)', carryWithHistorySummary.outOfWallet === 130, String(carryWithHistorySummary.outOfWallet));
check('OOW · history + carry still ends at Rs 0', carryWithHistorySummary.currentCashBalance === 0, String(carryWithHistorySummary.currentCashBalance));

// ─────────────────────────────────────────────────────────────────────────────
// 7 · THE CARRY AMOUNT IS LIVE — NEVER FROZEN AT FIRST EVALUATION
// ─────────────────────────────────────────────────────────────────────────────
section('7 · Continue Yesterday tracks corrections in real time');

const liveBefore = [
  tx({ date: day(26), type: 'cash_added', amount: 800, category: 'Cash Added' }),
];
const liveOffer1 = evaluateCarryForward({ transactions: liveBefore, today: day(27), email: 'scope-live' });
check('LIVE · first evaluation offers the 26 Oct close (800)', liveOffer1?.amount === 800, String(liveOffer1?.amount));

// A later correction to YESTERDAY must move the offer immediately — the old
// code froze the amount in localStorage on first sight, so the popup and the
// Cash In button kept offering 800 forever.
const liveAfter = [
  ...liveBefore,
  tx({ date: day(26), type: 'cash_added', amount: 200, category: 'Cash Added', notes: 'late entry' }),
];
const liveOffer2 = evaluateCarryForward({ transactions: liveAfter, today: day(27), email: 'scope-live' });
check('LIVE · a corrected yesterday updates the offer to 1,000', liveOffer2?.amount === 1000, String(liveOffer2?.amount));

const liveOffer3 = evaluateCarryForward({ transactions: liveAfter, today: day(27), email: 'scope-live' });
check('LIVE · repeated evaluations are stable (no flip-flop)', liveOffer3?.amount === 1000, String(liveOffer3?.amount));

// Today's rows still cannot touch the amount — only yesterday's close counts.
const withToday = [
  ...liveAfter,
  tx({ date: day(27), type: 'cash_added', amount: 9999, category: 'Cash Added' }),
];
const liveOffer4 = evaluateCarryForward({ transactions: withToday, today: day(27), email: 'scope-live' });
check('LIVE · today\u2019s own rows never change the offered amount', liveOffer4?.amount === 1000, String(liveOffer4?.amount));

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
if (failures.length === 0) {
  console.log(`All ${passed} checks passed.`);
} else {
  console.log(`${failures.length} FAILED (${passed} passed):`);
  failures.forEach((f) => console.log(`  ✗ ${f}`));
  process.exitCode = 1;
}
