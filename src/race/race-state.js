/* ===================================================
   src/race/race-state.js -- The hidden AI-race state
   machine: sampler + two-track capability + the S and
   heat dials, advanced one trading day at a time.

   This is the latent truth under the narrative. Nothing
   reads it yet (phase 1 wires it in invisibly); later
   phases surface it through belief `B`, firm belief `F`,
   the incident generator, controlRegime, and the treaty
   branch -- stubbed here so they extend, not reshape.

   Five player-facing dials: C (capability, in
   capability.*), S (safety margin), heat, plus B and F
   (F lives here; belief.js builds B beside it in phase 4).

   Canonical mutation surface (Codex review round 2): the
   two discontinuous, race-coupled operations live here and
   ONLY here -- commitRelease (moves C_released, schedules
   certification, heats the proliferation floor) and
   commitTheft (the C discontinuity + heat floor + count +
   90d S-freeze). capability.js exports no function that
   bypasses them. The baseline release policy and any
   phase-2 replacement both go through commitRelease.

   Dynamics constants are transcribed from
   docs/design/02a-tuning.md (rev 2); the proliferation-
   floor / release-cooldown triple in RACE_TUNING is the
   one block 02a grants code-phase tuning freedom, now
   written back into 02a verbatim. Pure / DOM-free.
   =================================================== */

import { createRng, randomSeed, deriveSeed } from './rng.js';
import { sampleHiddenState } from './sampler.js';
import { stepIncidents, stepEvidence } from './incidents.js';
import { stepStrait, freshStraitState } from './strait.js';
import { registerTheft, stepTheftDisclosure, freshTheftQueue } from './theft-disclosure.js';
import {
    CONTROL_REGIMES, REGIME_RANK, desiredRegime, stepControlSignals, freshControlSignals,
} from './control-regime.js';
import {
    createCapabilityState, stepCapability, rollTheftDecision,
    scheduleCertification, stepCertification, frontierInternal,
    recordRungs, normalizeExportStage,
    C_MIN, C_MAX, OPEN_MIN, RELEASE_PULL, OPEN_LAG, CERT_RUNGS,
} from './capability.js';
import { freezeConsensus, isFreezeRegime } from './consensus.js';
import { freezeComputeMarket } from './compute-market.js';

// Re-export the control-regime enum so existing importers of race-state.js
// (main.js, harnesses) keep working after the definition moved to
// control-regime.js (one-way import, no cycle).
export { CONTROL_REGIMES, REGIME_RANK };

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ---- Dial constants (02a) ------------------------------------------------

// dS/dt = 0.0009*culture*(1 - 0.8*heat) - 0.0012*racingPace
const S_ACCUM = 0.0009;       // culture-driven accumulation coefficient
const S_HEAT_SUPPRESS = 0.8;  // heat suppresses accumulation
const S_BURN = 0.0012;        // racing burns margin
const RACING_PACE_BASE = 0.30;

// S0 per lab (02a). Polaris' S0 (0.70) is set at spawn, not init.
const S0 = { halcyon: 0.50, tianxia: 0.15, polaris: 0.70, open: 0 };

const THEFT_S_FREEZE_DAYS = 90;   // post-theft: S accumulation zeroes race-wide 90d

// heat = transient + irreversibleFloor(proliferation + theft); only transient
// cools. theft adds +0.04/success to the permanent floor (02a).
const HEAT_TRANSIENT0 = 0.15;
const HEAT_FLOOR0 = 0;
const THEFT_FLOOR_IMPULSE = 0.04;

const F0 = 15;   // firm belief F in [0,100] starts 15 (02a)

/**
 * Code-phase tuning triple for the proliferation ratchet + release cadence
 * (the one block 02a grants tuning freedom). 02a's original
 * `min(0.05*tianxiaReleases, 0.35)` with no cooldown drove Tianxia to the cap
 * in ~95% of runs -- violating the knife-edge "ratchets bind sometimes, never
 * always" constraint. These values (now written into 02a verbatim) put the
 * proliferation floor at its cap in ~47% of runs -- a strict minority, inside
 * the 35-55% acceptance band. The object is mutable so the harness can sweep it.
 */
export const RACE_TUNING = {
    releaseCooldown: 45,   // trading days a lab must wait between releases (~9 weeks minimum cadence)
    prolifInc: 0.016,      // proliferation floor increment per Tianxia release
    prolifCap: 0.30,       // proliferation floor cap (binds in ~47% of runs)
};

