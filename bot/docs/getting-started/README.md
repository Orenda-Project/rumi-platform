# Digital Coach - Knowledge Base

**Version**: 2.0 (November 2025)
**Maintained By**: Rumi Contributors
**Last Updated**: November 1, 2025
**Repository**: https://github.com/your-org/whatsapp-ai-bot

---

## Overview

This knowledge base contains comprehensive technical documentation for the Digital Coach WhatsApp bot. It follows a progressive disclosure structure—start with high-level routing in [Skill.md](Skill.md), then drill down into specific reference files as needed.

**Purpose**: Enable developers to understand, deploy, maintain, and extend the Digital Coach bot with complete context.

---

## Structure

```
docs/
├── Skill.md                        # Master routing document (START HERE)
├── 01_Overview_and_Features.md    # What the bot does, user flows
├── 02_Technical_Architecture.md   # System design, data flow, tech stack
├── 03_API_Integrations.md         # WhatsApp, OpenAI, Soniox, Gamma APIs
├── 04_Development_Setup.md        # Git clone, npm install, env vars
├── 05_Deployment_Operations.md    # Railway deployment, costs, maintenance
├── 06_Known_Issues.md             # Active bugs, troubleshooting
├── 07_Extending_the_Bot.md        # Adding features, integrations
└── README.md                       # This file
```

---

## How to Use This Knowledge Base

### For New Developers

**Recommended Path**:

1. **Read [Skill.md](Skill.md)** (5 min) ← Master routing, core context
2. **Read [01_Overview_and_Features.md](01_Overview_and_Features.md)** (10 min) ← Understand capabilities
3. **Read [04_Development_Setup.md](04_Development_Setup.md)** (15 min) ← Set up locally
4. **Skim [06_Known_Issues.md](06_Known_Issues.md)** (5 min) ← Understand current problems
5. **Refer to other files as needed** ← API details, deployment, extensions

**Total**: ~30 minutes for essentials, 2-3 hours for comprehensive understanding.

### For Quick Reference

- **What can it do?** → [01_Overview_and_Features.md](01_Overview_and_Features.md)
- **How does it work?** → [02_Technical_Architecture.md](02_Technical_Architecture.md)
- **API documentation?** → [03_API_Integrations.md](03_API_Integrations.md)
- **How to set up?** → [04_Development_Setup.md](04_Development_Setup.md)
- **How to deploy?** → [05_Deployment_Operations.md](05_Deployment_Operations.md)
- **Something broken?** → [06_Known_Issues.md](06_Known_Issues.md)
- **How to add features?** → [07_Extending_the_Bot.md](07_Extending_the_Bot.md)

### For Specific Tasks

