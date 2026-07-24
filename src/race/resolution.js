/* ===================================================
   src/race/resolution.js -- Terminal-state selection for
   the hidden AI-race (overhaul phase 6, endings round 1).

   ONE precedence ladder, checked continuously (02 "Resolution";
   02a "Resolution arithmetic and the exclusive mapping"),
   exclusive, in order:
     1. S4 incident            -> family 3 (resolved in place)
     2. implemented treaty     -> family 5 (the Deal)
     3. confirmed plateau      -> family 6 (the fizzle)
     4. R5 crossing            -> race outcome (family 1/2/3/4)
     5. day-1008 timeout       -> forward extrapolation (no seventh
                                  family; resolves into one of the six)

   Resolution settles the ORTHOGONAL AXES first (terminal cause,
   crossing entity, technical alignment result, political control,
   treaty state) and stores them on `race.resolution`. The FAMILY
   is presentation, derived from the axes by the exclusive mapping
   (05: "families are presentation, not state"). Later rounds and
   the epilogue consume the stored axes and NEVER re-derive them.

   Once-per-run: `race.resolution` latches on the first fire, and a
   re-invocation is a no-op. The arithmetic (margin, lead, leadAdj,
   required, the exclusive mapping) is transcribed VERBATIM from
   02a -- constants and predicate structure copied literally.

   Pure / DOM-free -- headless-importable for tools/endings-test.mjs.
   =================================================== */

import { advanceRace, stepControlRegime, heatValue, freshTransitions, RETUNE } from './race-state.js';
import { frontierInternalCrossDay } from './consensus.js';
import { deterministicDrift } from './capability.js';
import { straitTension } from './strait.js';
import { stepTreaty } from './treaty-track.js';
import { freezeLedger } from './ledger.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ---- Horizon + extrapolation (02 / 05 timeout ruling) --------------------
export const HORIZON = 1008;          // game days 0..1008 (02a)
export const EXTRAP_CAP = 2520;       // hard cap on forward extrapolation days ("a decade of no ignition IS the fizzle")

// ---- Plateau confirmation (02a amended phase-6 rule) ---------------------
// Confirmation requires ALL of: recursion never ignited (q < 0.01 / E <= 0.60),
// R5 never crossed, day >= 700, and the SHOCK-FREE leader drift (deterministicDrift,
// the full retuned ODE drift without the daily shock) < 2e-4/day SUSTAINED over the trailing
// 180 trading days. An instantaneous reading is a SIGNAL, never a confirmation --
// the phase-6 gate caught a day-1 "confirmed" plateau because low-E runs sit under
// the drift threshold from the start (a stall is indistinguishable from being
// early except in hindsight). By construction most family-6 mass arrives via
// timeout extrapolation; in-horizon confirmations are the late, saturating tail.
const IGNITE_Q_FLOOR = 0.01;          // q < 0.01 => recursion never ignited (02a)
const PLATEAU_DRIFT_THRESHOLD = 0.0002;   // 02a: leader growth < 0.0002/day
const PLATEAU_MIN_DAY = 700;          // no in-horizon confirmation before day 700 (02a)
const PLATEAU_SUSTAIN_DAYS = 180;     // drift below threshold sustained this many trading days (02a)

// ---- Resolution arithmetic (02a -- VERBATIM) -----------------------------
//   margin   = S[leader] + leadAdj(lead)
//   lead     = C_int[leader] - max(C_int[others], C[open])
//   leadAdj  = -0.15*(1 - lead/0.10)          lead < 0.10
//            =  0                              0.10 <= lead <= 0.25
//            = +0.12*min((lead-0.25)/0.25, 1)  lead > 0.25    (continuous)
//   required = 0.22 + 0.35*(1-tau) + 0.08*sharpnessNorm
const LEAD_LO = 0.10;
const LEAD_HI = 0.25;
const LEAD_ADJ_NEG = 0.15;
const LEAD_ADJ_POS = 0.12;
const LEAD_POS_SCALE = 0.25;
const REQ_BASE = 0.22;
const REQ_TAU_W = 0.35;
const REQ_SHARP_W = 0.08;

