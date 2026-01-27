/**
 * Name Extractor Service
 * GPT-4o-mini powered extraction of student names and attendance status from transcripts
 *
 * Created: January 24, 2026
 * Bead: bd-052
 */

const { logToFile } = require('../utils/logger');

/**
 * Present/absent status indicators
 */
const STATUS_INDICATORS = {
  present: [
    'present', 'yes', 'here', 'haan', 'ji', 'haazir', 'hazir',
    'موجود', 'حاضر', 'ہاں', 'جی'
  ],
  absent: [
    'absent', 'no', 'not here', 'nahi', 'ghair hazir', 'gairhazir',
    'غیر حاضر', 'نہیں', 'غائب'
  ]
};

class NameExtractorService {
  /**
   * Build extraction prompt for GPT-4o-mini
   *
   * @param {string} transcript - Transcribed roll call audio
   * @param {string[]} knownStudents - Optional list of known student names for biasing
   * @returns {string} Prompt for GPT extraction
   */
  static buildExtractionPrompt(transcript, knownStudents = []) {
    let prompt = `Extract student names and attendance status from this roll call transcript.

For each student mentioned, determine:
1. Student name (as spoken)
2. Status: "present" or "absent" based on their response
3. Their response (what they said)

Present indicators: yes, here, present, haan, ji, haazir, حاضر, موجود
Absent indicators: no, absent, not here, nahi, ghair hazir, غیر حاضر

Return JSON format:
{
  "students": [
    {"name": "Student Name", "status": "present", "response": "yes"},
    {"name": "Another Student", "status": "absent", "response": "absent"}
  ]
}`;

    if (knownStudents && knownStudents.length > 0) {
      prompt += `\n\nKnown students in this class (use for spelling correction):
${knownStudents.join('\n')}`;
    }

    prompt += `\n\nTranscript:
${transcript}

Return only the JSON, no explanation.`;

    return prompt;
  }

