# Getting your API keys

Rumi turns features on by **presence**: set a feature's key(s) and it switches on; leave them blank and it stays off (the bot never crashes over a missing optional key). So you only need a handful to start, then add more as you go.

**You need 8 keys to boot.** Everything else is optional. Run `npm run doctor` any time to see what's on, what's off, and which key unlocks each off feature.

> Steps were verified against each provider's signup as of May 2026; provider dashboards change, so the exact menu labels may drift. Env-var names match `bot/shared/config/feature-availability.js` and `.env.template`.

---

## Tier 0 — required to start (8 keys)

Without all of these the bot won't start.

### Supabase → `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
The database. **Free tier: yes (no card).**
1. Go to **supabase.com** → **Start your project** → sign in with GitHub.
2. **New project** → name it, set a DB password + region → **Create** (~2 min to provision).
3. **Settings** (gear, bottom-left) → **API**: copy the **Project URL** → `SUPABASE_URL`.
4. Same page → **Project API keys** → copy the **`service_role`** secret (NOT `anon`) → `SUPABASE_SERVICE_ROLE_KEY`. Server-side only — never ship it to a client.
> Supabase is rolling out new `sb_secret_…` keys; the legacy `service_role` key works through end-2026 and is what Rumi expects. Use the legacy key if both are shown.

### OpenRouter → `OPENROUTER_API_KEY`
The LLM gateway behind every AI feature (one key → many models). **Free tier: yes, free models at $0 (no card to start).**
1. **openrouter.ai** → **Sign in** (Google/GitHub/email).
2. Open **Keys** (account menu → Keys).
3. **Create Key** → name it → copy it now (shown once).
4. Add funds under **Credits** when you want paid models; free `:free` models work at $0 balance.

### Redis → `REDIS_URL`
Session state + the job queue. Two easy options:

**Upstash (free, no card):**
1. **upstash.com** → Console → **Redis** tab → **+ Create Database**.
2. Name it, pick a region, **Free** tier → **Create**.
3. **Connect to your database** → copy the TLS connection string (`rediss://default:…`) → `REDIS_URL`.

**Railway plugin (if you deploy on Railway):**
1. In your Railway project: **+ New** → **Database** → **Add Redis**.
2. Open the Redis service → **Variables** → copy `REDIS_URL` (or `REDIS_PRIVATE_URL` for same-project service-to-service).
> Railway has no permanent free tier (Hobby ≈ $5/mo); confirm current terms at railway.com/pricing.

### Meta WhatsApp → `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `WEBHOOK_VERIFY_TOKEN`, `WABA_ID`
The messaging layer — the one step with eligibility rules, so it has **its own guide:** **[whatsapp.md](whatsapp.md)**. You can get a free test number + all four values in ~10 minutes, no verification.

---

## Tier 1 — optional features (add a key → the feature turns on)

### Soniox → `SONIOX_API_KEY` — *voice notes (speech-to-text, multilingual incl. Urdu/Swahili)*
Usage-priced (~$0.10/hr).
1. **console.soniox.com/signup** → create account → verify email.
2. Console → **API Keys** → **Create** → copy (shown once).
> Free-credit amount + whether a card is needed at signup aren't stated publicly — check on first login.

### ElevenLabs → `ELEVENLABS_API_KEY` (+ `ELEVENLABS_VOICE_ID`) — *spoken replies (text-to-speech)*
**Free tier: ~10k chars/month, no card.**
1. **elevenlabs.io** → **Sign up**.
2. Profile icon (bottom-left) → **API Keys** → **Create API Key** → copy (shown once) → `ELEVENLABS_API_KEY`.
3. **Voices** → on a voice, **⋮ → Copy voice ID** → `ELEVENLABS_VOICE_ID`.

### Uplift AI → `UPLIFT_API_KEY` — *Urdu / regional-language voices*
Only needed for South-Asian regional TTS.
1. **platform.upliftai.org** → **Sign in to get started**.
2. In the studio, find **generate your API key** → create + copy (`sk_api_…`).
> Pricing/free-tier/access-gating isn't documented publicly — verify after signing in.

