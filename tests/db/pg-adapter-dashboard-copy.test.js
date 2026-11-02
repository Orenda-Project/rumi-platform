/**
 * The dashboard deploys from dashboard/ on its own, so it can't require
 * bot/shared; it carries a copy of the pg-adapter, and this test keeps the
 * two identical. Edit bot/shared/services/db/pg-adapter/, then copy:
 *   cp bot/shared/services/db/pg-adapter/*.js dashboard/lib/pg-adapter/
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const BOT_DIR = path.join(ROOT, 'bot/shared/services/db/pg-adapter');
const DASHBOARD_DIR = path.join(ROOT, 'dashboard/lib/pg-adapter');

const jsFiles = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();

test('dashboard/lib/pg-adapter has the same files as the bot copy', () => {
  expect(jsFiles(DASHBOARD_DIR)).toEqual(jsFiles(BOT_DIR));
});

test.each(jsFiles(BOT_DIR))('%s is byte-identical', (file) => {
  const bot = fs.readFileSync(path.join(BOT_DIR, file), 'utf8');
  const dashboard = fs.readFileSync(path.join(DASHBOARD_DIR, file), 'utf8');
  expect(dashboard).toBe(bot);
});
