# RBAC Middleware Usage Examples

This document shows how to use the Partner RBAC middleware system in Express routes.

## Table of Contents

1. [Basic Setup](#basic-setup)
2. [Database Context Middleware](#database-context-middleware)
3. [RBAC Middleware](#rbac-middleware)
4. [Feature Access Middleware](#feature-access-middleware)
5. [Complete Examples](#complete-examples)
6. [Common Patterns](#common-patterns)

---

## Basic Setup

### Import Middleware

```javascript
const {
  // Database Context
  setDatabaseContext,
  withDatabaseContext,

  // RBAC
  requireSuperAdmin,
  requireAdmin,
  requirePartnerAdmin,
  requireAuth,
  requireRole,

  // Feature Access
  requireFeatureAccess,
  getAccessibleFeatures,
  hasFeatureAccess
} = require('./middleware/rbac');
```

### Apply Database Context Globally

```javascript
const express = require('express');
const app = express();

// Apply database context middleware to ALL routes that need RLS
app.use(setDatabaseContext);

// ... your routes
```

---

## Database Context Middleware

The `setDatabaseContext` middleware:
1. Sets `SET ROLE portal_app_user`
2. Calls `set_portal_user_context(userId)`
3. Attaches `req.dbClient` for route handlers
4. Automatically cleans up (RESET ROLE) after response

### Basic Usage

```javascript
// Apply globally
app.use(setDatabaseContext);

// Use req.dbClient in route handlers
router.get('/api/users', async (req, res) => {
  try {
    // RLS is automatically enforced
    const result = await req.dbClient.query('SELECT * FROM users LIMIT 10');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Using withDatabaseContext Helper

```javascript
router.get('/api/users', async (req, res) => {
  try {
    const users = await withDatabaseContext(req, async (client) => {
      const result = await client.query('SELECT * FROM users LIMIT 10');
      return result.rows;
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## RBAC Middleware

### Super Admin Only Routes

```javascript
// Only super_admin can access
router.post('/api/partners', requireSuperAdmin, async (req, res) => {
  // Create new partner organization
  // Only super admins can do this
});

router.delete('/api/partners/:id', requireSuperAdmin, async (req, res) => {
  // Delete partner organization
});
```

### Partner Admin Routes

```javascript
// super_admin OR partner_admin can access
router.get('/api/users', requirePartnerAdmin, async (req, res) => {
  // Get users (scoped by RLS)
  // Partner admin sees only their users
  // Super admin sees all users
});
```

### Custom Role Requirements

```javascript
// Multiple roles allowed
router.get('/api/analytics', requireRole(['super_admin', 'partner_admin', 'partner_viewer']), async (req, res) => {
  // Any of these roles can access analytics
});

// Single role
router.get('/api/admin/settings', requireRole('super_admin'), async (req, res) => {
  // Only super_admin
});
```

### Accessing User Role in Route Handler

```javascript
router.get('/api/users', requirePartnerAdmin, async (req, res) => {
  // req.userRole is attached by RBAC middleware
  console.log('User role:', req.userRole); // 'super_admin' or 'partner_admin'

  const result = await req.dbClient.query('SELECT * FROM users LIMIT 10');
  res.json({
    role: req.userRole,
    users: result.rows
  });
});
```

---

## Feature Access Middleware

### Checking Feature Access

```javascript
// Check if user can access 'users' feature
router.get('/api/users', requireFeatureAccess('users'), async (req, res) => {
  // Only users with access to 'users' feature can access this route
  const result = await req.dbClient.query('SELECT * FROM users LIMIT 10');
  res.json(result.rows);
});

// Check if user can access 'coaching' feature
router.get('/api/coaching', requireFeatureAccess('coaching'), async (req, res) => {
  const result = await req.dbClient.query('SELECT * FROM coaching_sessions LIMIT 10');
  res.json(result.rows);
});
```

### Getting Accessible Features for User

```javascript
// Get all features user can access (for building UI navigation)
router.get('/api/user/features', requireAuth, async (req, res) => {
  const features = await getAccessibleFeatures(req.session.userId);
  res.json({ features });
});
```

### Checking Feature Access Programmatically

```javascript
router.get('/api/complex-operation', requireAuth, async (req, res) => {
  // Check multiple features
  const canAccessUsers = await hasFeatureAccess(req.session.userId, 'users');
  const canAccessCoaching = await hasFeatureAccess(req.session.userId, 'coaching');

  if (!canAccessUsers || !canAccessCoaching) {
    return res.status(403).json({
      error: 'This operation requires access to both users and coaching features'
    });
  }

  // Proceed with operation
  // ...
});
```

---

## Complete Examples

### Example 1: User List Endpoint

```javascript
const express = require('express');
const router = express.Router();
const {
  setDatabaseContext,
  requirePartnerAdmin,
  requireFeatureAccess
} = require('../middleware/rbac');

// Apply database context to all routes
router.use(setDatabaseContext);

// Get users with RBAC + Feature Access + RLS
router.get(
  '/users',
  requirePartnerAdmin,           // Check role: super_admin or partner_admin
  requireFeatureAccess('users'), // Check feature permission
  async (req, res) => {
    try {
      // RLS automatically filters users based on access scope
      const result = await req.dbClient.query(`
        SELECT id, phone_number, first_name, school_name, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 50
      `);

      res.json({
        role: req.userRole,
        totalUsers: result.rows.length,
        users: result.rows
      });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  }
);

module.exports = router;
```

### Example 2: Partner Management Endpoint (Super Admin Only)

```javascript
const express = require('express');
const router = express.Router();
const {
  setDatabaseContext,
  requireSuperAdmin,
  requireFeatureAccess
} = require('../middleware/rbac');

// Apply database context
router.use(setDatabaseContext);

// Create new partner (super admin only)
router.post(
  '/partners',
  requireSuperAdmin,                        // Only super_admin
  requireFeatureAccess('partner_management'), // Must have partner_management feature
  async (req, res) => {
    try {
      const { name, email, countryCode } = req.body;

      // Create partner organization
      const org = await req.dbClient.query(
        `INSERT INTO portal_organizations (name, contact_email, is_active)
         VALUES ($1, $2, true)
         RETURNING id`,
        [name, email]
      );

      // Create admin user for partner
      const user = await req.dbClient.query(
        `INSERT INTO dashboard_users (email, username, role, organization_id, is_active)
         VALUES ($1, $2, 'partner_admin', $3, true)
         RETURNING id`,
        [email, email.split('@')[0], org.rows[0].id]
      );

      // Create access scope
      await req.dbClient.query(
        `INSERT INTO access_scopes (dashboard_user_id, scope_type, scope_value)
         VALUES ($1, 'country', $2)`,
        [user.rows[0].id, JSON.stringify({ country_codes: [countryCode] })]
      );

      res.json({
        success: true,
        organizationId: org.rows[0].id,
        userId: user.rows[0].id
      });
    } catch (error) {
      console.error('Error creating partner:', error);
      res.status(500).json({ error: 'Failed to create partner' });
    }
  }
);

module.exports = router;
```

### Example 3: Analytics Endpoint (Multiple Roles)

```javascript
const express = require('express');
const router = express.Router();
const {
  setDatabaseContext,
  requireRole,
  requireFeatureAccess
} = require('../middleware/rbac');

router.use(setDatabaseContext);

// Analytics accessible to multiple roles
router.get(
  '/analytics/users',
  requireRole(['super_admin', 'partner_admin', 'partner_viewer']), // Multiple roles allowed
  requireFeatureAccess('analytics'),                                 // Must have analytics feature
  async (req, res) => {
    try {
      // RLS ensures partners only see their scoped users
      const result = await req.dbClient.query(`
        SELECT
          COUNT(*) as total_users,
          COUNT(*) FILTER (WHERE registration_completed = true) as registered_users,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_users_7d
        FROM users
      `);

      res.json({
        role: req.userRole,
        stats: result.rows[0]
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  }
);

module.exports = router;
```

---

## Common Patterns

### Pattern 1: Layered Middleware

```javascript
// Layer 1: Database Context (always first)
// Layer 2: Authentication/RBAC
// Layer 3: Feature Access
// Layer 4: Route Handler

router.get(
  '/users',
  setDatabaseContext,          // 1. Set up RLS context
  requirePartnerAdmin,         // 2. Check role
  requireFeatureAccess('users'), // 3. Check feature
  async (req, res) => {        // 4. Handle request
    // ...
  }
);
```

### Pattern 2: Route-Level Database Context

```javascript
// Apply database context to specific router
const usersRouter = express.Router();
usersRouter.use(setDatabaseContext);

// All routes in this router have database context
usersRouter.get('/', requirePartnerAdmin, requireFeatureAccess('users'), getUsers);
usersRouter.get('/:id', requirePartnerAdmin, requireFeatureAccess('users'), getUserById);
usersRouter.post('/', requireSuperAdmin, requireFeatureAccess('users'), createUser);
```

### Pattern 3: Conditional Feature Access

```javascript
router.get('/dashboard', requireAuth, async (req, res) => {
  // Get accessible features for user
  const features = await getAccessibleFeatures(req.session.userId);

  // Build dashboard based on available features
  const dashboardData = {};

  if (features.includes('users')) {
    const users = await req.dbClient.query('SELECT COUNT(*) FROM users');
    dashboardData.totalUsers = users.rows[0].count;
  }

  if (features.includes('coaching')) {
    const sessions = await req.dbClient.query('SELECT COUNT(*) FROM coaching_sessions');
    dashboardData.totalSessions = sessions.rows[0].count;
  }

  res.json({
    role: req.userRole,
    features,
    data: dashboardData
  });
});
```

### Pattern 4: Error Handling

```javascript
router.get('/users', requirePartnerAdmin, requireFeatureAccess('users'), async (req, res) => {
  try {
    const result = await req.dbClient.query('SELECT * FROM users LIMIT 10');
    res.json(result.rows);
  } catch (error) {
    console.error('Error in /users route:', error);

    // Database context middleware will still cleanup
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch users'
    });
  }
});
```

---

## Migration Checklist

When migrating existing routes to use RBAC:

- [ ] Add `setDatabaseContext` middleware (globally or per-router)
- [ ] Add `requireRole` or convenience middleware (`requireSuperAdmin`, etc.)
- [ ] Add `requireFeatureAccess` for feature-specific routes
- [ ] Replace direct pool queries with `req.dbClient`
- [ ] Remove manual connection management (no more `client.release()`)
- [ ] Test with different user roles (super_admin, partner_admin, partner_viewer)
- [ ] Verify RLS enforcement (partners see only their scoped data)

---

## Debugging Tips

### Check User Role

```javascript
router.get('/debug/role', requireAuth, async (req, res) => {
  res.json({
    userId: req.session.userId,
    role: req.userRole
  });
});
```

### Check Feature Access

```javascript
router.get('/debug/features', requireAuth, async (req, res) => {
  const features = await getAccessibleFeatures(req.session.userId);
  res.json({ features });
});
```

### Check RLS Context

```javascript
router.get('/debug/context', setDatabaseContext, async (req, res) => {
  const context = await req.dbClient.query("SELECT current_setting('app.portal_user_id', true) AS portal_user_id");
  const role = await req.dbClient.query('SELECT current_user');

  res.json({
    portalUserId: context.rows[0].portal_user_id,
    databaseRole: role.rows[0].current_user
  });
});
```

### Check Visible Users Count

```javascript
router.get('/debug/users-count', setDatabaseContext, requireAuth, async (req, res) => {
  const result = await req.dbClient.query('SELECT COUNT(*) FROM users');

  res.json({
    role: req.userRole,
    visibleUsers: result.rows[0].count
  });
});
```