// Exclusive terminal mapping thresholds (02a):
const FAIL_MARGIN = 0.15;   // technical failure: margin <= required - 0.15  (d <= -0.15)
const FAMILY1_LEAD = 0.25;  // family 1 requires lead >= 0.25 (no knife-edge vindication)

// Bounded influence (02a "margin units"): d_eff = d_W + clip(d_P, -(3/7)|d_W|, +(3/7)|d_W|).
// ROUND 2 wires the player complicity-ledger delta d_P; until then d_P = 0 => d_eff = d_W.
const PLAYER_CLIP_FRAC = 3 / 7;

const LABS = ['halcyon', 'tianxia', 'polaris'];
const ENTITIES = ['halcyon', 'tianxia', 'polaris', 'open'];

/** leadAdj piecewise-continuous (02a, verbatim). Continuous at 0.10 and 0.25. */
function leadAdj(lead) {
    if (lead < LEAD_LO) return -LEAD_ADJ_NEG * (1 - lead / LEAD_LO);
    if (lead <= LEAD_HI) return 0;
    return LEAD_ADJ_POS * Math.min((lead - LEAD_HI) / LEAD_POS_SCALE, 1);
}

/** Entity capability rows {id, C} across active labs + the open ecosystem. */
function entityRows(cap) {
    const rows = [];
    for (const id of LABS) {
        const lab = cap.labs[id];
        if (lab.active) rows.push({ id, C: lab.C_internal });
    }
    rows.push({ id: 'open', C: cap.open.C });
    return rows;
}

/** Frontier leader LAB OBJECT among LABS only (open has no drift dynamics), or
 *  null. Returns the lab itself (not an {id,C} view) so deterministicDrift receives
 *  the real lab -- passing a plain {id,C} makes deterministicDrift read no `active`
 *  and return 0, silently disabling the plateau drift test. */
function frontierLeaderLab(cap) {
    let best = null;
    for (const id of LABS) {
        const lab = cap.labs[id];
        if (lab.active && (best === null || lab.C_internal > best.C_internal)) best = lab;
    }
    return best;
}

/** The entity whose INTERNAL R5 crossing is earliest (terminal truth), or null.
 *  Reuses the crossing-DAY read from consensus.js for the gate; this resolves the
 *  crosser IDENTITY (a different return, not a duplicate of that helper). */
function firstR5Crosser(cap) {
    const day = frontierInternalCrossDay(cap, 5);
    if (!Number.isFinite(day)) return null;
    for (const id of ENTITIES) {
        const rec = (id === 'open') ? cap.open.rungInternal : cap.labs[id].rungInternal;
        if (rec[5] === day) return id;
    }
    return null;
}

/**
 * Settle the orthogonal axes from sampled + current state (05: settle axes first,
 * family is presentation). Computes leader / lead / margin / required / d_eff,
 * the R5 crosser, the technical alignment result, political control, the family-4
 * control disposition, and the sampled shadows the epilogue discloses.
 */
