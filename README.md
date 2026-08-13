# W Dental — Smile Preview

A mobile-first web app reached by QR code. The codes are displayed **inside**
the clinics: a patient already in the building scans one, consents, photographs
their smile, and gets an AI-simulated preview of composite bonding shown against
their original photo. The journey ends there, on the result screen, which asks
them to show it to a member of staff.

There is deliberately **no lead capture** — no form, no name, no contact
details, no leads sheet. The person is standing in reception; the conversation
happens in person, and the app collects nothing about them.

**The photo is never stored.** It exists in browser memory and in an
unguessable blob for the few seconds kie.ai needs to fetch it, then it is
deleted. See [Privacy design](#privacy-design) — that section is the point of
this codebase, not a footnote to it.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run dev
```

Open http://localhost:3000/ — in development the root page lists every
configured QR placement.

Camera capture requires HTTPS on a real phone. To test on a device, use
`vercel dev` with a tunnel, or `ngrok http 3000`. kie.ai must also be able to
reach the blob URL, so a public tunnel is needed for the full flow either way.

---

## How it works

```
QR → /s/[slug] → consent → capture → quality gate ─┐   all client-side
                                                    │
                                POST /api/preview/start
                                                    │
                          sharp: strip EXIF, lock 3:4
                                                    │
                             put() → Vercel Blob (random key)
                                                    │
                                kie.ai createTask → taskId
                                                    │
                    signed opaque job token {taskId, blobPathname}
                                                    │
                        client polls /api/preview/status
                                                    │
              on terminal state: fetch result bytes, DELETE BLOB,
                        return image inline as a data URI
                                                    │
                     before/after slider (memory only) → end
```

There is **no database**. The job token is a base64url payload plus an
HMAC-SHA256 signature, so the status route knows which task to poll and which
blob to delete without anything being written down. A database holding rows
that point at photographs of people's faces is precisely what this app is
designed not to have.

### Key files

| Path | What it does |
|---|---|
| `lib/locations.ts` | QR placement registry. **Add placements here.** |
| `lib/prompt.ts` | The model instruction. The highest-leverage file in the repo. |
| `lib/imagePrep.ts` | Downscale + 3:4 lock (this is what makes the slider align). |
| `lib/imageQuality.ts` | Blur / exposure / backlight / subject checks + thresholds. |
| `lib/jobToken.ts` | Signed stateless job handle. |
| `lib/blob.ts` | Ephemeral photo storage and the three deletion paths. |
| `app/s/[slug]/SmileFlow.tsx` | The whole patient journey as one state machine. |
| `app/api/preview/status/route.ts` | Where the photo is deleted. |

---

## Privacy design

The consent screen makes three promises. Each is enforced by code, and each has
a way to verify it.

**"Your photo is deleted the moment your preview appears."**
Deletion happens in `app/api/preview/status/route.ts`, inside a `finally`, so it
runs on the failure path too. Two backstops: `preview/start` deletes if
`createTask` throws, and a cron sweeper (`/api/cron/sweep-blobs`, triggered
externally every ~10 min — see [Orphan sweep](#orphan-sweep-setup) below)
removes anything older than 15 minutes — the case where a phone loses signal
mid-generation and the status route never runs.
Verify with `npm run blobs`.

**"We keep no copy."**
The generated image is fetched server-side and returned inline as a data URI.
The kie.ai result URL — which stays live for ~24 hours — is never given to the
browser and never persisted. The preview lives in a React state variable and
dies with the tab. `next.config.ts` omits kie.ai from `connect-src` so the
browser cannot reach the provider directly even if something tried to.

**"Location data is removed."**
`sharp().rotate()` bakes in the orientation and drops all other metadata before
the image reaches storage, so the GPS coordinates in every phone photo never
leave the request. Verify with `npm run check:exif`.

We deliberately do **not** use kie.ai's own file-upload endpoint: it retains
uploads for 24 hours to 3 days and exposes no delete API. Hosting the input
ourselves is what makes prompt deletion possible at all.

Also: no analytics or third-party scripts, no cookies, and — since lead capture
was removed — no personal data recorded anywhere at all. The only thing written
outside browser memory is the transient blob, and that is deleted within
seconds.

### Still outstanding — the clinic's call, not ours

`app/privacy/page.tsx` is an accurate draft, not a signed-off notice. Before the
first QR goes on a wall, W Dental's data protection adviser needs to supply:

- the named data controller and ICO registration number;
- a contact route for rights requests;
- confirmation of the international transfer mechanism covering kie.ai;
- a DPIA. The images are deleted within seconds and are never used to identify
  anyone, so this is not biometric processing under UK GDPR — but this is facial
  imagery in a health context, and a DPIA is the defensible position.

---

## Verification

```bash
npm run check          # typecheck + EXIF stripping + job token security
npm run blobs          # assert no patient photo is left in storage
npm run smoke          # run sample photos through the real model (costs money)
```

`npm run check` needs no credentials and is safe in CI.

### Deletion proof — the test that matters most

1. Complete a preview on a device, then `npm run blobs` → expect zero.
2. Set a bad `KIE_API_KEY`, attempt a preview, `npm run blobs` → expect zero.
3. Kill the tab mid-generation, `npm run blobs` → expect one, then zero after
   the sweeper runs.

### Quality gate

Shoot one blurry, one dark, one backlit and one no-face photo. Each must give
its own specific retake message, and **none** may reach kie.ai — confirm zero
credit movement in the kie.ai dashboard. In development a metrics panel appears
under the capture buttons showing the raw measurements, for tuning
`THRESHOLDS` in `lib/imageQuality.ts` on real hardware. A false reject sends a
patient away without the preview that starts the conversation, so widen before
narrowing.

### Before launch: tune the prompt

This is not optional and it is not a code change — it is a review.

```bash
mkdir -p scratch/samples     # add 10-15 varied real smile photos
npm run smoke                # ~$0.02 per photo
open scratch/output/
```

Compare each `-before.jpg` with its `-after.jpg`. Revise `lib/prompt.ts` and
re-run if any output changes the person's identity, whitens teeth beyond one
shade, produces uniform "picket fence" teeth, or alters lips, jaw, skin or eyes.
Vary the samples deliberately across skin tones, ages, lighting and existing
tooth conditions. Do this before the clinic sees a demo.

---

## Adding a QR placement

1. Add an entry to `LOCATIONS` in `lib/locations.ts`.
2. Deploy.
3. Generate a QR for `https://<domain>/s/<slug>` and print it.

Slugs are permanent once printed — a renamed slug 404s every code already on a
wall. To retire a placement, leave the entry in place.

---

## Deployment

Vercel, with a Blob store linked to the project.

Required environment variables are documented in `.env.example`. Two are easy to
skip and shouldn't be:

- **`UPSTASH_REDIS_REST_URL` / `_TOKEN`** — without these the rate limiter
  degrades open and one bored person can drain the kie.ai balance at ~$0.02 a
  go. The app logs an error at boot if they are missing in production.
- **`CRON_SECRET`** — the sweeper refuses to run without it, which silently
  disables the deletion backstop.

### Orphan sweep setup

Vercel's Hobby plan only permits daily cron schedules, which is too coarse a
backstop for a photo of someone's face, so `/api/cron/sweep-blobs` is triggered
by a free external scheduler instead of `vercel.json`:

1. Sign up at [cron-job.org](https://cron-job.org) (free, no card required).
2. Create a job:
   - URL: `https://<your-domain>/api/cron/sweep-blobs`
   - Schedule: every 10 minutes
   - Under **Advanced → Request headers**, add:
     `Authorization: Bearer <the same value as your CRON_SECRET>`
3. Save, then trigger it once manually to confirm you get back
   `{"deleted":0,"scanned":0}` rather than a 401 or 500.

Any other scheduler that can send a custom header on a GET request works
identically (GitHub Actions on a schedule, EasyCron, your own machine's crontab
hitting the public URL, etc.) — cron-job.org is just the fastest free option
that needs no code of its own.

### Cost

Roughly **$0.02 per preview** on `google/nano-banana-edit`. Photos rejected by
the client-side quality gate cost nothing. `KIE_MODEL_ID` can be switched to
`google/nano-banana-pro` for better fidelity at around 6x the price.

---

## Design

Brand tokens are taken from the live W Dental theme
(`w-dental.co.uk/wp-content/themes/w-dental/style.min.css`), not approximated:

```
teal #006E8A   teal-deep #015D74   cream #FAF6EF
sand #E6DECF   ink #131313
Cormorant Garamond (headings) · DM Sans (body)
```

Buttons match their live `.btn` rule — 8px radius, full width on mobile,
16px/24px padding — with a 56px minimum height added for thumbs. Everything is
one narrow column, respects `prefers-reduced-motion`, and keeps CTAs above
`env(safe-area-inset-bottom)`.

The disclaimer is a compliance control rather than decoration: it renders
unconditionally, sits as a badge *on* the image so screenshots carry it, and is
burned into the file that "Save to my phone" produces.
