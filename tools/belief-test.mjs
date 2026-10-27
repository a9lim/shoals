#!/usr/bin/env node
/* ===================================================
   tools/belief-test.mjs -- Correctness + integrity harness
   for market belief `B` (the pool of the legible and full
   readers, src/race/belief.js), the rule of thumb inside it,
   the belief-backed quoters, eta, the player's posterior and
   its scoring, and the decaying event-impulse overlay.

   Hard-assertion checks:

   A. The rule of thumb's ledger: every move carries an ID and
      the rule's state reconstructs from the ledger alone.
      Corrupting every latent field (and injecting fake latent
      queue entries) before a day's belief step leaves the whole
      pooled output bit-identical: quotes on a grid, the implied
      timeline, B's laws, the projection, the family heads, the
      compute curve.
   B. Leak once-per-ID: a leaked beat folds into the sentiment
      exactly once; replaying the same ID is a no-op.
   C. Posterior arithmetic (02a, the posterior with its plateau):
      crossingProb with q against the naive survival ratio; the
      plateau handle in closed form; monotone m and q over
      R2-R4, R5 unordered; locks store clamped pairs; a call's
      score from the stored pairs; the market copier scores
      exactly 0; lock guards; once per quarter; no manufactured
      forecast; a followed rung's claim and the null pilledness
      of a followed R4; a carried curve equal to the projection
      is followed; sigma0 (against the naive formula, 0 for the
      market copier; reported, read by no gate).
   Q. The standing policy (02a "The standing policy", its gates):
      an edit carries (the activation clamp); follow the market;
      mixed policies (a followed rung's moves never move a
      carried one, a certification moves none, a followed /
      carried crossing validates); snapshot fidelity; a revision
      reaches only later snapshots; a player who never draws
      (every lock followed, S_P and sigma0 exactly 0, no scrutiny,
      no belief-keyed conviction, no F advice row) on main.js's
      close order; no lock after the end or on day 1008; a run
      that ends mid-edition takes no snapshot; the trait
      evaluation later in the same close sees the new lock.
   D. Lock-day schedule.
   E. Listing quotes two-sided with the real quoter (the base
      rates themselves are consensus-test's gate).
   L. Pool arithmetic: binaryProb equals (1 - eta)*legible +
      eta*full, projected, recomputed from the reader API.
   M. The coherence projection: P(R4) <= P(R3) <= P(R2)
      pointwise; untouched where the pool is already ordered.
   N. The implied timeline and B's law: the pooled median is the
      first day P reaches 1/2, null when it does not by the
      support; the law's masses and atom add up.
   O. The projection onto the player's family: bounds, ladder
      order, presets with q kept.
   P. The outstanding quarter at the terminal (02a "Scoring").
   F. Impulse-overlay decay (no permanent param drift).
   G. eta monotone in the released frontier.
   H/H2. F bounded, the gates, the never-draw scrutiny skip.
   I. A quiet record decays the quote toward NO: by the deadline's eve
      it sits at least 0.3 below its day-0 listing and is still falling.
   J/K. Followup impulses; the day-lifecycle overlay order.

   Real-world loops run advanceRace + stepControlRegime +
   stepTreaty + stepBelief, as the game and the reader do.

   Usage:  node tools/belief-test.mjs [N] [--seed S]
           N defaults to 60; base seed defaults to 1.
   =================================================== */

import { createRaceState, advanceRace, setControlRegime, stepControlRegime, freshTransitions } from '../src/race/race-state.js';
import { stepTreaty } from '../src/race/treaty-track.js';
import {
    consensus, initConsensus, refreshBinaryQuotes, computeBinarySettlements,
    buildPublicView, getBinaryQuote,
} from '../src/race/consensus.js';
import {
    computeMarket, initComputeMarket, buildComputePublicView,
} from '../src/race/compute-market.js';
import {
    belief, initBelief, resetBelief, deactivateBelief, stepBelief,
    binaryProb, quarterProbB, binaryQuoteFromBelief, computeCurveFromBelief, computeUrgency,
    impliedTimeline, beliefLaw, familyHeads, certDay, isCertified,
    marketEfficiency, beliefCauses,
    isLockDay, LOCK_INTERVAL, POSTERIOR, lockForecast, lockedClaim, scoreQuarter, scoreOutstandingQuarter, scoreVariance,
    snapshotForecast, scoreCopierQuarter, scoreCopierOutstanding, copierRecord,
    crossingProb, quarterProb, plateauHeight, logScoreDelta,
    presetCurves, marketCurves, normalizeCurves, draftCurves, draftPolicy, setDraft, followMarket,
    setDraftMedian, setDraftWidth, setDraftPlateau, curvesEqual, openRungs, curveMedian,
    forecastRecord, forecastTuning, latestLock,
    credibility, canSendMemos, canActAsFund, playerPilled, marketPilled,
    firmBelief, stepFirmBelief, scrutinyGap, hasStatedForecast,
} from '../src/race/belief.js';
import { getTrait } from '../src/traits.js';
import { ruleSummary } from '../src/race/public-record.js';
import { checkResolution } from '../src/race/resolution.js';
import { worldInputs, stepWorld } from './reader-data.mjs';
import { ensureEngineWorlds, loadEngineWorld } from './engine-worlds.mjs';
import { readerLaw, lawCDF } from '../src/race/reader.js';
import {
    addEventImpulse, decayEventImpulses, applyEventImpulseOverlay,
    removeEventImpulseOverlay, currentEventImpulse, eventImpulseMagnitude,
    resetEventImpulses, IMPULSE_HALF_LIFE,
} from '../src/race/impulse.js';
import { PARAM_RANGES } from '../src/events/param-ranges.js';
import { EventEngine } from '../src/events.js';
import { getEventById } from '../src/events/index.js';

// ---- CLI -----------------------------------------------------------------

const argv = process.argv.slice(2);
let N = 60;
let BASE_SEED = 1;
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') BASE_SEED = parseInt(argv[++i], 10) >>> 0;
    else if (a === '--n' || a === '-n') N = parseInt(argv[++i], 10);
    else if (/^\d+$/.test(a)) N = parseInt(a, 10);
}
const HORIZON = 1008;
const DEADLINE = { 2: 420, 3: 756, 4: 880, 5: 1000 };
const SUPPORT = { 2: 1008, 3: 1008, 4: 1008, 5: 1260 };

// ---- Assertion plumbing --------------------------------------------------

let failures = 0;
const failSamples = [];
function assert(cond, msg) {
    if (!cond) { failures++; if (failSamples.length < 25) failSamples.push(msg); }
}
const line = (s = '') => console.log(s);
const EPS = 1e-9;
const sig = (x) => 1 / (1 + Math.exp(-x));
const clampP = (p) => Math.min(0.98, Math.max(0.02, p));

/** One completed day of the game's race block. */
function raceDay(race) {
    advanceRace(race); stepControlRegime(race); stepTreaty(race, {}); stepBelief(race);
}
/** The same on an engine world's inputs (tools/engine-worlds.mjs), and how many
 *  days its run lasted. Odd worlds of section A and its probe are engine worlds. */
function engineDay(race, inputs) { stepWorld(race, inputs); stepBelief(race, inputs); }
const engineDays = (seed) => loadEngineWorld(seed).tape.length;
await ensureEngineWorlds([...Array.from({ length: N }, (_, i) => (BASE_SEED + i) >>> 0).filter((_, i) => i % 2),
    ...[1, 3, 5, 7].map(s => (BASE_SEED + 9100 + s) >>> 0)]);
/** Step a synthetic race one quiet day at a time to `day`; `edits[d]` mutates the
 *  public state (and the day's ledger) on day d before belief steps. */
function quietTo(race, day, edits = {}) {
    for (let d = race.day + 1; d <= day; d++) {
        race.day = d; race.lastTransitions = freshTransitions();
        if (edits[d]) edits[d](race);
        stepBelief(race);
    }
}
/** A frontier certification of rung R by `lab` on day d, claimed then if unclaimed. */
const certifyOn = (R, lab = 'halcyon') => (race) => {
    const L = race.capability.labs[lab];
    for (let r = 1; r <= R; r++) if (L.rungReleased[r] == null) L.rungReleased[r] = race.day;
    for (let r = 2; r <= R; r++) if (L.rungCertified[r] == null) L.rungCertified[r] = race.day;
    race.lastTransitions.certifications = [{ lab, rung: R, direct: true }];
};

// Everything a quote, a display or the valuation can read from `B` today.
function pooledSig() {
    const grid = [2, 3, 4, 5].map(R => [63, 126, 252, 504].map(k => binaryProb(R, belief.day + k)).concat(binaryProb(R, DEADLINE[R])));
    const laws = [2, 3, 4, 5].map(R => { const L = beliefLaw(R); return L && [L.median, L.atom, L.density(belief.day + 30)]; });
    const h = familyHeads();
    return JSON.stringify({ grid, tl: impliedTimeline(), laws, proj: marketCurves(), fam: [...h.legible, ...h.full, h.eta], u: computeUrgency() });
}
// Corrupt EVERY latent field AND inject fakes into the latent queues -- exactly
// what a hidden-state read would trip over. None of this may move B.
function corruptLatent(race) {
    race.hidden.tau = 0.999;
    race.hidden.scalingElasticity = 0.999;
    race.hidden.takeoffSharpness = 3.0;
    race.evidenceLogOdds = 99;
    race.heat.transient = 0.99; race.heat.floor = 0.99;
    race.safety.halcyon = 0.01; race.safety.tianxia = 0.01;
    if (race.safety.polaris != null) race.safety.polaris = 0.01;
    for (const id of ['halcyon', 'tianxia', 'polaris']) {
        const lab = race.capability.labs[id];
        if (lab.active) { lab.C_internal = 5.5; lab.C_released = 5.5; }
    }
    race.capability.open.C = 5.5;
    race.latentIncidents.push({ id: 'FAKE', severity: 4, occurDay: race.day, insiderTip: true, detected: false, detectable: false, meanLag: 0 });
    race.latentEvidence.push({ id: 'FAKE', published: false, path: 'leaked', logLR: 5, publicDay: Infinity });
}

