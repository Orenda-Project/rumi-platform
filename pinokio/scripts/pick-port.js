/**
 * Give a server the same port every time it starts.
 *
 * Usage: node scripts/pick-port.js <name>      (name: "bot" or "wizard")
 * Prints `port=<n>` for the calling script's `on` event to capture.
 *
 * Why not Pinokio's {{port}}: it hands out the lowest free port at the moment
 * it is asked, so (1) the bot lands on a different port after a restart and
 * every console tab opened before it -- which Pinokio restores -- points at
 * nothing, and (2) two scripts starting within the same second (Start, and a
 * wizard tab Pinokio reopens) are handed the SAME port, and one of them dies.
 *
 * So each name keeps its port in .ports.json and reuses it while it is free.
 * When it is taken, a new one comes from the OS (port 0), never one already
 * remembered for another name, and is saved for next time.
 */

const fs = require('fs');
const net = require('net');
const path = require('path');

const STATE = path.join(__dirname, '..', '.ports.json');
const name = process.argv[2];

if (!name) {
  console.log('pick-port: usage: node scripts/pick-port.js <name>');
  process.exit(1);
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8')) || {};
  } catch {
    return {};
  }
}

/** Resolve with the port actually bound (0 asks the OS), or null if taken. */
function tryListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(null));
    // 0.0.0.0, not loopback: the bot listens on all interfaces, so a port that
    // is only free on 127.0.0.1 would still fail for it.
    server.listen(port, '0.0.0.0', () => {
      const bound = server.address().port;
      server.close(() => resolve(bound));
    });
  });
}

(async () => {
  const state = readState();
  const others = new Set(Object.entries(state).filter(([key]) => key !== name).map(([, port]) => port));

  let port = Number.isInteger(state[name]) && !others.has(state[name]) ? await tryListen(state[name]) : null;
  for (let attempt = 0; !port && attempt < 20; attempt += 1) {
    const candidate = await tryListen(0);
    if (candidate && !others.has(candidate)) port = candidate;
  }
  if (!port) {
    console.log('pick-port: could not find a free port');
    process.exit(1);
  }

  if (state[name] !== port) {
    state[name] = port;
    fs.writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`);
  }
  console.log(`port=${port}`);
})();
