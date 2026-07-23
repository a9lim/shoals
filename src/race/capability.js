/* ===================================================
   src/race/capability.js -- Per-lab two-track frontier
   capability. Truth advances on one track (C_internal:
   what a lab has); disclosure on another (C_released:
   what the world can touch). The market only ever sees
   projections; this module holds the latent truth.

   Labs: halcyon, tianxia, polaris (two-track each) plus
   `open` -- the diffuse open-ecosystem track, single-
   track by construction (release IS its mode of being).

   All kinematics constants are transcribed verbatim from
   docs/design/02a-tuning.md (rev 2, Codex-verified).
   Pure / DOM-free -- headless-importable for MC.

   Module boundary (Codex review round 2): this module
   holds the daily *kinematics* and *bookkeeping
   primitives*. The two discontinuous mutations that must
   travel with race-level effects -- a release (moves
   C_released, schedules certification, heats the floor)
   and a theft (the C discontinuity, +heat, S-freeze,
   count) -- are NOT performed here. They are committed
   only through commitRelease / commitTheft in
   race-state.js, so there is no exported capability
   function that bypasses the canonical path. The
   read-only helpers (recordRungs, frontierInternal) and
   the clamp constants those commits need are exported.

   Transition-reporting convention: functions that advance
   the day return the transitions they caused so the caller
   assembles a per-tick ledger rather than state-diffing.
   Post-Euler transitions are stamped with `endDay` (the
   day boundary that just completed), not the interval start.
   =================================================== */

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ---- Model constants (02a) -----------------------------------------------

/** Rung ladder: R1 = 1 ... R5 = 5, capability measured in rung units. */
export const RUNGS = [1, 2, 3, 4, 5];

// Capability clamps (02a: C in [0.3, 5.5], C[open] >= 0.3). Exported because
// the release/theft commits in race-state.js reuse them.
export const C_MIN = 0.3;
export const C_MAX = 5.5;
export const OPEN_MIN = 0.3;

const G0 = 0.000828;    // base-growth coefficient /day
const R0 = 0.000724;    // recursion coefficient /day
const DAILY_SHOCK = 0.004;   // daily capability shock scale (added raw, NOT sqrt-scaled)

const PLATEAU_CEIL = 3.2;    // low-elasticity asymptote: (1 - q) branch caps here
const RECUR_MID = 2.8;       // recursion sigmoid midpoint (rung units)
const RECUR_WIDTH = 0.35;    // recursion sigmoid width

// Ignition band for q(E) = smoothstep(0.60, 0.75, scalingElasticity).
const IGNITE_LO = 0.60;
const IGNITE_HI = 0.75;

// Release appetite per lab (C_internal - C_released trigger threshold).
const APPETITE = { halcyon: 0.25, tianxia: 0.15, polaris: 0.45 };
// Release mechanics, reused by commitRelease in race-state.js.
export const RELEASE_PULL = 0.85;   // release pulls C_released up 85% of the gap
export const OPEN_LAG = 0.15;       // C[open] trails Tianxia's released weights by 0.15

// Certification lags on released-rung crossing (02a). R1/R5 uncertified here
// (R1 trivial; R5 is resolution territory). Certification is NESTED: settling a
// rung settles all unresolved lower rungs the same day (see stepCertification).
export const CERT_RUNGS = [2, 3, 4];
const CERT_R3_DISPUTE_PROB = 0.4;   // R3: 40% disputed, adds U(20,40)d

// Theft (02a). Victim-security success probabilities, indexed by SL 1..4.
export const SL_SUCCESS = [null, 0.70, 0.45, 0.18, 0.04];
const THEFT_BASE = 0.0011;       // attempt hazard/day base rate
const THEFT_GAP_FLOOR = 0.10;    // keeps parity-state espionage alive
const THEFT_GAP_SCALE = 0.75;    // gap divisor inside the clamp
const THEFT_CLAMP_HI = 1.5;      // clamp(0.10 + gap/0.75, 0, 1.5)
const THEFT_FAIL_COOLDOWN = 60;  // failed attempts cool down 60d
const EPSILON_LO = 0.15;         // integration-lag epsilon ~ U(0.15, 0.35)
const EPSILON_HI = 0.35;

// ---- Math helpers --------------------------------------------------------

/** Hermite smoothstep in [0,1]. */
function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

/** Logistic sigmoid. */
function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
}

