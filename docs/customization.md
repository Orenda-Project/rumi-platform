# Customization Guide

## Branding

Override bot identity via environment variables or by editing `bot/shared/config/branding.js`:

```env
BOT_NAME=MyAssistant
ORG_NAME=My School District
SUPPORT_CONTACT=help@myschool.org
```

Supported languages can be configured in `branding.js`:

```javascript
const supportedLanguages = [
  { code: 'en', name: 'English', direction: 'ltr' },
  { code: 'ur', name: 'Urdu', direction: 'rtl' },
  // Add your language here
];
```

## Feature Tiers

Control which features are enabled via `RUMI_TIER` environment variable:

- `minimal` - AI Chat + Registration
- `recommended` - + Coaching + Reading Assessment
- `full` - All features

Check features in code:

```javascript
const { isFeatureEnabled } = require('./config/feature-tiers');
if (isFeatureEnabled('coaching')) {
  // Enable coaching flow
}
```

## LLM Provider

Default: OpenRouter (access to 500+ models with one key).

Switch to direct OpenAI:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key
```

Change default model:

```env
LLM_MODEL=anthropic/claude-sonnet-4
```

## Adding New Features

1. Add capability to `bot/shared/config/capabilities.config.js`
2. Add feature flag to `bot/shared/config/feature-tiers.js`
3. Gate with `isFeatureEnabled('your_feature')` in handlers
4. Add job type to `bot/workers/bullmq-worker.js` if async
