// Кнопки «Открыть официальный источник» должны быть рабочими ссылками на https-страницы
// из data/sources.json — и в mini-app, и в боте.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isSafeUrl, linkButtonHtml, shouldUseBridge } from '../public/links.js';
import { getRules, getSources } from '../src/rules-engine.js';
import { buildReplies, resetBotState, setBotInfo } from '../src/bot.js';
import { texts } from '../src/bot-texts.js';

const sourceUrls = new Set(getSources().map((s) => s.url));

test('link button is a real https link that opens a new page', () => {
  const url = 'https://unecon.ru/mezhdunarodnye-svyazi/';
  const html = linkButtonHtml(url, 'Открыть официальный источник');
  assert.match(html, /^<a /);
  assert(html.includes(`href="${url}"`));
  assert(html.includes('target="_blank"'));
  assert(html.includes('rel="noopener noreferrer"'));
  assert(html.includes(`data-url="${url}"`));
});

test('unsafe URLs never become links', () => {
  for (const url of ['http://example.com', 'javascript:alert(1)', '', null, 'https://a b', 'https://x"onmouseover="y']) {
    assert.equal(isSafeUrl(url), false, String(url));
    assert.equal(linkButtonHtml(url, 'x'), '');
  }
});

test('MAX Bridge is used only inside MAX', () => {
  assert.equal(shouldUseBridge(undefined), false);
  assert.equal(shouldUseBridge({ openLink() {} }), false, 'browser: bridge script loaded, no initData');
  assert.equal(shouldUseBridge({ initData: 'query_id=1', openLink() {} }), true);
  assert.equal(shouldUseBridge({ initData: 'query_id=1' }), false);
});

test('every source is https and every rule points to an existing user source', () => {
  for (const s of getSources()) assert(isSafeUrl(s.url), s.id);
  const byId = Object.fromEntries(getSources().map((s) => [s.id, s]));
  for (const rule of getRules()) {
    const src = byId[rule.source_id];
    assert(src, `${rule.id}: unknown source ${rule.source_id}`);
    assert.equal(src.audience, 'user', `${rule.id} must cite a user-facing source`);
  }
});

test('mini-app renders every source button through linkButtonHtml', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert(!/<button[^>]*data-url/.test(app), 'source buttons must be <a href>, not <button>');
  const openSourceUses = app.match(/t\('openSource'\)/g) || [];
  const linkUses = app.match(/linkButtonHtml\([^)]*t\('openSource'\)/g) || [];
  assert(openSourceUses.length >= 4, 'cards, event view, help and sources');
  assert.equal(linkUses.length, openSourceUses.length);
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert(html.includes('id="eventSource"'), 'event view has a source link slot');
});

test('bot source buttons are link buttons to official pages in every language', () => {
  setBotInfo({ username: 't659_hakaton_max_bot', user_id: 42 });
  for (const lang of ['ru', 'en', 'zh']) {
    for (const action of ['arrival', 'changes', 'sources']) {
      resetBotState();
      const { replies } = buildReplies({ update_type: 'message_created', message: { sender: { user_id: 1 }, body: { text: texts[lang].menu[action] } } });
      const buttons = replies.flatMap((r) => (r.attachments || []).flatMap((a) => a.payload.buttons.flat()));
      const links = buttons.filter((b) => b.type === 'link' && sourceUrls.has(b.url));
      assert(links.length > 0, `${lang}:${action} has no source link`);
      for (const b of buttons.filter((x) => x.text === texts[lang].openSource)) {
        assert.equal(b.type, 'link', `${lang}:${action}`);
        assert(isSafeUrl(b.url));
      }
    }
  }
});
