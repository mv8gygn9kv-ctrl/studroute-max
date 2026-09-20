const BASE = process.env.MAX_API_BASE || 'https://platform-api2.max.ru';

function token() {
  const t = process.env.BOT_TOKEN;
  if (!t) throw new Error('BOT_TOKEN is not set');
  return t;
}

async function request(path, options = {}, retry = 1) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: token(),
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(25000),
  });
  if (res.status === 429 && retry > 0) {
    await new Promise((r) => setTimeout(r, 900));
    return request(path, options, retry - 1);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`MAX API ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

export function getMe() {
  return request('/me', { method: 'GET' });
}

export function setCommands(commands) {
  return request('/me/commands', { method: 'PATCH', body: JSON.stringify({ commands }) });
}

export function sendMessage(userId, text, attachments = []) {
  const params = new URLSearchParams({ user_id: String(userId) });
  return request(`/messages?${params}`, {
    method: 'POST',
    body: JSON.stringify({ text, attachments, format: 'markdown' }),
  });
}

export function getUpdates(marker = null) {
  const params = new URLSearchParams({ timeout: '30', limit: '100', types: 'bot_started,message_created' });
  if (marker != null) params.set('marker', String(marker));
  return request(`/updates?${params}`, { method: 'GET' });
}

export function setWebhook(url, secret) {
  return request('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      url,
      update_types: ['bot_started', 'message_created'],
      secret,
    }),
  });
}
