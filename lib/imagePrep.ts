/**
 * Client-side image preparation. Runs before anything is uploaded.
 *
 * Two jobs:
 *  1. Shrink a 12MP phone photo to something sane to upload over 4G.
 *  2. Lock the geometry to 3:4 portrait.
 *
 * (2) is load-bearing. We send `aspect_ratio: "3:4"` to the model, so the
 * returned image has exactly the same proportions as what we sent. That is what
 * lets the before/after slider wipe between them without any drift — if the two
 * images disagreed by even a few percent, the seam would visibly jump.
 */

export const TARGET_ASPECT = 3 / 4; // width / height, portrait
export const MAX_LONG_EDGE = 1280;
export const JPEG_QUALITY = 0.86;

export type PreparedImage = {
  /** `data:image/jpeg;base64,...` — what we POST and what we render. */
  dataUrl: string;
  width: number;
  height: number;
  /** Encoded byte length, for the size guard. */
  bytes: number;
};

/**
 * `imageOrientation: "from-image"` makes the browser apply the EXIF rotation
 * itself. Without it, portrait photos from iPhones arrive sideways and the face
 * detector finds nothing. Safari only shipped this in 16.4, so we fall back to
 * an <img> element, which has always applied orientation on decode.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall through
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = url;
    });
    return img;
  } finally {
    // The bitmap is already rasterised into the <img>; revoking now is safe.
    URL.revokeObjectURL(url);
  }
}

function sizeOf(src: ImageBitmap | HTMLImageElement) {
  return src instanceof HTMLImageElement
    ? { w: src.naturalWidth, h: src.naturalHeight }
    : { w: src.width, h: src.height };
}

/**
 * Centre-crop to 3:4, then scale so the long edge is at most MAX_LONG_EDGE.
 *
 * The crop is horizontally centred but biased to the UPPER portion of the
 * frame vertically (1/3 rather than 1/2). People hold the phone at chest height
 * and end up centred low; an even crop tends to slice the top of the head while
 * keeping a lot of neck. Faces sit better with the bias.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const src = await decode(file);
  const { w: sw, h: sh } = sizeOf(src);
  if (!sw || !sh) throw new Error("That image looks empty. Try another photo.");

  const srcAspect = sw / sh;
  let cropW: number;
  let cropH: number;
  if (srcAspect > TARGET_ASPECT) {
    // Too wide (landscape or squarish): trim the sides.
    cropH = sh;
    cropW = Math.round(sh * TARGET_ASPECT);
  } else {
    // Too tall: trim top and bottom.
    cropW = sw;
    cropH = Math.round(sw / TARGET_ASPECT);
  }
  const cropX = Math.round((sw - cropW) / 2);
  const cropY = Math.round((sh - cropH) / 3);

  const outH = Math.min(MAX_LONG_EDGE, cropH);
  const outW = Math.round(outH * TARGET_ASPECT);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Your browser could not process that photo.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

  if (src instanceof ImageBitmap) src.close();

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return {
    dataUrl,
    width: outW,
    height: outH,
    bytes: Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75),
  };
}

/** Pixels for analysis, from an already-prepared data URL. */
export async function toImageData(dataUrl: string): Promise<ImageData> {
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctx) throw new Error("Your browser could not process that photo.");
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
