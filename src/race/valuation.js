/* ===================================================
   src/race/valuation.js -- HCN's race-implied level
   (02a "The valuation layer").

   A survival-conditioned expected terminal multiple,
   pooled the way `B` is from the two readers' family
   heads:

     V   = (1 - eta)*V_legible + eta*V_full
     V_x = sum_{k != 3} p_{x,k}*m_k / (1 - p_{x,3})

   Misalignment (family 3) gets no weight: the market
   prices the worlds in which its claims can be paid.
   The marks are the closeout's family marks, read from
   CLOSEOUT_TUNING so they live in one place. The clock
   enters only through the readers. No continuous
   capability, latent truth or sim state enters this
   surface. The orchestrator applies the returned ratio
   to the authoritative process price.

   Pure / DOM-free valuation plus one live-run singleton.
   =================================================== */

import { familyHeads } from './belief.js';
import { CLOSEOUT_TUNING } from './closeout.js';

// 02a "The valuation layer": only the gap clamp. Mutable for headless sweeps.
export const VALUATION_TUNING = {
    ratioMin: 0.75,
    ratioMax: 1.30,
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** The family marks m_k (families 1..6; family 3 carries no weight). */
export function familyMarks() {
    const T = CLOSEOUT_TUNING;
    return { 1: T.meltUpWon, 2: T.meltUpDawn, 3: 0, 4: T.doomRecovery, 5: T.boring, 6: T.fizzleFloor };
}

/** One reader's survival-conditioned expected multiple from its family
 *  distribution `p` (index k - 1 is family k). */
export function valuationFromFamily(p) {
    const m = familyMarks();
    let num = 0;
    for (const k of [1, 2, 4, 5, 6]) num += p[k - 1] * m[k];
    return num / (1 - p[2]);
}

/** The pooled V from the two heads and eta (02a: a pool of the readers'
 *  survival-conditioned expectations, not of their family probabilities). */
export function pooledValuation(heads) {
    return (1 - heads.eta) * valuationFromFamily(heads.legible) + heads.eta * valuationFromFamily(heads.full);
}

/** V today, from `B`'s cached family heads (public record, rule, day). */
export function computeValuation(race) {
    return race ? pooledValuation(familyHeads()) : 1;
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
