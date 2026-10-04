/**
 * The admin views (dashboard/views/, /observability/*) show what the public
 * messenger's users typed: anyone can sign up, pick a display name and chat.
 * The strict CSP (dashboard/lib/admin-csp.js) blocks injected scripts but not
 * injected HTML, so none of that text may reach the page as markup.
 *
 * Each test renders the real view file with the locals its route passes plus
 * one hostile value, parses the HTML the way a browser would (jsdom, scripts
 * off) and checks that:
 *   - no element was injected (no <img src="x">, no <b>x</b>);
 *   - the inline <script> still holds the whole statement, and its data
 *     literal has no < > & or raw U+2028/U+2029 and parses back to exactly
 *     the hostile string;
 *   - an attribute reads back (getAttribute) as exactly the original text.
 */

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const DASHBOARD = path.join(__dirname, '../../dashboard');
const VIEWS = path.join(DASHBOARD, 'views');

const HAVE_DASHBOARD_DEPS = ['ejs', 'jsdom'].every((m) => fs.existsSync(path.join(DASHBOARD, 'node_modules', m)));
const RUN = HAVE_DASHBOARD_DEPS || Boolean(process.env.CI);
const describeIf = RUN ? describe : describe.skip;
const dashboardRequire = createRequire(path.join(DASHBOARD, 'package.json'));

const HOSTILE = [
  '</script><img src=x onerror=alert(1)>',
  '"><img src=x onerror=alert(1)>',
  "'><b>x</b>",
  'Line one\u2028line two',
];

/** What every route's render gets from app.locals and the middleware (addUserToLocals, adminCsp). */
function baseLocals() {
  return {
    safeJson: require('../../dashboard/lib/safe-json').safeJson,
    cspNonce: 'test-nonce',
    isAuthenticated: true,
    username: 'admin@example.com',
    userId: 1,
    userEmail: 'admin@example.com',
    userByofRole: null,
    accessScope: null,
    userRole: 'super_admin',
    isAdmin: true,
  };
}

function render(view, locals) {
  const ejs = dashboardRequire('ejs');
  return ejs.renderFile(path.join(VIEWS, `${view}.ejs`), { ...baseLocals(), ...locals });
}

function parse(html) {
  const { JSDOM } = dashboardRequire('jsdom');
  return new JSDOM(html).window.document;
}

/** Nothing from the hostile value became an element. */
function expectNoInjectedElements(doc) {
  expect(doc.querySelectorAll('img[src="x"]')).toHaveLength(0);
  expect([...doc.querySelectorAll('b')].filter((b) => b.textContent === 'x')).toHaveLength(0);
}

/**
 * The data literals that follow `marker` in the inline scripts, up to
 * `end` (a JSON literal never holds a raw newline, so `;\n` / `,\n` ends it).
 * Fails if the statement was cut short (the script closed early).
 */
function literalsAfter(doc, marker, end = ';\n') {
  const scripts = [...doc.querySelectorAll('script')].map((s) => s.textContent);
  const found = [];
  for (const text of scripts) {
    let at = text.indexOf(marker);
    while (at !== -1) {
      const start = at + marker.length;
      const stop = text.indexOf(end, start);
      expect(stop).toBeGreaterThan(start);
      found.push(text.slice(start, stop));
      at = text.indexOf(marker, stop);
    }
  }
  expect(found.length).toBeGreaterThan(0);
  return found;
}

/** The literal is escaped for the HTML parser and is the original data to JavaScript. */
function parseLiteral(literal) {
  expect(literal).not.toMatch(/[<>&\u2028\u2029]/);
  return JSON.parse(literal);
}

