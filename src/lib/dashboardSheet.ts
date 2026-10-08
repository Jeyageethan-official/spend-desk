/**
 * Dashboard tab for the connected Google Sheet.
 *
 * Everything on the tab (the values AND the formatting) is generated from ONE
 * coordinate-based layout, so the two can never drift apart. `buildDashboardLayout`
 * is a pure function (no network, no DOM): it returns the Sheets API
 * `batchUpdate` requests that rebuild the whole tab in a single atomic call.
 *
 * Grid (columns):  A margin | 6× (card + gutter) | margin
 *   - six KPI cards in ONE row = 2 columns each
 *   - two half-width panels   = B–I (left) and K–R (right)
 *
 * Values are written as typed values (stringValue / numberValue / formulaValue),
 * never parsed from text, so user data such as a category named "=SUM(1)" stays text.
 */
import type { SpendingSummary, CategorySummary, Transaction, LendItem } from '../types/finance';
import {
  calculateCategoryBreakdown,
  calculateSummary,
  calculateWeeklyDailyTrend,
  getLocalDateString,
  getPresetRange,
} from './calculations';

// ─── Types ───────────────────────────────────────────────────────────────────

type HAlign = 'LEFT' | 'CENTER' | 'RIGHT';
type VAlign = 'TOP' | 'MIDDLE' | 'BOTTOM';
type NumKind = 'NUMBER' | 'CURRENCY' | 'PERCENT' | 'DATE';
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

export type DashboardPeriod = 'All time' | 'Today' | 'This week' | 'This month' | 'Custom';

export interface DashboardFilterState {
  period: DashboardPeriod;
  startDate: string;
  endDate: string;
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
  /** Date filter controls shown on the Dashboard header (persisted across syncs). */
  filter?: DashboardFilterState;
}

export interface DashboardLayout {
  rowCount: number;
  columnCount: number;
  /** Cell values by [row][col]; only merge anchors / single cells are non-null. */
  values: CellValue[][];
  /** Full ordered batchUpdate request list that rebuilds the tab. */
  buildRequests: (sheetId: number, current: { rowCount: number; columnCount: number }) => any[];
  /** Phased requests so resize/wipe never share a batch with formats (Sheets is picky). */
  buildRequestPhases: (sheetId: number, current: { rowCount: number; columnCount: number }) => any[][];
}

export const DASHBOARD_PERIODS: DashboardPeriod[] = [
  'All time',
  'Today',
  'This week',
  'This month',
  'Custom',
];

/** A1 helpers for reading/writing the filter bar before a rebuild. */
export const getDashboardFilterCells = () => {
  return {
    period: 'C7',
    from: 'F7',
    to: 'H7',
    range: 'C7:I7',
  };
};

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
  filterBg: '#FFFFFF',
  /** SpendDesk ocean — matches Transactions sheet body/date text */
  ocean: '#005975',
  oceanTint: '#E8F4F8',
  oceanBorder: '#B8D4DE',
} as const;

const FONT = 'Roboto';
const RS = '"Rs "#,##0';
const RS_SIGNED = '"+ Rs "#,##0;"- Rs "#,##0;"Rs "0';
const PCT = '0.0%';
const LOW_CASH_LIMIT = 1500; // same threshold the in-app wallet card uses

// ─── Column / row geometry ───────────────────────────────────────────────────
// Six KPI cards in one row, stretched for a near full-screen Sheets viewport.

const COL_PX = [
  14, // A margin
  118, 118, // B-C card 1
  12, // D gutter
  118, 118, // E-F card 2
  12, // G gutter
  118, 118, // H-I card 3
  12, // J gutter
  118, 118, // K-L card 4
  12, // M gutter
  118, 118, // N-O card 5
  12, // P gutter
  118, 118, // Q-R card 6
  14, // S margin
];
const LEFT: [number, number] = [1, 8];
const RIGHT: [number, number] = [10, 17];
const FULL: [number, number] = [1, 17];
const CARDS: [number, number][] = [
  [1, 2],
  [4, 5],
  [7, 8],
  [10, 11],
  [13, 14],
  [16, 17],
];
const TABLE_ROWS = 7;

