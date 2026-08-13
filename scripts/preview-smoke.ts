/**
 * Prompt tuning harness.
 *
 * Runs real photographs through the real pipeline and writes the results to
 * disk so they can be reviewed side by side. This is how the prompt gets tuned
 * — NOT by wiring the UI up and eyeballing one photo at a time.
 *
 *   1. Put 10–15 varied smile photos in  scratch/samples/
 *      Vary them deliberately: skin tones, ages, indoor and outdoor light,
 *      existing gaps/chips/staining, and at least one already-tidy smile.
 *   2. node --env-file=.env.local scripts/preview-smoke.ts
 *   3. Open scratch/output/ and compare each -before.jpg with its -after.jpg.
 *
 * Reject the prompt and revise lib/prompt.ts if ANY output:
 *   - changes who the person looks like,
 *   - whitens teeth beyond one shade,
 *   - produces identical, uniform teeth (that is veneers, not bonding),
 *   - alters lips, jaw, skin or eyes,
 *   - shifts the lighting or framing so the edit is visible as a patch.
 *
 * Deliberately self-contained rather than importing lib/kie.ts: that module is
 * marked `server-only`, which throws outside a Next.js server bundle. The
 * prompt is imported from the real source so this always tests what ships.
 *
 * Costs real money — roughly $0.02 per sample per run.
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import sharp from "sharp";
import { put, del } from "@vercel/blob";
import { buildPrompt, PROMPT_VERSION } from "../lib/prompt.ts";

const SAMPLES = "scratch/samples";
const OUTPUT = "scratch/output";
const API = "https://api.kie.ai/api/v1/jobs";
const MODEL = process.env.KIE_MODEL_ID || "google/nano-banana-edit";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Use --env-file=.env.local`);
  return v;
}

async function createTask(imageUrl: string): Promise<string> {
  const res = await fetch(`${API}/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${need("KIE_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: {
        prompt: buildPrompt(),
        image_urls: [imageUrl],
        output_format: "jpeg",
        aspect_ratio: "3:4",
      },
    }),
  });
  const body = (await res.json()) as { code?: number; msg?: string; data?: { taskId?: string } };
  if (body.code !== 200 || !body.data?.taskId) {
    throw new Error(`createTask failed: ${body.msg ?? res.status}`);
  }
  return body.data.taskId;
}

async function waitForTask(taskId: string): Promise<string> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${API}/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${need("KIE_API_KEY")}` },
    });
    const body = (await res.json()) as {
      data?: { state?: string; resultJson?: string; failMsg?: string };
    };
    const state = body.data?.state;
    if (state === "success") {
      const urls = JSON.parse(body.data?.resultJson || "{}").resultUrls as string[] | undefined;
      if (!urls?.length) throw new Error("success but no resultUrls");
      return urls[0];
    }
    if (state === "fail") throw new Error(`task failed: ${body.data?.failMsg}`);
    process.stdout.write(".");
  }
  throw new Error("timed out");
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });

  let files: string[];
  try {
    files = (await readdir(SAMPLES)).filter((f) =>
      [".jpg", ".jpeg", ".png", ".webp"].includes(extname(f).toLowerCase()),
    );
  } catch {
    console.error(`No ${SAMPLES}/ directory. Create it and add sample photos.`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error(`${SAMPLES}/ is empty. Add 10-15 varied smile photos.`);
    process.exit(1);
  }

  console.log(`Prompt ${PROMPT_VERSION} · model ${MODEL} · ${files.length} sample(s)`);
  console.log(`Estimated cost: ~$${(files.length * 0.02).toFixed(2)}\n`);

  let ok = 0;
  for (const file of files) {
    const name = basename(file, extname(file));
    process.stdout.write(`${name} `);

    let uploaded: { url: string; pathname: string } | null = null;
    try {
      // Identical normalisation to app/api/preview/start/route.ts.
      const jpeg = await sharp(await readFile(join(SAMPLES, file)))
        .rotate()
        .resize(960, 1280, { fit: "cover", position: "attention" })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();

      await writeFile(join(OUTPUT, `${name}-before.jpg`), jpeg);

      uploaded = await put(`previews/smoke-${name}-${Date.now()}.jpg`, jpeg, {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: true,
      });

      const resultUrl = await waitForTask(await createTask(uploaded.url));
      const bytes = Buffer.from(await (await fetch(resultUrl)).arrayBuffer());
      await writeFile(join(OUTPUT, `${name}-after.jpg`), bytes);

      console.log(" ok");
      ok++;
    } catch (err) {
      console.log(` FAILED: ${err instanceof Error ? err.message : err}`);
    } finally {
      // Same discipline as production: the upload does not outlive the job.
      if (uploaded) await del(uploaded.pathname).catch(() => {});
    }
  }

  console.log(`\n${ok}/${files.length} succeeded. Review ${OUTPUT}/ before shipping.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
