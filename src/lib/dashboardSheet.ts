/**
 * Dashboard tab for the connected Google Sheet.
 *
 * Everything on the tab (the values AND the formatting) is generated from ONE
 * coordinate-based layout, so the two can never drift apart. `buildDashboardLayout`
 * is a pure function (no network, no DOM): it returns the Sheets API
 * `batchUpdate` requests that rebuild the whole tab in a single atomic call.
 *
 * Grid (columns):  A margin | B-D card | E gutter | F-H card | I gutter | J-L card | M gutter | N-P card | Q margin
 *   - four KPI cards per row = 3 columns each
 *   - two half-width panels   = B-H (left) and J-P (right)
 *
 * Values are written as typed values (stringValue / numberValue / formulaValue),
 * never parsed from text, so user data such as a category named "=SUM(1)" stays text.
 */
import type { SpendingSummary, CategorySummary, Transaction, LendItem } from '../types/finance';

// ─── Types ───────────────────────────────────────────────────────────────────

type HAlign = 'LEFT' | 'CENTER' | 'RIGHT';
type VAlign = 'TOP' | 'MIDDLE' | 'BOTTOM';
type NumKind = 'NUMBER' | 'CURRENCY' | 'PERCENT';
type CellValue = string | number | { formula: string } | null;

interface Fmt {
  bg: string;
  color?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  h?: HAlign;
  v?: VAlign;
  num?: string;
  numKind?: NumKind;
  padL?: number;
  padR?: number;
}

interface Spec {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  value: CellValue;
  fmt: Fmt;
  merge: boolean;
}

interface BorderSpec {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  color: string;
  top?: boolean;
  bottom?: boolean;
  left?: boolean;
  right?: boolean;
}

export interface DashboardInput {
  summary: SpendingSummary;
  categories: CategorySummary[];
  /** Weekday totals keyed Mon..Sun (all-time spend bucketed by day of week). */
  dailySpend: { [day: string]: number };
  transactions?: Transaction[];
  lendItems?: LendItem[];
  /** Injectable clock for tests. */
  now?: Date;
}

export interface DashboardLayout {
  rowCount: number;
  columnCount: number;
  /** Cell values by [row][col]; only merge anchors / single cells are non-null. */
  values: CellValue[][];
  /** Full ordered batchUpdate request list that rebuilds the tab. */
  buildRequests: (sheetId: number, current: { rowCount: number; columnCount: number }) => any[];
}

// ─── Palette (matches the in-app SpendDesk look: navy hero + green accent) ───

const P = {
  page: '#F4F6F8',
  card: '#FFFFFF',
  headBg: '#F8FAFC',
  border: '#E2E8F0',
  divider: '#EEF2F6',
  ink: '#172231',
  muted: '#64748B',
  faint: '#94A3B8',
  navy: '#131F2B',
  navyText: '#8FA1B3',
  brand: '#116B4E',
  brandBright: '#06BE70',
  brandTint: '#F0FAF5',
  brandBorder: '#BFE3D3',
  good: '#0F8A5F',
  bad: '#C2334D',
  warn: '#B45309',
  blue: '#2563EB',
  blueSoft: '#93C5FD',
  slate: '#64748B',
  track: '#EEF2F6',
  white: '#FFFFFF',
} as const;

const FONT = 'Roboto';
const RS = '"Rs "#,##0';
const RS_SIGNED = '"+ Rs "#,##0;"- Rs "#,##0;"Rs "0';
const PCT = '0.0%';
const LOW_CASH_LIMIT = 1500; // same threshold the in-app wallet card uses

// ─── Column / row geometry ───────────────────────────────────────────────────

const COL_PX = [20, 84, 84, 84, 14, 84, 84, 84, 14, 84, 84, 84, 14, 84, 84, 84, 20];
const LEFT: [number, number] = [1, 7];
const RIGHT: [number, number] = [9, 15];
const FULL: [number, number] = [1, 15];
const CARDS: [number, number][] = [
  [1, 3],
  [5, 7],
  [9, 11],
  [13, 15],
];
const TABLE_ROWS = 7;

