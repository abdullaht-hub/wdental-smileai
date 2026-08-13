"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { ConsentGate } from "@/components/ConsentGate";
import { CameraCapture } from "@/components/CameraCapture";
import { GeneratingState } from "@/components/GeneratingState";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import { DisclaimerBlock } from "@/components/Disclaimer";
import { BookingForm } from "@/components/BookingForm";
import { prepareImage } from "@/lib/imagePrep";
import { checkImage, type QualityResult } from "@/lib/imageQuality";
import { saveResultImage } from "@/lib/saveImage";
import { CONSENT_STORAGE_KEY, CONSENT_VERSION, type ConsentRecord } from "@/lib/consent";
import { OPENING_HOURS, telUrl, whatsappUrl, type Location } from "@/lib/locations";

/**
 * The whole patient journey, as one client-side state machine.
 *
 * Deliberately not routed. Each step is not a URL, so a back-swipe leaves the
 * flow entirely rather than stranding someone on a "generating" screen with no
 * job attached, and a refresh cannot resurrect a photo that should be gone.
 *
 * THE PHOTO LIVES HERE AND NOWHERE ELSE. `photo` and `result` are React state:
 * no localStorage, no sessionStorage, no IndexedDB, no URL parameter. Closing
 * the tab destroys both. The only thing that persists is the consent record.
 */

type Step =
  | "consent"
  | "capture"
  | "checking"
  | "generating"
  | "result"
  | "booking"
  | "done";

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 150_000;

export function SmileFlow({ location }: { location: Location }) {
  const [step, setStep] = useState<Step>("consent");
  const [consentedAt, setConsentedAt] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [rejection, setRejection] = useState<QualityResult | null>(null);
  const [lastCheck, setLastCheck] = useState<QualityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Guards the poll loop against a component that has gone away.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Restore consent (only) so a mid-session refresh doesn't re-ask.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CONSENT_STORAGE_KEY);
      if (!raw) return;
      const rec = JSON.parse(raw) as ConsentRecord;
      // A consent given against older wording is not consent to the current
      // wording — re-ask rather than assume.
      if (rec.version !== CONSENT_VERSION) return;
      setConsentedAt(rec.at);
      setStep("capture");
    } catch {
      /* corrupt entry — fall through to asking again */
    }
  }, []);

  const accept = useCallback(() => {
    const at = new Date().toISOString();
    const rec: ConsentRecord = { version: CONSENT_VERSION, at };
    try {
      sessionStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(rec));
    } catch {
      /* private mode — the flow still works, it just re-asks on refresh */
    }
    setConsentedAt(at);
    setStep("capture");
  }, []);

  const startOver = useCallback(() => {
    setPhoto(null);
    setResult(null);
    setRejection(null);
    setError(null);
    setStep("capture");
  }, []);

  /** Prepare → quality gate → upload → poll. */
  const handleFile = useCallback(
    async (file: File) => {
      setStep("checking");
      setError(null);

      let prepared;
      try {
        prepared = await prepareImage(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "We couldn't read that photo.");
        setStep("capture");
        return;
      }

      const verdict = await checkImage(prepared.dataUrl);
      setLastCheck(verdict);
      if (verdict.code !== "ok") {
        // Rejected locally: nothing was uploaded and no credit was spent.
        setRejection(verdict);
        setStep("capture");
        return;
      }

      setRejection(null);
      setPhoto(prepared.dataUrl);
      setStep("generating");

      try {
        const startRes = await fetch("/api/preview/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: prepared.dataUrl,
            locationSlug: location.slug,
          }),
        });
        const started = (await startRes.json()) as { job?: string; error?: string };
        if (!startRes.ok || !started.job) {
          throw new Error(started.error ?? "We couldn't create your preview.");
        }

        const image = await poll(started.job, aliveRef);
        if (!aliveRef.current) return;
        setResult(image);
        setStep("result");
      } catch (err) {
        if (!aliveRef.current) return;
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong creating your preview.",
        );
        setPhoto(null);
        setStep("capture");
      }
    },
    [location.slug],
  );

  async function save() {
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      await saveResultImage(result);
    } catch {
      setError("We couldn't save that. Try taking a screenshot instead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-5">
      <header className="mb-6 flex items-center justify-between">
        <Logo className="h-6 w-auto text-ink" />
        {step !== "consent" && step !== "done" && (
          <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-soft">
            Smile Preview
          </span>
        )}
      </header>

      <main className="flex-1">
        {/* Shown on both steps that can raise one: a failed generation returns
            to capture, a failed save stays on result. */}
        {error && (step === "capture" || step === "result") && (
          <p
            className="mb-5 rounded-[10px] border border-sand bg-white px-4 py-3 text-[14px] leading-relaxed text-ink"
            role="alert"
          >
            {error}
          </p>
        )}

        {step === "consent" && (
          <ConsentGate location={location} onAccept={accept} />
        )}

        {(step === "capture" || step === "checking") && (
          <CameraCapture
            onSelect={handleFile}
            rejection={rejection}
            lastCheck={lastCheck}
            busy={step === "checking"}
          />
        )}

        {step === "generating" && photo && <GeneratingState photoSrc={photo} />}

        {step === "result" && photo && result && (
          <div className="wd-enter">
            <h1 className="text-[28px] leading-[1.15] text-ink">
              Here&apos;s your preview
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
              Drag the handle to compare it with your photo.
            </p>

            <div className="mt-5">
              <BeforeAfterSlider beforeSrc={photo} afterSrc={result} />
            </div>

            <div className="mt-5 rounded-[16px] border border-sand bg-white p-4">
              <DisclaimerBlock />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={save} busy={saving}>
                Save to my phone
              </Button>
              <Button variant="secondary" onClick={startOver}>
                Try another photo
              </Button>
            </div>

            <p className="mt-3 text-center text-[12px] text-ink-soft">
              Your photo has been deleted. This preview will disappear when you
              close this page.
            </p>

            <div className="mt-8">
              <Button onClick={() => setStep("booking")}>
                Book a Free Consultation
              </Button>
            </div>
          </div>
        )}

        {step === "booking" && consentedAt && (
          <div className="wd-enter">
            <BookingForm
              location={location}
              consentedAt={consentedAt}
              previewGenerated={!!result}
              onDone={() => setStep("done")}
            />
            <button
              onClick={() => setStep(result ? "result" : "capture")}
              className="mt-4 w-full py-2 text-center text-[14px] text-ink-soft underline underline-offset-2"
            >
              Back
            </button>
          </div>
        )}

        {step === "done" && <Done location={location} />}
      </main>

      <footer className="mt-10 border-t border-sand pt-5 text-center">
        <p className="text-[12px] leading-relaxed text-ink-soft">
          Previews are simulations generated by AI. Photos are never stored.{" "}
          <a href="/privacy" className="underline underline-offset-2">
            Privacy notice
          </a>
        </p>
      </footer>
    </div>
  );
}

