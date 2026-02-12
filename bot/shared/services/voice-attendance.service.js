/**
 * Voice Attendance Service
 * Processes voice messages for attendance marking using Soniox V3 + GPT-4o-mini
 *
 * Created: January 24, 2026
 * Bead: bd-061
 *
 * Flow:
 * 1. Teacher records voice message naming absent students
 *    e.g., "Ahmed, Fatima, and Usman are absent today"
 * 2. Soniox V3 transcribes the audio (supports Urdu/English mix)
 * 3. GPT-4o-mini extracts student names and their attendance status
 * 4. Names are matched against the student list
 * 5. Attendance records are generated (unmentioned = present)
 *
 * Supported formats:
 * - "Ahmed absent, Fatima present"
 * - "Ahmad غیر حاضر, فاطمہ حاضر"
 * - "Roll number 5 is absent"
 * - "Everyone is present except Ahmed and Fatima"
 */

const { getClient } = require('./llm-client');
const AudioService = require('./audio.service');
const { logToFile } = require('../utils/logger');
const { OPENAI_API_KEY } = require('../utils/constants');

// Status constants
const STATUS = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  EXCUSED: 'excused'
};

// Urdu/English keywords for present/absent detection
const PRESENT_KEYWORDS = {
  urdu: ['موجود', 'حاضر', 'پریزنٹ', 'ہاں', 'جی', 'آیا', 'آئی', 'آگیا', 'آگئی'],
  english: ['present', 'yes', 'here', 'came', 'arrived']
};

const ABSENT_KEYWORDS = {
  urdu: ['غیر حاضر', 'غائب', 'ایبسنٹ', 'نہیں', 'نہیں آیا', 'نہیں آئی', 'چھٹی'],
  english: ['absent', 'no', 'not here', 'missing', 'away', 'leave']
};

