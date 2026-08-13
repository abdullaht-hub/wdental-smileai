/**
 * Consent version. Bump this whenever the wording on the consent screen or the
 * privacy notice changes in a way that alters what the patient agreed to.
 *
 * The version is recorded against every lead, so if the wording is ever
 * challenged the clinic can show exactly which text that person accepted.
 * Shared by client and server — no "server-only" import here.
 */
export const CONSENT_VERSION = "2026-08-07.v1";

/** sessionStorage key. Holds the consent record only — never the photo. */
export const CONSENT_STORAGE_KEY = "wd_smile_consent";

export type ConsentRecord = { version: string; at: string };
