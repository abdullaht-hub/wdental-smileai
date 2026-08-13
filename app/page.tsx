import Link from "next/link";
import { Logo } from "@/components/Logo";
import { allLocations } from "@/lib/locations";

/**
 * The root URL is not a patient entry point — patients always arrive at
 * /s/[slug] from a printed QR. In development this lists the configured
 * placements so they can be opened quickly; in production it is a plain
 * signpost back to the main site.
 */
export default function Home() {
  const isDev = process.env.NODE_ENV === "development";

  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center px-4 py-12">
      <div className="rounded-[16px] bg-white p-7 shadow-[0_1px_2px_rgba(19,19,19,0.04),0_8px_28px_rgba(19,19,19,0.06)]">
        <Logo className="h-7 w-auto text-ink" />
        <h1 className="mt-6 text-[28px] text-ink">Smile Preview</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
          This tool is reached by scanning one of our QR codes. If you arrived
          here by accident, you can find us at{" "}
          <a
            href="https://w-dental.co.uk/"
            className="text-teal underline underline-offset-2"
          >
            w-dental.co.uk
          </a>
          .
        </p>

        {isDev && (
          <div className="mt-8 border-t border-sand pt-6">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-soft">
              Configured placements (dev only)
            </p>
            <ul className="mt-3 space-y-2">
              {allLocations().map((l) => (
                <li key={l.slug}>
                  <Link
                    href={`/s/${l.slug}`}
                    className="text-[15px] text-teal underline underline-offset-2"
                  >
                    /s/{l.slug}
                  </Link>{" "}
                  <span className="text-[13px] text-ink-soft">
                    — {l.clinic.name}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
