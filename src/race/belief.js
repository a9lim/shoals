/* ===================================================
   src/race/belief.js -- Market belief `B`, the rule of
   thumb inside it, the belief-backed Consensus and compute
   quoters, market efficiency `eta`, the player's posterior
   and credibility, and firm belief `F`.

   ======================= B (02a) =======================
   `B` is a designed inefficiency (02a "Belief, η, and the
   firm"). It pools two fitted readers of the public record
   (src/race/reader.js): the LEGIBLE reader, which reads the
   market's rule of thumb as it reads the headlines, and the
   FULL reader, which reads the whole record:

     P_B(T <= D | record_t) = (1 - eta)*P_legible + eta*P_full

   with eta the released-frontier dial, then made coherent up
   the certification ladder (P_B(R4) <= P_B(R3) <= P_B(R2)
   pointwise, running minima). Every quote, snapshot and
   display reads the projected pool. `belief.record` is the
   public record (src/race/public-record.js), created at
   initBelief and stepped inside stepBelief; the day's laws
   and family heads are evaluated lazily and cached per day.

   =================== The rule of thumb ==================
   The heuristic updater that was all of `B` before the
   reader: per rung R2-R5 a logistic {m, w} over crossing
   dates, seeded on RUNG_SEED, moved only by releases and
   certifications, every mutation ledgered under its event
   ID. Its raw probabilities reach nothing priced; they enter
   only as the legible reader's features (ruleSummary).

   THE INTEGRITY RULE (09 "Information hygiene"): the rule and
   the record update ONLY on legible events, never on latent
   truth. stepBelief consumes `race.lastTransitions` and the
   public projection only. The alignment sentiment (detected
   incidents, published evidence, leaks, theft disclosures) is
   unpriced. If `B` ever needs noise it draws from the reserved
   deriveSeed(seed,'belief') substream (off).

   ================= Player posterior / F ================
   The player holds per rung R2-R5 a logistic law with a
   plateau, F(x) = (1 - q)*sigma((x - m)/w), over the certified
   crossing day (R5: the terminal crossing). The forecast is a
   STANDING POLICY (02a "The standing policy"): each rung follows
   the market (its effective curve is `B`'s projection, live) or
   carries the player's curve, edited on the Race page. The desk
   SNAPSHOTS it at days 0, 63, 126, ... without asking: each lock
   classifies every rung once and stores, per rung it will score,
   the quarter's probability from each side ({pP, pM});
   scoreQuarter reads the stored pairs. A followed rung has
   pP === pM and scores exactly 0. credibility =
   tanh(S_P / K_CRED). Beside the player, the reader-copier's
   record (02a "The almanac") snapshots and scores the full
   reader's quarter probabilities at the same boundaries. `F`
   lives on race.F.

   Pure of DOM. `belief` is a module-level singleton mirroring
   market.js / consensus.js / compute-market.js.
   =================================================== */

import { createRng, deriveSeed } from './rng.js';
import { placeholderCurve } from './compute-market.js';
import { createPublicRecord, stepPublicRecord, ruleSummary } from './public-record.js';
import { readerLaw, readerFamily, lawCDF, lawQuarter } from './reader.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// ---- The rule of thumb's seed (02a "Belief, η, and the firm") --------------
// Contract deadlines are public listing data (mirrors consensus.js). RUNG_SEED is
// the rule's seed priors, the old listing base rates: medians are seeded so the
// day-0 survival-conditioned F_R(deadline) equals them. The listing base rates
// themselves now live only in consensus.js (02a "Consensus binaries").
const RUNG_LIST = [2, 3, 4, 5];
const LADDER = [2, 3, 4];                                     // the certification ladder
const RUNG_DEADLINE = { 2: 420, 3: 756, 4: 880, 5: 1000 };   // consensus deadlines
const RUNG_SEED = { 2: 0.70, 3: 0.62, 4: 0.60, 5: 0.70 };    // the rule's seed priors
// The readers' supports (02a "The reader"): R2-R4 certify through day 1008; the
// R5 crossing law runs through day 1260 so the compute horizon is covered.
const TERM_END = 1008;
const SUPPORT = { 2: TERM_END, 3: TERM_END, 4: TERM_END, 5: 1260 };
// Expected certification lag (public knowledge, 02a): a released-rung CLAIM
// implies certification ~this many days out. R5 has no certification (terminal);
// its "lead" is a placeholder used only for the crossing-belief target.
const CERT_LEAD = { 2: 25, 3: 60, 4: 20, 5: 40 };

// The rule's listing widths (days), 02a.
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
// RATIFIED posterior bounds (02a): medians in [0, 2016], widths in [25, 400],
// plateaus (the mass on never) in [0, 0.95].
export const POSTERIOR = Object.freeze({ M_MIN: 0, M_MAX: 2016, W_MIN: 25, W_MAX: 400, Q_MIN: 0, Q_MAX: 0.95 });
// The projection's sample spacing (02a "Displays"): days t + 21k within the support.
const PROJECTION_STEP = 21;
const SCORED_RUNGS = [2, 3, 4];       // RATIFIED: R5 is never scored -- nothing certifies it
const SCORE_P_MIN = 0.02, SCORE_P_MAX = 0.98;   // RATIFIED clamp on each quarter's crossing probability
// credibility = tanh(S_P / K_CRED). K_CRED = 1.35 (02a), set by
// `node tools/forecast-test.mjs 2000 --calibrate` on the validation seeds
// 2,000,001+ under reader schema 11: the largest K at which the reader-copier
// clears the memo gate by day 882 in half of worlds with two standard errors to
// spare (53.1%; the "earlier" preset 5.6%). It was 1.8 against the heuristic `B`.
// Mutable so the harness can sweep it.
export const forecastTuning = { K_CRED: 1.35 };
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
    player: null,            // { policy:{R:'follow'|'carry'}, carried:{R:{m,w,q}|null}, locks:[{day,classes,curves,market,pairs,claims}], scores:[], S, var0, credibility }
    copier: null,            // the reader-copier's record: { locks:[{day,pairs}], scores:[], S, var0, credibility }
    record: null,            // the public record (public-record.js), stepped by stepBelief
};

// The day's pooled `B`, evaluated lazily from the record, the rule and the day,
// and dropped whenever stepBelief or initBelief moves any of them.
let _version = 0, _cache = null;
// How often the coherence projection binds (02a "What the pool guarantees"),
// measured once per day at the quarter, the contract deadline and the term's end.
const _coherence = { days: 0, checks: 0, binds: 0, maxGap: 0, sumGap: 0 };

const _CAUSE_KEEP = 4000;    // cap the audit trail (bounded; ~hundreds of ledgered mutations/run)

/** A fresh player: every rung follows the market (02a "The standing policy");
 *  no lock, no record. */
function _freshPlayer() {
    return { policy: { 2: 'follow', 3: 'follow', 4: 'follow', 5: 'follow' }, carried: { 2: null, 3: null, 4: null, 5: null },
        locks: [], scores: [], S: 0, var0: 0, credibility: 0 };
}

/** A fresh reader-copier record (02a "The almanac"). */
function _freshCopier() {
    return { locks: [], scores: [], S: 0, var0: 0, credibility: 0 };
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
        const D = RUNG_DEADLINE[R], b = RUNG_SEED[R], w = RUNG_WIDTH[R];
        rungs[R] = { m: _solveMedian(w, D, b), w, crossed: false, certDay: null };
    }
    return rungs;
}

