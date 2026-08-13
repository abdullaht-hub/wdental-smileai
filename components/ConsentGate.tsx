"use client";

import Link from "next/link";
import { Button } from "./Button";
import type { Location } from "@/lib/locations";

/**
 * The consent screen. Nothing in the flow runs until this is accepted — the
 * camera input is not even mounted.
 *
 * The three bullets are the substance of the consent, so they are stated in
 * plain English at full size, not compressed into small print. Somebody
 * standing at a bus stop in the rain will read three short lines; they will not
 * read a paragraph, and a consent nobody read is not a consent.
 */
export function ConsentGate({
  location,
  onAccept,
}: {
  location: Location;
  onAccept: () => void;
}) {
  return (
    <div className="wd-enter">
      <p className="text-[13px] font-medium uppercase tracking-[0.09em] text-teal">
        {location.displayName}
      </p>
      <h1 className="mt-2 text-[32px] leading-[1.1] text-ink">
        See your smile with composite bonding
      </h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-muted">
        {location.heroCopy ??
          `Take a photo and we'll show you a simulated preview in under a minute, while you're here at ${location.clinic.name}.`}
      </p>

      <div className="mt-7 rounded-[16px] border border-sand bg-white p-5">
        <h2 className="text-[19px] text-ink">Before we start</h2>
        <ul className="mt-4 space-y-4">
          <Point icon={<IconCamera />}>
            Your photo is sent to an AI image service that edits the teeth to
            create your preview.
          </Point>
          <Point icon={<IconTrash />}>
            <strong className="font-medium text-ink">
              It is deleted the moment your preview appears.
            </strong>{" "}
            We keep no copy of your photo or your preview.
          </Point>
          <Point icon={<IconShield />}>
            The preview is a simulation, not a promise of results — and it is
            never shared with anyone.
          </Point>
        </ul>

        <p className="mt-5 border-t border-sand pt-4 text-[13px] leading-relaxed text-ink-soft">
          You need to be 18 or over. Read our{" "}
          <Link
            href="/privacy"
            className="text-teal underline underline-offset-2"
          >
            privacy notice
          </Link>{" "}
          for the full detail.
        </p>
      </div>

      <div className="mt-6">
        <Button onClick={onAccept}>I agree — show me my preview</Button>
        {/* This code is on a wall inside the clinic, so the alternative to
            the preview is a person a few steps away, not a phone call. */}
        <p className="mt-3 text-center text-[13px] text-ink-soft">
          Rather just talk to someone? Ask at reception — we&apos;re right here.
        </p>
      </div>
    </div>
  );
}

function Point({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 shrink-0 text-teal" aria-hidden="true">
        {icon}
      </span>
      <span className="text-[15px] leading-[1.55] text-ink-muted">{children}</span>
    </li>
  );
}

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

function IconCamera() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true">
      <path
        {...stroke}
        d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.7l1.3-2h6.9l1.3 2h2.8A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-9Z"
      />
      <circle {...stroke} cx="12" cy="13" r="3.4" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true">
      <path {...stroke} d="M4 7h16M10 7V5h4v2M6 7l1 12h10l1-12" />
      <path {...stroke} d="M10 11v5M14 11v5" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true">
      <path {...stroke} d="M12 3.5 19 6v6c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-2.5Z" />
      <path {...stroke} d="m9 12 2 2 4-4" />
    </svg>
  );
}
