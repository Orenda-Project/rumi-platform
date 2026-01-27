/**
 * Word Cloud API Routes for Conversation Analysis
 */

const express = require('express');
const router = express.Router();
const getWordCloudService = require('../services/wordcloud.service');

// Get word frequency data for word cloud
router.get('/words', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const wordCloudService = getWordCloudService();
    const result = await wordCloudService.getWordFrequency(forceRefresh);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      data: result.data,
      cached: result.cached || false
    });
  } catch (error) {
    console.error('Word cloud API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate word cloud data'
    });
  }
});

// Get topic trends over time
router.get('/trends', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const wordCloudService = getWordCloudService();
    const result = await wordCloudService.getTopicTrends(days);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      trends: result.trends
    });
  } catch (error) {
    console.error('Topic trends API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get topic trends'
    });
  }
});

// Get engagement keywords
router.get('/engagement', async (req, res) => {
  try {
    const wordCloudService = getWordCloudService();
    const result = await wordCloudService.getUserEngagementKeywords();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      keywords: result.keywords
    });
  } catch (error) {
    console.error('Engagement keywords API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get engagement keywords'
    });
  }
});

// Clear cache (admin only)
router.post('/clear-cache', (req, res) => {
  try {
    // Check if user is admin
    if (req.session.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const wordCloudService = getWordCloudService();
    wordCloudService.clearCache();

    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache'
    });
  }
});

module.exports = router;