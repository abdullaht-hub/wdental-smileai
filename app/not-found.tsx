import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center px-4 py-12">
      <div className="rounded-[16px] border border-sand bg-white p-7">
        <Logo className="h-6 w-auto text-ink" />
        <h1 className="mt-6 text-[28px] leading-[1.15] text-ink">
          This code isn&apos;t active
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
          The QR code you scanned may have been replaced. Please mention it to a
          member of our team — they can show you the preview themselves.
        </p>
        <a
          href="https://w-dental.co.uk/"
          className="mt-6 inline-flex min-h-[56px] w-full items-center justify-center rounded-[8px] bg-teal px-6 text-[16px] font-medium text-white"
        >
          Visit w-dental.co.uk
        </a>
      </div>
    </main>
  );
}