/** compute(t)^0.5 = sqrt(compute0) * base^(t/504). base=2 => yearly doubling. */
function computeSqrt(lab, day) {
    return Math.sqrt(lab.compute0) * Math.pow(lab.computeGrowth, day / 504);
}

/** Fresh {1..5 -> null} rung-crossing record. */
function freshRungs() {
    return { 1: null, 2: null, 3: null, 4: null, 5: null };
}

/**
 * First-crossing recorder: stamps `day` the first time capability `C` >= rung.
 * Returns the list of rungs newly crossed by this call (for the transition
 * ledger). Exported so commitRelease / commitTheft (race-state.js) can stamp
 * the released / stolen tracks; it only records timestamps, it does not move C.
 */
export function recordRungs(rungMap, C, day) {
    const crossed = [];
    for (const r of RUNGS) {
        if (rungMap[r] == null && C >= r) {
            rungMap[r] = day;
            crossed.push(r);
        }
    }
    return crossed;
}

// ---- Construction --------------------------------------------------------

function makeLab(id, C_internal, C_released, compute0, computeGrowth, talent, securityLevel, active) {
    return {
        id,
        active,
        C_internal,
        C_released,
        compute0,
        computeGrowth,          // yearly compute multiplier (2 = doubling)
        talent,
        securityLevel,          // SL 1..4
        rungInternal: freshRungs(),
        rungReleased: freshRungs(),
        rungCertified: freshRungs(),   // settled certification day (Consensus, phase 3)
        releaseCount: 0,
        lastReleaseDay: -Infinity,     // release-cooldown bookkeeping
    };
}

/**
 * Build the capability sub-state from a sampled hidden config.
 *
 * Starts (02a):
 *   C_int[halcyon] = 1.75, C_rel[halcyon] = 1.55
 *   C_int[tianxia] = 1.75 - position, C_rel[tianxia] = C_int - 0.1 (ships all)
 *   C[open]        = C_rel[tianxia] - 0.15
 *   Polaris spawns ~day 400 at C_int[halcyon] - 0.6, C_rel = C_int - 0.2
 *
 * Compute curves: Halcyon 1.0 doubling yearly; Tianxia 0.75 growing 1.3x/yr
 * (export-control-dependent 0.8-1.6x -- baseline 1.3, event modulation later-
 * phase); Polaris 0.25 doubling yearly (02a Polaris-defaults block).
 */
export function createCapabilityState(hidden) {
    const position = hidden.chinaTrue.position;

    const halcyon = makeLab('halcyon', 1.75, 1.55, 1.0, 2, 1.0, 2, true);
    const tianxiaInt = clamp(1.75 - position, C_MIN, C_MAX);
    const tianxia = makeLab('tianxia', tianxiaInt, clamp(tianxiaInt - 0.1, C_MIN, C_MAX),
        0.75, 1.3, 0.85, 2, true);
    // Polaris: inactive until spawnDay; params carried so activation is a state flip.
    const polaris = makeLab('polaris', null, null, 0.25, 2, 1.1, 2, false);

    const cap = {
        // Per-run kinematic constants derived from the sampled world.
        E: hidden.scalingElasticity,
        q: smoothstep(IGNITE_LO, IGNITE_HI, hidden.scalingElasticity),   // recursion gate
        sharpness: hidden.takeoffSharpness,                              // mapped [0.5,3.0]
        polarisSpawnDay: hidden.polarisSpawnDay,
        appetite: { ...APPETITE },
        labs: { halcyon, tianxia, polaris },
        // Open ecosystem: single-track, ratchets on Tianxia releases, never down.
        open: {
            C: clamp(tianxia.C_released - OPEN_LAG, OPEN_MIN, C_MAX),
            rungInternal: freshRungs(),
        },
        pendingCerts: [],          // [{ labId, rung, dueDay }] awaiting settlement
        _theftCooldownUntil: -1,   // set on a failed theft attempt (60d)
    };

    // Stamp any rungs already crossed at t=0 (initial conditions, day 0). Only
    // R1 is crossed at start on every track, so no R2+ certification is missed.
    recordRungs(halcyon.rungInternal, halcyon.C_internal, 0);
    recordRungs(halcyon.rungReleased, halcyon.C_released, 0);
    recordRungs(tianxia.rungInternal, tianxia.C_internal, 0);
    recordRungs(tianxia.rungReleased, tianxia.C_released, 0);
    recordRungs(cap.open.rungInternal, cap.open.C, 0);

    return cap;
}

