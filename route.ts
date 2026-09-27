import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase-server';

export async function POST(req: Request) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) return NextResponse.json({error:'unauthorized'},{status:401});
  try {
    const update = await req.json();
    const cm = update?.chat_member;
    const user = cm?.new_chat_member?.user;
    const chatId = String(cm?.chat?.id ?? '');
    if (user && chatId && process.env.TELEGRAM_CHANNEL_ID && chatId === String(process.env.TELEGRAM_CHANNEL_ID)) {
      const status = cm.new_chat_member.status;
      const isMember = ['member','administrator','creator'].includes(status);
      const sb = adminSupabase();
      await sb.from('profiles').update({channel_member:isMember, channel_checked_at:new Date().toISOString()}).eq('telegram_id',String(user.id));
    }
    return NextResponse.json({ok:true});
  } catch (e) { return NextResponse.json({error:e instanceof Error?e.message:'Webhook error'},{status:500}); }
}