  /**
   * Parse GPT response into structured data
   *
   * @param {string} response - Raw GPT response
   * @returns {Array<{name: string, status: string, response?: string}>}
   */
  static parseGPTResponse(response) {
    if (!response) {
      return [];
    }

    try {
      // Handle markdown code block wrapping
      let jsonStr = response;
      const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      }

      const parsed = JSON.parse(jsonStr);

      if (parsed.students && Array.isArray(parsed.students)) {
        return parsed.students.map(s => ({
          name: s.name || '',
          status: this.normalizeStatus(s.status),
          response: s.response || ''
        }));
      }

      return [];
    } catch (error) {
      logToFile('Failed to parse GPT response', { error: error.message, response: response.substring(0, 200) });
      return [];
    }
  }

  /**
   * Normalize status string to present/absent/unknown
   *
   * @param {string} status - Raw status string
   * @returns {'present' | 'absent' | 'unknown'}
   */
  static normalizeStatus(status) {
    if (!status || typeof status !== 'string') {
      return 'unknown';
    }

    // Normalize: lowercase, trim, and collapse multiple spaces
    const lower = status.toLowerCase().trim().replace(/\s+/g, ' ');
    const lowerNoSpace = lower.replace(/\s/g, '');

    // Check ABSENT indicators FIRST (more specific - "ghair hazir" contains "hazir")
    for (const indicator of STATUS_INDICATORS.absent) {
      const normalizedIndicator = indicator.toLowerCase().replace(/\s+/g, ' ');
      if (lower.includes(normalizedIndicator) || lowerNoSpace.includes(normalizedIndicator.replace(/\s/g, ''))) {
        return 'absent';
      }
    }

    // Check present indicators
    for (const indicator of STATUS_INDICATORS.present) {
      const normalizedIndicator = indicator.toLowerCase().replace(/\s+/g, ' ');
      if (lower.includes(normalizedIndicator) || lowerNoSpace.includes(normalizedIndicator.replace(/\s/g, ''))) {
        return 'present';
      }
    }

    return 'unknown';
  }

  /**
   * Match extracted names to known student records
   *
   * @param {Array<{name: string, status: string}>} extracted - GPT extracted names
   * @param {Array<{id: string, student_name: string, father_name?: string, roll_number: number}>} knownStudents
   * @returns {Array<{studentId: string|null, name: string, matchedName: string, status: string, confidence: number}>}
   */
  static matchToKnownStudents(extracted, knownStudents) {
    if (!knownStudents || knownStudents.length === 0) {
      // First-time user - no known students to match
      return extracted.map(e => ({
        studentId: null,
        name: e.name,
        matchedName: e.name,
        status: e.status,
        response: e.response || '',
        confidence: 0.5 // Unknown confidence for first-time
      }));
    }

    return extracted.map(ext => {
      let bestMatch = null;
      let bestScore = 0;

      for (const student of knownStudents) {
        // Try matching against student_name
        const nameScore = this.calculateSimilarity(ext.name, student.student_name);

        // Try matching against full name (student + father)
        let fullNameScore = 0;
        if (student.father_name) {
          const fullName = `${student.student_name} ${student.father_name}`;
          fullNameScore = this.calculateSimilarity(ext.name, fullName);
        }

        const score = Math.max(nameScore, fullNameScore);

        if (score > bestScore && score > 0.4) {
          bestScore = score;
          bestMatch = student;
        }
      }

      return {
        studentId: bestMatch ? bestMatch.id : null,
        name: ext.name,
        matchedName: bestMatch ? bestMatch.student_name : ext.name,
        status: ext.status,
        response: ext.response || '',
        confidence: bestMatch ? bestScore : 0.3
      };
    });
  }

  /**
   * Calculate string similarity (Sørensen-Dice coefficient with enhancements)
   *
   * @param {string} s1 - First string
   * @param {string} s2 - Second string
   * @returns {number} Similarity score 0-1
   */
  static calculateSimilarity(s1, s2) {
    if (!s1 || !s2) return 0;

    const str1 = s1.toLowerCase().trim();
    const str2 = s2.toLowerCase().trim();

    if (str1 === str2) return 1;

    // Check if one is substring of other (common for short names)
    if (str2.includes(str1)) {
      return 0.7 + (str1.length / str2.length) * 0.3;
    }
    if (str1.includes(str2)) {
      return 0.7 + (str2.length / str1.length) * 0.3;
    }

    // Sørensen-Dice coefficient using bigrams
    const getBigrams = (str) => {
      const bigrams = new Set();
      for (let i = 0; i < str.length - 1; i++) {
        bigrams.add(str.substring(i, i + 2));
      }
      return bigrams;
    };

    const bigrams1 = getBigrams(str1);
    const bigrams2 = getBigrams(str2);

    if (bigrams1.size === 0 || bigrams2.size === 0) return 0;

    let intersection = 0;
    for (const bigram of bigrams1) {
      if (bigrams2.has(bigram)) {
        intersection++;
      }
    }

    return (2 * intersection) / (bigrams1.size + bigrams2.size);
  }

  /**
   * Mark students not mentioned in extraction as absent
   *
   * @param {Array} extraction - Matched extraction results
   * @param {Array} allStudents - All students in the class
   * @returns {Array} Complete attendance list
   */
  static markMissingAsAbsent(extraction, allStudents) {
    const mentionedIds = new Set(extraction.filter(e => e.studentId).map(e => e.studentId));
    const result = [...extraction];

    for (const student of allStudents) {
      if (!mentionedIds.has(student.id)) {
        result.push({
          studentId: student.id,
          name: student.student_name,
          matchedName: student.student_name,
          status: 'absent',
          response: '',
          confidence: 1.0,
          autoMarked: true
        });
      }
    }

    return result;
  }

  /**
   * Generate attendance summary statistics
   *
   * @param {Array<{status: string}>} records - Attendance records
   * @returns {Object} Summary with counts and percentages
   */
  static generateAttendanceSummary(records) {
    if (!records || records.length === 0) {
      return {
        total: 0,
        present: 0,
        absent: 0,
        unknown: 0,
        presentPercentage: 0,
        absentPercentage: 0
      };
    }

    const total = records.length;
    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const unknown = records.filter(r => r.status === 'unknown').length;

    return {
      total,
      present,
      absent,
      unknown,
      presentPercentage: Math.round((present / total) * 100),
      absentPercentage: Math.round((absent / total) * 100)
    };
  }

  /**
   * Extract attendance from transcript (full pipeline - requires OpenAI client)
   *
   * @param {Object} openai - OpenAI client
   * @param {string} transcript - Roll call transcript
   * @param {Array} knownStudents - Known students for matching
   * @returns {Promise<{records: Array, summary: Object}>}
   */
  static async extractAttendance(openai, transcript, knownStudents = []) {
    try {
      // Build known student names for biasing
      const knownNames = knownStudents.map(s => {
        if (s.father_name) {
          return `${s.student_name} (${s.father_name})`;
        }
        return s.student_name;
      });

      // Build prompt
      const prompt = this.buildExtractionPrompt(transcript, knownNames);

      // Call GPT-4o-mini
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an attendance extraction assistant. Extract student names and their attendance status from roll call transcripts.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 2000
      });

      const gptResponse = response.choices[0]?.message?.content || '';

      // Parse response
      const extracted = this.parseGPTResponse(gptResponse);

      // Match to known students
      const matched = this.matchToKnownStudents(extracted, knownStudents);

      // Mark missing students as absent (if we have a known list)
      const complete = knownStudents.length > 0
        ? this.markMissingAsAbsent(matched, knownStudents)
        : matched;

      // Generate summary
      const summary = this.generateAttendanceSummary(complete);

      logToFile('Attendance extracted', {
        transcript: transcript.substring(0, 100),
        extracted: extracted.length,
        matched: matched.length,
        summary
      });

      return { records: complete, summary };
    } catch (error) {
      logToFile('Error extracting attendance', { error: error.message });
      throw error;
    }
  }
}

module.exports = NameExtractorService;
