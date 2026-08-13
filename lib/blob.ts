import "server-only";
import { put, del, list } from "@vercel/blob";
import { randomUUID } from "node:crypto";

/**
 * Ephemeral holding area for the patient's photo.
 *
 * The photo has to be fetchable over HTTP for exactly as long as it takes
 * kie.ai to pull it — that is the only reason it leaves memory at all. It lives
 * under an unguessable key and is deleted the instant the job reaches a
 * terminal state.
 *
 * Deletion happens in three places, deliberately overlapping:
 *   1. /api/preview/status, on success or failure  — the normal path.
 *   2. /api/preview/start, if createTask throws     — nothing to wait for.
 *   3. /api/cron/sweep-blobs, for anything older than SWEEP_AGE_MS — the
 *      backstop for a phone that went into a tunnel mid-generation.
 *
 * (3) is not optional. Without it, every abandoned session leaks a face.
 */

export const BLOB_PREFIX = "previews/";
export const SWEEP_AGE_MS = 15 * 60 * 1000;

export type StoredPhoto = { url: string; pathname: string };

export async function storePhoto(bytes: Buffer): Promise<StoredPhoto> {
  const { url, pathname } = await put(`${BLOB_PREFIX}${randomUUID()}.jpg`, bytes, {
    access: "public",
    contentType: "image/jpeg",
    // Unguessable is the entire access-control model here, so keep the suffix.
    addRandomSuffix: true,
    // Never let a CDN or intermediary hold a copy.
    cacheControlMaxAge: 0,
  });
  return { url, pathname };
}

/**
 * Never throws. Deletion runs on the failure path too, and a delete error must
 * not mask the original error or turn a successful preview into a 500 — the
 * sweeper will catch anything this misses.
 */
export async function deletePhoto(pathnameOrUrl: string): Promise<void> {
  try {
    await del(pathnameOrUrl);
  } catch (err) {
    console.error("[blob] delete failed, leaving for sweeper:", pathnameOrUrl, err);
  }
}

export async function sweepStalePhotos(): Promise<{ deleted: number; scanned: number }> {
  const cutoff = Date.now() - SWEEP_AGE_MS;
  let cursor: string | undefined;
  let deleted = 0;
  let scanned = 0;

  do {
    const page = await list({ prefix: BLOB_PREFIX, cursor, limit: 1000 });
    const stale = page.blobs.filter((b) => new Date(b.uploadedAt).getTime() < cutoff);
    scanned += page.blobs.length;
    if (stale.length) {
      await del(stale.map((b) => b.url));
      deleted += stale.length;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return { deleted, scanned };
}
