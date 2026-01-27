# Contributing to Rumi

Thank you for your interest in contributing to Rumi!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/rumi-platform.git`
3. Create a branch: `git checkout -b feature/your-feature`
4. Make changes
5. Run tests: `npm test`
6. Push and create a Pull Request

## Development Setup

```bash
cp .env.template .env
# Fill in at least the minimal tier values
cd bot && npm install && cd ..
npm run validate:env
npm run simulate  # Test without WhatsApp
```

## Code Style

- Node.js CommonJS (require/module.exports)
- No TypeScript in bot/ (portal/ uses TypeScript)
- Use branding.js for customizable strings
- Use feature-tiers.js for feature gating
- Use llm-client.js for all AI calls

## Testing

Write tests for new features. Follow the existing TDD pattern:

1. Write tests in `tests/unit/sprint-X/`
2. Run with `npm run test:sprintX`
3. Ensure all existing tests still pass: `npm test`

## Pull Request Checklist

- [ ] Tests pass (`npm test`)
- [ ] No hardcoded credentials
- [ ] No Taleemabad-specific content in code
- [ ] Feature gated with `isFeatureEnabled()` if tier-dependent
- [ ] Updated `.env.template` if new env vars needed
