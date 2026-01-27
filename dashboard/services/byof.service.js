/**
 * BYOF (Build Your Own Feature) Service
 *
 * Handles:
 * - BYOF role validation and permission checks
 * - Session CRUD operations
 * - Message storage and retrieval
 * - Plan management (to be extended)
 */

const supabase = require('../config/supabase');

const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v21.0';

// Valid BYOF roles
const VALID_BYOF_ROLES = ['reporter', 'approver'];

// Valid session types
const VALID_SESSION_TYPES = ['bug', 'feature'];

// Valid session statuses
const VALID_SESSION_STATUSES = ['active', 'plan_ready', 'closed'];

// Valid plan statuses
const VALID_PLAN_STATUSES = ['draft', 'approved', 'in_progress', 'staging_live', 'production_live', 'rejected'];

/**
 * Validate if a byof_role value is valid
 * @param {string|null} role - The role to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function validateByofRole(role) {
  // null is valid (means no BYOF access)
  if (role === null) return true;
  // Empty string is invalid
  if (role === '') return false;
  // Must be one of the valid roles
  return VALID_BYOF_ROLES.includes(role);
}

/**
 * Check if a user with given role can create sessions
 * @param {string|null} byofRole - The user's BYOF role
 * @returns {boolean} - True if can create, false otherwise
 */
function canCreateSession(byofRole) {
  // Both reporter and approver can create sessions
  return byofRole === 'reporter' || byofRole === 'approver';
}

/**
 * Check if a user with given role can approve plans
 * @param {string|null} byofRole - The user's BYOF role
 * @returns {boolean} - True if can approve, false otherwise
 */
function canApprovePlan(byofRole) {
  // Only approver can approve plans
  return byofRole === 'approver';
}

/**
 * Validate session type
 * @param {string} type - The session type to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function validateSessionType(type) {
  if (!type || type === '') return false;
  return VALID_SESSION_TYPES.includes(type);
}

/**
 * Create a new BYOF session
 * @param {string} userId - The user's UUID
 * @param {string} type - 'bug' or 'feature'
 * @param {string} title - Optional title for the session
 * @returns {Promise<{success: boolean, session?: object, error?: string}>}
 */
async function createSession(userId, type, title = null) {
  try {
    if (!validateSessionType(type)) {
      return { success: false, error: 'Invalid session type. Must be "bug" or "feature".' };
    }

    const { data, error } = await supabase
      .from('byof_sessions')
      .insert({
        user_id: userId,
        type,
        title,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating BYOF session:', error);
      return { success: false, error: 'Failed to create session' };
    }

    return { success: true, session: data };
  } catch (err) {
    console.error('Error in createSession:', err);
    return { success: false, error: 'Internal error creating session' };
  }
}

/**
 * Get a session by ID with its messages
 * @param {string} sessionId - The session UUID
 * @returns {Promise<{success: boolean, session?: object, error?: string}>}
 */
async function getSessionById(sessionId) {
  try {
    const { data: session, error: sessionError } = await supabase
      .from('byof_sessions')
      .select(`
        *,
        user:dashboard_users(id, username, email)
      `)
      .eq('id', sessionId)
      .single();

    if (sessionError) {
      console.error('Error fetching session:', sessionError);
      return { success: false, error: 'Session not found' };
    }

    // Get messages
    const { data: messages, error: messagesError } = await supabase
      .from('byof_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return { success: false, error: 'Failed to fetch messages' };
    }

    return {
      success: true,
      session: {
        ...session,
        messages: messages || []
      }
    };
  } catch (err) {
    console.error('Error in getSessionById:', err);
    return { success: false, error: 'Internal error fetching session' };
  }
}

/**
 * Get all sessions for a user
 * @param {string} userId - The user's UUID
 * @param {string} status - Optional status filter
 * @returns {Promise<{success: boolean, sessions?: object[], error?: string}>}
 */
async function getUserSessions(userId, status = null) {
  try {
    let query = supabase
      .from('byof_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching user sessions:', error);
      return { success: false, error: 'Failed to fetch sessions' };
    }

    return { success: true, sessions: data || [] };
  } catch (err) {
    console.error('Error in getUserSessions:', err);
    return { success: false, error: 'Internal error fetching sessions' };
  }
}

