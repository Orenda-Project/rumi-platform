/**
 * Context Service
 * Phase 2: Conditional Feature Context Injection
 *
 * Injects feature context ONLY when user references past work.
 * Follows industry best practices (OpenAI, Claude, LangChain):
 * "Memory is opt-in, not forced"
 *
 * Created: December 25, 2025
 */

const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');

class ContextService {
  /**
   * Check if user message references past work
   * @param {string} messageBody - User's message
   * @returns {Object} { shouldInject: boolean, featureType: string|null, mode: 'summary'|'detailed'|null }
   */
  static shouldInjectContext(messageBody) {
    if (!messageBody || typeof messageBody !== 'string') {
      return { shouldInject: false, featureType: null, mode: null };
    }

    const lowerMessage = messageBody.toLowerCase();

    // Check for "start fresh" escape hatch first
    const escapePhrases = [
      'start fresh', 'نئی شروعات', 'forget', 'ignore history',
      'new start', 'fresh start', 'from scratch', 'شروع سے'
    ];

    for (const phrase of escapePhrases) {
      if (lowerMessage.includes(phrase)) {
        logToFile('Escape hatch triggered - ignoring context', { phrase });
        return { shouldInject: false, featureType: null, mode: null };
      }
    }

    // Reference patterns with mode (detailed for modifications, summary for queries)
    const referencePatterns = [
      // Explicit references - DETAILED mode
      { pattern: /my (last|previous|recent) (lesson plan|coaching|reading|video)/i, mode: 'detailed' },
      { pattern: /that (lesson plan|coaching session|reading test|video)/i, mode: 'detailed' },
      { pattern: /میرا (آخری|پچھلا|حالیہ) (لیسن پلان|کوچنگ|ریڈنگ|ویڈیو)/i, mode: 'detailed' },

      // Modification requests - DETAILED mode
      { pattern: /\b(modify|change|update|regenerate|redo|again|remake)\b/i, mode: 'detailed' },
      { pattern: /(دوبارہ بنائیں|تبدیل کریں|بدلیں|اپڈیٹ کریں)/i, mode: 'detailed' },
      { pattern: /make it (for|about|different|shorter|longer)/i, mode: 'detailed' },
      { pattern: /can you (change|modify|update|redo)/i, mode: 'detailed' },

      // Query patterns - SUMMARY mode
      { pattern: /(what|how|when) did (I|my student|we) (score|do|perform|create|make)/i, mode: 'summary' },
      { pattern: /what (lesson plans?|videos?|coaching|reading) have I/i, mode: 'summary' },
      { pattern: /show me my/i, mode: 'summary' },
      { pattern: /میں نے (کیا|کون سے|کتنے) (بنائے|کیے)/i, mode: 'summary' },
      { pattern: /how (was|did|went) my/i, mode: 'summary' },
      { pattern: /میری (کوچنگ|ریڈنگ) کیسی/i, mode: 'summary' },

      // Feature-specific queries - SUMMARY mode
      { pattern: /my (lesson plans?|coaching sessions?|reading assessments?|videos?)/i, mode: 'summary' },
      { pattern: /میرے (لیسن پلانز|کوچنگ سیشنز|ویڈیوز)/i, mode: 'summary' }
    ];

    for (const { pattern, mode } of referencePatterns) {
      if (pattern.test(messageBody)) {
        const featureType = this._detectFeatureType(messageBody);
        logToFile('Context injection triggered', { pattern: pattern.toString(), mode, featureType });
        return { shouldInject: true, featureType, mode };
      }
    }

    return { shouldInject: false, featureType: null, mode: null };
  }

  /**
   * Detect which feature type the user is referencing
   * @param {string} messageBody - User's message
   * @returns {string|null} Feature type or null for general query
   * @private
   */
  static _detectFeatureType(messageBody) {
    const lowerMessage = messageBody.toLowerCase();

    // Lesson plan keywords
    if (/lesson plan|لیسن پلان|سبق|plan de lecci[oó]n|خطة درس/i.test(messageBody)) {
      return 'lesson_plan';
    }

    // Presentation keywords
    if (/presentation|پریزنٹیشن|سلائیڈ|presentaci[oó]n|عرض/i.test(messageBody)) {
      return 'presentation';
    }

    // Coaching keywords
    if (/coaching|کوچنگ|observation|classroom|تدریس|فیڈبیک|مشاہدہ/i.test(messageBody)) {
      return 'coaching';
    }

    // Reading keywords
    if (/reading|ریڈنگ|پڑھائی|fluency|روانی|assessment/i.test(messageBody)) {
      return 'reading';
    }

    // Video keywords
    if (/video|ویڈیو|v[ií]deo/i.test(messageBody)) {
      return 'video';
    }

    // General query - include all features
    return null;
  }

