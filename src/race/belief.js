/* ===================================================
   src/race/belief.js -- Market belief `B`, the implied
   timeline, the belief-backed Consensus + compute quoters,
   market efficiency `eta`, the player's posterior +
   credibility, and firm belief `F` (overhaul phase 4).

   This module owns `B`, the implied timeline, the player's
   posterior (draft, locks, scoring) and credibility. Firm
   belief `F` is STORED on `race.F` (race-state.js owns the
   reset), and its update logic lives here beside
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
   DETECTED incidents, PUBLISHED evidence, DISCLOSED thefts,
   and LEAKS (insider tips / leaked beats / the player's own
   leak verb) -- never on latent truth (C_internal,
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
   The player's timeline is held in B's own form (02a, the
   posterior, ratified 2026-10-24): per rung R2-R5 a logistic
   {m, w} over the certified crossing day, bounded, monotone,
   certified rungs frozen. A standing DRAFT (day 0: a copy of
   B) is edited on the Markets page; LOCKS at the fixed
   quarterly days 0, 63, 126, ... (LOCK_INTERVAL) freeze it
   beside a snapshot of B. On each lock day the quarter that
   just ended is scored for R2-R4 by log-likelihood ratio
   against that snapshot (scoreQuarter): S_P accumulates in
   nats, credibility = tanh(S_P / K_CRED). A market copier
   scores exactly 0. Consensus settlement does not touch
   credibility. Gates (02a): memos > 0.55; fund-as-actor >
   0.65 AND F > 60 -- exported predicates. `F` in [0,100]
   starts 15 (race-state.js), drifts toward the market-
   implied pilledness derived from `B`, and converts toward
   the player when they are RIGHT EARLY (credibility-weighted).

   UNRATIFIED magnitudes (02a records these "as rev 1" but
   does not transcribe rev 1's numbers): the belief widths,
   the per-event update strengths, the compute belief-demand
   coefficient, eta's shape, and the F drift/convert rates.
   The RATIFIED anchors are the leak blend (0.7/0.3), the
   lock schedule, the posterior's bounds and scoring, the
   gate thresholds, and eta reading the RELEASED frontier
   only. K_CRED is set by calibration (forecast-test).

   Pure of DOM. `belief` is a module-level singleton mirroring
   market.js / consensus.js / compute-market.js.
   =================================================== */

import { createRng, deriveSeed } from './rng.js';
import { placeholderCurve } from './compute-market.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// ---- Contract-space listing priors (PUBLIC; mirror consensus.js) ----------
// The tracked rungs and their public listing info: deadlines and base rates are
// legitimately-public market-consistent priors (02a "Consensus binaries"). Kept
// here so belief seeding does not depend on consensus init ORDER; they must stay
// in lockstep with consensus.js contractDefs (a divergence would desync the
// day-0 belief quote from the listed base rate).
const RUNG_LIST = [2, 3, 4, 5];
const RUNG_DEADLINE = { 2: 420, 3: 756, 4: 880, 5: 1000 };   // consensus deadlines
const RUNG_BASE = { 2: 0.70, 3: 0.62, 4: 0.60, 5: 0.70 };    // listing base rates (P6-1b recalibration; in lockstep with consensus.js)
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
// RATIFIED (02a "Incidents"): a DISCLOSED weight theft folds -0.20 into the
// alignment sentiment, once per disclosure (`theftdisc_` fold-id class). A theft
// becoming public is unambiguous bad news about the security of the frontier --
// which is why it is a fixed magnitude, not severity-scaled like an incident.
const ALIGN_THEFT_DISCLOSURE = 0.20;
const ALIGN_CLAMP = Math.log(19);   // alignment sentiment clamp (posterior ceiling 0.95, mirrors evidence)
// CLASSIFICATION BLACKOUT (P7-3, 02a): under `controlRegime === 'classified'` a
// detected incident reaches the market as a redacted brief, not a story, so its
// alignment fold is SUPPRESSED through severity 3. Severity 4 is undeniable --
// it self-discloses in its own tick and folds unchanged, whatever the statute
// says. This is a PUBLIC-state read (controlRegime is mirrored into world.ai and
// carried on buildPublicView), never a latent one, so the corruption-invariance
// contract is untouched. Suppression does NOT claim the fold id: the player's own
// leak verb can still fold that incident (the channel that survives a blackout).
export const BLACKOUT_FOLD_MAX_SEV = 3;