/**
 * Get all sessions (for approvers/admin)
 * @param {string} status - Optional status filter
 * @returns {Promise<{success: boolean, sessions?: object[], error?: string}>}
 */
async function getAllSessions(status = null) {
  try {
    let query = supabase
      .from('byof_sessions')
      .select(`
        *,
        user:dashboard_users(id, username, email)
      `)
      .order('updated_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching all sessions:', error);
      return { success: false, error: 'Failed to fetch sessions' };
    }

    return { success: true, sessions: data || [] };
  } catch (err) {
    console.error('Error in getAllSessions:', err);
    return { success: false, error: 'Internal error fetching sessions' };
  }
}

/**
 * Add a message to a session
 * @param {string} sessionId - The session UUID
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - The message content
 * @param {object[]} attachments - Optional attachments (screenshots, files)
 * @returns {Promise<{success: boolean, message?: object, error?: string}>}
 */
async function addMessage(sessionId, role, content, attachments = []) {
  try {
    if (!['user', 'assistant'].includes(role)) {
      return { success: false, error: 'Invalid message role. Must be "user" or "assistant".' };
    }

    if (!content || content.trim() === '') {
      return { success: false, error: 'Message content cannot be empty.' };
    }

    const { data, error } = await supabase
      .from('byof_messages')
      .insert({
        session_id: sessionId,
        role,
        content,
        attachments
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding message:', error);
      return { success: false, error: 'Failed to add message' };
    }

    // Update session's updated_at timestamp
    await supabase
      .from('byof_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    return { success: true, message: data };
  } catch (err) {
    console.error('Error in addMessage:', err);
    return { success: false, error: 'Internal error adding message' };
  }
}

/**
 * Get all messages for a session
 * @param {string} sessionId - The session UUID
 * @returns {Promise<{success: boolean, messages?: object[], error?: string}>}
 */
async function getSessionMessages(sessionId) {
  try {
    const { data, error } = await supabase
      .from('byof_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return { success: false, error: 'Failed to fetch messages' };
    }

    return { success: true, messages: data || [] };
  } catch (err) {
    console.error('Error in getSessionMessages:', err);
    return { success: false, error: 'Internal error fetching messages' };
  }
}

/**
 * Update session status
 * @param {string} sessionId - The session UUID
 * @param {string} status - New status
 * @returns {Promise<{success: boolean, session?: object, error?: string}>}
 */
async function updateSessionStatus(sessionId, status) {
  try {
    if (!VALID_SESSION_STATUSES.includes(status)) {
      return { success: false, error: 'Invalid session status' };
    }

    const { data, error } = await supabase
      .from('byof_sessions')
      .update({ status })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('Error updating session status:', error);
      return { success: false, error: 'Failed to update session status' };
    }

    return { success: true, session: data };
  } catch (err) {
    console.error('Error in updateSessionStatus:', err);
    return { success: false, error: 'Internal error updating session' };
  }
}

/**
 * Update a user's BYOF role
 * @param {string} userId - The user's UUID
 * @param {string|null} byofRole - New BYOF role ('reporter', 'approver', or null)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function updateUserByofRole(userId, byofRole) {
  try {
    if (!validateByofRole(byofRole)) {
      return { success: false, error: 'Invalid BYOF role. Must be "reporter", "approver", or null.' };
    }

    const { error } = await supabase
      .from('dashboard_users')
      .update({ byof_role: byofRole })
      .eq('id', userId);

    if (error) {
      console.error('Error updating BYOF role:', error);
      return { success: false, error: 'Failed to update BYOF role' };
    }

    return { success: true };
  } catch (err) {
    console.error('Error in updateUserByofRole:', err);
    return { success: false, error: 'Internal error updating role' };
  }
}

/**
 * Get user by ID with BYOF role
 * @param {string} userId - The user's UUID
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
async function getUserWithByofRole(userId) {
  try {
    const { data, error } = await supabase
      .from('dashboard_users')
      .select('id, email, username, role, byof_role, is_active')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user:', error);
      return { success: false, error: 'User not found' };
    }

    return { success: true, user: data };
  } catch (err) {
    console.error('Error in getUserWithByofRole:', err);
    return { success: false, error: 'Internal error fetching user' };
  }
}

// ============================================================
// Plan Management (Phase 3)
// ============================================================

/**
 * Validate plan status
 * @param {string} status - Status to validate
 * @returns {boolean} True if valid
 */
function validatePlanStatus(status) {
  if (!status || status === '') return false;
  return VALID_PLAN_STATUSES.includes(status);
}

/**
 * Create a new plan for a session
 * @param {string} sessionId - Session UUID
 * @param {object} planData - Plan data
 * @returns {Promise<{success: boolean, plan?: object, error?: string}>}
 */
async function createPlan(sessionId, planData) {
  try {
    const { summary, plan_markdown, affected_files = [], priority = 'medium' } = planData;

    if (!summary || !plan_markdown) {
      return { success: false, error: 'Summary and plan content are required' };
    }

    const { data, error } = await supabase
      .from('byof_plans')
      .insert({
        session_id: sessionId,
        summary,
        plan_markdown,
        affected_files,
        priority,
        status: 'draft'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating plan:', error);
      return { success: false, error: 'Failed to create plan' };
    }

    // Update session status to plan_ready
    await updateSessionStatus(sessionId, 'plan_ready');

    return { success: true, plan: data };
  } catch (err) {
    console.error('Error in createPlan:', err);
    return { success: false, error: 'Internal error creating plan' };
  }
}

/**
 * Get the plan for a session
 * @param {string} sessionId - Session UUID
 * @returns {Promise<{success: boolean, plan?: object, error?: string}>}
 */
async function getPlanBySession(sessionId) {
  try {
    const { data, error } = await supabase
      .from('byof_plans')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'No plan found for this session' };
      }
      console.error('Error fetching plan:', error);
      return { success: false, error: 'Failed to fetch plan' };
    }

    return { success: true, plan: data };
  } catch (err) {
    console.error('Error in getPlanBySession:', err);
    return { success: false, error: 'Internal error fetching plan' };
  }
}

