/**
 * QR placement registry.
 *
 * Currently one code per clinic: the slug written to the leads sheet identifies
 * the clinic, not the individual poster. If you later need to know which
 * placement produced a booking, split a clinic into several entries with
 * distinct slugs — the rest of the app reads this list and needs no changes.
 *
 * To add a placement: add an entry here and print the QR for
 * `${SITE_URL}/s/${slug}`. Slugs are permanent once printed — never rename one,
 * add a new entry instead, or the printed codes 404.
 */

export type Clinic = {
  name: string;
  address: string;
  postcode: string;
  phone: string;
  /** E.164 digits only, for wa.me links. */
  whatsapp: string;
  mapsUrl: string;
};

export type Location = {
  slug: string;
  /** Shown to the patient: "You're just around the corner from ..." */
  displayName: string;
  clinic: Clinic;
  /** Optional one-liner that replaces the default hero subhead. */
  heroCopy?: string;
  /** Human note for the clinic team. Never rendered. */
  note?: string;
};

const TWICKENHAM: Clinic = {
  name: "W Dental Twickenham",
  address: "46–48 London Road, Twickenham",
  postcode: "TW1 3RJ",
  phone: "0203 143 4714",
  whatsapp: "447397578201",
  mapsUrl: "https://maps.google.com/?q=W+Dental,+46-48+London+Road,+Twickenham+TW1+3RJ",
};

const TOOTING: Clinic = {
  name: "W Dental Tooting",
  address: "21 Upper Tooting Road, Tooting",
  postcode: "SW17 7TS",
  phone: "0203 870 3388",
  whatsapp: "447397578201",
  mapsUrl: "https://maps.google.com/?q=W+Dental,+21+Upper+Tooting+Road,+London+SW17+7TS",
};

export const OPENING_HOURS = "Mon–Sat, 9:30am–6pm · Sundays by appointment";

const LOCATIONS: Location[] = [
  {
    slug: "tooting",
    displayName: "Tooting",
    clinic: TOOTING,
    heroCopy: "Our Tooting clinic is just up the road from here.",
    note: "One code for all Tooting placements.",
  },
  {
    slug: "twickenham",
    displayName: "Twickenham",
    clinic: TWICKENHAM,
    heroCopy: "Our Twickenham clinic is a five-minute walk from here.",
    note: "One code for all Twickenham placements.",
  },
];

const BY_SLUG = new Map(LOCATIONS.map((l) => [l.slug, l]));

export function getLocation(slug: string): Location | undefined {
  return BY_SLUG.get(slug.toLowerCase());
}

export function allLocations(): Location[] {
  return LOCATIONS;
}

export function whatsappUrl(clinic: Clinic, message: string): string {
  return `https://wa.me/${clinic.whatsapp}?text=${encodeURIComponent(message)}`;
}

export function telUrl(clinic: Clinic): string {
  return `tel:${clinic.phone.replace(/[^0-9+]/g, "")}`;
}
