"use client";

import { useRef, useState } from "react";
import { Button } from "./Button";
import type { QualityResult } from "@/lib/imageQuality";

/**
 * Photo capture.
 *
 * Uses a file input with `capture`, NOT getUserMedia. On a phone this hands off
 * to the native camera app, which means: no permission dialog to design around,
 * no viewfinder to build, full sensor resolution, and the user gets the shutter
 * UI they already know. getUserMedia would mean reimplementing all of that,
 * worse, and it behaves inconsistently in iOS in-app browsers — which is
 * exactly where QR scans land.
 *
 * `capture="user"` requests the selfie camera. Android honours it; iOS Safari
 * ignores the value and opens the rear camera with a flip control, which is
 * acceptable. The input is not hidden with `display:none` (some browsers refuse
 * to open it) — it is visually hidden but focusable.
 */
export function CameraCapture({
  onSelect,
  rejection,
  lastCheck,
  busy,
}: {
  onSelect: (file: File) => void;
  /** Set when the previous attempt failed the quality gate. */
  rejection: QualityResult | null;
  /** Most recent measurement, pass or fail. Rendered in dev only, for tuning. */
  lastCheck: QualityResult | null;
  busy: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset immediately: without this, retaking the *same* photo fires no
    // change event and the retry button appears dead.
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file isn't a photo. Please choose an image.");
      return;
    }
    setError(null);
    onSelect(file);
  }

  return (
    <div className="wd-enter">
      <h1 className="text-[28px] leading-[1.15] text-ink">
        {rejection ? rejection.title : "Take a photo of your smile"}
      </h1>
      <p className="mt-2.5 text-[15px] leading-relaxed text-ink-muted">
        {rejection
          ? rejection.tip
          : "A relaxed, natural smile works best — the kind you'd give someone you know."}
      </p>

      <FramingGuide />

      <ul className="mt-6 space-y-2.5">
        <Tip>Hold the phone at arm's length, straight on</Tip>
        <Tip>Smile so your top teeth are showing</Tip>
        <Tip>Find good light — daylight beats indoor lighting</Tip>
      </ul>

      {error && (
        <p className="mt-5 rounded-[10px] bg-white px-4 py-3 text-[14px] text-ink" role="alert">
          {error}
        </p>
      )}

      <div className="mt-7 space-y-3">
        <Button onClick={() => cameraRef.current?.click()} busy={busy}>
          {rejection ? "Take another photo" : "Take a photo"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => galleryRef.current?.click()}
          disabled={busy}
        >
          Choose from my photos
        </Button>
      </div>

      <DevMetrics check={lastCheck} />

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handle}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        onChange={handle}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * Threshold tuning aid, development only.
 *
 * THRESHOLDS in lib/imageQuality.ts were set by eye and the comment there says
 * to retune them on real hardware — this is how. Take photos on an actual phone
 * in actual conditions, read the numbers, and move the limits. Bear in mind a
 * false reject costs the clinic a lead, so widen before narrowing.
 */
function DevMetrics({ check }: { check: QualityResult | null }) {
  if (process.env.NODE_ENV !== "development" || !check) return null;
  const m = check.metrics;
  const row = (k: string, v: number) => (
    <div key={k} className="flex justify-between gap-4">
      <span>{k}</span>
      <span className="tabular-nums">{v.toFixed(1)}</span>
    </div>
  );
  return (
    <div className="mt-5 rounded-[10px] border border-dashed border-sand bg-white/60 p-3 font-mono text-[11px] leading-relaxed text-ink-soft">
      <div className="mb-1.5 font-sans font-medium text-ink">
        dev · verdict: {check.code}
      </div>
      {row("sharpness", m.sharpness)}
      {row("meanLuma", m.meanLuma)}
      {row("centre/border", m.borderLuma - m.centreLuma)}
      {row("contrast", m.contrast)}
      {row("skinRatio", m.skinRatio)}
    </div>
  );
}

/**
 * Shows the target framing. An outline of head and shoulders in a 3:4 box with
 * the mouth zone marked — this is the same crop the app applies, so what they
 * see here is what gets analysed.
 */
function FramingGuide() {
  return (
    <div className="mt-6 overflow-hidden rounded-[16px] border border-sand bg-white">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-[220px] py-5">
        <svg viewBox="0 0 120 160" className="h-full w-full" aria-hidden="true">
          <rect x="4" y="4" width="112" height="152" rx="10" fill="#FAF6EF" />
          {/* Head and shoulders. */}
          <ellipse cx="60" cy="64" rx="30" ry="38" fill="#E6DECF" />
          <path d="M18 156c0-22 19-34 42-34s42 12 42 34Z" fill="#E6DECF" />
          {/* Mouth zone — where sharpness is measured. */}
          <rect
            x="42"
            y="78"
            width="36"
            height="18"
            rx="9"
            fill="none"
            stroke="#006E8A"
            strokeWidth="1.6"
            strokeDasharray="4 3"
          />
          <path
            d="M48 86c4 5 20 5 24 0"
            stroke="#006E8A"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
        <span className="absolute inset-x-0 bottom-1 text-center text-[12px] text-ink-soft">
          Fill the frame like this
        </span>
      </div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[15px] leading-[1.5] text-ink-muted">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        className="mt-0.5 shrink-0 text-teal"
        aria-hidden="true"
      >
        <path
          d="m5 12.5 4.5 4.5L19 7.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      {children}
    </li>
  );
}
