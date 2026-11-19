import { adminClient, corsHeaders, getConfig, googleAccessToken, json, verifiedUser } from '../_shared/googleSheetsSecure.ts';

const allowedGoogleUrl = (raw: string) => {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    const sheets = url.hostname === 'sheets.googleapis.com' && /^\/v4\/spreadsheets(?:\/|$)/.test(url.pathname);
    const drive = url.hostname === 'www.googleapis.com' && /^\/drive\/v3\/files(?:\/|$)/.test(url.pathname);
    const userInfo = url.hostname === 'www.googleapis.com' && url.pathname === '/oauth2/v3/userinfo';
    return sheets || drive || userInfo ? url : null;
  } catch { return null; }
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const config = getConfig();
  if (!config) return json({ error: 'server_not_configured' }, 503);
  const user = await verifiedUser(request, config);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const payload = await request.json().catch(() => ({}));
  const url = typeof payload.url === 'string' ? allowedGoogleUrl(payload.url) : null;
  const method = typeof payload.method === 'string' ? payload.method.toUpperCase() : 'GET';
  const body = typeof payload.body === 'string' ? payload.body : undefined;
  // Sheets values updates use PUT. The browser never supplies Google credentials;
  // the server supplies the authenticated user's short-lived access token.
  if (!url || !['GET', 'POST', 'PUT', 'DELETE'].includes(method) || (body && body.length > 1_000_000)) return json({ error: 'invalid_request' }, 400);
  const access = await googleAccessToken(adminClient(config), user.id, config);
  if ('error' in access) return json({ error: access.error }, 401);
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${access.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body });
  const responseBody = await response.text();
  return json({ body: responseBody, googleStatus: response.status, contentType: response.headers.get('Content-Type') || 'application/json' }, 200);
});
