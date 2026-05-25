/**
 * Report Transformer Dispatch
 *
 * Routes framework key → appropriate report data transformer function.
 * Unknown frameworks fall back to OECD.
 *
 * Bead: bd-604 (Phase 1C-A2)
 */

const { logToFile } = require('../../../utils/logger');
const { transformOECDToReportData } = require('./oecd-report-transformer');
const { transformHOTSToReportData } = require('./hots-report-transformer');
const { transformTeachToReportData } = require('./teach-report-transformer');
const { transformFICOToReportData } = require('./fico-report-transformer');
const { transformMEWAKAToReportData } = require('./mewaka-report-transformer');

const transformers = {
  oecd: transformOECDToReportData,
  hots: transformHOTSToReportData,
  teach: transformTeachToReportData,
  fico: transformFICOToReportData,
  mewaka: transformMEWAKAToReportData,   // Tanzania CPD — Playwright HTML→PDF report
};

/**
 * Get the report transformer function for a given framework key.
 * @param {string} frameworkKey - Framework key (oecd, hots, teach, fico)
 * @returns {Function} Transformer function
 */
function getReportTransformer(frameworkKey) {
  const transformer = transformers[frameworkKey];
  if (!transformer) {
    logToFile(`[report-transformer-dispatch] Unknown framework "${frameworkKey}", falling back to OECD`);
    return transformers.oecd;
  }
  return transformer;
}

module.exports = { getReportTransformer };
