/**
 * quiz-report HTML template — structure, embedded fonts, escaping, leak-free.
 */

const renderQuizReportHtml = require('../../bot/shared/templates/quiz-report.template');

const base = {
  quiz: { topic: 'Photosynthesis', grade: '5', subject: 'Science', created_at: '2026-05-25T00:00:00Z' },
  classDisplay: '5 - A',
  teacherName: 'Teacher B',
  totalSent: 10,
  totalCompleted: 8,
  stats: { avgScore: 72, masteredCount: 3, developingCount: 3, needsPracticeCount: 2 },
  sessions: [
    { student_name: 'Student One', total_questions_answered: 8, correct_answers: 7 },
    { student_name: 'Student Two', total_questions_answered: 8, correct_answers: 4 },
  ],
  topMissed: [{ question_text: 'What is chlorophyll?', correct_count: 2, total: 8 }],
  allQuestions: [],
  insight: 'Most students grasped the basics; revisit the role of sunlight.',
  language: 'en',
};

describe('renderQuizReportHtml', () => {
  it('returns a full HTML doc with topic, class and embedded fonts', () => {
    const html = renderQuizReportHtml(base);
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain('Quiz Report');
    expect(html).toContain('Photosynthesis');
    expect(html).toContain('@font-face');
    expect(html).toContain("font-family: 'Noto Nastaliq Urdu'");
  });

  it('embeds Lexend + Nastaliq base64 font data URIs', () => {
    const html = renderQuizReportHtml(base);
    expect(html).toContain("font-family: 'Lexend'");
    expect(html).toMatch(/data:font\/ttf;base64,/);
  });

  it('escapes HTML in user-supplied fields', () => {
    const html = renderQuizReportHtml({ ...base, quiz: { ...base.quiz, topic: '<script>x</script>' } });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders without throwing on a minimal/empty payload', () => {
    expect(() => renderQuizReportHtml({})).not.toThrow();
    expect(() => renderQuizReportHtml(undefined)).not.toThrow();
  });

  it('contains no internal identifiers (leak-free)', () => {
    // Strip embedded base64 data URIs (fonts/logo) first — random base64 can
    // coincidentally contain short tokens like "+92".
    const html = renderQuizReportHtml(base).replace(
      /data:[^;]+;base64,[A-Za-z0-9+/=]+/g,
      'data:base64,REDACTED'
    );
    for (const banned of ['+92', '+255', '0329', '5012345', 'Taleemabad', 'Rawalpindi', 'TaleemHub', 'Junaid', 'Haroon']) {
      expect(html).not.toContain(banned);
    }
  });
});
