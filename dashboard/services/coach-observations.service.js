/**
 * The coach's view in the portal: "My observations".
 *
 * Resolves, for one coach (a portal user in the observe role family):
 *   upcoming    — their observation_schedules still 'upcoming', date-ordered,
 *                 flagged overdue when the date has passed
 *   waiting     — observations waiting on THEM: a form to check
 *                 (awaiting_observer_review), a debrief to do (form done,
 *                 debrief_status pending), a report to send (debrief done,
 *                 no report out — never sent, failed, or an invite the
 *                 teacher never opened and the sweep gave up on)
 *   delivering  — the report is on its way but the teacher does not have it
 *                 yet: an invite waiting for the teacher to open it
 *                 (awaitingTeacher), or a report with the review team
 *                 (withReview). Nothing for the coach to do, not done either.
 *   inProgress  — still being transcribed / analysed (nothing to do yet)
 *   completed   — debrief done and the report reached the teacher
 *                 (teacher_delivery.status = 'sent'; same rule as the bot's
 *                 observe-completion.js)
 * and their teachers — the DERIVED roster (leader_schools x users.school_id,
 * the same join as bot/shared/services/observe/observe-roster.service.js) —
 * with each teacher's past observations.
 *
 * Trust firewall: every payload here is a whitelist. No score, no rating, no
 * coach-the-coach feedback (analysis_data.observer_debrief) and nothing else
 * from analysis_data except the report's delivery state and Section B's moves
 * and verdicts (shaped by coach-section-b.js — never its percentage or band)
 * ever leaves this file.
 *
 * The dashboard is deployed on its own (a service rooted at dashboard/), so it
 * cannot require the bot's modules at runtime. The coach role family is
 * therefore mirrored from bot/shared/services/observe/observe-gate.js — same
 * env var, same default — and a drift-guard test
 * (tests/observe/observe-portal-coach.service.test.js) requires both files and
 * fails if they ever disagree.
 *
 * The same goes for the switch: the coach view exists only while observe is
 * on (isObserveEnabled — OBSERVE_ENABLED=true and not paused from the console
 * with RUMI_FEATURE_OBSERVE=off), mirrored from observe-gate.js and checked
 * against it by the same drift-guard test. The dashboard reads its own
 * environment, so the variable has to be set on the dashboard service too.
 *
 * Every function takes the supabase client as `db`, so the route can pass the
 * dashboard's client and tests can pass an in-memory fake. A failed read
 * throws: an empty answer would tell the coach "nothing waiting" when there
 * may be, so the route turns it into a 500 and the page shows its error state.
 */

const { shapeSectionB } = require('./coach-section-b');

// Mirror of observe-gate.js DEFAULT_LEADER_ROLES (drift-guarded by test).
// The shared role vocabulary: principal / school_leader are read aliases of head_teacher.
const DEFAULT_COACH_ROLES = Object.freeze(['head_teacher', 'principal', 'school_leader', 'coach', 'supervisor']);

const TERMINAL = ['cancelled', 'abandoned'];
const SESSION_LIMIT = 500;

/**
 * Mirror of observe-gate.js isObserveEnabled(): on only when OBSERVE_ENABLED
 * is "true" (trimmed, any case) and the console has not paused it
 * (RUMI_FEATURE_OBSERVE=off). Read at call time, like the bot.
 */
function isObserveEnabled() {
  if (String(process.env.OBSERVE_ENABLED || '').trim().toLowerCase() !== 'true') return false;
  return String(process.env.RUMI_FEATURE_OBSERVE || '').trim().toLowerCase() !== 'off';
}

/** The observe role family; OBSERVE_LEADER_ROLES replaces it, read at call time. */
function coachRoles() {
  const raw = process.env.OBSERVE_LEADER_ROLES;
  if (!raw || !raw.trim()) return [...DEFAULT_COACH_ROLES];
  return raw.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
}

/** In the role family (whatever the switch says). @param {{role?: string|null}|null} user users row */
function isCoach(user) {
  return !!user && typeof user.role === 'string' && coachRoles().includes(user.role.trim().toLowerCase());
}

/** Gets the coach view: observe is on AND the user is in the role family. */
function canUseCoachView(user) {
  return isObserveEnabled() && isCoach(user);
}

