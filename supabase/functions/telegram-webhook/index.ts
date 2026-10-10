// SpendDesk — Telegram bot webhook receiver.
//
// Telegram POSTs every bot update here after `setWebhook`. Deploy this function
// with --no-verify-jwt (Telegram cannot send a Supabase JWT); instead it is
// authenticated with the bot's webhook secret token, validated against the
// TELEGRAM_WEBHOOK_SECRET secret. It only ever LINKS a chat to the user who
// requested a linking token — it never sends arbitrary messages.
//
// Flow: user clicks Connect Telegram -> telegram-connect returns a deep link
// t.me/<bot>?start=<token> -> user presses Start -> this function validates the
// single-use token and associates message.chat.id with that user's account.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const sendTelegramMessage = async (
  botToken: string,
  chatId: string,
  text: string
): Promise<void> => {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    /* best-effort reply */
  }
};

Deno.serve(async (request) => {
  // Telegram only ever POSTs; acknowledge everything else without leaking details.
  if (request.method !== 'POST') return new Response('ok');

  const expectedSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  const providedSecret = request.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response('Forbidden', { status: 403 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!supabaseUrl || !serviceRoleKey || !botToken) {
    console.error('telegram-webhook is missing required configuration.');
    return new Response('ok'); // never 5xx: Telegram retries on errors
  }

  let update: Record<string, any>;
  try {
    update = await request.json();
  } catch {
    return new Response('ok');
  }

  const message = update?.message;
  const text = typeof message?.text === 'string' ? message.text.trim() : '';
  const chatId = message?.chat?.id !== undefined && message?.chat?.id !== null
    ? String(message.chat.id)
    : '';
  const chatType = typeof message?.chat?.type === 'string' ? message.chat.type : '';

  // We only care about private-chat /start deep links; ignore everything else.
  if (!text.startsWith('/start') || !chatId || chatType !== 'private') {
    return new Response('ok');
  }

  // Service-role client: the webhook is a trusted server context (no user JWT).
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const arg = text.split(/\s+/)[1] || '';
  if (!arg) {
    await sendTelegramMessage(
      botToken,
      chatId,
      'Open Spend Desk → Settings → Automatic Alerts and tap “Connect Telegram”, then press Start here to link this chat.'
    );
    return new Response('ok');
  }

  const tokenHash = await sha256Hex(arg);
  const { data: tokenRow, error: tokenError } = await db
    .from('telegram_link_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  if (tokenRow && tokenRow.used_at) {
    await sendTelegramMessage(
      botToken,
      chatId,
      '⌛ This linking request was already used. Tap “Connect Telegram” in Spend Desk to generate a fresh one.'
    );
    return new Response('ok');
  }
  if (tokenError || !tokenRow || new Date(tokenRow.expires_at).getTime() < Date.now()) {
    await sendTelegramMessage(
      botToken,
      chatId,
      '⌛ This linking request is invalid or has expired. Tap “Connect Telegram” in Spend Desk and try again.'
    );
    return new Response('ok');
  }

  // A chat may belong to only ONE Spend Desk account (replay/duplicate protection).
  const { data: existingLink } = await db
    .from('telegram_links')
    .select('user_id')
    .eq('chat_id', chatId)
    .maybeSingle();
  if (existingLink && existingLink.user_id !== tokenRow.user_id) {
    await sendTelegramMessage(
      botToken,
      chatId,
      '⚠️ This Telegram chat is already connected to another Spend Desk account. Disconnect it there first, then try again.'
    );
    return new Response('ok');
  }

  // Claim the token first (single-use, guarded against concurrent replays).
  const { data: claimed, error: claimError } = await db
    .from('telegram_link_tokens')
    .update({ used_at: nowIso, linked_chat_id: chatId })
    .eq('id', tokenRow.id)
    .is('used_at', null)
    .select('id');
  if (claimError || !claimed || claimed.length === 0) {
    await sendTelegramMessage(
      botToken,
      chatId,
      '⌛ This linking request was already used. Tap “Connect Telegram” in Spend Desk to generate a fresh one.'
    );
    return new Response('ok');
  }

  // Associate (or re-associate) this user's account with this chat.
  const { error: upsertError } = await db.from('telegram_links').upsert(
    {
      user_id: tokenRow.user_id,
      chat_id: chatId,
      alerts_enabled: true,
      linked_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: 'user_id' }
  );
  if (upsertError) {
    console.error('telegram link upsert failed:', upsertError.message);
    await sendTelegramMessage(
      botToken,
      chatId,
      '⚠️ Something went wrong linking your account. Please try again from Spend Desk.'
    );
    return new Response('ok');
  }

  await sendTelegramMessage(
    botToken,
    chatId,
    '✅ Connected! Spend Desk will now send your transaction alerts to this chat.'
  );
  return new Response('ok');
});
