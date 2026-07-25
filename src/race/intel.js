/* ===================================================
   src/race/intel.js -- chinaTrue intelligence reads
   (P7-3, 2026-07-24).

   04's "China posterior as tradeable as the timeline",
   made mechanical: the hidden per-run Tianxia velocity
   multiplier (sampler.js, `hidden.chinaTrue.velocity`) is
   BUCKETED into three qualitative reads -- behind /
   matched / quietly faster -- and each intel BEAT reports
   that bucket with sampled reliability: p = 0.7 the read
   is true, else it lands ONE bucket off. Never inverted
   two notches: a genuinely-behind program is never
   reported as faster, and vice versa. Assessments are
   wrong at the edges, not backwards.

   THREE binding disciplines (02a P7-3 semantics item 4):

   1. NARRATIVE-ONLY. An intel read folds no `B`, mutates
      no race dial, and bakes in no faction shift. The
      player's China posterior is theirs to trade; the
      report is texture with an edge in it, not a signal
      the machinery has already priced.
   2. The velocity ITSELF is never printed -- only the
      bucket. Same discipline as the theft record's `thief`
      field: the number is truth the world does not have.
   3. The reliability stream lives OUTSIDE `race.streams`
      -- a module-local RNG from
      `createRng(deriveSeed(seed, 'intel'))`, the
      closeout / nationalization precedent -- so race
      trajectories are BIT-IDENTICAL whether intel beats
      fire or not (harness-asserted). THE DRAW CONTRACT
      (ruling 11, tightened at the sol gate): while the
      channel is ACTIVE, every call takes EXACTLY TWO draws
      -- taken BEFORE the hidden truth is validated, so an
      unresolvable read advances the stream exactly like a
      resolvable one. The stream's position then depends
      only on how many times the channel was asked, never
      on what it was able to answer. An INACTIVE channel
      (no stream) draws nothing, because there is nothing
      to draw from.

   Pure / DOM-free -- headless-importable. Singleton
   mirroring belief.js / consensus.js / compute-market.js:
   initIntel at Dynamic init/reset, deactivateIntel in
   Classic.
   =================================================== */

import { createRng, deriveSeed } from './rng.js';

// ---- Buckets (02a: bucket the velocity at 0.90 / 1.10) --------------------
// The sampled velocity range is [0.75, 1.325] (VELOCITY_TUNING), so all three
// buckets carry real mass. Edges belong to the UPPER bucket (v >= 0.90 reads
// matched; v >= 1.10 reads faster).
export const INTEL_LO = 0.90;
export const INTEL_HI = 1.10;
export const INTEL_BUCKETS = ['behind', 'matched', 'faster'];
/** Probability an intel beat reports the TRUE bucket (02a). */
export const INTEL_TRUTH_PROB = 0.7;

/** Bucket a velocity multiplier. Pure; null for a non-finite input. */
export function velocityBucket(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    if (v < INTEL_LO) return 'behind';
    if (v < INTEL_HI) return 'matched';
    return 'faster';
}

// ---- Singleton reliability stream ----------------------------------------

let _rng = null;

/** Build the intel reliability stream for a race (Dynamic init/reset). Its seed
 *  is derived OUTSIDE race.streams by design -- see the header. */
export function initIntel(race) {
    _rng = race ? createRng(deriveSeed(race.seed, 'intel')) : null;
}

/** In-place reset (singleton-reset convention). Same code path as init. */
export function resetIntel(race) {
    initIntel(race);
}

/** Classic mode: no intel channel. */
export function deactivateIntel() {
    _rng = null;
}

/** True while the intel channel is live (Dynamic modes). */
export function intelActive() {
    return _rng !== null;
}

/**
 * Draw ONE intel beat's read of Beijing's true pace. Returns
 * `{ bucket, truthful }` -- `bucket` is what the report SAYS (the only thing any
 * prose may render), `truthful` is whether it matches the hidden truth (for the
 * harness and for later rounds that might score an analyst; never rendered).
 * Null when the channel is inactive, or when the race carries no readable hidden
 * velocity (the caller then falls back to the 'matched' pool -- ruling 15).
 *
 * THE DRAW CONTRACT (ruling 11, tightened at the sol gate): while the channel is
 * ACTIVE the two draws are taken FIRST, BEFORE the hidden truth is validated, so
 * an unresolvable read advances the stream exactly like a resolvable one. The
 * stream's position depends only on how many times the channel was ASKED -- never
 * on what it was able to answer, which is the property that makes the position
 * predictable from the beat count alone. An INACTIVE channel draws nothing (there
 * is no stream to draw from) and is the one path that returns without advancing.
 */
export function intelRead(race) {
    if (!_rng) return null;                  // inactive channel: nothing to draw from
    const uReliable = _rng.next();           // both draws taken BEFORE validation
    const uDirection = _rng.next();
    if (!race || !race.hidden || !race.hidden.chinaTrue) return null;
    const truth = velocityBucket(race.hidden.chinaTrue.velocity);
    if (!truth) return null;
    if (uReliable < INTEL_TRUTH_PROB) return { bucket: truth, truthful: true };
    // Noise: exactly ONE bucket off. 'behind' and 'faster' have a single
    // neighbour; 'matched' picks a side. The two-notch inversion is impossible.
    let bucket;
    if (truth === 'behind' || truth === 'faster') bucket = 'matched';
    else bucket = (uDirection < 0.5) ? 'behind' : 'faster';
    return { bucket, truthful: false };
}