// ==========================================================================
// A. The rule's ledger + full-corruption invariance of the pooled output
// ==========================================================================

let causalityOK = true, allCausesHaveId = true, invarianceOK = true, ledgerCoverageOK = false;
let totalCauses = 0;
{
    const PUBLIC_VIEW_KEYS = ['day', 'certifiedFrontierRung', 'releasedFrontierRung', 'claimedRung', 'releaseCount', 'lastReleaseDay', 'controlRegime'].sort().join(',');
    for (let i = 0; i < N; i++) {
        const seed = (BASE_SEED + i) >>> 0, race = createRaceState(seed);
        initConsensus(race);
        initBelief(race);
        // Odd worlds are engine worlds: the bystander run's tape, to its resolution.
        if (i % 2) for (let d = 0, n = engineDays(seed), sched = worldInputs(seed, 'engine'); d < n; d++) engineDay(race, sched());
        else for (let d = 0; d < HORIZON; d++) raceDay(race);
        for (const c of beliefCauses()) {
            totalCauses++;
            if (c.id == null) { allCausesHaveId = false; causalityOK = false; }
        }
    }
    assert(allCausesHaveId, 'a rule move was recorded with no causal evidence ID');

    // The rule's FULL COVERAGE (02a): reconstruct each rung's (m, w) from the
    // ledger alone; entries chain; the reconstruction lands on the live rule.
    {
        const race = createRaceState((BASE_SEED + 950) >>> 0);
        initConsensus(race); initBelief(race);
        const seed = {};
        for (const R of [2, 3, 4, 5]) seed[R] = { m: belief.rungs[R].m, w: belief.rungs[R].w, crossed: false, certDay: null };
        for (let d = 0; d < 600; d++) raceDay(race);
        const causes = beliefCauses();
        assert(causes.length < 4000, 'belief ledger overflowed the cap during the coverage run');
        const recon = {};
        for (const R of [2, 3, 4, 5]) recon[R] = { ...seed[R] };
        let chainOK = true, coverageOK = true;
        for (const c of causes) {
            if (c.rung == null) continue;
            const r = recon[c.rung];
            if (c.kind === 'mw') {
                if (Math.abs(r.m - c.mFrom) > 1e-9 || Math.abs(r.w - c.wFrom) > 1e-9) chainOK = false;
                r.m = c.mTo; r.w = c.wTo;
            } else if (c.kind === 'crossed') {
                if (Math.abs(r.m - c.mFrom) > 1e-9) chainOK = false;
                r.crossed = true; r.certDay = c.certDay;
            }
        }
        for (const R of [2, 3, 4, 5]) {
            const live = belief.rungs[R], rc = recon[R];
            if (rc.crossed !== live.crossed || (live.crossed && rc.certDay !== live.certDay)) coverageOK = false;
            if (!live.crossed && (Math.abs(rc.m - live.m) > 1e-9 || Math.abs(rc.w - live.w) > 1e-9)) coverageOK = false;
        }
        // The rule's certification state agrees with the record's (one public fact).
        for (const R of [2, 3, 4]) if (belief.rungs[R].crossed !== isCertified(R) || (isCertified(R) && belief.rungs[R].certDay !== certDay(R))) coverageOK = false;
        ledgerCoverageOK = chainOK && coverageOK;
        assert(chainOK, 'ledger entries do not chain (a from-state disagreed with the prior to-state)');
        assert(coverageOK, 'ledger reconstruction did not reproduce the live rule (or rule and record disagree on certification)');
    }

    {
        const race = createRaceState((BASE_SEED + 900) >>> 0);
        initConsensus(race);
        for (let d = 0; d < 400; d++) advanceRace(race);
        const view = buildPublicView(race);
        assert(Object.keys(view).sort().join(',') === PUBLIC_VIEW_KEYS, 'buildPublicView leaks non-public keys');
    }

    // Corrupt before the day-D belief step; every pooled output stays bit-identical.
    const DAYS = [200, 420, 500, 756, 900, 1000];
    for (let s = 0; s < 8; s++) {
        for (const D of DAYS) {
            const seed = (BASE_SEED + 9100 + s) >>> 0, engine = s % 2 === 1;
            if (engine && D > engineDays(seed)) continue;      // the engine world ended first
            const schedA = engine ? worldInputs(seed, 'engine') : null, schedB = engine ? worldInputs(seed, 'engine') : null;
            const raceA = createRaceState(seed); initConsensus(raceA); initBelief(raceA);
            for (let d = 0; d < D; d++) engine ? engineDay(raceA, schedA()) : raceDay(raceA);
            const sigA = pooledSig(), ruleA = JSON.stringify(belief.rungs) + belief.alignment;
            const viewA = buildPublicView(raceA), cvA = buildComputePublicView(raceA, null);
            const contracts = consensus.contracts.map(c => ({ ...c }));
            const qA = JSON.stringify(contracts.map(c => binaryQuoteFromBelief(viewA, c)));
            const ccA = JSON.stringify([0, 63, 126, 252].map(dte => computeCurveFromBelief(cvA, dte)));

            const raceB = createRaceState(seed); initConsensus(raceB); initBelief(raceB);
            for (let d = 0; d < D - 1; d++) engine ? engineDay(raceB, schedB()) : raceDay(raceB);
            const inB = engine ? schedB() : undefined;
            if (engine) stepWorld(raceB, inB); else { advanceRace(raceB); stepControlRegime(raceB); stepTreaty(raceB, {}); }
            corruptLatent(raceB);
            stepBelief(raceB, inB);
            const sigB = pooledSig(), ruleB = JSON.stringify(belief.rungs) + belief.alignment;
            const viewB = buildPublicView(raceB), cvB = buildComputePublicView(raceB, null);
            const qB = JSON.stringify(contracts.map(c => binaryQuoteFromBelief(viewB, c)));
            const ccB = JSON.stringify([0, 63, 126, 252].map(dte => computeCurveFromBelief(cvB, dte)));

            const same = sigA === sigB && ruleA === ruleB && qA === qB && ccA === ccB;
            if (!same) invarianceOK = false;
            assert(ruleA === ruleB, `rule state changed under corruption (seed ${s}, D=${D})`);
            assert(sigA === sigB, `pooled B changed under corruption (seed ${s}, D=${D})`);
            assert(qA === qB, `binary quote changed under corruption (seed ${s}, D=${D})`);
            assert(ccA === ccB, `compute curve changed under corruption (seed ${s}, D=${D})`);
        }
    }
}

// ==========================================================================
// B. Leak once-per-ID + idempotent stepBelief (the sentiment; no record)
// ==========================================================================

let leakOnceOK = false, stepIdempotentOK = false;
{
    initBelief(null);
    const tr = {
        releases: [], certifications: [], thefts: [], crossings: [], spawned: [],
        incidents: { occurred: [], detected: [] },
        evidence: { occurred: [{ id: 'L1', lab: 'halcyon', favorable: false, logLR: -1.0, path: 'leaked', occurDay: 10 }], published: [] },
    };
    belief.day = 10;
    const a0 = belief.alignment;
    stepBelief({ day: 10, lastTransitions: tr });
    const a1 = belief.alignment;
    stepBelief({ day: 10, lastTransitions: tr });   // replay SAME ledger/ID
    const a2 = belief.alignment;
    leakOnceOK = Math.abs(a1 - a0) > 1e-9 && Math.abs(a2 - a1) < 1e-12;
    assert(leakOnceOK, `leak folded more than once (a0=${a0} a1=${a1} a2=${a2})`);
    stepIdempotentOK = beliefCauses().filter(c => c.id === 'evleak_L1').length === 1;
    assert(stepIdempotentOK, 'replayed leak recorded a second causal move');
}

// ==========================================================================
// C. Posterior arithmetic, locks, scoring
// ==========================================================================

