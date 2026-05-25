/**
 * reading/report.service — Playwright-primary + PDFKit-fallback wiring.
 * html-to-pdf + template are mocked (no Chromium); the PDFKit renderer is
 * spied so we assert routing, not the full PDFKit draw.
 */

let htmlToPdfMock, ReadingReportService;

function load() {
  jest.resetModules();
  htmlToPdfMock = jest.fn().mockResolvedValue(Buffer.from('%PDF playwright'));
  // pdfkit is a bot/-only dependency; the CI test job runs before `npm ci` in
  // bot/, so mock it (the PDFKit renderer is spied below and never instantiated).
  jest.doMock('pdfkit', () => class PDFDocument { on() {} end() {} }, { virtual: true });
  jest.doMock('../../bot/shared/utils/html-to-pdf', () => ({ htmlToPdf: htmlToPdfMock }));
  jest.doMock('../../bot/shared/templates/reading-report.template', () => () => '<html>report</html>');
  jest.doMock('../../bot/shared/services/llm-client', () => ({ getClient: () => ({ chat: { completions: { create: jest.fn() } } }) }));
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  ReadingReportService = require('../../bot/shared/services/reading/report.service');
  return ReadingReportService;
}

const reportData = { studentIdentifier: 'S', language: 'en', benchmark: { onTrack: true, percentileRank: 60 } };

afterEach(() => jest.resetModules());

describe('generateReadingAssessmentReport', () => {
  it('uses the Playwright HTML→PDF path when it succeeds', async () => {
    const svc = load();
    const pdfkitSpy = jest.spyOn(svc, '_generateReadingReportPdfKit').mockResolvedValue(Buffer.from('pdfkit'));
    const buf = await svc.generateReadingAssessmentReport(reportData);
    expect(htmlToPdfMock).toHaveBeenCalledTimes(1);
    expect(pdfkitSpy).not.toHaveBeenCalled();
    expect(buf.toString()).toContain('playwright');
  });

  it('falls back to PDFKit when HTML→PDF throws (e.g. no Chromium)', async () => {
    const svc = load();
    htmlToPdfMock.mockRejectedValueOnce(new Error('browser not found'));
    const pdfkitSpy = jest.spyOn(svc, '_generateReadingReportPdfKit').mockResolvedValue(Buffer.from('pdfkit-fallback'));
    const buf = await svc.generateReadingAssessmentReport(reportData);
    expect(htmlToPdfMock).toHaveBeenCalledTimes(1);
    expect(pdfkitSpy).toHaveBeenCalledTimes(1);
    expect(buf.toString()).toContain('pdfkit-fallback');
  });
});
