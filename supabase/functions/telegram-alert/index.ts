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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Sign in is required for Telegram alerts.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!supabaseUrl || !supabaseAnonKey || !botToken) {
    console.error('Telegram alert function is missing required configuration.');
    return json({ error: 'Telegram alerts are not configured yet.' }, 503);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return json({ error: 'Invalid sign-in session.' }, 401);

  let payload: { chatId?: unknown; title?: unknown; message?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const chatId = typeof payload.chatId === 'string' ? payload.chatId.trim() : '';
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!/^-?\d{4,20}$/.test(chatId) || !message || message.length > 3500) {
    return json({ error: 'Invalid Telegram alert details.' }, 400);
  }

  // Ensure there is only ONE '[SpendDesk Alert]' header at the very top.
  // Strip any leading titles (with or without markdown, brackets, or duplicates)
  let cleanMessage = message.trim();
  cleanMessage = cleanMessage.replace(/^(\*?\[?SpendDesk Alert\]?\*?\s*\n+)+/i, '');
  const textToSend = `[SpendDesk Alert]\n${cleanMessage}`;

  const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: textToSend }),
  });
  const telegramData = await telegramResponse.json();
  if (!telegramResponse.ok || !telegramData.ok) {
    console.error('Telegram send failed:', telegramData);
    return json({ error: 'Telegram could not deliver the alert. Start the bot first and check the chat ID.' }, 422);
  }

  return json({ delivered: true });
});
