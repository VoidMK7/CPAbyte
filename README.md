# HillsByte Full-Stack Telegram Mini App

This project combines the original HillsByte visual direction with the persistent Express/SQLite/Supabase backend. It is designed for Render and Telegram Mini Apps.

Included:
- Large green-focused responsive UI and animated splash
- Earnings, activity filters, wallet and configurable withdrawal minimum
- Real tasks with create/edit/delete/activate/deactivate controls
- Proof submission and admin review/delete workflow
- Admin user search plus user profile/activity view
- Withdrawals, events, ads and announcements administration
- Community member chat with configurable channel/support links
- Live leaderboards with category and time-period filters
- Daily check-in controlled by an admin setting
- Profile language and currency settings
- HillsByte AI assistant endpoint
- Monetag SDK zone 11725898 integration
- SQLite persistence with optional Supabase Storage backup

## Render
Build: `npm install && npm run build`
Start: `npm start`

Set the environment variables in `.env.example`/`render.yaml`, especially `BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, and the Supabase variables used for durable backups.
