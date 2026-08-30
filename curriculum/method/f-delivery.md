# Stage F — Delivery

> Read before the R2 cutover.

## Stage F — Delivery

Rendered PDFs + audio → R2; `pre_generated_lps` rows hold the keys; WhatsApp Flow browse + pic-to-LP
serve them. Cutover is **data-only** (idempotent upload, verify, smoke-test) — no code deploy. Verify
the live schema (Rule 15) before loading. **Serve in proper curriculum order** — test-generation order
is random and reads as broken.

> **When only Stage A (page-truth) is done for a market**, you can skip the rendered-PDF
> path and serve enriched lessons on demand through the bot's lesson-plan path instead.
> delivery and shim Stage A into the bot's existing `gamma_enriched` on-demand path instead. See
