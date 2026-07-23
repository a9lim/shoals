/* ===================================================
   src/race/sampler.js -- Per-run hidden-state sampler
   for the AI-race state machine. Every question the
   discourse argues about (timelines, takeoff speed,
   alignment difficulty, whether Beijing would deal) is
   sampled here, once, at game start. The player and the
   event copy observe only noisy projections of these.

   Numbers are transcribed verbatim from the per-run
   sampler table in docs/design/02a-tuning.md (rev 2).
   Pure / DOM-free -- headless-importable for MC.
   =================================================== */

import { createRng, randomSeed } from './rng.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * Sample the per-run hidden configuration from `seed`.
 *
 * 02a per-run sampler table (rev 2):
 *   tau (alignTractability)  Beta(2,3)                      mean 0.40
 *   takeoffSharpness         Beta(3,2) -> [0.5, 3.0];       sharpnessNorm = (s-0.5)/2.5
 *   scalingElasticity        mixture: 12% U[0.25,0.6]
 *                                   + 88% Beta(5,2) -> [0.6,1.1]   median ~= 0.95
 *   chinaTrue.position       N(0.8, 0.3) clamp [0.2, 1.6]
 *   chinaTrue.dealPossible   Bernoulli(0.15)
 *   labSafetyCulture         Halcyon N(0.5,0.2) clamp[0.1,0.9];
 *                            Polaris N(0.8,0.1);  Tianxia = 0.15 fixed
 *
 * The run seed is kept on the returned object: later phases pre-sample
 * seed-persisted draws (e.g. the nationalization conversion multiple) off it.
 *
 * @param {number} [seed]  32-bit seed; a fresh one is drawn if omitted.
 */
export function sampleHiddenState(seed) {
    if (seed == null) seed = randomSeed();
    seed = seed >>> 0;
    const rng = createRng(seed);

    // alignTractability tau ~ Beta(2, 3), mean 0.40 -- the wager variable.
    const tau = rng.beta(2, 3);

    // takeoffSharpness ~ Beta(3, 2) mapped to [0.5, 3.0]; mass toward fast.
    const takeoffSharpness = 0.5 + rng.beta(3, 2) * 2.5;
    // Normalized form used by the resolution `required` term (02a).
    const sharpnessNorm = (takeoffSharpness - 0.5) / 2.5;

    // scalingElasticity mixture: a real 12% fizzle tail by construction.
    let scalingElasticity;
    if (rng.next() < 0.12) {
        scalingElasticity = rng.uniform(0.25, 0.6);          // fizzle tail
    } else {
        scalingElasticity = 0.6 + rng.beta(5, 2) * 0.5;      // [0.6, 1.1]
    }

    // chinaTrue -- Beijing's true distance behind, and whether a deal exists.
    const chinaTrue = {
        position: clamp(rng.normal(0.8, 0.3), 0.2, 1.6),     // rung gap behind Halcyon
        dealPossible: rng.bernoulli(0.15),                    // treaty branch live only here
    };

    // Per-lab safety culture. Tianxia fixed low (anti-safety by construction).
    // Halcyon clamp [0.1, 0.9] per the sampler table; Polaris clamp [0, 1]
    // (02a Polaris-defaults block, ratified 2026-07-23).
    const labCulture = {
        halcyon: clamp(rng.normal(0.5, 0.2), 0.1, 0.9),
        polaris: clamp(rng.normal(0.8, 0.1), 0, 1),
        tianxia: 0.15,
    };

    // Polaris spawn day ~ round(N(400, 25)) clamped [300, 500] (02a
    // Polaris-defaults block). Calibration-neutral -- Halcyon leads regardless.
    const polarisSpawnDay = Math.round(clamp(rng.normal(400, 25), 300, 500));

    return {
        seed,
        tau,
        takeoffSharpness,
        sharpnessNorm,
        scalingElasticity,
        chinaTrue,
        labCulture,
        polarisSpawnDay,
    };
}
