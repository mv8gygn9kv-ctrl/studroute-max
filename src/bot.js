import { getMe, getUpdates, sendMessage, setCommands } from './max-api.js';
import { getRules, getSources } from './rules-engine.js';
import { BOT_LANGS, MENU_ACTIONS, langButtons, texts } from './bot-texts.js';

const APP_URL = (process.env.APP_BASE_URL || 'https://studroute-max.onrender.com').replace(/\/$/, '');
const GITHUB_URL = 'https://github.com/mv8gygn9kv-ctrl/studroute-max';

// Язык хранится в памяти процесса: после перезапуска сервиса бот снова берёт его из user_locale.
const userLang = new Map();
let botInfo = null;

export function setBotInfo(info) {
  botInfo = info && info.username ? { username: info.username, user_id: info.user_id } : null;
}

export function resetBotState() {
  userLang.clear();
  botInfo = null;
}

function userIdFromUpdate(update) {
  return update?.user?.user_id
    ?? update?.message?.sender?.user_id
    ?? update?.callback?.user?.user_id
    ?? null;
}

function localeToLang(locale) {
  const value = String(locale || '').toLowerCase();
  if (value.startsWith('zh')) return 'zh';
  if (value.startsWith('en')) return 'en';
  return 'ru';
}

function langFor(update, userId) {
  return userLang.get(userId) || localeToLang(update?.user_locale);
}

