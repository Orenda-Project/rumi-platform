# hooks — Shared React hooks: chat-channel lookup, toasts, funnel tracking, mobile check

<!-- kg:meta repo=rumi-platform dir=portal/src/hooks kg=16363674e3da gen=be414a4656a7 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `useChatChannel.ts` — asks the dashboard which chat channel this deployment runs
- `use-toast.ts` — toast store behind the toaster
- `useFunnelTracking.ts` — landing page visit event
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `use-toast.ts` | Reducer-backed toast store and useToast/toast API (limit 1); portal pages call it to show errors |
| `useChatChannel.ts` | Fetches GET /api/portal/channels so pages name WhatsApp and link a chat only when the bot answers there |
| `use-mobile.tsx` | useIsMobile hook: true under 768px viewport width, used by the sidebar primitive |
| `useFunnelTracking.ts` | useTrackPageVisit hook: sends one visit event on mount; called by the landing Index page |
| `CLAUDE.md` | (unmapped) |

## Who reads this (generated)
- `use-toast.ts` ← imported by `portal/src/components/ui/toaster.tsx:1:687d908e` · `portal/src/portal/pages/PortalCoaching.tsx:11:bf8ab455` (+11)
- `useChatChannel.ts` ← imported by `portal/src/components/FinalCTA.tsx:5:54d1118f` · `portal/src/components/Hero.tsx:6:54d1118f` (+7)
- `use-mobile.tsx` ← imported by `portal/src/components/ui/sidebar.tsx:6:0a197eed`
- `useFunnelTracking.ts` ← imported by `portal/src/pages/Index.tsx:10:05abea4b`

## Never (human)
- useChatChannel must fall back to neutral (no WhatsApp, no link) on any failure (src/hooks/useChatChannel.ts:36, 42)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `portal/src/CLAUDE.md`? · `portal/src/hooks/CLAUDE.md`?
