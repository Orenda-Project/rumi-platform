#!/usr/bin/env node
/**
 * Runs the bundled Postgres (the `embedded-postgres` npm package: real
 * Postgres binaries for Windows, macOS and Linux, installed by `npm install`).
 *
 *   RUMI_DB_PASSWORD=<pw> node infrastructure/db/embedded-postgres.mjs \
 *     --dir <data dir> --port <n> [--ephemeral] [--exit-on-stdin-end]
 *
 * The password comes from the environment, not argv, so other local users
 * cannot read it from the process list.
 *
 * Prints one JSON line once Postgres accepts connections:
 *   {"ready":true,"port":<n>}
 * then keeps running until SIGINT/SIGTERM.
 *
 * --ephemeral deletes the data directory on stop (tests). Without it the data
 * directory is initialised once and reused on every start.
 * --exit-on-stdin-end also stops when stdin closes, so a parent process that
 * dies (a test runner) never leaves an orphaned Postgres behind. Leave it off
 * for a detached service, whose stdin is closed from the start.
 *
 * This is ESM because embedded-postgres is ESM-only; CommonJS callers spawn it.
 */

import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { ephemeral: false, exitOnStdinEnd: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--ephemeral') args.ephemeral = true;
    else if (flag === '--exit-on-stdin-end') args.exitOnStdinEnd = true;
    else if (flag === '--dir') args.dir = argv[++i];
    else if (flag === '--port') args.port = Number(argv[++i]);
    else throw new Error(`Unknown flag: ${flag}`);
  }
  if (!args.dir) throw new Error('--dir is required');
  if (!Number.isInteger(args.port) || args.port <= 0) throw new Error('--port must be a positive integer');
  return args;
}

async function main() {
  const { dir, port, ephemeral, exitOnStdinEnd } = parseArgs(process.argv.slice(2));
  const password = process.env.RUMI_DB_PASSWORD;
  if (!password) throw new Error('RUMI_DB_PASSWORD must be set');

  // Postgres refuses to run as root. In a container (often root) the package
  // can create a `postgres` system user to run it — a change to the machine,
  // so only on request.
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  if (isRoot && process.env.RUMI_DB_RUN_AS_ROOT !== '1') {
    throw new Error(
      'Postgres will not run as the root user. Run Rumi as a normal user — or, inside a '
      + 'container, set RUMI_DB_RUN_AS_ROOT=1 so a "postgres" system user is created to run it.'
    );
  }

  const dataDir = path.resolve(dir);
  const isInitialised = fs.existsSync(path.join(dataDir, 'PG_VERSION'));

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: 'postgres',
    password,
    authMethod: 'scram-sha-256',
    persistent: !ephemeral,
    createPostgresUser: isRoot,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    // Hosted Supabase runs in UTC; timestamps must serialise as +00:00 here too.
    postgresFlags: ['-c', 'timezone=UTC'],
    onLog: () => {},
    onError: (err) => process.stderr.write(`[postgres] ${err}\n`),
  });

  if (!isInitialised) await pg.initialise();
  await pg.start();

  let isStopping = false;
  const stop = async () => {
    if (isStopping) return;
    isStopping = true;
    try {
      await pg.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  if (exitOnStdinEnd) {
    process.stdin.on('end', stop);
    process.stdin.resume();
  }

  process.stdout.write(`${JSON.stringify({ ready: true, port })}\n`);
}

main().catch((err) => {
  process.stderr.write(`embedded-postgres failed: ${err.message}\n`);
  process.exit(1);
});
