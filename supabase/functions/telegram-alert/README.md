# SpendDesk Telegram alerts

The browser calls this Edge Function after a new transaction is saved. The bot token is deliberately stored only as a Supabase secret, never in the web app or local storage.

## One-time setup

1. Create a Telegram bot with [@BotFather](https://t.me/BotFather), then copy its token.
2. Deploy this function from the project root: `supabase functions deploy telegram-alert`.
3. Save the token: `supabase secrets set TELEGRAM_BOT_TOKEN=your_token_here`.
4. In Telegram, open the new bot and send `/start`.
5. Obtain the numeric chat ID from `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` after `/start`, then paste it into SpendDesk Settings → Alerts → Telegram.

The alert sender must be signed in. SpendDesk keeps the selected chat ID in that user's locally scoped settings; the Telegram bot token is never exposed to the browser.
