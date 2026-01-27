# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-28

### Added
- Initial open-source release of Rumi AI Teaching Assistant
- WhatsApp bot with AI chat (AMA), registration, coaching, reading assessment, and lesson plans
- Three-tier feature system (Minimal, Recommended, Full)
- OpenRouter as unified AI gateway (one key for 500+ LLM models)
- BullMQ-based async job queue (coaching analysis, transcription, video generation)
- Supabase database schema with 52+ tables, RLS policies, and seed data
- Observability Dashboard for monitoring bot usage and coaching sessions
- Teacher Portal for classroom management (Phase 2)
- `/setup` Claude Code skill for automated one-hour deployment
- Railway deployment configuration (Procfile for web + worker processes)
- CLI simulator for local testing without WhatsApp
- Comprehensive documentation (architecture, setup, cost guide, customization)
- Environment validation and connection testing scripts
- CI pipeline with Node.js 18/20/22 matrix testing
- Apache 2.0 license

### Security
- All credentials parameterized via environment variables
- No hardcoded API keys, tokens, phone numbers, or personal paths in source
- Row-Level Security (RLS) enforced on all user-facing database tables
- Comprehensive .gitignore covering secrets, build artifacts, and IDE files
