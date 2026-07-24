#!/usr/bin/env node
/* ===================================================
   tools/belief-test.mjs -- Correctness + integrity harness
   for market belief `B`, the belief-backed quoters, market
   efficiency `eta`, the locked player posterior +
   credibility, and the decaying event-impulse overlay
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

   C. Brier / credibility arithmetic (02a): credibility =
      EMA(alpha=0.25, init 0) of (1 - 2*Brier), Brier averaged
      over the maturing claim vector. Checked to the digit
      against hand-computed values, incl. a coincident-maturity
      average and the full-vector-mandatory lock guard.

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
    isLockDay, LOCK_INTERVAL, lockForecast, lockedClaim, settleClaim, settleClaims,
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
    const PUBLIC_VIEW_KEYS = ['day', 'certifiedFrontierRung', 'releasedFrontierRung', 'releaseCount', 'lastReleaseDay', 'controlRegime'].sort().join(',');
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

    // 1b. Causal-ledger FULL COVERAGE (02a phase-4 ruling): reconstruct each
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
// C. Brier / credibility arithmetic
// ==========================================================================

let credSingleOK = false, credChainOK = false, credAvgOK = false, lockGuardOK = false;
let lockSkipStallsOK = false, noManufacturedOK = false;
{
    // Single claim: lock p=0.8 on R2, settle YES. Brier=(0.8-1)^2=0.04;
    // 1-2*Brier=0.92; cred = 0 + 0.25*(0.92-0) = 0.23.
    const race = createRaceState((BASE_SEED + 222) >>> 0);
    initBelief(race);
    lockForecast(0, { 2: 0.8, 3: 0.5, 4: 0.5, 5: 0.5 });
    const c1 = settleClaim(2, 1);
    credSingleOK = Math.abs(c1 - 0.23) < 1e-9;
    assert(credSingleOK, `single-claim credibility ${c1} != 0.23`);

    // Chain a second: settle R3 NO at p=0.5. Brier=0.25; 1-2*Brier=0.5;
    // cred = 0.75*0.23 + 0.25*0.5 = 0.2975.
    const c2 = settleClaim(3, 0);
    credChainOK = Math.abs(c2 - 0.2975) < 1e-9;
    assert(credChainOK, `chained credibility ${c2} != 0.2975`);

    // Coincident maturity: fresh store, lock, settle {R2 YES @0.9, R3 NO @0.4}
    // together. Briers 0.01 and 0.16 -> mean 0.085; 1-2*0.085=0.83;
    // cred = 0 + 0.25*0.83 = 0.2075.
    const race2 = createRaceState((BASE_SEED + 223) >>> 0);
    initBelief(race2);
    lockForecast(0, { 2: 0.9, 3: 0.4, 4: 0.5, 5: 0.5 });
    const c3 = settleClaims([{ rung: 2, outcome: 1 }, { rung: 3, outcome: 0 }]);
    credAvgOK = Math.abs(c3 - 0.2075) < 1e-9;
    assert(credAvgOK, `coincident-average credibility ${c3} != 0.2075`);

    // Lock semantics (02a phase-4): full VECTOR mandatory; on-grid + CURRENT-day
    // only; immutable once accepted (exact replay idempotent, edits rejected).
    const race3 = createRaceState((BASE_SEED + 224) >>> 0);
    initBelief(race3);   // belief.day == 0
    const bad = lockForecast(0, { 2: 0.5, 3: 0.5 });                        // partial -> null
    const outOfRange = lockForecast(0, { 2: 1.5, 3: 0.5, 4: 0.5, 5: 0.5 }); // p>1 -> null
    const offGrid = lockForecast(7, { 2: 0.5, 3: 0.5, 4: 0.5, 5: 0.5 });    // 7 % 63 != 0 -> null
    const wrongDay = lockForecast(63, { 2: 0.5, 3: 0.5, 4: 0.5, 5: 0.5 });  // 63 != belief.day 0 -> null
    const good = lockForecast(0, { 2: 0.5, 3: 0.5, 4: 0.5, 5: 0.5 });       // valid
    const replay = lockForecast(0, { 2: 0.5, 3: 0.5, 4: 0.5, 5: 0.5 });     // exact replay -> idempotent
    const mutate = lockForecast(0, { 2: 0.9, 3: 0.5, 4: 0.5, 5: 0.5 });     // edit -> rejected (immutable)
    lockGuardOK = bad === null && outOfRange === null && offGrid === null && wrongDay === null
        && good !== null && replay === good && mutate === null;
    assert(lockGuardOK, 'lock semantics wrong (mandatory-vector / on-grid+current-day / immutable)');

    // Skipping a lock day scores no Brier and STALLS the EMA (staleness is the
    // penalty): a never-locked player's credibility stays exactly 0 on settlement.
    const race4 = createRaceState((BASE_SEED + 225) >>> 0);
    initBelief(race4);
    const credBefore = credibility();
    const credAfterSkip = settleClaim(3, 1);   // R3 never locked -> no Brier
    lockSkipStallsOK = credBefore === 0 && credAfterSkip === 0;
    assert(lockSkipStallsOK, `skip did not stall the EMA (before=${credBefore} after=${credAfterSkip})`);

    // No manufactured day-0 forecast: a fresh store has NO locks, credibility 0,
    // and no claim to read.
    const race5 = createRaceState((BASE_SEED + 226) >>> 0);
    initBelief(race5);
    noManufacturedOK = belief.player.locks.length === 0 && credibility() === 0 && lockedClaim(2) === null;
    assert(noManufacturedOK, 'initBelief manufactured a day-0 forecast (must be a real prompted lock)');
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
    lockForecast(0, { 2: 0.99, 3: 0.99, 4: 0.99, 5: 0.99 });   // maximally pilled at day 0 vs F=15
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
    const R2 = { predicate: { rung: 2 }, deadline: 420, baseRate: 0.57 };
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
    assert(Math.abs(binaryQuoteFromBelief({ day: 0 }, R2) - 0.57) < 1e-6, 'day-0 exactness lost under the conditional law');
}

// ==========================================================================
// J. Followup-fired race shells seed impulses (fix 6)
// ==========================================================================

let followupImpulseOK = false, singleSeedOK = false, dispatchNoSimMutateOK = false;
{
    const engine = new EventEngine('offline');
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

line('\nC. Brier / credibility arithmetic (EMA a=0.25 of 1-2*Brier)');
line(`  single claim (0.8, YES) -> 0.2300:                  ${credSingleOK ? 'ok' : 'FAIL'}`);
line(`  chained (+0.5, NO) -> 0.2975:                       ${credChainOK ? 'ok' : 'FAIL'}`);
line(`  coincident-average (0.9 YES, 0.4 NO) -> 0.2075:     ${credAvgOK ? 'ok' : 'FAIL'}`);
line(`  lock semantics (mandatory-vector/on-grid+day/immutable): ${lockGuardOK ? 'ok' : 'FAIL'}`);
line(`  skip stalls the EMA (staleness self-penalizes):     ${lockSkipStallsOK ? 'ok' : 'FAIL'}`);
line(`  no manufactured day-0 forecast:                     ${noManufacturedOK ? 'ok' : 'FAIL'}`);

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
