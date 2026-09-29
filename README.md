# HillsByte Complete Reference Build

Full Next.js replacement UI based on the supplied HillsByte/Base44 reference screens.

User routes: `/`, `/earn`, `/activity`, `/wallet`, `/referrals`, `/community`, `/events`, `/leaderboard`, `/notifications`, `/profile`

Admin routes: `/admin`, `/admin/overview`, `/admin/analytics`, `/admin/tasks`, `/admin/proofs`, `/admin/withdrawals`, `/admin/payouts`, `/admin/ads`, `/admin/events`, `/admin/announcements`, `/admin/referrals`, `/admin/users`, `/admin/reviewers`, `/admin/permissions`, `/admin/moderation`, `/admin/telegram`

- No Gmail/Google sign-up flow.
- Currency selection changes display only; balance is kept as a base USD amount.
- Telegram initData verification is server-side and requires `TELEGRAM_BOT_TOKEN` in Vercel.
- Admin navigation and configuration UIs are included. Connect persistence to Supabase before production use.
