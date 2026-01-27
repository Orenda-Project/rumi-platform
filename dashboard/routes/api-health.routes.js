/**
 * API Health Routes
 * Provides endpoints for monitoring API usage and health
 */

const express = require('express');
const router = express.Router();
const { getAllServicesHealth, getServiceHealth } = require('../services/api-health/api-health-aggregator.service');

/**
 * GET /api/api-health
 * Get health data for all services
 */
router.get('/', async (req, res) => {
  try {
    const db = req.app.locals.supabase;
    if (!db) {
      return res.status(500).json({
        error: 'Database connection not available'
      });
    }

    const healthData = await getAllServicesHealth(db);
    res.json(healthData);
  } catch (error) {
    console.error('Error fetching API health:', error);
    res.status(500).json({
      error: 'Failed to fetch API health data',
      message: error.message
    });
  }
});

/**
 * GET /api/api-health/:service
 * Get health data for a specific service
 */
router.get('/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const db = req.app.locals.supabase;

    if (!db) {
      return res.status(500).json({
        error: 'Database connection not available'
      });
    }

    const healthData = await getServiceHealth(service, db);
    res.json(healthData);
  } catch (error) {
    console.error(`Error fetching health for ${req.params.service}:`, error);

    if (error.message.includes('Unknown service')) {
      return res.status(404).json({
        error: 'Service not found',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to fetch service health data',
      message: error.message
    });
  }
});

/**
 * POST /api/api-health/refresh
 * Force refresh cache for all services
 */
router.post('/refresh', async (req, res) => {
  try {
    // Clear all service caches by requiring them again
    // This is a simple approach - in production you might want a more sophisticated cache invalidation
    delete require.cache[require.resolve('../services/api-health/railway.service')];
    delete require.cache[require.resolve('../services/api-health/elevenlabs.service')];
    delete require.cache[require.resolve('../services/api-health/gamma.service')];
    delete require.cache[require.resolve('../services/api-health/cloudflare-r2.service')];
    delete require.cache[require.resolve('../services/api-health/supabase.service')];
    delete require.cache[require.resolve('../services/api-health/whatsapp.service')];
    delete require.cache[require.resolve('../services/api-health/openai.service')];
    delete require.cache[require.resolve('../services/api-health/soniox.service')];
    delete require.cache[require.resolve('../services/api-health/uplift.service')];

    const db = req.app.locals.supabase;
    if (!db) {
      return res.status(500).json({
        error: 'Database connection not available'
      });
    }

    const healthData = await getAllServicesHealth(db);
    res.json({
      message: 'Cache refreshed successfully',
      data: healthData
    });
  } catch (error) {
    console.error('Error refreshing API health cache:', error);
    res.status(500).json({
      error: 'Failed to refresh cache',
      message: error.message
    });
  }
});

module.exports = router;
