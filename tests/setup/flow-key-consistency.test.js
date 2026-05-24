/**
 * Flow-key consistency — the validators (setup-state.isComplete, validate-flows)
 * must require exactly the flows the registrar (register-all-flows) actually
 * registers. Before this was fixed, the validators required
 * ['registration','feedback','lesson_plan'] while the registrar produced
 * ['Reading Assessment','Attendance Setup','Attendance Marking'], so a fully
 * registered deployment was reported as incomplete forever.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { SetupState } = require('../../bot/scripts/setup/setup-state');
const { FLOW_CONFIGS } = require('../../bot/scripts/setup/flow-configs');

function stateWithAllRegistrarFlows() {
  const now = new Date().toISOString();
  const flows = {};
  for (const c of FLOW_CONFIGS) {
    flows[c.name] = {
      flowId: `id_${c.name.replace(/\s+/g, '_')}`,
      status: 'PUBLISHED',
      envVar: c.envVar,
      type: c.type,
      registeredAt: now,
    };
  }
  return {
    version: '2.0.0',
    createdAt: now,
    updatedAt: now,
    encryption: { configured: true },
    flows,
    templates: {},
  };
}

describe('flow-key consistency: validators agree with the registrar', () => {
  let tmpDir;
  let statePath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fkc-'));
    statePath = path.join(tmpDir, '.setup-state.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('isComplete() is TRUE when exactly the registrar flows are registered + encryption configured', async () => {
    fs.writeFileSync(statePath, JSON.stringify(stateWithAllRegistrarFlows()));
    const s = new SetupState(statePath);
    await s.load();
    expect(s.isComplete()).toBe(true);
  });

  it('isComplete() is FALSE when a registrar flow is missing', async () => {
    const st = stateWithAllRegistrarFlows();
    delete st.flows[FLOW_CONFIGS[0].name];
    fs.writeFileSync(statePath, JSON.stringify(st));
    const s = new SetupState(statePath);
    await s.load();
    expect(s.isComplete()).toBe(false);
  });

  it('getNextIncompleteStep() returns null when all registrar flows + a template exist', async () => {
    const st = stateWithAllRegistrarFlows();
    st.templates = { welcome: { templateId: 't1', status: 'APPROVED' } };
    fs.writeFileSync(statePath, JSON.stringify(st));
    const s = new SetupState(statePath);
    await s.load();
    expect(s.getNextIncompleteStep()).toBeNull();
  });
});
