/**
 * setup-validator — Boot-time validator that checks environment variables
 * for flow configuration on startup.
 *
 * This is a SYNCHRONOUS function. It makes no API calls — it only reads
 * process.env. Designed to run at boot time as a non-blocking check.
 *
 * @module setup-validator
 */

const PREFIX = '[setup-validator]';

/**
 * Validate that required environment variables for flow-based features
 * are configured correctly.
 *
 * Checks:
 *  - READING_ASSESSMENT_FLOW_ID    → warn if missing
 *  - ATTENDANCE_SETUP_FLOW_ID      → warn if missing
 *  - ATTENDANCE_MARKING_FLOW_ID    → warn if missing
 *  - FLOW_PRIVATE_KEY              → error if missing AND any attendance flow ID is set
 *
 * @returns {{ ok: boolean, warnings: string[], errors: string[] }}
 */
function validateBootRequirements() {
  const warnings = [];
  const errors = [];

  // -----------------------------------------------------------------------
  // 1. Check individual flow IDs — warn if not set
  // -----------------------------------------------------------------------
  const readingFlowId = process.env.READING_ASSESSMENT_FLOW_ID;
  const attendanceSetupFlowId = process.env.ATTENDANCE_SETUP_FLOW_ID;
  const attendanceMarkingFlowId = process.env.ATTENDANCE_MARKING_FLOW_ID;
  const flowPrivateKey = process.env.FLOW_PRIVATE_KEY;

  if (!readingFlowId) {
    const msg = `${PREFIX} READING_ASSESSMENT_FLOW_ID is not set. Reading assessment flows will not be available.`;
    warnings.push(msg);
    console.warn(msg);
  }

  if (!attendanceSetupFlowId) {
    const msg = `${PREFIX} ATTENDANCE_SETUP_FLOW_ID is not set. Attendance setup flow will not be available.`;
    warnings.push(msg);
    console.warn(msg);
  }

  if (!attendanceMarkingFlowId) {
    const msg = `${PREFIX} ATTENDANCE_MARKING_FLOW_ID is not set. Attendance marking flow will not be available.`;
    warnings.push(msg);
    console.warn(msg);
  }

  // -----------------------------------------------------------------------
  // 2. Check FLOW_PRIVATE_KEY — error if attendance flows are set without it
  // -----------------------------------------------------------------------
  const hasAttendanceFlows = attendanceSetupFlowId || attendanceMarkingFlowId;

  if (hasAttendanceFlows && !flowPrivateKey) {
    const msg = `${PREFIX} FLOW_PRIVATE_KEY is not set but attendance flow IDs are configured. Flow decryption will fail.`;
    errors.push(msg);
    console.error(msg);
    console.error(
      `${PREFIX} Run \`node bot/scripts/setup/run-full-setup.js\` to register flows and configure encryption.`,
    );
  }

  // -----------------------------------------------------------------------
  // 3. Return structured result
  // -----------------------------------------------------------------------
  return {
    ok: errors.length === 0,
    warnings,
    errors,
  };
}

module.exports = { validateBootRequirements };
