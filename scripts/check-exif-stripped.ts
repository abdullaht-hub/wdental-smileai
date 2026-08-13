/**
 * Verifies the metadata claim made on /privacy:
 *
 *   "Location data embedded by your camera is removed on our server before the
 *    image is stored anywhere."
 *
 * Phone photos carry GPS coordinates in EXIF. If those survived into blob
 * storage, the app would be publishing the precise location of a person along
 * with a photograph of their face — a considerably worse leak than the photo
 * on its own.
 *
 * Builds a JPEG with GPS and orientation tags, runs it through the exact
 * pipeline from app/api/preview/start/route.ts, and asserts the tags are gone.
 *
 *   node scripts/check-exif-stripped.ts
 *
 * Needs no credentials. Worth running in CI.
 */

import sharp from "sharp";

const FAKE_GPS = {
  IFD0: {
    Make: "Apple",
    Model: "iPhone 15 Pro",
    Orientation: "6",
  },
  IFD3: {
    GPSLatitudeRef: "N",
    GPSLatitude: "51/1 26/1 3204/100",
    GPSLongitudeRef: "W",
    GPSLongitude: "0/1 19/1 5580/100",
  },
} as const;

const withMetadata = await sharp({
  create: {
    width: 1200,
    height: 1600,
    channels: 3,
    background: { r: 210, g: 175, b: 155 },
  },
})
  .jpeg()
  .withExif(FAKE_GPS as never)
  .toBuffer();

const before = await sharp(withMetadata).metadata();
if (!before.exif) {
  console.error(
    "SETUP FAILED — the test fixture has no EXIF, so this proves nothing.",
  );
  process.exit(1);
}
console.log(`fixture: ${before.exif.byteLength} bytes of EXIF embedded`);

// Exactly the pipeline from app/api/preview/start/route.ts. Keep in sync.
const processed = await sharp(withMetadata, { limitInputPixels: 40_000_000 })
  .rotate()
  .resize(960, 1280, { fit: "cover", position: "attention" })
  .jpeg({ quality: 88, mozjpeg: true })
  .toBuffer();

const after = await sharp(processed).metadata();

const problems: string[] = [];
if (after.exif) problems.push(`EXIF survived (${after.exif.byteLength} bytes)`);
if (after.icc) problems.push("ICC profile survived");
if (after.xmp) problems.push("XMP survived");
if (after.iptc) problems.push("IPTC survived");
if (after.width !== 960 || after.height !== 1280) {
  problems.push(`geometry is ${after.width}x${after.height}, expected 960x1280`);
}

if (problems.length) {
  console.error("\nFAIL:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `PASS — no EXIF/ICC/XMP/IPTC in the processed image, geometry locked to ` +
    `${after.width}x${after.height}. No GPS reaches blob storage.`,
);
