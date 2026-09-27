import crypto from 'node:crypto';

export function verifyTelegramInitData(initData: string, botToken: string, maxAgeSeconds = 86400) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date') || 0);
  if (!hash || !authDate) return { ok: false as const, reason: 'missing_hash_or_date' };
  if (Date.now() / 1000 - authDate > maxAgeSeconds) return { ok: false as const, reason: 'expired' };
  params.delete('hash');
  const dataCheckString = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  const safe = Buffer.from(calculated, 'hex');
  const supplied = Buffer.from(hash, 'hex');
  if (safe.length !== supplied.length || !crypto.timingSafeEqual(safe, supplied)) return { ok: false as const, reason: 'bad_hash' };
  const rawUser = params.get('user');
  if (!rawUser) return { ok: false as const, reason: 'missing_user' };
  try { return { ok: true as const, user: JSON.parse(rawUser) as {id:number; first_name?:string; last_name?:string; username?:string; photo_url?:string} }; }
  catch { return { ok: false as const, reason: 'bad_user_json' }; }
}

export async function telegramApi(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body), cache:'no-store' });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data.result;
}
