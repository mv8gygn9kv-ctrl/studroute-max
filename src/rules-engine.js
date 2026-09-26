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

export const EVENT_TYPES = ['border', 'hotel', 'move', 'passport'];
const LANGS = ['ru', 'en', 'zh'];
const LOCALIZED_FIELDS = ['title', 'description', 'why', 'action', 'where', 'prepare', 'deadline_short', 'deadline_note'];

export function validateProfile(profile = {}) {
  const errors = [];
  const arrival = parseDate(profile.arrivalDate);
  if (!arrival) errors.push('arrivalDate must be YYYY-MM-DD');
  if (!['dorm', 'private'].includes(profile.housing)) errors.push('housing must be dorm or private');
  for (const key of ['stayOver90', 'citizenshipBelarus', 'visaRequired']) {
    if (typeof profile[key] !== 'boolean') errors.push(`${key} must be boolean`);
  }
  for (const key of ['visaExpiry', 'registrationExpiry', 'eventDate']) {
    if (profile[key] && !parseDate(profile[key])) errors.push(`${key} must be YYYY-MM-DD`);
  }
  for (const key of ['visaExpiry', 'registrationExpiry']) {
    const value = parseDate(profile[key]);
    if (arrival && value && value < arrival) errors.push(`${key} must not be earlier than arrivalDate`);
  }
  if (profile.eventType != null && !EVENT_TYPES.includes(profile.eventType)) {
    errors.push(`eventType must be one of ${EVENT_TYPES.join(', ')}`);
  }
  return errors;
}

function localized(rule) {
  const out = {};
  for (const field of LOCALIZED_FIELDS) {
    for (const lang of LANGS) {
      const key = `${field}_${lang}`;
      if (rule[key] != null) out[key] = rule[key];
    }
  }
  return out;
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
        ...localized(rule),
        due_date: toISODate(due),
        days_left: due ? daysBetween(now, due) : null,
        deadline_type: due ? 'calculated_from_source' : 'not_set_by_source',
        urgency: urgency(due, now),
        event_type: rule.id === 'change_event' ? (profile.eventType || null) : undefined,
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
    generated_at: toISODate(now),
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

export function getRules() {
  return ruleData.rules;
}
