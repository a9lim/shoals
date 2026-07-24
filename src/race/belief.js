/* ===================================================
   src/race/belief.js -- Market belief `B`, the implied
   timeline, the belief-backed Consensus + compute quoters,
   market efficiency `eta`, the locked player posterior +
   credibility, and firm belief `F` (overhaul phase 4).

   This is the module 07-migration names: "belief.js (`B`,
   implied timeline, locked player posterior,
   credibility/Brier)". Firm belief `F` lives "here or
   beside" (07); it is STORED on `race.F` (race-state.js
   owns the reset), and its update logic lives here beside
   `B` -- UNRATIFIED seam choice (the alternative is
   faction-standing.js; F is belief-shaped, so it sits with
   B).

   ========================= B ==========================
   `B` is the market's posterior over the TIMELINE, held as
   a hazard curve over rung-crossing dates (02-race-model),
   NOT a scalar. Per rung R in {2,3,4,5} it carries a
   logistic crossing-time law F_R(t) = sigmoid((t - m_R)/w_R)
   -- median believed (certified) crossing day m_R (the
   "implied timeline" the dashboard shows) and a width w_R.
   Higher rungs also carry an `alignment` sentiment scalar
   (public/leaked evidence log-odds) -- the alignment-side of
   the posterior, present for later phases, display-only in P4.

   THE INTEGRITY RULE (09 "Information hygiene"): `B` updates
   ONLY on LEGIBLE events -- releases, certifications,
   DETECTED incidents, PUBLISHED evidence, and LEAKS (insider
   tips / leaked beats) -- never on latent truth (C_internal,
   C_released, tau, S, heat). `stepBelief` consumes ONLY
   `race.lastTransitions` (the per-tick ledger), never the
   latent queues and never a state-diff. Every non-random `B`
   move records a causal evidence ID (09). Leaks update by the
   ratified blend `B_new = 0.7*B + 0.3*L(leakedSignal)`, EXACTLY
   once per evidence ID (02a) -- the `processed` set enforces
   both no-re-leak and idempotency. If `B` ever needs noise it
   draws from a NEW named substream deriveSeed(seed,'belief')
   (seed-stability convention) -- OFF by default so every
   tested `B` move is causal.

   ===================== The quoters =====================
   `binaryQuoteFromBelief(view, contract)` and
   `computeCurveFromBelief(view, dte)` are the real P4 quote
   sources swapped into consensus.js / compute-market.js via
   setBinaryQuoteSource / setComputePriceSource. They read the
   `belief` singleton (built from public events) plus the
   PUBLIC view (buildPublicView / buildComputePublicView) --
   never `race`. So the corruption-invariance harness holds by
   construction: corrupting every latent field leaves the
   ledger (hence `B`), the public view, and the quotes bit-
   identical.

   ================= Player posterior / F ================
   Forecast locking at fixed quarterly days 0, 63, 126, ...
   (LOCK_INTERVAL); the full claim vector over the 4 tracked
   rungs is mandatory each lock; credibility = EMA(alpha=0.25,
   init 0) of (1 - 2*Brier), Brier averaged over the claims
   maturing together (02a). Gates (02a): memos > 0.55;
   fund-as-actor > 0.65 AND F > 60 -- exported predicates for
   later phases. `F` in [0,100] starts 15 (race-state.js),
   drifts toward the market-implied pilledness derived from
   `B`, and converts toward the player when they are RIGHT
   EARLY (credibility-weighted).

   UNRATIFIED magnitudes (02a records these "as rev 1" but
   does not transcribe rev 1's numbers): the belief widths,
   the per-event update strengths, the compute belief-demand
   coefficient, eta's shape, and the F drift/convert rates.
   All are listed in the phase-4 report; the RATIFIED anchors
   are the leak blend (0.7/0.3), the lock schedule, the Brier/
   credibility formula, the gate thresholds, and eta reading
   the RELEASED frontier only.

   Pure of DOM. `belief` is a module-level singleton mirroring
   market.js / consensus.js / compute-market.js.
   =================================================== */

