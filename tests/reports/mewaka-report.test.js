/**
 * MEWAKA report — transformer (analysis → reportData), HTML template
 * (Playwright HTML→PDF), and dispatch wiring.
 */

function loadTransformer() {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  return require('../../bot/shared/services/coaching/report-transformers/mewaka-report-transformer');
}

const renderMewakaReportHtml = require('../../bot/shared/services/coaching/templates/mewaka-report.template').renderMewakaReportHtml;
const { renderSparkline } = require('../../bot/shared/services/coaching/templates/mewaka-report.template');

const sampleSession = {
  created_at: '2026-05-25T00:00:00Z',
  users: { preferred_language: 'sw' },
  lesson_plan_structured: { subject: 'Hisabati', topic: 'Sehemu' },
};
const sampleAnalysis = {
  language: 'sw',
  performance_band: 'mwenye_uwezo',
  executive_summary_sw: 'Muhtasari wa somo.',
  domains: {
    planning: { domain_score: 8, domain_max: 10, indicators: [{ id: 'p1', score: 4 }] },
  },
};

describe('transformMEWAKAToReportData', () => {
  it('produces a mewaka-framework reportData with domains and a safe trend default', () => {
    const { transformMEWAKAToReportData } = loadTransformer();
    const rd = transformMEWAKAToReportData(sampleSession, 'Mwalimu A', sampleAnalysis);
    expect(rd.framework).toBe('mewaka');
    expect(rd.language).toBe('sw');
    expect(rd.teacherName).toBe('Mwalimu A');
    expect(Array.isArray(rd.domains)).toBe(true);
    expect(rd.trend).toEqual([]); // no analysis.trend → safe default
    expect(rd.maxScore).toBeGreaterThan(0);
  });

  it('passes through a provided trend array', () => {
    const { transformMEWAKAToReportData } = loadTransformer();
    const rd = transformMEWAKAToReportData(sampleSession, 'Mwalimu A', { ...sampleAnalysis, trend: [{ date: '2026-05-01', pct: 60 }] });
    expect(rd.trend).toHaveLength(1);
  });
});

describe('renderMewakaReportHtml', () => {
  const reportData = {
    framework: 'mewaka', language: 'sw', teacherName: 'Mwalimu A',
    totalScore: 8, maxScore: 10, overallPercentage: 80,
    domains: [{ name_sw: 'Mipango', score: 8, max: 10, indicators: [] }],
    focusArea: { name_sw: 'Mipango' }, strengths: [], growthOpportunities: [],
    notableMoments: [], executiveSummarySw: 'Muhtasari.', trend: [], photos: [],
  };

  it('renders a full HTML document referencing the teacher', () => {
    const html = renderMewakaReportHtml(reportData);
    expect(html).toMatch(/<!DOCTYPE html>/i);
    expect(html).toContain('Mwalimu A');
  });

  it('renderSparkline returns empty string for an empty trend', () => {
    expect(renderSparkline([])).toBe('');
  });

  it('is leak-free (no internal phone/name/path tokens)', () => {
    const html = renderMewakaReportHtml(reportData).replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, '');
    for (const banned of ['+92', '+255', '0329', '5012345', 'Taleemabad', 'Rawalpindi', 'TaleemHub']) {
      expect(html).not.toContain(banned);
    }
  });
});

describe('report-transformer-dispatch', () => {
  it('routes mewaka to the MEWAKA transformer; unknown falls back to OECD', () => {
    jest.resetModules();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    const { getReportTransformer } = require('../../bot/shared/services/coaching/report-transformers/report-transformer-dispatch');
    expect(typeof getReportTransformer('mewaka')).toBe('function');
    expect(getReportTransformer('mewaka').name).toMatch(/MEWAKA/i);
    expect(typeof getReportTransformer('nonsense')).toBe('function'); // OECD fallback
  });
});
