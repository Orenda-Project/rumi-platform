/**
 * Feedback Service for Exam Checker
 * Generates structured pedagogical feedback using Hattie's Feed Up/Back/Forward framework
 *
 * Created: 2026-01-25
 * Bead: bd-176
 *
 * Framework:
 * - Feed Up: What was the learning goal?
 * - Feed Back: How did you do?
 * - Feed Forward: What's next?
 *
 * References:
 * - Hattie & Timperley (2007) "The Power of Feedback"
 * - Visible Learning research
 */

const { logToFile } = require('../../utils/logger');

class FeedbackService {
  // Feedback templates by performance tier and language
  static templates = {
    en: {
      high: {
        feedBack: [
          'Excellent work!',
          'Outstanding!',
          'Well done!',
          'Perfect answer!',
          'Great job!'
        ],
        feedForward: [
          'Challenge yourself with harder problems',
          'Try teaching this to a classmate',
          'Explore advanced concepts',
          'Create your own practice questions',
          'Help others understand this topic'
        ]
      },
      mid: {
        feedBack: [
          'Good effort!',
          'Nice try!',
          'You\'re on the right track!',
          'Good thinking!',
          'Shows understanding!'
        ],
        feedForward: [
          'Review the key concepts',
          'Practice similar problems',
          'Focus on the details',
          'Compare with model answers',
          'Ask questions about unclear parts'
        ]
      },
      low: {
        feedBack: [
          'Keep trying!',
          'Don\'t give up!',
          'You can improve!',
          'Learning is a journey!',
          'Every attempt teaches something!'
        ],
        feedForward: [
          'Start with the basics',
          'Review your notes',
          'Ask your teacher for help',
          'Watch tutorial videos',
          'Practice step by step'
        ]
      }
    },
    ur: {
      high: {
        feedBack: [
          'بہت عمدہ!',
          'شاباش!',
          'بالکل صحیح!',
          'زبردست کام!',
          'بہترین!'
        ],
        feedForward: [
          'مزید مشکل سوالات حل کریں',
          'اپنے ساتھیوں کو سکھائیں',
          'نئے موضوعات سیکھیں',
          'خود سوالات بنائیں',
          'دوسروں کی مدد کریں'
        ]
      },
      mid: {
        feedBack: [
          'اچھی کوشش!',
          'صحیح سمت میں ہیں!',
          'سمجھ بوجھ ہے!',
          'بہتر ہو رہے ہیں!',
          'کوشش جاری رکھیں!'
        ],
        feedForward: [
          'بنیادی باتیں دہرائیں',
          'مشق کریں',
          'تفصیلات پر توجہ دیں',
          'نمونے کے جوابات دیکھیں',
          'سوالات پوچھیں'
        ]
      },
      low: {
        feedBack: [
          'ہمت نہ ہاریں!',
          'کوشش جاری رکھیں!',
          'سیکھنا جاری ہے!',
          'ہر کوشش سکھاتی ہے!',
          'آپ کر سکتے ہیں!'
        ],
        feedForward: [
          'بنیادی باتوں سے شروع کریں',
          'استاد سے مدد لیں',
          'نوٹس دوبارہ پڑھیں',
          'ویڈیوز دیکھیں',
          'قدم بہ قدم سیکھیں'
        ]
      }
    }
  };

  // Topic inference patterns
  static topicPatterns = {
    math: /solve|calculate|find.*value|equation|algebra|geometry|number|sum|multiply|divide|fraction/i,
    science: /experiment|hypothesis|atom|molecule|cell|energy|force|reaction|organism/i,
    english: /grammar|sentence|noun|verb|adjective|paragraph|essay|reading|comprehension/i,
    islamiat: /surah|ayat|hadith|prayer|prophet|allah|islam|quran/i,
    pak_studies: /pakistan|history|geography|government|constitution|founder/i,
    urdu: /نثر|نظم|محاورہ|ضرب|قواعد|خلاصہ|مرکزی خیال/
  };

