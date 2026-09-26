// Интеграционный тест: реальный сервер + имитация MAX Bot API.
// Проверяет цепочку webhook → бот → POST /messages без обращения к настоящему MAX.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

async function waitFor(fn, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('timeout');
}

test('webhook handles bot_started and message_created end to end', async (t) => {
  const calls = [];
  let rejectOpenApp = false;
  const maxMock = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/me') return res.end(JSON.stringify({ user_id: 42, username: 't659_hakaton_max_bot', is_bot: true }));
    if (req.url.startsWith('/messages') && rejectOpenApp && JSON.stringify(body).includes('open_app')) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ code: 'proto.payload', message: 'bad button' }));
    }
    res.end(JSON.stringify({ success: true }));
  });
  const mockPort = await listen(maxMock);

  const appPort = 18000 + Math.floor(Math.random() * 1000);
  const app = spawn(process.execPath, ['src/server.js'], {
    env: {
      ...process.env,
      PORT: String(appPort),
      BOT_TOKEN: 'test-token',
      BOT_MODE: 'webhook',
      WEBHOOK_SECRET: 'test_secret',
      MAX_API_BASE: `http://127.0.0.1:${mockPort}`,
      APP_BASE_URL: 'https://studroute-max.onrender.com',
    },
    stdio: 'pipe',
  });
  t.after(() => { app.kill(); maxMock.close(); });

  const base = `http://127.0.0.1:${appPort}`;
  await waitFor(async () => (await fetch(`${base}/health`).catch(() => null))?.ok);
  await waitFor(() => calls.some((c) => c.url === '/me/commands'));

  const post = (update, secret = 'test_secret') => fetch(`${base}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Max-Bot-Api-Secret': secret },
    body: JSON.stringify(update),
  });

  const denied = await post({ update_type: 'bot_started', user: { user_id: 1 } }, 'wrong');
  assert.equal(denied.status, 401);

  const ok = await post({ update_type: 'bot_started', user: { user_id: 1 }, user_locale: 'ru' });
  assert.equal(ok.status, 200);
  const welcome = await waitFor(() => calls.find((c) => c.url.startsWith('/messages?user_id=1')));
  assert.equal(welcome.auth, 'test-token');
  const welcomeButtons = welcome.body.attachments[0].payload.buttons.flat();
  assert.equal(welcomeButtons.length, 7);
  assert.equal(welcomeButtons[0].type, 'open_app');

  const before = calls.length;
  await post({ update_type: 'message_created', message: { sender: { user_id: 2 }, body: { text: '🔗 Официальные источники' } } });
  const sources = await waitFor(() => calls.slice(before).find((c) => c.url.startsWith('/messages?user_id=2')));
  assert(sources.body.attachments[0].payload.buttons.flat().some((b) => b.type === 'link'));

  rejectOpenApp = true;
  const before2 = calls.length;
  await post({ update_type: 'message_created', message: { sender: { user_id: 3 }, body: { text: '/start' } } });
  const retried = await waitFor(() => {
    const sent = calls.slice(before2).filter((c) => c.url.startsWith('/messages?user_id=3'));
    return sent.length >= 2 ? sent : null;
  });
  const fallbackOpen = retried[1].body.attachments[0].payload.buttons.flat()[0];
  assert.equal(fallbackOpen.type, 'link');
  assert.equal(fallbackOpen.url, 'https://studroute-max.onrender.com');
});
