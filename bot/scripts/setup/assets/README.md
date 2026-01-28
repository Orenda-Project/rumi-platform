# Template Assets

WhatsApp Message Templates require media assets (images, videos) that are uploaded to Meta's CDN. When setting up your own instance, you need to provide your own assets.

## Required Assets

### `video_style_selection` Template

| Asset | Type | Dimensions | Format |
|-------|------|-----------|--------|
| Header image | Image | 800x418px (recommended) | JPEG or PNG |

This template shows users a selection of video styles. The header image appears at the top of the template message.

### `feature_menu_carousel_v3` Template

| Asset | Type | Dimensions | Format |
|-------|------|-----------|--------|
| Card 1 video | Video | 640x640px (square) | MP4, max 16MB |
| Card 2 video | Video | 640x640px (square) | MP4, max 16MB |
| Card 3 video | Video | 640x640px (square) | MP4, max 16MB |

This is a carousel template. Each card has a short video demonstrating a feature.

## Providing Your Assets

### Option A: Self-Hosted URL (Recommended)

Host your assets at a publicly accessible URL and pass `--asset-base-url` to the setup script:

```bash
node bot/scripts/setup/run-full-setup.js \
  --asset-base-url=https://your-domain.com/assets \
  ...
```

Expected URL structure:
```
{asset-base-url}/video-style-header.jpg
{asset-base-url}/feature-card-1.mp4
{asset-base-url}/feature-card-2.mp4
{asset-base-url}/feature-card-3.mp4
```

### Option B: Direct Upload

The registration script uploads assets directly to Meta's Resumable Upload API. Place your files in this directory:

```
bot/scripts/setup/assets/
  video-style-header.jpg
  feature-card-1.mp4
  feature-card-2.mp4
  feature-card-3.mp4
```

### Option C: Skip Templates

Templates are optional. If you don't provide assets, the bot falls back to interactive list messages instead of carousel templates. All features work without templates.

## Meta Review

After template submission, Meta reviews templates for policy compliance. This typically takes 1-24 hours. Template status can be:

- **APPROVED**: Ready to use
- **PENDING**: Under review (bot uses fallback lists)
- **REJECTED**: Violates policy (check Meta's rejection reason)

Check template status in [Meta Business Manager > WhatsApp > Message Templates](https://business.facebook.com/).
