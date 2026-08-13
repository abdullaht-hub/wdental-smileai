/**
 * Live connectivity check for every external service the app depends on.
 *
 * Format validation (does this look like a token?) is not the same as working
 * credentials (is the Sheets API enabled? is the sheet actually shared with
 * the service account? is the Redis token still valid?). This hits each
 * service for real, cheaply and non-destructively:
 *
 *   - Vercel Blob:  writes a small object under diagnostics/, reads it back,
 *                    deletes it. Self-cleaning.
 *   - Google Sheets: read-only spreadsheets.get call — confirms the ID is
 *                    right, the service account can see it, and a "Leads"
 *                    tab exists. Writes nothing.
 *   - Upstash Redis: SET/GET/DEL on a diagnostic key. Self-cleaning.
 *   - kie.ai:        calls recordInfo with a deliberately bogus taskId.
 *                    A "task not found"-style error means the API key itself
 *                    authenticated. This does NOT create a task, so it costs
 *                    nothing — unlike scripts/preview-smoke.ts.
 *
 *   node --env-file=.env.local scripts/check-credentials.ts
 */

import { put, del } from "@vercel/blob";
import { JWT } from "google-auth-library";

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

async function checkSheets() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!email || !rawKey || !spreadsheetId) {
    report("Google Sheets", false, "one or more env vars missing");
    return;
  }
  try {
    const client = new JWT({
      email,
      key: rawKey.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("could not obtain an access token — check the private key");

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status} — ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      properties?: { title?: string };
      sheets?: { properties?: { title?: string } }[];
    };
    const tabs = (data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean);
    const hasLeadsTab = tabs.includes("Leads");
    report(
      "Google Sheets",
      hasLeadsTab,
      hasLeadsTab
        ? `connected to "${data.properties?.title}", found the Leads tab`
        : `connected to "${data.properties?.title}", but no tab named exactly "Leads" ` +
          `(found: ${tabs.join(", ") || "none"}) — rename a tab to "Leads"`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const hint = msg.includes("403")
      ? " — the sheet likely isn't shared with the service account email as Editor"
      : msg.includes("404")
        ? " — SHEETS_SPREADSHEET_ID looks wrong"
        : "";
    report("Google Sheets", false, msg + hint);
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

console.log("Checking live connectivity for all four services...\n");
await Promise.all([checkBlob(), checkSheets(), checkUpstash(), checkKieAi()]);

console.log(failures === 0 ? "\nAll services reachable." : `\n${failures} service(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
