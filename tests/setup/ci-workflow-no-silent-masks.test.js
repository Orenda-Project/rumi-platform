/**
 * No-silent-mask CI-workflow conformance.
 *
 * GitHub Actions step bodies that end with `|| true` silently suppress
 * every non-zero exit code in the preceding pipeline. That's sometimes
 * intentional (a cleanup step that mustn't fail the run if the resource
 * was never created) but is most often a defensive mistake: a credential
 * grep `! grep CREDENTIAL_PATTERN files || true` always succeeds — the
 * `|| true` masks the very failure the step was added to catch.
 *
 * This guard locks the contract: every `|| true` in a CI workflow must
 * appear in the `ALLOWED_MASKS` set below, with a documented reason. New
 * masks added without a justification cause the test to fail; the
 * developer must either remove the mask or add an entry here explaining
 * why it's load-bearing.
 *
 * Scoped to `.github/workflows/*.yml`. Bash scripts elsewhere can use
 * `|| true` freely.
 */

const fs = require('fs');
const path = require('path');

const WORKFLOWS_DIR = path.resolve(__dirname, '../../.github/workflows');

// Each entry: { file, line, rationale }. Keep tight; prefer removing masks
// to allowlisting them. Each entry should explain what the mask is
// load-bearing for.
const ALLOWED_MASKS = [
  // (intentionally empty post-bd-1866 — both prior masks were defensive
  //  mistakes that have been removed)
];

function findMasks() {
  if (!fs.existsSync(WORKFLOWS_DIR)) return [];
  const files = fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

  const masks = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf-8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      // Match `|| true` at end of line, ignoring trailing whitespace.
      if (/\|\|\s+true\s*$/.test(line)) {
        masks.push({ file, line: i + 1, content: line.trim() });
      }
    });
  }
  return masks;
}

describe('CI workflows — no silent `|| true` masks', () => {
  it('every `|| true` mask is documented in ALLOWED_MASKS', () => {
    const masks = findMasks();
    const unjustified = masks.filter(
      (m) =>
        !ALLOWED_MASKS.some(
          (allowed) => allowed.file === m.file && allowed.line === m.line
        )
    );

    expect(unjustified).toEqual([]);
  });
});
