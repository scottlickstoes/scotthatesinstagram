import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "16kb" }));

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.API_KEY;
const PROVIDER_KEY = process.env.STORY_PROVIDER_API_KEY;
const PROVIDER_BASE = (process.env.STORY_PROVIDER_BASE_URL || "https://api.profilequery.com").replace(/\/+$/, "");
const TIMEOUT_MS = Math.max(1000, Number(process.env.STORY_PROVIDER_TIMEOUT_MS || 15000));

if (!API_KEY || !PROVIDER_KEY) {
  console.error("Missing API_KEY or STORY_PROVIDER_API_KEY. Configure environment variables before starting.");
  process.exit(1);
}

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many requests. Try again shortly." } }
});
app.use(limiter);

function authenticate(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token !== API_KEY) {
    return res.status(401).json({
      error: { code: "unauthorized", message: "Send your API key as Authorization: Bearer YOUR_API_KEY." }
    });
  }
  next();
}

function cleanUsername(raw) {
  let username = String(raw || "").trim();
  username = username.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
  username = username.replace(/^@/, "").replace(/\/.*$/, "");
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(username)) return null;
  return username;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "instagram-public-stories-api" });
});

app.get("/v1/stories/:username", authenticate, async (req, res) => {
  const username = cleanUsername(req.params.username);
  if (!username) {
    return res.status(400).json({
      error: { code: "invalid_username", message: "Provide an Instagram username (letters, numbers, periods, underscores; max 30 characters)." }
    });
  }

  const upstreamUrl = new URL(`${PROVIDER_BASE}/v1/profile/stories`);
  upstreamUrl.searchParams.set("handle", username);

  let upstream;
  let payload;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${PROVIDER_KEY}`
      },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    payload = await upstream.json().catch(() => null);
  } catch (error) {
    const timeout = error?.name === "TimeoutError";
    return res.status(timeout ? 504 : 502).json({
      error: {
        code: timeout ? "provider_timeout" : "provider_unavailable",
        message: timeout ? "The story provider timed out." : "Could not reach the story provider."
      }
    });
  }

  if (!upstream.ok) {
    // Do not leak upstream details, credentials, or raw provider payloads to clients.
    const status = [400, 401, 402, 403, 404, 429].includes(upstream.status) ? upstream.status : 502;
    const code = upstream.status === 404 ? "profile_not_found_or_unavailable"
      : upstream.status === 429 ? "provider_rate_limited"
      : upstream.status === 402 ? "provider_quota_exceeded"
      : upstream.status === 401 || upstream.status === 403 ? "provider_auth_error"
      : "provider_request_failed";
    return res.status(status).json({
      error: {
        code,
        message: status === 404
          ? "No public story data was returned for this username; the profile may be private, unavailable, or have no active stories."
          : status === 402
          ? "The story provider reports that the account quota or credits are exhausted."
          : status === 429
          ? "The story provider is rate-limiting requests. Retry later."
          : "The story provider could not complete the request."
      }
    });
  }

  // ProfileQuery documents stories under data.items. Preserve provider fields
  // to avoid silently dropping fields the provider may add.
  const data = payload?.data ?? {};
  const stories = Array.isArray(data.items) ? data.items : Array.isArray(payload?.items) ? payload.items : [];

  res.set("Cache-Control", "no-store");
  return res.json({
    username,
    fetched_at: new Date().toISOString(),
    count: stories.length,
    stories,
    provider: "profilequery"
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "Route not found." } });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on port ${PORT}`);
});
