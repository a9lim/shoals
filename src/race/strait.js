/* ===================================================
   src/race/strait.js -- The Taiwan-strait generator
   (overhaul phase 5a): gray-zone incidents and the
   blockade tail, the race's physical single point of
   failure (02-race-model.md; 02a "Strait" block).

   Cambria's fabs sit in Hsinchu, a hundred miles from the
   coast Beijing drills off of. Gray-zone incidents are
   recurring risk-premium machinery; in some runs the tail
   fires and a blockade sets `geopolitical.taiwanBlockade`
   (the Taiwan/compute chokepoint -- NEVER the Gulf arc's
   `straitClosed`/Hormuz), triggering compute-market
   force-majeure through the existing curve, adding heat,
   and opening the mobilization gate.

   TWO STRAITS, TWO FLAGS (02a): this generator drives ONLY
   the Taiwan-blockade race-layer flag (mirrored to
   `geopolitical.taiwanBlockade` by main.js). It never
   touches Hormuz.

   Module boundary: DOM-free, headless-importable for the MC
   calibration harness. Draws ONLY from `race.streams.strait`
   (its own named substream via deriveSeed(seed,'strait')),
   so it perturbs no other subsystem's trajectory for a given
   seed. It DOES have race-level effects (02a mandates them):
   a blockade adds heat and opens the mobilization gate -- the
   heat term is a REVERSIBLE overlay (`heat.strait`, cleared
   when the blockade lifts), applied AFTER the caller's
   pre-tick heat snapshot so it takes effect next tick (the
   option-a convention shared with commitRelease/commitTheft).

   The 3% baseline / 12-15% hot-desperate blockade incidence
   is a CALIBRATION TARGET (02a), harness-asserted; the
   blockade DURATION model (Exp(45d) clamped [20,120]) is
   RATIFIED in 02a's phase-5a block. Gray-zone detections and
   blockade start/end are RECORDED in the ledger; the race
   bridge fires their narrative.
   =================================================== */

import { strategicDesperation } from './capability.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Knuth Poisson (matches incidents.js); Λ is small so the loop is cheap. */
function poisson(rng, lambda) {
    if (lambda <= 0) return 0;
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rng.next(); } while (p > L);
    return k - 1;
}

// ---- Gray-zone constants (02a: ~Poisson(1/90d)·(1+heat)·tension) -----------
const GRAY_MEAN = 90;   // per-day gray-zone rate = (1/90)·(1+heat)·tension

// ---- Blockade constants (02a target: ~3% baseline -> 12-15% hot/desperate) --
// The blockade hazard FORM is ratified in 02a's phase-5a/phase-6 block:
//   h_block/day = BASE · (1 + heat) · (TENSION_FLOOR + TENSION_W·tension)
//                       · (DESP_FLOOR + DESP_W·desperation)
// where `desperation` is the SHARED strategic-desperation quantity (02a phase-6
// amendment; strategicDesperation in capability.js) -- max(velocity deficit,
// post-ignition runaway), replacing rev-1's raw internal gap (which the fast-
// follower bounded near the release lag, so it stopped meaning desperation).
// STRAIT_TUNING.blockadeBase recalibrates against the UNCHANGED incidence band
// (~3% baseline / 12-15% hot -- the design invariant) under the new desperation
// distribution. Exported mutable so the joint sweep can drive it.
export const STRAIT_TUNING = { blockadeBase: 0.000052 };   // recalibrated: 3.0% baseline / 14.7% hot (rev1 0.0000355 gave 1.9%/10.2% under new desperation)
const BLOCKADE_TENSION_FLOOR = 0.5;
const BLOCKADE_TENSION_W = 2.05;   // tension leverage (calm 0.5 -> tense 2.55, ~5x hazard)
const BLOCKADE_DESP_FLOOR = 0.4;
const BLOCKADE_DESP_W = 1.4;

// Heat the blockade adds while active (02a: "heat +0.20"). Reversible overlay.
export const BLOCKADE_HEAT = 0.20;

// Blockade duration (RATIFIED, 02a phase-5a block): Exp(mean 45d) clamped
// [20, 120]. Blockades END -- the flag, the heat overlay, and the compute
// force-majeure all lift when the duration elapses.
const BLOCKADE_DURATION_MEAN = 45;
const BLOCKADE_DURATION_MIN = 20;
const BLOCKADE_DURATION_MAX = 120;

