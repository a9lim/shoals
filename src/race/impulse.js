/* ===================================================
   src/race/impulse.js -- Decaying event-impulse overlay
   for the race->market coupling (overhaul phase 4).

   THE PROBLEM this replaces (03 "Incident coupling rule",
   ruled 2026-07-23): the detected-incident + release +
   certification stream is high-volume by design (~80-160
   fired events/run). Permanent additive `sim` parameter
   deltas (the prototype's convention) walk every parameter
   to its clamp over a run -- the phase-2 gate measured the
   pre-zero placeholders driving `xi` 0.4->1.196 and pinning
   `lambda` at its clamp inside ONE run. So race market
   effects must be DECAYING IMPULSES, never permanent deltas.

   THE MECHANISM: a small accumulator of param impulses
   (mu / xi / theta / lambda / ...) that
     - is fed by `addEventImpulse(deltas, scale)` when a race
       event fires (from the race bridge),
     - DECAYS geometrically once per day (`decayEventImpulses`),
     - is applied as an OVERLAY around the day's substeps
       (`applyEventImpulseOverlay` at beginDay ->
        `removeEventImpulseOverlay` at day complete), exactly
       like price-impact.js's Layer-3 `_playerParamShifts`.

   Because it is apply-then-restore, `sim` parameters are
   NEVER permanently mutated: an impulse shifts the drift/vol
   for the days it is active, then fades, and the parameter
   returns to baseline. It COMPOSES with the Layer-3 param
   overlay (both applied in frame()) and with the sim.S price-
   level impact overlay (which is a read-time overlay on the
   price, orthogonal to these dynamics-param overlays).

   Pure / DOM-free -- headless-importable for the P4 harness
   (belief-test.mjs asserts no permanent param drift over a
   full run). Mirrors price-impact.js conventions.

   UNRATIFIED (02a records "impact ... magnitudes as rev 1"
   but rev 1's numbers are not transcribed): the impulse
   half-life and the per-event impulse magnitudes are taken
   from the race-events.js `// P4 coupling reference:` sign
   intents; listed in the phase-4 report for ratification.
   =================================================== */

import { PARAM_RANGES } from '../events/param-ranges.js';

/** Impulse decay half-life in trading days (UNRATIFIED). A race event's market
 *  push fades to half in this many days, ~gone in ~4 half-lives (~3 weeks). */
export const IMPULSE_HALF_LIFE = 5;

/** The live impulse accumulator: param key -> signed pending delta. Only keys
 *  ever fed appear; everything else is treated as 0. */
const _impulse = {};

/** Lightweight audit trail (last few impulse seeds) -- not load-bearing, but
 *  lets the P4 harness / debugging confirm what fed the overlay and when. */
const _seeds = [];
const _SEED_KEEP = 64;

const _decayFactor = Math.pow(0.5, 1 / IMPULSE_HALF_LIFE);
const _EPS = 1e-8;

/** Clamp an overlaid value to the canonical param range (avoids pushing e.g.
 *  theta below its floor or lambda negative mid-day -> pricing NaNs). Unknown
 *  keys pass through unclamped. */
function _clampParam(key, value) {
    const r = PARAM_RANGES[key];
    if (!r) return value;
    return Math.min(r.max, Math.max(r.min, value));
}

/**
 * Seed a decaying impulse from a race event's coupling. `deltas` is a
 * {param: delta} object (the race-event shell's `impulse` field); `scale` lets
 * the caller attenuate it (e.g. by (1 - eta*prePriceFrac) for Act-II alpha
 * decay, or by the player-net-delta coupling). Additive into the accumulator so
 * concurrent events stack (and then decay together).
 *
 * @param {object} deltas   {mu?, xi?, theta?, lambda?, ...} signed impulses
 * @param {number} [scale]  multiplier (default 1)
 * @param {object} [meta]   optional {id, day, cause} for the audit trail
 */
export function addEventImpulse(deltas, scale = 1, meta = null) {
    if (!deltas || scale === 0) return;
    for (const k in deltas) {
        const d = deltas[k] * scale;
        if (!d) continue;
        _impulse[k] = (_impulse[k] || 0) + d;
    }
    if (meta) {
        _seeds.push({ ...meta, scale });
        if (_seeds.length > _SEED_KEEP) _seeds.shift();
    }
}

/** Decay every pending impulse one day toward zero; snap tiny residuals to 0.
 *  Call ONCE per completed day (beside decayParamShifts in the day-complete
 *  pipeline). */
export function decayEventImpulses() {
    for (const k in _impulse) {
        _impulse[k] *= _decayFactor;
        if (Math.abs(_impulse[k]) < _EPS) _impulse[k] = 0;
    }
}

/**
 * Apply the impulse overlay to `sim` for the coming day's substeps. Returns the
 * saved originals so `removeEventImpulseOverlay` can restore them -- the
 * parameter is NEVER permanently changed (that is the whole point). Overlaid
 * values are clamped to PARAM_RANGES. Mirrors price-impact.applyParamOverlays.
 */
export function applyEventImpulseOverlay(sim) {
    const saved = {};
    for (const k in _impulse) {
        if (_impulse[k] === 0) continue;
        if (!(k in sim)) continue;
        saved[k] = sim[k];
        sim[k] = _clampParam(k, sim[k] + _impulse[k]);
    }
    return saved;
}

/** Restore the params the overlay shifted. */
export function removeEventImpulseOverlay(sim, saved) {
    for (const k in saved) sim[k] = saved[k];
}

/** Snapshot of the current impulse accumulator (for UI / audit / tests). */
export function currentEventImpulse() {
    return { ..._impulse };
}

/** Total absolute impulse magnitude -- a cheap "is anything live" probe. */
export function eventImpulseMagnitude() {
    let s = 0;
    for (const k in _impulse) s += Math.abs(_impulse[k]);
    return s;
}

/** Recent impulse-seed audit records (most recent last). */
export function eventImpulseSeeds() {
    return _seeds.slice();
}

/** Reset the overlay to quiescent. Call from _resetCore (mirrors
 *  resetImpactState). */
export function resetEventImpulses() {
    for (const k in _impulse) delete _impulse[k];
    _seeds.length = 0;
}
