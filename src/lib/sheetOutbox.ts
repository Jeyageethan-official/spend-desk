/**
 * Google Sheet sync outbox.
 *
 * The sheet push used to be fire-and-forget: one debounced attempt per
 * change, and any failure (network blip, Google 429, token not cached yet,
 * push skipped because another push was already in flight, tab throttled)
 * meant the sheet silently stayed stale until the next transaction.
 *
 * This tiny persisted outbox closes that gap:
 *  - `markSheetSyncDirty` records "the connected sheet is out of date".
 *  - `noteSheetSyncAttempt` bumps the retry counter and computes the next
 *    allowed attempt time with exponential backoff (5s → 15s → 45s → 2m → 5m).
 *  - `clearSheetSyncDirty` resets everything after a successful push.
 *
 * A watchdog effect in App.tsx reads this state and flushes on a timer and
 * on every wake-up (tab focus, visibility, back online). Everything is
 * localStorage-persisted so a reload mid-outage still retries. Pushes are
 * full overwrites of the sheet, so a duplicate retry is idempotent.
 */

export interface SheetOutboxState {
  /** True when the connected sheet is behind local data. */
  dirty: boolean;
  /** Consecutive failed attempts since the last successful push. */
  attempts: number;
  /** Epoch ms before which another automatic attempt should not run. */
  nextRetryAt: number;
  /** Short diagnostic of the last failure (console/debug only). */
  lastError?: string;
  updatedAt: number;
}

/** Backoff schedule per consecutive failed attempt. */
const BACKOFF_MS = [5_000, 15_000, 45_000, 120_000, 300_000];
const MAX_BACKOFF_MS = BACKOFF_MS[BACKOFF_MS.length - 1];

const keyFor = (email?: string | null) =>
  `spenddesk_sheet_outbox_v1_${(email || 'guest').trim().toLowerCase()}`;

const empty = (): SheetOutboxState => ({ dirty: false, attempts: 0, nextRetryAt: 0, updatedAt: Date.now() });

export const readSheetOutbox = (email?: string | null): SheetOutboxState => {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(keyFor(email)) || '{}') };
  } catch {
    return empty();
  }
};

const save = (email: string | null | undefined, state: SheetOutboxState) => {
  try {
    localStorage.setItem(keyFor(email), JSON.stringify(state));
  } catch {}
};

/** Record that the connected sheet is behind local data. Safe to call often. */
export const markSheetSyncDirty = (email?: string | null, error?: string): void => {
  const state = readSheetOutbox(email);
  save(email, {
    ...state,
    dirty: true,
    lastError: error ? error.slice(0, 200) : state.lastError,
    updatedAt: Date.now(),
  });
};

/**
 * Record that a push attempt is starting. Bumps the attempt counter and
 * returns the backoff window this attempt is subject to.
 */
export const noteSheetSyncAttempt = (email?: string | null): void => {
  const state = readSheetOutbox(email);
  const attempts = state.attempts + 1;
  const backoff = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
  save(email, {
    ...state,
    dirty: true,
    attempts,
    nextRetryAt: Date.now() + backoff,
    updatedAt: Date.now(),
  });
};

/** Successful push: reset the outbox completely. */
export const clearSheetSyncDirty = (email?: string | null): void => {
  try {
    localStorage.removeItem(keyFor(email));
  } catch {}
};

/** How long until the next automatic attempt is allowed (0 when due now). */
export const sheetOutboxRetryDelayMs = (state: SheetOutboxState): number => {
  if (!state.dirty) return 0;
  return Math.max(0, state.nextRetryAt - Date.now());
};

/** Cap used by the watchdog when scheduling its next check. */
export const SHEET_OUTBOX_MAX_BACKOFF_MS = MAX_BACKOFF_MS;
