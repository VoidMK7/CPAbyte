# HillsByte deployment checklist

1. Create a Supabase project and run `supabase/schema.sql` in SQL Editor.
2. Create the required Storage buckets for profile and proof media and add authenticated/RLS policies appropriate to the final auth flow.
3. Create the Telegram bot and make it an administrator of the HillsByte channel.
4. Configure the Mini App URL to the Vercel deployment.
5. Configure the Telegram webhook for `/api/telegram/webhook` and use `TELEGRAM_WEBHOOK_SECRET`.
6. Add all variables from `.env.example` to Vercel Project Settings. Never commit `.env.local` or a service-role key.
7. Put the first administrator's Telegram ID in `ADMIN_TELEGRAM_IDS` and seed that user's `profiles.role='admin'` after first authentication.
8. Deploy from GitHub. Vercel auto-detects the Next.js framework.
9. After deployment, open the Mini App inside Telegram and verify: Telegram auth, channel membership, webhook leave/join updates, task proof submission/review, admin permissions, withdrawals, community moderation, events, and profile media.
10. For financial withdrawals, connect an appropriate regulated payout provider and keep all provider credentials server-side. The repository does not contain a live payout provider or payment secret.