// ---- Construction / reset ------------------------------------------------

/** Build a fresh belief store for a race. Dynamic-mode init/reset. Draws the
 *  belief noise substream from the run seed (NEW named stream -- never an
 *  existing one, per the seed-stability convention). A race without a
 *  capability block (the alignment probes' synthetic ledgers) gets the rule and
 *  the sentiment only: no record, so no `B` and no player. */
export function initBelief(race) {
    belief.active = true;
    belief.day = race ? race.day : 0;
    belief.rungs = _seedRungs();
    belief.alignment = 0;
    belief.processed = new Set();
    belief.causes = [];
    belief.rng = race ? createRng(deriveSeed(race.seed, 'belief')) : null;
    belief.noise = false;
    belief.record = race && race.capability ? createPublicRecord(race) : null;
    _version++; _cache = null;
    Object.assign(_coherence, { days: 0, checks: 0, binds: 0, maxGap: 0, sumGap: 0 });
    belief.player = belief.record ? _freshPlayer() : null;
    belief.copier = belief.record ? _freshCopier() : null;
    // NO manufactured forecast (02a "The standing policy"): every rung starts
    // following, and day 0's snapshot is the close of Edition 1. Until a lock is
    // recorded there is nothing to score and credibility stays 0.
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
    belief.copier = null;
    belief.record = null;
    _version++; _cache = null;
}

// ---- The pool (02a "Belief, η, and the firm") ------------------------------

/** The day's readers, lazily: the rule's summary and eta, then per rung the
 *  legible and full laws (null once certified), the family heads and the
 *  projection, each filled on first use. Keyed on the version stepBelief and
 *  initBelief bump. */
function _day() {
    if (_cache && _cache.version === _version) return _cache;
    const rec = belief.record;
    if (!rec) throw new Error('belief: no public record (B needs a race)');
    if (rec.day !== belief.day) throw new Error(`belief: record day ${rec.day} != belief day ${belief.day}`);
    const rule = ruleSummary(belief.rungs, rec.day);
    const eta = marketEfficiency(rec.snapshot.view);
    const laws = {};
    for (const R of RUNG_LIST) {
        let L = null;
        Object.defineProperty(laws, R, { enumerable: true, get: () => L || (L = { legible: readerLaw(rec, R, 'legible', rule), full: readerLaw(rec, R, 'full', rule) }) });
    }
    _cache = { version: _version, day: rec.day, rule, eta, laws, family: null, projection: null, certs: {} };
    for (const R of LADDER) {
        let d = null;
        for (const id of ['halcyon', 'tianxia', 'polaris']) {
            const c = rec.snapshot.labs[id].certs[R];
            if (c != null && (d == null || c < d)) d = c;
        }
        _cache.certs[R] = d;
    }
    return _cache;
}

/** Unprojected pooled CDF of rung R at D (open rung). */
function _pooled(c, R, D) {
    const L = c.laws[R];
    return (1 - c.eta) * lawCDF(L.legible, c.day, D) + c.eta * lawCDF(L.full, c.day, D);
}

/** The projected pooled CDF P_B(T_R <= D | record_t). A certified rung is a step
 *  at its certification day. R2-R4 take running minima up the ladder; R5 sits
 *  outside it (an internal crossing can end a world before R4 certifies). */
function _projected(c, R, D) {
    if (R === 5) return _pooled(c, 5, D);
    let p = 1;
    for (const r of LADDER) {
        if (r > R) break;
        const cd = c.certs[r];
        const v = cd != null ? +(D >= cd) : _pooled(c, r, D);
        p = Math.min(p, v);
    }
    return p;
}

/** Record how often, and by how much, the coherence projection binds today, at the
 *  quarter, the contract deadline and the term's end (02a: reported, not gated). */
function _measureCoherence(c) {
    if (c.measured) return;
    c.measured = true;
    _coherence.days++;
    for (const R of [3, 4]) {
        if (c.certs[R] != null) continue;
        for (const D of [c.day + LOCK_INTERVAL, RUNG_DEADLINE[R], TERM_END]) {
            if (D <= c.day) continue;
            const gap = _pooled(c, R, D) - _projected(c, R, D);
            _coherence.checks++;
            if (gap > 1e-9) { _coherence.binds++; _coherence.sumGap += gap; _coherence.maxGap = Math.max(_coherence.maxGap, gap); }
        }
    }
}

/** P_B(rung R certified -- R5: crossed -- by day D | the record today): the pooled,
 *  projected probability every quote, snapshot and display reads. */
export function binaryProb(R, D) {
    const c = _day();
    _measureCoherence(c);
    return _projected(c, R, D);
}

/** `B`'s probability for the quarter that starts today: P_B(T_R <= today + 63). */
export function quarterProbB(R) {
    return binaryProb(R, belief.day + LOCK_INTERVAL);
}

/** Public certification day of rung R (R2-R4; any frontier lab, direct or
 *  implied), from the record. R5 never certifies. */
export function certDay(R) {
    if (!LADDER.includes(R)) return null;
    return _day().certs[R];
}
export function isCertified(R) { return certDay(R) != null; }

/** The pooled conditional median of rung R: the first day on which P_B reaches
 *  one half, within the support; null ("not this term") when less than half the
 *  mass lands there. A certified rung reads its certification day. */
function _median(c, R) {
    if (R !== 5 && c.certs[R] != null) return c.certs[R];
    const hi = SUPPORT[R];
    if (_projected(c, R, hi) < 0.5) return null;
    let lo = c.day, top = hi;            // P(lo) < 0.5 <= P(top)
    while (top - lo > 1) {
        const mid = (lo + top) >> 1;
        if (_projected(c, R, mid) >= 0.5) top = mid; else lo = mid;
    }
    return top;
}

/** The implied timeline (02a "Displays"): rung -> the pooled conditional median,
 *  a certification day, or null for "not this term". */
export function impliedTimeline() {
    const c = _day();
    const out = {};
    for (const R of RUNG_LIST) out[R] = _median(c, R);
    return out;
}

/** `B`'s law of rung R for the race page, or null once certified: cdf(D), the
 *  integer-day mass at D, the conditional median (null: not this term), the
 *  support and the mass beyond it. Valid for today only. */
export function beliefLaw(R) {
    const c = _day();
    if (R !== 5 && c.certs[R] != null) return null;
    const cdf = (D) => _projected(c, R, D);
    return Object.freeze({
        R, day: c.day, support: SUPPORT[R], cdf,
        density: (D) => (D <= c.day ? 0 : cdf(D) - cdf(D - 1)),
        median: _median(c, R),
        atom: 1 - cdf(SUPPORT[R]),
    });
}

/** The two readers' family distributions today (families 1..6 at index k - 1)
 *  and eta, for the valuation layer. */
export function familyHeads() {
    const c = _day();
    if (!c.family) {
        const rec = belief.record;
        c.family = { legible: readerFamily(rec, 'legible', c.rule), full: readerFamily(rec, 'full', c.rule) };
    }
    return { legible: c.family.legible, full: c.family.full, eta: c.eta };
}

/** The coherence projection's binding statistics since initBelief. */
export function coherenceStats() {
    return { ..._coherence, meanGap: _coherence.binds ? _coherence.sumGap / _coherence.binds : 0 };
}

/** The day's market-efficiency dial, read off the record's public view. */
export function beliefEta() { return _day().eta; }

