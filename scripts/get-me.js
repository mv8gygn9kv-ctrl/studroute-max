import { getMe } from '../src/max-api.js';
try {
  const me = await getMe();
  console.log(JSON.stringify({ user_id: me.user_id, first_name: me.first_name, username: me.username, is_bot: me.is_bot }, null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
