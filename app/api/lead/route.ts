import { NextResponse } from "next/server";
import { z } from "zod";
import { appendLead, isSheetsConfigured } from "@/lib/sheets";
import { getLocation } from "@/lib/locations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * UK mobile and landline formats, tolerant of spaces, dashes and +44.
 * Deliberately loose — rejecting a real person's valid number to satisfy a
 * regex loses the clinic a booking.
 */
const PHONE = /^(\+?44|0)[\d\s-]{9,14}$/;

const Body = z.object({
  name: z.string().trim().min(2, "Please tell us your name.").max(80),
  contact: z.string().trim().min(5).max(120),
  locationSlug: z.string().min(1).max(64),
  consentVersion: z.string().min(1).max(40),
  consentedAt: z.string().min(1).max(40),
  previewGenerated: z.boolean(),
  /**
   * Honeypot: hidden from real users, irresistible to form bots.
   * Must NOT be constrained here — a schema that rejects a filled honeypot
   * makes the check below unreachable and hands the bot a validation error,
   * which tells it to try again. Let it parse, then drop it silently.
   */
  website: z.string().max(200).optional(),
});

function classify(contact: string): "email" | "phone" | null {
  if (z.string().email().safeParse(contact).success) return "email";
  if (PHONE.test(contact.replace(/\s+/g, " "))) return "phone";
  return null;
}

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Please check your name and contact details." },
      { status: 400 },
    );
  }

  // Bot filled the hidden field. Return success so it does not learn anything,
  // and drop the submission.
  if (body.website) return NextResponse.json({ ok: true });

  const contactType = classify(body.contact);
  if (!contactType) {
    return NextResponse.json(
      { error: "That doesn't look like a valid phone number or email address." },
      { status: 400 },
    );
  }

  const location = getLocation(body.locationSlug);
  if (!location) {
    return NextResponse.json({ error: "Unknown location." }, { status: 400 });
  }

  if (!isSheetsConfigured()) {
    // Losing a lead silently is worse than a visible failure — the patient
    // would walk away believing the clinic will call them.
    console.error("[lead] Sheets not configured; lead NOT saved:", location.slug);
    return NextResponse.json(
      { error: "We couldn't submit that just now. Please call us instead." },
      { status: 503 },
    );
  }

  try {
    await appendLead({
      name: body.name,
      contact: body.contact,
      contactType,
      locationSlug: location.slug,
      locationName: location.displayName,
      clinicName: location.clinic.name,
      consentVersion: body.consentVersion,
      consentedAt: body.consentedAt,
      previewGenerated: body.previewGenerated,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Log without the personal data — the point of the log is that the append
    // failed, not who it was for.
    console.error(`[lead] append failed for location=${location.slug}:`, err);
    return NextResponse.json(
      { error: "We couldn't submit that just now. Please call us instead." },
      { status: 503 },
    );
  }
}
