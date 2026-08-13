/**
 * Client-side photo quality gate.
 *
 * Runs before a single kie.ai credit is spent, and before the photo is uploaded
 * anywhere. Everything here is plain pixel arithmetic on a canvas — no model,
 * no network, no third-party script running while the user's face is on screen.
 *
 * WHY NO FACE-DETECTION MODEL: the obvious choice was MediaPipe FaceDetector,
 * but its wasm runtime is ~11 MB. The whole point of this app is that somebody
 * standing at a bus stop on 4G scans a code and gets a result in under a minute;
 * an 11 MB blocking download defeats that. The heuristics below catch the
 * failures that actually happen in the field — a blurry shot, a dark shot, a
 * backlit silhouette, a photo of the pavement — at zero download cost.
 *
 * Because prepareImage() locks every photo to 960x1280, these thresholds are
 * absolute rather than resolution-relative. If you change MAX_LONG_EDGE, retune.
 */

import { toImageData } from "./imagePrep";

export type QualityCode =
  | "ok"
  | "blurry"
  | "too_dark"
  | "too_bright"
  | "backlit"
  | "low_contrast"
  | "no_face";

export type QualityResult = {
  code: QualityCode;
  /** Patient-facing headline. Kind, specific, never "invalid image". */
  title: string;
  /** One concrete thing to change. */
  tip: string;
  /** Raw measurements, surfaced in dev for threshold tuning. */
  metrics: Metrics;
};

export type Metrics = {
  sharpness: number;
  meanLuma: number;
  centreLuma: number;
  borderLuma: number;
  contrast: number;
  skinRatio: number;
};

/**
 * Tuned by eye against phone photos in ordinary indoor and street light.
 * These are the knobs to turn during real-device testing — widen before you
 * narrow. A false reject (making someone retake a usable photo) is far more
 * damaging here than a false accept.
 */
export const THRESHOLDS = {
  minSharpness: 55,
  minMeanLuma: 42,
  maxMeanLuma: 216,
  minContrast: 34,
  /** Border brighter than centre by this much reads as a backlit silhouette. */
  maxBacklitDelta: 62,
  /** Fraction of the centre region that must look like skin. */
  minSkinRatio: 0.13,
} as const;

/** Face occupies roughly the middle of the frame after our 3:4 upper-bias crop. */
const CENTRE = { x0: 0.2, x1: 0.8, y0: 0.14, y1: 0.82 };
/** Where the mouth lands when the framing guide is followed. Sharpness is judged here. */
const MOUTH = { x0: 0.28, x1: 0.72, y0: 0.42, y1: 0.86 };

type Rect = { x0: number; x1: number; y0: number; y1: number };

function px(r: Rect, w: number, h: number) {
  return {
    x0: Math.floor(r.x0 * w),
    x1: Math.ceil(r.x1 * w),
    y0: Math.floor(r.y0 * h),
    y1: Math.ceil(r.y1 * h),
  };
}

