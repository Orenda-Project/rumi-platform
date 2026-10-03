#!/usr/bin/env node
/**
 * Roster management for /observe — who coaches which schools, and which
 * teachers are at each school. A partner runs this; nobody fills a form.
 *
 *   node bot/scripts/observe-roster.js grant-coach <phone> [role]
 *   node bot/scripts/observe-roster.js add-school  <coach-phone> <school-ext-id> <school name…>
 *   node bot/scripts/observe-roster.js add-teacher <teacher-phone> <school-ext-id> [name…]
 *   node bot/scripts/observe-roster.js import      <file.csv>
 *          columns: coach_phone,school_ext_id,school_name,teacher_phone,teacher_name
 *   node bot/scripts/observe-roster.js list        <coach-phone>
 *   node bot/scripts/observe-roster.js set-email   <coach-phone> <email> [full name…]   (calendar invites)
 *   node bot/scripts/observe-roster.js portal-invite <coach-phone>   (the portal setup link, on their channel)
 *
 * A "phone" is the person's channel identity: digits for WhatsApp (spaces,
 * dashes and "+" are stripped), or a prefixed identity kept as-is (mtx:…,
 * slack:…, discord:…). Someone who has never messaged the bot gets a users row
 * now, stored the way the bot stores that channel (a phone number for
 * WhatsApp, a user_channels row otherwise); registration still runs when they
 * first write.
 *
 * The roster is DERIVED: a coach holds schools (leader_schools); a teacher is
 * at a school through users.school_id. School ids are namespaced with
 * OBSERVE_SCHOOL_ID_PREFIX; leader_schools.source is OBSERVE_ROSTER_SOURCE.
 * Every command is idempotent — re-running an import changes nothing.
 */

const fs = require('fs');

const db = () => require('../shared/config/supabase');
const { leaderRoles, isSchoolLeader, writtenRole } = require('../shared/services/observe/observe-gate');

const USAGE = [
  'Usage: node bot/scripts/observe-roster.js <command> …',
  '  grant-coach <phone> [role]                        make someone a coach (default role: coach)',
  '  add-school  <coach-phone> <school-ext-id> <name>  give a coach a school',
  '  add-teacher <teacher-phone> <school-ext-id> [name] put a teacher at a school',
  '  import      <file.csv>                            coach_phone,school_ext_id,school_name,teacher_phone,teacher_name',
  '  list        <coach-phone>                         show a coach\'s schools and teachers',
  '  set-email   <coach-phone> <email> [full name]     the coach\'s address for calendar invites',
  '  portal-invite <coach-phone>                       send the portal setup link on the channel they use',
].join('\n');

/** users.phone_number form of a phone or channel identity. Throws on junk. */
function normalizeIdentity(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (/^[a-z][a-z0-9_-]*:\S+$/i.test(s)) return s;
  const digits = s.replace(/[\s\-().+]/g, '');
  if (!/^\d{6,15}$/.test(digits)) throw new Error(`not a phone number or channel identity: "${raw}"`);
  return digits;
}

function schoolExtId(raw) {
  const ext = String(raw == null ? '' : raw).trim();
  if (!ext) throw new Error('a school id is required');
  const prefix = process.env.OBSERVE_SCHOOL_ID_PREFIX || '';
  return prefix && !ext.startsWith(prefix) ? `${prefix}${ext}` : ext;
}

const source = () => process.env.OBSERVE_ROSTER_SOURCE || 'manual';
const now = () => new Date().toISOString();

