import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SmileFlow } from "./SmileFlow";
import { allLocations, getLocation } from "@/lib/locations";

/**
 * QR landing page. The slug identifies the physical placement, not the clinic.
 *
 * Every placement is statically rendered at build time — the page itself holds
 * nothing dynamic, and a poster scanned on patchy mobile data should paint
 * immediately rather than wait on a server round trip.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return allLocations().map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const location = getLocation(slug);
  return {
    title: location
      ? `Smile Preview — ${location.displayName} | W Dental`
      : "Smile Preview | W Dental",
    robots: { index: false, follow: false },
  };
}

export default async function LocationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const location = getLocation(slug);

  // An unknown slug means a mis-typed or retired QR code. 404 rather than
  // falling back to a generic page: a wrong-clinic greeting to someone standing
  // in reception is worse than an honest dead end.
  if (!location) notFound();

  return <SmileFlow location={location} />;
}
