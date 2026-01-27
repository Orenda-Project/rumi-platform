/**
 * Rumi - Admin Dashboard
 *
 * Provides a web interface for monitoring bot activity and viewing conversations
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const { requireAuth, redirectIfAuthenticated, addUserToLocals, isAdminRole } = require('./middleware/auth');
const { timeoutMiddleware } = require('./middleware/timeout');
const { latencyLogger } = require('./middleware/latency-logger');
const {
  setDatabaseContext,
  requireSuperAdmin,
  requireAdmin,
  requirePartnerAdmin,
  requireFeatureAccess
} = require('./middleware/rbac');
const AuthService = require('./services/auth.service');
const {
  getDashboardStatsOptimized,
  getDashboardStatsForPeriod,
  getAllUsersOptimized,
  getUserConversations,
  getUserById,
  getRecentActivity,
  getSessionAnalytics,
  getFunnelMetrics,
  getFunnelMetricsByDate,
  getTrafficSources,
  getUserCoachingSessions,
  getUserLessonPlans,
  getUserVideoRequests,
  getUserReadingSessions,
  // Release Notes
  getRecentReleaseNotes,
  getReleaseNotes
} = require('./database/queries');

// Coaching Observability Service
const { getCoachingSessions, getStatusStats } = require('./services/coaching-observability.service');

// Transcript UX Helpers (Phase 7 - etv-ux01)
const transcriptUxHelpers = require('./services/transcript-ux-helpers.service');

// GPT Response Cache (plt-cch01)
const { setRedisClient: setGptCacheRedisClient } = require('./services/gpt-cache.service');

// Video Observability Service
const { getVideos, getVideoById, getVideoStats, getVideosByDate, getUsersWithVideos } = require('./services/video-observability.service');

// Retention Analytics Service
const {
  getRetentionData,
  getRetentionCurve,
  getRetentionSummary,
  formatCohortWeek,
  getRetentionColorClass
} = require('./services/retention.service');

// AMA (Ask Me Anything) Service
const AMAService = require('./services/ama.service');

// Access Scope Service (for partner admin RBAC)
const accessScopeService = require('./services/access-scope.service');

// Materialized Views Service (bd-045: Partner scope filtering)
const materializedViews = require('./services/materialized-views.service');

// Invitation Service (for partner admin invitations)
const invitationService = require('./services/invitation.service');

// Resend Email Service
const getResendEmailService = require('./services/resend-email.service');
const resendEmailService = getResendEmailService();

// R2 Storage Service (for file proxying and presigned URLs)
const { downloadFromR2, streamFromR2, extractKeyFromUrl, getContentTypeFromKey, generatePresignedUrl, isValidR2Url } = require('./services/r2.service');

// Transcript Processor Service (GPT-4o-mini for Urdu word spacing & section grouping)
const { processTranscript, fallbackParse } = require('./services/transcript-processor.service');

// Portal SQS Service (for async transcript processing via SQS worker)
// plt-sqs01: Offloads GPT-4o-mini processing to reduce Portal latency
const PortalSQSService = require('./services/queue/portal-sqs.service');

// In-memory store for transcript processing status (for loading screen polling)
// Structure: { sessionId: { status: 'processing'|'completed'|'error', processedData: {}, error: null, startedAt: Date } }
const transcriptProcessingStatus = new Map();

// Clean up old entries every 5 minutes (keep for 10 minutes max)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of transcriptProcessingStatus.entries()) {
    if (now - value.startedAt > 10 * 60 * 1000) {
      transcriptProcessingStatus.delete(key);
    }
  }
}, 5 * 60 * 1000);

// PDF Generation for transcripts
// PDFDocument removed - transcripts now rendered as HTML for proper Urdu/RTL support

// Email Service (using Resend API - has credentials configured)
const getEmailService = require('./services/resend-email.service');

// Supabase
const supabase = require('./config/supabase');

// API Health Routes
const apiHealthRoutes = require('./routes/api-health.routes');

// Funnel Tracking Routes
const funnelTrackingRoutes = require('./routes/funnel-tracking.routes');

// Settings Routes
const settingsRoutes = require('./routes/settings');

// Word Cloud Routes
const wordCloudRoutes = require('./routes/wordcloud');

// Teacher Portal Routes
const portalRoutes = require('./routes/portal.routes');

// BYOF Routes (Build Your Own Feature) - Conversational AI for bug/feature planning
const byofRoutes = require('./routes/byof.routes');

const app = express();
const PORT = process.env.PORT || process.env.DASHBOARD_PORT || 4000;

// Make Supabase available to all routes
app.locals.supabase = supabase;

// Trust Railway proxy (required for rate limiting and sessions)
app.set('trust proxy', 1);

// Admin credentials (hashed password)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
if (!ADMIN_PASSWORD_HASH) {
  console.warn('⚠️  ADMIN_PASSWORD_HASH not set. Dashboard login will be disabled until configured.');
}

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Latency logging middleware (plt-mon01)
// Tracks request duration and alerts on slow requests
app.use(latencyLogger);

// Request timeout middleware (plt-tout01)
// Prevents hung requests from blocking workers indefinitely
app.use(timeoutMiddleware);

// Redis client for session store with fallback (plt-sfb01)
// Falls back to MemoryStore if Redis is unavailable or fails
let sessionStore;
let redisClient = null;
let redisConnected = false;

if (process.env.REDIS_URL) {
  try {
    redisClient = createClient({ url: process.env.REDIS_URL });

    // Track connection state
    redisClient.on('error', (err) => {
      console.error('❌ Redis client error:', err.message);
      redisConnected = false;
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected for session store');
      redisConnected = true;
      // Initialize GPT cache with Redis client (plt-cch01)
      setGptCacheRedisClient(redisClient);
    });

    redisClient.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
    });

    redisClient.on('end', () => {
      console.warn('⚠️  Redis connection closed');
      redisConnected = false;
      // Disable GPT cache when Redis disconnects (plt-cch01)
      setGptCacheRedisClient(null);
    });

    // Attempt connection with timeout
    const connectPromise = redisClient.connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis connection timeout (5s)')), 5000)
    );

    Promise.race([connectPromise, timeoutPromise])
      .then(() => {
        console.log('🔐 Using Redis session store (connected)');
      })
      .catch((err) => {
        console.warn(`⚠️  Redis connection failed: ${err.message}`);
        console.warn('⚠️  Sessions will use MemoryStore fallback');
      });

    // Create RedisStore - it will queue operations until connected
    sessionStore = new RedisStore({
      client: redisClient,
      prefix: 'obs-sess:'
    });

  } catch (error) {
    console.error('❌ Failed to initialize Redis client:', error.message);
    console.warn('⚠️  Falling back to MemoryStore');
    sessionStore = undefined;
  }
} else {
  console.warn('⚠️  REDIS_URL not set - using MemoryStore (not recommended for production)');
}

// If sessionStore is still undefined, we'll use express-session's default MemoryStore
if (!sessionStore) {
  console.log('📦 Using in-memory session store');
}

// SECURITY: Session configuration with enhanced security
// UPDATED: sameSite changed to 'lax' since frontend and backend are now on same domain
app.use(session({
  store: sessionStore, // Redis store if available, otherwise MemoryStore
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  name: 'rumi.sid', // Custom name (hide that it's express-session)
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // HTTPS only
    httpOnly: true, // Prevents client-side JS from accessing cookie
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax', // CHANGED: 'lax' works for same-domain setup (was 'none' for cross-origin)
    // NOTE: Now serving frontend from same domain, no CORS needed for cookies
  }
}));

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts (increased from 5 for better UX)
  message: 'Too many login attempts, please try again later.'
});

// Rate limiting for tracking endpoints (prevent abuse)
const trackingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute per IP
  message: 'Too many tracking requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// SECURITY: Aggressive rate limiting for portal authentication endpoints
// TEMPORARY: DISABLED FOR TESTING - MUST RE-ENABLE BEFORE PRODUCTION
// PRODUCTION VALUES: windowMs: 60 * 60 * 1000 (1 hour), max: 10
const portalAuthLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // TEMP: 1 minute
  max: 10000, // TEMP: Effectively disabled
  message: 'Too many requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests, not just failed ones
  // Generate key using IP + endpoint to prevent cross-endpoint abuse
  keyGenerator: (req) => {
    return `${req.ip}-${req.path}`;
  }
});

// SECURITY: Extra strict rate limiting for public validation endpoints (prevent enumeration)
// TEMPORARY: DISABLED FOR TESTING - MUST RE-ENABLE BEFORE PRODUCTION
// PRODUCTION VALUES: windowMs: 60 * 60 * 1000 (1 hour), max: 5
const publicValidationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // TEMP: 1 minute
  max: 10000, // TEMP: Effectively disabled
  message: 'Too many requests. Please try again in an hour.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

// Rate limiting for portal data endpoints (more generous)
// TEMPORARY: DISABLED FOR TESTING - MUST RE-ENABLE BEFORE PRODUCTION
// PRODUCTION VALUES: windowMs: 1 * 60 * 1000 (1 minute), max: 30
const portalDataLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10000, // TEMP: Effectively disabled (was 30)
  message: 'Too many requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false
});

// CORS configuration for tracking endpoints
const WEBSITE_URL = process.env.WEBSITE_URL || 'https://your-website-domain.com';
const PORTAL_URL = process.env.PORTAL_URL || 'https://your-portal-domain.com';

const trackingCorsOptions = {
  origin: [
    WEBSITE_URL,
    WEBSITE_URL.replace('https://www.', 'https://'),
    'http://localhost:3000', // For local testing
    'http://127.0.0.1:3000'
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
  maxAge: 86400 // Cache preflight for 24 hours
};

// CORS configuration for teacher portal endpoints
const portalCorsOptions = {
  origin: [
    PORTAL_URL,
    WEBSITE_URL, // Allow main website too (for navigation link)
    WEBSITE_URL.replace('https://www.', 'https://'),
    'http://localhost:5173', // Vite dev server default port
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000'
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true, // Required for session cookies
  maxAge: 86400 // Cache preflight for 24 hours
};

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make user session available in all templates
app.use(addUserToLocals);

// RBAC: Set database context for RLS enforcement
// CRITICAL: This must come AFTER session middleware
app.use(setDatabaseContext);

// ============================================================================
// ROUTES
// ============================================================================

// ============================================================================
// OBSERVABILITY DASHBOARD (Admin Panel) - All routes under /observability/*
// ============================================================================

// Redirect root /observability to login if not authenticated
app.get('/observability', (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    res.redirect('/observability/dashboard');
  } else {
    res.redirect('/observability/login');
  }
});

// Login page for observability dashboard (admin panel)
app.get('/observability/login', redirectIfAuthenticated, async (req, res) => {
  const success = req.query.reset === 'success'
    ? 'Password reset successful! You can now log in with your new password.'
    : null;

  // Fetch recent release notes for the floating feed (all 20 for scrolling)
  let releaseNotes = [];
  try {
    releaseNotes = await getRecentReleaseNotes(20);
  } catch (err) {
    console.error('Error fetching release notes:', err);
  }

  res.render('login', {
    error: null,
    success: success,
    title: 'Admin Login - Observability Dashboard',
    releaseNotes: releaseNotes
  });
});

// Login POST for observability dashboard
app.post('/observability/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  // Fetch release notes for error pages too (all 20 for scrolling)
  let releaseNotes = [];
  try {
    releaseNotes = await getRecentReleaseNotes(20);
  } catch (err) {
    console.error('Error fetching release notes:', err);
  }

  if (!username || !password) {
    return res.render('login', {
      error: 'Please provide both username and password',
      title: 'Admin Login - Observability Dashboard',
      releaseNotes: releaseNotes
    });
  }

  // Use AuthService for authentication
  const result = await AuthService.authenticate(username, password);

  if (result.success) {
    // Set session variables
    req.session.isAuthenticated = true;
    req.session.username = result.user.username;
    req.session.userId = result.user.id;
    req.session.userEmail = result.user.email;
    req.session.userRole = result.user.role;
    req.session.accessScope = result.accessScope;  // Access scope for RLS enforcement
    req.session.userByofRole = result.user.byof_role || null;  // BYOF role

    // Log audit event
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    await AuthService.logAudit(
      result.user.id,
      'LOGIN',
      { username: result.user.username },
      ipAddress,
      userAgent
    );

    const returnTo = req.session.returnTo || '/observability/dashboard';
    delete req.session.returnTo;

    // Explicitly save session before redirect to avoid race condition with Redis
    return req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
      }
      res.redirect(returnTo);
    });
  }

  res.render('login', {
    error: result.error || 'Invalid username or password',
    title: 'Admin Login - Observability Dashboard',
    releaseNotes: releaseNotes
  });
});

// Logout
app.get('/observability/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Session destroy error:', err);
    }
    res.redirect('/observability/login');
  });
});

// Forgot Password - Show form
app.get('/observability/forgot-password', redirectIfAuthenticated, (req, res) => {
  res.render('forgot-password', {
    error: null,
    success: null
  });
});

// Forgot Password - Process form
app.post('/observability/forgot-password', loginLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.render('forgot-password', {
      error: 'Please provide your email address',
      success: null
    });
  }

  try {
    // Find user by email
    const { data: user, error } = await supabase
      .from('dashboard_users')
      .select('id, username, email')
      .eq('email', email)
      .single();

    // Always show success message (security best practice - don't reveal if email exists)
    const successMessage = 'If an account with that email exists, you will receive a password reset link shortly.';

    if (error || !user) {
      console.log('Password reset requested for non-existent email:', email);
      return res.render('forgot-password', {
        error: null,
        success: successMessage
      });
    }

    // Generate reset token (valid for 1 hour)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Store reset token in database
    const { error: updateError } = await supabase
      .from('dashboard_users')
      .update({
        password_reset_token: resetToken,
        password_reset_expires_at: resetTokenExpiry.toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error storing reset token:', updateError);
      return res.render('forgot-password', {
        error: 'An error occurred. Please try again later.',
        success: null
      });
    }

    // Send email with reset link
    const emailService = getEmailService();
    const emailResult = await emailService.sendPasswordReset(email, resetToken, user.username);

    if (!emailResult.success) {
      console.error('Failed to send password reset email:', emailResult.error);
      // Still show success to user (security best practice)
    }

    console.log(`Password reset email sent to ${email} (token: ${resetToken})`);

    res.render('forgot-password', {
      error: null,
      success: successMessage
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.render('forgot-password', {
      error: 'An error occurred. Please try again later.',
      success: null
    });
  }
});

// Reset Password - Show form
app.get('/observability/reset-password', redirectIfAuthenticated, async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.render('reset-password', {
      error: 'Invalid or missing reset token',
      token: ''
    });
  }

  try {
    // Verify token exists and is not expired
    const { data: user, error } = await supabase
      .from('dashboard_users')
      .select('id, password_reset_expires_at')
      .eq('password_reset_token', token)
      .single();

    if (error || !user) {
      return res.render('reset-password', {
        error: 'Invalid or expired reset token. Please request a new password reset.',
        token: ''
      });
    }

    // Check if token is expired
    const now = new Date();
    const expiry = new Date(user.password_reset_expires_at);

    if (now > expiry) {
      return res.render('reset-password', {
        error: 'This reset link has expired. Please request a new password reset.',
        token: ''
      });
    }

    res.render('reset-password', {
      error: null,
      token: token
    });

  } catch (error) {
    console.error('Reset password form error:', error);
    res.render('reset-password', {
      error: 'An error occurred. Please try again later.',
      token: ''
    });
  }
});

// Reset Password - Process form
app.post('/observability/reset-password', loginLimiter, async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  if (!token || !password || !confirmPassword) {
    return res.render('reset-password', {
      error: 'All fields are required',
      token: token || ''
    });
  }

  if (password !== confirmPassword) {
    return res.render('reset-password', {
      error: 'Passwords do not match',
      token: token
    });
  }

  if (password.length < 8) {
    return res.render('reset-password', {
      error: 'Password must be at least 8 characters long',
      token: token
    });
  }

  try {
    // Find user with valid token
    const { data: user, error } = await supabase
      .from('dashboard_users')
      .select('id, username, email, password_reset_expires_at')
      .eq('password_reset_token', token)
      .single();

    if (error || !user) {
      return res.render('reset-password', {
        error: 'Invalid or expired reset token',
        token: ''
      });
    }

    // Check if token is expired
    const now = new Date();
    const expiry = new Date(user.password_reset_expires_at);

    if (now > expiry) {
      return res.render('reset-password', {
        error: 'This reset link has expired. Please request a new password reset.',
        token: ''
      });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update password and clear reset token
    const { error: updateError } = await supabase
      .from('dashboard_users')
      .update({
        password_hash: passwordHash,
        password_reset_token: null,
        password_reset_expires_at: null
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating password_hash:', updateError);
      return res.render('reset-password', {
        error: 'An error occurred while resetting your password. Please try again.',
        token: token
      });
    }

    // Log audit event
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const userAgent = req.get('User-Agent');
    await AuthService.logAudit(
      user.id,
      'PASSWORD_RESET',
      { username: user.username, email: user.email },
      ipAddress,
      userAgent
    );

    console.log(`Password reset successful for user: ${user.username}`);

    // Redirect to login with success message
    res.redirect('/observability/login?reset=success');

  } catch (error) {
    console.error('Reset password error:', error);
    res.render('reset-password', {
      error: 'An error occurred. Please try again later.',
      token: token || ''
    });
  }
});

// Dashboard home (stats)
// RBAC: Partner admin or super admin can access dashboard
// bd-045: Uses partner-scoped MVs for data isolation
app.get('/observability/dashboard',
  requireAuth,
  requirePartnerAdmin,
  requireFeatureAccess('dashboard'),
  async (req, res) => {
  try {
    const userRole = req.session.userRole;
    const accessScope = req.session.accessScope;
    let stats;
    let statsSource = 'unknown';

    // bd-045: Route to appropriate MV based on user role and scope
    if (userRole === 'super_admin') {
      // Super admin: Use global MV (fastest path)
      stats = await getDashboardStatsOptimized(req.dbClient);
      statsSource = 'mv_global';
    } else if (!accessScope || accessScope.scope_type === 'all') {
      // Partner admin with "all" scope: Use global MV
      stats = await getDashboardStatsOptimized(req.dbClient);
      statsSource = 'mv_global_all_scope';
    } else {
      // Partner admin/viewer with restricted scope: Use scoped MV
      try {
        stats = await materializedViews.getDashboardStatsForScope(
          req.dbClient,
          { type: accessScope.scope_type, value: accessScope.scope_value }
        );
        statsSource = `mv_scoped_${accessScope.scope_type}`;
      } catch (scopeError) {
        // Fallback to RLS-enforced query if MV fails
        console.warn('[Dashboard] Scoped MV failed, falling back to RLS:', scopeError.message);
        stats = await getDashboardStatsOptimized(req.dbClient);
        statsSource = 'fallback_rls';
      }
    }

    // Add stats source for debugging
    if (stats) {
      stats._source = statsSource;
    }

    const recentActivity = await getRecentActivity(req.dbClient, 5);

    res.render('dashboard', {
      title: 'Dashboard',
      currentPage: 'dashboard',
      stats,
      recentActivity,
      userRole: req.userRole // Include for debugging
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load dashboard data',
      error: error.message
    });
  }
});

// Dashboard stats API (for timeline slider - returns stats for specific period)
// Supports both preset periods (?days=7) and custom date ranges (?startDate=X&endDate=Y)
app.get('/observability/api/dashboard/stats', requireAuth, async (req, res) => {
  try {
    const { days, startDate, endDate } = req.query;

    // Custom date range mode
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Validate dates
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)'
        });
      }

      if (start > end) {
        return res.status(400).json({
          success: false,
          error: 'Start date must be before end date'
        });
      }

      const result = await getDashboardStatsForPeriod(req.dbClient, 0, start, end);
      return res.json({
        success: true,
        ...result
      });
    }

    // Preset period mode
    const daysNum = parseInt(days) || 0; // 0 = all-time
    const validDays = [0, 7, 30, 90, 365];
    if (!validDays.includes(daysNum)) {
      return res.status(400).json({
        success: false,
        error: `Invalid days parameter. Valid values: ${validDays.join(', ')}`
      });
    }

    const result = await getDashboardStatsForPeriod(req.dbClient, daysNum);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Dashboard stats API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Users list (page view)
// RBAC: Partner admin or super admin can access users list
// bd-045: Uses partner-scoped MVs for data isolation
app.get('/observability/users',
  requireAuth,
  requirePartnerAdmin,
  requireFeatureAccess('users'),
  async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;
    const userRole = req.session.userRole;
    const accessScope = req.session.accessScope;
    let users;

    // bd-045: Route to appropriate MV based on user role and scope
    if (userRole === 'super_admin' || !accessScope || accessScope.scope_type === 'all') {
      // Super admin or "all" scope: Use global MV
      users = await getAllUsersOptimized(req.dbClient, limit, offset);
    } else {
      // Partner with restricted scope: Use scoped MV
      try {
        users = await materializedViews.getUsersWithScopeFromView(
          req.dbClient,
          { type: accessScope.scope_type, value: accessScope.scope_value },
          limit,
          offset
        );
      } catch (scopeError) {
        // Fallback to RLS-enforced query if MV fails
        console.warn('[Users] Scoped MV failed, falling back to RLS:', scopeError.message);
        users = await getAllUsersOptimized(req.dbClient, limit, offset);
      }
    }

    res.render('users', {
      title: 'Users',
      users,
      currentPage: page,
      userRole: req.userRole // Include for debugging
    });
  } catch (error) {
    console.error('Users list error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load users',
      error: error.message
    });
  }
});

// API endpoint for users list (for infinite scroll)
// RBAC: Partner admin or super admin can access
// bd-045: Uses partner-scoped MVs for data isolation
app.get('/observability/api/users',
  requireAuth,
  requirePartnerAdmin,
  requireFeatureAccess('users'),
  async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;
    const userRole = req.session.userRole;
    const accessScope = req.session.accessScope;
    let users;
    let totalCount;

    // bd-045: Route to appropriate MV based on user role and scope
    if (userRole === 'super_admin' || !accessScope || accessScope.scope_type === 'all') {
      // Super admin or "all" scope: Use RLS-enforced direct query
      const result = await req.dbClient.query(`
        SELECT id, phone_number, first_name, school_name, created_at,
               registration_completed, preferred_language
        FROM users
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      users = result.rows;
    } else {
      // Partner with restricted scope: Use scoped MV
      try {
        users = await materializedViews.getUsersWithScopeFromView(
          req.dbClient,
          { type: accessScope.scope_type, value: accessScope.scope_value },
          limit,
          offset
        );
        totalCount = await materializedViews.getTotalUserCountForScope(
          req.dbClient,
          { type: accessScope.scope_type, value: accessScope.scope_value }
        );
      } catch (scopeError) {
        // Fallback to RLS-enforced query if MV fails
        console.warn('[Users API] Scoped MV failed, falling back to RLS:', scopeError.message);
        const result = await req.dbClient.query(`
          SELECT id, phone_number, first_name, school_name, created_at,
                 registration_completed, preferred_language
          FROM users
          ORDER BY created_at DESC
          LIMIT $1 OFFSET $2
        `, [limit, offset]);
        users = result.rows;
      }
    }

    res.json({
      success: true,
      users: users,
      page,
      hasMore: users.length === limit,
      totalCount: totalCount || null,
      role: req.userRole // Include role for debugging
    });
  } catch (error) {
    console.error('Users API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Conversations for a specific user (AJAX endpoint)
// RBAC: Partner admin or super admin can access user conversations
app.get('/observability/api/conversations/:userId',
  requireAuth,
  requirePartnerAdmin,
  requireFeatureAccess('users'),
  async (req, res) => {
  try {
    const { userId } = req.params;
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 100;

    // RLS ENFORCED: All functions now use req.dbClient (Batch 2 ✅ + Batch 4 ✅)
    const [user, conversations, coachingSessions, lessonPlans, videoRequests, readingSessions] = await Promise.all([
      getUserById(req.dbClient, userId),
      getUserConversations(req.dbClient, userId, limit, offset),
      getUserCoachingSessions(req.dbClient, userId, 10),
      getUserLessonPlans(req.dbClient, userId, 10),
      getUserVideoRequests(req.dbClient, userId, 10),
      getUserReadingSessions(req.dbClient, userId, 10)
    ]);

    res.json({
      success: true,
      user,
      conversations,
      coachingSessions,
      lessonPlans,
      videoRequests,
      readingSessions,
      hasMoreMessages: conversations.length === limit,
      userRole: req.userRole // Include for debugging
    });
  } catch (error) {
    console.error('Conversations error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Session Analytics
// RBAC: Partner admin or super admin can access sessions
app.get('/observability/sessions',
  requireAuth,
  requirePartnerAdmin,
  requireFeatureAccess('sessions'),
  async (req, res) => {
  try {
    // RLS ENFORCED: Using optimized materialized view (bd-044)
    const analytics = await getSessionAnalytics(req.dbClient);
    const stats = await getDashboardStatsOptimized(req.dbClient);

    res.render('sessions', {
      title: 'Session Analytics',
      analytics,
      stats
    });
  } catch (error) {
    console.error('Session analytics error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load session analytics',
      error: error.message
    });
  }
});

// Funnel Analytics
// RBAC: Partner admin or super admin can access funnel
app.get('/observability/funnel',
  requireAuth,
  requirePartnerAdmin,
  requireFeatureAccess('funnel'),
  async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;

    // RLS ENFORCED: All funnel functions now use req.dbClient (Batch 4 ✅)
    const [funnelMetrics, dailyMetrics, trafficSources] = await Promise.all([
      getFunnelMetrics(req.dbClient),
      getFunnelMetricsByDate(req.dbClient, days),
      getTrafficSources(req.dbClient)
    ]);

    res.render('funnel', {
      title: 'Funnel Analytics',
      funnelMetrics,
      dailyMetrics,
      trafficSources,
      selectedDays: days
    });
  } catch (error) {
    console.error('Funnel analytics error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load funnel analytics',
      error: error.message
    });
  }
});

// A/B Testing Dashboard (Admin Only)
// RBAC: Super admin only
app.get('/observability/ab-testing',
  requireAuth,
  requirePartnerAdmin,
  async (req, res) => {
  try {
    // NOTE: Should use req.dbClient instead of supabase for RLS enforcement
    // Get all A/B tests with their variants
    const { data: tests, error: testsError } = await supabase
      .from('ab_tests')
      .select('*')
      .order('created_at', { ascending: false });

    if (testsError) throw testsError;

    // Get variants for each test with stats
    const testsWithVariants = await Promise.all((tests || []).map(async (test) => {
      const { data: variants, error: variantsError } = await supabase
        .from('ab_test_variants')
        .select('*')
        .eq('test_id', test.id)
        .order('variant_name');

      if (variantsError) throw variantsError;

      // Calculate Wilson score and Thompson probability for each variant
      const variantsWithStats = (variants || []).map(v => {
        const n = v.impressions || 0;
        const p = n > 0 ? v.conversions / n : 0;

        // Wilson score confidence interval (95%)
        const z = 1.96;
        let wilsonLower = 0, wilsonUpper = 0;
        if (n > 0) {
          const denominator = 1 + z * z / n;
          const center = (p + z * z / (2 * n)) / denominator;
          const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / denominator;
          wilsonLower = Math.max(0, center - spread);
          wilsonUpper = Math.min(1, center + spread);
        }

        return {
          ...v,
          wilsonLower,
          wilsonUpper,
          thompsonProb: 0 // Will be calculated below
        };
      });

      // Calculate Thompson Sampling probabilities via Monte Carlo
      if (variantsWithStats.length > 1) {
        const samples = 10000;
        const wins = new Array(variantsWithStats.length).fill(0);

        for (let i = 0; i < samples; i++) {
          let maxVal = -1;
          let maxIdx = 0;
          variantsWithStats.forEach((v, idx) => {
            // Sample from Beta(successes, failures)
            const alpha = v.successes || 1;
            const beta = v.failures || 1;
            const sample = sampleBeta(alpha, beta);
            if (sample > maxVal) {
              maxVal = sample;
              maxIdx = idx;
            }
          });
          wins[maxIdx]++;
        }

        variantsWithStats.forEach((v, idx) => {
          v.thompsonProb = wins[idx] / samples;
        });
      } else if (variantsWithStats.length === 1) {
        variantsWithStats[0].thompsonProb = 1;
      }

      const totalImpressions = variantsWithStats.reduce((sum, v) => sum + (v.impressions || 0), 0);
      const totalConversions = variantsWithStats.reduce((sum, v) => sum + (v.conversions || 0), 0);

      return {
        ...test,
        variants: variantsWithStats,
        totalImpressions,
        totalConversions
      };
    }));

    res.render('ab-testing', {
      title: 'A/B Testing',
      tests: testsWithVariants
    });
  } catch (error) {
    console.error('A/B Testing dashboard error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load A/B testing dashboard',
      error: error.message
    });
  }
});

// Helper function for Beta distribution sampling (Marsaglia-Tsang method)
function sampleBeta(alpha, beta) {
  const gammaAlpha = sampleGamma(alpha);
  const gammaBeta = sampleGamma(beta);
  return gammaAlpha / (gammaAlpha + gammaBeta);
}

function sampleGamma(shape) {
  if (shape < 1) {
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x, v;
    do {
      x = gaussianRandom();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function gaussianRandom() {
  let u, v, s;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  return u * Math.sqrt(-2 * Math.log(s) / s);
}

// API Health
// RBAC: All portal users
app.get('/observability/api-health',
  requireAuth,
  requirePartnerAdmin,
  async (req, res) => {
  res.render('api-health', {
    title: 'API Health',
    username: req.session.username,
    userRole: req.session.userRole,
    currentPage: 'api-health'
  });
});

// Release Notes page
// RBAC: Partner admin or super admin can view release notes
app.get('/observability/release-notes',
  requireAuth,
  requirePartnerAdmin,
  requireFeatureAccess('dashboard'),
  async (req, res) => {
  const envFilter = req.query.env || 'all';
  const categoryFilter = req.query.category || 'all';

  try {
    // NOTE: getReleaseNotes needs to be updated to use req.dbClient for RLS
    const releaseNotes = await getReleaseNotes({
      environment: envFilter,
      category: categoryFilter,
      limit: 50
    });

    res.render('release-notes', {
      title: 'Release Notes',
      username: req.session.username,
      userRole: req.session.userRole,
      currentPage: 'release-notes',
      releaseNotes: releaseNotes,
      envFilter: envFilter,
      categoryFilter: categoryFilter
    });
  } catch (error) {
    console.error('Error fetching release notes:', error);
    res.render('release-notes', {
      title: 'Release Notes',
      username: req.session.username,
      userRole: req.session.userRole,
      currentPage: 'release-notes',
      releaseNotes: [],
      envFilter: envFilter,
      categoryFilter: categoryFilter
    });
  }
});

// Database Schema Visualization
// RBAC: All portal users
app.get('/observability/schema',
  requireAuth,
  requirePartnerAdmin,
  async (req, res) => {
  try {
    // Get current stats for table record counts - using optimized MV (bd-044)
    const stats = await getDashboardStatsOptimized(req.dbClient);

    res.render('schema', {
      title: 'Database Schema',
      username: req.session.username,
      userRole: req.session.userRole,
      stats
    });
  } catch (error) {
    console.error('Schema page error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load database schema',
      error: error.message
    });
  }
});

// Coaching Sessions Observability
// RBAC: Partner admin or super admin can access coaching sessions
app.get('/observability/coaching',
  requireAuth,
  requirePartnerAdmin,
  requireFeatureAccess('coaching'),
  async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const statusFilter = req.query.status || 'all';
    const dateFrom = req.query.dateFrom || null;
    const dateTo = req.query.dateTo || null;
    const limit = 20;

    // RLS ENFORCED: Both coaching service functions now use req.dbClient (Batch 5 ✅)
    const [sessionData, stats] = await Promise.all([
      getCoachingSessions(req.dbClient, page, limit, statusFilter, dateFrom, dateTo),
      getStatusStats(req.dbClient)
    ]);

    const { sessions, totalCount, hasMore } = sessionData;
    const totalPages = Math.ceil(totalCount / limit);

    res.render('coaching', {
      title: 'Coaching Sessions',
      sessions,
      currentPage: page,
      totalPages,
      hasMore,
      statusFilter,
      dateFrom,
      dateTo,
      stats,
      totalCount
    });
  } catch (error) {
    console.error('Coaching sessions error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load coaching sessions',
      error: error.message
    });
  }
});

// Video Gallery Observability
// RBAC: Partner admin or super admin can access video requests
app.get('/observability/videos',
  requireAuth,
  requirePartnerAdmin,
  requireFeatureAccess('videos'),
  async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const statusFilter = req.query.status || 'all';
    const languageFilter = req.query.language || null;
    const dateFrom = req.query.dateFrom || null;
    const dateTo = req.query.dateTo || null;
    const userId = req.query.userId || null;
    const topicSearch = req.query.topic || null;
    const limit = 20;

    // RLS ENFORCED: All video service functions now use req.dbClient (Batch 6 ✅)
    // Fetch data in parallel
    const [videoData, stats, usersWithVideos] = await Promise.all([
      getVideos(req.dbClient, {
        page,
        limit,
        statusFilter,
        languageFilter,
        dateFrom,
        dateTo,
        userId,
        topicSearch
      }),
      getVideoStats(req.dbClient),
      getUsersWithVideos(req.dbClient)
    ]);

    const { videos, totalCount, hasMore } = videoData;
    const totalPages = Math.ceil(totalCount / limit);

    // Generate presigned URLs for thumbnails (first slide of each video)
    const videosWithThumbnails = await Promise.all(
      videos.map(async (video) => {
        let thumbnailUrl = null;
        if (video.slide_urls && video.slide_urls.length > 0) {
          const firstSlide = video.slide_urls[0];
          if (typeof firstSlide === 'string' && isValidR2Url(firstSlide)) {
            thumbnailUrl = await generatePresignedUrl(firstSlide, 3600);
          } else {
            thumbnailUrl = firstSlide;
          }
        }
        return { ...video, thumbnailUrl };
      })
    );

    res.render('videos', {
      title: 'AI Videos',
      username: req.session.username,
      userRole: req.session.userRole,
      videos: videosWithThumbnails,
      stats,
      usersWithVideos,
      currentPage: page,
      totalPages,
      hasMore,
      totalCount,
      statusFilter,
      languageFilter,
      dateFrom,
      dateTo,
      userId,
      topicSearch
    });
  } catch (error) {
    console.error('Video gallery error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load video gallery',
      error: error.message
    });
  }
});

// Video Detail Page
// RBAC: Partner admin or super admin can access video details
app.get('/observability/videos/:id',
  requireAuth,
  requirePartnerAdmin,
  requireFeatureAccess('videos'),
  async (req, res) => {
  try {
    const videoId = req.params.id;
    // RLS ENFORCED: getVideoById now uses req.dbClient (Batch 6 ✅)
    const video = await getVideoById(req.dbClient, videoId);

    if (!video) {
      return res.status(404).render('error', {
        title: 'Not Found',
        message: 'Video not found',
        error: 'The requested video does not exist'
      });
    }

    // Generate presigned URLs for video, PDF, and slides
    let presignedVideoUrl = null;
    let presignedPdfUrl = null;
    let presignedSlideUrls = [];

    if (video.video_url && isValidR2Url(video.video_url)) {
      presignedVideoUrl = await generatePresignedUrl(video.video_url, 3600);
    }

    if (video.pdf_url && isValidR2Url(video.pdf_url)) {
      presignedPdfUrl = await generatePresignedUrl(video.pdf_url, 3600);
    }

    if (video.slide_urls && video.slide_urls.length > 0) {
      presignedSlideUrls = await Promise.all(
        video.slide_urls.map(async (url) => {
          if (typeof url === 'string' && isValidR2Url(url)) {
            return await generatePresignedUrl(url, 3600);
          }
          return url;
        })
      );
    }

    res.render('video-detail', {
      title: video.topic,
      username: req.session.username,
      userRole: req.session.userRole,
      video: {
        ...video,
        presignedVideoUrl,
        presignedPdfUrl,
        presignedSlideUrls
      }
    });
  } catch (error) {
    console.error('Video detail error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load video details',
      error: error.message
    });
  }
});

// Retention Analytics Dashboard
// RBAC: Partner admin or super admin can access retention
app.get('/observability/retention',
  requireAuth,
  requirePartnerAdmin,
  requireFeatureAccess('retention'),
  async (req, res) => {
  try {
    const featureType = req.query.feature || 'overall';
    const weeksBack = parseInt(req.query.weeks) || 12;
    const startDate = req.query.dateFrom || null;
    const endDate = req.query.dateTo || null;

    // RLS ENFORCED: All retention service functions now use req.dbClient (Batch 7 ✅)
    // bd-044: Fetch data ONCE, then reuse for curve and summary (3x → 1x queries)
    const retentionResult = await getRetentionData(req.dbClient, featureType, weeksBack, startDate, endDate);
    const { cohorts, summary: baseSummary } = retentionResult;

    // Reuse the fetched cohorts for curve and summary calculations
    const [curveData, summary] = await Promise.all([
      getRetentionCurve(req.dbClient, featureType, null, weeksBack, cohorts),
      getRetentionSummary(req.dbClient, weeksBack, { cohorts, summary: baseSummary })
    ]);

    res.render('retention', {
      title: 'Retention Analysis',
      username: req.session.username,
      userRole: req.session.userRole,
      cohorts,
      summary,
      curveData: JSON.stringify(curveData), // Pass as JSON for Chart.js
      featureType,
      weeksBack,
      startDate,
      endDate,
      formatCohortWeek,
      getRetentionColorClass
    });
  } catch (error) {
    console.error('Retention route error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load retention data',
      error: error.message
    });
  }
});

// R2 File Proxy Endpoints - Download coaching session files with authentication

// Voice Feedback Audio (with optional download)
// RBAC: Partner admin or super admin can access coaching audio
app.get('/observability/proxy/audio/:sessionId',
  requireAuth,
  requirePartnerAdmin,
  requireFeatureAccess('coaching'),
  async (req, res) => {
  try {
    const { sessionId } = req.params;
    const isDownload = req.query.download === 'true';

    // NOTE: Should use req.dbClient instead of supabase for RLS enforcement
    // Fetch session from database to get voice_debrief_url
    // NOTE: sessionId here is actually the 'id' (primary key), not 'session_id' field
    const { data: session, error } = await supabase
      .from('coaching_sessions')
      .select('voice_debrief_url')
      .eq('id', sessionId)
      .single();

    if (error || !session || !session.voice_debrief_url) {
      return res.status(404).send('Audio file not found');
    }

    // Extract R2 key from URL
    const r2Key = extractKeyFromUrl(session.voice_debrief_url);

    // Stream file from R2 (reduces latency - client starts receiving immediately)
    const { stream, contentLength, contentType } = await streamFromR2(r2Key);

    // Set appropriate headers
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.setHeader('Accept-Ranges', 'bytes'); // Enable range requests for seeking

    // Set Content-Disposition based on download flag
    if (isDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="voice_feedback_${sessionId}.mp3"`);
    }

    // Pipe stream directly to response (no buffering)
    stream.pipe(res);
  } catch (error) {
    console.error('Error proxying audio:', error);
    res.status(500).send('Failed to download audio file');
  }
});

// Classroom Recording Audio (with optional download)
// RBAC: Partner admin or super admin can access classroom audio
app.get('/observability/proxy/classroom-audio/:sessionId',
  requireAuth,
  requirePartnerAdmin,
  requireFeatureAccess('coaching'),
  async (req, res) => {
  try {
    const { sessionId } = req.params;
    const isDownload = req.query.download === 'true';

    // NOTE: Should use req.dbClient instead of supabase for RLS enforcement
    // Fetch session from database to get audio_url (classroom recording)
    const { data: session, error } = await supabase
      .from('coaching_sessions')
      .select('audio_url')
      .eq('id', sessionId)
      .single();

    if (error || !session || !session.audio_url) {
      return res.status(404).send('Classroom audio not found');
    }

    // Extract R2 key from URL
    const r2Key = extractKeyFromUrl(session.audio_url);

    // Stream file from R2
    const { stream, contentLength, contentType } = await streamFromR2(r2Key);

    // Set appropriate headers
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Accept-Ranges', 'bytes');

    // Set Content-Disposition based on download flag
    const extension = r2Key.split('.').pop() || 'ogg';
    if (isDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="classroom_recording_${sessionId}.${extension}"`);
    }

    stream.pipe(res);
  } catch (error) {
    console.error('Error proxying classroom audio:', error);
    res.status(500).send('Failed to download classroom audio');
  }
});

// Transcript Status Polling Endpoint (for loading screen)
// RBAC: Partner admin or super admin can check transcript status
app.get('/observability/api/transcript-status/:sessionId',
  requireAuth,
  requirePartnerAdmin,
  requireFeatureAccess('coaching'),
  async (req, res) => {
  const { sessionId } = req.params;

  // First check if we have cached data in the database (for after server restarts)
  // This prevents endless loading loops when database has pre-processed transcripts
  try {
    const { data: session, error: dbError } = await supabase
      .from('coaching_sessions')
      .select('analysis_data')
      .eq('id', sessionId)
      .single();

    if (!dbError && session?.analysis_data?.processed_transcript) {
      console.log(`[Transcript Status] Found cached data in database for session ${sessionId}`);
      return res.json({ status: 'completed' });
    }
  } catch (err) {
    // Log but don't block - fall through to in-memory check
    console.error('[Transcript Status] Database check error:', err.message);
  }

  // Then check in-memory status (for active processing)
  const status = transcriptProcessingStatus.get(sessionId);

  if (!status) {
    return res.json({ status: 'not_started' });
  }

  res.json({
    status: status.status,
    error: status.error || null
  });
});

// Transcript HTML Page (with GPT-4o-mini enhanced formatting + loading screen)
// RBAC: Partner admin or super admin can view transcripts
app.get('/observability/proxy/transcript/:sessionId',
  requireAuth,
  requirePartnerAdmin,
  requireFeatureAccess('coaching'),
  async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { processed } = req.query; // Flag to skip loading screen

    // NOTE: Should use req.dbClient instead of supabase for RLS enforcement
    // Fetch session with transcript, enhanced data, and user info
    // Phase 5/6: Also fetch analysis_data which contains slo_mastery and classroom_climate
    const { data: session, error } = await supabase
      .from('coaching_sessions')
      .select(`
        id,
        transcript_text,
        audio_url,
        audio_duration_seconds,
        tokens_raw,
        silence_markers,
        diarization_data,
        analysis_data,
        created_at,
        users!inner(first_name, last_name, phone_number, school_name)
      `)
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      return res.status(404).send('Session not found');
    }

    if (!session.transcript_text) {
      return res.status(404).send('Transcript not available for this session');
    }

    // Format metadata
    const teacherName = `${session.users.first_name || ''} ${session.users.last_name || ''}`.trim() || 'Unknown';
    const schoolName = session.users.school_name || 'N/A';
    const sessionDate = new Date(session.created_at).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });

    let duration = 'N/A';
    if (session.audio_duration_seconds) {
      const minutes = Math.floor(session.audio_duration_seconds / 60);
      const seconds = session.audio_duration_seconds % 60;
      duration = `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    // Extract Phase 5/6 data from analysis_data
    const analysisData = session.analysis_data || {};
    // etv-slo01: SLO and climate data are inside processed_transcript (from GPT output)
    const processedTranscript = analysisData.processed_transcript || {};
    const sloMastery = processedTranscript.slo_mastery || analysisData.slo_mastery || null;
    const classroomClimate = processedTranscript.classroom_climate || analysisData.classroom_climate || null;
    const namedStudents = processedTranscript.named_students || analysisData.named_students || [];

    // Check for PERSISTENT cached processed transcript in database (added Jan 17, 2026)
    if (analysisData.processed_transcript) {
      console.log(`[Transcript] Using cached processed data from database for session ${sessionId}`);
      // etv-aud01: Use proxy route for audio (direct R2 URLs don't work in browser)
      const audioProxyUrl = session.audio_url ? `/observability/proxy/classroom-audio/${sessionId}` : null;
      return res.render('transcript-enhanced', {
        teacherName,
        schoolName,
        sessionDate,
        duration,
        durationSeconds: session.audio_duration_seconds || 0,
        audioUrl: audioProxyUrl,
        tokensRaw: session.tokens_raw || null,
        silenceMarkers: session.silence_markers || null,
        diarizationData: session.diarization_data || null,
        processedData: analysisData.processed_transcript,
        isFallback: analysisData.processed_transcript_fallback || false,
        // Phase 5/6 data
        sloMastery,
        classroomClimate,
        namedStudents,
        // Phase 7: UX Helpers (etv-ux01)
        uxHelpers: transcriptUxHelpers
      });
    }

    // Check if we already have processed data in memory (from loading flow)
    const cachedStatus = transcriptProcessingStatus.get(sessionId);
    if (processed === 'true' && cachedStatus && cachedStatus.status === 'completed' && cachedStatus.processedData) {
      // Use cached processed data
      // etv-aud01: Use proxy route for audio (direct R2 URLs don't work in browser)
      const audioProxyUrl2 = session.audio_url ? `/observability/proxy/classroom-audio/${sessionId}` : null;
      return res.render('transcript-enhanced', {
        teacherName,
        schoolName,
        sessionDate,
        duration,
        durationSeconds: session.audio_duration_seconds || 0,
        audioUrl: audioProxyUrl2,
        tokensRaw: session.tokens_raw || null,
        silenceMarkers: session.silence_markers || null,
        diarizationData: session.diarization_data || null,
        processedData: cachedStatus.processedData,
        isFallback: cachedStatus.isFallback || false,
        // Phase 5/6 data
        sloMastery,
        classroomClimate,
        namedStudents,
        // Phase 7: UX Helpers (etv-ux01)
        uxHelpers: transcriptUxHelpers
      });
    }

    // Check if processing is already in progress
    if (cachedStatus && cachedStatus.status === 'processing') {
      // Show loading screen (processing already started)
      return res.render('loading-transcript', {
        sessionId,
        teacherName,
        schoolName
      });
    }

    // Start background processing and show loading screen
    transcriptProcessingStatus.set(sessionId, {
      status: 'processing',
      processedData: null,
      error: null,
      isFallback: false,
      startedAt: Date.now()
    });

    // plt-sqs01: Try SQS first for async processing (offloads GPT work to worker)
    // Falls back to in-memory processing if SQS not configured
    const useSQS = PortalSQSService.isConfigured();

    if (useSQS) {
      // Queue to SQS for async processing by worker
      (async () => {
        try {
          await PortalSQSService.queueTranscriptJob(sessionId, {
            rawTranscript: session.transcript_text,
            sessionInfo: { teacherName, schoolName, duration }
          });
          console.log(`[Transcript] Queued to SQS for session ${sessionId}`);
          // Status remains 'processing' - worker will persist to DB
          // Status endpoint will pick up result from database
        } catch (sqsError) {
          console.error(`[Transcript] SQS queue failed, falling back to in-memory:`, sqsError.message);
          // Fall through to in-memory processing
          await processInMemory();
        }
      })();
    } else {
      // In-memory processing (original behavior)
      (async () => await processInMemory())();
    }

    // Helper: In-memory processing (original code)
    async function processInMemory() {
      let processedData = null;
      let isFallback = false;

      try {
        console.log(`[Transcript] Starting GPT processing for session ${sessionId}`);
        processedData = await processTranscript(session.transcript_text, {
          teacherName,
          schoolName,
          duration
        });
        console.log(`[Transcript] GPT processing completed for session ${sessionId}`);
      } catch (gptError) {
        console.error('[Transcript] GPT processing failed:', gptError.message);
        // Use fallback
        processedData = fallbackParse(session.transcript_text);
        isFallback = true;
      }

      // Store result in memory
      transcriptProcessingStatus.set(sessionId, {
        status: 'completed',
        processedData,
        error: null,
        isFallback,
        startedAt: transcriptProcessingStatus.get(sessionId)?.startedAt || Date.now()
      });

      // PERSIST to database for instant loading on future views (added Jan 17, 2026)
      try {
        const existingAnalysisData = session.analysis_data || {};
        const updatedAnalysisData = {
          ...existingAnalysisData,
          processed_transcript: processedData,
          processed_transcript_fallback: isFallback,
          processed_at: new Date().toISOString()
        };

        const { error: updateError } = await supabase
          .from('coaching_sessions')
          .update({ analysis_data: updatedAnalysisData })
          .eq('id', sessionId);

        if (updateError) {
          console.error(`[Transcript] Failed to persist processed data for session ${sessionId}:`, updateError.message);
        } else {
          console.log(`[Transcript] Persisted processed data to database for session ${sessionId}`);
        }
      } catch (persistError) {
        console.error(`[Transcript] Error persisting to database:`, persistError.message);
      }
    }

    // Render loading screen immediately
    res.render('loading-transcript', {
      sessionId,
      teacherName,
      schoolName
    });
  } catch (error) {
    console.error('Error rendering transcript:', error);
    res.status(500).send('Failed to load transcript');
  }
});

// PDF Report Download
// RBAC: Partner admin or super admin can download PDF reports
app.get('/observability/proxy/report/:sessionId',
  requireAuth,
  requirePartnerAdmin,
  requireFeatureAccess('coaching'),
  async (req, res) => {
  try {
    const { sessionId } = req.params;

    // NOTE: Should use req.dbClient instead of supabase for RLS enforcement
    // Fetch session from database to get report_pdf_url
    // NOTE: sessionId here is actually the 'id' (primary key), not 'session_id' field
    const { data: session, error } = await supabase
      .from('coaching_sessions')
      .select('report_pdf_url')
      .eq('id', sessionId)
      .single();

    if (error || !session || !session.report_pdf_url) {
      return res.status(404).send('PDF report not found');
    }

    // Extract R2 key from URL
    const r2Key = extractKeyFromUrl(session.report_pdf_url);

    // Download file from R2
    const fileBuffer = await downloadFromR2(r2Key);

    // Set appropriate headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Content-Disposition', `inline; filename="coaching_report_${sessionId}.pdf"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.send(fileBuffer);
  } catch (error) {
    console.error('Error proxying PDF:', error);
    res.status(500).send('Failed to download PDF report');
  }
});

// ============================================================================
// ADMIN USER MANAGEMENT ROUTES
// ============================================================================

// Admin Users Page - Manage dashboard users and access scopes
// RBAC: Internal roles (super_admin, admin, viewer) can view and edit scopes
// Destructive actions (delete, deactivate) remain super_admin only via API
app.get('/observability/admin/users',
  requireAuth,
  requireFeatureAccess('user_management'),
  async (req, res) => {
  try {
    // Fetch all dashboard users
    const usersResult = await AuthService.getAllUsers();
    if (!usersResult.success) {
      throw new Error(usersResult.error);
    }

    // Fetch access scopes for each user
    const usersWithScopes = await Promise.all(
      usersResult.users.map(async (user) => {
        if (user.role === 'partner_admin') {
          const scope = await accessScopeService.getScope(req.dbClient, user.id);
          return { ...user, accessScope: scope };
        }
        return { ...user, accessScope: null };
      })
    );

    // Get scope statistics
    const scopeStats = await accessScopeService.getScopeStats(req.dbClient);

    res.render('admin-users', {
      title: 'User Management',
      currentPage: 'admin-users',
      users: usersWithScopes,
      scopeStats,
      username: req.session.username,
      userRole: req.session.userRole
    });
  } catch (error) {
    console.error('Error loading admin users page:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load user management page',
      error: { status: 500, stack: error.stack }
    });
  }
});

// Admin Invitations Page - Manage partner admin invitations (SUPER ADMIN ONLY)
app.get('/observability/admin/invitations',
  requireAuth,
  requireFeatureAccess('invites'),
  async (req, res) => {
  try {
    // Fetch all pending invitations
    const pendingInvitations = await invitationService.getPendingInvitations(req.dbClient);

    // Fetch invitation statistics
    const stats = await invitationService.getInvitationStats(req.dbClient);

    // Fetch all invitations (for history)
    const allInvitationsResult = await req.dbClient.query(
      `SELECT
        i.*,
        u.username as inviter_username,
        c.username as created_username
       FROM invitations i
       LEFT JOIN dashboard_users u ON i.invited_by = u.id
       LEFT JOIN dashboard_users c ON i.created_user_id = c.id
       ORDER BY i.created_at DESC
       LIMIT 100`
    );

    res.render('admin-invitations', {
      title: 'Invitation Management',
      currentPage: 'admin-invitations',
      pendingInvitations,
      allInvitations: allInvitationsResult.rows,
      stats,
      username: req.session.username,
      userRole: req.session.userRole
    });
  } catch (error) {
    console.error('Error loading invitations page:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load invitation management page',
      error: { status: 500, stack: error.stack }
    });
  }
});

// API: Get user access scope
// RBAC: Internal roles (super_admin, admin, viewer) can view scopes
app.get('/observability/api/admin/users/:userId/scope',
  requireAuth,
  requireFeatureAccess('user_management'),
  async (req, res) => {
  try {
    const { userId } = req.params;

    const scope = await accessScopeService.getScope(req.dbClient, userId);

    if (!scope) {
      return res.json({ success: true, scope: null });
    }

    res.json({ success: true, scope });
  } catch (error) {
    console.error('Error getting user scope:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Shared handler for creating/updating scope
async function handleScopeUpdate(req, res) {
  try {
    const { userId } = req.params;
    const { scope_type, scope_value } = req.body;

    // Validate scope
    const validation = accessScopeService.validateScope(scope_type, scope_value);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    // Check if scope exists
    const existingScope = await accessScopeService.getScope(req.dbClient, userId);

    let result;
    if (existingScope) {
      // Update existing scope
      result = await accessScopeService.updateScope(req.dbClient, userId, scope_type, scope_value);
    } else {
      // Create new scope
      result = await accessScopeService.createScope(req.dbClient, userId, scope_type, scope_value);
    }

    // Log audit event
    await AuthService.logAudit(
      req.session.userId,
      'scope_update',
      { targetUserId: userId, scope_type, scope_value },
      req.ip,
      req.get('user-agent')
    );

    res.json({ success: true, scope: result });
  } catch (error) {
    console.error('Error updating user scope:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// API: Update user access scope - POST method
// RBAC: Internal roles (super_admin, admin, viewer) can edit scopes
app.post('/observability/api/admin/users/:userId/scope',
  requireAuth,
  requireFeatureAccess('user_management'),
  handleScopeUpdate
);

// API: Update user access scope - PUT method
// RBAC: Internal roles (super_admin, admin, viewer) can edit scopes
app.put('/observability/api/admin/users/:userId/scope',
  requireAuth,
  requireFeatureAccess('user_management'),
  handleScopeUpdate
);

// API: Delete user access scope
// RBAC: Internal roles (super_admin, admin, viewer) can remove scopes
app.delete('/observability/api/admin/users/:userId/scope',
  requireAuth,
  requireFeatureAccess('user_management'),
  async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await accessScopeService.deleteScope(req.dbClient, userId);

    // Log audit event
    await AuthService.logAudit(
      req.session.userId,
      'scope_delete',
      { targetUserId: userId },
      req.ip,
      req.get('user-agent')
    );

    res.json({ success: true, deleted: result });
  } catch (error) {
    console.error('Error deleting user scope:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Deactivate user (SUPER ADMIN ONLY)
app.post('/observability/api/admin/users/:userId/deactivate',
  requireSuperAdmin,
  async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent deactivating self
    if (userId === req.session.userId) {
      return res.status(400).json({ success: false, error: 'Cannot deactivate your own account' });
    }

    const result = await AuthService.deactivateUser(userId);

    // Log audit event
    await AuthService.logAudit(
      req.session.userId,
      'user_deactivate',
      { targetUserId: userId },
      req.ip,
      req.get('user-agent')
    );

    res.json(result);
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Reactivate user (SUPER ADMIN ONLY)
app.post('/observability/api/admin/users/:userId/reactivate',
  requireSuperAdmin,
  async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await AuthService.reactivateUser(userId);

    // Log audit event
    await AuthService.logAudit(
      req.session.userId,
      'user_reactivate',
      { targetUserId: userId },
      req.ip,
      req.get('user-agent')
    );

    res.json(result);
  } catch (error) {
    console.error('Error reactivating user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Delete user permanently (SUPER ADMIN ONLY)
app.delete('/observability/api/admin/users/:userId',
  requireSuperAdmin,
  setDatabaseContext,
  async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent deleting self
    if (userId === req.session.userId) {
      return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
    }

    // Delete related invitation records first (foreign key constraint)
    try {
      await req.dbClient.query('DELETE FROM invitations WHERE created_user_id = $1', [userId]);
      await req.dbClient.query('DELETE FROM invitations WHERE invited_by = $1', [userId]);
    } catch (inviteError) {
      console.warn('No invitations to delete or error:', inviteError.message);
    }

    // Delete user's access scope if exists
    try {
      await accessScopeService.deleteScope(req.dbClient, userId);
    } catch (scopeError) {
      console.warn('No scope to delete or error:', scopeError.message);
    }

    // Delete the user
    const result = await AuthService.deleteUser(userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log audit event
    await AuthService.logAudit(
      req.session.userId,
      'user_delete',
      { targetUserId: userId },
      req.ip,
      req.get('user-agent')
    );

    res.json(result);
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Bulk deactivate users (SUPER ADMIN ONLY)
app.post('/observability/api/admin/users/bulk-deactivate',
  requireSuperAdmin,
  async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, error: 'userIds must be a non-empty array' });
    }

    // Prevent deactivating self
    if (userIds.includes(req.session.userId)) {
      return res.status(400).json({ success: false, error: 'Cannot deactivate your own account' });
    }

    const results = await Promise.all(
      userIds.map(userId => AuthService.deactivateUser(userId))
    );

    const successCount = results.filter(r => r.success).length;

    // Log audit event
    await AuthService.logAudit(
      req.session.userId,
      'bulk_deactivate',
      { userIds, successCount },
      req.ip,
      req.get('user-agent')
    );

    res.json({
      success: true,
      totalRequested: userIds.length,
      successCount,
      failCount: userIds.length - successCount
    });
  } catch (error) {
    console.error('Error bulk deactivating users:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Create new invitation with email
// RBAC: Super admin only
app.post('/observability/api/admin/invitations/create',
  requireAuth,
  requireFeatureAccess('invites'),
  async (req, res) => {
  try {
    const { email, role, scopeConfig } = req.body;

    // Validate input
    if (!email || !role || !scopeConfig) {
      return res.status(400).json({ success: false, error: 'email, role, and scopeConfig are required' });
    }

    // Create invitation
    const invitation = await invitationService.createInvitation(
      req.dbClient,
      email,
      role,
      scopeConfig,
      req.session.userId,
      7 // 7 days expiration
    );

    // Send email via Resend
    const emailResult = await resendEmailService.sendInvitation(
      email,
      invitation.token,
      req.session.username,
      role
    );

    if (!emailResult.success) {
      console.error('Failed to send invitation email:', emailResult.error);
      // Invitation created but email failed - return partial success
      return res.json({
        success: true,
        warning: 'Invitation created but email delivery failed',
        invitation,
        emailError: emailResult.error
      });
    }

    // Update invitation with email sent timestamp
    await invitationService.resendInvitation(req.dbClient, invitation.token);

    // Log audit event
    await AuthService.logAudit(
      req.session.userId,
      'invitation_create',
      { email, role, scopeConfig },
      req.ip,
      req.get('user-agent')
    );

    res.json({ success: true, invitation });
  } catch (error) {
    console.error('Error creating invitation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Resend invitation email
// RBAC: Super admin only
app.post('/observability/api/admin/invitations/:token/resend',
  requireAuth,
  requireFeatureAccess('invites'),
  async (req, res) => {
  try {
    const { token } = req.params;

    // Get invitation details
    const invitation = await invitationService.getInvitation(req.dbClient, token);
    if (!invitation) {
      return res.status(404).json({ success: false, error: 'Invitation not found' });
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Can only resend pending invitations' });
    }

    // Send email via Resend
    const emailResult = await resendEmailService.sendInvitation(
      invitation.email,
      invitation.token,
      req.session.username,
      invitation.role
    );

    if (!emailResult.success) {
      return res.status(500).json({ success: false, error: 'Failed to send email: ' + emailResult.error });
    }

    // Update last_sent_at
    await invitationService.resendInvitation(req.dbClient, token);

    // Log audit event
    await AuthService.logAudit(
      req.session.userId,
      'invitation_resend',
      { email: invitation.email, token },
      req.ip,
      req.get('user-agent')
    );

    res.json({ success: true, message: 'Invitation email resent' });
  } catch (error) {
    console.error('Error resending invitation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Revoke invitation
// RBAC: Super admin only
app.post('/observability/api/admin/invitations/:token/revoke',
  requireAuth,
  requireFeatureAccess('invites'),
  async (req, res) => {
  try {
    const { token } = req.params;

    const result = await invitationService.revokeInvitation(req.dbClient, token);

    if (!result) {
      return res.status(404).json({ success: false, error: 'Invitation not found or already revoked' });
    }

    // Log audit event
    await AuthService.logAudit(
      req.session.userId,
      'invitation_revoke',
      { token },
      req.ip,
      req.get('user-agent')
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error revoking invitation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get user preview for scope (super admin only - used in invitation flow)
app.post('/observability/api/admin/scope-preview',
  requireAuth,
  requireFeatureAccess('invites'),
  async (req, res) => {
  try {
    const { scopeType, scopeValue } = req.body;

    // Normalize scope value (strip '+' from country codes)
    const normalizedScopeValue = accessScopeService.normalizeScopeValue(scopeType, scopeValue);

    // Validate scope
    const validation = accessScopeService.validateScope(scopeType, normalizedScopeValue);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    // Build query based on scope type
    let whereClause = '';
    let params = [];

    if (scopeType === 'all') {
      whereClause = '1=1';
      params = [];
    } else if (scopeType === 'country') {
      const countryCodes = normalizedScopeValue.country_codes;
      const conditions = countryCodes.map((_, i) => `phone_number LIKE $${i + 1} || '%'`).join(' OR ');
      whereClause = conditions;
      params = countryCodes;
    } else if (scopeType === 'school') {
      whereClause = 'school_name = ANY($1)';
      params = [normalizedScopeValue.school_names];
    } else if (scopeType === 'phone_list') {
      whereClause = 'phone_number = ANY($1)';
      params = [normalizedScopeValue.phone_numbers];
    } else if (scopeType === 'combined') {
      const conditions = [];
      let paramIndex = 1;

      if (normalizedScopeValue.country_codes && normalizedScopeValue.country_codes.length > 0) {
        const countryConditions = normalizedScopeValue.country_codes.map(() => `phone_number LIKE $${paramIndex++} || '%'`).join(' OR ');
        conditions.push(`(${countryConditions})`);
        params.push(...normalizedScopeValue.country_codes);
      }

      if (normalizedScopeValue.school_names && normalizedScopeValue.school_names.length > 0) {
        conditions.push(`school_name = ANY($${paramIndex++})`);
        params.push(normalizedScopeValue.school_names);
      }

      if (normalizedScopeValue.phone_numbers && normalizedScopeValue.phone_numbers.length > 0) {
        conditions.push(`phone_number = ANY($${paramIndex++})`);
        params.push(normalizedScopeValue.phone_numbers);
      }

      whereClause = conditions.join(' AND ');
    }

    // Get total count (all users matching scope - both registered and unregistered)
    const countQuery = `SELECT COUNT(*) as total FROM users WHERE ${whereClause}`;
    const countResult = await req.dbClient.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].total);

    // Get count of registered users only
    const registeredCountQuery = `SELECT COUNT(*) as total FROM users WHERE ${whereClause} AND registration_completed = true`;
    const registeredResult = await req.dbClient.query(registeredCountQuery, params);
    const registeredCount = parseInt(registeredResult.rows[0].total);

    // Get sample users for preview (limit 100)
    const previewQuery = `SELECT phone_number, first_name, school_name, registration_completed FROM users WHERE ${whereClause} LIMIT 100`;
    const result = await req.dbClient.query(previewQuery, params);

    res.json({
      success: true,
      count: totalCount,
      registeredCount: registeredCount,
      unregisteredCount: totalCount - registeredCount,
      users: result.rows
    });
  } catch (error) {
    console.error('Error generating scope preview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API Health routes (JSON endpoints) - Observability dashboard
// RBAC: All portal users
app.use('/observability/api/api-health', requireAuth, requirePartnerAdmin, apiHealthRoutes);

// Settings routes - Observability dashboard (ADMIN ONLY)
// RBAC: Super admin only
app.use('/observability/settings', requireAuth, requireSuperAdmin, settingsRoutes);

// Word Cloud API routes - Observability dashboard
// RBAC: Partner admin or super admin with wordcloud feature
app.use('/observability/api/wordcloud', requireAuth, requirePartnerAdmin, requireFeatureAccess('wordcloud'), wordCloudRoutes);

// BYOF routes - Build Your Own Feature (Conversational AI for bug/feature planning)
// RBAC: All portal users
app.use('/observability/byof', requireAuth, requirePartnerAdmin, byofRoutes);

// ============================================================================
// AMA (ASK ME ANYTHING) ROUTES
// ============================================================================

// AMA Main Page
app.get('/observability/ama', requireAuth, async (req, res) => {
  res.render('ama', {
    title: 'AMA - Ask Me Anything',
    username: req.session.username,
    userRole: req.session.userRole
  });
});

// Get user's conversations
app.get('/observability/ama/conversations', requireAuth, async (req, res) => {
  try {
    const conversations = await AMAService.getConversations(req.session.userId);
    res.json({ success: true, conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new conversation
app.post('/observability/ama/conversations', requireAuth, async (req, res) => {
  try {
    const conversation = await AMAService.createConversation(req.session.userId);
    res.json({ success: true, conversation });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get messages for a conversation
app.get('/observability/ama/conversations/:conversationId/messages', requireAuth, async (req, res) => {
  try {
    const messages = await AMAService.getMessages(req.params.conversationId);
    res.json({ success: true, messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a conversation
app.delete('/observability/ama/conversations/:conversationId', requireAuth, async (req, res) => {
  console.log('[AMA] 🗑️ Delete conversation request', {
    conversationId: req.params.conversationId,
    userId: req.session?.userId
  });

  try {
    await AMAService.deleteConversation(req.params.conversationId, req.session.userId);
    console.log('[AMA] ✅ Conversation deleted successfully');
    res.json({ success: true });
  } catch (error) {
    console.error('[AMA] ❌ Error deleting conversation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Chat endpoint with SSE streaming
app.post('/observability/ama/chat', requireAuth, async (req, res) => {
  console.log('[AMA] 🚀 Chat endpoint hit', {
    userId: req.session?.userId,
    hasMessage: !!req.body?.message,
    messageLength: req.body?.message?.length,
    conversationId: req.body?.conversationId
  });

  const { message, conversationId } = req.body;

  if (!message) {
    console.log('[AMA] ❌ No message provided');
    return res.status(400).json({ success: false, error: 'Message is required' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  console.log('[AMA] 📡 SSE headers set');

  try {
    // Save user message
    if (conversationId) {
      console.log('[AMA] 💾 Saving user message to conversation');
      await AMAService.saveMessage({
        conversationId,
        role: 'user',
        content: message
      });
    }

    // Get conversation history for context
    let conversationHistory = [];
    if (conversationId) {
      conversationHistory = await AMAService.getMessages(conversationId, 20);
      console.log('[AMA] 📜 Loaded conversation history', { messageCount: conversationHistory?.length });
    }

    // Process message with streaming
    console.log('[AMA] 🔄 Starting processMessage');
    let assistantContent = '';
    let thinkingContent = '';
    let sqlQuery = null;
    let chartType = null;
    let chartImageUrl = null;
    let queryResult = null;
    let responseTimeMs = null;
    let chunkCount = 0;

    for await (const chunk of AMAService.processMessage(message, conversationHistory, req.session.userId)) {
      chunkCount++;
      if (chunkCount === 1 || chunk.type === 'result' || chunk.type === 'error' || chunk.type === 'done') {
        console.log('[AMA] 📦 Chunk received', { type: chunk.type, chunkNumber: chunkCount });
      }
      // Send each chunk as SSE
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);

      // Collect data for saving
      if (chunk.type === 'thinking' && chunk.final) {
        thinkingContent = chunk.content;
      }
      if (chunk.type === 'result') {
        assistantContent = chunk.content;
        sqlQuery = chunk.sql;
        chartType = chunk.chartType;
        chartImageUrl = chunk.chartImageUrl;
        queryResult = chunk.data;
      }
      if (chunk.type === 'text') {
        assistantContent = chunk.content;
      }
      if (chunk.type === 'error') {
        assistantContent = chunk.content;
      }
      if (chunk.type === 'done') {
        responseTimeMs = chunk.responseTime;
      }
    }

    // Save assistant message
    if (conversationId && assistantContent) {
      await AMAService.saveMessage({
        conversationId,
        role: 'assistant',
        content: assistantContent,
        thinkingContent,
        sqlQuery,
        queryResult,
        chartType,
        chartImageUrl,
        responseTimeMs,
        modelUsed: 'gpt-4o-mini'
      });
    }

    console.log('[AMA] ✅ Stream complete', { chunkCount, responseTimeMs });
    res.end();
  } catch (error) {
    console.error('[AMA] 💥 Chat error:', {
      error: error.message,
      stack: error.stack?.substring(0, 500)
    });
    res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
    res.end();
  }
});

// Generate tracer report for a user
app.get('/observability/ama/tracer/:userId', requireAuth, async (req, res) => {
  try {
    const result = await AMAService.generateTracerReport(req.params.userId);
    if (result.error) {
      return res.status(404).json({ success: false, error: result.error });
    }
    res.json({ success: true, report: result.report });
  } catch (error) {
    console.error('Error generating tracer report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// AMA CHATS - SUPER ADMIN ONLY: View all AMA conversations
// ============================================================
app.get('/observability/ama-chats', requireAuth, async (req, res) => {
  // Super admin only check
  if (req.session.userRole !== 'super_admin') {
    return res.status(403).render('error', {
      title: 'Access Denied',
      message: 'You do not have permission to view this page.',
      error: 'Super admin access required',
      username: req.session.username,
      userRole: req.session.userRole,
      isAuthenticated: true
    });
  }

  // Render the same AMA view but with admin mode enabled
  res.render('ama', {
    title: 'AMA Chats (Admin View)',
    username: req.session.username,
    userRole: req.session.userRole,
    currentPage: 'ama-chats',
    isAdminView: true  // Flag to enable admin-only features
  });
});

// API endpoint to get ALL conversations for super admin (used by sidebar)
app.get('/observability/ama-chats/conversations', requireAuth, async (req, res) => {
  // Super admin only check
  if (req.session.userRole !== 'super_admin') {
    return res.status(403).json({ success: false, error: 'Super admin access required' });
  }

  try {
    const { conversations } = await AMAService.getAllConversationsAdmin(100, 0);
    res.json({ success: true, conversations });
  } catch (error) {
    console.error('Error fetching admin conversations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint to get messages for a specific conversation (super admin)
app.get('/observability/ama-chats/:conversationId/messages', requireAuth, async (req, res) => {
  // Super admin only check
  if (req.session.userRole !== 'super_admin') {
    return res.status(403).json({ success: false, error: 'Super admin access required' });
  }

  try {
    const messages = await AMAService.getMessagesAdmin(req.params.conversationId);
    res.json({ success: true, messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Funnel Tracking routes (PUBLIC - no auth required, with CORS and rate limiting)
app.use('/api/track', cors(trackingCorsOptions), trackingLimiter, funnelTrackingRoutes);

// Teacher Portal API routes (with CORS, rate limiting, NO auth middleware - routes handle auth internally)
app.use('/api/portal', cors(portalCorsOptions), portalAuthLimiter, portalDataLimiter, portalRoutes);

// Redirect /dashboard to Teacher Portal frontend (for cases where backend URL is accessed directly)
app.get('/dashboard', (req, res) => {
  // If this is the Teacher Portal backend being accessed, redirect to frontend
  res.redirect(301, `${PORTAL_URL}/portal/dashboard`);
});

// Setup password route for new users (no auth required)
// Checks both new invitation system (invitations table) and legacy system (dashboard_users table)
// Route is under /observability to match the dashboard URL structure
app.get('/observability/setup-password', setDatabaseContext, async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.render('setup-password', {
      error: 'Invalid invitation link',
      invitation: null,
      token: null
    });
  }

  try {
    // Try new invitation system first
    const invitation = await invitationService.getInvitation(req.dbClient, token);

    if (invitation) {
      // Check if invitation is still valid
      const isValid = await invitationService.isInvitationValid(req.dbClient, token);

      if (!isValid) {
        return res.render('setup-password', {
          error: 'This invitation has expired or already been used',
          invitation: null,
          token: null
        });
      }

      return res.render('setup-password', {
        error: null,
        invitation: invitation,
        token: token
      });
    }

    // Fallback: check legacy dashboard_users invite system
    const legacyValidation = await AuthService.validateInviteToken(token);

    if (legacyValidation.valid) {
      const legacyUser = legacyValidation.user;
      return res.render('setup-password', {
        error: null,
        invitation: {
          email: legacyUser.email,
          role: legacyUser.role,
          inviter_username: null,
          _legacy: true
        },
        token: token
      });
    }

    // Token not found in either system
    return res.render('setup-password', {
      error: 'Invalid or expired invitation',
      invitation: null,
      token: null
    });
  } catch (error) {
    console.error('Setup password GET error:', error);
    res.render('setup-password', {
      error: 'An error occurred. Please try again.',
      invitation: null,
      token: null
    });
  }
});

app.post('/observability/setup-password', setDatabaseContext, async (req, res) => {
  const { token, username, password, confirmPassword } = req.body;

  if (!token || !username || !password) {
    return res.render('setup-password', {
      error: 'All fields are required',
      invitation: null,
      token: token
    });
  }

  if (password !== confirmPassword) {
    // Try both systems for re-rendering the form
    const invitation = await invitationService.getInvitation(req.dbClient, token);
    if (invitation) {
      return res.render('setup-password', {
        error: 'Passwords do not match',
        invitation: invitation,
        token: token
      });
    }
    // Fallback to legacy
    const legacyValidation = await AuthService.validateInviteToken(token);
    return res.render('setup-password', {
      error: 'Passwords do not match',
      invitation: legacyValidation.valid ? {
        email: legacyValidation.user.email,
        role: legacyValidation.user.role,
        inviter_username: null,
        _legacy: true
      } : null,
      token: token
    });
  }

  try {
    // Try new invitation system first
    const invitation = await invitationService.getInvitation(req.dbClient, token);

    if (invitation) {
      // Use new invitation system to accept invitation and create user
      const result = await invitationService.acceptInvitation(req.dbClient, token, username, password);

      // Auto-login the user after successful setup
      req.session.isAuthenticated = true;
      req.session.username = result.user.username;
      req.session.userId = result.user.id;
      req.session.userEmail = result.user.email;
      req.session.userRole = result.user.role;
      req.session.accessScope = result.scope;  // Set access scope from invitation

      return req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
        }
        res.redirect('/observability/dashboard');
      });
    }

    // Fallback: use legacy dashboard_users invite system
    const legacyResult = await AuthService.setupAccount(token, username, password);

    if (!legacyResult.success) {
      return res.render('setup-password', {
        error: legacyResult.error || 'Failed to set up account',
        invitation: null,
        token: token
      });
    }

    // Auto-login the user after successful legacy setup
    req.session.isAuthenticated = true;
    req.session.username = legacyResult.user.username;
    req.session.userId = legacyResult.user.id;
    req.session.userEmail = legacyResult.user.email;
    req.session.userRole = legacyResult.user.role;
    req.session.accessScope = null;  // Legacy invites don't have scoped access

    return req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
      }
      res.redirect('/observability/dashboard');
    });
  } catch (error) {
    console.error('Setup password POST error:', error);
    const invitation = await invitationService.getInvitation(req.dbClient, token);
    res.render('setup-password', {
      error: error.message || 'Failed to set up account. Please try again.',
      invitation: invitation,
      token: token
    });
  }
});

// OLD: Redirect root to observability dashboard
// DISABLED: Portal frontend now serves at root path
// app.get('/', (req, res) => {
//   if (req.session && req.session.isAuthenticated) {
//     res.redirect('/dashboard');
//   } else {
//     res.redirect('/login');
//   }
// });

// ============================================================================
// BROADCAST FEATURE ROUTES
// ============================================================================

const broadcastService = require('./services/whatsapp-broadcast.service');
const {
  getUsersForBroadcast,
  getBroadcastUserCounts,
  getBroadcastLogs,
  getBroadcastById,
  createBroadcastLog,
  updateBroadcastLog,
  createBroadcastMessage,
  checkActiveBroadcast,
  checkDuplicateBroadcast,
  checkBroadcastCooldown
} = require('./database/queries');

// Resume any interrupted broadcasts on startup
broadcastService.resumeInterruptedBroadcasts().catch(err => {
  console.error('[Broadcast] Failed to resume interrupted broadcasts:', err.message);
});

// Broadcast main page
app.get('/observability/broadcast', requireAdmin, async (req, res) => {
  try {
    const userCounts = await getBroadcastUserCounts();

    res.render('broadcast', {
      title: 'Broadcast Message',
      username: req.session.username,
      userRole: req.session.userRole,
      userCounts,
      currentPage: 'broadcast'
    });
  } catch (error) {
    console.error('[Broadcast] Error loading page:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load broadcast page',
      error: error.message
    });
  }
});

// Broadcast history page
app.get('/observability/broadcast/history', requireAdmin, async (req, res) => {
  try {
    const broadcasts = await getBroadcastLogs(50, 0);

    res.render('broadcast-history', {
      title: 'Broadcast History',
      username: req.session.username,
      userRole: req.session.userRole,
      broadcasts,
      currentPage: 'broadcast-history'
    });
  } catch (error) {
    console.error('[Broadcast] Error loading history:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load broadcast history',
      error: error.message
    });
  }
});

// Broadcast password (distinct from admin login password)
const BROADCAST_PASSWORD = process.env.BROADCAST_PASSWORD || '';

/**
 * Validate the broadcast-specific password
 * Uses constant-time comparison to prevent timing attacks
 */
