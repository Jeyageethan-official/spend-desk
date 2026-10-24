import { getStoredSupabaseConfig, getSupabase } from './supabase';
import { pushAuthTrace } from './authPhase';

/**
 * Server-side Google token minting (P2s).
 *
 * After the initial consent, Google's offline refresh token lives in the
 * `google_refresh_tokens` table (RLS: one row per user). The `sheets-token`
 * edge function trades it for a fresh Sheets/Drive access token - so the
 * browser never has to open a Google popup or redirect again. This is the
 * difference between "reconnect every hour-ish" and "sign in once, stay
 * connected for months, zero popups".
 *
 * Every caller must treat `null` as "server not available yet" and fall back
 * to the existing GIS/silent-interactive ladder - the feature degrades to
 * today's behaviour instead of breaking.
 */

let cachedToken: string | null = null;
let cachedExpiresAt = 0;
/** Which Supabase user the cached server token was minted for. */
let cachedTokenUserId: string | null = null;

/** Ask our backend for a fresh Google Sheets/Drive access token. Zero Google UI. */
export const fetchSheetsTokenFromServer = async (): Promise<{
  token: string;
  expiresInSeconds: number;
} | null> => {
  let userId: string | null = null;
  try {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    userId = session.user?.id || null;

    // In-memory cache with a 60s safety margin - but only for the SAME user.
    // Another account signing in must never be served this account's token.
    if (cachedToken && cachedTokenUserId === userId && Date.now() < cachedExpiresAt - 60_000) {
      return { token: cachedToken, expiresInSeconds: Math.max(1, Math.round((cachedExpiresAt - Date.now()) / 1000)) };
    }

    const { url, anonKey } = getStoredSupabaseConfig();
    const res = await fetch(`${url.replace(/\/$/, '')}/functions/v1/sheets-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: '{}',
    });
    if (!res.ok) {
      // 404 = refresh token not stored yet, 503 = secret not configured,
      // 502 = Google refused (revoked grant). All are normal fallbacks.
      pushAuthTrace('sheets_token_server_unavailable', { status: res.status });
      return null;
    }
    const json = await res.json();
    const token = json?.access_token;
    if (!token || typeof token !== 'string') return null;

    const expiresInSeconds = Number(json.expires_in) > 0 ? Number(json.expires_in) : 3540;
    cachedToken = token;
    cachedExpiresAt = Date.now() + expiresInSeconds * 1000;
    cachedTokenUserId = userId;
    pushAuthTrace('sheets_token_from_server', { expiresInSeconds });
    return { token, expiresInSeconds };
  } catch (e) {
    pushAuthTrace('sheets_token_server_error', { reason: String(e) });
    return null;
  }
};

/** Drop the in-memory server token (sign-out / account switch). */
export const clearServerSheetsToken = (): void => {
  cachedToken = null;
  cachedExpiresAt = 0;
  cachedTokenUserId = null;
};
