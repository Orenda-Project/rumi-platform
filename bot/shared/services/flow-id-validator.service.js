/**
 * FLOW_ID runtime self-check — Layer 2 defense against cross-WABA contamination.
 *
 * On bot boot, for every *_FLOW_ID env var the bot reads at runtime, we call the
 * Cloud API and assert:
 *   (a) the Flow ID resolves
 *   (b) on the WABA pointed at by this service's WABA_ID env var
 *   (c) status === PUBLISHED
 *   (d) validation_errors is empty
 *
 * On any failure: log `flow_id.drift_detected` to Axiom. We never crash the bot —
 * the existing `if (!X_FLOW_ID) { graceful-empty-message; return; }` guard already
 * degrades safely if a Flow becomes unusable.
 *
 * The same set of env vars is asserted statically at PR time by
 * tests/phase4-tz/flow-id-inventory.test.js  — keep this list in sync.
 */

'use strict';

const { logToFile } = require('../utils/logger');

const EXPECTED_FLOW_ID_ENV_VARS = [
  // Every Flow ID env var this codebase reads at runtime. Unset vars are
  // SKIPPED, not flagged, so a deployment that does not use a feature costs
  // nothing — but a var that IS set gets verified at boot: the Flow must
  // resolve, sit on this deployment's WABA, and be PUBLISHED.
  'ATTENDANCE_MARKING_FLOW_ID',
  'ATTENDANCE_SETUP_FLOW_ID',
  'EDIT_CLASS_FLOW_ID',
  'HOMEWORK_FLOW_ID',
  'PIC_LP_FLOW_ID',
  'QUIZ_FLOW_ID',
  'READING_ASSESSMENT_FLOW_ID',
  'REGISTRATION_FLOW_ID',
  'SETTINGS_FLOW_ID',
  'STATUS_FLOW_ID',
  'STUDENT_VIDEOS_FLOW_ID',
  // Video quizzes — the picture-option picker Flow and the one-screen
  // name+class form a new student fills once.
  'VIDEO_QUIZ_FLOW_ID',
  'STUDENT_JOIN_FLOW_ID',
  // EXAM_CHECKER_STUDENTS_FLOW_ID is read by code but commonly unset
  // (code falls back to a string-name match) — excluded so we don't flag it on every boot.
];

async function listWabaFlows(wabaId, token, fetchImpl) {
  // GET /{WABA_ID}/flows returns ONLY flows that belong to this WABA.
  // This is what makes the cross-WABA contamination check work: GET /{flow_id}
  // on its own does NOT verify ownership (Meta's API answers cross-WABA), but
  // a Flow ID missing from /{WABA_ID}/flows proves it doesn't belong here.
  const url = `https://graph.facebook.com/v20.0/${wabaId}/flows?fields=id,name,status,validation_errors&limit=200`;
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`listWabaFlows HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const j = await res.json();
  const map = new Map();
  for (const f of (j.data || [])) map.set(f.id, f);
  return map;
}

function checkOneFlow(envName, flowId, wabaFlows) {
  const flow = wabaFlows.get(flowId);
  if (!flow) {
    return {
      envName, flowId,
      status: 'wrong_waba',
      reason: 'Flow ID not present in this WABA\'s flow list — likely points at a different WABA',
    };
  }
  if (flow.status !== 'PUBLISHED') {
    return {
      envName, flowId,
      status: 'not_published',
      reason: `status=${flow.status}`,
      name: flow.name,
    };
  }
  const ve = (flow.validation_errors || []).length;
  if (ve > 0) {
    return {
      envName, flowId,
      status: 'validation_errors',
      reason: `validation_errors=${ve}`,
      name: flow.name,
    };
  }
  return { envName, flowId, status: 'ok', name: flow.name };
}

/**
 * Validate every expected FLOW_ID env var against the configured WABA.
 * Fail-soft: never throws. Returns a summary.
 *
 * @param {object} opts
 * @param {NodeJS.ProcessEnv} [opts.env] - env source (defaults to process.env)
 * @param {Function} [opts.fetchImpl] - injected fetch (defaults to global fetch)
 * @returns {Promise<{validated: number, drifted: object[], skipped: string[], reason?: string}>}
 */
async function validateFlowIdsOnBoot({ env = process.env, fetchImpl = fetch } = {}) {
  const token = env.WHATSAPP_TOKEN;
  const wabaId = env.WABA_ID;
  if (!token || !wabaId) {
    logToFile('flow_id.validator.skipped', {
      reason: 'WHATSAPP_TOKEN or WABA_ID not set — skipping FLOW_ID self-check',
    });
    return { validated: 0, drifted: [], skipped: EXPECTED_FLOW_ID_ENV_VARS, reason: 'no_credentials' };
  }

  let wabaFlows;
  try {
    wabaFlows = await listWabaFlows(wabaId, token, fetchImpl);
  } catch (e) {
    // If we can't even list the WABA's flows, that's its own drift signal.
    logToFile('flow_id.validator.list_failed', {
      configuredWabaId: wabaId,
      reason: e.message,
      severity: 'warn',
    });
    return { validated: 0, drifted: [], skipped: EXPECTED_FLOW_ID_ENV_VARS, reason: 'waba_list_unreachable' };
  }

  const checks = EXPECTED_FLOW_ID_ENV_VARS.map((envName) => {
    const flowId = env[envName];
    if (!flowId) {
      // Unset is a known degradation path (graceful-empty handlers).
      // Don't count as drift — count as skipped.
      return { envName, status: 'unset' };
    }
    return checkOneFlow(envName, flowId, wabaFlows);
  });

  const drifted = checks.filter(c => c.status !== 'ok' && c.status !== 'unset');
  const unset = checks.filter(c => c.status === 'unset').map(c => c.envName);
  const validated = checks.filter(c => c.status === 'ok').length;

  for (const d of drifted) {
    logToFile('flow_id.drift_detected', {
      envName: d.envName,
      flowId: d.flowId,
      configuredWabaId: wabaId,
      driftStatus: d.status,
      reason: d.reason,
      detail: d.detail,
      severity: 'warn',
    });
  }

  logToFile('flow_id.validator.summary', {
    configuredWabaId: wabaId,
    validated,
    drifted: drifted.length,
    unset: unset.length,
    unsetVars: unset,
  });

  return { validated, drifted, skipped: unset };
}

module.exports = {
  validateFlowIdsOnBoot,
  EXPECTED_FLOW_ID_ENV_VARS,
};