/**
 * Update plan status
 * @param {string} planId - Plan UUID
 * @param {string} newStatus - New status
 * @returns {Promise<{success: boolean, plan?: object, error?: string}>}
 */
async function updatePlanStatus(planId, newStatus) {
  try {
    if (!validatePlanStatus(newStatus)) {
      return { success: false, error: 'Invalid plan status' };
    }

    const { data, error } = await supabase
      .from('byof_plans')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', planId)
      .select()
      .single();

    if (error) {
      console.error('Error updating plan status:', error);
      return { success: false, error: 'Failed to update plan status' };
    }

    return { success: true, plan: data };
  } catch (err) {
    console.error('Error in updatePlanStatus:', err);
    return { success: false, error: 'Internal error updating plan' };
  }
}

/**
 * Approve a plan
 * @param {string} planId - Plan UUID
 * @param {string} approverId - Approver's user UUID
 * @param {string} notes - Optional approval notes
 * @returns {Promise<{success: boolean, plan?: object, error?: string}>}
 */
async function approvePlan(planId, approverId, notes = '') {
  try {
    // Update plan status
    const updateResult = await updatePlanStatus(planId, 'approved');
    if (!updateResult.success) {
      return updateResult;
    }

    // Log the approval
    await supabase
      .from('byof_approval_log')
      .insert({
        plan_id: planId,
        action: 'approved',
        user_id: approverId,
        notes
      });

    return { success: true, plan: updateResult.plan };
  } catch (err) {
    console.error('Error in approvePlan:', err);
    return { success: false, error: 'Internal error approving plan' };
  }
}

/**
 * Reject a plan
 * @param {string} planId - Plan UUID
 * @param {string} rejecterId - Rejecter's user UUID
 * @param {string} reason - Rejection reason (required)
 * @returns {Promise<{success: boolean, plan?: object, error?: string}>}
 */
async function rejectPlan(planId, rejecterId, reason) {
  try {
    if (!reason || reason.trim() === '') {
      return { success: false, error: 'Rejection reason is required' };
    }

    // Update plan status
    const updateResult = await updatePlanStatus(planId, 'rejected');
    if (!updateResult.success) {
      return updateResult;
    }

    // Log the rejection
    await supabase
      .from('byof_approval_log')
      .insert({
        plan_id: planId,
        action: 'rejected',
        user_id: rejecterId,
        notes: reason
      });

    return { success: true, plan: updateResult.plan };
  } catch (err) {
    console.error('Error in rejectPlan:', err);
    return { success: false, error: 'Internal error rejecting plan' };
  }
}

