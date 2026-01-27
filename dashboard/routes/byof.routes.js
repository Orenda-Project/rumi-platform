/**
 * BYOF Routes
 *
 * Build Your Own Feature - Conversational AI for bug reporting and feature planning
 * Prefix: /observability/byof
 */

const express = require('express');
const router = express.Router();
const byofService = require('../services/byof.service');
const byofAgent = require('../services/byof-agent.service');

/**
 * Middleware: Check BYOF access
 * User must have byof_role set to access BYOF features
 */
function requireByofAccess(req, res, next) {
  const byofRole = req.session?.userByofRole || req.session?.user?.byof_role;

  if (!byofRole) {
    return res.status(403).render('error', {
      title: 'Access Denied',
      message: 'You do not have access to BYOF. Contact an admin to get access.',
      error: null
    });
  }

  // Store for later use
  req.byofRole = byofRole;
  next();
}

/**
 * Middleware: Check BYOF approver role
 * Only approvers can approve/reject plans
 */
function requireByofApprover(req, res, next) {
  const byofRole = req.session?.userByofRole || req.session?.user?.byof_role;

  if (byofRole !== 'approver') {
    return res.status(403).json({
      success: false,
      error: 'Only approvers can perform this action'
    });
  }

  req.byofRole = byofRole;
  next();
}

// ============================================================
// Views
// ============================================================

/**
 * GET /observability/byof
 * Main BYOF dashboard - list sessions and create new ones
 */
