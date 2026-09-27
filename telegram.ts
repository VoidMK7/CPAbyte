export type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string } };
  MainButton?: { show:()=>void; hide:()=>void; setText:(t:string)=>void; onClick:(cb:()=>void)=>void };
};

declare global { interface Window { Telegram?: { WebApp?: TelegramWebApp } } }

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}
