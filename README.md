# HillsByte — fixed full-stack build

This build keeps the dashboard content at a normal/medium scale and restores the hamburger menu to the **top-left**. The menu opens a side drawer and includes the Admin Panel when the signed-in Telegram account is listed in `ADMIN_TELEGRAM_IDS`.

## Important fixes
- React/Vite frontend is actually wired to the Express backend.
- Admin Panel is preserved and loads task/user/proof/withdrawal/ad/role controls.
- Withdrawal amount is selectable; partial withdrawals are supported.
- Backend validates minimum amount and available balance. `MIN_WITHDRAWAL` defaults to `$1`.
- AI endpoint falls back to the built-in assistant if OpenAI is not configured or temporarily fails.
- OpenAI requests have a timeout so the assistant does not hang forever.
- Monetag SDK `11725898` is included and the Ads page can invoke the supplied in-app ad function.
- Telegram webhook URL points to `https://cpabyte.onrender.com/api/telegram/webhook`.
- Fixed a duplicate backend function declaration that could stop Node from starting.

## Render
Build: `npm install && npm run build`
Start: `npm start`

Set the same environment variables you already use, especially `BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, Supabase variables, and optionally `OPENAI_API_KEY`.

Do not overwrite your production database or Supabase credentials.
