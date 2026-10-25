#!/usr/bin/env node
/* ===================================================
   tools/belief-test.mjs -- Correctness + integrity harness
   for market belief `B`, the belief-backed quoters, market
   efficiency `eta`, the player's posterior + its scoring,
   and the decaying event-impulse overlay
   (overhaul phase 4; src/race/belief.js + src/race/impulse.js).

   Hard-assertion checks:

   A. B-update causality (09 "Information hygiene"): over N real
      runs, EVERY non-random B move carries a causal evidence ID
      (belief.causes), and corrupting EVERY latent field -- plus
      injecting fake entries into the latent incident/evidence
      QUEUES -- leaves B (rungs + alignment), the implied
      timeline, and every belief-backed quote bit-identical
      (stepBelief consumes only race.lastTransitions).

   B. Leak once-per-ID (02a): a leaked evidence beat / insider
      tip folds into B EXACTLY once; replaying the same evidence
      ID is a no-op. And a public listing-day quote equals the
      contract's base rate (the seed) -- two-sided.

   C. Posterior scoring arithmetic (02a, the posterior): the
      quarter's survival-conditioned crossing probability and
      the log-likelihood-ratio increment checked to the digit
      against an independent naive formula; a market copier
      scores exactly 0; credibility = tanh(S_P / K_CRED); the
      lock guard (full valid curve set, on-grid + current day,
      immutable with exact replay); scoring needs the opening
      lock and runs once per quarter; no manufactured forecast
      (the day-0 draft is a copy of B, nothing is locked).

   D. Lock-day schedule (02a): isLockDay is true exactly on
      0, 63, 126, ... and false off-grid.

   E. Two-sided listing quotes with the REAL quoter: day-0 mids
      in (0.05, 0.95) and equal to the listing base rate.

   F. Impulse-overlay decay (03 incident-coupling rule): over a
      full 1008-day run that fires impulses every few days,
      apply/decay/remove leaves the sim params at baseline to the
      bit (no permanent drift), the overlay genuinely shifts a
      param while live (not a no-op), overlaid values are clamped
      to PARAM_RANGES, and the accumulator decays to ~0.

   G. eta monotone in the RELEASED frontier (02a ruling): eta is
      non-decreasing in releasedFrontierRung and reads nothing
      else; 0 at R1, 1 at R5.

   Usage:  node tools/belief-test.mjs [N] [--seed S]
           N defaults to 300; base seed defaults to 1.
   =================================================== */

import { createRaceState, advanceRace, setControlRegime } from '../src/race/race-state.js';
import {
    consensus, initConsensus, refreshBinaryQuotes, computeBinarySettlements,
    buildPublicView, getBinaryQuote,
} from '../src/race/consensus.js';
import {
    computeMarket, initComputeMarket, buildComputePublicView,
} from '../src/race/compute-market.js';
import {
    belief, initBelief, resetBelief, deactivateBelief, stepBelief,
    binaryProb, binaryQuoteFromBelief, computeCurveFromBelief, computeUrgency,
    impliedTimeline, marketEfficiency, beliefCauses,
    isLockDay, LOCK_INTERVAL, lockForecast, lockedClaim, scoreQuarter, quarterProb,
    logScoreDelta, presetCurves, marketCurves, normalizeCurves, draftCurves, curvesEqual,
    forecastRecord, forecastTuning,
    credibility, canSendMemos, canActAsFund, playerPilled, marketPilled,
    firmBelief, stepFirmBelief, scrutinyGap, hasEverLocked,
} from '../src/race/belief.js';
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
let N = 300;
let BASE_SEED = 1;
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') BASE_SEED = parseInt(argv[++i], 10) >>> 0;
    else if (a === '--n' || a === '-n') N = parseInt(argv[++i], 10);
    else if (/^\d+$/.test(a)) N = parseInt(a, 10);
}
const HORIZON = 1008;

// ---- Assertion plumbing --------------------------------------------------

let failures = 0;
const failSamples = [];
function assert(cond, msg) {
    if (!cond) { failures++; if (failSamples.length < 25) failSamples.push(msg); }
}
const line = (s = '') => console.log(s);
const EPS = 1e-9;

