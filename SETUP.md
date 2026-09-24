# Quick setup

## 1. Install
`npm install`

## 2. Build
`npm run build`

## 3. Seed demo task
`node server/seed.js`

## 4. Start
`npm start`

## 5. Telegram
In BotFather, create/configure a bot and add the deployed URL as its Mini App/Menu Button.

Set:
`BOT_TOKEN=...`
`ADMIN_TELEGRAM_IDS=123456789`
`CHANNEL_USERNAME=@yourchannel`

## 6. First admin
Open the Mini App using an admin Telegram account whose numeric ID is in `ADMIN_TELEGRAM_IDS`.

## 7. Production hardening
Before accepting real money:
- verify Telegram WebApp initData cryptographically;
- enforce channel membership using Telegram Bot API;
- move balances and submissions to durable Postgres/object storage;
- add CSRF/origin checks and rate limits;
- add a real submission-review screen;
- integrate a legitimate rewarded-ad SDK with server-side completion verification;
- add payout provider/API integration and audit logs.

## Monetag sponsor ads

This build includes the Monetag SDK tag for zone 11725898 in `index.html`.

- The Ads tab has a separate `Watch sponsor ad` action using the Rewarded Interstitial (`show_11725898()`).
- A task with `ad_enabled` set to true requires one successful sponsor-ad step before its real task attempt starts.
- The sponsor step is recorded once per user/task, so reopening the same task does not show the sponsor gate again.
- A failed/no-fill ad does not unlock the task.
- The optional admin ad settings still control whether sponsor ads are enabled and the daily/cooldown limits.

The server records the completion signal returned by the Monetag SDK. For cash rewards that require authoritative verification, configure a Monetag postback as documented by Monetag rather than relying only on the client-side callback.