  /**
   * Generate structured feedback for a single question result
   * @param {object} input - Grading input
   * @returns {object} Structured feedback { feedUp, feedBack, feedForward, tier }
   */
  static generate(input) {
    const {
      question,
      learningObjective,
      studentAnswer,
      correctAnswer,
      awarded,
      maxMarks,
      language = 'en'
    } = input;

    const percentage = maxMarks > 0 ? (awarded / maxMarks) * 100 : 0;
    const tier = this._getTier(percentage);
    const lang = language === 'ur' ? 'ur' : 'en';

    // Feed Up: What was the learning goal?
    const feedUp = this._generateFeedUp(question, learningObjective, lang);

    // Feed Back: How did you do?
    const feedBack = this._generateFeedBack(
      studentAnswer, correctAnswer, awarded, maxMarks, tier, lang
    );

    // Feed Forward: What's next?
    const feedForward = this._generateFeedForward(tier, lang);

    return { feedUp, feedBack, feedForward, tier, percentage };
  }

  /**
   * Generate overall session feedback
   * @param {Array} questionResults - All question results
   * @param {string} language - Language code
   * @returns {object} Overall feedback
   */
  static generateOverall(questionResults, language = 'en') {
    if (!questionResults || questionResults.length === 0) {
      return {
        feedUp: 'Exam assessment complete.',
        feedBack: 'No questions were graded.',
        feedForward: 'Please check the exam setup.',
        summary: { correct: 0, partial: 0, incorrect: 0 }
      };
    }

    const lang = language === 'ur' ? 'ur' : 'en';

    const totalAwarded = questionResults.reduce((sum, r) => sum + (r.marksAwarded || r.awarded || 0), 0);
    const totalMax = questionResults.reduce((sum, r) => sum + (r.maxMarks || r.max || 0), 0);
    const percentage = totalMax > 0 ? (totalAwarded / totalMax) * 100 : 0;
    const tier = this._getTier(percentage);

    const correct = questionResults.filter(r => (r.marksAwarded || r.awarded) === (r.maxMarks || r.max)).length;
    const partial = questionResults.filter(r => {
      const awarded = r.marksAwarded || r.awarded || 0;
      const max = r.maxMarks || r.max || 0;
      return awarded > 0 && awarded < max;
    }).length;
    const incorrect = questionResults.filter(r => (r.marksAwarded || r.awarded) === 0).length;

    const feedUp = lang === 'ur'
      ? `اس امتحان میں ${questionResults.length} سوالات تھے۔`
      : `This exam assessed your knowledge across ${questionResults.length} questions.`;

    let feedBack;
    if (lang === 'ur') {
      feedBack = `آپ نے ${correct} سوال مکمل درست، ${partial} جزوی درست، اور ${incorrect} غلط کیے۔`;
    } else {
      feedBack = `You got ${correct} correct, ${partial} partially correct, and ${incorrect} incorrect.`;
    }

    const feedForward = this._generateOverallFeedForward(percentage, tier, incorrect, lang);

    return {
      feedUp,
      feedBack,
      feedForward,
      tier,
      summary: { correct, partial, incorrect, percentage: Math.round(percentage) }
    };
  }

  /**
   * Get performance tier from percentage
   * @param {number} percentage
   * @returns {string} 'high', 'mid', or 'low'
   */
  static _getTier(percentage) {
    if (percentage >= 80) return 'high';
    if (percentage >= 50) return 'mid';
    return 'low';
  }

  /**
   * Generate Feed Up message (learning goal)
   * @param {string} question - Question text
   * @param {string} learningObjective - Explicit objective if available
   * @param {string} lang - Language code
   * @returns {string}
   */
  static _generateFeedUp(question, learningObjective, lang) {
    if (learningObjective) {
      return lang === 'ur'
        ? `مقصد: ${learningObjective}`
        : `Learning goal: ${learningObjective}`;
    }

    const topic = this._inferTopic(question);
    return lang === 'ur'
      ? `یہ سوال آپ کی ${topic} کی سمجھ کو جانچتا ہے۔`
      : `This question tests your understanding of ${topic}.`;
  }

