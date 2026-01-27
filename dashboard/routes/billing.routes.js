/**
 * Billing Routes
 *
 * P5: Routes for API billing/usage checks
 * Prefix: /observability/billing
 */

const express = require('express');
const router = express.Router();
const billingService = require('../services/billing.service');

/**
 * GET /observability/billing
 * Main billing dashboard view
 */
router.get('/', async (req, res) => {
  try {
    const billingData = await billingService.getAllBillingData();

    res.render('billing', {
      title: 'API Billing & Usage',
      currentPage: 'billing',
      user: req.session?.user || null,
      ...billingData
    });
  } catch (error) {
    console.error('[Billing Routes] Dashboard error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load billing dashboard',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

/**
 * GET /observability/billing/api/status
 * API endpoint for billing data (AJAX)
 */
router.get('/api/status', async (req, res) => {
  try {
    const billingData = await billingService.getAllBillingData();

    res.json({
      success: true,
      ...billingData
    });
  } catch (error) {
    console.error('[Billing Routes] API status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /observability/billing/api/anthropic
 * Get Anthropic-specific usage
 */
router.get('/api/anthropic', async (req, res) => {
  try {
    const data = await billingService.getAnthropicUsage();
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /observability/billing/api/whatsapp
 * Get WhatsApp-specific usage
 */
router.get('/api/whatsapp', async (req, res) => {
  try {
    const data = await billingService.getWhatsAppQuota();
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /observability/billing/api/openai
 * Get OpenAI-specific usage
 */
router.get('/api/openai', async (req, res) => {
  try {
    const data = await billingService.getOpenAIUsage();
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
