"use client";

import { useCallback, useId, useRef, useState } from "react";
import { DisclaimerBadge } from "./Disclaimer";

type Props = {
  beforeSrc: string;
  afterSrc: string;
};

/**
 * Draggable before/after wipe.
 *
 * Hand-written rather than pulled from a package — the interaction is about
 * forty lines and every library option brings its own styling opinions.
 *
 * Three things that are easy to get wrong here:
 *
 *  1. `touch-action: none` on the drag surface. Without it, a vertical drag
 *     gets claimed by the page scroller mid-gesture and the handle sticks.
 *  2. `setPointerCapture`. Without it, dragging a few pixels outside the image
 *     drops the gesture, which is constant on a phone.
 *  3. Both images are `absolute inset-0` in a fixed 3:4 box. They are the same
 *     3:4 geometry (locked in imagePrep and requested from the model), so the
 *     seam lines up exactly. If the two ever differ in aspect the wipe visibly
 *     jumps, which reads as fake.
 *
 * Accessibility: a real range input drives the same value, so arrow keys and
 * screen readers work without a parallel implementation. It is visually hidden
 * rather than stretched transparently over the image — an overlaid range input
 * runs its own native drag, which both fights `setPointerCapture` and disagrees
 * with our position by half a thumb width, so the seam drifts under the finger.
 * Pointer users drag the image; keyboard users get the input. `peer` wires the
 * input's focus state to a visible ring on the handle, since a visually hidden
 * control cannot show its own focus.
 */
export function BeforeAfterSlider({ beforeSrc, afterSrc }: Props) {
  const [pos, setPos] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  const setFromClientX = useCallback((clientX: number) => {
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, pct)));
  }, []);

  return (
    <div className="select-none">
      <div
        ref={frameRef}
        className="relative aspect-[3/4] w-full overflow-hidden rounded-[16px] bg-sand"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 0) return;
          setFromClientX(e.clientX);
        }}
      >
        {/* Original underneath. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforeSrc}
          alt="Your photo before the simulation"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />

        {/* Simulated on top, revealed from the left. */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={afterSrc}
            alt="Simulated preview after composite bonding"
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        </div>

        <DisclaimerBadge />

        <Caption side="left" show={pos > 16}>
          Simulated
        </Caption>
        <Caption side="right" show={pos < 84}>
          Now
        </Caption>

        <label htmlFor={labelId} className="sr-only">
          Reveal the simulated preview
        </label>
        <input
          id={labelId}
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(pos)}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-valuetext={`${Math.round(pos)}% simulated preview shown`}
          className="peer sr-only"
        />

        {/* Seam and handle. Purely visual — the input above owns the value. */}
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white/90 shadow-[0_0_0_1px_rgba(19,19,19,0.12)]"
          style={{ left: `${pos}%` }}
        >
          <div className="absolute top-1/2 left-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(19,19,19,0.28)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal">
            <Grip />
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[13px] text-ink-soft">
        Drag to compare
      </p>
    </div>
  );
}

function Caption({
  side,
  show,
  children,
}: {
  side: "left" | "right";
  show: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute bottom-3 z-20 rounded-[999px] bg-ink/60 px-2.5 py-1 text-[11px] font-medium leading-none text-white backdrop-blur-[2px] transition-opacity duration-200 ${
        side === "left" ? "left-3" : "right-3"
      } ${show ? "opacity-100" : "opacity-0"}`}
    >
      {children}
    </span>
  );
}

function Grip() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
      <path
        d="M6.5 2.5 2 7l4.5 4.5M11.5 2.5 16 7l-4.5 4.5"
        stroke="#006E8A"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