function validateBroadcastPassword(inputPassword) {
  if (!inputPassword) return false;

  const inputHash = crypto.createHash('sha256').update(inputPassword).digest('hex');
  const expectedHash = crypto.createHash('sha256').update(BROADCAST_PASSWORD).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(inputHash),
    Buffer.from(expectedHash)
  );
}

/**
 * Mask phone number for privacy display
 */
function maskPhoneNumber(phone) {
  if (!phone || phone.length < 7) return phone;
  return phone.substring(0, 5) + '****' + phone.substring(phone.length - 3);
}

// Search users for targeted broadcast
app.get('/observability/api/broadcast/search-users', requireAdmin, async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;

    // Require minimum search length
    if (!q || q.length < 3) {
      return res.json({
        success: true,
        users: [],
        message: 'Enter at least 3 characters to search'
      });
    }

    // Sanitize and prepare search
    const searchTerm = q.trim().toLowerCase();
    const resultLimit = Math.min(parseInt(limit) || 20, 50);

    // Search by phone OR name
    let query = supabase
      .from('users')
      .select('id, phone_number, first_name, last_name, name')
      .eq('registration_completed', true)
      .not('phone_number', 'is', null);

    // Check if search looks like a phone number (starts with digits)
    if (/^\d+$/.test(searchTerm)) {
      // Phone number search - prefix match
      query = query.like('phone_number', `${searchTerm}%`);
    } else {
      // Name search - use ilike for case-insensitive
      query = query.or(
        `first_name.ilike.%${searchTerm}%,` +
        `last_name.ilike.%${searchTerm}%,` +
        `name.ilike.%${searchTerm}%`
      );
    }

    const { data: users, error } = await query.limit(resultLimit);

    if (error) {
      throw new Error(`Search failed: ${error.message}`);
    }

    // Map results with masked phone numbers
    const results = (users || []).map(user => ({
      id: user.id,
      displayName: user.first_name
        ? `${user.first_name} ${user.last_name || ''}`.trim()
        : user.name || 'Unknown',
      phoneNumber: user.phone_number,
      phoneMasked: maskPhoneNumber(user.phone_number),
      country: user.phone_number.startsWith('92') ? 'PK' :
               user.phone_number.startsWith('94') ? 'LK' : 'Other'
    }));

    res.json({
      success: true,
      users: results,
      count: results.length,
      hasMore: results.length === resultLimit
    });

  } catch (error) {
    console.error('[Broadcast Search] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Dry run - preview without sending
app.post('/observability/api/broadcast/dry-run', requireAdmin, async (req, res) => {
  const { message, activity, country, recipientMode, selectedUserIds } = req.body;

  try {
    // Validate message
    const validation = broadcastService.validateBroadcastContent(message);
    if (!validation.valid) {
      return res.json({
        success: false,
        error: validation.error,
        warnings: validation.warnings
      });
    }

    // Get users based on recipient mode
    let users;

    if (recipientMode === 'search') {
      // Search mode: get specific users by ID
      const userIds = JSON.parse(selectedUserIds || '[]');

      if (!userIds.length) {
        return res.json({
          success: false,
          error: 'No users selected. Please search and select at least one user.'
        });
      }

      const { data, error } = await supabase
        .from('users')
        .select('id, phone_number, first_name, last_name, name')
        .in('id', userIds)
        .eq('registration_completed', true)
        .not('phone_number', 'is', null);

      if (error) throw new Error(`User lookup failed: ${error.message}`);
      users = data || [];
    } else {
      // Filter mode: use existing query
      users = await getUsersForBroadcast({ activity, country });
    }

    // Calculate estimates
    const costEstimate = broadcastService.calculateCost(users);
    const approvalLikelihood = broadcastService.getApprovalLikelihood(message);

    // Sample recipients (masked)
    const sampleRecipients = users.slice(0, 10).map(u => ({
      name: u.first_name || u.name || 'Unknown',
      phone: broadcastService.maskPhoneNumber(u.phone_number),
      country: u.phone_number.startsWith('92') ? 'Pakistan' : 'Sri Lanka'
    }));

    res.json({
      success: true,
      dryRun: true,
      recipientCount: users.length,
      breakdown: {
        pakistan: users.filter(u => u.phone_number.startsWith('92')).length,
        sriLanka: users.filter(u => u.phone_number.startsWith('94')).length,
        other: users.filter(u => !u.phone_number.startsWith('92') && !u.phone_number.startsWith('94')).length
      },
      estimatedCost: costEstimate,
      estimatedTime: broadcastService.getEstimatedTime(users.length),
      sampleRecipients,
      contentAnalysis: {
        characterCount: message.length,
        emojiCount: (message.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length,
        hasUrls: /https?:\/\//.test(message),
        approvalLikelihood
      },
      warnings: validation.warnings
    });

  } catch (error) {
    console.error('[Broadcast] Dry run error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit broadcast for template approval
app.post('/observability/api/broadcast/submit', requireAdmin, async (req, res) => {
  const { message, activity, country, recipientMode, selectedUserIds, adminPassword } = req.body;

  try {
    // Verify broadcast password (distinct from login password)
    if (!validateBroadcastPassword(adminPassword)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid broadcast password. This password is different from your login password.'
      });
    }

    // Validate message
    const validation = broadcastService.validateBroadcastContent(message);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    // Check for active broadcasts
    const activeBroadcast = await checkActiveBroadcast();
    if (activeBroadcast) {
      return res.status(409).json({
        success: false,
        error: `Another broadcast is in progress (started by ${activeBroadcast.admin_username})`
      });
    }

    // Check for duplicate
    const duplicate = await checkDuplicateBroadcast(message, req.session.userId);
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: 'You sent the same message recently. Please wait before sending again.'
      });
    }

    // Get users based on recipient mode
    let users;
    let filtersForLog;

    if (recipientMode === 'search') {
      // Search mode: get specific users by ID
      const userIds = JSON.parse(selectedUserIds || '[]');

      if (!userIds.length) {
        return res.status(400).json({
          success: false,
          error: 'No users selected. Please search and select at least one user.'
        });
      }

      const { data, error } = await supabase
        .from('users')
        .select('id, phone_number, first_name, last_name, name, last_message_at')
        .in('id', userIds)
        .eq('registration_completed', true)
        .not('phone_number', 'is', null);

      if (error) throw new Error(`User lookup failed: ${error.message}`);
      users = data || [];

      if (users.length !== userIds.length) {
        console.warn('[Broadcast] Some selected users not found', {
          requested: userIds.length,
          found: users.length
        });
      }

      filtersForLog = { mode: 'search', selectedUserIds: userIds, count: users.length };
    } else {
      // Filter mode: use existing query
      users = await getUsersForBroadcast({ activity, country });
      filtersForLog = { mode: 'filter', activity, country };
    }

    if (users.length === 0) {
      return res.status(400).json({
        success: false,
        error: recipientMode === 'search'
          ? 'Selected users not found or not registered'
          : 'No users match the selected filters'
      });
    }

    // CRITICAL SAFETY CHECK: For search mode, verify exact user count match
    if (recipientMode === 'search') {
      const expectedUserIds = JSON.parse(selectedUserIds || '[]');
      if (users.length !== expectedUserIds.length) {
        console.error(`[Broadcast] SAFETY CHECK FAILED: Search mode expected ${expectedUserIds.length} users, got ${users.length}`);
        return res.status(400).json({
          success: false,
          error: `Safety check failed: Expected ${expectedUserIds.length} users but found ${users.length}. Some users may not exist or are not registered.`
        });
      }
      console.log(`[Broadcast] Safety check passed: ${users.length} users match selected IDs`);
    }

    // Generate broadcast ID
    const broadcastId = crypto.randomUUID();

    // Split users by service window (24hr rule)
    const usersInWindow = users.filter(u => broadcastService.isWithinServiceWindow(u.last_message_at));
    const usersOutsideWindow = users.filter(u => !broadcastService.isWithinServiceWindow(u.last_message_at));

    console.log(`[Broadcast] Users within 24hr window: ${usersInWindow.length}, outside: ${usersOutsideWindow.length}`);

    // If ALL users are within service window, send direct messages (no template needed)
    if (usersOutsideWindow.length === 0 && usersInWindow.length > 0) {
      console.log(`[Broadcast] All ${usersInWindow.length} users within service window - sending direct messages`);

      // Create broadcast log with direct send status
      await createBroadcastLog({
        id: broadcastId,
        admin_user_id: req.session.userId,
        admin_username: req.session.username,
        admin_ip_address: req.ip,
        admin_user_agent: req.headers['user-agent'],
        message_content: message,
        filters: { ...filtersForLog, directSend: true },
        total_recipients: usersInWindow.length,
        status: 'sending'
      });

      // Send direct messages immediately
      let sentCount = 0;
      let failedCount = 0;
      const errors = [];

      for (const user of usersInWindow) {
        try {
          await broadcastService.sendDirectMessage(user.phone_number, message);
          sentCount++;

          // Store individual message status
          await createBroadcastMessage(broadcastId, user.id, user.phone_number, 'sent');
        } catch (err) {
          failedCount++;
          errors.push({ phone: user.phone_number, error: err.message });
          await createBroadcastMessage(broadcastId, user.id, user.phone_number, 'failed', err.message);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Update broadcast as completed
      await updateBroadcastLog(broadcastId, {
        status: 'completed',
        sent_count: sentCount,
        failed_count: failedCount,
        completed_at: new Date().toISOString(),
        errors: errors.length > 0 ? errors : null
      });

      return res.json({
        success: true,
        broadcastId,
        status: 'completed',
        recipientCount: usersInWindow.length,
        sentCount,
        failedCount,
        message: `Direct messages sent to ${sentCount} users (within 24hr service window)`
      });
    }

    // Otherwise, need to create a template (users outside service window)
    // Create broadcast log
    await createBroadcastLog({
      id: broadcastId,
      admin_user_id: req.session.userId,
      admin_username: req.session.username,
      admin_ip_address: req.ip,
      admin_user_agent: req.headers['user-agent'],
      message_content: message,
      filters: { ...filtersForLog, usersInWindow: usersInWindow.length, usersOutsideWindow: usersOutsideWindow.length },
      total_recipients: users.length,
      status: 'template_pending'
    });

    // Create template with Meta
    const template = await broadcastService.createBroadcastTemplate(broadcastId, message);

    // Update broadcast with template info
    await updateBroadcastLog(broadcastId, {
      template_id: template.templateId,
      template_name: template.templateName,
      template_submitted_at: new Date().toISOString()
    });

    // Start background polling
    broadcastService.startTemplatePolling(broadcastId, template.templateId);

    res.json({
      success: true,
      broadcastId,
      templateId: template.templateId,
      templateName: template.templateName,
      status: 'template_pending',
      recipientCount: users.length,
      usersInWindow: usersInWindow.length,
      usersOutsideWindow: usersOutsideWindow.length,
      message: `Template submitted for approval. ${usersOutsideWindow.length} users outside 24hr window require template.`
    });

  } catch (error) {
    console.error('[Broadcast] Submit error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get broadcast status (SSE stream)
app.get('/observability/api/broadcast/:id/status', requireAdmin, async (req, res) => {
  const { id } = req.params;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendUpdate = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let pollCount = 0;
  const maxPolls = 1800; // 30 minutes at 1 second intervals

  const poll = async () => {
    try {
      const broadcast = await getBroadcastById(id);

      if (!broadcast) {
        sendUpdate('error', { message: 'Broadcast not found' });
        res.end();
        return;
      }

      const progress = broadcast.total_recipients > 0
        ? Math.round((broadcast.sent_count / broadcast.total_recipients) * 100)
        : 0;

      sendUpdate('status', {
        status: broadcast.status,
        templateStatus: broadcast.template_status,
        rejectedReason: broadcast.template_rejected_reason,
        sentCount: broadcast.sent_count || 0,
        failedCount: broadcast.failed_count || 0,
        deliveredCount: broadcast.delivered_count || 0,
        readCount: broadcast.read_count || 0,
        repliedCount: broadcast.replied_count || 0,
        totalRecipients: broadcast.total_recipients,
        progress,
        errors: broadcast.errors?.slice(0, 10)
      });

      pollCount++;

      // Stop polling on terminal states
      if (['completed', 'completed_with_errors', 'failed', 'template_rejected', 'template_timeout', 'cancelled'].includes(broadcast.status)) {
        sendUpdate('complete', broadcast);
        res.end();
        return;
      }

      // Continue polling
      if (pollCount < maxPolls) {
        setTimeout(poll, 2000);
      } else {
        sendUpdate('timeout', { message: 'Polling timeout' });
        res.end();
      }

    } catch (error) {
      sendUpdate('error', { message: error.message });
      res.end();
    }
  };

  // Start polling immediately
  poll();

  // Cleanup on client disconnect
  req.on('close', () => {
    pollCount = maxPolls; // Stop polling
  });
});

// Cancel a broadcast
app.post('/observability/api/broadcast/:id/cancel', requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const broadcast = await getBroadcastById(id);

    if (!broadcast) {
      return res.status(404).json({ success: false, error: 'Broadcast not found' });
    }

    if (!['template_pending', 'sending'].includes(broadcast.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel broadcast with status: ${broadcast.status}`
      });
    }

    // Cancel template polling if active
    broadcastService.cancelTemplatePolling(id);

    await updateBroadcastLog(id, {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: req.session.username
    });

    res.json({ success: true, message: 'Broadcast cancelled' });

  } catch (error) {
    console.error('[Broadcast] Cancel error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get delivery stats for a broadcast
app.get('/observability/api/broadcast/:id/stats', requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const broadcast = await getBroadcastById(id);

    if (!broadcast) {
      return res.status(404).json({ success: false, error: 'Broadcast not found' });
    }

    const total = broadcast.sent_count || 1;

    res.json({
      success: true,
      broadcastId: id,
      status: broadcast.status,
      startedAt: broadcast.started_at,
      completedAt: broadcast.completed_at,
      counts: {
        sent: broadcast.sent_count || 0,
        delivered: broadcast.delivered_count || 0,
        read: broadcast.read_count || 0,
        replied: broadcast.replied_count || 0,
        failed: broadcast.failed_count || 0
      },
      rates: {
        deliveryRate: ((broadcast.delivered_count || 0) / total * 100).toFixed(1),
        readRate: ((broadcast.read_count || 0) / total * 100).toFixed(1),
        replyRate: ((broadcast.replied_count || 0) / total * 100).toFixed(1),
        failureRate: ((broadcast.failed_count || 0) / total * 100).toFixed(1)
      },
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Broadcast] Stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// HEALTH CHECK (before static serving)
// ============================================================================

app.get('/health', (req, res) => {
  const fs = require('fs');
  const versionFile = path.join(__dirname, '../VERSION'); // VERSION file is in parent directory
  let version = '2.1.0'; // Default fallback

  try {
    if (fs.existsSync(versionFile)) {
      version = fs.readFileSync(versionFile, 'utf8').trim();
    }
  } catch (err) {
    console.error('Error reading VERSION file:', err);
  }

  res.json({
    status: 'healthy',
    service: 'Rumi Dashboard',
    version: version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ============================================================================
// TEACHER PORTAL FRONTEND SERVING (React SPA)
// ============================================================================

// Serve static frontend files from /portal-frontend/dist folder
// This includes all compiled React/Vite assets (JS, CSS, images)
app.use(express.static(path.join(__dirname, 'portal-frontend', 'dist')));

// SPA Catch-all route: Serve index.html for all non-API, non-observability routes
// This allows React Router to handle client-side routing for the TEACHER PORTAL
// IMPORTANT: This must be AFTER all API routes and BEFORE error handlers
app.get('*', (req, res, next) => {
  // Serve teacher portal frontend for all routes EXCEPT:
  // - /api/* - Backend API routes (portal + observability APIs)
  // - /observability/* - Admin observability dashboard
  const isExcludedPath = req.path.startsWith('/api/') || req.path.startsWith('/observability/');

  if (!isExcludedPath) {
    // Serve portal frontend (teacher portal React app)
    res.sendFile(path.join(__dirname, 'portal-frontend', 'dist', 'index.html'));
  } else {
    // Let other handlers deal with it (API routes or observability pages)
    next();
  }
});

// ============================================================================
// ERROR HANDLERS (must be LAST, after all routes and static serving)
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Not Found',
    message: 'Page not found',
    error: 'The requested page does not exist'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).render('error', {
    title: 'Server Error',
    message: 'An unexpected error occurred',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, '0.0.0.0', () => {
  const fs = require('fs');
  const versionFile = path.join(__dirname, '../VERSION');
  let version = '2.1.0';

  try {
    if (fs.existsSync(versionFile)) {
      version = fs.readFileSync(versionFile, 'utf8').trim();
    }
  } catch (err) {
    // Use default version
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 Rumi Dashboard v${version}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`✅ Running on http://0.0.0.0:${PORT}`);
  console.log(`🔗 Health Check: http://0.0.0.0:${PORT}/health`);
  console.log(`🔐 Login with username: ${ADMIN_USERNAME}`);
  console.log(`   (Default password_hash: admin123 - change via ADMIN_PASSWORD_HASH env var)`);
  console.log(`${'='.repeat(70)}\n`);

  // Start materialized view refresh scheduler (bd-044)
  const mvScheduler = require('./services/mv-refresh-scheduler.service');
  mvScheduler.start({
    connectionString: process.env.DATABASE_URL,
    intervalMs: 5 * 60 * 1000 // 5 minutes
  });
  console.log('📊 Materialized view refresh scheduler started (5-minute interval)');
});
