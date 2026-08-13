import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { storePhoto, deletePhoto } from "@/lib/blob";
import { createEditTask, KieError } from "@/lib/kie";
import { createJobToken } from "@/lib/jobToken";
import { checkPreviewLimit, clientIp } from "@/lib/rateLimit";
import { getLocation } from "@/lib/locations";
import { PROMPT_VERSION } from "@/lib/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** ~8 MB of base64 ≈ 6 MB of JPEG. The client sends far less; this is a guard. */
const MAX_BODY_CHARS = 8_000_000;

const Body = z.object({
  image: z.string().startsWith("data:image/jpeg;base64,").max(MAX_BODY_CHARS),
  locationSlug: z.string().min(1).max(64),
});

export async function POST(req: Request) {
  const limit = await checkPreviewLimit(clientIp(req.headers));
  if (!limit.ok) {
    return NextResponse.json(
      {
        error:
          "You've made a few previews already. Please try again a little later, or pop in and see us.",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "That photo could not be read." }, { status: 400 });
  }

  if (!getLocation(parsed.locationSlug)) {
    return NextResponse.json({ error: "Unknown location." }, { status: 400 });
  }

  // --- Normalise before anything is written anywhere -----------------------
  // .rotate() with no argument applies the EXIF orientation, and sharp's
  // pipeline drops all other metadata by default. That is what strips the GPS
  // coordinates embedded in every phone photo. It happens BEFORE the upload, so
  // the location data never reaches storage at all.
  let jpeg: Buffer;
  try {
    jpeg = await sharp(Buffer.from(parsed.image.split(",")[1], "base64"), {
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize(960, 1280, { fit: "cover", position: "attention" })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.error("[preview/start] decode failed:", err);
    return NextResponse.json(
      { error: "We couldn't read that image. Please take another photo." },
      { status: 400 },
    );
  }

  let stored: Awaited<ReturnType<typeof storePhoto>> | null = null;
  try {
    stored = await storePhoto(jpeg);
    const taskId = await createEditTask(stored.url);

    console.info(
      `[preview/start] task=${taskId} location=${parsed.locationSlug} prompt=${PROMPT_VERSION}`,
    );

    return NextResponse.json({ job: createJobToken(taskId, stored.pathname) });
  } catch (err) {
    // The blob exists but nothing will ever read it — remove it now rather than
    // waiting on the sweeper.
    if (stored) await deletePhoto(stored.pathname);

    console.error("[preview/start] failed:", err);
    const retryable = err instanceof KieError ? err.retryable : true;
    return NextResponse.json(
      {
        error: retryable
          ? "We couldn't create your preview just now. Please try again in a moment."
          : "We couldn't create your preview. Please try a different photo.",
      },
      { status: retryable ? 503 : 400 },
    );
  }
}