async function _one(q) {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function _update(table, id, patch) {
  const { error } = await db().from(table).update({ ...patch, updated_at: now() }).eq('id', id);
  if (error) throw new Error(error.message);
}

async function findUser(identity) {
  // Through the observe identity resolver: a person who reached Rumi on
  // Matrix, Slack or Discord has no phone_number, only a user_channels row.
  const { userIdForIdentity } = require('../shared/services/observe/observe-identity');
  const id = await userIdForIdentity(identity);
  if (!id) return null;
  return _one(db().from('users')
    .select('id, phone_number, name, role, school_id, preferred_language, portal_activated').eq('id', id).limit(1));
}

/**
 * Find, or create the way the bot itself would: a WhatsApp number on
 * users.phone_number; any other channel as a users row with no phone number
 * plus its user_channels row, so the person's first message lands on THIS row.
 */
async function ensureUser(identity, { name = null } = {}) {
  const existing = await findUser(identity);
  if (existing) return existing;
  const { parseIdentity } = require('../shared/services/observe/observe-identity');
  const parsed = parseIdentity(identity);
  const isWhatsApp = parsed.channel === 'whatsapp';
  const user = await _one(db().from('users').insert({
    phone_number: isWhatsApp ? identity : null, name: name || null, source: 'observe_roster', created_at: now(),
  }).select().single());
  const { error } = await db().from('user_channels').insert({
    user_id: user.id, channel: parsed.channel, channel_user_id: parsed.id, is_primary: true, created_at: now(),
  });
  if (error) throw new Error(error.message);
  return user;
}


/** The schools row for an ext id, created when missing; a real name replaces a placeholder. */
async function ensureSchool(extId, name = null) {
  const existing = await _one(db().from('schools').select('id, ext_id, name').eq('ext_id', extId).limit(1));
  if (existing) {
    if (name && existing.name !== name && existing.name === extId) {
      await _update('schools', existing.id, { name });
      existing.name = name;
    }
    return existing;
  }
  return _one(db().from('schools').insert({ ext_id: extId, name: name || extId }).select().single());
}

async function grantCoach(phone, role = 'coach') {
  // principal / school_leader are read aliases of head_teacher; never written.
  const r = writtenRole(role || 'coach');
  if (!leaderRoles().includes(r)) throw new Error(`"${r}" is not a coach role (OBSERVE_LEADER_ROLES: ${leaderRoles().join(', ')})`);
  const user = await ensureUser(normalizeIdentity(phone));
  if (user.role !== r) await _update('users', user.id, { role: r });
  return { ...user, role: r };
}

async function addSchool(coachPhone, extIdRaw, name) {
  const coach = await findUser(normalizeIdentity(coachPhone));
  if (!coach || !isSchoolLeader(coach)) throw new Error(`${coachPhone} is not a coach yet — run grant-coach first`);
  const extId = schoolExtId(extIdRaw);
  const school = await ensureSchool(extId, name ? String(name).trim() : null);
  const { error } = await db().from('leader_schools').upsert({
    leader_user_id: coach.id,
    school_id: school.id,
    school_ext_id: extId,
    school_name: school.name,
    source: source(),
  }, { onConflict: 'leader_user_id,school_id' });
  if (error) throw new Error(error.message);
  return { coach, school };
}

async function addTeacher(teacherPhone, extIdRaw, name = null) {
  const school = await ensureSchool(schoolExtId(extIdRaw));
  const teacher = await ensureUser(normalizeIdentity(teacherPhone), { name });
  const patch = { school_id: school.id };
  if (name && teacher.name !== name) patch.name = name;
  await _update('users', teacher.id, patch);
  return { teacher: { ...teacher, ...patch }, school };
}

/** RFC-4180-ish: quoted fields, doubled quotes, CRLF. */
function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const CSV_COLUMNS = ['coach_phone', 'school_ext_id', 'school_name', 'teacher_phone', 'teacher_name'];

async function importCsv(text) {
  const [header, ...rows] = parseCsv(text);
  const cols = (header || []).map((h) => h.trim().toLowerCase());
  const missing = CSV_COLUMNS.filter((c) => !cols.includes(c));
  if (missing.length) throw new Error(`CSV is missing column(s): ${missing.join(', ')}`);
  const at = (r, c) => String(r[cols.indexOf(c)] || '').trim();
  const result = { applied: 0, errors: [] };
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    try {
      const coachPhone = at(r, 'coach_phone');
      const ext = at(r, 'school_ext_id');
      if (coachPhone) {
        const existing = await findUser(normalizeIdentity(coachPhone));
        // Never demote: someone already in the coach family keeps their role.
        if (!existing || !isSchoolLeader(existing)) await grantCoach(coachPhone);
        await addSchool(coachPhone, ext, at(r, 'school_name') || null);
      } else if (at(r, 'school_name')) {
        await ensureSchool(schoolExtId(ext), at(r, 'school_name'));
      }
      if (at(r, 'teacher_phone')) await addTeacher(at(r, 'teacher_phone'), ext, at(r, 'teacher_name') || null);
      result.applied += 1;
    } catch (err) {
      result.errors.push({ row: i + 2, error: err.message });   // +2: 1-based, after the header
    }
  }
  return result;
}

async function listRoster(coachPhone) {
  const coach = await findUser(normalizeIdentity(coachPhone));
  if (!coach) throw new Error(`no user with ${coachPhone}`);
  const Roster = require('../shared/services/observe/observe-roster.service');
  const [schools, teachers] = await Promise.all([Roster.listSchools(coach.id), Roster.listTeachers(coach.id)]);
  return { coach, schools, teachers };
}