router.get('/', requireByofAccess, async (req, res) => {
  try {
    const userId = req.session?.userId;
    const byofRole = req.byofRole;

    // Approvers see all sessions, reporters see only their own
    let sessionsResult;
    if (byofRole === 'approver') {
      sessionsResult = await byofService.getAllSessions();
    } else {
      sessionsResult = await byofService.getUserSessions(userId);
    }

    const sessions = sessionsResult.success ? sessionsResult.sessions : [];

    // Organize sessions into Kanban columns based on session status + plan status
    const kanban = {
      not_started: [],    // active sessions (still chatting)
      submitted: [],      // plan_ready (waiting for approval)
      approved: [],       // approved/in_progress (work started)
      staging: [],        // staging_live
      production: []      // production_live
    };

    for (const session of sessions) {
      // Get plan for this session to determine full status
      const planResult = await byofService.getPlanBySession(session.id);
      const plan = planResult.success ? planResult.plan : null;
      session.plan = plan;

      // Determine Kanban column based on plan status (if exists) or session status
      if (plan) {
        if (plan.status === 'production_live') {
          kanban.production.push(session);
        } else if (plan.status === 'staging_live') {
          kanban.staging.push(session);
        } else if (plan.status === 'approved' || plan.status === 'in_progress') {
          kanban.approved.push(session);
        } else if (plan.status === 'draft' || session.status === 'plan_ready') {
          kanban.submitted.push(session);
        } else {
          kanban.not_started.push(session);
        }
      } else {
        // No plan yet - still in conversation phase
        kanban.not_started.push(session);
      }
    }

    res.render('byof', {
      title: 'The Forge',
      currentPage: 'byof',
      user: req.session?.user || null,
      byofRole,
      sessions,
      kanban,
      error: sessionsResult.error || null
    });
  } catch (error) {
    console.error('[BYOF Routes] Dashboard error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load BYOF dashboard',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

/**
 * GET /observability/byof/session/:id
 * View a specific session with chat history
 */
router.get('/session/:id', requireByofAccess, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const result = await byofService.getSessionById(sessionId);

    if (!result.success) {
      return res.status(404).render('error', {
        title: 'Not Found',
        message: 'Session not found',
        error: null
      });
    }

    res.render('byof-session', {
      title: `BYOF - ${result.session.title || 'Untitled Session'}`,
      currentPage: 'byof',
      user: req.session?.user || null,
      byofRole: req.byofRole,
      session: result.session
    });
  } catch (error) {
    console.error('[BYOF Routes] Session view error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load session',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

/**
 * GET /observability/byof/new
 * Create new session form
 */
router.get('/new', requireByofAccess, (req, res) => {
  res.render('byof-new', {
    title: 'BYOF - New Report',
    currentPage: 'byof',
    user: req.session?.user || null,
    byofRole: req.byofRole
  });
});

// ============================================================
// API Endpoints
// ============================================================

/**
 * POST /observability/byof/api/sessions
 * Create a new BYOF session
 */
router.post('/api/sessions', requireByofAccess, async (req, res) => {
  try {
    const userId = req.session?.userId;
    const { type, title } = req.body;

    if (!byofService.canCreateSession(req.byofRole)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to create sessions'
      });
    }

    const result = await byofService.createSession(userId, type, title);

    if (result.success) {
      res.json({
        success: true,
        session: result.session
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Create session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create session'
    });
  }
});

/**
 * GET /observability/byof/api/sessions
 * Get sessions (user's own or all for approvers)
 */
router.get('/api/sessions', requireByofAccess, async (req, res) => {
  try {
    const userId = req.session?.userId;
    const byofRole = req.byofRole;
    const status = req.query.status || null;

    let result;
    if (byofRole === 'approver') {
      result = await byofService.getAllSessions(status);
    } else {
      result = await byofService.getUserSessions(userId, status);
    }

    res.json({
      success: result.success,
      sessions: result.sessions || [],
      error: result.error
    });
  } catch (error) {
    console.error('[BYOF Routes] Get sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sessions'
    });
  }
});

/**
 * GET /observability/byof/api/sessions/:id
 * Get a specific session with messages
 */
router.get('/api/sessions/:id', requireByofAccess, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const result = await byofService.getSessionById(sessionId);

    if (result.success) {
      res.json({
        success: true,
        session: result.session
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Get session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session'
    });
  }
});

/**
 * POST /observability/byof/api/sessions/:id/messages
 * Add a message to a session (user message)
 * In Phase 2, this will also trigger AI response
 */
router.post('/api/sessions/:id/messages', requireByofAccess, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { content, attachments } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Message content is required'
      });
    }

    // Add user message
    const userMessageResult = await byofService.addMessage(
      sessionId,
      'user',
      content,
      attachments || []
    );

    if (!userMessageResult.success) {
      return res.status(400).json({
        success: false,
        error: userMessageResult.error
      });
    }

    // Phase 2: Get AI response
    try {
      // Get session details for context
      const sessionResult = await byofService.getSessionById(sessionId);
      if (!sessionResult.success) {
        return res.json({
          success: true,
          message: userMessageResult.message,
          aiResponse: {
            error: 'Failed to load session context',
            pending: false
          }
        });
      }

      const session = sessionResult.session;

      // Call AI agent
      const aiResponse = await byofAgent.processUserMessage(
        {
          id: session.id,
          type: session.type,
          title: session.title
        },
        content,
        session.messages || []
      );

      // Save AI response as message
      const aiMessageResult = await byofService.addMessage(
        sessionId,
        'assistant',
        aiResponse.content,
        []
      );

      res.json({
        success: true,
        message: userMessageResult.message,
        aiResponse: {
          pending: false,
          content: aiResponse.content,
          message: aiMessageResult.success ? aiMessageResult.message : null
        }
      });
    } catch (aiError) {
      console.error('[BYOF Routes] AI response error:', aiError.message);

      // Return user message even if AI fails
      res.json({
        success: true,
        message: userMessageResult.message,
        aiResponse: {
          pending: false,
          error: 'AI is temporarily unavailable. Please try again.',
          details: process.env.NODE_ENV === 'development' ? aiError.message : undefined
        }
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Add message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add message'
    });
  }
});

/**
 * GET /observability/byof/api/sessions/:id/messages
 * Get all messages for a session
 */
router.get('/api/sessions/:id/messages', requireByofAccess, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const result = await byofService.getSessionMessages(sessionId);

    res.json({
      success: result.success,
      messages: result.messages || [],
      error: result.error
    });
  } catch (error) {
    console.error('[BYOF Routes] Get messages error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch messages'
    });
  }
});

/**
 * PATCH /observability/byof/api/sessions/:id/status
 * Update session status
 */
router.patch('/api/sessions/:id/status', requireByofAccess, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { status } = req.body;

    const result = await byofService.updateSessionStatus(sessionId, status);

    if (result.success) {
      res.json({
        success: true,
        session: result.session
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Update status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update session status'
    });
  }
});

// ============================================================
// Plan API
// ============================================================

/**
 * GET /observability/byof/api/sessions/:id/plan
 * Get the plan for a session
 */