export const getDashboardRowDefs = (catRowCount: number = 7): { rowDefs: [string, number][]; rowMap: Record<string, number> } => {
  const rowDefs: [string, number][] = [
    ['top', 10],
    ['hdrTitle', 34],
    ['hdrSub', 22],
    ['hdrPad', 8],
    ['hdrLine', 3],
    ['gap0', 10],
    ['filter', 36],
    ['gap1', 14],
    ['secOverview', 22],
    ['gap2', 10],
    ['k1Acc', 4],
    ['k1Label', 24],
    ['k1Value', 44],
    ['k1Sub', 24],
    ['gap3', 20],
    ['secAnalysis', 22],
    ['gap4', 10],
    ['p1Title', 34],
    ['p1Head', 26],
    ...Array.from({ length: catRowCount }, (_, i): [string, number] => [`p1r${i}`, 30]),
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
  const rowMap: Record<string, number> = {};
  rowDefs.forEach(([name], i) => {
    rowMap[name] = i;
  });
  return { rowDefs, rowMap };
};

const DEFAULT_GRID_CONFIG = getDashboardRowDefs(7);
export const ROW_DEFS: [string, number][] = DEFAULT_GRID_CONFIG.rowDefs;
export const ROW: Record<string, number> = DEFAULT_GRID_CONFIG.rowMap;

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
const WEEKDAYS: [string, string][] = [
  ['Mon', 'Monday'],
  ['Tue', 'Tuesday'],
  ['Wed', 'Wednesday'],
  ['Thu', 'Thursday'],
  ['Fri', 'Friday'],
  ['Sat', 'Saturday'],
  ['Sun', 'Sunday'],
];

const PERIOD_TO_PRESET: Record<DashboardPeriod, string> = {
  'All time': 'all',
  Today: 'today',
  'This week': 'week',
  'This month': 'month',
  Custom: 'custom',
};

export const normalizeDashboardPeriod = (raw: unknown): DashboardPeriod => {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'today') return 'Today';
  if (s === 'this week' || s === 'week') return 'This week';
  if (s === 'this month' || s === 'month') return 'This month';
  if (s === 'custom') return 'Custom';
  if (s === 'all time' || s === 'all' || s === '') return 'All time';
  if (DASHBOARD_PERIODS.includes(raw as DashboardPeriod)) return raw as DashboardPeriod;
  return 'All time';
};