let probOK = false, plateauOK = false, orderOK = false, pairsOK = false, copierZeroOK = false, deltaOK = false;
let lockGuardOK = false, scoreGuardOK = false, noManufacturedOK = false, marketPolicyReadsOK = false;
let sigmaOK = false, sigmaCopierOK = false;
let projectionIsMarketOK = false, lateCapOK = false, latePlateauOK = false, lateMedianOK = false;
{
    // Independent naive forms (02a), against the module's log-space ones.
    const S = (m, w, q, x) => 1 - (1 - q) * sig((x - m) / w);
    const naiveP = (m, w, q, t0, t1) => 1 - S(m, w, q, t1) / S(m, w, q, t0);
    const naiveD = (pP, pM, o) => o ? Math.log(pP / pM) : Math.log((1 - pP) / (1 - pM));
    const cases = [[100, 50, 0, 0, 63], [721, 140, 0.2, 315, 378], [400, 25, 0.5, 378, 441], [2016, 400, 0.95, 0, 63], [600, 90, 0.3, 0, 1008]];
    probOK = cases.every(([m, w, q, t0, t1]) => Math.abs(crossingProb(m, w, q, t0, t1) - naiveP(m, w, q, t0, t1)) < 1e-12
            && Math.abs(quarterProb(m, w, q, t0, t1) - clampP(naiveP(m, w, q, t0, t1))) < 1e-12)
        // A median far behind t0 with no plateau: the logistic's tail hazard is 1/w.
        && Math.abs(crossingProb(10, 25, 0, 1000, 1063) - (1 - Math.exp(-63 / 25))) < 1e-9
        // ... and with a plateau the survivors are the never-mass: nothing left to cross.
        && crossingProb(10, 25, 0.3, 1000, 1063) < 1e-9;
    assert(probOK, 'crossingProb/quarterProb with q disagree with the naive survival ratio');

    // The plateau handle: setDraftPlateau(R, h) lands plateauHeight on h exactly when
    // reachable, pushes carried neighbours' q to keep R2-R4 ordered, and leaves R5
    // alone. Every rung carries here, so the neighbours are pushed.
    const raceP = createRaceState((BASE_SEED + 230) >>> 0);
    initBelief(raceP);
    setDraft(marketCurves());
    const d0 = draftCurves();
    setDraftPlateau(3, 0.4);
    const d1 = draftCurves();
    plateauOK = Math.abs(plateauHeight(d1[3].m, d1[3].w, d1[3].q, 0) - 0.4) < 1e-9 && d1[4].q >= d1[3].q && d1[2].q <= d1[3].q
        && curvesEqual(d0, d1, 5) && d1[3].m === d0[3].m && d1[3].w === d0[3].w;
    setDraftPlateau(3, 0.999);   // beyond reach: q floors at 0
    plateauOK &&= draftCurves()[3].q === 0;
    setDraftPlateau(2, 0.001);   // near zero: q caps at 0.95 and the ladder above follows
    const d2 = draftCurves();
    plateauOK &&= d2[2].q <= POSTERIOR.Q_MAX && d2[3].q >= d2[2].q && d2[4].q >= d2[3].q;
    assert(plateauOK, 'setDraftPlateau / plateauHeight wrong (closed form, bounds or ladder push)');

    // Ladder order: m and q monotone over R2-R4; R5 unordered.
    const nc = normalizeCurves({ 2: { m: 500, w: 50, q: 0.4 }, 3: { m: 300, w: 50, q: 0.1 }, 4: { m: 700, w: 50, q: 0.2 }, 5: { m: 100, w: 50, q: 0 } });
    orderOK = nc[3].m === 500 && nc[3].q === 0.4 && nc[4].m === 700 && nc[4].q === 0.4 && nc[5].m === 100 && nc[5].q === 0;
    setDraftMedian(5, 50);
    orderOK &&= draftCurves()[5].m === 50;
    assert(orderOK, 'normalizeCurves / setDraftMedian ladder order wrong (R5 must be unordered)');

    // A lock stores clamped pairs: pP from the player's carried law, pM from B at
    // the lock; a carried rung still bit-equal to the projection is followed.
    const race2 = createRaceState((BASE_SEED + 223) >>> 0);
    initBelief(race2);
    const mk = marketCurves();
    const mine = normalizeCurves({ ...mk, 2: { m: 40, w: 30, q: 0.1 } });
    setDraft(mine);
    const lk = lockForecast(0);
    pairsOK = !!lk && lk.classes[2] === 'carried'
        && [2, 3, 4].every(R => !!lk.pairs[R] && lk.pairs[R].pM === clampP(binaryProb(R, 63)) && (curvesEqual(mine, mk, R)
            ? lk.classes[R] === 'followed' && lk.pairs[R].pP === lk.pairs[R].pM
            : lk.classes[R] === 'carried' && Math.abs(lk.pairs[R].pP - clampP(naiveP(mine[R].m, mine[R].w, mine[R].q, 0, 63))) < 1e-12));
    assert(pairsOK, 'lock pairs are not the clamped player / B quarter probabilities');
    // The call's score reads the stored pairs (B moves meanwhile; the pairs don't).
    quietTo(race2, 63, { 63: certifyOn(2) });
    const q2 = scoreQuarter(63);
    const want = [2, 3, 4].reduce((acc, R) => acc + naiveD(lk.pairs[R].pP, lk.pairs[R].pM, R === 2 ? 1 : 0), 0);
    deltaOK = !!q2 && Math.abs(q2.delta - want) < 1e-12 && q2.rungs.find(r => r.R === 2).o === 1 && q2.rungs.find(r => r.R === 2).cls === 'carried'
        && Math.abs(credibility() - Math.tanh(want / forecastTuning.K_CRED)) < 1e-12 && logScoreDelta(0.5, 0.5, 1) === 0;
    assert(deltaOK, `scored delta ${q2 && q2.delta} != stored-pair hand value ${want}`);
    // sigma0 (02a): sigma0^2 = sum p_M(1 - p_M)(ln(p_P/p_M) - ln((1 - p_P)/(1 - p_M)))^2.
    const naiveV = (pP, pM) => pM * (1 - pM) * (Math.log(pP / pM) - Math.log((1 - pP) / (1 - pM))) ** 2;
    const v1 = [2, 3, 4].reduce((a, R) => a + naiveV(lk.pairs[R].pP, lk.pairs[R].pM), 0);
    setDraft(normalizeCurves({ ...marketCurves(), 3: { m: 100, w: 40, q: 0.2 } }));
    const lk2 = lockForecast(63);
    quietTo(race2, 126);
    const q3 = scoreQuarter(126);
    const v2 = v1 + Object.values(lk2.pairs).reduce((a, pr) => a + naiveV(pr.pP, pr.pM), 0);
    sigmaOK = !!q2 && Math.abs(q2.var0 - v1) < 1e-12 && !!q3 && Math.abs(q3.var0 - v2) < 1e-12
        && Math.abs(forecastRecord().sigma0 - Math.sqrt(v2)) < 1e-12 && v2 > v1 && v1 > 0
        && [[0.3, 0.1], [0.02, 0.98], [0.5, 0.5]].every(([a, b]) => Math.abs(scoreVariance(a, b) - naiveV(a, b)) < 1e-12)
        && scoreVariance(0.37, 0.37) === 0;
    assert(sigmaOK, `sigma0^2 ${q3 && q3.var0} != naive ${v2}`);

    // A market copier, following every rung: pP === pM in every pair -> exactly 0,
    // every quarter.
    const race = createRaceState((BASE_SEED + 222) >>> 0);
    initBelief(race);
    followMarket();
    const c0 = lockForecast(0);
    quietTo(race, 63, { 40: certifyOn(2) });
    const s1 = scoreQuarter(63);
    followMarket();
    lockForecast(63);
    quietTo(race, 126);
    const s2 = scoreQuarter(126);
    sigmaCopierOK = !!s1 && s1.var0 === 0 && !!s2 && s2.var0 === 0 && forecastRecord().sigma0 === 0 && s2.rungs.every(r => r.v === 0);
    assert(sigmaCopierOK, 'a market-policy record has nonzero sigma0');
    copierZeroOK = !!c0 && [2, 3, 4, 5].every(R => c0.classes[R] === 'followed') && [2, 3, 4].every(R => c0.pairs[R].pP === c0.pairs[R].pM)
        && curvesEqual(c0.curves, c0.market, 3) && !!s1 && s1.delta === 0 && !!s2 && s2.delta === 0
        && s2.rungs.length === 2 && s2.rungs.every(r => r.cls === 'followed') && credibility() === 0 && forecastRecord().quarters === 2
        && !hasStatedForecast();
    assert(copierZeroOK, `market-policy copier scored ${s1 && s1.delta}/${s2 && s2.delta} (want exactly 0)`);

    // Lock semantics: a valid policy; on-grid + current day, never day 1008;
    // immutable (exact replay only).
    const race3 = createRaceState((BASE_SEED + 224) >>> 0);
    initBelief(race3);
    const base = presetCurves('later');
    const tryBroken = (R, patch) => {
        setDraft(base);
        Object.assign(belief.player.carried[R], patch);
        const r = lockForecast(0);
        setDraft(base);
        return r;
    };
    const crossedM = tryBroken(3, { m: base[2].m - 1 });
    const crossedQ = base[3].q > 0.01 ? tryBroken(4, { q: base[3].q - 0.01 }) : null;
    const outOfRange = tryBroken(5, { m: 2017 });
    const qHigh = tryBroken(5, { q: 0.96 });
    const tooNarrow = tryBroken(3, { w: 10 });
    const notFinite = tryBroken(2, { q: NaN });
    const offGrid = lockForecast(7);
    const wrongDay = lockForecast(63);
    const good = lockForecast(0);
    const replay = lockForecast(0);
    setDraftWidth(3, base[3].w * 1.2);
    const mutate = lockForecast(0);
    followMarket();
    const asMarket = lockForecast(0);
    lockGuardOK = [crossedM, crossedQ, outOfRange, qHigh, tooNarrow, notFinite, offGrid, wrongDay, mutate, asMarket].every(x => x === null)
        && good !== null && replay === good && Object.isFrozen(good) && Object.isFrozen(good.curves[2]) && Object.isFrozen(good.pairs)
        && Object.isFrozen(good.classes) && belief.player.locks.length === 1;
    assert(lockGuardOK, 'lock semantics wrong (valid policy / on-grid+current-day / immutable)');

    // Scoring guards: no lock at L_q -> nothing scored; once per quarter; current day.
    const race4 = createRaceState((BASE_SEED + 225) >>> 0);
    initBelief(race4);
    quietTo(race4, 63);
    const noLock = scoreQuarter(63);
    const race4b = createRaceState((BASE_SEED + 225) >>> 0);
    initBelief(race4b);
    setDraft(presetCurves('later'));
    lockForecast(0);
    quietTo(race4b, 63);
    const first = scoreQuarter(63), again = scoreQuarter(63);
    scoreGuardOK = noLock === null && !!first && again === first && forecastRecord().quarters === 1
        && forecastRecord().S === first.S && scoreQuarter(64) === null && scoreQuarter(126) === null;
    assert(scoreGuardOK, 'scoreQuarter guards wrong (needs the opening lock; once per quarter; current day only)');

    // No manufactured forecast: no locks, credibility 0, no claim, no pilledness;
    // every rung follows, so the effective curves are B's projection.
    const race5 = createRaceState((BASE_SEED + 226) >>> 0);
    initBelief(race5);
    const dd = draftCurves(), m0 = marketCurves(), pol0 = draftPolicy();
    noManufacturedOK = belief.player.locks.length === 0 && credibility() === 0 && lockedClaim(2) === null && playerPilled() === null
        && !hasStatedForecast() && [2, 3, 4, 5].every(R => curvesEqual(dd, m0, R) && pol0[R] === 'follow');
    assert(noManufacturedOK, 'initBelief manufactured a forecast, or the day-0 policy does not follow the market');

    // A followed rung's claim is B's quote at the lock; a followed R4 states
    // nothing, so playerPilled is null (02a "What follows states nothing"), days
    // later too.
    lockForecast(0);
    const claims0 = [2, 3, 4, 5].map(R => binaryProb(R, DEADLINE[R]));
    quietTo(race5, 30);
    marketPolicyReadsOK = [2, 3, 4, 5].every((R, i) => lockedClaim(R) === claims0[i]) && playerPilled() === null
        && scrutinyGap(race5, playerPilled()) === null;
    assert(marketPolicyReadsOK, 'a followed rung does not read B at the lock, or a followed R4 is not null pilledness');

    // A carried curve still bit-equal to today's projection is the market's call
    // (02a), rung by rung; one moved rung carries, and a followed R4 stays null.
    const raceM = createRaceState((BASE_SEED + 227) >>> 0);
    initBelief(raceM);
    setDraft(draftCurves());                                         // the untouched projection, carried
    const lp = lockForecast(0);
    followMarket();
    const replayM = lockForecast(0);                                 // the same classes and curves: a replay
    quietTo(raceM, 63);
    const moved = draftCurves(); moved[3] = { ...moved[3], w: moved[3].w * 1.5 };
    setDraft(normalizeCurves(moved));
    const lo = lockForecast(63);
    projectionIsMarketOK = !!lp && [2, 3, 4, 5].every(R => lp.classes[R] === 'followed') && [2, 3, 4].every(R => lp.pairs[R].pP === lp.pairs[R].pM)
        && replayM === lp && !!lo && lo.classes[3] === 'carried' && [2, 4, 5].every(R => lo.classes[R] === 'followed')
        && hasStatedForecast() && playerPilled() === null;
    assert(projectionIsMarketOK, 'a carried curve equal to the projection was not classified as followed');

    // Late in the term (Codex's repros, day 945).
    const raceL = createRaceState((BASE_SEED + 228) >>> 0);
    initBelief(raceL);
    quietTo(raceL, 945);
    if (openRungs().includes(4)) {
        const late = normalizeCurves({ ...marketCurves(), 2: { m: 1000, w: 25, q: 0 }, 3: { m: 1050, w: 25, q: 0 }, 4: { m: 1100, w: 25, q: 0 } });
        setDraft(late);
        lockForecast(945);
        const inTerm = 100 * crossingProb(1100, 25, 0, 945, 1008);
        // playerPilled reads the same event B's law does: R4 within 252 days AND by day 1008.
        lateCapOK = Math.abs(playerPilled() - inTerm) < 1e-9 && inTerm < 5
            && marketPilled() === 100 * binaryProb(4, 1008) && marketPilled() === 100 * binaryProb(4, 945 + 252);
    }
    assert(lateCapOK, `playerPilled is not capped at R4's support late in the term (${playerPilled()})`);
    // The plateau inverse stays exact when the logistic is saturated: R5 {m 0, w 25, q 0}
    // at day 945 takes height 0.5 (the old 1 - q form left q = 0 and the height 0.92).
    setDraft({ ...draftCurves(), 5: { m: 0, w: 25, q: 0 } });
    setDraftPlateau(5, 0.5);
    const d5 = draftCurves()[5];
    latePlateauOK = d5.q > 0 && Math.abs(plateauHeight(d5.m, d5.w, d5.q, 945) - 0.5) < 1e-9;
    setDraftPlateau(3, 0.3);
    const d3 = draftCurves()[3];
    latePlateauOK &&= Math.abs(plateauHeight(d3.m, d3.w, d3.q, 945) - 0.3) < 1e-9 || d3.q === POSTERIOR.Q_MAX || d3.q === 0;
    assert(latePlateauOK, `late-day plateau inverse inexact (R5 height ${plateauHeight(d5.m, d5.w, d5.q, 945)}, q ${d5.q})`);
    // The race page's "Yours" median is curveMedian: day 945, R5 {m 0, w 25, q 0} has a
    // conditional median in the term-and-a-bit (962.33), not "not this term".
    const med = curveMedian({ m: 0, w: 25, q: 0 }, 945, 5);
    let mass = 0;
    for (let D = 946; D <= 1260; D++) mass += crossingProb(0, 25, 0, 945, D) - crossingProb(0, 25, 0, 945, D - 1);
    lateMedianOK = med != null && Math.abs(med - (945 + 25 * Math.log(2 + Math.exp(-945 / 25)))) < 1e-6 && Math.abs(mass - crossingProb(0, 25, 0, 945, 1260)) < 1e-12;
    assert(lateMedianOK, `curveMedian late-day value ${med} (want ~962.33) or the daily mass does not add up`);
}