// ============================================================
// PR Linking & Tracking (Phase 4)
// ============================================================

// GitHub PR URL regex pattern
const GITHUB_PR_URL_PATTERN = /^https:\/\/github\.com\/[\w-]+\/[\w-]+\/pull\/\d+$/;

/**
 * Validate a GitHub PR URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid GitHub PR URL
 */
function validatePrUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return GITHUB_PR_URL_PATTERN.test(url);
}

/**
 * Validate PR target branch (staging-first enforcement)
 * @param {string} targetBranch - Target branch of the PR
 * @param {boolean} isStagingMerged - Whether staging has already been merged
 * @returns {{valid: boolean, error?: string}}
 */
function validatePrTargetBranch(targetBranch, isStagingMerged = false) {
  // Always accept staging
  if (targetBranch === 'staging') {
    return { valid: true };
  }

  // Only accept main if staging was already merged (production deployment)
  if (targetBranch === 'main' || targetBranch === 'master') {
    if (isStagingMerged) {
      return { valid: true };
    }
    return {
      valid: false,
      error: 'PRs must target staging branch first. Production deploys require staging to be merged first.'
    };
  }

  // Accept any other branch (feature branches)
  return { valid: true };
}

/**
 * Link a PR to a plan
 * @param {string} planId - Plan UUID
 * @param {string} prUrl - GitHub PR URL
 * @returns {Promise<{success: boolean, plan?: object, error?: string}>}
 */
async function linkPrToPlan(planId, prUrl) {
  try {
    if (!validatePrUrl(prUrl)) {
      return { success: false, error: 'Invalid GitHub PR URL' };
    }

    const { data, error } = await supabase
      .from('byof_plans')
      .update({
        pr_url: prUrl,
        status: 'in_progress',
        updated_at: new Date().toISOString()
      })
      .eq('id', planId)
      .select()
      .single();

    if (error) {
      console.error('Error linking PR to plan:', error);
      return { success: false, error: 'Failed to link PR' };
    }

    return { success: true, plan: data };
  } catch (err) {
    console.error('Error in linkPrToPlan:', err);
    return { success: false, error: 'Internal error linking PR' };
  }
}

/**
 * Get a plan by its linked PR URL
 * @param {string} prUrl - GitHub PR URL
 * @returns {Promise<{success: boolean, plan?: object, error?: string}>}
 */
async function getPlanByPrUrl(prUrl) {
  try {
    const { data, error } = await supabase
      .from('byof_plans')
      .select('*, session:byof_sessions(*)')
      .eq('pr_url', prUrl)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'No plan found with this PR URL' };
      }
      console.error('Error fetching plan by PR:', error);
      return { success: false, error: 'Failed to fetch plan' };
    }

    return { success: true, plan: data };
  } catch (err) {
    console.error('Error in getPlanByPrUrl:', err);
    return { success: false, error: 'Internal error fetching plan' };
  }
}

/**
 * Mark a plan as staging_live (merged to staging)
 * @param {string} planId - Plan UUID
 * @returns {Promise<{success: boolean, plan?: object, error?: string}>}
 */