### Gamma → `GAMMA_API_KEY` — *polished lesson-plan/deck generation*
Optional (the Kie.ai image lesson-plan path is a cheaper alternative). **API key requires a PAID Gamma plan (Pro+); card required.**
1. **gamma.app** → sign in (upgrade to Pro or higher — keys are gated to paid tiers).
2. **Account Settings → API Keys** (gamma.app/settings/api-keys) → **generate** → copy (`sk-gamma-…`).

### Microsoft Azure → `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` — *reading pronunciation scoring*
**Free tier: F0 (5 hrs STT + 500k chars TTS/month). Card required to create the Azure account (F0 itself isn't billed).**
1. **portal.azure.com** → sign up (identity + card verification).
2. **Create a resource** → search **Speech** → **Create**.
3. Set subscription, resource group, **Region** (note it → `AZURE_SPEECH_REGION`, e.g. `eastus`), name, **Pricing tier = Free F0** → **Create**.
4. Open the resource → **Keys and Endpoint** → copy **KEY 1** → `AZURE_SPEECH_KEY`.

### Kie.ai → `KIE_API_KEY` — *AI video generation + image lesson plans*
**Free: 80 credits on signup, no card** (credits ~$0.005 each after).
1. **kie.ai** → sign up (Google).
2. Dashboard → **API Key** section → generate + copy.

### Axiom → `AXIOM_DATASET`, `AXIOM_TOKEN` — *optional structured logging*
The bot logs to console + correlation IDs without it. **Free tier: 500 GB/mo ingest, no card.**
1. **axiom.co** → sign up.
2. **Datasets → New Dataset** → the name is your `AXIOM_DATASET`.
3. **Settings → API tokens → New API token** (type **Basic**, scoped to that dataset) → copy → `AXIOM_TOKEN`.

---

## Tier 2 — infrastructure & feature support

### Cloudflare R2 → `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET_NAME`
Object storage for coaching audio, reading recordings, and generated PDFs/videos — needed by any feature that produces or reads media. **Free: 10 GB + zero egress fees; card required to enable R2 (usage still $0 within limits).**
1. **dash.cloudflare.com** → **Storage & databases → R2 → Overview** → enable R2 (add a payment method).
2. **Create bucket** → name it → `CLOUDFLARE_R2_BUCKET_NAME`. The S3 endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
3. Note your **Account ID** (top of the R2 page) → `CLOUDFLARE_ACCOUNT_ID`.
4. **Manage API Tokens → Create API token** → permission **Object Read & Write** → copy the **Access Key ID** → `CLOUDFLARE_R2_ACCESS_KEY_ID` and **Secret Access Key** (shown once) → `CLOUDFLARE_R2_SECRET_ACCESS_KEY`.

### WhatsApp Flow encryption & Flow IDs
The `FLOW_PRIVATE_KEY` / `FLOW_PUBLIC_KEY` pair is **not a third-party signup** — it's an RSA keypair generated locally by the setup script and registered with Meta (needed for endpoint-type Flows). The various `*_FLOW_ID` values are **written back automatically** when you register your Flows against your WABA — you don't fetch them by hand. See [SETUP.md](../../SETUP.md) for flow registration.

### Job queue (only if `QUEUE_DRIVER=sqs`) → `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
Default `QUEUE_DRIVER=bullmq` uses Redis (no AWS needed). Only set these if you opt into SQS.

### Advanced / niche (most adopters skip)
`GEMINI_API_KEY`, `MMS_SERVICE_URL`/`_API_KEY` (Modal), `ANTHROPIC_API_KEY` (dashboard only) — advanced; not needed for a standard deployment.

---

## After you have your keys
1. `cp .env.template .env` and paste them in.
2. `npm run validate:env` — checks the 8 required are present.
3. `npm run doctor` — shows every feature's on/off state and the exact key for each off feature.

For what each deployment costs to run, see the [cost guide](../cost-guide.md).
