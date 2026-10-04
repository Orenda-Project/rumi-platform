/**
 * AMA (Ask Me Anything) Routes, mounted at /observability:
 *
 *   GET    /ama                                    the chat page
 *   GET    /ama/conversations                      this user's conversations
 *   POST   /ama/conversations                      start one
 *   GET    /ama/conversations/:id/messages         one of this user's conversations
 *   DELETE /ama/conversations/:id                  delete one of this user's conversations
 *   POST   /ama/chat                               ask; the answer streams as SSE
 *   GET    /ama/tracer/:userId                     tracer report (501 while disabled)
 *   GET    /ama-chats                              super admin: the page over everyone's chats
 *   GET    /ama-chats/conversations                super admin: every conversation
 *   GET    /ama-chats/:id/messages                 super admin: any conversation
 *
 * A factory like routes/brief.routes.js, with requireAuth and the service
 * injected, so tests can mount it without the dashboard's database pool.
 * Storage and answers live in services/ama.service.js.
 */

const express = require('express');
const AMAService = require('../services/ama.service');

/** JSON error for a failed data call: the service's status (404) or 500. */
function sendError(res, label, error) {
  const status = error.status || 500;
  if (status === 500) console.error(`[AMA] ${label}:`, error);
  res.status(status).json({ success: false, error: error.message });
}

function createAmaRouter({ requireAuth, service = AMAService } = {}) {
  if (typeof requireAuth !== 'function') {
    throw new Error('createAmaRouter needs the requireAuth middleware');
  }
  const router = express.Router();

  const requireSuperAdminJson = (req, res, next) => {
    if (req.session.userRole !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Super admin access required' });
    }
    return next();
  };

  // AMA Main Page
  router.get('/ama', requireAuth, (req, res) => {
    res.render('ama', {
      title: 'AMA - Ask Me Anything',
      username: req.session.username,
      userRole: req.session.userRole
    });
  });

  // Get user's conversations
  router.get('/ama/conversations', requireAuth, async (req, res) => {
    try {
      const conversations = await service.getConversations(req.session.userId);
      res.json({ success: true, conversations });
    } catch (error) {
      sendError(res, 'Error fetching conversations', error);
    }
  });

  // Create new conversation
  router.post('/ama/conversations', requireAuth, async (req, res) => {
    try {
      const conversation = await service.createConversation(req.session.userId);
      res.json({ success: true, conversation });
    } catch (error) {
      sendError(res, 'Error creating conversation', error);
    }
  });

  // Get messages for one of the user's conversations
  router.get('/ama/conversations/:conversationId/messages', requireAuth, async (req, res) => {
    try {
      const messages = await service.getMessages(req.params.conversationId, { userId: req.session.userId });
      res.json({ success: true, messages });
    } catch (error) {
      sendError(res, 'Error fetching messages', error);
    }
  });

  // Delete one of the user's conversations
  router.delete('/ama/conversations/:conversationId', requireAuth, async (req, res) => {
    try {
      await service.deleteConversation(req.params.conversationId, req.session.userId);
      res.json({ success: true });
    } catch (error) {
      sendError(res, 'Error deleting conversation', error);
    }
  });

  // Chat endpoint with SSE streaming: one `data: <json chunk>` event per chunk
  // from service.processMessage, ending with { type: 'done' }.
  router.post('/ama/chat', requireAuth, async (req, res) => {
    const { message, conversationId } = req.body || {};

    if (!message) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    // Only into the user's own conversation; checked before the stream starts.
    if (conversationId) {
      try {
        const conversation = await service.getConversation(conversationId, req.session.userId);
        if (!conversation) {
          return res.status(404).json({ success: false, error: 'Conversation not found' });
        }
      } catch (error) {
        return sendError(res, 'Error loading conversation', error);
      }
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      // Save user message
      if (conversationId) {
        await service.saveMessage({
          conversationId,
          role: 'user',
          content: message
        });
      }

      // Get conversation history for context
      let conversationHistory = [];
      if (conversationId) {
        conversationHistory = await service.getMessages(conversationId, { limit: 20 });
      }

      let assistantContent = '';
      let thinkingContent = '';
      let sqlQuery = null;
      let chartType = null;
      let chartImageUrl = null;
      let queryResult = null;
      let responseTimeMs = null;
      let modelUsed = null;

      for await (const chunk of service.processMessage(message, conversationHistory, req.session.userId)) {
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
        if (chunk.type === 'text' || chunk.type === 'error') {
          assistantContent = chunk.content;
        }
        if (chunk.type === 'done') {
          responseTimeMs = chunk.responseTime;
          modelUsed = chunk.model || null;
        }
      }

      // Save assistant message
      if (conversationId && assistantContent) {
        await service.saveMessage({
          conversationId,
          role: 'assistant',
          content: assistantContent,
          thinkingContent,
          sqlQuery,
          queryResult,
          chartType,
          chartImageUrl,
          responseTimeMs,
          modelUsed
        });
      }

      res.end();
    } catch (error) {
      console.error('[AMA] Chat error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
      res.end();
    }
  });

  // Generate tracer report for a user
  router.get('/ama/tracer/:userId', requireAuth, async (req, res) => {
    try {
      const result = await service.generateTracerReport(req.params.userId);
      if (result.type === 'feature_disabled') {
        return res.status(501).json({ success: false, error: result.error });
      }
      if (result.error) {
        return res.status(404).json({ success: false, error: result.error });
      }
      res.json({ success: true, report: result.report });
    } catch (error) {
      sendError(res, 'Error generating tracer report', error);
    }
  });

  // ============================================================
  // AMA CHATS - SUPER ADMIN ONLY: View all AMA conversations
  // ============================================================
  router.get('/ama-chats', requireAuth, (req, res) => {
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

  // All conversations for super admin (used by sidebar)
  router.get('/ama-chats/conversations', requireAuth, requireSuperAdminJson, async (req, res) => {
    try {
      const { conversations } = await service.getAllConversationsAdmin(100, 0);
      res.json({ success: true, conversations });
    } catch (error) {
      sendError(res, 'Error fetching admin conversations', error);
    }
  });

  // Messages of any conversation (super admin)
  router.get('/ama-chats/:conversationId/messages', requireAuth, requireSuperAdminJson, async (req, res) => {
    try {
      const messages = await service.getMessagesAdmin(req.params.conversationId);
      res.json({ success: true, messages });
    } catch (error) {
      sendError(res, 'Error fetching messages', error);
    }
  });

  return router;
}

module.exports = { createAmaRouter };