// ==========================================================================
// D. Lock-day schedule
// ==========================================================================

let scheduleOK = true;
{
    for (let d = 0; d <= HORIZON; d++) {
        const want = (d % LOCK_INTERVAL === 0);
        if (isLockDay(d) !== want) { scheduleOK = false; break; }
    }
    assert(scheduleOK, 'isLockDay disagrees with the 0/63/126 grid');
    assert(isLockDay(0) && isLockDay(63) && isLockDay(126) && !isLockDay(100) && !isLockDay(-63),
        'isLockDay spot-checks failed');
}

// ==========================================================================
// E. Two-sided listing quotes with the real quoter
// ==========================================================================

let listingTwoSidedOK = true;
const listingRows = { 2: [], 3: [], 4: [], 5: [] };
{
    const { setBinaryQuoteSource } = await import('../src/race/consensus.js');
    for (let i = 0; i < Math.min(N, 100); i++) {
        const race = createRaceState((BASE_SEED + 300 + i) >>> 0);
        initConsensus(race); initBelief(race);
        const view = buildPublicView(race);
        for (const c of consensus.contracts) {
            const mid = binaryQuoteFromBelief(view, c);
            listingRows[c.predicate.rung].push(mid);
            if (!(mid > 0.05 && mid < 0.95)) { listingTwoSidedOK = false; assert(false, `listing mid ${mid.toFixed(3)} not two-sided (R${c.predicate.rung})`); }
        }
        if (i === 0) {
            setBinaryQuoteSource(binaryQuoteFromBelief);
            refreshBinaryQuotes(race);
            for (const c of consensus.contracts) {
                const q = getBinaryQuote(c.key);
                assert(q.bid > 0 && q.ask < 1 && q.mid > 0.05 && q.mid < 0.95, `refreshed listing quote not two-sided (R${c.predicate.rung})`);
            }
            setBinaryQuoteSource(null);
        }
    }
}

// ==========================================================================
// L/M/N/O. The pool, the projection, the timeline, the player's projection
// ==========================================================================

