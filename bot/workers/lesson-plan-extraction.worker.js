require('dotenv').config();

const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const OpenAI = require('openai');
const { jsonrepair } = require('jsonrepair');

const supabase = require('../shared/config/supabase');
const { logToFile } = require('../shared/utils/logger');
const { downloadFromR2, uploadLessonPlanBuffer, buildR2PublicUrl } = require('../shared/storage/r2');
const { AWSTextractService } = require('../shared/services/aws-textract.service');
const { OPENAI_API_KEY } = require('../shared/utils/constants');
const WhatsAppService = require('../shared/services/whatsapp.service');

class LessonPlanExtractionWorker {
  static openai = null;

  static getOpenAI() {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    }
    return this.openai;
  }

  static async process(jobData) {
    const { coachingSessionId, r2Key, fileType, userId: jobUserId } = jobData;

    try {
      logToFile('📄 Starting lesson plan extraction', {
        coachingSessionId,
        r2Key,
        fileType
      });

      const { data: sessionRecord, error: sessionError } = await supabase
        .from('coaching_sessions')
        .select('user_id, lesson_plan_url, lesson_plan_r2_key, lesson_plan_format')
        .eq('id', coachingSessionId)
        .single();

      if (sessionError) {
        throw sessionError;
      }

      const sessionUserId = jobUserId || sessionRecord?.user_id;
      const fileBuffer = await downloadFromR2(r2Key);
      const detectedType = this.detectFileType(fileBuffer) || fileType || 'pdf';

      let normalizedKey = r2Key;
      let normalizedUrl = sessionRecord?.lesson_plan_url || null;
      let normalizedFormat = detectedType;
      let normalized = false;

      if (fileType?.toLowerCase() !== detectedType.toLowerCase()) {
        if (!sessionUserId) {
          logToFile('⚠️ Lesson plan format mismatch but user_id unavailable; skipping normalization', {
            coachingSessionId,
            queuedType: fileType,
            detectedType
          });
        } else {
          normalizedKey = await uploadLessonPlanBuffer({
            buffer: fileBuffer,
            userId: sessionUserId,
            sessionId: coachingSessionId,
            fileType: detectedType
          });
          normalizedUrl = buildR2PublicUrl(normalizedKey);
          normalized = true;
          logToFile('🔁 Lesson plan normalized to detected file type', {
            coachingSessionId,
            previousKey: r2Key,
            newKey: normalizedKey,
            detectedType
          });
        }
      }

      const { text: extractedText, parser: parserUsed } = await this.extractText(fileBuffer, detectedType);
      logToFile('Lesson plan text extracted', {
        coachingSessionId,
        detectedType,
        parserUsed,
        textLength: extractedText?.length || 0
      });
      const excerpt = this.createSafeExcerpt(extractedText, 500);
      const wordCount = extractedText ? extractedText.split(/\s+/).filter(Boolean).length : 0;

      let structuredData = null;
      if (extractedText && extractedText.length >= 50) {
        structuredData = await this.parseWithGPT4oMini(extractedText);
        if (structuredData) {
          structuredData.objectives = structuredData.objectives || [];
          structuredData.prior_knowledge = structuredData.prior_knowledge || [];
          structuredData.materials = structuredData.materials || [];
          structuredData.resources_detail = structuredData.resources_detail || [];
          structuredData.assessment_methods = structuredData.assessment_methods || [];
          structuredData.assessment_protocols = structuredData.assessment_protocols || [];
          structuredData.activities = structuredData.activities || [];
          structuredData.annexures = structuredData.annexures || [];
          structuredData.assessment_sequences = structuredData.assessment_sequences || [];
          structuredData.textbook_references = structuredData.textbook_references || [];
          structuredData.planned_questions = structuredData.planned_questions || [];
          structuredData.resource_pages = structuredData.resource_pages || [];
          logToFile('Lesson plan structured data parsed', {
            coachingSessionId,
            objectiveCount: structuredData.objectives.length,
            priorKnowledgeEntries: structuredData.prior_knowledge.length,
            materialsCount: structuredData.materials.length,
            assessmentSequences: structuredData.assessment_sequences.length
          });
        } else {
          logToFile('⚠️ Lesson plan structured data parsing returned null', {
            coachingSessionId,
            textSample: extractedText.substring(0, 200)
          });
        }
      } else {
        logToFile('⚠️ Lesson plan text insufficient for structured parsing', {
          coachingSessionId,
          detectedType,
          textLength: extractedText?.length || 0
        });
      }

      const updatePayload = {
        lesson_plan_excerpt: excerpt,
        lesson_plan_structured: structuredData,
        lesson_plan_word_count: wordCount,
        lesson_plan_extraction_status: 'completed',
        lesson_plan_extraction_error: null,
        lesson_plan_format: normalizedFormat
      };

      if (normalized) {
        updatePayload.lesson_plan_r2_key = normalizedKey;
        updatePayload.lesson_plan_url = normalizedUrl;
      } else if (!sessionRecord?.lesson_plan_r2_key) {
        updatePayload.lesson_plan_r2_key = normalizedKey;
      }

      await supabase
        .from('coaching_sessions')
        .update(updatePayload)
        .eq('id', coachingSessionId);

      logToFile('✅ Lesson plan extraction complete', {
        coachingSessionId,
        parserUsed,
        excerptLength: excerpt?.length || 0,
        wordCount
      });
    } catch (error) {
      const sanitizedError = (error.message || 'Unknown error')
        .replace(/\/[^\/\s]+/g, '[path]')
        .substring(0, 200);

      const isFormatError =
        /unsupported document format/i.test(error.message || '') ||
        /invalid pdf structure/i.test(error.message || '');

      await supabase
        .from('coaching_sessions')
        .update({
          lesson_plan_extraction_status: isFormatError ? 'failed_bad_format' : 'failed',
          lesson_plan_extraction_error: sanitizedError
        })
        .eq('id', coachingSessionId);

      if (isFormatError) {
        await this.notifyFormatIssue(coachingSessionId);
      }

      logToFile('❌ Lesson plan extraction failed', {
        coachingSessionId,
        error: error.message
      });
      throw error;
    }
  }

  static async extractText(buffer, fileType) {
    if (!buffer) {
      return { text: '', parser: 'none' };
    }

    const lowerType = (fileType || '').toLowerCase();

    const textractFallback = async (reason) => {
      logToFile('Lesson plan falling back to Textract', { reason, fileType: lowerType });
      const textractText = await AWSTextractService.extractText(buffer);
      return { text: textractText?.trim() || '', parser: `textract:${reason}` };
    };

    if (lowerType === 'pdf') {
      try {
        const result = await pdf(buffer);
        const text = (result.text || '').trim();
        if (text.length >= 50) {
          logToFile('Lesson plan PDF parsed via pdf-parse', { textLength: text.length });
          return { text, parser: 'pdf-parse' };
        }
        return await textractFallback('pdf_low_text');
      } catch (error) {
        logToFile('Lesson plan PDF parsing failed, falling back to Textract', { error: error.message });
        return await textractFallback('pdf_parse_error');
      }
    }

    if (lowerType === 'docx' || lowerType === 'doc') {
      try {
        const result = await mammoth.extractRawText({ buffer });
        const text = (result.value || '').trim();
        if (text.length >= 50) {
          logToFile('Lesson plan DOC/DOCX parsed via mammoth', { textLength: text.length });
          return { text, parser: 'mammoth' };
        }
        logToFile('Lesson plan DOC/DOCX produced little text, falling back to Textract', { textLength: text.length });
        return await textractFallback('doc_low_text');
      } catch (error) {
        logToFile('DOC extraction failed, falling back to Textract', { error: error.message });
        return await textractFallback('doc_exception');
      }
    }

    if (lowerType === 'png' || lowerType === 'jpg' || lowerType === 'jpeg') {
      return await textractFallback('image');
    }

    // Default to PDF parser with Textract fallback
    try {
      const fallback = await pdf(buffer);
      const text = (fallback.text || '').trim();
      if (text.length >= 50) {
        logToFile('Lesson plan default parser treated as PDF', { textLength: text.length });
        return { text, parser: 'pdf-parse-default' };
      }
      return await textractFallback('default_low_text');
    } catch (error) {
      logToFile('Default PDF parser failed, invoking Textract fallback', { error: error.message });
      return await textractFallback('default_parse_error');
    }
  }

  static createSafeExcerpt(text, maxLength) {
    if (!text) return null;
    if (text.length <= maxLength) return text;

    let end = maxLength;
    const charCode = text.charCodeAt(end - 1);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      end--;
    }

    const lastSpace = text.lastIndexOf(' ', end);
    if (lastSpace > maxLength - 50) {
      end = lastSpace;
    }

    return `${text.substring(0, end)}...`;
  }

  static async parseWithGPT4oMini(rawText) {
    try {
      const client = this.getOpenAI();
      const truncated = this.safeTruncate(rawText, 12000);

      const prompt = `Extract structured lesson plan information from the following text. Return ONLY valid JSON.

LESSON PLAN TEXT:
${truncated}

Return JSON with these fields:
{
  "objectives": [],
  "prior_knowledge": [],
  "materials": [],
  "resources_detail": [
    {
      "name": "",
      "description": "",
      "reference": "Annexure A / Page 4 / etc."
    }
  ],
  "assessment_methods": [],
  "assessment_protocols": [
    {
      "title": "",
      "instructions": "",
      "student_task": "",
      "teacher_moves": [],
      "reference": "Page or Annexure if mentioned"
    }
  ],
  "activities": [
    {
      "title": "",
      "time": "e.g., 5 min",
      "description": "",
      "reference": ""
    }
  ],
  "annexures": [
    {
      "title": "",
      "purpose": "",
      "description": ""
    }
  ],
  "assessment_sequences": [
    {
      "title": "",
      "steps": [],
      "materials": "",
      "expected_responses": "",
      "reference": "Page number / annexure if provided"
    }
  ],
  "textbook_references": [
    {
      "title": "",
      "page": "",
      "usage": ""
    }
  ],
  "planned_questions": [
    {
      "question": "",
      "intent": "",
      "expected_answer": "",
      "reference": ""
    }
  ],
  "resource_pages": [
    {
      "name": "",
      "page": "",
      "description": ""
    }
  ],
  "smart_analysis": {
    "specific": true/false,
    "measurable": true/false,
    "achievable": true/false,
    "relevant": true/false,
    "time_bound": true/false
  },
  "language": "en/ur",
  "grade_level": "",
  "subject": "",
  "topic": "",
  "objectives_found": true/false,
  "prior_knowledge_found": true/false,
  "materials_found": true/false,
  "assessment_found": true/false
}`;

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1200
      });

      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonString = (jsonMatch ? jsonMatch[0] : content)?.trim();

      try {
        return JSON.parse(jsonString);
      } catch (parseError) {
        logToFile('⚠️ Lesson plan structured parsing JSON error, attempting repair', {
          error: parseError.message,
          preview: jsonString?.substring(0, 300)
        });
        try {
          const repaired = jsonrepair(jsonString);
          return JSON.parse(repaired);
        } catch (repairError) {
          logToFile('❌ Lesson plan structured parsing repair failed', {
            error: repairError.message,
            preview: jsonString?.substring(0, 300)
          });
          return null;
        }
      }
    } catch (error) {
      logToFile('⚠️ Lesson plan structured parsing failed', { error: error.message });
      return null;
    }
  }

  static safeTruncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    let end = maxLength;
    const code = text.charCodeAt(end - 1);
    if (code >= 0xD800 && code <= 0xDBFF) {
      end--;
    }
    return text.substring(0, end);
  }

  static detectFileType(buffer) {
    if (!buffer || buffer.length < 4) {
      return 'pdf';
    }

    const bytes = buffer.subarray(0, 8);
    const hex = bytes.toString('hex');

    if (hex.startsWith('25504446')) {
      return 'pdf';
    }

    if (hex.startsWith('504b0304')) {
      return 'docx';
    }

    if (hex.startsWith('d0cf11e0')) {
      return 'doc';
    }

    if (hex.startsWith('ffd8ff')) {
      return 'jpg';
    }

    if (hex.startsWith('89504e47')) {
      return 'png';
    }

    return 'pdf';
  }

  static async notifyFormatIssue(coachingSessionId) {
    try {
      const { data, error } = await supabase
        .from('coaching_sessions')
        .select('id, lesson_plan_format, users:users(first_name, phone_number)')
        .eq('id', coachingSessionId)
        .single();

      if (error || !data?.users?.phone_number) {
        logToFile('⚠️ Unable to notify teacher about LP format issue', {
          coachingSessionId,
          error: error?.message
        });
        return;
      }

      const teacherName = (data.users.first_name || 'Teacher').trim();
      const message = `⚠️ ${teacherName}, I got your lesson plan but couldn’t read the file. It looks like the document was saved under the wrong format (for example, a Word file renamed as PDF). Please resend it as the original Word/DOCX file, a proper PDF export, or clear page photos so I can include it in your report.`;

      if (process.env.OFFLINE_REPLAY === 'true') {
        logToFile('ℹ️ Skipping teacher notification (offline replay)', { coachingSessionId, message });
        return;
      }

      await WhatsAppService.sendMessage(data.users.phone_number, message);
      logToFile('📣 Notified teacher about lesson plan format issue', { coachingSessionId });
    } catch (notifyError) {
      logToFile('⚠️ Failed to send LP format notification', {
        coachingSessionId,
        error: notifyError.message
      });
    }
  }
}

module.exports = LessonPlanExtractionWorker;

