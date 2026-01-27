# Railway Redis Setup Instructions

This guide will help you set up Railway Redis for rate limiting and caching in the Rumi Digital Coach Bot.

## Why Railway Redis?

- ✅ **One-click deployment** (5 minutes vs 30+ for AWS ElastiCache)
- ✅ **Cost-effective** ($3-5/month vs $12+/month for AWS)
- ✅ **Automatic backups** included
- ✅ **No VPC configuration** needed
- ✅ **Same data center** as your Railway app (low latency)

---

## Step 1: Deploy Redis on Railway (3 minutes)

### Option A: Through Railway Dashboard (Recommended)

1. Go to [railway.app](https://railway.app) and login
2. Select your **Rumi Bot** project
3. Click **"+ New"** button
4. Select **"Database"** > **"Add Redis"**
5. Railway will automatically deploy Redis (~2 minutes)

### Option B: Through Railway CLI

```bash
# Install Railway CLI (if not already)
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Add Redis
railway add --database redis
```

---

## Step 2: Get Connection Details (1 minute)

After Redis is deployed:

1. Click on the **Redis service** in your Railway project
2. Go to **"Variables"** tab
3. You'll see these automatically created variables:
   - `REDIS_URL` - Full connection URL (use this!)
   - `REDIS_HOST` - Hostname
   - `REDIS_PORT` - Port (usually 6379)
   - `REDIS_PASSWORD` - Auto-generated password

Copy the `REDIS_URL` value. It looks like:
```
redis://:password@redis.railway.internal:6379
```

---

## Step 3: Update .env File (1 minute)

Add to your `.env` file:

```bash
# Railway Redis
REDIS_URL=redis://:password@redis.railway.internal:6379

# Optional: For local development
# (Railway will auto-inject REDIS_URL in production)
USE_REDIS_CACHE=true
```

---

## Step 4: Install Dependencies (1 minute)

```bash
cd "/Users/haroonyasin/Documents/Projects/Rumi/Main WhatsApp Bot"

npm install ioredis
```

---

## Step 5: Test Connection (2 minutes)

Create and run a test script:

```bash
node scripts/test-redis-connection.js
```

Expected output:
```
🧪 Testing Railway Redis Connection...

📊 Test 1: Connecting to Redis...
✅ Connected to Redis successfully!
   - Host: redis.railway.internal
   - Port: 6379
   - Status: ready

📊 Test 2: Testing basic operations...
✅ SET operation successful!
✅ GET operation successful!
   - Retrieved value: Hello from Rumi Bot!

📊 Test 3: Testing rate limiting...
✅ Rate limit check successful!
   - Allowed: true
   - Count: 1
   - Remaining: 29

📊 Test 4: Testing distributed locks...
✅ Lock acquired successfully!
✅ Lock released successfully!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ All Redis tests passed!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Railway Redis Features

### Automatic Features Included:

1. **Persistence** - Data survives restarts
2. **Backups** - Daily automatic backups
3. **Monitoring** - Built-in metrics dashboard
4. **High Availability** - 99.9% uptime SLA
5. **SSL/TLS** - Encrypted connections
6. **Memory** - 512 MB default (upgradeable)

### Redis Version:
- **Version 7.x** (latest stable)
- Full Redis features available
- Compatible with all ioredis commands

---

## Cost Breakdown

### Railway Redis Pricing:

**Starter Plan** ($3-5/month):
- 512 MB memory
- Perfect for 1,000 teachers
- Handles 30,000 messages/day easily

**Calculation for 1,000 teachers:**
- Rate limit keys: ~1,000 users × 1 KB = 1 MB
- Session cache: ~100 active sessions × 5 KB = 500 KB
- Deduplication: ~1,000 message IDs × 100 bytes = 100 KB
- **Total usage: ~2-3 MB** (plenty of room to grow!)

### Compared to AWS ElastiCache:

| Feature | Railway Redis | AWS ElastiCache |
|---------|--------------|-----------------|
| **Cost** | $3-5/month | $12+/month |
| **Setup Time** | 5 minutes | 30-60 minutes |
| **VPC Config** | Not needed | Required |
| **Backups** | Included | Extra cost |
| **Monitoring** | Included | Extra cost |
| **SSL** | Included | Extra setup |

**Winner:** Railway Redis (4x cheaper, 10x faster setup)

---

## Monitoring Redis

### View Metrics in Railway:

1. Go to your Railway project
2. Click on **Redis service**
3. Go to **"Metrics"** tab

You'll see:
- Memory usage
- CPU usage
- Network I/O
- Connection count

### Set Up Alerts:

Railway doesn't have built-in alerts, so monitor via your application:

```javascript
// In your health check endpoint
const redis = require('./shared/services/cache/railway-redis.service');

app.get('/health', async (req, res) => {
  const redisHealth = await redis.ping();
  res.json({
    status: 'healthy',
    redis: redisHealth ? 'connected' : 'disconnected'
  });
});
```

---

## Production Configuration

### Connection Pool Settings:

```javascript
// shared/services/cache/railway-redis.service.js
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL, {
  // Retry strategy
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },

  // Max retries
  maxRetriesPerRequest: 3,

  // Connection timeout
  connectTimeout: 10000,

  // Keep-alive
  keepAlive: 30000,

  // Disable offline queue (fail fast)
  enableOfflineQueue: false,

  // Lazy connect (connect on first command)
  lazyConnect: false
});
```

### Key Expiration Strategy:

```javascript
// Rate limiting keys: 60 seconds
await redis.setex(`rate:${userId}`, 60, count);