router.get('/api/sessions/:id/plan', requireByofAccess, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const result = await byofService.getPlanBySession(sessionId);

    if (result.success) {
      res.json({
        success: true,
        plan: result.plan
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Get plan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch plan'
    });
  }
});

/**
 * POST /observability/byof/api/sessions/:id/plan/approve
 * Approve a plan (approver only)
 */
router.post('/api/sessions/:id/plan/approve', requireByofApprover, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const userId = req.session?.userId;
    const { notes } = req.body;

    // Get the plan for this session
    const planResult = await byofService.getPlanBySession(sessionId);
    if (!planResult.success) {
      return res.status(404).json({
        success: false,
        error: 'No plan found for this session'
      });
    }

    // Approve the plan
    const result = await byofService.approvePlan(planResult.plan.id, userId, notes || '');

    if (result.success) {
      // Update session status to approved
      await byofService.updateSessionStatus(sessionId, 'approved');

      res.json({
        success: true,
        plan: result.plan,
        message: 'Plan approved successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Approve plan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve plan'
    });
  }
});

/**
 * POST /observability/byof/api/sessions/:id/plan/reject
 * Reject a plan (approver only)
 */
router.post('/api/sessions/:id/plan/reject', requireByofApprover, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const userId = req.session?.userId;
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required'
      });
    }

    // Get the plan for this session
    const planResult = await byofService.getPlanBySession(sessionId);
    if (!planResult.success) {
      return res.status(404).json({
        success: false,
        error: 'No plan found for this session'
      });
    }

    // Reject the plan
    const result = await byofService.rejectPlan(planResult.plan.id, userId, reason);

    if (result.success) {
      // Update session status back to active for revision
      await byofService.updateSessionStatus(sessionId, 'active');

      res.json({
        success: true,
        plan: result.plan,
        message: 'Plan rejected. The reporter can continue the conversation to revise.'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Reject plan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject plan'
    });
  }
});

// ============================================================
// PR Linking API (Phase 4)
// ============================================================

/**
 * POST /observability/byof/api/plans/:id/link-pr
 * Link a GitHub PR to a plan (approver only)
 */
router.post('/api/plans/:id/link-pr', requireByofApprover, async (req, res) => {
  try {
    const planId = req.params.id;
    const { prUrl } = req.body;

    if (!prUrl) {
      return res.status(400).json({
        success: false,
        error: 'PR URL is required'
      });
    }

    // Validate PR URL format
    if (!byofService.validatePrUrl(prUrl)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid GitHub PR URL. Must be in format: https://github.com/owner/repo/pull/123'
      });
    }

    // Link PR to plan
    const result = await byofService.linkPrToPlan(planId, prUrl);

    if (result.success) {
      res.json({
        success: true,
        plan: result.plan,
        message: 'PR linked successfully. Status updated to in_progress.'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Link PR error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to link PR'
    });
  }
});

/**
 * GET /observability/byof/api/plans/:id
 * Get a plan by ID with full details
 */