async function setEmail(coachPhone, email, fullName) {
  const coach = await findUser(normalizeIdentity(coachPhone));
  if (!coach || !isSchoolLeader(coach)) throw new Error(`${coachPhone} is not a coach yet — run grant-coach first`);
  const CoachDirectory = require('../shared/services/observe/coach-directory');
  return CoachDirectory.setWorkEmail(coach.id, { email, fullName: fullName || coach.name });
}

/**
 * The portal setup link, sent on the channel the person last used (their
 * Matrix DM for a coach who uses only the messenger: there is no inbound
 * message to answer). Run from a one-off process, the Matrix send goes
 * through the bot's outbound relay (messaging/matrix-outbound-relay.js).
 */
async function portalInvite(phone) {
  const user = await findUser(normalizeIdentity(phone));
  if (!user) throw new Error(`no user with ${phone}`);
  if (user.portal_activated) throw new Error(`${phone} has already set up the portal — they can sign in, or reset their password there`);
  const PortalInviteService = require('../shared/services/portal-invite.service');
  const { identityForUser } = require('../shared/services/messaging/user-identity');
  const recipient = await identityForUser(user.id);
  const result = await PortalInviteService.sendPortalInvite(user.id, recipient, user.preferred_language || 'en');
  if (result.reason === 'no_sign_in_number') {
    throw new Error(`${phone} has no phone number to sign in to the portal with (see docs/channels/matrix.md)`);
  }
  if (!result.success) throw new Error(`the invite was not sent: ${result.error}`);
  return { recipient };
}

/** @returns {Promise<number>} exit code */
async function main(argv = process.argv.slice(2), out = console) {
  const [cmd, ...args] = argv;
  try {
    switch (cmd) {
      case 'grant-coach': {
        if (!args[0]) break;
        const u = await grantCoach(args[0], args[1]);
        // The identity as given: a Matrix/Slack/Discord person has no phone_number.
        out.log(`✓ ${args[0]} is a ${u.role}`);
        return 0;
      }
      case 'add-school': {
        if (args.length < 3) break;
        const { school } = await addSchool(args[0], args[1], args.slice(2).join(' '));
        out.log(`✓ ${args[0]} now coaches ${school.name} (${school.ext_id})`);
        return 0;
      }
      case 'add-teacher': {
        if (args.length < 2) break;
        const { teacher, school } = await addTeacher(args[0], args[1], args.slice(2).join(' ') || null);
        out.log(`✓ ${teacher.name || args[0]} is at ${school.name} (${school.ext_id})`);
        return 0;
      }
      case 'import': {
        if (!args[0]) break;
        const res = await importCsv(fs.readFileSync(args[0], 'utf8'));
        out.log(`✓ ${res.applied} row(s) applied`);
        for (const e of res.errors) out.error(`row ${e.row}: ${e.error}`);
        return res.errors.length ? 1 : 0;
      }
      case 'list': {
        if (!args[0]) break;
        const { coach, schools, teachers } = await listRoster(args[0]);
        out.log(`${coach.name || args[0]} (${coach.role || 'no role'})`);
        for (const s of schools) {
          out.log(`  ${s.name} [${s.ext_id || s.id}]`);
          for (const tc of teachers.filter((x) => x.school_id === s.id)) out.log(`    - ${tc.name} ${tc.phone || ''}`.trimEnd());
        }
        if (!schools.length) out.log('  (no schools)');
        return 0;
      }
      case 'set-email': {
        if (args.length < 2) break;
        await setEmail(args[0], args[1], args.slice(2).join(' ') || null);
        out.log(`✓ calendar invites for ${args[0]} go to ${args[1]}`);
        return 0;
      }
      case 'portal-invite': {
        if (!args[0]) break;
        const { recipient } = await portalInvite(args[0]);
        out.log(`✓ portal invite sent to ${recipient}`);
        return 0;
      }
      default:
        break;
    }
  } catch (err) {
    out.error(err.message);
    return 1;
  }
  out.error(USAGE);
  return 1;
}

if (require.main === module) {
  require('dotenv').config();
  main().then((code) => process.exit(code));
}

module.exports = {
  main, normalizeIdentity, schoolExtId, parseCsv, importCsv, grantCoach, addSchool, addTeacher, listRoster, setEmail,
  portalInvite,
};
