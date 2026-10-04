/**
 * dashboard/views/transcript-enhanced.ejs: values from the API that a teacher, a public
 * sign-up or a model controls are text in the page, never markup. Renders the
 * real view in jsdom (see ../helpers/render-admin-view.js).
 */

const {
  renderAdminView, expectInert, maybe, HOSTILE,
} = require('../helpers/render-admin-view');

describe('transcript-enhanced.ejs (classroom transcript)', () => {
  /** The locals the /observability/coaching transcript route passes. */
  function locals({ lines, silenceMarkers = null }) {
    return {
      teacherName: 'Sample Teacher',
      schoolName: 'Sample School',
      sessionDate: 'Sep 2, 2026',
      duration: '10 min',
      durationSeconds: 600,
      audioUrl: null,
      tokensRaw: null,
      silenceMarkers,
      diarizationData: null,
      processedData: { summary: 'A short lesson.', sections: [{ title: 'Opening', timeRange: '00:00-05:00', lines }] },
      isFallback: false,
      sloMastery: null,
      classroomClimate: null,
      namedStudents: [],
      uxHelpers: require('../../../dashboard/services/transcript-ux-helpers.service'),
    };
  }

  maybe('line text is shown as text; {{en:...}} markers still become English spans', async () => {
    const text = `Say {{en:good morning}} to ${HOSTILE.html} and {{en:<b id=b2>x</b>}}`;
    const page = await renderAdminView('transcript-enhanced', locals({
      lines: [{ timestamp: '00:05', speaker: 'Teacher', speakerType: 'teacher', text, start_ms: 5000, end_ms: 9000 }],
    }), { url: '/observability/coaching/session-1/transcript' });
    try {
      expect(page.errors).toEqual([]);
      const line = page.document.querySelector('.line-text');
      expectInert(page, line, HOSTILE.html, '<b id=b2>x</b>');
      expect([...line.querySelectorAll('span.en')].map((s) => s.textContent)).toEqual(['good morning', '<b id=b2>x</b>']);
      expect(line.textContent).toBe(`Say good morning to ${HOSTILE.html} and <b id=b2>x</b>`);
    } finally {
      page.close();
    }
  });

  maybe('board-writing blocks show the model\'s confidence label as text', async () => {
    const page = await renderAdminView('transcript-enhanced', locals({
      lines: [{ timestamp: '00:05', speaker: 'Teacher', speakerType: 'teacher', text: 'Look here.', start_ms: 5000, end_ms: 9000 }],
      silenceMarkers: [{
        activity: 'board_writing', start_ms: 1000, end_ms: 4000, duration_ms: 3000,
        confidence: HOSTILE.html, context_before: HOSTILE.html, context_after: null,
      }],
    }), { url: '/observability/coaching/session-1/transcript' });
    try {
      expect(page.errors).toEqual([]);
      const block = page.document.querySelector('.board-content-block');
      expect(block).not.toBeNull();
      // The label is upper-cased, so the injected ids would be upper case too.
      expect(block.querySelector('img, form, input')).toBeNull();
      expectInert(page, block, HOSTILE.html.toUpperCase(), HOSTILE.html);
    } finally {
      page.close();
    }
  });
});
