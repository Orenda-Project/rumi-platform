/**
 * CI-workflow jobs-always-runnable conformance.
 *
 * Catches a specific GitHub Actions anti-pattern: a workflow with EXACTLY ONE
 * job that is gated by a job-level `if:` referencing `secrets.*`. When the
 * secret is unset (e.g. on the upstream template repo), GitHub Actions skips
 * the only job, then reports the whole workflow run as FAILED and sends a
 * "Run failed: No jobs were run" notification email per push.
 *
 * The fix is to move the gate to the STEP level: the job always runs (so the
 * workflow always succeeds), and conditional steps skip the deploy work while
 * a header step emits a friendly `::notice::` annotation explaining what to
 * configure to enable the gated behaviour.
 *
 * (See `.github/workflows/deploy.yml` for the canonical step-level-gating shape.)
 *
 * This is a deterministic regex-based parser — does NOT require js-yaml. The
 * shape we forbid is narrow enough that regex is robust:
 *
 *   1. Exactly one job under `jobs:` (counted by `^  [a-zA-Z_-]+:` at
 *      2-space indent in the jobs block).
 *   2. That job has `    if: ...secrets.<NAME>...` at 4-space indent (the
 *      job-level `if:` position).
 *
 * Anything else passes.
 */

const fs = require('fs');
const path = require('path');

const WORKFLOWS_DIR = path.resolve(__dirname, '../../.github/workflows');

/**
 * Extracts top-level job names and their job-level `if:` clauses from a
 * GitHub Actions workflow YAML file. Returns an array of { name, ifClause }.
 *
 * Assumes 2-space indentation under `jobs:` (the convention used throughout
 * the OSS repo's workflows + every workflow we've ever shipped). If a
 * workflow ever uses 4-space or tab indentation, this parser will miss it
 * and the test will silently pass — at that point swap in js-yaml.
 */
function extractJobs(yamlText) {
  const lines = yamlText.split('\n');
  const jobs = [];
  let inJobsBlock = false;
  let currentJob = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect entry into the `jobs:` block.
    if (/^jobs:\s*$/.test(line)) {
      inJobsBlock = true;
      continue;
    }
    if (!inJobsBlock) continue;

    // Exiting the jobs block (any top-level key after `jobs:` ends it).
    if (/^[a-zA-Z_-]+:\s*$/.test(line) && !/^\s/.test(line)) {
      inJobsBlock = false;
      currentJob = null;
      continue;
    }

    // A new job: `  <jobname>:` at exactly 2-space indent.
    const jobHeaderMatch = line.match(/^  ([a-zA-Z_][a-zA-Z0-9_-]*):\s*$/);
    if (jobHeaderMatch) {
      currentJob = { name: jobHeaderMatch[1], ifClause: null };
      jobs.push(currentJob);
      continue;
    }

    // Job-level keys at 4-space indent inside the current job.
    if (currentJob) {
      const ifMatch = line.match(/^    if:\s*(.+?)\s*$/);
      if (ifMatch) currentJob.ifClause = ifMatch[1];
    }
  }

  return jobs;
}

describe('CI workflows — jobs-always-runnable conformance', () => {
  const workflowFiles = fs.existsSync(WORKFLOWS_DIR)
    ? fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    : [];

  it('workflows directory exists and has at least one file', () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
  });

  it('no workflow has a single job gated by a secrets.* job-level `if:`', () => {
    const offenders = [];

    for (const file of workflowFiles) {
      const text = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf-8');
      const jobs = extractJobs(text);

      if (jobs.length !== 1) continue; // Multi-job workflows are fine.

      const onlyJob = jobs[0];
      if (!onlyJob.ifClause) continue; // No job-level if: → fine.

      // Job-level if: that references secrets.* is the failure-spam trap.
      if (/secrets\.[A-Z_][A-Z0-9_]*/.test(onlyJob.ifClause)) {
        offenders.push(
          `${file}: single job "${onlyJob.name}" has job-level \`if: ${onlyJob.ifClause}\` — ` +
          'move the gate to STEP level so the job always succeeds even when the secret is unset. ' +
          'Otherwise GitHub Actions reports "all-jobs-skipped" workflow runs as failed and sends ' +
          '"No jobs were run" notification emails on every push. See `.github/workflows/deploy.yml` for the step-level-gating fix.'
        );
      }
    }

    expect(offenders).toEqual([]);
  });
});
