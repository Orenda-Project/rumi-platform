# DNS Change Runbook for portal.your-domain.com

**Last Updated**: January 18, 2026
**Domain Registrar**: GoDaddy
**Hosting**: Railway
**Bead**: plt-run01

---

## Overview

This runbook documents the procedure for updating DNS records when Railway custom domain configuration changes.

**CRITICAL**: Railway generates unique CNAME targets. If you remove and re-add a custom domain, the target CHANGES.

---

## Pre-Change Checklist

- [ ] Document current GoDaddy CNAME target: `__________________`
- [ ] Document current Railway service URL: `__________________`
- [ ] Confirm GoDaddy login credentials available
- [ ] Confirm Railway dashboard access
- [ ] Notify team of planned DNS change

---

## During Change (Railway Dashboard)

1. [ ] Navigate to Railway → Rumi project → rumi-dashboard
2. [ ] Go to Settings → Domains
3. [ ] If removing domain: **NOTE THE WARNING** and copy current CNAME
4. [ ] Make the required changes
5. [ ] After adding domain: **COPY NEW CNAME TARGET**: `__________________`

---

## During Change (GoDaddy)

1. [ ] Log into GoDaddy (account: ____________)
2. [ ] Navigate to: My Products → Domains → your-domain.com → DNS
3. [ ] Find CNAME record with Name = `portal`
4. [ ] Update the Value/Target to NEW Railway CNAME: `__________________`
5. [ ] Set TTL to 600 (10 minutes) during testing
6. [ ] Click Save

---

## Verification (5-15 minutes after)

Run these commands from terminal:

```bash
# Test 1: Check DNS propagation (Google DNS)
dig @8.8.8.8 portal.your-domain.com CNAME +short
# Expected: NEW_CNAME.up.railway.app

# Test 2: Check DNS propagation (Cloudflare DNS)
dig @1.1.1.1 portal.your-domain.com CNAME +short
# Expected: NEW_CNAME.up.railway.app

# Test 3: Health check via custom domain
curl -s https://portal.your-domain.com/health | jq .
# Expected: {"status":"healthy",...}

# Test 4: Teachers Portal loads
curl -s https://portal.your-domain.com/ | head -5
# Expected: HTML content

# Test 5: Observability Portal loads
curl -s https://portal.your-domain.com/observability | head -5
# Expected: HTML content or redirect

# Test 6: Direct Railway URL matches (sanity check)
diff <(curl -s https://portal.your-domain.com/health | jq -S .) \
     <(curl -s https://NEW_RAILWAY_URL.up.railway.app/health | jq -S .)
# Expected: No output (files match)
```

---

## Post-Change Checklist

- [ ] All verification tests pass
- [ ] Update SETUP_GUIDE_FOR_HAROON.md with new CNAME target
- [ ] Update CLAUDE.md if any documentation references changed
- [ ] Set TTL back to 3600 (1 hour) for caching
- [ ] Notify team that DNS change is complete

---

## Rollback Procedure

If something goes wrong:

1. [ ] Log into GoDaddy
2. [ ] Change CNAME back to previous value: `__________________`
3. [ ] Wait 5-10 minutes for propagation
4. [ ] Verify with `dig portal.your-domain.com CNAME`
5. [ ] Test with `curl https://portal.your-domain.com/health`

---

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| "Application not found" | CNAME points to deleted Railway service | Update CNAME to current service URL |
| SSL certificate error | Certificate not yet issued | Wait 5-10 minutes, Railway auto-issues |
| Intermittent failures | DNS not fully propagated | Wait longer, check multiple DNS servers |
| Works on some machines | Local DNS cache | Run `sudo dscacheutil -flushcache` (Mac) |

---

## Reference

**Current Configuration** (update for your deployment):
- Domain: `portal.your-domain.com`
- Type: CNAME
- Target: `your-railway-service-production.up.railway.app`
- TTL: 3600

**Nameservers**:
- (your DNS provider's nameservers)

---

## Change History

| Date | Change | Who |
|------|--------|-----|
| Jan 18, 2026 | Created runbook (plt-run01) | Claude |
