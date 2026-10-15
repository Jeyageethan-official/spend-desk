/**
 * Auth phase state machine + redirect-cause trace.
 *
 * Two jobs:
 *  1. VISIBILITY (P1): every stage of a Google sign-in round-trip is an
 *     explicit phase - redirecting (about to leave for Google), exchanging
 *     (back on our origin, Supabase swapping the code), connected, error -
 *     so the UI can always say exactly what is happening instead of a blank
 *     flash and a disappearing toast.
 *  2. PROVENANCE (P0): every path that can navigate the tab to Google or open
 *     a GIS token window pushes a breadcrumb into a sessionStorage ring
 *     buffer with the caller name, so when a redirect surprises someone we
 *     can read back exactly which call started it and why.
 *
 * The phase survives the OAuth redirect because it lives in sessionStorage
 * (same tab, same origin - Google round-trip keeps it alive), which is how
 * the return trip knows it is landing inside an in-flight sign-in.
 */

export type AuthPhase = 'idle' | 'redirecting' | 'exchanging' | 'connected' | 'error';

export interface AuthPhaseState {
  phase: AuthPhase;
  /** What started it: 'Connect Google button', 'sheet_sync:sheet_push', ... */
  cause: string;
  message?: string;
  email?: string;
  /** Epoch ms of the last phase transition (drives overlay timeout). */
  at: number;
}

const PHASE_KEY = 'spenddesk_auth_phase_v1';
const TRACE_KEY = 'spenddesk_auth_trace_v1';
const CAUSE_KEY = 'spenddesk_signin_cause';
const PENDING_KEY = 'spenddesk_signin_pending';
/** Max age of a persisted 'redirecting'/'exchanging' state before stale. */
export const REDIRECT_PHASE_TTL_MS = 10 * 60 * 1000;
/** Errors/confirmations re-surface across a quick reload, then go stale. */
export const PHASE_FEEDBACK_TTL_MS = 60 * 1000;

const idleState = (): AuthPhaseState => ({ phase: 'idle', cause: '', at: Date.now() });

let state: AuthPhaseState = idleState();
const listeners = new Set<(s: AuthPhaseState) => void>();

const persist = () => {
  try {
    sessionStorage.setItem(PHASE_KEY, JSON.stringify(state));
  } catch {}
};

const notify = () => {
  listeners.forEach((l) => {
    try {
      l(state);
    } catch {}
  });
  persist();
};

export const getAuthPhase = (): AuthPhaseState => state;

export const subscribeAuthPhase = (fn: (s: AuthPhaseState) => void): (() => void) => {
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
};

/**
 * Append a breadcrumb to the redirect-cause trace. Kept tiny (ring buffer of
 * 30) and in sessionStorage so it survives the Google round-trip and can be
 * read back after the fact: `readAuthTrace()` or the console line below.
 */
export const pushAuthTrace = (event: string, detail?: Record<string, unknown>): void => {
  const entry = { event, detail: detail || {}, at: new Date().toISOString() };
  try {
    const raw = sessionStorage.getItem(TRACE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) {
      arr.push(entry);
      sessionStorage.setItem(TRACE_KEY, JSON.stringify(arr.slice(-30)));
    }
  } catch {}
  console.debug('[auth]', event, detail || {});
};

