# 📝 Registration

![Registration](../images/features/registration.jpg)

> Onboarding that gets out of the way — Rumi learns who the teacher is without making them fill a form before they get value.

## What it is

The front door. Rumi keeps onboarding light: a new teacher can start using a feature immediately, and Rumi simply asks **what to call them** once they've completed their first feature — then creates their profile. Deployments that want a richer intake can also register a full WhatsApp **registration Flow** (name, school, grade, language) and Rumi will use that instead.

## How it works

1. **A new number messages Rumi** and is welcomed.
2. **The teacher uses a feature** (asks a question, requests a lesson plan, …) right away.
3. **Rumi asks for their name** after that first interaction and stores the profile (and a portal token).
4. **Optional richer intake:** if a `REGISTRATION_FLOW_ID` is configured, Rumi sends a native WhatsApp form collecting school, grade, and language up front instead.

## What the teacher experiences

No wall of questions up front — they get help first, then a single friendly "what should I call you?" Everything after that (language, grade-appropriate content, coaching framework) keys off their profile.

## Enable it

_Always on_ — core. To use the richer form-based onboarding, register the registration Flow during setup (`register-all-flows`); its ID lands in `REGISTRATION_FLOW_ID`.

## Customize

Change the fields, pre-fill from your own roster, or adjust the welcome — see the [registration flow JSON](../../bot/docs/flows/) and the [Agent Customization Guide](../agent-customization.md).