/**
 * Outcome-table retune levers (02a "Outcome-table levers", phase-6). Sanctioned
 * knobs that shape the terminal distribution WITHOUT touching the stance (tau,
 * required, leadAdj, the mapping gates). Exported mutable so the joint sweep can
 * drive it (mirrors RACE_TUNING); final values are recorded back into 02a.
 *   - a_c/a_p/L_pace : dynamic per-lab racingPace f(knife-edge proximity, heat
 *     pressure). racingPace = clamp(0.30 + (a_c*closeness + a_p*pressure)*(1-culture),0,1),
 *     closeness = clamp(1 - lead/L_pace, 0, 1) on the SIGNED lead (C[open] in the
 *     rival max), pressure = clamp((heat-0.30)/0.40, 0, 1). (1-culture) is the
 *     stance: high-culture labs resist racing when it gets close (Polaris the
 *     margin-carrier). Feeds the dS/dt burn only -- never capability.
 *   - k_f : Tianxia fast-follower coefficient (capability.js applies it; passed via
 *     advanceRace inputs). 0 disables it.
 *   - S0_tianxia : Tianxia initial safety (bought, not grown -- culture stays 0.15).
 */
/**
 * Outcome-table retune levers (02a phase-6 REDESIGNED set, 2026-07-24). The
 * withdrawn released-follower + S0-range package could not reach family-4 (P6-1b
 * finding); the ratified set produces family-4 leads from a sampled Tianxia
 * velocity (leg A, in sampler.js) + domestic regulatory drag under supervised
 * (leg B), preserves the margin by flooring Tianxia's S at its purchased base
 * (leg C), and fixes the |d|-tail with a burn taper (all labs, leg 6). Exported
 * mutable so the joint sweep can drive it. Final values recorded in 02a.
 *   - a_c/a_p/L_pace : dynamic per-lab racingPace (lever 1; feeds dS burn only).
 *   - k_f            : fast-follower GAP-BOUNDER (small; composes with leg A).
 *   - delta_sup      : domestic drift drag under a supervised regime (leg B).
 *   - S0_tianxia     : Tianxia purchased margin base AND burn floor (leg C).
 *   - S_taper        : burn-taper scale; burn *= clamp(S/S_taper,0,1) (leg 6).
 */
export const RETUNE = {
    a_c: 0.34,          // pace closeness coeff (swept down from the 0.45 guess -- 0.45 over-burned)
    a_p: 0.12,          // pace heat-pressure coeff (swept down: mutes the theft-heat -> deep-failure amplification)
    L_pace: 0.6,        // pace lead-closeness scale
    k_f: 0.03,          // fast-follower gap-bounder (small; composes with leg A)
    delta_sup: 0.09,    // domestic drift drag under supervised (leg B)
    S0_tianxia: 0.43,   // Tianxia purchased margin base + burn floor (leg C; within the [0.30,0.45] range)
    S_taper: 0.265,     // burn-taper scale (leg 6; compresses the deep-failure |d| tail)
};

// Domestic labs (drag under supervised; pace floor under mobilized+).
const DOMESTIC_LABS = new Set(['halcyon', 'polaris']);
// Mobilized+ regimes pin the domestic pace floor at 0.7 (the state races; margin burns).
const MOBILIZED_PLUS = new Set(['mobilized', 'nationalized', 'classified']);
const MOBILIZED_DOMESTIC_PACE_FLOOR = 0.7;

/**
 * Dynamic per-lab racingPace (02a phase-6 lever 1), deterministic. The recorded
 * `f(knife-edge proximity, appetite pressure)` made concrete:
 *   lead      = C_int[lab] - max(C_int[rivals], C[open])         (signed)
 *   closeness = clamp(1 - lead/L_pace, 0, 1)
 *   pressure  = clamp((heat - 0.30)/0.40, 0, 1)
 *   pace      = clamp(0.30 + (a_c*closeness + a_p*pressure)*(1 - culture), 0, 1)
 * A comfortable lead -> baseline pace -> S recovers (family 1 lives in runaway
 * worlds); a knife-edge -> corner-cutting -> S burns. (1 - culture) is the stance:
 * Tianxia (0.15) races almost fully when it is close, Polaris (0.8) barely.
 */
