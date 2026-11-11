/**
 * Feature titles on the console's Features and Overview pages borrow the setup
 * wizard's plain-language copy (fields.js OPTIONAL_EXTRAS) where it describes
 * that feature. Matching on the first key alone made every feature that shares
 * a key inherit the same copy: lp_fidelity also needs SONIOX_API_KEY, so it
 * rendered as a second "Understand voice notes" row.
 */

const { snapshot } = require('../../bot/console/features');
const { OPTIONAL_EXTRAS } = require('../../bot/scripts/setup/fields');

describe('console feature titles', () => {
  const rows = snapshot({}).rows;

  it('gives every feature a distinct title', () => {
    const titles = rows.map((r) => r.title);
    const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
    expect(dupes).toEqual([]);
  });

  it('keeps lesson-plan fidelity under its own name, not the Soniox wizard copy', () => {
    const lp = rows.find((r) => r.id === 'lp_fidelity');
    expect(lp.title).toMatch(/fidelity/i);
    expect(lp.why).not.toBe(OPTIONAL_EXTRAS.find((e) => e.keys[0] === 'SONIOX_API_KEY').why);
  });

  it('still borrows the wizard copy for the feature a key switches on by itself', () => {
    expect(rows.find((r) => r.id === 'stt_soniox').title).toBe('Understand voice notes');
    expect(rows.find((r) => r.id === 'pronunciation_azure').title).toBe('Score pronunciation');
  });
});