function computeAxes(race) {
    const cap = race.capability;
    const rows = entityRows(cap).sort((a, b) => b.C - a.C);
    const leader = rows[0];
    const second = rows[1] ? rows[1].C : rows[0].C;
    const lead = leader.C - second;

    const S_leader = leader.id === 'open' ? 0 : (race.safety[leader.id] ?? 0);
    const margin = S_leader + leadAdj(lead);
    const required = REQ_BASE + REQ_TAU_W * (1 - race.hidden.tau) + REQ_SHARP_W * race.hidden.sharpnessNorm;
    const d = margin - required;   // the ACTUAL threshold distance (world + player)

    // ---- Bounded influence (02a, VERBATIM): d_eff = d_W + clip(d_P, -(3/7)|d_W|,
    //      +(3/7)|d_W|). Decompose the player's attributable margin delta d_P:
    //   S-channel: cumulative player-added S to the LEADER's lab (raceEffects).
    //   C-channel: the leadAdj change from the player's cumulative dC to Halcyon
    //     (the coupling-integrated race.playerCumC), signed by Halcyon's rank --
    //     it raised Halcyon's C, so the LEADER's lead grew (Halcyon leads) or shrank
    //     (Halcyon is the binding second) or was unaffected (Halcyon neither).
    const dP_S = leader.id === 'open' ? 0 : (race.playerS ? (race.playerS[leader.id] || 0) : 0);
    const playerCumC = race.playerCumC || 0;
    let dP_C = 0;
    if (playerCumC !== 0) {
        let leadCF = lead;                                             // no-player counterfactual lead
        if (leader.id === 'halcyon') leadCF = lead - playerCumC;       // Halcyon leads: its lead shrinks without the player
        else if (rows[1] && rows[1].id === 'halcyon') leadCF = lead + playerCumC;   // Halcyon is the binding rival
        dP_C = leadAdj(lead) - leadAdj(leadCF);
    }
    const dP = dP_S + dP_C;
    const dW = d - dP;
    const dEff = dW + clamp(dP, -PLAYER_CLIP_FRAC * Math.abs(dW), PLAYER_CLIP_FRAC * Math.abs(dW));

    const crossingEntity = firstR5Crosser(cap);

    // Technical alignment result (05 axis) from d_eff vs the failure boundary.
    let alignmentResult;
    if (dEff <= -FAIL_MARGIN) alignmentResult = 'failure';
    else if (dEff > 0) alignmentResult = 'holds';
    else alignmentResult = 'marginal';

    // Family-4 control disposition (05 sub-axes), keyed on the R5 crosser:
    //   open crosser        -> proliferation (nobody won -- the weights did)
    //   Tianxia crosser     -> aligned-to-Beijing when alignment holds/marginal;
    //                          a Tianxia FAILURE renders as family 3 with subtitles.
    //   domestic crosser    -> null (family 1/2/3, no China disposition)
    let controlDisposition = null;
    if (crossingEntity === 'open') controlDisposition = 'proliferation';
    else if (crossingEntity === 'tianxia') controlDisposition = 'aligned-to-beijing';

    const h = race.hidden;
    return {
        leader: leader.id,
        leaderC: leader.C,
        lead,
        margin,
        required,
        dActual: d,        // world + player, pre-clip
        dW,                // world-only (d - d_P)
        dP,                // player-attributable (d_P_S + d_P_C)
        dP_S, dP_C,        // channel decomposition (S from raceEffects, C from coupling)
        d: dEff,           // clipped effective d used by the family mapping
        crossingEntity,
        alignmentResult,
        controlDisposition,
        chinaAligned: crossingEntity === 'tianxia' && alignmentResult !== 'failure',
        proliferation: crossingEntity === 'open',
        politicalControl: race.controlRegime,
        heat: heatValue(race.heat),
        treatyImplemented: race.treaty.implemented,
        // Sampled shadows (05: "show the sampled variables, or at least their
        // shadows") -- the epilogue discloses how narrow the world actually was.
        tau: h.tau,
        sharpnessNorm: h.sharpnessNorm,
        scalingElasticity: h.scalingElasticity,
        q: cap.q,
        dealPossible: h.chinaTrue.dealPossible,
        chinaPosition: h.chinaTrue.position,
    };
}

/** Assemble the resolution record from a family + terminal cause + computed axes,
 *  applying any per-family axis overrides. */
