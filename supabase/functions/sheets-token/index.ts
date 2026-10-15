import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * sheets-token: mint a fresh Google Sheets/Drive access token SERVER-SIDE.
 *
 * The browser stores Google's offline refresh token once (RLS row in
 * google_refresh_tokens); this function trades it for a short-lived access
 * token using the OAuth client secret kept out of the bundle. The client then
 * needs NO Google popup, NO redirect and NO user gesture to renew - which is
 * what makes "sign in once, stay connected for months" real.
 *
 * Auth: the caller sends their normal Supabase session JWT; the row is read
 * with that JWT so RLS guarantees a user can only ever use their own token.
 * The Google client secret lives only in function secrets (GOOGLE_CLIENT_SECRET).
 */

const GOOGLE_CLIENT_ID = '377806164433-ftqbide3ul9jfenp00hcgveeonoifdjs.apps.googleusercontent.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Sign in is required.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: 'Server is not configured.' }, 503);
  }

  // Validate the caller's session FIRST (cheap, fail fast).
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) return json({ error: 'Invalid sign-in session.' }, 401);

  if (!clientSecret) {
    // Deployment not finished (secret missing) - client falls back to GIS.
    return json({ error: 'server_not_configured' }, 503);
  }

  // Read THIS user's stored refresh token through an RLS-scoped client.
  const { data: row, error: rowError } = await authClient
    .from('google_refresh_tokens')
    .select('refresh_token')
    .eq('user_id', user.id)
    .maybeSingle();
  if (rowError) return json({ error: 'lookup_failed' }, 500);
  if (!row?.refresh_token) return json({ error: 'no_refresh_token' }, 404);

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: GOOGLE_CLIENT_ID,
    client_secret: clientSecret,
    refresh_token: row.refresh_token,
  });

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const tokens = await tokenResponse.json().catch(() => ({}));

    if (!tokenResponse.ok || !tokens.access_token) {
      const reason = String(tokens.error || 'exchange_failed');
      console.error('sheets-token exchange failed:', reason);
      // invalid_grant = revoked/expired refresh token: the client should
      // treat this as "reconnect needed" rather than retry-looping.
      return json({ error: 'refresh_failed', reason }, 502);
    }

    return json({
      access_token: tokens.access_token,
      expires_in: Number(tokens.expires_in) || 3599,
    });
  } catch (e) {
    console.error('sheets-token exception:', e);
    return json({ error: 'internal_error' }, 500);
  }
});
