/**
 * Rumi - Admin Dashboard
 *
 * Provides a web interface for monitoring bot activity and viewing conversations
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const { requireAuth, redirectIfAuthenticated } = require('../shared/middleware/auth');
const {
  getDashboardStats,
  getAllUsers,
  getUserConversations,
  getUserById,
  getRecentActivity
} = require('../shared/database/queries');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 4000;

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

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts, please try again later.'
});

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make user session available in all templates
app.use((req, res, next) => {
  res.locals.isAuthenticated = req.session.isAuthenticated || false;
  res.locals.username = req.session.username || null;
  next();
});

// ============================================================================
// ROUTES
// ============================================================================

// Login page
app.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('login', {
    error: null,
    title: 'Admin Login'
  });
});

// Login POST
app.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('login', {
      error: 'Please provide both username and password',
      title: 'Admin Login'
    });
  }

  // Check credentials
  if (username === ADMIN_USERNAME && bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
    req.session.isAuthenticated = true;
    req.session.username = username;

    const returnTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;

    return res.redirect(returnTo);
  }

  res.render('login', {
    error: 'Invalid username or password',
    title: 'Admin Login'
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Session destroy error:', err);
    }
    res.redirect('/login');
  });
});

// Dashboard home (stats)
app.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const stats = await getDashboardStats();
    const recentActivity = await getRecentActivity(5);

    res.render('dashboard', {
      title: 'Dashboard',
      stats,
      recentActivity
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

// Users list
app.get('/users', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    const users = await getAllUsers(limit, offset);

    res.render('users', {
      title: 'Users',
      users,
      currentPage: page
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

// Conversations for a specific user
app.get('/conversations/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    const [user, conversations] = await Promise.all([
      getUserById(userId),
      getUserConversations(userId, 100)
    ]);

    res.render('conversations', {
      title: `Conversations - ${user.name || user.phone_number}`,
      user,
      conversations
    });
  } catch (error) {
    console.error('Conversations error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load conversations',
      error: error.message
    });
  }
});

// Redirect root to dashboard
app.get('/', (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

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

app.listen(PORT, () => {
  console.log(`📊 Admin Dashboard running on http://localhost:${PORT}`);
  console.log(`🔐 Login with username: ${ADMIN_USERNAME}`);
  console.log(`   (Default password: admin123 - change via ADMIN_PASSWORD_HASH env var)\n`);
});