let poolOK = true, coherenceOK = true, untouchedOK = true, timelineOK = true, lawOK = true, projBoundsOK = true, presetOK = true;
let poolChecks = 0;
{
    const Dgrid = (t, R) => { const out = []; for (let D = t + 7; D <= SUPPORT[R]; D += 29) out.push(D); out.push(DEADLINE[R], SUPPORT[R]); return out.filter(D => D > t); };
    for (let i = 0; i < Math.min(N, 60); i++) {
        const race = createRaceState((BASE_SEED + 700 + i) >>> 0);
        initConsensus(race); initBelief(race);
        for (let d = 0; d <= HORIZON && !race.resolution; d++) {
            if (d > 0) raceDay(race);
            if (race.day % 63 !== 0) continue;
            const t = race.day, rec = belief.record, rule = ruleSummary(belief.rungs, t);
            const view = buildPublicView(race), eta = Math.min(1, Math.max(0, (Math.max(1, view.releasedFrontierRung) - 1) / 4));
            const cd = (R) => { let m = null; for (const id of ['halcyon', 'tianxia', 'polaris']) { const c = race.capability.labs[id].rungCertified[R]; if (c != null && (m == null || c < m)) m = c; } return m; };
            const raw = (R, D) => {
                if (R < 5 && cd(R) != null) return +(D >= cd(R));
                return (1 - eta) * lawCDF(readerLaw(rec, R, 'legible', rule), t, D) + eta * lawCDF(readerLaw(rec, R, 'full', rule), t, D);
            };
            for (const R of [2, 3, 4, 5]) {
                for (const D of Dgrid(t, R)) {
                    let want = raw(R, D);
                    if (R < 5) for (let r = 2; r < R; r++) want = Math.min(want, raw(r, D));
                    const got = binaryProb(R, D);
                    poolChecks++;
                    if (Math.abs(got - want) > 1e-14) { poolOK = false; assert(false, `pool arithmetic R${R} day ${t} D ${D}: ${got} vs ${want}`); }
                    if (R >= 3 && R < 5) {
                        const lower = binaryProb(R - 1, D);
                        if (got > lower + 1e-15) coherenceOK = false;
                        const prior = Math.min(...[2, 3, 4].filter(r => r < R).map(r => binaryProb(r, D)));
                        if (raw(R, D) <= prior && got !== raw(R, D)) untouchedOK = false;
                    }
                }
                // N: the pooled median, brute force; the law's masses.
                const tl = impliedTimeline()[R];
                if (R < 5 && cd(R) != null) { timelineOK &&= tl === cd(R) && beliefLaw(R) === null; continue; }
                let bf = null;
                for (let D = t + 1; D <= SUPPORT[R]; D++) if (binaryProb(R, D) >= 0.5) { bf = D; break; }
                if (tl !== bf) { timelineOK = false; assert(false, `implied timeline R${R} day ${t}: ${tl} vs brute ${bf}`); }
                const L = beliefLaw(R);
                let mass = 0;
                for (let D = t + 1; D <= SUPPORT[R]; D++) mass += L.density(D);
                lawOK &&= Math.abs(mass + L.atom - 1) < 1e-9 && L.median === tl && L.cdf(SUPPORT[R]) === binaryProb(R, SUPPORT[R]);
            }
            // O: the projection.
            const P = marketCurves();
            let pm = -Infinity, pq = 0;
            for (const R of [2, 3, 4, 5]) {
                const c = P[R];
                if (R < 5 && cd(R) != null) { projBoundsOK &&= c.m === cd(R) && c.q === 0; pm = Math.max(pm, c.m); continue; }
                projBoundsOK &&= c.m >= POSTERIOR.M_MIN && c.m <= POSTERIOR.M_MAX && c.w >= POSTERIOR.W_MIN && c.w <= POSTERIOR.W_MAX && c.q >= 0 && c.q <= POSTERIOR.Q_MAX;
                if (R < 5) { projBoundsOK &&= c.m >= pm && c.q >= pq; pm = c.m; pq = c.q; }
            }
            const E = presetCurves('earlier'), Lt = presetCurves('later');
            const wantE = normalizeCurves(Object.fromEntries([2, 3, 4, 5].map(R => [R, R < 5 && cd(R) != null ? P[R] : { m: P[R].m - 0.5 * P[R].w, w: P[R].w, q: P[R].q }])));
            const wantL = normalizeCurves(Object.fromEntries([2, 3, 4, 5].map(R => [R, R < 5 && cd(R) != null ? P[R] : { m: P[R].m + 0.5 * P[R].w, w: P[R].w, q: P[R].q }])));
            presetOK &&= [2, 3, 4, 5].every(R => curvesEqual(E, wantE, R) && curvesEqual(Lt, wantL, R) && E[R].w === P[R].w && E[R].q === P[R].q);
        }
    }
    assert(coherenceOK, 'coherence projection: P(R4) <= P(R3) <= P(R2) violated');
    assert(untouchedOK, 'coherence projection moved a coordinate where the pool was already ordered');
    assert(lawOK, 'beliefLaw masses + atom do not add to 1, or its median is not the timeline');
    assert(projBoundsOK, 'the projection breaks a bound or the ladder order');
    assert(presetOK, 'earlier/later presets are not the projection with m -/+ 0.5w, w and q kept');
}

// ==========================================================================
// P. The outstanding quarter at the terminal
// ==========================================================================

let outstandingOK = false, outstandingNaturalOK = false, noDoubleOK = false;
{
    // Desk ejection on day 100 between the day-63 lock and day 126; the headless
    // world certifies R3 on day 110 -> o = 1 against the original end date.
    const race = createRaceState((BASE_SEED + 240) >>> 0);
    initBelief(race);
    setDraft(presetCurves('earlier'));
    lockForecast(0);
    quietTo(race, 63);
    const sc0Var = scoreQuarter(63).var0;
    setDraft(presetCurves('earlier'));
    const L63 = lockForecast(63);
    quietTo(race, 100);
    const locks0 = belief.player.locks.length, S0 = forecastRecord().S;
    race.capability.labs.tianxia.rungCertified[2] = 110; race.capability.labs.tianxia.rungCertified[3] = 110;
    const o = scoreOutstandingQuarter(race);
    const want = [2, 3, 4].reduce((a, R) => a + logScoreDelta(L63.pairs[R].pP, L63.pairs[R].pM, R <= 3 ? 1 : 0), 0);
    const wantV = [2, 3, 4].reduce((a, R) => a + scoreVariance(L63.pairs[R].pP, L63.pairs[R].pM), 0);
    outstandingOK = !!o && o.terminal && o.from === 63 && o.to === 126 && Math.abs(o.delta - want) < 1e-12
        && Math.abs(o.var0 - (sc0Var + wantV)) < 1e-12
        && Math.abs(forecastRecord().S - (S0 + want)) < 1e-12 && belief.player.locks.length === locks0;
    noDoubleOK = scoreOutstandingQuarter(race) === o && forecastRecord().quarters === 2;
    // A certification after the original end date does not count.
    const raceN = createRaceState((BASE_SEED + 241) >>> 0);
    initBelief(raceN);
    setDraft(presetCurves('later'));
    const L0 = lockForecast(0);
    quietTo(raceN, 40);
    raceN.capability.labs.halcyon.rungCertified[2] = 64;
    const oN = scoreOutstandingQuarter(raceN);
    outstandingNaturalOK = !!oN && oN.rungs.every(r => r.o === 0)
        && Math.abs(oN.delta - [2, 3, 4].reduce((a, R) => a + logScoreDelta(L0.pairs[R].pP, L0.pairs[R].pM, 0), 0)) < 1e-12;
    // A quarter already scored is never scored again at the terminal.
    const raceS = createRaceState((BASE_SEED + 242) >>> 0);
    initBelief(raceS);
    setDraft(presetCurves('earlier'));
    lockForecast(0);
    quietTo(raceS, 63);
    const sc = scoreQuarter(63);
    noDoubleOK &&= scoreOutstandingQuarter(raceS) === sc && forecastRecord().quarters === 1;
    assert(outstandingOK, 'outstanding quarter not scored once from its stored pairs against the completed trajectory');
    assert(outstandingNaturalOK, 'a certification after the quarter end counted');
    assert(noDoubleOK, 'a quarter was scored twice');
}
// ==========================================================================
// Q. The standing policy (02a "The standing policy", its gates)
// ==========================================================================

/** One close of the game's day pipeline, in main.js's order: the snapshot at its
 *  top while race.day and belief.day are still the lock day (02a "Locks"), the
 *  trait evaluation, the race block, the lock-day block (the closing quarter's
 *  score, F, the F advice row's gate, scrutiny), then the terminal check.
 *  `hooks.traits(race)` and `hooks.lockDay(race, scored)` observe; returns the
 *  resolution or null. */
function deskClose(race, hooks = {}) {
    if (!race.resolution && race.day < HORIZON && isLockDay(race.day) && belief.day === race.day) snapshotForecast(race.day);
    if (hooks.traits) hooks.traits(race);
    advanceRace(race); stepControlRegime(race); stepTreaty(race, {}); stepBelief(race);
    if (isLockDay(race.day)) {
        const scored = scoreQuarter(race.day);
        scoreCopierQuarter(race.day);
        stepFirmBelief(race);
        if (hooks.lockDay) hooks.lockDay(race, scored);
    }
    return checkResolution(race, null);
}
/** The belief-keyed convictions (agi_pilled, doomer, and accelerationist's belief
 *  arm), with every positioning flag they read set, so belief is the only gate. */
const BELIEF_TRAITS = ['agi_pilled', 'doomer', 'accelerationist'];
const traitCtx = () => ({
    everLocked: hasStatedForecast(), beliefPilled: playerPilled(), credibility: credibility(),
    playerChoices: { bought_takeoff_binary: true, long_vol_hedge: true, doom_short: true, long_frontier: true, lobbied_export_controls: true },
});
const beliefTraitFires = () => BELIEF_TRAITS.some(id => getTrait(id).condition(traitCtx()));

