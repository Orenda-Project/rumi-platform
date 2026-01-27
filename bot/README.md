# Rumi WhatsApp Bot

**Parent**: [CLAUDE.md](../CLAUDE.md) | **Repo**: `https://github.com/your-org/whatsapp-ai-bot`

Production WhatsApp bot for teacher coaching and support.

---

## Features

| Feature | Command | Description |
|---------|---------|-------------|
| AI Coaching | Voice/text | Classroom coaching with OECD framework |
| Lesson Plans | `/lesson plan` | Gamma AI presentations |
| Reading Assessment | `/reading test` | EGRA/ASER fluency testing |
| Video Generation | `/video` | Educational explainer videos |

---

## Quick Commands

```bash
# Development
npm install && npm start

# Verify remote
git remote -v  # Must be: whatsapp-ai-bot

# Deploy to staging
git push origin staging

# Deploy to production (after staging test)
git checkout main && git merge staging && git push origin main
```

---

## Architecture

```
├── whatsapp-bot.js       # Main entry, webhook handler
├── shared/
│   ├── handlers/         # Message type handlers
│   ├── services/         # Feature implementations
│   └── utils/            # Logging, R2 storage
├── workers/              # SQS background processors
└── scripts/              # Deployment, testing utilities
```

---

## Related Docs

- **Technical details**: [02_Technical_Architecture.md](../01_Digital Coach Docs/02_Technical_Architecture.md)
- **API integrations**: [03_API_Integrations.md](../01_Digital Coach Docs/03_API_Integrations.md)
- **Deployment**: [05_Deployment_Operations.md](../01_Digital Coach Docs/05_Deployment_Operations.md)