import { createRng, deriveSeed } from './rng.js';
import { placeholderCurve } from './compute-market.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// ---- Contract-space listing priors (PUBLIC; mirror consensus.js) ----------
// The tracked rungs and their public listing info: deadlines and base rates are
// legitimately-public market-consistent priors (02a phase-3a, ratified). Kept
// here so belief seeding does not depend on consensus init ORDER; they must stay
// in lockstep with consensus.js contractDefs (a divergence would desync the
// day-0 belief quote from the listed base rate).
const RUNG_LIST = [2, 3, 4, 5];
const RUNG_DEADLINE = { 2: 420, 3: 756, 4: 880, 5: 1000 };   // consensus deadlines
const RUNG_BASE = { 2: 0.57, 3: 0.56, 4: 0.57, 5: 0.70 };    // listing base rates
// Expected certification lag (public knowledge, 02a): a released-rung CLAIM
// implies certification ~this many days out. R5 has no certification (terminal);
// its "lead" is a placeholder used only for the crossing-belief target.
const CERT_LEAD = { 2: 25, 3: 60, 4: 20, 5: 40 };

// UNRATIFIED belief widths (days). Chosen so day-0 implied medians land near the
// measured certified KM medians (R2~405, R3~736, R4~860) while F_R(deadline)
// equals the listing base rate exactly (so the belief listing quote == base
// rate, keeping consensus-test calibration two-sided within +-8pp).
const RUNG_WIDTH = { 2: 90, 3: 140, 4: 120, 5: 160 };
const WIDTH_FLOOR = 25;      // widths tighten toward this as certainty grows

// UNRATIFIED update strengths (blend weights toward the event's target date).
// The TIMELINE (m_R, w_R) moves ONLY on releases + certifications -- bounded,
// low-volume, one-way signals, so no runaway. The high-volume, ambivalent
// streams (detected incidents, evidence, leaks) fold into the BOUNDED alignment
// sentiment instead, never the timeline -- which also preserves the player's
// timeline edge (a tip is the player's channel, not the market's crossing-date
// posterior).
const A_CLAIM = 0.55;        // a released-rung CLAIM strongly pulls claimed+lower rungs to cert-pending
const A_CERT_NEXT = 0.35;    // a certification pulls the next uncrossed rung earlier
const A_ROUTINE = 0.06;      // a routine (no-rung) release is a faint cadence nudge
const RUNG_SPACING = 150;    // UNRATIFIED implied days between successive rung crossings
const A_LEAK = 0.30;         // RATIFIED leak blend: B_new = 0.7*B + 0.3*L (alignment channel)
const ALIGN_INCIDENT = 0.06; // additive alignment hit per DETECTED incident, x(severity+1) (bounded by clamp)
const ALIGN_CLAMP = Math.log(19);   // alignment sentiment clamp (posterior ceiling 0.95, mirrors evidence)

// eta / compute-demand (UNRATIFIED shapes).
const COMPUTE_BELIEF_HORIZON = 252;   // days ahead the compute market reads "R5 near" over (ratified)
const K_BELIEF_DEMAND = 0.15;         // max belief-demand lift on the compute curve (+15%)

// Forecast / credibility / F.
export const LOCK_INTERVAL = 63;      // RATIFIED lock schedule: days 0, 63, 126, ...
const CRED_ALPHA = 0.25;              // RATIFIED credibility EMA weight
const MEMO_GATE = 0.55;               // RATIFIED memo gate
const FUND_CRED_GATE = 0.65;          // RATIFIED fund-as-actor credibility gate
const FUND_F_GATE = 60;               // RATIFIED fund-as-actor F gate
const F_MIN = 0, F_MAX = 100;
const F_WAKE_RATE = 0.08;             // UNRATIFIED: fraction of the B-implied gap F closes per step
const F_CONVERT_RATE = 6;             // UNRATIFIED: max F points the player converts per step (x credibility)
const F_HORIZON = 252;                // days ahead the firm reads "R4 near" over (market pilledness)

// ---- Singleton -----------------------------------------------------------

/**
 * The market/firm/player belief store. Single-writer by main.js
 * (init/reset/day-complete) and by lockForecast/settleClaims; read by the
 * quoters, the dashboard, and the scrutiny loop.
 */