  /**
   * Get feature context for injection into GPT prompt
   * Only called when shouldInjectContext returns true
   *
   * @param {string} userId - User's UUID
   * @param {string} messageBody - User's message (for feature detection)
   * @param {string} mode - 'summary' or 'detailed'
   * @returns {Promise<string|null>} Context block or null
   */
  static async getUserFeatureContext(userId, messageBody, mode = 'summary') {
    try {
      const featureType = this._detectFeatureType(messageBody);
      const results = {};

      logToFile('Fetching feature context', { userId, mode, featureType });

      // Query relevant features based on what user referenced
      // If featureType is null, query all features

      if (!featureType || featureType === 'lesson_plan' || featureType === 'presentation') {
        const { data: lessonPlans } = await supabase
          .from('lesson_plans')
          .select(mode === 'detailed'
            ? 'id, topic, grade_level, content_type, gamma_url, pdf_url, created_at'
            : 'topic, grade_level, content_type, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(mode === 'detailed' ? 3 : 5);

        results.lessonPlans = lessonPlans || [];
      }

      if (!featureType || featureType === 'coaching') {
        const { data: coaching } = await supabase
          .from('coaching_sessions')
          .select(mode === 'detailed'
            ? 'id, status, analysis_data, created_at'
            : 'status, analysis_data, created_at')
          .eq('user_id', userId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(2);

        results.coaching = coaching || [];
      }

      if (!featureType || featureType === 'reading') {
        const { data: reading } = await supabase
          .from('reading_assessments')
          .select(mode === 'detailed'
            ? 'id, status, wcpm, accuracy_percentage, reading_level, created_at'
            : 'status, wcpm, accuracy_percentage, created_at')
          .eq('user_id', userId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(2);

        results.reading = reading || [];
      }

      if (!featureType || featureType === 'video') {
        const { data: videos } = await supabase
          .from('video_requests')
          .select(mode === 'detailed'
            ? 'id, topic, language, status, video_url, created_at'
            : 'topic, language, status, created_at')
          .eq('user_id', userId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(3);

        results.videos = videos || [];
      }

      // Format context block
      return this._formatContextBlock(results, mode);

    } catch (error) {
      logToFile('Error fetching feature context', { userId, error: error.message });
      return null;
    }
  }

  /**
   * Format feature results into a context block for GPT
   * @param {Object} results - Query results
   * @param {string} mode - 'summary' or 'detailed'
   * @returns {string|null} Formatted context block or null if no data
   * @private
   */
  static _formatContextBlock(results, mode) {
    const lines = [];

    // Lesson Plans
    if (results.lessonPlans?.length > 0) {
      lines.push('**Lesson Plans:**');
      for (const lp of results.lessonPlans) {
        const timeAgo = this._getTimeAgo(lp.created_at);
        const type = lp.content_type === 'presentation' ? 'Presentation' : 'Lesson Plan';
        lines.push(`- ${type}: "${lp.topic}" ${lp.grade_level ? `(${lp.grade_level})` : ''} - ${timeAgo}`);
      }
    }

    // Coaching Sessions
    if (results.coaching?.length > 0) {
      lines.push('**Coaching Sessions:**');
      for (const cs of results.coaching) {
        const timeAgo = this._getTimeAgo(cs.created_at);
        const score = cs.analysis_data?.overall_score;
        if (score) {
          const pct = Math.round(score.percentage);
          lines.push(`- Session: ${pct}% score - ${timeAgo}`);

          if (mode === 'detailed' && cs.analysis_data?.strengths?.length > 0) {
            lines.push(`  Strengths: ${cs.analysis_data.strengths.slice(0, 2).join(', ')}`);
          }
          if (mode === 'detailed' && cs.analysis_data?.growth_opportunities?.length > 0) {
            lines.push(`  Focus areas: ${cs.analysis_data.growth_opportunities.slice(0, 2).join(', ')}`);
          }
        } else {
          lines.push(`- Coaching session - ${timeAgo}`);
        }
      }
    }

    // Reading Assessments
    if (results.reading?.length > 0) {
      lines.push('**Reading Assessments:**');
      for (const ra of results.reading) {
        const timeAgo = this._getTimeAgo(ra.created_at);
        const wcpm = ra.wcpm ? `${ra.wcpm} WCPM` : '';
        const accuracy = ra.accuracy_percentage ? `${Math.round(ra.accuracy_percentage)}% accuracy` : '';
        const metrics = [wcpm, accuracy].filter(Boolean).join(', ');
        lines.push(`- Reading: ${metrics || 'completed'} - ${timeAgo}`);
      }
    }

    // Videos
    if (results.videos?.length > 0) {
      lines.push('**Videos:**');
      for (const v of results.videos) {
        const timeAgo = this._getTimeAgo(v.created_at);
        lines.push(`- Video: "${v.topic}" (${v.language}) - ${timeAgo}`);
      }
    }

    if (lines.length === 0) {
      return null;
    }

    // Build final context block
    const contextBlock = `
## YOUR RECENT WORK WITH THIS USER:
${lines.join('\n')}

## FEATURE MODIFIABILITY:
When user asks to "change", "modify", or "redo" a feature:
- Lesson Plans, Presentations: CAN regenerate with new parameters (no limit)
- Videos: CAN regenerate BUT rate-limited to 1 per day
- Coaching Reports, Reading Assessments: CANNOT modify (based on real recordings)
  → Instead: Offer to discuss, explain scores, suggest improvements, or encourage new recording

(This context is shown because you referenced past work. Say "start fresh" to ignore history.)
`;

    return contextBlock;
  }

  /**
   * Get human-readable time ago string
   * @param {string} timestamp - ISO timestamp
   * @returns {string} e.g., "2 hours ago", "3 days ago"
   * @private
   */
  static _getTimeAgo(timestamp) {
    if (!timestamp) return 'recently';

    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return diffMins <= 1 ? 'just now' : `${diffMins} minutes ago`;
    } else if (diffHours < 24) {
      return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    } else if (diffDays < 7) {
      return diffDays === 1 ? 'yesterday' : `${diffDays} days ago`;
    } else {
      return then.toLocaleDateString();
    }
  }

  /**
   * Check if user has exceeded video rate limit (1 per day)
   * @param {string} userId - User's UUID
   * @returns {Promise<{limited: boolean, lastVideo: Object|null, hoursRemaining: number}>}
   */
  static async checkVideoRateLimit(userId) {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: recentVideos } = await supabase
        .from('video_requests')
        .select('id, topic, created_at')
        .eq('user_id', userId)
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(1);

      if (recentVideos && recentVideos.length > 0) {
        const lastVideo = recentVideos[0];
        const createdAt = new Date(lastVideo.created_at);
        const canCreateAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
        const hoursRemaining = Math.ceil((canCreateAt - new Date()) / 3600000);

        return {
          limited: true,
          lastVideo,
          hoursRemaining: Math.max(0, hoursRemaining)
        };
      }

      return { limited: false, lastVideo: null, hoursRemaining: 0 };
    } catch (error) {
      logToFile('Error checking video rate limit', { userId, error: error.message });
      return { limited: false, lastVideo: null, hoursRemaining: 0 };
    }
  }

  /**
   * Get video rate limit message in user's language
   * @param {Object} user - User object with language preferences
   * @param {Object} lastVideo - Last video created
   * @param {number} hoursRemaining - Hours until can create new video
   * @returns {string} Localized rate limit message
   */
  static getVideoRateLimitMessage(user, lastVideo, hoursRemaining) {
    // Use locked language if set, otherwise preferred, otherwise English
    const language = user.language_locked ? user.preferred_language : (user.preferred_language || 'en');
    const topic = lastVideo?.topic || 'your topic';
    const hoursAgo = lastVideo ? Math.floor((Date.now() - new Date(lastVideo.created_at)) / 3600000) : 0;

    const messages = {
      en: `I'd love to help you create a new video! However, video generation uses significant resources, so each teacher can create 1 video per day.

You created a video about "${topic}" ${hoursAgo} hours ago. You can create a new one in ${hoursRemaining} hours.

In the meantime, would you like to:
1. Create a lesson plan on your new topic (no limit!)
2. Watch or share your current video
3. Ask me anything else I can help with`,

      ur: `میں آپ کی نئی ویڈیو بنانے میں خوشی سے مدد کروں گا! تاہم، ویڈیو بنانے میں کافی وسائل استعمال ہوتے ہیں، اس لیے ہر استاد روزانہ 1 ویڈیو بنا سکتا ہے۔

آپ نے "${topic}" کے بارے میں ${hoursAgo} گھنٹے پہلے ویڈیو بنائی۔ آپ ${hoursRemaining} گھنٹے بعد نئی ویڈیو بنا سکیں گے۔

اس دوران، کیا آپ یہ کرنا چاہیں گے:
1. اپنے نئے موضوع پر لیسن پلان بنائیں (کوئی حد نہیں!)
2. اپنی موجودہ ویڈیو دیکھیں یا شیئر کریں
3. کچھ اور پوچھیں جس میں میں مدد کر سکوں`,

      ar: `يسعدني مساعدتك في إنشاء فيديو جديد! ولكن إنشاء الفيديو يستخدم موارد كبيرة، لذلك يمكن لكل معلم إنشاء فيديو واحد يومياً.

لقد أنشأت فيديو عن "${topic}" منذ ${hoursAgo} ساعات. يمكنك إنشاء فيديو جديد بعد ${hoursRemaining} ساعات.

في هذه الأثناء، هل تريد:
1. إنشاء خطة درس حول موضوعك الجديد (بلا حدود!)
2. مشاهدة أو مشاركة الفيديو الحالي
3. طلب أي مساعدة أخرى`,

      es: `¡Me encantaría ayudarte a crear un nuevo video! Sin embargo, la generación de videos usa recursos significativos, por lo que cada maestro puede crear 1 video por día.

Creaste un video sobre "${topic}" hace ${hoursAgo} horas. Podrás crear uno nuevo en ${hoursRemaining} horas.

Mientras tanto, ¿te gustaría:
1. Crear un plan de lección sobre tu nuevo tema (¡sin límite!)
2. Ver o compartir tu video actual
3. Pedirme ayuda con algo más`
    };

    return messages[language] || messages.en;
  }
}

module.exports = ContextService;
