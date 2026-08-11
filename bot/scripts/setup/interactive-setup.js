#!/usr/bin/env node
/**
 * interactive-setup.js — `rumi setup`, the guided path from a fresh clone to a
 * WhatsApp conversation with Rumi.
 *
 * Written for the person who has never seen this codebase: someone at a school
 * or an NGO who was told "you can run this yourself". Four things follow from
 * that, and they explain most of the shape of this file:
 *
 *   1. **Nothing is asked by its variable name.** The question is "where does
 *      Rumi keep its memory", not "SUPABASE_URL". Storage keys are an
 *      implementation detail of `.env`, not vocabulary the user must learn.
 *   2. **Every answer is checked while the person who typed it is still here.**
 *      A key that is merely *present* tells you nothing; the failure it causes
 *      surfaces hours later inside a feature, with no clue which of eight
 *      values was wrong. Each step probes the real service before moving on.
 *   3. **Progress is saved after each step, not at the end.** Ctrl+C is a
 *      legitimate way to leave — the browser tab for the next credential is
 *      often the reason — so quitting must never cost work already done.
 *   4. **Anything already working is not asked about again.** Re-running the
 *      wizard on a configured deployment should take seconds and change
 *      nothing. Pass `--reconfigure` to be asked everything regardless.
 *
 * Usage:
 *   rumi setup [--reconfigure]
 *   node bot/scripts/setup/interactive-setup.js
 *
 * @module interactive-setup
 */

// A `rumi` command is a conversation with a person, so its output must stay
// human-readable. bot/shared/utils/structured-logger.js replaces console.* with
// JSON logging for the server, and any module that reaches it (the WhatsApp
// connection does) would take this command's output with it — a QR code and a
// wizard, rendered as log records. Set before the first require, since the
// override happens at import time.
process.env.RUMI_CLI = '1';

const path = require('path');
const { spawnSync } = require('child_process');

const ui = require('./ui');
const { createIo, PromptAbortError } = require('./prompt');
const { readEnvFile, writeEnvVars } = require('./env-file');
const validators = require('./validators');
const dbSetup = require('./db-setup');
const fields = require('./fields');
const summary = require('./summary');

const ROOT = path.resolve(__dirname, '../../..');
const ENV_PATH = path.join(ROOT, '.env');
const ENV_TEMPLATE_PATH = path.join(ROOT, '.env.template');
const TOTAL_STEPS = 5;
const LOCAL_REDIS = { url: 'redis://localhost:6379', container: 'rumi-redis', image: 'redis:7-alpine' };

// ── Shared plumbing ──────────────────────────────────────────────────────────

/**
 * Builds the `save` function every step uses: patches `.env` in place and
 * updates the live env, so the next step's live check sees what the last step
 * collected without a restart.
 *
 * @param {object} env  mutated in place — this is the wizard's working env
 * @returns {(vars: Record<string,string>) => void}
 */
function createSaver(env, envPath = ENV_PATH) {
  return (vars) => {
    const meaningful = Object.fromEntries(
      Object.entries(vars).filter(([, value]) => value !== undefined && value !== ''),
    );
    if (!Object.keys(meaningful).length) return;
    Object.assign(env, meaningful);
    writeEnvVars(envPath, meaningful, { fromTemplatePath: ENV_TEMPLATE_PATH });
  };
}

/**
 * Runs one of doctor.js's live probes. Probes throw on network failure; a
 * wizard step wants a verdict, never an exception, so failures come back as
 * `{ok: false}` with the message the user should see.
 *
 * @returns {Promise<{ok: boolean, detail: string}>}
 */
