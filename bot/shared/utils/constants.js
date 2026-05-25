require('dotenv').config();
const path = require('path');

// Environment Variables
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const SONIOX_API_KEY = process.env.SONIOX_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const UPLIFT_API_KEY = process.env.UPLIFT_API_KEY;
const GAMMA_API_KEY = process.env.GAMMA_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LOADING_STICKER_MEDIA_ID = process.env.LOADING_STICKER_MEDIA_ID;
const REGISTRATION_SUCCESS_STICKER_MEDIA_ID = process.env.REGISTRATION_SUCCESS_STICKER_MEDIA_ID;
const LISTENING_ANIMATION_MEDIA_ID = process.env.LISTENING_ANIMATION_MEDIA_ID;
const PEDAGOGICAL_ANALYSIS_MEDIA_ID = process.env.PEDAGOGICAL_ANALYSIS_MEDIA_ID;
const MENU_IMAGE_MEDIA_ID = process.env.MENU_IMAGE_MEDIA_ID;
const WABA_ID = process.env.WABA_ID;
const PORT = process.env.PORT || 3000;

// Attendance Flow IDs (registered with Meta)
const ATTENDANCE_SETUP_FLOW_ID = process.env.ATTENDANCE_SETUP_FLOW_ID || '';
const ATTENDANCE_MARKING_FLOW_ID = process.env.ATTENDANCE_MARKING_FLOW_ID || '';

// Pic-to-LP (photo → illustrated lesson plan)
const KIE_API_KEY = process.env.KIE_API_KEY;
// Pic-to-LP uses a dedicated Kie.ai key for rate-limit isolation; falls back
// to the shared KIE_API_KEY when a feature-specific key isn't set.
const KIE_API_KEY_PIC_LP = process.env.KIE_API_KEY_PIC_LP || process.env.KIE_API_KEY;
// R2 object key for the Rumi brand mark used as the header logo in generated LPs.
const RUMI_LOGO_R2_KEY = process.env.RUMI_LOGO_R2_KEY || 'brand/rumi-white-smile-v1.png';
// WhatsApp Flow ID for the pic-to-LP confirmation form (empty → text fallback).
const PIC_LP_FLOW_ID = process.env.PIC_LP_FLOW_ID || '';
// Teacher-facing WhatsApp number shown in the lesson-plan Coaching Corner
// (empty → the contact line is omitted from the rendered LP).
const COACHING_WHATSAPP_NUMBER = process.env.COACHING_WHATSAPP_NUMBER || '';

// Directory Paths
const TEMP_DIR = path.join(__dirname, '../../temp');
const LOGS_DIR = path.join(__dirname, '../../logs');
const LOADING_STICKER_PATH = path.join(__dirname, '../../marketing/new rumi blinking.webp');
const REGISTRATION_SUCCESS_STICKER_PATH = path.join(__dirname, '../../marketing/Registration Succesful.webp');
const REGISTRATION_VIDEO_PATH = path.join(__dirname, '../../marketing/registrationvideo.mp4');
const REGISTRATION_VIDEO_MEDIA_ID = process.env.REGISTRATION_VIDEO_MEDIA_ID;

// Test Data (for validation)
const TEST_NUMBERS = ['16315551181', '16505551111', '123456123'];
const TEST_ENTRY_IDS = ['0', 0, null, undefined];

// Timeout Constants
const SONIOX_V3_TIMEOUT = 180; // 3 minutes
const SONIOX_V2_TIMEOUT = 120; // 2 minutes
const GAMMA_MAX_ATTEMPTS = 60; // Maximum polling attempts for Gamma
const GAMMA_POLL_INTERVAL = 5000; // 5 seconds between polls
const KIE_MAX_ATTEMPTS = 60;    // Maximum polling attempts for Kie.ai (8s × 60 = 8 min ceiling)
const KIE_POLL_INTERVAL = 8000; // 8 seconds between polls (matches Kie.ai recommendation)
const MESSAGE_MAX_AGE = 23 * 60 * 60; // 23 hours in seconds

// MMS-ASR Service Configuration (for regional Pakistani languages)
const MMS_SERVICE_URL = process.env.MMS_SERVICE_URL || 'http://localhost:8000';
const MMS_TIMEOUT_MS = parseInt(process.env.MMS_TIMEOUT_MS) || 60000; // 60 seconds
const MMS_API_KEY = process.env.MMS_API_KEY || ''; // API key for authentication

// Voice Configuration (Phase 3: Multi-language support)
// bd-332: Voice IDs are env-var overridable for clone deployments
const UPLIFT_VOICE_ID = process.env.UPLIFT_VOICE_ID_UR || 'v_8eelc901'; // Info/Education voice - Fast and easy to understand (Urdu)
const UPLIFT_SINDHI_VOICE_ID = process.env.UPLIFT_VOICE_ID_SD || 'v_sd0kl3m9'; // Sindhi voice
const UPLIFT_BALOCHI_VOICE_ID = process.env.UPLIFT_VOICE_ID_BAL || 'v_bl1de2f7'; // Balochi voice

