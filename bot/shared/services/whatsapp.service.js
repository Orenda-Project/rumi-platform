/**
 * WhatsAppService — thin compatibility facade.
 *
 * All ~40 static methods that used to live directly in this file now live in
 * bot/shared/services/messaging/ (a driver registry: meta-channel.service.js
 * for the Meta Cloud API, baileys-channel.service.js for the sandbox
 * driver — see docs/onboarding/sandbox-production-design.md). This file just
 * re-exports whichever driver messaging/index.js resolves, so every existing
 * call site across the bot (e.g. WhatsAppService.sendMessage(...)) keeps
 * working unchanged, regardless of which channel is configured.
 */
module.exports = require('./messaging');
