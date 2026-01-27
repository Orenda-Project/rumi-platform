/**
 * Backfill Processed Transcripts
 *
 * Pre-processes transcripts using GPT-4o-mini and stores results in database
 * so that transcript viewing is instant (no loading screen).
 *
 * Usage:
 *   node scripts/backfill-processed-transcripts.js --limit 10           # Process last 10 sessions
 *   node scripts/backfill-processed-transcripts.js --session-id UUID    # Process specific session
 *   node scripts/backfill-processed-transcripts.js --skip-existing      # Skip already processed
 *
 * Created: January 17, 2026
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { processTranscriptWithFallback, fallbackParse } = require('../services/transcript-processor.service');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: 10,
    sessionId: null,
    skipExisting: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--session-id' && args[i + 1]) {
      options.sessionId = args[i + 1];
      i++;
    } else if (args[i] === '--skip-existing') {
      options.skipExisting = true;
    }
  }

  return options;
}

/**
 * Fetch sessions that need transcript processing
 */
async function fetchSessions(options) {
  let query = supabase
    .from('coaching_sessions')
    .select(`
      id,
      transcript_text,
      audio_duration_seconds,
      analysis_data,
      created_at,
      users!inner(first_name, last_name, school_name)
    `)
    .not('transcript_text', 'is', null)
    .order('created_at', { ascending: false });

  if (options.sessionId) {
    query = query.eq('id', options.sessionId);
  } else {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch sessions: ${error.message}`);
  }

  // Filter out already processed if requested
  if (options.skipExisting) {
    return (data || []).filter(session => {
      const analysisData = session.analysis_data || {};
      return !analysisData.processed_transcript;
    });
  }

  return data || [];
}

/**
 * Process a single session
 */
async function processSession(session, index, total) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SESSION ${index + 1}/${total}: ${session.id}`);
  console.log(`Created: ${session.created_at}`);
  console.log(`${'='.repeat(60)}\n`);

  // Check if already processed
  const analysisData = session.analysis_data || {};
  if (analysisData.processed_transcript) {
    console.log('Already has processed_transcript - updating anyway...');
  }

  // Format metadata
  const teacherName = `${session.users.first_name || ''} ${session.users.last_name || ''}`.trim() || 'Unknown';
  const schoolName = session.users.school_name || 'N/A';

  let duration = 'N/A';
  if (session.audio_duration_seconds) {
    const minutes = Math.floor(session.audio_duration_seconds / 60);
    const seconds = session.audio_duration_seconds % 60;
    duration = `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  console.log(`Teacher: ${teacherName}`);
  console.log(`School: ${schoolName}`);
  console.log(`Duration: ${duration}`);
  console.log(`Transcript length: ${session.transcript_text.length} chars`);

  let processedData = null;
  let isFallback = false;
  const startTime = Date.now();

  try {
    console.log('\nRunning GPT-4o-mini processing with chunking and fallback...');
    processedData = await processTranscriptWithFallback(session.transcript_text, {
      teacherName,
      schoolName,
      duration
    });
    console.log(`GPT processing completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.log(`Sections: ${processedData.sections?.length || 0}`);
    const totalLines = processedData.sections?.reduce((acc, s) => acc + (s.lines?.length || 0), 0) || 0;
    console.log(`Total lines: ${totalLines}`);
  } catch (error) {
    console.error(`GPT processing failed: ${error.message}`);
    console.log('Using fallback parser...');
    processedData = fallbackParse(session.transcript_text);
    isFallback = true;
  }

  // Update database
  const updatedAnalysisData = {
    ...analysisData,
    processed_transcript: processedData,
    processed_transcript_fallback: isFallback,
    processed_at: new Date().toISOString()
  };

  const { error: updateError } = await supabase
    .from('coaching_sessions')
    .update({ analysis_data: updatedAnalysisData })
    .eq('id', session.id);

  if (updateError) {
    console.error(`Database update failed: ${updateError.message}`);
    return {
      sessionId: session.id,
      success: false,
      error: updateError.message
    };
  }

  console.log('Database updated successfully');

  return {
    sessionId: session.id,
    success: true,
    duration: (Date.now() - startTime) / 1000,
    isFallback,
    sections: processedData.sections?.length || 0
  };
}

/**
 * Main function
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('BACKFILL PROCESSED TRANSCRIPTS');
  console.log('='.repeat(60));

  const options = parseArgs();

  console.log(`\nOptions:`);
  console.log(`  Limit: ${options.limit}`);
  console.log(`  Session ID: ${options.sessionId || 'All (last N)'}`);
  console.log(`  Skip existing: ${options.skipExisting}`);
  console.log(`\nStarted: ${new Date().toISOString()}`);

  // Verify environment
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('ERROR: Missing OPENAI_API_KEY');
    process.exit(1);
  }

  // Fetch sessions
  console.log('\nFetching sessions...');
  const sessions = await fetchSessions(options);
  console.log(`Found ${sessions.length} session(s) to process`);

  if (sessions.length === 0) {
    console.log('No sessions to process.');
    return;
  }

  // Process each session
  const results = [];
  for (let i = 0; i < sessions.length; i++) {
    const result = await processSession(sessions[i], i, sessions.length);
    results.push(result);

    // Add delay between API calls to avoid rate limits
    if (i < sessions.length - 1) {
      console.log('\nWaiting 2s before next session...\n');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('BACKFILL SUMMARY');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\nSessions processed: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (successful.length > 0) {
    const totalDuration = successful.reduce((sum, r) => sum + (r.duration || 0), 0);
    const fallbackCount = successful.filter(r => r.isFallback).length;

    console.log(`\nTotal processing time: ${totalDuration.toFixed(1)}s`);
    console.log(`Average per session: ${(totalDuration / successful.length).toFixed(1)}s`);
    console.log(`Used fallback parser: ${fallbackCount}/${successful.length}`);
  }

  if (failed.length > 0) {
    console.log(`\nFailed sessions:`);
    failed.forEach(r => {
      console.log(`  - ${r.sessionId}: ${r.error}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('BACKFILL COMPLETE');
  console.log('='.repeat(60) + '\n');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
