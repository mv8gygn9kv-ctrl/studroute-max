import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addBusinessDays,
  addCalendarDays,
  daysBetween,
  parseDate,
  subtractCalendarDays,
  toISODate,
} from './date-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rulesPath = path.resolve(__dirname, '../data/rules.json');
const sourcesPath = path.resolve(__dirname, '../data/sources.json');
const ruleData = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
const sourceMap = new Map(sources.map((s) => [s.id, s]));

function applies(rule, profile) {
  const a = rule.applies || {};
  for (const [key, expected] of Object.entries(a)) {
    if (key === 'visaExpiryRequired' && expected === true && !profile.visaExpiry) return false;
    if (key === 'registrationExpiryRequired' && expected === true && !profile.registrationExpiry) return false;
    if (key === 'eventSelected' && expected === true && !profile.eventDate) return false;
    if (Array.isArray(expected) && !expected.includes(profile[key])) return false;
    if (!Array.isArray(expected) && !['visaExpiryRequired','registrationExpiryRequired','eventSelected'].includes(key) && profile[key] !== expected) return false;
  }
  return true;
}

function dueDate(rule, profile) {
  const due = rule.due;
  const arrival = parseDate(profile.arrivalDate);
  if (!due) return null;
  switch (due.type) {
    case 'soon':
      return arrival ? addBusinessDays(arrival, due.days) : null;
    case 'business_days_after_arrival':
      return arrival ? addBusinessDays(arrival, due.days) : null;
    case 'calendar_days_after_arrival':
      return arrival ? addCalendarDays(arrival, due.days) : null;
    case 'earliest_medical_due': {
      const candidates = [];
      if (arrival) candidates.push(addCalendarDays(arrival, 90));
      const visaExpiry = parseDate(profile.visaExpiry);
      if (profile.visaRequired && visaExpiry) candidates.push(subtractCalendarDays(visaExpiry, 45));
      const registrationExpiry = parseDate(profile.registrationExpiry);
      if (registrationExpiry) candidates.push(subtractCalendarDays(registrationExpiry, 45));
      return candidates.length ? candidates.sort((a, b) => a - b)[0] : null;
    }
    case 'days_before_visa_expiry': {
      const expiry = parseDate(profile.visaExpiry);
      return expiry ? subtractCalendarDays(expiry, due.days) : null;
    }
    case 'days_before_registration_expiry': {
      const expiry = parseDate(profile.registrationExpiry);
      return expiry ? subtractCalendarDays(expiry, due.days) : null;
    }
    case 'business_days_after_event': {
      const event = parseDate(profile.eventDate);
      return event ? addBusinessDays(event, due.days) : null;
    }
    default:
      return null;
  }
}

function urgency(due, now = new Date()) {
  if (!due) return 'info';
  const delta = daysBetween(now, due);
  if (delta < 0) return 'overdue';
  if (delta <= 3) return 'urgent';
  if (delta <= 14) return 'soon';
  return 'normal';
}

export function validateProfile(profile = {}) {
  const errors = [];
  if (!parseDate(profile.arrivalDate)) errors.push('arrivalDate must be YYYY-MM-DD');
  if (!['dorm', 'private'].includes(profile.housing)) errors.push('housing must be dorm or private');
  for (const key of ['stayOver90', 'citizenshipBelarus', 'visaRequired']) {
    if (typeof profile[key] !== 'boolean') errors.push(`${key} must be boolean`);
  }
  if (profile.visaExpiry && !parseDate(profile.visaExpiry)) errors.push('visaExpiry must be YYYY-MM-DD');
  if (profile.registrationExpiry && !parseDate(profile.registrationExpiry)) errors.push('registrationExpiry must be YYYY-MM-DD');
  if (profile.eventDate && !parseDate(profile.eventDate)) errors.push('eventDate must be YYYY-MM-DD');
  return errors;
}

export function buildRoute(profile, now = new Date()) {
  const errors = validateProfile(profile);
  if (errors.length) return { ok: false, errors };

  const tasks = ruleData.rules
    .filter((rule) => applies(rule, profile))
    .map((rule) => {
      const due = dueDate(rule, profile);
      return {
        id: rule.id,
        kind: rule.kind,
        title_ru: rule.title_ru,
        title_en: rule.title_en,
        title_zh: rule.title_zh,
        description_ru: rule.description_ru,
        description_en: rule.description_en,
        description_zh: rule.description_zh,
        due_date: toISODate(due),
        urgency: urgency(due, now),
        source: sourceMap.get(rule.source_id) || null,
        sort_order: rule.sort_order ?? 100,
      };
    })
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
    })
    .map(({ sort_order, ...task }) => task);

  return {
    ok: true,
    rules_version: ruleData.version,
    mvp_scope: ruleData.mvp_scope,
    disclaimer: ruleData.disclaimer,
    tasks,
  };
}

export function getSources() {
  return sources;
}

export function getRulesMeta() {
  return {
    version: ruleData.version,
    mvp_scope: ruleData.mvp_scope,
    disclaimer: ruleData.disclaimer,
  };
}
