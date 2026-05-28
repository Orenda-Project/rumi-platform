# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Rumi, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Preferred channel: open a private report via [GitHub Security Advisories](https://github.com/Orenda-Project/rumi-platform/security/advisories/new). The maintainer team is notified automatically.

Forks: replace this section with your own intake (private email or your fork's GitHub Security Advisories tab) before publishing this repository to a user-facing audience.

Include:
- Description of the vulnerability
- Steps to reproduce
- Affected versions or components
- Any potential impact assessment

## Response Timeline

- **Acknowledgment**: within 48 hours
- **Initial assessment**: within 5 business days
- **Fix timeline**: depends on severity, typically within 30 days for critical issues

## Scope

The following are in scope:
- `bot/` — WhatsApp bot application code
- `infrastructure/supabase/` — database schema and RLS policies
- `.env.template` — environment variable handling
- Authentication and authorization flows
- Data handling and storage

The following are out of scope:
- Third-party services (Supabase, Railway, OpenRouter, WhatsApp Cloud API)
- Issues requiring physical access to infrastructure
- Social engineering attacks

## Safe Harbor

We consider security research conducted in good faith to be authorized. We will not pursue legal action against researchers who:

- Make a good faith effort to avoid privacy violations, data destruction, or service disruption
- Only interact with accounts they own or with explicit permission
- Report vulnerabilities promptly and do not exploit them beyond what is necessary to demonstrate the issue

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release | Yes |
| Previous major | Best effort |

## Security Practices

This project follows these security practices:
- No credentials committed to the repository (enforced by CI and gitleaks)
- Environment variables for all secrets (`.env.template` documents required keys)
- Supabase Row Level Security on all tables
- Input validation on webhook endpoints
- Rate limiting on API routes
