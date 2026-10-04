'use strict';
/**
 * Gamma's completed-generation body carries the export URL
 * (`https://assets.api.gamma.app/export/pdf/<id>/<id>/<name>.pdf`), which is
 * public to anyone holding it, and the document's own share link. The polling
 * loop used to log that whole body. It now logs the status, the generation id,
 * the field names and redacted URLs; the caller still gets the full URLs.
 *
 * ContentService._generateGammaContent runs for real against a faked axios.
 */
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/utils/constants', () => ({
  ...jest.requireActual('../../bot/shared/utils/constants'),
  GAMMA_API_KEY: 'test-key', GAMMA_MAX_ATTEMPTS: 3, GAMMA_POLL_INTERVAL: 0,
}));

const axios = require('axios');
const { logToFile } = require('../../bot/shared/utils/logger');
const ContentService = require('../../bot/shared/services/content.service');

const EXPORT = 'https://assets.api.gamma.app/export/pdf/x1y2z3w4v5/a1b2c3d4e5/Lesson-Plan-Fractions.pdf';
const DOC = 'https://gamma.app/docs/q9w8e7r6t5y4';

describe('ContentService Gamma polling — export URLs stay out of the logs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: { generationId: 'gen-123' } });
    axios.get.mockResolvedValue({
      data: { generationId: 'gen-123', status: 'completed', gammaUrl: DOC, exportUrl: EXPORT, credits: { deducted: 40 } },
    });
  });

  test('returns the full URLs; logs only the status, id and redacted URLs', async () => {
    const out = await ContentService._generateGammaContent('Fractions', 'a lesson on fractions', 'document', 'lesson plan', 'en');
    expect(out).toEqual({ gammaUrl: DOC, pdfUrl: EXPORT });

    const text = JSON.stringify(logToFile.mock.calls);
    expect(text).not.toContain(EXPORT);
    expect(text).not.toContain('/export/pdf/');
    expect(text).not.toContain('x1y2z3w4v5');
    expect(text).not.toContain(DOC);
    expect(text).not.toContain('q9w8e7r6t5y4');
    expect(text).toContain('gen-123');
    expect(text).toContain('assets.api.gamma.app#sha256:');
  });
});
