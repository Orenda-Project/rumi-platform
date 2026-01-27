/**
 * Generate Excel Sheet for Coaching Sessions
 * For Mariam - grouped by teacher with all observation data
 *
 * Usage: node scripts/generate-coaching-excel.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');
const path = require('path');
const { getPresignedUrl } = require('../shared/storage/r2');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function generateCoachingExcel() {
  console.log('📊 Generating Coaching Sessions Excel...\n');

  // Query all completed coaching sessions with user data
  const { data: sessions, error } = await supabase
    .from('coaching_sessions')
    .select(`
      id,
      user_id,
      created_at,
      audio_url,
      audio_duration_seconds,
      transcript_text,
      lesson_plan_url,
      lesson_plan_text,
      voice_debrief_url,
      report_pdf_url,
      analysis_data,
      conversation_state,
      status
    `)
    .eq('status', 'completed')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching sessions:', error);
    return;
  }

  console.log(`✅ Found ${sessions.length} completed coaching sessions\n`);

  // Get unique user IDs and fetch user data
  const userIds = [...new Set(sessions.map(s => s.user_id).filter(Boolean))];
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, first_name, last_name, phone_number, school_name')
    .in('id', userIds);

  if (userError) {
    console.error('❌ Error fetching users:', userError);
    return;
  }

  // Create user lookup map
  const userMap = {};
  users.forEach(u => {
    userMap[u.id] = u;
  });

  // Process sessions and generate signed URLs
  console.log('🔗 Generating signed URLs for files...');
  const processedSessions = [];

  for (const session of sessions) {
    const user = userMap[session.user_id] || {};
    const teacherName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown';

    // Extract subject and topic from analysis_data
    let subject = '';
    let topic = '';
    let grade = '';

    if (session.analysis_data) {
      subject = session.analysis_data.subject || '';
      topic = session.analysis_data.topic || '';
      grade = session.analysis_data.grade || '';
    }

    // Extract reflective questions from conversation_state
    let reflectiveQuestions = '';
    if (session.conversation_state?.questions) {
      reflectiveQuestions = session.conversation_state.questions
        .map((q, i) => `Q${i + 1}: ${q.question}\nA${i + 1}: ${q.answer || '[No answer]'}`)
        .join('\n\n');
    }

    // Generate signed URLs (valid for 7 days = 604800 seconds)
    let audioUrl = session.audio_url;
    let lessonPlanUrl = session.lesson_plan_url;
    let voiceDebriefUrl = session.voice_debrief_url;
    let reportPdfUrl = session.report_pdf_url;

    try {
      if (audioUrl) audioUrl = await getPresignedUrl(audioUrl, 604800);
      if (lessonPlanUrl) lessonPlanUrl = await getPresignedUrl(lessonPlanUrl, 604800);
      if (voiceDebriefUrl) voiceDebriefUrl = await getPresignedUrl(voiceDebriefUrl, 604800);
      if (reportPdfUrl) reportPdfUrl = await getPresignedUrl(reportPdfUrl, 604800);
    } catch (err) {
      console.warn(`⚠️ Error generating signed URL for session ${session.id}:`, err.message);
    }

    processedSessions.push({
      teacherName,
      schoolName: user.school_name || '',
      phoneNumber: user.phone_number || '',
      subject: subject.replace(/"/g, ''),  // Remove JSON quotes
      topic: topic.replace(/"/g, ''),
      grade: grade.replace(/"/g, ''),
      date: new Date(session.created_at).toLocaleDateString('en-PK'),
      audioDuration: session.audio_duration_seconds
        ? `${Math.floor(session.audio_duration_seconds / 60)}m ${session.audio_duration_seconds % 60}s`
        : '',
      classroomAudioUrl: audioUrl || '',
      rawTranscript: session.transcript_text || '',
      lessonPlanUrl: lessonPlanUrl || '',
      lessonPlanText: session.lesson_plan_text || '',
      voiceDebriefUrl: voiceDebriefUrl || '',
      reportPdfUrl: reportPdfUrl || '',
      reflectiveQuestions,
      sessionId: session.id
    });

    process.stdout.write('.');
  }
  console.log('\n');

  // Sort by teacher name, then by date
  processedSessions.sort((a, b) => {
    const nameCompare = a.teacherName.localeCompare(b.teacherName);
    if (nameCompare !== 0) return nameCompare;
    return new Date(b.date) - new Date(a.date);
  });

  // Create Excel workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Rumi Observability';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Coaching Sessions', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
  });

  // Define columns
  worksheet.columns = [
    { header: 'Teacher Name', key: 'teacherName', width: 20 },
    { header: 'School', key: 'schoolName', width: 25 },
    { header: 'Phone', key: 'phoneNumber', width: 15 },
    { header: 'Subject', key: 'subject', width: 15 },
    { header: 'Topic', key: 'topic', width: 30 },
    { header: 'Grade', key: 'grade', width: 10 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Audio Duration', key: 'audioDuration', width: 12 },
    { header: 'Classroom Audio', key: 'classroomAudioUrl', width: 50 },
    { header: 'Raw Transcript', key: 'rawTranscript', width: 80 },
    { header: 'Lesson Plan URL', key: 'lessonPlanUrl', width: 50 },
    { header: 'Lesson Plan Text', key: 'lessonPlanText', width: 60 },
    { header: 'Voice Debrief', key: 'voiceDebriefUrl', width: 50 },
    { header: 'Report PDF', key: 'reportPdfUrl', width: 50 },
    { header: 'Reflective Q&A', key: 'reflectiveQuestions', width: 80 },
    { header: 'Session ID', key: 'sessionId', width: 40 }
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Add data rows
  let currentTeacher = '';
  let rowColor = 'FFFFFFFF';

  processedSessions.forEach((session, index) => {
    // Alternate colors by teacher for visual grouping
    if (session.teacherName !== currentTeacher) {
      currentTeacher = session.teacherName;
      rowColor = rowColor === 'FFFFFFFF' ? 'FFE2EFDA' : 'FFFFFFFF';
    }

    const row = worksheet.addRow(session);
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: rowColor }
    };
    row.alignment = { vertical: 'top', wrapText: true };

    // Make URLs clickable
    if (session.classroomAudioUrl) {
      row.getCell('classroomAudioUrl').value = {
        text: 'Download Audio',
        hyperlink: session.classroomAudioUrl
      };
      row.getCell('classroomAudioUrl').font = { color: { argb: 'FF0563C1' }, underline: true };
    }
    if (session.lessonPlanUrl) {
      row.getCell('lessonPlanUrl').value = {
        text: 'View Lesson Plan',
        hyperlink: session.lessonPlanUrl
      };
      row.getCell('lessonPlanUrl').font = { color: { argb: 'FF0563C1' }, underline: true };
    }
    if (session.voiceDebriefUrl) {
      row.getCell('voiceDebriefUrl').value = {
        text: 'Listen to Debrief',
        hyperlink: session.voiceDebriefUrl
      };
      row.getCell('voiceDebriefUrl').font = { color: { argb: 'FF0563C1' }, underline: true };
    }
    if (session.reportPdfUrl) {
      row.getCell('reportPdfUrl').value = {
        text: 'View Report',
        hyperlink: session.reportPdfUrl
      };
      row.getCell('reportPdfUrl').font = { color: { argb: 'FF0563C1' }, underline: true };
    }
  });

  // Add summary sheet
  const summarySheet = workbook.addWorksheet('Summary');

  // Count observations per teacher
  const teacherCounts = {};
  processedSessions.forEach(s => {
    const key = s.teacherName;
    if (!teacherCounts[key]) {
      teacherCounts[key] = { name: s.teacherName, school: s.schoolName, count: 0, subjects: new Set() };
    }
    teacherCounts[key].count++;
    if (s.subject) teacherCounts[key].subjects.add(s.subject);
  });

  summarySheet.columns = [
    { header: 'Teacher Name', key: 'name', width: 25 },
    { header: 'School', key: 'school', width: 30 },
    { header: 'Observation Count', key: 'count', width: 18 },
    { header: 'Subjects Observed', key: 'subjects', width: 40 }
  ];

  summarySheet.getRow(1).font = { bold: true };

  Object.values(teacherCounts)
    .sort((a, b) => b.count - a.count)
    .forEach(t => {
      summarySheet.addRow({
        name: t.name,
        school: t.school,
        count: t.count,
        subjects: [...t.subjects].join(', ')
      });
    });

  // Save file
  const filename = `coaching_sessions_${new Date().toISOString().split('T')[0]}.xlsx`;
  const filepath = path.join(__dirname, '..', filename);

  await workbook.xlsx.writeFile(filepath);

  console.log(`\n✅ Excel file generated successfully!`);
  console.log(`📁 File: ${filepath}`);
  console.log(`📊 Total sessions: ${processedSessions.length}`);
  console.log(`👩‍🏫 Total teachers: ${Object.keys(teacherCounts).length}`);
  console.log(`\n⚠️ Note: Signed URLs are valid for 7 days. Regenerate if needed.`);
}

// Run
generateCoachingExcel().catch(console.error);
