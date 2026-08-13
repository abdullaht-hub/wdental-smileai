import "server-only";
import { JWT } from "google-auth-library";

/**
 * Appends leads to a Google Sheet.
 *
 * Uses google-auth-library plus a plain REST call rather than the full
 * `googleapis` package — that dependency is enormous and we need exactly one
 * method from it.
 *
 * WHAT IS DELIBERATELY NOT WRITTEN HERE: no image, no image URL, no IP address,
 * no user agent, no device identifier. The sheet holds the minimum needed to
 * ring somebody back and to know which poster they scanned. Anything more and
 * the clinic is holding personal data it has no stated purpose for.
 */

const SHEET_RANGE = "Leads!A:I";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export type Lead = {
  name: string;
  contact: string;
  contactType: "email" | "phone";
  locationSlug: string;
  locationName: string;
  clinicName: string;
  consentVersion: string;
  consentedAt: string;
  previewGenerated: boolean;
};

/**
 * Header row for a fresh sheet. Create the tab as "Leads" and paste this in;
 * the append call does not manage headers itself.
 */
export const SHEET_HEADERS = [
  "Timestamp (UK)",
  "Location slug",
  "Location name",
  "Clinic",
  "Name",
  "Contact",
  "Contact type",
  "Consent version",
  "Preview generated",
] as const;

let cached: JWT | null = null;

function client(): JWT {
  if (cached) return cached;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY must both be set.",
    );
  }

  cached = new JWT({
    email,
    // Vercel's env UI stores the PEM with literal \n sequences.
    key: rawKey.replace(/\\n/g, "\n"),
    scopes: SCOPES,
  });
  return cached;
}

export function isSheetsConfigured(): boolean {
  return (
    !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    !!process.env.GOOGLE_PRIVATE_KEY &&
    !!process.env.SHEETS_SPREADSHEET_ID
  );
}

export async function appendLead(lead: Lead): Promise<void> {
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("SHEETS_SPREADSHEET_ID is not set.");

  const row = [
    new Date().toLocaleString("en-GB", { timeZone: "Europe/London" }),
    lead.locationSlug,
    lead.locationName,
    lead.clinicName,
    lead.name,
    // Leading apostrophe stops Sheets mangling "07700 900000" into a number and
    // dropping the leading zero.
    lead.contactType === "phone" ? `'${lead.contact}` : lead.contact,
    lead.contactType,
    lead.consentVersion,
    lead.previewGenerated ? "yes" : "no",
  ];

  const { token } = await client().getAccessToken();
  if (!token) throw new Error("Could not obtain a Google access token.");

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
    `/values/${encodeURIComponent(SHEET_RANGE)}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [row] }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Sheets append failed (HTTP ${res.status}): ${await res.text()}`);
  }
}