// eta / compute-demand (UNRATIFIED shapes).
const COMPUTE_BELIEF_HORIZON = 252;   // days ahead the compute market reads "R5 near" over (ratified)
const K_BELIEF_DEMAND = 0.15;         // max belief-demand lift on the compute curve (+15%)

// The player's posterior, its scoring, credibility, F (02a "Belief, η, and the firm").
export const LOCK_INTERVAL = 63;      // RATIFIED lock schedule: days 0, 63, 126, ...
// RATIFIED posterior bounds (02a): medians in [0, 2016], widths in [25, 400].
export const POSTERIOR = Object.freeze({ M_MIN: 0, M_MAX: 2016, W_MIN: 25, W_MAX: 400 });
const SCORED_RUNGS = [2, 3, 4];       // RATIFIED: R5 is never scored -- nothing certifies it
const SCORE_P_MIN = 0.02, SCORE_P_MAX = 0.98;   // RATIFIED clamp on each quarter's crossing probability
// credibility = tanh(S_P / K_CRED). K_CRED is set in calibration (02a started it at
// 2.5): at 1.8 the oracle clears the fund gate by day 756 in every qualifying world
// and the informed player clears the memo gate by day 882 in ~52% of worlds
// (tools/forecast-test.mjs; at 2.5 the informed player managed ~16%). Mutable so
// the harness can sweep it.
export const forecastTuning = { K_CRED: 1.8 };
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
 * (init/reset/day-complete), by the draft editors, and by lockForecast/
 * scoreQuarter; read by the quoters, the dashboard, and the scrutiny loop.
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
    player: null,            // { draft:{R:{m,w}}, locks:[{day,curves,market}], scores:[], S, credibility, lastLockDay }
};

const _CAUSE_KEEP = 4000;    // cap the audit trail (bounded; ~hundreds of ledgered mutations/run)

/** A fresh player: day 0's draft is a copy of `B` (02a); no lock, no record. */
function _freshPlayer() {
    return { draft: marketCurves(), locks: [], scores: [], S: 0, credibility: 0, lastLockDay: null };
}

