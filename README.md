# HillsByte Telegram Mini App

This is the HillsByte rebuild based on the supplied CPABYTE/HillsByte screenshots. It is a real React + Express + Supabase application structure, not a static screenshot mockup.

## Stack
- React + Vite
- Express on Vercel
- Supabase Postgres + private Storage
- Telegram Web App signed `initData` authentication
- Telegram Bot API channel membership checking
- Private proof uploads in Supabase Storage

Vercel supports Express with zero-configuration backend deployment. Supabase signed upload URLs are used so proof images do not need to live on the Vercel filesystem.

## Environment variables
Set these in Vercel Project Settings → Environment Variables:

`SUPABASE_URL`
`SUPABASE_SERVICE_ROLE_KEY`
`BOT_TOKEN`
`ADMIN_TELEGRAM_IDS` comma-separated Telegram IDs
`CHANNEL_USERNAME` such as `@yourchannel`
`BOT_USERNAME` such as `YourHillsByteBot`

Keep `SUPABASE_SERVICE_ROLE_KEY` and `BOT_TOKEN` server-only. Never put them in frontend code.

## Telegram channel check
The bot must be an administrator of the channel for reliable `getChatMember` checks. The Bot API documents that `getChatMember` is guaranteed for other users when the bot is an administrator.

## Monetag
The Ads screen is wired to zone `11725898` / `show_11725898` if that script is present in the Mini App. Keep the ad script configured in the HTML/bot environment according to your Monetag setup.

## Supabase
The supplied `schema.sql` describes the database. The connected Hillsbyte Supabase project has already been prepared with the core tables and private buckets:
- hillsbyte-proofs
- hillsbyte-avatars
- hillsbyte-media

## Design
The mobile UI follows the screenshots:
- dark near-black green background
- HillsByte header with menu and notification badge
- 4-column quick-action grid
- five-item bottom navigation: Earn / Ads / Wallet / Community / Profile
- dashboard, activity charts, admin cards, event editor and proof review modal
- proof rejection with custom optional reason
- admin view preserves Telegram username + Telegram ID
- user-defined in-app username is separate
- suspension count reaches deactivation on the fifth suspension

## Important production notes
The payout/reward rules are server-side settings. The browser is never trusted for reward amounts.
Before real-money use, add your payment processor/bank payout integration and your operational compliance checks. The current withdrawal route creates an auditable pending withdrawal record; it does not automatically send money to a bank or crypto network.
