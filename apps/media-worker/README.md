# NaijasPride Media Worker (R2)

Cloudflare Worker that serves objects from R2 with:

- CORS enabled (HLS.js friendly)
- Range request support (video seeking)
- Cache-Control tuned for HLS manifests vs segments

## Setup

1. Install Wrangler (one-time):

   `npm i -g wrangler`

2. Edit `apps/media-worker/wrangler.toml`:

   - Set `account_id`
   - Confirm `bucket_name`
   - Optionally configure `routes` for `media.naijaspride.com/*`

3. Deploy:

   `wrangler deploy`

## API integration

Once `media.naijaspride.com` is serving your R2 bucket, set the API env var:

- `STORAGE_PUBLIC_BASE_URL="https://media.naijaspride.com"`

This makes `/api/v1/movies/download?key=...` redirect to stable public URLs.
