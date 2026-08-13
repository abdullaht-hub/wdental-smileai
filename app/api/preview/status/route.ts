import { NextResponse } from "next/server";
import { deletePhoto } from "@/lib/blob";
import { getTask, fetchResultBytes, KieError } from "@/lib/kie";
import { readJobToken } from "@/lib/jobToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Polled by the client every couple of seconds while the model works.
 *
 * On reaching a terminal state this route does three things in a fixed order:
 *   1. pulls the finished image into memory,
 *   2. deletes the patient's uploaded photo from blob storage,
 *   3. returns the result inline as a data URI.
 *
 * Step 2 runs in a `finally` so it happens on the failure path too. Step 3
 * returns bytes rather than the kie.ai URL on purpose: that URL stays live for
 * roughly 24 hours, and handing it to the browser would leave a publicly
 * reachable copy of someone's face on a third-party host well after they have
 * walked away. The response is the only copy, and it lives in a React state
 * variable until the tab closes.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("job");
  if (!token) {
    return NextResponse.json({ error: "Missing job." }, { status: 400 });
  }

  const job = readJobToken(token);
  if (!job) {
    // Covers forged, tampered and expired tokens alike — deliberately one
    // message, so the response reveals nothing about which.
    return NextResponse.json(
      { state: "fail", error: "This preview session has expired. Please start again." },
      { status: 410 },
    );
  }

  let task;
  try {
    task = await getTask(job.t);
  } catch (err) {
    console.error("[preview/status] poll failed:", err);
    // A transient poll failure is not terminal: keep the blob and let the
    // client try again. The sweeper handles it if the client gives up.
    const retryable = err instanceof KieError ? err.retryable : true;
    if (retryable) return NextResponse.json({ state: "generating" });

    await deletePhoto(job.b);
    return NextResponse.json(
      { state: "fail", error: "Something went wrong creating your preview." },
      { status: 502 },
    );
  }

  if (task.state !== "success" && task.state !== "fail") {
    return NextResponse.json({ state: task.state, progress: task.progress ?? null });
  }

  try {
    if (task.state === "fail" || task.resultUrls.length === 0) {
      console.error(
        `[preview/status] task=${job.t} failed code=${task.failCode} msg=${task.failMsg}`,
      );
      return NextResponse.json({
        state: "fail",
        error:
          "We couldn't create a preview from that photo. Trying another one usually works.",
      });
    }

    const bytes = await fetchResultBytes(task.resultUrls[0]);
    return NextResponse.json({
      state: "success",
      image: `data:image/jpeg;base64,${bytes.toString("base64")}`,
    });
  } catch (err) {
    console.error("[preview/status] result fetch failed:", err);
    return NextResponse.json({
      state: "fail",
      error: "We created your preview but couldn't load it. Please try again.",
    });
  } finally {
    // Terminal state reached, whatever the outcome: the patient's photo has no
    // further purpose. This is the primary deletion point.
    await deletePhoto(job.b);
  }
}