// Нормализация текста кнопки: убираем эмодзи и лишние пробелы, чтобы совпадал и набранный вручную текст.
export function normalize(text) {
  return String(text || '')
    .replace(/\p{Extended_Pictographic}|️|☰|ℹ/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const labelIndex = new Map();
for (const lang of BOT_LANGS) {
  const t = texts[lang];
  // Кнопка несёт язык, на котором она подписана: ответ приходит на том же языке.
  for (const action of MENU_ACTIONS) labelIndex.set(normalize(t.menu[action]), { action, lang });
  labelIndex.set(normalize(t.backToMenu), { action: 'menu', lang });
}
for (const { lang, text } of langButtons) labelIndex.set(normalize(text), { action: 'setLang', lang });

const commandIndex = {
  '/start': { action: 'welcome' },
  '/menu': { action: 'menu' },
  '/help': { action: 'help' },
  '/sources': { action: 'sources' },
  '/demo': { action: 'demo' },
  '/about': { action: 'about' },
  '/route': { action: 'route' },
  '/lang': { action: 'lang' },
  '/ru': { action: 'setLang', lang: 'ru' },
  '/en': { action: 'setLang', lang: 'en' },
  '/zh': { action: 'setLang', lang: 'zh' },
};

export function resolveIntent(rawText) {
  const text = String(rawText || '').trim();
  const command = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, '');
  if (commandIndex[command]) return commandIndex[command];
  const key = normalize(text);
  if (labelIndex.has(key)) return labelIndex.get(key);
  // Короткие слова, которые пользователи часто пишут вместо нажатия кнопки.
  if (['старт', 'start', '开始', 'меню', 'menu', '菜单'].includes(key)) return { action: 'menu' };
  if (['помощь', 'help', '帮助'].includes(key)) return { action: 'help' };
  if (key.includes('источник') || key === 'sources' || key.includes('来源')) return { action: 'sources' };
  if (key.includes('демо') || key === 'demo') return { action: 'demo' };
  if (key === '中文') return { action: 'setLang', lang: 'zh' };
  return { action: 'unknown' };
}

function keyboard(rows) {
  return { type: 'inline_keyboard', payload: { buttons: rows } };
}

function openAppButton(text) {
  if (botInfo?.username) {
    return { type: 'open_app', text, web_app: botInfo.username, contact_id: botInfo.user_id };
  }
  return { type: 'link', text, url: APP_URL };
}

function messageButton(text) {
  return { type: 'message', text };
}

function linkButton(text, url) {
  return { type: 'link', text, url };
}

function menuKeyboard(lang) {
  const m = texts[lang].menu;
  return keyboard([
    [openAppButton(m.open)],
    [messageButton(m.route), messageButton(m.arrival)],
    [messageButton(m.changes)],
    [messageButton(m.sources), messageButton(m.lang)],
    [messageButton(m.about)],
  ]);
}

function userSources() {
  return getSources().filter((s) => s.audience !== 'tech');
}

function sourceById(id) {
  return getSources().find((s) => s.id === id);
}

function field(obj, name, lang) {
  return obj?.[`${name}_${lang}`] || obj?.[name] || obj?.[`${name}_ru`] || '';
}

function formatDate(iso, lang) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return iso;
  if (lang === 'zh') return `${y}年${m}月${d}日`;
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

function arrivalChecklist(lang) {
  const t = texts[lang];
  const rules = getRules();
  const byId = Object.fromEntries(rules.map((r) => [r.id, r]));
  const line = (rule, suffix = '') => `**${field(rule, 'title', lang)}**${suffix} — ${field(rule, 'deadline_short', lang)}`;
  const lines = [t.arrivalTitle, '', t.arrivalLead, ''];
  let n = 1;
  for (const id of ['first_year_office', 'dms_policy']) lines.push(`${n++}. ${line(byId[id])}`);
  for (const id of ['dorm_registration', 'private_registration']) {
    lines.push(`${n++}. ${line(byId[id], ` (${t.arrivalHousing[id]})`)}`);
  }
  for (const id of ['fingerprint_medical', 'visa_extension', 'registration_extension']) {
    lines.push(`${n++}. ${line(byId[id], ` (${t.arrivalConditions[id]})`)}`);
  }
  lines.push('', t.arrivalFooter);
  return lines.join('\n');
}

function sourcesText(lang) {
  const t = texts[lang];
  const lines = [t.sourcesTitle, '', t.sourcesLead, ''];
  for (const s of userSources()) {
    lines.push(`• **${field(s, 'title', lang)}** — ${field(s, 'scope', lang)} (${t.checked} ${formatDate(s.checked_at, lang)})`);
  }
  return lines.join('\n');
}

function sourceButtons(lang) {
  return userSources().map((s) => [linkButton(`🔗 ${field(s, 'short_title', lang)}`, s.url)]);
}

// Чистая функция: по событию MAX возвращает список сообщений для отправки. Удобна для тестов.
export function buildReplies(update) {
  const userId = userIdFromUpdate(update);
  if (!userId) return { userId: null, replies: [] };
  if (update.update_type === 'message_created' && update.message?.sender?.is_bot) return { userId, replies: [] };

  let intent;
  if (update.update_type === 'bot_started') intent = { action: 'welcome' };
  else if (update.update_type === 'message_created') intent = resolveIntent(update.message?.body?.text);
  else return { userId, replies: [] };

  if (intent.lang) userLang.set(userId, intent.lang);
  const lang = intent.lang || langFor(update, userId);
  const t = texts[lang];
  const menuRow = [messageButton(t.backToMenu)];
  const unecon = sourceById('unecon_foreign_students');

  switch (intent.action) {
    case 'welcome':
      return { userId, replies: [{ text: t.welcome.join('\n'), attachments: [menuKeyboard(lang)] }] };
    case 'menu':
      return { userId, replies: [{ text: t.menuTitle, attachments: [menuKeyboard(lang)] }] };
    case 'open':
      return { userId, replies: [{ text: t.open, attachments: [keyboard([[openAppButton(t.menu.open)], menuRow])] }] };
    case 'route':
      return { userId, replies: [{ text: t.route.join('\n'), attachments: [keyboard([[openAppButton(t.buildRoute)], menuRow])] }] };
    case 'arrival':
      return {
        userId,
        replies: [{
          text: arrivalChecklist(lang),
          attachments: [keyboard([[openAppButton(t.calcDates)], [linkButton(t.openSource, unecon.url)], menuRow])],
        }],
      };
    case 'changes':
      return {
        userId,
        replies: [{
          text: t.changes.join('\n'),
          attachments: [keyboard([[openAppButton(t.addEvent)], [linkButton(t.openSource, unecon.url)], menuRow])],
        }],
      };
    case 'sources':
      return { userId, replies: [{ text: sourcesText(lang), attachments: [keyboard([...sourceButtons(lang), menuRow])] }] };
    case 'lang':
      return { userId, replies: [{ text: t.langTitle, attachments: [keyboard([langButtons.map((b) => messageButton(b.text))])] }] };
    case 'setLang':
      return { userId, replies: [{ text: `${t.langSet}\n\n${t.menuTitle}`, attachments: [menuKeyboard(lang)] }] };
    case 'about':
      return {
        userId,
        replies: [{ text: t.about.join('\n'), attachments: [keyboard([[openAppButton(t.menu.open)], [linkButton(t.github, GITHUB_URL)], menuRow])] }],
      };
    case 'help':
      return { userId, replies: [{ text: t.help.join('\n'), attachments: [menuKeyboard(lang)] }] };
    case 'demo':
      return { userId, replies: [{ text: t.demo.join('\n'), attachments: [keyboard([[openAppButton(t.menu.open)], menuRow])] }] };
    default:
      return { userId, replies: [{ text: t.unknown, attachments: [menuKeyboard(lang)] }] };
  }
}

// Если клиент MAX отклонит кнопку open_app, повторяем отправку с обычной ссылкой на mini-app.
function withLinkFallback(attachments) {
  return attachments.map((a) => (a.type !== 'inline_keyboard' ? a : {
    ...a,
    payload: {
      buttons: a.payload.buttons.map((row) => row.map((b) => (b.type === 'open_app' ? { type: 'link', text: b.text, url: APP_URL } : b))),
    },
  }));
}

function hasOpenApp(attachments) {
  return attachments.some((a) => a.payload?.buttons?.some((row) => row.some((b) => b.type === 'open_app')));
}

export async function processUpdate(update) {
  const { userId, replies } = buildReplies(update);
  for (const reply of replies) {
    try {
      await sendMessage(userId, reply.text, reply.attachments);
    } catch (err) {
      if (!hasOpenApp(reply.attachments) || !/MAX API 4\d\d/.test(err.message)) throw err;
      console.error('[bot] open_app button rejected, retrying with link button:', err.message);
      await sendMessage(userId, reply.text, withLinkFallback(reply.attachments));
    }
  }
}

export async function initBot() {
  if (!process.env.BOT_TOKEN) {
    console.log('[bot] BOT_TOKEN is not set; bot transport disabled');
    return;
  }
  try {
    const me = await getMe();
    setBotInfo(me);
    console.log(`[bot] bot info loaded: @${me.username}`);
  } catch (err) {
    console.error('[bot] getMe failed, mini-app buttons will use links:', err.message);
  }
  try {
    await setCommands([
      { name: 'start', description: 'Начать работу · Start · 开始' },
      { name: 'menu', description: 'Меню · Menu · 菜单' },
      { name: 'sources', description: 'Официальные источники · Sources · 来源' },
      { name: 'demo', description: 'Сценарий проверки · Demo · 演示' },
      { name: 'help', description: 'Помощь · Help · 帮助' },
      { name: 'ru', description: 'Русский' },
      { name: 'en', description: 'English' },
      { name: 'zh', description: '中文' },
    ]);
    console.log('[bot] commands configured');
  } catch (err) {
    console.error('[bot] command setup failed:', err.message);
  }
}

export async function startPolling() {
  let marker = null;
  console.log('[bot] polling started (development mode)');
  while (true) {
    try {
      const data = await getUpdates(marker);
      for (const update of data.updates || []) {
        try { await processUpdate(update); }
        catch (err) { console.error('[bot] update failed:', err.message); }
      }
      if (data.marker != null) marker = data.marker;
    } catch (err) {
      console.error('[bot] polling error:', err.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