**Setting up locally**:
1. Read [04_Development_Setup.md](04_Development_Setup.md#prerequisites)
2. Follow [Initial Setup](04_Development_Setup.md#initial-setup)
3. Run verification: `npm run test`

**Deploying to production**:
1. Read [05_Deployment_Operations.md](05_Deployment_Operations.md#railway-deployment)
2. Follow [Initial Deployment](05_Deployment_Operations.md#initial-deployment)
3. Check [Deployment Checklist](05_Deployment_Operations.md#deployment-checklist)

**Debugging issues**:
1. Check [06_Known_Issues.md](06_Known_Issues.md#current-known-issues) for known problems
2. Follow [Common Troubleshooting Scenarios](06_Known_Issues.md#common-troubleshooting-scenarios)
3. Review [Error Code Reference](06_Known_Issues.md#error-code-reference)

**Adding new features**:
1. Read [07_Extending_the_Bot.md](07_Extending_the_Bot.md#adding-new-features)
2. Review [Integration Opportunities](07_Extending_the_Bot.md#integration-opportunities)
3. Follow [Code Contribution Guidelines](07_Extending_the_Bot.md#code-contribution-guidelines)

---

## Key Information at a Glance

### What Is Digital Coach?

An AI-powered WhatsApp chatbot that supports Pakistani teachers with:
- Real-time teaching advice (OpenAI GPT-4)
- Voice message transcription (Soniox - Urdu/English)
- Lesson plan generation (Gamma AI)
- Text-to-speech responses (OpenAI TTS)

### Current Status (November 2025)

- ✅ **Production**: Deployed on Railway
- ✅ **Repository**: https://github.com/your-org/whatsapp-ai-bot
- ✅ **Version**: 2.0
- ⚠️ **Active Issues**: 6 (see [06_Known_Issues.md](06_Known_Issues.md))

### Tech Stack

| Component | Technology |
|-----------|------------|
| **Runtime** | Node.js 18+ |
| **Framework** | Express.js 5.1.0 |
| **APIs** | WhatsApp Cloud, OpenAI, Soniox, Gamma |
| **Hosting** | Railway (auto-deploy from GitHub) |
| **Cost** | ~$32-37/month for 100 teachers |

### Performance Targets

| Metric | Target |
|--------|--------|
| Text response time | <15s |
| Voice response time | <30s |
| Lesson plan time | <120s |
| Error rate | <1% |
| Uptime | >99% |

---

## Progressive Disclosure Principle

**Don't load all files at once—be strategic about context.**

Example for debugging Soniox transcription:
1. Start with [Skill.md](Skill.md) ← High-level routing
2. Load [06_Known_Issues.md](06_Known_Issues.md#soniox-transcriptions-stuck-in-queue) ← Specific issue
3. Load [03_API_Integrations.md](03_API_Integrations.md#soniox-speech-to-text-api) ← API details if needed

This approach:
- Reduces cognitive load
- Saves context window tokens (for AI agents)
- Enables faster navigation
- Scales better than monolithic docs

---

## Critical Warnings

### Soniox Payment Required

⚠️ **As of October 27, 2025**: Soniox free tier discontinued. Payment method required for transcription to work.

**Without payment**: Transcriptions stuck in "queued" indefinitely.

**Solution**: Add credit card at https://console.soniox.com

### Advanced Features Disabled

The following Soniox features are **currently disabled** due to queue hang:
- `enable_language_identification`
- `context` parameter (educational domain)

**Configuration**: Basic only (`file_id`, `model`, `language_hints`).

See [06_Known_Issues.md](06_Known_Issues.md#advanced-soniox-features-cause-queue-hang) for details.

### Railway Auto-Deploys

⚠️ **Any push to `main` triggers production deployment.**

Test thoroughly locally before pushing:
```bash
npm install
npm start
# Test features
git push origin main  # Only when ready
```

---

## Recent Changes (November 2025)

### v2.0 - November 1, 2025

**Major Changes**:
- ✅ Soniox v2 fallback (180s v3, 120s v2)
- ✅ Removed advanced Soniox features (queue hang fix)
- ✅ Extended timeouts for queue processing
- ✅ Diagnostic logging for transcription flow
- ✅ Automatic resource cleanup
- ✅ Fixed Gamma API layout parameter error

**Git Commits**:
- `1cadec6`: Increase Soniox timeout
- `09324d1`: Fix v2 fallback + remove advanced features
- `bafe2a3`: Enhanced features (reverted)
- `1b2ab7d`: Add diagnostic logging
- `aaf3e36`: Automatic cleanup

**Known Issues**: See [06_Known_Issues.md](06_Known_Issues.md#current-known-issues)

---

## Updating This Knowledge Base

**Frequency**: Update when:
- Major feature added
- Significant bug fixed
- API integration changed
- Deployment process updated
- Critical issue discovered

**What to Update**:

1. **Features Added** → Update [01_Overview_and_Features.md](01_Overview_and_Features.md)
2. **Architecture Changed** → Update [02_Technical_Architecture.md](02_Technical_Architecture.md)
3. **New API Integrated** → Update [03_API_Integrations.md](03_API_Integrations.md)
4. **Setup Process Changed** → Update [04_Development_Setup.md](04_Development_Setup.md)
5. **Deployment Changed** → Update [05_Deployment_Operations.md](05_Deployment_Operations.md)
6. **Bug Fixed** → Update [06_Known_Issues.md](06_Known_Issues.md)
7. **Extension Example Added** → Update [07_Extending_the_Bot.md](07_Extending_the_Bot.md)

**Version History**: Maintain version log at bottom of each file.

---

## Design Principles

This knowledge base follows these principles:

1. **Progressive Disclosure**: Start high-level, drill down only when needed
2. **Separation of Concerns**: Each file covers one specific domain
3. **Use Case Orientation**: Organized by developer tasks (setup, deploy, debug)
4. **Context-Aware Routing**: [Skill.md](Skill.md) guides to relevant files based on task
5. **Evidence-Based**: All claims cite code locations, commits, or external sources
6. **Maintainable**: Clear structure, easy to update

---

## Known Limitations

1. **Data as of November 2025** - Some information will become stale (especially costs, API versions)
2. **Soniox Advanced Features Disabled** - Lower accuracy but more reliable (temporary)
3. **In-Memory Conversation Storage** - History lost on restart (architectural)
4. **No Admin Dashboard** - Managed via logs only (future enhancement)
5. **Cost Estimates Speculative** - Gamma pricing not publicly documented

---

## Contact & Feedback

**For Documentation Updates**:
- Repository: https://github.com/your-org/whatsapp-ai-bot
- Issues: https://github.com/your-org/whatsapp-ai-bot/issues

**For Issues**:
- GitHub Issues: https://github.com/taleemabad/rumi-platform/issues

---

## License & Confidentiality

**Internal Use Only** - This knowledge base contains technical details intended for:
- Project team members
- Authorized developers and contributors
- Claude agents working on the project

**Do Not Share Publicly**:
- API keys or credentials
- Cost structures and unit economics
- Internal roadmap and priorities
- Known security vulnerabilities

**Approved for External Sharing**:
- General architecture overview
- Open-source components used
- Integration patterns (without credentials)

When in doubt, check with Haroon (CEO) or technical lead.

---

**Version History**:
- **v2.0** (Nov 1, 2025) - Progressive disclosure structure, comprehensive updates
- **v1.0** (Oct 2025) - Initial monolithic documentation

**Next Review**: February 1, 2026
