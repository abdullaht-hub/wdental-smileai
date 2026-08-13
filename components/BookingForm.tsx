"use client";

import { useState } from "react";
import { Button } from "./Button";
import type { Location } from "@/lib/locations";
import { CONSENT_VERSION } from "@/lib/consent";

/**
 * Lead capture. One name field, one contact field, nothing else.
 *
 * Every additional field costs conversions, and the clinic only needs enough to
 * ring somebody back. The location slug rides along invisibly — that is the
 * whole point of the per-QR pages, and it is the one thing the patient does not
 * have to type.
 */
export function BookingForm({
  location,
  consentedAt,
  previewGenerated,
  onDone,
}: {
  location: Location;
  consentedAt: string;
  previewGenerated: boolean;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          contact,
          website,
          locationSlug: location.slug,
          consentVersion: CONSENT_VERSION,
          consentedAt,
          previewGenerated,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      onDone();
    } catch {
      setError(
        "We couldn't reach us just now — check your connection, or give us a call.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-[16px] border border-sand bg-white p-5">
      <h2 className="text-[24px] leading-[1.15] text-ink">
        Like what you see?
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
        Your consultation at {location.clinic.name} is free. We&apos;ll take a
        look at your teeth and tell you honestly what&apos;s possible.
      </p>

      <div className="mt-5 space-y-4">
        <Field
          id="name"
          label="Your name"
          value={name}
          onChange={setName}
          autoComplete="name"
          placeholder="Alex Morgan"
          required
        />
        <Field
          id="contact"
          label="Phone or email"
          value={contact}
          onChange={setContact}
          autoComplete="tel"
          placeholder="07700 900000"
          required
          hint="Whichever you'd rather we used to reach you."
        />
      </div>

      {/* Honeypot. Off-screen rather than display:none, which some bots detect. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error && (
        <p className="mt-4 rounded-[10px] bg-cream px-4 py-3 text-[14px] text-ink" role="alert">
          {error}
        </p>
      )}

      <div className="mt-5">
        <Button type="submit" busy={busy}>
          Book a Free Consultation
        </Button>
      </div>

      <p className="mt-3.5 text-center text-[12px] leading-relaxed text-ink-soft">
        We&apos;ll only use these details to contact you about a consultation.
        Your photo is not attached and has already been deleted.
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id">) {
  return (
    <div>
      <label htmlFor={id} className="block text-[14px] font-medium text-ink">
        {label}
      </label>
      <input
        {...rest}
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-1.5 block h-[52px] w-full rounded-[8px] border border-sand bg-cream px-3.5 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-soft/70 focus:border-teal focus:bg-white"
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-[12px] text-ink-soft">
          {hint}
        </p>
      )}
    </div>
  );
}
