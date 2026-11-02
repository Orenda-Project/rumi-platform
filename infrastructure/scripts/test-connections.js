/**
 * Connection Test Script
 *
 * Tests connectivity to all required services:
 * - the database (built-in, Postgres or Supabase — see DB_DRIVER)
 * - Redis (job queue)
 * - OpenRouter/OpenAI (LLM)
 *
 * Run: node infrastructure/scripts/test-connections.js
 */

const path = require('path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
} catch (e) {}

/** The database, whichever DB_DRIVER selects (built-in, Postgres or Supabase). */
async function testDatabase() {
  const { databaseUrlFor, missingDbEnv, resolveDbDriver } = require('../../bot/shared/services/db/pg-adapter/drivers');
  let driver;
  try {
    driver = resolveDbDriver(process.env);
  } catch (err) {
    return { service: 'Database', status: 'FAIL', message: err.message };
  }
  if (driver === 'supabase') return testSupabase();
  if (missingDbEnv(driver, process.env).length > 0) return { service: 'Database', status: 'SKIP', message: 'Not configured' };

  const { inspectSchema } = require('../db/schema');
  const status = await inspectSchema(databaseUrlFor(process.env));
  const name = driver === 'bundled' ? 'Database (built-in)' : 'Database (Postgres)';
  if (status.state === 'unreachable') {
    const hint = driver === 'bundled' ? ' — it runs while `rumi start` (or `npm run db:start`) is running' : '';
    return { service: name, status: 'FAIL', message: `${status.detail}${hint}` };
  }
  return { service: name, status: 'OK', message: status.state === 'ready' ? 'Connected, tables present' : 'Connected, no tables yet' };
}

async function testSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { service: 'Supabase', status: 'SKIP', message: 'Not configured' };

  try {
    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    if (response.ok) {
      return { service: 'Supabase', status: 'OK', message: 'Connected' };
    }
    return { service: 'Supabase', status: 'FAIL', message: `HTTP ${response.status}` };
  } catch (err) {
    return { service: 'Supabase', status: 'FAIL', message: err.message };
  }
}

async function testRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return { service: 'Redis', status: 'SKIP', message: 'Not configured' };

  try {
    const Redis = require('ioredis');
    const redis = new Redis(url, { connectTimeout: 5000, lazyConnect: true });
    await redis.connect();
    await redis.ping();
    await redis.quit();
    return { service: 'Redis', status: 'OK', message: 'Connected' };
  } catch (err) {
    return { service: 'Redis', status: 'FAIL', message: err.message };
  }
}

async function testLLM() {
  const provider = (process.env.LLM_PROVIDER || 'openrouter').toLowerCase();
  const key = provider === 'openai'
    ? process.env.OPENAI_API_KEY
    : process.env.OPENROUTER_API_KEY;

  if (!key) return { service: `LLM (${provider})`, status: 'SKIP', message: 'Not configured' };

  try {
    const baseURL = provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1'
      : 'https://api.openai.com/v1';

    const response = await fetch(`${baseURL}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (response.ok) {
      return { service: `LLM (${provider})`, status: 'OK', message: 'API key valid' };
    }
    return { service: `LLM (${provider})`, status: 'FAIL', message: `HTTP ${response.status}` };
  } catch (err) {
    return { service: `LLM (${provider})`, status: 'FAIL', message: err.message };
  }
}

async function runTests() {
  console.log('\n  Connection Tests\n');

  const results = await Promise.all([
    testDatabase(),
    testRedis(),
    testLLM(),
  ]);

  let allPassed = true;
  for (const r of results) {
    const icon = r.status === 'OK' ? '[OK]' : r.status === 'SKIP' ? '[--]' : '[!!]';
    console.log(`  ${icon} ${r.service}: ${r.message}`);
    if (r.status === 'FAIL') allPassed = false;
  }

  console.log('');
  if (allPassed) {
    const okCount = results.filter(r => r.status === 'OK').length;
    const skippedCount = results.filter(r => r.status === 'SKIP').length;
    if (okCount === 0 && skippedCount === results.length) {
      console.log('  Nothing was tested - no services configured. Set credentials in .env and re-run.\n');
    } else if (okCount > 0 && skippedCount > 0) {
      console.log(`  ${okCount} connection(s) OK; ${skippedCount} skipped (not configured).\n`);
    } else {
      console.log(`  All ${okCount} configured connection(s) OK.\n`);
    }
  } else {
    console.log('  Some connections failed. Check your .env configuration.\n');
  }
  return results;
}

module.exports = { testDatabase, testSupabase, testRedis, testLLM, runTests };

if (require.main === module) {
  runTests().then(results => {
    const failed = results.some(r => r.status === 'FAIL');
    process.exit(failed ? 1 : 0);
  });
}
