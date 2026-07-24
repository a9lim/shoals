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
import {
    createCapabilityState, stepCapability, rollTheftDecision,
    scheduleCertification, stepCertification, frontierInternal,
    recordRungs,
    C_MIN, C_MAX, OPEN_MIN, RELEASE_PULL, OPEN_LAG, CERT_RUNGS,
} from './capability.js';
import { freezeConsensus, isFreezeRegime } from './consensus.js';
import { freezeComputeMarket } from './compute-market.js';

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

/** Total heat = clamp(transient + floor, 0, 1); the floor is a ratchet. */
export function heatValue(heat) {
    return clamp(heat.transient + heat.floor, 0, 1);
}

/** Recompute the irreversible heat floor from proliferation + theft counts. */
function computeFloor(race) {
    return Math.min(RACE_TUNING.prolifInc * race.capability.labs.tianxia.releaseCount, RACE_TUNING.prolifCap)
        + THEFT_FLOOR_IMPULSE * race.theftCount;
}

/** Fresh empty per-tick transition ledger. */
function freshTransitions() {
    return {
        spawned: [], releases: [], thefts: [], crossings: [], certifications: [],
        // Phase-2 two-track ledgers. `occurred` is the silent latent track (the
        // bridge ignores it by design); `detected`/`published` are the legible
        // track the race->narrative bridge fires on.
        incidents: { occurred: [], detected: [] },
        evidence: { occurred: [], published: [] },
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
        treaty: createRng(deriveSeed(seed, 'treaty')),
    };

    race.capability = createCapabilityState(hidden);

    // Safety margin per lab. Polaris is null until it spawns (see advanceRace).
    race.safety = {
        halcyon: S0.halcyon,
        tianxia: S0.tianxia,
        polaris: null,
        open: S0.open,
    };

    race.heat = { transient: HEAT_TRANSIENT0, floor: HEAT_FLOOR0 };
    race.sAccumFreezeUntil = -1;      // day until which S accumulation is frozen
    race.theftCount = 0;
    race.F = F0;                      // firm belief (belief-adjacent; B built beside it phase 4)
    race.lastTransitions = freshTransitions();   // per-tick ledger (phase 2 consumes)

    // ---- Phase-2 incident / evidence generator state ---------------------
    race.latentIncidents = [];        // two-track incident queue (occur -> detect | never)
    race.latentEvidence = [];         // two-track evidence queue (found -> publish | bury)
    race.evidenceLogOdds = 0;         // cumulative found evidence log-odds (clamped ±log19)
    race.detectionQuality = 1;        // modifiable detection-hazard multiplier (players/factions lobby it, later)
    race.incidentReporting = false;   // mandatory-reporting regime toggle (shortens lag, thins the tail; later-phase)
    race.incidentsEnabled = true;     // MC toggle for the substream-isolation check; always true in-game

    // ---- Later-phase stubs (null/empty; extend, don't reshape) -----------
    race.B = null;                    // phase-4 market belief (hazard-over-dates curve)
    race.controlRegime = 'private';   // private -> supervised -> mobilized -> nationalized (transitions later-phase)
    race.treaty = null;               // treaty discovery/initiation/summit state (later-phase)

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

/** Valid controlRegime values (09): the state's grip tightening in order. */
export const CONTROL_REGIMES = ['private', 'supervised', 'mobilized', 'nationalized', 'classified'];
// Monotone rank (nationalized/classified are terminal peers). The regime only
// ever tightens -- a freeze, once public, never unwinds mid-run.
const REGIME_RANK = { private: 0, supervised: 1, mobilized: 2, nationalized: 3, classified: 3 };

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
 * @param {object} [inputs] { racingPace? } -- neutral defaults for phase 1
 */
export function advanceRace(race, inputs = {}) {
    const day = race.day;
    const endDay = day + 1;
    const racingPace = clamp(inputs.racingPace ?? RACING_PACE_BASE, 0, 1);
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

    // 1. Capability (internal track) + Polaris spawn.
    const capRes = stepCapability(cap, day, endDay, inputs, streams.capability);
    tr.spawned.push(...capRes.spawned);
    tr.crossings.push(...capRes.crossings);
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

    // 6. Safety margin per active lab. dS/dt burns with racing pace always;
    //    accumulation is culture-driven, heat-suppressed (pre-tick heat), and
    //    frozen post-theft (both snapshotted before any same-tick mutation).
    for (const id of ['halcyon', 'tianxia', 'polaris']) {
        if (race.safety[id] === null) continue;    // Polaris not yet spawned
        let dS = -S_BURN * racingPace;
        if (!accumFrozen) {
            dS += S_ACCUM * race.hidden.labCulture[id] * (1 - S_HEAT_SUPPRESS * heatPre);
        }
        race.safety[id] = clamp(race.safety[id] + dS, 0, 1);
    }
    // C[open] carries no safety margin (S_open = 0, no dynamics).

    race.day = endDay;
    race.lastTransitions = tr;
    return tr;
}
