import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReplies, normalize, resetBotState, resolveIntent, setBotInfo } from '../src/bot.js';
import { texts } from '../src/bot-texts.js';

const started = (userId = 1, locale) => ({ update_type: 'bot_started', user: { user_id: userId }, user_locale: locale });
const message = (text, userId = 1) => ({
  update_type: 'message_created',
  message: { sender: { user_id: userId, is_bot: false }, body: { text } },
});

function buttons(reply) {
  return reply.attachments.flatMap((a) => a.payload.buttons.flat());
}

test.beforeEach(() => {
  resetBotState();
  setBotInfo({ username: 't659_hakaton_max_bot', user_id: 42 });
});

test('bot_started sends welcome with the full seven-button menu', () => {
  const { userId, replies } = buildReplies(started());
  assert.equal(userId, 1);
  assert.equal(replies.length, 1);
  const labels = buttons(replies[0]).map((b) => b.text);
  for (const label of Object.values(texts.ru.menu)) assert(labels.includes(label), `missing ${label}`);
  const open = buttons(replies[0]).find((b) => b.text === texts.ru.menu.open);
  assert.equal(open.type, 'open_app');
  assert.equal(open.web_app, 't659_hakaton_max_bot');
});

test('every menu button is recognised in every language', () => {
  for (const lang of ['ru', 'en', 'zh']) {
    for (const [action, label] of Object.entries(texts[lang].menu)) {
      assert.deepEqual(resolveIntent(label), { action, lang }, `${lang}:${label}`);
    }
  }
});

test('every menu action produces a non-empty reply with a way back', () => {
  for (const label of Object.values(texts.ru.menu)) {
    const { replies } = buildReplies(message(label));
    assert.equal(replies.length, 1, label);
    assert(replies[0].text.length > 20, label);
    assert(buttons(replies[0]).length > 0, label);
  }
});

test('legacy commands keep working', () => {
  assert.equal(resolveIntent('/start').action, 'welcome');
  assert.equal(resolveIntent('/help').action, 'help');
  assert.equal(resolveIntent('/sources').action, 'sources');
  assert.equal(resolveIntent('/demo').action, 'demo');
  assert.deepEqual(resolveIntent('/zh'), { action: 'setLang', lang: 'zh' });
});

test('language choice is remembered and changes the menu', () => {
  buildReplies(message('中文'));
  const { replies } = buildReplies(message('/menu'));
  const labels = buttons(replies[0]).map((b) => b.text);
  assert(labels.includes(texts.zh.menu.open));
  assert(!labels.includes(texts.ru.menu.open));
});

test('user locale selects the initial language', () => {
  const { replies } = buildReplies(started(7, 'en-US'));
  assert(replies[0].text.includes('StudRoute'));
});

test('sources are link buttons with https URLs and no raw URL in text', () => {
  const { replies } = buildReplies(message(texts.ru.menu.sources));
  const links = buttons(replies[0]).filter((b) => b.type === 'link');
  assert(links.length >= 2);
  for (const b of links) assert.match(b.url, /^https:\/\//);
  assert(!/https?:\/\//.test(replies[0].text));
});

test('after-arrival checklist comes from rules and has no invented deadline', () => {
  const { replies } = buildReplies(message(texts.ru.menu.arrival));
  const text = replies[0].text;
  assert(text.includes('3 рабочих дня после въезда'));
  assert(text.includes('без установленного срока'));
  assert(text.includes('90 календарных дней'));
});

test('without bot info the open button falls back to the mini-app link', () => {
  resetBotState();
  const { replies } = buildReplies(started());
  const open = buttons(replies[0]).find((b) => b.text === texts.ru.menu.open);
  assert.equal(open.type, 'link');
  assert.match(open.url, /^https:\/\//);
});

test('messages from bots and updates without user are ignored', () => {
  assert.equal(buildReplies({ update_type: 'message_created', message: { sender: { user_id: 5, is_bot: true }, body: { text: 'hi' } } }).replies.length, 0);
  assert.equal(buildReplies({ update_type: 'message_created' }).replies.length, 0);
});

test('unknown text returns a hint with the menu', () => {
  const { replies } = buildReplies(message('что-то непонятное'));
  assert.equal(replies[0].text, texts.ru.unknown);
  assert(buttons(replies[0]).length >= 7);
});

test('normalize strips emoji and case', () => {
  assert.equal(normalize('🧭 Мой маршрут'), 'мой маршрут');
  assert.equal(normalize('ℹ️ О проекте'), 'о проекте');
});

test('pressing a button answers in the language of that button', () => {
  const { replies } = buildReplies(message(texts.zh.menu.arrival));
  assert(replies[0].text.includes('抵达后'));
  assert(replies[0].text.includes('入境后3个工作日内'));
});
