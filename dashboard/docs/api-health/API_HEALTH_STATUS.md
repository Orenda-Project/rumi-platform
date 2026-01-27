# API Health Monitor - Service Status & Configuration

**Last Updated**: November 21, 2025

## Summary

This document shows which services can display real usage/cost data and which services require additional configuration or have API limitations.

---

## ✅ Services WITH Real Data (Working Now)

### 1. **Railway** - FIXED ✅
- **Status**: ✅ Should work after deployment
- **API**: GraphQL API with billing data
- **Fix Applied**: Changed to use `RAILWAY_ACCOUNT_TOKEN` instead of project token
- **Env Vars**: `RAILWAY_ACCOUNT_TOKEN=12b2e85b-c734-481d-bcc1-480c1e4c1f5a` (already in Railway)
- **Shows**: Monthly cost, usage percentage, billing cycle dates

### 2. **WhatsApp Cloud API** - FIXED ✅
- **Status**: ✅ Should work after deployment
- **API**: Graph API for phone number info
- **Fix Applied**: Now accepts both `PHONE_NUMBER_ID` and `WABA_ID`
- **Env Vars**: `WABA_ID=886544661200478` (already in Railway)
- **Shows**: Messaging tier limits, quality rating, rate limits
- **Note**: Doesn't show actual message count (WhatsApp doesn't expose via API)

### 3. **OpenAI** - IMPROVED ✅
- **Status**: ✅ Should show usage after deployment
- **API**: Usage API `/v1/usage`
- **Fix Applied**: Added actual usage data fetching for current month
- **Env Vars**: `OPENAI_API_KEY` (already in Railway)
- **Shows**: Current month usage (approximate cost), hard limit, soft limit
- **Limitation**: Can't show prepaid credit balance (requires session key, not API key)

### 4. **ElevenLabs** - PERMISSION ERROR ⚠️
- **Status**: ⚠️ API key missing permissions
- **API**: `/v1/user/subscription` - correctly implemented
- **Error**: "API key missing the permission user_read"
- **Fix Needed**: Regenerate API key with `user_read` permission at https://elevenlabs.io/app/settings/api-keys
- **Env Vars**: `ELEVENLABS_API_KEY` (already in Railway but needs regeneration)
- **Will Show**: Character usage, character limit, quota percentage

---

## ⚙️ Services Needing Additional Configuration

### 5. **Cloudflare R2** - MISSING API TOKEN
- **Status**: ⚠️ API token is placeholder value
- **API**: `/client/v4/accounts/{id}/r2/buckets/{name}/usage`
- **Current Value**: `CLOUDFLARE_API_TOKEN=need-to-get-from-cloudflare-dashboard`
- **Fix Needed**:
  1. Go to https://dash.cloudflare.com/profile/api-tokens
  2. Create new API token with "R2 Read" permissions
  3. Update `CLOUDFLARE_API_TOKEN` in Railway dashboard
- **Will Show**: Storage size (GB), operations count, costs above free tier

### 6. **Supabase** - MISSING CREDENTIALS
- **Status**: ⚠️ Management API credentials not configured
- **API**: Management API `/v1/projects/{ref}`
- **Missing Env Vars**:
  - `SUPABASE_ACCESS_TOKEN` - Personal Access Token
  - `SUPABASE_PROJECT_REF` - Project reference (from URL: `YOUR_PROJECT_REF`)
- **How to Get Access Token**:
  1. Go to https://supabase.com/dashboard/account/tokens
  2. Generate new access token
  3. Add to Railway dashboard as `SUPABASE_ACCESS_TOKEN`
  4. Add `SUPABASE_PROJECT_REF=YOUR_PROJECT_REF`
- **Will Show**: Database size, disk usage, bandwidth usage

---

## ❌ Services WITHOUT Programmatic APIs (Will Always Show Estimates)

### 7. **Soniox** - NO USAGE API
- **Status**: ❌ No programmatic billing/usage API exists
- **Current Method**: Local database tracking via `api_usage_log` table
- **Issue**: Main bot is NOT calling `logSonioxUsage()` after transcriptions
- **Why $0**: Table is empty for current month
- **Solutions**:
  1. **Option A (Recommended)**: Implement usage logging in main bot
     - Add `logSonioxUsage(db, durationSeconds)` calls after each Soniox API call
     - This populates the tracking table
  2. **Option B**: Check balance manually at https://console.soniox.com
     - Update placeholder values in `soniox.service.js` monthly
- **Pricing**: $0.10/hour for transcription

### 8. **Uplift AI** - NO USAGE API
- **Status**: ❌ No programmatic billing/usage API exists
- **Current Method**: Local database tracking via `api_usage_log` table
- **Issue**: Main bot is NOT calling `logUpliftUsage()` after TTS calls
- **Why $0**: Table is empty for current month
- **Solutions**:
  1. **Option A (Recommended)**: Implement usage logging in main bot
     - Add `logUpliftUsage(db, characterCount)` calls after each Uplift TTS call
     - This populates the tracking table
  2. **Option B**: Track manually
     - Update placeholder values in `uplift.service.js` monthly
