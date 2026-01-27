# Cost Guide

Estimated monthly costs by tier, based on moderate usage (50-100 teachers, ~500 messages/day).

## Tier 1: Minimal (~$15/month)

| Service | Cost | Notes |
|---------|------|-------|
| OpenRouter (GPT-4o) | ~$10 | ~500 msgs/day at ~200 tokens each |
| Supabase | Free | Free tier covers this usage |
| Railway | ~$5 | Hobby plan |
| Redis (Railway) | Free | Included in Railway |
| **Total** | **~$15** | |

## Tier 2: Recommended (~$50/month)

| Service | Cost | Notes |
|---------|------|-------|
| OpenRouter | ~$15 | More tokens for coaching analysis |
| Soniox | ~$25 | Audio transcription |
| Supabase | Free | |
| Railway | ~$10 | More compute for workers |
| **Total** | **~$50** | |

## Tier 3: Full (~$200+/month)

| Service | Cost | Notes |
|---------|------|-------|
| OpenRouter | ~$25 | |
| Soniox | ~$25 | |
| ElevenLabs | ~$50 | Voice generation |
| Azure Speech | ~$25 | Pronunciation assessment |
| Gamma | ~$50 | Lesson plan generation |
| Supabase | Free-$25 | May need Pro for storage |
| Railway | ~$20 | Multiple workers |
| **Total** | **~$200+** | |

## Cost Optimization Tips

1. Use `openai/gpt-4o-mini` instead of `gpt-4o` for non-critical responses
2. Cache frequent queries in Redis
3. Use Railway's sleep feature for low-traffic periods
4. Start with Minimal tier and upgrade as needed