function racingPaceFor(cap, id, culture, heat, regime) {
    const self = cap.labs[id].C_internal;
    let rivalMax = cap.open.C;
    for (const other of ['halcyon', 'tianxia', 'polaris']) {
        if (other === id) continue;
        const lab = cap.labs[other];
        if (lab.active) rivalMax = Math.max(rivalMax, lab.C_internal);
    }
    const lead = self - rivalMax;                                   // signed
    const closeness = clamp(1 - lead / RETUNE.L_pace, 0, 1);
    const pressure = clamp((heat - 0.30) / 0.40, 0, 1);
    let pace = clamp(RACING_PACE_BASE + (RETUNE.a_c * closeness + RETUNE.a_p * pressure) * (1 - culture), 0, 1);
    // Leg B (mobilized+): the state races -- domestic pace floored at 0.7 (no drag,
    // margin burns instead). Inert in race-mc (regime stays 'private' there).
    if (DOMESTIC_LABS.has(id) && MOBILIZED_PLUS.has(regime)) pace = Math.max(pace, MOBILIZED_DOMESTIC_PACE_FLOOR);
    return pace;
}

/** Total heat = clamp(transient + floor + strait, 0, 1). The floor is a ratchet;
 *  `strait` is a REVERSIBLE blockade overlay (strait.js sets it to BLOCKADE_HEAT
 *  while a Taiwan blockade is active, back to 0 when it lifts). */
export function heatValue(heat) {
    return clamp(heat.transient + heat.floor + (heat.strait || 0), 0, 1);
}

/** Recompute the irreversible heat floor from proliferation + theft counts. */
function computeFloor(race) {
    return Math.min(RACE_TUNING.prolifInc * race.capability.labs.tianxia.releaseCount, RACE_TUNING.prolifCap)
        + THEFT_FLOOR_IMPULSE * race.theftCount;
}

/** Fresh empty per-tick transition ledger. Exported (P6) so the resolution latch
 *  can replace `race.lastTransitions` with an empty ledger -- killing stale-ledger
 *  replay through the race->narrative bridge once the run has terminally resolved. */
export function freshTransitions() {
    return {
        spawned: [], releases: [], thefts: [], crossings: [], certifications: [],
        // Phase-2 two-track ledgers. `occurred` is the silent latent track (the
        // bridge ignores it by design); `detected`/`published` are the legible
        // track the race->narrative bridge fires on.
        incidents: { occurred: [], detected: [] },
        evidence: { occurred: [], published: [] },
        // Phase-5a: strait beats (gray-zone scares, blockade start/end) and a
        // controlRegime transition, consumed by the bridge / main.js narrative.
        strait: { grayZone: [], blockadeStart: null, blockadeEnd: null },
        // Evidence machinery round: thefts that became PUBLIC today (the second
        // track; occurrence stays in `thefts` and stays silent). Rows carry the
        // SAMPLED public attribution, never the record's true one.
        theftDisclosures: [],
        regimeChange: null,   // { from, to } on a forward controlRegime move this tick
        // P6-2: this tick's player-attributable dC to Halcyon (the coupling's
        // Halcyon-C contribution). main.js ledgers it under the C channel; 0 headless.
        playerDeltaC: 0,
    };
}

// ---- Construction / reset ------------------------------------------------

/**
 * Create a fresh race state from `seed` (a fresh seed is drawn if omitted).
 * The composition is done in resetRaceState so the two share one code path.
 */
export function createRaceState(seed) {
    const race = {};
    resetRaceState(race, seed);
    return race;
}

/**
 * Reset the race state IN PLACE (singleton-reset convention -- the caller's
 * `raceState` reference stays stable, mirroring portfolio / faction-standing).
 * Re-samples the hidden world from a fresh (or given) seed.
 */