// Session cache: 30 minutes
await redis.setex(`session:${sessionId}`, 1800, JSON.stringify(session));

// Message deduplication: 5 minutes
await redis.setex(`dedup:${messageId}`, 300, '1');

// Distributed locks: 10 seconds
await redis.setex(`lock:${resource}`, 10, processId);
```

---

## Scaling Redis

### When to Upgrade:

Monitor these metrics:

1. **Memory Usage** > 80% of 512 MB
2. **Connection Count** > 100 concurrent
3. **Latency** > 10ms for GET operations

### How to Upgrade:

1. Go to Railway project
2. Click Redis service
3. Go to **"Settings"** > **"Plan"**
4. Select larger plan:
   - **Pro Plan** ($8/month) - 1 GB memory
   - **Business Plan** ($15/month) - 2 GB memory

### At What Scale?

- **500 MB plan:** Up to 1,000 teachers ✅ (current)
- **1 GB plan:** Up to 5,000 teachers
- **2 GB plan:** Up to 10,000+ teachers

---

## Troubleshooting

### Error: "Connection refused"

**Cause:** Redis URL not set or incorrect
**Fix:**
```bash
# Check environment variable
echo $REDIS_URL

# Should output: redis://:password@redis.railway.internal:6379
# If empty, copy from Railway dashboard
```

### Error: "ECONNRESET"

**Cause:** Network interruption
**Fix:** The retry strategy handles this automatically. If persistent:
1. Check Railway Redis status
2. Restart Redis service in Railway

### Error: "OOM command not allowed"

**Cause:** Redis out of memory
**Fix:**
1. Check memory usage in Railway dashboard
2. Upgrade to larger plan, OR
3. Set shorter TTLs on cached data

### Error: "Too many connections"

**Cause:** Connection pool exhausted
**Fix:**
```javascript
// Increase max connections
const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  // Add connection pooling
  lazyConnect: true
});
```

---

## Local Development

### Option 1: Use Railway Redis (Recommended)

Railway Redis is accessible from your local machine:

```bash
# .env
REDIS_URL=redis://:password@redis.railway.internal:6379
```

### Option 2: Local Redis (Alternative)

For offline development:

```bash
# Install Redis locally
brew install redis  # macOS
# OR
sudo apt-get install redis  # Linux

# Start Redis
redis-server

# Update .env for local development
REDIS_URL=redis://localhost:6379
```

---

## Security Best Practices

### 1. Connection Security
- ✅ Railway automatically uses TLS
- ✅ Password authentication enabled
- ✅ Private network (not publicly accessible)

### 2. Data Encryption
```javascript
// Don't store sensitive data in Redis
// Bad:
await redis.set('user:123', JSON.stringify({
  name: 'Ali',
  password: 'secret123'  // ❌ Never do this
}));

// Good:
await redis.set('user:123', JSON.stringify({
  name: 'Ali',
  lastSeen: Date.now()  // ✅ Non-sensitive data only
}));
```

### 3. Access Control
- Only your Railway app can access Redis
- No public internet access
- Automatic firewall rules

---

## Next Steps

After successful setup:

1. ✅ Railway Redis deployed
2. ⏭️ Implement Railway Redis Service ([shared/services/cache/railway-redis.service.js](../shared/services/cache/railway-redis.service.js))
3. ⏭️ Implement rate limiting ([shared/middleware/rate-limiter.js](../shared/middleware/rate-limiter.js))
4. ⏭️ Add session caching
5. ⏭️ Add message deduplication

---

## Reference

- [Railway Redis Documentation](https://docs.railway.app/databases/redis)
- [ioredis Documentation](https://github.com/redis/ioredis)
- [Redis Commands](https://redis.io/commands/)
- [Implementation Roadmap V3](../../Reports/IMPLEMENTATION_ROADMAP_V3_FINAL.md)

---

**Setup Time:** ~5 minutes
**Monthly Cost:** $3-5
**Estimated Completion:** ✅ Ready to proceed to next task
