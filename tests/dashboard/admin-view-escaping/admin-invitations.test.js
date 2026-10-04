/**
 * dashboard/views/admin-invitations.ejs: values from the API that a teacher, a public
 * sign-up or a model controls are text in the page, never markup. Renders the
 * real view in jsdom (see ../helpers/render-admin-view.js).
 */

const {
  renderAdminView, expectInert, maybe, ADMIN, HOSTILE,
} = require('../helpers/render-admin-view');

describe('admin-invitations.ejs (invite with a school scope)', () => {
  const locals = {
    ...ADMIN,
    title: 'Invitation Management',
    currentPage: 'admin-invitations',
    pendingInvitations: [],
    allInvitations: [],
    stats: { pending: 0, accepted: 0, expired: 0, revoked: 0 },
  };

  maybe('school suggestions and the scope preview show school and teacher names as text', async () => {
    const schoolA = `Sample School ${HOSTILE.html}`;
    const schoolB = `Sample Academy ${HOSTILE.attr}`;
    const page = await renderAdminView('admin-invitations', locals, {
      url: '/observability/admin/invitations',
      api: {
        '/observability/api/users': { success: true, users: [{ school_name: schoolA }, { school_name: schoolB }] },
        '/observability/api/admin/scope-preview': {
          success: true, count: 1, registeredCount: 0, unregisteredCount: 1,
          users: [{ phone_number: HOSTILE.attrSingle, first_name: HOSTILE.html, school_name: HOSTILE.attr, registration_completed: false }],
        },
      },
    });
    try {
      const input = page.document.getElementById('schoolNameInput');
      input.value = 'Sample';
      input.dispatchEvent(new page.window.Event('input', { bubbles: true }));
      await page.settle();
      expect(page.errors).toEqual([]);
      const suggestions = page.document.getElementById('schoolSuggestions');
      expectInert(page, suggestions, HOSTILE.html, HOSTILE.attr);
      const options = [...suggestions.querySelectorAll('[data-school]')];
      expect(options.map((o) => o.dataset.school)).toEqual([schoolA, schoolB]);

      // Picking a suggestion adds the exact name to the scope.
      options[1].click();
      expect(page.document.getElementById('schoolNameList').textContent).toContain(schoolB);

      page.document.getElementById('previewBtn').click();
      await page.settle();
      expect(page.errors).toEqual([]);
      const preview = page.fetchCalls.find((c) => c.url.includes('scope-preview'));
      expect(JSON.parse(preview.init.body).scopeValue.school_names).toEqual([schoolB]);
      expectInert(page, '#previewContent', HOSTILE.html, HOSTILE.attr, HOSTILE.attrSingle);
    } finally {
      page.close();
    }
  });
});
