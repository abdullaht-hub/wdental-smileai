/**
 * The instruction sent to the image model.
 *
 * This string is the single biggest determinant of whether the output reads as
 * a credible clinical preview or as AI slop, and it is the thing most likely to
 * need revision. Treat it as a tuned asset:
 *
 *  - Bump the version whenever the wording changes.
 *  - PROMPT_VERSION is logged with every job so a bad batch can be traced to
 *    the exact wording that produced it.
 *  - Re-run scripts/preview-smoke.ts over the sample set after ANY edit.
 *
 * Three things it has to fight, all of which these models do by default:
 *  1. Whitening. Ask for better teeth and you get fluorescent white ones.
 *  2. Uniformity. Every tooth identical — the "picket fence" that reads as
 *     obviously fake and, clinically, is veneers rather than bonding.
 *  3. Beautification. Smoothed skin, slimmed jaw, brightened eyes. This is the
 *     worst failure mode: it changes the person, which makes the preview a
 *     misrepresentation rather than a simulation.
 */

export const PROMPT_VERSION = "v1";

export const COMPOSITE_BONDING_PROMPT = `Retouch ONLY the visible upper and lower teeth in this photograph to show the result of cosmetic composite bonding. This is a dental treatment simulation for a real patient, so accuracy matters more than attractiveness.

WHAT TO CHANGE — the teeth, and nothing else:
- Even out the incisal (biting) edges so they follow a smooth, natural curve.
- Close small gaps between the front teeth.
- Repair chipped, worn or jagged edges.
- Visually soften slight rotations and minor overlaps.
- Even out mild irregularities in tooth width so the smile looks balanced.

TOOTH APPEARANCE — this is where these edits usually go wrong:
- Keep the patient's own natural tooth colour. Improve it by at most one shade. Do NOT whiten, brighten or bleach. The result must NOT look luminous, glowing, pure white, or grey-white.
- Preserve realistic enamel: subtle translucency along the incisal edges, faint surface texture, and slight natural variation in shade and shape from one tooth to the next.
- Teeth must remain individually distinguishable, with natural interdental shadow between them. Do not produce a single fused white band.
- Keep tooth proportions anatomically correct: central incisors slightly longer and wider than laterals, canines with a subtly rounded point.
- Keep the existing smile line, midline and the amount of tooth shown. Do not add teeth, do not remove teeth, do not change how wide the mouth is open.

WHAT MUST NOT CHANGE — leave completely untouched:
- The person's identity. They must be immediately recognisable as the same individual.
- Lips, lip shape, lip colour and lip texture.
- Gums and gum line height.
- Skin — no smoothing, no blemish removal, no reshaping of the face, jaw, chin or nose.
- Eyes, eyebrows, facial hair and hair.
- Head position, angle, expression and how much of the smile is showing.
- Framing, crop, composition and background.
- Lighting direction, shadows, colour temperature, exposure, film grain, noise and depth of field. The edited region must match the rest of the photograph exactly.

Output a photorealistic edit of the original photograph at the same resolution and framing. It must look like an ordinary phone photo of this person after dental treatment — not a render, not a beauty filter, not a stock photograph.`;

/**
 * Nano Banana takes direction better as a single block than as a separate
 * negative field, but repeating the failure modes as an explicit exclusion list
 * at the end measurably reduces them.
 */
export const NEGATIVE_SUFFIX = `

Avoid: blindingly white teeth, veneer-uniform identical teeth, a glowing or plastic smile, airbrushed or smoothed skin, altered face shape, enlarged or reshaped lips, whitened eyes, added makeup, beauty-filter effects, cartoon or 3D-render appearance, changed camera angle, changed background.`;

export function buildPrompt(): string {
  return COMPOSITE_BONDING_PROMPT + NEGATIVE_SUFFIX;
}