export function resetRaceState(race, seed) {
    if (seed == null) seed = randomSeed();
    seed = seed >>> 0;

    const hidden = sampleHiddenState(seed);

    race.seed = seed;                 // kept for later seed-persisted draws
    race.day = 0;                     // race clock: game days 0..1008
    race.hidden = hidden;

    // Named RNG substreams derived from the run seed, so adding draws to one
    // subsystem in a later phase never perturbs another's trajectory for the
    // same seed. incidents/treaty are reserved (phase 2 / later).
    race.streams = {
        capability: createRng(deriveSeed(seed, 'capability')),
        theft: createRng(deriveSeed(seed, 'theft')),
        certification: createRng(deriveSeed(seed, 'certification')),
        incidents: createRng(deriveSeed(seed, 'incidents')),
        strait: createRng(deriveSeed(seed, 'strait')),
        treaty: createRng(deriveSeed(seed, 'treaty')),
        // Evidence machinery round: the theft DISCLOSURE track's own named
        // substream (convention 5) -- so adding it perturbs no existing
        // trajectory for the same seed (race C/S/heat stay bit-identical).
        theftDisclosure: createRng(deriveSeed(seed, 'theftDisclosure')),
    };

    race.capability = createCapabilityState(hidden);

    // Safety margin per lab. Polaris is null until it spawns (see advanceRace).
    // Tianxia's S0 is the phase-6 retune lever (bought margin; culture still 0.15).
    race.safety = {
        halcyon: S0.halcyon,
        tianxia: RETUNE.S0_tianxia,
        polaris: null,
        open: S0.open,
    };

    race.heat = { transient: HEAT_TRANSIENT0, floor: HEAT_FLOOR0, strait: 0 };
    race.sAccumFreezeUntil = -1;      // day until which S accumulation is frozen
    race.theftCount = 0;
    race.F = F0;                      // firm belief (belief-adjacent; B built beside it phase 4)
    race.lastTransitions = freshTransitions();   // per-tick ledger (phase 2 consumes)

    // ---- Phase-5a strait + controlRegime ratchet state -------------------
    race.taiwanBlockade = false;      // Taiwan-strait blockade flag (mirrored to geo.taiwanBlockade)
    race.straitBlockade = freshStraitState();   // { active, startDay, endDay }
    race.mobilizationGateOpen = false;          // latched by a blockade; a mobilization precondition
    race.controlSignals = freshControlSignals(); // decaying grip pressure + qualitative flags

    // ---- Phase-2 incident / evidence generator state ---------------------
    race.latentIncidents = [];        // two-track incident queue (occur -> detect | never)
    race.latentEvidence = [];         // two-track evidence queue (found -> publish | bury)
    race.evidenceLogOdds = 0;         // cumulative found evidence log-odds (clamped ±log19)
    race.detectionQuality = 1;        // modifiable detection-hazard multiplier (players/factions lobby it, later)
    race.incidentReporting = false;   // mandatory-reporting regime toggle (shortens lag, thins the tail; later-phase)
    race.incidentsEnabled = true;     // MC toggle for the substream-isolation check; always true in-game

    // ---- Evidence machinery round: theft disclosure track ----------------
    race.latentThefts = freshTheftQueue();      // two-track theft queue (commit -> disclose | rumor forever)
    race.theftDisclosureEnabled = true;         // MC toggle for the on/off bit-identity arm; always true in-game
    // Orchestrator-passed export-control stage (world.ai.exportControlStage 0..3),
    // STORED so the plateau detector and the extrapolation path read the same value
    // the kinematics did (the playerCoupling precedent -- one drift, one stage).
    race.exportControlStage = 0;

    // ---- Later-phase stubs (null/empty; extend, don't reshape) -----------
    race.B = null;                    // phase-4 market belief (hazard-over-dates curve)
    race.controlRegime = 'private';   // ratchet driven by control-regime.js (phase 5a)
    // Treaty arc (phase 5a skeleton, EXTENDED at P6 by treaty-track.js): the latent
    // gate lives in the sampler (hidden.chinaTrue.dealPossible); this object is the
    // race-side gauntlet state the headless treaty track advances (02a treaty
    // sub-gates: talks -> initiation -> farce survival -> summit-week window). The
    // gauntlet is VIABILITY-BLIND (02a phase-6 leak-free ruling): the three gates
    // are drawn for ALL runs and gate window OPENING; dealPossible gates only the
    // holds outcome after a clean summit. `summitOpen` is the window flag main.js
    // mirrors to world.ai.summitLive (the seam the treaty_window event fires on).
    // `implemented` is TERMINAL (resolution step 2 reads it -> family 5).
    race.treaty = {
        stage: 0,               // TREATY_STAGE enum (treaty-track.js): 0 dormant .. 5 resolved
        talksOpened: false,     // gate 1 passed (viability-blind, all runs)
        initiated: false,       // gate 2 passed (viability-blind)
        farceSurvived: false,   // gate 3 passed (viability-blind) -> the gauntlet reaches a window
        windowOpened: false,    // a summit window opened this run (viability-blind)
        summitOpen: false,      // the Act-III window is open THIS tick (mirrored to world.ai.summitLive)
        summitDay: null,        // day the window opened
        windowEndDay: null,     // day the summit window closes
        summitPassed: false,    // survived summit week with no bad incident
        implemented: false,     // the Deal signed (summitPassed AND dealPossible) -- TERMINAL -> family 5
        failed: false,          // the window resolved without a Deal (the common case, incl. doomed windows)
        talksBeganDay: null,    // day the gauntlet left dormancy
    };
    race.treatyEnabled = true;        // MC toggle for the treaty substream-isolation probe; always true in-game

    // ---- P6 terminal resolution (endings phase) --------------------------
    // The once-per-run terminal record. null until the precedence ladder fires
    // (resolution.js checkResolution); latched thereafter so re-invocation is a
    // no-op. All later rounds + the epilogue consume this record's stored axes;
    // nothing re-derives the outcome. (Shape in resolution.js.)
    race.resolution = null;
    // Sustained-plateau streak (P6 fix, 02a amended plateau rule): consecutive
    // days the leader's shock-free drift has been below threshold; confirmation
    // needs it >= 180 (sustained) AND day >= 700 (resolution.js).
    race.plateauStreak = 0;

    // ---- P6-2 player coupling accounting (0 headless -> world-side identity) --
    race.playerCoupling = 0;          // current cost-of-capital multiplier on Halcyon velocity (per tick input)
    race.playerCumC = 0;              // cumulative player-attributable dC to Halcyon (coupling-integrated; d_P C-channel)
    race.playerS = { halcyon: 0, tianxia: 0, polaris: 0 };   // cumulative player-attributable dS per lab (raceEffects)

    return race;
}

