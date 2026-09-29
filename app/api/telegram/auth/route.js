import { NextResponse } from 'next/server';
import { supabaseAdmin, userFromBearer } from '@/lib/supabase-server';
import { verifyTelegramInitData } from '@/lib/telegram';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const user = await userFromBearer(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }

    const { initData } = await request.json();

    const result = verifyTelegramInitData(
      initData,
      process.env.TELEGRAM_BOT_TOKEN
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    const tg = result.user;
    const db = supabaseAdmin();

    const { error } = await db
      .from('telegram_contacts')
      .upsert(
        {
          telegram_id: String(tg.id),
          username: tg.username || null,
          first_name: tg.first_name || null,
          last_name: tg.last_name || null,
          linked_user_id: user.id,
          last_seen_at: new Date().toISOString(),
          referral_code: result.startParam?.startsWith('ref_')
            ? result.startParam.slice(4)
            : null,
        },
        { onConflict: 'telegram_id' }
      );

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      telegramId: String(tg.id),
      startParam: result.startParam,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Telegram linking failed.' },
      { status: 500 }
    );
  }
}
