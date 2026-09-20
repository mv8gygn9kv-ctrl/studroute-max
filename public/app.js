const $ = (id) => document.getElementById(id);
const state = {
  lang: localStorage.getItem('studroute.lang') || 'ru',
  profile: JSON.parse(localStorage.getItem('studroute.profile') || 'null'),
  done: JSON.parse(localStorage.getItem('studroute.done') || '{}'),
  route: null,
  sources: [],
};

const i18n = {
  ru: {
    profileTitle: 'Соберите маршрут', profileLead: 'MVP рассчитан на иностранного студента 18+, впервые прибывшего на очное обучение в СПбГЭУ.',
    arrival: 'Дата въезда в РФ', housing: 'Где вы живёте', dorm: 'Общежитие СПбГЭУ', private: 'Частный адрес',
    over90: 'Планирую быть в РФ более 90 дней', belarus: 'Я гражданин(ка) Беларуси', visaRequired: 'Для учёбы нужна виза', visaExpiry: 'Виза действует до', regExpiry: 'Миграционный учёт действует до (если уже оформлен)', build: 'Построить маршрут',
    eventTitle: 'Что-то изменилось?', eventLead: 'Отметьте событие: пересечение границы, гостиница/больница, переезд или новый паспорт.', eventDate: 'Дата события', recalc: 'Пересчитать маршрут', clearEvent: 'Убрать событие', eventNote: 'СПбГЭУ указывает организационный срок обращения — в течение 1 рабочего дня для перечисленных изменений.',
    sourcesTitle: 'Источники', sourcesLead: 'Каждое правило привязано к первоисточнику и дате проверки.', aboutTitle: 'О продукте', about1: 'СтудМаршрут не дублирует Госуслуги: он связывает шаги университета и государственных сервисов в один персональный порядок действий.', about2: 'В MVP нет интеграции с МВД или Госуслугами. Используются заранее проверенные правила и модельные пользовательские данные.', share: 'Поделиться маршрутом в MAX', disclaimer: 'Не является официальным решением ведомства и не заменяет консультацию уполномоченной организации.',
    navRoute: 'Маршрут', navEvent: 'Событие', navSources: 'Источники', navAbout: 'О проекте', tasks: 'задач', done: 'готово', urgent: 'срочно', source: 'Источник', due: 'до', noDue: 'срок не указан в источнике', saved: 'Маршрут сохранён на устройстве', shareText: 'Мой маршрут первых шагов после приезда сформирован в СтудМаршруте для MAX.'
  },
  en: {
    profileTitle: 'Build your route', profileLead: 'The MVP targets an 18+ international student arriving for full-time study at UNECON for the first time.',
    arrival: 'Date of entry to Russia', housing: 'Where you live', dorm: 'UNECON dormitory', private: 'Private address',
    over90: 'I plan to stay in Russia for more than 90 days', belarus: 'I am a citizen of Belarus', visaRequired: 'A study visa is required', visaExpiry: 'Visa valid until', regExpiry: 'Migration registration valid until (if already issued)', build: 'Build route',
    eventTitle: 'Did something change?', eventLead: 'Select an event: border crossing, hotel/hospital stay, moving, or a new passport.', eventDate: 'Event date', recalc: 'Recalculate route', clearEvent: 'Clear event', eventNote: 'UNECON states an organizational deadline of 1 working day for the listed changes.',
    sourcesTitle: 'Sources', sourcesLead: 'Every rule is linked to its primary source and review date.', aboutTitle: 'About', about1: 'StudRoute does not duplicate Gosuslugi: it connects university and government steps into one personalized sequence.', about2: 'The MVP has no live integration with the Ministry of Internal Affairs or Gosuslugi. It uses pre-verified rules and model user data.', share: 'Share route in MAX', disclaimer: 'This is not an official agency decision and does not replace advice from an authorized organization.',
    navRoute: 'Route', navEvent: 'Event', navSources: 'Sources', navAbout: 'About', tasks: 'tasks', done: 'done', urgent: 'urgent', source: 'Source', due: 'due', noDue: 'no deadline stated in source', saved: 'Route saved on this device', shareText: 'My first-steps route after arrival was built in StudRoute for MAX.'
  }
};

function t(key) { return i18n[state.lang][key] || key; }
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1800); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

function applyLanguage() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $('langBtn').textContent = state.lang === 'ru' ? 'EN' : 'RU';
  renderRoute();
  renderSources();
}

function profileFromForm() {
  return {
    arrivalDate: $('arrivalDate').value,
    housing: $('housing').value,
    stayOver90: $('stayOver90').checked,
    citizenshipBelarus: $('citizenshipBelarus').checked,
    visaRequired: $('visaRequired').checked,
    visaExpiry: $('visaRequired').checked ? ($('visaExpiry').value || undefined) : undefined,
    registrationExpiry: $('registrationExpiry').value || undefined,
    eventDate: $('eventDate').value || undefined,
  };
}

function fillForm(profile) {
  if (!profile) return;
  $('arrivalDate').value = profile.arrivalDate || '';
  $('housing').value = profile.housing || 'dorm';
  $('stayOver90').checked = profile.stayOver90 ?? true;
  $('citizenshipBelarus').checked = profile.citizenshipBelarus ?? false;
  $('visaRequired').checked = profile.visaRequired ?? true;
  $('visaExpiry').value = profile.visaExpiry || '';
  $('registrationExpiry').value = profile.registrationExpiry || '';
  $('eventDate').value = profile.eventDate || '';
  updateVisaField();
}

