/**
 * discord-views/registration.view.js and settings.view.js — the concrete
 * screen <-> collectEnumAnswers()-steps/textFields mapping. Pins the exact
 * customId/option shapes discord-modal-flow.js reads back, since a mismatch
 * here would silently drop a field with no error at all — same rationale as
 * tests/routes/slack-views.test.js for the Slack side.
 *
 * discord.js is a bot-only dependency (installed under bot/node_modules,
 * not the repo root) — mocked virtual: true so this suite passes in real CI,
 * which installs it only AFTER the root test suite runs. StringSelectMenuBuilder
 * is real chainable-builder shaped (not just a stub) since these views call
 * it for real and this suite asserts on its .toJSON() output.
 */
jest.mock('discord.js', () => {
  class FakeStringSelectMenuBuilder {
    constructor() { this.options = []; }
    setCustomId(id) { this.customId = id; return this; }
    setPlaceholder(p) { this.placeholder = p; return this; }
    setMinValues(n) { this.minValues = n; return this; }
    setMaxValues(n) { this.maxValues = n; return this; }
    addOptions(opts) { this.options.push(...opts); return this; }
    toJSON() {
      return {
        custom_id: this.customId, placeholder: this.placeholder, options: this.options,
        ...(this.minValues !== undefined ? { min_values: this.minValues } : {}),
        ...(this.maxValues !== undefined ? { max_values: this.maxValues } : {}),
      };
    }
  }
  return { StringSelectMenuBuilder: FakeStringSelectMenuBuilder };
}, { virtual: true });

const registrationView = require('../../bot/shared/routes/discord-views/registration.view');
const settingsView = require('../../bot/shared/routes/discord-views/settings.view');

describe('registration.view — screenToSteps', () => {
  it('PERSONAL_INFO returns a 2-step country picker (region bucket, then country) plus a full_name text field', () => {
    const { steps, textFields } = registrationView.screenToSteps('PERSONAL_INFO', {});
    expect(steps.map((s) => s.fieldName)).toEqual([registrationView.BUCKET_FIELD, 'country']);
    expect(textFields).toEqual([{ name: 'full_name', label: 'Full name', required: true }]);

    const bucketMenu = steps[0].buildMenu({});
    const bucketJson = bucketMenu.toJSON();
    expect(bucketJson.custom_id).toBe(registrationView.BUCKET_FIELD);
    expect(bucketJson.options.length).toBeGreaterThan(0);
    expect(bucketJson.options.length).toBeLessThanOrEqual(25);

    const firstBucketId = bucketJson.options[0].value;
    const countryMenu = steps[1].buildMenu({ [registrationView.BUCKET_FIELD]: firstBucketId });
    const countryJson = countryMenu.toJSON();
    expect(countryJson.custom_id).toBe('country');
    expect(countryJson.options.length).toBeGreaterThan(0);
    expect(countryJson.options.length).toBeLessThanOrEqual(25);
  });

  it('REGION_INFO splits Pakistan (7) vs India (22) into a 2-step picker, both under the 25-option cap', () => {
    const { steps, textFields } = registrationView.screenToSteps('REGION_INFO', {});
    expect(steps.map((s) => s.fieldName)).toEqual([registrationView.PK_IN_FIELD, 'region']);
    expect(textFields).toEqual([]);

    const pkMenu = steps[1].buildMenu({ [registrationView.PK_IN_FIELD]: 'PK' }).toJSON();
    expect(pkMenu.options).toHaveLength(7);

    const inMenu = steps[1].buildMenu({ [registrationView.PK_IN_FIELD]: 'IN' }).toJSON();
    expect(inMenu.options).toHaveLength(22);
  });

  it('PROFESSIONAL_INFO returns 3 enum steps (organization, grade, multi-select subjects) plus an optional school_name text field', () => {
    const data = {
      organizations: [{ id: 'fde', title: 'FDE' }],
      grades: [{ id: 'grade_1', title: 'Grade 1' }],
      subjects: [{ id: 'maths', title: 'Maths' }, { id: 'english', title: 'English' }],
    };
    const { steps, textFields } = registrationView.screenToSteps('PROFESSIONAL_INFO', data);
    expect(steps.map((s) => s.fieldName)).toEqual(['organization', 'grade', 'subjects']);
    expect(textFields).toEqual([{ name: 'school_name', label: 'School name (optional)', required: false }]);

    const subjectsStep = steps.find((s) => s.fieldName === 'subjects');
    expect(subjectsStep.multi).toBe(true);
    const subjectsJson = subjectsStep.buildMenu().toJSON();
    expect(subjectsJson.min_values).toBe(1);
    expect(subjectsJson.max_values).toBe(2);
    expect(subjectsJson.options).toHaveLength(2);
  });

  it('ORG_DETAILS has no enum steps at all — modal opens directly', () => {
    const { steps, textFields } = registrationView.screenToSteps('ORG_DETAILS', {});
    expect(steps).toEqual([]);
    expect(textFields).toEqual([{ name: 'organization_other', label: 'Organization name', required: true }]);
  });

  it('throws for an unmapped screen — a silent fallback would open a blank modal', () => {
    expect(() => registrationView.screenToSteps('NOT_A_SCREEN', {})).toThrow(/no screen mapping/);
  });
});

