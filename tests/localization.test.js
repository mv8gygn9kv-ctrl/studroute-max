import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildRoute, getRules, getSources } from '../src/rules-engine.js';
import { ui } from '../public/i18n.js';
import { texts } from '../src/bot-texts.js';

const LANGS = ['ru', 'en', 'zh'];
const RULE_FIELDS = ['title', 'description', 'why', 'action', 'where', 'prepare', 'deadline_short', 'deadline_note'];

test('every rule has every card field in RU, EN and ZH', () => {
  for (const rule of getRules()) {
    for (const f of RULE_FIELDS) {
      for (const lang of LANGS) {
        const v = rule[`${f}_${lang}`];
        assert(Array.isArray(v) ? v.length > 0 && v.every((x) => x.trim()) : typeof v === 'string' && v.trim(), `${rule.id}.${f}_${lang}`);
      }
    }
  }
});

test('Chinese and English card texts contain no Russian-only fallbacks for key fields', () => {
  for (const rule of getRules()) {
    for (const f of ['title', 'action', 'why']) {
      assert(/[一-鿿]/.test(rule[`${f}_zh`]), `${rule.id}.${f}_zh must be Chinese`);
      assert(/[A-Za-z]/.test(rule[`${f}_en`]), `${rule.id}.${f}_en must be English`);
    }
  }
});

test('mini-app UI dictionaries have the same keys in all languages', () => {
  const ruKeys = Object.keys(ui.ru).sort();
  for (const lang of ['en', 'zh']) assert.deepEqual(Object.keys(ui[lang]).sort(), ruKeys, lang);
  for (const lang of LANGS) {
    assert.equal(ui[lang].faq.length, ui.ru.faq.length);
    assert.equal(ui[lang].terms.length, ui.ru.terms.length);
    assert.equal(ui[lang].docs.length, ui.ru.docs.length);
  }
});

test('every data-i18n key in index.html exists in the dictionary', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
  assert(keys.length > 20);
  for (const key of keys) assert(key in ui.ru, key);
});

test('bot texts have the same structure in all languages', () => {
  const shape = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort() : typeof v]));
  for (const lang of ['en', 'zh']) assert.deepEqual(shape(texts[lang]), shape(texts.ru), lang);
});

test('sources are https, dated and localized', () => {
  for (const s of getSources()) {
    assert.match(s.url, /^https:\/\/[^\s]+$/);
    assert.match(s.checked_at, /^\d{4}-\d{2}-\d{2}$/);
    for (const lang of ['en', 'zh']) assert(s[`title_${lang}`] && s[`short_title_${lang}`], `${s.id} ${lang}`);
    assert(['user', 'tech'].includes(s.audience));
  }
});

test('route exposes deadline type and never invents a deadline for rules without one', () => {
  const route = buildRoute({
    arrivalDate: '2026-09-01', housing: 'dorm', stayOver90: true, citizenshipBelarus: false,
    visaRequired: true, visaExpiry: '2026-11-30', registrationExpiry: '2026-11-30',
  }, new Date('2026-09-02T12:00:00Z'));
  const byId = Object.fromEntries(route.tasks.map((x) => [x.id, x]));
  for (const id of ['first_year_office', 'dms_policy']) {
    assert.equal(byId[id].due_date, null);
    assert.equal(byId[id].deadline_type, 'not_set_by_source');
    assert.equal(byId[id].urgency, 'info');
  }
  assert.equal(byId.dorm_registration.due_date, '2026-09-04');
  assert.equal(byId.dorm_registration.days_left, 2);
  assert.equal(byId.dorm_registration.deadline_type, 'calculated_from_source');
});

test('invalid dates and event types are rejected', () => {
  const base = { arrivalDate: '2026-09-10', housing: 'dorm', stayOver90: true, citizenshipBelarus: false, visaRequired: true };
  assert.equal(buildRoute({ ...base, visaExpiry: '2026-09-01' }).ok, false);
  assert.equal(buildRoute({ ...base, registrationExpiry: '2026-09-01' }).ok, false);
  assert.equal(buildRoute({ ...base, eventType: 'party', eventDate: '2026-09-12' }).ok, false);
  const ok = buildRoute({ ...base, eventType: 'move', eventDate: '2026-09-12' });
  assert.equal(ok.ok, true);
  assert.equal(ok.tasks.find((x) => x.id === 'change_event').event_type, 'move');
});
