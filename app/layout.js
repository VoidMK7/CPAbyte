import Script from 'next/script';
import './globals.css';

export const metadata = {
  title: 'HillsByte — Rewards',
  description: 'Premium rewards, tasks, referrals and Telegram Mini App.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Script
          src="https://telegram.org/js/telegram-web-app.js?57"
          strategy="afterInteractive"
        />
        {children}
      </body>
    </html>
  );
}
