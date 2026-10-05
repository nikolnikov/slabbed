# Slabbbed!

Track your PSA graded (and raw) sports cards, keep a wishlist, and share either with other collectors.

Runs as a Cloudflare Worker: the React app is served as static assets, and `/api/*` is handled by
[worker/index.ts](worker/index.ts), backed by D1 (data) and R2 (card photos).

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars   # then fill in SESSION_SECRET and the eBay keys
npm run db:migrate               # create tables in the local D1 database
npm run build                    # wrangler dev serves ./dist, so build once first
npm run dev:api                  # Worker + local D1/R2 on :8787
npm run dev                      # Vite on :5173, proxies /api to the Worker
```

## Deploying

One-time setup:

```sh
npx wrangler d1 create slabbed-db       # copy the database_id into wrangler.jsonc
npx wrangler r2 bucket create slabbbed-images
npm run db:migrate:remote
npx wrangler secret put SESSION_SECRET  # any long random string, e.g. `openssl rand -hex 32`
npx wrangler secret put EBAY_CLIENT_ID      # production keyset from developer.ebay.com
npx wrangler secret put EBAY_CLIENT_SECRET
```

Then `npm run deploy`.

## How scanning works

**Scan card** takes a front photo (and optionally the back) and does two things at once:

- The photos go to the Worker (`/api/identify`), where a Workers AI vision model reads the player,
  year, set, card number, variety, sport, grade and cert number.
- On-device, the `barcode-detector` ponyfill (ZXing) looks for a PSA QR code or label barcode in
  the photos. A code is exact, so its cert number replaces the one the AI read off the label.

PSA no longer offers API access, so nothing is looked up by cert number. **Enter manually** opens a
blank form instead. The ZXing WASM build is fetched from jsDelivr the first time it's used.

## Finding photos

Cards without a photo can get one from eBay listings: "Find a photo" in the card details, or
"Find a photo online" in the card form (while it has no front photo). The Worker searches the eBay Browse API
(`/api/photo-search`) so the keys never reach the browser, and the chosen photo is pulled through
`/api/remote-image`, re-encoded as WebP and stored in R2 like any other photo.
