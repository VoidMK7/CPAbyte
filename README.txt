HILLSBYTE TELEGRAM + FIREBASE ADMIN PANEL

Files:
- admin/index.html       Admin dashboard
- firestore.rules        Example rules using Firebase Auth custom claim admin=true
- functions/index.js     Safe placeholder for backend functions
- functions/package.json Cloud Functions dependencies

SETUP:
1. Create an admin user in Firebase Authentication.
2. Give that user's Firebase UID the custom claim:
   admin: true
   This MUST be done from a trusted Admin SDK environment, never from the browser.
3. Deploy the firestore.rules after reviewing your existing app's document structure.
4. Host admin/index.html on a private/admin-only domain or HTTPS host.
5. The panel signs in with Firebase Auth and checks the admin custom claim.
6. For the Telegram Mini App, validate Telegram initData on a server/Cloud Function. Never trust initDataUnsafe.user as proof of identity.
7. Do not put your Telegram bot token in index.html or any client-side file.

IMPORTANT:
The UI is an admin console, but wallet calculations and approval side effects should be server-side.
The current submission review updates the submission status only. A production Cloud Function should atomically:
- verify the submission/user
- move pending balance to available on approval
- remove/release pending on rejection
- write an immutable activity record
- prevent double approval
- enforce task/reward limits
- record admin UID and timestamp

Likewise, withdrawals should be approved by trusted backend/payment code, not by client-side JavaScript.
