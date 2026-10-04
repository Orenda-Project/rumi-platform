/**
 * dashboard/views/api-health.ejs: values from the API that a teacher, a public
 * sign-up or a model controls are text in the page, never markup. Renders the
 * real view in jsdom (see ../helpers/render-admin-view.js).
 */

const {
  renderAdminView, expectInert, maybe, ADMIN, HOSTILE,
} = require('../helpers/render-admin-view');

describe('api-health.ejs (third-party service status)', () => {
  maybe('service names, details, warnings and links from provider responses are text / http(s) only', async () => {
    const page = await renderAdminView('api-health', { ...ADMIN, title: 'API Health', currentPage: 'api-health' }, {
      url: '/observability/api-health',
      api: {
        '/observability/api/api-health': {
          totalCost: '1.00', projectedCost: '2.00', lastUpdated: new Date().toISOString(),
          statusCounts: { healthy: 1, warning: 0, critical: 0, error: 1 },
          services: [
            {
              service: HOSTILE.html, status: 'error', usage: null, cost: null, isEstimated: false,
              details: { lastError: HOSTILE.attr, note: HOSTILE.attrSingle }, externalLink: HOSTILE.url,
            },
            {
              service: 'Sample Service', status: 'healthy', usage: { current: 1, limit: 10, unit: 'req', percentage: 10 },
              cost: { current: 0, projected: 0 }, details: {}, externalLink: `https://status.example.com/${HOSTILE.attr}`,
            },
          ],
          warnings: [HOSTILE.html],
        },
      },
    });
    try {
      expect(page.errors).toEqual([]);
      expectInert(page, '#servicesGrid', HOSTILE.html, HOSTILE.attr, HOSTILE.attrSingle);
      expectInert(page, '#warningsList', HOSTILE.html);
      const hrefs = [...page.document.querySelectorAll('#servicesGrid a')].map((a) => a.getAttribute('href'));
      expect(hrefs).toContain(`https://status.example.com/${HOSTILE.attr}`);
      for (const href of hrefs) expect(href).not.toMatch(/^\s*javascript:/i);
    } finally {
      page.close();
    }
  });
});
