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

/** Per-IP hourly ceiling. Loose on purpose — see getLimiters(). */
const PER_IP_HOURLY = 10;
/** Per-clinic daily ceiling ≈ $3/day of kie.ai credit at ~$0.02 a preview. */
const PER_LOCATION_DAILY = 150;

type Limiters = { perIp: Ratelimit; perLocation: Ratelimit } | null;

/**
 * Built on first use rather than at import. `Redis.fromEnv()` throws on a
 * malformed URL, and module scope is evaluated during `next build` while it
 * collects page data — so constructing it eagerly turns a bad env var into a
 * failed deployment of the entire site, which is the opposite of the
 * degrade-open behaviour promised above. Deferring it keeps a misconfigured
 * Redis a rate-limiting problem instead of an outage.
 */
let limiters: Limiters = null;
let initialized = false;

function getLimiters(): Limiters {
  if (initialized) return limiters;
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
    const redis = Redis.fromEnv();
    limiters = {
      // Per-IP: stops one person looping the button. Deliberately generous,
      // because every phone on the clinic's guest WiFi shares a single NAT
      // address, and UK mobile carriers CGNAT on top of that. A tight per-IP
      // limit locks out the waiting room, not the abuser.
      perIp: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(PER_IP_HOURLY, "1 h"),
        prefix: "wd:preview:ip",
        analytics: false,
      }),
      // Per-location daily cap: this is the real spend guard. It is what the
      // per-IP limit used to be pretending to be.
      perLocation: new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(PER_LOCATION_DAILY, "24 h"),
        prefix: "wd:preview:loc",
        analytics: false,
      }),
    };
  } catch (err) {
    // Almost always a malformed URL or token — commonly the surrounding quotes
    // from a .env file pasted into the Vercel dashboard verbatim.
    console.error(
      "[rateLimit] Upstash is configured but unusable — /api/preview/start is UNPROTECTED:",
      err,
    );
    limiters = null;
  }
  return limiters;
}

export type LimitResult = { ok: boolean; retryAfterSeconds: number };

const ALLOW: LimitResult = { ok: true, retryAfterSeconds: 0 };

async function run(rl: Ratelimit, key: string): Promise<LimitResult> {
  try {
    const { success, reset } = await rl.limit(key);
    return {
      ok: success,
      retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
    };
  } catch (err) {
    // Upstash blip mid-request. Fail open: the guard in getLimiters() covers a
    // misconfigured Redis, but without this an Upstash outage 500s every scan
    // in the clinic, which is a worse failure than an unmetered hour.
    console.error("[rateLimit] check failed, allowing through:", err);
    return ALLOW;
  }
}

export async function checkIpLimit(ip: string): Promise<LimitResult> {
  const l = getLimiters();
  return l ? run(l.perIp, ip) : ALLOW;
}

export async function checkLocationBudget(slug: string): Promise<LimitResult> {
  const l = getLimiters();
  return l ? run(l.perLocation, slug) : ALLOW;
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