describeIf('admin views: user text in inline scripts and attributes', () => {
  test('index.js gives every view safeJson', () => {
    const src = fs.readFileSync(path.join(DASHBOARD, 'index.js'), 'utf8');
    expect(src).toMatch(/app\.locals\.safeJson = safeJson;/);
    expect(src).toMatch(/require\('\.\/lib\/safe-json'\)/);
  });

  describe('users.ejs: allUsers', () => {
    test.each(HOSTILE)('first_name %j', async (name) => {
      const users = [{ id: 'u-1', first_name: name, last_name: 'Example', phone_number: '+10000000001', created_at: '2026-01-01T00:00:00Z' }];
      const doc = parse(await render('users', { title: 'Users', users, currentPage: 1 }));
      expectNoInjectedElements(doc);
      const [literal] = literalsAfter(doc, 'let allUsers = ');
      expect(parseLiteral(literal)[0].first_name).toBe(name);
    });
  });

  describe('transcript-enhanced.ejs', () => {
    const locals = (text, speaker) => ({
      teacherName: 'Teacher Example',
      schoolName: 'Example School',
      sessionDate: '2026-01-01',
      duration: '1:00',
      durationSeconds: 60,
      audioUrl: null,
      tokensRaw: null,
      silenceMarkers: [{ start_ms: 0, end_ms: 500, label: speaker }],
      diarizationData: { segments: [{ speaker, start: 0, end: 1 }] },
      processedData: {
        sections: [{ title: 'Opening', timeRange: '0:00-1:00', lines: [{ timestamp: '00:00:01', speaker: 'Teacher', text }] }],
      },
      isFallback: false,
      sloMastery: null,
      classroomClimate: null,
      namedStudents: [],
      uxHelpers: require('../../dashboard/services/transcript-ux-helpers.service'),
    });

    test.each(HOSTILE)('line.text %j reads back from data-raw-text unchanged', async (text) => {
      const doc = parse(await render('transcript-enhanced', locals(text, 'SPEAKER_00')));
      expectNoInjectedElements(doc);
      const lines = doc.querySelectorAll('.line-text');
      expect(lines).toHaveLength(1);
      expect(lines[0].getAttribute('data-raw-text')).toBe(text);
    });

    test.each(HOSTILE)('diarizationData and silenceMarkers %j', async (speaker) => {
      const doc = parse(await render('transcript-enhanced', locals('Good morning.', speaker)));
      expectNoInjectedElements(doc);
      const [diarization] = literalsAfter(doc, 'const diarizationData = ');
      expect(parseLiteral(diarization).segments[0].speaker).toBe(speaker);
      const [silence] = literalsAfter(doc, 'const silenceMarkers = ');
      expect(parseLiteral(silence)[0].label).toBe(speaker);
    });

    test('no diarization or silence data still gives null and []', async () => {
      const doc = parse(await render('transcript-enhanced', { ...locals('Hello.', 'x'), diarizationData: null, silenceMarkers: null }));
      expect(literalsAfter(doc, 'const diarizationData = ')).toEqual(['null']);
      expect(literalsAfter(doc, 'const silenceMarkers = ')).toEqual(['[]']);
    });
  });

  describe('funnel.ejs', () => {
    const funnelMetrics = {
      counts: { websiteVisits: 10, ctaClicks: 5, chatStarts: 3, registrations: 1 },
      conversionRates: { visitToCta: '50.00', ctaToChat: '60.00', chatToRegistration: '33.33', overall: '10.00' },
      dropoff: { afterVisit: 5, afterCta: 2, afterChat: 2 },
    };
    test.each(HOSTILE)('traffic source and daily metric %j', async (label) => {
      const doc = parse(await render('funnel', {
        title: 'Funnel Analytics',
        funnelMetrics,
        dailyMetrics: [{ date: '2026-01-01', visits: 1, label }],
        trafficSources: [{ source: label, count: 4 }],
        selectedDays: 7,
      }));
      expectNoInjectedElements(doc);
      const [traffic] = literalsAfter(doc, 'const trafficSourcesData = ');
      expect(parseLiteral(traffic)[0].source).toBe(label);
      const [daily] = literalsAfter(doc, 'const dailyMetricsData = ');
      expect(parseLiteral(daily)[0].label).toBe(label);
    });
  });

  describe('sessions.ejs', () => {
    test.each(HOSTILE)('analytics series %j', async (label) => {
      const doc = parse(await render('sessions', {
        title: 'Session Analytics',
        analytics: {
          sessionsPerDay: [{ date: '2026-01-01', count: 2, label }],
          sessionTypeBreakdown: [{ type: label, count: 2 }],
          activeHours: [{ hour: 9, count: 2, label }],
        },
        stats: {},
      }));
      expectNoInjectedElements(doc);
      expect(parseLiteral(literalsAfter(doc, 'const sessionsPerDayData = ')[0])[0].label).toBe(label);
      expect(parseLiteral(literalsAfter(doc, 'const sessionTypeData = ')[0])[0].type).toBe(label);
      expect(parseLiteral(literalsAfter(doc, 'const activeHoursData = ')[0])[0].label).toBe(label);
    });
  });

  describe('ab-testing.ejs', () => {
    test.each(HOSTILE)('variant_name %j', async (name) => {
      const tests = [{
        id: 't-1', name: 'Greeting test', status: 'active', created_at: '2026-01-01T00:00:00Z',
        variants: [
          { variant_name: name, impressions: 10, conversions: 2, thompsonProb: 0.7 },
          { variant_name: 'control', impressions: 10, conversions: 1, thompsonProb: 0.3 },
        ],
        totalImpressions: 20,
        totalConversions: 3,
      }];
      const doc = parse(await render('ab-testing', { title: 'A/B Testing', tests }));
      expectNoInjectedElements(doc);
      const labels = literalsAfter(doc, 'labels: ', ',\n');
      expect(labels).toHaveLength(2);
      for (const l of labels) expect(parseLiteral(l)).toEqual([name, 'control']);
      // `data: {` (the chart config) shares the marker; the series are the arrays.
      const data = literalsAfter(doc, 'data: ', ',\n').filter((l) => l.startsWith('['));
      expect(data.map(parseLiteral)).toEqual([['20.0', '10.0'], ['70.0', '30.0']]);
    });
  });

  describe('broadcast.ejs', () => {
    test.each(HOSTILE)('userCounts key %j', async (key) => {
      const userCounts = { all: 3, [key]: 2 };
      const doc = parse(await render('broadcast', {
        title: 'Broadcast Message', userCounts, currentPage: 'broadcast',
      }));
      expectNoInjectedElements(doc);
      expect(parseLiteral(literalsAfter(doc, 'const userCounts = ')[0])).toEqual(userCounts);
    });
  });

  describe('retention.ejs', () => {
    // Same locals as the /observability/retention route in dashboard/index.js.
    const locals = (curveData) => ({
      title: 'Retention Analysis',
      cohorts: [],
      summary: {},
      curveData,
      featureType: 'overall',
      weeksBack: 12,
      startDate: null,
      endDate: null,
      formatCohortWeek: (w) => String(w),
      getRetentionColorClass: () => '',
    });

    test('the route hands the view the curve itself, not a JSON string', () => {
      const src = fs.readFileSync(path.join(DASHBOARD, 'index.js'), 'utf8');
      expect(src).not.toMatch(/curveData:\s*JSON\.stringify/);
    });

    test.each(HOSTILE)('dataset label %j', async (label) => {
      const curve = { labels: ['Day 0', 'Week 1'], datasets: [{ label, data: [100, 40] }] };
      const doc = parse(await render('retention', locals(curve)));
      expectNoInjectedElements(doc);
      expect(parseLiteral(literalsAfter(doc, 'const curveData = ')[0])).toEqual(curve);
    });
  });
});
