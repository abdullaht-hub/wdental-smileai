import { NextResponse } from "next/server";
import { sweepStalePhotos, SWEEP_AGE_MS } from "@/lib/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Backstop deletion, invoked on a schedule by an external HTTP cron
 * (cron-job.org or similar) — NOT Vercel Cron. Vercel's Hobby plan only allows
 * daily cron schedules, which is too coarse a backstop window for a photo of
 * someone's face; a free external scheduler can hit this endpoint every
 * ~10 minutes instead. See README.md "Orphan sweep" for setup.
 *
 * /api/preview/status deletes the photo the moment a job finishes, so in the
 * normal case this finds nothing. It exists for the case that route never runs:
 * the phone loses signal mid-generation, the tab is closed, the browser is
 * killed. Without it, every abandoned session leaves a photograph of somebody's
 * face sitting in blob storage indefinitely.
 *
 * A non-zero `deleted` count is worth alerting on — it means sessions are being
 * abandoned, which is a UX signal as much as a privacy one.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[sweep] CRON_SECRET not configured — refusing to run.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  // The external scheduler is configured to send this header; see README.
  if (req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { deleted, scanned } = await sweepStalePhotos();
    if (deleted > 0) {
      console.warn(
        `[sweep] deleted ${deleted} orphaned photo(s) older than ${SWEEP_AGE_MS / 60000}m ` +
          `(scanned ${scanned}) — these were abandoned mid-generation.`,
      );
    }
    return NextResponse.json({ deleted, scanned });
  } catch (err) {
    console.error("[sweep] failed:", err);
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }
}
