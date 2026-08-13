/**
 * The disclaimer is a compliance control, not decoration. It renders
 * unconditionally — there is no prop that hides it, and it must not be moved
 * behind a toggle, an accordion, or a "read more".
 *
 * Two forms, both always present on the result screen:
 *   Badge — sits ON the generated image, so a screenshot carries it too. This
 *           matters: screenshots are how these images actually travel.
 *   Block — the full wording underneath.
 */

export function DisclaimerBadge() {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-[999px] bg-ink/72 px-3 py-1.5 text-[11px] font-medium leading-none tracking-[0.02em] text-white backdrop-blur-[2px]">
      Simulated preview
    </div>
  );
}

export function DisclaimerBlock({ className = "" }: { className?: string }) {
  return (
    <p
      className={`text-[13px] leading-[1.6] text-ink-muted ${className}`}
      role="note"
    >
      <strong className="font-medium text-ink">
        This is an AI-generated simulation, not a photograph of a real result.
      </strong>{" "}
      It is not a diagnosis, a treatment plan, or a guarantee of outcome. What
      composite bonding can achieve depends on your own teeth and gums, and can
      only be assessed by a dentist in person at a consultation.
    </p>
  );
}