/**
 * Display only (the ticket's scenarios, 02a): `B` re-evaluated on copies of the record and
 * the rule as they would stand on day `day` (> today). With `rung`, a frontier
 * certification of that rung lands on that day -- claimed then if it was not, by
 * the lab with the highest claimed rung -- folded into the rule copy by the
 * rule's own certification update. With `routine`, each active frontier lab
 * keeps releasing at its trailing 252-day cadence: rung-less releases spaced
 * evenly through the stretch, entered in the record copy and folded into the
 * rule copy by the rule's own routine-release nudge, so a quiet stretch is not a
 * silent one. Nothing reaches the singleton: the rule's state, ledger and
 * processed set are restored before returning.
 * @returns {(R:number, D:number) => number} the scenario's projected P_B
 */
export function scenarioBelief(day, rung = null, { routine = false } = {}) {
    const now = _day();
    if (!(day > now.day)) throw new Error('scenarioBelief: the scenario day must be after today');
    const rec = JSON.parse(JSON.stringify(belief.record));
    const t0 = rec.day;
    const v = rec.snapshot.view;
    const active = ['halcyon', 'tianxia', 'polaris'].filter(id => rec.snapshot.labs[id].active);
    // Routine releases: k per lab over the stretch, at the lab's trailing cadence.
    const routineRows = [];
    if (routine) {
        const window = Math.min(252, t0), span = day - t0;
        for (const id of active) {
            const n = window > 0 ? rec.releases.filter(r => r.lab === id && t0 - r.day < 252).length : 0;
            const k = window > 0 ? Math.round(n / window * span) : 0;
            for (let j = 1; j <= k; j++) routineRows.push({ day: t0 + Math.max(1, Math.round(j * span / (k + 1))), lab: id });
        }
        routineRows.sort((a, b) => a.day - b.day || a.lab.localeCompare(b.lab));
        for (const r of routineRows) {
            rec.releases.push({ day: r.day, lab: r.lab, rungs: [] });
            const L = rec.snapshot.labs[r.lab];
            L.releaseCount++; L.lastReleaseDay = r.day;
            v.releaseCount++; v.lastReleaseDay = Math.max(v.lastReleaseDay, r.day);
        }
    }
    rec.day = day; rec.snapshot.day = day; v.day = day;
    let rungs = JSON.parse(JSON.stringify(belief.rungs));
    let lab = null;
    if (rung != null && LADDER.includes(rung)) {
        lab = active.reduce((a, id) => (v.claimedRung[id] > v.claimedRung[a] ? id : a), active[0]);
        const L = rec.snapshot.labs[lab];
        for (let r = 1; r <= rung; r++) {
            if (L.claims[r] == null) L.claims[r] = day;
            if (r >= 2 && L.certs[r] == null) L.certs[r] = day;
        }
        v.claimedRung[lab] = Math.max(v.claimedRung[lab], rung);
        v.releasedFrontierRung = Math.max(v.releasedFrontierRung, rung);
        v.certifiedFrontierRung = Math.max(v.certifiedFrontierRung, rung);
    }
    if (routineRows.length || lab) {
        // The rule's own updates, run on the copy in day order.
        const saved = { rungs: belief.rungs, causes: belief.causes, processed: belief.processed, day: belief.day };
        try {
            belief.rungs = rungs; belief.causes = []; belief.processed = new Set();
            for (const r of routineRows) {
                belief.day = r.day;
                const R = _nextUncrossed();
                if (R != null) _pullMedian(R, r.day + (CERT_LEAD[R] || 30) + RUNG_SPACING, A_ROUTINE, `scenario_rel_${r.lab}_${r.day}_routine`, 'release-cadence');
            }
            if (lab) {
                belief.day = day;
                const id = `scenario_${lab}_R${rung}_${day}`;
                _markCrossed(rung, day, id, 'scenario');
                if (RUNG_LIST.includes(rung + 1)) _pullMedian(rung + 1, day + RUNG_SPACING, A_CERT_NEXT, `${id}_next`, 'scenario');
            }
            rungs = belief.rungs;
        } finally {
            Object.assign(belief, saved);
        }
    }
    const rule = ruleSummary(rungs, day);
    const laws = {};
    for (const R of RUNG_LIST) laws[R] = { legible: readerLaw(rec, R, 'legible', rule), full: readerLaw(rec, R, 'full', rule) };
    const c = { day, eta: marketEfficiency(rec.snapshot.view), laws, certs: {} };
    for (const R of LADDER) {
        let d = null;
        for (const id of ['halcyon', 'tianxia', 'polaris']) {
            const x = rec.snapshot.labs[id].certs[R];
            if (x != null && (d == null || x < d)) d = x;
        }
        c.certs[R] = d;
    }
    return (R, D) => _projected(c, R, D);
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
 * Advance `B` one completed day: fold `race.lastTransitions` (the per-tick
 * ledger) into the rule of thumb and the alignment sentiment, then step the
 * public record with the day's public world inputs `{ straitTension,
 * exportControlStage, treatyStage }` (02a "The reader": absent inputs read 0).
 * Never reads latent queues or continuous state, so corrupting every latent
 * field leaves `B` invariant. Call once per completed day, after
 * stepControlRegime and stepTreaty, before the quotes refresh.
 */
export function stepBelief(race, inputs = {}) {
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

    // 7. The public record (02a "The reader"), after the regime ratchet and the
    //    treaty track have run; a same-day replay is a no-op there too. Then drop
    //    the day's pooled laws.
    if (belief.record) stepPublicRecord(belief.record, race, inputs);
    _version++; _cache = null;
    // A certification freezes the certified rung's effective curve at its day and
    // moves no carried curve (02a "The standing policy"): draftCurves reads it off
    // the stepped record, so nothing here edits the player's policy.
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
 * Consensus binary quote from `B`: the pooled, projected P(rung R certified by
 * the contract's deadline). Reads the `belief` singleton (built from the public
 * record) + the PUBLIC `view` + the contract's own listed deadline -- never
 * `race`. The listing base rates in consensus.js are the population mean of this
 * quote at day 0 (02a "Consensus binaries"). Swap in via setBinaryQuoteSource.
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

// ---- The player's posterior: the standing policy, locks, scoring -----------
// 02a "Belief, η, and the firm", the posterior and "The standing policy". Per
// tracked rung R2-R5 the player holds F(x) = (1 - q)*sigma((x - m)/w) over the
// certified crossing day (R5: the terminal crossing): m is the median given that
// the rung ever certifies and q the mass on never. Each rung FOLLOWS the market or
// CARRIES the player's curve; the effective curve is `B`'s projection, live, for a
// followed rung, the carried curve for a carried one, and the certification day
// for a certified one. Medians and plateaus are monotone over the carried,
// uncertified rungs of R2-R4; R5 is not ordered against them, and a followed rung
// is never pushed or pushed against. A quarterly LOCK snapshots the policy,
// classifies every rung once and stores, per rung it will score, the quarter's
// probability from each side; scoreQuarter reads the stored pairs. Certification
// days come from the public record.

/** True on a scheduled lock day (0, 63, 126, ...). RATIFIED schedule. */
export function isLockDay(day) {
    return day >= 0 && day % LOCK_INTERVAL === 0;
}

/** The editor's floor: no edit places an open ladder median before the latest
 *  public certification day (certified rungs are a prefix of the ladder), else
 *  the lower bound. It limits edits and moves no curve (02a "The standing
 *  policy"). */
function _openFloor() {
    let floor = POSTERIOR.M_MIN;
    for (const R of LADDER) { const cd = certDay(R); if (cd != null) floor = Math.max(floor, cd); }
    return floor;
}

/** Tracked rungs not yet certified (the rungs a preset moves and the editor
 *  shows). R5 never certifies, so it is always open. */
export function openRungs() {
    return RUNG_LIST.filter(R => certDay(R) == null);
}

/** ln S(x) for the plateau law, S = 1 - (1 - q)*sigma(z), z = (x - m)/w, written
 *  as softplus(z + ln q) - softplus(z) so it stays finite in both tails. */
function _lnSurvival(m, w, q, x) {
    const z = (x - m) / w;
    return (q > 0 ? _softplus(z + Math.log(q)) : 0) - _softplus(z);
}

/** Survival-conditioned P(t0 < T <= t1 | T > t0) under {m, w, q}, as
 *  1 - S(t1)/S(t0) in log space. Pure; the Race page and the Markets panel draw the draft with it. */
export function crossingProb(m, w, q, t0, t1) {
    if (t1 <= t0) return 0;
    return -Math.expm1(_lnSurvival(m, w, q, t1) - _lnSurvival(m, w, q, t0));
}

/** The quarter's scored crossing probability (02a): P(T in (L_q, L_q+1] | T > L_q)
 *  under {m, w, q}, clamped to [0.02, 0.98]. Pure; the harness scores with it too. */
export function quarterProb(m, w, q, t0, t1) {
    return clamp(crossingProb(m, w, q, t0, t1), SCORE_P_MIN, SCORE_P_MAX);
}

/** The plateau handle's quantity (02a): the conditional curve's height at the
 *  term's end, 1 - S(1008)/S(t), the chance of a crossing this term given none
 *  by day t. */
export function plateauHeight(m, w, q, t) {
    return crossingProb(m, w, q, t, TERM_END);
}

/** A curve's conditional median for rung R: the day its crossing CDF, given no
 *  crossing by day t, reaches one half, or null when it doesn't within the
 *  rung's support ("not this term", as `impliedTimeline` reads `B`). `m` alone is
 *  the median given the rung ever certifies, so prose compares this instead.
 *  Closed form: S(x) = q + (1 - q)·σ(-(x - m)/w), solved for S(x) = S(t)/2. */
export function curveMedian(c, t, R) {
    if (!c) return null;
    const half = Math.exp(_lnSurvival(c.m, c.w, c.q || 0, t)) / 2;
    const q = c.q || 0;
    if (half <= q) return null;
    const u = (half - q) / (1 - q);
    const x = c.m + c.w * Math.log((1 - u) / u);
    return x <= (SUPPORT[R] ?? TERM_END) ? Math.max(t, x) : null;
}

/** The q that gives conditional height h at the term's end, given m, w and day t,
 *  solved for q directly. With the logistic's survival c_x = sigma(-(x - m)/w),
 *  S(x) = q + (1 - q)*c_x, and 1 - S(E)/S(t) = h gives
 *  q = (d - h*c_t) / (h*F_t + d), where F_t = 1 - c_t and d = c_t - c_E >= 0.
 *  Every term is a product or a stable difference of tails (no cancellation of
 *  saturated sigmoids), so q stays exact even when it is ~1e-17 late in the
 *  term. Clamped to the bounds on q (an unreachable height gives q = 0). */
function _plateauQ(m, w, t, h) {
    const zt = (t - m) / w, zE = (TERM_END - m) / w;
    const ct = Math.exp(-_softplus(zt)), Ft = Math.exp(-_softplus(-zt));
    const d = zt < 0 ? sigmoid(zE) - sigmoid(zt) : ct - Math.exp(-_softplus(zE));
    const den = h * Ft + d;
    if (!(den > 0)) return POSTERIOR.Q_MAX;
    return clamp((d - h * ct) / den, POSTERIOR.Q_MIN, POSTERIOR.Q_MAX);
}

// The projection's search grid (02a "Displays": a deterministic least-squares fit).
const PROJ_W_GRID = Array.from({ length: 13 }, (_, i) => POSTERIOR.W_MIN * Math.pow(POSTERIOR.W_MAX / POSTERIOR.W_MIN, i / 12));
const PROJ_M_STEP = 24, PROJ_M_BACK = 600;

/** Least-squares fit of {m, w, q} to the conditional curve `ys` at days `Ds`,
 *  given no crossing by t. For fixed (m, w) the conditional CDF is
 *  A*(sigma_D - sigma_t) with A = (1 - q)/(1 - (1 - q)*sigma_t), linear in A, so A is
 *  solved in closed form and clamped to q's bounds; (m, ln w) are searched on a
 *  grid and refined by a halving pattern search. Deterministic. */
function _fitPlateauLaw(t, Ds, ys) {
    const n = Ds.length;
    const d = new Float64Array(n);
    const sse = (m, w) => {
        const zt = (t - m) / w, st = sigmoid(zt), ct = sigmoid(-zt);
        let sdy = 0, sdd = 0;
        for (let k = 0; k < n; k++) {
            const zD = (Ds[k] - m) / w;
            d[k] = zt < 0 ? sigmoid(zD) - st : ct - sigmoid(-zD);
            sdy += d[k] * ys[k]; sdd += d[k] * d[k];
        }
        const aLo = 1 - POSTERIOR.Q_MAX, aHi = 1 - POSTERIOR.Q_MIN;
        const Alo = aLo / ((1 - aLo) + aLo * ct), Ahi = aHi / ((1 - aHi) + aHi * ct);
        const A = clamp(sdd > 0 ? sdy / sdd : Ahi, Alo, Ahi);
        let e = 0;
        for (let k = 0; k < n; k++) { const r = ys[k] - A * d[k]; e += r * r; }
        return { e, A, st };
    };
    let best = null;
    for (let m = Math.max(POSTERIOR.M_MIN, t - PROJ_M_BACK); m <= POSTERIOR.M_MAX; m += PROJ_M_STEP) {
        for (const w of PROJ_W_GRID) {
            const r = sse(m, w);
            if (!best || r.e < best.e) best = { m, lw: Math.log(w), e: r.e };
        }
    }
    let sm = PROJ_M_STEP / 2, sw = Math.log(PROJ_W_GRID[1] / PROJ_W_GRID[0]) / 2;
    const lwLo = Math.log(POSTERIOR.W_MIN), lwHi = Math.log(POSTERIOR.W_MAX);
    for (let it = 0; it < 200 && sm > 0.05; it++) {
        let moved = false;
        for (const [dm, dw] of [[sm, 0], [-sm, 0], [0, sw], [0, -sw]]) {
            const m = clamp(best.m + dm, POSTERIOR.M_MIN, POSTERIOR.M_MAX), lw = clamp(best.lw + dw, lwLo, lwHi);
            const e = sse(m, clamp(Math.exp(lw), POSTERIOR.W_MIN, POSTERIOR.W_MAX)).e;
            if (e < best.e - 1e-15) { best = { m, lw, e }; moved = true; }
        }
        if (!moved) { sm /= 2; sw /= 2; }
    }
    const w = clamp(Math.exp(best.lw), POSTERIOR.W_MIN, POSTERIOR.W_MAX), r = sse(best.m, w);
    const a = r.A / (1 + r.A * r.st);
    return { m: best.m, w, q: clamp(1 - a, POSTERIOR.Q_MIN, POSTERIOR.Q_MAX) };
}

/** `B`'s projection onto the player's family (02a "Displays"), cached per day: a
 *  fit to the pooled conditional CDF at days t + 21k within each rung's support,
 *  then made monotone over the ladder like any curve set. A certified rung is
 *  frozen at its day (q 0, the narrowest width). */
function _projection() {
    const c = _day();
    if (c.projection) return c.projection;
    const out = {};
    for (const R of RUNG_LIST) {
        const cd = R === 5 ? null : c.certs[R];
        if (cd != null) { out[R] = { m: cd, w: POSTERIOR.W_MIN, q: 0 }; continue; }
        const Ds = [];
        for (let D = c.day + PROJECTION_STEP; D <= SUPPORT[R]; D += PROJECTION_STEP) Ds.push(D);
        if (!Ds.length && SUPPORT[R] > c.day) Ds.push(SUPPORT[R]);
        out[R] = Ds.length
            ? _fitPlateauLaw(c.day, Ds, Ds.map(D => _projected(c, R, D)))
            : { m: POSTERIOR.M_MAX, w: POSTERIOR.W_MAX, q: POSTERIOR.Q_MAX };
    }
    c.projection = Object.freeze(_orderCurves(out));
    return c.projection;
}

/** Ladder order (02a): medians and plateaus monotone over R2-R4, pushed up to the
 *  running floor; a certified rung anchors the floor at its day with q 0. */
function _orderCurves(curves) {
    let prevM = -Infinity, prevQ = POSTERIOR.Q_MIN;
    for (const R of LADDER) {
        const c = curves[R];
        if (certDay(R) != null) { prevM = Math.max(prevM, c.m); continue; }
        c.m = Math.max(prevM, c.m); c.q = Math.max(prevQ, c.q);
        prevM = c.m; prevQ = c.q;
    }
    return curves;
}

/**
 * Bring a curve set inside the posterior's rules: every rung present, m, w and q
 * clamped to their bounds, a certified rung frozen at its certification day with
 * q 0 (its width kept), then the ladder's medians and plateaus made monotone.
 * Missing or non-finite input falls back to `B`'s projection for that rung.
 * Returns a fresh object; the input is untouched.
 */
export function normalizeCurves(curves) {
    let mk = null;
    const fb = (R) => (mk || (mk = _projection()))[R];
    const out = {};
    for (const R of RUNG_LIST) {
        const c = curves && curves[R];
        const m0 = c && Number.isFinite(c.m) ? c.m : fb(R).m;
        const w0 = c && Number.isFinite(c.w) ? c.w : fb(R).w;
        const q0 = c && Number.isFinite(c.q) ? c.q : fb(R).q;
        const cd = certDay(R);
        out[R] = cd != null
            ? { m: cd, w: clamp(w0, POSTERIOR.W_MIN, POSTERIOR.W_MAX), q: 0 }
            : { m: clamp(m0, POSTERIOR.M_MIN, POSTERIOR.M_MAX), w: clamp(w0, POSTERIOR.W_MIN, POSTERIOR.W_MAX), q: clamp(q0, POSTERIOR.Q_MIN, POSTERIOR.Q_MAX) };
    }
    return _orderCurves(out);
}

/** True when two curve sets agree exactly on rung R ({m, w, q} bit-equal). */
export function curvesEqual(a, b, R) {
    return !!(a && b && a[R] && b[R] && a[R].m === b[R].m && a[R].w === b[R].w && a[R].q === b[R].q);
}

const _copyCurves = (src) => {
    const out = {};
    for (const R of RUNG_LIST) out[R] = { m: src[R].m, w: src[R].w, q: src[R].q };
    return out;
};

/** `B`'s projection onto the player's family: a followed rung's effective curve
 *  and the display copy every lock stores. Following the market is a policy, not
 *  a drawing of this (02a "Displays"). */
export function marketCurves() {
    return _copyCurves(_projection());
}

/**
 * The static presets the harnesses carry (02a "The edge, gated"): 'market' is the
 * projection; 'earlier' moves every open rung half a width sooner (m - 0.5*w, w
 * and q kept); 'later' half a width later. Normalized, so a shift that would
 * cross a neighbour or a certification day is pushed back into order.
 */
export function presetCurves(kind) {
    const mk = marketCurves();
    if (kind === 'market') return mk;
    const dir = kind === 'earlier' ? -1 : kind === 'later' ? 1 : 0;
    const out = {};
    for (const R of RUNG_LIST) {
        out[R] = certDay(R) != null ? mk[R] : { m: mk[R].m + dir * 0.5 * mk[R].w, w: mk[R].w, q: mk[R].q };
    }
    return normalizeCurves(out);
}

/** The effective curves (02a "The standing policy"), uncopied: `B`'s projection,
 *  live, on a followed rung; the carried curve on a carried one; the
 *  certification day (the projection's frozen curve) on a certified one. */
function _effective() {
    // INTERPRETATION: a certified rung's effective (and stored) curve is the
    // projection's frozen one, {certification day, W_MIN, q 0}, whatever its
    // policy; its carried curve, if any, stays where the player left it.
    const P = belief.player, mk = _projection(), out = {};
    for (const R of RUNG_LIST) out[R] = P.policy[R] === 'carry' && certDay(R) == null ? P.carried[R] : mk[R];
    return out;
}

/** A copy of the player's effective curves, the ones the editor draws (null
 *  outside Dynamic). */
export function draftCurves() {
    return belief.player ? _copyCurves(_effective()) : null;
}

/** The standing policy per rung, 'follow' or 'carry' (null outside Dynamic). */
export function draftPolicy() {
    const P = belief.player;
    return P ? { ...P.policy } : null;
}

/** Carry the given curves on every rung, normalized (bounds, the certification
 *  freeze, the ladder's order): the harnesses' scripted players. Returns the
 *  effective curves. */
export function setDraft(curves) {
    const P = belief.player;
    if (!P) return null;
    const n = normalizeCurves(curves);
    for (const R of RUNG_LIST) { P.carried[R] = n[R]; P.policy[R] = 'carry'; }
    return draftCurves();
}

/** Follow the market (02a "The standing policy"): rung R, or every rung when R is
 *  omitted, goes back to `B`'s projection, live. Returns the effective curves. */
export function followMarket(R = null) {
    const P = belief.player;
    if (!P) return null;
    for (const r of (R == null ? RUNG_LIST : [R])) {
        if (!RUNG_LIST.includes(r)) continue;
        P.policy[r] = 'follow';
        P.carried[r] = null;
    }
    return draftCurves();
}

/**
 * An edit carries (02a "The standing policy"). On a followed rung it first
 * copies the projection into the carried curve, clamps the copy's median and
 * plateau between its carried, uncertified ladder neighbours' (moving no
 * neighbour; R5 is unordered), and sets the rung carrying. Without the clamp a
 * width edit on a projection that crosses a carried neighbour would carry a set
 * that fails validation. Returns the carried curve, which the caller edits.
 */
function _carry(R) {
    const P = belief.player;
    if (P.policy[R] === 'carry') return P.carried[R];
    const p = _projection()[R], c = { m: p.m, w: p.w, q: p.q };
    if (R !== 5) {
        for (const r of LADDER) {
            if (r === R || !_ordered(P, r)) continue;
            const n = P.carried[r];
            if (r < R) { c.m = Math.max(c.m, n.m); c.q = Math.max(c.q, n.q); }
            else { c.m = Math.min(c.m, n.m); c.q = Math.min(c.q, n.q); }
        }
    }
    P.carried[R] = c;
    P.policy[R] = 'carry';
    return c;
}

/** Whether ladder rung r is in the carried order (carried and uncertified). */
function _ordered(P, r) {
    return P.policy[r] === 'carry' && certDay(r) == null;
}

/**
 * Move one open rung's median (the editor's drag and ←/→). The rung carries. On
 * the ladder, the edit restores order among the carried, uncertified rungs by
 * pushing carried neighbours (later rungs rise to meet it, earlier ones fall);
 * followed rungs are never pushed. No edit places a median before the latest
 * certification day (the editor's floor: it limits edits and moves no curve).
 * R5 moves alone. A certified rung is frozen: null.
 */
export function setDraftMedian(R, m) {
    const P = belief.player;
    if (!P || !RUNG_LIST.includes(R) || certDay(R) != null || !Number.isFinite(m)) return null;
    const c = _carry(R);
    if (R === 5) { c.m = clamp(m, POSTERIOR.M_MIN, POSTERIOR.M_MAX); return draftCurves(); }
    const v = clamp(m, _openFloor(), POSTERIOR.M_MAX);
    for (const r of LADDER) {
        if (!_ordered(P, r)) continue;
        const d = P.carried[r];
        if (r === R) d.m = v;
        else if (r > R && d.m < v) d.m = v;
        else if (r < R && d.m > v) d.m = v;
    }
    return draftCurves();
}

/** Set one open rung's width (the editor's vertical drag and ↑/↓). The rung
 *  carries; no neighbour moves. */
export function setDraftWidth(R, w) {
    const P = belief.player;
    if (!P || !RUNG_LIST.includes(R) || certDay(R) != null || !Number.isFinite(w)) return null;
    _carry(R).w = clamp(w, POSTERIOR.W_MIN, POSTERIOR.W_MAX);
    return draftCurves();
}

/**
 * Set one open rung's plateau by its handle (02a): `h` is the conditional
 * curve's height at the term's end, 1 - S(1008)/S(today), and q follows from it
 * given the rung's m and w. The rung carries; on the ladder, the edit pushes
 * carried neighbours' q (later rungs rise to meet it, earlier fall). R5 moves
 * alone. A certified rung is frozen: null.
 */
export function setDraftPlateau(R, h) {
    const P = belief.player;
    if (!P || !RUNG_LIST.includes(R) || certDay(R) != null || !Number.isFinite(h)) return null;
    const d = _carry(R);
    const q = _plateauQ(d.m, d.w, belief.day, clamp(h, 0, 1));
    if (R === 5) { d.q = q; return draftCurves(); }
    for (const r of LADDER) {
        if (!_ordered(P, r)) continue;
        const x = P.carried[r];
        if (r === R) x.q = q;
        else if (r > R && x.q < q) x.q = q;
        else if (r < R && x.q > q) x.q = q;
    }
    return draftCurves();
}

// -- The draft's state (02a "The run, headless") --------------------------
// The forecast editor works on a copy during a gesture and commits it on the
// gesture's end, so the run's draft changes only by command (run.js 'forecast')
// and a lock never sees a half-finished drag. A state is every rung's policy and
// carried curve; the edits below are the setters above applied to a copy, so
// their clamping is unchanged.

const _copyCarried = (src) => {
    const out = {};
    for (const R of RUNG_LIST) out[R] = src[R] ? { m: src[R].m, w: src[R].w, q: src[R].q } : null;
    return out;
};

/** The draft's whole state, copied: { policy: {R: 'follow'|'carry'}, carried:
 *  {R: {m, w, q} | null} } (null outside Dynamic). */
export function draftState() {
    const P = belief.player;
    return P ? { policy: { ...P.policy }, carried: _copyCarried(P.carried) } : null;
}

/** Run `fn` with the player's policy and carried curves swapped for a copy of
 *  `state`; returns the copy as `fn` left it. The draft itself is untouched. */
function _onCopy(state, fn) {
    const P = belief.player;
    if (!P || !state) return null;
    const saved = { policy: P.policy, carried: P.carried };
    P.policy = { ...state.policy };
    P.carried = _copyCarried(state.carried);
    try {
        fn();
        return { policy: { ...P.policy }, carried: _copyCarried(P.carried) };
    } finally {
        P.policy = saved.policy;
        P.carried = saved.carried;
    }
}

/**
 * A pure edit: `state` with one editor edit applied under the setters' own rules
 * (the carry on a first edit, the neighbours pushed, the clamps). `edit` is
 * { op: 'median' | 'width' | 'plateau', R, v }, or { op: 'follow', R } (R null:
 * every rung). Returns the new state; the draft is untouched.
 */
export function editDraftState(state, edit) {
    return _onCopy(state, () => {
        if (edit.op === 'median') setDraftMedian(edit.R, edit.v);
        else if (edit.op === 'width') setDraftWidth(edit.R, edit.v);
        else if (edit.op === 'plateau') setDraftPlateau(edit.R, edit.v);
        else if (edit.op === 'follow') followMarket(edit.R ?? null);
    });
}

/** A state's effective curves and policy, as draftCurves() and draftPolicy()
 *  read the draft's (the editor draws its copy mid-gesture). */
export function draftStateView(state) {
    let view = null;
    _onCopy(state, () => { view = { curves: draftCurves(), policy: draftPolicy() }; });
    return view;
}

/**
 * Commit `state` as the draft, validated: every rung's policy 'follow' (no
 * carried curve) or 'carry' (a finite curve), and the result passing the lock's
 * own validation. Returns true when set; a rejected state leaves the draft as it
 * was.
 */
export function setDraftState(state) {
    const P = belief.player;
    if (!P || !state || !state.policy || !state.carried) return false;
    const T = { policy: {}, carried: {} };
    for (const R of RUNG_LIST) {
        const pol = state.policy[R], c = state.carried[R];
        if (pol === 'follow') { T.policy[R] = 'follow'; T.carried[R] = null; continue; }
        if (pol !== 'carry' || !c || !Number.isFinite(c.m) || !Number.isFinite(c.w) || !Number.isFinite(c.q)) return false;
        T.policy[R] = 'carry';
        T.carried[R] = { m: c.m, w: c.w, q: c.q };
    }
    const mk = _projection(), eff = {};
    for (const R of RUNG_LIST) eff[R] = T.policy[R] === 'carry' && certDay(R) == null ? T.carried[R] : mk[R];
    if (!_validPolicy(T, eff)) return false;
    P.policy = T.policy;
    P.carried = T.carried;
    return true;
}

/** Validation (02a "The standing policy"): every effective curve present, finite
 *  and inside the bounds, and medians and plateaus monotone among the carried,
 *  uncertified rungs of R2-R4 only. */
function _validPolicy(P, eff) {
    for (const R of RUNG_LIST) {
        const c = eff[R];
        if (!c || !Number.isFinite(c.m) || !Number.isFinite(c.w) || !Number.isFinite(c.q)) return false;
        if (c.m < POSTERIOR.M_MIN || c.m > POSTERIOR.M_MAX || c.w < POSTERIOR.W_MIN || c.w > POSTERIOR.W_MAX
            || c.q < POSTERIOR.Q_MIN || c.q > POSTERIOR.Q_MAX) return false;
    }
    let prevM = -Infinity, prevQ = POSTERIOR.Q_MIN;
    for (const R of LADDER) {
        if (!_ordered(P, R)) continue;
        const c = P.carried[R];
        if (c.m < prevM || c.q < prevQ) return false;
        prevM = c.m; prevQ = c.q;
    }
    return true;
}

const _frozenCurves = (src) => {
    const out = {};
    for (const R of RUNG_LIST) out[R] = Object.freeze({ m: src[R].m, w: src[R].w, q: src[R].q });
    return Object.freeze(out);
};

/**
 * Snapshot the standing policy as the lock on `day` (02a "Locks"). The one
 * recorder of the player's locks; main.js calls it, through snapshotForecast, at
 * the start of the close that ends a lock day's edition. Each rung is classified
 * once: FOLLOWED if its policy follows or its carried curve is bit-equal to
 * today's projection (an untouched drawing is the market's call), CARRIED
 * otherwise. Every consumer reads that classification. The lock stores:
 *   - `classes`, the effective `curves` and `B`'s projection (`market`);
 *   - per ladder rung open at the lock, the quarter pair {pP, pM}, both clamped:
 *     a followed rung stores pP === pM, a carried rung pP from its curve;
 *   - per followed rung, `B`'s deadline quote (`claims`, which lockedClaim reads).
 * Semantics: on-grid, current day only, never on day 1008 (`TERM_END`, the
 * horizon); rejected (null) unless the policy validates; IMMUTABLE once accepted,
 * a second call for the same day being accepted only as an exact idempotent
 * replay (same classes and curves). The standing policy itself is left as set.
 * @returns the frozen lock record, or null if rejected.
 */
export function lockForecast(day) {
    const P = belief.player;
    if (!P || !(isLockDay(day) && day === belief.day && day < TERM_END)) return null;
    const eff = _effective();
    if (!_validPolicy(P, eff)) return null;
    const market = _frozenCurves(_projection());
    const curves = _frozenCurves(eff), classes = {};
    // INTERPRETATION: a certified rung is classified by the same rule (its policy,
    // or its carried curve against the projection's frozen curve), so a desk that
    // carried R4 before it certified still reads as stating R4.
    for (const R of RUNG_LIST) classes[R] = P.policy[R] === 'follow' || curvesEqual(P.carried, market, R) ? 'followed' : 'carried';
    Object.freeze(classes);
    const existing = P.locks.find(l => l.day === day);
    if (existing) {
        for (const R of RUNG_LIST) if (existing.classes[R] !== classes[R] || !curvesEqual(existing.curves, curves, R)) return null;
        return existing;                                          // exact replay: idempotent
    }
    const pairs = {}, claims = {};
    for (const R of SCORED_RUNGS) {
        if (certDay(R) != null) continue;
        const pM = clamp(binaryProb(R, day + LOCK_INTERVAL), SCORE_P_MIN, SCORE_P_MAX);
        const c = curves[R];
        pairs[R] = Object.freeze({ pP: classes[R] === 'followed' ? pM : quarterProb(c.m, c.w, c.q, day, day + LOCK_INTERVAL), pM });
    }
    for (const R of RUNG_LIST) if (classes[R] === 'followed') claims[R] = binaryProb(R, RUNG_DEADLINE[R]);
    const record = Object.freeze({ day, classes, curves, market, pairs: Object.freeze(pairs), claims: Object.freeze(claims) });
    P.locks.push(record);
    return record;
}

/** The latest lock record, or null before the first snapshot. */
export function latestLock() {
    const locks = belief.player ? belief.player.locks : null;
    return locks && locks.length ? locks[locks.length - 1] : null;
}

/**
 * The reader-copier's snapshot on `day` (02a "The almanac"): for every ladder
 * rung open at the lock, the full reader's quarter probability beside `B`'s, both
 * clamped like the player's -- the pairs forecast-test scores for its
 * reader-copier. It reads only the public record. The same lock-day guards as
 * lockForecast; a repeat call returns the day's record.
 */
export function copierLock(day) {
    const K = belief.copier;
    if (!K || !(isLockDay(day) && day === belief.day && day < TERM_END)) return null;
    const existing = K.locks.find(l => l.day === day);
    if (existing) return existing;
    const c = _day(), pairs = {};
    for (const R of SCORED_RUNGS) {
        if (certDay(R) != null) continue;
        pairs[R] = Object.freeze({
            pP: clamp(lawQuarter(c.laws[R].full, day), SCORE_P_MIN, SCORE_P_MAX),
            pM: clamp(binaryProb(R, day + LOCK_INTERVAL), SCORE_P_MIN, SCORE_P_MAX),
        });
    }
    const record = Object.freeze({ day, pairs: Object.freeze(pairs) });
    K.locks.push(record);
    return record;
}

/** The quarterly snapshot main.js takes (02a "Locks"): the player's standing
 *  policy and the reader-copier, at the same boundary. */
export function snapshotForecast(day) {
    return { lock: lockForecast(day), copier: copierLock(day) };
}

/** ln(1 + e^x) without overflow. */
function _softplus(x) {
    return x > 0 ? x + Math.log1p(Math.exp(-x)) : Math.log1p(Math.exp(x));
}

/** The log-likelihood-ratio increment in nats for one rung-quarter (02a):
 *  o*ln(pP/pM) + (1-o)*ln((1-pP)/(1-pM)). Exactly 0 when pP === pM. */
export function logScoreDelta(pP, pM, o) {
    return o ? Math.log(pP / pM) : Math.log((1 - pP) / (1 - pM));
}

/** The variance of one rung-quarter's increment under the market's own
 *  probability (02a, sigma0): p_M(1 - p_M)*(ln(p_P/p_M) - ln((1-p_P)/(1-p_M)))^2.
 *  Exactly 0 when p_P === p_M. */
export function scoreVariance(pP, pM) {
    const d = Math.log(pP / pM) - Math.log((1 - pP) / (1 - pM));
    return pM * (1 - pM) * d * d;
}

/** Score one lock's quarter into `store` (the player or the reader-copier) from
 *  its stored pairs against certification days read by `cdOf`; push the entry
 *  and return it, or null when no rung was open. A player's rung carries its
 *  lock's classification (`cls`). S and sigma0^2 accumulate together. */
function _scoreLock(store, lock, to, cdOf, terminal) {
    const rungs = [];
    for (const R of SCORED_RUNGS) {
        const pr = lock.pairs[R];
        if (!pr) continue;                                        // certified at L_q: not scored
        const cd = cdOf(R);
        const o = cd != null && cd > lock.day && cd <= to ? 1 : 0;
        const r = { R, o, pP: pr.pP, pM: pr.pM, delta: logScoreDelta(pr.pP, pr.pM, o), v: scoreVariance(pr.pP, pr.pM) };
        if (lock.classes) r.cls = lock.classes[R];
        rungs.push(Object.freeze(r));
    }
    if (!rungs.length) return null;
    const delta = rungs.reduce((a, r) => a + r.delta, 0);
    store.S += delta;
    store.var0 += rungs.reduce((a, r) => a + r.v, 0);
    store.credibility = Math.tanh(store.S / forecastTuning.K_CRED);
    const rec = Object.freeze({ from: lock.day, to, rungs: Object.freeze(rungs), delta, S: store.S, var0: store.var0, credibility: store.credibility, terminal: !!terminal });
    store.scores.push(rec);
    return rec;
}

/** The quarter ending on lock day `day`, scored once into `store`. */
function _scoreDue(store, day) {
    if (!store || !(day > 0 && isLockDay(day) && day === belief.day)) return null;
    const from = day - LOCK_INTERVAL;
    const done = store.scores.find(s => s.from === from);
    if (done) return done;
    const lock = store.locks.find(l => l.day === from);
    if (!lock) return null;
    return _scoreLock(store, lock, day, certDay, false);
}

/**
 * Score the quarter that ends on lock day `day` (02a "Scoring"), in the lock-day
 * block of the close that brings the race to that day, one close BEFORE that
 * day's snapshot. Every rung R in {2,3,4} open at L_q = day - 63 is scored from
 * the pair the lock at L_q stored; o = 1 if R's public certification day falls in
 * (L_q, day]. (A lock is taken at the start of its day's close, after that day's
 * record, so a certification ON L_q was already known to it, and one ON L_q+1
 * lands inside the quarter being closed.) S_P accumulates and credibility =
 * tanh(S_P/K_CRED).
 *
 * Current day only (`day === belief.day`, on-grid, > 0), and once per quarter: a
 * repeat call returns the quarter's existing entry. Null when there is no lock
 * at L_q or no rung was open.
 */
export function scoreQuarter(day) {
    return _scoreDue(belief.player, day);
}

/** The reader-copier's quarter, by the same rule at the same close. */
export function scoreCopierQuarter(day) {
    return _scoreDue(belief.copier, day);
}

/** A rung's certification day on the completed race (the record's predicate:
 *  any frontier lab, direct or implied). */
function _raceCertDay(race, R) {
    let d = null;
    for (const id of ['halcyon', 'tianxia', 'polaris']) {
        const c = race.capability.labs[id].rungCertified[R];
        if (c != null && (d == null || c < d)) d = c;
    }
    return d;
}

/** The latest lock's outstanding quarter, scored once into `store`. */
function _scoreOutstanding(store, race) {
    const lock = store && store.locks.length ? store.locks[store.locks.length - 1] : null;
    if (!lock || !race || !race.capability) return null;
    const done = store.scores.find(s => s.from === lock.day);
    if (done) return done;
    return _scoreLock(store, lock, lock.day + LOCK_INTERVAL, (R) => _raceCertDay(race, R), true);
}

/**
 * The outstanding quarter at the terminal (02a "Scoring"): when the run ends
 * between locks, the latest lock's quarter, if unscored, is scored once against
 * its original end date and the authoritative completed trajectory -- the race's
 * certification days after resolveNow, so a certification in a desk ejection's
 * headless extrapolation before that date scores o = 1. No terminal lock is
 * created and no quarter is scored twice. Call after resolveNow, before the
 * epilogue. Returns the entry, the existing one on a repeat, or null.
 */
export function scoreOutstandingQuarter(race) {
    return _scoreOutstanding(belief.player, race);
}

/** The reader-copier's outstanding quarter, beside the player's. */
export function scoreCopierOutstanding(race) {
    return _scoreOutstanding(belief.copier, race);
}

/** A record's summary: quarters scored, cumulative skill S in nats, sigma0 (how
 *  far the record would swing by luck if the market were right; reported, read
 *  by no gate), credibility, locks, and the per-quarter history. */
function _record(store) {
    return store ? { quarters: store.scores.length, S: store.S, sigma0: Math.sqrt(store.var0),
        credibility: store.credibility, locks: store.locks.length, history: store.scores.slice() } : null;
}

/** The player's record (Meridian, the quarter's close line, the epilogue). */
export function forecastRecord() {
    return _record(belief.player);
}

/** The reader-copier's record (02a "The almanac"), read-only. Nothing reads it
 *  for display during play: it is the almanac's, at the end of the run. */
export function copierRecord() {
    return _record(belief.copier);
}

/**
 * The latest lock's P(T_R <= D_R) at rung R's contract deadline, survival-
 * conditioned at the lock day. A rung the lock reads as followed claims `B`'s
 * quote at the lock (02a). A rung certified by the lock day reads 1 (0 if it
 * certified after its deadline); a deadline already behind the lock reads 0.
 * Null before the first lock. (The scrutiny gap and the F conversion read
 * playerPilled instead.)
 */
export function lockedClaim(R) {
    const lock = latestLock();
    if (!lock || !lock.curves[R]) return null;
    const D = RUNG_DEADLINE[R];
    const cd = certDay(R);
    if (cd != null && cd <= lock.day) return cd <= D ? 1 : 0;
    if (lock.classes[R] === 'followed') return lock.claims[R];
    const c = lock.curves[R];
    return clamp(crossingProb(c.m, c.w, c.q, lock.day, D), 0, 1);
}

/** Current player credibility in (-1, 1): tanh(S_P / K_CRED), written by
 *  scoreQuarter (init 0). */
export function credibility() {
    return belief.player ? belief.player.credibility : 0;
}

/** True once some lock has carried some rung (02a "What follows states
 *  nothing"): the player has stated a forecast. It gates the `F` advice row. */
export function hasStatedForecast() {
    return !!(belief.player && belief.player.locks.some(l => RUNG_LIST.some(R => l.classes[R] === 'carried')));
}

/** Gate predicates (RATIFIED thresholds). `canActAsFund` also needs firm belief F. */
export function canSendMemos() { return credibility() > MEMO_GATE; }
export function canActAsFund(F) { return credibility() > FUND_CRED_GATE && (F ?? 0) > FUND_F_GATE; }

/**
 * The player's "pilledness" in [0,100]: the SAME measure as marketPilled, read off
 * the latest lock -- 100 x P(R4 within F_HORIZON days of today | not yet),
 * survival-conditioned at today under the locked {m, w, q}. A followed R4 states
 * nothing (02a "What follows states nothing"): null before the first lock and
 * whenever the latest lock reads R4 as followed, and every consumer handles null
 * (scrutiny skips, firm conversion reads marketPilled, the belief-keyed
 * convictions don't fire). A certified R4 reads 100 (0 if it certified past the
 * horizon).
 */
export function playerPilled() {
    const lock = latestLock();
    if (!lock || lock.classes[4] !== 'carried') return null;
    // The same event B's law measures: R4 within the horizon AND within its
    // support (nothing certifies after day 1008).
    const D = Math.min(belief.day + F_HORIZON, SUPPORT[4]);
    const cd = certDay(4);
    if (cd != null) return D >= cd ? 100 : 0;
    const c = lock.curves[4];
    return 100 * crossingProb(c.m, c.w, c.q, belief.day, D);
}

// ---- Firm belief F (stored on race.F; logic beside B) ---------------------

/** The market's implied pilledness in [0,100] derived from `B` (belief R4 lands
 *  within the near horizon). The firm wakes toward this. */
export function marketPilled() {
    return 100 * binaryProb(4, Math.min(belief.day + F_HORIZON, SUPPORT[4]));
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
    // A desk that states nothing on R4 (null) and agrees with the market converts
    // the firm toward the market (02a "What follows states nothing").
    const own = 'playerPilled' in opts ? opts.playerPilled : playerPilled();
    const pilled = own != null ? own : marketPilled();
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
 * this to aim the scrutiny loop. Null when the player's pilledness is null (02a
 * "What follows states nothing"): the caller skips the quarter.
 */
export function scrutinyGap(race, pilled = playerPilled()) {
    return pilled == null ? null : pilled - firmBelief(race);
}

// ---- Audit accessors (for the P4 harness / dashboard) ---------------------

/** The causal-move audit trail (every non-random B move carries an ID). */
export function beliefCauses() { return belief.causes.slice(); }

/** Whether an evidence ID has been folded into B (leak-once probe). */
export function beliefProcessed(id) { return belief.processed ? belief.processed.has(id) : false; }
