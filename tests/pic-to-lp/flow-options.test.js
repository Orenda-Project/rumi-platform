/**
 * Pic-LP flow-options — region-agnostic dropdown sources.
 * The OSS build uses a single generic subject list (no PK/TZ-specific lists).
 */

const FlowOptions = require('../../bot/shared/services/pic-to-lp/flow-options');

describe('flow-options', () => {
  it('buildSubjects returns a generic list with no PK/TZ-specific subjects', () => {
    const subjects = FlowOptions.buildSubjects('default');
    const ids = subjects.map((s) => s.id);
    expect(ids).toContain('Math');
    expect(ids).toContain('English');
    expect(ids).toContain('Science');
    expect(ids).toContain('Other');
    // PK/TZ-specific subjects must NOT appear in the generic OSS list.
    expect(ids).not.toContain('Urdu');
    expect(ids).not.toContain('Sindhi');
    expect(ids).not.toContain('Islamiat');
    expect(ids).not.toContain('Kiswahili');
    expect(ids).not.toContain('Civics & Moral Education');
    // id === title for every entry.
    subjects.forEach((s) => expect(s.id).toBe(s.title));
  });

  it('buildSubjects ignores the region argument (same list regardless)', () => {
    const a = FlowOptions.buildSubjects('PK');
    const b = FlowOptions.buildSubjects('TZ');
    const c = FlowOptions.buildSubjects();
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('does NOT export PK_SUBJECTS / TZ_SUBJECTS, exports DEFAULT_SUBJECTS', () => {
    expect(FlowOptions.PK_SUBJECTS).toBeUndefined();
    expect(FlowOptions.TZ_SUBJECTS).toBeUndefined();
    expect(Array.isArray(FlowOptions.DEFAULT_SUBJECTS)).toBe(true);
  });

  it('buildGrades returns 10 Class options (Class 1..10)', () => {
    const grades = FlowOptions.buildGrades();
    expect(grades).toHaveLength(10);
    expect(grades[0]).toEqual({ id: '1', title: 'Class 1' });
    expect(grades[9]).toEqual({ id: '10', title: 'Class 10' });
  });

  it('buildLanguages includes en/ur', () => {
    const ids = FlowOptions.buildLanguages().map((l) => l.id);
    expect(ids).toContain('en');
    expect(ids).toContain('ur');
  });

  it('buildLessonPlanFormats offers only Concise when Gamma is NOT configured', () => {
    const saved = process.env.GAMMA_API_KEY;
    delete process.env.GAMMA_API_KEY;
    try {
      const ids = FlowOptions.buildLessonPlanFormats().map((f) => f.id);
      expect(ids).toEqual(['concise']);
      expect(FlowOptions.DEFAULT_LP_FORMAT).toBe('concise');
    } finally {
      if (saved === undefined) delete process.env.GAMMA_API_KEY;
      else process.env.GAMMA_API_KEY = saved;
    }
  });

  it('buildLessonPlanFormats adds Detailed (Gamma) only when GAMMA_API_KEY is set', () => {
    const saved = process.env.GAMMA_API_KEY;
    process.env.GAMMA_API_KEY = 'gamma-test';
    try {
      const ids = FlowOptions.buildLessonPlanFormats().map((f) => f.id);
      expect(ids).toEqual(['concise', 'detailed']);
    } finally {
      if (saved === undefined) delete process.env.GAMMA_API_KEY;
      else process.env.GAMMA_API_KEY = saved;
    }
  });
});