const ROW_DEFS: [string, number][] = [
  ['top', 10],
  ['hdrTitle', 34],
  ['hdrSub', 22],
  ['hdrPad', 12],
  ['hdrLine', 3],
  ['gap1', 16],
  ['secOverview', 22],
  ['gap2', 10],
  ['k1Acc', 4],
  ['k1Label', 24],
  ['k1Value', 44],
  ['k1Sub', 24],
  ['gapK', 12],
  ['k2Acc', 4],
  ['k2Label', 24],
  ['k2Value', 44],
  ['k2Sub', 24],
  ['gap3', 20],
  ['secAnalysis', 22],
  ['gap4', 10],
  ['p1Title', 34],
  ['p1Head', 26],
  ...Array.from({ length: TABLE_ROWS }, (_, i): [string, number] => [`p1r${i}`, 30]),
  ['p1Total', 32],
  ['gap5', 20],
  ['secLedger', 22],
  ['gap6', 10],
  ['p2Title', 34],
  ['p2Head', 26],
  ...Array.from({ length: TABLE_ROWS }, (_, i): [string, number] => [`p2r${i}`, 30]),
  ['p2Foot', 32],
  ['gap7', 16],
  ['note', 22],
  ['bottom', 10],
];
const ROW: Record<string, number> = {};
ROW_DEFS.forEach(([name], i) => {
  ROW[name] = i;
});

// ─── Small helpers ───────────────────────────────────────────────────────────

const rgb = (hex: string) => ({
  red: parseInt(hex.slice(1, 3), 16) / 255,
  green: parseInt(hex.slice(3, 5), 16) / 255,
  blue: parseInt(hex.slice(5, 7), 16) / 255,
});

const pad2 = (n: number) => String(n).padStart(2, '0');
const localIso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const safeNum = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
const safeColor = (c: unknown, fallback: string): string =>
  typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback;
const round2 = (n: number) => Number(n.toFixed(2));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS: [string, string][] = [
  ['Mon', 'Monday'],
  ['Tue', 'Tuesday'],
  ['Wed', 'Wednesday'],
  ['Thu', 'Thursday'],
  ['Fri', 'Friday'],
  ['Sat', 'Saturday'],
  ['Sun', 'Sunday'],
];

