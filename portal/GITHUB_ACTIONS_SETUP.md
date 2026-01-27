# 🚀 GitHub Actions Auto-Deploy Setup

## What This Does

When you edit the portal in Lovable:
1. Lovable commits to `rumi-portal_v1.2` repo
2. GitHub Action **automatically** builds the frontend
3. GitHub Action **automatically** pushes to `rumi-dashboard` repo
4. Railway **automatically** deploys to production

**Total time from Lovable save → Live: ~3-5 minutes** ✅

---

## Setup Steps (5 minutes)

### Step 1: Create GitHub Personal Access Token

1. Go to: **https://github.com/settings/tokens**
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Give it a name: `Rumi Portal Auto-Deploy`
4. Set expiration: **No expiration** (or 1 year if you prefer)
5. Select these scopes:
   - ✅ **repo** (full control - this includes everything below it)
   - ✅ **workflow** (update GitHub Actions)
6. Click **"Generate token"** at the bottom
7. **IMPORTANT**: Copy the token NOW (starts with `ghp_...`)
   - You won't be able to see it again!
   - Save it somewhere safe temporarily

---

### Step 2: Add Token as Repository Secret

1. Go to: **https://github.com/your-org/rumi-portal_v1.2**
2. Click **"Settings"** tab (top of page)
3. In left sidebar, click **"Secrets and variables"** → **"Actions"**
4. Click **"New repository secret"** (green button)
5. Fill in:
   - **Name**: `GH_PAT` (exactly this, case-sensitive!)
   - **Secret**: Paste the token you copied (starts with `ghp_...`)
6. Click **"Add secret"**

---

### Step 3: Push the Workflow File

I've already created the workflow file locally. Now we just need to push it:

```bash
cd /path/to/rumi-platform/portal
```

```bash
git add .github/workflows/deploy-to-backend.yml
```

```bash
git commit -m "feat: add GitHub Actions auto-deploy workflow"
```

```bash
git push origin main
```

---

## ✅ That's It! You're Done!

The workflow is now active. Here's what happens next:

### Testing the Workflow

1. Make a small change in Lovable (e.g., change a button color)
2. Lovable auto-commits to `rumi-portal_v1.2`
3. Watch GitHub Actions run:
   - Go to: **https://github.com/your-org/rumi-portal_v1.2/actions**
   - You'll see a workflow running called "Deploy Portal Frontend to Backend"
   - Click on it to watch progress (takes ~2-3 minutes)
4. Wait ~2 more minutes for Railway to deploy
5. Visit **https://portal.your-domain.com** - your change is live! 🎉

---

## 📊 Monitoring Deployments

### View Workflow Runs

**GitHub Actions**: https://github.com/your-org/rumi-portal_v1.2/actions

You'll see:
- ✅ Green checkmark = successful deployment
- ❌ Red X = failed (click to see error)
- 🟡 Yellow circle = currently running

### View Railway Deployments

**Railway Dashboard**: https://railway.app

- Click your **dashboard** service
- Click **"Deployments"** tab
- See live deployment logs

---

## 🎯 What Gets Auto-Deployed

The workflow **only triggers** when you change these files:
- `src/**` - All source code
- `public/**` - Public assets
- `index.html` - Entry point
- `package.json` - Dependencies
- `vite.config.ts` - Build configuration

**It does NOT trigger** for:
- README changes
- Documentation updates
- GitHub Actions workflow changes

This saves GitHub Actions minutes and avoids unnecessary deployments.

---

## 🔧 Advanced: How the Workflow Works

Here's what happens under the hood:

1. **Checkout Frontend Repo**
   - Downloads your `rumi-portal_v1.2` code

2. **Install & Build**
   - Runs `npm ci` (clean install)
   - Runs `npm run build` (creates `dist/` folder)

3. **Checkout Backend Repo**
   - Downloads `rumi-dashboard` code using your `GH_PAT` token

4. **Copy Build Files**
   - Clears old `portal-frontend/dist/`
   - Copies new build from step 2

5. **Commit & Push**
   - Commits with message: "🚀 Auto-deploy: Update portal frontend from Lovable"
   - Includes source repo, commit hash, and who triggered it
   - Pushes to `rumi-dashboard` main branch

6. **Railway Auto-Deploys**
   - Railway detects push to `rumi-dashboard`
   - Builds and deploys automatically

---

## 🆘 Troubleshooting

### Problem: Workflow fails with "Resource not accessible by integration"

**Solution**:
- Your `GH_PAT` token doesn't have `repo` scope
- Go back to Step 1 and create a new token with `repo` scope

### Problem: Workflow fails with "Authentication failed"

**Solution**:
- Your `GH_PAT` secret name is wrong or missing
- Go to: https://github.com/your-org/rumi-portal_v1.2/settings/secrets/actions
- Verify secret name is exactly `GH_PAT` (case-sensitive)

### Problem: Workflow runs but changes don't appear on portal

**Solution**:
- Check Railway deployment status (might still be deploying)
- Clear browser cache (Cmd+Shift+R on Mac)
- Check Railway logs for errors

### Problem: "No changes to commit" in workflow

**Solution**:
- This is normal! It means the build files didn't change
- Workflow will skip the push step
- No deployment needed

---

## 📈 GitHub Actions Usage

**Free tier limits**:
- 2000 minutes/month (plenty for this use case)
- Each deployment takes ~2-3 minutes
- You can run ~600 deployments/month

**Current usage**:
- Check at: https://github.com/settings/billing

---

## 🎉 Benefits

✅ **Zero manual work** - Edit in Lovable, auto-deploys
✅ **Fast** - Live in 3-5 minutes
✅ **Reliable** - Same build process every time
✅ **Traceable** - Full history of deployments
✅ **Professional** - Industry-standard CI/CD workflow

---

## Next Steps

1. Complete Steps 1-3 above
2. Make a test change in Lovable
3. Watch the magic happen! ✨

---

**Questions?** Check the workflow file:
`/03_Rumi Portal/.github/workflows/deploy-to-backend.yml`

**Need help?** Share a screenshot of the error from GitHub Actions