describe('registration.view — mergeScreenData', () => {
  it('PERSONAL_INFO merges the collected country with the modal-submitted full_name', () => {
    expect(registrationView.mergeScreenData('PERSONAL_INFO', { country: 'PK' }, { full_name: 'Ayesha Khan' }))
      .toEqual({ full_name: 'Ayesha Khan', country: 'PK' });
  });

  it('REGION_INFO merges just the collected region (no text fields on this screen)', () => {
    expect(registrationView.mergeScreenData('REGION_INFO', { region: 'in_punjab' }, {})).toEqual({ region: 'in_punjab' });
  });

  it('PROFESSIONAL_INFO merges organization/grade/subjects with the modal-submitted school_name', () => {
    expect(registrationView.mergeScreenData(
      'PROFESSIONAL_INFO',
      { organization: 'fde', grade: 'grade_1', subjects: ['maths', 'english'] },
      { school_name: 'Sunrise School' },
    )).toEqual({ organization: 'fde', school_name: 'Sunrise School', grade: 'grade_1', subjects: ['maths', 'english'] });
  });

  it('ORG_DETAILS merges just the modal-submitted organization_other', () => {
    expect(registrationView.mergeScreenData('ORG_DETAILS', {}, { organization_other: 'My School' }))
      .toEqual({ organization_other: 'My School' });
  });
});

describe('settings.view — screenToSteps', () => {
  it('SETTINGS_MAIN returns 2 enum steps and NO text fields at all — no modal needed for this screen', () => {
    const data = {
      languages: [{ id: 'en', title: 'English' }, { id: 'ur', title: 'Urdu' }],
      frameworks: [{ id: 'oecd', title: 'OECD' }],
      current_language: 'ur',
      current_framework: 'oecd',
    };
    const { steps, textFields } = settingsView.screenToSteps('SETTINGS_MAIN', data);
    expect(steps.map((s) => s.fieldName)).toEqual(['language', 'observation_framework']);
    expect(textFields).toEqual([]);

    // No option is pre-selected (`default`) — Discord's client treats
    // re-picking an already-selected option as no change, sending no
    // interaction at all, which previously stalled the flow until it timed
    // out. The current value is surfaced in the placeholder instead, so a
    // re-pick of the SAME value is still a real interaction.
    const langJson = steps[0].buildMenu().toJSON();
    expect(langJson.options.every((o) => !o.default)).toBe(true);
    expect(langJson.placeholder).toContain('Urdu');
  });

  it('throws for an unmapped screen', () => {
    expect(() => settingsView.screenToSteps('NOT_A_SCREEN', {})).toThrow(/no screen mapping/);
  });
});

describe('settings.view — mergeScreenData', () => {
  it('defaults language/framework when unanswered', () => {
    expect(settingsView.mergeScreenData('SETTINGS_MAIN', {})).toEqual({ language: 'en', observation_framework: 'oecd' });
  });

  it('carries through the collected enum answers', () => {
    expect(settingsView.mergeScreenData('SETTINGS_MAIN', { language: 'ur', observation_framework: 'ecers' }))
      .toEqual({ language: 'ur', observation_framework: 'ecers' });
  });
});
