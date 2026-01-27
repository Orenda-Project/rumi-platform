/**
 * Funnel Tracking Routes
 * Public API endpoints for tracking user journey through the conversion funnel
 *
 * Funnel Stages:
 * 1. Website Visit - User lands on your website
 * 2. CTA Click - User clicks "Start Chat" button
 * 3. Chat Start - User sends first WhatsApp message (tracked in bot)
 * 4. Registration - User completes onboarding (tracked in bot)
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

/**
 * Hash IP address for privacy-compliant storage
 */
function hashIP(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

/**
 * Extract real IP from request (works with proxies/Railway)
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.ip;
}

/**
 * POST /api/track/visit
 * Track when a user lands on the website
 *
 * Body:
 *  - session_id: string (required) - Anonymous session identifier
 *  - landing_page: string (optional) - Page URL user landed on
 *  - referrer: string (optional) - Where user came from
 */
router.post('/visit', async (req, res) => {
  try {
    const { session_id, landing_page, referrer } = req.body;

    // Validate required fields
    if (!session_id || typeof session_id !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'session_id is required and must be a string'
      });
    }

    // Session ID length validation (prevent abuse)
    if (session_id.length > 255) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'session_id too long (max 255 characters)'
      });
    }

    const db = req.app.locals.supabase;
    if (!db) {
      return res.status(500).json({
        error: 'Database connection not available'
      });
    }

    // Prepare tracking data
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';

    const visitData = {
      session_id,
      ip_hash: hashIP(clientIP),
      user_agent: userAgent.substring(0, 500), // Limit length
      landing_page: landing_page ? landing_page.substring(0, 500) : null,
      referrer: referrer ? referrer.substring(0, 500) : null
    };

    // Check if session already exists (prevent duplicates)
    const { data: existing, error: checkError } = await db
      .from('website_visits')
      .select('id')
      .eq('session_id', session_id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('Error checking existing visit:', checkError);
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to check existing visit'
      });
    }

    // If visit already exists, return success (idempotent)
    if (existing) {
      return res.json({
        success: true,
        message: 'Visit already tracked',
        session_id
      });
    }

    // Insert new visit
    const { data, error } = await db
      .from('website_visits')
      .insert([visitData])
      .select();

    if (error) {
      console.error('Error tracking visit:', error);
      return res.status(500).json({
        error: 'Failed to track visit',
        message: error.message
      });
    }

    res.json({
      success: true,
      message: 'Visit tracked successfully',
      session_id,
      visit_id: data[0]?.id
    });

  } catch (error) {
    console.error('Unexpected error tracking visit:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * POST /api/track/cta-click
 * Track when a user clicks the "Start Chat" CTA button
 *
 * Body:
 *  - session_id: string (required) - Anonymous session identifier
 *  - button_location: string (optional) - Which button was clicked (e.g., "hero", "footer")
 *  - whatsapp_link: string (optional) - Full WhatsApp link that was clicked
 */
router.post('/cta-click', async (req, res) => {
  try {
    const { session_id, button_location, whatsapp_link } = req.body;

    // Validate required fields
    if (!session_id || typeof session_id !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'session_id is required and must be a string'
      });
    }

    if (session_id.length > 255) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'session_id too long (max 255 characters)'
      });
    }

    const db = req.app.locals.supabase;
    if (!db) {
      return res.status(500).json({
        error: 'Database connection not available'
      });
    }

    // Prepare tracking data
    const clickData = {
      session_id,
      button_location: button_location ? button_location.substring(0, 100) : null,
      whatsapp_link: whatsapp_link ? whatsapp_link.substring(0, 500) : null
    };

    // Insert CTA click
    const { data, error } = await db
      .from('cta_clicks')
      .insert([clickData])
      .select();

    if (error) {
      console.error('Error tracking CTA click:', error);
      return res.status(500).json({
        error: 'Failed to track CTA click',
        message: error.message
      });
    }

    res.json({
      success: true,
      message: 'CTA click tracked successfully',
      session_id,
      click_id: data[0]?.id
    });

  } catch (error) {
    console.error('Unexpected error tracking CTA click:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/track/health
 * Health check endpoint for funnel tracking
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Funnel Tracking API',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
