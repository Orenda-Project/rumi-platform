/**
 * Reprocess JSON Error Sessions Script
 *
 * Re-processes the 5 sessions that had JSON parsing errors using the new
 * OpenAI Structured Outputs API with semantic chunking.
 *
 * Sessions to fix (from Enhanced Transcript V2 Plan - Track 2):
 * 1. cfaee385-86a9-4d99-9189-648a945df0bb - 287,867 chars (VERY LONG)
 * 2. 8fe7a1f2-8e8a-4c10-a991-77b654d6c6bd - 119,681 chars (LONG)
 * 3. 8b46a650-6586-43c6-8fe6-a226c3d54412 - 35,297 chars
 * 4. fd3b8246-919a-4b05-a1f3-6ad74c783a59 - 26,185 chars
 * 5. 283bf8da-9b5d-4752-936b-c4b41f2c3f6a - 21,830 chars
 *
 * Usage:
 *   node scripts/reprocess-json-error-sessions.js              # Process all 5 sessions
 *   node scripts/reprocess-json-error-sessions.js cfaee385     # Process one session (test)
 */

require('dotenv').config();
const supabase = require('../config/supabase');
const { processTranscriptWithFallback } = require('../services/transcript-processor.service');

// Sessions with JSON parsing errors
const ERROR_SESSIONS = [
  { id: 'cfaee385-86a9-4d99-9189-648a945df0bb', charCount: 287867, description: 'VERY LONG' },
  { id: '8fe7a1f2-8e8a-4c10-a991-77b654d6c6bd', charCount: 119681, description: 'LONG' },
  { id: '8b46a650-6586-43c6-8fe6-a226c3d54412', charCount: 35297, description: 'MEDIUM' },
  { id: 'fd3b8246-919a-4b05-a1f3-6ad74c783a59', charCount: 26185, description: 'MEDIUM' },
  { id: '283bf8da-9b5d-4752-936b-c4b41f2c3f6a', charCount: 21830, description: 'MEDIUM' }
];

/**
 * Reprocess a single session with the new Structured Outputs approach
 */
