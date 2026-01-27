/**
 * Reprocess Transcript Script
 * Usage: node scripts/reprocess-transcript.js <sessionId>
 *
 * This script clears the cached processed transcript and triggers reprocessing.
 */

require('dotenv').config();
const supabase = require('../config/supabase');
const { processTranscript } = require('../services/transcript-processor.service');

async function reprocessTranscript(sessionId) {
  console.log(`\n🔄 Reprocessing transcript for session: ${sessionId}\n`);

  if (!supabase) {
    console.error('❌ Supabase client not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

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
      process.exit(1);
    }

    // Fetch user info separately
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
      process.exit(1);
    }

    console.log(`📋 Session info:`);
    console.log(`   - Teacher: ${teacherName}`);
    console.log(`   - School: ${schoolName}`);
    console.log(`   - Duration: ${Math.round(session.audio_duration_seconds / 60)} minutes`);
    console.log(`   - Transcript lines: ${(session.transcript_text.match(/^\[\d{2}:\d{2}\]/gm) || []).length}`);

    // 2. Clear existing processed data (set processed_transcript to null)
    console.log(`\n🗑️  Clearing existing processed transcript...`);

    // Get current analysis_data first
    const { data: currentData, error: getCurrentError } = await supabase
      .from('coaching_sessions')
      .select('analysis_data')
      .eq('id', sessionId)
      .single();

    if (getCurrentError) {
      console.error('❌ Error fetching current data:', getCurrentError.message);
      process.exit(1);
    }

    let analysisData = currentData.analysis_data || {};
    delete analysisData.processed_transcript;

    const { error: clearError } = await supabase
      .from('coaching_sessions')
      .update({ analysis_data: analysisData })
      .eq('id', sessionId);

    if (clearError) {
      console.error('❌ Error clearing data:', clearError.message);
      process.exit(1);
    }
    console.log(`   ✅ Cleared`);

    // 3. Process transcript with new prompt
    console.log(`\n⚙️  Processing transcript with GPT-4o-mini...`);
    const startTime = Date.now();

    const processedData = await processTranscript(session.transcript_text, {
      teacherName: teacherName,
      schoolName: schoolName,
      duration: session.audio_duration_seconds ? `${Math.round(session.audio_duration_seconds / 60)} minutes` : 'Unknown'
    });

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`   ✅ Processing completed in ${duration}s`);

    // 4. Analyze results
    if (processedData && processedData.sections) {
      console.log(`\n📊 Results:`);
      console.log(`   - Sections: ${processedData.sections.length}`);

      let totalLines = 0;
      processedData.sections.forEach((section, i) => {
        const lineCount = section.lines ? section.lines.length : 0;
        totalLines += lineCount;
        const percentage = totalLines > 0 ? Math.round((lineCount / totalLines) * 100) : 0;
        console.log(`   - Section ${i + 1}: "${section.title}" (${lineCount} lines)`);
      });

      console.log(`   - Total lines: ${totalLines}`);

      if (processedData.slo_mastery && processedData.slo_mastery.objectives) {
        console.log(`   - SLO objectives: ${processedData.slo_mastery.objectives.length}`);
      }

      if (processedData.classroom_climate) {
        console.log(`   - Classroom climate: ✅ detected`);
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
      process.exit(1);
    }
    console.log(`   ✅ Saved`);

    console.log(`\n✅ Reprocessing complete!`);
    console.log(`   View at: http://localhost:4000/observability/session/${sessionId}/transcript\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Get session ID from command line
const sessionId = process.argv[2];

if (!sessionId) {
  console.error('Usage: node scripts/reprocess-transcript.js <sessionId>');
  process.exit(1);
}

reprocessTranscript(sessionId);