function makeRecord(race, family, terminalCause, extrapolated, axes, overrides = {}) {
    const ax = { ...axes, terminalCause, ...overrides };
    return {
        day: race.day,
        family,
        terminalCause,
        leader: ax.leader,
        crossingEntity: ax.crossingEntity,
        treatyState: {
            implemented: race.treaty.implemented,
            windowOpened: race.treaty.windowOpened,
            viable: race.hidden.chinaTrue.dealPossible,   // the secret viability (never a public tell)
            stage: race.treaty.stage,
        },
        d: ax.d,
        extrapolated: !!extrapolated,
        extrapolationDays: 0,   // set by the timeout path
        axes: ax,
    };
}

/**
 * Confirmed-plateau test (02a amended). Called once per completed day (evaluateLadder
 * runs once per day, live and extrapolated), so it maintains the sustained-drift
 * streak here: the leader's shock-free drift below threshold increments the streak,
 * above it resets. Confirmation = never-ignited (q < 0.01) AND R5 never crossed AND
 * day >= 700 AND the streak has reached the 180-day sustain window. Instantaneous
 * readings feed the streak but never confirm alone (the day-1 bug this rule kills).
 */
function plateauConfirmed(race) {
    const cap = race.capability;
    // Maintain the sustained-drift streak every day (once per day by construction).
    // Read THE shared deterministic drift WITH all phase-6 modifiers (velocity, drag,
    // follower, AND the live player coupling) -- omitting any under-reads the leader
    // and false-latches plateaus. The player-coupling omission was the P6-2 P0 gate
    // find (same class as the P6-1b re-gate labExpectedDrift bug): if sustained capital
    // is the only thing holding Halcyon's drift above threshold, the race has NOT
    // plateaued (02a P6-2 ruling 3). `race.playerCoupling` is 0 on the unfed/headless
    // path, so deterministicDrift's Halcyon guard is falsy and this stays bit-identical.
    // The regime feeds leg B; RETUNE feeds legs B/2; playerCoupling feeds the Halcyon leg.
    const leader = frontierLeaderLab(cap);
    const drift = leader
        ? deterministicDrift(cap, leader, race.day,
            { regime: race.controlRegime, deltaSup: RETUNE.delta_sup, followerKf: RETUNE.k_f,
                playerCoupling: race.playerCoupling,
                // Export controls (evidence machinery round) dampen TIANXIA's compute
                // leg. When Tianxia is the leader, omitting the stage would over-read
                // its drift and DELAY a real plateau -- the mirror of the P6-2
                // playerCoupling omission. Kinematics and detector price ONE drift, so
                // the detector reads the stage advanceRace stored this tick. 0 headless.
                exportControlStage: race.exportControlStage })
        : Infinity;
    if (drift < PLATEAU_DRIFT_THRESHOLD) race.plateauStreak = (race.plateauStreak || 0) + 1;
    else race.plateauStreak = 0;
    // Confirmation gates (all required):
    if (cap.q >= IGNITE_Q_FLOOR) return false;                        // recursion ignited -> not a fizzle
    if (frontierInternalCrossDay(cap, 5) <= race.day) return false;   // R5 crossed -> family 1-4, not 6
    if (race.day < PLATEAU_MIN_DAY) return false;                     // no confirmation before day 700
    return race.plateauStreak >= PLATEAU_SUSTAIN_DAYS;                // sustained 180 trading days
}

/** The R5-crossing race outcome (02a step 4, exclusive mapping). */
function raceOutcomeRecord(race, extrapolated) {
    const ax = computeAxes(race);
    let family;
    if (ax.d <= -FAIL_MARGIN) {
        family = 3;                                     // technical failure regardless of leader
    } else if (ax.leader === 'tianxia' || ax.leader === 'open') {
        family = 4;                                     // Tianxia / C[open] leader, non-failure -> control axis
    } else {
        // Domestic leader (halcyon/polaris): family 1 requires a real lead AND
        // margin over requirement (no knife-edge vindication); else the gradient.
        family = (ax.lead >= FAMILY1_LEAD && ax.d > 0) ? 1 : 2;
    }
    return makeRecord(race, family, 'r5-crossing', extrapolated, ax);
}

