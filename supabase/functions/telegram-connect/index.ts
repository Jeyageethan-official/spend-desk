// SpendDesk — Telegram connection lifecycle (authenticated).
//
// Actions (POST JSON, Authorization: user session required):
//   create_link  -> short-lived single-use linking token + t.me deep link
//   status       -> { connected, pending, alertsEnabled, chatIdMasked, linkedAt }
//   set_enabled  -> persist the per-user "Enable transaction alerts" toggle
//   test         -> send a real test message to the user's linked chat
//   disconnect   -> remove this user's link (never touches other users)
//
// The actual chat<->user association is written ONLY by the telegram-webhook
// function when the user presses Start in Telegram. The bot token and the
// service-role key stay in Supabase secrets and are never returned to clients.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const TOKEN_TTL_SECONDS = 5 * 60;

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const maskChatId = (chatId: string): string =>
  chatId.length > 4 ? `•••• ${chatId.slice(-4)}` : '••••';

// The bot username comes from project configuration (TELEGRAM_BOT_USERNAME) or
// the live bot itself via getMe — it is never invented and never exposes the token.
let cachedBotUsername: string | null = null;
const resolveBotUsername = async (botToken: string): Promise<string | null> => {
  if (cachedBotUsername) return cachedBotUsername;
  const configured = Deno.env.get('TELEGRAM_BOT_USERNAME')?.trim();
  if (configured) {
    cachedBotUsername = configured.replace(/^@/, '');
    return cachedBotUsername;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await response.json();
    if (data?.ok && typeof data.result?.username === 'string' && data.result.username) {
      cachedBotUsername = data.result.username;
      return cachedBotUsername;
    }
  } catch {
    /* fall through */
  }
  return null;
};

const sendTelegramMessage = async (
  botToken: string,
  chatId: string,
  text: string
): Promise<boolean> => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const data = await response.json();
    return Boolean(response.ok && data?.ok);
  } catch {
    return false;
  }
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Sign in is required to manage Telegram alerts.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!supabaseUrl || !supabaseAnonKey || !botToken) {
    console.error('telegram-connect is missing required configuration.');
    return json({ error: 'Telegram is not configured on the server yet.' }, 503);
  }

  // All queries run with the caller's own session, so every read/write is
  // constrained by Row Level Security to THIS authenticated user.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return json({ error: 'Invalid sign-in session.' }, 401);

  let payload: { action?: unknown; enabled?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }
  const action = typeof payload.action === 'string' ? payload.action : '';

  const readLink = async () => {
    const { data } = await supabase
      .from('telegram_links')
      .select('chat_id, alerts_enabled, linked_at')
      .eq('user_id', user.id)
      .maybeSingle();
    return data ?? null;
  };

  if (action === 'create_link') {
    const botUsername = await resolveBotUsername(botToken);
    if (!botUsername) {
      return json({ error: 'Telegram is not configured yet. Try again later.' }, 503);
    }

    // Cryptographically secure, short-lived, single-use linking token.
    // Only its SHA-256 hash is stored; the plaintext exists solely in the deep link.
    const raw = new Uint8Array(24);
    crypto.getRandomValues(raw);
    const token = `sdsk_${bytesToBase64Url(raw)}`;
    const tokenHash = await sha256Hex(token);

    const { error: insertError } = await supabase.from('telegram_link_tokens').insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
    });
    if (insertError) {
      console.error('telegram-link token insert failed:', insertError.message);
      return json({ error: 'Too many linking requests. Wait a few seconds and try again.' }, 429);
    }

    return json({
      deepLink: `https://t.me/${botUsername}?start=${token}`,
      botUsername,
      expiresInSeconds: TOKEN_TTL_SECONDS,
    });
  }

  if (action === 'status') {
    const link = await readLink();
    const { data: tokenRows } = await supabase
      .from('telegram_link_tokens')
      .select('id')
      .eq('user_id', user.id)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .limit(1);
    const pending = !link && (tokenRows?.length ?? 0) > 0;
    return json({
      connected: Boolean(link),
      pending,
      alertsEnabled: link ? link.alerts_enabled !== false : false,
      chatIdMasked: link ? maskChatId(String(link.chat_id)) : null,
      linkedAt: link?.linked_at ?? null,
    });
  }

  if (action === 'set_enabled') {
    const enabled = payload.enabled === true;
    const link = await readLink();
    if (!link) return json({ error: 'Telegram is not connected yet.' }, 409);
    const { error: updateError } = await supabase
      .from('telegram_links')
      .update({ alerts_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (updateError) {
      console.error('telegram-link toggle failed:', updateError.message);
      return json({ error: 'Could not save your alert preference. Try again.' }, 422);
    }
    return json({ alertsEnabled: enabled });
  }

  if (action === 'test') {
    const link = await readLink();
    if (!link) return json({ error: 'Telegram is not connected yet.' }, 409);
    const delivered = await sendTelegramMessage(
      botToken,
      String(link.chat_id),
      '✅ Spend Desk test notification successful! Your Telegram alerts are connected.'
    );
    if (!delivered) {
      return json(
        { error: 'Telegram could not deliver the test message. Reconnect Telegram and try again.' },
        422
      );
    }
    return json({ delivered: true });
  }

  if (action === 'disconnect') {
    // Remove only THIS user's pending tokens and link; other users are untouched.
    await supabase
      .from('telegram_link_tokens')
      .delete()
      .eq('user_id', user.id)
      .is('used_at', null);
    const { error: deleteError } = await supabase
      .from('telegram_links')
      .delete()
      .eq('user_id', user.id);
    if (deleteError) {
      console.error('telegram-link disconnect failed:', deleteError.message);
      return json({ error: 'Could not disconnect Telegram. Try again.' }, 422);
    }
    return json({ disconnected: true });
  }

  return json({ error: 'Unknown action.' }, 400);
});
