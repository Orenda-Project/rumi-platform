/**
 * Attendance Delivery Service
 * Orchestrates Excel generation, R2 upload, database save, and WhatsApp delivery
 *
 * Created: January 24, 2026
 * Bead: bd-063
 * Updated: January 25, 2026 (bd-199: Monthly cumulative register)
 *
 * Flow:
 * 1. Save attendance session and records to database FIRST
 * 2. Fetch ALL sessions for the month (cumulative)
 * 3. Generate MONTHLY register Excel using AttendanceGeneratorService
 * 4. Upload to R2 storage
 * 5. Send document to teacher via WhatsApp
 * 6. Clear conversation state
 */

const path = require('path');
const fs = require('fs');
const AttendanceGeneratorService = require('./attendance-generator.service');
const WhatsAppService = require('./whatsapp.service');
const AttendanceConversationService = require('./attendance-conversation.service');
const { logToFile } = require('../utils/logger');
const { uploadBuffer, getSignedUrl } = require('../storage/r2');
const supabase = require('../config/supabase');
const { TEMP_DIR } = require('../utils/constants');

class AttendanceDeliveryService {
  /**
   * Process and deliver attendance for a completed session
   * Generates a MONTHLY CUMULATIVE register (bd-199)
   *
   * @param {string} userId - User UUID
   * @param {string} phoneNumber - User's WhatsApp phone number
   * @param {Object} sessionData - Session data from conversation state
   * @returns {Promise<Object>} Delivery result
   */
  static async processAndDeliver(userId, phoneNumber, sessionData) {
    const startTime = Date.now();

    try {
      const listId = sessionData.selectedListId;
      const className = sessionData.selectedClass?.class_name || 'Unknown Class';
      const section = sessionData.selectedClass?.section || null;

      logToFile('📊 Starting attendance delivery (monthly cumulative)', {
        userId,
        className,
        section,
        listId,
        recordCount: sessionData.records?.length
      });

      // Extract metadata - use sessionDate if provided, otherwise current date (bd-207)
      const sessionDate = sessionData.sessionDate ? new Date(sessionData.sessionDate) : new Date();
      const metadata = {
        userId,
        className,
        section,
        date: sessionDate,
        sessionType: sessionData.sessionType || 'full_day'
      };

      // Step 1: Save to database FIRST (so it's included in monthly query)
      const dbResult = await this.saveToDatabase(
        userId,
        sessionData,
        null, // Excel URL will be updated after generation
        metadata
      );

      // bd-216: Handle duplicate session gracefully
      if (dbResult.isDuplicate) {
        logToFile('⚠️ Returning duplicate session info to user', {
          existingSessionId: dbResult.existingSession.id,
          listId
        });
        return {
          success: false,
          isDuplicate: true,
          existingSession: dbResult.existingSession,
          summary: dbResult.summary,
          className,
          section,
          sessionType: metadata.sessionType,
          error: 'Attendance already recorded for this session'
        };
      }

      // Step 2: Fetch all attendance data for the month (bd-199)
      const month = sessionDate.getMonth() + 1; // 1-12
      const year = sessionDate.getFullYear();

      logToFile('Fetching monthly attendance data...', { listId, month, year });

      const { students, sessions } = await this.getMonthlyAttendanceData(listId, month, year);

      logToFile('Monthly data retrieved', {
        studentCount: students.length,
        sessionCount: sessions.length
      });

      // Step 3: Generate MONTHLY register Excel buffer (bd-199)
      logToFile('Generating monthly register Excel...', { className, month, year });

      const excelBuffer = await AttendanceGeneratorService.createMonthlyRegisterBufferFromData(
        { className, section },
        month,
        year,
        students,
        sessions
      );

      // Step 4: Generate filename and upload to R2
      const fileName = AttendanceGeneratorService.formatMonthlyFileName(
        className,
        section,
        month,
        year
      );

      const r2Key = `attendance/${userId}/monthly/${year}/${month}/${fileName}`;
      logToFile('Uploading monthly register to R2...', { r2Key });

      const r2Url = await uploadBuffer(
        excelBuffer,
        r2Key,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      logToFile('Monthly register uploaded to R2', { r2Url });

      // Update the session with Excel URL
      if (dbResult.sessionId) {
        await supabase
          .from('attendance_sessions')
          .update({ excel_url: r2Url })
          .eq('id', dbResult.sessionId);
      }

      // Step 5: Send document via WhatsApp
      const caption = this.generateMonthlyCaptionSimple(className, section, month, year, sessionData.summary, sessionDate);

      // Save Excel to temp file for sending
      const tempFilePath = path.join(TEMP_DIR, fileName);
      fs.writeFileSync(tempFilePath, excelBuffer);

      logToFile('Sending monthly register via WhatsApp...', { phoneNumber, fileName });
      const sendResult = await WhatsAppService.sendDocument(
        phoneNumber,
        tempFilePath,
        fileName,
        caption
      );

      // Cleanup temp file
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      // Step 6: Clear conversation state
      await AttendanceConversationService.clearSessionState(userId);

      const elapsedMs = Date.now() - startTime;

      logToFile('✅ Monthly attendance delivery complete', {
        userId,
        elapsedMs,
        fileName,
        sessionId: dbResult.sessionId,
        sessionCount: sessions.length,
        sent: sendResult
      });

      return {
        success: true,
        sessionId: dbResult.sessionId,
        excelUrl: r2Url,
        fileName,
        caption,
        elapsedMs
      };

    } catch (error) {
      logToFile('❌ Attendance delivery failed', {
        userId,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get all attendance data for a class in a given month (bd-199)
   *
   * @param {string} listId - Student list ID
   * @param {number} month - Month (1-12)
   * @param {number} year - Year
   * @returns {Promise<{students: Array, sessions: Array}>}
   */
  static async getMonthlyAttendanceData(listId, month, year) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    logToFile('📊 Querying monthly attendance data', {
      listId,
      month,
      year,
      startDate,
      endDate
    });

    // Get all students in the class
    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select('id, roll_number, student_name, father_name')
      .eq('list_id', listId)
      .eq('is_active', true)
      .order('roll_number');

    if (studentsError) {
      logToFile('Error fetching students for monthly register', { error: studentsError.message });
    } else {
      logToFile('📊 Students fetched', {
        count: students?.length,
        studentIds: students?.slice(0, 5).map(s => ({ id: s.id, name: s.student_name }))
      });
    }

    // Get all attendance sessions for the month with records
    const { data: sessions, error: sessionsError } = await supabase
      .from('attendance_sessions')
      .select(`
        id,
        session_date,
        session_type,
        attendance_records (
          student_id,
          status
        )
      `)
      .eq('list_id', listId)
      .gte('session_date', startDate)
      .lte('session_date', endDate)
      .order('session_date');

    if (sessionsError) {
      logToFile('Error fetching sessions for monthly register', { error: sessionsError.message });
    } else {
      logToFile('📊 Sessions fetched', {
        count: sessions?.length,
        sessions: sessions?.map(s => ({
          date: s.session_date,
          recordCount: s.attendance_records?.length
        }))
      });
    }

    return {
      students: students || [],
      sessions: sessions || []
    };
  }

  /**
   * Generate simple caption for monthly register WhatsApp message
   * @param {string} className - Class name
   * @param {string|null} section - Section
   * @param {number} month - Month (1-12)
   * @param {number} year - Year
   * @param {Object} todaySummary - Today's attendance summary
   * @param {Date} sessionDate - The specific date attendance was marked (bd-207)
   */
  static generateMonthlyCaptionSimple(className, section, month, year, todaySummary, sessionDate) {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const displayName = section ? `${className} - ${section}` : className;

    // Format the specific date (bd-207)
    const date = sessionDate || new Date();
    const day = date.getDate();
    const dateDisplay = `${monthNames[date.getMonth()]} ${day}, ${date.getFullYear()}`;

    const lines = [
      `📋 *Monthly Attendance Register*`,
      `📚 ${displayName}`,
      `📅 ${dateDisplay}`,
      '',
      `Today's attendance:`,
      `✅ Present: ${todaySummary?.present || 0}`,
      `❌ Absent: ${todaySummary?.absent || 0}`,
      '',
      'Your cumulative register is ready!'
    ];

    return lines.join('\n');
  }

  /**
   * Check if attendance already exists for this class/date/session (bd-216)
   */
  static async checkExistingSession(listId, sessionDate, sessionType) {
    try {
      const sessionDateStr = sessionDate instanceof Date
        ? sessionDate.toISOString().split('T')[0]
        : sessionDate;

      const { data, error } = await supabase
        .from('attendance_sessions')
        .select('id, present_count, absent_count, total_students, excel_url, created_at')
        .eq('list_id', listId)
        .eq('session_date', sessionDateStr)
        .eq('session_type', sessionType)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        logToFile('⚠️ Error checking existing session', { error: error.message });
        return null;
      }

      return data; // null if not exists, session object if exists
    } catch (error) {
      logToFile('⚠️ Exception checking existing session', { error: error.message });
      return null;
    }
  }

  /**
   * Save attendance session and records to database
   */
  static async saveToDatabase(userId, sessionData, excelUrl, metadata) {
    try {
      const listId = sessionData.selectedListId;
      const records = sessionData.records;

      // Calculate summary
      const totalStudents = records.length;
      const presentCount = records.filter(r => r.status === 'present').length;
      const absentCount = records.filter(r => r.status === 'absent').length;

      // Create attendance session
      // Use metadata.date for session_date (bd-207)
      const sessionDateStr = metadata.date instanceof Date
        ? metadata.date.toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      // bd-216: Check for duplicate session BEFORE insert
      const existingSession = await this.checkExistingSession(
        listId,
        sessionDateStr,
        metadata.sessionType || 'full_day'
      );

      if (existingSession) {
        logToFile('⚠️ Duplicate attendance session detected', {
          existingSessionId: existingSession.id,
          listId,
          sessionDate: sessionDateStr,
          sessionType: metadata.sessionType
        });
        return {
          sessionId: null,
          isDuplicate: true,
          existingSession: existingSession,
          summary: {
            total: existingSession.total_students,
            present: existingSession.present_count,
            absent: existingSession.absent_count,
            attendanceRate: existingSession.total_students > 0
              ? `${Math.round((existingSession.present_count / existingSession.total_students) * 100)}%`
              : '0%'
          }
        };
      }

      logToFile('📊 Saving attendance session', {
        userId,
        listId,
        sessionDate: sessionDateStr,
        recordCount: records?.length,
        records: records?.slice(0, 3) // Log first 3 for debugging
      });

      const { data: session, error: sessionError } = await supabase
        .from('attendance_sessions')
        .insert({
          user_id: userId,
          list_id: listId,
          session_date: sessionDateStr,
          session_type: metadata.sessionType || 'full_day',
          marking_method: sessionData.markingMethod || 'voice',
          transcript: sessionData.transcript || null,
          excel_url: excelUrl,
          total_students: totalStudents,
          present_count: presentCount,
          absent_count: absentCount
        })
        .select('id')
        .single();

      if (sessionError) {
        // bd-209: Fail loudly instead of silently continuing with empty Excel
        logToFile('❌ Database session insert failed - aborting', {
          error: sessionError.message,
          listId,
          userId,
          hint: 'This may be caused by an invalid list_id (class was deleted)'
        });
        throw new Error(`Failed to save attendance session: ${sessionError.message}`);
      }

      const sessionId = session.id;

      // Insert attendance records
      const recordInserts = records.map(r => ({
        session_id: sessionId,
        student_id: r.studentId,
        student_name: r.studentName,
        status: r.status,
        confidence: r.confidence || 1.0,
        detected_response: r.detectedResponse || null
      }));

      logToFile('📊 Inserting attendance records', {
        sessionId,
        recordCount: recordInserts.length,
        sampleRecords: recordInserts.slice(0, 3) // Log first 3 for debugging (bd-208)
      });

      const { data: insertedRecords, error: recordsError } = await supabase
        .from('attendance_records')
        .insert(recordInserts)
        .select('id, student_id, status');

      if (recordsError) {
        logToFile('⚠️ Database records insert failed', {
          error: recordsError.message,
          hint: recordsError.hint,
          details: recordsError.details
        });
      } else {
        logToFile('✅ Attendance records inserted', {
          insertedCount: insertedRecords?.length
        });
      }

      logToFile('Attendance saved to database', {
        sessionId,
        recordCount: recordInserts.length,
        insertSuccess: !recordsError
      });

      return { sessionId };

    } catch (error) {
      // bd-209: Re-throw to fail loudly instead of continuing with empty Excel
      logToFile('❌ Database save error - aborting', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate caption for WhatsApp document message
   */
  static generateCaption(metadata, summary) {
    const className = metadata.section
      ? `${metadata.className} - ${metadata.section}`
      : metadata.className;

    const dateStr = AttendanceGeneratorService.formatDateForDisplay(metadata.date);

    const lines = [
      `📋 *Attendance - ${className}*`,
      `📅 ${dateStr}`,
      '',
      `✅ Present: ${summary?.present || 0}`,
      `❌ Absent: ${summary?.absent || 0}`,
      `📈 Attendance: ${summary?.attendancePercentage?.toFixed(0) || 0}%`,
      '',
      'Your attendance file is ready!'
    ];

    return lines.join('\n');
  }

  /**
   * Resend an existing attendance Excel
   * Used when user requests re-delivery
   */
  static async resendExcel(sessionId, phoneNumber) {
    try {
      const { data: session, error } = await supabase
        .from('attendance_sessions')
        .select(`
          id,
          excel_url,
          session_date,
          total_students,
          present_count,
          absent_count,
          student_lists(class_name, section)
        `)
        .eq('id', sessionId)
        .single();

      if (error || !session) {
        return { success: false, error: 'Session not found' };
      }

      if (!session.excel_url) {
        return { success: false, error: 'No Excel file found for this session' };
      }

      const metadata = {
        className: session.student_lists?.class_name || 'Unknown',
        section: session.student_lists?.section || null,
        date: session.session_date
      };

      const summary = {
        present: session.present_count,
        absent: session.absent_count,
        total: session.total_students,
        attendancePercentage: session.total_students > 0
          ? (session.present_count / session.total_students) * 100
          : 0
      };

      const caption = this.generateCaption(metadata, summary);
      const fileName = AttendanceGeneratorService.formatFileName(
        metadata.className,
        metadata.section,
        metadata.date
      );

      const result = await WhatsAppService.sendDocumentFromUrl(
        phoneNumber,
        session.excel_url,
        fileName,
        caption
      );

      return { success: result, sessionId };

    } catch (error) {
      logToFile('Resend Excel failed', { sessionId, error: error.message });
      return { success: false, error: error.message };
    }
  }
}

module.exports = AttendanceDeliveryService;
