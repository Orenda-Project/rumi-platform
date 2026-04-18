#!/usr/bin/env node
/**
 * pipeline/cli/pipeline.js — operator CLI
 *
 * Usage:
 *   node pipeline/cli/pipeline.js migrate
 *   node pipeline/cli/pipeline.js register-books --config <yaml> --source <path>
 *   node pipeline/cli/pipeline.js run --stage <stage> --province <province> [--book <id>] [--parallel <n>]
 *   node pipeline/cli/pipeline.js run-all --province <province> [--book <id>]
 *   node pipeline/cli/pipeline.js status --province <province>
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const WORKERS = {
  '01_acquisition': require('../workers/01_acquisition.worker'),
  '02_ingestion':   require('../workers/02_ingestion.worker'),
  '03_toc_extract': require('../workers/03_toc_extract.worker'),
  '04_slo_mapping': require('../workers/04_slo_mapping.worker'),
  '05_chunking':    require('../workers/05_chunking.worker'),
  '06_enrichment':  require('../workers/06_enrichment.worker'),
  '07_ped_eval':    require('../workers/07_ped_eval.worker'),
  '08_slide_gen':   require('../workers/08_slide_gen.worker'),
  '09_visual_eval': require('../workers/09_visual_eval.worker'),
  '10_voice_script':require('../workers/10_voice_script.worker'),
  '11_voice_tts':   require('../workers/11_voice_tts.worker'),
  '12_publish':     require('../workers/12_publish.worker'),
};

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { args[a.slice(2)] = argv[i + 1]; i++; }
    else args._.push(a);
  }
  return args;
}

function loadProvinceConfig(province) {
  const p = path.join(__dirname, '..', 'config', `${province}-g1-g5.yaml`);
  if (!fs.existsSync(p)) throw new Error(`Province config not found: ${p}`);
  return yaml.load(fs.readFileSync(p, 'utf8'));
}

async function runStage(stage, province, opts = {}) {
  const worker = WORKERS[stage];
  if (!worker) { console.error(`Unknown stage: ${stage}. Available: ${Object.keys(WORKERS).join(', ')}`); process.exit(1); }
  const provinceConfig = loadProvinceConfig(province);
  const jobId = crypto?.randomUUID?.() || `${Date.now()}`;
  console.log(`[cli] Running ${stage} for province=${province} jobId=${jobId}`);
  const result = await worker.handleJob(jobId, provinceConfig, opts);
  console.log(`[cli] ${stage} result: ${result.status}`);
  if (result.detail) console.log(`[cli] detail:`, JSON.stringify(result.detail).slice(0, 500));
  return result;
}

async function runAll(province, opts) {
  const stages = Object.keys(WORKERS);
  for (const s of stages) {
    const result = await runStage(s, province, opts);
    if (result.status !== 'complete') {
      console.error(`[cli] Stopped at ${s} with status=${result.status}`);
      process.exit(1);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  switch (cmd) {
    case 'migrate':
      console.log('[cli] migrate: apply pipeline/sql/*.sql to your Supabase DB');
      console.log('  psql $DATABASE_URL -f pipeline/sql/001_textbooks.sql');
      console.log('  psql $DATABASE_URL -f pipeline/sql/002_textbook_pages.sql');
      console.log('  psql $DATABASE_URL -f pipeline/sql/003_textbook_toc.sql');
      console.log('  psql $DATABASE_URL -f pipeline/sql/004_lp_segments.sql');
      console.log('  psql $DATABASE_URL -f pipeline/sql/005_pipeline_runs.sql');
      break;
    case 'register-books':
      console.log('[cli] register-books: stub — books currently loaded from provincial YAML at run time');
      break;
    case 'run': {
      if (!args.stage || !args.province) { console.error('usage: run --stage <s> --province <p>'); process.exit(1); }
      const opts = {};
      if (args.book) opts.bookId = args.book;
      await runStage(args.stage, args.province, opts);
      break;
    }
    case 'run-all':
      if (!args.province) { console.error('usage: run-all --province <p>'); process.exit(1); }
      await runAll(args.province, { bookId: args.book });
      break;
    case 'status':
      console.log('[cli] status: TODO — query pipeline_runs table');
      break;
    default:
      console.log('Commands: migrate | register-books | run | run-all | status');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