// ---- Daily kinematics ----------------------------------------------------

/** Frontier internal capability across active labs (domestic + Tianxia). Read-only. */
export function frontierInternal(cap) {
    let m = -Infinity;
    for (const id of ['halcyon', 'tianxia', 'polaris']) {
        const lab = cap.labs[id];
        if (lab.active) m = Math.max(m, lab.C_internal);
    }
    return m;
}

/**
 * Advance C_internal one day for every active lab, per the 02a ODE:
 *
 *   q      = smoothstep(0.60, 0.75, E)                         (constant per run)
 *   mu_b   = g0 * compute(t)^0.5 * talent^0.3 * E
 *   mu_r   = r0 * sharpness * C_int * sigma((C_int - 2.8)/0.35)
 *   dC/dt  = q*(mu_b + mu_r) + (1-q)*mu_b*max(0, 1 - C_int/3.2) + 0.004*N(0,1)
 *
 * Forward Euler, dt = 1 trading day; compute(t) is evaluated at the interval
 * start `day`; crossings are stamped at `endDay` (= day + 1). Handles Polaris
 * spawn (which ships C_rel = C_int - 0.2 -- possibly crossing released rungs).
 * Returns { spawned, crossings } for the ledger. `rng` is the capability shock
 * substream. This is the legitimate daily capability advance, not a theft/
 * release bypass -- it never applies a discontinuity or moves a track by choice.
 */
export function stepCapability(cap, day, endDay, inputs, rng) {
    const spawned = [];
    const crossings = [];

    const polaris = cap.labs.polaris;
    if (!polaris.active && day >= cap.polarisSpawnDay) {
        const cInt = clamp(cap.labs.halcyon.C_internal - 0.6, C_MIN, C_MAX);
        polaris.C_internal = cInt;
        polaris.C_released = clamp(cInt - 0.2, C_MIN, C_MAX);
        polaris.active = true;
        for (const r of recordRungs(polaris.rungInternal, polaris.C_internal, endDay)) {
            crossings.push({ lab: 'polaris', rung: r, track: 'internal' });
        }
        for (const r of recordRungs(polaris.rungReleased, polaris.C_released, endDay)) {
            crossings.push({ lab: 'polaris', rung: r, track: 'released' });
        }
        spawned.push('polaris');
    }

    const q = cap.q;
    for (const id of ['halcyon', 'tianxia', 'polaris']) {
        const lab = cap.labs[id];
        if (!lab.active) continue;

        const mu_b = G0 * computeSqrt(lab, day) * Math.pow(lab.talent, 0.3) * cap.E;
        const mu_r = R0 * cap.sharpness * lab.C_internal
            * sigmoid((lab.C_internal - RECUR_MID) / RECUR_WIDTH);

        const drift = q * (mu_b + mu_r)
            + (1 - q) * mu_b * Math.max(0, 1 - lab.C_internal / PLATEAU_CEIL);
        const shock = DAILY_SHOCK * rng.normal();

        lab.C_internal = clamp(lab.C_internal + drift + shock, C_MIN, C_MAX);
        for (const r of recordRungs(lab.rungInternal, lab.C_internal, endDay)) {
            crossings.push({ lab: id, rung: r, track: 'internal' });
        }
    }

    return { spawned, crossings };
}

// ---- Certification (state + timers; Consensus settlement is phase 3) ------

/**
 * Schedule a certification for a released-rung crossing, sampling the 02a lag:
 *   R2 ~ Exp(25d);  R3 ~ Exp(60d) + 40% disputed (+U(20,40)d);  R4 ~ Exp(20d).
 * R1/R5 are not certified here. `rng` is the certification substream.
 */
export function scheduleCertification(cap, labId, rung, fromDay, rng) {
    if (!CERT_RUNGS.includes(rung)) return;
    let lag;
    if (rung === 2) lag = rng.exponential(25);
    else if (rung === 3) {
        lag = rng.exponential(60) + (rng.bernoulli(CERT_R3_DISPUTE_PROB) ? rng.uniform(20, 40) : 0);
    } else lag = rng.exponential(20);   // rung === 4
    cap.pendingCerts.push({ labId, rung, dueDay: fromDay + lag });
}

