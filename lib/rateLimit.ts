import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Protects the kie.ai credit balance. Every /api/preview/start call costs the
 * clinic real money, and the endpoint is reachable by anyone who scans a poster,
 * so it is trivially abusable without this.
 *
 * Degrades open when Upstash is not configured — local development should not
 * require a Redis account. Production absence is logged loudly rather than
 * silently ignored, because "no rate limiting in production" is a billing
 * incident waiting to happen.
 */

/**
 * Built on first use rather than at import. `Redis.fromEnv()` throws on a
 * malformed URL, and module scope is evaluated during `next build` while it
 * collects page data — so constructing it eagerly turns a bad env var into a
 * failed deployment of the entire site, which is the opposite of the
 * degrade-open behaviour promised above. Deferring it keeps a misconfigured
 * Redis a rate-limiting problem instead of an outage.
 */
let limiter: Ratelimit | null = null;
let initialized = false;

function getLimiter(): Ratelimit | null {
  if (initialized) return limiter;
  initialized = true;

  const configured =
    !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[rateLimit] UPSTASH_REDIS_REST_* not set — /api/preview/start is UNPROTECTED.",
      );
    }
    return null;
  }

  try {
    limiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      prefix: "wd:preview",
      analytics: false,
    });
  } catch (err) {
    // Almost always a malformed URL or token — commonly the surrounding quotes
    // from a .env file pasted into the Vercel dashboard verbatim.
    console.error(
      "[rateLimit] Upstash is configured but unusable — /api/preview/start is UNPROTECTED:",
      err,
    );
    limiter = null;
  }
  return limiter;
}

export type LimitResult = { ok: boolean; retryAfterSeconds: number };

export async function checkPreviewLimit(ip: string): Promise<LimitResult> {
  const rl = getLimiter();
  if (!rl) return { ok: true, retryAfterSeconds: 0 };
  const { success, reset } = await rl.limit(ip);
  return {
    ok: success,
    retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
  };
}

/**
 * Vercel populates x-forwarded-for; the leftmost entry is the client. Falls
 * back to a shared bucket rather than to a per-request unique value, so a
 * missing header cannot be used to bypass the limit entirely.
 */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
