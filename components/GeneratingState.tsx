"use client";

import { useEffect, useState } from "react";

/**
 * The 15–40 second wait.
 *
 * Shows the patient's own photo, blurred, with a sheen passing over it — so the
 * screen is visibly about *them* rather than a generic spinner, and the wait
 * reads as work being done on their picture.
 *
 * The reassurance line rotates, and the deletion promise is pinned underneath
 * where it stays put. This is the moment someone is most likely to wonder what
 * is happening to their photo, so it is the moment to answer it.
 */
const REASSURANCE = [
  "Looking at the shape of your teeth…",
  "Evening out the edges…",
  "Matching your natural tooth colour…",
  "Blending it into your photo…",
  "Almost there…",
];

export function GeneratingState({ photoSrc }: { photoSrc: string }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setStep((s) => Math.min(s + 1, REASSURANCE.length - 1)),
      6000,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <div className="wd-enter">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[16px] bg-sand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-105 object-cover blur-[14px]"
        />
        <div className="absolute inset-0 bg-cream/45" />
        <div className="wd-shimmer absolute inset-0 overflow-hidden" />

        <div className="absolute inset-x-0 bottom-0 p-5">
          <div className="rounded-[12px] bg-white/92 px-4 py-3.5 backdrop-blur-sm">
            <p
              className="text-[15px] font-medium text-ink"
              aria-live="polite"
              key={step}
            >
              {REASSURANCE[step]}
            </p>
            <div className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-sand">
              <div
                className="h-full rounded-full bg-teal transition-[width] duration-[6000ms] ease-linear"
                style={{ width: `${((step + 1) / REASSURANCE.length) * 92}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <p className="mt-5 text-center text-[14px] leading-relaxed text-ink-muted">
        Creating your preview — this usually takes around half a minute.
        <br />
        <span className="text-ink-soft">
          Your photo is deleted as soon as it appears.
        </span>
      </p>
    </div>
  );
}