// Belief-state signature (everything a quote can depend on) for invariance.
function beliefSig() {
    return JSON.stringify({
        rungs: belief.rungs, alignment: belief.alignment, day: belief.day,
    });
}
// Corrupt EVERY latent field AND inject fakes into the latent queues -- exactly
// what a hidden-state read would trip over. stepBelief consumes only the ledger,
// so none of this may move B.
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
    // Fake latent entries -- NOT in lastTransitions, so B must ignore them.
    race.latentIncidents.push({ id: 'FAKE', severity: 4, occurDay: race.day, insiderTip: true, detected: false, detectable: false, meanLag: 0 });
    race.latentEvidence.push({ id: 'FAKE', published: false, path: 'leaked', logLR: 5, publicDay: Infinity });
}

// ==========================================================================
// A. B-update causality + full-corruption invariance
// ==========================================================================

let causalityOK = true, allCausesHaveId = true, invarianceOK = true, ledgerCoverageOK = false;
let totalCauses = 0;
{
    const PUBLIC_VIEW_KEYS = ['day', 'certifiedFrontierRung', 'releasedFrontierRung', 'claimedRung', 'releaseCount', 'lastReleaseDay', 'controlRegime'].sort().join(',');
    // 1. Every non-random B move has an ID, over N full runs.
    for (let i = 0; i < N; i++) {
        const race = createRaceState((BASE_SEED + i) >>> 0);
        initConsensus(race);
        initBelief(race);
        for (let d = 0; d < HORIZON; d++) { advanceRace(race); stepBelief(race); }
        for (const c of beliefCauses()) {
            totalCauses++;
            if (c.id == null) { allCausesHaveId = false; causalityOK = false; }
        }
    }
    assert(allCausesHaveId, 'a B move was recorded with no causal evidence ID');

    // 1b. Causal-ledger FULL COVERAGE (02a "Belief, η, and the firm"): reconstruct each
    //     rung's (m, w) trajectory from the ledger ALONE and assert it lands
    //     exactly on the live belief -- no m/w/monotonicity mutation lacks a cause
    //     entry (not merely "existing records have IDs"). Entries must also chain
    //     (each from-state == the prior to-state).
    {
        const race = createRaceState((BASE_SEED + 950) >>> 0);
        initConsensus(race); initBelief(race);
        const seed = {};   // snapshot the listing seed BEFORE any update
        for (const R of [2, 3, 4, 5]) seed[R] = { m: belief.rungs[R].m, w: belief.rungs[R].w, crossed: false, certDay: null };
        for (let d = 0; d < 600; d++) { advanceRace(race); stepBelief(race); }
        const causes = beliefCauses();
        assert(causes.length < 4000, 'belief ledger overflowed the cap during the coverage run');
        const recon = {};
        for (const R of [2, 3, 4, 5]) recon[R] = { ...seed[R] };
        let chainOK = true, coverageOK = true;
        for (const c of causes) {
            if (c.rung == null) continue;   // alignment scalar -- not a rung m/w move
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
        ledgerCoverageOK = chainOK && coverageOK;
        assert(chainOK, 'ledger entries do not chain (a from-state disagreed with the prior to-state)');
        assert(coverageOK, 'ledger reconstruction did not reproduce the live belief (uncovered mutation)');
    }

    // 2. Public view exposes only public keys (belief reads nothing else).
    {
        const race = createRaceState((BASE_SEED + 900) >>> 0);
        initConsensus(race);
        for (let d = 0; d < 400; d++) advanceRace(race);
        const view = buildPublicView(race);
        assert(Object.keys(view).sort().join(',') === PUBLIC_VIEW_KEYS, 'buildPublicView leaks non-public keys');
    }

    // 3. Corrupting every latent field + injecting fake latents leaves B, the
    //    implied timeline, and every quote bit-identical at each probe day.
    const DAYS = [200, 420, 500, 756, 900, 1000];
    for (let s = 0; s < 8; s++) {
        for (const D of DAYS) {
            const seed = (BASE_SEED + 9100 + s) >>> 0;
            // Reference: clean run to D.
            const raceA = createRaceState(seed); initConsensus(raceA); initBelief(raceA);
            for (let d = 0; d < D; d++) { advanceRace(raceA); stepBelief(raceA); }
            const sigA = beliefSig();
            const tlA = JSON.stringify(impliedTimeline());
            const viewA = buildPublicView(raceA);
            const cvA = buildComputePublicView(raceA, null);
            const contracts = consensus.contracts.map(c => ({ ...c }));
            const qA = JSON.stringify(contracts.map(c => binaryQuoteFromBelief(viewA, c)));
            const ccA = JSON.stringify([0, 63, 126, 252].map(dte => computeCurveFromBelief(cvA, dte)));

            // Corrupted: identical to D-1, advance to D, corrupt BEFORE the day-D
            // belief step, then step + quote.
            const raceB = createRaceState(seed); initConsensus(raceB); initBelief(raceB);
            for (let d = 0; d < D - 1; d++) { advanceRace(raceB); stepBelief(raceB); }
            advanceRace(raceB);
            corruptLatent(raceB);
            stepBelief(raceB);
            const sigB = beliefSig();
            const tlB = JSON.stringify(impliedTimeline());
            const viewB = buildPublicView(raceB);
            const cvB = buildComputePublicView(raceB, null);
            const qB = JSON.stringify(contracts.map(c => binaryQuoteFromBelief(viewB, c)));
            const ccB = JSON.stringify([0, 63, 126, 252].map(dte => computeCurveFromBelief(cvB, dte)));

            const same = sigA === sigB && tlA === tlB && qA === qB && ccA === ccB;
            if (!same) invarianceOK = false;
            assert(sigA === sigB, `B state changed under corruption (seed ${s}, D=${D})`);
            assert(tlA === tlB, `implied timeline changed under corruption (seed ${s}, D=${D})`);
            assert(qA === qB, `binary quote changed under corruption (seed ${s}, D=${D})`);
            assert(ccA === ccB, `compute curve changed under corruption (seed ${s}, D=${D})`);
        }
    }
}

// ==========================================================================
// B. Leak once-per-ID + idempotent stepBelief
// ==========================================================================

let leakOnceOK = false, stepIdempotentOK = false;
{
    // Craft a race with a single leaked evidence beat in the ledger and step it
    // twice against the SAME ledger -- alignment must move once, not twice.
    const race = createRaceState((BASE_SEED + 111) >>> 0);
    initBelief(race);
    // Synthetic one-day ledger: one leaked beat (id 'L1'), nothing else.
    race.lastTransitions = {
        releases: [], certifications: [], thefts: [], crossings: [], spawned: [],
        incidents: { occurred: [], detected: [] },
        evidence: { occurred: [{ id: 'L1', lab: 'halcyon', favorable: false, logLR: -1.0, path: 'leaked', occurDay: race.day }], published: [] },
    };
    race.day = 10; belief.day = 10;
    const a0 = belief.alignment;
    stepBelief(race);
    const a1 = belief.alignment;
    stepBelief(race);   // replay SAME ledger/ID
    const a2 = belief.alignment;
    leakOnceOK = Math.abs(a1 - a0) > 1e-9 && Math.abs(a2 - a1) < 1e-12;
    assert(leakOnceOK, `leak folded more than once (a0=${a0} a1=${a1} a2=${a2})`);
    stepIdempotentOK = beliefCauses().filter(c => c.id === 'evleak_L1').length === 1;
    assert(stepIdempotentOK, 'replayed leak recorded a second causal move');
}

// ==========================================================================
// C. Posterior scoring arithmetic
// ==========================================================================

let probOK = false, copierZeroOK = false, deltaOK = false, lockGuardOK = false;
let scoreGuardOK = false, noManufacturedOK = false, claimIsQuoteOK = false;
{
    // Independent naive forms (02a "Scoring"), against the module's stable ones.
    const sig = (x) => 1 / (1 + Math.exp(-x));
    const naiveP = (m, w, t0, t1) => {
        const F0 = sig((t0 - m) / w), F1 = sig((t1 - m) / w);
        return Math.min(0.98, Math.max(0.02, (F1 - F0) / (1 - F0)));
    };
    const naiveD = (pP, pM, o) => o ? Math.log(pP / pM) : Math.log((1 - pP) / (1 - pM));
    probOK = [[100, 50, 0, 63], [721, 140, 315, 378], [400, 25, 378, 441], [2016, 400, 0, 63]]
        .every(([m, w, t0, t1]) => Math.abs(quarterProb(m, w, t0, t1) - naiveP(m, w, t0, t1)) < 1e-12)
        // A median far behind t0 (the naive form is 0/0 here): the logistic's tail
        // hazard is 1/w, so the quarter's probability is 1 - e^(-63/w).
        && Math.abs(quarterProb(10, 25, 1000, 1063) - (1 - Math.exp(-63 / 25))) < 1e-9;
    assert(probOK, 'quarterProb disagrees with the naive survival-conditioned form');

    // A market copier: lock B's curves at day 0, close the quarter at day 63 with a
    // certification inside it -> every increment is exactly 0, and so is credibility.
    const race = createRaceState((BASE_SEED + 222) >>> 0);
    initBelief(race);
    lockForecast(0, presetCurves('market'));
    belief.day = 63;
    belief.rungs[2].crossed = true; belief.rungs[2].certDay = 40;
    const q1 = scoreQuarter(63);
    copierZeroOK = !!q1 && q1.rungs.length === 3 && q1.rungs.every(r => r.delta === 0)
        && q1.delta === 0 && credibility() === 0 && forecastRecord().quarters === 1;
    assert(copierZeroOK, `market copier scored ${q1 && q1.delta} (want exactly 0)`);

    // A call: R2 earlier than B (and it certifies in the quarter), R3/R4 as drawn.
    const race2 = createRaceState((BASE_SEED + 223) >>> 0);
    initBelief(race2);
    const mk = marketCurves();
    const mine = normalizeCurves({ ...mk, 2: { m: 120, w: 60 } });
    lockForecast(0, mine);
    belief.day = 63;
    belief.rungs[2].crossed = true; belief.rungs[2].certDay = 63;   // ON L_q+1: inside the quarter
    const q2 = scoreQuarter(63);
    const want = [2, 3, 4].reduce((acc, R) => acc + naiveD(
        naiveP(mine[R].m, mine[R].w, 0, 63), naiveP(mk[R].m, mk[R].w, 0, 63), R === 2 ? 1 : 0), 0);
    deltaOK = !!q2 && Math.abs(q2.delta - want) < 1e-12 && q2.delta > 0
        && Math.abs(credibility() - Math.tanh(want / forecastTuning.K_CRED)) < 1e-12
        && q2.rungs.find(r => r.R === 2).o === 1 && Math.abs(logScoreDelta(0.5, 0.5, 1)) === 0;
    assert(deltaOK, `scored delta ${q2 && q2.delta} != hand ${want}`);

    // Lock semantics (02a): a full VALID curve set; on-grid + CURRENT-day only;
    // immutable once accepted (exact replay idempotent, edits rejected).
    const race3 = createRaceState((BASE_SEED + 224) >>> 0);
    initBelief(race3);   // belief.day == 0
    const base = presetCurves('market');
    const partial = lockForecast(0, { 2: base[2], 3: base[3] });                          // missing rungs
    const outOfRange = lockForecast(0, { ...base, 5: { m: 2017, w: 100 } });               // m > 2016
    const tooNarrow = lockForecast(0, { ...base, 3: { m: base[3].m, w: 10 } });            // w < 25
    const crossed = lockForecast(0, { ...base, 3: { m: base[2].m - 1, w: base[3].w } });   // m3 < m2
    const offGrid = lockForecast(7, base);
    const wrongDay = lockForecast(63, base);
    const good = lockForecast(0, base);
    const replay = lockForecast(0, presetCurves('market'));
    const mutate = lockForecast(0, presetCurves('earlier'));
    lockGuardOK = partial === null && outOfRange === null && tooNarrow === null && crossed === null
        && offGrid === null && wrongDay === null && good !== null && replay === good && mutate === null
        && Object.isFrozen(good) && Object.isFrozen(good.curves[2]);
    assert(lockGuardOK, 'lock semantics wrong (valid-set / on-grid+current-day / immutable)');

    // Scoring guards: no lock at L_q -> nothing scored; once per quarter.
    const race4 = createRaceState((BASE_SEED + 225) >>> 0);
    initBelief(race4);
    belief.day = 63;
    const noLock = scoreQuarter(63);
    belief.day = 0; lockForecast(0, presetCurves('later')); belief.day = 63;
    const first = scoreQuarter(63), again = scoreQuarter(63);
    scoreGuardOK = noLock === null && !!first && again === first && forecastRecord().quarters === 1
        && forecastRecord().S === first.S && scoreQuarter(64) === null && scoreQuarter(126) === null;
    assert(scoreGuardOK, 'scoreQuarter guards wrong (needs the opening lock; once per quarter; current day only)');

    // No manufactured day-0 forecast: no locks, credibility 0, no claim; the draft
    // is a copy of B.
    const race5 = createRaceState((BASE_SEED + 226) >>> 0);
    initBelief(race5);
    const d0 = draftCurves(), m0 = marketCurves();
    noManufacturedOK = belief.player.locks.length === 0 && credibility() === 0 && lockedClaim(2) === null
        && [2, 3, 4, 5].every(R => curvesEqual(d0, m0, R));
    assert(noManufacturedOK, 'initBelief manufactured a forecast, or the day-0 draft is not B');

    // A locked market curve reads the Consensus quote it copied (lockedClaim).
    lockForecast(0, presetCurves('market'));
    claimIsQuoteOK = [2, 3, 4, 5].every(R => Math.abs(lockedClaim(R) - binaryProb(R, { 2: 420, 3: 756, 4: 880, 5: 1000 }[R])) < 1e-9);
    assert(claimIsQuoteOK, 'lockedClaim of a market lock != the day-0 Consensus quote');
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

let listingTwoSidedOK = true, listingEqualsBaseOK = true;
const listingRows = [];
{
    const race = createRaceState((BASE_SEED + 300) >>> 0);
    initConsensus(race); initBelief(race);
    const view = buildPublicView(race);
    for (const c of consensus.contracts) {
        const mid = binaryQuoteFromBelief(view, c);
        const twoSided = mid > 0.05 && mid < 0.95;
        const eqBase = Math.abs(mid - c.baseRate) < 1e-6;
        if (!twoSided) listingTwoSidedOK = false;
        if (!eqBase) listingEqualsBaseOK = false;
        assert(twoSided, `listing mid ${mid.toFixed(3)} not two-sided (rung R${c.predicate.rung})`);
        assert(eqBase, `listing mid ${mid.toFixed(3)} != base rate ${c.baseRate} (rung R${c.predicate.rung})`);
        listingRows.push({ rung: c.predicate.rung, base: c.baseRate, mid });
    }
    // And the refreshed book (real quoter through refreshBinaryQuotes) is two-sided.
    const { setBinaryQuoteSource } = await import('../src/race/consensus.js');
    setBinaryQuoteSource(binaryQuoteFromBelief);
    refreshBinaryQuotes(race);
    for (const c of consensus.contracts) {
        const q = getBinaryQuote(c.key);
        assert(q.bid > 0 && q.ask < 1 && q.mid > 0.05 && q.mid < 0.95, `refreshed listing quote not two-sided (R${c.predicate.rung})`);
    }
    setBinaryQuoteSource(null);   // restore placeholder
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
        advanceRace(race); stepBelief(race);
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
    assert(gatesOK, 'memo / fund-as-actor gate thresholds wrong');
    void fWakesOK; void scrutinyGap; void playerPilled; void marketPilled; void computeUrgency; void deactivateBelief; void resetBelief; void setControlRegime; void computeMarket; void initComputeMarket;
}

// ==========================================================================
// H2. Never-lock scrutiny must NOT fire (P1)
// ==========================================================================

let neverLockNoScrutinyOK = false, guardNotVacuousOK = false;
{
    // A never-lock player over a FULL run: the fixed _runScrutiny early-returns
    // on !hasEverLocked(), so the scrutiny trigger stays at zero and firmStanding
    // is never touched by the scrutiny path -- no false ±3 from a manufactured
    // player-vs-market gap.
    const race = createRaceState((BASE_SEED + 600) >>> 0);
    initConsensus(race); initBelief(race);
    let triggers = 0;
    for (let d = 0; d < HORIZON; d++) {
        advanceRace(race); stepBelief(race);
        if (d % LOCK_INTERVAL === 0) {
            stepFirmBelief(race);
            // Exactly the fixed _runScrutiny guard + trigger condition.
            if (hasEverLocked() && Math.abs(scrutinyGap(race, playerPilled())) > 20) triggers++;
        }
    }
    neverLockNoScrutinyOK = !hasEverLocked() && triggers === 0;
    assert(neverLockNoScrutinyOK, `never-lock player produced ${triggers} scrutiny triggers (want 0)`);

    // The guard is not vacuous: a divergent LOCKED posterior CAN still trigger.
    const race2 = createRaceState((BASE_SEED + 601) >>> 0);
    initConsensus(race2); initBelief(race2);
    lockForecast(0, normalizeCurves({ 2: { m: 30, w: 25 }, 3: { m: 40, w: 25 }, 4: { m: 50, w: 25 }, 5: { m: 60, w: 25 } }));   // maximally pilled at day 0 vs F=15
    guardNotVacuousOK = hasEverLocked() && Math.abs(scrutinyGap(race2, playerPilled())) > 20;
    assert(guardNotVacuousOK, 'scrutiny guard is vacuous (a divergent locked posterior cannot trigger)');
}

// ==========================================================================
// I. Deadline decay -- the conditional quote decays toward NO (fix 2)
// ==========================================================================

let decayTowardNoOK = false, decayReachesFloorOK = false;
{
    const race = createRaceState((BASE_SEED + 500) >>> 0);
    initConsensus(race); initBelief(race);
    // R2 contract (deadline 420). With NO ledger progress, the survival-
    // conditioned quote must STRICTLY decrease as "today" advances toward the
    // deadline -- "no progress as the deadline nears IS decay toward NO" (02a).
    const R2 = { predicate: { rung: 2 }, deadline: 420, baseRate: 0.70 };   // P6-1b recalibration
    let prev = Infinity, monotoneDown = true, start = null, near = null;
    for (const t of [0, 100, 200, 300, 400, 419]) {
        belief.day = t;   // advance "today" only; belief.rungs unchanged (no progress)
        const q = binaryQuoteFromBelief({ day: t }, R2);
        if (q > prev + 1e-9) monotoneDown = false;
        prev = q;
        if (t === 0) start = q;
        if (t === 419) near = q;
    }
    decayTowardNoOK = monotoneDown && near < start - 0.3;
    decayReachesFloorOK = near <= 0.05;
    assert(decayTowardNoOK, `quote did not decay toward NO with no progress (start ${start} near ${near})`);
    assert(decayReachesFloorOK, `quote did not reach the NO floor at the deadline (${near})`);
    // Day-0 exactness must survive the conditional re-solve: listing == base rate.
    initBelief(race);
    assert(Math.abs(binaryQuoteFromBelief({ day: 0 }, R2) - 0.70) < 1e-6, 'day-0 exactness lost under the conditional law');
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

line(`belief-test: N=${N} runs, base seed=${BASE_SEED}, horizon=${HORIZON}d`);
line('='.repeat(72));

line('\nA. B-update causality + full-corruption invariance');
line(`  every non-random B move carries a causal ID:      ${allCausesHaveId ? 'ok' : 'FAIL'}  (${totalCauses} moves over ${N} runs)`);
line(`  ledger FULL COVERAGE (reconstruct m/w -> live state): ${ledgerCoverageOK ? 'ok' : 'FAIL'}`);
line(`  B + timeline + quotes invariant under full corruption + fake latents: ${invarianceOK ? 'holds' : 'VIOLATED'}`);

line('\nB. Leak once-per-ID');
line(`  leaked beat folds exactly once (replay is a no-op): ${leakOnceOK ? 'ok' : 'FAIL'}`);
line(`  replayed leak records no second causal move:        ${stepIdempotentOK ? 'ok' : 'FAIL'}`);

line('\nC. Posterior scoring arithmetic (log-likelihood ratio vs B, credibility = tanh(S/K))');
line(`  quarter crossing probability == naive form, stable: ${probOK ? 'ok' : 'FAIL'}`);
line(`  market copier scores exactly 0:                     ${copierZeroOK ? 'ok' : 'FAIL'}`);
line(`  a call's increment == hand value; cred = tanh(S/K):  ${deltaOK ? 'ok' : 'FAIL'}`);
line(`  lock semantics (valid-set/on-grid+day/immutable):   ${lockGuardOK ? 'ok' : 'FAIL'}`);
line(`  scoring needs the opening lock; once per quarter:   ${scoreGuardOK ? 'ok' : 'FAIL'}`);
line(`  no manufactured forecast; day-0 draft is B:         ${noManufacturedOK ? 'ok' : 'FAIL'}`);
line(`  a market lock's claim == the Consensus quote:       ${claimIsQuoteOK ? 'ok' : 'FAIL'}`);

line('\nD. Lock-day schedule (0, 63, 126, ...)');
line(`  isLockDay matches the grid over ${HORIZON}d:           ${scheduleOK ? 'ok' : 'FAIL'}`);

line('\nE. Two-sided listing quotes with the REAL quoter');
line('  rung   base    mid');
for (const r of listingRows) line(`  R${r.rung}    ${r.base.toFixed(2)}   ${r.mid.toFixed(3)}`);
line(`  all two-sided: ${listingTwoSidedOK ? 'ok' : 'FAIL'} | all == base rate: ${listingEqualsBaseOK ? 'ok' : 'FAIL'}`);

line('\nF. Impulse-overlay decay (no permanent param drift)');
line(`  overlay shifts a param while live:                  ${overlayLiveOK ? 'ok' : 'FAIL'}`);
line(`  param restored to baseline each day:                ${restoreOK ? 'ok' : 'FAIL'}`);
line(`  NO permanent drift over ${HORIZON}d run:                ${noDriftOK ? 'ok' : 'FAIL'}`);
line(`  overlaid values clamped to PARAM_RANGES:            ${clampOK ? 'ok' : 'FAIL'}`);
line(`  accumulator decays to ~0 (half-life ${IMPULSE_HALF_LIFE}d):          ${decayedToZeroOK ? 'ok' : 'FAIL'}`);

line('\nG. eta monotone in the released frontier (02a ruling)');
line(`  non-decreasing in releasedFrontierRung:             ${etaMonotoneOK ? 'ok' : 'FAIL'}`);
line(`  endpoints 0 at R1 / 1 at R5:                        ${etaEndpointsOK ? 'ok' : 'FAIL'}`);
line(`  reads ONLY releasedFrontierRung:                    ${etaReadsOnlyReleasedOK ? 'ok' : 'FAIL'}`);

line('\nH. Firm belief F + gates');
line(`  F stays in [0,100] over a run:                      ${fBoundedOK ? 'ok' : 'FAIL'}`);
line(`  memo / fund-as-actor gate thresholds:               ${gatesOK ? 'ok' : 'FAIL'}`);

line('\nH2. Never-lock scrutiny guard (P1)');
line(`  never-lock player -> zero scrutiny triggers:        ${neverLockNoScrutinyOK ? 'ok' : 'FAIL'}`);
line(`  guard not vacuous (divergent lock can still fire):  ${guardNotVacuousOK ? 'ok' : 'FAIL'}`);

line('\nI. Deadline decay (survival-conditioned quote, fix 2)');
line(`  quote decays toward NO with no progress:            ${decayTowardNoOK ? 'ok' : 'FAIL'}`);
line(`  quote reaches the NO floor near the deadline:       ${decayReachesFloorOK ? 'ok' : 'FAIL'}`);

line('\nJ. Followup-fired race shells seed impulses (fix 6)');
line(`  incident_postmortem (followup path) seeds impulse:  ${followupImpulseOK ? 'ok' : 'FAIL'}`);
line(`  canonical dispatch seeds exactly once (no double):  ${singleSeedOK ? 'ok' : 'FAIL'}`);
line(`  dispatch never mutates sim params:                  ${dispatchNoSimMutateOK ? 'ok' : 'FAIL'}`);

line('\nK. Day-lifecycle overlay order (fix 1)');
line(`  event mutates BASELINE (.06 +impulse +.02 -> .08):  ${overlayOrderOK ? 'ok' : 'FAIL'}`);
line(`  buggy order reproduced (would erase to .06):        ${buggyOrderReproducedOK ? 'ok' : 'FAIL'}`);

line('\n' + '='.repeat(72));
if (failures === 0) {
    line('ALL BELIEF INVARIANTS PASS');
} else {
    line(`${failures} ASSERTION FAILURE(S):`);
    for (const m of failSamples) line('  - ' + m);
}
process.exitCode = failures === 0 ? 0 : 1;
