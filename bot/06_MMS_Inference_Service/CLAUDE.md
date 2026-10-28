# 06_MMS_Inference_Service — Separate Python ASR microservice for Balochi, Sindhi and Pashto speech

<!-- kg:meta repo=rumi-platform dir=bot/06_MMS_Inference_Service kg=8058961c8a80 gen=48a1df8379bb overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `app/main.py` — FastAPI app: /asr, /health, /languages over Meta MMS-1b-all
- `modal_app.py` — serverless GPU variant deployed with Modal, API-key protected
- `railway.json` — Railway deploy settings (Dockerfile build, /health check)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `app/` | → (no door; 1 files) |
| `CLAUDE.md` | (unmapped) |
| `modal_app.py` | Modal.com serverless T4-GPU variant of the MMS ASR service, API-key gated, with a lock around language adapters |
| `railway.json` | Railway deploy config for the MMS service: Dockerfile build, python -m app.main, /health check |
| `Dockerfile` | Builds the FastAPI MMS-ASR container (python 3.11, ffmpeg, libsndfile) for Railway; model downloads at runtime |
| `requirements.txt` | Pins Python deps (fastapi, transformers, torch, librosa) for the MMS inference container |

## Who reads this (generated)
- env read here: `MMS_API_KEY`

## Never (human)
- Never remove the inference lock: one MMS language adapter is active at a time (bot/06_MMS_Inference_Service/modal_app.py:77-79,128)
- The bot always reaches it via MMS_SERVICE_URL (bot/console/pipeline-map.js:68)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/06_MMS_Inference_Service/CLAUDE.md`? · `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`?