/** Public strait tension in [0,1] from the China proxies. FACTORED here as the
 *  single shared source (02a: "factor that helper to one shared source") --
 *  compute-market.js re-exports it via this module so the compute curve and the
 *  blockade hazard read tension identically. Reads ONLY public geopolitical
 *  facts (chinaRelations, tradeWarStage), never hidden race truth. A null `geo`
 *  (headless / Classic / calm) reads as tension 0. */
export function straitTension(geo) {
    if (!geo) return 0;
    const china = clamp(-(geo.chinaRelations || 0) / 3, 0, 1);   // worse relations -> higher tension
    const trade = clamp((geo.tradeWarStage || 0) / 4, 0, 1);
    return clamp(0.6 * china + 0.4 * trade, 0, 1);
}

/**
 * Step the Taiwan-strait process one completed day. Draws only from
 * `race.streams.strait`. Reads pre-tick `heat` (heatPre, the option-a snapshot)
 * and `tension` (from inputs, computed off public geo by the caller). Mutates:
 *   - race.taiwanBlockade (the race-layer flag; main.js mirrors to geo)
 *   - race.heat.strait     (reversible heat overlay; 0 or BLOCKADE_HEAT)
 *   - race.straitBlockade  ({ active, startDay, endDay })
 *   - race.mobilizationGateOpen (latched true on a blockade start)
 * Returns the ledger slice { grayZone:[...], blockadeStart|null, blockadeEnd|null }.
 *
 * Gray-zone incidents are treated as public scares (detected on occurrence) and
 * fired narratively by the bridge; the blockade start is a superevent, the end a
 * relief beat.
 *
 * @param {object} race    race state
 * @param {number} day     interval-start day
 * @param {number} endDay  completed day boundary (stamp)
 * @param {number} heat    START-of-tick heat (heatPre)
 * @param {number} tension public strait tension in [0,1] (0 headless)
 */
export function stepStrait(race, day, endDay, heat, tension) {
    const rng = race.streams.strait;
    const grayZone = [];
    let blockadeStart = null, blockadeEnd = null;
    const bl = race.straitBlockade;

    // 1. An active blockade may END (duration elapsed): lift the flag + heat overlay.
    if (bl && bl.active) {
        if (endDay >= bl.endDay) {
            bl.active = false;
            race.taiwanBlockade = false;
            race.heat.strait = 0;
            blockadeEnd = { id: `strait_end_${endDay}`, day: endDay, startDay: bl.startDay };
        }
        // While a blockade is active, no gray-zone escalation / new blockade rolls.
        return { grayZone, blockadeStart, blockadeEnd };
    }

    // 2. Gray-zone incidents (public scares): Poisson((1/90)·(1+heat)·tension).
    const lamGz = (1 / GRAY_MEAN) * (1 + heat) * tension;
    const nGz = poisson(rng, lamGz);
    for (let j = 0; j < nGz; j++) {
        grayZone.push({ id: `strait_gz_${endDay}_${j}`, day: endDay, tension });
    }

    // 3. Blockade tail. desperation = the shared strategic-desperation quantity
    //    (velocity deficit OR post-ignition runaway), NOT the fast-follower-bounded
    //    raw gap. Blockades now concentrate in slow-velocity worlds -- intended,
    //    anti-correlated with family 4 (the tail fires where China was losing).
    const tianxia = race.capability.labs.tianxia;
    if (tianxia && tianxia.active) {
        const desperation = strategicDesperation(race.capability);
        const hazard = STRAIT_TUNING.blockadeBase
            * (1 + heat)
            * (BLOCKADE_TENSION_FLOOR + BLOCKADE_TENSION_W * tension)
            * (BLOCKADE_DESP_FLOOR + BLOCKADE_DESP_W * desperation);
        if (rng.next() < 1 - Math.exp(-hazard)) {
            const dur = Math.round(clamp(rng.exponential(BLOCKADE_DURATION_MEAN),
                BLOCKADE_DURATION_MIN, BLOCKADE_DURATION_MAX));
            race.taiwanBlockade = true;
            race.heat.strait = BLOCKADE_HEAT;     // takes effect next tick (post pre-tick snapshot)
            race.mobilizationGateOpen = true;     // 02a: a blockade opens the mobilization gate
            race.straitBlockade = { active: true, startDay: endDay, endDay: endDay + dur };
            blockadeStart = { id: `strait_block_${endDay}`, day: endDay, duration: dur, tension };
        }
    }

    return { grayZone, blockadeStart, blockadeEnd };
}

/** Fresh strait state (called from resetRaceState). No blockade at run start. */
export function freshStraitState() {
    return { active: false, startDay: null, endDay: null };
}