async function markPlanStagingLive(planId) {
  try {
    const { data, error } = await supabase
      .from('byof_plans')
      .update({
        status: 'staging_live',
        staging_merged_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', planId)
      .select()
      .single();

    if (error) {
      console.error('Error marking plan staging_live:', error);
      return { success: false, error: 'Failed to update plan status' };
    }

    return { success: true, plan: data };
  } catch (err) {
    console.error('Error in markPlanStagingLive:', err);
    return { success: false, error: 'Internal error updating plan' };
  }
}

/**
 * Mark a plan as production_live (merged to main/production)
 * @param {string} planId - Plan UUID
 * @returns {Promise<{success: boolean, plan?: object, error?: string}>}
 */
async function markPlanProductionLive(planId) {
  try {
    const { data, error } = await supabase
      .from('byof_plans')
      .update({
        status: 'production_live',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', planId)
      .select()
      .single();

    if (error) {
      console.error('Error marking plan production_live:', error);
      return { success: false, error: 'Failed to update plan status' };
    }

    return { success: true, plan: data };
  } catch (err) {
    console.error('Error in markPlanProductionLive:', err);
    return { success: false, error: 'Internal error updating plan' };
  }
}

/**
 * Get plan with reporter information (for notifications)
 * @param {string} planId - Plan UUID
 * @returns {Promise<{success: boolean, plan?: object, error?: string}>}
 */
async function getPlanWithReporter(planId) {
  try {
    const { data, error } = await supabase
      .from('byof_plans')
      .select(`
        *,
        session:byof_sessions(
          *,
          user:dashboard_users(id, username, email, phone_number)
        )
      `)
      .eq('id', planId)
      .single();

    if (error) {
      console.error('Error fetching plan with reporter:', error);
      return { success: false, error: 'Failed to fetch plan' };
    }

    return { success: true, plan: data };
  } catch (err) {
    console.error('Error in getPlanWithReporter:', err);
    return { success: false, error: 'Internal error fetching plan' };
  }
}

/**
 * Get all approvers for notification
 * @returns {Promise<{success: boolean, approvers?: object[], error?: string}>}
 */
async function getApproversForNotification() {
  try {
    const { data, error } = await supabase
      .from('dashboard_users')
      .select('id, username, email, phone_number')
      .eq('byof_role', 'approver')
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching approvers:', error);
      return { success: false, error: 'Failed to fetch approvers' };
    }

    return { success: true, approvers: data || [] };
  } catch (err) {
    console.error('Error in getApproversForNotification:', err);
    return { success: false, error: 'Internal error fetching approvers' };
  }
}

/**
 * Send notification via ATTAR WhatsApp
 * @param {string} phoneNumber - Recipient phone number (E.164 format without +)
 * @param {string} message - Message to send
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendNotification(phoneNumber, message) {
  try {
    // ATTAR WhatsApp credentials from environment
    const attarPhoneId = process.env.ATTAR_PHONE_ID;
    const attarAccessToken = process.env.ATTAR_ACCESS_TOKEN;

    if (!attarPhoneId || !attarAccessToken) {
      console.warn('[BYOF] ATTAR credentials not configured, skipping notification');
      return { success: true, skipped: true, reason: 'ATTAR not configured' };
    }

    // Send WhatsApp message via ATTAR
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${attarPhoneId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${attarAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phoneNumber,
          type: 'text',
          text: { body: message }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[BYOF] ATTAR notification failed:', errorData);
      return { success: false, error: 'Failed to send notification' };
    }

    console.log(`[BYOF] Notification sent to ${phoneNumber}`);
    return { success: true };
  } catch (err) {
    console.error('Error in sendNotification:', err);
    return { success: false, error: 'Internal error sending notification' };
  }
}

/**
 * Process GitHub webhook for PR merge events
 * @param {object} payload - GitHub webhook payload
 * @returns {Promise<{success: boolean, action?: string, plan?: object, error?: string}>}
 */
async function processGitHubWebhook(payload) {
  try {
    const { action, pull_request } = payload;

    // Only process closed PRs that were merged
    if (action !== 'closed' || !pull_request?.merged) {
      return { success: true, action: 'ignored', reason: 'Not a merged PR' };
    }

    const prUrl = pull_request.html_url;
    const targetBranch = pull_request.base?.ref;

    // Find plan linked to this PR
    const planResult = await getPlanByPrUrl(prUrl);
    if (!planResult.success) {
      return { success: true, action: 'ignored', reason: 'No plan linked to this PR' };
    }

    const plan = planResult.plan;

    // Determine action based on target branch
    if (targetBranch === 'staging') {
      // Stage 1: Merged to staging
      const updateResult = await markPlanStagingLive(plan.id);
      if (!updateResult.success) {
        return { success: false, error: updateResult.error };
      }

      // Notify reporter
      const planWithReporter = await getPlanWithReporter(plan.id);
      if (planWithReporter.success && planWithReporter.plan.session?.user?.phone_number) {
        const reporterPhone = planWithReporter.plan.session.user.phone_number;
        await sendNotification(
          reporterPhone,
          `🧪 "${plan.summary}" is now live on STAGING!\n\nPlease test on ${process.env.STAGING_PHONE_NUMBER || 'the staging bot'} and confirm it works.`
        );
      }

      return { success: true, action: 'staging_live', plan: updateResult.plan };

    } else if (targetBranch === 'main' || targetBranch === 'master') {
      // Stage 2: Merged to production
      const updateResult = await markPlanProductionLive(plan.id);
      if (!updateResult.success) {
        return { success: false, error: updateResult.error };
      }

      // Notify reporter
      const planWithReporter = await getPlanWithReporter(plan.id);
      if (planWithReporter.success && planWithReporter.plan.session?.user?.phone_number) {
        const reporterPhone = planWithReporter.plan.session.user.phone_number;
        await sendNotification(
          reporterPhone,
          `🎉 "${plan.summary}" is now LIVE in production! All users can now benefit from this fix.`
        );
      }

      return { success: true, action: 'production_live', plan: updateResult.plan };
    }

    return { success: true, action: 'ignored', reason: `Unknown target branch: ${targetBranch}` };
  } catch (err) {
    console.error('Error in processGitHubWebhook:', err);
    return { success: false, error: 'Internal error processing webhook' };
  }
}

// ============================================================
// Admin & Reporting (Phase 5)
// ============================================================

/**
 * Get all users with their BYOF roles
 * @returns {Promise<{success: boolean, users?: object[], error?: string}>}
 */
async function getAllUsersWithByofRole() {
  try {
    const { data, error } = await supabase
      .from('dashboard_users')
      .select('id, username, email, role, byof_role, is_active, created_at')
      .order('username', { ascending: true });

    if (error) {
      console.error('Error fetching users:', error);
      return { success: false, error: 'Failed to fetch users' };
    }

    return { success: true, users: data || [] };
  } catch (err) {
    console.error('Error in getAllUsersWithByofRole:', err);
    return { success: false, error: 'Internal error fetching users' };
  }
}

/**
 * Get session statistics
 * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
 */
async function getSessionStatistics() {
  try {
    // Get all sessions for counting
    const { data: sessions, error: sessionsError } = await supabase
      .from('byof_sessions')
      .select('status, type, created_at');

    if (sessionsError) {
      console.error('Error fetching sessions for stats:', sessionsError);
      return { success: false, error: 'Failed to fetch statistics' };
    }

    // Get all plans for counting
    const { data: plans, error: plansError } = await supabase
      .from('byof_plans')
      .select('status');

    if (plansError) {
      console.error('Error fetching plans for stats:', plansError);
      return { success: false, error: 'Failed to fetch statistics' };
    }

    // Calculate statistics
    const stats = {
      sessions: {
        total: sessions?.length || 0,
        byStatus: {
          active: sessions?.filter(s => s.status === 'active').length || 0,
          plan_ready: sessions?.filter(s => s.status === 'plan_ready').length || 0,
          approved: sessions?.filter(s => s.status === 'approved').length || 0,
          closed: sessions?.filter(s => s.status === 'closed').length || 0
        },
        byType: {
          bug: sessions?.filter(s => s.type === 'bug').length || 0,
          feature: sessions?.filter(s => s.type === 'feature').length || 0
        }
      },
      plans: {
        total: plans?.length || 0,
        byStatus: {
          draft: plans?.filter(p => p.status === 'draft').length || 0,
          approved: plans?.filter(p => p.status === 'approved').length || 0,
          in_progress: plans?.filter(p => p.status === 'in_progress').length || 0,
          staging_live: plans?.filter(p => p.status === 'staging_live').length || 0,
          production_live: plans?.filter(p => p.status === 'production_live').length || 0,
          rejected: plans?.filter(p => p.status === 'rejected').length || 0
        }
      }
    };

    return { success: true, stats };
  } catch (err) {
    console.error('Error in getSessionStatistics:', err);
    return { success: false, error: 'Internal error calculating statistics' };
  }
}

/**
 * Get recent activity (sessions and plans)
 * @param {number} limit - Number of items to return
 * @returns {Promise<{success: boolean, activity?: object[], error?: string}>}
 */
async function getRecentActivity(limit = 10) {
  try {
    // Get recent sessions with user info
    const { data: sessions, error: sessionsError } = await supabase
      .from('byof_sessions')
      .select(`
        id, title, type, status, created_at, updated_at,
        user:dashboard_users(id, username)
      `)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (sessionsError) {
      console.error('Error fetching recent sessions:', sessionsError);
      return { success: false, error: 'Failed to fetch activity' };
    }

    // Get recent approval actions
    const { data: approvals, error: approvalsError } = await supabase
      .from('byof_approval_log')
      .select(`
        id, action, notes, created_at,
        user:dashboard_users(id, username),
        plan:byof_plans(id, summary)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (approvalsError) {
      console.error('Error fetching recent approvals:', approvalsError);
      return { success: false, error: 'Failed to fetch activity' };
    }

    // Combine and sort by date
    const activity = [
      ...(sessions || []).map(s => ({ ...s, activityType: 'session' })),
      ...(approvals || []).map(a => ({ ...a, activityType: 'approval' }))
    ].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      .slice(0, limit);

    return { success: true, activity };
  } catch (err) {
    console.error('Error in getRecentActivity:', err);
    return { success: false, error: 'Internal error fetching activity' };
  }
}

/**
 * Validate search filters
 * @param {object} filters - Filters to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateSearchFilters(filters) {
  if (!filters || typeof filters !== 'object') {
    return { valid: true }; // Empty filters are valid
  }

  // Validate status if provided
  if (filters.status && !VALID_SESSION_STATUSES.includes(filters.status) && filters.status !== 'all') {
    return { valid: false, error: `Invalid status: ${filters.status}` };
  }

  // Validate type if provided
  if (filters.type && !VALID_SESSION_TYPES.includes(filters.type) && filters.type !== 'all') {
    return { valid: false, error: `Invalid type: ${filters.type}` };
  }

  return { valid: true };
}

/**
 * Search sessions with filters
 * @param {object} filters - Search filters (status, type, query, userId)
 * @returns {Promise<{success: boolean, sessions?: object[], error?: string}>}
 */
async function searchSessions(filters = {}) {
  try {
    const validation = validateSearchFilters(filters);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    let query = supabase
      .from('byof_sessions')
      .select(`
        *,
        user:dashboard_users(id, username, email)
      `)
      .order('updated_at', { ascending: false });

    // Apply filters
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters.type && filters.type !== 'all') {
      query = query.eq('type', filters.type);
    }
    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }
    if (filters.query) {
      query = query.ilike('title', `%${filters.query}%`);
    }
    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error searching sessions:', error);
      return { success: false, error: 'Failed to search sessions' };
    }

    return { success: true, sessions: data || [] };
  } catch (err) {
    console.error('Error in searchSessions:', err);
    return { success: false, error: 'Internal error searching sessions' };
  }
}

/**
 * Get completed plans (production_live)
 * @param {number} limit - Number of plans to return
 * @returns {Promise<{success: boolean, plans?: object[], error?: string}>}
 */
async function getCompletedPlans(limit = 20) {
  try {
    const { data, error } = await supabase
      .from('byof_plans')
      .select(`
        *,
        session:byof_sessions(id, title, type, user:dashboard_users(id, username))
      `)
      .eq('status', 'production_live')
      .order('completed_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching completed plans:', error);
      return { success: false, error: 'Failed to fetch completed plans' };
    }

    return { success: true, plans: data || [] };
  } catch (err) {
    console.error('Error in getCompletedPlans:', err);
    return { success: false, error: 'Internal error fetching plans' };
  }
}

/**
 * Get pending approvals (plans with draft status)
 * @returns {Promise<{success: boolean, plans?: object[], error?: string}>}
 */
async function getPendingApprovals() {
  try {
    const { data, error } = await supabase
      .from('byof_plans')
      .select(`
        *,
        session:byof_sessions(id, title, type, status, user:dashboard_users(id, username))
      `)
      .eq('status', 'draft')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching pending approvals:', error);
      return { success: false, error: 'Failed to fetch pending approvals' };
    }

    return { success: true, plans: data || [] };
  } catch (err) {
    console.error('Error in getPendingApprovals:', err);
    return { success: false, error: 'Internal error fetching approvals' };
  }
}

/**
 * Get sessions by date range
 * @param {string} startDate - Start date (ISO string)
 * @param {string} endDate - End date (ISO string)
 * @returns {Promise<{success: boolean, sessions?: object[], error?: string}>}
 */
async function getSessionsByDateRange(startDate, endDate) {
  try {
    if (!startDate || !endDate) {
      return { success: false, error: 'Start and end dates are required' };
    }

    const { data, error } = await supabase
      .from('byof_sessions')
      .select(`
        *,
        user:dashboard_users(id, username)
      `)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching sessions by date:', error);
      return { success: false, error: 'Failed to fetch sessions' };
    }

    return { success: true, sessions: data || [] };
  } catch (err) {
    console.error('Error in getSessionsByDateRange:', err);
    return { success: false, error: 'Internal error fetching sessions' };
  }
}

/**
 * Export session data for reporting
 * @param {object} filters - Export filters
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
async function exportSessionData(filters = {}) {
  try {
    // Get sessions
    const sessionsResult = await searchSessions(filters);
    if (!sessionsResult.success) {
      return sessionsResult;
    }

    // Get plans for these sessions
    const sessionIds = sessionsResult.sessions.map(s => s.id);
    const { data: plans, error: plansError } = await supabase
      .from('byof_plans')
      .select('*')
      .in('session_id', sessionIds);

    if (plansError) {
      console.error('Error fetching plans for export:', plansError);
      return { success: false, error: 'Failed to export data' };
    }

    // Get statistics
    const statsResult = await getSessionStatistics();

    return {
      success: true,
      data: {
        exportedAt: new Date().toISOString(),
        filters,
        statistics: statsResult.stats,
        sessions: sessionsResult.sessions,
        plans: plans || []
      }
    };
  } catch (err) {
    console.error('Error in exportSessionData:', err);
    return { success: false, error: 'Internal error exporting data' };
  }
}

/**
 * Get approval log
 * @param {string} planId - Optional plan ID to filter
 * @param {number} limit - Number of entries to return
 * @returns {Promise<{success: boolean, log?: object[], error?: string}>}
 */
async function getApprovalLog(planId = null, limit = 50) {
  try {
    let query = supabase
      .from('byof_approval_log')
      .select(`
        *,
        user:dashboard_users(id, username),
        plan:byof_plans(id, summary, session:byof_sessions(id, title))
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (planId) {
      query = query.eq('plan_id', planId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching approval log:', error);
      return { success: false, error: 'Failed to fetch approval log' };
    }

    return { success: true, log: data || [] };
  } catch (err) {
    console.error('Error in getApprovalLog:', err);
    return { success: false, error: 'Internal error fetching log' };
  }
}

module.exports = {
  // Validation functions
  validateByofRole,
  validateSessionType,
  validatePlanStatus,
  validatePrUrl,
  validatePrTargetBranch,

  // Permission functions
  canCreateSession,
  canApprovePlan,

  // Session operations
  createSession,
  getSessionById,
  getUserSessions,
  getAllSessions,
  updateSessionStatus,

  // Message operations
  addMessage,
  getSessionMessages,

  // Plan operations (Phase 3)
  createPlan,
  getPlanBySession,
  updatePlanStatus,
  approvePlan,
  rejectPlan,

  // PR Linking & Tracking (Phase 4)
  linkPrToPlan,
  getPlanByPrUrl,
  markPlanStagingLive,
  markPlanProductionLive,
  getPlanWithReporter,
  getApproversForNotification,
  sendNotification,
  processGitHubWebhook,

  // Admin & Reporting (Phase 5)
  getAllUsersWithByofRole,
  getSessionStatistics,
  getRecentActivity,
  searchSessions,
  getCompletedPlans,
  getPendingApprovals,
  getSessionsByDateRange,
  exportSessionData,
  validateSearchFilters,
  getApprovalLog,

  // User operations
  updateUserByofRole,
  getUserWithByofRole,

  // Constants (for reference)
  VALID_BYOF_ROLES,
  VALID_SESSION_TYPES,
  VALID_SESSION_STATUSES,
  VALID_PLAN_STATUSES
};