// Eleven Labs Voice IDs (v3 model with emotion tag support)
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'cgSgspJ2msm6clMCkdW9'; // Jessica voice (English)
const ELEVENLABS_SPANISH_VOICE_ID = process.env.ELEVENLABS_VOICE_ID_ES || 'vYui54mlc1I9tFZBBz4i'; // Cony Iglesias (Spanish)
const ELEVENLABS_ARABIC_VOICE_ID = process.env.ELEVENLABS_VOICE_ID_AR || '4wf10lgibMnboGJGCLrP'; // Farah (Arabic)

// Voice Model Routing Configuration
// Tier 1: Full support (coaching + reading assessment)
// Tier 2: Coaching only (no reading assessment)
const VOICE_MODELS = {
  // Tier 1: Full support
  en: { provider: 'elevenlabs', voiceId: ELEVENLABS_VOICE_ID, supportsEmotionTags: true, tier: 1 },
  ur: { provider: 'uplift', voiceId: UPLIFT_VOICE_ID, supportsEmotionTags: false, tier: 1 },

  // Tier 2: Coaching only
  es: { provider: 'elevenlabs', voiceId: ELEVENLABS_SPANISH_VOICE_ID, supportsEmotionTags: true, tier: 2 },
  ar: { provider: 'elevenlabs', voiceId: ELEVENLABS_ARABIC_VOICE_ID, supportsEmotionTags: true, tier: 2 },
  'pa-PK': { provider: 'elevenlabs', voiceId: ELEVENLABS_VOICE_ID, supportsEmotionTags: true, tier: 2 }, // Pakistani Punjabi (Shahmukhi)
  'ps-PK': { provider: 'elevenlabs', voiceId: ELEVENLABS_VOICE_ID, supportsEmotionTags: true, tier: 2 }, // Pakistani Pashto
  'sd-PK': { provider: 'uplift', voiceId: UPLIFT_SINDHI_VOICE_ID, supportsEmotionTags: false, tier: 2 }, // Sindhi
  'bal-PK': { provider: 'uplift', voiceId: UPLIFT_BALOCHI_VOICE_ID, supportsEmotionTags: false, tier: 2 }, // Balochi
  'ta-LK': { provider: 'elevenlabs', voiceId: ELEVENLABS_VOICE_ID, supportsEmotionTags: true, tier: 2 } // Sri Lankan Tamil
};

// Message Limits
const PROCESSED_MESSAGES_LIMIT = 1000;
const PROCESSED_MESSAGES_CLEANUP = 100;
const CONVERSATION_HISTORY_LIMIT = 11; // System message + 10 messages

// Rate Limiting (bd-338: env-configurable for clone deployments)
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX, 10) || 30; // Max messages per window
const RATE_LIMIT_WINDOW_SECONDS = parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS, 10) || 60; // Window in seconds

module.exports = {
  // Environment Variables
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  WEBHOOK_VERIFY_TOKEN,
  SONIOX_API_KEY,
  ELEVENLABS_API_KEY,
  UPLIFT_API_KEY,
  GAMMA_API_KEY,
  OPENAI_API_KEY,
  LOADING_STICKER_MEDIA_ID,
  REGISTRATION_SUCCESS_STICKER_MEDIA_ID,
  LISTENING_ANIMATION_MEDIA_ID,
  PEDAGOGICAL_ANALYSIS_MEDIA_ID,
  MENU_IMAGE_MEDIA_ID,
  WABA_ID,
  PORT,

  // Attendance Flow IDs
  ATTENDANCE_SETUP_FLOW_ID,
  ATTENDANCE_MARKING_FLOW_ID,

  // Pic-to-LP
  KIE_API_KEY,
  KIE_API_KEY_PIC_LP,
  RUMI_LOGO_R2_KEY,
  PIC_LP_FLOW_ID,
  COACHING_WHATSAPP_NUMBER,

  // Directory Paths
  TEMP_DIR,
  LOGS_DIR,
  LOADING_STICKER_PATH,
  REGISTRATION_SUCCESS_STICKER_PATH,
  REGISTRATION_VIDEO_PATH,
  REGISTRATION_VIDEO_MEDIA_ID,

  // Test Data
  TEST_NUMBERS,
  TEST_ENTRY_IDS,

  // Timeouts
  SONIOX_V3_TIMEOUT,
  SONIOX_V2_TIMEOUT,
  GAMMA_MAX_ATTEMPTS,
  GAMMA_POLL_INTERVAL,
  KIE_MAX_ATTEMPTS,
  KIE_POLL_INTERVAL,
  MESSAGE_MAX_AGE,

  // MMS-ASR Service
  MMS_SERVICE_URL,
  MMS_TIMEOUT_MS,
  MMS_API_KEY,

  // Voice
  UPLIFT_VOICE_ID,
  UPLIFT_SINDHI_VOICE_ID,
  UPLIFT_BALOCHI_VOICE_ID,
  ELEVENLABS_VOICE_ID,
  ELEVENLABS_SPANISH_VOICE_ID,
  ELEVENLABS_ARABIC_VOICE_ID,
  VOICE_MODELS,

  // Limits
  PROCESSED_MESSAGES_LIMIT,
  PROCESSED_MESSAGES_CLEANUP,
  CONVERSATION_HISTORY_LIMIT,

  // Rate Limiting
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_SECONDS
};
