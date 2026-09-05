/**
 * Brief Service — the pure helpers behind the Morning Brief live page.
 *
 * A brief is a manifest.json plus panel PNGs, written by the Python renderer
 * (brief/cli.py) to `<BRIEF_OUT_DIR>/latest/<kind>/` and mirrored to the
 * public Supabase Storage bucket `brief` when the deployment has one. The
 * dashboard reads the local render first (the common case when it shares a
 * host with the cron worker) and falls back to the bucket (a dashboard on a
 * different host, or one that only ever sees the mirror).
 *
 * Kept free of express so it is testable without booting the app — the
 * repo has no supertest. Everything that decides WHAT to serve lives here;
 * routes/brief.routes.js only wires it to HTTP.
 *
 * Two of these helpers are security boundaries and are deliberately strict:
 *   - safeLocalFile: the file route serves ONLY a basename the manifest
 *     lists, from the render dir — never the manifest, never sent.json,
 *     never a path outside the directory.
 *   - screenTokenGrants: a blank BRIEF_SCREEN_TOKEN never grants; a wall
 *     display token is compared in constant time.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const KINDS = ['daily', 'weekly'];
const BUCKET = 'brief';
const MOUNT = '/observability/brief';

/** Anything other than 'weekly' is the daily brief — the query string is untrusted. */
function normalizeKind(raw) {
  return raw === 'weekly' ? 'weekly' : 'daily';
}

/** Output directory, anchored to the repo root (matches send-brief.js and the worker). */
function briefOutDir(env = process.env) {
  return path.resolve(REPO_ROOT, env.BRIEF_OUT_DIR || 'brief/out');
}

function latestDir(kind, env = process.env) {
  return path.join(briefOutDir(env), 'latest', normalizeKind(kind));
}

/** The local render, or null when there is none (or it is unreadable). */
function readLocalManifest(kind, env = process.env) {
  const dir = latestDir(kind, env);
  const file = path.join(dir, 'manifest.json');
  try {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!manifest || !Array.isArray(manifest.panels)) return null;
    return { source: 'local', kind: normalizeKind(kind), dir, manifest };
  } catch {
    return null;
  }
}

/** Public URL of the bucket mirror for this kind, or null without SUPABASE_URL. */
function bucketBaseUrl(kind, env = process.env) {
  const base = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/storage/v1/object/public/${BUCKET}/latest/${normalizeKind(kind)}`;
}

/** The bucket mirror's manifest, or null on any failure — the page degrades to its empty state. */
async function fetchBucketManifest(kind, env = process.env, fetchImpl = globalThis.fetch) {
  const baseUrl = bucketBaseUrl(kind, env);
  if (!baseUrl || typeof fetchImpl !== 'function') return null;
  try {
    const response = await fetchImpl(`${baseUrl}/manifest.json`);
    if (!response || !response.ok) return null;
    const manifest = await response.json();
    if (!manifest || !Array.isArray(manifest.panels)) return null;
    return { source: 'bucket', kind: normalizeKind(kind), baseUrl, manifest };
  } catch {
    return null;
  }
}

/** Local render first, then the bucket mirror, else null. */
async function resolveManifest(kind, { env = process.env, fetchImpl } = {}) {
  return readLocalManifest(kind, env) || fetchBucketManifest(kind, env, fetchImpl);
}

/** Where the browser loads a panel image from. */
function panelSrc(resolved, panel) {
  const name = path.basename(String(panel.file || ''));
  if (resolved.source === 'bucket') return `${resolved.baseUrl}/${encodeURIComponent(name)}`;
  return `${MOUNT}/file/${resolved.kind}/${encodeURIComponent(name)}`;
}

/**
 * The absolute path the file route may serve for `name`, or null. Only a
 * basename the manifest lists, from a LOCAL render, that still exists.
 */
function safeLocalFile(resolved, name) {
  if (!resolved || resolved.source !== 'local') return null;
  const wanted = String(name || '');
  if (!wanted || wanted !== path.basename(wanted) || wanted.includes('..')) return null;
  const listed = resolved.manifest.panels.some((p) => path.basename(String(p.file || '')) === wanted);
  if (!listed) return null;
  const abs = path.join(resolved.dir, wanted);
  if (!abs.startsWith(resolved.dir + path.sep)) return null;
  try {
    return fs.statSync(abs).isFile() ? abs : null;
  } catch {
    return null;
  }
}

/** True only when BRIEF_SCREEN_TOKEN is set (non-blank) and `token` matches it exactly. */
function screenTokenGrants(env = process.env, token) {
  const expected = String(env.BRIEF_SCREEN_TOKEN || '').trim();
  if (!expected || typeof token !== 'string' || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Flattens a resolved manifest into what brief.ejs / brief-screen.ejs render. */
function buildPageModel(resolved) {
  const m = resolved.manifest || {};
  const kind = resolved.kind;
  const panels = (m.panels || []).map((panel, index) => ({
    index,
    id: panel.id || `panel-${index}`,
    caption: panel.caption || '',
    alt: panel.alt || '',
    src: panelSrc(resolved, panel),
    screenHref: `${MOUNT}/screen?kind=${kind}&p=${index}`,
  }));
  return {
    kind,
    source: resolved.source,
    day: m.day || '',
    dateline: m.dateline || '',
    generatedAt: m.generated_at || '',
    cohort: m.cohort || null,
    lead: m.lead || '',
    closer: m.closer || '',
    liveUrl: m.live_url || null,
    panels,
  };
}

module.exports = {
  REPO_ROOT,
  KINDS,
  MOUNT,
  normalizeKind,
  briefOutDir,
  latestDir,
  readLocalManifest,
  bucketBaseUrl,
  fetchBucketManifest,
  resolveManifest,
  panelSrc,
  safeLocalFile,
  screenTokenGrants,
  buildPageModel,
};