function isoDay(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Which list an observation belongs in, from its status, debrief_status and
 * the report's delivery state. null = not shown (cancelled / abandoned).
 */
function stageOf(row) {
  const status = row.status;
  if (TERMINAL.includes(status)) return null;
  if (status === 'completed') return 'completed';
  if (status === 'awaiting_observer_review') return 'form';
  if (status === 'observer_review_complete') {
    if (row.debrief_status !== 'done') return 'debrief';
    const delivery = ((row.analysis_data || {}).teacher_delivery) || {};
    if (delivery.status === 'sent') return 'completed';
    if (delivery.status === 'operator_review') return 'withReview';
    // An invite the untapped sweep gave up on keeps its status; it is the
    // coach's to send again.
    if (delivery.status === 'awaiting_teacher_tap' && !delivery.gave_up_at) return 'awaitingTeacher';
    return 'report';
  }
  return 'inProgress';
}

function shapeSchedule(r, today) {
  const scheduledFor = isoDay(r.scheduled_for);
  return {
    id: r.id,
    teacherName: r.teacher_name || null,
    teacherUserId: r.teacher_ext_id || null,
    schoolName: r.school_name || null,
    scheduledFor,
    scheduledSlot: r.scheduled_slot || null,
    overdue: !!(scheduledFor && today && scheduledFor < today),
  };
}

/**
 * The coach's observations, each shaped to the whitelist and tagged with the
 * observed teacher. Identity, in order: the visit the observation was linked
 * to, the bound teacher (user_id, unless it is still the coach's own bare
 * capture), the name typed when the report was sent.
 */
async function loadObservations(db, coachId) {
  const { data: rows, error } = await db
    .from('coaching_sessions')
    .select('id, created_at, status, debrief_status, user_id, observer_user_id, analysis_data')
    .eq('observer_user_id', coachId)
    .eq('observation_type', 'leader_observation')
    .order('created_at', { ascending: false })
    .limit(SESSION_LIMIT);
  if (error) throw new Error(error.message);
  const sessions = (rows || []).filter((r) => stageOf(r) !== null);
  if (!sessions.length) return [];

  const bySession = new Map();
  const { data: linked, error: linkErr } = await db
    .from('observation_schedules')
    .select('session_id, teacher_ext_id, teacher_name, school_name')
    .eq('leader_user_id', coachId)
    .in('session_id', sessions.map((s) => s.id));
  // Without the links, observations made through a visit lose their teacher
  // and the roster under-counts — fail rather than show that.
  if (linkErr) throw new Error(linkErr.message);
  for (const s of linked || []) if (s.session_id && !bySession.has(s.session_id)) bySession.set(s.session_id, s);

  const boundIds = [...new Set(sessions.map((s) => s.user_id).filter((id) => id && id !== coachId))];
  const names = new Map();
  if (boundIds.length) {
    const { data: users, error: nameErr } = await db.from('users').select('id, name, first_name').in('id', boundIds);
    if (nameErr) throw new Error(nameErr.message);
    for (const u of users || []) names.set(u.id, u.name || u.first_name || null);
  }

  return sessions.map((r) => {
    const sched = bySession.get(r.id) || null;
    const bound = r.user_id && r.user_id !== coachId ? r.user_id : null;
    const delivery = ((r.analysis_data || {}).teacher_delivery) || {};
    const teacherName = (sched && sched.teacher_name) || (bound && names.get(bound)) || delivery.teacher_name || null;
    return {
      id: r.id,
      createdAt: r.created_at || null,
      stage: stageOf(r),
      teacherUserId: bound || (sched && sched.teacher_ext_id) || null,
      teacherName,
      schoolName: (sched && sched.school_name) || null,
      reportStatus: delivery.status || null,
      reportSentAt: delivery.sent_at || null,
      sectionB: shapeSectionB(r.analysis_data, { teacherName }),
    };
  });
}

/**
 * @param {object} db supabase client
 * @param {string} coachId portal session user id
 * @param {{today?: string}} [opts] today as YYYY-MM-DD (defaults to now, UTC)
 * @throws when a read fails (the route answers 500)
 */
async function getCoachObservations(db, coachId, opts = {}) {
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const [{ data: schedules, error }, observations] = await Promise.all([
    db.from('observation_schedules')
      .select('id, teacher_ext_id, teacher_name, school_name, scheduled_for, scheduled_slot, created_at')
      .eq('leader_user_id', coachId)
      .eq('status', 'upcoming')
      .order('scheduled_for', { ascending: true })
      .order('created_at', { ascending: true }),
    loadObservations(db, coachId),
  ]);
  if (error) throw new Error(error.message);
  const pick = (...stages) => observations.filter((o) => stages.includes(o.stage));
  return {
    upcoming: (schedules || []).map((r) => shapeSchedule(r, today)),
    waiting: { form: pick('form'), debrief: pick('debrief'), report: pick('report') },
    delivering: pick('awaitingTeacher', 'withReview'),
    inProgress: pick('inProgress'),
    completed: pick('completed'),
  };
}

/** The derived roster: users in the coach's schools, minus fellow coaches. */
async function loadRoster(db, coachId) {
  const { data: schools, error } = await db
    .from('leader_schools')
    .select('school_id, school_name')
    .eq('leader_user_id', coachId);
  if (error) throw new Error(error.message);
  const bySchool = new Map((schools || []).filter((s) => s.school_id).map((s) => [s.school_id, s.school_name]));
  if (!bySchool.size) return [];
  const { data: users, error: uErr } = await db
    .from('users')
    .select('id, name, first_name, school_id, role')
    .in('school_id', [...bySchool.keys()]);
  if (uErr) throw new Error(uErr.message);
  return (users || [])
    .filter((u) => u.id !== coachId && !isCoach(u))
    .map((u) => ({ id: u.id, name: u.name || u.first_name || 'Teacher', schoolName: bySchool.get(u.school_id) || null }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function summarise(teacher, observations) {
  const mine = observations.filter((o) => o.teacherUserId === teacher.id);
  return {
    ...teacher,
    observationCount: mine.length,
    lastObservedAt: mine.length ? mine[0].createdAt : null,
  };
}

/** @returns {Promise<Array<{id, name, schoolName, observationCount, lastObservedAt}>>} */
async function listCoachTeachers(db, coachId) {
  const roster = await loadRoster(db, coachId);
  if (!roster.length) return [];
  const observations = await loadObservations(db, coachId);
  return roster.map((t) => summarise(t, observations));
}

/**
 * One teacher and the observations this coach made of them — null unless the
 * teacher is on this coach's roster, so a coach cannot read another's teachers.
 */
async function getCoachTeacher(db, coachId, teacherId) {
  const roster = await loadRoster(db, coachId);
  const teacher = roster.find((t) => t.id === teacherId);
  if (!teacher) return null;
  const observations = (await loadObservations(db, coachId)).filter((o) => o.teacherUserId === teacherId);
  return { teacher, observations };
}

module.exports = {
  DEFAULT_COACH_ROLES,
  isObserveEnabled,
  coachRoles,
  isCoach,
  canUseCoachView,
  stageOf,
  getCoachObservations,
  listCoachTeachers,
  getCoachTeacher,
};
