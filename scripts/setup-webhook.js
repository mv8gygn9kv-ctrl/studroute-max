import { setWebhook } from '../src/max-api.js';
const base = process.env.APP_BASE_URL?.replace(/\/$/, '');
const secret = process.env.WEBHOOK_SECRET;
if (!base || !base.startsWith('https://')) {
  console.error('APP_BASE_URL must be an https:// URL');
  process.exit(1);
}
if (!secret || !/^[A-Za-z0-9_-]{5,256}$/.test(secret)) {
  console.error('WEBHOOK_SECRET must be 5-256 chars: A-Z a-z 0-9 _ -');
  process.exit(1);
}
try {
  const result = await setWebhook(`${base}/webhook`, secret);
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