class VoiceAttendanceService {
  /**
   * Process voice attendance from audio file
   * @param {string} audioPath - Path to the audio file (WAV/OGG)
   * @param {Array} studentList - Array of student objects with id, student_name, roll_number
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Attendance result with records
   */
  static async processVoiceAttendance(audioPath, studentList, options = {}) {
    const {
      defaultStatus = STATUS.PRESENT,  // Unmentioned students are present by default
      language = null                   // Auto-detect if not specified
    } = options;

    try {
      logToFile('🎙️ Processing voice attendance', {
        audioPath,
        studentCount: studentList.length,
        defaultStatus
      });

      // Step 1: Transcribe audio using Soniox V3
      let transcription;
      try {
        transcription = await AudioService.transcribe(audioPath, false, language);
        logToFile('✅ Transcription complete', {
          text: transcription.text?.substring(0, 200),
          language: transcription.language
        });
      } catch (transcriptionError) {
        logToFile('❌ Transcription failed', { error: transcriptionError.message });
        return {
          success: false,
          error: `Soniox transcription failed: ${transcriptionError.message}`,
          records: []
        };
      }

      // Step 2: Extract attendance using GPT-4o-mini
      let extractedAttendance;
      try {
        extractedAttendance = await this.extractAttendanceWithGPT(
          transcription.text,
          studentList
        );
        logToFile('✅ GPT extraction complete', {
          extractedCount: extractedAttendance.length
        });
      } catch (gptError) {
        logToFile('❌ GPT extraction failed', { error: gptError.message });
        return {
          success: false,
          error: `OpenAI extraction failed: ${gptError.message}`,
          records: []
        };
      }

      // Step 3: Generate attendance records for all students
      const records = this.generateAttendanceRecords(
        studentList,
        extractedAttendance,
        { defaultStatus }
      );

      // Step 4: Calculate summary
      const summary = this.getSummary(records);
      const overallConfidence = this.calculateOverallConfidence(records);

      logToFile('✅ Voice attendance processed', {
        total: summary.total,
        present: summary.present,
        absent: summary.absent,
        confidence: overallConfidence
      });

      return {
        success: true,
        transcript: transcription.text,
        language: transcription.language,
        records,
        summary,
        confidence: overallConfidence
      };

    } catch (error) {
      logToFile('❌ Voice attendance processing failed', {
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        records: []
      };
    }
  }

  /**
   * Extract attendance data from transcript using GPT-4o-mini
   * @param {string} transcript - The transcribed text
   * @param {Array} studentList - Array of student objects
   * @returns {Promise<Array>} Extracted attendance data
   */
  static async extractAttendanceWithGPT(transcript, studentList) {
    const openai = getClient();

    const prompt = this.buildGPTPrompt(transcript, studentList);

    logToFile('🤖 Calling GPT for attendance extraction', {
      transcriptLength: transcript.length,
      studentCount: studentList.length
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an attendance extraction assistant for Pakistani schools.
Extract student names and their attendance status from the teacher's voice transcript.
The teacher may speak in Urdu, English, or a mix (code-switching).

IMPORTANT RULES:
1. Match names to the provided student list (fuzzy matching allowed)
2. Detect Urdu keywords: موجود/حاضر (present), غیر حاضر/غائب (absent)
3. Detect English keywords: present, absent, here, missing
4. If teacher says "X, Y, Z are absent", mark those as absent
5. If teacher says "everyone except X is present", mark X as absent
6. Use roll numbers if mentioned (e.g., "roll number 5 absent")
7. Return ONLY mentioned students - don't assume status for unmentioned ones

Return JSON array: [{"name": "...", "status": "present|absent", "confidence": 0.0-1.0}]`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,  // Low temperature for consistent extraction
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;

    try {
      const parsed = JSON.parse(content);
      return parsed.attendance || [];
    } catch (parseError) {
      logToFile('⚠️ GPT response parsing failed', {
        content,
        error: parseError.message
      });
      return [];
    }
  }

  /**
   * Build the GPT prompt with student list context
   * @param {string} transcript - The transcript text
   * @param {Array} studentList - Student list
   * @returns {string} The prompt
   */
  static buildGPTPrompt(transcript, studentList) {
    const studentNames = studentList.map((s, i) =>
      `${i + 1}. ${s.student_name}${s.roll_number ? ` (Roll #${s.roll_number})` : ''}`
    ).join('\n');

    return `TRANSCRIPT:
"${transcript}"

STUDENT LIST:
${studentNames}

ATTENDANCE KEYWORDS:
- Present (Urdu): موجود, حاضر, پریزنٹ, ہاں, جی
- Absent (Urdu): غیر حاضر, غائب, ایبسنٹ, نہیں
- Present (English): present, yes, here
- Absent (English): absent, no, missing, leave

Extract attendance from the transcript. Return JSON:
{"attendance": [{"name": "StudentName", "status": "present|absent", "confidence": 0.0-1.0}]}`;
  }

  /**
   * Match a name from transcript to student list
   * @param {string} name - Name from transcript
   * @param {Array} studentList - Student list
   * @returns {Object|null} Matched student with confidence
   */
  static matchStudentName(name, studentList) {
    if (!name || !studentList || studentList.length === 0) {
      return null;
    }

    const normalizedName = name.toLowerCase().trim();

    // Check for roll number reference
    const rollMatch = normalizedName.match(/roll\s*(?:number|no\.?|#)?\s*(\d+)/i);
    if (rollMatch) {
      const rollNumber = parseInt(rollMatch[1], 10);
      const student = studentList.find(s => s.roll_number === rollNumber);
      if (student) {
        return {
          student_id: student.id,
          student_name: student.student_name,
          confidence: 1.0,
          match_type: 'roll_number'
        };
      }
    }

    // Try exact first name match
    for (const student of studentList) {
      const studentFirstName = student.student_name.split(' ')[0].toLowerCase();
      if (normalizedName === studentFirstName) {
        return {
          student_id: student.id,
          student_name: student.student_name,
          confidence: 0.95,
          match_type: 'first_name_exact'
        };
      }
    }

    // Try partial match
    for (const student of studentList) {
      const studentNameLower = student.student_name.toLowerCase();
      if (studentNameLower.includes(normalizedName) || normalizedName.includes(studentNameLower.split(' ')[0])) {
        return {
          student_id: student.id,
          student_name: student.student_name,
          confidence: 0.85,
          match_type: 'partial'
        };
      }
    }

    // For Urdu names, return with flag for GPT transliteration
    if (/[\u0600-\u06FF]/.test(name)) {
      // This is Urdu script - would need GPT to transliterate
      // For now, return a placeholder that GPT extraction should handle
      return {
        student_id: null,
        student_name: name,
        confidence: 0.5,
        match_type: 'urdu_unmatched',
        needs_transliteration: true
      };
    }

    return null;
  }

  /**
   * Parse attendance keyword to status
   * IMPORTANT: Check absent keywords FIRST because absent phrases often
   * contain present words (e.g., "غیر حاضر" contains "حاضر", "not here" contains "here")
   *
   * @param {string} keyword - The keyword to parse
   * @returns {string|null} 'present', 'absent', or null
   */
  static parseAttendanceKeyword(keyword) {
    if (!keyword) return null;

    const normalizedKeyword = keyword.toLowerCase().trim();

    // Check ABSENT keywords FIRST (they may contain present substrings)
    // e.g., "غیر حاضر" contains "حاضر", "not here" contains "here"

    // Check Urdu absent keywords first
    for (const kw of ABSENT_KEYWORDS.urdu) {
      if (keyword.includes(kw)) {
        return STATUS.ABSENT;
      }
    }

    // Check English absent keywords
    for (const kw of ABSENT_KEYWORDS.english) {
      if (normalizedKeyword === kw || normalizedKeyword.includes(kw)) {
        return STATUS.ABSENT;
      }
    }

    // Now check PRESENT keywords

    // Check Urdu present keywords
    for (const kw of PRESENT_KEYWORDS.urdu) {
      if (keyword.includes(kw)) {
        return STATUS.PRESENT;
      }
    }

    // Check English present keywords
    for (const kw of PRESENT_KEYWORDS.english) {
      if (normalizedKeyword === kw || normalizedKeyword.includes(kw)) {
        return STATUS.PRESENT;
      }
    }

    return null;
  }

  /**
   * Generate attendance records for all students
   * @param {Array} studentList - Full student list
   * @param {Array} extractedAttendance - Extracted attendance from GPT
   * @param {Object} options - Generation options
   * @returns {Array} Attendance records
   */
  static generateAttendanceRecords(studentList, extractedAttendance, options = {}) {
    const { defaultStatus = STATUS.PRESENT } = options;

    // Build a map of extracted names to status
    const extractedMap = new Map();
    for (const item of extractedAttendance) {
      const normalizedName = item.name.toLowerCase().trim();
      extractedMap.set(normalizedName, {
        status: item.status,
        confidence: item.confidence
      });
    }

    // Generate records for all students
    return studentList.map(student => {
      const studentFirstName = student.student_name.split(' ')[0].toLowerCase();
      const studentFullName = student.student_name.toLowerCase();

      // Try to find a match in extracted attendance
      let matched = null;

      // Check first name
      if (extractedMap.has(studentFirstName)) {
        matched = extractedMap.get(studentFirstName);
      }

      // Check full name
      if (!matched && extractedMap.has(studentFullName)) {
        matched = extractedMap.get(studentFullName);
      }

      // Check partial matches
      if (!matched) {
        for (const [name, data] of extractedMap) {
          if (studentFullName.includes(name) || name.includes(studentFirstName)) {
            matched = data;
            break;
          }
        }
      }

      if (matched) {
        return {
          student_id: student.id,
          student_name: student.student_name,
          status: matched.status,
          confidence: matched.confidence,
          detected_response: null,
          was_manually_changed: false
        };
      }

      // Not mentioned - use default status
      return {
        student_id: student.id,
        student_name: student.student_name,
        status: defaultStatus,
        confidence: 1.0,  // High confidence for default
        detected_response: null,
        was_manually_changed: false
      };
    });
  }

  /**
   * Calculate overall confidence from records
   * @param {Array} records - Attendance records
   * @returns {number} Average confidence (0-1)
   */
  static calculateOverallConfidence(records) {
    if (!records || records.length === 0) return 0;

    const sum = records.reduce((acc, r) => acc + (r.confidence || 0), 0);
    return sum / records.length;
  }

  /**
   * Get summary statistics from records
   * @param {Array} records - Attendance records
   * @returns {Object} Summary stats
   */
  static getSummary(records) {
    const total = records.length;
    const present = records.filter(r => r.status === STATUS.PRESENT).length;
    const absent = records.filter(r => r.status === STATUS.ABSENT).length;
    const late = records.filter(r => r.status === STATUS.LATE).length;
    const excused = records.filter(r => r.status === STATUS.EXCUSED).length;

    return {
      total,
      present,
      absent,
      late,
      excused,
      attendancePercentage: total > 0 ? (present / total) * 100 : 0
    };
  }
}

// Export constants
VoiceAttendanceService.STATUS = STATUS;
VoiceAttendanceService.PRESENT_KEYWORDS = PRESENT_KEYWORDS;
VoiceAttendanceService.ABSENT_KEYWORDS = ABSENT_KEYWORDS;

module.exports = VoiceAttendanceService;
