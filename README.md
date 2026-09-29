# HillsByte v3

This replacement follows the supplied HillsByte/Base44 video reference: user dashboard, wallet, earn, activity, referrals, community, profile/settings, leaderboards, notifications, and a large Admin Control Center with dashboard/overview/analytics/tasks/proofs/withdrawals/payouts/ads/events/announcements/referral/users/reviewers/permissions/moderation/Telegram/redeem-code screens.

## Important
- Gmail sign-up is removed from this UI.
- Currency is presentation-only: the underlying balance remains stored in the base currency and is never replaced when the display currency changes.
- Telegram Web App identity is detected client-side. For production, configure server-side `initData` verification and persist users/settings in Supabase; the UI in this package is intentionally self-contained so it can preview immediately.
- Admin controls shown here are real UI controls with local state; connect them to your Supabase tables/API before production financial use.

## Deploy
`npm install && npm run build`
