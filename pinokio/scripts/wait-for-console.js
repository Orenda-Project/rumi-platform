/**
 * Wait for Rumi to answer /health, then print its console URL on a line of its own.
 *
 * Why this exists: Pinokio matches `on` events against only the last 300
 * characters of terminal output, and Rumi prints its console URL inside one
 * large startup banner, followed by the log directory and (on Meta deployments)
 * webhook instructions. The URL has scrolled out of that window before the match
 * runs, so start.js would wait forever. A short line printed by itself is
 * always inside the window.
 *
 * Usage: node scripts/wait-for-console.js <port>
 */

const port = Number(process.argv[2]);
const base = `http://127.0.0.1:${port}`;
const deadline = Date.now() + 5 * 60 * 1000;

if (!Number.isInteger(port) || port <= 0) {
  console.log(`wait-for-console: not a port: ${process.argv[2]}`);
  process.exit(1);
}

(async () => {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) {
        console.log(`Rumi console: ${base}/console`);
        return;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.log(`wait-for-console: Rumi did not answer ${base}/health within 5 minutes`);
  process.exit(1);
})();
