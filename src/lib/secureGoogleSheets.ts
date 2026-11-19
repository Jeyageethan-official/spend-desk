import { getStoredSupabaseConfig, getSupabase } from './supabase';

/**
 * Disabled until the database migrations, Edge Function secrets, OAuth callback
 * and staged release have been approved. There is intentionally no runtime UI
 * switch: the build-time flag prevents an accidental production cutover.
 */
export const isSecureGoogleSheetsEnabled = () => import.meta.env.VITE_ENABLE_SECURE_GOOGLE_SHEETS === 'true';
export const SECURE_GOOGLE_SHEETS_HANDLE = 'secure_google_sheets_connection';

const invoke = async <T>(functionName: string, payload: Record<string, unknown>): Promise<T> => {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session?.access_token) throw new Error('Sign in is required.');
  const { url, anonKey } = getStoredSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Google Sheets connection is unavailable.');
  return body as T;
};

export interface SecureGoogleSheetsStatus {
  connected: boolean;
  status: 'connected' | 'reconnect_required' | 'disconnected';
  connectedAt: string | null;
  updatedAt: string | null;
  grantedScopes: string[];
}

export const getSecureGoogleSheetsStatus = () => invoke<SecureGoogleSheetsStatus>('google-sheets-oauth', { action: 'status' });

export const startSecureGoogleSheetsConnection = async (): Promise<void> => {
  const result = await invoke<{ authorizationUrl: string }>('google-sheets-oauth', { action: 'start' });
  if (!result.authorizationUrl || !/^https:\/\/accounts\.google\.com\//.test(result.authorizationUrl)) throw new Error('Google authorization could not be started.');
  window.location.assign(result.authorizationUrl);
};

export const disconnectSecureGoogleSheets = () => invoke<{ disconnected: boolean }>('google-sheets-oauth', { action: 'disconnect' });

/** Proxies only pre-approved Google Sheets/Drive requests; never credentials. */
export const secureGoogleSheetsFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(init.headers);
  headers.delete('Authorization');
  const body = typeof init.body === 'string' ? init.body : init.body ? String(init.body) : undefined;
  const result = await invoke<{ body: string; googleStatus: number; contentType: string }>('google-sheets-api', {
    url,
    method: init.method || 'GET',
    body,
    // Content type is fixed server-side; browser cannot forward authorization.
    contentType: headers.get('Content-Type') || undefined,
  });
  return new Response(result.body || '', { status: result.googleStatus, headers: { 'Content-Type': result.contentType || 'application/json' } });
};
