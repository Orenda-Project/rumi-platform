/**
 * flow-configs — the single source of truth for which WhatsApp Flows this
 * deployment registers.
 *
 * Both the registrar (`register-all-flows`) and the validators
 * (`setup-state`, `validate-flows`) import from here, so the set of flows that
 * gets registered can never drift from the set that gets validated. Adding a
 * new flow = add one entry here + drop its JSON in `bot/docs/flows/`.
 *
 * Each entry:
 *   name          Human-readable flow name (also the key used in setup state).
 *   jsonPath      Absolute path to the Flow JSON shipped in bot/docs/flows/.
 *   type          'navigate' (no server endpoint) | 'endpoint' (data-exchange).
 *   endpointPath  (endpoint only) path appended to the deployment's base URL.
 *   envVar        The .env variable the registered Flow ID is written back to.
 *   categories    Meta Flow categories.
 */

const path = require('path');

const FLOWS_DIR = path.resolve(__dirname, '../../docs/flows');

const FLOW_CONFIGS = [
  {
    name: 'Reading Assessment',
    jsonPath: path.join(FLOWS_DIR, 'reading-assessment-flow-v2.json'),
    type: 'navigate',
    envVar: 'READING_ASSESSMENT_FLOW_ID',
    categories: ['OTHER'],
  },
  {
    name: 'Attendance Setup',
    jsonPath: path.join(FLOWS_DIR, 'attendance-setup-flow.json'),
    type: 'endpoint',
    endpointPath: '/flow/attendance-setup',
    envVar: 'ATTENDANCE_SETUP_FLOW_ID',
    categories: ['OTHER'],
  },
  {
    name: 'Attendance Marking',
    jsonPath: path.join(FLOWS_DIR, 'attendance-marking-flow.json'),
    type: 'endpoint',
    endpointPath: '/flow/attendance-marking',
    envVar: 'ATTENDANCE_MARKING_FLOW_ID',
    categories: ['OTHER'],
  },
];

/** The flow names that a complete setup must have registered. */
const REQUIRED_FLOW_NAMES = FLOW_CONFIGS.map((c) => c.name);

module.exports = { FLOW_CONFIGS, REQUIRED_FLOW_NAMES, FLOWS_DIR };