async function reprocessSession(sessionId) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔄 Processing session: ${sessionId}`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    // 1. Fetch the session
    const { data: session, error: fetchError } = await supabase
      .from('coaching_sessions')
      .select(`
        id,
        transcript_text,
        audio_duration_seconds,
        created_at,
        user_id
      `)
      .eq('id', sessionId)
      .single();

    if (fetchError || !session) {
      console.error('❌ Session not found or error:', fetchError?.message || 'No data');
      return { success: false, sessionId, error: fetchError?.message || 'Session not found' };
    }

    // Fetch user info
    let teacherName = 'Unknown';
    let schoolName = 'Unknown';

    if (session.user_id) {
      const { data: user } = await supabase
        .from('users')
        .select('first_name, school_id')
        .eq('id', session.user_id)
        .single();

      if (user) {
        teacherName = user.first_name || 'Unknown';

        if (user.school_id) {
          const { data: school } = await supabase
            .from('schools')
            .select('name')
            .eq('id', user.school_id)
            .single();

          if (school) {
            schoolName = school.name || 'Unknown';
          }
        }
      }
    }

    if (!session.transcript_text) {
      console.error('❌ No transcript text available for this session');
      return { success: false, sessionId, error: 'No transcript text' };
    }

    const transcriptLength = session.transcript_text.length;
    const lineCount = (session.transcript_text.match(/^\[\d{2}:\d{2}\]/gm) || []).length;

    console.log(`📋 Session info:`);
    console.log(`   - ID: ${sessionId}`);
    console.log(`   - Teacher: ${teacherName}`);
    console.log(`   - School: ${schoolName}`);
    console.log(`   - Duration: ${Math.round(session.audio_duration_seconds / 60)} minutes`);
    console.log(`   - Transcript length: ${transcriptLength.toLocaleString()} chars`);
    console.log(`   - Transcript lines: ${lineCount}`);

    // 2. Clear existing processed data
    console.log(`\n🗑️  Clearing existing processed transcript...`);

    const { data: currentData, error: getCurrentError } = await supabase
      .from('coaching_sessions')
      .select('analysis_data')
      .eq('id', sessionId)
      .single();

    if (getCurrentError) {
      console.error('❌ Error fetching current data:', getCurrentError.message);
      return { success: false, sessionId, error: getCurrentError.message };
    }

    let analysisData = currentData.analysis_data || {};
    delete analysisData.processed_transcript;

    const { error: clearError } = await supabase
      .from('coaching_sessions')
      .update({ analysis_data: analysisData })
      .eq('id', sessionId);

    if (clearError) {
      console.error('❌ Error clearing data:', clearError.message);
      return { success: false, sessionId, error: clearError.message };
    }
    console.log(`   ✅ Cleared`);

    // 3. Process transcript with new Structured Outputs + chunking + fallback
    console.log(`\n⚙️  Processing with Structured Outputs (chunking enabled)...`);
    const startTime = Date.now();

    const processedData = await processTranscriptWithFallback(session.transcript_text, {
      teacherName: teacherName,
      schoolName: schoolName,
      duration: session.audio_duration_seconds ? `${Math.round(session.audio_duration_seconds / 60)} minutes` : 'Unknown'
    });

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`   ✅ Processing completed in ${duration}s`);

    // 4. Analyze results
    if (processedData && processedData.sections) {
      console.log(`\n📊 Results:`);
      console.log(`   - Summary: ${processedData.summary?.substring(0, 80)}...`);
      console.log(`   - Sections: ${processedData.sections.length}`);

      let totalLines = 0;
      processedData.sections.forEach((section, i) => {
        const lineCount = section.lines ? section.lines.length : 0;
        totalLines += lineCount;
      });

      console.log(`   - Total lines: ${totalLines}`);

      if (processedData.slo_mastery && processedData.slo_mastery.objectives) {
        console.log(`   - SLO objectives: ${processedData.slo_mastery.objectives.length}`);
        console.log(`   - Inferred topic: ${processedData.slo_mastery.inferred_topic}`);
      }

      if (processedData.classroom_climate) {
        const praise = processedData.classroom_climate.emotional_support?.praise_count || 0;
        const named = processedData.classroom_climate.emotional_support?.named_praise_count || 0;
        console.log(`   - Classroom climate: ✅ (Praise: ${praise}, Named: ${named})`);
      }
    }

    // 5. Save to database
    console.log(`\n💾 Saving to database...`);
    analysisData.processed_transcript = processedData;

    const { error: saveError } = await supabase
      .from('coaching_sessions')
      .update({ analysis_data: analysisData })
      .eq('id', sessionId);

    if (saveError) {
      console.error('❌ Error saving data:', saveError.message);
      return { success: false, sessionId, error: saveError.message };
    }
    console.log(`   ✅ Saved`);

    console.log(`\n✅ Session ${sessionId.substring(0, 8)} reprocessed successfully!`);
    return { success: true, sessionId, duration };

  } catch (error) {
    console.error(`\n❌ Error processing session ${sessionId}:`, error.message);
    console.error(error.stack);
    return { success: false, sessionId, error: error.message };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔧 JSON Error Sessions Reprocessing Tool`);
  console.log(`   Using OpenAI Structured Outputs + Semantic Chunking`);
  console.log(`${'='.repeat(80)}\n`);

  if (!supabase) {
    console.error('❌ Supabase client not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  // Check if specific session ID provided
  const singleSessionArg = process.argv[2];
  let sessionsToProcess = ERROR_SESSIONS;

  if (singleSessionArg) {
    // Find matching session (allow partial ID match)
    const matched = ERROR_SESSIONS.find(s => s.id.startsWith(singleSessionArg));
    if (!matched) {
      console.error(`❌ Session ID not found in error list. Valid sessions:`);
      ERROR_SESSIONS.forEach(s => {
        console.log(`   - ${s.id.substring(0, 8)} (${s.charCount.toLocaleString()} chars - ${s.description})`);
      });
      process.exit(1);
    }
    sessionsToProcess = [matched];
    console.log(`🎯 Processing single session: ${matched.id.substring(0, 8)} (${matched.description})\n`);
  } else {
    console.log(`📋 Sessions to process: ${ERROR_SESSIONS.length}`);
    ERROR_SESSIONS.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.id.substring(0, 8)} - ${s.charCount.toLocaleString()} chars (${s.description})`);
    });
    console.log();
  }

  // Process sessions
  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < sessionsToProcess.length; i++) {
    const session = sessionsToProcess[i];
    const result = await reprocessSession(session.id);
    results.push(result);

    // Add delay between sessions to avoid rate limits
    if (i < sessionsToProcess.length - 1) {
      console.log(`\n⏳ Waiting 2 seconds before next session...\n`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Summary
  const totalDuration = Math.round((Date.now() - startTime) / 1000);
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 FINAL SUMMARY`);
  console.log(`${'='.repeat(80)}\n`);
  console.log(`Total sessions: ${results.length}`);
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total time: ${totalDuration}s (avg ${Math.round(totalDuration / results.length)}s per session)\n`);

  if (failed > 0) {
    console.log(`Failed sessions:`);
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.sessionId.substring(0, 8)}: ${r.error}`);
    });
    console.log();
  }

  if (successful > 0) {
    console.log(`✅ Reprocessing complete! View sessions at:`);
    results.filter(r => r.success).forEach(r => {
      console.log(`   http://localhost:4000/observability/session/${r.sessionId}/transcript`);
    });
    console.log();
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
