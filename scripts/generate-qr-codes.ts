/**
 * Generates one scannable QR PNG per configured location, pointing at the
 * live deployment. Not part of the shipped app — a one-off operational tool
 * for producing what actually gets printed and stuck on a wall.
 *
 *   node --env-file=.env.local scripts/generate-qr-codes.ts https://your-domain.vercel.app
 *
 * High error-correction (H) is used deliberately: these get printed, laminated,
 * scuffed, and scanned at odd angles in a bus shelter — cheap paper and glare
 * are the normal case, not the exception.
 */

import QRCode from "qrcode";
import { mkdir } from "node:fs/promises";
import { allLocations } from "../lib/locations.ts";

const base = process.argv[2];
if (!base) {
  console.error("Usage: node --env-file=.env.local scripts/generate-qr-codes.ts <https://your-domain>");
  process.exit(1);
}
const origin = base.replace(/\/+$/, "");

const OUT = "qr-codes";
await mkdir(OUT, { recursive: true });

for (const loc of allLocations()) {
  const url = `${origin}/s/${loc.slug}`;
  const file = `${OUT}/${loc.slug}.png`;
  await QRCode.toFile(file, url, {
    errorCorrectionLevel: "H",
    width: 1200,
    margin: 3,
    color: { dark: "#131313", light: "#FFFFFF" },
  });
  console.log(`${file}  →  ${url}  (${loc.clinic.name} — ${loc.note ?? "no placement note"})`);
}

console.log(`\n${allLocations().length} QR code(s) written to ${OUT}/`);
