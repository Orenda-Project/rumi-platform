/**
 * dashboard/services/brief.service.js — the pure helpers behind the Morning
 * Brief live page: where the latest manifest lives (local render first, then
 * the public Supabase bucket), which local files may be served, and the
 * wall-display token check. Tested without booting express (the repo has no
 * supertest); the route handlers are covered in brief-routes.test.js.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');

function load() {
  jest.resetModules();
  return require('../../dashboard/services/brief.service');
}

const MANIFEST = {
  version: 1,
  kind: 'daily',
  day: '2026-09-03',
  dateline: 'yesterday · Thu 03 Sep',
  generated_at: '2026-09-04T04:05:00Z',
  cohort: { teachers: 1063, label: 'all registered teachers' },
  lead: 'Lead text',
  closer: 'Closer text',
  live_url: 'https://dash.example.org/observability/brief',
  panels: [
    { id: 'cover', file: '00_cover.png', caption: 'Cover', alt: 'cover alt' },
    { id: 'active', file: '01_active.png', caption: 'Active teachers', alt: 'active alt' },
  ],
};

let outDir;
let env;

function writeLocal(kind = 'daily', manifest = MANIFEST) {
  const dir = path.join(outDir, 'latest', kind);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  for (const p of manifest.panels) fs.writeFileSync(path.join(dir, p.file), 'png');
  return dir;
}

beforeEach(() => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-brief-svc-'));
  env = { BRIEF_OUT_DIR: outDir };
});

afterEach(() => {
  fs.rmSync(outDir, { recursive: true, force: true });
});

describe('normalizeKind / paths', () => {
  it('only ever yields daily or weekly', () => {
    const { normalizeKind } = load();
    expect(normalizeKind('weekly')).toBe('weekly');
    expect(normalizeKind('daily')).toBe('daily');
    expect(normalizeKind(undefined)).toBe('daily');
    expect(normalizeKind('../../etc')).toBe('daily');
  });

  it('resolves the output directory from the repo root, not the working directory', () => {
    const { briefOutDir, latestDir } = load();
    expect(briefOutDir({})).toBe(path.join(REPO_ROOT, 'brief', 'out'));
    expect(briefOutDir({ BRIEF_OUT_DIR: 'var/briefs' })).toBe(path.join(REPO_ROOT, 'var', 'briefs'));
    expect(latestDir('weekly', { BRIEF_OUT_DIR: '/abs' })).toBe(path.join('/abs', 'latest', 'weekly'));
  });
});

describe('readLocalManifest', () => {
  it('returns the local render when present', () => {
    const { readLocalManifest } = load();
    const dir = writeLocal();
    expect(readLocalManifest('daily', env)).toEqual({ source: 'local', kind: 'daily', dir, manifest: MANIFEST });
  });

  it('returns null when there is no local render (or it is unreadable)', () => {
    const { readLocalManifest } = load();
    expect(readLocalManifest('daily', env)).toBeNull();
    fs.mkdirSync(path.join(outDir, 'latest', 'daily'), { recursive: true });
    fs.writeFileSync(path.join(outDir, 'latest', 'daily', 'manifest.json'), '{not json');
    expect(readLocalManifest('daily', env)).toBeNull();
  });
});

describe('bucket fallback', () => {
  it('builds the public bucket URL from SUPABASE_URL, and is null without one', () => {
    const { bucketBaseUrl } = load();
    expect(bucketBaseUrl('daily', { SUPABASE_URL: 'https://abc.supabase.co/' }))
      .toBe('https://abc.supabase.co/storage/v1/object/public/brief/latest/daily');
    expect(bucketBaseUrl('weekly', {})).toBeNull();
  });

  it('fetchBucketManifest returns the manifest with its base URL on 200', async () => {
    const { fetchBucketManifest } = load();
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => MANIFEST }));
    const got = await fetchBucketManifest('daily', { SUPABASE_URL: 'https://abc.supabase.co' }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('https://abc.supabase.co/storage/v1/object/public/brief/latest/daily/manifest.json');
    expect(got).toEqual({
      source: 'bucket',
      kind: 'daily',
      baseUrl: 'https://abc.supabase.co/storage/v1/object/public/brief/latest/daily',
      manifest: MANIFEST,
    });
  });

  it('fetchBucketManifest returns null on a non-2xx, a network error, or no SUPABASE_URL', async () => {
    const { fetchBucketManifest } = load();
    expect(await fetchBucketManifest('daily', { SUPABASE_URL: 'https://abc.supabase.co' }, async () => ({ ok: false, status: 404 }))).toBeNull();
    expect(await fetchBucketManifest('daily', { SUPABASE_URL: 'https://abc.supabase.co' }, async () => { throw new Error('offline'); })).toBeNull();
    const fetchImpl = jest.fn();
    expect(await fetchBucketManifest('daily', {}, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('resolveManifest prefers the local render and only then the bucket', async () => {
    const { resolveManifest } = load();
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ ...MANIFEST, day: 'bucket' }) }));
    const both = { ...env, SUPABASE_URL: 'https://abc.supabase.co' };

    const fromBucket = await resolveManifest('daily', { env: both, fetchImpl });
    expect(fromBucket.source).toBe('bucket');
    expect(fromBucket.manifest.day).toBe('bucket');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    fetchImpl.mockClear();
    writeLocal();
    const local = await resolveManifest('daily', { env: both, fetchImpl });
    expect(local.source).toBe('local');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('panel sources + safe file lookup', () => {
  it('local panels are served through the dashboard file route; bucket panels use their public URL', () => {
    const { panelSrc } = load();
    const local = { source: 'local', kind: 'daily', dir: '/x', manifest: MANIFEST };
    const bucket = { source: 'bucket', kind: 'weekly', baseUrl: 'https://abc.supabase.co/storage/v1/object/public/brief/latest/weekly', manifest: MANIFEST };
    expect(panelSrc(local, MANIFEST.panels[1])).toBe('/observability/brief/file/daily/01_active.png');
    expect(panelSrc(bucket, MANIFEST.panels[1])).toBe('https://abc.supabase.co/storage/v1/object/public/brief/latest/weekly/01_active.png');
  });

  it('safeLocalFile only ever returns a file the manifest lists, by basename, inside the render dir', () => {
    const { safeLocalFile, readLocalManifest } = load();
    const dir = writeLocal();
    const resolved = readLocalManifest('daily', env);
    expect(safeLocalFile(resolved, '01_active.png')).toBe(path.join(dir, '01_active.png'));
    expect(safeLocalFile(resolved, 'manifest.json')).toBeNull();
    expect(safeLocalFile(resolved, 'sent.json')).toBeNull();
    expect(safeLocalFile(resolved, '../manifest.json')).toBeNull();
    expect(safeLocalFile(resolved, '..%2F..%2Fetc%2Fpasswd')).toBeNull();
    expect(safeLocalFile(resolved, '/etc/passwd')).toBeNull();
    expect(safeLocalFile(null, '01_active.png')).toBeNull();
    expect(safeLocalFile({ ...resolved, source: 'bucket' }, '01_active.png')).toBeNull();
  });

  it('safeLocalFile refuses a listed name whose file has gone missing', () => {
    const { safeLocalFile, readLocalManifest } = load();
    const dir = writeLocal();
    const resolved = readLocalManifest('daily', env);
    fs.unlinkSync(path.join(dir, '01_active.png'));
    expect(safeLocalFile(resolved, '01_active.png')).toBeNull();
  });
});

describe('screenTokenGrants', () => {
  it('grants only when BRIEF_SCREEN_TOKEN is set and matches exactly', () => {
    const { screenTokenGrants } = load();
    expect(screenTokenGrants({ BRIEF_SCREEN_TOKEN: 'wall-secret' }, 'wall-secret')).toBe(true);
    expect(screenTokenGrants({ BRIEF_SCREEN_TOKEN: 'wall-secret' }, 'wall-secre')).toBe(false);
    expect(screenTokenGrants({ BRIEF_SCREEN_TOKEN: 'wall-secret' }, undefined)).toBe(false);
    expect(screenTokenGrants({ BRIEF_SCREEN_TOKEN: 'wall-secret' }, ['wall-secret'])).toBe(false);
  });

  it('never grants when the token is unset or blank — an empty token must not open the page', () => {
    const { screenTokenGrants } = load();
    expect(screenTokenGrants({}, '')).toBe(false);
    expect(screenTokenGrants({ BRIEF_SCREEN_TOKEN: '' }, '')).toBe(false);
    expect(screenTokenGrants({ BRIEF_SCREEN_TOKEN: '   ' }, '   ')).toBe(false);
  });
});

describe('buildPageModel', () => {
  it('flattens the manifest into what the views need, with a screen link per panel', () => {
    const { buildPageModel } = load();
    const resolved = { source: 'local', kind: 'daily', dir: '/x', manifest: MANIFEST };
    const model = buildPageModel(resolved);
    expect(model).toMatchObject({
      kind: 'daily',
      source: 'local',
      day: '2026-09-03',
      dateline: 'yesterday · Thu 03 Sep',
      lead: 'Lead text',
      closer: 'Closer text',
      liveUrl: 'https://dash.example.org/observability/brief',
      cohort: { teachers: 1063, label: 'all registered teachers' },
    });
    expect(model.panels).toEqual([
      expect.objectContaining({ index: 0, id: 'cover', caption: 'Cover', alt: 'cover alt', src: '/observability/brief/file/daily/00_cover.png', screenHref: '/observability/brief/screen?kind=daily&p=0' }),
      expect.objectContaining({ index: 1, id: 'active', src: '/observability/brief/file/daily/01_active.png', screenHref: '/observability/brief/screen?kind=daily&p=1' }),
    ]);
  });

  it('tolerates a manifest with missing optional fields', () => {
    const { buildPageModel } = load();
    const model = buildPageModel({ source: 'bucket', kind: 'weekly', baseUrl: 'https://b', manifest: { panels: [{ file: 'a.png' }] } });
    expect(model.panels[0]).toMatchObject({ index: 0, caption: '', alt: '', src: 'https://b/a.png' });
    expect(model.dateline).toBe('');
    expect(model.liveUrl).toBeNull();
  });
});
