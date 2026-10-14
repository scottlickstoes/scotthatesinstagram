# Instagram Public Stories API (hosted starter)

Deployable REST wrapper that accepts an Instagram username and calls a third-party public-story data provider. It does **not** scrape Instagram directly or bypass private-account restrictions.

## Important constraints

- The official Instagram Graph API is primarily for professional accounts that authorize your app; it is not a general endpoint for fetching any arbitrary public username's Stories.
- This starter uses the ProfileQuery provider adapter documented at `https://api.profilequery.com/v1/profile/stories?handle=USERNAME`.
- You need your own provider API key and may need a paid plan/credits. Review the provider's current terms, pricing, data retention, and allowed uses before deploying.
- Stories are ephemeral and are normally only available while live. A public profile may have no active Stories. Do not expect access to private accounts or story viewer lists.
- Provider response shapes and availability can change. Check the provider docs if the response shape differs.

## API

### `GET /health`

Public liveness check.

### `GET /v1/stories/:username`

Requires your API key in the `Authorization` header:

```bash
curl "https://YOUR-HOST/v1/stories/nike" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Username can be a plain handle or an `@handle` (URL-encoded `@` is okay). The API responds with JSON:

```json
{
  "username": "nike",
  "fetched_at": "2026-10-14T17:00:00.000Z",
  "count": 1,
  "stories": [
    {
      "id": "provider-specific-story-id",
      "type": "photo",
      "taken_at": "2026-10-14T16:45:00Z",
      "image_url": "https://provider-media-url"
    }
  ],
  "provider": "profilequery"
}
```

The story object above is illustrative; actual fields are whatever the provider returns.

Error codes include `unauthorized`, `invalid_username`, `profile_not_found_or_unavailable`, `provider_rate_limited`, `provider_quota_exceeded`, `provider_timeout`, and `provider_unavailable`.

## Configure locally

Requirements: Node.js 20+.

```bash
npm install
cp .env.example .env
```

Set `API_KEY` to a long random secret and `STORY_PROVIDER_API_KEY` to your provider-issued key. Then run:

```bash
npm start
```

Test:

```bash
curl http://localhost:3000/health
curl "http://localhost:3000/v1/stories/nike" \
  -H "Authorization: Bearer replace-with-your-api-key"
```

## Deploy to Render

1. Put this project in a GitHub repository (do not commit `.env`).
2. In Render, create a **New Web Service** and connect the repository. Render detects the `Dockerfile`.
3. Set the environment variables in Render's Environment page:
   - `API_KEY`: generate a long random secret.
   - `STORY_PROVIDER_API_KEY`: paste your provider key.
   - `STORY_PROVIDER_BASE_URL`: `https://api.profilequery.com`
   - `STORY_PROVIDER_TIMEOUT_MS`: `15000`
4. Deploy. Render provides an HTTPS URL. Test `/health`, then `/v1/stories/nike`.
5. Keep API and provider keys secret; rotate them if exposed.

`render.yaml` is included as a Blueprint starting point. The `sync: false` provider key must be supplied in the dashboard.

## Deploy with Docker anywhere

```bash
docker build -t instagram-public-stories-api .
docker run --rm -p 3000:3000 \
  -e API_KEY='replace-with-a-long-random-secret' \
  -e STORY_PROVIDER_API_KEY='your-provider-key' \
  -e STORY_PROVIDER_BASE_URL='https://api.profilequery.com' \
  instagram-public-stories-api
```

## Production hardening

- Put it behind HTTPS (Render does this automatically).
- Use a high-entropy API key and rotate it; use a secret manager.
- The app has basic per-IP rate limiting (60 requests/minute) and does not log provider payloads or tokens.
- Add per-customer keys, usage quotas, billing, and monitoring before offering it as a public SaaS.
- Consider a short, configurable cache to reduce provider charges, with clear awareness that Stories expire.
- Respect provider contracts, Instagram terms, copyright, privacy, and applicable laws.
