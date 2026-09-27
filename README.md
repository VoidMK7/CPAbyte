# HillsByte Telegram Mini App

Production-oriented Next.js + Supabase Telegram Mini App for HillsByte task earning, proof review, referrals, ads, community, events, withdrawals, reviewer roles and admin analytics.

## Stack
- Next.js App Router + TypeScript
- Supabase Postgres, Storage, Realtime and Row Level Security
- Telegram Mini App `initData` authentication
- Telegram Bot API channel-membership checks and ChatMemberUpdated webhook
- Vercel deployment

## Run locally
1. Copy `.env.example` to `.env.local` and fill the values.
2. Run the SQL in `supabase/schema.sql` in Supabase SQL Editor.
3. `npm install`
4. `npm run build`
5. `npm run dev`

## Telegram setup
- Create a bot with BotFather.
- Add it as an administrator of the target channel with permission to view members.
- Set the Mini App URL to the Vercel deployment URL.
- Configure the webhook to `https://YOUR_DOMAIN/api/telegram/webhook` with the same `TELEGRAM_WEBHOOK_SECRET`.
- The app validates Telegram `initData` server-side; the browser does not trust Telegram identity fields by itself.

## Supabase
The schema enables RLS and keeps Telegram identity immutable. The service-role key is only used in server-side route handlers and must never be exposed as a `NEXT_PUBLIC_*` variable.

## Vercel
Import the repository into Vercel. Vercel natively supports Next.js and deploys App Router route handlers/serverless APIs. Add the environment variables from `.env.example` in Project Settings before production use.

## Validation notes
This repository intentionally contains no hard-coded Supabase or Telegram secrets. The database schema is idempotent for tables/types and uses guarded policy creation. `next build` should be run after `npm install` in an environment with registry access; the current build environment did not have the npm packages cached, so a full dependency build could not be executed here.
