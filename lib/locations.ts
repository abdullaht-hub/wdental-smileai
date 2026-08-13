/**
 * QR placement registry.
 *
 * These codes live inside the clinics, so the slug's job is now only to pick
 * the right name and hero copy for the screen — nothing is recorded about who
 * scanned what. One code per clinic is therefore enough; splitting a clinic
 * into several slugs would only change the wording, not produce any reporting.
 *
 * To add a placement: add an entry here and print the QR for
 * `${SITE_URL}/s/${slug}`. Slugs are permanent once printed — never rename one,
 * add a new entry instead, or the printed codes 404.
 */

/**
 * Reference data for the practice. Only `name` is rendered today; the contact
 * details are kept as the clinic's record, and because a patient standing in
 * reception has no use for a phone number or directions to the room they are
 * already in.
 */
export type Clinic = {
  name: string;
  address: string;
  postcode: string;
  phone: string;
  /** E.164 digits only. */
  whatsapp: string;
  mapsUrl: string;
};

export type Location = {
  slug: string;
  /** Shown to the patient above the headline: "Tooting". */
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

const LOCATIONS: Location[] = [
  {
    slug: "tooting",
    displayName: "Tooting",
    clinic: TOOTING,
    heroCopy:
      "While you're with us in Tooting — take a photo and see a preview in under a minute.",
    note: "One code for all Tooting placements, inside the clinic.",
  },
  {
    slug: "twickenham",
    displayName: "Twickenham",
    clinic: TWICKENHAM,
    heroCopy:
      "While you're with us in Twickenham — take a photo and see a preview in under a minute.",
    note: "One code for all Twickenham placements, inside the clinic.",
  },
];

const BY_SLUG = new Map(LOCATIONS.map((l) => [l.slug, l]));

export function getLocation(slug: string): Location | undefined {
  return BY_SLUG.get(slug.toLowerCase());
}

export function allLocations(): Location[] {
  return LOCATIONS;
}