async function probe(name, env) {
  const { defaultProbes } = require('./doctor');
  try {
    return await defaultProbes[name](env);
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

/**
 * The values `.env.template` ships, so the wizard can tell a real answer from a
 * value it put there itself. Read once, lazily.
 */
let templateDefaultsCache;
function templateDefaults(templatePath = ENV_TEMPLATE_PATH) {
  if (!templateDefaultsCache) {
    try { templateDefaultsCache = readEnvFile(templatePath); } catch { templateDefaultsCache = {}; }
  }
  return templateDefaultsCache;
}

/**
 * Did a *person* give us this value?
 *
 * Not the same question as "is it non-empty". `.env` is created from the
 * template, and the template ships working-looking values —
 * `REDIS_URL=redis://localhost:6379`, `SUPABASE_URL=https://your-project.supabase.co`
 * — which are suggestions, not configuration. Counting them as answers produced
 * three wrong things on a genuinely fresh install, all seen in a live run:
 * "Picking up from last time — 2 of 3 core services are already configured" on a
 * clone that had configured nothing; "Checking the Redis you already have… ✘"
 * about a Redis nobody had claimed to have; and prompts offering
 * `[https://your-project.supabase.co]` as the value to keep, where pressing
 * Enter accepts a placeholder.
 *
 * @returns {boolean}
 */
function isProvided(env, key) {
  const value = env[key];
  if (!value) return false;
  if (/^CHANGEME/i.test(value)) return false;
  if (/^(your-|https:\/\/your-)/i.test(value)) return false;
  return value !== templateDefaults()[key];
}

/** True when a person has given us every one of `keys`. */
function hasAll(env, keys) {
  return keys.every((key) => isProvided(env, key));
}

/** The value to offer as "press Enter to keep this", or '' when there is none. */
function prefill(env, key) {
  return isProvided(env, key) ? env[key] : '';
}

/**
 * A value that is still the template's own suggestion — worth trying quietly,
 * but not worth announcing as something the user already had.
 */
function isTemplateSuggestion(env, key) {
  return Boolean(env[key]) && !isProvided(env, key) && !/^CHANGEME/i.test(env[key]);
}

/**
 * Opens a step at the top of a cleared screen, with a tick for everything
 * already done above it.
 *
 * The clearing is why: a prompt printed after five screens of scroll sits on the
 * terminal's bottom line, far from the explanation it belongs to. The ticks are
 * why it is safe to clear — orientation survives, in one line per step instead
 * of a screenful.
 */
const completedSteps = [];
function beginStep(index, title) {
  ui.clearScreen();
  console.log('');
  console.log(ui.progressBar(index, TOTAL_STEPS));
  // What is already done reads as history above the current step, not as a note
  // underneath its heading.
  for (const done of completedSteps) console.log(`  ${ui.ok(ui.dim(done))}`);
  console.log('');
  console.log(ui.bold(title));
}

/** Records a step as done, so later screens can show it as a tick. */
function finishStep(title) {
  if (!completedSteps.includes(title)) completedSteps.push(title);
}

/**
 * A live check with a spinner, retried by the caller on failure. Returns the
 * probe verdict so a step can decide whether "no" is fatal.
 */
async function checkLive(label, name, env, successText) {
  const spin = ui.spinner(label);
  const result = await probe(name, env);
  if (result.ok) spin.succeed(successText(result.detail));
  else spin.fail(ui.paint('danger', result.detail));
  return result;
}

// ── Step 1: the database ─────────────────────────────────────────────────────

const SUPABASE_WALKTHROUGH = [
  'Open https://supabase.com/dashboard/new and sign in (the free plan is plenty)',
  'Give the project any name, choose the region closest to your teachers, and let it start up — about two minutes',
  'Open Project Settings → Data API, and keep that page open',
];

/**
 * Collects and verifies the Supabase connection, then makes sure Rumi's tables
 * exist. Writes through the caller's saver as it goes rather than returning
 * anything — every step is durable the moment its answer is accepted.
 */
async function stepDatabase(io, env, save, opts = {}) {
  beginStep(1, 'Where Rumi keeps its memory');
  console.log(ui.say('Every teacher, lesson plan and reading score Rumi produces is stored in a database that belongs to you — not to us. Supabase gives you one free.'));

  const configured = hasAll(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (configured && !opts.reconfigure) {
    const check = await checkLive('Checking the database you already have…', 'supabase', env, () => 'Database already connected');
    if (check.ok) return ensureTables(io, env);
    console.log(ui.say('Let us set that up again.'));
  }

  console.log('');
  console.log(ui.steps(SUPABASE_WALKTHROUGH));

  for (;;) {
    const url = await io.ask('Project URL', {
      fallback: prefill(env, 'SUPABASE_URL'),
      validate: validators.supabaseUrl,
      hint: 'On that page, the field called "Project URL".',
    });
    const key = await io.ask('Service key', {
      secret: true,
      fallback: prefill(env, 'SUPABASE_SERVICE_ROLE_KEY'),
      validate: validators.supabaseServiceKey,
      hint: 'The "service_role" key, further down the same page — you have to click Reveal to see it. It is hidden as you type.',
    });

    save({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key });
    const check = await checkLive('Talking to your database…', 'supabase', env, (d) => `Connected to Supabase ${ui.dim(d)}`);
    if (check.ok) break;
    console.log(ui.aside('That did not connect. Check the project has finished starting up, then try again.'));
  }

  return ensureTables(io, env);
}

/**
 * Creates Rumi's tables if they aren't there.
 *
 * The `exec_sql` detour is unavoidable and is the single most common place a
 * self-serve setup dies: Supabase offers no API for running arbitrary SQL, so
 * the schema is applied through a small function that itself has to be pasted
 * in by hand, once. Naming that plainly — and linking straight to the right
 * project's SQL editor — is the difference between a two-minute step and an
 * abandoned install.
 */
async function ensureTables(io, env) {
  const spin = ui.spinner('Looking for Rumi\'s tables…');
  const status = await dbSetup.inspectDatabase(env);
  spin.stop();

  if (status.state === 'ready') {
    console.log(ui.ok(`Tables already set up ${ui.dim(`(${status.detail})`)}`));
    return;
  }
  if (status.state === 'unreachable') {
    console.log(ui.warn(`Could not check the tables: ${status.detail}`));
    return;
  }

  if (status.state === 'needs-helper') {
    console.log('');
    console.log(ui.say('Rumi needs to create about seventy tables. Supabase does not allow a script to run SQL directly, so there is one thing to paste by hand first — this is the only manual step in the whole setup.'));
    console.log('');
    const editor = dbSetup.sqlEditorUrl(env.SUPABASE_URL);
    console.log(ui.steps([
      editor ? `Open ${editor}` : 'Open the SQL Editor in your Supabase project',
      'Paste the two lines below and press Run',
      'Come back here',
    ]));
    console.log('');
    console.log(ui.box(dbSetup.EXEC_SQL_DEFINITION, { title: 'copy this', role: 'accent' }));
    console.log('');
    await io.pressEnter('Press Enter once you have run it');

    const recheck = await dbSetup.hasExecSql(env);
    if (!recheck.present) {
      console.log(ui.warn('Still cannot see it. Skipping the tables for now — run `npm run bootstrap:db` once the two lines are in place.'));
      return;
    }
  }

  const applying = ui.spinner('Creating tables, security rules and starter data… (about a minute)');
  const result = await dbSetup.applySchema(env);
  if (result.ok) applying.succeed(`Database ready ${ui.dim(`(${result.applied.length} files applied)`)}`);
  else {
    applying.fail('Could not finish setting up the tables');
    for (const failure of result.errors) console.log(ui.aside(`${failure.file}: ${failure.error}`));
    console.log(ui.aside('Setup will carry on — retry the tables later with `npm run bootstrap:db`.'));
  }
}

// ── Step 2: the AI ───────────────────────────────────────────────────────────

async function stepBrain(io, env, save, opts = {}) {
  beginStep(2, 'How Rumi thinks');
  console.log(ui.say('Rumi reaches AI models through OpenRouter — one account, many models, so you are never locked to a single provider. A typical reply costs a fraction of a cent.'));

  if (hasAll(env, ['OPENROUTER_API_KEY']) && !opts.reconfigure) {
    const check = await checkLive('Checking the AI key you already have…', 'openrouter', env, (d) => `AI already connected ${ui.dim(d)}`);
    if (check.ok) return;
    console.log(ui.say('Let us set that up again.'));
  }

  console.log('');
  console.log(ui.steps([
    'Open https://openrouter.ai/keys and create a key',
    'Add a few dollars of credit at https://openrouter.ai/settings/credits',
  ]));
  console.log(ui.aside('The credit matters: a key with none will answer a greeting and then fail on anything substantial, like generating a quiz. That failure looks like a bug in Rumi, so it is worth doing now.'));

  for (;;) {
    const key = await io.ask('API key', {
      secret: true,
      fallback: prefill(env, 'OPENROUTER_API_KEY'),
      validate: validators.openrouterKey,
    });
    save({ OPENROUTER_API_KEY: key });

    const spin = ui.spinner('Checking the key and its balance…');
    const check = await probe('openrouter', env);
    if (check.ok) {
      spin.succeed(`AI connected ${ui.dim(check.detail)}`);
      return;
    }

    // A rejected key is a different problem from a valid key with no money on
    // it, and only the first is worth re-asking about.
    const noCredit = /credit/i.test(check.detail);
    if (noCredit) {
      spin.warn(check.detail);
      const carryOn = await io.confirm('That key works but cannot pay for a request yet. Carry on and add credit later?', true);
      if (carryOn) return;
    } else {
      spin.fail(ui.paint('danger', `That key was rejected (${check.detail})`));
    }
  }
}

// ── Step 3: Redis ────────────────────────────────────────────────────────────

/** Is there a Docker daemon we could actually start a container on? */
function dockerAvailable() {
  const result = spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 10_000 });
  return result.status === 0;
}

/**
 * Starts (or restarts) a local Redis container. Reusing a container that
 * already exists matters more than it sounds: someone re-running setup would
 * otherwise hit "the container name is already in use" and be stuck at a
 * Docker error in the middle of a WhatsApp tutorial.
 *
 * @returns {{ok: boolean, detail: string}}
 */
function startLocalRedis(run = spawnSync) {
  const created = run('docker', ['run', '-d', '--name', LOCAL_REDIS.container, '-p', '6379:6379', LOCAL_REDIS.image], { encoding: 'utf-8' });
  if (created.status === 0) return { ok: true, detail: 'started a new container' };

  const message = `${created.stderr || ''}`;
  if (/already in use/i.test(message)) {
    const started = run('docker', ['start', LOCAL_REDIS.container], { encoding: 'utf-8' });
    if (started.status === 0) return { ok: true, detail: 'reused the container from last time' };
    return { ok: false, detail: (started.stderr || '').trim() || 'could not start the existing container' };
  }
  return { ok: false, detail: message.trim().split('\n').pop() || 'docker could not start Redis' };
}

async function stepMemory(io, env, save, opts = {}) {
  beginStep(3, 'Rumi\'s short-term memory');
  console.log(ui.say('While a teacher is mid-conversation — halfway through a reading assessment, say — Rumi holds the thread in Redis. It also runs the slow work in the background, like marking a quiz.'));

  if (!opts.reconfigure && hasAll(env, ['REDIS_URL'])) {
    const check = await checkLive('Checking the Redis you already have…', 'redis', env, () => 'Short-term memory already connected');
    if (check.ok) return;
    console.log(ui.say('That one is not answering. Let us set it up again.'));
  } else if (!opts.reconfigure && isTemplateSuggestion(env, 'REDIS_URL')) {
    // The template's own suggestion (a local Redis). Worth trying, but silently:
    // announcing a check for something the user never configured, and then
    // failing it in red, reads as though setup is already broken.
    const check = await probe('redis', env);
    if (check.ok) {
      console.log(ui.ok(`Short-term memory ready ${ui.dim(`(a Redis is already running at ${env.REDIS_URL})`)}`));
      return;
    }
  }

  // Injectable so both branches are testable on any machine. A spy on the
  // export cannot reach this — the call is to the local binding — and a test
  // that depends on whether the *test runner's* host has a Docker daemon is a
  // test that passes for the wrong reason.
  const hasDocker = (opts.dockerAvailable || dockerAvailable)();

  const options = [];
  if (hasDocker) {
    options.push({ value: 'docker', label: 'Start one here with Docker', hint: 'One command, nothing to sign up for. Best for trying Rumi out.' });
  }
  options.push({ value: 'paste', label: 'I have an address to paste', hint: 'A Railway or Upstash instance, or a Redis you already run.' });

  // Without Docker there is nothing to offer, so the question would be a
  // one-item menu. Say where to *get* one instead — seen in a live fresh-clone
  // run on a machine with no Docker daemon: the step asked for an address and
  // explained the format, but never said how someone with no Redis at all was
  // supposed to obtain one, which makes it a dead end rather than a step.
  if (options.length === 1) {
    console.log('');
    console.log(ui.say('If you do not have one yet, either of these takes about two minutes:'));
    console.log(ui.steps([
      'Free hosted: sign up at https://upstash.com, create a Redis database, and copy its redis:// URL',
      'On your own machine: install Docker, then `docker run -d -p 6379:6379 redis:7-alpine` and use redis://localhost:6379',
      'Already running one on a server? Paste its address — it only has to be reachable from here.',
    ]));
  }

  let how = options.length > 1 ? await io.select('Where should Redis come from?', options, 'docker') : 'paste';

  for (;;) {
    if (how === 'docker') {
      // One attempt only. Falling through to the paste prompt without clearing
      // this would re-run `docker run` on every retry, so a bad pasted address
      // would restart a container that had already failed.
      how = 'paste';
      const spin = ui.spinner('Starting Redis…');
      const started = startLocalRedis();
      if (started.ok) spin.succeed(`Redis running on your machine ${ui.dim(`(${started.detail})`)}`);
      else spin.fail(`Docker could not start it: ${started.detail}`);
      if (started.ok) {
        save({ REDIS_URL: LOCAL_REDIS.url });
        const check = await checkLive('Saying hello to Redis…', 'redis', env, () => 'Short-term memory ready');
        if (check.ok) return;
      }
      console.log(ui.aside('Paste an address instead.'));
    }

    const url = await io.ask('Redis address', {
      fallback: prefill(env, 'REDIS_URL') || LOCAL_REDIS.url,
      validate: validators.redisUrl,
      hint: 'Looks like redis://host:6379, or redis://default:password@host:6379 for a hosted one.',
    });
    save({ REDIS_URL: url });
    const check = await checkLive('Saying hello to Redis…', 'redis', env, (d) => `Short-term memory ready ${ui.dim(d)}`);
    if (check.ok) return;
    console.log(ui.aside('No answer from there. If it is hosted, check the address is reachable from this machine (firewall, allowed IPs) and try again.'));
  }
}

// ── Step 4: optional abilities ───────────────────────────────────────────────

async function stepExtras(io, env, save, opts = {}) {
  beginStep(4, 'Optional abilities');

  const alreadyOn = fields.OPTIONAL_EXTRAS.filter((extra) => hasAll(env, extra.keys));
  if (alreadyOn.length) {
    console.log(ui.say('Already switched on:'));
    for (const extra of alreadyOn) console.log(ui.bullet(extra.title));
    console.log('');
  }

  const remaining = fields.OPTIONAL_EXTRAS.filter((extra) => !hasAll(env, extra.keys));
  if (!remaining.length) {
    console.log(ui.ok('Everything optional is already set up.'));
    return;
  }

  console.log(ui.say('Rumi works without any of these. Each one adds something a teacher would notice, and you can add them later by running `rumi setup` again — so skipping is a real answer, not a postponement.'));

  const choice = await io.select('Add any now?', [
    { value: 'skip', label: 'Skip — get Rumi talking first', hint: 'Recommended. You can come back to this in two minutes.' },
    { value: 'add', label: `Go through them (${remaining.length})`, hint: 'Press Enter on any you do not want.' },
  ], opts.reconfigure ? 'add' : 'skip');

  if (choice === 'skip') return;

  for (const extra of remaining) {
    console.log('');
    console.log(`  ${ui.paint('brandHi', extra.title)}`);
    console.log(ui.aside(extra.why));
    console.log(ui.aside(`Get a key: ${extra.where}`));
    const collected = {};
    for (const key of extra.keys) {
      // The label is the env var only for the odd second field (a region, say)
      // where there is no plainer name for it than the thing itself.
      const label = key === extra.keys[0] ? 'Key' : key.replace(/_/g, ' ').toLowerCase();
      // eslint-disable-next-line no-await-in-loop -- one question at a time, by design
      const value = await io.ask(label, { secret: Boolean(extra.secret) && key === extra.keys[0], fallback: prefill(env, key) });
      if (!value) break;
      collected[key] = value;
    }
    if (Object.keys(collected).length === extra.keys.length) {
      save(collected);
      console.log(ui.ok(`${extra.title} — on`));
    } else {
      console.log(ui.dim('  skipped'));
    }
  }
}

// ── Step 5: WhatsApp ─────────────────────────────────────────────────────────

/**
 * The plain-language channel question. The technical value (`CHANNEL_DRIVER`)
 * is decided behind it and never shown: "sandbox versus production driver" is
 * our vocabulary, and asking it of a user makes them guess at an architecture
 * they have no reason to know.
 *
 * @returns {Promise<'baileys'|'meta'>}
 */
async function chooseChannelDriver(io) {
  return io.select('How are you using Rumi right now?', [
    {
      value: 'baileys',
      label: 'Just trying it out — link my own WhatsApp',
      hint: 'Two minutes, nothing to register. Works like WhatsApp Web.',
    },
    {
      value: 'meta',
      label: 'Real deployment — official WhatsApp Business number',
      hint: 'Needs a Meta Business account and their review process.',
    },
  ], 'baileys');
}

const SANDBOX_CAVEATS = [
  'Rumi becomes a linked device on your own WhatsApp account, exactly like WhatsApp Web — so it can see and reply to your chats.',
  'Use a spare number or a second phone if that is not something you want.',
  'A few things are Meta-only and will feel plainer here: the tap-through forms, approved message templates, and the picture-menu carousels. Rumi asks the same questions as an ordinary chat instead, so nothing is blocked — but it is not the full experience.',
  'It is for trying Rumi out, not for a school: one personal account, and WhatsApp may disconnect it. Run `rumi graduate` for an official number as soon as you are past evaluating.',
];

async function linkSandbox(io) {
  console.log('');
  console.log(ui.say('Before you scan, two things worth knowing:'));
  for (const caveat of SANDBOX_CAVEATS) console.log(ui.bullet(caveat, { dim: true }));
  console.log('');

  const ready = await io.confirm('Ready to scan the code?', true);
  if (!ready) {
    console.log(ui.aside('No problem — run `rumi pair` whenever you are.'));
    return { linked: false };
  }

  console.log('');
  console.log(ui.say('On your phone: WhatsApp → Settings → Linked devices → Link a device, then point it at the code below.'));
  console.log('');

  const { linkWhatsApp, releaseWhatsApp } = require('./link-whatsapp');
  const result = await linkWhatsApp();
  await releaseWhatsApp();

  if (result.ok) {
    console.log('');
    console.log(ui.ok(`Linked${result.number ? ` as ${ui.bold(`+${result.number}`)}` : ''}`));
    return { linked: true, number: result.number };
  }

  const explanation = {
    timeout: 'Nothing was scanned in time.',
    'logged-out': 'WhatsApp rejected the session.',
    busy: 'Rumi already seems to be running, and two processes cannot share one WhatsApp session. Stop the other one first.',
  }[result.reason] || `Pairing failed: ${result.detail || 'unknown error'}`;
  console.log('');
  console.log(ui.warn(`${explanation} Everything else is saved — run \`rumi pair\` to try again.`));
  return { linked: false };
}

async function collectMetaCredentials(io, env, save) {
  console.log('');
  console.log(ui.say('Four values from Meta, all on one page.'));
  console.log('');
  console.log(ui.steps(fields.META_WALKTHROUGH));

  for (const field of fields.META_FIELDS) {
    console.log('');
    const existing = env[field.env] && !/^CHANGEME/i.test(env[field.env]) ? env[field.env] : '';
    // eslint-disable-next-line no-await-in-loop -- one question at a time, by design
    const value = await io.ask(field.label, {
      hint: field.hint,
      secret: Boolean(field.secret),
      fallback: existing || (field.generate ? field.generate() : ''),
      validate: field.validate,
    });
    save({ [field.env]: value });
  }

  const check = await checkLive('Asking Meta whether those work…', 'whatsapp', env, (d) => `Meta accepted your credentials ${ui.dim(d)}`);
  if (!check.ok) {
    console.log(ui.aside('Meta rejected them. The commonest cause is an access token that has expired — they last 24 hours unless you created a permanent one. Re-run `rumi setup --reconfigure` once you have a fresh token; everything else is saved.'));
  }
  return check.ok;
}

/**
 * Is the channel in `.env` already usable? Answering this is what keeps a
 * re-run from offering to re-pair a WhatsApp that is working perfectly well —
 * and re-pairing is not harmless: scanning a new code while the bot holds the
 * session is how a session gets invalidated.
 *
 * @returns {Promise<{number?: string|null, detail?: string}|null>} null when it is not
 */
async function channelAlreadyWorking(env, channel) {
  if (channel === 'meta') {
    if (!hasAll(env, ['WHATSAPP_TOKEN', 'PHONE_NUMBER_ID'])) return null;
    const check = await probe('whatsapp', env);
    return check.ok ? { detail: check.detail } : null;
  }
  const { sandboxIdentity } = require('./status');
  const identity = sandboxIdentity(env);
  return identity.paired ? { number: identity.number } : null;
}

async function stepChannel(io, env, save, opts = {}) {
  beginStep(5, 'Connecting WhatsApp');

  // Only an explicit CHANNEL_DRIVER counts as "already chosen" — the runtime
  // infers a default when it is unset, and inheriting that silently would skip
  // the one question this step exists to ask.
  const existing = isProvided(env, 'CHANNEL_DRIVER') ? env.CHANNEL_DRIVER.trim().toLowerCase() : '';
  if (existing && !opts.reconfigure) {
    const spin = ui.spinner('Checking the WhatsApp connection you already have…');
    const working = await channelAlreadyWorking(env, existing);
    if (working) {
      spin.succeed(working.number
        ? `WhatsApp already linked as ${ui.bold(`+${working.number}`)}`
        : `WhatsApp already connected ${ui.dim(working.detail || '')}`);
      return { channel: existing, linked: true, number: working.number };
    }
    spin.stop();
  }

  const channel = await chooseChannelDriver(io);
  const vars = { CHANNEL_DRIVER: channel };

  // The async pipeline (quiz reports, coaching, video) needs a queue, and the
  // template's default is `sqs` — an AWS account a sandbox user does not have.
  // Seen live: a quiz that generated AND delivered still told the teacher
  // "something went wrong", because scheduling its report threw "SQS Queue not
  // configured". bullmq runs on the Redis collected in step 3, so it is the
  // only sensible sandbox default. Production keeps its own queue choice.
  if (channel !== 'meta') {
    vars.QUEUE_DRIVER = 'bullmq';
    vars.CHANNEL_STATE_DIR = env.CHANNEL_STATE_DIR || '.channel-state';
  }
  save(vars);

  if (channel === 'meta') {
    await collectMetaCredentials(io, env, save);
    return { channel, linked: false };
  }
  const outcome = await linkSandbox(io);
  return { channel, ...outcome };
}

// ── Screens ──────────────────────────────────────────────────────────────────

function welcome(env) {
  console.log(ui.logo('An AI teaching companion that lives in WhatsApp'));
  console.log(ui.say('This sets Rumi up on your own accounts, start to finish. It takes about fifteen minutes, most of which is waiting for a database to start.'));
  console.log('');
  console.log(ui.bold('  You will need'));
  console.log(ui.bullet('A free Supabase account — where Rumi remembers things'));
  console.log(ui.bullet('An OpenRouter account with a few dollars of credit — how Rumi thinks'));
  console.log(ui.bullet('WhatsApp on your phone'));
  console.log('');
  console.log(ui.bold('  Good to know'));
  console.log(ui.bullet('Each answer is saved as you go. Press Ctrl+C to stop and run `rumi setup` again to carry on.'));
  console.log(ui.bullet('Keys are hidden while you type, and stay on this machine in a file called .env.'));

  const done = ['SUPABASE_URL', 'OPENROUTER_API_KEY', 'REDIS_URL'].filter((key) => isProvided(env, key));
  if (done.length) {
    console.log('');
    console.log(ui.say(`Picking up from last time — ${done.length} of 3 core services are already configured, so this will be quick.`));
  }
}

async function finish(env, channelResult) {
  const { channel, number, linked } = channelResult;
  console.log('');
  console.log(ui.rule());
  const spin = ui.spinner('One last check of everything…');
  const { runDoctor } = require('./doctor');
  const doctor = await runDoctor({ env });
  spin.stop();

  console.log(ui.logo());
  const headline = doctor.ok
    ? ui.paint('brand', 'Rumi is ready.', { bold: true })
    : ui.paint('accent', 'Rumi is set up, with something still to fix.', { bold: true });
  console.log(`  ${headline}`);
  console.log('');
  console.log(summary.renderReadiness(doctor, { number, linked }));
  console.log('');
  console.log(ui.rule());
  console.log('');
  console.log(summary.renderNextSteps({ channel, number }));
  console.log('');
  if (!doctor.ok) {
    console.log(ui.aside('Run `rumi doctor` for the detail on what is not working yet.'));
    console.log('');
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main(argv = process.argv) {
  try { require('dotenv').config({ path: ENV_PATH, quiet: true }); } catch { /* dotenv optional */ }

  const reconfigure = argv.includes('--reconfigure') || argv.includes('--force');
  const env = { ...process.env, ...readEnvFile(ENV_PATH) };
  const save = createSaver(env);
  const io = createIo();
  const opts = { reconfigure };

  // Handled here rather than at the process entry point, because the wizard is
  // launched two ways (`rumi setup` and `node interactive-setup.js`) and a
  // goodbye that only works one of them is how Ctrl+C ended up printing a bare
  // "Cancelled by user" stack-trace line through the CLI.
  try {
    welcome(env);
    console.log('');
    await io.pressEnter('Press Enter to begin');

    await stepDatabase(io, env, save, opts);
    finishStep('Where Rumi keeps its memory');
    await stepBrain(io, env, save, opts);
    finishStep('How Rumi thinks');
    await stepMemory(io, env, save, opts);
    finishStep("Rumi's short-term memory");
    await stepExtras(io, env, save, opts);
    finishStep('Optional abilities');
    const channelResult = await stepChannel(io, env, save, opts);

    await finish(env, channelResult);
  } catch (err) {
    if (err instanceof PromptAbortError || err.aborted) {
      console.log('');
      console.log(ui.say('Stopped. Everything you answered is saved — run `rumi setup` again to carry on from here.'));
      process.exitCode = 130;
      return;
    }
    console.log('');
    console.log(ui.fail(`Setup could not finish: ${err.message}`));
    console.log(ui.aside('Nothing already saved was lost. `rumi doctor` shows where things stand.'));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().then(() => process.exit(process.exitCode || 0));
}

module.exports = {
  main, welcome, finish,
  stepDatabase, stepBrain, stepMemory, stepExtras, stepChannel,
  ensureTables, chooseChannelDriver, collectMetaCredentials, linkSandbox, channelAlreadyWorking,
  createSaver, hasAll, isProvided, prefill, isTemplateSuggestion, startLocalRedis, dockerAvailable, probe,
  beginStep, finishStep,
  TOTAL_STEPS, LOCAL_REDIS,
};