function Done({ location }: { location: Location }) {
  const { clinic } = location;
  return (
    <div className="wd-enter text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal text-white">
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="m5 12.5 4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      <h1 className="mt-5 text-[28px] leading-[1.15] text-ink">
        Thanks — we&apos;ll be in touch
      </h1>
      <p className="mt-2.5 text-[15px] leading-relaxed text-ink-muted">
        Someone from {clinic.name} will contact you to arrange your free
        consultation.
      </p>

      <div className="mt-7 rounded-[16px] border border-sand bg-white p-5 text-left">
        <h2 className="text-[19px] text-ink">{clinic.name}</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">
          {clinic.address}
          <br />
          {clinic.postcode}
        </p>
        <p className="mt-2 text-[14px] text-ink-soft">{OPENING_HOURS}</p>

        <div className="mt-5 space-y-3">
          <a href={telUrl(clinic)} className="block">
            <Button variant="secondary">Call {clinic.phone}</Button>
          </a>
          <a
            href={whatsappUrl(
              clinic,
              `Hi W Dental — I just tried the Smile Preview at ${location.displayName} and I'd like to book a consultation.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <Button variant="secondary">Message on WhatsApp</Button>
          </a>
          <a href={clinic.mapsUrl} target="_blank" rel="noopener noreferrer" className="block">
            <Button variant="ghost">Get directions</Button>
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Polls until the job reaches a terminal state.
 *
 * A transient network blip returns "generating" from the server rather than an
 * error, so the loop rides it out. The overall deadline is the real safety net:
 * without it a stuck job would poll forever on someone's mobile data.
 */
async function poll(job: string, alive: React.RefObject<boolean>): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (!alive.current) throw new Error("cancelled");
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`/api/preview/status?job=${encodeURIComponent(job)}`, {
      cache: "no-store",
    });
    const data = (await res.json()) as {
      state?: string;
      image?: string;
      error?: string;
    };

    if (data.state === "success" && data.image) return data.image;
    if (data.state === "fail") {
      throw new Error(data.error ?? "We couldn't create a preview from that photo.");
    }
    if (!res.ok && res.status !== 200) {
      throw new Error(data.error ?? "We couldn't create your preview.");
    }
  }

  throw new Error(
    "That took longer than expected. Please try again — it's usually quicker.",
  );
}