// ---- Canonical commit ops (the only routes that move C_released / apply theft)

/**
 * Commit a release for `labId`: the canonical release op. Enforces the release
 * cooldown, pulls C_released up 85% of the gap, ratchets C[open] on Tianxia
 * releases, schedules certification for any released rung it crosses (R2-R4),
 * updates the proliferation heat floor, and returns the ledger record (or null
 * if the cooldown blocks it or there is no gap). The baseline policy and any
 * phase-2 policy call this rather than moving C_released directly.
 */
export function commitRelease(race, labId, endDay) {
    const cap = race.capability;
    const lab = cap.labs[labId];
    if (endDay - lab.lastReleaseDay < RACE_TUNING.releaseCooldown) return null;   // cooldown gate
    const gap = lab.C_internal - lab.C_released;
    if (gap <= 0) return null;

    lab.C_released = clamp(lab.C_released + RELEASE_PULL * gap, C_MIN, C_MAX);
    lab.releaseCount++;
    lab.lastReleaseDay = endDay;
    const releasedCrossings = recordRungs(lab.rungReleased, lab.C_released, endDay);

    const openCrossings = [];
    if (labId === 'tianxia') {
        cap.open.C = clamp(Math.max(cap.open.C, lab.C_released - OPEN_LAG), OPEN_MIN, C_MAX);
        for (const r of recordRungs(cap.open.rungInternal, cap.open.C, endDay)) openCrossings.push(r);
    }
    for (const r of releasedCrossings) {
        scheduleCertification(cap, labId, r, endDay, race.streams.certification);
    }
    race.heat.floor = computeFloor(race);
    return { labId, C_released: lab.C_released, releasedCrossings, openCrossings };
}

/**
 * Commit a weight theft: the ONE operation every theft path (the daily dyad
 * roll, and any future model-driven / self-exfiltration path) goes through.
 * ALWAYS applies, together and atomically: the capability discontinuity
 * C[to] -> max(C[to], C[from] - eps) (self-exfiltration lands in `open` when
 * toId === 'open'), the +0.04 heat-floor impulse (via theftCount), the
 * theftCount increment, and the 90d race-wide S-accumulation freeze. Returns
 * { record, crossings }.
 */
export function commitTheft(race, fromId, toId, epsilon, endDay, attribution = 'espionage') {
    const cap = race.capability;
    const crossings = [];
    if (toId === 'open') {
        cap.open.C = clamp(Math.max(cap.open.C, cap.labs[fromId].C_internal - epsilon), OPEN_MIN, C_MAX);
        for (const r of recordRungs(cap.open.rungInternal, cap.open.C, endDay)) {
            crossings.push({ lab: 'open', rung: r, track: 'internal' });
        }
    } else {
        const to = cap.labs[toId];
        to.C_internal = clamp(Math.max(to.C_internal, cap.labs[fromId].C_internal - epsilon), C_MIN, C_MAX);
        for (const r of recordRungs(to.rungInternal, to.C_internal, endDay)) {
            crossings.push({ lab: toId, rung: r, track: 'internal' });
        }
    }
    race.theftCount++;
    // Freeze the 90 daily safety updates AFTER this theft. advanceRace captures
    // accumFrozen before committing the theft, so the theft tick's own
    // accumulation (which precedes the end-boundary theft) is applied, and the
    // next 90 updates are frozen -- exactly 90d per 02a.
    race.sAccumFreezeUntil = endDay + THEFT_S_FREEZE_DAYS;
    race.heat.floor = computeFloor(race);
    const record = { from: fromId, to: toId, epsilon, attribution, day: endDay };
    // Evidence machinery round: enter the DISCLOSURE track (narrative + belief
    // only). One Bernoulli(0.75) eligibility draw from the theftDisclosure
    // substream -- the physical bundle above is untouched, and the draw comes
    // from a stream nothing else reads, so C/S/heat stay bit-identical. The
    // occurrence record's SHAPE is deliberately unchanged: disclosure consumers
    // read `tr.theftDisclosures` rows (which carry their own id), never this one.
    registerTheft(race, record, endDay);
    return { record, crossings };
}