/**
 * Evaluate the precedence ladder steps 1-4 for the current race day. Returns a
 * resolution record or null. `extrapolated` stamps the record's provenance (the
 * timeout path passes true). Steps are EXCLUSIVE and IN ORDER.
 */
function evaluateLadder(race, extrapolated) {
    // 1. S4 incident -> family 3 (resolved in place). Consumes the detection ledger
    //    (never state-diffs); S4 self-discloses same-tick, so it is present here the
    //    tick it fires. alignmentResult forced to 'failure' -- the S4 IS the failure.
    const detected = (race.lastTransitions && race.lastTransitions.incidents)
        ? race.lastTransitions.incidents.detected : [];
    const s4 = detected.find(d => (d.severity ?? 0) >= 4);
    if (s4) {
        const ax = computeAxes(race);
        return makeRecord(race, 3, 's4-incident', extrapolated, ax,
            { alignmentResult: 'failure', s4Source: s4.source });
    }

    // 2. Implemented treaty -> family 5 (the Deal). Terminal; no ongoing dynamics.
    if (race.treaty.implemented) {
        const ax = computeAxes(race);
        return makeRecord(race, 5, 'treaty', extrapolated, ax, { alignmentResult: 'deal' });
    }

    // 3. Confirmed plateau -> family 6 (the fizzle). Pre-R5, non-ignited only.
    if (plateauConfirmed(race)) {
        const ax = computeAxes(race);
        return makeRecord(race, 6, 'plateau', extrapolated, ax, { alignmentResult: 'fizzle' });
    }

    // 4. R5 crossing -> race outcome (family 1/2/3/4).
    if (frontierInternalCrossDay(race.capability, 5) <= race.day) {
        return raceOutcomeRecord(race, extrapolated);
    }

    return null;
}

/**
 * Timeout extrapolation (02 / 05 ruling): a run still racing at day 1008 gets no
 * seventh family. Continue the EXISTING race streams headless (no events, market,
 * or player -- advanceRace + the treaty gauntlet only) until the ladder fires,
 * hard-capped at +EXTRAP_CAP days; at the cap, a decade of no ignition IS the
 * fizzle -> family 6. Deterministic continuation (same-seed same-result): draws
 * only from the existing substreams, never a new one. The same entry point serves
 * future player-terminal states (round 3 wires ejection / conviction / ruin).
 *
 * @param {object} race  race state at/after the horizon
 * @param {object|null} geo  frozen public geopolitics (for straitTension); null headless
 */
function extrapolate(race, geo) {
    const startDay = race.day;
    const tension = straitTension(geo);   // frozen public tension; 0 headless
    // Export-control stage: FROZEN at the value the live world last passed, exactly
    // as `tension` freezes the live public geopolitics (the policy world stops at the
    // moment the desk's story ends; the physical world keeps running). Captured ONCE
    // here and re-passed every extrapolated tick -- advanceRace normalizes an absent
    // stage to 0, so re-passing is what keeps the captured value in force. 0 headless.
    const exportStage = race.exportControlStage || 0;
    // ABSOLUTE cap (02a P6-3 ruling 2): the world continues to a FIXED endpoint
    // (HORIZON + EXTRAP_CAP), never a decade past whenever the DESK happened to leave.
    // For the timeout path startDay == HORIZON, so this is byte-identical to the old
    // `startDay + EXTRAP_CAP` loop (the no-player calibration is unchanged); for an
    // early player-terminal ejection it extrapolates to the same endpoint a later
    // ejection would, so the binary book settles against ONE world -- desk presence
    // never changes the oracle.
    const capDay = HORIZON + EXTRAP_CAP;
    while (race.day < capDay) {
        advanceRace(race, { straitTension: tension, exportControlStage: exportStage });
        // Neutral-signal control-regime stepping (02a phase-6 ruling): the
        // political-control axis reads the EXTRAPOLATED world, not the day the
        // desk's story ended. "Neutral" == no exogenous pushes (exo {}); the
        // endogenous ratchet carries it, exactly as headless / the harness.
        stepControlRegime(race, {});
        stepTreaty(race, {});             // treatyStage 0 -- no events during extrapolation
        const rec = evaluateLadder(race, true);
        if (rec) {
            rec.extrapolationDays = race.day - startDay;
            return rec;
        }
    }
    // Cap reached: confirmed plateau (fizzle) regardless of the drift test.
    const ax = computeAxes(race);
    const rec = makeRecord(race, 6, 'plateau-cap', true, ax, { alignmentResult: 'fizzle', hitCap: true });
    rec.extrapolationDays = race.day - startDay;
    return rec;
}

