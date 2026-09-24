## Supabase setup

Run `schema.sql` in the Supabase SQL editor.

The app intentionally uses the Supabase **service role only on the Node server**. Do not put the service role key into `public/`.

Task proof screenshots are stored in the private `task-proofs` bucket. The server uploads the image and creates a temporary signed URL for admins.

If you later want users to see their own proof history, add a server endpoint that checks the authenticated Telegram ID before returning a signed URL.