let editCarriesOK = false, followOK = false, mixedValidOK = false, fidelityOK = false, revisionOK = false;
let followedMovesNoneOK = false, certMovesNoneOK = false, neverDrawOK = true, neverDrawDetail = '', noLock1008OK = false;
let midEditionOK = false, traitSeesLockOK = false;
{
    const clampW = (w) => Math.min(POSTERIOR.W_MAX, Math.max(POSTERIOR.W_MIN, w));
    // An edit carries: a width key on a followed rung whose projection crosses a
    // carried neighbour copies the projection, clamps its median and plateau to
    // the neighbour's and moves no neighbour; the result validates.
    const ra = createRaceState((BASE_SEED + 700) >>> 0);
    initBelief(ra);
    const P0 = marketCurves();
    setDraftMedian(2, 900);
    const c2 = { ...belief.player.carried[2] };
    setDraftWidth(3, P0[3].w * 1.1);
    const c = belief.player.carried, pol = draftPolicy(), eff = draftCurves();
    editCarriesOK = P0[3].m < 900 && pol[2] === 'carry' && pol[3] === 'carry' && pol[4] === 'follow' && pol[5] === 'follow'
        && c[2].m === 900 && c[2].q === c2.q && c[2].w === c2.w
        && c[3].m === 900 && c[3].q === Math.max(P0[3].q, c2.q) && c[3].w === clampW(P0[3].w * 1.1)
        && curvesEqual(eff, P0, 4) && curvesEqual(eff, P0, 5) && lockForecast(0) !== null;
    assert(editCarriesOK, 'an edit on a followed rung did not carry with the activation clamp, or it moved a neighbour');
    // Follow the market, one rung and then every rung.
    followMarket(3);
    const f1 = draftPolicy(), e1 = draftCurves();
    followMarket();
    const f2 = draftPolicy(), e2 = draftCurves();
    followOK = f1[3] === 'follow' && belief.player.carried[3] === null && f1[2] === 'carry' && curvesEqual(e1, P0, 3) && e1[2].m === 900
        && [2, 3, 4, 5].every(R => f2[R] === 'follow' && curvesEqual(e2, P0, R));
    assert(followOK, 'followMarket did not set the rung(s) back to the projection');

    // Mixed policies on one run. Day 0: R3 carried early, R2 followed above it.
    const rb = createRaceState((BASE_SEED + 701) >>> 0);
    initBelief(rb);
    setDraftMedian(3, 10);
    const lock0 = lockForecast(0);
    const e0 = draftCurves(), mk0 = marketCurves();
    mixedValidOK = !!lock0 && lock0.classes[2] === 'followed' && lock0.classes[3] === 'carried' && curvesEqual(e0, mk0, 2) && e0[2].m > e0[3].m;
    assert(mixedValidOK, 'validation rejected a crossing between a followed and a carried rung, or a followed rung was pushed');
    // Snapshot fidelity: a followed rung stores pP === pM and B's deadline quote; a
    // carried rung its carried curve bit-for-bit.
    const k3 = belief.player.carried[3];
    fidelityOK = !!lock0 && [2, 4].every(R => lock0.pairs[R].pP === lock0.pairs[R].pM && lock0.claims[R] === binaryProb(R, DEADLINE[R]))
        && lock0.classes[5] === 'followed' && lock0.claims[5] === binaryProb(5, DEADLINE[5]) && curvesEqual(lock0.curves, mk0, 5)
        && curvesEqual(lock0.curves, belief.player.carried, 3) && !(3 in lock0.claims)
        && lock0.pairs[3].pP === clampP(crossingProb(k3.m, k3.w, k3.q, 0, 63)) && lock0.pairs[3].pM === clampP(binaryProb(3, 63));
    assert(fidelityOK, 'a snapshot does not match its declared policy (followed pP === pM; carried curve bit-for-bit)');
    // A revision after the snapshot leaves it unchanged and reaches only the next.
    const j0 = JSON.stringify(lock0);
    setDraftMedian(4, 600);
    revisionOK = JSON.stringify(lock0) === j0 && latestLock() === lock0 && lock0.classes[4] === 'followed';
    // A followed rung's moves never move a carried one; a certification moves none.
    const snap = () => JSON.stringify([belief.player.carried[3], belief.player.carried[4]]);
    const k0 = snap(), b0 = marketCurves();
    quietTo(rb, 63, { 40: certifyOn(2) });
    const b63 = marketCurves();
    followedMovesNoneOK = snap() === k0 && !curvesEqual(b0, b63, 5) && curvesEqual(draftCurves(), b63, 5)
        && draftCurves()[2].m === 40 && curvesEqual(draftCurves(), belief.player.carried, 3) && curvesEqual(draftCurves(), belief.player.carried, 4);
    const s63 = scoreQuarter(63), r4 = s63 && s63.rungs.find(r => r.R === 4);
    const lock63 = lockForecast(63);
    revisionOK &&= !!r4 && r4.cls === 'followed' && r4.pP === r4.pM && r4.delta === 0
        && !!lock63 && lock63.classes[4] === 'carried' && curvesEqual(lock63.curves, belief.player.carried, 4);
    assert(revisionOK, 'a draft change after a snapshot moved the stored lock, or did not reach the next one');
    quietTo(rb, 126, { 100: certifyOn(3) });
    certMovesNoneOK = snap() === k0 && draftCurves()[3].m === 100 && draftCurves()[3].q === 0
        && curvesEqual(draftCurves(), belief.player.carried, 4) && followedMovesNoneOK;
    assert(followedMovesNoneOK, 'a followed rung\'s moves moved a carried rung');
    assert(certMovesNoneOK, 'a certification moved a carried rung');

    // No lock after the end or on day 1008.
    const rc = createRaceState((BASE_SEED + 702) >>> 0);
    initBelief(rc);
    quietTo(rc, 1008);
    const s1008 = snapshotForecast(1008);
    noLock1008OK = s1008.lock === null && s1008.copier === null && belief.player.locks.length === 0;
    assert(noLock1008OK, 'a lock was taken on day 1008');

    // A player who never draws, on main.js's close order, several worlds: every
    // lock follows on every rung, S_P and sigma0 are exactly 0 for the whole run,
    // there is no scrutiny trigger, belief-keyed conviction or F advice row, and
    // the locks are exactly the lock days the run reached before it ended.
    for (let i = 0; i < 12; i++) {
        const race = createRaceState((BASE_SEED + 710 + i) >>> 0);
        initConsensus(race); initBelief(race);
        let lastTop = 0, bad = '';
        const hooks = {
            traits: () => { if (beliefTraitFires()) bad ||= `conviction on day ${race.day}`; },
            lockDay: (r, scored) => {
                if (hasStatedForecast()) bad ||= `F advice row on day ${r.day}`;
                const gap = scrutinyGap(r, playerPilled());
                if (gap != null) bad ||= `scrutiny gap ${gap} on day ${r.day}`;
                if (scored && (scored.delta !== 0 || scored.var0 !== 0)) bad ||= `quarter to ${scored.to} scored ${scored.delta}`;
            },
        };
        for (;;) { lastTop = race.day; if (deskClose(race, hooks)) break; }
        scoreOutstandingQuarter(race);
        const P = belief.player;
        const want = [];
        for (let L = 0; L <= lastTop && L < HORIZON; L += LOCK_INTERVAL) want.push(L);
        if (!bad && JSON.stringify(P.locks.map(l => l.day)) !== JSON.stringify(want)) bad = `locks ${P.locks.map(l => l.day)} vs ${want}`;
        if (!bad && !P.locks.every(l => [2, 3, 4, 5].every(R => l.classes[R] === 'followed'))) bad = 'a lock carried a rung';
        if (!bad && (P.S !== 0 || P.var0 !== 0 || P.scores.some(q => q.delta !== 0))) bad = `S_P ${P.S}, var0 ${P.var0}`;
        if (bad) { neverDrawOK = false; neverDrawDetail ||= `seed ${BASE_SEED + 710 + i}: ${bad}`; }
    }
    assert(neverDrawOK, `never-draw player: ${neverDrawDetail}`);

    // A run that ends mid-edition takes no snapshot: the desk ejects during the
    // lock day 126's edition, after its quarter scored and before its close.
    const rd = createRaceState((BASE_SEED + 703) >>> 0);
    initConsensus(rd); initBelief(rd);
    while (rd.day < 126 && !deskClose(rd)) { /* closes */ }
    const scoredBefore = belief.player.scores.length;
    const out = scoreOutstandingQuarter(rd), outC = scoreCopierOutstanding(rd);
    midEditionOK = rd.day === 126 && !rd.resolution && latestLock().day === 63 && belief.player.locks.length === 2
        && !!out && out.from === 63 && out.to === 126 && !out.terminal && belief.player.scores.length === scoredBefore
        && !!outC && outC.from === 63 && !outC.terminal && copierRecord().locks === 2;
    assert(midEditionOK, 'a run that ended mid-edition took a snapshot or opened a quarter');

    // The trait evaluation later in the same close sees the new lock, and the
    // snapshot reads the lock day's state: the player first states R4 during day
    // 63's edition, and the close's traits see it.
    const re = createRaceState((BASE_SEED + 704) >>> 0);
    initConsensus(re); initBelief(re);
    while (re.day < 63 && !deskClose(re)) { /* closes */ }
    setDraft(normalizeCurves({ 2: { m: 30, w: 25 }, 3: { m: 40, w: 25 }, 4: { m: 50, w: 25 }, 5: { m: 60, w: 25 } }));
    const before = beliefTraitFires() || hasStatedForecast();
    const pM4 = clampP(binaryProb(4, 63 + LOCK_INTERVAL));
    let sawIt = false;
    deskClose(re, { traits: () => { sawIt = hasStatedForecast() && playerPilled() > 62 && getTrait('agi_pilled').condition(traitCtx()); } });
    const l63 = belief.player.locks.find(l => l.day === 63);
    traitSeesLockOK = !before && sawIt && !!l63 && l63.classes[4] === 'carried' && l63.pairs[4].pM === pM4;
    assert(traitSeesLockOK, 'the close\'s trait evaluation did not see the new lock, or the snapshot did not read the lock day');
}

// ==========================================================================
// F. Impulse-overlay decay -- no permanent param drift
// ==========================================================================

let noDriftOK = false, overlayLiveOK = false, clampOK = true, decayedToZeroOK = false, restoreOK = true;
{
    const BASELINE = { mu: 0.06, xi: 0.40, theta: 0.04, lambda: 0.5, kappa: 2.0 };
    const sim = { ...BASELINE };
    let sawOverlayShift = false;
    let clampViolated = false;

    // Half-life sanity: a lone impulse halves after IMPULSE_HALF_LIFE decays.
    resetEventImpulses();
    addEventImpulse({ mu: -0.10 });
    const m0 = currentEventImpulse().mu;
    for (let d = 0; d < IMPULSE_HALF_LIFE; d++) decayEventImpulses();
    const mH = currentEventImpulse().mu;
    const halfOK = Math.abs(mH / m0 - 0.5) < 1e-9;
    assert(halfOK, `impulse half-life wrong: ${mH}/${m0} != 0.5`);

    // Full run: fire a big impulse every 3 days for the first 900 days, always
    // apply/remove around a (no-op) "day", decay once/day; then STOP firing and
    // let it decay for the tail. Assert params restore each day and end at
    // baseline to the bit, and the accumulator has decayed away.
    resetEventImpulses();
    Object.assign(sim, BASELINE);
    for (let d = 0; d < HORIZON; d++) {
        if (d < 900 && d % 3 === 0) addEventImpulse({ mu: -0.08, xi: 0.06, theta: 0.02, lambda: 1.0 }, 1, { id: 'e' + d, day: d });
        const saved = applyEventImpulseOverlay(sim);
        // While live, at least one param must differ from baseline.
        if (Object.keys(saved).length > 0) {
            if (sim.mu !== BASELINE.mu || sim.xi !== BASELINE.xi) sawOverlayShift = true;
            // Overlaid values respect PARAM_RANGES.
            for (const k of Object.keys(saved)) {
                const r = PARAM_RANGES[k];
                if (r && (sim[k] < r.min - 1e-12 || sim[k] > r.max + 1e-12)) clampViolated = true;
            }
        }
        removeEventImpulseOverlay(sim, saved);
        // After removal the param is exactly baseline again (never permanently mutated).
        for (const k of Object.keys(BASELINE)) if (sim[k] !== BASELINE[k]) restoreOK = false;
        decayEventImpulses();
    }
    clampOK = !clampViolated;
    overlayLiveOK = sawOverlayShift;
    // No permanent drift: every param exactly at baseline.
    noDriftOK = Object.keys(BASELINE).every(k => sim[k] === BASELINE[k]);
    // Accumulator has decayed to ~0 after ~108 firing-free days at the tail.
    decayedToZeroOK = eventImpulseMagnitude() < 1e-6;
    assert(overlayLiveOK, 'impulse overlay never shifted a param while live (no-op)');
    assert(restoreOK, 'impulse overlay left a param permanently mutated after removal');
    assert(noDriftOK, 'sim params drifted from baseline over a full run');
    assert(clampOK, 'overlaid value escaped PARAM_RANGES');
    assert(halfOK, 'half-life check failed');
    assert(decayedToZeroOK, `impulse accumulator did not decay to ~0 (mag=${eventImpulseMagnitude()})`);
}

