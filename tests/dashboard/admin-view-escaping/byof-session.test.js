/**
 * dashboard/views/byof-session.ejs: values from the API that a teacher, a public
 * sign-up or a model controls are text in the page, never markup. Renders the
 * real view in jsdom (see ../helpers/render-admin-view.js).
 */

const {
  renderAdminView, expectInert, maybe, HOSTILE,
} = require('../helpers/render-admin-view');

describe('byof-session.ejs (BYOF chat)', () => {
  maybe('the assistant reply added after sending is text', async () => {
    const page = await renderAdminView('byof-session', {
      title: 'BYOF - Sample session',
      currentPage: 'byof',
      user: { username: 'admin@example.com', role: 'super_admin' },
      byofRole: 'approver',
      session: { id: 's-1', type: 'feature', title: 'Sample session', status: 'chatting', messages: [] },
    }, {
      url: '/observability/byof/session/s-1',
      api: {
        '/observability/byof/api/sessions/s-1/messages': { success: true, aiResponse: { content: HOSTILE.html } },
      },
    });
    try {
      page.document.getElementById('message-input').value = HOSTILE.attr;
      page.document.getElementById('message-form').dispatchEvent(new page.window.Event('submit', { cancelable: true }));
      await page.settle();
      expect(page.errors).toEqual([]);
      expectInert(page, '#messages-container', HOSTILE.html, HOSTILE.attr);
    } finally {
      page.close();
    }
  });
});