router.get('/api/plans/:id', requireByofAccess, async (req, res) => {
  try {
    const planId = req.params.id;
    const result = await byofService.getPlanWithReporter(planId);

    if (result.success) {
      res.json({
        success: true,
        plan: result.plan
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Get plan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch plan'
    });
  }
});

// ============================================================
// GitHub Webhook (Phase 4)
// ============================================================

/**
 * POST /observability/byof/webhook/github
 * GitHub webhook for PR merge events
 * Auto-updates plan status when PRs are merged
 */
router.post('/webhook/github', async (req, res) => {
  try {
    const event = req.headers['x-github-event'];

    // Only process pull_request events
    if (event !== 'pull_request') {
      return res.json({ received: true, action: 'ignored', reason: 'Not a pull_request event' });
    }

    const result = await byofService.processGitHubWebhook(req.body);

    if (result.success) {
      console.log(`[BYOF Webhook] Processed: ${result.action}`);
      res.json({
        received: true,
        action: result.action,
        planId: result.plan?.id
      });
    } else {
      console.error('[BYOF Webhook] Error:', result.error);
      res.status(500).json({
        received: true,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Webhook error:', error);
    res.status(500).json({
      received: false,
      error: 'Failed to process webhook'
    });
  }
});

// ============================================================
// Admin API (Approver only)
// ============================================================

/**
 * PATCH /observability/byof/api/users/:id/byof-role
 * Update a user's BYOF role (approver only)
 */
router.patch('/api/users/:id/byof-role', requireByofApprover, async (req, res) => {
  try {
    const userId = req.params.id;
    const { byofRole } = req.body;

    const result = await byofService.updateUserByofRole(userId, byofRole);

    if (result.success) {
      res.json({
        success: true,
        message: 'BYOF role updated successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Update role error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update BYOF role'
    });
  }
});

/**
 * GET /observability/byof/api/admin/users
 * Get all users with BYOF roles (approver only)
 */
router.get('/api/admin/users', requireByofApprover, async (req, res) => {
  try {
    const result = await byofService.getAllUsersWithByofRole();

    if (result.success) {
      res.json({
        success: true,
        users: result.users
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

/**
 * GET /observability/byof/api/admin/statistics
 * Get session and plan statistics (approver only)
 */
router.get('/api/admin/statistics', requireByofApprover, async (req, res) => {
  try {
    const result = await byofService.getSessionStatistics();

    if (result.success) {
      res.json({
        success: true,
        stats: result.stats
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Get statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

/**
 * GET /observability/byof/api/admin/activity
 * Get recent activity feed (approver only)
 */
router.get('/api/admin/activity', requireByofApprover, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const result = await byofService.getRecentActivity(limit);

    if (result.success) {
      res.json({
        success: true,
        activity: result.activity
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Get activity error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity'
    });
  }
});

/**
 * GET /observability/byof/api/admin/pending
 * Get pending approvals (approver only)
 */
router.get('/api/admin/pending', requireByofApprover, async (req, res) => {
  try {
    const result = await byofService.getPendingApprovals();

    if (result.success) {
      res.json({
        success: true,
        plans: result.plans
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Get pending error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending approvals'
    });
  }
});

/**
 * GET /observability/byof/api/admin/completed
 * Get completed plans (approver only)
 */
router.get('/api/admin/completed', requireByofApprover, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const result = await byofService.getCompletedPlans(limit);

    if (result.success) {
      res.json({
        success: true,
        plans: result.plans
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Get completed error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch completed plans'
    });
  }
});

/**
 * GET /observability/byof/api/admin/approval-log
 * Get approval history log (approver only)
 */
router.get('/api/admin/approval-log', requireByofApprover, async (req, res) => {
  try {
    const planId = req.query.planId || null;
    const limit = parseInt(req.query.limit) || 50;
    const result = await byofService.getApprovalLog(planId, limit);

    if (result.success) {
      res.json({
        success: true,
        log: result.log
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Get approval log error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch approval log'
    });
  }
});

/**
 * POST /observability/byof/api/admin/search
 * Search sessions with filters (approver only)
 */
router.post('/api/admin/search', requireByofApprover, async (req, res) => {
  try {
    const filters = req.body;
    const result = await byofService.searchSessions(filters);

    if (result.success) {
      res.json({
        success: true,
        sessions: result.sessions
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search sessions'
    });
  }
});

/**
 * POST /observability/byof/api/admin/export
 * Export session data (approver only)
 */
router.post('/api/admin/export', requireByofApprover, async (req, res) => {
  try {
    const filters = req.body;
    const result = await byofService.exportSessionData(filters);

    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[BYOF Routes] Export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export data'
    });
  }
});

// ============================================================
// Admin Dashboard View (Phase 5)
// ============================================================

/**
 * GET /observability/byof/admin
 * Admin dashboard page (approver only)
 */
router.get('/admin', requireByofApprover, async (req, res) => {
  try {
    // Get statistics
    const statsResult = await byofService.getSessionStatistics();
    const pendingResult = await byofService.getPendingApprovals();
    const activityResult = await byofService.getRecentActivity(5);
    const usersResult = await byofService.getAllUsersWithByofRole();

    res.render('byof-admin', {
      title: 'The Forge - Admin',
      user: req.session?.user,
      byofRole: req.byofRole,
      stats: statsResult.stats || {},
      pending: pendingResult.plans || [],
      activity: activityResult.activity || [],
      users: usersResult.users || []
    });
  } catch (error) {
    console.error('[BYOF Routes] Admin page error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load admin dashboard'
    });
  }
});

module.exports = router;
