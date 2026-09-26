import { LANGS, ui } from './i18n.js';

const $ = (id) => document.getElementById(id);

// localStorage может быть недоступен (приватный режим, ограничения WebView) — приложение работает и без него.
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

function initialLang() {
  let saved = null;
  try { saved = localStorage.getItem('studroute.lang'); } catch { /* ignore */ }
  if (LANGS.includes(saved)) return saved;
  if (saved && LANGS.includes(saved.replace(/"/g, ''))) return saved.replace(/"/g, '');
  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('zh')) return 'zh';
  if (nav.startsWith('en')) return 'en';
  return 'ru';
}

const state = {
  lang: initialLang(),
  profile: store.get('studroute.profile', null),
  done: store.get('studroute.done', {}),
  onboarded: store.get('studroute.onboarded', false),
  route: null,
  sources: [],
  rulesVersion: '',
  user: { mode: 'external', firstName: '' },
  filter: 'all',
  editing: false,
  loading: false,
  booting: true,
  lastAction: null,
};

// Пример для проверки строится от сегодняшней даты, чтобы статусы выглядели реалистично в любой день.
function exampleProfile() {
  const shift = (days) => {
    const d = new Date(`${todayISO()}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  return {
    arrivalDate: shift(-1), housing: 'dorm', stayOver90: true, citizenshipBelarus: false,
    visaRequired: true, visaExpiry: shift(89), registrationExpiry: shift(89),
  };
}
const dateLocale = { ru: 'ru-RU', en: 'en-GB', zh: 'zh-CN' };
const dateFieldIds = ['arrivalDate', 'visaExpiry', 'registrationExpiry', 'eventDate'];
const STATUS_ORDER = { overdue: 0, urgent: 1, soon: 2, normal: 3, info: 4 };

function t(key, vars) {
  let s = ui[state.lang]?.[key] ?? ui.ru[key] ?? key;
  if (vars && typeof s === 'string') for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

function esc(v = '') {
  return String(v).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function field(obj, name) {
  if (!obj) return '';
  const l = state.lang;
  return obj[`${name}_${l}`] ?? obj[name] ?? obj[`${name}_ru`] ?? '';
}

function formatDate(iso, opts) {
  if (!iso) return '';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const options = opts || (state.lang === 'zh'
    ? { year: 'numeric', month: 'long', day: 'numeric' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
  return new Intl.DateTimeFormat(dateLocale[state.lang], options).format(date);
}

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function daysUntil(iso) {
  if (!iso) return null;
  const a = new Date(`${todayISO()}T12:00:00Z`);
  const b = new Date(`${iso}T12:00:00Z`);
  return Math.round((b - a) / 86400000);
}

function relativeDays(iso) {
  const n = daysUntil(iso);
  if (n == null) return '';
  if (n === 0) return t('today');
  return n > 0 ? t('inDays', { n }) : t('daysAgo', { n: -n });
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function haptic(type) {
  try { window.WebApp?.HapticFeedback?.notificationOccurred?.(type); } catch { /* ignore */ }
}

function showBanner(message, retry) {
  $('bannerText').textContent = message;
  $('banner').classList.remove('hidden');
  $('bannerRetry').onclick = () => { $('banner').classList.add('hidden'); retry(); };
}

function openLink(url) {
  try {
    if (window.WebApp?.openLink) { window.WebApp.openLink(url); return; }
  } catch { /* fall through */ }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/* ---------- Status helpers ---------- */

function taskStatus(task) {
  if (state.done[task.id]) return 'done';
  return task.urgency || 'info';
}

function taskTitle(task) {
  const base = field(task, 'title');
  if (task.id === 'change_event' && task.event_type) return `${base}: ${t(`evShort_${task.event_type}`)}`;
  return base;
}

function openTasks() {
  return (state.route?.tasks || []).filter((x) => !state.done[x.id]);
}

function nextTask() {
  // Просроченные, срочные и «скоро» — первыми; остальные шаги — в порядке маршрута.
  const rank = (task) => (['overdue', 'urgent', 'soon'].includes(task.urgency) ? STATUS_ORDER[task.urgency] : 3);
  return openTasks()
    .map((task, i) => ({ task, i }))
    .sort((a, b) => rank(a.task) - rank(b.task) || a.i - b.i)[0]?.task || null;
}

function nearestDeadlineTask() {
  return openTasks()
    .filter((x) => x.due_date)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] || null;
}

/* ---------- Rendering ---------- */

function applyLanguage() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : state.lang;
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('.lang-switch button').forEach((b) => {
    const active = b.dataset.lang === state.lang;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  renderBadges();
  updateDateDisplays();
  updateBuildLabel();
  renderRouteView();
  renderEventView();
  renderHelp();
  renderSources();
}

function renderBadges() {
  const u = state.user;
  let badge = t('externalBrowser');
  if (u.mode === 'max') badge = u.firstName ? `MAX · ${u.firstName}` : 'MAX';
  else if (u.mode === 'demo') badge = t('demoMode');
  else if (u.mode === 'offline') badge = t('offlineDemo');
  $('userBadge').textContent = badge;
  $('rulesBadge').textContent = state.rulesVersion ? `${t('rules')}: ${formatDate(state.rulesVersion)}` : `${t('rules')}: …`;
}

function updateDateDisplays() {
  for (const id of dateFieldIds) {
    const input = $(id);
    const display = $(`${id}Display`);
    if (!input || !display) continue;
    display.textContent = input.value ? formatDate(input.value) : t('chooseDate');
    display.classList.toggle('empty', !input.value);
  }
}

function updateBuildLabel() {
  $('buildLabel').textContent = state.loading ? t('building') : (state.route ? t('update') : t('build'));
  $('buildBtn').classList.toggle('is-loading', state.loading);
  $('buildBtn').disabled = state.loading;
}

function renderRouteView() {
  const hasRoute = Boolean(state.route);
  if (state.booting) {
    ['onboarding', 'profileForm', 'profileSummary', 'dashboard', 'filters', 'routeActions'].forEach((id) => $(id).classList.add('hidden'));
    return;
  }
  const showOnboarding = !hasRoute && !state.onboarded && !state.profile;
  $('onboarding').classList.toggle('hidden', !showOnboarding);
  $('profileForm').classList.toggle('hidden', showOnboarding || (hasRoute && !state.editing));
  $('profileSummary').classList.toggle('hidden', !hasRoute || state.editing);
  $('dashboard').classList.toggle('hidden', !hasRoute);
  $('filters').classList.toggle('hidden', !hasRoute);
  $('routeActions').classList.toggle('hidden', !hasRoute);
  if (!hasRoute) { $('taskList').innerHTML = ''; return; }
  renderSummary();
  renderDashboard();
  renderFilters();
  renderTasks();
}

function renderSummary() {
  const p = state.profile || {};
  const chips = [
    `${t('arrivedOn')}: ${formatDate(p.arrivalDate)}`,
    p.housing === 'private' ? t('private') : t('dorm'),
    p.stayOver90 ? t('more90') : t('less90'),
    p.visaRequired ? (p.visaExpiry ? `${t('visaUntil')}: ${formatDate(p.visaExpiry)}` : t('visaRequired')) : t('noVisa'),
  ];
  if (p.registrationExpiry) chips.push(`${t('regUntil')}: ${formatDate(p.registrationExpiry)}`);
  if (p.citizenshipBelarus) chips.push(t('belarusShort'));
  $('profileSummary').innerHTML = `
    <div class="card-head"><h2>${esc(t('summaryTitle'))}</h2><button type="button" class="btn btn-small btn-ghost" id="editProfile">${esc(t('edit'))}</button></div>
    <div class="chips">${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>`;
  $('editProfile').onclick = () => { state.editing = true; renderRouteView(); $('profileForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
}

function renderDashboard() {
  const tasks = state.route.tasks || [];
  const total = tasks.length;
  const done = tasks.filter((x) => state.done[x.id]).length;
  const open = total - done;
  const overdue = openTasks().filter((x) => x.urgency === 'overdue').length;
  const urgent = openTasks().filter((x) => x.urgency === 'urgent').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const next = nextTask();
  const nearest = nearestDeadlineTask();
  const p = state.profile || {};

  const alerts = [];
  if (overdue) alerts.push(['danger', t('alertOverdue', { n: overdue })]);
  if (urgent) alerts.push(['warn', t('alertUrgent', { n: urgent })]);
  if (p.visaRequired && !p.visaExpiry) alerts.push(['info', t('alertVisa')]);
  if (!p.registrationExpiry) alerts.push(['info', t('alertReg')]);
  if (tasks.some((x) => x.due_date)) alerts.push(['muted', t('alertHolidays')]);

  const nextHtml = next ? `
    <div class="next-card">
      <div class="next-label">${esc(t('nextTitle'))}</div>
      <div class="next-title">${esc(taskTitle(next))}</div>
      <div class="next-meta">${statusBadge(taskStatus(next), true)}<span>${esc(deadlineLine(next))}</span></div>
      <p class="next-action">${esc(field(next, 'action'))}</p>
      <div class="btn-row">
        <button type="button" class="btn btn-on-blue" data-scroll="${esc(next.id)}">${esc(t('details'))}</button>
        <button type="button" class="btn btn-on-blue-outline" data-toggle-done="${esc(next.id)}">${esc(t('markDone'))}</button>
      </div>
    </div>` : `<div class="next-card next-done"><div class="next-label">${esc(t('nextTitle'))}</div><div class="next-title">✓ ${esc(t('allDone'))}</div></div>`;

  const deadlineHtml = nearest ? `
    <div class="card deadline-card deadline-${esc(nearest.urgency)}">
      <div class="label">${esc(t('deadlineTitle'))}</div>
      <div class="deadline-date">${esc(formatDate(nearest.due_date))}</div>
      <div class="deadline-rel">${esc(relativeDays(nearest.due_date))}</div>
      <button type="button" class="link-btn" data-scroll="${esc(nearest.id)}">${esc(taskTitle(nearest))}</button>
    </div>` : `
    <div class="card deadline-card">
      <div class="label">${esc(t('deadlineTitle'))}</div>
      <p class="muted small">${esc(t('noDeadlineLeft'))}</p>
    </div>`;

  $('dashboard').innerHTML = `
    ${nextHtml}
    ${deadlineHtml}
    <div class="card progress-card">
      <div class="progress-head"><span class="label">${esc(t('progressTitle'))}</span><strong>${done} ${esc(t('of'))} ${total}</strong></div>
      <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
      <div class="progress-stats">
        <span><b>${open}</b> ${esc(t('left'))}</span>
        <span class="${urgent + overdue ? 'stat-warn' : ''}"><b>${urgent + overdue}</b> ${esc(t('urgentCount'))}</span>
        <span class="stat-ok"><b>${done}</b> ${esc(t('doneCount'))}</span>
      </div>
    </div>
    ${alerts.length ? `<div class="alerts">${alerts.map(([kind, text]) => `<div class="alert alert-${kind}">${esc(text)}</div>`).join('')}</div>` : ''}`;
}

function renderFilters() {
  const tasks = state.route.tasks || [];
  const done = tasks.filter((x) => state.done[x.id]).length;
  const items = [['all', t('filterAll'), tasks.length], ['open', t('filterOpen'), tasks.length - done], ['done', t('filterDone'), done]];
  $('filters').innerHTML = items.map(([id, label, n]) => `<button type="button" role="tab" class="filter ${state.filter === id ? 'active' : ''}" aria-selected="${state.filter === id}" data-filter="${id}">${esc(label)} <span>${n}</span></button>`).join('');
}

function statusBadge(status, onBlue = false) {
  return `<span class="badge badge-${status}${onBlue ? ' on-blue' : ''}">${esc(t(`status_${status}`))}</span>`;
}

function deadlineLine(task) {
  if (!task.due_date) return t('noDueLine');
  return `${t('dueBy')} ${formatDate(task.due_date)} · ${relativeDays(task.due_date)}`;
}

function renderTasks() {
  const tasks = (state.route.tasks || []).filter((x) => {
    if (state.filter === 'open') return !state.done[x.id];
    if (state.filter === 'done') return state.done[x.id];
    return true;
  });
  const next = nextTask();
  $('taskList').innerHTML = tasks.length
    ? tasks.map((task) => taskHtml(task, next?.id === task.id)).join('')
    : `<p class="empty">${esc(t('emptyFilter'))}</p>`;
}

function taskHtml(task, isNext) {
  const status = taskStatus(task);
  const done = status === 'done';
  const prepare = field(task, 'prepare');
  const prepareList = Array.isArray(prepare) ? prepare : [prepare].filter(Boolean);
  const src = task.source;
  const flash = state.lastAction === task.id ? ' flash' : '';
  return `
  <article class="task task-${status}${flash}" id="task-${esc(task.id)}">
    <div class="task-top">${statusBadge(status)}<span class="kind">${esc(t(task.kind))}</span></div>
    <h3 class="task-title">${esc(taskTitle(task))}</h3>
    <div class="task-deadline ${task.due_date ? '' : 'no-due'}">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>
      <span>${esc(deadlineLine(task))}</span>
    </div>
    <p class="task-action">${esc(field(task, 'action'))}</p>
    <details class="task-details" ${isNext && !done ? 'open' : ''}>
      <summary>${esc(t('details'))}</summary>
      <dl>
        <dt>${esc(t('whyTitle'))}</dt><dd>${esc(field(task, 'why'))}</dd>
        <dt>${esc(t('whereTitle'))}</dt><dd>${esc(field(task, 'where'))}</dd>
        <dt>${esc(t('prepareTitle'))}</dt><dd><ul>${prepareList.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></dd>
        <dt>${esc(t('deadlineBasis'))}</dt><dd>${esc(field(task, 'deadline_note'))}</dd>
        ${src ? `<dt>${esc(t('sourceTitle'))}</dt><dd>${esc(field(src, 'title'))} · ${esc(t('checkedOn'))} ${esc(formatDate(src.checked_at))}</dd>` : ''}
      </dl>
    </details>
    <div class="task-actions">
      ${src ? `<button type="button" class="btn btn-outline" data-url="${esc(src.url)}">${esc(t('openSource'))}</button>` : ''}
      <button type="button" class="btn ${done ? 'btn-ghost' : 'btn-primary'}" data-toggle-done="${esc(task.id)}">${done ? esc(t('markUndone')) : `✓ ${esc(t('markDone'))}`}</button>
    </div>
  </article>`;
}

function renderEventView() {
  const hasRoute = Boolean(state.route);
  $('eventNeedsRoute').classList.toggle('hidden', hasRoute);
  $('eventForm').classList.toggle('disabled', !hasRoute);
  const p = state.profile || {};
  const current = hasRoute && p.eventDate && p.eventType;
  $('eventCurrent').classList.toggle('hidden', !current);
  if (current) $('eventCurrent').textContent = t('eventCurrent', { event: t(`evShort_${p.eventType}`), date: formatDate(p.eventDate) });
  $('clearEvent').classList.toggle('hidden', !current);
}

function renderHelp() {
  const L = ui[state.lang];
  const unecon = state.sources.find((s) => s.id === 'unecon_foreign_students');
  const spb = state.sources.find((s) => s.id === 'spb_migration_registration');
  const contact = (title, text, src) => `
    <div class="contact">
      <strong>${esc(title)}</strong><p>${esc(text)}</p>
      ${src ? `<button type="button" class="btn btn-small btn-outline" data-url="${esc(src.url)}">${esc(t('openSource'))}</button>` : ''}
    </div>`;
  $('helpView').innerHTML = `
    <div class="card">
      <h2>${esc(t('contactsTitle'))}</h2>
      <p class="muted">${esc(t('contactsLead'))}</p>
      ${contact(t('c1Title'), t('c1Text'), unecon)}
      ${contact(t('c2Title'), t('c2Text'), unecon)}
      ${contact(t('c3Title'), t('c3Text'), spb)}
    </div>
    <div class="card">
      <h2>${esc(t('docsTitle'))}</h2>
      <p class="muted">${esc(t('docsLead'))}</p>
      <ul class="check-list">${L.docs.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
    </div>
    <div class="card">
      <h2>${esc(t('faqTitle'))}</h2>
      <div class="faq">${L.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
    </div>
    <div class="card">
      <h2>${esc(t('termsTitle'))}</h2>
      <dl class="terms">${L.terms.map(([term, def]) => `<dt>${esc(term)}</dt><dd>${esc(def)}</dd>`).join('')}</dl>
    </div>
    <div class="card">
      <h2>${esc(t('aboutTitle'))}</h2>
      <p>${esc(t('aboutText'))}</p>
      <button type="button" class="btn btn-small btn-outline" data-url="https://github.com/mv8gygn9kv-ctrl/studroute-max">${esc(t('github'))}</button>
    </div>`;
}

function sourceHtml(s) {
  return `
    <div class="source">
      <strong>${esc(field(s, 'title'))}</strong>
      <small>${esc(field(s, 'publisher'))}</small>
      <p>${esc(field(s, 'scope'))}</p>
      <div class="source-foot"><span class="tag tag-light">${esc(t('checkedOn'))} ${esc(formatDate(s.checked_at))}</span>
      <button type="button" class="btn btn-small btn-outline" data-url="${esc(s.url)}">${esc(t('openSource'))}</button></div>
    </div>`;
}

function renderSources() {
  $('sourceList').innerHTML = state.sources.filter((s) => s.audience !== 'tech').map(sourceHtml).join('');
  $('techSourceList').innerHTML = state.sources.filter((s) => s.audience === 'tech').map(sourceHtml).join('');
}

/* ---------- Form ---------- */

function housingValue() {
  return document.querySelector('input[name="housing"]:checked')?.value || 'dorm';
}

function profileFromForm() {
  const prev = state.profile || {};
  return {
    arrivalDate: $('arrivalDate').value,
    housing: housingValue(),
    stayOver90: $('stayOver90').checked,
    citizenshipBelarus: $('citizenshipBelarus').checked,
    visaRequired: $('visaRequired').checked,
    visaExpiry: $('visaRequired').checked ? ($('visaExpiry').value || undefined) : undefined,
    registrationExpiry: $('registrationExpiry').value || undefined,
    eventDate: prev.eventDate,
    eventType: prev.eventType,
  };
}

function fillForm(profile) {
  if (!profile) return;
  $('arrivalDate').value = profile.arrivalDate || '';
  const radio = document.querySelector(`input[name="housing"][value="${profile.housing === 'private' ? 'private' : 'dorm'}"]`);
  if (radio) radio.checked = true;
  $('stayOver90').checked = profile.stayOver90 ?? true;
  $('citizenshipBelarus').checked = profile.citizenshipBelarus ?? false;
  $('visaRequired').checked = profile.visaRequired ?? true;
  $('visaExpiry').value = profile.visaExpiry || '';
  $('registrationExpiry').value = profile.registrationExpiry || '';
  $('eventDate').value = profile.eventDate || '';
  const ev = document.querySelector(`input[name="eventType"][value="${profile.eventType}"]`);
  if (ev) ev.checked = true;
  updateVisaField();
  updateDateDisplays();
}

function updateVisaField() {
  $('visaExpiryLabel').classList.toggle('hidden', !$('visaRequired').checked);
}

function validateProfile(p) {
  if (!p.arrivalDate) return t('errArrival');
  if (p.visaExpiry && p.visaExpiry < p.arrivalDate) return t('errVisaBefore');
  if (p.registrationExpiry && p.registrationExpiry < p.arrivalDate) return t('errRegBefore');
  return '';
}

function showFormError(id, message) {
  $(id).textContent = message;
  $(id).classList.toggle('hidden', !message);
}

async function requestRoute(profile) {
  state.loading = true;
  updateBuildLabel();
  try {
    const res = await fetch('/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { error: t('errServer') };
    return { route: data };
  } catch {
    return { error: t('errNetwork') };
  } finally {
    state.loading = false;
    updateBuildLabel();
  }
}

async function buildRoute(profile, { silent = false, errorTarget = 'formError' } = {}) {
  const result = await requestRoute(profile);
  if (result.error) {
    showFormError(errorTarget, result.error);
    if (silent) showBanner(result.error, () => buildRoute(profile, { silent }));
    haptic('error');
    return false;
  }
  showFormError(errorTarget, '');
  state.profile = profile;
  store.set('studroute.profile', profile);
  state.route = result.route;
  // Отметки о выполнении для задач, которых больше нет в маршруте, не удаляем: они вернутся при возврате параметров.
  state.editing = false;
  renderRouteView();
  renderEventView();
  if (!silent) { toast(t('saved')); haptic('success'); }
  return true;
}

async function submitProfile() {
  const profile = profileFromForm();
  const error = validateProfile(profile);
  if (error) { showFormError('formError', error); haptic('error'); return; }
  state.onboarded = true;
  store.set('studroute.onboarded', true);
  const ok = await buildRoute(profile);
  if (ok) $('dashboard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- Actions ---------- */

function toggleDone(id) {
  state.done[id] = !state.done[id];
  if (!state.done[id]) delete state.done[id];
  store.set('studroute.done', state.done);
  state.lastAction = id;
  toast(state.done[id] ? t('markedDone') : t('markedUndone'));
  haptic(state.done[id] ? 'success' : 'warning');
  renderRouteView();
  setTimeout(() => { state.lastAction = null; }, 1200);
}

function scrollToTask(id) {
  if (state.filter !== 'all') { state.filter = 'all'; renderFilters(); renderTasks(); }
  const el = $(`task-${id}`);
  if (!el) return;
  el.querySelector('details')?.setAttribute('open', '');
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1400);
}

function switchView(viewId) {
  document.querySelectorAll('.nav-btn').forEach((x) => x.classList.toggle('active', x.dataset.view === viewId));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === viewId));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function shareRoute() {
  const tasks = state.route?.tasks || [];
  const done = tasks.filter((x) => state.done[x.id]).length;
  const next = nextTask();
  const text = t('shareText', { done, total: tasks.length, next: next ? t('shareNext', { title: taskTitle(next) }) : '' });
  try {
    if (window.WebApp?.shareMaxContent) { window.WebApp.shareMaxContent({ text }); return; }
  } catch { /* fall through */ }
  if (navigator.share) { navigator.share({ text }).catch(() => {}); return; }
  navigator.clipboard?.writeText(text).then(() => toast(t('copied'))).catch(() => {});
}

function resetAll() {
  if (!window.confirm(t('resetConfirm'))) return;
  ['studroute.profile', 'studroute.done', 'studroute.onboarded'].forEach((k) => store.remove(k));
  Object.assign(state, { profile: null, done: {}, onboarded: false, route: null, filter: 'all', editing: false });
  $('profileForm').reset();
  document.querySelectorAll('input[name="eventType"]').forEach((x) => { x.checked = false; });
  $('eventDate').value = '';
  updateVisaField();
  updateDateDisplays();
  updateBuildLabel();
  renderRouteView();
  renderEventView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function applyEvent() {
  const type = document.querySelector('input[name="eventType"]:checked')?.value;
  const date = $('eventDate').value;
  if (!type) { showFormError('eventError', t('errEventType')); return; }
  if (!date) { showFormError('eventError', t('errEventDate')); return; }
  showFormError('eventError', '');
  const profile = { ...state.profile, eventType: type, eventDate: date };
  // Новое событие — новая задача: снимаем старую отметку о выполнении.
  delete state.done.change_event;
  store.set('studroute.done', state.done);
  const ok = await buildRoute(profile, { errorTarget: 'eventError' });
  if (ok) {
    toast(t('eventAdded'));
    switchView('routeView');
    setTimeout(() => scrollToTask('change_event'), 350);
  }
}

async function clearEvent() {
  const profile = { ...state.profile };
  delete profile.eventType;
  delete profile.eventDate;
  document.querySelectorAll('input[name="eventType"]').forEach((x) => { x.checked = false; });
  $('eventDate').value = '';
  updateDateDisplays();
  const ok = await buildRoute(profile, { errorTarget: 'eventError' });
  if (ok) toast(t('eventCleared'));
}

function useExample() {
  fillForm(exampleProfile());
  state.onboarded = true;
  store.set('studroute.onboarded', true);
  state.editing = true;
  renderRouteView();
  submitProfile();
}

/* ---------- Startup ---------- */

async function initMax() {
  try { window.WebApp?.ready?.(); } catch { /* ignore */ }
  try {
    const initData = window.WebApp?.initData || '';
    const res = await fetch('/api/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData }) });
    const data = await res.json();
    if (res.ok && data.valid) state.user = data.demo ? { mode: 'demo', firstName: '' } : { mode: 'max', firstName: data.user?.first_name || '' };
    else state.user = { mode: 'external', firstName: '' };
  } catch {
    state.user = { mode: 'offline', firstName: '' };
  }
  renderBadges();
}

async function loadReference() {
  const [metaRes, sourceRes] = await Promise.all([fetch('/api/meta'), fetch('/api/sources')]);
  if (!metaRes.ok || !sourceRes.ok) throw new Error('reference');
  const meta = await metaRes.json();
  const s = await sourceRes.json();
  state.sources = s.sources || [];
  state.rulesVersion = meta.version || '';
}

function bindEvents() {
  document.querySelectorAll('.lang-switch button').forEach((b) => b.addEventListener('click', () => {
    state.lang = b.dataset.lang;
    store.set('studroute.lang', state.lang);
    applyLanguage();
  }));
  $('visaRequired').addEventListener('change', updateVisaField);
  dateFieldIds.forEach((id) => {
    $(id)?.addEventListener('input', updateDateDisplays);
    $(id)?.addEventListener('change', updateDateDisplays);
  });
  $('profileForm').addEventListener('submit', (e) => { e.preventDefault(); submitProfile(); });
  $('onbStart').addEventListener('click', () => {
    state.onboarded = true;
    store.set('studroute.onboarded', true);
    renderRouteView();
    $('arrivalDate').focus();
  });
  $('onbExample').addEventListener('click', useExample);
  $('formExample').addEventListener('click', useExample);
  $('applyEvent').addEventListener('click', applyEvent);
  $('clearEvent').addEventListener('click', clearEvent);
  $('shareBtn').addEventListener('click', shareRoute);
  $('resetBtn').addEventListener('click', resetAll);
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.addEventListener('click', () => switchView(btn.dataset.view)));

  // Делегирование: карточки перерисовываются, поэтому слушаем клики на уровне документа.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-url],[data-toggle-done],[data-scroll],[data-filter],[data-goto]');
    if (!el) return;
    if (el.dataset.url) openLink(el.dataset.url);
    else if (el.dataset.toggleDone) toggleDone(el.dataset.toggleDone);
    else if (el.dataset.scroll) scrollToTask(el.dataset.scroll);
    else if (el.dataset.filter) { state.filter = el.dataset.filter; renderFilters(); renderTasks(); }
    else if (el.dataset.goto) switchView(el.dataset.goto);
  });
}

async function start() {
  $('banner').classList.add('hidden');
  $('loading').classList.remove('hidden');
  try {
    await loadReference();
  } catch {
    $('loading').classList.add('hidden');
    state.booting = false;
    applyLanguage();
    showBanner(t('errStartup'), start);
    return;
  }
  await initMax();
  state.booting = false;
  if (state.profile) await buildRoute(state.profile, { silent: true });
  $('loading').classList.add('hidden');
  applyLanguage();
}

bindEvents();
fillForm(state.profile);
updateVisaField();
applyLanguage();
start();
