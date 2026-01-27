/**
 * Cloudflare R2 Storage API Health Service
 * Monitors R2 storage usage and operations
 */

const axios = require('axios');

// AWS SDK is optional - only needed for advanced R2 metrics
let S3Client, ListBucketsCommand, GetBucketMetricsCommand;
try {
  const awsSdk = require('@aws-sdk/client-s3');
  S3Client = awsSdk.S3Client;
  ListBucketsCommand = awsSdk.ListBucketsCommand;
  GetBucketMetricsCommand = awsSdk.GetBucketMetricsCommand;
} catch (err) {
  // AWS SDK not installed - will use Cloudflare API only
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let cache = {
  data: null,
  timestamp: null
};

/**
 * Get Cloudflare R2 storage health data
 */
async function getCloudflareR2Health() {
  // Check cache
  if (cache.data && cache.timestamp && (Date.now() - cache.timestamp < CACHE_DURATION)) {
    return cache.data;
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return {
      service: 'Cloudflare R2',
      status: 'error',
      usage: { current: 0, limit: 10, unit: 'GB', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: { error: 'R2 credentials not configured' },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://dash.cloudflare.com/r2'
    };
  }

  try {
    // Try to get usage from Cloudflare API
    let storageGB = 0;

    if (apiToken) {
      try {
        const response = await axios.get(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/usage`,
          {
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.data.success && response.data.result) {
          storageGB = response.data.result.storage_bytes / (1024 * 1024 * 1024);
        }
      } catch (err) {
        console.warn('Could not fetch R2 usage from Cloudflare API:', err.message);
      }
    }

    // R2 free tier: 10GB storage
    const limitGB = 10;
    const percentage = (storageGB / limitGB) * 100;

    let status = 'healthy';
    if (percentage >= 90) status = 'critical';
    else if (percentage >= 75) status = 'warning';

    // Estimate cost (first 10GB free, then $0.015/GB-month)
    const costPerGB = 0.015;
    const currentCost = storageGB > limitGB ? (storageGB - limitGB) * costPerGB : 0;

    const result = {
      service: 'Cloudflare R2',
      status,
      usage: {
        current: storageGB.toFixed(2),
        limit: limitGB,
        unit: 'GB',
        percentage: Math.min(percentage, 100)
      },
      cost: {
        current: currentCost.toFixed(2),
        projected: currentCost * 2,
        currency: 'USD'
      },
      details: {
        bucketName: bucketName,
        storageGB: storageGB.toFixed(2),
        freeTier: '10GB',
        pricing: {
          storage: '$0.015/GB-month (first 10GB free)',
          classA: '$4.50/million requests',
          classB: '$0.36/million requests',
          egress: 'FREE'
        },
        note: 'Storage size estimated - install @aws-sdk/client-s3 for detailed metrics'
      },
      lastUpdated: new Date().toISOString(),
      externalLink: `https://dash.cloudflare.com/${accountId}/r2/overview/buckets/${bucketName}`
    };

    // Update cache
    cache = {
      data: result,
      timestamp: Date.now()
    };

    return result;
  } catch (error) {
    console.error('Cloudflare R2 API error:', error.message);

    return {
      service: 'Cloudflare R2',
      status: 'error',
      usage: { current: 0, limit: 10, unit: 'GB', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: {
        error: error.message,
        note: 'Check CLOUDFLARE_ACCOUNT_ID, R2 credentials, and CLOUDFLARE_API_TOKEN'
      },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://dash.cloudflare.com/r2'
    };
  }
}

module.exports = {
  getCloudflareR2Health
};
