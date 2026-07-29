/**
 * bd-1539 — unit tests for FLOW_ID runtime self-check.
 *
 * The validator does ONE `/{WABA_ID}/flows` API call and then checks each
 * expected env var's FLOW_ID against the returned list. A Flow ID NOT present
 * in the list is the cross-WABA-contamination signal — Meta's `GET /{flow_id}`
 * alone doesn't enforce ownership, so checking the WABA's own flow list is
 * the only reliable way to detect it.
 *
 * Tests use an injected fetch. No real network.
 */

const { validateFlowIdsOnBoot, EXPECTED_FLOW_ID_ENV_VARS } = require('../../bot/shared/services/flow-id-validator.service');

jest.mock('../../bot/shared/utils/logger', () => ({
  logToFile: jest.fn(),
  LOGS_DIR: '/tmp',
}));

function makeWabaFlows(overrides = {}) {
  // Default: every expected env var's FLOW_ID present, PUBLISHED, ve=0.
  const data = EXPECTED_FLOW_ID_ENV_VARS.map((envName, idx) => ({
    id: `100${idx}`,
    name: `Flow ${envName}`,
    status: 'PUBLISHED',
    validation_errors: [],
    ...overrides[envName],
  }));
  return { ok: true, json: async () => ({ data }) };
}

function makeEnv(overrides = {}) {
  const base = { WHATSAPP_TOKEN: 'tok', WABA_ID: '1383233296670749' };
  EXPECTED_FLOW_ID_ENV_VARS.forEach((name, idx) => { base[name] = `100${idx}`; });
  return { ...base, ...overrides };
}

describe('bd-1539 — flow-id-validator', () => {
  test('happy path: every FLOW_ID belongs to WABA + PUBLISHED + ve=0 → all validated', async () => {
    const fetchImpl = jest.fn(async () => makeWabaFlows());
    const r = await validateFlowIdsOnBoot({ env: makeEnv(), fetchImpl });
    expect(r.validated).toBe(EXPECTED_FLOW_ID_ENV_VARS.length);
    expect(r.drifted).toEqual([]);
    expect(r.skipped).toEqual([]);
    // Only ONE API call needed (the WABA flow list), not N.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('skip path: WHATSAPP_TOKEN missing → no API calls', async () => {
    const fetchImpl = jest.fn();
    const r = await validateFlowIdsOnBoot({ env: makeEnv({ WHATSAPP_TOKEN: '' }), fetchImpl });
    expect(r.reason).toBe('no_credentials');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('skip path: WABA_ID missing → no API calls', async () => {
    const fetchImpl = jest.fn();
    const r = await validateFlowIdsOnBoot({ env: makeEnv({ WABA_ID: '' }), fetchImpl });
    expect(r.reason).toBe('no_credentials');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('unset path: one FLOW_ID empty → counted as unset, not drift', async () => {
    const fetchImpl = jest.fn(async () => makeWabaFlows());
    const r = await validateFlowIdsOnBoot({ env: makeEnv({ SETTINGS_FLOW_ID: '' }), fetchImpl });
    expect(r.validated).toBe(EXPECTED_FLOW_ID_ENV_VARS.length - 1);
    expect(r.skipped).toContain('SETTINGS_FLOW_ID');
    expect(r.drifted).toEqual([]);
  });

  test('drift: Flow ID NOT in WABA flow list → status=wrong_waba (the contamination case)', async () => {
    const fetchImpl = jest.fn(async () => makeWabaFlows());
    // Put a Flow ID that doesn't exist in the WABA's returned list
    const r = await validateFlowIdsOnBoot({
      env: makeEnv({ REGISTRATION_FLOW_ID: '9999999999' }),
      fetchImpl,
    });
    expect(r.drifted).toHaveLength(1);
    expect(r.drifted[0].status).toBe('wrong_waba');
    expect(r.drifted[0].envName).toBe('REGISTRATION_FLOW_ID');
  });

  test('drift: status non-PUBLISHED → status=not_published', async () => {
    const fetchImpl = jest.fn(async () => makeWabaFlows({
      ATTENDANCE_MARKING_FLOW_ID: { status: 'DRAFT' },
    }));
    const r = await validateFlowIdsOnBoot({ env: makeEnv(), fetchImpl });
    expect(r.drifted).toHaveLength(1);
    expect(r.drifted[0].status).toBe('not_published');
    expect(r.drifted[0].reason).toBe('status=DRAFT');
  });

  test('drift: validation_errors present → status=validation_errors', async () => {
    const fetchImpl = jest.fn(async () => makeWabaFlows({
      ATTENDANCE_MARKING_FLOW_ID: { validation_errors: [{}, {}] },
    }));
    const r = await validateFlowIdsOnBoot({ env: makeEnv(), fetchImpl });
    expect(r.drifted).toHaveLength(1);
    expect(r.drifted[0].status).toBe('validation_errors');
    expect(r.drifted[0].reason).toBe('validation_errors=2');
  });

  test('fail-soft: WABA list call fails → reason=waba_list_unreachable, no crash', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false, status: 401, text: async () => '{"error":"unauthorized"}',
    }));
    const r = await validateFlowIdsOnBoot({ env: makeEnv(), fetchImpl });
    expect(r.reason).toBe('waba_list_unreachable');
    expect(r.validated).toBe(0);
  });

  test('fail-soft: fetch throws → reason=waba_list_unreachable, no crash', async () => {
    const fetchImpl = jest.fn(async () => { throw new Error('network down'); });
    const r = await validateFlowIdsOnBoot({ env: makeEnv(), fetchImpl });
    expect(r.reason).toBe('waba_list_unreachable');
  });

  test('inventory parity: this list matches the bd-1533 static check', () => {
    expect(EXPECTED_FLOW_ID_ENV_VARS).toEqual([
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
      'VIDEO_QUIZ_FLOW_ID',
      'STUDENT_JOIN_FLOW_ID',
    ]);
  });
});
