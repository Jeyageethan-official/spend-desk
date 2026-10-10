# SpendDesk Telegram alerts + deep-link connection

SpendDesk never keeps the bot token in the browser. Three Edge Functions work together:

| Function | Auth | Purpose |
| --- | --- | --- |
| `telegram-connect` | user session (JWT) | create linking token, status, alert toggle, test message, disconnect |
| `telegram-webhook` | Telegram webhook secret | links a chat to the user who requested a token when they press **Start** |
| `telegram-alert` | user session (JWT) | sends transaction alerts to the sender's own linked chat (legacy client chat ID only as fallback) |

## One-time setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. Apply the database migration `supabase/migrations/20261009120000_create_telegram_links.sql`
   (creates `telegram_links` + `telegram_link_tokens` with RLS and rate limits).
3. Deploy the functions from the project root:
   ```sh
   supabase functions deploy telegram-connect
   supabase functions deploy telegram-alert
   supabase functions deploy telegram-webhook --no-verify-jwt
   ```
4. Set the secrets:
   ```sh
   supabase secrets set \
     TELEGRAM_BOT_TOKEN=your_bot_token \
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
     TELEGRAM_WEBHOOK_SECRET=a_long_random_string \
     TELEGRAM_BOT_USERNAME=your_bot_username
   ```
   - `TELEGRAM_BOT_USERNAME` is optional: without it the functions resolve the real
     username from the bot itself (`getMe`). Never invent a username.
   - `SUPABASE_SERVICE_ROLE_KEY` is used **only** inside `telegram-webhook` and never
     leaves the server.
5. Register the webhook (once):
   ```sh
   curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook" \
     -d "url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

## User flow

1. Settings → Automatic Alerts → **Connect Telegram**.
2. The app opens `https://t.me/<bot>?start=<token>` (single-use token, 5-minute expiry,
   stored only as a SHA-256 hash server-side).
3. The user presses **Start** in Telegram; the webhook links that chat to the signed-in
   SpendDesk account and the app flips to **Connected** automatically.
4. **Enable transaction alerts** persists per user (`telegram_links.alerts_enabled`);
   disabling stops new alerts without disconnecting. **Send Test Alert** delivers a real
   message through the bot. **Disconnect Telegram** removes only that user's link.

The alert sender must be signed in. Chat IDs of other users, bot tokens, service keys and
webhook secrets are never returned to any client.