export const belief = {
    active: false,
    day: 0,
    rungs: {},               // R -> { m, w, crossed, certDay }
    alignment: 0,            // published/leaked evidence log-odds (public track), display-only in P4
    processed: null,         // Set of evidence IDs already folded into B (leak-once + idempotency)
    causes: [],              // audit: every non-random B move { day, id, cause, rung, from, to, alpha }
    rng: null,               // deriveSeed(seed,'belief') substream (noise; OFF by default)
    noise: false,
    player: null,            // { locks:[{day,vec}], credibility, lastLockDay, history:[] }
};

const _CAUSE_KEEP = 4000;    // cap the audit trail (bounded; ~hundreds of ledgered mutations/run)

function _freshPlayer() {
    return { locks: [], credibility: 0, lastLockDay: null, history: [] };
}

/** Survival-conditioned crossing probability P(T <= D | T > t) under a logistic
 *  law {m,w}: (F(D) - F(t)) / (1 - F(t)). "No progress as the deadline nears IS
 *  decay toward NO" (02a phase-4 ruling) -- as t -> D with m fixed, this -> 0. */
function _condProb(m, w, t, D) {
    if (D <= t) return 0;
    const Ft = sigmoid((t - m) / w);
    const FD = sigmoid((D - m) / w);
    return clamp((FD - Ft) / (1 - Ft), 0, 1);
}

/** Solve the median m so the day-0 conditional quote of deadline `D` equals the
 *  listing base rate `b` (given width w) -- the seeding re-solve the ruling
 *  requires so day-0 quotes stay EXACT under the conditional law. condProb is
 *  monotone decreasing in m; bisect. */