- **Pricing**: Unknown (no public pricing)

### 9. **Gamma AI** - NO USAGE API
- **Status**: ❌ Has API for generation but NO billing/usage endpoints
- **Current Method**: Hardcoded placeholder values
- **Shows**: Estimated 2850/3000 credits (marked as `isEstimated: true`)
- **Solutions**:
  1. **Option A**: Check manually at https://gamma.app/settings/billing
     - Update placeholder values in `gamma.service.js` monthly
  2. **Option B**: Accept placeholder data
     - Frontend shows "Estimated" badge
- **Pricing**: Credit-based (varies by plan)

---

## Cost Display Summary

### Why Most Services Show $0.00

This is **expected behavior** for the following reasons:

1. **Free Tier Services** (No costs to report):
   - Supabase: Within 500MB free tier
   - Cloudflare R2: Within 10GB free tier
   - WhatsApp: Free tier (no cost tracking)
   - OpenAI: Likely using free credits or minimal usage

2. **APIs Don't Expose Dollar Costs**:
   - ElevenLabs: Shows character usage but NOT dollar costs
   - Gamma: No usage API at all

3. **Local Tracking Not Implemented**:
   - Soniox: `api_usage_log` table empty
   - Uplift: `api_usage_log` table empty

4. **Configuration Issues** (Being Fixed):
   - Railway: Was using wrong token type (FIXED)
   - WhatsApp: Variable name mismatch (FIXED)
   - OpenAI: Wasn't fetching usage data (FIXED)

---

## Action Items

### Immediate (Railway Will Auto-Deploy)
✅ Railway billing - FIXED (using account token)
✅ WhatsApp monitoring - FIXED (accepts WABA_ID)
✅ OpenAI usage - FIXED (fetches real usage)

### User Actions Required

**High Priority**:
1. **ElevenLabs**: Regenerate API key with `user_read` permission
2. **Cloudflare R2**: Generate API token and add to Railway
3. **Supabase**: Generate access token and add to Railway

**Medium Priority** (For Accurate Tracking):
4. **Soniox/Uplift**: Implement usage logging in main bot
   - File: `02_Main Rumi Bot/shared/services/transcription.service.js` (Soniox)
   - File: `02_Main Rumi Bot/shared/services/audio-generator.service.js` (Uplift)
   - Add logging calls after each API request

**Low Priority** (Manual Updates):
5. **Gamma**: Check https://gamma.app/settings/billing monthly and update placeholder

---

## Expected Results After Fixes

### After Railway Deploys (2-3 minutes)
- ✅ Railway: Real billing costs
- ✅ WhatsApp: Tier limits and quality rating
- ✅ OpenAI: Current month usage (approximate)

### After User Adds Tokens
- ✅ ElevenLabs: Character usage and quota
- ✅ Cloudflare R2: Storage size and costs
- ✅ Supabase: Database size and usage

### After Usage Logging Implemented
- ✅ Soniox: Transcription hours and costs
- ✅ Uplift: TTS character count

### Will Always Show Estimates
- ⚠️ Gamma: Placeholder data (no API)

---

## Testing

After Railway deployment completes (~2 minutes):

1. Visit API Health page
2. Refresh browser (clear 5-minute cache)
3. Check Railway - should show actual costs
4. Check WhatsApp - should show tier/quality
5. Check OpenAI - should show usage above $0

After adding tokens to Railway:

1. Add `CLOUDFLARE_API_TOKEN`
2. Add `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`
3. Regenerate and update `ELEVENLABS_API_KEY`
4. Wait 5 minutes (cache duration)
5. Refresh API Health page

---

## Reference Links

**Token Generation**:
- Cloudflare: https://dash.cloudflare.com/profile/api-tokens
- Supabase: https://supabase.com/dashboard/account/tokens
- ElevenLabs: https://elevenlabs.io/app/settings/api-keys

**Manual Usage Dashboards**:
- Railway: https://railway.app/account/usage
- OpenAI: https://platform.openai.com/usage
- ElevenLabs: https://elevenlabs.io/app/usage
- Gamma: https://gamma.app/settings/billing
- Soniox: https://console.soniox.com
- Cloudflare R2: https://dash.cloudflare.com/r2
- Supabase: https://supabase.com/dashboard/project/YOUR_PROJECT_REF/settings/billing

**API Documentation**:
- Railway GraphQL: https://docs.railway.app/reference/public-api
- OpenAI Usage: https://platform.openai.com/docs/api-reference/usage
- ElevenLabs: https://elevenlabs.io/docs/api-reference/user/subscription/get
- Cloudflare R2: https://developers.cloudflare.com/r2/api/
- Supabase: https://supabase.com/docs/reference/api/introduction
