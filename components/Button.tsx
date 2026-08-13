import * as React from "react";

type Variant = "primary" | "secondary" | "ghost";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  /** Renders the spinner and blocks interaction without changing layout width. */
  busy?: boolean;
};

/**
 * Mirrors the live W Dental `.btn` rule: 8px radius, teal fill, 500 weight,
 * full-width with 16px/24px padding at mobile widths. `min-height: 56px` is
 * ours — their desktop button is smaller than a comfortable thumb target.
 */
const base =
  "inline-flex w-full items-center justify-center gap-2 rounded-[8px] " +
  "min-h-[56px] px-6 py-4 text-[16px] font-medium leading-none " +
  "transition-[background-color,transform,opacity] duration-200 ease-out " +
  "active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary: "bg-teal text-white hover:bg-teal-deep",
  secondary:
    "bg-white text-ink border border-sand hover:bg-sand/40",
  ghost: "bg-transparent text-teal hover:bg-teal/5",
};

export function Button({
  variant = "primary",
  busy = false,
  disabled,
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-[18px] w-[18px] animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