/**
 * Settle certifications whose due day has arrived. Certification is NESTED
 * (02a, ruled 2026-07-23): settling rung r for a lab settles all its unresolved
 * lower rungs the same day and cancels their pending timers -- a certified R4
 * entails a certified R3, so no R4-before-R3 inversions can occur. The ledger
 * records implied-vs-direct settlement: { lab, rung, direct } (direct true for
 * the rung whose own timer fired), with `impliedBy` on the entailed ones.
 * Returns { certifications }.
 */
export function stepCertification(cap, endDay) {
    const certifications = [];
    if (cap.pendingCerts.length === 0) return { certifications };

    // Per lab: the set of rungs whose OWN timer is due this tick, and the top
    // such rung. A rung whose own timer fired is `direct`, however many fire at
    // once; only unresolved lower rungs with no due timer are `impliedBy`.
    const dueSet = {};   // labId -> Set(rungs whose own timer is due)
    const dueTop = {};   // labId -> max due rung
    for (const c of cap.pendingCerts) {
        if (c.dueDay <= endDay) {
            if (!dueSet[c.labId]) dueSet[c.labId] = new Set();
            dueSet[c.labId].add(c.rung);
            dueTop[c.labId] = Math.max(dueTop[c.labId] ?? 0, c.rung);
        }
    }

    for (const labId of Object.keys(dueTop)) {
        const topRung = dueTop[labId];
        const due = dueSet[labId];
        const lab = cap.labs[labId];
        for (const r of CERT_RUNGS) {
            if (r > topRung) continue;
            if (lab.rungCertified[r] == null) {
                lab.rungCertified[r] = endDay;
                certifications.push(due.has(r)
                    ? { lab: labId, rung: r, direct: true }
                    : { lab: labId, rung: r, direct: false, impliedBy: topRung });
            }
        }
    }

    // Cancel every pending timer at or below a lab's settled top rung.
    cap.pendingCerts = cap.pendingCerts.filter(c => {
        const top = dueTop[c.labId];
        return top == null || c.rung > top;
    });
    return { certifications };
}

// ---- Theft decision (the commit lives in race-state.js) ------------------

/**
 * Daily theft-hazard *decision* for the primary dyad -- thief = Tianxia,
 * victim = the leading domestic lab. Per 02a:
 *
 *   hazard/day = 0.0011 * clamp(0.10 + gap/0.75, 0, 1.5) * (1 + heat)
 *
 * with gap = C_int[victim] - C_int[thief]. Per-day attempt probability is
 * 1 - exp(-hazard). On an attempt, success is drawn against the victim's
 * security level; failures impose a 60d cooldown. This function only DECIDES
 * (and manages the failure cooldown); it never mutates capability -- a success
 * is applied by commitTheft (race-state.js). Returns { attempted, success,
 * from, to, epsilon } or null (no attempt this day). `rng` is the theft
 * substream. Self-exfiltration into `open` is a later-phase channel (commitTheft
 * already routes to === 'open').
 */
export function rollTheftDecision(cap, heat, day, rng) {
    const thief = cap.labs.tianxia;
    if (!thief.active) return null;
    if (day < cap._theftCooldownUntil) return null;

    const halcyon = cap.labs.halcyon;
    const polaris = cap.labs.polaris;
    const victimId = (polaris.active && polaris.C_internal > halcyon.C_internal)
        ? 'polaris' : 'halcyon';
    const victim = cap.labs[victimId];

    const gap = victim.C_internal - thief.C_internal;
    const hazard = THEFT_BASE
        * clamp(THEFT_GAP_FLOOR + gap / THEFT_GAP_SCALE, 0, THEFT_CLAMP_HI)
        * (1 + heat);
    const pAttempt = 1 - Math.exp(-hazard);
    if (rng.next() >= pAttempt) return null;

    const success = rng.next() < SL_SUCCESS[victim.securityLevel];
    if (!success) {
        cap._theftCooldownUntil = day + THEFT_FAIL_COOLDOWN;
        return { attempted: true, success: false, from: victimId, to: 'tianxia', epsilon: 0 };
    }
    const epsilon = rng.uniform(EPSILON_LO, EPSILON_HI);
    return { attempted: true, success: true, from: victimId, to: 'tianxia', epsilon };
}

/** Set a lab's security level (SL 1..4). Upgrade cost/friction is later-phase. */
export function setSecurityLevel(cap, labId, level) {
    cap.labs[labId].securityLevel = clamp(Math.round(level), 1, 4);
}
