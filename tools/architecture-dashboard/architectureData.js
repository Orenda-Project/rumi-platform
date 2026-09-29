/**
 * architectureData.js
 * Structured dependency, ingress, and microservices decomposition dataset for Rumi Platform.
 * Follows camelCase conventions.
 */

const architectureData = {
  systemOverview: {
    systemName: 'Rumi Platform',
    currentArchitecture: 'Decomposed Hybrid — Decoupled rumi-gateway Microservice + Pluggable Queue Buffer + Monolith Core',
    totalIngressHotspots: 18,
    resolvedIngressHotspots: 3,
    keyIngressLinesOfCode: 12064,
    totalDatabaseTables: 77,
    activeDatabaseTables: 50,
    targetMicroservicesCount: 9,
    microservicesExtractedCount: 1,
    gatewayResponseTime: '< 100ms (19–45ms measured)',
    totalVerifiedTests: 1053,
    gatewayTestsPassing: 130,
    differentialTestsPassing: 40,
    differentialParityRate: '100.0% (Zero Divergence)',
    primaryBottlenecks: [
      '[RESOLVED & DECOUPLED] Monolithic Webhook Ingress -> Extracted into standalone rumi-gateway microservice (bot/gateway/server.js) with sub-100ms async queue handoff',
      'Multi-domain Regex Mega-Dispatcher (text-message.handler.js: 2,624 lines)',
      'Asynchronous Job Multiplexing Hub (sqs-worker.js: 955 lines) [Updated: inbound_message bridge added]',
      'Direct cross-domain Supabase database queries across 73+ tables',
      'Shared Redis cache handling locks, sessions, rate limits, and flow states'
    ]
  },

  ingressHotspots: [
    {
      id: 'webhook-meta-post',
      name: 'WhatsApp Meta Webhook Handler',
      method: 'POST',
      route: '/webhook',
      sourceFile: 'bot/gateway/webhook.routes.js & bot/gateway/server.js',
      lineRange: 'bot/gateway/',
      linesOfCode: 1190,
      protocol: 'HTTPS / Webhook',
      domain: 'Gateway / Ingress',
      status: 'Decoupled',
      statusBadge: 'RESOLVED & DECOUPLED',
      riskLevel: 'Low',
      riskReason: '[RESOLVED] Decoupled from monolith into bot/gateway/webhook.routes.js and bot/gateway/server.js. Inbound payloads are normalized into canonical InboundMessageEnvelope and buffered into the queue driver in <100ms (19-45ms measured), completely protecting against Meta retry cascades.',
      securityVerification: 'Meta Webhook verification & Redis idempotency token',
      decoupledService: 'rumi-gateway',
      standaloneServer: 'bot/gateway/server.js (port 4000)',
      workerConsumer: 'bot/workers/inbound-message.worker.js',
      downstreamHandlers: [
        'IngressDispatcher (Async Queue / Sync Fallback)',
        'InboundMessageWorker.process',
        'SessionService.isProcessed',
        'handleTextMessage',
        'handleVoiceMessage',
        'interactive button dispatcher'
      ],
      targetMicroservice: 'rumi-gateway'
    },
    {
      id: 'webhook-meta-get',
      name: 'Meta Webhook Verification Challenge',
      method: 'GET',
      route: '/webhook',
      sourceFile: 'bot/gateway/adapters/whatsapp.adapter.js',
      lineRange: 'bot/gateway/',
      linesOfCode: 16,
      protocol: 'HTTPS / GET',
      domain: 'Gateway / Ingress',
      status: 'Decoupled',
      statusBadge: 'RESOLVED & DECOUPLED',
      riskLevel: 'Low',
      riskReason: '[RESOLVED] Handled by bot/gateway/adapters/whatsapp.adapter.js verifyWebhook. Wire tested with 200/403 validation.',
      securityVerification: 'hub.verify_token token matching',
      decoupledService: 'rumi-gateway',
      downstreamHandlers: ['res.status(200).send(hub.challenge)'],
      targetMicroservice: 'rumi-gateway'
    },
    {
      id: 'flow-attendance-setup',
      name: 'WhatsApp Flow: Attendance Setup',
      method: 'POST',
      route: '/api/flows/attendance-setup',
      sourceFile: 'bot/shared/routes/flow-endpoint.routes.js',
      lineRange: 'L275-L320',
      linesOfCode: 46,
      protocol: 'HTTPS / Encrypted Flow',
      domain: 'Attendance',
      riskLevel: 'High',
      riskReason: 'Combines RSA/AES-GCM decryption with classroom roster creation and student entry state loops directly in the route handler.',
      securityVerification: 'WhatsApp Flow RSA private key + AES-128-GCM encryption',
      downstreamHandlers: [
        'FlowEncryptionService.processEncryptedRequest',
        'handleSetupInit',
        'handleSetupDataExchange',
        'StudentListService'
      ],
      targetMicroservice: 'rumi-attendance'
    },
    {
      id: 'flow-attendance-marking',
      name: 'WhatsApp Flow: Attendance Marking',
      method: 'POST',
      route: '/api/flows/attendance-marking',
      sourceFile: 'bot/shared/routes/flow-endpoint.routes.js',
      lineRange: 'L81-L125',
      linesOfCode: 45,
      protocol: 'HTTPS / Encrypted Flow',
      domain: 'Attendance',
      riskLevel: 'High',
      riskReason: 'Handles batch student attendance submission. Decrypts flow payload, queries student roster, updates attendance records.',
      securityVerification: 'WhatsApp Flow RSA private key + AES-128-GCM encryption',
      downstreamHandlers: [
        'FlowEncryptionService.processEncryptedRequest',
        'handleAttendanceMarkingRequest',
        'supabase.from(attendance_records)'
      ],
      targetMicroservice: 'rumi-attendance'
    },
    {
      id: 'flow-registration',
      name: 'WhatsApp Flow: Teacher Registration',
      method: 'POST',
      route: '/api/flows/registration',
      sourceFile: 'bot/shared/routes/flow-endpoint.routes.js',
      lineRange: 'L454-L490',
      linesOfCode: 37,
      protocol: 'HTTPS / Encrypted Flow',
      domain: 'Identity & Profile',
      riskLevel: 'Medium',
      riskReason: 'Modifies user profile, school details, and grade assignments during onboarding.',
      securityVerification: 'WhatsApp Flow RSA private key + AES-128-GCM encryption',
      downstreamHandlers: [
        'FlowEncryptionService.processEncryptedRequest',
        'handleRegistrationInit',
        'handleRegistrationDataExchange',
        'supabase.from(users)'
      ],
      targetMicroservice: 'rumi-identity'
    },
    {
      id: 'flow-pic-lp',
      name: 'WhatsApp Flow: Picture to Lesson Plan',
      method: 'POST',
      route: '/api/flows/pic-lp',
      sourceFile: 'bot/shared/routes/flow-endpoint.routes.js',
      lineRange: 'L548-L585',
      linesOfCode: 38,
      protocol: 'HTTPS / Encrypted Flow',
      domain: 'Lesson Planning',
      riskLevel: 'Medium',
      riskReason: 'Confirms textbook page OCR parameters and initiates lesson plan compilation.',
      securityVerification: 'WhatsApp Flow RSA private key + AES-128-GCM encryption',
      downstreamHandlers: [
        'FlowEncryptionService.processEncryptedRequest',
        'handlePicLpInit',
        'handlePicLpDataExchange',
        'pic-lp-session.service'
      ],
      targetMicroservice: 'rumi-content'
    },
    {
      id: 'flow-quiz',
      name: 'WhatsApp Flow: Quiz Manager',
      method: 'POST',
      route: '/api/flows/quiz',
      sourceFile: 'bot/shared/routes/flow-endpoint.routes.js',
      lineRange: 'L715-L750',
      linesOfCode: 36,
      protocol: 'HTTPS / Encrypted Flow',
      domain: 'Quizzes',
      riskLevel: 'Medium',
      riskReason: 'Fetches quiz configurations and validates questions directly with Supabase.',
      securityVerification: 'WhatsApp Flow RSA private key + AES-128-GCM encryption',
      downstreamHandlers: [
        'FlowEncryptionService.processEncryptedRequest',
        'handleQuizFlowInit',
        'handleQuizFlowDataExchange',
        'supabase.from(quizzes)'
      ],
      targetMicroservice: 'rumi-quiz'
    },
    {
      id: 'flow-settings',
      name: 'WhatsApp Flow: Teacher Settings',
      method: 'POST',
      route: '/api/flows/settings',
      sourceFile: 'bot/shared/routes/flow-endpoint.routes.js',
      lineRange: 'L609-L645',
      linesOfCode: 37,
      protocol: 'HTTPS / Encrypted Flow',
      domain: 'Identity & Profile',
      riskLevel: 'Low',
      riskReason: 'Simple profile settings updates.',
      securityVerification: 'WhatsApp Flow RSA private key + AES-128-GCM encryption',
      downstreamHandlers: [
        'FlowEncryptionService.processEncryptedRequest',
        'handleSettingsInit',
        'handleSettingsDataExchange'
      ],
      targetMicroservice: 'rumi-identity'
    },
    {
      id: 'flow-student-videos',
      name: 'WhatsApp Flow: Student Videos',
      method: 'POST',
      route: '/api/flows/student-videos',
      sourceFile: 'bot/shared/routes/flow-endpoint.routes.js',
      lineRange: 'L755-L790',
      linesOfCode: 36,
      protocol: 'HTTPS / Encrypted Flow',
      domain: 'Media & Video',
      riskLevel: 'Medium',
      riskReason: 'Approves student video generation and queries video task status.',
      securityVerification: 'WhatsApp Flow RSA private key + AES-128-GCM encryption',
      downstreamHandlers: [
        'FlowEncryptionService.processEncryptedRequest',
        'handleStudentVideosInit',
        'handleStudentVideosDataExchange'
      ],
      targetMicroservice: 'rumi-media-worker'
    },
    {
      id: 'flow-homework-request',
      name: 'WhatsApp Flow: Homework Request',
      method: 'POST',
      route: '/api/flows/homework-request',
      sourceFile: 'bot/shared/routes/flow-endpoint.routes.js',
      lineRange: 'L792-L825',
      linesOfCode: 34,
      protocol: 'HTTPS / Encrypted Flow',
      domain: 'Homework & Content',
      riskLevel: 'Medium',
      riskReason: 'Fetches chapter lists and queues PDF chapter bundle compilation.',
      securityVerification: 'WhatsApp Flow RSA private key + AES-128-GCM encryption',
      downstreamHandlers: [
        'FlowEncryptionService.processEncryptedRequest',
        'handleHomeworkInit',
        'handleHomeworkDataExchange',
        'SQSQueueService.queueJob(homework_bundle_generation)'
      ],
      targetMicroservice: 'rumi-content'
    },
    {
      id: 'slack-events',
      name: 'Slack Events Ingress',
      method: 'POST',
      route: '/api/slack/events',
      sourceFile: 'bot/gateway/adapters/slack.adapter.js',
      lineRange: 'bot/gateway/',
      linesOfCode: 25,
      protocol: 'HTTPS / Webhook',
      domain: 'Multi-Channel Gateway',
      status: 'Decoupled',
      statusBadge: 'RESOLVED & DECOUPLED',
      riskLevel: 'Low',
      riskReason: '[RESOLVED] Handled by bot/gateway/adapters/slack.adapter.js with HMAC-SHA256 signature verification over raw body bytes. In queue mode, acknowledges in < 100ms and enqueues to message queue.',
      securityVerification: 'Slack HMAC-SHA256 signature verification over raw request body',
      decoupledService: 'rumi-gateway',
      downstreamHandlers: [
        'SlackSignatureService.verify',
        'slackAdapter.createSlackRouter',
        'IngressDispatcher (Async Queue / Sync Fallback)',
        'InboundMessageWorker.process'
      ],
      targetMicroservice: 'rumi-gateway'
    },
    {
      id: 'slack-interactions',
      name: 'Slack Interactivity & Modals',
      method: 'POST',
      route: '/api/slack/interactions',
      sourceFile: 'bot/shared/routes/slack-interactions.routes.js',
      lineRange: 'L136',
      linesOfCode: 15,
      protocol: 'HTTPS / Webhook',
      domain: 'Multi-Channel Gateway',
      riskLevel: 'High',
      riskReason: 'Handles Slack block kit button presses and modal view submissions. Simulates WhatsApp interactive payloads.',
      securityVerification: 'Slack HMAC-SHA256 signature verification',
      downstreamHandlers: [
        'SlackSignatureService.verify',
        'slack-modal-interactions.handler',
        'handleWebhookPost'
      ],
      targetMicroservice: 'rumi-gateway'
    },
    {
      id: 'slack-commands',
      name: 'Slack Slash Commands',
      method: 'POST',
      route: '/api/slack/commands',
      sourceFile: 'bot/shared/routes/slack-interactions.routes.js',
      lineRange: 'L137',
      linesOfCode: 15,
      protocol: 'HTTPS / Webhook',
      domain: 'Multi-Channel Gateway',
      riskLevel: 'Medium',
      riskReason: 'Form-encoded payload parsing mapped to internal bot slash commands (/quiz, /settings, /portal).',
      securityVerification: 'Slack HMAC-SHA256 signature verification',
      downstreamHandlers: [
        'SlackSignatureService.verify',
        'makeSlashCommandHandler',
        'handleWebhookPost'
      ],
      targetMicroservice: 'rumi-gateway'
    },
    {
      id: 'discord-gateway',
      name: 'Discord Gateway Persistent Inbound',
      method: 'WEBSOCKET',
      route: 'Discord Gateway (interactionCreate / messageCreate)',
      sourceFile: 'bot/shared/services/messaging/inbound/discord-events.adapter.js',
      lineRange: 'L280-L330',
      linesOfCode: 50,
      protocol: 'WebSocket / Gateway API',
      domain: 'Multi-Channel Gateway',
      riskLevel: 'High',
      riskReason: 'Persistent Discord WebSocket connection runs inside the bot process. Discord interaction timeouts are 3 seconds. Dispatches directly to handleWebhookPost.',
      securityVerification: 'Discord Bot Token & Channel ID filtering',
      downstreamHandlers: [
        'discordModalInteractions.handleModalSubmit',
        'handleWebhookPost'
      ],
      targetMicroservice: 'rumi-gateway'
    },
    {
      id: 'baileys-socket',
      name: 'WhatsApp Baileys Socket Inbound',
      method: 'WEBSOCKET',
      route: 'Baileys Multi-Device Socket (messages.upsert)',
      sourceFile: 'bot/shared/services/messaging/inbound/baileys-socket.adapter.js',
      lineRange: 'L150-L240',
      linesOfCode: 90,
      protocol: 'WebSocket / Noise Protocol',
      domain: 'Multi-Channel Gateway',
      riskLevel: 'High',
      riskReason: 'Maintains long-lived WhatsApp Web session. In-memory QR pairing and message synthesis. Session logout loops can trigger WhatsApp IP rate limits.',
      securityVerification: 'WhatsApp Web pairing credentials & multi-device auth state',
      downstreamHandlers: [
        'translateBaileysMessageToMetaShape',
        'handleWebhookPost'
      ],
      targetMicroservice: 'rumi-gateway'
    },
    {
      id: 'sqs-worker-queue',
      name: 'Asynchronous SQS / BullMQ Job Queue Ingress',
      method: 'QUEUE POLL',
      route: 'SQS FIFO / BullMQ rumi_jobs',
      sourceFile: 'bot/workers/sqs-worker.js',
      lineRange: 'L265-L415',
      linesOfCode: 151,
      protocol: 'AWS SQS / Redis BullMQ',
      domain: 'Asynchronous Workers',
      riskLevel: 'Critical',
      riskReason: 'Head-of-line blocking: 15 distinct job types with latencies from 5 seconds to 15 minutes share the same worker loop. Video generation or heavy OCR locks worker slots needed by quiz nudges.',
      securityVerification: 'AWS IAM Credentials / Redis TLS Auth',
      downstreamHandlers: [
        'CoachingService.processTranscription',
        'CoachingService.processAnalysis',
        'LessonPlanGenerationWorker.process',
        'VideoGenerationWorker.process',
        'ExamGradingWorker.process',
        'PicLpKieaiWorker.process',
        'HomeworkBundleWorker.process',
        'QuizJobHandler.handleQuizReport'
      ],
      targetMicroservice: 'rumi-media-worker & rumi-coaching'
    },
    {
      id: 'stale-session-cron',
      name: 'Stale Coaching Session Reminder Worker',
      method: 'CRON',
      route: 'stale-session.worker.js (Every 10 min)',
      sourceFile: 'bot/workers/stale-session.worker.js',
      lineRange: 'L1-L396',
      linesOfCode: 396,
      protocol: 'Scheduled Process',
      domain: 'Coaching',
      riskLevel: 'Medium',
      riskReason: 'Queries Supabase for idle sessions and directly invokes WhatsAppService to send reminder templates with interactive continue/finish buttons.',
      securityVerification: 'Internal scheduler lock in Redis',
      downstreamHandlers: [
        'supabase.from(coaching_sessions)',
        'WhatsAppService.sendTemplateMessage'
      ],
      targetMicroservice: 'rumi-coaching'
    },
    {
      id: 'admin-maintenance-api',
      name: 'Operational & Health Endpoints',
      method: 'HTTP GET/POST',
      route: '/health, /stats, /clear-history/:userId, /api/internal/send-password-reset',
      sourceFile: 'bot/whatsapp-bot.js',
      lineRange: 'L1660-L1740',
      linesOfCode: 80,
      protocol: 'HTTPS / REST',
      domain: 'System & Admin',
      riskLevel: 'Low',
      riskReason: 'Basic diagnostics and operator reset endpoints.',
      securityVerification: 'None on /health; IP restriction recommended',
      downstreamHandlers: [
        'supabase.from(users)',
        'redis.del',
        'SessionService.clearHistory'
      ],
      targetMicroservice: 'rumi-gateway'
    }
  ],

  secondaryDispatchers: [
    {
      file: 'bot/shared/handlers/text-message.handler.js',
      linesOfCode: 2624,
      cyclomaticComplexity: 'Very High',
      role: 'Mega-Dispatcher for Text Messages',
      domainsSpanned: [
        'Quiz State Machine',
        'Teacher Onboarding & Name Entry',
        'Language Preference Override',
        'Video Quiz Social Sharing Codes',
        'Homework Text Triggers',
        'Classroom Edit Intents',
        'Coaching Reflective Stepper',
        'Curriculum Pre-gen Shelf Lookup',
        'Admin /portal Invites'
      ],
      deconstructionAction: 'Split into domain-specific event consumers subscribed to topic.inbound.messages'
    },
    {
      file: 'bot/shared/handlers/voice-message.handler.js',
      linesOfCode: 1314,
      cyclomaticComplexity: 'High',
      role: 'Mega-Dispatcher for Voice / Audio Notes',
      domainsSpanned: [
        'Audio Ingestion & Local Disk Temp Staging',
        'Cloudflare R2 Audio Upload',
        'Multi-Engine STT Routing (Soniox, MMS, Whisper)',
        'Coaching Audio Reflection Pipeline',
        'Voice Attendance Marking Detection',
        'General Conversational Voice Responses'
      ],
      deconstructionAction: 'Route directly to rumi-coaching or rumi-attendance based on teacher active session state'
    },
    {
      file: 'bot/shared/handlers/image-message.handler.js',
      linesOfCode: 769,
      cyclomaticComplexity: 'High',
      role: 'Mega-Dispatcher for Photos & Worksheets',
      domainsSpanned: [
        'Coaching Classroom Photos',
        'Exam Checker OCR & Grading',
        'Pic-to-LP Textbook Page Extraction',
        'Generic Multimodal Vision Analysis'
      ],
      deconstructionAction: 'Extract into rumi-content (Pic-to-LP) and rumi-media-worker (Exam grading)'
    },
    {
      file: 'bot/shared/handlers/flow-response.handler.js',
      linesOfCode: 728,
      cyclomaticComplexity: 'Medium',
      role: 'WhatsApp NFM_REPLY Submission Dispatcher',
      domainsSpanned: [
        'Reading Assessment Flow Response',
        'Attendance Setup Confirmation',
        'Attendance Marking Acknowledgment'
      ],
      deconstructionAction: 'Route NFM_REPLY completions to specific domain service topics'
    }
  ],

  targetMicroservices: [
    {
      id: 'rumi-gateway',
      name: 'Edge & Channel Gateway',
      shortDescription: 'Unified Webhook Receiver, Protocol Normalizer & Ingress Buffer [LIVE & OPERATIONAL]',
      color: '#10b981',
      phase: 1,
      status: 'Extracted & Operational',
      statusBadge: 'COMPLETED (Phases 1, 2, 3)',
      isExtracted: true,
      migrationPriority: 'Phase 1 - Complete & Verified',
      migrationDifficulty: 'Resolved',
      standaloneServer: 'bot/gateway/server.js (port 4000)',
      testCoverage: '130 gateway tests, 40/40 differential verification tests, 7/7 legacy baseline wire tests (100% wire parity, zero divergence)',
      sourceFiles: [
        'bot/gateway/server.js (Standalone HTTP microservice entry point on port 4000)',
        'bot/gateway/webhook.routes.js (Express router for /webhook & /api/slack)',
        'bot/gateway/envelope.js (Canonical InboundMessageEnvelope factory)',
        'bot/gateway/ingress-dispatcher.js (Sync/Async queue dispatcher)',
        'bot/gateway/adapters/whatsapp.adapter.js (Meta handshake & payload normalizer)',
        'bot/gateway/adapters/slack.adapter.js (Slack HMAC & payload normalizer)',
        'bot/workers/inbound-message.worker.js (Asynchronous queue consumer)',
        'bot/shared/services/queue/memory-queue.service.js (16-method in-memory queue driver)'
      ],
      databaseTables: [],
      consumedEvents: ['HTTPS Webhooks (Meta, Slack)', 'WebSocket Frames (Discord, Baileys)'],
      producedEvents: ['topic.inbound.messages', 'topic.inbound.flows', 'topic.delivery.receipts'],
      keyBenefits: [
        'Guarantees <100ms 200 OK responses to Meta (19-45ms measured), eliminating retry cascades',
        'Zero require-time database dependencies (standalone server boots independently without Supabase)',
        'Pluggable queue buffer (AWS SQS, BullMQ/Redis, or in-memory 16-method driver)',
        'Redis-backed idempotency & deduplication protects all downstream workers',
        '100% wire-compatible with legacy baseline characterization tests'
      ]
    },
    {
      id: 'rumi-identity',
      name: 'Identity & Channel Linker',
      shortDescription: 'Teacher Profiles, Multi-Channel Identity & Preferences',
      color: '#ec4899',
      phase: 2,
      migrationPriority: 'Phase 2 - Foundation',
      migrationDifficulty: 'Low-Medium',
      sourceFiles: [
        'bot/shared/database/bot-helpers.js',
        'bot/shared/services/feature-registration.service.js',
        'bot/shared/services/teacher-state.service.js',
        'bot/shared/utils/language-cache.js'
      ],
      databaseTables: [
        'users',
        'user_channels',
        'dashboard_users',
        'portal_organizations',
        'access_scopes',
        'feature_permissions',
        'invitations',
        'user_feature_first_use'
      ],
      consumedEvents: ['topic.inbound.messages (Registration triggers)'],
      producedEvents: ['topic.user.registered', 'topic.user.updated'],
      keyBenefits: [
        'Encapsulates user identity resolution across WhatsApp, Slack, and Discord',
        'Isolates teacher onboarding and preference caching'
      ]
    },
    {
      id: 'rumi-coaching',
      name: 'Teacher Coaching Engine',
      shortDescription: 'Pedagogical Dialog, Audio STT & Reflection Reports',
      color: '#8b5cf6',
      phase: 3,
      migrationPriority: 'Phase 3 - High Value',
      migrationDifficulty: 'High',
      sourceFiles: [
        'bot/shared/services/coaching-orchestrator.service.js',
        'bot/shared/services/coaching/*',
        'bot/shared/services/audio.service.js',
        'bot/workers/stale-session.worker.js'
      ],
      databaseTables: [
        'coaching_sessions',
        'coaching_quality_metrics',
        'audio_sessions',
        'teacher_facts',
        'teacher_progress'
      ],
      consumedEvents: ['topic.inbound.messages (Coaching voice/text notes)'],
      producedEvents: ['topic.coaching.completed', 'topic.outbound.messages'],
      keyBenefits: [
        'Removes heavy audio transcoding and multi-step dialog state from core bot',
        'Enables independent scaling for transcription and reflection generation'
      ]
    },
    {
      id: 'rumi-reading',
      name: 'Reading Assessment Service',
      shortDescription: 'EGRA / DIBELS / ASER Oral Reading & Scoring',
      color: '#10b981',
      phase: 2,
      migrationPriority: 'Phase 2 - Quick Win',
      migrationDifficulty: 'Low',
      sourceFiles: [
        'bot/shared/services/reading-assessment.service.js',
        'bot/shared/services/reading/*',
        'bot/shared/routes/reading-assessment-endpoint.js'
      ],
      databaseTables: [
        'reading_assessments',
        'lcpm_benchmarks',
        'wcpm_percentiles'
      ],
      consumedEvents: ['topic.inbound.messages (/reading test, student audio)'],
      producedEvents: ['topic.reading.scored', 'topic.outbound.messages'],
      keyBenefits: [
        'Cleanest domain boundary in the system',
        'Can be deployed independently with its own reading benchmark tables'
      ]
    },
    {
      id: 'rumi-content',
      name: 'Lesson Planning & Content Service',
      shortDescription: 'Pic-to-LP OCR, Curriculum Shelf & Homework Bundles',
      color: '#f59e0b',
      phase: 2,
      migrationPriority: 'Phase 2 - Modular',
      migrationDifficulty: 'Medium',
      sourceFiles: [
        'bot/shared/services/pic-to-lp/*',
        'bot/shared/services/lp-shelf.service.js',
        'bot/shared/services/toc-loading.service.js',
        'bot/workers/lesson-plan-extraction.worker.js',
        'bot/workers/homework-bundle.worker.js'
      ],
      databaseTables: [
        'lesson_plans',
        'lesson_plan_requests',
        'pre_generated_lps',
        'pic_lp_sessions',
        'homework_chapters',
        'textbook_toc'
      ],
      consumedEvents: ['topic.inbound.messages (Lesson plan requests, photos)'],
      producedEvents: ['topic.content.generated', 'topic.outbound.messages'],
      keyBenefits: [
        'Offloads PDF compilation and Kie.ai OCR orchestration',
        'Owns curriculum textbook table of contents and homework assets'
      ]
    },
    {
      id: 'rumi-quiz',
      name: 'Interactive Quiz & Assessment Engine',
      shortDescription: 'Comprehension Quizzes, Video Quizzes & Nudges',
      color: '#06b6d4',
      phase: 3,
      migrationPriority: 'Phase 3 - High Traffic',
      migrationDifficulty: 'Medium',
      sourceFiles: [
        'bot/shared/services/quiz/*',
        'bot/shared/services/redis-comprehension.service.js',
        'bot/workers/quiz-job-handler.js'
      ],
      databaseTables: [
        'quizzes',
        'quiz_sessions',
        'quiz_questions',
        'quiz_answers'
      ],
      consumedEvents: ['topic.inbound.messages (A/B/C answers, /quiz commands)'],
      producedEvents: ['topic.quiz.completed', 'topic.outbound.messages'],
      keyBenefits: [
        'Encapsulates fast Redis-backed question/answer progression',
        'Decouples delayed reminder scheduling from worker main loop'
      ]
    },
    {
      id: 'rumi-attendance',
      name: 'School Operations & Attendance',
      shortDescription: 'Student Rosters, Flow Data Exchange & Voice Attendance',
      color: '#14b8a6',
      phase: 2,
      migrationPriority: 'Phase 2 - High Cleanliness',
      migrationDifficulty: 'Low-Medium',
      sourceFiles: [
        'bot/shared/services/student-list.service.js',
        'bot/shared/services/attendance-*.service.js',
        'bot/shared/routes/attendance-*-endpoint.js'
      ],
      databaseTables: [
        'attendance_sessions',
        'attendance_records',
        'student_lists',
        'students'
      ],
      consumedEvents: ['topic.inbound.flows (Attendance setup/marking)'],
      producedEvents: ['topic.attendance.marked', 'topic.outbound.messages'],
      keyBenefits: [
        'Completely self-contained student data and classroom attendance models',
        'Removes largest encrypted Flow handlers from the core Express app'
      ]
    },
    {
      id: 'rumi-media-worker',
      name: 'Heavy Media Worker Cluster',
      shortDescription: 'AI Video Synthesis, Exam OCR & Document Rendering',
      color: '#ef4444',
      phase: 1,
      migrationPriority: 'Phase 1 - Immediate',
      migrationDifficulty: 'Low',
      sourceFiles: [
        'bot/workers/video-generation.worker.js',
        'bot/workers/exam-grading.worker.js',
        'bot/workers/pic-lp-kieai.worker.js'
      ],
      databaseTables: [
        'video_requests',
        'video_tasks',
        'student_videos',
        'student_video_feedback',
        'exam_check_sessions',
        'exam_submissions',
        'exam_grades'
      ],
      consumedEvents: ['topic.jobs.media_heavy'],
      producedEvents: ['topic.media.ready', 'topic.outbound.messages'],
      keyBenefits: [
        'Eliminates head-of-line blocking in the shared SQS queue',
        'Can be scaled independently on GPU/high-compute instances'
      ]
    },
    {
      id: 'rumi-notifications',
      name: 'Outbound Messaging Hub',
      shortDescription: 'Rate Limiting, Channel Delivery & Scheduled Broadcasts',
      color: '#a855f7',
      phase: 1,
      migrationPriority: 'Phase 1 - Immediate',
      migrationDifficulty: 'Low-Medium',
      sourceFiles: [
        'bot/shared/services/whatsapp.service.js',
        'bot/shared/services/messaging/*',
        'bot/workers/brief.worker.js'
      ],
      databaseTables: [
        'broadcast_logs',
        'broadcast_messages',
        'release_notes'
      ],
      consumedEvents: ['topic.outbound.messages'],
      producedEvents: ['topic.delivery.receipts'],
      keyBenefits: [
        'Provides a single outbound interface for Meta Cloud API, Baileys, Slack, and Discord',
        'Enforces rate limits and backoff per phone number / tenant'
      ]
    }
  ],

  databaseDomains: [
    {
      domainName: 'Users & Identity',
      tableCount: 4,
      tables: [
        { name: 'users', status: 'active', accessedBy: ['whatsapp-bot.js', 'text-message.handler.js', 'flow-endpoint.routes.js'] },
        { name: 'user_channels', status: 'active', accessedBy: ['whatsapp-bot.js', 'channel-registry.js'] },
        { name: 'dashboard_users', status: 'active', accessedBy: ['dashboard/index.js'] },
        { name: 'access_scopes', status: 'active', accessedBy: ['bot-helpers.js'] }
      ]
    },
    {
      domainName: 'Conversation State',
      tableCount: 6,
      tables: [
        { name: 'conversations', status: 'active', accessedBy: ['bot-helpers.js', 'dashboard'] },
        { name: 'chat_sessions', status: 'active', accessedBy: ['bot-helpers.js', 'session.service.js'] },
        { name: 'chat_starts', status: 'active', accessedBy: ['whatsapp-bot.js'] },
        { name: 'cta_clicks', status: 'active', accessedBy: ['whatsapp-bot.js'] },
        { name: 'feature_suggestions', status: 'active', accessedBy: ['text-message.handler.js'] },
        { name: 'user_feature_first_use', status: 'active', accessedBy: ['feature-intro.service.js'] }
      ]
    },
    {
      domainName: 'Teacher Coaching',
      tableCount: 3,
      tables: [
        { name: 'coaching_sessions', status: 'active', accessedBy: ['whatsapp-bot.js', 'voice-message.handler.js', 'sqs-worker.js', 'stale-session.worker.js'] },
        { name: 'coaching_quality_metrics', status: 'active', accessedBy: ['sqs-worker.js'] },
        { name: 'audio_sessions', status: 'active', accessedBy: ['voice-message.handler.js', 'bot-helpers.js'] }
      ]
    },
    {
      domainName: 'Lesson Plans & Content',
      tableCount: 4,
      tables: [
        { name: 'lesson_plans', status: 'active', accessedBy: ['text-message.handler.js', 'sqs-worker.js'] },
        { name: 'lesson_plan_requests', status: 'active', accessedBy: ['sqs-worker.js'] },
        { name: 'pre_generated_lps', status: 'active', accessedBy: ['lp-shelf.service.js'] },
        { name: 'pic_lp_sessions', status: 'active', accessedBy: ['image-message.handler.js', 'sqs-worker.js'] }
      ]
    },
    {
      domainName: 'Reading Assessment',
      tableCount: 3,
      tables: [
        { name: 'reading_assessments', status: 'active', accessedBy: ['reading-assessment.service.js', 'flow-response.handler.js'] },
        { name: 'lcpm_benchmarks', status: 'declared', accessedBy: ['reading benchmark calculations'] },
        { name: 'wcpm_percentiles', status: 'declared', accessedBy: ['reading benchmark calculations'] }
      ]
    },
    {
      domainName: 'Quizzes & Engagement',
      tableCount: 4,
      tables: [
        { name: 'quizzes', status: 'active', accessedBy: ['text-message.handler.js', 'flow-endpoint.routes.js'] },
        { name: 'quiz_sessions', status: 'active', accessedBy: ['text-message.handler.js', 'redis-comprehension.service.js'] },
        { name: 'quiz_questions', status: 'active', accessedBy: ['sqs-worker.js'] },
        { name: 'quiz_answers', status: 'active', accessedBy: ['text-message.handler.js'] }
      ]
    },
    {
      domainName: 'Attendance & Rosters',
      tableCount: 4,
      tables: [
        { name: 'attendance_sessions', status: 'active', accessedBy: ['flow-endpoint.routes.js', 'voice-message.handler.js'] },
        { name: 'attendance_records', status: 'active', accessedBy: ['flow-endpoint.routes.js'] },
        { name: 'student_lists', status: 'active', accessedBy: ['student-list.service.js', 'flow-endpoint.routes.js'] },
        { name: 'students', status: 'active', accessedBy: ['student-list.service.js', 'flow-endpoint.routes.js'] }
      ]
    },
    {
      domainName: 'Exam Grading',
      tableCount: 4,
      tables: [
        { name: 'exam_check_sessions', status: 'active', accessedBy: ['image-message.handler.js', 'flow-endpoint.routes.js'] },
        { name: 'exam_submissions', status: 'active', accessedBy: ['exam-grading.worker.js'] },
        { name: 'exam_grades', status: 'active', accessedBy: ['exam-grading.worker.js'] },
        { name: 'image_analysis_requests', status: 'active', accessedBy: ['image-message.handler.js'] }
      ]
    },
    {
      domainName: 'Video Generation',
      tableCount: 4,
      tables: [
        { name: 'video_requests', status: 'active', accessedBy: ['text-message.handler.js', 'sqs-worker.js'] },
        { name: 'video_tasks', status: 'active', accessedBy: ['video-generation.worker.js'] },
        { name: 'student_videos', status: 'active', accessedBy: ['student-videos-endpoint.js'] },
        { name: 'student_video_feedback', status: 'active', accessedBy: ['student-video-feedback.service.js'] }
      ]
    },
    {
      domainName: 'Homework & Textbooks',
      tableCount: 2,
      tables: [
        { name: 'homework_chapters', status: 'active', accessedBy: ['homework-request-endpoint.js', 'sqs-worker.js'] },
        { name: 'textbook_toc', status: 'active', accessedBy: ['toc-loading.service.js'] }
      ]
    },
    {
      domainName: 'Broadcasts & Logging',
      tableCount: 4,
      tables: [
        { name: 'broadcast_logs', status: 'active', accessedBy: ['brief.worker.js', 'whatsapp-bot.js'] },
        { name: 'broadcast_messages', status: 'active', accessedBy: ['brief.worker.js'] },
        { name: 'website_visits', status: 'active', accessedBy: ['whatsapp-bot.js'] },
        { name: 'api_usage_log', status: 'active', accessedBy: ['structured-logger.js'] }
      ]
    }
  ],

  networkGraph: {
    nodes: [
      { id: 'meta-webhook', label: 'Meta Webhook (/webhook)', category: 'ingress', domain: 'Gateway' },
      { id: 'flow-routes', label: 'Flow Endpoints (/api/flows)', category: 'ingress', domain: 'Gateway' },
      { id: 'slack-routes', label: 'Slack Router (/api/slack)', category: 'ingress', domain: 'Gateway' },
      { id: 'discord-ws', label: 'Discord Gateway WS', category: 'ingress', domain: 'Gateway' },
      { id: 'baileys-ws', label: 'Baileys Multi-Device WS', category: 'ingress', domain: 'Gateway' },
      
      { id: 'rumi-gateway', label: 'rumi-gateway (Microservice)', category: 'gateway', domain: 'Gateway', status: 'completed' },
      { id: 'sqs-queue', label: 'SQS / BullMQ Job Queue', category: 'queue', domain: 'Worker Hub' },
      { id: 'memory-queue', label: 'Memory Queue Driver (16-method)', category: 'queue', domain: 'Worker Hub', status: 'completed' },
      { id: 'inbound-worker', label: 'inbound-message.worker.js', category: 'worker', domain: 'Worker Hub', status: 'completed' },
      
      { id: 'whatsapp-bot', label: 'whatsapp-bot.js (Monolith Core)', category: 'core', domain: 'Gateway' },
      { id: 'text-handler', label: 'text-message.handler.js', category: 'dispatcher', domain: 'Core' },
      { id: 'voice-handler', label: 'voice-message.handler.js', category: 'dispatcher', domain: 'Audio' },
      { id: 'image-handler', label: 'image-message.handler.js', category: 'dispatcher', domain: 'Vision' },
      { id: 'flow-response-handler', label: 'flow-response.handler.js', category: 'dispatcher', domain: 'Flows' },
      { id: 'sqs-worker', label: 'sqs-worker.js (Job Dispatcher)', category: 'worker', domain: 'Worker Hub' },

      { id: 'svc-coaching', label: 'Coaching Orchestrator', category: 'service', domain: 'Coaching' },
      { id: 'svc-reading', label: 'Reading Assessment Service', category: 'service', domain: 'Reading' },
      { id: 'svc-lp', label: 'Lesson Plan & Pic-to-LP', category: 'service', domain: 'Lesson Planning' },
      { id: 'svc-quiz', label: 'Quiz & Comprehension Engine', category: 'service', domain: 'Quizzes' },
      { id: 'svc-attendance', label: 'Attendance & Rosters', category: 'service', domain: 'Attendance' },
      { id: 'svc-video', label: 'Video Generation Worker', category: 'service', domain: 'Media' },
      { id: 'svc-exam', label: 'Exam Grading Worker', category: 'service', domain: 'Exam' },
      { id: 'svc-outbound', label: 'Messaging Router (Outbound)', category: 'service', domain: 'Messaging' },

      { id: 'db-supabase', label: 'Supabase DB (77 Tables)', category: 'database', domain: 'Storage' },
      { id: 'cache-redis', label: 'Redis (Idempotency, Flows, Locks)', category: 'cache', domain: 'Storage' },
      { id: 'storage-r2', label: 'Cloudflare R2 (Media/Audio)', category: 'storage', domain: 'Storage' },
      { id: 'ext-llm', label: 'OpenRouter / OpenAI APIs', category: 'external', domain: 'AI' }
    ],
    edges: [
      { from: 'meta-webhook', to: 'rumi-gateway', label: 'HTTP GET/POST /webhook' },
      { from: 'slack-routes', to: 'rumi-gateway', label: 'HTTP POST /api/slack/*' },
      { from: 'flow-routes', to: 'whatsapp-bot', label: 'Mount /api/flows' },
      { from: 'discord-ws', to: 'whatsapp-bot', label: 'attachInbound' },
      { from: 'baileys-ws', to: 'whatsapp-bot', label: 'attachInbound' },

      { from: 'rumi-gateway', to: 'sqs-queue', label: 'Enqueue Inbound (< 100ms)' },
      { from: 'rumi-gateway', to: 'memory-queue', label: 'Zero-Cred In-Memory Queue' },
      { from: 'rumi-gateway', to: 'whatsapp-bot', label: 'Sync In-Process (Phase 1)' },

      { from: 'sqs-queue', to: 'inbound-worker', label: 'Pull inbound_message' },
      { from: 'memory-queue', to: 'inbound-worker', label: 'Direct Pull Jobs' },
      { from: 'inbound-worker', to: 'cache-redis', label: 'SessionService.isProcessed Dedup' },
      { from: 'inbound-worker', to: 'whatsapp-bot', label: 'Dispatch to Monolith Handlers' },

      { from: 'whatsapp-bot', to: 'text-handler', label: 'Route Text' },
      { from: 'whatsapp-bot', to: 'voice-handler', label: 'Route Voice' },
      { from: 'whatsapp-bot', to: 'image-handler', label: 'Route Image' },
      { from: 'whatsapp-bot', to: 'flow-response-handler', label: 'Route Flow Reply' },
      { from: 'whatsapp-bot', to: 'cache-redis', label: 'Dedup Lock' },
      { from: 'whatsapp-bot', to: 'db-supabase', label: 'getOrCreateUser' },

      { from: 'text-handler', to: 'svc-coaching', label: 'Coaching Chat' },
      { from: 'text-handler', to: 'svc-reading', label: '/reading test' },
      { from: 'text-handler', to: 'svc-lp', label: 'LP Commands' },
      { from: 'text-handler', to: 'svc-quiz', label: 'Answers A/B/C' },
      { from: 'text-handler', to: 'ext-llm', label: 'Chat Completion' },
      { from: 'text-handler', to: 'db-supabase', label: 'Read/Write User State' },

      { from: 'voice-handler', to: 'svc-coaching', label: 'Audio Debrief' },
      { from: 'voice-handler', to: 'svc-attendance', label: 'Voice Attendance' },
      { from: 'voice-handler', to: 'storage-r2', label: 'Store Audio' },

      { from: 'image-handler', to: 'svc-exam', label: 'Worksheet Photo' },
      { from: 'image-handler', to: 'svc-lp', label: 'Textbook Photo' },

      { from: 'svc-coaching', to: 'sqs-queue', label: 'Queue Transcription/Report' },
      { from: 'svc-lp', to: 'sqs-queue', label: 'Queue Extraction' },
      { from: 'svc-quiz', to: 'sqs-queue', label: 'Queue Quiz Reports' },

      { from: 'sqs-queue', to: 'sqs-worker', label: 'Poll Messages' },
      { from: 'sqs-worker', to: 'svc-coaching', label: 'Exec Transcription' },
      { from: 'sqs-worker', to: 'svc-video', label: 'Exec Video Gen' },
      { from: 'sqs-worker', to: 'svc-exam', label: 'Exec Exam Grading' },
      { from: 'sqs-worker', to: 'svc-lp', label: 'Exec Kie.ai Gen' },

      { from: 'svc-coaching', to: 'svc-outbound', label: 'Send Reply' },
      { from: 'svc-reading', to: 'svc-outbound', label: 'Send Report' },
      { from: 'svc-quiz', to: 'svc-outbound', label: 'Send Question' },
      { from: 'svc-attendance', to: 'svc-outbound', label: 'Send Roster' },
      { from: 'svc-outbound', to: 'meta-webhook', label: 'WhatsApp Send API' }
    ]
  }
};

module.exports = architectureData;
