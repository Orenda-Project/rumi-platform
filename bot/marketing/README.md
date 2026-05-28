# `bot/marketing/` — brand assets

This directory holds **optional brand assets** the bot uses to make messages
feel polished: a loading sticker, a "registration successful" sticker, a
welcome video, and a transparent logo for PDF/HTML reports. Every consumer
treats the assets as optional — the bot runs (and every feature works) with
this directory empty. Add files here to make the bot look like your brand.

## Assets the code looks for

| Path | Used by | What it is | If missing |
|------|---------|------------|------------|
| `loading-sticker.webp` | `WhatsAppService.sendSticker` (called from text/voice handlers) | WebP sticker shown while a long-running feature is processing. Square, ≤ 100 KB, 512×512. | The sticker send is skipped silently. The feature still completes. |
| `Rumi White.jpg` | `PDFReportService` (coaching reports) + `ReadingReportService` | Brand logo embedded in the top-left of generated PDF reports. PNG or JPG, ~200×80 px. | Reports render without a logo (the surrounding header text is unchanged). |
| `Rumi Transparent.png` | `observation-report.template.js` (the HTML observation report) | Transparent-background logo embedded as base64 in the HTML report. | Report renders without the logo image. |

## How to customize

1. Drop your own files at the paths above. The filenames are matched
   literally, so use the exact names from the table.
2. For the loading sticker, you can ALSO set `LOADING_STICKER_MEDIA_ID` in
   `.env` to a pre-uploaded Meta media ID — that path bypasses the file
   upload entirely (cheaper, faster).
3. Run the bot. The new assets are picked up on next request; no restart
   needed for the PDF logos, restart once for the loading sticker.

## Why this directory is empty by default

The original production deployment shipped a specific brand identity (the
Rumi smile mark, the cartoon teacher loading sticker). Those are
trademarked artwork and aren't appropriate to bundle with a generic
open-source release. So the directory ships with this README and nothing
else — every code path that reads from here is `existsSync`-guarded and
degrades gracefully when the file isn't present.

Locked by `tests/setup/asset-references.test.js`.
