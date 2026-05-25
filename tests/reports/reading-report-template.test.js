/**
 * reading-report HTML template — structure, fonts, Urdu RTL, leak-free.
 */

const renderReadingReportHtml = require('../../bot/shared/templates/reading-report.template');

const base = {
  studentIdentifier: 'Student A',
  teacherName: 'Teacher B',
  gradeLevel: 3,
  language: 'en',
  passageType: 'story',
  passageText: 'The cat sat on the mat.',
  wcpm: 62.5,
  accuracy: 94,
  timeElapsed: 75,
  wordsCorrect: 47,
  totalWords: 50,
  benchmark: { benchmarkMin: 50, benchmarkMax: 80, onTrack: true, percentileRank: 60 },
  errors: [],
  diagnosticSummary: 'Solid fluency; keep practising multisyllable words.',
  completedAt: '2026-05-25T00:00:00Z',
};

describe('renderReadingReportHtml', () => {
  it('returns a full HTML doc with the student, WCPM and embedded fonts', () => {
    const html = renderReadingReportHtml(base);
    expect(html).toMatch(/<!DOCTYPE html>/);
    expect(html).toContain('Student A');
    expect(html).toContain('Reading Assessment');
    expect(html).toContain('@font-face');
    expect(html).toContain("font-family:'Noto Nastaliq Urdu'");
    // performance level derived (60th pct, onTrack → Proficient)
    expect(html).toContain('Proficient');
  });

  it('subtitle reflects comprehension presence', () => {
    expect(renderReadingReportHtml(base)).toContain('Fluency Evaluation');
    const withComp = renderReadingReportHtml({ ...base, comprehension: { score: 80, answers: [] } });
    expect(withComp).toContain('Fluency &amp; Comprehension Evaluation');
  });

  it('applies Urdu RTL direction for an Urdu passage', () => {
    const html = renderReadingReportHtml({ ...base, language: 'ur', passageText: 'بلی چٹائی پر بیٹھی۔' });
    expect(html).toContain('lang="ur"');
    expect(html).toContain('direction:rtl');
  });

  it('escapes HTML in user-supplied fields', () => {
    const html = renderReadingReportHtml({ ...base, studentIdentifier: '<script>x</script>' });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('contains no internal identifiers (leak-free)', () => {
    // Strip embedded base64 data URIs (fonts/logo) first — random base64 can
    // coincidentally contain short tokens like "+92"; we only care about the
    // visible template text.
    const html = renderReadingReportHtml(base).replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, 'data:base64,REDACTED');
    for (const banned of ['+92', '+255', '0329', '5012345', 'Taleemabad', 'Rawalpindi', 'TaleemHub']) {
      expect(html).not.toContain(banned);
    }
  });
});
