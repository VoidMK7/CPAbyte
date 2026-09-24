# HillsByte — rebuilt Telegram Mini App

This rebuild uses the original HillsByte demo visual foundation (splash, dark green UI, drawer, bottom navigation, dashboard, earn, activity, wallet, referrals, community, events, leaderboard, notifications, profile and AI entry point) and connects it to the full Express/SQLite/Supabase backend.

## Render
- Build: `npm install && npm run build`
- Start: `npm start`
- Root page: `/index.html`
- Health: `/health`

## Important environment variables
Set `BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, and the Supabase variables in Render. Never put the service-role key in frontend files.