/**
 * Neutral baseline release policy (02a appetite rule): a lab releases when
 * C_internal - C_released exceeds its appetite (adjusted +0.1 when heat > 0.55,
 * -0.1 when trailing the frontier by > 0.25 rung). The cooldown is enforced by
 * commitRelease, not here. Phase 2 replaces this with the player-facing decision
 * surface (revenue, prestige, proliferation, withholding-as-a-move) -- which
 * also calls commitRelease. Internal (not exported): the canonical op is public.
 */
function baselineReleasePolicy(race, endDay, heat) {
    const cap = race.capability;
    const frontier = frontierInternal(cap);
    const fired = [];
    for (const id of ['halcyon', 'tianxia', 'polaris']) {
        const lab = cap.labs[id];
        if (!lab.active) continue;
        let appetite = cap.appetite[id];
        if (heat > 0.55) appetite += 0.1;
        if (lab.C_internal < frontier - 0.25) appetite -= 0.1;
        if (lab.C_internal - lab.C_released > appetite) {
            const rec = commitRelease(race, id, endDay);
            if (rec) fired.push(rec);
        }
    }
    return fired;
}

// ---- Control-regime transition (canonical op) ----------------------------
// CONTROL_REGIMES / REGIME_RANK are defined in control-regime.js (imported +
// re-exported above) so the ratchet evaluator and this writer share them with no
// import cycle. Monotone: nationalized/classified are terminal peers.

/**
 * Set the control regime -- the ONE canonical mutation path for
 * `race.controlRegime` (mirrors commitTheft / commitRelease). Later phases wire
 * the transition triggers; the op must exist and be the sole writer so the
 * side effects travel with the state change. Transitions are MONOTONE: only
 * equal-or-forward moves are honored (private -> supervised -> mobilized ->
 * nationalized/classified); a backward move is ignored (never unfreezes).
 * Reaching a freeze regime (mobilized/nationalized/classified) SYNCHRONOUSLY
 * freezes the Consensus classes (09: trading halts the moment the impossibility
 * becomes public; fallback settlement of nationalized/classified is a separate
 * step in computeBinarySettlements). No-ops on an unknown or backward regime.
 * @returns {boolean} true if the regime was applied.
 */
export function setControlRegime(race, regime) {
    if (!CONTROL_REGIMES.includes(regime)) return false;
    const cur = REGIME_RANK[race.controlRegime] ?? 0;
    if (REGIME_RANK[regime] < cur) return false;   // backward -> ignore, never unfreeze
    // F6: terminal peers (nationalized/classified, both rank 3) cannot swap. An
    // equal-rank move to a DIFFERENT regime is rejected in BOTH directions; an
    // equal-rank move to the SAME regime is an idempotent no-op-ish re-apply.
    if (REGIME_RANK[regime] === cur && regime !== race.controlRegime) return false;
    race.controlRegime = regime;
    if (isFreezeRegime(regime)) {
        freezeConsensus();
        // Same canonical path freezes compute-futures trading + arms decree
        // conversion (and, at the nationalization trigger, freezes the HCN
        // nationalization reference). Never a second regime path.
        freezeComputeMarket(race, regime);
    }
    return true;
}

// ---- Daily tick ----------------------------------------------------------

/**
 * Advance the race one completed trading day. `inputs` carries player/world
 * levers; phase 1 runs with neutral defaults (nothing drives them yet).
 *
 * Processes the transition from day `race.day` to `race.day + 1`; post-Euler
 * transitions are stamped `endDay = race.day + 1`. Returns (and stores as
 * race.lastTransitions) the per-tick ledger { spawned, releases, thefts,
 * crossings, certifications } so phase 2's event coupling consumes it instead
 * of state-diffing.
 *
 * @param {object} race    state from createRaceState
 * @param {object} [inputs] orchestrator-passed inputs -- { straitTension,
 *   playerCoupling, exportControlStage }; every one absent => the neutral
 *   headless world (bit-identical to the pre-round calibration).
 */
