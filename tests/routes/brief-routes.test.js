/**
 * dashboard/routes/brief.routes.js — the Morning Brief live page, its
 * local-file route, and the wall-display "screen" page. The repo has no
 * supertest, so express is mocked with a Router that records what was
 * registered, and each handler chain is driven with a fake req/res. The
 * auth middleware is injected (the router is a factory) so this never loads
 * the dashboard's database pool.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MANIFEST = {
  version: 1,
  kind: 'daily',
  day: '2026-09-03',
  dateline: 'yesterday · Thu 03 Sep',
  generated_at: '2026-09-04T04:05:00Z',
  cohort: { teachers: 1063, label: 'all registered teachers' },
  lead: 'Lead text',
  closer: 'Closer text',
  live_url: null,
  panels: [
    { id: 'cover', file: '00_cover.png', caption: 'Cover', alt: 'cover alt' },
    { id: 'active', file: '01_active.png', caption: 'Active teachers', alt: 'active alt' },
  ],
};

let outDir;

function writeLocal(kind = 'daily') {
  const dir = path.join(outDir, 'latest', kind);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(MANIFEST));
  for (const p of MANIFEST.panels) fs.writeFileSync(path.join(dir, p.file), 'png');
  return dir;
}

function loadRouter({ env, fetchImpl } = {}) {
  jest.resetModules();
  const routes = {};
  const router = { get: jest.fn((route, ...handlers) => { routes[route] = handlers; }) };
  jest.doMock('express', () => ({ Router: () => router }), { virtual: true });

  const requireAuth = jest.fn((req, res, next) => {
    if (req.session && req.session.isAuthenticated) return next();
    return res.redirect('/observability/login');
  });

  const { createBriefRouter } = require('../../dashboard/routes/brief.routes');
  const built = createBriefRouter({ requireAuth, env: env || { BRIEF_OUT_DIR: outDir }, fetchImpl });
  expect(built).toBe(router);
  return { routes, requireAuth };
}

function fakeRes() {
  const res = {
    statusCode: 200,
    rendered: null,
    redirectedTo: null,
    sentFile: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    render(view, locals) { res.rendered = { view, locals }; return res; },
    redirect(url) { res.redirectedTo = url; return res; },
    sendFile(file) { res.sentFile = file; return res; },
    send(body) { res.body = body; return res; },
    set() { return res; },
  };
  return res;
}

async function run(handlers, req) {
  const res = fakeRes();
  let i = 0;
  const next = async () => {
    const h = handlers[i++];
    if (!h) return;
    await h(req, res, next);
  };
  await next();
  return res;
}

const authed = (extra = {}) => ({ session: { isAuthenticated: true, username: 'ops', userRole: 'admin' }, query: {}, params: {}, ...extra });
const anon = (extra = {}) => ({ session: {}, query: {}, params: {}, ...extra });

beforeEach(() => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-brief-routes-'));
});

afterEach(() => {
  fs.rmSync(outDir, { recursive: true, force: true });
  jest.resetModules();
});

describe('router shape', () => {
  it('registers the page, the file route, and the screen route', () => {
    const { routes } = loadRouter();
    expect(Object.keys(routes).sort()).toEqual(['/', '/file/:kind/:name', '/screen']);
  });

  it('the page and file routes are behind requireAuth', async () => {
    const { routes } = loadRouter();
    const page = await run(routes['/'], anon());
    expect(page.redirectedTo).toBe('/observability/login');
    const file = await run(routes['/file/:kind/:name'], anon({ params: { kind: 'daily', name: '00_cover.png' } }));
    expect(file.redirectedTo).toBe('/observability/login');
  });
});

describe('GET /observability/brief', () => {
  it('renders the latest local brief with every panel, its caption, the dateline, and a screen link', async () => {
    const { routes } = loadRouter();
    writeLocal();
    const res = await run(routes['/'], authed({ query: { kind: 'daily' } }));
    expect(res.rendered.view).toBe('brief');
    const { locals } = res.rendered;
    expect(locals).toMatchObject({ title: 'Morning Brief', currentPage: 'brief', kind: 'daily', username: 'ops', userRole: 'admin' });
    expect(locals.brief.dateline).toBe('yesterday · Thu 03 Sep');
    expect(locals.brief.panels).toHaveLength(2);
    expect(locals.brief.panels[1]).toMatchObject({
      caption: 'Active teachers',
      src: '/observability/brief/file/daily/01_active.png',
      screenHref: '/observability/brief/screen?kind=daily&p=1',
    });
  });

  it('defaults to daily and accepts weekly via ?kind=', async () => {
    const { routes } = loadRouter();
    writeLocal('weekly');
    const daily = await run(routes['/'], authed());
    expect(daily.rendered.locals.kind).toBe('daily');
    expect(daily.rendered.locals.brief).toBeNull();
    const weekly = await run(routes['/'], authed({ query: { kind: 'weekly' } }));
    expect(weekly.rendered.locals.kind).toBe('weekly');
    expect(weekly.rendered.locals.brief.panels).toHaveLength(2);
  });

  it('falls back to the public bucket when there is no local render', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => MANIFEST }));
    const { routes } = loadRouter({ env: { BRIEF_OUT_DIR: outDir, SUPABASE_URL: 'https://abc.supabase.co' }, fetchImpl });
    const res = await run(routes['/'], authed());
    expect(fetchImpl).toHaveBeenCalledWith('https://abc.supabase.co/storage/v1/object/public/brief/latest/daily/manifest.json');
    expect(res.rendered.locals.brief.source).toBe('bucket');
    expect(res.rendered.locals.brief.panels[0].src)
      .toBe('https://abc.supabase.co/storage/v1/object/public/brief/latest/daily/00_cover.png');
  });

  it('renders the empty state (brief: null) when neither source has one', async () => {
    const { routes } = loadRouter();
    const res = await run(routes['/'], authed());
    expect(res.rendered.view).toBe('brief');
    expect(res.rendered.locals.brief).toBeNull();
  });
});

describe('GET /observability/brief/file/:kind/:name', () => {
  it('serves a panel the manifest lists', async () => {
    const { routes } = loadRouter();
    const dir = writeLocal();
    const res = await run(routes['/file/:kind/:name'], authed({ params: { kind: 'daily', name: '01_active.png' } }));
    expect(res.sentFile).toBe(path.join(dir, '01_active.png'));
  });

  it('404s for anything not listed — including the manifest itself and traversal attempts', async () => {
    const { routes } = loadRouter();
    writeLocal();
    for (const name of ['manifest.json', 'sent.json', '../manifest.json', 'other.png']) {
      const res = await run(routes['/file/:kind/:name'], authed({ params: { kind: 'daily', name } }));
      expect(res.statusCode).toBe(404);
      expect(res.sentFile).toBeNull();
    }
  });

  it('404s when there is no local render for that kind', async () => {
    const { routes } = loadRouter();
    const res = await run(routes['/file/:kind/:name'], authed({ params: { kind: 'weekly', name: '00_cover.png' } }));
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /observability/brief/screen', () => {
  it('renders one panel full-bleed with the dateline and a 300s refresh', async () => {
    const { routes } = loadRouter();
    writeLocal();
    const res = await run(routes['/screen'], authed({ query: { kind: 'daily', p: '1' } }));
    expect(res.rendered.view).toBe('brief-screen');
    expect(res.rendered.locals).toMatchObject({
      kind: 'daily',
      p: 1,
      refreshSeconds: 300,
      dateline: 'yesterday · Thu 03 Sep',
      panel: expect.objectContaining({ src: '/observability/brief/file/daily/01_active.png', alt: 'active alt' }),
    });
  });

  it('defaults to the cover (p=0) and renders an empty panel for an out-of-range index', async () => {
    const { routes } = loadRouter();
    writeLocal();
    const cover = await run(routes['/screen'], authed());
    expect(cover.rendered.locals.panel.src).toBe('/observability/brief/file/daily/00_cover.png');
    const missing = await run(routes['/screen'], authed({ query: { p: '9' } }));
    expect(missing.rendered.view).toBe('brief-screen');
    expect(missing.rendered.locals.panel).toBeNull();
  });

  it('requires login when BRIEF_SCREEN_TOKEN is unset', async () => {
    const { routes, requireAuth } = loadRouter();
    const res = await run(routes['/screen'], anon({ query: { token: 'anything' } }));
    expect(requireAuth).toHaveBeenCalled();
    expect(res.redirectedTo).toBe('/observability/login');
  });

  it('a matching ?token= grants access with no session; a wrong one still goes through requireAuth', async () => {
    const { routes, requireAuth } = loadRouter({ env: { BRIEF_OUT_DIR: outDir, BRIEF_SCREEN_TOKEN: 'wall-secret' } });
    writeLocal();
    const ok = await run(routes['/screen'], anon({ query: { token: 'wall-secret' } }));
    expect(requireAuth).not.toHaveBeenCalled();
    expect(ok.rendered.view).toBe('brief-screen');

    const bad = await run(routes['/screen'], anon({ query: { token: 'nope' } }));
    expect(requireAuth).toHaveBeenCalledTimes(1);
    expect(bad.redirectedTo).toBe('/observability/login');
  });

  it('the token does not open the main page or the file route', async () => {
    const { routes } = loadRouter({ env: { BRIEF_OUT_DIR: outDir, BRIEF_SCREEN_TOKEN: 'wall-secret' } });
    writeLocal();
    const page = await run(routes['/'], anon({ query: { token: 'wall-secret' } }));
    expect(page.redirectedTo).toBe('/observability/login');
  });
});

describe('views', () => {
  const VIEWS = path.resolve(__dirname, '../../dashboard/views');

  it('brief.ejs exists, includes the shared navigation, and offers the daily/weekly toggle', () => {
    const src = fs.readFileSync(path.join(VIEWS, 'brief.ejs'), 'utf-8');
    expect(src).toMatch(/include\('partials\/navigation'/);
    expect(src).toMatch(/\?kind=daily/);
    expect(src).toMatch(/\?kind=weekly/);
    expect(src).toMatch(/rumi brief/); // the empty state tells you how to make one
    expect(src).toMatch(/screenHref/);
  });

  it('brief-screen.ejs re-fetches itself every five minutes and shows the dateline', () => {
    const src = fs.readFileSync(path.join(VIEWS, 'brief-screen.ejs'), 'utf-8');
    expect(src).toMatch(/http-equiv="refresh" content="<%= refreshSeconds %>"/);
    expect(src).toMatch(/dateline/);
    expect(src).not.toMatch(/partials\/navigation/);
  });

  it('the navigation partial links to the brief page', () => {
    const nav = fs.readFileSync(path.join(VIEWS, 'partials', 'navigation.ejs'), 'utf-8');
    expect(nav).toMatch(/href="\/observability\/brief"/);
    expect(nav).toMatch(/Morning Brief/);
    expect(nav).toMatch(/currentPage === 'brief'/);
  });

  it('dashboard/index.js mounts the router at /observability/brief', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../dashboard/index.js'), 'utf-8');
    expect(src).toMatch(/require\('\.\/routes\/brief\.routes'\)/);
    expect(src).toMatch(/app\.use\('\/observability\/brief', createBriefRouter\(\{ requireAuth \}\)\)/);
  });
});