/** "2026-10-05" -> "05 Oct" (adds a 2-digit year when it is not the current year). */
const shortDate = (iso: string, currentYear: number): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return iso || '—';
  const monthIdx = parseInt(m[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return iso;
  const yearPart = parseInt(m[1], 10) === currentYear ? '' : ` ${m[1].slice(2)}`;
  return `${m[3]} ${MONTHS[monthIdx]}${yearPart}`;
};

const sparkBar = (value: number, max: number, color: string): { formula: string } => ({
  formula:
    `=SPARKLINE({${round2(value)},${round2(Math.max(max - value, 0))}},` +
    `{"charttype","bar";"color1","${color}";"color2","${P.track}"})`,
});

// ─── Layout builder ──────────────────────────────────────────────────────────

export const buildDashboardLayout = (input: DashboardInput): DashboardLayout => {
  const now = input.now ?? new Date();
  const todayIso = localIso(now);
  const monthPrefix = todayIso.slice(0, 7);
  const currentYear = now.getFullYear();
  const summary: SpendingSummary = {
    currentCashBalance: safeNum(input.summary?.currentCashBalance),
    cashAdded: safeNum(input.summary?.cashAdded),
    cashSpent: safeNum(input.summary?.cashSpent),
    cardSpend: safeNum(input.summary?.cardSpend),
    totalSpend: safeNum(input.summary?.totalSpend),
    outOfWallet: safeNum(input.summary?.outOfWallet),
  };
  const txs = Array.isArray(input.transactions) ? input.transactions.filter(Boolean) : [];
  const lends = Array.isArray(input.lendItems) ? input.lendItems.filter(Boolean) : [];

  // ── Derived numbers ────────────────────────────────────────────────────────
  const isExpense = (t: Transaction) => t.type !== 'cash_added';
  const txDay = (t: Transaction) =>
    t.date || (t.createdAt ? localIso(new Date(t.createdAt)) : '');
  const todayTxs = txs.filter((t) => isExpense(t) && txDay(t) === todayIso);
  const todaySpend = todayTxs.reduce((s, t) => s + safeNum(t.amount), 0);
  const monthSpend = txs
    .filter((t) => isExpense(t) && txDay(t).startsWith(monthPrefix))
    .reduce((s, t) => s + safeNum(t.amount), 0);

  const lentItems = lends.filter((i) => i.type === 'lent');
  const borrowedItems = lends.filter((i) => i.type === 'borrowed');
  const openItems = lends.filter((i) => i.status !== 'settled');
  const sumAmt = (items: LendItem[]) => items.reduce((s, i) => s + safeNum(i.amount), 0);
  const totalLent = sumAmt(lentItems);
  const totalBorrowed = sumAmt(borrowedItems);
  const pendingToReceive = sumAmt(openItems.filter((i) => i.type === 'lent'));
  const pendingToPay = sumAmt(openItems.filter((i) => i.type === 'borrowed'));
  const overdueItems = openItems.filter((i) => i.dueDate && i.dueDate < todayIso);
  const overdueTotal = sumAmt(overdueItems);
  const netPosition = pendingToReceive - pendingToPay;

  // Categories: only categories that actually have spend; top 6 + "Others" when more than 7.
  const spent = (Array.isArray(input.categories) ? input.categories : [])
    .filter((c) => c && c.category)
    .map((c) => ({
      name: String(c.category),
      amount: safeNum(c.amount),
      count: safeNum(c.count),
      color: safeColor(c.color, P.slate),
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  const catTotal = spent.reduce((s, c) => s + c.amount, 0);
  const catCount = spent.reduce((s, c) => s + c.count, 0);
  let catRows = spent;
  if (spent.length > TABLE_ROWS) {
    const rest = spent.slice(TABLE_ROWS - 1);
    catRows = [
      ...spent.slice(0, TABLE_ROWS - 1),
      {
        name: `Others (${rest.length})`,
        amount: rest.reduce((s, c) => s + c.amount, 0),
        count: rest.reduce((s, c) => s + c.count, 0),
        color: P.slate,
      },
    ];
  }
  const catMax = Math.max(0, ...catRows.map((c) => c.amount));

  // Weekdays
  const dayRows = WEEKDAYS.map(([short, long]) => ({
    short,
    long,
    amount: safeNum(input.dailySpend?.[short]),
  }));
  const dayTotal = dayRows.reduce((s, d) => s + d.amount, 0);
  const dayMax = Math.max(0, ...dayRows.map((d) => d.amount));
  const peakDay = dayMax > 0 ? dayRows.find((d) => d.amount === dayMax) : undefined;

  // Recent activity (same ordering the app uses: date desc, then newest first)
  const recent = [...txs]
    .sort((a, b) => {
      const d = txDay(b).localeCompare(txDay(a));
      return d !== 0 ? d : safeNum(b.createdAt) - safeNum(a.createdAt);
    })
    .slice(0, TABLE_ROWS);

  // ── Spec registry ──────────────────────────────────────────────────────────
  const specs: Spec[] = [];
  const borders: BorderSpec[] = [];
  const lastRow = ROW_DEFS.length - 1;
  const lastCol = COL_PX.length - 1;

  const fill = (r1: number, c1: number, r2: number, c2: number, bg: string) =>
    specs.push({ r1, c1, r2, c2, value: null, fmt: { bg }, merge: false });
  const cell = (r: number, c1: number, c2: number, value: CellValue, fmt: Fmt) =>
    specs.push({ r1: r, c1, r2: r, c2, value, fmt, merge: c2 > c1 });
  const box = (r1: number, c1: number, r2: number, c2: number, color: string) =>
    borders.push({ r1, c1, r2, c2, color, top: true, bottom: true, left: true, right: true });
  const lineBelow = (r: number, c1: number, c2: number, color: string) =>
    borders.push({ r1: r, c1, r2: r, c2, color, bottom: true });
  const lineAbove = (r: number, c1: number, c2: number, color: string) =>
    borders.push({ r1: r, c1, r2: r, c2, color, top: true });

  // Page background
  fill(0, 0, lastRow, lastCol, P.page);

  // ── Header band ────────────────────────────────────────────────────────────
  const stamp =
    `${pad2(now.getDate())} ${MONTHS[now.getMonth()]} ${now.getFullYear()} · ` +
    `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  fill(ROW.hdrTitle, FULL[0], ROW.hdrPad, FULL[1], P.navy);
  cell(ROW.hdrTitle, LEFT[0], LEFT[1], 'SpendDesk', {
    bg: P.navy, color: P.white, size: 20, bold: true, padL: 18, v: 'BOTTOM',
  });
  cell(ROW.hdrSub, LEFT[0], LEFT[1], 'Personal Finance Dashboard', {
    bg: P.navy, color: P.navyText, size: 10, padL: 18, v: 'TOP',
  });
  cell(ROW.hdrTitle, RIGHT[0], RIGHT[1], 'LAST SYNCED', {
    bg: P.navy, color: P.navyText, size: 8, bold: true, h: 'RIGHT', padR: 18, v: 'BOTTOM',
  });
  cell(ROW.hdrSub, RIGHT[0], RIGHT[1], stamp, {
    bg: P.navy, color: P.white, size: 11, bold: true, h: 'RIGHT', padR: 18, v: 'TOP',
  });
  fill(ROW.hdrLine, FULL[0], ROW.hdrLine, FULL[1], P.brandBright);

  const sectionLabel = (row: number, text: string) => {
    cell(row, FULL[0], FULL[1], text, { bg: P.page, color: P.muted, size: 9, bold: true, v: 'BOTTOM' });
    lineBelow(row, FULL[0], FULL[1], P.border);
  };

  // ── KPI cards ──────────────────────────────────────────────────────────────
  interface Kpi {
    label: string;
    value: number;
    sub: string;
    accent: string;
    valueColor: string;
    subColor: string;
    hero?: boolean;
  }
  const bal = summary.currentCashBalance;
  const balanceStatus =
    bal < 0
      ? { text: 'Deficit — spending exceeds cash', color: P.bad }
      : bal === 0
        ? { text: 'No cash on hand', color: P.warn }
        : bal < LOW_CASH_LIMIT
          ? { text: 'Low cash', color: P.warn }
          : { text: 'Healthy', color: P.good };

  const kpiRow1: Kpi[] = [
    { label: 'Cash balance', value: bal, sub: balanceStatus.text, accent: P.brandBright, valueColor: P.brand, subColor: balanceStatus.color, hero: true },
    { label: 'Cash in', value: summary.cashAdded, sub: 'Total cash added', accent: '#10B981', valueColor: P.ink, subColor: P.faint },
    { label: 'Cash spent', value: summary.cashSpent, sub: 'Paid in cash', accent: '#E11D48', valueColor: summary.cashSpent > 0 ? P.bad : P.ink, subColor: P.faint },
    { label: 'Card & digital', value: summary.cardSpend, sub: 'Card and bank transfers', accent: P.blue, valueColor: P.ink, subColor: P.faint },
  ];
  const kpiRow2: Kpi[] = [
    { label: 'Total spend', value: summary.totalSpend, sub: 'Cash + card & digital', accent: '#475569', valueColor: P.ink, subColor: P.faint },
    {
      label: 'Out of wallet',
      value: summary.outOfWallet,
      sub: summary.outOfWallet > 0 ? 'Spent beyond cash on hand' : 'Nothing beyond cash on hand',
      accent: '#D97706',
      valueColor: summary.outOfWallet > 0 ? P.warn : P.ink,
      subColor: summary.outOfWallet > 0 ? P.warn : P.faint,
    },
    {
      label: "Today's spend",
      value: todaySpend,
      sub: todayTxs.length > 0 ? plural(todayTxs.length, 'transaction', 'transactions') : 'No spending yet today',
      accent: '#7C3AED',
      valueColor: P.ink,
      subColor: P.faint,
    },
    {
      label: "This month's spend",
      value: monthSpend,
      sub: `${MONTHS_LONG[now.getMonth()]} ${now.getFullYear()}`,
      accent: '#0D9488',
      valueColor: P.ink,
      subColor: P.faint,
    },
  ];

  const drawKpi = (accRow: number, cols: [number, number], k: Kpi) => {
    const [c1, c2] = cols;
    const bg = k.hero ? P.brandTint : P.card;
    cell(accRow, c1, c2, null, { bg: k.accent });
    cell(accRow + 1, c1, c2, k.label.toUpperCase(), { bg, color: P.muted, size: 8, bold: true, padL: 14, v: 'BOTTOM' });
    cell(accRow + 2, c1, c2, k.value, {
      bg, color: k.valueColor, size: 22, bold: true, num: RS, numKind: 'CURRENCY', padL: 14, v: 'MIDDLE',
    });
    cell(accRow + 3, c1, c2, k.sub, { bg, color: k.subColor, size: 9, padL: 14, v: 'TOP' });
    box(accRow, c1, accRow + 3, c2, k.hero ? P.brandBorder : P.border);
  };

  sectionLabel(ROW.secOverview, 'OVERVIEW');
  kpiRow1.forEach((k, i) => drawKpi(ROW.k1Acc, CARDS[i], k));
  kpiRow2.forEach((k, i) => drawKpi(ROW.k2Acc, CARDS[i], k));

  // ── Panel helpers ──────────────────────────────────────────────────────────
  const panelTitle = (row: number, half: [number, number], title: string, hint: string) => {
    const [c1, c2] = half;
    cell(row, c1, c1 + 3, title, { bg: P.card, color: P.ink, size: 11, bold: true, padL: 14 });
    cell(row, c1 + 4, c2, hint, { bg: P.card, color: P.faint, size: 8, h: 'RIGHT', padR: 14 });
  };
  const headCell = (row: number, c1: number, c2: number, text: string, h: HAlign, padL = 0, padR = 0) =>
    cell(row, c1, c2, text, { bg: P.headBg, color: P.muted, size: 8, bold: true, h, padL, padR });
  const dataFmt = (extra: Partial<Fmt> = {}): Fmt => ({ bg: P.card, color: P.ink, size: 10, ...extra });

  // ── Spending analysis ──────────────────────────────────────────────────────
  sectionLabel(ROW.secAnalysis, 'SPENDING ANALYSIS');

  // Left: by category (B:C name | D:E amount | F share | G:H bar)
  fill(ROW.p1Title, LEFT[0], ROW.p1Total, LEFT[1], P.card);
  panelTitle(ROW.p1Title, LEFT, 'Spending by Category', 'Share of total spend');
  headCell(ROW.p1Head, 1, 2, 'CATEGORY', 'LEFT', 14);
  headCell(ROW.p1Head, 3, 4, 'AMOUNT', 'RIGHT');
  headCell(ROW.p1Head, 5, 5, 'SHARE', 'RIGHT');
  headCell(ROW.p1Head, 6, 7, 'DISTRIBUTION', 'LEFT', 14);
  lineBelow(ROW.p1Head, LEFT[0], LEFT[1], P.border);
  for (let i = 0; i < TABLE_ROWS; i++) {
    const row = ROW.p1r0 + i;
    const item = catRows[i];
    if (item) {
      cell(row, 1, 2, item.name, dataFmt({ padL: 14 }));
      cell(row, 3, 4, item.amount, dataFmt({ h: 'RIGHT', num: RS, numKind: 'CURRENCY' }));
      cell(row, 5, 5, catTotal > 0 ? item.amount / catTotal : 0, dataFmt({ h: 'RIGHT', color: P.muted, num: PCT, numKind: 'PERCENT' }));
      cell(row, 6, 7, sparkBar(item.amount, catMax, item.color), dataFmt({ padL: 14 }));
    } else if (i === 0) {
      cell(row, 1, 4, 'No spending recorded yet', dataFmt({ padL: 14, color: P.faint, italic: true }));
    }
    lineBelow(row, LEFT[0], LEFT[1], P.divider);
  }
  fill(ROW.p1Total, LEFT[0], ROW.p1Total, LEFT[1], P.headBg);
  const catTotalBg = { bg: P.headBg, size: 10, bold: true, color: P.ink };
  cell(ROW.p1Total, 1, 2, catCount > 0 ? `Total · ${plural(catCount, 'txn', 'txns')}` : 'Total', { ...catTotalBg, padL: 14 });
  cell(ROW.p1Total, 3, 4, catTotal, { ...catTotalBg, h: 'RIGHT', num: RS, numKind: 'CURRENCY' });
  cell(ROW.p1Total, 5, 5, catTotal > 0 ? 1 : 0, { ...catTotalBg, h: 'RIGHT', color: P.muted, num: PCT, numKind: 'PERCENT' });
  lineAbove(ROW.p1Total, LEFT[0], LEFT[1], P.border);
  box(ROW.p1Title, LEFT[0], ROW.p1Total, LEFT[1], P.border);

  // Right: by weekday (J:K day | L:M amount | N share | O:P bar)
  fill(ROW.p1Title, RIGHT[0], ROW.p1Total, RIGHT[1], P.card);
  panelTitle(ROW.p1Title, RIGHT, 'Spending by Weekday', 'All-time, by day of week');
  headCell(ROW.p1Head, 9, 10, 'DAY', 'LEFT', 14);
  headCell(ROW.p1Head, 11, 12, 'AMOUNT', 'RIGHT');
  headCell(ROW.p1Head, 13, 13, 'SHARE', 'RIGHT');
  headCell(ROW.p1Head, 14, 15, 'TREND', 'LEFT', 14);
  lineBelow(ROW.p1Head, RIGHT[0], RIGHT[1], P.border);
  dayRows.forEach((d, i) => {
    const row = ROW.p1r0 + i;
    const isPeak = peakDay !== undefined && d.short === peakDay.short;
    cell(row, 9, 10, d.long, dataFmt({ padL: 14, bold: isPeak }));
    cell(row, 11, 12, d.amount, dataFmt({
      h: 'RIGHT', num: RS, numKind: 'CURRENCY', bold: isPeak, color: d.amount > 0 ? P.ink : P.faint,
    }));
    cell(row, 13, 13, dayTotal > 0 ? d.amount / dayTotal : 0, dataFmt({ h: 'RIGHT', color: P.muted, num: PCT, numKind: 'PERCENT' }));
    cell(row, 14, 15, d.amount > 0 ? sparkBar(d.amount, dayMax, isPeak ? P.blue : P.blueSoft) : null, dataFmt({ padL: 14 }));
    lineBelow(row, RIGHT[0], RIGHT[1], P.divider);
  });
  fill(ROW.p1Total, RIGHT[0], ROW.p1Total, RIGHT[1], P.headBg);
  const dayTotalBg = { bg: P.headBg, size: 10, bold: true, color: P.ink };
  cell(ROW.p1Total, 9, 10, peakDay ? `Total · peak ${peakDay.short}` : 'Total', { ...dayTotalBg, padL: 14 });
  cell(ROW.p1Total, 11, 12, dayTotal, { ...dayTotalBg, h: 'RIGHT', num: RS, numKind: 'CURRENCY' });
  cell(ROW.p1Total, 13, 13, dayTotal > 0 ? 1 : 0, { ...dayTotalBg, h: 'RIGHT', color: P.muted, num: PCT, numKind: 'PERCENT' });
  lineAbove(ROW.p1Total, RIGHT[0], RIGHT[1], P.border);
  box(ROW.p1Title, RIGHT[0], ROW.p1Total, RIGHT[1], P.border);

  // ── Lending & recent activity ──────────────────────────────────────────────
  sectionLabel(ROW.secLedger, 'LENDING & RECENT ACTIVITY');

  // Left: lend & borrow (B:E metric | F:H amount)
  fill(ROW.p2Title, LEFT[0], ROW.p2Foot, LEFT[1], P.card);
  panelTitle(ROW.p2Title, LEFT, 'Lend & Borrow', 'Money lent and borrowed');
  headCell(ROW.p2Head, 1, 4, 'METRIC', 'LEFT', 14);
  headCell(ROW.p2Head, 5, 7, 'AMOUNT', 'RIGHT', 0, 14);
  lineBelow(ROW.p2Head, LEFT[0], LEFT[1], P.border);
  const lendRows: { label: string; value: number; color: string; kind?: 'signed' | 'count'; strong?: boolean }[] = [
    { label: 'Total lent', value: totalLent, color: P.ink },
    { label: 'Total borrowed', value: totalBorrowed, color: P.ink },
    { label: 'Pending to receive', value: pendingToReceive, color: pendingToReceive > 0 ? P.warn : P.faint },
    { label: 'Pending to pay', value: pendingToPay, color: pendingToPay > 0 ? P.warn : P.faint },
    { label: 'Overdue', value: overdueTotal, color: overdueTotal > 0 ? P.bad : P.faint },
    { label: 'Net position (pending)', value: netPosition, color: netPosition > 0 ? P.good : netPosition < 0 ? P.bad : P.ink, kind: 'signed', strong: true },
    { label: 'Open items', value: openItems.length, color: P.ink, kind: 'count' },
  ];
  lendRows.forEach((m, i) => {
    const row = ROW.p2r0 + i;
    const bg = m.strong ? P.headBg : P.card;
    cell(row, 1, 4, m.label, { bg, color: P.ink, size: 10, bold: !!m.strong, padL: 14 });
    cell(row, 5, 7, m.value, {
      bg, color: m.color, size: 10, bold: !!m.strong, h: 'RIGHT', padR: 14,
      num: m.kind === 'count' ? '0' : m.kind === 'signed' ? RS_SIGNED : RS,
      numKind: m.kind === 'count' ? 'NUMBER' : 'CURRENCY',
    });
    lineBelow(row, LEFT[0], LEFT[1], P.divider);
  });
  const lendFoot =
    lends.length === 0
      ? { text: 'No lend or borrow records yet', color: P.faint }
      : openItems.length === 0
        ? { text: 'All settled — nothing pending', color: P.good }
        : {
            text: `${plural(openItems.length, 'open item', 'open items')} · ${overdueItems.length} overdue`,
            color: overdueItems.length > 0 ? P.bad : P.muted,
          };
  cell(ROW.p2Foot, 1, 7, lendFoot.text, { bg: P.headBg, color: lendFoot.color, size: 9, bold: true, padL: 14 });
  lineAbove(ROW.p2Foot, LEFT[0], LEFT[1], P.border);
  box(ROW.p2Title, LEFT[0], ROW.p2Foot, LEFT[1], P.border);

  // Right: recent activity (J date | K:L category | M:N method | O:P amount)
  fill(ROW.p2Title, RIGHT[0], ROW.p2Foot, RIGHT[1], P.card);
  panelTitle(ROW.p2Title, RIGHT, 'Recent Activity', 'Latest transactions');
  headCell(ROW.p2Head, 9, 9, 'DATE', 'LEFT', 14);
  headCell(ROW.p2Head, 10, 11, 'CATEGORY', 'LEFT');
  headCell(ROW.p2Head, 12, 13, 'METHOD', 'LEFT');
  headCell(ROW.p2Head, 14, 15, 'AMOUNT', 'RIGHT', 0, 14);
  lineBelow(ROW.p2Head, RIGHT[0], RIGHT[1], P.border);
  for (let i = 0; i < TABLE_ROWS; i++) {
    const row = ROW.p2r0 + i;
    const t = recent[i];
    if (t) {
      const income = t.type === 'cash_added';
      cell(row, 9, 9, shortDate(txDay(t), currentYear), dataFmt({ padL: 14, color: P.muted }));
      cell(row, 10, 11, t.category || 'General', dataFmt());
      cell(row, 12, 13, t.paymentMethod || (t.type === 'card_expense' ? 'Card' : 'Cash'), dataFmt({ color: P.muted }));
      cell(row, 14, 15, income ? safeNum(t.amount) : -safeNum(t.amount), dataFmt({
        h: 'RIGHT', padR: 14, bold: true, color: income ? P.good : P.bad, num: RS_SIGNED, numKind: 'CURRENCY',
      }));
    } else if (i === 0) {
      cell(row, 9, 13, 'No transactions yet', dataFmt({ padL: 14, color: P.faint, italic: true }));
    }
    lineBelow(row, RIGHT[0], RIGHT[1], P.divider);
  }
  cell(
    ROW.p2Foot, 9, 15,
    txs.length > 0 ? `Showing latest ${recent.length} of ${txs.length}` : 'Add a transaction in the app to see it here',
    { bg: P.headBg, color: P.muted, size: 9, bold: true, padL: 14 },
  );
  lineAbove(ROW.p2Foot, RIGHT[0], RIGHT[1], P.border);
  box(ROW.p2Title, RIGHT[0], ROW.p2Foot, RIGHT[1], P.border);

  // ── Footnote ───────────────────────────────────────────────────────────────
  cell(ROW.note, FULL[0], FULL[1], 'Auto-generated by SpendDesk. This tab is rebuilt on every sync — edit data in the Transactions tab, not here.', {
    bg: P.page, color: P.faint, size: 8, h: 'CENTER', v: 'MIDDLE',
  });

  // ── Output ─────────────────────────────────────────────────────────────────
  const rowCount = ROW_DEFS.length;
  const columnCount = COL_PX.length;
  const values: CellValue[][] = Array.from({ length: rowCount }, () => Array<CellValue>(columnCount).fill(null));
  specs.forEach((s) => {
    if (s.value !== null) values[s.r1][s.c1] = s.value;
  });

  const range = (sheetId: number, s: { r1: number; c1: number; r2: number; c2: number }) => ({
    sheetId,
    startRowIndex: s.r1,
    endRowIndex: s.r2 + 1,
    startColumnIndex: s.c1,
    endColumnIndex: s.c2 + 1,
  });

  const cellFormat = (f: Fmt) => {
    const uf: any = {
      backgroundColor: rgb(f.bg),
      textFormat: {
        foregroundColor: rgb(f.color ?? P.ink),
        fontFamily: FONT,
        fontSize: f.size ?? 10,
        bold: !!f.bold,
        italic: !!f.italic,
      },
      horizontalAlignment: f.h ?? 'LEFT',
      verticalAlignment: f.v ?? 'MIDDLE',
      wrapStrategy: 'CLIP',
      padding: { top: 0, bottom: 0, left: f.padL ?? 0, right: f.padR ?? 0 },
    };
    if (f.num) uf.numberFormat = { type: f.numKind ?? 'NUMBER', pattern: f.num };
    return { userEnteredFormat: uf };
  };
  const FORMAT_FIELDS =
    'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy,padding,numberFormat)';

  const toCellData = (v: CellValue) => {
    if (v === null) return {};
    if (typeof v === 'number') return { userEnteredValue: { numberValue: v } };
    if (typeof v === 'string') return { userEnteredValue: { stringValue: v } };
    return { userEnteredValue: { formulaValue: v.formula } };
  };

  const buildRequests = (sheetId: number, current: { rowCount: number; columnCount: number }): any[] => {
    const requests: any[] = [];
    const curRows = Math.max(1, current.rowCount);
    const curCols = Math.max(1, current.columnCount);
    const everything = { sheetId, startRowIndex: 0, endRowIndex: curRows, startColumnIndex: 0, endColumnIndex: curCols };

    // 1. Wipe the tab: old merges first, then every value and format.
    requests.push({ unmergeCells: { range: everything } });
    requests.push({ repeatCell: { range: everything, cell: {}, fields: 'userEnteredValue,userEnteredFormat' } });

    // 2. Grid size, gridlines off, tab colour.
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          tabColorStyle: { rgbColor: rgb(P.brandBright) },
          gridProperties: { hideGridlines: true, rowCount, columnCount },
        },
        fields: 'tabColorStyle,gridProperties(hideGridlines,rowCount,columnCount)',
      },
    });

    // 3. Row heights / column widths.
    ROW_DEFS.forEach(([, px], i) => {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 },
          properties: { pixelSize: px },
          fields: 'pixelSize',
        },
      });
    });
    COL_PX.forEach((px, i) => {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
          properties: { pixelSize: px },
          fields: 'pixelSize',
        },
      });
    });

    // 4. Values (typed, never parsed from text).
    requests.push({
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: values.map((row) => ({ values: row.map(toCellData) })),
        fields: 'userEnteredValue',
      },
    });

    // 5. Merges, then formats in declaration order (later specs win), then borders.
    specs.filter((s) => s.merge).forEach((s) => {
      requests.push({ mergeCells: { range: range(sheetId, s), mergeType: 'MERGE_ALL' } });
    });
    specs.forEach((s) => {
      requests.push({
        repeatCell: { range: range(sheetId, s), cell: cellFormat(s.fmt), fields: FORMAT_FIELDS },
      });
    });
    borders.forEach((b) => {
      const edge = { style: 'SOLID', color: rgb(b.color) };
      const req: any = { range: range(sheetId, b) };
      if (b.top) req.top = edge;
      if (b.bottom) req.bottom = edge;
      if (b.left) req.left = edge;
      if (b.right) req.right = edge;
      requests.push({ updateBorders: req });
    });

    return requests;
  };

  return { rowCount, columnCount, values, buildRequests };
};
