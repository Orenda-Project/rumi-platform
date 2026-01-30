# Railway Operations Guide

This guide covers day-to-day Railway operations for your Rumi deployment: viewing logs, redeploying, managing environment variables, and connecting your own Git repository.

## Prerequisites

You need these from your provisioning response:

| Value | Purpose |
|-------|---------|
| `RAILWAY_TOKEN` | Deploy token for CLI operations |
| `project_id` | Your Railway project ID |
| `bot_service.id` | Service ID for targeted commands |
| `domain.webhook_url` | Your WhatsApp webhook URL |

## Setting Up Railway CLI

### Install the CLI

```bash
npm install -g @railway/cli
```

### Authenticate with Your Project Token

Two options:

**Option A: Environment Variable (Recommended)**
```bash
export RAILWAY_TOKEN=your-deploy-token
```

**Option B: Per-Command**
```bash
RAILWAY_TOKEN=xxx railway logs
```

The project token allows deployment, logs, and environment variables. It does NOT allow creating new projects or adding plugins.

## Viewing Logs

```bash
# View recent logs
railway logs

# Follow logs in real-time
railway logs --follow

# View last 100 lines
railway logs --num 100

# Filter by service (if you have multiple)
railway logs --service bot
```

**Common log patterns:**

| Pattern | Meaning |
|---------|---------|
| `[webhook] Received message` | WhatsApp message arrived |
| `[error]` | Something went wrong |
| `[openai]` | LLM API call |
| `[supabase]` | Database operation |

## Redeploying Your Bot

### Method 1: Manual Deploy (CLI)

After making code changes locally:

```bash
# Navigate to your bot directory
cd rumi-platform/bot

# Deploy to Railway
railway up
```

This pushes your local code to Railway and triggers a rebuild.

### Method 2: Git-Based Auto-Deploy (Recommended)

Connect your GitHub repository for automatic deployments on every push:

1. **Push your code to GitHub:**
   ```bash
   git remote add origin https://github.com/YOUR-ORG/rumi-platform.git
   git push -u origin main
   ```

2. **Connect GitHub to Railway (UI required):**
   - Go to your Railway project dashboard (URL from provisioning)
   - Click on your `bot` service
   - Go to **Settings** > **Source**
   - Click **Connect Repository**
   - Authorize Railway on GitHub if prompted
   - Select your repository and branch

3. **Configure auto-deploy:**
   - Enable **Automatic Deployments**
   - Set the **Root Directory** to `bot`
   - Railway will now deploy automatically on every `git push`

**Note:** GitHub connection cannot be done via API. This is a one-time UI setup.

### Method 3: Redeploy Without Changes

To restart your bot (e.g., after changing env vars):

```bash
railway up --force
```

## Managing Environment Variables

### View Current Variables

```bash
railway variables
```

### Set a Variable

```bash
railway variables --set KEY=value
```

### Set Multiple Variables

```bash
railway variables --set KEY1=value1 --set KEY2=value2
```

### Common Variables to Update

| Variable | When to Change |
|----------|----------------|
| `WHATSAPP_TOKEN` | Token rotated by admin |
| `OPENROUTER_API_KEY` | Key expired or changed |
| `SONIOX_API_KEY` | New Soniox account |
| `RUMI_TIER` | Upgrading tier |

After changing variables, the bot restarts automatically.

## Project Structure on Railway

Your provisioned project includes:

```
rumi-{name}/
├── bot            # Your WhatsApp bot (main service)
├── redis          # Redis for queues and caching
└── (stale-worker) # Optional: cron job for session cleanup
```

## Accessing Railway Dashboard (UI)

The project token allows CLI operations but NOT UI access. To access the Railway web dashboard:

### Option A: Use the Project URL

Your provisioning response includes `project.url`:
```
https://railway.com/project/{project-id}
```

This URL requires a Railway account. If you don't have UI access, you can request it from your admin.

### Option B: Request Team Invite

Contact your Rumi administrator to be invited to the "Rumi Deployments" team. Once invited:

1. Create a Railway account at [railway.app](https://railway.app)
2. Accept the team invitation
3. Access your project via the dashboard

## Troubleshooting

### "Unauthorized" Error

Your token may have expired or is incorrect:
```bash
echo $RAILWAY_TOKEN  # Verify it's set
railway whoami       # Check authentication
```

### Deployment Fails

Check the build logs:
```bash
railway logs --deployment latest
```

Common causes:
- Missing dependencies in `package.json`
- Syntax errors in code
- Missing environment variables

### Bot Not Responding

1. Check logs for errors:
   ```bash
   railway logs --follow
   ```

2. Verify WhatsApp webhook is configured:
   - Webhook URL: `https://{your-domain}/webhook`
   - Verify token matches `WEBHOOK_VERIFY_TOKEN`

3. Check service health:
   ```bash
   curl https://{your-domain}/health
   ```

### Redis Connection Failed

```bash
railway variables | grep REDIS_URL
```

Ensure `REDIS_URL` is set. If using Railway Redis, it should be auto-populated.

## Scaling Considerations

### Memory Limits

The default Railway plan has memory limits. If your bot crashes with OOM:

1. Check memory usage in Railway dashboard
2. Consider upgrading your Railway plan
3. Optimize heavy operations (image processing, PDF generation)

### Cold Starts

Railway may spin down idle services. First message after inactivity may take 5-10 seconds. This is normal on the free/hobby tier.

## Security Best Practices

1. **Never commit your .env file** - Use `.gitignore`
2. **Rotate tokens periodically** - Update `WHATSAPP_TOKEN` if compromised
3. **Use environment variables** - Not hardcoded secrets in code
4. **Monitor logs** - Watch for unusual patterns

## CLI Reference

| Command | Description |
|---------|-------------|
| `railway logs` | View logs |
| `railway logs --follow` | Stream logs |
| `railway up` | Deploy code |
| `railway variables` | List env vars |
| `railway variables --set K=V` | Set env var |
| `railway status` | Check deployment status |
| `railway rollback` | Revert to previous deployment |

## Getting Help

- **Railway Docs**: [docs.railway.app](https://docs.railway.app)
- **Rumi Issues**: [GitHub Issues](https://github.com/taleemabad/rumi-platform/issues)
- **Railway Discord**: [discord.gg/railway](https://discord.gg/railway)
