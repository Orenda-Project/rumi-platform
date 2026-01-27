# API Health Monitoring

Comprehensive API health and usage monitoring for all Rumi services.

## Overview

The API Health dashboard provides real-time visibility into:
- Usage metrics and limits for all integrated services
- Current and projected costs
- Warning alerts when approaching limits
- Service status indicators

## Monitored Services

### Services with Full API Access
1. **Railway** - Hosting platform usage and billing
2. **ElevenLabs** - Voice synthesis character usage
3. **OpenAI** - LLM API usage and costs
4. **WhatsApp Cloud API** - Messaging limits and quality ratings
5. **Supabase** - Database size and compute usage
6. **Cloudflare R2** - Storage usage

### Services with Local Tracking
7. **Soniox** - Transcription usage (estimated from local logs)
8. **Uplift AI** - TTS usage (estimated from local logs)
9. **Gamma AI** - Generation credits (estimated)

## Features

### Real-time Monitoring
- Live usage data refreshed every 5 minutes
- Manual refresh button for immediate updates
- Auto-refresh every 5 minutes

### Status Indicators
- 🟢 **Healthy**: Below 75% usage
- 🟡 **Warning**: 75-90% usage
- 🔴 **Critical**: Above 90% usage
- ⚠️ **Error**: API connection issues

### Cost Tracking
- Current month spending
- Projected end-of-month costs
- Total estimated monthly cost across all services

### Warnings & Alerts
- Visual warnings for services approaching limits
- Detailed error messages for API failures
- Links to external dashboards for each service

## Setup

### Required Environment Variables

Add these to your `.env` file:

```bash
# Railway
RAILWAY_API_TOKEN=your_token_here

# ElevenLabs (already configured)
ELEVENLABS_API_KEY=your_key_here

# OpenAI (already configured)
OPENAI_API_KEY=your_key_here

# WhatsApp (already configured)
WHATSAPP_TOKEN=your_token_here
PHONE_NUMBER_ID=your_phone_id_here

# Supabase
SUPABASE_URL=your_url_here
SUPABASE_SERVICE_ROLE_KEY=your_key_here
SUPABASE_ACCESS_TOKEN=your_personal_access_token_here
SUPABASE_PROJECT_REF=your_project_ref_here

# Cloudflare R2
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_R2_ACCESS_KEY_ID=your_access_key_here
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_secret_key_here
CLOUDFLARE_R2_BUCKET_NAME=your_bucket_name_here
CLOUDFLARE_API_TOKEN=your_api_token_here

# Gamma (if available)
GAMMA_API_KEY=your_key_here
```

### Database Migration

Run the database migration to create the required tables:

```bash
# Connect to your Supabase project and run:
psql -d your_database < database/migrations/001_add_api_usage_tracking.sql
```

Or use the Supabase SQL Editor to execute the migration file.

### Install Dependencies

```bash
npm install axios
```

## Usage

### Accessing the Dashboard

1. Log in to the admin dashboard
2. Click "API Health" in the navigation menu
3. View real-time status of all services

### API Endpoints

The following JSON endpoints are available:

#### Get All Services Health
```
GET /api/api-health
```

Response:
```json
{
  "totalCost": "12.45",
  "projectedCost": "24.90",
  "services": [...],
  "warnings": [...],
  "statusCounts": {
    "healthy": 7,
    "warning": 1,
    "critical": 1,
    "error": 0
  },
  "lastUpdated": "2025-11-06T..."
}
```

#### Get Specific Service Health
```
GET /api/api-health/:service
```

Examples:
- `/api/api-health/railway`
- `/api/api-health/elevenlabs`
- `/api/api-health/openai`

#### Force Refresh Cache
```
POST /api/api-health/refresh
```

## Integrating Local Tracking

For services without programmatic APIs (Soniox, Uplift), you need to log usage in your application code.

### Example: Logging Soniox Usage

In your audio transcription service:

```javascript
const { logSonioxUsage } = require('../services/api-health/soniox.service');
const supabase = require('../config/supabase');

// After transcribing audio
const audioDuration = 45; // seconds
await logSonioxUsage(supabase, audioDuration);
```

### Example: Logging Uplift Usage

In your TTS service:

```javascript
const { logUpliftUsage } = require('../services/api-health/uplift.service');
const supabase = require('../config/supabase');

// After generating speech
const textLength = 150; // characters
await logUpliftUsage(supabase, textLength);
```

## Architecture

### Service Modules
Located in `services/api-health/`:
- `railway.service.js` - Railway GraphQL API
- `elevenlabs.service.js` - ElevenLabs REST API
- `openai.service.js` - OpenAI usage & billing APIs
- `whatsapp.service.js` - WhatsApp Cloud API
- `supabase.service.js` - Supabase Management API
- `cloudflare-r2.service.js` - Cloudflare API
- `gamma.service.js` - Gamma AI (placeholder)
- `soniox.service.js` - Local tracking
- `uplift.service.js` - Local tracking
- `api-health-aggregator.service.js` - Combines all services

### Caching
All service modules implement 5-minute caching to:
- Reduce API calls and avoid rate limits
- Improve dashboard load times
- Prevent excessive billing from API usage

### Database Tables

#### api_usage_log
Tracks local usage for services without APIs:
- `id` - UUID primary key
- `service` - Service name (soniox, uplift)
- `operation_type` - Operation type (transcription, tts)
- `units_consumed` - Units used (hours, characters)
- `estimated_cost` - Estimated cost in USD
- `created_at` - Timestamp

#### api_health_snapshots
Stores periodic health snapshots:
- `id` - UUID primary key
- `service` - Service name
- `status` - Health status
- `usage_data` - Full health data as JSONB
- `checked_at` - Timestamp

## Troubleshooting

### Service Shows "Error" Status

1. Check that the required environment variables are set
2. Verify API keys/tokens are valid
3. Check the console logs for specific error messages
4. Try the "Refresh" button to force a cache clear

### Estimated Data Warning

Services marked as "Estimated" don't have real-time API access:
- **Soniox**: Check [console.soniox.com](https://console.soniox.com) for actual balance
- **Uplift**: Contact Uplift support for usage details
- **Gamma**: Track credits from generation responses

### Database Connection Error

Ensure:
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- Database migration has been run
- Tables `api_usage_log` and `api_health_snapshots` exist

## Future Enhancements

Planned improvements:
- Email alerts when approaching limits
- Historical charts showing usage trends
- Budget tracking and forecasting
- Slack integration for critical alerts
- Webhook support for real-time updates
- Cost forecasting based on trends

## Support

For issues or questions:
1. Check the API Health dashboard logs
2. Review service-specific documentation
3. Contact service providers for API-specific issues
4. Refer to the main README for general setup help

## Version History

- **v2.1.0** (2025-11-06): Initial API Health implementation
  - 9 services monitored
  - Real-time dashboard with status indicators
  - Cost tracking and warnings
  - Local tracking for services without APIs
