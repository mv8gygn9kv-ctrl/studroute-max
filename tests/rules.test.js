import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoute } from '../src/rules-engine.js';

test('dorm + >90 + visa produces core route', () => {
  const route = buildRoute({
    arrivalDate: '2026-09-01',
    housing: 'dorm',
    stayOver90: true,
    citizenshipBelarus: false,
    visaRequired: true,
    visaExpiry: '2026-11-30',
    registrationExpiry: '2026-11-30'
  }, new Date('2026-09-20T12:00:00Z'));
  assert.equal(route.ok, true);
  const ids = route.tasks.map((x) => x.id);
  assert(ids.includes('first_year_office'));
  assert(ids.includes('dorm_registration'));
  assert(ids.includes('fingerprint_medical'));
  assert(ids.includes('visa_extension'));
  assert(ids.includes('registration_extension'));
  assert(!ids.includes('private_registration'));
});

test('private housing uses government registration route', () => {
  const route = buildRoute({
    arrivalDate: '2026-09-01',
    housing: 'private',
    stayOver90: false,
    citizenshipBelarus: false,
    visaRequired: false
  });
  assert.equal(route.ok, true);
  const ids = route.tasks.map((x) => x.id);
  assert(ids.includes('private_registration'));
  assert(!ids.includes('dorm_registration'));
  assert(!ids.includes('fingerprint_medical'));
});

test('Belarus exception suppresses fingerprint rule in MVP', () => {
  const route = buildRoute({
    arrivalDate: '2026-09-01',
    housing: 'dorm',
    stayOver90: true,
    citizenshipBelarus: true,
    visaRequired: false
  });
  assert.equal(route.ok, true);
  assert(!route.tasks.some((x) => x.id === 'fingerprint_medical'));
});

test('life event adds one-business-day task', () => {
  const route = buildRoute({
    arrivalDate: '2026-09-01',
    housing: 'dorm',
    stayOver90: false,
    citizenshipBelarus: false,
    visaRequired: false,
    eventDate: '2026-09-18'
  });
  const eventTask = route.tasks.find((x) => x.id === 'change_event');
  assert(eventTask);
  assert.equal(eventTask.due_date, '2026-09-21');
});


test('medical deadline respects extension prerequisite', () => {
  const r = buildRoute({
    arrivalDate: '2026-09-01', housing: 'dorm', stayOver90: true,
    citizenshipBelarus: false, visaRequired: true,
    visaExpiry: '2026-11-30', registrationExpiry: '2026-11-30'
  }, new Date('2026-09-01T12:00:00Z'));
  const task = r.tasks.find((x) => x.id === 'fingerprint_medical');
  assert.equal(task.due_date, '2026-10-16');
});


test('Chinese localization is present for every route task', () => {
  const route = buildRoute({
    arrivalDate: '2026-09-01', housing: 'dorm', stayOver90: true,
    citizenshipBelarus: false, visaRequired: true,
    visaExpiry: '2026-11-30', registrationExpiry: '2026-11-30'
  });
  assert.equal(route.ok, true);
  assert(route.tasks.length > 0);
  for (const task of route.tasks) {
    assert.equal(typeof task.title_zh, 'string');
    assert(task.title_zh.length > 0);
    assert.equal(typeof task.description_zh, 'string');
    assert(task.description_zh.length > 0);
  }
});
