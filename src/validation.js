import crypto from 'node:crypto';

export function validateMaxInitData(appData, botToken, maxAgeSeconds = 86400) {
  if (!appData || !botToken) return { valid: false, reason: 'missing_data' };
  const pairs = appData.split('&').map((part) => {
    const idx = part.indexOf('=');
    return idx === -1 ? [part, ''] : [part.slice(0, idx), part.slice(idx + 1)];
  });
  const hashPairs = pairs.filter(([k]) => k === 'hash');
  if (hashPairs.length !== 1) return { valid: false, reason: 'hash_count' };
  const originalHash = hashPairs[0][1];

  const decoded = pairs
    .filter(([k]) => k !== 'hash')
    .map(([k, v]) => [k, decodeURIComponent(v)])
    .sort((a, b) => a[0].localeCompare(b[0]));

  const launchParams = decoded.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secretKey).update(launchParams).digest('hex');

  const a = Buffer.from(calculated, 'utf8');
  const b = Buffer.from(originalHash, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'bad_signature' };
  }

  const data = Object.fromEntries(decoded);
  if (data.auth_date) {
    const age = Math.floor(Date.now() / 1000) - Number(data.auth_date);
    if (!Number.isFinite(age) || age < -300 || age > maxAgeSeconds) {
      return { valid: false, reason: 'stale_auth_date' };
    }
  }

  let user = null;
  try { if (data.user) user = JSON.parse(data.user); } catch { /* ignore */ }
  return { valid: true, data, user };
}
