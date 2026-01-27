/**
 * Video Script Service
 *
 * Generates slide scripts using GPT and creates voiceovers using ElevenLabs.
 */

const { logToFile } = require('../../utils/logger');
const { makeVoiceoverSpeakable } = require('../../utils/tts-preprocessor');
const OpenAIService = require('../openai.service');
const { LANGUAGE_PROMPTS } = require('../../config/language-prompts');
const fs = require('fs');
const path = require('path');

// FIX: Use npm-installed ffprobe instead of system ffprobe
const ffprobePath = require('@ffprobe-installer/ffprobe').path;

// ElevenLabs configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = 'cgSgspJ2msm6clMCkdW9'; // Jessica - works well for Urdu

/**
 * STYLE_PREFIXES - Issue #35: Video Style Selection
 * Each style has a prompt prefix that guides image generation
 */
const STYLE_PREFIXES = {
  photorealistic: `Hyper-realistic photograph, shot on Sony A7R IV with 50mm f/1.8 lens, cinematic lighting, HDR, 8K UHD quality, soft natural lighting, realistic depth of field, professional photography.`,

  infographic: `TED-Ed style flat vector illustration with bold colors. Kurzgesagt inspired design with rounded shapes and vibrant gradients. Clean educational infographic, layered composition.`,

  cartoon: `Vibrant 2D cartoon illustration, Pixar-inspired character design, expressive features with large eyes, flat shading with cel-shaded look, cheerful color palette, animated movie quality, child-friendly and playful design.`,

  sketch: `Educational whiteboard illustration, pencil sketch style, hand-drawn with graphite shading, clean line art, minimalist background, step-by-step visual explanation, like RSA Animate or VideoScribe.`
};

/**
 * Get the style prefix for image generation prompts
 * @param {string} style - Style name (photorealistic, infographic, cartoon, sketch)
 * @returns {string} Style prefix for prompts
 */
function getStylePrefix(style) {
  if (!style) return STYLE_PREFIXES.infographic;
  const normalizedStyle = style.toLowerCase().trim();
  return STYLE_PREFIXES[normalizedStyle] || STYLE_PREFIXES.infographic;
}

/**
 * Apply style prefix to all slide prompts
 * Issue #35: Prepends style-specific keywords to startPrompt only
 * @param {Array} slides - Array of slide objects with startPrompt and endPrompt
 * @param {string} style - Style name (photorealistic, infographic, cartoon, sketch)
 * @returns {Array} Slides with style-prefixed startPrompts
 */
function applyStyleToPrompts(slides, style) {
  const stylePrefix = getStylePrefix(style);

  return slides.map(slide => ({
    ...slide,
    // Prepend style prefix to startPrompt only (not endPrompt)
    // endPrompt should remain as-is since it describes changes, not full scene
    startPrompt: `${stylePrefix} ${slide.startPrompt}`
  }));
}

class VideoScriptService {

  /**
   * Generate script and voiceovers for video
   * @param {string} videoRequestId - Video request UUID
   * @param {Object} options - { topic, language, slideCount, customization }
   * @returns {Object} { slides, audioUrls, audioDurations, funFacts }
   */
  static async generateScript(videoRequestId, { topic, language, slideCount = 3, customization = null }) {
    logToFile('Starting script generation', {
      videoRequestId,
      topic,
      language,
      slideCount,
      customization: customization || 'none'  // ISSUE #14: Log user's customization
    });

    try {
      // Step 1: Generate slide content with GPT
      // ISSUE #14: Pass customization to influence content focus
      const { slides, funFacts } = await this.generateSlideContent(topic, language, slideCount, customization);
      logToFile('Slide content generated', { videoRequestId, slideCount: slides.length, funFactCount: funFacts?.length || 0 });

      // Step 2: Generate voiceovers for each slide
      const audioData = [];
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];

        // Make narration speakable for TTS
        const speakableText = makeVoiceoverSpeakable(slide.narration, 'math');

        const { audioUrl, duration } = await this.generateVoiceover(
          speakableText,
          videoRequestId,
          i + 1
        );

        audioData.push({
          slideId: i + 1,
          audioUrl,
          duration,
          originalText: slide.narration,
          speakableText
        });
      }

