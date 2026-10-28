# components — Landing-site sections and chat-bubble demo widgets (not the signed-in portal)
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=portal/src/components kg=a8f827749229 gen=9faaaf936ac7 overflow=14 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `Hero.tsx` — top landing section; shows the chat-button pattern others copy
- `RealSupport.tsx` — builds FeatureCards from i18n copy, each with a chat-bubble demo
- `LandingChannel.test.tsx` — pins when copy may name WhatsApp
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `icons/` | → (no door; 1 files) |
| `ui/` | shadcn/ui primitives (Radix wrappers) used by landing and portal screens → `ui/CLAUDE.md` |
| `LandingChannel.test.tsx` | Pins that landing copy and chat links name WhatsApp only when GET /api/portal/channels says so (Hero, Nav, CTA) |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `Navigation.tsx` | Landing top bar with logo, section links, LanguageSwitcher and the chat button (useChatChannel) |
| `FinalCTA.tsx` | Closing landing call-to-action; chat link comes from useChatChannel and clicks go to trackCtaClick('footer') |
| `Hero.tsx` | Landing hero with headline and chat button; hides or neutralises WhatsApp wording via useChatChannel |
| `AlwaysThere.tsx` | Landing section showing three 'moments' of support from i18n alwaysThere.moments, each with an illustration |
| … | 7 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `Navigation.tsx` ← imported by `portal/src/pages/HowItWorks.tsx:1:4bc1fefe` · `portal/src/pages/Index.tsx:1:4bc1fefe`
- `AlwaysThere.tsx` ← imported by `portal/src/pages/Index.tsx:5:319f2ee5`
- `FeatureCard.tsx` ← imported by `portal/src/components/RealSupport.tsx:2:a947b5b5`
- `FinalCTA.tsx` ← imported by `portal/src/pages/Index.tsx:9:6d2f4549`
- … 7 more → `CLAUDE.index.md`

## Never (human)
- Never name WhatsApp in copy unless /api/portal/channels says so (src/hooks/useChatChannel.ts:5-12)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `portal/src/components/LandingChannel.test.tsx` (FinalCTA.tsx, Hero.tsx, Navigation.tsx)

## Related (generated)
- docs: `portal/src/CLAUDE.md`? · `portal/src/components/CLAUDE.index.md`? · `portal/src/components/CLAUDE.md`? · `portal/src/components/ui/CLAUDE.index.md`? · `portal/src/components/ui/CLAUDE.md`? · `portal/src/i18n/CLAUDE.md`?
