"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { ConsentGate } from "@/components/ConsentGate";
import { CameraCapture } from "@/components/CameraCapture";
import { GeneratingState } from "@/components/GeneratingState";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import { DisclaimerBlock } from "@/components/Disclaimer";
import { prepareImage } from "@/lib/imagePrep";
import { checkImage, type QualityResult } from "@/lib/imageQuality";
import { saveResultImage } from "@/lib/saveImage";
import { CONSENT_STORAGE_KEY, CONSENT_VERSION, type ConsentRecord } from "@/lib/consent";
import { type Location } from "@/lib/locations";

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
 *
 * The journey ends at the preview. These QR codes are inside the clinic, so
 * the patient is already standing in reception — there is nobody to call back
 * and no appointment to arrange remotely. The result screen hands them to a
 * member of staff instead, which is why no contact details are collected here
 * at all.
 */

type Step = "consent" | "capture" | "checking" | "generating" | "result";

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 150_000;

export function SmileFlow({ location }: { location: Location }) {
  const [step, setStep] = useState<Step>("consent");
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
      setStep("capture");
    } catch {
      /* corrupt entry — fall through to asking again */
    }
  }, []);

  // The consent record is still written: it is the evidence that consent was
  // given for the photo processing, and it stops a mid-session refresh
  // re-asking. Nothing reads it back off the device any more.
  const accept = useCallback(() => {
    const rec: ConsentRecord = {
      version: CONSENT_VERSION,
      at: new Date().toISOString(),
    };
    try {
      sessionStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(rec));
    } catch {
      /* private mode — the flow still works, it just re-asks on refresh */
    }
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
        {step !== "consent" && (
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

            <div className="mt-8 rounded-[16px] border border-sand bg-white p-5 text-center">
              <h2 className="text-[21px] leading-[1.2] text-ink">
                Like what you see?
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
                Show this to a member of our team while you&apos;re here.
                They&apos;ll talk you through what composite bonding could
                actually do for your teeth — and what it would cost.
              </p>
              <p className="mt-3.5 text-[13px] leading-relaxed text-ink-soft">
                Save it to your phone first if you&apos;d rather not hand your
                screen over.
              </p>
            </div>
          </div>
        )}
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
