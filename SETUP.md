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
