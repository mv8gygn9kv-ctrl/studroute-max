import { getMe } from '../src/max-api.js';

try {
  const bot = await getMe();
  console.log('=== MAX BOT INFO ===');
  console.log(JSON.stringify(bot, null, 2));
} catch (err) {
  console.error('BOT INFO ERROR:', err.message);
}