      logToFile('All voiceovers generated', {
        videoRequestId,
        audioCount: audioData.length,
        totalDuration: audioData.reduce((sum, a) => sum + a.duration, 0)
      });

      return {
        slides,
        audioPaths: audioData.map(a => a.audioUrl),  // Local paths to audio files
        audioDurations: audioData.map(a => a.duration),
        funFacts: funFacts || []  // Fun facts for sending during video generation wait
      };
    } catch (error) {
      logToFile('Error generating script', {
        videoRequestId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Generate slide content using GPT
   * @param {string} topic - Video topic
   * @param {string} language - Language code
   * @param {number} slideCount - Number of slides
   * @param {string|null} customization - User's focus preference (ISSUE #14)
   * @returns {Object} { slides, funFacts }
   */
  static async generateSlideContent(topic, language, slideCount, customization = null) {
    // BUG-014 FIX: Use comprehensive language instructions from language-prompts.js
    // Simple languageNames causes GPT to generate Urdu instead of Punjabi
    const languageNames = {
      en: 'English',
      ur: 'Urdu (Roman script for any Urdu words, keep English technical terms)',
      ar: 'Arabic',
      es: 'Spanish',
      'pa-PK': `Punjabi Shahmukhi (پنجابی).

=== CRITICAL PUNJABI LANGUAGE RULES ===
Write in PUNJABI, NOT Urdu. They share script but have DIFFERENT vocabulary and grammar.

USE PUNJABI VOCABULARY:
- "اے" not "ہے" for "is"
- "نال" not "کے ساتھ" for "with"
- "وچ" not "میں" for "in"
- "دا/دی/دے" not "کا/کی/کے" for possessives
- "تسی" not "آپ" for "you"
- "اسیں" not "ہم" for "we"
- "ودھیا" not "اچھا" for "good"
- "چنگا" not "اچھا" for "nice"
- "ہن" not "اب" for "now"
- "کی" not "کیا" for "what"
- "سکھاں گے" not "سیکھیں گے" for "will learn"
- "کردا/کردی" not "کرتا/کرتی" for verb forms

NATURAL PUNJABI EXAMPLES:
✅ "آؤ اج اسیں تین دا جدول سکھدے آں!"
✅ "ایہ بڑا ودھیا طریقہ اے سکھن دا۔"
✅ "تسی ایہ کر سکدے او، کوشش کرو!"

❌ NEVER USE URDU GRAMMAR:
❌ "آج ہم تین کے جدول کے بارے میں سیکھیں گے" (This is URDU!)
❌ "کیا آپ جانتے ہیں" (This is URDU!)

Code-mixing with English is OK for educational terms: lesson plan, worksheet, activity`,
      'sd-PK': `Sindhi (Vicholi dialect).
Use unique Sindhi letters: ڄ ڃ ڦ ڻ ڳ ڱ ڪ ڏ ٺ ٽ ٿ
Use native Sindhi verbs: آهي، ڪري، وڃي`,
      'ps-PK': `Pashto (Northern/Yusufzai/Peshawar dialect - NOT Afghan Dari).
Use Pashto vocabulary: زه (I), ته (you), دا (this), څنګه (how)
Use unique letters: ټ ډ ړ ښ ږ ځ څ`,
      'bal-PK': `Balochi (Rakhshani dialect).
Use retroflex ݔ correctly. Mix with Urdu for modern concepts is OK.`,
      'ta-LK': `Tamil (Jaffna/Sri Lankan dialect).
Use colloquial Tamil, not literary. English mixing is natural.
Avoid war/military metaphors (post-war sensitivity).`
    };

    const langName = languageNames[language] || 'English';

    // ISSUE #14: Build customization instruction if user provided focus preference
    const customizationInstruction = customization
      ? `\n=== USER'S FOCUS PREFERENCE ===\nThe user specifically requested to focus on: "${customization}"\nMAKE SURE the video content addresses this specific aspect prominently. This is what the user wants to learn about.\n`
      : '';

    // ISSUE #2: HYBRID approach - startPrompt is FULL description, endPrompt describes CHANGES ONLY
    // ISSUE #35: Style-agnostic prompts - GPT describes content only, style prefix applied later
    const prompt = `Create a ${slideCount}-slide educational video script about "${topic}" in ${langName}.
${customizationInstruction}

=== STYLE-AGNOSTIC PROMPTS (ISSUE #35) ===

CRITICAL: The visual style (photorealistic, infographic, cartoon, sketch) is applied BY THE SYSTEM.
Your prompts must describe SCENE CONTENT ONLY - NO colors, NO style keywords.

Your startPrompts should describe:
- WHAT elements to show (objects, characters, diagrams)
- WHERE elements are positioned (left/center/right, foreground/background)
- SIZE relationships between elements
- Keep the lower portion of the image clear of important elements

DO NOT specify in your prompts:
- Colors or gradients (the style prefix handles this)
- Visual style keywords (realistic, cartoon, flat, etc.)
- Lighting or texture descriptions
- Background colors

COMPOSITION PRINCIPLES:
- One clear focal point per slide
- Avoid cluttered layouts - whitespace is good
- Variety in composition across slides
- Keep the lower portion clear for future label overlay

=== FORBIDDEN PHRASES - ISSUE #36 ===

NEVER include these phrases in startPrompt or endPrompt - they get rendered as literal text!

FORBIDDEN (English):
- "text zone", "text area", "label area"
- "empty area", "empty space", "placeholder"
- "bottom 25%", "bottom portion", "reserved for"
- "no text", "no labels", "no text or labels"
- "16:9 aspect ratio", "high contrast"
- "step-by-step visual explanation"

FORBIDDEN (Arabic):
- "منطقة فارغة" (empty area)
- "لنص" (for text)
- "منطقة النص" (text zone)
- "بنسبة 25%" (by 25%)

FORBIDDEN (Urdu):
- "خالی جگہ" (empty space)
- "متن کا علاقہ" (text area)

Instead of describing empty space, just DON'T put elements there.
BAD: "Bottom 25% empty text zone for labels"
GOOD: "Earth on left, Moon on right, space below them"

=== SLIDE STRUCTURE ===
For each slide, provide:
1. title: A short title (5-7 words)
2. narration: The voiceover script WITH emotion tags (2-3 sentences, 10-15 seconds when spoken)
3. startPrompt: FULL image description for START frame (layout, colors, elements, positions) - NO text/labels
4. endPrompt: CHANGES ONLY for END frame - what moves, what appears, what labels fade in (START image is used as reference)
5. videoPrompt: Motion description for animating from start to end

=== VOICEOVER WITH EMOTION TAGS (ISSUE #29) ===

You MUST include ElevenLabs v3 emotion tags in ALL narration text.
ONLY use tags from this approved list - do not invent new tags.

AVAILABLE EMOTION TAGS:
• [excited] [enthusiastic] - Opening hooks, exciting facts
• [curious] - Questions, exploration
• [calm] [relieved] - Reassurance, after explanations
• [proud] [happy] - Celebrating progress
• [conversational][friendly] - Casual explanations
• [reassuring] - Addressing concerns
• [clear][instructional] - Step-by-step teaching
• [encouraging][warm] - Motivation, support
• [confident] - Conclusions, key takeaways
• [pause] - Before important points

TAG PLACEMENT RULES:
1. FIRST SLIDE: Start with [enthusiastic teacher voice] or [excited]
2. QUESTIONS: Use [curious] before rhetorical questions
3. EXPLANATIONS: Use [conversational][friendly]
4. IMPORTANT POINTS: Use [pause] before key facts
5. FINAL SLIDE: End with [encouraging][warm] or [confident]
6. DENSITY: 2-4 tags per narration (don't overuse!)

=== CRITICAL RULES FOR IMAGE PROMPTS ===
- startPrompt: Describe WHAT elements and WHERE positioned (left/center/right) - NO colors or style keywords
- endPrompt: Describe ONLY what CHANGES - "Moon moves closer", "Label 'Gravity' appears"
  - ALWAYS start with "Keep same layout."
  - DO NOT repeat the full scene description

=== VISUAL CONSISTENCY (ISSUE #32) ===
To prevent text morphing during animation:
- startPrompt: Keep the lower portion clear of main elements
- endPrompt: Labels can appear in the lower portion
- Text appears via fade-in animation, NOT morphing

EXAMPLE (correct - no forbidden phrases):
narration: "[enthusiastic teacher voice] Gravity is one of the most powerful forces in our universe! [pause] Let's see how it works between Earth and Moon."
startPrompt: "Earth as large globe on left third. Moon as smaller sphere on far right. Large space between them. Lower portion clear."
endPrompt: "Keep same layout. Moon moves closer to Earth (center-right). Curved dotted line showing orbit path. Label 'Gravitational Pull' appears at bottom."

Also generate 3-4 "Did You Know?" fun facts about the topic. These will be sent to users during the video generation wait (7-10 min). Each fact should be:
- Surprising or "wow" worthy
- Age-appropriate for K-12 students
- Related to the main topic
- 1-2 sentences max
- Written in ${langName}

Respond in JSON format:
{
  "slides": [
    {
      "title": "...",
      "narration": "...",
      "startPrompt": "...",
      "endPrompt": "...",
      "videoPrompt": "..."
    }
  ],
  "funFacts": [
    "Surprising fact #1 about the topic...",
    "Surprising fact #2 about the topic...",
    "Surprising fact #3 about the topic..."
  ]
}`;

    const response = await OpenAIService.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert educational content creator. Create engaging, accurate educational content suitable for K-12 students. Your image prompts should describe SCENE CONTENT ONLY (elements, positions, composition) - the visual style is applied separately by the system.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2000,
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const content = JSON.parse(response.choices[0].message.content);

    // Store funFacts on the result for the caller to access
    // The funFacts will be attached to the return value
    return { slides: content.slides, funFacts: content.funFacts || [] };
  }

  /**
   * Generate voiceover using ElevenLabs
   * @param {string} text - Text to speak
   * @param {string} videoRequestId - For organizing files
   * @param {number} slideId - Slide number
   * @returns {Object} { audioUrl, duration }
   */
  static async generateVoiceover(text, videoRequestId, slideId) {
    logToFile('Generating voiceover', { videoRequestId, slideId, textLength: text.length });

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_v3',  // ISSUE #29: v3 for emotion tag support
        voice_settings: {
          stability: 0.0,  // Creative mode - best for emotion tags
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    // Get audio buffer
    const audioBuffer = await response.arrayBuffer();

    // Save to temp file to get duration
    const tempDir = path.join('/tmp', 'video-generation', videoRequestId);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const audioPath = path.join(tempDir, `audio_${slideId}.mp3`);
    fs.writeFileSync(audioPath, Buffer.from(audioBuffer));

    // Get audio duration using ffprobe
    const duration = await this.getAudioDuration(audioPath);

    // Upload to R2 (for now, return local path - will be updated for R2)
    const audioUrl = audioPath;

    logToFile('Voiceover generated', { videoRequestId, slideId, duration, audioPath });

    return { audioUrl, duration };
  }

  /**
   * Get audio duration using ffprobe
   * @param {string} audioPath - Path to audio file
   * @returns {number} Duration in seconds
   */
  static async getAudioDuration(audioPath) {
    const { execSync } = require('child_process');

    try {
      // FIX: Use npm-installed ffprobe path instead of system ffprobe
      const result = execSync(
        `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
        { encoding: 'utf8' }
      );
      return parseFloat(result.trim());
    } catch (error) {
      logToFile('Error getting audio duration', { audioPath, error: error.message });
      return 10; // Default to 10 seconds
    }
  }
}

module.exports = VideoScriptService;
module.exports.STYLE_PREFIXES = STYLE_PREFIXES;
module.exports.getStylePrefix = getStylePrefix;
module.exports.applyStyleToPrompts = applyStyleToPrompts;
