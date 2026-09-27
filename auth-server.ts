import { adminSupabase } from '@/lib/supabase-server';
import { verifyTelegramInitData } from '@/lib/telegram-server';

export async function requireAdmin(initData: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error('Telegram bot is not configured.');
  const checked = verifyTelegramInitData(initData, botToken);
  if (!checked.ok) throw new Error(`Telegram authentication failed: ${checked.reason}`);
  const sb = adminSupabase();
  const { data, error } = await sb.from('profiles').select('id,telegram_id,role,status').eq('telegram_id',String(checked.user.id)).single();
  if (error || !data || !['admin','moderator'].includes(data.role) || data.status !== 'active') throw new Error('Administrator permission required.');
  return { sb, telegramUser: checked.user, profile:data };
}
