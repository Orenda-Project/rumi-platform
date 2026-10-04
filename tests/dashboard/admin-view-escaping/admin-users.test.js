/**
 * dashboard/views/admin-users.ejs: values from the API that a teacher, a public
 * sign-up or a model controls are text in the page, never markup. Renders the
 * real view in jsdom (see ../helpers/render-admin-view.js).
 */

const {
  renderAdminView, respond, expectInert, maybe, ADMIN, HOSTILE,
} = require('../helpers/render-admin-view');

describe('admin-users.ejs (scope editor)', () => {
  const locals = {
    ...ADMIN,
    title: 'User Management',
    currentPage: 'admin-users',
    users: [{
      id: 7, username: 'partner.admin@example.com', email: 'partner.admin@example.com',
      role: 'partner_admin', is_active: true, last_login: null, accessScope: null,
    }],
    scopeStats: {},
  };

  maybe.each([
    ['an HTTP error message', respond(500, { message: HOSTILE.html })],
    ['an API error', { success: false, error: HOSTILE.html }],
  ])('loading a scope that fails with %s shows it as text', async (_label, body) => {
    const page = await renderAdminView('admin-users', locals, {
      url: '/observability/admin/users',
      api: { '/observability/api/admin/users/7/scope': body },
    });
    try {
      page.document.querySelector('.edit-scope-btn[data-user-id="7"]').click();
      await page.settle();
      expect(page.errors).toEqual([]);
      expectInert(page, '#scopeEditorContent', HOSTILE.html);
    } finally {
      page.close();
    }
  });
});