function updateVisaField() { $('visaExpiryLabel').classList.toggle('hidden', !$('visaRequired').checked); }

async function buildRoute() {
  const profile = profileFromForm();
  state.profile = profile;
  localStorage.setItem('studroute.profile', JSON.stringify(profile));
  const res = await fetch('/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
  const data = await res.json();
  if (!res.ok) { toast((data.errors || ['Ошибка данных']).join('; ')); return; }
  state.route = data;
  renderRoute();
  toast(t('saved'));
}

function renderRoute() {
  if (!state.route) return;
  const tasks = state.route.tasks || [];
  const doneCount = tasks.filter((x) => state.done[x.id]).length;
  const urgentCount = tasks.filter((x) => ['overdue', 'urgent'].includes(x.urgency) && !state.done[x.id]).length;
  $('summary').classList.remove('hidden');
  $('summary').innerHTML = `
    <div class="metric"><strong>${tasks.length}</strong><span>${t('tasks')}</span></div>
    <div class="metric"><strong>${doneCount}</strong><span>${t('done')}</span></div>
    <div class="metric"><strong>${urgentCount}</strong><span>${t('urgent')}</span></div>`;
  $('taskList').innerHTML = tasks.map(taskHtml).join('');
  document.querySelectorAll('.task-check').forEach((el) => el.addEventListener('change', () => {
    state.done[el.dataset.id] = el.checked;
    localStorage.setItem('studroute.done', JSON.stringify(state.done));
    renderRoute();
  }));
  document.querySelectorAll('.source-link').forEach((el) => el.addEventListener('click', () => openLink(el.dataset.url)));
}

function taskHtml(task) {
  const title = state.lang === 'ru' ? task.title_ru : task.title_en;
  const desc = state.lang === 'ru' ? task.description_ru : task.description_en;
  const checked = state.done[task.id] ? 'checked' : '';
  const due = task.due_date ? `${t('due')} ${new Date(task.due_date + 'T12:00:00').toLocaleDateString(state.lang === 'ru' ? 'ru-RU' : 'en-GB')}` : t('noDue');
  const source = task.source ? `<button class="source-link" data-url="${escapeAttr(task.source.url)}">${t('source')}: ${escapeHtml(task.source.publisher)}</button>` : '';
  return `<article class="task" data-urgency="${task.urgency}">
    <div class="task-head"><input class="task-check" data-id="${task.id}" type="checkbox" ${checked}/><div><div class="task-title">${escapeHtml(title)}</div><div class="task-desc">${escapeHtml(desc)}</div><div class="task-meta"><span class="pill">${escapeHtml(due)}</span><span class="pill">${escapeHtml(task.kind)}</span>${source}</div></div></div>
  </article>`;
}

function renderSources() {
  $('sourceList').innerHTML = state.sources.map((s) => `<div class="source"><strong>${escapeHtml(s.title)}</strong><small>${escapeHtml(s.scope)} · ${s.checked_at}</small><button class="source-link" data-url="${escapeAttr(s.url)}">${state.lang === 'ru' ? 'Открыть первоисточник' : 'Open primary source'}</button></div>`).join('');
  document.querySelectorAll('#sourceList .source-link').forEach((el) => el.addEventListener('click', () => openLink(el.dataset.url)));
}

function openLink(url) {
  if (window.WebApp?.openLink) window.WebApp.openLink(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

function escapeHtml(v = '') { return String(v).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttr(v = '') { return escapeHtml(v); }

async function initMax() {
  try {
    const initData = window.WebApp?.initData || '';
    const res = await fetch('/api/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData }) });
    const data = await res.json();
    if (res.ok && data.valid) {
      $('userBadge').textContent = data.user?.first_name ? `MAX · ${data.user.first_name}` : (data.demo ? 'Демо-режим' : 'MAX');
    } else {
      $('userBadge').textContent = 'Внешний браузер';
    }
  } catch { $('userBadge').textContent = 'Оффлайн-демо'; }
}

async function init() {
  $('arrivalDate').value = todayISO();
  fillForm(state.profile);
  $('visaRequired').addEventListener('change', updateVisaField);
  $('profileForm').addEventListener('submit', async (e) => { e.preventDefault(); await buildRoute(); });
  $('applyEvent').addEventListener('click', buildRoute);
  $('clearEvent').addEventListener('click', async () => { $('eventDate').value = ''; await buildRoute(); });
  $('langBtn').addEventListener('click', () => { state.lang = state.lang === 'ru' ? 'en' : 'ru'; localStorage.setItem('studroute.lang', state.lang); applyLanguage(); });
  $('shareBtn').addEventListener('click', () => {
    const text = t('shareText');
    if (window.WebApp?.shareMaxContent) window.WebApp.shareMaxContent({ text });
    else if (navigator.share) navigator.share({ text }).catch(() => {});
    else navigator.clipboard?.writeText(text).then(() => toast(state.lang === 'ru' ? 'Текст скопирован' : 'Copied'));
  });
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((x) => x.classList.toggle('active', x === btn));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === btn.dataset.view));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));

  const [metaRes, sourceRes] = await Promise.all([fetch('/api/meta'), fetch('/api/sources')]);
  const meta = await metaRes.json();
  const s = await sourceRes.json();
  state.sources = s.sources || [];
  $('rulesBadge').textContent = `${state.lang === 'ru' ? 'Правила' : 'Rules'}: ${meta.version}`;
  await initMax();
  if (state.profile) await buildRoute();
  applyLanguage();
}

init().catch((err) => { console.error(err); toast('Ошибка запуска'); });
