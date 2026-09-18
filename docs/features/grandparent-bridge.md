# 💛 Grandparent Bridge

> Three questions on WhatsApp, and a homeschooling parent gets a short, warm one-pager in Urdu and English she can forward to the relative who keeps asking why her child isn't in school.

## What it is

Extended-family pressure is one of the named reasons families give up home education — a mother
re-argues her decision at every gathering, and the existing "homeschool misconceptions" articles are
one-size-fits-all and answer nobody's actual relative. This gives her something concrete to send
instead: her mother-in-law's *specific* objection, honoured rather than rebutted, with what the family
is really going on (including where the evidence is weak), ending with one concrete invitation —
"come sit in on Tuesday's reading time."

It is deliberately not an argument. The voice register is Rumi's Sparks register: warm, "we", zero
judgment, and the relative is assumed to be coming from care.

## How it works

1. **Trigger** — `/bridge` starts it. The softer keywords ("in-laws", "relatives", "grandparents",
   "saas", "family doesn't support") only *offer* it, at most once a day, because a parent mentioning
   her in-laws is often just venting. Detector:
   [bot/shared/handlers/grandparent-bridge-trigger.js](../../bot/shared/handlers/grandparent-bridge-trigger.js),
   wired into [bot/shared/handlers/text-message.handler.js](../../bot/shared/handlers/text-message.handler.js).
2. **Three questions** — why she teaches at home · the child's age · the one objection she keeps
   hearing (a numbered list of eight, or her own words). This is a **chat conversation, not a Meta
   Flow**: state lives in Redis keyed by user id, the same way
   [attendance-conversation.service.js](../../bot/shared/services/attendance-conversation.service.js)
   works and for the same reason
   [messaging/text-flow-definitions.js](../../bot/shared/services/messaging/text-flow-definitions.js)
   exists — a Flow needs a registered `*_FLOW_ID` a fresh clone doesn't have, and three questions
   don't earn one. There is no Flow to register and nothing to publish.
3. **Match** — the answer is matched to one of eight objection types in the curated library at
   [bot/shared/data/grandparent-bridge-evidence.json](../../bot/shared/data/grandparent-bridge-evidence.json):
   objection, warm reassurance and invitation in both languages, plus the **only** claims the product
   is allowed to make about it — each with a source and the research sweep's own evidence-quality flag.
4. **Compose** — [bot/shared/services/grandparent-bridge.service.js](../../bot/shared/services/grandparent-bridge.service.js)
   builds a prompt containing the matched objection's evidence *and nothing else from the library*,
   and sends it through [bot/shared/services/llm-client.js](../../bot/shared/services/llm-client.js).
   Output is capped at 180 words per language. If the LLM is unreachable, unparseable, or drops a
   language, a deterministic template assembles the same page straight from the library — so the
   parent always gets something sendable.
5. **Deliver** — both languages as text first (that is the whole product), then the same note as a
   one-page bilingual PDF rendered through the existing
   [bot/shared/utils/html-to-pdf.js](../../bot/shared/utils/html-to-pdf.js) Playwright engine and
   [bot/shared/templates/grandparent-bridge.template.js](../../bot/shared/templates/grandparent-bridge.template.js)
   — the same pipeline the quiz and reading reports use, chosen because Chromium's text shaping is
   what renders Nastaliq correctly.

## What the parent experiences

`/bridge` → three quick questions → "Writing it now — one moment." → the note in English and Urdu she
can forward as-is, plus a tidy one-page PDF if the deployment can render one.

## Enable it

**Core — no API key needed.** The text one-pager works on any deployment (`OPENROUTER_API_KEY` gives
it the LLM polish; without it the deterministic template still produces both languages).

The **PDF** is the one gated part, and it is gated on a *binary* rather than a key: the HTML→PDF
engine needs a Chromium install (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, `PUPPETEER_EXECUTABLE_PATH`,
or `/usr/bin/chromium`). No Chromium → the parent gets the text and no PDF is promised. Gate:
`GrandparentBridgeService.isPdfAvailable()` → `isPdfEngineAvailable()` in `html-to-pdf.js`.

## Data

`bridge_onepagers` — one row per one-pager: `phone_hash`, `objection_type`, `language`,
`delivered_pdf`, `created_at` (see
[infrastructure/supabase/00_complete-schema.sql](../../infrastructure/supabase/00_complete-schema.sql)).
The phone number is stored **only** as a sha256 hash and the note itself is never stored: the row
exists to answer "which objections do families actually face, and did the PDF arrive?", and the
disclosure behind it ("my in-laws think this is neglect") is the most sensitive thing this product
handles.

## Before you launch this to real families

- **`ur_reviewed` is `false`.** The Urdu in the evidence library is written in spoken register, not
  machine-translated — but no fluent reviewer has signed it off yet. Have one read every `*_ur` line
  aloud, then flip the flag.
- **The talking points are not validated on Pakistani grandparents.** The research sweep's verbatim
  grandparent objections are US-Reddit-sourced; Pakistan's own file documents only that social stigma
  makes families quit. Test with 2-3 real families before wide release.
- **Every claim carries an honesty flag, and the page uses them.** Where the evidence is mixed
  (socialisation outcomes, parent capability) the one-pager says so. Do not "improve" it into a page
  of confident statistics — a relative who can disprove one line stops reading the rest.

## Related

- [Lesson Plans](lesson-plans.md) — the sibling "answer a few questions, get a document" path (that
  one goes through Gamma, gated on `GAMMA_API_KEY`; this one does not).
- [Quiz](quiz.md) · [Reading Assessment](reading-assessment.md) — the other consumers of the same
  HTML→PDF report pipeline.
