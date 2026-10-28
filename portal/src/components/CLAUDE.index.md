# components — full index (generated)

<!-- kg:index repo=rumi-platform dir=portal/src/components -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `icons/` | → (no door; 1 files) |
| `ui/` | shadcn/ui primitives (Radix wrappers) used by landing and portal screens → `ui/CLAUDE.md` |
| `AlwaysThere.tsx` | Landing section showing three 'moments' of support from i18n alwaysThere.moments, each with an illustration |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `FeatureCard.tsx` | Flip card for one landing feature: front text and bullets, back an animated WhatsAppChat; used by RealSupport |
| `FinalCTA.tsx` | Closing landing call-to-action; chat link comes from useChatChannel and clicks go to trackCtaClick('footer') |
| `GlobalTeachers.tsx` | Landing section about the global teacher community, with illustration and i18n text |
| `Hero.tsx` | Landing hero with headline and chat button; hides or neutralises WhatsApp wording via useChatChannel |
| `LandingChannel.test.tsx` | Pins that landing copy and chat links name WhatsApp only when GET /api/portal/channels says so (Hero, Nav, CTA) |
| `LanguageSwitcher.tsx` | Dropdown to switch the landing site between English, Spanish, Urdu and Arabic via i18n.changeLanguage |
| `LonelyTruth.tsx` | Landing section stating the isolation problem teachers face, from i18n lonelyTruth keys |
| `Navigation.tsx` | Landing top bar with logo, section links, LanguageSwitcher and the chat button (useChatChannel) |
| `RealSupport.tsx` | Landing features section: builds five FeatureCards from i18n realSupport.features with icons |
| `TheDifference.tsx` | Landing section of three paragraphs on how Rumi differs, from i18n theDifference keys |
| `WhatsAppChat.tsx` | Animated fake WhatsApp conversation (text, voice, file bubbles) revealed message by message inside FeatureCard |

## Who reads this (all, generated)
- `AlwaysThere.tsx` ← imported by `portal/src/pages/Index.tsx:5:319f2ee5`
- `FeatureCard.tsx` ← imported by `portal/src/components/RealSupport.tsx:2:a947b5b5`
- `FinalCTA.tsx` ← imported by `portal/src/pages/Index.tsx:9:6d2f4549`
- `GlobalTeachers.tsx` ← imported by `portal/src/pages/Index.tsx:8:8f07da05`
- `Hero.tsx` ← imported by `portal/src/pages/Index.tsx:2:5f7d7f26`
- `LanguageSwitcher.tsx` ← imported by `portal/src/components/Navigation.tsx:8:cd2d85dc`
- `LonelyTruth.tsx` ← imported by `portal/src/pages/Index.tsx:4:4959f25b`
- `Navigation.tsx` ← imported by `portal/src/pages/HowItWorks.tsx:1:4bc1fefe` · `portal/src/pages/Index.tsx:1:4bc1fefe`
- `RealSupport.tsx` ← imported by `portal/src/pages/Index.tsx:6:edc8b108`
- `TheDifference.tsx` ← imported by `portal/src/pages/Index.tsx:7:96790b50`
- `WhatsAppChat.tsx` ← imported by `portal/src/components/FeatureCard.tsx:3:0fc25cb7`

## Tests (all, generated)
- `FinalCTA.tsx` ← `portal/src/components/LandingChannel.test.tsx`
- `Hero.tsx` ← `portal/src/components/LandingChannel.test.tsx`
- `Navigation.tsx` ← `portal/src/components/LandingChannel.test.tsx`

## Related (all, generated)
- docs: `portal/src/CLAUDE.md`? · `portal/src/components/CLAUDE.index.md`? · `portal/src/components/CLAUDE.md`? · `portal/src/components/ui/CLAUDE.index.md`? · `portal/src/components/ui/CLAUDE.md`? · `portal/src/i18n/CLAUDE.md`?