export const readAuthTrace = (): Array<{ event: string; detail: Record<string, unknown>; at: string }> => {
  try {
    const arr = JSON.parse(sessionStorage.getItem(TRACE_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

export const setAuthPhase = (
  phase: AuthPhase,
  opts: { cause?: string; message?: string; email?: string } = {}
): void => {
  state = {
    phase,
    cause: opts.cause !== undefined ? opts.cause : state.cause,
    message: opts.message,
    email: opts.email,
    at: Date.now(),
  };
  pushAuthTrace(`phase:${phase}`, { cause: state.cause, message: opts.message });
  notify();
};

/**
 * Call IMMEDIATELY before `window.location.href = googleUrl`.
 * Records the caller ("cause") and marks the session as in-flight so the
 * return trip knows to show the exchange overlay.
 */
export const beginGoogleRedirect = (cause: string): void => {
  pushAuthTrace('oauth_redirect_start', { cause, href: location.href });
  state = { phase: 'redirecting', cause, at: Date.now() };
  try {
    sessionStorage.setItem(PENDING_KEY, '1');
    sessionStorage.setItem(CAUSE_KEY, cause);
  } catch {}
  notify();
  persist();
};

/**
 * Boot-side: we just landed back on our origin. If a redirect was in flight,
 * flip to 'exchanging' and hand back the recorded cause for the overlay.
 * Returns '' when this boot is a normal open (no sign-in round-trip).
 */
export const beginOAuthExchange = (): string => {
  let cause = '';
  try {
    cause = sessionStorage.getItem(CAUSE_KEY) || state.cause || '';
    sessionStorage.removeItem(CAUSE_KEY);
    sessionStorage.removeItem(PENDING_KEY);
  } catch {}
  state = { phase: 'exchanging', cause, at: Date.now() };
  pushAuthTrace('oauth_return_landed', { cause, href: location.href });
  notify();
  persist();
  return cause;
};

/**
 * Boot-side: adopt the persisted phase so the overlay and this module agree
 * (notify on adoption - React must not render a stale state). In-flight
 * phases survive for REDIRECT_PHASE_TTL_MS; error/connected feedback survives
 * only briefly (PHASE_FEEDBACK_TTL_MS) so a reloaded page doesn't re-show an
 * old message; anything else resets to idle.
 */
export const restorePersistedPhase = (): AuthPhaseState => {
  try {
    const raw = sessionStorage.getItem(PHASE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AuthPhaseState;
      const inFlight = parsed && (parsed.phase === 'redirecting' || parsed.phase === 'exchanging');
      const feedback = parsed && (parsed.phase === 'error' || parsed.phase === 'connected');
      const ttl = inFlight ? REDIRECT_PHASE_TTL_MS : PHASE_FEEDBACK_TTL_MS;
      if ((inFlight || feedback) && Date.now() - (parsed.at || 0) < ttl) {
        if (state.phase !== parsed.phase || state.at !== parsed.at) {
          state = parsed;
          notify(); // keep subscribers (overlay) in sync with adopted state
        }
        return state;
      }
    }
  } catch {}
  state = idleState();
  persist();
  return state;
};

/** Session landed - overlay shows "Signed in as ..." briefly, then clears. */
export const finishOAuthConnected = (email?: string): void => {
  if (state.phase !== 'exchanging' && state.phase !== 'redirecting') return;
  setAuthPhase('connected', { email });
};

/** Surfaced failure: Google denied, user cancelled, timeout, exchange error. */
export const failAuthPhase = (message: string): void => {
  setAuthPhase('error', { message });
};

export const clearAuthPhase = (): void => {
  state = idleState();
  try {
    sessionStorage.removeItem(PENDING_KEY);
    sessionStorage.removeItem(CAUSE_KEY);
  } catch {}
  notify();
  persist();
};

/** Is the exchange overlay-worthy right now? */
export const isAuthPhaseActive = (p: AuthPhase = state.phase): boolean =>
  p === 'redirecting' || p === 'exchanging' || p === 'connected' || p === 'error';

/**
 * Console diagnostics: type `__spenddeskAuth.trace()` in DevTools to read the
 * redirect-cause breadcrumbs, or `.phase()` for the current state. This is the
 * P0 answer to "why did my browser go to Google just now?".
 */
declare global {
  interface Window {
    __spenddeskAuth?: {
      phase: typeof getAuthPhase;
      trace: typeof readAuthTrace;
      exchanging: typeof beginOAuthExchange;
      fail: typeof failAuthPhase;
      clear: typeof clearAuthPhase;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__spenddeskAuth = {
    phase: getAuthPhase,
    trace: readAuthTrace,
    exchanging: beginOAuthExchange,
    fail: failAuthPhase,
    clear: clearAuthPhase,
  };
}
