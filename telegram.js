import crypto from 'node:crypto';

function parseInitData(initData) {
  const params = new URLSearchParams(initData);
  const data = {};
  for (const [key, value] of params.entries()) data[key] = value;
  return data;
}

export function verifyTelegramInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) return { ok: false, error: 'Missing Telegram data or bot token.' };
  const data = parseInitData(initData);
  const receivedHash = data.hash;
  if (!receivedHash) return { ok: false, error: 'Missing Telegram hash.' };
  const authDate = Number(data.auth_date || 0);
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) {
    return { ok: false, error: 'Telegram authorization data expired.' };
  }
  delete data.hash;
  const checkString = Object.keys(data).sort().map((key) => `${key}=${data[key]}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  const valid = receivedHash.length === expectedHash.length && crypto.timingSafeEqual(Buffer.from(receivedHash), Buffer.from(expectedHash));
  if (!valid) return { ok: false, error: 'Invalid Telegram signature.' };
  let user = null;
  try { user = data.user ? JSON.parse(data.user) : null; } catch { return { ok: false, error: 'Invalid Telegram user payload.' }; }
  if (!user?.id) return { ok: false, error: 'Telegram user is missing.' };
  return { ok: true, user, startParam: data.start_param || null, authDate };
}
