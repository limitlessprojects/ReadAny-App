# ReadAny Feedback Worker

Cloudflare Worker for creating GitHub Issues from in-app feedback.

## Setup

1. Create a fine-grained GitHub token with Issues read/write access for the target repo.
2. Store it as a Worker secret:

```bash
pnpm --filter @readany/feedback-worker secret:token
```

3. Create a KV namespace for server-side rate limiting:

```bash
pnpm dlx wrangler@4 kv namespace create FEEDBACK_RATE_LIMIT
```

Copy the returned namespace id into `wrangler.toml` and uncomment the
`[[kv_namespaces]]` block.

4. Adjust `wrangler.toml` if the repo, allowed origins, or rate limits change.
5. Deploy:

```bash
pnpm --filter @readany/feedback-worker deploy
```

## Client Configuration

Desktop:

```bash
VITE_FEEDBACK_WORKER_URL=https://readany-feedback-worker.<account>.workers.dev
```

Expo:

```bash
EXPO_PUBLIC_FEEDBACK_WORKER_URL=https://readany-feedback-worker.<account>.workers.dev
```

Without these variables, the app keeps using the local mock mode.

## Rate Limits

The app still has local daily limits, but production should also use the Worker
KV limit. Defaults:

- `RATE_LIMIT_SUBMISSIONS_PER_DAY=20`
- `RATE_LIMIT_STATUS_PER_HOUR=120`
