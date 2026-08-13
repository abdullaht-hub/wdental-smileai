import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { CONSENT_VERSION } from "@/lib/consent";

export const metadata: Metadata = {
  title: "Privacy notice — Smile Preview | W Dental",
  robots: { index: false, follow: false },
};

/**
 * DRAFT — REQUIRES SIGN-OFF BEFORE LAUNCH.
 *
 * This describes what the application actually does, accurately, and it is
 * written to be read by a patient rather than by a lawyer. What it does NOT do
 * is discharge the clinic's obligations: the placeholders below are real gaps,
 * not formalities, and W Dental's own data protection adviser has to fill them
 * and approve the whole page before the first QR code goes on a wall.
 *
 * Outstanding for the clinic:
 *   - Named data controller and ICO registration number.
 *   - Named Data Protection Officer / contact address for rights requests.
 *   - Retention period for booking enquiries in the leads sheet.
 *   - Confirmation that kie.ai (and its sub-processors) is covered by an
 *     appropriate international transfer mechanism — the processing happens
 *     outside the UK.
 *   - A DPIA. This is facial imagery in a health context; even though the
 *     images are not used to identify anyone and are deleted within seconds,
 *     a DPIA is the defensible position.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-[620px] px-4 pb-16 pt-6">
      <header className="mb-8">
        <Logo className="h-6 w-auto text-ink" />
      </header>

      <h1 className="text-[32px] leading-[1.12] text-ink">Privacy notice</h1>
      <p className="mt-2 text-[14px] text-ink-soft">
        Smile Preview · version {CONSENT_VERSION}
      </p>

      <div className="mt-8 space-y-8">
        <Section title="The short version">
          <p>
            Your photo is sent to an AI image service, which returns a simulated
            version of your smile. Both images are deleted as soon as your
            preview is shown to you. We do not keep them, we do not use them to
            train anything, and we never share them.
          </p>
          <p>
            If you fill in the booking form, we keep only your name, your
            contact detail, and which QR code you scanned.
          </p>
        </Section>

        <Section title="What happens to your photo">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Your phone shrinks and crops the photo before anything is sent.
              Location data embedded by your camera is removed on our server
              before the image is stored anywhere.
            </li>
            <li>
              The photo is placed in temporary storage under a random,
              unguessable address, purely so the AI service can collect it.
            </li>
            <li>
              The AI service edits the teeth and returns a new image. This
              processing happens outside the UK.
            </li>
            <li>
              We fetch the result, <strong>delete your original photo</strong>,
              and send the preview to your phone.
            </li>
            <li>
              The preview exists only in your browser. Closing this page
              destroys it. If you tap &ldquo;Save to my phone&rdquo;, the file is
              written directly by your own device — it does not pass through us.
            </li>
          </ol>
          <p>
            Any photo left behind by an interrupted session — if your signal
            drops mid-way, for example — is automatically deleted within
            fifteen minutes.
          </p>
        </Section>

        <Section title="What we keep">
          <p>If, and only if, you submit the booking form, we record:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>your name;</li>
            <li>the phone number or email address you gave us;</li>
            <li>which QR code location you scanned;</li>
            <li>the date, and the version of this notice you agreed to.</li>
          </ul>
          <p>
            We do not record your photo, your preview, your IP address, or your
            device details. We use no advertising or analytics trackers on this
            site, and it sets no cookies.
          </p>
        </Section>

        <Section title="Why we're allowed to do this">
          <p>
            For your photo: your explicit consent, which you give on the first
            screen. You can withdraw it simply by closing the page — there is
            nothing left to delete afterwards.
          </p>
          <p>
            For your booking details: your consent, so that we can contact you
            about the consultation you asked for.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            Photos and previews: deleted within seconds of your preview being
            shown, and in all cases within fifteen minutes.
          </p>
          <p className="rounded-[10px] bg-white px-4 py-3 text-[14px] text-ink-soft">
            Booking enquiries: <em>[retention period to be confirmed by the
            practice]</em>.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You can ask us for a copy of what we hold about you, ask us to
            correct it, or ask us to delete it. Because photos are deleted
            automatically, such a request would only ever concern your booking
            details.
          </p>
          <p className="rounded-[10px] bg-white px-4 py-3 text-[14px] text-ink-soft">
            <em>[Data controller name, ICO registration number and contact
            address for rights requests to be confirmed by the practice.]</em>
          </p>
          <p>
            If you are unhappy with how we have handled your information, you
            can complain to the Information Commissioner&apos;s Office at{" "}
            <a
              href="https://ico.org.uk/"
              className="text-teal underline underline-offset-2"
            >
              ico.org.uk
            </a>
            .
          </p>
        </Section>

        <Section title="About the preview itself">
          <p>
            The image you are shown is generated by artificial intelligence. It
            is a visual illustration, not a photograph of a real outcome, not a
            diagnosis, and not a guarantee. Only a dentist examining your teeth
            in person can tell you what composite bonding would actually achieve
            for you.
          </p>
        </Section>
      </div>

      <div className="mt-12 border-t border-sand pt-6">
        <Link href="/" className="text-[15px] text-teal underline underline-offset-2">
          ← Back
        </Link>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[21px] leading-[1.2] text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-[1.65] text-ink-muted">
        {children}
      </div>
    </section>
  );
}
