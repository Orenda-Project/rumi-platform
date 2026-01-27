/**
 * Authentication Middleware for Admin Dashboard
 */

/**
 * Middleware to check if user is authenticated
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.isAuthenticated) {
    return next();
  }

  // Store the requested URL to redirect after login
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

/**
 * Middleware to redirect if already authenticated
 */
function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.isAuthenticated) {
    return res.redirect('/dashboard');
  }
  next();
}

module.exports = {
  requireAuth,
  redirectIfAuthenticated
};
