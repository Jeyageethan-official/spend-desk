import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Pool } from 'jsr:@db/postgres@^0';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const base64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

// APP_ORIGIN includes the GitHub Pages path for post-OAuth redirects. CORS
// compares only a URL origin (scheme + host + port), never a path.
const corsOrigin = (() => {
  const appOrigin = Deno.env.get('APP_ORIGIN');
  if (!appOrigin) return '';
  try { return new URL(appOrigin).origin; } catch { return ''; }
})();

export const corsHeaders = {
  'Access-Control-Allow-Origin': corsOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

export const getConfig = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('GOOGLE_SHEETS_OAUTH_CLIENT_ID');
  // During the approved transition, the reviewed legacy server-only secret is
  // the confidential secret for this same OAuth Web client. Prefer the scoped
  // name for a future independent client, but do not copy a secret value merely
  // to rename it or ever expose it to the browser.
  const clientSecret = Deno.env.get('GOOGLE_SHEETS_OAUTH_CLIENT_SECRET') || Deno.env.get('GOOGLE_CLIENT_SECRET');
  const tokenKey = Deno.env.get('GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY');
  const appOrigin = Deno.env.get('APP_ORIGIN');
  const databaseUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !clientId || !clientSecret || !tokenKey || !appOrigin || !databaseUrl) return null;
  return { supabaseUrl, anonKey, serviceRoleKey, clientId, clientSecret, tokenKey, appOrigin: appOrigin.replace(/\/$/, ''), databaseUrl };
};

export const adminClient = (config: NonNullable<ReturnType<typeof getConfig>>) =>
  createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

// `private` is intentionally not an exposed PostgREST schema.  Calling
// db.schema('private') would therefore fail even with a service-role client,
// or would require exposing sensitive tables to the Data API.  Edge Functions
// instead use the platform-provided server-only Postgres connection.
let databasePool: Pool | null = null;
const securePool = (config: NonNullable<ReturnType<typeof getConfig>>) => {
  if (!databasePool) databasePool = new Pool(config.databaseUrl, 1, true);
  return databasePool;
};

export const withSecureDatabase = async <T>(
  config: NonNullable<ReturnType<typeof getConfig>>,
  work: (connection: Awaited<ReturnType<Pool['connect']>>) => Promise<T>,
) => {
  const connection = await securePool(config).connect();
  try { return await work(connection); } finally { connection.release(); }
};

export const verifiedUser = async (request: Request, config: NonNullable<ReturnType<typeof getConfig>>) => {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return null;
  const auth = createClient(config.supabaseUrl, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error } = await auth.auth.getUser();
  return error || !user ? null : user;
};

const cryptoKey = async (encoded: string) => {
  const raw = fromBase64Url(encoded);
  if (raw.length !== 32) throw new Error('invalid_key');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
};

export const encryptSecret = async (value: string, encodedKey: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(encodedKey), encoder.encode(value));
  return { ciphertext: base64Url(new Uint8Array(encrypted)), iv: base64Url(iv) };
};

export const decryptSecret = async (ciphertext: string, iv: string, encodedKey: string) =>
  decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(iv) }, await cryptoKey(encodedKey), fromBase64Url(ciphertext)));

export const sha256 = async (value: string) => base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
export const randomUrlToken = (bytes = 32) => base64Url(crypto.getRandomValues(new Uint8Array(bytes)));

export const googleAccessToken = async (_db: SupabaseClient, userId: string, config: NonNullable<ReturnType<typeof getConfig>>) => {
  let connection: { refresh_token_ciphertext: string; refresh_token_iv: string; status: string } | undefined;
  try {
    connection = (await withSecureDatabase(config, async (database) => {
      const result = await database.queryObject<{ refresh_token_ciphertext: string; refresh_token_iv: string; status: string }>
        `select refresh_token_ciphertext, refresh_token_iv, status from private.google_sheets_connections where user_id = ${userId} limit 1`;
      return result.rows[0];
    }));
  } catch { return { error: 'token_unavailable' as const }; }
  if (!connection || connection.status !== 'connected') return { error: 'reconnect_required' as const };
  let refreshToken = '';
  try {
    refreshToken = await decryptSecret(connection.refresh_token_ciphertext, connection.refresh_token_iv, config.tokenKey);
    const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken });
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const tokens = await response.json().catch(() => ({}));
    if (!response.ok || typeof tokens.access_token !== 'string') {
      await withSecureDatabase(config, async (database) => {
        await database.queryObject`update private.google_sheets_connections set status = 'reconnect_required', updated_at = now() where user_id = ${userId}`;
      });
      return { error: 'reconnect_required' as const };
    }
    return { token: tokens.access_token as string };
  } catch {
    return { error: 'token_unavailable' as const };
  } finally {
    refreshToken = '';
  }
};
