/**
 * Acceptance test for the deletion promise.
 *
 * The app tells every patient their photo is deleted the moment the preview
 * appears. This script is how that claim is verified rather than assumed —
 * it lists the blob prefix the app writes to and reports anything still there.
 *
 *   node --env-file=.env.local scripts/check-blob-empty.ts
 *
 * Run it:
 *   - immediately after a successful preview          -> expect 0
 *   - after a forced failure (bad KIE_API_KEY)        -> expect 0
 *   - after killing the tab mid-generation            -> expect 1, then 0
 *     once the sweeper has run (or after invoking it manually)
 *
 * Anything older than 15 minutes is a leak: the sweeper should have taken it.
 */

import { list } from "@vercel/blob";
import { BLOB_PREFIX, SWEEP_AGE_MS } from "../lib/blob.ts";

const blobs: { pathname: string; uploadedAt: Date; size: number }[] = [];
let cursor: string | undefined;

do {
  const page = await list({ prefix: BLOB_PREFIX, cursor, limit: 1000 });
  blobs.push(...page.blobs);
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);

if (blobs.length === 0) {
  console.log(`PASS — nothing under "${BLOB_PREFIX}". No patient photos are stored.`);
  process.exit(0);
}

const now = Date.now();
let leaked = 0;

console.log(`${blobs.length} object(s) still present under "${BLOB_PREFIX}":\n`);
for (const b of blobs) {
  const ageMs = now - new Date(b.uploadedAt).getTime();
  const ageMin = (ageMs / 60000).toFixed(1);
  const stale = ageMs > SWEEP_AGE_MS;
  if (stale) leaked++;
  console.log(
    `  ${stale ? "LEAK " : "fresh"}  ${b.pathname}  ${ageMin}m old  ${(b.size / 1024).toFixed(0)}kB`,
  );
}

if (leaked > 0) {
  console.error(
    `\nFAIL — ${leaked} object(s) older than the ${SWEEP_AGE_MS / 60000}m sweep window.` +
      `\nThe cron sweeper is not running, or it is failing. Check /api/cron/sweep-blobs.`,
  );
  process.exit(1);
}

console.log(
  `\nOK — all objects are inside the ${SWEEP_AGE_MS / 60000}m window (in-flight jobs).` +
    `\nRe-run once they have finished; the count should reach zero.`,
);
