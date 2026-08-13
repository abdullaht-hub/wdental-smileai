import "server-only";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

/**
 * Stateless job handle.
 *
 * The status route needs to know two things: which kie.ai task to poll, and
 * which blob to delete afterwards. Keeping that server-side would mean a
 * database, purely to hold a record for ~30 seconds — and a database holding
 * rows that point at photographs of people's faces is exactly what this app is
 * trying not to have.
 *
 * Instead the pair travels to the client inside a signed token. It is opaque
 * and tamper-evident: without the secret you cannot forge one, so you cannot
 * poll someone else's job and you cannot aim the delete at an arbitrary blob.
 * Nothing is stored anywhere.
 */

export type JobPayload = {
  /** kie.ai task id. */
  t: string;
  /** Vercel Blob pathname to delete on completion. */
  b: string;
  /** Expiry, epoch seconds. */
  exp: number;
  /** Nonce — keeps two identical jobs from producing the same token. */
  n: string;
};

const TTL_SECONDS = 15 * 60;

function secret(): Buffer {
  const s = process.env.PREVIEW_SIGNING_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "PREVIEW_SIGNING_SECRET must be set to at least 32 characters.",
    );
  }
  return Buffer.from(s, "utf8");
}

const b64url = (b: Buffer) => b.toString("base64url");

function sign(payloadB64: string): string {
  return createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

export function createJobToken(taskId: string, blobPathname: string): string {
  const payload: JobPayload = {
    t: taskId,
    b: blobPathname,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    n: randomUUID(),
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${sign(body)}`;
}

/** Returns null for anything malformed, mis-signed or expired — never throws. */
export function readJobToken(token: string): JobPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1), "base64url");

  let expected: Buffer;
  try {
    expected = Buffer.from(sign(body), "base64url");
  } catch {
    return null;
  }
  // Length check first: timingSafeEqual throws on a length mismatch.
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as JobPayload;
    if (!payload?.t || !payload?.b || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    // The blob pathname is used in a delete call — constrain it to the prefix
    // this app writes, so a valid-but-stale token can never reach anything else.
    if (!payload.b.startsWith("previews/")) return null;
    return payload;
  } catch {
    return null;
  }
}
