/* ===================================================
   src/race/valuation.js -- HCN's race-implied level
   (02a "The valuation layer", ratified 2026-10-24).

   A survival-conditioned expected terminal multiple:
   public claimed rungs set the Western lead, and B's
   unconditional R5 CDF sets the chance of finishing this
   term. The clock changes it only at the deadline, never
   by silently conditioning away elapsed time.
   No continuous capability, latent truth or sim
   state enters this surface. The orchestrator applies
   the returned ratio to the authoritative process price.

   Pure / DOM-free valuation plus one live-run singleton.
   =================================================== */

import { buildPublicView } from './consensus.js';
import { belief } from './belief.js';

// 02a "The valuation layer". Mutable for headless calibration sweeps.
export const VALUATION_TUNING = {
    mW: 1.40,
    mC: 0.35,
    mF: 0.55,
    lambda0: 1.0,
    leadScale: 0.75,
    deadline: 1000,
    ratioMin: 0.75,
    ratioMax: 1.30,
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/** Unconditional B probability of R5 by the term deadline. Pure: accepts the
 *  public belief law, not the race or a terminal-truth crossing record. */
export function r5ProbabilityFromBelief(rung, day, deadline = VALUATION_TUNING.deadline) {
    if (rung.crossed) return rung.certDay <= deadline ? 1 : 0;
    if (day >= deadline) return 0;
    return sigmoid((deadline - rung.m) / rung.w);
}

/** Expected terminal multiple from the public projection and unconditional Pi. */
export function valuationFromPublic(view, pi) {
    const T = VALUATION_TUNING;
    const r = view.claimedRung;
    const westernRung = Math.max(r.halcyon, r.polaris);
    const lead = sigmoid(T.lambda0 + (westernRung - r.tianxia) / T.leadScale);
    return pi * (lead * T.mW + (1 - lead) * T.mC) + (1 - pi) * T.mF;
}

/** Read only the public projection and B; no survival-conditioned quote decay. */
export function computeValuation(race) {
    const pi = r5ProbabilityFromBelief(belief.rungs[5], belief.day);
    return valuationFromPublic(buildPublicView(race), pi);
}

// Applied level, rather than yesterday's raw target: any clamped remainder
// must reach the tape on later days and stay in the terminal reconciliation.
let _previous = null;

/** Initialize after belief on day 0. Null race is the inert Classic path. */
export function initValuation(race) {
    _previous = race ? computeValuation(race) : null;
    return _previous;
}

/** Return the public target and the gap to apply; retain the applied level. */
export function stepValuation(race) {
    if (!race) return { V: 1, ratio: 1 };
    const V = computeValuation(race);
    if (_previous == null) {
        _previous = V;
        return { V, ratio: 1 };
    }
    const raw = V / _previous;
    const ratio = clamp(raw, VALUATION_TUNING.ratioMin, VALUATION_TUNING.ratioMax);
    _previous = raw === ratio ? V : _previous * ratio;
    return { V, ratio };
}

/** Last level actually embedded in the tape; pass this as terminal V_T. */
export function lastValuation() {
    return _previous;
}

/** Clear the live-run singleton on reset/mode change. */
export function resetValuation() {
    _previous = null;
}
