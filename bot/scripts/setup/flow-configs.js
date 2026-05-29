/**
 * flow-configs — the single source of truth for which WhatsApp Flows this
 * deployment registers.
 *
 * Both the registrar (`register-all-flows`) and the validators
 * (`setup-state`, `validate-flows`) import from here, so the set of flows that
 * gets registered can never drift from the set that gets validated. Adding a
 * new flow = add one entry here + drop its JSON in `docs/flows/`.
 *
 * Each entry:
 *   name          Human-readable flow name (also the key used in setup state).
 *   jsonPath      Absolute path to the Flow JSON shipped in docs/flows/.
 *   type          'navigate' (no server endpoint) | 'endpoint' (data-exchange).
 *   endpointPath  (endpoint only) path appended to the deployment's base URL.
 *                 MUST match a route mounted under `/api/flows` in
 *                 flow-endpoint.routes.js (the router is mounted at
 *                 `app.use('/api/flows', ...)` in whatsapp-bot.js), e.g.
 *                 `/api/flows/settings`. A mismatch registers the Flow's data
 *                 endpoint at a 404 path. The flow-config-conformance test
 *                 guards this.
 *   envVar        The .env variable the registered Flow ID is written back to.
 *   categories    Meta Flow categories.
 */

const path = require('path');

// Flow JSON lives in the repo-root docs/flows/ directory (single location).
const FLOWS_DIR = path.resolve(__dirname, '../../../docs/flows');

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
    endpointPath: '/api/flows/attendance-setup',
    envVar: 'ATTENDANCE_SETUP_FLOW_ID',
    categories: ['OTHER'],
  },
  {
    name: 'Attendance Marking',
    jsonPath: path.join(FLOWS_DIR, 'attendance-marking-flow.json'),
    type: 'endpoint',
    endpointPath: '/api/flows/attendance-marking',
    envVar: 'ATTENDANCE_MARKING_FLOW_ID',
    categories: ['OTHER'],
  },
  {
    name: 'Settings',
    jsonPath: path.join(FLOWS_DIR, 'settings-flow.json'),
    type: 'endpoint',
    endpointPath: '/api/flows/settings',
    envVar: 'SETTINGS_FLOW_ID',
    categories: ['OTHER'],
  },
  {
    name: 'Status',
    jsonPath: path.join(FLOWS_DIR, 'status-flow.json'),
    type: 'endpoint',
    endpointPath: '/api/flows/status',
    envVar: 'STATUS_FLOW_ID',
    categories: ['OTHER'],
  },
  {
    name: 'Homework Request',
    jsonPath: path.join(FLOWS_DIR, 'homework-request-flow.json'),
    type: 'endpoint',
    endpointPath: '/api/flows/homework-request',
    envVar: 'HOMEWORK_FLOW_ID',
    categories: ['OTHER'],
  },
  {
    name: 'Edit Class',
    jsonPath: path.join(FLOWS_DIR, 'edit-class-flow.json'),
    type: 'endpoint',
    endpointPath: '/api/flows/edit-class',
    envVar: 'EDIT_CLASS_FLOW_ID',
    categories: ['OTHER'],
  },
  {
    name: 'Student Videos',
    jsonPath: path.join(FLOWS_DIR, 'student-videos-flow.json'),
    type: 'endpoint',
    endpointPath: '/api/flows/student-videos',
    envVar: 'STUDENT_VIDEOS_FLOW_ID',
    categories: ['OTHER'],
  },
  {
    name: 'Pic-to-LP Confirm',
    jsonPath: path.join(FLOWS_DIR, 'pic-lp-confirm-flow.json'),
    type: 'endpoint',
    endpointPath: '/api/flows/pic-lp',
    envVar: 'PIC_LP_FLOW_ID',
    categories: ['OTHER'],
  },
  {
    name: 'Quiz Manager',
    jsonPath: path.join(FLOWS_DIR, 'quiz-flow.json'),
    type: 'endpoint',
    endpointPath: '/api/flows/quiz',
    envVar: 'QUIZ_FLOW_ID',
    categories: ['OTHER'],
  },
  {
    // Optional polished registration form. OSS registration also works
    // conversationally (name capture); this Flow is sent instead only when
    // REGISTRATION_FLOW_ID is set. The /registration endpoint already handles
    // its screens (PERSONAL_INFO / REGION_INFO / PROFESSIONAL_INFO / ORG_DETAILS).
    name: 'Registration',
    jsonPath: path.join(FLOWS_DIR, 'registration-flow-v3.json'),
    type: 'endpoint',
    endpointPath: '/api/flows/registration',
    envVar: 'REGISTRATION_FLOW_ID',
    categories: ['OTHER'],
  },
  {
    // Exam-checker "confirm detected students" step. data_exchange endpoint
    // flow (the student list is dynamic per session) modelled on
    // attendance-marking. Endpoint INIT loads the session's detected_students;
    // completion returns confirmed_students. Only sent when the exam-checker
    // feature is active (MISTRAL_API_KEY or CHANDRA_API_KEY) AND this Flow is
    // registered (EXAM_CHECKER_STUDENTS_FLOW_ID set).
    name: 'Exam Checker Confirm Students',
    jsonPath: path.join(FLOWS_DIR, 'exam-checker-confirm-students-flow.json'),
    type: 'endpoint',
    endpointPath: '/api/flows/exam-confirm-students',
    envVar: 'EXAM_CHECKER_STUDENTS_FLOW_ID',
    categories: ['OTHER'],
  },
];

/** The flow names that a complete setup must have registered. */
const REQUIRED_FLOW_NAMES = FLOW_CONFIGS.map((c) => c.name);

module.exports = { FLOW_CONFIGS, REQUIRED_FLOW_NAMES, FLOWS_DIR };