/**
 * The one entry point. Evaluate the precedence ladder for the current race day;
 * on the first fire, LATCH the record on `race.resolution` and return it. A
 * re-invocation after resolution is a no-op (returns null, mutates nothing) --
 * resolution is once-per-run. At the day-1008 timeout with nothing yet resolved,
 * runs the forward extrapolation (which advances the live race and latches).
 *
 * Invoked by the orchestrator (main.js) and the harness AFTER advanceRace +
 * stepControlRegime + stepTreaty, so `race.lastTransitions` is this tick's ledger.
 *
 * @param {object} race     race state
 * @param {object|null} geo public geopolitics (frozen during extrapolation); null headless
 * @returns {object|null}   the resolution record on the resolving call, else null
 */
export function checkResolution(race, geo = null) {
    if (!race || race.resolution) return null;   // latched -> no-op

    let rec = evaluateLadder(race, false);
    // Step 5: day-1008 timeout -> forward extrapolation into one of the six.
    if (!rec && race.day >= HORIZON) rec = extrapolate(race, geo);
    if (rec) return _latch(race, rec);
    return null;
}

/**
 * The terminal latch (09): seal the complicity ledger BEFORE any terminal marking --
 * the record is final at the moment the world resolves; the P6-3 closeout may change
 * the wealth score but can never create/erase/launder a channel. Then mark
 * race.resolution and clear the per-tick ledger (no stale-ledger bridge replay),
 * PRESERVING the treaty-outcome stamp (a Deal resolves on the same tick it implements,
 * and the bridge still fires treaty_holds once). Shared by checkResolution (timeout /
 * mid-run) and resolveNow (player-terminal ejection) so the freeze-before-marking
 * ordering is identical on both paths.
 */
function _latch(race, rec) {
    freezeLedger();
    race.resolution = rec;
    const outcome = race.lastTransitions ? race.lastTransitions.treatyOutcome : undefined;
    race.lastTransitions = freshTransitions();
    if (outcome) race.lastTransitions.treatyOutcome = outcome;
    return rec;
}

/**
 * Force terminal resolution NOW for a PLAYER-TERMINAL ejection (P6-3): the desk's
 * story can end before the world's (margin call, indictment, forced-out, firm
 * collapse, whistleblower). The world is extrapolated forward from the CURRENT day
 * through the EXISTING extrapolate() path (advanceRace + treaty + neutral regime +
 * ladder; draws only from existing substreams, so same-seed deterministic), then
 * latched exactly as checkResolution does (freezeLedger before marking). Idempotent:
 * returns the already-latched record if the world resolved first (mid-run, or the
 * day-1008 timeout). By the time this runs the current tick's checkResolution has
 * already fired in the race pipeline, so a null resolution means the world is still
 * racing -> extrapolate.
 *
 * @param {object} race     race state
 * @param {object|null} geo public geopolitics (frozen during extrapolation); null headless
 * @returns {object}        the (new or existing) resolution record
 */
export function resolveNow(race, geo = null) {
    if (!race) return null;
    if (race.resolution) return race.resolution;
    const rec = extrapolate(race, geo);
    return _latch(race, rec);
}

/** Read-only accessor for the latched record (round 3 / epilogue consume it). */
export function getResolution(race) {
    return (race && race.resolution) || null;
}
