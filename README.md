# HillsByte Telegram Mini App

A dark Telegram Mini App + Node/Express backend for task-based earning.

## Included

- Pure black + light dark-green interface.
- Telegram Mini App bootstrap.
- Task marketplace.
- Per-task total cap up to 1,000.
- Per-task daily cap up to 200 (admin input is clamped server-side).
- A user can submit a task only once.
- Per-task countdown timer starts when the user starts the task.
- Up to 4 screenshot uploads.
- Manual admin approval/rejection with an admin submissions queue.
- $1 minimum withdrawal.
- Bank payout details.
- USDT payout details with BEP20/TRC20/TON.
- Referral qualification after 5 approved tasks.
- 10% referral earnings after qualification.
- 20 HC bonus on the first approved task of a qualifying referral.
- Promo-code redemption.
- User ban/unban.
- Admin withdrawal review.
- Admin task creation with task image/logo URLs.
- Render deployment configuration.

## Important production notes

### 1. Telegram membership verification

Set `BOT_TOKEN` and `CHANNEL_USERNAME`. For a production launch, add a Telegram `getChatMember` check in `/api/bootstrap` before allowing access. Telegram requires the bot to have suitable access to the channel to reliably verify membership.

When both BOT_TOKEN and CHANNEL_USERNAME are configured, the server checks Telegram WebApp initData and verifies channel membership with getChatMember. A demo mode remains available when no BOT_TOKEN is configured.

### 2. Ad gate

The UI contains a configurable sponsor/ad gate, but it deliberately does **not** force a user to click an external ad or fake an ad click. If you use an ad network, integrate its official rewarded-ad callback/verification API and only unlock the task after the network confirms completion. This avoids invalid-click/ad-fraud behavior and protects your publisher account.

### 3. Persistent storage on Render

The included SQLite database is fine for development and small tests, but Render's normal ephemeral filesystem can lose local files after redeploy/restart. For real balances, withdrawals, screenshots and users, use a persistent disk or migrate the database to PostgreSQL/object storage.

### 4. Admin authentication

`ADMIN_TELEGRAM_IDS` is an allowlist of Telegram IDs. For production, add Telegram init-data signature verification before trusting `telegramId` supplied by the browser.

## Local run

```bash
npm install
npm run dev
```

For production:

```bash
npm install
npm run build
npm start
```

## Render

1. Push this folder to GitHub.
2. Create a Render Web Service from the repository.
3. Render will use `render.yaml`, or enter:
   - Build: `npm install && npm run build`
   - Start: `npm start`
4. Add environment variables:
   - `BOT_TOKEN`
   - `ADMIN_TELEGRAM_IDS`
   - `CHANNEL_USERNAME`
5. Set your Telegram bot's Mini App/Web App URL to the Render URL.

## Bot setup

Use BotFather to create the bot and add a menu button/web app URL. The Mini App itself is served by this project; BotFather does not store your task database or admin panel.

## API admin workflow

The starter exposes:
- `GET /api/admin/tasks`
- `POST /api/admin/tasks`
- `GET /api/admin/users`
- `POST /api/admin/users/:id/ban`
- `POST /api/admin/users/:id/unban`
- `POST /api/admin/users/:id/message`
- `GET /api/admin/submissions`
- `POST /api/admin/submissions/:id`
- `GET /api/admin/withdrawals`
- `POST /api/admin/withdrawals/:id`
- `GET /api/admin/promos`
- `POST /api/admin/promos`

For the admin UI, the current starter focuses on task/user/withdrawal management. Add a submission-review screen and Telegram init-data verification before public launch.


## Important production persistence note

HillsByte currently uses SQLite at `DB_PATH` (default `./data/hillsbyte.db`). The application
code is persistent, but Render Free's local filesystem is not guaranteed to survive service
recreation/redeploys. For production, move the database to a persistent database service
(e.g. PostgreSQL/Supabase) and move `/uploads` to persistent object storage. Do not treat a
Render local SQLite file as the permanent source of truth.

## Task behavior

- Opening a task does not consume a slot.
- Leaving a task does not reject it.
- Only an approved submission increments `total_completed` and the daily slot counter.
- Rejected submissions remain in history and can be retried.
- A task remains visible when its daily limit is reached and shows `Daily slots full`;
  it becomes startable again when the daily counter resets.