export function advanceRace(race, inputs = {}) {
    const day = race.day;
    const endDay = day + 1;
    const cap = race.capability;
    const streams = race.streams;
    const tr = freshTransitions();

    // Snapshot pre-tick dial state (option a): this tick's accumulation and both
    // same-tick hazards are evaluated against START-of-tick heat and freeze; the
    // commit ops mutate stored heat, which takes effect NEXT tick. Without this,
    // a same-tick release/theft would heat the very accumulation and hazard that
    // logically precede it.
    const accumFrozen = day < race.sAccumFreezeUntil;
    const heatPre = heatValue(race.heat);
    // P6-2 cost-of-capital coupling: ORCHESTRATOR-PASSED per tick (the straitTension
    // precedent), stored so the plateau detector reads the same value. 0 headless.
    race.playerCoupling = inputs.playerCoupling || 0;
    // Export-control stage (evidence machinery round): ORCHESTRATOR-PASSED per tick
    // (the straitTension / playerCoupling precedent -- main.js reads
    // world.ai.exportControlStage). STORED so the plateau detector and the
    // extrapolation path price the SAME drift the kinematics did. Absent -> 0 ->
    // bit-identical to the pre-round build (race-mc passes nothing, by design).
    race.exportControlStage = normalizeExportStage(inputs.exportControlStage);

    // 1. Capability (internal track) + Polaris spawn. Pass the phase-6 kinematic
    //    levers via inputs: the Tianxia fast-follower (leg 2), the domestic regulatory
    //    drag (leg B, reads the CURRENT controlRegime), the P6-2 player coupling, and
    //    the export-control compute dampener (Tianxia's compute leg only).
    //    capability.js applies velocity (leg A) from cap.velocity directly.
    const capRes = stepCapability(cap, day, endDay,
        { ...inputs, followerKf: RETUNE.k_f, regime: race.controlRegime, deltaSup: RETUNE.delta_sup,
            playerCoupling: race.playerCoupling, exportControlStage: race.exportControlStage },
        streams.capability);
    tr.spawned.push(...capRes.spawned);
    tr.crossings.push(...capRes.crossings);
    race.playerCumC += capRes.playerDeltaC || 0;   // integrate the coupling's Halcyon-C contribution (d_P C-channel)
    tr.playerDeltaC = capRes.playerDeltaC || 0;     // expose this tick's dC for the ledger C channel (main.js)
    if (race.safety.polaris === null && cap.labs.polaris.active) {
        race.safety.polaris = S0.polaris;
    }
    // Schedule certification for any released-rung crossing produced by the
    // kinematics step -- notably Polaris spawn, which ships C_rel = C_int - 0.2
    // and can cross R2-R4 at birth. (Release-policy crossings are scheduled
    // inside commitRelease.)
    for (const c of capRes.crossings) {
        if (c.track === 'released' && CERT_RUNGS.includes(c.rung)) {
            scheduleCertification(cap, c.lab, c.rung, endDay, streams.certification);
        }
    }

    // 2. Releases (neutral baseline policy -> commitRelease canonical op). Uses
    //    pre-tick heat for the appetite adjustment.
    for (const rel of baselineReleasePolicy(race, endDay, heatPre)) {
        tr.releases.push(rel);
        for (const r of rel.releasedCrossings) tr.crossings.push({ lab: rel.labId, rung: r, track: 'released' });
        for (const r of rel.openCrossings) tr.crossings.push({ lab: 'open', rung: r, track: 'internal' });
    }

    // 2b. Theft DISCLOSURE pass (evidence machinery round). Runs BEFORE this tick's
    //     theft roll, exactly as incidents.js runs detection before occurrence, so a
    //     theft can never disclose in its own commit tick (occurrence is silent by
    //     design). Draws ONLY from streams.theftDisclosure and touches no dial, so
    //     C/S/heat trajectories are bit-identical with the track on or off.
    tr.theftDisclosures = stepTheftDisclosure(race, day, endDay);

    // 3. Theft: decide (pre-tick heat drives the hazard), record EVERY attempt in
    //    the ledger, commit only on success. Successful records carry the full
    //    discontinuity metadata (epsilon, attribution) for phase-2/3 evidence.
    const decision = rollTheftDecision(cap, heatPre, day, streams.theft);
    if (decision) {
        if (decision.success) {
            const theft = commitTheft(race, decision.from, decision.to, decision.epsilon, endDay, 'espionage');
            tr.thefts.push({ attempted: true, success: true, ...theft.record });
            tr.crossings.push(...theft.crossings);
        } else {
            tr.thefts.push({ attempted: true, success: false, from: decision.from, to: decision.to, day: endDay });
        }
    }

    // 4. Certification settlement (nested; Consensus consumes rungCertified phase 3).
    const certRes = stepCertification(cap, endDay);
    tr.certifications.push(...certRes.certifications);

    // 5. Heat floor recompute (idempotent; the commit ops already updated it).
    race.heat.floor = computeFloor(race);

    // 5b. Incident + evidence generators (two-track). Draw ONLY from
    //     streams.incidents; read pre-tick heat and current C / pre-update S;
    //     append to the latent queues and the ledger. They NEVER touch heat,
    //     safety, or capability, so capability + theft trajectories are
    //     bit-identical with incidents on or off (isolation check in the MC
    //     harness). The MC harness flips incidentsEnabled to run the off-arm.
    if (race.incidentsEnabled !== false) {
        tr.incidents = stepIncidents(race, day, endDay, heatPre);
        tr.evidence = stepEvidence(race, day, endDay);
    }

    // 5c. Strait generator (phase 5a). Draws ONLY from streams.strait; reads
    //     pre-tick heat + public tension (from inputs, 0 headless). A blockade
    //     sets race.taiwanBlockade, applies the reversible heat.strait overlay
    //     (effective NEXT tick, post-snapshot), and opens the mobilization gate.
    //     NOT gated by incidentsEnabled -- it is its own substream and must run
    //     identically in both isolation arms (its heat effect perturbs theft
    //     identically ON/OFF, so the bit-identical capability+theft check holds).
    const straitTension = clamp(inputs.straitTension ?? 0, 0, 1);
    tr.strait = stepStrait(race, day, endDay, heatPre, straitTension);

    // 6. Safety margin per active lab. dS/dt burns with racing pace always;
    //    accumulation is culture-driven, heat-suppressed (pre-tick heat), and
    //    frozen post-theft (both snapshotted before any same-tick mutation).
    for (const id of ['halcyon', 'tianxia', 'polaris']) {
        if (race.safety[id] === null) continue;    // Polaris not yet spawned
        const culture = race.hidden.labCulture[id];
        const S = race.safety[id];
        const pace = racingPaceFor(cap, id, culture, heatPre, race.controlRegime);   // dynamic per-lab (lever 1 + leg B floor)
        // Leg 6 (all labs): burn TAPERS as S falls -- margin is a practice level,
        // not a fuel tank. Corner-cutting has diminishing room; S asymptotes above
        // zero instead of hitting the rail, compressing the deep-failure |d| tail.
        let dS = -S_BURN * pace * clamp(S / RETUNE.S_taper, 0, 1);
        if (!accumFrozen) {
            dS += S_ACCUM * culture * (1 - S_HEAT_SUPPRESS * heatPre);
        }
        // Leg C: Tianxia's PURCHASED margin floors at its base (burn never takes it
        // below S0[tianxia] -- control is non-negotiable for that principal). Other
        // labs' practice margin floors at 0.
        const floor = (id === 'tianxia') ? RETUNE.S0_tianxia : 0;
        race.safety[id] = clamp(S + dS, floor, 1);
    }
    // C[open] carries no safety margin (S_open = 0, no dynamics).

    race.day = endDay;
    race.lastTransitions = tr;
    return tr;
}

