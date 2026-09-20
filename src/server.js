import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRoute, getRulesMeta, getSources } from './rules-engine.js';
import { validateMaxInitData } from './validation.js';
import { initBot, processUpdate, startPolling } from './bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const port = Number(process.env.PORT || 8080);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(data);
}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 256 * 1024) throw new Error('payload_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function staticFile(reqPath, res) {
  const safe = path.normalize(reqPath === '/' ? '/index.html' : reqPath).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(publicDir, safe);
  if (!filePath.startsWith(publicDir)) return false;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const ext = path.extname(filePath);
  const data = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': mime[ext] || 'application/octet-stream',
    'Content-Length': data.length,
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self' https://st.max.ru; script-src 'self' https://st.max.ru; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: https:; frame-ancestors https://max.ru https://*.max.ru",
  });
  res.end(data);
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true, service: 'studroute-max', version: '0.1.0' });
    }

    if (req.method === 'GET' && url.pathname === '/api/meta') {
      return json(res, 200, { ...getRulesMeta(), demo_allowed: process.env.ALLOW_DEMO === 'true' });
    }

    if (req.method === 'GET' && url.pathname === '/api/sources') {
      return json(res, 200, { sources: getSources() });
    }

    if (req.method === 'POST' && url.pathname === '/api/route') {
      const body = await readJson(req);
      const route = buildRoute(body.profile || body);
      return json(res, route.ok ? 200 : 400, route);
    }

    if (req.method === 'POST' && url.pathname === '/api/validate') {
      const body = await readJson(req);
      if (!process.env.BOT_TOKEN && process.env.ALLOW_DEMO === 'true') {
        return json(res, 200, { valid: true, demo: true, user: { first_name: 'Демо' } });
      }
      const result = validateMaxInitData(body.initData, process.env.BOT_TOKEN);
      return json(res, result.valid ? 200 : 401, result);
    }

    if (req.method === 'POST' && url.pathname === '/webhook') {
      const secret = process.env.WEBHOOK_SECRET;
      if (secret && req.headers['x-max-bot-api-secret'] !== secret) {
        return json(res, 401, { ok: false });
      }
      const update = await readJson(req);
      json(res, 200, { ok: true });
      processUpdate(update).catch((err) => console.error('[webhook]', err.message));
      return;
    }

    if (req.method === 'GET' && staticFile(url.pathname, res)) return;
    json(res, 404, { error: 'not_found' });
  } catch (err) {
    console.error('[server]', err);
    json(res, err.message === 'payload_too_large' ? 413 : 400, { error: err.message || 'bad_request' });
  }
});

server.listen(port, async () => {
  console.log(`[server] listening on :${port}`);
  await initBot();
  if (process.env.BOT_MODE === 'polling' && process.env.BOT_TOKEN) {
    startPolling().catch((err) => console.error('[bot] fatal polling error:', err));
  }
});