  /**
   * Generate Feed Back message (performance feedback)
   * @param {string} studentAnswer
   * @param {string} correctAnswer
   * @param {number} awarded
   * @param {number} maxMarks
   * @param {string} tier
   * @param {string} lang
   * @returns {string}
   */
  static _generateFeedBack(studentAnswer, correctAnswer, awarded, maxMarks, tier, lang) {
    const templates = this.templates[lang] || this.templates.en;

    if (awarded === maxMarks) {
      const praise = this._randomChoice(templates[tier].feedBack);
      return lang === 'ur'
        ? `${praise} آپ کا جواب درست ہے۔`
        : `${praise} Your answer is correct.`;
    }

    if (awarded === 0) {
      if (lang === 'ur') {
        return correctAnswer
          ? `جواب غلط ہے۔ درست جواب: ${correctAnswer}`
          : `جواب غلط ہے۔ دوبارہ کوشش کریں۔`;
      }
      return correctAnswer
        ? `Incorrect. The correct answer is: ${correctAnswer}`
        : `Incorrect. Please review and try again.`;
    }

    // Partial credit
    if (lang === 'ur') {
      return `جزوی نمبر: ${awarded}/${maxMarks}۔ آپ کے جواب میں کچھ درست نکات ہیں۔`;
    }
    return `Partial credit: ${awarded}/${maxMarks}. Your answer shows understanding but needs improvement.`;
  }

  /**
   * Generate Feed Forward message (next steps)
   * @param {string} tier
   * @param {string} lang
   * @returns {string}
   */
  static _generateFeedForward(tier, lang) {
    const templates = this.templates[lang] || this.templates.en;
    return this._randomChoice(templates[tier].feedForward);
  }

  /**
   * Generate overall Feed Forward based on performance
   * @param {number} percentage
   * @param {string} tier
   * @param {number} incorrectCount
   * @param {string} lang
   * @returns {string}
   */
  static _generateOverallFeedForward(percentage, tier, incorrectCount, lang) {
    if (tier === 'high') {
      return lang === 'ur'
        ? 'شاباش! اپنی محنت جاری رکھیں اور نئے موضوعات سیکھیں۔'
        : 'Keep up the excellent work! Challenge yourself with advanced topics.';
    }

    if (tier === 'mid') {
      return lang === 'ur'
        ? `${incorrectCount} سوالات پر توجہ دیں اور دوبارہ مشق کریں۔`
        : `Focus on the ${incorrectCount} questions you missed and practice similar problems.`;
    }

    return lang === 'ur'
      ? 'بنیادی تصورات دہرائیں اور استاد سے مدد لیں۔'
      : 'Review the basic concepts and seek help from your teacher.';
  }

  /**
   * Infer topic from question text
   * @param {string} question
   * @returns {string}
   */
  static _inferTopic(question) {
    if (!question) return 'this subject';

    for (const [topic, pattern] of Object.entries(this.topicPatterns)) {
      if (pattern.test(question)) {
        const topicNames = {
          math: 'mathematics',
          science: 'science',
          english: 'English language',
          islamiat: 'Islamic studies',
          pak_studies: 'Pakistan studies',
          urdu: 'Urdu language'
        };
        return topicNames[topic] || topic;
      }
    }

    return 'this concept';
  }

  /**
   * Pick random element from array
   * @param {Array} arr
   * @returns {*}
   */
  static _randomChoice(arr) {
    if (!arr || arr.length === 0) return '';
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Format feedback for WhatsApp display
   * @param {object} feedback - Structured feedback object
   * @returns {string} Formatted message
   */
  static formatForWhatsApp(feedback) {
    const { feedUp, feedBack, feedForward } = feedback;

    return `📚 *Learning Goal*
${feedUp}

📝 *Your Performance*
${feedBack}

🎯 *Next Steps*
${feedForward}`;
  }
}

module.exports = FeedbackService;
