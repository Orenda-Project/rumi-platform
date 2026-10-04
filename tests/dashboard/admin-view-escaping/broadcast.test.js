/**
 * dashboard/views/broadcast.ejs: values from the API that a teacher, a public
 * sign-up or a model controls are text in the page, never markup. Renders the
 * real view in jsdom (see ../helpers/render-admin-view.js).
 */

const {
  renderAdminView, expectInert, maybe, ADMIN, HOSTILE,
} = require('../helpers/render-admin-view');

describe('broadcast.ejs (broadcast composer)', () => {
  const locals = {
    ...ADMIN,
    title: 'Broadcast Message',
    currentPage: 'broadcast',
    userCounts: {
      // Per-country counts are optional (the view shows 0).
      all: { all: 3 },
      '24h': { all: 1 },
      '7d': { all: 2 },
      '30d': { all: 3 },
    },
  };

  async function search(page, query) {
    page.window.toggleRecipientMode('search');
    const input = page.document.getElementById('user-search-input');
    input.value = query;
    input.dispatchEvent(new page.window.Event('input', { bubbles: true }));
    // The search is debounced by 300 ms.
    await new Promise((r) => setTimeout(r, 350));
    await page.settle();
  }

  maybe('a failed user search shows the error as text', async () => {
    const page = await renderAdminView('broadcast', locals, {
      url: '/observability/broadcast',
      api: { '/observability/api/broadcast/search-users': { success: false, error: HOSTILE.html } },
    });
    try {
      await search(page, 'Sample');
      expect(page.errors).toEqual([]);
      expectInert(page, '#search-results', HOSTILE.html);
    } finally {
      page.close();
    }
  });

  maybe('search results and selected users show names as text', async () => {
    const user = { id: 'u-1', displayName: HOSTILE.html, phoneMasked: `+1000***${HOSTILE.attr}`, country: HOSTILE.attrSingle };
    const page = await renderAdminView('broadcast', locals, {
      url: '/observability/broadcast',
      api: { '/observability/api/broadcast/search-users': { success: true, users: [user] } },
    });
    try {
      await search(page, 'Sample');
      expect(page.errors).toEqual([]);
      expectInert(page, '#search-results', HOSTILE.html, HOSTILE.attr, HOSTILE.attrSingle);
      page.document.querySelector('#search-results [data-on-click="selectUser"]').click();
      expectInert(page, '#selected-users-tags', HOSTILE.html, HOSTILE.attr);
      expect(JSON.parse(page.document.getElementById('selected-user-ids').value)).toEqual(['u-1']);
    } finally {
      page.close();
    }
  });

  maybe('dry-run results show recipient names, warnings and errors as text', async () => {
    const page = await renderAdminView('broadcast', locals, {
      url: '/observability/broadcast',
      api: {
        '/observability/api/broadcast/dry-run': {
          success: true,
          recipientCount: 2,
          breakdown: {},
          estimatedTime: '1 second',
          estimatedCost: { min: '0.01', max: '0.02' },
          contentAnalysis: { approvalLikelihood: { likelihood: HOSTILE.attr } },
          sampleRecipients: [{ name: HOSTILE.html, phone: '+1000***0001', country: HOSTILE.attrSingle }],
          warnings: [HOSTILE.html],
        },
      },
    });
    try {
      page.document.getElementById('message').value = 'Hello teachers';
      page.document.getElementById('dry-run-btn').click();
      await page.settle();
      expect(page.errors).toEqual([]);
      expectInert(page, '#dry-run-results', HOSTILE.html, HOSTILE.attr, HOSTILE.attrSingle);
    } finally {
      page.close();
    }
  });

  maybe('a failed dry run shows the error as text', async () => {
    const page = await renderAdminView('broadcast', locals, {
      url: '/observability/broadcast',
      api: { '/observability/api/broadcast/dry-run': { success: false, error: HOSTILE.html } },
    });
    try {
      page.document.getElementById('message').value = 'Hello teachers';
      page.document.getElementById('dry-run-btn').click();
      await page.settle();
      expect(page.errors).toEqual([]);
      expectInert(page, '#dry-run-results', HOSTILE.html);
    } finally {
      page.close();
    }
  });

  maybe('per-recipient send errors in the final results are text', async () => {
    const page = await renderAdminView('broadcast', locals, {
      url: '/observability/broadcast',
      api: {
        '/observability/api/broadcast/submit': { success: true, broadcastId: 'b-1' },
        '/observability/api/broadcast/b-1/stats': { success: false },
      },
    });
    try {
      page.document.getElementById('message').value = 'Hello teachers';
      page.document.getElementById('adminPassword').value = 'fictional-password';
      page.document.getElementById('broadcast-form').dispatchEvent(new page.window.Event('submit', { cancelable: true }));
      await page.settle();
      expect(page.eventSources).toHaveLength(1);
      page.eventSources[0].emit('complete', {
        status: 'completed_with_errors', sent_count: 1, failed_count: 1,
        errors: [{ phoneNumber: HOSTILE.attr, error: HOSTILE.html }],
      });
      await page.settle();
      expect(page.errors).toEqual([]);
      expectInert(page, '#errors-list', HOSTILE.html, HOSTILE.attr);
    } finally {
      page.close();
    }
  });
});