/** Parse a Sheets cell (serial number, Date, or YYYY-MM-DD / formatted text) to ISO date. */
export const parseSheetDateCell = (raw: unknown, fallback = ''): string => {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // 0 / negative is not a real date (empty DATE-formatted cells often round-trip as 0).
    if (raw <= 0) return fallback;
    // Google Sheets serial date (days since 1899-12-30), local calendar day.
    const epoch = new Date(1899, 11, 30);
    epoch.setDate(epoch.getDate() + Math.floor(raw));
    return getLocalDateString(epoch);
  }
  const s = String(raw).trim();
  if (!s || s === '0' || s === '—' || s === '-') return fallback;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mdy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (mdy) {
    const a = parseInt(mdy[1], 10);
    const b = parseInt(mdy[2], 10);
    const y = parseInt(mdy[3], 10);
    // Prefer D/M/Y when first part > 12, else assume D/M/Y (India) when ambiguous.
    const day = a > 12 ? a : b > 12 ? b : a;
    const month = a > 12 ? b : b > 12 ? a : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${pad2(month)}-${pad2(day)}`;
    }
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return getLocalDateString(parsed);
  return fallback;
};

export const resolveDashboardFilter = (
  filter: DashboardFilterState | undefined,
  now: Date = new Date()
): { period: DashboardPeriod; startDate: string; endDate: string; label: string } => {
  const period = normalizeDashboardPeriod(filter?.period);
  if (period === 'Custom') {
    const startDate = parseSheetDateCell(filter?.startDate, '');
    const endDate = parseSheetDateCell(filter?.endDate, '');
    const label =
      startDate || endDate
        ? `Custom · ${startDate || '…'} → ${endDate || '…'}`
        : 'Custom · pick From / To dates';
    return { period, startDate, endDate, label };
  }
  const preset = getPresetRange(PERIOD_TO_PRESET[period], now) ?? { startDate: '', endDate: '' };
  const label =
    period === 'All time'
      ? 'All time'
      : `${period} · ${preset.startDate || '…'} → ${preset.endDate || '…'}`;
  return { period, startDate: preset.startDate, endDate: preset.endDate, label };
};

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

const isoToSheetSerial = (iso: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  const epoch = new Date(1899, 11, 30);
  return Math.round((d.getTime() - epoch.getTime()) / 86400000);
};

// ─── Layout builder ──────────────────────────────────────────────────────────

export const buildDashboardLayout = (input: DashboardInput): DashboardLayout => {
  const now = input.now ?? new Date();
  const todayIso = localIso(now);
  const currentYear = now.getFullYear();
  const txsAll = Array.isArray(input.transactions) ? input.transactions.filter(Boolean) : [];
  const lends = Array.isArray(input.lendItems) ? input.lendItems.filter(Boolean) : [];

  const resolved = resolveDashboardFilter(input.filter, now);
  const txs =
    resolved.startDate || resolved.endDate
      ? txsAll.filter((t) => {
          const d = t.date || (t.createdAt ? localIso(new Date(t.createdAt)) : '');
          if (!d) return false;
          if (resolved.startDate && d < resolved.startDate) return false;
          if (resolved.endDate && d > resolved.endDate) return false;
          return true;
        })
      : txsAll;

  // Wallet balance always all-time; spend KPIs / panels follow the date filter.
  const allSummary = calculateSummary(txsAll, txsAll);
  const filteredSummary = calculateSummary(txsAll, txs);
  const summary: SpendingSummary = {
    currentCashBalance: safeNum(allSummary.currentCashBalance ?? input.summary?.currentCashBalance),
    cashAdded: safeNum(filteredSummary.cashAdded),
    cashSpent: safeNum(filteredSummary.cashSpent),
    cardSpend: safeNum(filteredSummary.cardSpend),
    totalSpend: safeNum(filteredSummary.totalSpend),
    outOfWallet: safeNum(filteredSummary.outOfWallet),
  };
  const categories = calculateCategoryBreakdown(txs);
  const { dayTotals } = calculateWeeklyDailyTrend(txs);

  // ── Derived numbers ────────────────────────────────────────────────────────
  const txDay = (t: Transaction) =>
    t.date || (t.createdAt ? localIso(new Date(t.createdAt)) : '');

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
  const spent = (Array.isArray(categories) ? categories : [])
    .filter((c) => c && c.category)
    .map((c) => ({
      name: String(c.category),
      amount: safeNum(c.amount),
      count: safeNum(c.count),
      color: safeColor(c.color, P.slate),
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  
  let allCatsToShow = spent;
  if (allCatsToShow.length === 0 && Array.isArray(categories) && categories.length > 0) {
    allCatsToShow = categories.map((c) => ({
      name: String(c.category),
      amount: safeNum(c.amount),
      count: safeNum(c.count),
      color: safeColor(c.color, P.slate),
    }));
  }

  // All categories must be shown directly in Spending by Category without grouping into Others
  const catRows = allCatsToShow;
  const catRowCount = Math.max(TABLE_ROWS, catRows.length);
  const { rowDefs: activeRowDefs, rowMap: ROW } = getDashboardRowDefs(catRowCount);
  const catTotal = spent.reduce((s, c) => s + c.amount, 0);
  const catCount = spent.reduce((s, c) => s + c.count, 0);
  const catMax = Math.max(0, ...catRows.map((c) => c.amount));

  // Weekdays
  const dayRows = WEEKDAYS.map(([short, long]) => ({
    short,
    long,
    amount: safeNum(dayTotals?.[short] ?? input.dailySpend?.[short]),
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
  const lastRow = activeRowDefs.length - 1;
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

  // ── Filter bar ─────────────────────────────────────────────────────────────
  fill(ROW.filter, FULL[0], ROW.filter, FULL[1], P.filterBg);
  cell(ROW.filter, 1, 1, 'PERIOD', {
    bg: P.filterBg, color: P.muted, size: 8, bold: true, padL: 12, v: 'MIDDLE',
  });
  cell(ROW.filter, 2, 3, resolved.period, {
    bg: P.oceanTint, color: P.ocean, size: 11, bold: true, padL: 10, v: 'MIDDLE',
  });
  cell(ROW.filter, 4, 4, 'FROM', {
    bg: P.filterBg, color: P.muted, size: 8, bold: true, h: 'RIGHT', padR: 6, v: 'MIDDLE',
  });
  const fromVal: CellValue =
    resolved.period === 'Custom' && resolved.startDate
      ? (isoToSheetSerial(resolved.startDate) ?? '')
      : {
          formula:
            '=IF(C7="All time","",IF(C7="Today",TODAY(),IF(C7="This week",TODAY()-WEEKDAY(TODAY(),2)+1,IF(C7="This month",DATE(YEAR(TODAY()),MONTH(TODAY()),1),DATE(YEAR(TODAY()),MONTH(TODAY()),1)))))',
        };

  cell(ROW.filter, 5, 5, fromVal, {
    bg: P.oceanTint, color: P.ocean, size: 11, bold: true, h: 'CENTER', v: 'MIDDLE',
    num: 'yyyy-mm-dd', numKind: 'DATE',
  });

  cell(ROW.filter, 6, 6, 'TO', {
    bg: P.filterBg, color: P.muted, size: 8, bold: true, h: 'RIGHT', padR: 6, v: 'MIDDLE',
  });

  const toVal: CellValue =
    resolved.period === 'Custom' && resolved.endDate
      ? (isoToSheetSerial(resolved.endDate) ?? '')
      : {
          formula: '=IF(C7="All time","",TODAY())',
        };

  cell(ROW.filter, 7, 8, toVal, {
    bg: P.oceanTint, color: P.ocean, size: 11, bold: true, h: 'CENTER', v: 'MIDDLE',
    num: 'yyyy-mm-dd', numKind: 'DATE',
  });

  cell(ROW.filter, 10, 17, 'Live Auto-Refresh · Select Period (Today / This week / This month / All time)', {
    bg: P.filterBg, color: P.faint, size: 9, h: 'RIGHT', padR: 14, v: 'MIDDLE', italic: true,
  });
  box(ROW.filter, FULL[0], ROW.filter, FULL[1], P.oceanBorder);

  const sectionLabel = (row: number, text: string) => {
    cell(row, FULL[0], FULL[1], text, { bg: P.page, color: P.muted, size: 9, bold: true, v: 'BOTTOM' });
    lineBelow(row, FULL[0], FULL[1], P.border);
  };

  // ── KPI cards (dynamic live formulas connected to Transactions) ───────────
  interface Kpi {
    label: string;
    value: CellValue;
    sub: CellValue;
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

  const kpiRow: Kpi[] = [
    {
      label: 'Cash balance',
      value: { formula: '=SUMIF(Transactions!C:C, "IN", Transactions!E:E) - SUMIFS(Transactions!E:E, Transactions!C:C, "OUT", Transactions!G:G, "Cash")' },
      sub: { formula: '=IF(B13<0, "Deficit — spending exceeds cash", IF(B13=0, "No cash on hand", IF(B13<1500, "Low cash", "Healthy")))' },
      accent: P.brandBright,
      valueColor: P.brand,
      subColor: balanceStatus.color,
      hero: true,
    },
    {
      label: 'Cash in',
      value: { formula: '=IF(OR(C7="All time", F7=""), SUMIF(Transactions!C:C, "IN", Transactions!E:E), SUMIFS(Transactions!E:E, Transactions!C:C, "IN", Transactions!A:A, ">="&F7, Transactions!A:A, "<="&H7))' },
      sub: { formula: '=IF(C7="All time", "All time", C7)' },
      accent: '#10B981',
      valueColor: P.ink,
      subColor: P.faint,
    },
    {
      label: 'Cash spent',
      value: { formula: '=IF(OR(C7="All time", F7=""), SUMIFS(Transactions!E:E, Transactions!C:C, "OUT", Transactions!G:G, "Cash"), SUMIFS(Transactions!E:E, Transactions!C:C, "OUT", Transactions!G:G, "Cash", Transactions!A:A, ">="&F7, Transactions!A:A, "<="&H7))' },
      sub: { formula: '=IF(C7="All time", "All time", C7)' },
      accent: '#E11D48',
      valueColor: P.bad,
      subColor: P.faint,
    },
    {
      label: 'Card & digital',
      value: { formula: '=IF(OR(C7="All time", F7=""), SUMIFS(Transactions!E:E, Transactions!C:C, "OUT", Transactions!G:G, "<>Cash"), SUMIFS(Transactions!E:E, Transactions!C:C, "OUT", Transactions!G:G, "<>Cash", Transactions!A:A, ">="&F7, Transactions!A:A, "<="&H7))' },
      sub: { formula: '=IF(C7="All time", "All time", C7)' },
      accent: P.blue,
      valueColor: P.ink,
      subColor: P.faint,
    },
    {
      label: 'Total spend',
      value: { formula: '=IF(OR(C7="All time", F7=""), SUMIF(Transactions!C:C, "OUT", Transactions!E:E), SUMIFS(Transactions!E:E, Transactions!C:C, "OUT", Transactions!A:A, ">="&F7, Transactions!A:A, "<="&H7))' },
      sub: 'Cash + card & digital',
      accent: '#475569',
      valueColor: P.ink,
      subColor: P.faint,
    },
    {
      label: 'Out of wallet',
      value: { formula: '=IF(B13<0, ABS(B13), 0)' },
      sub: { formula: '=IF(B13<0, "Spent beyond cash on hand", "Nothing beyond cash on hand")' },
      accent: '#D97706',
      valueColor: summary.outOfWallet > 0 ? P.warn : P.ink,
      subColor: summary.outOfWallet > 0 ? P.warn : P.faint,
    },
  ];

  const drawKpi = (accRow: number, cols: [number, number], k: Kpi) => {
    const [c1, c2] = cols;
    const bg = k.hero ? P.brandTint : P.card;
    cell(accRow, c1, c2, null, { bg: k.accent });
    cell(accRow + 1, c1, c2, k.label.toUpperCase(), { bg, color: P.muted, size: 8, bold: true, padL: 12, v: 'BOTTOM' });
    cell(accRow + 2, c1, c2, k.value, {
      bg, color: k.valueColor, size: 20, bold: true, num: RS, numKind: 'CURRENCY', padL: 12, v: 'MIDDLE',
    });
    cell(accRow + 3, c1, c2, k.sub, { bg, color: k.subColor, size: 8, padL: 12, v: 'TOP' });
    box(accRow, c1, accRow + 3, c2, k.hero ? P.brandBorder : P.border);
  };

  sectionLabel(ROW.secOverview, 'OVERVIEW');
  kpiRow.forEach((k, i) => drawKpi(ROW.k1Acc, CARDS[i], k));

  // ── Panel helpers ──────────────────────────────────────────────────────────
  const panelTitle = (row: number, half: [number, number], title: string, hint: string) => {
    const [c1, c2] = half;
    const mid = c1 + Math.floor((c2 - c1) / 2);
    cell(row, c1, mid, title, { bg: P.card, color: P.ink, size: 11, bold: true, padL: 14 });
    cell(row, mid + 1, c2, hint, { bg: P.card, color: P.faint, size: 8, h: 'RIGHT', padR: 14 });
  };
  const headCell = (row: number, c1: number, c2: number, text: string, h: HAlign, padL = 0, padR = 0) =>
    cell(row, c1, c2, text, { bg: P.headBg, color: P.muted, size: 8, bold: true, h, padL, padR });
  const dataFmt = (extra: Partial<Fmt> = {}): Fmt => ({ bg: P.card, color: P.ink, size: 10, ...extra });

  // ── Spending analysis ──────────────────────────────────────────────────────
  sectionLabel(ROW.secAnalysis, 'SPENDING ANALYSIS');

  // Left: by category
  fill(ROW.p1Title, LEFT[0], ROW.p1Total, LEFT[1], P.card);
  panelTitle(ROW.p1Title, LEFT, 'Spending by Category', 'Share of filtered spend');
  headCell(ROW.p1Head, 1, 2, 'CATEGORY', 'LEFT', 14);
  headCell(ROW.p1Head, 3, 4, 'AMOUNT', 'RIGHT');
  headCell(ROW.p1Head, 5, 5, 'SHARE', 'RIGHT');
  headCell(ROW.p1Head, 6, 8, 'DISTRIBUTION', 'LEFT', 14);
  lineBelow(ROW.p1Head, LEFT[0], LEFT[1], P.border);
  for (let i = 0; i < catRowCount; i++) {
    const row = ROW.p1r0 + i;
    const sheetRowNum = row + 1;
    const item = catRows[i];
    if (item) {
      cell(row, 1, 2, item.name, dataFmt({ padL: 14 }));
      cell(
        row,
        3,
        4,
        {
          formula: `=IF(OR($C$7="All time",$F$7=""), SUMIFS(Transactions!E:E, Transactions!C:C, "OUT", Transactions!D:D, B${sheetRowNum}), SUMIFS(Transactions!E:E, Transactions!C:C, "OUT", Transactions!D:D, B${sheetRowNum}, Transactions!A:A, ">="&$F$7, Transactions!A:A, "<="&$H$7))`,
        },
        dataFmt({ h: 'RIGHT', num: RS, numKind: 'CURRENCY' })
      );
      cell(
        row,
        5,
        5,
        {
          formula: `=IF($N$13>0, D${sheetRowNum}/$N$13, 0)`,
        },
        dataFmt({ h: 'RIGHT', color: P.muted, num: PCT, numKind: 'PERCENT' })
      );
      cell(row, 6, 8, sparkBar(item.amount, catMax, item.color), dataFmt({ padL: 14 }));
    } else if (i === 0) {
      cell(row, 1, 5, 'No spending recorded yet', dataFmt({ padL: 14, color: P.faint, italic: true }));
    }
    lineBelow(row, LEFT[0], LEFT[1], P.divider);
  }
  fill(ROW.p1Total, LEFT[0], ROW.p1Total, LEFT[1], P.headBg);
  const catTotalBg = { bg: P.headBg, size: 10, bold: true, color: P.ink };
  cell(ROW.p1Total, 1, 2, catCount > 0 ? `Total · ${plural(catCount, 'txn', 'txns')}` : 'Total', { ...catTotalBg, padL: 14 });
  cell(
    ROW.p1Total,
    3,
    4,
    { formula: `=SUM(D${ROW.p1r0 + 1}:D${ROW.p1r0 + catRowCount})` },
    { ...catTotalBg, h: 'RIGHT', num: RS, numKind: 'CURRENCY' }
  );
  cell(
    ROW.p1Total,
    5,
    5,
    { formula: `=IF(D${ROW.p1Total + 1}>0, 1, 0)` },
    { ...catTotalBg, h: 'RIGHT', color: P.muted, num: PCT, numKind: 'PERCENT' }
  );
  lineAbove(ROW.p1Total, LEFT[0], LEFT[1], P.border);
  box(ROW.p1Title, LEFT[0], ROW.p1Total, LEFT[1], P.border);

  // Right: by weekday
  fill(ROW.p1Title, RIGHT[0], ROW.p1Total, RIGHT[1], P.card);
  panelTitle(ROW.p1Title, RIGHT, 'Spending by Weekday', 'Within selected date range');
  headCell(ROW.p1Head, 10, 11, 'DAY', 'LEFT', 14);
  headCell(ROW.p1Head, 12, 13, 'AMOUNT', 'RIGHT');
  headCell(ROW.p1Head, 14, 14, 'SHARE', 'RIGHT');
  headCell(ROW.p1Head, 15, 17, 'TREND', 'LEFT', 14);
  lineBelow(ROW.p1Head, RIGHT[0], RIGHT[1], P.border);
  for (let i = 0; i < catRowCount; i++) {
    const row = ROW.p1r0 + i;
    const sheetRowNum = row + 1;
    if (i < dayRows.length) {
      const d = dayRows[i];
      const isPeak = peakDay !== undefined && d.short === peakDay.short;
      const dayNum = i + 1;
      cell(row, 10, 11, d.long, dataFmt({ padL: 14, bold: isPeak }));
      cell(
        row,
        12,
        13,
        {
          formula: `=IF(OR($C$7="All time",$F$7=""), SUMPRODUCT((Transactions!$C$3:$C$1000="OUT")*(Transactions!$A$3:$A$1000<>"")*(WEEKDAY(Transactions!$A$3:$A$1000,2)=${dayNum})*(Transactions!$E$3:$E$1000)), SUMPRODUCT((Transactions!$C$3:$C$1000="OUT")*(Transactions!$A$3:$A$1000<>"")*(WEEKDAY(Transactions!$A$3:$A$1000,2)=${dayNum})*(Transactions!$A$3:$A$1000>=$F$7)*(Transactions!$A$3:$A$1000<=$H$7)*(Transactions!$E$3:$E$1000)))`,
        },
        dataFmt({
          h: 'RIGHT', num: RS, numKind: 'CURRENCY', bold: isPeak, color: d.amount > 0 ? P.ink : P.faint,
        })
      );
      cell(
        row,
        14,
        14,
        { formula: `=IF($N$13>0, M${sheetRowNum}/$N$13, 0)` },
        dataFmt({ h: 'RIGHT', color: P.muted, num: PCT, numKind: 'PERCENT' })
      );
      cell(row, 15, 17, d.amount > 0 ? sparkBar(d.amount, dayMax, isPeak ? P.blue : P.blueSoft) : null, dataFmt({ padL: 14 }));
    }
    lineBelow(row, RIGHT[0], RIGHT[1], P.divider);
  }
  fill(ROW.p1Total, RIGHT[0], ROW.p1Total, RIGHT[1], P.headBg);
  const dayTotalBg = { bg: P.headBg, size: 10, bold: true, color: P.ink };
  cell(ROW.p1Total, 10, 11, peakDay ? `Total · peak ${peakDay.short}` : 'Total', { ...dayTotalBg, padL: 14 });
  cell(
    ROW.p1Total,
    12,
    13,
    { formula: `=SUM(M${ROW.p1r0 + 1}:M${ROW.p1r0 + Math.min(catRowCount, 7)})` },
    { ...dayTotalBg, h: 'RIGHT', num: RS, numKind: 'CURRENCY' }
  );
  cell(
    ROW.p1Total,
    14,
    14,
    { formula: `=IF(M${ROW.p1Total + 1}>0, 1, 0)` },
    { ...dayTotalBg, h: 'RIGHT', color: P.muted, num: PCT, numKind: 'PERCENT' }
  );
  lineAbove(ROW.p1Total, RIGHT[0], RIGHT[1], P.border);
  box(ROW.p1Title, RIGHT[0], ROW.p1Total, RIGHT[1], P.border);

  // ── Lending & recent activity ──────────────────────────────────────────────
  sectionLabel(ROW.secLedger, 'LENDING & RECENT ACTIVITY');

  fill(ROW.p2Title, LEFT[0], ROW.p2Foot, LEFT[1], P.card);
  panelTitle(ROW.p2Title, LEFT, 'Lend & Borrow', 'Money lent and borrowed');
  headCell(ROW.p2Head, 1, 4, 'METRIC', 'LEFT', 14);
  headCell(ROW.p2Head, 5, 8, 'AMOUNT', 'RIGHT', 0, 14);
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
    cell(row, 5, 8, m.value, {
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
  cell(ROW.p2Foot, 1, 8, lendFoot.text, { bg: P.headBg, color: lendFoot.color, size: 9, bold: true, padL: 14 });
  lineAbove(ROW.p2Foot, LEFT[0], LEFT[1], P.border);
  box(ROW.p2Title, LEFT[0], ROW.p2Foot, LEFT[1], P.border);

  fill(ROW.p2Title, RIGHT[0], ROW.p2Foot, RIGHT[1], P.card);
  panelTitle(ROW.p2Title, RIGHT, 'Recent Activity', 'Latest in selected range');
  headCell(ROW.p2Head, 10, 10, 'DATE', 'LEFT', 14);
  headCell(ROW.p2Head, 11, 13, 'CATEGORY', 'LEFT');
  headCell(ROW.p2Head, 14, 15, 'METHOD', 'LEFT');
  headCell(ROW.p2Head, 16, 17, 'AMOUNT', 'RIGHT', 0, 14);
  lineBelow(ROW.p2Head, RIGHT[0], RIGHT[1], P.border);
  for (let i = 0; i < TABLE_ROWS; i++) {
    const row = ROW.p2r0 + i;
    const t = recent[i];
    if (t) {
      const income = t.type === 'cash_added';
      cell(row, 10, 10, shortDate(txDay(t), currentYear), dataFmt({ padL: 14, color: P.muted }));
      cell(row, 11, 13, t.category || 'General', dataFmt());
      cell(row, 14, 15, t.paymentMethod || (t.type === 'card_expense' ? 'Card' : 'Cash'), dataFmt({ color: P.muted }));
      cell(row, 16, 17, income ? safeNum(t.amount) : -safeNum(t.amount), dataFmt({
        h: 'RIGHT', padR: 14, bold: true, color: income ? P.good : P.bad, num: RS_SIGNED, numKind: 'CURRENCY',
      }));
    } else if (i === 0) {
      cell(row, 10, 14, 'No transactions in this date range', dataFmt({ padL: 14, color: P.faint, italic: true }));
    }
    lineBelow(row, RIGHT[0], RIGHT[1], P.divider);
  }
  cell(
    ROW.p2Foot, 10, 17,
    txs.length > 0 ? `Showing latest ${recent.length} of ${txs.length} in range` : 'No transactions match this filter',
    { bg: P.headBg, color: P.muted, size: 9, bold: true, padL: 14 },
  );
  lineAbove(ROW.p2Foot, RIGHT[0], RIGHT[1], P.border);
  box(ROW.p2Title, RIGHT[0], ROW.p2Foot, RIGHT[1], P.border);

  // ── Footnote ───────────────────────────────────────────────────────────────
  cell(ROW.note, FULL[0], FULL[1], 'Auto-generated by SpendDesk. Edit Period / From / To above, then Sync from the app. Do not edit KPI cells — change data in Transactions.', {
    bg: P.page, color: P.faint, size: 8, h: 'CENTER', v: 'MIDDLE',
  });

  // ── Output ─────────────────────────────────────────────────────────────────
  const rowCount = activeRowDefs.length;
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
      wrapStrategy: 'OVERFLOW_CELL',
    };
    if (f.num) uf.numberFormat = { type: f.numKind ?? 'NUMBER', pattern: f.num };
    return { userEnteredFormat: uf };
  };
  const FORMAT_FIELDS =
    'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy,numberFormat)';

  const toCellData = (v: CellValue) => {
    if (v === null) return {};
    if (typeof v === 'number') return { userEnteredValue: { numberValue: v } };
    if (typeof v === 'string') return { userEnteredValue: { stringValue: v } };
    return { userEnteredValue: { formulaValue: v.formula } };
  };

  const buildRequestPhases = (sheetId: number, current: { rowCount: number; columnCount: number }): any[][] => {
    const curRows = Math.max(1, current.rowCount);
    const curCols = Math.max(1, current.columnCount);
    // Wipe must cover the larger of old vs new grid so leftover cells outside the new
    // layout cannot survive (e.g. old 8-card dashboard wider/taller than new).
    const wipeRows = Math.max(curRows, rowCount);
    const wipeCols = Math.max(curCols, columnCount);
    const everything = {
      sheetId,
      startRowIndex: 0,
      endRowIndex: wipeRows,
      startColumnIndex: 0,
      endColumnIndex: wipeCols,
    };

    const resize = [
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            tabColorStyle: { rgbColor: rgb(P.brandBright) },
            gridProperties: {
              hideGridlines: true,
              rowCount: Math.max(rowCount, wipeRows),
              columnCount: Math.max(columnCount, wipeCols),
            },
          },
          fields: 'tabColorStyle,gridProperties(hideGridlines,rowCount,columnCount)',
        },
      },
    ];

    const wipe = [
      { unmergeCells: { range: everything } },
      { repeatCell: { range: everything, cell: {}, fields: 'userEnteredValue,userEnteredFormat' } },
    ];

    const shrink = [
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: { hideGridlines: true, rowCount, columnCount },
          },
          fields: 'gridProperties(hideGridlines,rowCount,columnCount)',
        },
      },
    ];

    const dimensions: any[] = [];
    activeRowDefs.forEach(([, px], i) => {
      dimensions.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 },
          properties: { pixelSize: px },
          fields: 'pixelSize',
        },
      });
    });
    COL_PX.forEach((px, i) => {
      dimensions.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
          properties: { pixelSize: px },
          fields: 'pixelSize',
        },
      });
    });

    const valuesReq = [
      {
        updateCells: {
          start: { sheetId, rowIndex: 0, columnIndex: 0 },
          rows: values.map((row) => ({ values: row.map(toCellData) })),
          fields: 'userEnteredValue',
        },
      },
    ];

    const merges = specs.filter((s) => s.merge).map((s) => ({
      mergeCells: { range: range(sheetId, s), mergeType: 'MERGE_ALL' },
    }));

    const formats = specs.map((s) => ({
      repeatCell: { range: range(sheetId, s), cell: cellFormat(s.fmt), fields: FORMAT_FIELDS },
    }));

    const borderReqs = borders.map((b) => {
      const edge = { style: 'SOLID', color: rgb(b.color) };
      const req: any = { range: range(sheetId, b) };
      if (b.top) req.top = edge;
      if (b.bottom) req.bottom = edge;
      if (b.left) req.left = edge;
      if (b.right) req.right = edge;
      return { updateBorders: req };
    });

    const validations = [
      {
        setDataValidation: {
          range: {
            sheetId,
            startRowIndex: ROW.filter,
            endRowIndex: ROW.filter + 1,
            startColumnIndex: 2,
            endColumnIndex: 4,
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: DASHBOARD_PERIODS.map((p) => ({ userEnteredValue: p })),
            },
            showCustomUi: true,
            strict: false,
            inputMessage: 'Pick a period, set From/To for Custom, then Sync from SpendDesk.',
          },
        },
      },
      {
        setDataValidation: {
          range: {
            sheetId,
            startRowIndex: ROW.filter,
            endRowIndex: ROW.filter + 1,
            startColumnIndex: 5,
            endColumnIndex: 6,
          },
          rule: {
            condition: { type: 'DATE_IS_VALID' },
            showCustomUi: true,
            strict: false,
            inputMessage: 'Pick a start date (used when Period is Custom).',
          },
        },
      },
      {
        setDataValidation: {
          range: {
            sheetId,
            startRowIndex: ROW.filter,
            endRowIndex: ROW.filter + 1,
            startColumnIndex: 7,
            endColumnIndex: 9,
          },
          rule: {
            condition: { type: 'DATE_IS_VALID' },
            showCustomUi: true,
            strict: false,
            inputMessage: 'Pick an end date (used when Period is Custom).',
          },
        },
      },
    ];

    return [resize, wipe, shrink, dimensions, valuesReq, merges, formats, borderReqs, validations];
  };

  const buildRequests = (sheetId: number, current: { rowCount: number; columnCount: number }): any[] =>
    buildRequestPhases(sheetId, current).flat();

  return { rowCount, columnCount, values, buildRequests, buildRequestPhases };
};
