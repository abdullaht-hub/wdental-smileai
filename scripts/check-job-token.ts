/**
 * Verifies the job token, which is the only thing standing between a stranger
 * and someone else's preview.
 *
 * The token carries a kie.ai task id and a blob pathname to the client and back
 * again with no server-side record. If it could be forged, an attacker could
 * poll another person's job (reading their generated image) or aim the blob
 * deletion at an arbitrary key. So the signature is load-bearing, and these are
 * the cases that matter.
 *
 *   node --conditions=react-server scripts/check-job-token.ts
 *
 * The --conditions flag resolves the `server-only` marker import to its empty
 * stub, exactly as the Next.js server build does. Because that means the import
 * has to be dynamic (it must run after the env var below is set), this file has
 * no static imports — hence the explicit `export {}` to mark it as a module.
 */
export {};

process.env.PREVIEW_SIGNING_SECRET ||=
  "test-secret-that-is-comfortably-over-32-characters-long";

const { createJobToken, readJobToken } = await import("../lib/jobToken.ts");

let failures = 0;

function check(name: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

const token = createJobToken("task_abc123", "previews/deadbeef.jpg");

console.log("round trip");
const read = readJobToken(token);
check("valid token reads back", read?.t === "task_abc123" && read?.b === "previews/deadbeef.jpg");

console.log("\ntampering");
const [body, sig] = token.split(".");
const forgedBody = Buffer.from(
  JSON.stringify({
    t: "task_someone_elses",
    b: "previews/deadbeef.jpg",
    exp: Math.floor(Date.now() / 1000) + 600,
    n: "x",
  }),
).toString("base64url");
check("swapped payload, original signature", readJobToken(`${forgedBody}.${sig}`) === null);
check("flipped signature byte", readJobToken(`${body}.${sig.slice(0, -1)}A`) === null);
check("signature removed", readJobToken(body) === null);
check("empty string", readJobToken("") === null);
check("garbage", readJobToken("not-a-token") === null);

console.log("\npath confinement");
// A token whose blob pathname points outside previews/ must be refused even
// when correctly signed — the pathname reaches a delete call.
const escapeBody = Buffer.from(
  JSON.stringify({
    t: "task_abc123",
    b: "../important-file",
    exp: Math.floor(Date.now() / 1000) + 600,
    n: "x",
  }),
).toString("base64url");
const { createHmac } = await import("node:crypto");
const escapeSig = createHmac("sha256", process.env.PREVIEW_SIGNING_SECRET!)
  .update(escapeBody)
  .digest("base64url");
check(
  "signed token pointing outside previews/",
  readJobToken(`${escapeBody}.${escapeSig}`) === null,
);

console.log("\nexpiry");
const expiredBody = Buffer.from(
  JSON.stringify({
    t: "task_abc123",
    b: "previews/deadbeef.jpg",
    exp: Math.floor(Date.now() / 1000) - 1,
    n: "x",
  }),
).toString("base64url");
const expiredSig = createHmac("sha256", process.env.PREVIEW_SIGNING_SECRET!)
  .update(expiredBody)
  .digest("base64url");
check("expired token", readJobToken(`${expiredBody}.${expiredSig}`) === null);

console.log("\nuniqueness");
check(
  "two tokens for the same job differ",
  createJobToken("t", "previews/a.jpg") !== createJobToken("t", "previews/a.jpg"),
);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
