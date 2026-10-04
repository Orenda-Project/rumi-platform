/**
 * dashboard/views/ama.ejs: values from the API that a teacher, a public
 * sign-up or a model controls are text in the page, never markup. Renders the
 * real view in jsdom (see ../helpers/render-admin-view.js).
 */

const {
  renderAdminView, expectInert, maybe, ADMIN, HOSTILE,
} = require('../helpers/render-admin-view');

describe('ama.ejs (AMA chats, admin view)', () => {
  const locals = { ...ADMIN, title: 'AMA Chats (Admin View)', currentPage: 'ama-chats', isAdminView: true };

  maybe('the chat list and a loaded conversation show names, titles, ids and replies as text', async () => {
    const id = `conv-1${HOSTILE.attr}`;
    const page = await renderAdminView('ama', locals, {
      url: '/observability/ama-chats',
      api: {
        '/observability/ama-chats/conversations': {
          success: true,
          conversations: [{ id, username: HOSTILE.html, title: HOSTILE.attrSingle, updated_at: new Date().toISOString() }],
        },
        '/observability/ama-chats/': {
          success: true,
          messages: [
            { role: 'user', content: HOSTILE.html },
            {
              role: 'assistant',
              content: `**Total** ${HOSTILE.html}`,
              sql_query: `SELECT '${HOSTILE.attr}'`,
              chart_type: 'bar',
              chart_image_url: `https://example.com/c.png${HOSTILE.attr}`,
              query_result: [{ name: HOSTILE.html, count: 3 }],
            },
            {
              role: 'assistant', content: 'Chart', chart_type: 'bar',
              chart_image_url: HOSTILE.url, query_result: [{ n: 1 }],
            },
          ],
        },
      },
    });
    try {
      const history = page.document.getElementById('chatHistory');
      expectInert(page, history, HOSTILE.html, HOSTILE.attrSingle);
      const item = history.querySelector('.ama-history-item');
      expect(item.getAttribute('data-id')).toBe(id);

      item.querySelector('.ama-history-item-title').click();
      await page.settle();
      expect(page.errors).toEqual([]);
      expect(page.fetchCalls.map((c) => c.url)).toContain(`/observability/ama-chats/${id}/messages`);
      const messages = page.document.getElementById('messagesContainer') || page.document.querySelector('.ama-messages');
      expectInert(page, messages, HOSTILE.html, `SELECT '${HOSTILE.attr}'`);
      // The assistant's markdown still renders.
      expect([...messages.querySelectorAll('strong')].map((s) => s.textContent)).toContain('Total');
      const srcs = [...messages.querySelectorAll('img')].map((i) => i.getAttribute('src'));
      expect(srcs).toContain(`https://example.com/c.png${HOSTILE.attr}`);
      for (const src of srcs) expect(src).not.toMatch(/^\s*javascript:/i);
    } finally {
      page.close();
    }
  });
});
