/**
 * Connection Test Script
 *
 * Tests connectivity to all required services:
 * - Supabase (database)
 * - Redis (job queue)
 * - OpenRouter/OpenAI (LLM)
 *
 * Run: node infrastructure/scripts/test-connections.js
 */

const path = require('path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
} catch (e) {}

async function testSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
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
    testSupabase(),
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
    console.log('  All connections successful (or skipped).\n');
  } else {
    console.log('  Some connections failed. Check your .env configuration.\n');
  }
  return results;
}

module.exports = { testSupabase, testRedis, testLLM, runTests };

if (require.main === module) {
  runTests().then(results => {
    const failed = results.some(r => r.status === 'FAIL');
    process.exit(failed ? 1 : 0);
  });
}
