# Browser preview

This project is a Next.js App Router application and can be opened directly in a normal browser as well as inside Telegram.

After deployment to Vercel, open the deployment URL in Chrome/Firefox/Safari. Telegram-only authentication is used only when the page is launched inside Telegram; the UI itself does not require Telegram to render.

Vercel settings:
- Framework Preset: Next.js
- Build Command: `npm run build`
- Development Command: `npm run dev`
- Output Directory: leave empty/default
- Root Directory: `/`

Do not configure `dist` as the output directory; `dist` is a Vite-style output and is not used by this Next.js project.
