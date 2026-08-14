/**
 * slack-views/registration.view.js and settings.view.js — the concrete
 * screen <-> Block Kit mapping. Pins the exact block_id/action_id shapes
 * viewToScreenData reads back, since a mismatch here would silently drop a
 * field on submission with no error at all.
 */

const registrationView = require('../../bot/shared/routes/slack-views/registration.view');
const settingsView = require('../../bot/shared/routes/slack-views/settings.view');

const METADATA = JSON.stringify({ kind: 'registration', screen: 'PERSONAL_INFO', flowToken: 'u1:registration:169' });

describe('registration.view — screenToView', () => {
  it('PERSONAL_INFO renders full_name (text) and country (select) inputs', () => {
    const view = registrationView.screenToView('PERSONAL_INFO', { countries: [{ id: 'PK', title: 'Pakistan' }] }, { metadata: METADATA });
    expect(view.private_metadata).toBe(METADATA);
    const blockIds = view.blocks.map((b) => b.block_id);
    expect(blockIds).toEqual(['full_name_block', 'country_block']);
    const countryBlock = view.blocks.find((b) => b.block_id === 'country_block');
    expect(countryBlock.element.type).toBe('static_select');
    expect(countryBlock.element.options).toEqual([{ text: { type: 'plain_text', text: 'Pakistan' }, value: 'PK' }]);
  });

  it('PROFESSIONAL_INFO renders a multi_static_select for subjects and includes a Back button', () => {
    const view = registrationView.screenToView('PROFESSIONAL_INFO', {
      organizations: [{ id: 'fde', title: 'FDE' }],
      grades: [{ id: 'grade_1', title: 'Grade 1' }],
      subjects: [{ id: 'maths', title: 'Maths' }, { id: 'english', title: 'English' }],
    }, { metadata: METADATA });

    const subjectsBlock = view.blocks.find((b) => b.block_id === 'subjects_block');
    expect(subjectsBlock.element.type).toBe('multi_static_select');
    expect(subjectsBlock.element.options).toHaveLength(2);

    const backBlock = view.blocks.find((b) => b.block_id === 'back_block');
    expect(backBlock.elements[0].action_id).toBe('registration_back');
  });

  it('throws for an unmapped screen — a silent fallback would render a blank modal', () => {
    expect(() => registrationView.screenToView('NOT_A_SCREEN', {}, { metadata: METADATA })).toThrow(/no view mapping/);
  });
});

describe('registration.view — viewToScreenData', () => {
  it('extracts full_name/country from PERSONAL_INFO state values', () => {
    const stateValues = {
      full_name_block: { full_name: { value: 'Ayesha Khan' } },
      country_block: { country: { selected_option: { value: 'PK' } } },
    };
    expect(registrationView.viewToScreenData('PERSONAL_INFO', stateValues)).toEqual({
      full_name: 'Ayesha Khan', country: 'PK',
    });
  });

  it('extracts subjects as an array of values from PROFESSIONAL_INFO state values', () => {
    const stateValues = {
      organization_block: { organization: { selected_option: { value: 'fde' } } },
      school_name_block: { school_name: { value: '' } },
      grade_block: { grade: { selected_option: { value: 'grade_1' } } },
      subjects_block: { subjects: { selected_options: [{ value: 'maths' }, { value: 'english' }] } },
    };
    expect(registrationView.viewToScreenData('PROFESSIONAL_INFO', stateValues)).toEqual({
      organization: 'fde', school_name: '', grade: 'grade_1', subjects: ['maths', 'english'],
    });
  });

  it('returns {} for an unrecognized screen rather than throwing', () => {
    expect(registrationView.viewToScreenData('UNKNOWN', {})).toEqual({});
  });
});

describe('registration.view — FIRST_INPUT_BLOCK_ID', () => {
  it('names a real block_id for every screen the endpoint can return', () => {
    for (const screen of ['PERSONAL_INFO', 'REGION_INFO', 'PROFESSIONAL_INFO', 'ORG_DETAILS']) {
      expect(registrationView.FIRST_INPUT_BLOCK_ID[screen]).toBeTruthy();
    }
  });
});

describe('settings.view — screenToView', () => {
  it('pre-selects the current language and framework via initial_option', () => {
    const view = settingsView.screenToView('SETTINGS_MAIN', {
      languages: [{ id: 'en', title: 'English' }, { id: 'ur', title: 'Urdu' }],
      frameworks: [{ id: 'oecd', title: 'OECD' }],
      current_language: 'ur',
      current_framework: 'oecd',
      info_text: 'Default for Punjab: OECD.',
    }, { metadata: 'meta' });

    const langBlock = view.blocks.find((b) => b.block_id === 'language_block');
    expect(langBlock.element.initial_option).toEqual({ text: { type: 'plain_text', text: 'Urdu' }, value: 'ur' });

    const fwBlock = view.blocks.find((b) => b.block_id === 'framework_block');
    expect(fwBlock.element.initial_option).toEqual({ text: { type: 'plain_text', text: 'OECD' }, value: 'oecd' });
    expect(fwBlock.hint.text).toBe('Default for Punjab: OECD.');
  });

  it('omits initial_option entirely when the current value is not in the dropdown', () => {
    const view = settingsView.screenToView('SETTINGS_MAIN', {
      languages: [{ id: 'en', title: 'English' }],
      frameworks: [{ id: 'oecd', title: 'OECD' }],
      current_language: 'fr', // not in the dropdown
      current_framework: 'oecd',
    }, { metadata: 'meta' });

    const langBlock = view.blocks.find((b) => b.block_id === 'language_block');
    expect(langBlock.element.initial_option).toBeUndefined();
  });
});

describe('settings.view — viewToScreenData', () => {
  it('extracts language and observation_framework, defaulting when absent', () => {
    expect(settingsView.viewToScreenData('SETTINGS_MAIN', {
      language_block: { language: { selected_option: { value: 'ur' } } },
      framework_block: { observation_framework: { selected_option: { value: 'hots' } } },
    })).toEqual({ language: 'ur', observation_framework: 'hots' });

    expect(settingsView.viewToScreenData('SETTINGS_MAIN', {})).toEqual({ language: 'en', observation_framework: 'oecd' });
  });
});