/** Survival-conditioned crossing probability P(T <= D | T > t) under a logistic
 *  law {m,w}: (F(D) - F(t)) / (1 - F(t)). "No progress as the deadline nears IS
 *  decay toward NO" (02a "Belief, η, and the firm") -- as t -> D with m fixed, this -> 0. */
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
    // device only -- 02a "Belief, η, and the firm").
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
    // NO manufactured day-0 forecast (02a "Belief, η, and the firm"): day 0 is a REAL
    // prompted lock. The draft exists from the start, but until a lock is recorded
    // there is no curve to score and credibility stays 0.
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
 *  today) -- the quoted probability (02a "Belief, η, and the firm"). "today" is belief.day;
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
// 02a "Belief, η, and the firm": every median/width/monotonicity mutation carries a cause
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
    // The player's draft freezes a certified rung at its day, like B (02a). The
    // draft is the player's, not B's: this is its only automatic edit.
    if (certTop.size) _syncDraft();

    // 3. Detected incidents (public detection): a bounded NEGATIVE alignment
    //    signal, scaled by severity. Folded into the alignment sentiment, NOT
    //    the timeline (a loud, incident-heavy world reads as less safe -- but
    //    incidents at the deployed rung are not crossing-date evidence).
    //    Occurrence stays SILENT -- never read.
    //    P7-3 blackout: under a classified regime the fold is suppressed through
    //    severity 3 (see BLACKOUT_FOLD_MAX_SEV) -- the detection happened, the
    //    market was not told, so the market's posterior does not move.
    const blackout = race.controlRegime === 'classified';
    for (const det of tr.incidents.detected) {
        const sev = det.severity ?? 0;
        if (blackout && sev <= BLACKOUT_FOLD_MAX_SEV) continue;
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

    // 5b. DISCLOSED weight thefts (evidence machinery round). The occurrence was
    //     silent (and stays silent -- `tr.thefts` is never read here); the
    //     DISCLOSURE is the legible event, so it folds off the disclosure ledger
    //     only, once per disclosure id. A fixed -0.20 into the bounded alignment
    //     sentiment; the crossing-date timeline is untouched (a theft moves who
    //     has what, not when the world gets there -- and the capability
    //     discontinuity it caused is already in the release/certification stream).
    for (const dis of (tr.theftDisclosures || [])) {
        _foldAlignment(-ALIGN_THEFT_DISCLOSURE, 1, `theftdisc_${dis.id}`, 'theft-disclosed');
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

/**
 * The belief half of the insider channel's LEAK verb (evidence machinery round):
 * fold the leaked incident's DETECTION-CLASS sentiment now, on leak day, under
 * THE DETECTION'S OWN fold id `det_${id}` (02a, verbatim).
 *
 * Folding under the detection's id is the whole mechanism: the existing leak-once
 * `processed` set then makes the real detection's later fold in stepBelief a
 * no-op. For an incident that would EVENTUALLY DETECT anyway, the TOTAL `B` move
 * is therefore IDENTICAL leaked or unleaked -- leaking buys TIMING and public
 * pressure, never extra belief mass. For the never-detectable tail the identity
 * does NOT hold, by design: the unleaked counterfactual folds nothing, and the
 * leak's fold is mass the world would otherwise never get -- overriding that
 * tail is what the verb is for (gate ruling, evidence round). No new idempotency
 * machinery, and the audit ledger records who claimed the fold (cause
 * 'player-leak' vs 'incident-detected'), so beliefCauses() reconstruction holds.
 *
 * Same weight (1, additive) and same magnitude (-ALIGN_INCIDENT*(sev+1)) as the
 * detection fold -- by construction, not by coincidence.
 *
 * @param {string} id        the incident id (NOT pre-prefixed; `det_` is added here)
 * @param {number} severity  the incident's severity 0..4
 * @returns {boolean} true if this call was the fold that landed
 */
export function foldPlayerLeak(id, severity) {
    if (!belief.active || !belief.processed || id == null) return false;
    const sev = severity ?? 0;
    return _foldAlignment(-ALIGN_INCIDENT * (sev + 1), 1, `det_${id}`, 'player-leak');
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
 * (02a "Belief, η, and the firm": "max(C) means max(C_released)", read through the PUBLIC
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
 *  (public-derived). RATIFIED at R5 (02a "Belief, η, and the firm"): structural curve lifted by
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

// ---- The player's posterior: draft, locks, scoring -------------------------
// 02a "Belief, η, and the firm" (the posterior, ratified 2026-10-24). The player
// holds the same {m, w} logistic family as `B`, one law per tracked rung over the
// CERTIFIED crossing day (R5: the terminal crossing). A standing DRAFT is edited
// at any time (the Markets page's Consensus panel); a quarterly LOCK freezes it
// beside a snapshot of `B`; each lock day scores the quarter that just ended by
// log-likelihood ratio against that snapshot. Everything here reads `B` and the
// public certification days in `belief.rungs` -- never the race.

/** True on a scheduled lock day (0, 63, 126, ...). RATIFIED schedule. */
export function isLockDay(day) {
    return day >= 0 && day % LOCK_INTERVAL === 0;
}

/** Public certification day of rung R as of today, or null (R5 never certifies). */
function _certDay(R) {
    const r = belief.rungs[R];
    return r && r.crossed ? r.certDay : null;
}

/** The floor every open median sits on: the latest public certification day
 *  (certified rungs are a prefix of the ladder), else the lower bound. */
function _openFloor() {
    let floor = POSTERIOR.M_MIN;
    for (const R of RUNG_LIST) { const cd = _certDay(R); if (cd != null) floor = Math.max(floor, cd); }
    return floor;
}

/** Tracked rungs not yet certified (the rungs a preset moves and the editor shows). */
export function openRungs() {
    return RUNG_LIST.filter(R => _certDay(R) == null);
}

/**
 * Bring a curve set inside the posterior's rules: every rung present, medians
 * clamped to [0, 2016] and widths to [25, 400], a certified rung frozen at its
 * certification day (its width kept), then medians made monotone by pushing each
 * later rung up to the running floor. Missing or non-finite input falls back to
 * `B`'s curve for that rung. Returns a fresh object; the input is untouched.
 */
export function normalizeCurves(curves) {
    const mk = marketCurves();
    const out = {};
    let prev = -Infinity;
    for (const R of RUNG_LIST) {
        const c = curves && curves[R];
        const m0 = c && Number.isFinite(c.m) ? c.m : mk[R].m;
        const w0 = c && Number.isFinite(c.w) ? c.w : mk[R].w;
        const cd = _certDay(R);
        const m = cd != null ? cd : Math.max(prev, clamp(m0, POSTERIOR.M_MIN, POSTERIOR.M_MAX));
        out[R] = { m, w: clamp(w0, POSTERIOR.W_MIN, POSTERIOR.W_MAX) };
        prev = m;
    }
    return out;
}

/** True when two curve sets agree exactly on rung R ({m, w} bit-equal). */
export function curvesEqual(a, b, R) {
    return !!(a && b && a[R] && b[R] && a[R].m === b[R].m && a[R].w === b[R].w);
}

/**
 * `B`'s curves in the posterior's form: each rung's {m, w}, a certified rung
 * frozen at its certification day. This is the market snapshot every lock stores
 * and the "market" preset, so a copier's curves equal it bit for bit.
 */
export function marketCurves() {
    const out = {};
    for (const R of RUNG_LIST) {
        const r = belief.rungs[R];
        const cd = _certDay(R);
        out[R] = r ? { m: cd != null ? cd : r.m, w: r.w } : { m: POSTERIOR.M_MAX, w: POSTERIOR.W_MAX };
    }
    return out;
}

/**
 * The lock dispatch's starting points, relative to `B` today (02a): 'market' is
 * `B` itself; 'earlier' moves every open rung half a width sooner
 * (m_B - 0.5*w_B, w_B kept); 'later' half a width later. Normalized, so a shift
 * that would cross a neighbour or a certification day is pushed back into order.
 */
export function presetCurves(kind) {
    const mk = marketCurves();
    if (kind === 'market') return mk;
    const dir = kind === 'earlier' ? -1 : kind === 'later' ? 1 : 0;
    const out = {};
    for (const R of RUNG_LIST) {
        out[R] = _certDay(R) != null ? mk[R] : { m: mk[R].m + dir * 0.5 * mk[R].w, w: mk[R].w };
    }
    return normalizeCurves(out);
}

/** A copy of the player's standing draft (null outside Dynamic). */
export function draftCurves() {
    const P = belief.player;
    if (!P) return null;
    const out = {};
    for (const R of RUNG_LIST) out[R] = { m: P.draft[R].m, w: P.draft[R].w };
    return out;
}

/** Replace the draft wholesale (normalized). Returns the stored copy. */
export function setDraft(curves) {
    const P = belief.player;
    if (!P) return null;
    P.draft = normalizeCurves(curves);
    return draftCurves();
}

/**
 * Move one open rung's draft median (the editor's drag and ←/→). Dragging one
 * pushes its neighbours (02a): later rungs rise to meet it, earlier open rungs
 * fall to meet it, and nothing goes below the latest certification day or past
 * the bound. A certified rung is frozen: no-op, returns null.
 */
export function setDraftMedian(R, m) {
    const P = belief.player;
    if (!P || !RUNG_LIST.includes(R) || _certDay(R) != null || !Number.isFinite(m)) return null;
    const v = clamp(m, _openFloor(), POSTERIOR.M_MAX);
    for (const r of RUNG_LIST) {
        if (_certDay(r) != null) continue;
        const d = P.draft[r];
        if (r === R) d.m = v;
        else if (r > R && d.m < v) d.m = v;
        else if (r < R && d.m > v) d.m = v;
    }
    return draftCurves();
}

/** Set one open rung's draft width (the editor's vertical drag and ↑/↓). */
export function setDraftWidth(R, w) {
    const P = belief.player;
    if (!P || !RUNG_LIST.includes(R) || _certDay(R) != null || !Number.isFinite(w)) return null;
    P.draft[R].w = clamp(w, POSTERIOR.W_MIN, POSTERIOR.W_MAX);
    return draftCurves();
}

/** Re-freeze the draft after a certification lands (stepBelief): the certified
 *  rung snaps to its day and any open median below it is pushed up. */
function _syncDraft() {
    const P = belief.player;
    if (P && P.draft) P.draft = normalizeCurves(P.draft);
}

/** A curve set is lockable when every rung is present and finite, inside the
 *  bounds, certified rungs sit exactly on their certification day, and medians
 *  are monotone. Returns a clean copy, or null. */
function _cleanCurves(curves) {
    if (!curves) return null;
    const out = {};
    let prev = -Infinity;
    for (const R of RUNG_LIST) {
        const c = curves[R];
        if (!c || !Number.isFinite(c.m) || !Number.isFinite(c.w)) return null;
        if (c.m < POSTERIOR.M_MIN || c.m > POSTERIOR.M_MAX || c.w < POSTERIOR.W_MIN || c.w > POSTERIOR.W_MAX) return null;
        const cd = _certDay(R);
        if (cd != null && c.m !== cd) return null;
        if (c.m < prev) return null;
        prev = c.m;
        out[R] = Object.freeze({ m: c.m, w: c.w });
    }
    return Object.freeze(out);
}

/**
 * Record the player's curves at a lock day, beside a snapshot of `B` for the
 * same rungs (02a). Lock semantics (kept from the phase-4 ruling):
 *   - ON-GRID + CURRENT DAY ONLY: `isLockDay(day) && day === belief.day` -- no
 *     off-grid days, no retroactive or historical locks.
 *   - A FULL, VALID curve set (see _cleanCurves) or the lock is rejected (null).
 *     The editor and the presets always produce one; nothing is silently clamped.
 *   - IMMUTABLE once accepted: a second call for the same day is accepted ONLY as
 *     an exact idempotent replay; different curves on a locked day are rejected.
 * A new lock also becomes the standing draft (UNRATIFIED seam: what you last
 * locked is what the editor shows, so "as drawn" defaults to keeping the call).
 * @returns the frozen lock record { day, curves, market }, or null if rejected.
 */
export function lockForecast(day, curves) {
    const P = belief.player;
    if (!P) return null;
    if (!(isLockDay(day) && day === belief.day)) return null;   // on-grid, current day only
    const clean = _cleanCurves(curves);
    if (!clean) return null;
    const existing = P.locks.find(l => l.day === day);
    if (existing) {
        for (const R of RUNG_LIST) if (!curvesEqual(existing.curves, clean, R)) return null;
        return existing;                                          // exact replay: idempotent
    }
    const market = _cleanCurves(marketCurves());
    const record = Object.freeze({ day, curves: clean, market });
    P.locks.push(record);
    P.lastLockDay = day;
    P.draft = normalizeCurves(clean);
    return record;
}

/** The latest lock record, or null if the player has never locked. */
export function latestLock() {
    const locks = belief.player ? belief.player.locks : null;
    return locks && locks.length ? locks[locks.length - 1] : null;
}

/** ln(1 + e^x) without overflow. */
function _softplus(x) {
    return x > 0 ? x + Math.log1p(Math.exp(-x)) : Math.log1p(Math.exp(x));
}

/** Survival-conditioned crossing probability P(t0 < T <= t1 | T > t0) under the
 *  logistic {m, w}, as 1 - S(t1)/S(t0) in log space: stable when the median is
 *  far behind t0, where the naive (F(t1) - F(t0))/(1 - F(t0)) is 0/0. Pure; the
 *  Markets panel draws the draft with it. */
export function crossingProb(m, w, t0, t1) {
    if (t1 <= t0) return 0;
    return -Math.expm1(_softplus((t0 - m) / w) - _softplus((t1 - m) / w));
}

/** The quarter's scored crossing probability (02a): P(T in (L_q, L_q+1] | T > L_q)
 *  under {m, w}, clamped to [0.02, 0.98]. Pure; the harness scores with it too. */
export function quarterProb(m, w, t0, t1) {
    return clamp(crossingProb(m, w, t0, t1), SCORE_P_MIN, SCORE_P_MAX);
}

/** The log-likelihood-ratio increment in nats for one rung-quarter (02a):
 *  o*ln(pP/pM) + (1-o)*ln((1-pP)/(1-pM)). Exactly 0 when pP === pM. */
export function logScoreDelta(pP, pM, o) {
    return o ? Math.log(pP / pM) : Math.log((1 - pP) / (1 - pM));
}

/**
 * Score the quarter that ends on lock day `day` (02a "Scoring"), BEFORE that
 * day's lock is recorded. Every rung R in {2,3,4} still uncertified at
 * L_q = day - 63 is scored under the lock recorded at L_q, for the player and
 * the snapshotted `B` alike; o = 1 if R's public certification day falls in
 * (L_q, day]. (02a writes the quarter [L_q, L_q+1); a lock is recorded after its
 * day's close, so a certification ON L_q was already known to it, and one ON
 * L_q+1 lands inside the quarter being closed.) S_P accumulates the increments
 * and credibility = tanh(S_P / K_CRED).
 *
 * Current day only (`day === belief.day`, on-grid, > 0), and once per quarter: a
 * repeat call returns the quarter's existing entry. Returns null when there is no
 * lock at L_q (no stated curve, nothing to score) or no rung was open, so a
 * quarter counts in the record only when something was actually at stake.
 */
export function scoreQuarter(day) {
    const P = belief.player;
    if (!P || !(day > 0 && isLockDay(day) && day === belief.day)) return null;
    const done = P.scores.find(s => s.to === day);
    if (done) return done;
    const from = day - LOCK_INTERVAL;
    const lock = P.locks.find(l => l.day === from);
    if (!lock) return null;
    const rungs = [];
    for (const R of SCORED_RUNGS) {
        const cd = _certDay(R);
        if (cd != null && cd <= from) continue;                   // certified at L_q: frozen, not scored
        const o = cd != null && cd <= day ? 1 : 0;
        const pP = quarterProb(lock.curves[R].m, lock.curves[R].w, from, day);
        const pM = quarterProb(lock.market[R].m, lock.market[R].w, from, day);
        rungs.push({ R, o, pP, pM, delta: logScoreDelta(pP, pM, o) });
    }
    if (!rungs.length) return null;
    const delta = rungs.reduce((a, r) => a + r.delta, 0);
    P.S += delta;
    P.credibility = Math.tanh(P.S / forecastTuning.K_CRED);
    const rec = Object.freeze({ from, to: day, rungs: Object.freeze(rungs), delta, S: P.S, credibility: P.credibility });
    P.scores.push(rec);
    return rec;
}

/** The player's record (the Desk, the dispatch, the epilogue): quarters scored,
 *  cumulative skill S_P in nats, credibility, and the per-quarter history. */
export function forecastRecord() {
    const P = belief.player;
    if (!P) return null;
    return { quarters: P.scores.length, S: P.S, credibility: P.credibility, locks: P.locks.length, history: P.scores.slice() };
}

/**
 * The latest lock's P(T_R <= D_R) at rung R's contract deadline, survival-
 * conditioned at the lock day -- the same reading a Consensus quote gives, so a
 * copier's claim is the quote it copied. A rung certified by the lock day reads
 * 1 (or 0 if it certified after its deadline); a deadline already behind the
 * lock reads 0. Null if never locked. (The scrutiny gap and the F conversion
 * read playerPilled's horizon measure instead, not this.)
 */
export function lockedClaim(R) {
    const lock = latestLock();
    if (!lock || !lock.curves[R]) return null;
    const D = RUNG_DEADLINE[R];
    const cd = _certDay(R);
    if (cd != null && cd <= lock.day) return cd <= D ? 1 : 0;
    return clamp(crossingProb(lock.curves[R].m, lock.curves[R].w, lock.day, D), 0, 1);
}

/** Current player credibility in (-1, 1): tanh(S_P / K_CRED), written by
 *  scoreQuarter (init 0). */
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
 * The player's "pilledness" in [0,100]: the SAME measure as marketPilled, read off
 * the latest locked curve instead of `B` -- 100 x P(R4 crosses within F_HORIZON
 * days of today | not yet crossed), survival-conditioned at today, through the same
 * law (_condProb) and horizon (coordinator ruling, 2026-10-24). A market copier
 * therefore reads the market's pilledness exactly on its lock day: no scrutiny gap
 * and no conviction from copying. A certified R4 reads 100, as it does for `B`. If
 * the player has never locked there is no divergence to scrutinize, so this tracks
 * the market (no scrutiny heat). lockedClaim keeps the contract-deadline reading
 * for anything else that wants it.
 */
export function playerPilled() {
    const lock = latestLock();
    if (!lock) return marketPilled();
    const D = belief.day + F_HORIZON;
    const cd = _certDay(4);
    if (cd != null) return D >= cd ? 100 : 0;
    const c = lock.curves[4];
    return 100 * _condProb(c.m, c.w, belief.day, D);
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
 *
 * P6-2 F-channel decomposition (02a "Player influence and the ledger"): the step's applied movement splits
 * into the AUTONOMOUS B-wake term (the world waking on its own) and the PLAYER
 * conversion term (advice acts converting the firm). Both are STAMPED on the race
 * (`race.lastFWake` / `race.lastFConvert`) so the orchestrator ledgers ONLY the
 * player component -- charging the player for persuasion, never for the world
 * waking up. `race.F` is computed byte-identically to before (same op order, one
 * final clamp); the clamp haircut, when it bites at a rail, is apportioned across
 * the two terms in proportion to their raw contribution so the stamps sum to the
 * actual applied delta.
 */
export function stepFirmBelief(race, opts = {}) {
    if (!race || typeof race.F !== 'number') return F_MIN;
    const pilled = opts.playerPilled != null ? opts.playerPilled : playerPilled();
    const cred = Math.max(0, credibility());
    const F0 = race.F;
    const wakeTerm = F_WAKE_RATE * (marketPilled() - F0);              // the world waking pulls F up
    const Fmid = F0 + wakeTerm;
    const convertTerm = F_CONVERT_RATE * cred * Math.sign(pilled - Fmid);   // being right early converts the firm
    const Fraw = Fmid + convertTerm;                                  // unclamped target
    race.F = clamp(Fraw, F_MIN, F_MAX);
    // Decompose the APPLIED movement into its two contributions. Use the RAW terms
    // whenever the unclamped target is INTERIOR (no rail bound) -- so wake and
    // conversion that exactly OFFSET are each recorded at full magnitude, never
    // erased (02a "Player influence and the ledger": preventing the autonomous move IS
    // persuasion, and a ledger that zeroed offsetting contributions would launder the
    // very involvement it exists to record). The earlier `applied/rawTotal` form set
    // scale = 0 at the exact-cancellation singularity (rawTotal === 0), erasing both.
    // Apportion proportionally ONLY when the final clamp actually binds at a rail
    // (there Fraw != F0, so rawTotal != 0) -- the two stamps then sum to the applied
    // delta there too. Sum identity (wake + convert == applied) holds in both regimes.
    if (race.F === Fraw) {
        race.lastFWake = wakeTerm;              // interior: raw terms (autonomous; never ledgered)
        race.lastFConvert = convertTerm;        // interior: raw terms (player; the ONLY F row source)
    } else {
        const rawTotal = wakeTerm + convertTerm;
        const scale = rawTotal !== 0 ? (race.F - F0) / rawTotal : 0;
        race.lastFWake = wakeTerm * scale;
        race.lastFConvert = convertTerm * scale;
    }
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
