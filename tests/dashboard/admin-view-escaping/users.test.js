/**
 * dashboard/views/users.ejs: values from the API that a teacher, a public
 * sign-up or a model controls are text in the page, never markup. Renders the
 * real view in jsdom (see ../helpers/render-admin-view.js).
 */

const {
  renderAdminView, expectInert, maybe, ADMIN, HOSTILE,
} = require('../helpers/render-admin-view');

/** A sign-up whose every free-text field is hostile. */
function hostileUser(overrides = {}) {
  return {
    id: 101,
    first_name: HOSTILE.html,
    last_name: HOSTILE.attr,
    name: HOSTILE.html,
    phone_number: `+10000000000${HOSTILE.attrSingle}`,
    registration_state: HOSTILE.html,
    registration_started_at: '2026-09-01T10:00:00Z',
    registration_completed: false,
    registration_completed_at: null,
    created_at: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

describe('users.ejs (user list and chat view)', () => {
  const locals = (users) => ({ ...ADMIN, title: 'Users', users, currentPage: 1 });

  maybe('the client-rendered user list shows names, phone numbers and states as text', async () => {
    const page = await renderAdminView('users', locals([hostileUser()]), { url: '/observability/users' });
    try {
      // The search box re-renders the list from the script.
      const search = page.document.getElementById('searchChats');
      search.value = '';
      search.dispatchEvent(new page.window.Event('input', { bubbles: true }));
      await page.settle();
      expect(page.errors).toEqual([]);
      const item = page.document.querySelector('#chatListItems .chat-item');
      expectInert(page, item, HOSTILE.html, HOSTILE.attr, HOSTILE.attrSingle);
    } finally {
      page.close();
    }
  });

  maybe('users loaded by infinite scroll are rendered as text', async () => {
    const page = await renderAdminView('users', locals([hostileUser({ id: 1, first_name: 'Sample', last_name: 'Teacher', name: 'Sample', phone_number: '+10000000001', registration_state: 'completed' })]), {
      url: '/observability/users',
      api: { '/observability/api/users': { success: true, hasMore: false, users: [hostileUser({ id: 102 })] } },
    });
    try {
      const list = page.document.getElementById('chatListItems');
      list.dispatchEvent(new page.window.Event('scroll'));
      await page.settle();
      expect(page.errors).toEqual([]);
      expect(page.document.querySelectorAll('#chatListItems .chat-item')).toHaveLength(2);
      expectInert(page, list, HOSTILE.html);
    } finally {
      page.close();
    }
  });

  maybe('opening a chat shows the header, messages, cards and registration as text; links are http(s) only', async () => {
    const user = hostileUser({ registration_completed_at: '2026-09-02T10:00:00Z' });
    const chat = {
      success: true,
      hasMoreMessages: false,
      user,
      conversations: [
        { role: 'user', content: HOSTILE.html, created_at: '2026-09-02T09:00:00Z' },
      ],
      lessonPlans: [{
        type: HOSTILE.html, topic: HOSTILE.html, grade: HOSTILE.attr, subject: 'Science',
        gamma_url: HOSTILE.url, created_at: '2026-09-02T09:01:00Z',
      }],
      coachingSessions: [{
        status: HOSTILE.html, report_gamma_url: `https://example.com/r${HOSTILE.attr}`,
        audio_url: 'JaVaScRiPt:alert(1)', created_at: '2026-09-02T09:02:00Z',
      }],
      videoRequests: [{
        status: 'completed', topic: 'Plants', language: HOSTILE.html,
        video_url: 'https://example.com/video.mp4', pdf_url: 'data:text/html,<b>x</b>',
        created_at: '2026-09-02T09:03:00Z',
      }],
      readingSessions: [{
        status: HOSTILE.html, language: HOSTILE.html, grade_level: HOSTILE.attr,
        created_at: '2026-09-02T09:04:00Z',
      }],
    };
    const page = await renderAdminView('users', locals([user]), {
      url: '/observability/users',
      api: { '/observability/api/conversations/': chat },
    });
    try {
      page.document.querySelector('#chatListItems .chat-item').click();
      await page.settle();
      expect(page.errors).toEqual([]);
      expectInert(page, '#chatHeader', HOSTILE.html, HOSTILE.attr, HOSTILE.attrSingle);
      const content = page.document.getElementById('chatMessagesContent');
      expectInert(page, content, HOSTILE.html, HOSTILE.attr, `Registration Completed by ${HOSTILE.html}`);
      const hrefs = [...content.querySelectorAll('a')].map((a) => a.getAttribute('href'));
      expect(hrefs).toContain(`https://example.com/r${HOSTILE.attr}`);
      expect(hrefs).toContain('https://example.com/video.mp4');
      for (const href of hrefs) expect(href).not.toMatch(/^\s*(javascript|data):/i);
    } finally {
      page.close();
    }
  });

  maybe('a failed chat load shows the error message as text', async () => {
    const page = await renderAdminView('users', locals([hostileUser()]), {
      url: '/observability/users',
      api: { '/observability/api/conversations/': { success: false, error: HOSTILE.html } },
    });
    try {
      page.document.querySelector('#chatListItems .chat-item').click();
      await page.settle();
      expect(page.errors).toEqual([]);
      expectInert(page, '#chatMessagesContent', HOSTILE.html);
    } finally {
      page.close();
    }
  });
});