// ==========================================================================
// G. eta monotone in the released frontier
// ==========================================================================

let etaMonotoneOK = true, etaEndpointsOK = false, etaReadsOnlyReleasedOK = true;
{
    let prev = -Infinity;
    for (let rr = 1; rr <= 5; rr++) {
        const e = marketEfficiency({ releasedFrontierRung: rr });
        if (e < prev - 1e-12) etaMonotoneOK = false;
        prev = e;
    }
    etaEndpointsOK = Math.abs(marketEfficiency({ releasedFrontierRung: 1 }) - 0) < 1e-12
        && Math.abs(marketEfficiency({ releasedFrontierRung: 5 }) - 1) < 1e-12;
    // eta ignores everything but releasedFrontierRung (corruption-safe).
    const e1 = marketEfficiency({ releasedFrontierRung: 3, certifiedFrontierRung: 0, releaseCount: 0, day: 0 });
    const e2 = marketEfficiency({ releasedFrontierRung: 3, certifiedFrontierRung: 4, releaseCount: 99, day: 999 });
    etaReadsOnlyReleasedOK = Math.abs(e1 - e2) < 1e-12;
    assert(etaMonotoneOK, 'eta is not monotone non-decreasing in releasedFrontierRung');
    assert(etaEndpointsOK, 'eta endpoints wrong (want 0 at R1, 1 at R5)');
    assert(etaReadsOnlyReleasedOK, 'eta read a field other than releasedFrontierRung');
}

// ==========================================================================
// H. Firm belief F + gates (sanity; F is race-stored, logic beside B)
// ==========================================================================

let fBoundedOK = true, fWakesOK = false, gatesOK = false;
{
    const race = createRaceState((BASE_SEED + 400) >>> 0);
    initConsensus(race); initBelief(race);
    const F0 = firmBelief(race);
    for (let d = 0; d < HORIZON; d++) {
        raceDay(race);
        if (d % LOCK_INTERVAL === 0) {
            stepFirmBelief(race);
            const F = firmBelief(race);
            if (F < 0 - 1e-9 || F > 100 + 1e-9) fBoundedOK = false;
        }
    }
    fWakesOK = firmBelief(race) >= F0;   // the firm wakes (weakly monotone up in a progressing world)
    assert(fBoundedOK, 'F left [0,100]');
    // Gate predicates: below/above thresholds.
    belief.player.credibility = 0.60; gatesOK = canSendMemos() && !canActAsFund(70);
    belief.player.credibility = 0.70; gatesOK = gatesOK && canActAsFund(70) && !canActAsFund(50);
    belief.player.var0 = 1e6; gatesOK = gatesOK && canSendMemos() && canActAsFund(70);   // sigma0 reads no gate (02a)
    assert(gatesOK, 'memo / fund-as-actor gate thresholds wrong');
    void fWakesOK; void scrutinyGap; void playerPilled; void marketPilled; void computeUrgency; void deactivateBelief; void resetBelief; void setControlRegime; void computeMarket; void initComputeMarket;
}

// ==========================================================================
// H2. Never-lock scrutiny must NOT fire (P1)
// ==========================================================================

let neverLockNoScrutinyOK = false, guardNotVacuousOK = false;
{
    // A player who never draws, snapshotted every quarter over a FULL run: every
    // lock follows R4, so playerPilled is null, scrutinyGap is null and
    // _runScrutiny skips every quarter -- no false ±3 from copying the market,
    // whose gap against a slow-waking F reached 42 on seed 1 (02a "What follows
    // states nothing").
    const race = createRaceState((BASE_SEED + 600) >>> 0);
    initConsensus(race); initBelief(race);
    let triggers = 0;
    lockForecast(0);
    for (let d = 0; d < HORIZON; d++) {
        raceDay(race);
        if (isLockDay(race.day)) {
            stepFirmBelief(race);
            // Exactly _runScrutiny's guard + trigger condition.
            const gap = scrutinyGap(race, playerPilled());
            if (gap != null && Math.abs(gap) > 20) triggers++;
            if (race.day < HORIZON) lockForecast(race.day);
        }
    }
    neverLockNoScrutinyOK = !hasStatedForecast() && playerPilled() === null && triggers === 0 && belief.player.locks.length === HORIZON / LOCK_INTERVAL;
    assert(neverLockNoScrutinyOK, `never-draw player produced ${triggers} scrutiny triggers (want 0)`);

    // The guard is not vacuous: a divergent CARRIED R4 can still trigger.
    const race2 = createRaceState((BASE_SEED + 601) >>> 0);
    initConsensus(race2); initBelief(race2);
    setDraft(normalizeCurves({ 2: { m: 30, w: 25 }, 3: { m: 40, w: 25 }, 4: { m: 50, w: 25 }, 5: { m: 60, w: 25 } }));   // maximally pilled at day 0 vs F=15
    lockForecast(0);
    guardNotVacuousOK = hasStatedForecast() && Math.abs(scrutinyGap(race2, playerPilled())) > 20;
    assert(guardNotVacuousOK, 'scrutiny guard is vacuous (a divergent locked posterior cannot trigger)');
}

// ==========================================================================
// I. A quiet record decays the quote toward NO by the deadline
// ==========================================================================

let decayReachesFloorOK = false;
const decayPath = [];
{
    const race = createRaceState((BASE_SEED + 500) >>> 0);
    initConsensus(race); initBelief(race);
    const R2 = consensus.contracts.find(c => c.predicate.rung === 2);
    for (const t of [0, 100, 200, 300, 400, 419]) {
        quietTo(race, t);
        decayPath.push([t, binaryQuoteFromBelief({ day: t }, R2)]);
    }
    // The gate's intent, restated for the reader (HEAD's `near <= 0.05` floor was the
    // heuristic B's own arithmetic: a logistic with fixed {m, w} conditioned on one day
    // left goes to ~0 mechanically; under the reader the eve quote is a one-day hazard).
    // HEAD's decay criterion stands: the eve quote at least 0.3 below the listing, and
    // still falling over the deadline's last stretch.
    const [, q0] = decayPath[0], [, q400] = decayPath.at(-2), [, q419] = decayPath.at(-1);
    decayReachesFloorOK = q419 < q0 - 0.3 && q419 < q400;
    assert(decayReachesFloorOK, `a quiet record did not decay toward NO by the deadline (${q0} -> ${q400} -> ${q419})`);
}

// ==========================================================================
// J. Followup-fired race shells seed impulses (fix 6)
// ==========================================================================

let followupImpulseOK = false, singleSeedOK = false, dispatchNoSimMutateOK = false;
{
    const engine = new EventEngine();
    const sim = { mu: 0.06, xi: 0.4, theta: 0.04, lambda: 0.5, recomputeK() {}, _recomputeRhoDerived() {} };

    // incident_postmortem is followupOnly -- it fires through _fireEvent, NOT the
    // bridge. The canonical dispatch inside _fireEvent must seed its impulse.
    resetEventImpulses();
    const pm = getEventById('incident_postmortem');
    const before = eventImpulseMagnitude();
    engine._fireEvent(pm, sim, 100, 0, 0);
    followupImpulseOK = pm && pm.impulse != null && eventImpulseMagnitude() > before;
    assert(followupImpulseOK, 'followup-fired incident_postmortem did not seed an impulse (canonical dispatch missing)');

    // The canonical path seeds EXACTLY one impulse worth (scale x coupling); a
    // bridge shell (with _impulseScale) is not double-seeded.
    resetEventImpulses();
    const shell = { id: 'probe_shell', impulse: { mu: -0.10 }, headline: 'x', _impulseScale: 1 };
    engine._fireEvent(shell, sim, 5, 0, 0);
    singleSeedOK = Math.abs(currentEventImpulse().mu - (-0.10)) < 1e-9;
    assert(singleSeedOK, `bridge-shell impulse double-seeded or wrong (mu=${currentEventImpulse().mu})`);

    dispatchNoSimMutateOK = sim.mu === 0.06 && sim.xi === 0.4;
    assert(dispatchNoSimMutateOK, 'impulse dispatch permanently mutated sim params');
}

// ==========================================================================
// K. Day-lifecycle overlay order -- events mutate BASELINE, not overlay (fix 1)
// ==========================================================================

