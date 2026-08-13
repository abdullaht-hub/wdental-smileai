/**
 * "Save to my phone" — entirely client-side.
 *
 * Since v1 has no email or SMS delivery, this is the only way a preview leaves
 * the session, and it does so without touching a server: the image is already
 * in the page, so we just re-encode it and hand it to the browser's download
 * mechanism. Nothing is uploaded, nothing is stored, no new privacy surface.
 *
 * The disclaimer is burned into the saved file on purpose. A saved preview is
 * going to end up in a camera roll and quite possibly in a WhatsApp thread,
 * detached from this page and everything it said. The caveat has to travel with
 * the pixels or it does not travel at all.
 */

const BAR_RATIO = 0.11;

export async function saveResultImage(
  afterSrc: string,
  filename = "w-dental-smile-preview.jpg",
): Promise<void> {
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not prepare the image."));
    img.src = afterSrc;
  });

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const bar = Math.round(h * BAR_RATIO);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h + bar;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not prepare the image.");

  ctx.fillStyle = "#FAF6EF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, w, h);

  // Caption bar, sized relative to the image so it renders the same whatever
  // the source resolution.
  const pad = Math.round(w * 0.045);
  const title = Math.round(bar * 0.3);
  const sub = Math.round(bar * 0.21);

  ctx.fillStyle = "#131313";
  ctx.font = `600 ${title}px "DM Sans", system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText("Simulated preview — W Dental", pad, h + Math.round(bar * 0.22));

  ctx.fillStyle = "#5A5A5A";
  ctx.font = `400 ${sub}px "DM Sans", system-ui, sans-serif`;
  ctx.fillText(
    "AI simulation, not a guarantee of results.",
    pad,
    h + Math.round(bar * 0.62),
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("Could not prepare the image.");

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Give the download a tick to start before the URL is invalidated.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
