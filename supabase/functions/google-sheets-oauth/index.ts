import { adminClient, corsHeaders, decryptSecret, encryptSecret, getConfig, json, randomUrlToken, sha256, verifiedUser, withSecureDatabase } from '../_shared/googleSheetsSecure.ts';

const scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'];
// Keep OAuth observability useful without ever logging a code, state, token,
// user identifier, Google response, or database error text.
const callbackEvent = (stage: 'state_unavailable' | 'cancelled' | 'state_decrypt_failed' | 'token_exchange_failed' | 'token_persist_failed') =>
  console.warn(`google_sheets_oauth_callback:${stage}`);
// Google must return the authorization code to the Edge Function, never to the
// static GitHub Pages application. APP_ORIGIN is used only after the server has
// validated the state and exchanged the code.
const redirectUri = (supabaseUrl: string) => `${supabaseUrl.replace(/\/$/, '')}/functions/v1/google-sheets-oauth/callback`;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const config = getConfig();
  if (!config) return json({ error: 'server_not_configured' }, 503);
  const url = new URL(request.url);
  const db = adminClient(config);

  if (url.pathname.endsWith('/callback')) {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauthError = url.searchParams.get('error');
    if (!state || (!code && !oauthError)) return new Response('Invalid authorization response.', { status: 400 });
    const row = await withSecureDatabase(config, async (database) => {
      const result = await database.queryObject<{ user_id: string; pkce_verifier_ciphertext: string; pkce_verifier_iv: string }>
        `update private.google_sheets_oauth_states set used_at = now() where state_hash = ${await sha256(state)} and used_at is null and expires_at > now() returning user_id, pkce_verifier_ciphertext, pkce_verifier_iv`;
      return result.rows[0];
    }).catch(() => undefined);
    if (!row) {
      callbackEvent('state_unavailable');
      return new Response('Authorization request expired or invalid.', { status: 400 });
    }
    if (oauthError) {
      callbackEvent('cancelled');
      return Response.redirect(`${config.appOrigin}/?google_sheets=cancelled`, 302);
    }
    let verifier: string;
    try {
      verifier = await decryptSecret(row.pkce_verifier_ciphertext, row.pkce_verifier_iv, config.tokenKey);
    } catch {
      callbackEvent('state_decrypt_failed');
      return Response.redirect(`${config.appOrigin}/?google_sheets=error`, 302);
    }
    const body = new URLSearchParams({ code: code!, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri(config.supabaseUrl), grant_type: 'authorization_code', code_verifier: verifier });
    const exchange = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }).catch(() => null);
    const tokenSet = await exchange?.json().catch(() => ({}));
    if (!exchange?.ok || typeof tokenSet?.refresh_token !== 'string') {
      callbackEvent('token_exchange_failed');
      return Response.redirect(`${config.appOrigin}/?google_sheets=reconnect_required`, 302);
    }
    try {
      const encrypted = await encryptSecret(tokenSet.refresh_token, config.tokenKey);
      const grantedScopes = typeof tokenSet.scope === 'string' ? tokenSet.scope.split(' ').filter(Boolean) : scopes;
      await withSecureDatabase(config, async (database) => {
        await database.queryObject`
          insert into private.google_sheets_connections (user_id, refresh_token_ciphertext, refresh_token_iv, encryption_key_version, granted_scopes, status, connected_at, updated_at, revoked_at)
          values (${row.user_id}, ${encrypted.ciphertext}, ${encrypted.iv}, 1, ${grantedScopes}, 'connected', now(), now(), null)
          on conflict (user_id) do update set refresh_token_ciphertext = excluded.refresh_token_ciphertext, refresh_token_iv = excluded.refresh_token_iv, encryption_key_version = excluded.encryption_key_version, granted_scopes = excluded.granted_scopes, status = 'connected', connected_at = now(), updated_at = now(), revoked_at = null`;
      });
      return Response.redirect(`${config.appOrigin}/?google_sheets=connected`, 302);
    } catch {
      callbackEvent('token_persist_failed');
      return Response.redirect(`${config.appOrigin}/?google_sheets=error`, 302);
    }
  }

  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const user = await verifiedUser(request, config);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const payload = await request.json().catch(() => ({}));
  if (payload.action === 'status') {
    const data = await withSecureDatabase(config, async (database) => {
      const result = await database.queryObject<{ status: string; connected_at: string; updated_at: string; granted_scopes: string[] }>
        `select status, connected_at, updated_at, granted_scopes from private.google_sheets_connections where user_id = ${user.id} limit 1`;
      return result.rows[0];
    }).catch(() => undefined);
    return json({ connected: data?.status === 'connected', status: data?.status || 'disconnected', connectedAt: data?.connected_at || null, updatedAt: data?.updated_at || null, grantedScopes: data?.granted_scopes || [] });
  }
  if (payload.action === 'disconnect') {
    await withSecureDatabase(config, async (database) => {
      await database.queryObject`delete from private.google_sheets_connections where user_id = ${user.id}`;
    }).catch(() => undefined);
    return json({ disconnected: true });
  }
  if (payload.action !== 'start') return json({ error: 'invalid_action' }, 400);
  const state = randomUrlToken();
  const verifier = randomUrlToken(48);
  const challenge = await sha256(verifier);
  const encrypted = await encryptSecret(verifier, config.tokenKey);
  try {
    await withSecureDatabase(config, async (database) => {
      await database.queryObject`delete from private.google_sheets_oauth_states where user_id = ${user.id} and expires_at < now()`;
      await database.queryObject`
        insert into private.google_sheets_oauth_states (user_id, state_hash, pkce_verifier_ciphertext, pkce_verifier_iv, encryption_key_version, redirect_origin, expires_at)
        values (${user.id}, ${await sha256(state)}, ${encrypted.ciphertext}, ${encrypted.iv}, 1, ${config.appOrigin}, now() + interval '10 minutes')`;
    });
  } catch { return json({ error: 'authorization_unavailable' }, 503); }
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri(config.supabaseUrl));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('include_granted_scopes', 'false');
  // A replacement connection must show the chooser. The existing encrypted
  // connection remains intact until this state/PKCE-validated exchange succeeds.
  authUrl.searchParams.set('prompt', 'select_account consent');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  return json({ authorizationUrl: authUrl.toString() });
});