let overlayOrderOK = false, buggyOrderReproducedOK = false;
{
    // The FIXED lifecycle: apply overlay -> (substeps under overlay) -> REMOVE
    // overlay -> event mutates BASELINE. Codex's exact probe: baseline mu .06,
    // impulse +.01 (overlay), event +.02 -> final .08 (not .06).
    resetEventImpulses();
    const sim = { mu: 0.06 };
    addEventImpulse({ mu: 0.01 });
    const saved = applyEventImpulseOverlay(sim);
    const liveMu = sim.mu;                     // .07 while the overlay is installed
    removeEventImpulseOverlay(sim, saved);     // restore baseline .06 BEFORE the event
    sim.mu += 0.02;                            // legit event delta on the true baseline
    overlayOrderOK = Math.abs(liveMu - 0.07) < 1e-12 && Math.abs(sim.mu - 0.08) < 1e-12;
    assert(overlayOrderOK, `overlay/event order wrong: live=${liveMu} final=${sim.mu} (want .07 then .08)`);

    // The OLD (buggy) order -- event WHILE the overlay is installed, removal after
    // -- restores the pre-event saved value and ERASES the .02 (-> .06).
    resetEventImpulses();
    const sim2 = { mu: 0.06 };
    addEventImpulse({ mu: 0.01 });
    const saved2 = applyEventImpulseOverlay(sim2);
    sim2.mu += 0.02;                           // event fires while overlay installed
    removeEventImpulseOverlay(sim2, saved2);   // restore saved .06 -> erases the event delta
    buggyOrderReproducedOK = Math.abs(sim2.mu - 0.06) < 1e-12;
    assert(buggyOrderReproducedOK, `buggy-order probe did not reproduce the erase (got ${sim2.mu})`);
    resetEventImpulses();
}

// ---- Report --------------------------------------------------------------

const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const ok = (b) => b ? 'ok' : 'FAIL';
line(`belief-test: N=${N} runs, base seed=${BASE_SEED}, horizon=${HORIZON}d`);
line('='.repeat(72));
line('\nA. The rule of thumb + full-corruption invariance');
line(`  every rule move carries a causal ID:                ${ok(allCausesHaveId)}  (${totalCauses} moves over ${N} runs)`);
line(`  ledger FULL COVERAGE; rule and record agree on certs: ${ok(ledgerCoverageOK)}`);
line(`  pooled B, quotes, laws, projection, heads invariant under corruption: ${invarianceOK ? 'holds' : 'VIOLATED'}`);
line('\nB. Leak once-per-ID');
line(`  leaked beat folds exactly once (replay is a no-op): ${ok(leakOnceOK)}`);
line(`  replayed leak records no second causal move:        ${ok(stepIdempotentOK)}`);
line('\nC. Posterior with plateau, locks, scoring');
line(`  crossingProb/quarterProb with q == naive ratio:     ${ok(probOK)}`);
line(`  plateau handle (closed form, bounds, ladder push):  ${ok(plateauOK)}`);
line(`  m and q monotone over R2-R4, R5 unordered:          ${ok(orderOK)}`);
line(`  locks store the clamped {pP, pM} pairs:             ${ok(pairsOK)}`);
line(`  a call's score == stored-pair hand value:           ${ok(deltaOK)}`);
line(`  market copier (every rung followed) scores 0:       ${ok(copierZeroOK)}`);
line(`  lock semantics (valid policy/on-grid/immutable):    ${ok(lockGuardOK)}`);
line(`  scoring needs the opening lock; once per quarter:   ${ok(scoreGuardOK)}`);
line(`  no manufactured forecast; every rung follows:      ${ok(noManufacturedOK)}`);
line(`  followed claim reads B; followed R4 pilled is null:  ${ok(marketPolicyReadsOK)}`);
line(`  a carried curve == projection is followed:         ${ok(projectionIsMarketOK)}`);
line(`  day 945: playerPilled capped at R4's support:       ${ok(lateCapOK)}`);
line(`  day 945: plateau inverse exact (saturated logistic): ${ok(latePlateauOK)}`);
line(`  day 945: curveMedian 962.33, daily mass adds up:     ${ok(lateMedianOK)}`);
line(`  sigma0^2 == naive sum over scored rung-quarters:    ${ok(sigmaOK)}`);
line(`  market-policy record has sigma0 exactly 0:          ${ok(sigmaCopierOK)}`);
line('\nD. Lock-day schedule (0, 63, 126, ...)');
line(`  isLockDay matches the grid over ${HORIZON}d:           ${ok(scheduleOK)}`);
line('\nE. Day-0 listing quotes with the real quoter (mean / min / max over worlds)');
for (const R of [2, 3, 4, 5]) { const a = listingRows[R]; line(`  R${R}  ${mean(a).toFixed(3)}  ${Math.min(...a).toFixed(3)}  ${Math.max(...a).toFixed(3)}`); }
line(`  all two-sided: ${ok(listingTwoSidedOK)}`);
line('\nL-O. The pool, the projection, the timeline, the player\'s projection');
line(`  pool arithmetic == (1-eta)*legible + eta*full, projected: ${ok(poolOK)}  (${poolChecks} coordinates)`);
line(`  P(R4) <= P(R3) <= P(R2) pointwise:                  ${ok(coherenceOK)}`);
line(`  untouched where the pool is already ordered:        ${ok(untouchedOK)}`);
line(`  implied timeline == brute-force pooled median:      ${ok(timelineOK)}`);
line(`  beliefLaw masses + atom == 1, median == timeline:    ${ok(lawOK)}`);
line(`  projection bounds + ladder order:                   ${ok(projBoundsOK)}`);
line(`  earlier/later presets on the projection, q kept:    ${ok(presetOK)}`);
line('\nP. The outstanding quarter at the terminal');
line(`  scored once from its pairs vs the completed world:  ${ok(outstandingOK)}`);
line(`  a certification after the quarter's end: o = 0:     ${ok(outstandingNaturalOK)}`);
line(`  no quarter scored twice, no terminal lock:          ${ok(noDoubleOK)}`);
line('\nQ. The standing policy');
line(`  an edit carries (activation clamp, no neighbour):   ${ok(editCarriesOK)}`);
line(`  follow the market (one rung, every rung):          ${ok(followOK)}`);
line(`  followed/carried crossing validates, not pushed:    ${ok(mixedValidOK)}`);
line(`  snapshot matches its declared policy:               ${ok(fidelityOK)}`);
line(`  a revision reaches only later snapshots:            ${ok(revisionOK)}`);
line(`  a followed rung's moves move no carried rung:       ${ok(followedMovesNoneOK)}`);
line(`  a certification moves no carried rung:              ${ok(certMovesNoneOK)}`);
line(`  never-draw: all followed, S_P = sigma0 = 0, no scrutiny/conviction/F row: ${ok(neverDrawOK)}${neverDrawDetail ? '  (' + neverDrawDetail + ')' : ''}`);
line(`  no lock on day 1008:                                ${ok(noLock1008OK)}`);
line(`  a mid-edition end takes no snapshot:                ${ok(midEditionOK)}`);
line(`  the close's traits see the new lock:               ${ok(traitSeesLockOK)}`);
line('\nF. Impulse-overlay decay (no permanent param drift)');
line(`  overlay shifts a param while live:                  ${ok(overlayLiveOK)}`);
line(`  param restored to baseline each day:                ${ok(restoreOK)}`);
line(`  NO permanent drift over ${HORIZON}d run:                ${ok(noDriftOK)}`);
line(`  overlaid values clamped to PARAM_RANGES:            ${ok(clampOK)}`);
line(`  accumulator decays to ~0 (half-life ${IMPULSE_HALF_LIFE}d):          ${ok(decayedToZeroOK)}`);
line('\nG. eta monotone in the released frontier (02a ruling)');
line(`  non-decreasing in releasedFrontierRung:             ${ok(etaMonotoneOK)}`);
line(`  endpoints 0 at R1 / 1 at R5:                        ${ok(etaEndpointsOK)}`);
line(`  reads ONLY releasedFrontierRung:                    ${ok(etaReadsOnlyReleasedOK)}`);
line('\nH. Firm belief F + gates');
line(`  F stays in [0,100] over a run:                      ${ok(fBoundedOK)}`);
line(`  memo / fund-as-actor gate thresholds:               ${ok(gatesOK)}`);
line('\nH2. Never-draw scrutiny skip (02a "What follows states nothing")');
line(`  never-draw player -> zero scrutiny triggers:        ${ok(neverLockNoScrutinyOK)}`);
line(`  not vacuous (a divergent carried R4 can fire):      ${ok(guardNotVacuousOK)}`);
line('\nI. A quiet record (R2 quote by day)');
line(`  ${decayPath.map(([t, q]) => `${t}:${q.toFixed(3)}`).join('  ')}`);
line(`  eve quote >= 0.3 below the listing, still falling:  ${ok(decayReachesFloorOK)}`);
line('\nJ. Followup-fired race shells seed impulses (fix 6)');
line(`  incident_postmortem (followup path) seeds impulse:  ${ok(followupImpulseOK)}`);
line(`  canonical dispatch seeds exactly once (no double):  ${ok(singleSeedOK)}`);
line(`  dispatch never mutates sim params:                  ${ok(dispatchNoSimMutateOK)}`);
line('\nK. Day-lifecycle overlay order (fix 1)');
line(`  event mutates BASELINE (.06 +impulse +.02 -> .08):  ${ok(overlayOrderOK)}`);
line(`  buggy order reproduced (would erase to .06):        ${ok(buggyOrderReproducedOK)}`);
line('\n' + '='.repeat(72));
if (failures === 0) {
    line('ALL BELIEF INVARIANTS PASS');
} else {
    line(`${failures} ASSERTION FAILURE(S):`);
    for (const m of failSamples) line('  - ' + m);
}
process.exitCode = failures === 0 ? 0 : 1;