/**
 * The controlRegime ratchet, evaluated for one completed day (phase 5a). Kept a
 * SEPARATE orchestrated step (like stepBelief / the settlement passes), NOT baked
 * into advanceRace, so the instrument harnesses that call advanceRace alone keep
 * a `private` world -- the ratchet fires only where it is explicitly stepped
 * (main.js and the reachability harness). Consumes `race.lastTransitions` (the
 * ledger the just-completed advanceRace produced): accrues the decaying grip
 * pressure, evaluates the target regime, and advances through the CANONICAL
 * setControlRegime writer on a FORWARD move only (never bypass it, never move
 * backward). Pure of RNG. Returns the { from, to } change, or null.
 *
 * @param {object} race   race state (post-advanceRace)
 * @param {object} [exo]  exogenous push signals (lobbying / election); none headless
 */
export function stepControlRegime(race, exo = undefined) {
    const tr = race.lastTransitions;
    if (!tr) return null;
    // F5: consume each completed race day's ledger AT MOST ONCE -- a same-day
    // replay is a no-op, so re-running one S4+theft tick cannot double-walk the
    // ratchet past the same-tick terminal guard.
    if (race.controlSignals.lastConsumedDay === race.day) return null;
    race.controlSignals.lastConsumedDay = race.day;
    stepControlSignals(race, tr);
    const heatNow = heatValue(race.heat);
    const target = desiredRegime(race, heatNow, exo || {});
    if ((REGIME_RANK[target] ?? 0) > (REGIME_RANK[race.controlRegime] ?? 0)) {
        const from = race.controlRegime;
        setControlRegime(race, target);
        tr.regimeChange = { from, to: race.controlRegime };
        return tr.regimeChange;
    }
    return null;
}