/** Rec. 601 luma, which is what perceptual brightness judgements want. */
function lumaPlane(d: ImageData): Float32Array {
  const { data, width, height } = d;
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; p < out.length; p++, i += 4) {
    out[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return out;
}

/**
 * Variance of the Laplacian — the standard sharpness proxy. A sharp edge
 * produces a large second derivative; a soft one produces almost nothing, so
 * an out-of-focus image has a tightly clustered (low variance) response.
 *
 * Measured over the mouth region specifically. A very common failure is a photo
 * where the background is crisp and the face is soft — the phone focused past
 * the subject. A whole-frame measurement scores that as perfectly sharp.
 */
function sharpnessOf(luma: Float32Array, w: number, h: number, rect: Rect): number {
  const r = px(rect, w, h);
  const x0 = Math.max(1, r.x0);
  const x1 = Math.min(w - 1, r.x1);
  const y0 = Math.max(1, r.y0);
  const y1 = Math.min(h - 1, r.y1);

  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * w;
    for (let x = x0; x < x1; x++) {
      const i = row + x;
      const lap =
        luma[i - 1] + luma[i + 1] + luma[i - w] + luma[i + w] - 4 * luma[i];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function meanOf(luma: Float32Array, w: number, h: number, rect: Rect): number {
  const r = px(rect, w, h);
  let sum = 0;
  let n = 0;
  for (let y = r.y0; y < r.y1; y++) {
    const row = y * w;
    for (let x = r.x0; x < r.x1; x++) {
      sum += luma[row + x];
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** Everything outside the centre rect — used to spot a bright window behind them. */
function borderMean(luma: Float32Array, w: number, h: number): number {
  const c = px(CENTRE, w, h);
  let sum = 0;
  let n = 0;
  for (let y = 0; y < h; y += 2) {
    const row = y * w;
    const inRowBand = y >= c.y0 && y < c.y1;
    for (let x = 0; x < w; x += 2) {
      if (inRowBand && x >= c.x0 && x < c.x1) continue;
      sum += luma[row + x];
      n++;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Spread between the 5th and 95th percentile luma. Catches flat, hazy,
 * low-information photos (a finger over the lens, heavy fog on the camera)
 * that the mean-brightness check waves through.
 */
function contrastOf(luma: Float32Array): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < luma.length; i += 3) hist[luma[i] | 0]++;
  let total = 0;
  for (let i = 0; i < 256; i++) total += hist[i];
  const lowTarget = total * 0.05;
  const highTarget = total * 0.95;
  let acc = 0;
  let p5 = 0;
  let p95 = 255;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= lowTarget) {
      p5 = i;
      break;
    }
  }
  acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= highTarget) {
      p95 = i;
      break;
    }
  }
  return p95 - p5;
}

/**
 * Proportion of the centre region reading as skin, in YCbCr.
 *
 * Chrominance is used rather than RGB because Cb/Cr cluster in much the same
 * place across the full range of human skin tones — it is luminance that
 * varies, and luminance is exactly what we discard here. This is a coarse
 * "is there a person in frame" check, not a face detector: it is here to catch
 * a photo of the pavement, a bag, or a ceiling, and it is deliberately lenient.
 */
function skinRatioOf(d: ImageData, rect: Rect): number {
  const { data, width, height } = d;
  const r = px(rect, width, height);
  let skin = 0;
  let n = 0;
  for (let y = r.y0; y < r.y1; y += 2) {
    for (let x = r.x0; x < r.x1; x += 2) {
      const i = (y * width + x) * 4;
      const R = data[i];
      const G = data[i + 1];
      const B = data[i + 2];
      const Y = 0.299 * R + 0.587 * G + 0.114 * B;
      const Cb = 128 - 0.168736 * R - 0.331264 * G + 0.5 * B;
      const Cr = 128 + 0.5 * R - 0.418688 * G - 0.081312 * B;
      if (Y > 50 && Cb >= 74 && Cb <= 132 && Cr >= 130 && Cr <= 178) skin++;
      n++;
    }
  }
  return n ? skin / n : 0;
}

export function measure(image: ImageData): Metrics {
  const { width: w, height: h } = image;
  const luma = lumaPlane(image);
  return {
    sharpness: sharpnessOf(luma, w, h, MOUTH),
    meanLuma: meanOf(luma, w, h, { x0: 0, x1: 1, y0: 0, y1: 1 }),
    centreLuma: meanOf(luma, w, h, CENTRE),
    borderLuma: borderMean(luma, w, h),
    contrast: contrastOf(luma),
    skinRatio: skinRatioOf(image, CENTRE),
  };
}

/**
 * Order matters. The most actionable problem wins, so somebody in a dark room
 * is told to find better light rather than being told their photo is blurry —
 * which it also is, because of the low light, but which they cannot fix
 * directly. Brightness first, then framing, then focus.
 */
export function judge(m: Metrics): QualityResult {
  const base = { metrics: m };

  if (m.meanLuma < THRESHOLDS.minMeanLuma) {
    return {
      ...base,
      code: "too_dark",
      title: "It's a little too dark",
      tip: "Try facing a window, or step somewhere brighter — daylight works best.",
    };
  }
  if (m.meanLuma > THRESHOLDS.maxMeanLuma) {
    return {
      ...base,
      code: "too_bright",
      title: "That one came out very bright",
      tip: "Move out of direct sunlight or turn the flash off, then try again.",
    };
  }
  if (m.borderLuma - m.centreLuma > THRESHOLDS.maxBacklitDelta) {
    return {
      ...base,
      code: "backlit",
      title: "The light is behind you",
      tip: "Turn around so the light is on your face rather than at your back.",
    };
  }
  if (m.contrast < THRESHOLDS.minContrast) {
    return {
      ...base,
      code: "low_contrast",
      title: "That photo looks a bit hazy",
      tip: "Give the camera lens a quick wipe and take another one.",
    };
  }
  if (m.skinRatio < THRESHOLDS.minSkinRatio) {
    return {
      ...base,
      code: "no_face",
      title: "We couldn't find a smile in that one",
      tip: "Hold the phone at arm's length with your face filling most of the frame.",
    };
  }
  if (m.sharpness < THRESHOLDS.minSharpness) {
    return {
      ...base,
      code: "blurry",
      title: "That came out slightly blurry",
      tip: "Hold still, tap the screen to focus on your mouth, and take it again.",
    };
  }

  return {
    ...base,
    code: "ok",
    title: "Looks great",
    tip: "",
  };
}

export async function checkImage(dataUrl: string): Promise<QualityResult> {
  return judge(measure(await toImageData(dataUrl)));
}