function _solveMedian(w, D, b) {
    const f = (m) => _condProb(m, w, 0, D) - b;
    let lo = D - 8 * w, hi = D + 4 * w;   // f(lo) > 0 (early median), f(hi) < 0 (late median)
    for (let i = 0; i < 80; i++) {
        const mid = 0.5 * (lo + hi);
        if (f(mid) > 0) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
}

function _seedRungs() {
    // Seed each rung so the day-0 SURVIVAL-CONDITIONED quote of the deadline
    // equals the listing base rate exactly (the unconditional CDF is a seeding
    // device only -- 02a phase-4 ruling).
    const rungs = {};
    for (const R of RUNG_LIST) {
        const D = RUNG_DEADLINE[R], b = RUNG_BASE[R], w = RUNG_WIDTH[R];
        rungs[R] = { m: _solveMedian(w, D, b), w, crossed: false, certDay: null };
    }
    return rungs;
}

// ---- Construction / reset ------------------------------------------------

/** Build a fresh belief store for a race. Dynamic-mode init/reset. Draws the
 *  belief noise substream from the run seed (NEW named stream -- never an
 *  existing one, per the seed-stability convention). */
export function initBelief(race) {
    belief.active = true;
    belief.day = race ? race.day : 0;
    belief.rungs = _seedRungs();
    belief.alignment = 0;
    belief.processed = new Set();
    belief.causes = [];
    belief.rng = race ? createRng(deriveSeed(race.seed, 'belief')) : null;
    belief.noise = false;
    belief.player = _freshPlayer();
    // NO manufactured day-0 forecast (02a phase-4 ruling): day 0 is a REAL
    // prompted lock. Until the player locks, there is no claim to score, and the
    // credibility EMA stalls (staleness is its own penalty).
}

/** In-place reset (singleton-reset convention). Same code path as init. */
export function resetBelief(race) {
    initBelief(race);
}

/** Classic mode: no belief. Clears everything and marks inactive. */
export function deactivateBelief() {
    belief.active = false;
    belief.day = 0;
    belief.rungs = {};
    belief.alignment = 0;
    belief.processed = null;
    belief.causes = [];
    belief.rng = null;
    belief.player = null;
}

// ---- The hazard curve ----------------------------------------------------

/** SURVIVAL-CONDITIONED P(rung R crossed/certified by day D | not yet, as of
 *  today) -- the quoted probability (02a phase-4 ruling). "today" is belief.day;
 *  no progress as the deadline nears decays the quote toward NO on its own. */
export function binaryProb(R, D) {
    const rung = belief.rungs[R];
    if (!rung) return 0.5;
    if (rung.crossed) return D >= rung.certDay ? 1 : 0;
    return _condProb(rung.m, rung.w, belief.day, D);
}

/** Hazard h_R(t) = f_R(t)/(1 - F_R(t)) -- the crossing-date hazard the curve IS.
 *  Exposed for the dashboard / later phases; the logistic hazard is
 *  sigmoid((t-m)/w)/w, i.e. F*(1-F)/w / (1-F) = F/w ... expressed directly. */
export function hazard(R, t) {
    const rung = belief.rungs[R];
    if (!rung || rung.crossed) return 0;
    const F = sigmoid((t - rung.m) / rung.w);
    return F / rung.w;   // logistic hazard = F(t)/w
}

/** The displayed implied timeline: rung -> believed (certified) crossing day. */
export function impliedTimeline() {
    const out = {};
    for (const R of RUNG_LIST) {
        const r = belief.rungs[R];
        if (!r) continue;
        out[R] = r.crossed ? r.certDay : Math.round(r.m);
    }
    return out;
}

// ---- Update primitives (EVERY m/w/monotonicity mutation is ledgered) -------
// 02a phase-4 ruling: every median/width/monotonicity mutation carries a cause
// entry under the originating event ID -- monotonicity corrections are
// consequences of their trigger, not anonymous drift. Each entry records the
// FULL before/after of the affected rung's (m, w) so the harness can reconstruct
// state from the ledger and assert no state change lacks a cause.

/** Ledger a rung (m, w) mutation with full before/after state. */
function _ledgerMW(id, cause, R, mFrom, wFrom) {
    const rung = belief.rungs[R];
    belief.causes.push({ day: belief.day, id, cause, rung: R, kind: 'mw', mFrom, mTo: rung.m, wFrom, wTo: rung.w });
    if (belief.causes.length > _CAUSE_KEEP) belief.causes.shift();
}

/** Ledger a general (non-rung / alignment) belief move. */
function _recordCause(id, cause, rung, from, to, alpha) {
    belief.causes.push({ day: belief.day, id, cause, rung, kind: 'scalar', from, to, alpha });
    if (belief.causes.length > _CAUSE_KEEP) belief.causes.shift();
}

/**
 * Re-enforce monotone medians (m_2 <= m_3 <= m_4 <= m_5; crossed rungs anchor at
 * certDay) by pushing later rungs up to the running floor, and LEDGER every
 * correction under the ORIGINATING event's id (`cause:monotone`). Called after
 * each timeline mutation, so a correction is attributed to the event that
 * triggered it -- never anonymous drift.
 */
function _repairMonotone(id, cause) {
    let prev = -Infinity;
    for (const R of RUNG_LIST) {
        const rung = belief.rungs[R];
        const anchor = rung.crossed ? rung.certDay : rung.m;
        const bounded = Math.max(anchor, prev);
        if (!rung.crossed && bounded !== rung.m) {
            const mFrom = rung.m, wFrom = rung.w;
            rung.m = bounded;
            _ledgerMW(id, cause + ':monotone', R, mFrom, wFrom);
        }
        prev = bounded;
    }
}

/**
 * Blend rung R's median crossing day toward `target` with strength `alpha`, and
 * tighten the width `w <- w*(1 - 0.15*alpha)` floored at 25 (RATIFIED at the
 * phase-4 gate). Guarded by the `processed` set (idempotency + leak-once). Both
 * the (m,w) mutation and any resulting monotonicity correction are ledgered
 * under `id`. No-op if the rung is already crossed or the ID was seen.
 */
function _pullMedian(R, target, alpha, id, cause) {
    const rung = belief.rungs[R];
    if (!rung || rung.crossed) return false;
    if (id != null) {
        if (belief.processed.has(id)) return false;
        belief.processed.add(id);
    }
    const mFrom = rung.m, wFrom = rung.w;
    rung.m = clamp((1 - alpha) * rung.m + alpha * target, 0, 1200);
    rung.w = Math.max(WIDTH_FLOOR, rung.w * (1 - 0.15 * alpha));   // RATIFIED tightening, floor 25
    _ledgerMW(id, cause, R, mFrom, wFrom);
    _repairMonotone(id, cause);
    return true;
}

/** Mark rung R (and any lower tracked rung) certified/crossed as of `day`, then
 *  repair monotonicity (a crossing can raise a higher rung's floor). Ledgered. */
function _markCrossed(R, day, id, cause) {
    for (const r of RUNG_LIST) {
        if (r > R) break;
        const rung = belief.rungs[r];
        if (rung && !rung.crossed) {
            const mFrom = rung.m;
            rung.crossed = true;
            rung.certDay = day;
            belief.causes.push({ day: belief.day, id, cause, rung: r, kind: 'crossed', certDay: day, mFrom, mTo: day });
            if (belief.causes.length > _CAUSE_KEEP) belief.causes.shift();
        }
    }
    _repairMonotone(id, cause);
}

/** Nearest still-uncrossed tracked rung (the market's "next milestone"). */
function _nextUncrossed() {
    for (const R of RUNG_LIST) {
        const rung = belief.rungs[R];
        if (rung && !rung.crossed) return R;
    }
    return null;
}

// ---- stepBelief: fold ONE completed day's legible ledger into B -----------

/**
 * Advance `B` by consuming `race.lastTransitions` (the per-tick ledger) ONLY.
 * Never reads latent queues (race.latentIncidents/Evidence) or continuous state
 * -- so corrupting every latent field leaves `B` invariant (the corruption
 * probes rely on exactly this). Call once per completed day, right after
 * advanceRace, before the quotes refresh.
 */
export function stepBelief(race) {
    if (!belief.active || !race || !race.lastTransitions) return;
    const tr = race.lastTransitions;
    belief.day = race.day;
    const day = race.day;

    // 1. Releases (public claims). A rung-crossing release is a public claim that
    //    the released frontier reached rung R -> pull rung R (and lower uncrossed
    //    rungs) toward cert-pending; a routine release is a faint cadence nudge.
    for (const rel of tr.releases) {
        const top = rel.releasedCrossings && rel.releasedCrossings.length
            ? Math.max(...rel.releasedCrossings) : null;
        if (top != null) {
            const id = `rel_${rel.labId}_${day}_R${top}`;
            for (const R of RUNG_LIST) {
                if (R > top) break;
                _pullMedian(R, day + (CERT_LEAD[R] || 30), A_CLAIM, `${id}_R${R}`, 'release-claim');
            }
        } else {
            const R = _nextUncrossed();
            if (R != null) _pullMedian(R, day + (CERT_LEAD[R] || 30) + RUNG_SPACING, A_ROUTINE, `rel_${rel.labId}_${day}_routine`, 'release-cadence');
        }
    }

    // 2. Certifications (public, full-certainty). Fire once per lab on its top
    //    DIRECT rung; a certified R also pulls the next uncrossed rung earlier.
    const certTop = new Map();
    for (const cert of tr.certifications) {
        if (!cert.direct) continue;
        certTop.set(cert.lab, Math.max(certTop.get(cert.lab) ?? 0, cert.rung));
    }
    for (const [lab, R] of certTop) {
        _markCrossed(R, day, `cert_${lab}_R${R}_${day}`, 'certification');
        const nxt = R + 1;
        if (RUNG_LIST.includes(nxt)) {
            _pullMedian(nxt, day + RUNG_SPACING, A_CERT_NEXT, `cert_${lab}_R${R}_${day}_next${nxt}`, 'certification-implies-next');
        }
    }

    // 3. Detected incidents (public detection): a bounded NEGATIVE alignment
    //    signal, scaled by severity. Folded into the alignment sentiment, NOT
    //    the timeline (a loud, incident-heavy world reads as less safe -- but
    //    incidents at the deployed rung are not crossing-date evidence).
    //    Occurrence stays SILENT -- never read.
    for (const det of tr.incidents.detected) {
        const sev = det.severity ?? 0;
        _foldAlignment(-ALIGN_INCIDENT * (sev + 1), 1, `det_${det.id}`, 'incident-detected');
    }

    // 4. Published evidence (public): folds into the alignment-sentiment scalar
    //    (the alignment side of the posterior) as its additive log-LR. Timeline
    //    unaffected -- alignment tractability is not a crossing-date signal.
    for (const ev of tr.evidence.published) {
        _foldAlignment(ev.logLR ?? 0, 1, `evpub_${ev.id}`, 'evidence-published');
    }

    // 5. LEAKS -- the RATIFIED 0.7*B + 0.3*L blend, once per evidence ID. Leaked
    //    beats and insider tips are the insider channel reaching the market; both
    //    fold into the BOUNDED alignment sentiment (a tip is early risk info),
    //    never the crossing-date timeline (which would erase the player's edge).
    //    Reading `path`/`insiderTip` off the OCCURRED ledger is a ledger read
    //    (the leak channel's existence), never a latent-truth read.
    for (const occ of tr.evidence.occurred) {
        if (occ.path !== 'leaked') continue;
        _foldAlignment(occ.logLR ?? 0, A_LEAK, `evleak_${occ.id}`, 'evidence-leaked');
    }
    for (const occ of tr.incidents.occurred) {
        if (!occ.insiderTip) continue;
        const sev = occ.severity ?? 0;
        _foldAlignment(-ALIGN_INCIDENT * (sev + 1), A_LEAK, `tip_${occ.id}`, 'insider-tip');
    }

    // 6. Optional random chatter (OFF by default; draws from the belief
    //    substream, never an existing one). Random moves are the only B moves
    //    exempt from the causal-ID rule -- but they are still ledgered (a
    //    'noise' cause) so the harness's full-coverage reconstruction holds even
    //    if noise is ever enabled. Monotonicity is repaired per-update above.
    if (belief.noise && belief.rng) _diffuse(day);
}

/** Fold an evidence log-LR into the alignment sentiment (leak-once via id). */
function _foldAlignment(logLR, weight, id, cause) {
    if (id != null) {
        if (belief.processed.has(id)) return false;
        belief.processed.add(id);
    }
    const before = belief.alignment;
    // weight 1 = additive accumulation (published); weight 0.3 = leak blend.
    const next = weight >= 1 ? before + logLR : (1 - weight) * before + weight * logLR;
    belief.alignment = clamp(next, -ALIGN_CLAMP, ALIGN_CLAMP);
    _recordCause(id, cause, null, before, belief.alignment, weight);
    return true;
}

/** Small random jitter (noise path; OFF by default). Ledgered under a 'noise'
 *  cause and monotonicity-repaired so full-coverage reconstruction holds. */
function _diffuse(day) {
    for (const R of RUNG_LIST) {
        const rung = belief.rungs[R];
        if (!rung || rung.crossed) continue;
        const mFrom = rung.m, wFrom = rung.w;
        rung.m += belief.rng.normal(0, 3);
        _ledgerMW(`noise_${day}_R${R}`, 'noise', R, mFrom, wFrom);
    }
    _repairMonotone(`noise_${day}`, 'noise');
}

// ---- Market efficiency eta (RATIFIED: reads the RELEASED frontier only) ----

/**
 * Market-efficiency dial `eta` in [0,1], RISING with the RELEASED frontier
 * (02a phase-4 ruling: "max(C) means max(C_released)", read through the PUBLIC
 * released-rung projection -- latent C_internal never touches efficiency). eta
 * is monotone non-decreasing in `view.releasedFrontierRung`, so the Act-II alpha
 * decay it drives is public-state-derived and the corruption harness stays
 * meaningful. eta = 0 at R1 (prototype-like fat edges), 1 at R5 (fully priced).
 */
export function marketEfficiency(view) {
    const rr = (view && view.releasedFrontierRung) || 1;
    return clamp((rr - 1) / 4, 0, 1);
}

// ---- The belief-backed quoters (public state only) ------------------------

/**
 * Consensus binary quote from `B`: P(rung R certified by the contract's
 * deadline). Reads the `belief` singleton (public-derived) + the PUBLIC `view`
 * + the contract's own listed deadline -- never `race`. Day-0 (pre-event) this
 * returns the listing base rate exactly, so listing mids stay two-sided and
 * within +-8pp of measured frequencies. Swap in via setBinaryQuoteSource.
 */
export function binaryQuoteFromBelief(view, contract) {
    const R = contract.predicate.rung;
    if (view.day >= contract.deadline) return 0.02;   // past deadline: settlement handles it
    return clamp(binaryProb(R, contract.deadline), 0.02, 0.98);
}

/** The compute market's read of `B`: survival-conditioned belief that R5
 *  (takeoff) lands within the near horizon -> compute-demand urgency in [0,1]
 *  (public-derived). RATIFIED at R5 (02a phase-4): structural curve lifted by
 *  (1 + 0.15*P(R5 by day+252)). */
export function computeUrgency() {
    return binaryProb(5, belief.day + COMPUTE_BELIEF_HORIZON);
}

/**
 * Compute-price curve from `B` + the public compute view: the ratified
 * structural curve (placeholderCurve: public demand proxies + scramble
 * backwardation + strait tail) lifted by a per-day belief-demand factor
 * (1 + K*urgency). The lift is a per-day scalar (same across dtes) so it
 * preserves backwardation / blockade-lift / tension structure and cannot break
 * the compute harness's structural assertions; it reads only `belief`
 * (public-derived) + the public `view`, so the corruption invariant holds. Swap
 * in via setComputePriceSource.
 */
export function computeCurveFromBelief(view, dte) {
    const lift = 1 + K_BELIEF_DEMAND * clamp(computeUrgency(), 0, 1);
    return placeholderCurve(view, dte) * lift;
}

// ---- Player forecast locking + credibility (Brier) ------------------------

/** True on a scheduled lock day (0, 63, 126, ...). RATIFIED schedule. */
export function isLockDay(day) {
    return day >= 0 && day % LOCK_INTERVAL === 0;
}

/**
 * Record the player's full claim vector at a lock day. Lock semantics (02a
 * phase-4 ruling):
 *   - ON-GRID + CURRENT DAY ONLY: `isLockDay(day) && day === belief.day` -- no
 *     off-grid days, no retroactive/historical locks.
 *   - FULL VECTOR mandatory: all four rungs in [0,1] or the lock is rejected
 *     (returns null). "Mandatory" binds the vector, not participation -- a
 *     skipped lock day is simply never recorded (staleness self-penalizes).
 *   - IMMUTABLE once accepted: a second call for the same day is accepted ONLY
 *     as an exact idempotent replay; a DIFFERENT vector on an already-locked day
 *     is rejected (returns null). No retroactive edits.
 * @returns the lock record, or null if rejected.
 */
export function lockForecast(day, vec) {
    if (!belief.player) return null;
    if (!(isLockDay(day) && day === belief.day)) return null;   // on-grid, current day only
    const clean = {};
    for (const R of RUNG_LIST) {
        const p = vec ? vec[R] : undefined;
        if (typeof p !== 'number' || !(p >= 0 && p <= 1)) return null;   // full vector mandatory
        clean[R] = p;
    }
    const existing = belief.player.locks.find(l => l.day === day);
    if (existing) {
        // Immutable: only an EXACT replay is honored (idempotent); a different
        // vector on an already-locked day is rejected.
        for (const R of RUNG_LIST) if (existing.vec[R] !== clean[R]) return null;
        return existing;
    }
    const record = { day, vec: clean };
    belief.player.locks.push(record);
    belief.player.lastLockDay = day;
    return record;
}

/** The player's most recent locked claim for rung R, or null if never locked
 *  (an unlocked claim scores no Brier -- staleness is the penalty). */
export function lockedClaim(R) {
    const locks = belief.player ? belief.player.locks : null;
    if (locks && locks.length) {
        for (let i = locks.length - 1; i >= 0; i--) {
            if (locks[i].vec[R] != null) return locks[i].vec[R];
        }
    }
    return null;
}

/**
 * Score one or more matured claims and EMA-update credibility. Only rungs the
 * player ACTUALLY LOCKED are scored; a never-locked rung contributes no Brier
 * (02a phase-4: skipping stalls the EMA -- staleness is its own penalty). Brier
 * is averaged over the scored batch, then credibility advances one EMA step:
 * cred <- (1-a)*cred + a*(1 - 2*Brier), a = 0.25, init 0. If nothing was locked,
 * the EMA STALLS (returns unchanged).
 * @param {Array<{rung:number, outcome:number}>} settled
 */
export function settleClaims(settled) {
    if (!belief.player || !settled || !settled.length) return belief.player ? belief.player.credibility : 0;
    let sumBrier = 0, n = 0;
    for (const s of settled) {
        const p = lockedClaim(s.rung);
        if (p == null) continue;   // never locked -> no Brier (EMA stalls on it)
        const o = s.outcome ? 1 : 0;
        sumBrier += (p - o) * (p - o);
        n++;
    }
    if (n === 0) return belief.player.credibility;   // nothing scored -> EMA stalls
    const brier = sumBrier / n;
    const cred = belief.player.credibility;
    belief.player.credibility = (1 - CRED_ALPHA) * cred + CRED_ALPHA * (1 - 2 * brier);
    belief.player.history.push({ day: belief.day, rungs: settled.map(s => s.rung), brier, credibility: belief.player.credibility });
    return belief.player.credibility;
}

/** Convenience: score a single matured claim. */
export function settleClaim(rung, outcome) {
    return settleClaims([{ rung, outcome }]);
}

/** Current player credibility ((-1,1)-ish; init 0). */
export function credibility() {
    return belief.player ? belief.player.credibility : 0;
}

/** True once the player has locked at least one forecast. A player who has
 *  stated no posterior has no belief gap to scrutinize -- the scrutiny loop
 *  guards on this so a never-lock player never draws false risk-committee heat. */
export function hasEverLocked() {
    return !!(belief.player && belief.player.locks.length > 0);
}

/** Gate predicates (RATIFIED thresholds). `canActAsFund` also needs firm belief F. */
export function canSendMemos() { return credibility() > MEMO_GATE; }
export function canActAsFund(F) { return credibility() > FUND_CRED_GATE && (F ?? 0) > FUND_F_GATE; }

/**
 * The player's "pilledness" in [0,100] from their latest locked posterior on the
 * recursion-adjacent rungs (R4/R5) -- the scrutiny loop's read of the player's
 * timeline stance. If the player has never locked, there is no divergence to
 * scrutinize, so this tracks the market (no scrutiny heat). A book-tilt read can
 * replace/augment this later.
 */
export function playerPilled() {
    const c4 = lockedClaim(4), c5 = lockedClaim(5);
    if (c4 == null || c5 == null) return marketPilled();
    return 100 * 0.5 * (c4 + c5);
}

// ---- Firm belief F (stored on race.F; logic beside B) ---------------------

/** The market's implied pilledness in [0,100] derived from `B` (belief R4 lands
 *  within the near horizon). The firm wakes toward this. */
export function marketPilled() {
    return 100 * binaryProb(4, belief.day + F_HORIZON);
}

/** Read F off the race (0 outside Dynamic). */
export function firmBelief(race) {
    return race && typeof race.F === 'number' ? race.F : F_MIN;
}

/**
 * Advance firm belief F one step (call at quarterly review). F drifts toward the
 * market-implied pilledness (the firm slowly wakes as `B` does) AND converts
 * toward the player when the player is RIGHT EARLY -- pulled toward playerPilled
 * in proportion to POSITIVE credibility (being right early converts the firm;
 * 03/02a). Bounded [0,100]. Mutates race.F and returns it.
 */
export function stepFirmBelief(race, opts = {}) {
    if (!race || typeof race.F !== 'number') return F_MIN;
    const pilled = opts.playerPilled != null ? opts.playerPilled : playerPilled();
    const cred = Math.max(0, credibility());
    let F = race.F;
    F += F_WAKE_RATE * (marketPilled() - F);              // the world waking pulls F up
    F += F_CONVERT_RATE * cred * Math.sign(pilled - F);   // being right early converts the firm
    race.F = clamp(F, F_MIN, F_MAX);
    return race.F;
}

/**
 * The scrutiny divergence: player positioning minus firm belief. Positive =
 * player MORE pilled than the firm (early game -> AGI books draw risk-committee
 * heat); negative = player LESS pilled (late game, after F wakes -> the pressure
 * inverts, conventional books underperform). The main.js quarterly review reads
 * this to aim the scrutiny loop.
 */
export function scrutinyGap(race, pilled) {
    const p = pilled != null ? pilled : playerPilled();
    return p - firmBelief(race);
}

// ---- Audit accessors (for the P4 harness / dashboard) ---------------------

/** The causal-move audit trail (every non-random B move carries an ID). */
export function beliefCauses() { return belief.causes.slice(); }

/** Whether an evidence ID has been folded into B (leak-once probe). */
export function beliefProcessed(id) { return belief.processed ? belief.processed.has(id) : false; }
