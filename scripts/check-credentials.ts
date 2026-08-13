/**
 * Live connectivity check for every external service the app depends on.
 *
 * Format validation (does this look like a token?) is not the same as working
 * credentials (is the Redis token still valid? does the blob store accept a
 * write?). This hits each service for real, cheaply and non-destructively:
 *
 *   - Vercel Blob:  writes a small object under diagnostics/, reads it back,
 *                    deletes it. Self-cleaning.
 *   - Upstash Redis: SET/GET/DEL on a diagnostic key. Self-cleaning.
 *   - kie.ai:        calls recordInfo with a deliberately bogus taskId.
 *                    A "task not found"-style error means the API key itself
 *                    authenticated. This does NOT create a task, so it costs
 *                    nothing — unlike scripts/preview-smoke.ts.
 *
 *   node --env-file=.env.local scripts/check-credentials.ts
 */

import { put, del } from "@vercel/blob";

let failures = 0;
function report(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "[x]" : "[!]"} ${name} — ${detail}`);
  if (!ok) failures++;
}

async function checkBlob() {
  const path = `diagnostics/check-${Date.now()}.txt`;
  try {
    const { url } = await put(path, "credential check", {
      access: "public",
      contentType: "text/plain",
      addRandomSuffix: false,
    });
    const res = await fetch(url);
    const text = await res.text();
    await del(url);
    report("Vercel Blob", text === "credential check", "wrote, read back, and deleted a test object");
  } catch (err) {
    report("Vercel Blob", false, err instanceof Error ? err.message : String(err));
  }
}

async function checkUpstash() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    report("Upstash Redis", false, "env vars missing");
    return;
  }
  const key = `diagnostics:check:${Date.now()}`;
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const setRes = await fetch(`${url}/set/${encodeURIComponent(key)}/ok`, { headers });
    if (!setRes.ok) throw new Error(`SET failed: HTTP ${setRes.status}`);
    const getRes = await fetch(`${url}/get/${encodeURIComponent(key)}`, { headers });
    const getBody = (await getRes.json()) as { result?: string };
    await fetch(`${url}/del/${encodeURIComponent(key)}`, { headers });
    report("Upstash Redis", getBody.result === "ok", "wrote, read back, and deleted a test key");
  } catch (err) {
    report("Upstash Redis", false, err instanceof Error ? err.message : String(err));
  }
}

async function checkKieAi() {
  const key = process.env.KIE_API_KEY;
  if (!key) {
    report("kie.ai", false, "KIE_API_KEY missing");
    return;
  }
  try {
    // A bogus taskId costs nothing — this only proves the key authenticates.
    const res = await fetch(
      "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=credential-check-does-not-exist",
      { headers: { Authorization: `Bearer ${key}` } },
    );
    const body = (await res.json()) as { code?: number; msg?: string };
    if (res.status === 401 || body.code === 401) {
      report("kie.ai", false, "401 Unauthorized — the API key itself is invalid");
      return;
    }
    // Any other response (including a "not found" style error for the bogus
    // taskId) means the key authenticated fine.
    report("kie.ai", true, `key authenticates (server responded: ${body.msg ?? res.status})`);
  } catch (err) {
    report("kie.ai", false, err instanceof Error ? err.message : String(err));
  }
}

console.log("Checking live connectivity for all three services...\n");
await Promise.all([checkBlob(), checkUpstash(), checkKieAi()]);

console.log(failures === 0 ? "\nAll services reachable." : `\n${failures} service(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
