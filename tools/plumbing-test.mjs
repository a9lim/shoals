#!/usr/bin/env node
/* ===================================================
   tools/plumbing-test.mjs -- Headless gate for the
   overhaul phase-5a MACHINERY (content-sweep plumbing):

   A. Event base-rate scaling bounds (04 engine note 1):
      Act-I exactness + monotone bounded acceleration.
   B. Strait blockade incidence calibration (02a Strait
      block): ~3% baseline / 12-15% hot -- harness-asserted.
   C. controlRegime ratchet reachability + monotonicity:
      every regime reachable, mobilized+ a minority,
      nationalization/classification rare, never backward.
   D. No-wedge full run: a forced regime ratchet settles the
      Consensus + compute book without wedging the portfolio.
   E. Consensus dispute adjudication (09 succession): ruling
      YES/NO, deadline auto-fallback, regime fallback, the
      mobilized adjudicator, and non-tradeability.

   ...and the EVIDENCE MACHINERY round (2026-07-24):

   G. exportControlStage -> Tianxia compute dampener: stage-0
      bit-identity (the calibration invariant), exact drift
      monotonicity in the stage, compute-leg-only (k_f
      untouched), and the directional cut to Tianxia
      capability + family-4 incidence at a forced stage 3.
   H. Leak coupling (`_tipIncidentId`): unconditional detection
      forcing on a 4d clock, the fold-once-under-`det_${id}`
      belief identity (leaked == unleaked in total mass), and
      the frozen/inactive gate.
   I. Theft disclosure track: eligibility 0.75, mean lag 40d,
      public attribution 0.55/0.30/0.15, complete ledger rows,
      and on/off trajectory bit-identity.

   All numeric bands are DESIGN bands; the tuning is RATIFIED in
   02a's "Content plumbing (phase-5a ratifications, 2026-07-23)"
   and "Evidence machinery (pre-P7 ratifications, 2026-07-24)"
   blocks. Exits 1 on any MISS.

   Usage:  node tools/plumbing-test.mjs [N]
   =================================================== */

import { createHash } from 'node:crypto';
import {
    createRaceState, advanceRace, stepControlRegime, setControlRegime,
    heatValue, REGIME_RANK, CONTROL_REGIMES, RETUNE,
} from '../src/race/race-state.js';
import { CONTROL_TUNING } from '../src/race/control-regime.js';
import { BLOCKADE_HEAT } from '../src/race/strait.js';
import { deterministicDrift, EXPORT_CONTROL_GROWTH, normalizeExportStage } from '../src/race/capability.js';
import { forceLeakDetection, LEAK_FORCED_MEAN_LAG } from '../src/race/incidents.js';
import { DISCLOSE_PROB, DISCLOSE_MEAN_LAG, PUBLIC_ATTRIBUTIONS } from '../src/race/theft-disclosure.js';
import { stepTreaty } from '../src/race/treaty-track.js';
import { checkResolution } from '../src/race/resolution.js';
import { resetLedger, deactivateLedger, freezeLedger, raceChannelsLive } from '../src/race/ledger.js';
import {
    consensus, initConsensus, deactivateConsensus, refreshBinaryQuotes,
    computeBinarySettlements, openDispute, ruleDispute, disputeAdjudicator,
    getDispute, getBinaryQuote, contractByKey,
} from '../src/race/consensus.js';
import {
    computeMarket, initComputeMarket, deactivateComputeMarket,
    computeFutureSettlements, refreshComputeQuotes, stepNationalizationRef,
} from '../src/race/compute-market.js';
import {
    portfolio, resetPortfolio, executeBinaryTrade, executeMarketOrder,
    settleComputeFutures, portfolioValue, applyBinarySettlementRows,
} from '../src/portfolio.js';
import {
    belief, initBelief, deactivateBelief, lockForecast, credibility,
    stepBelief, foldPlayerLeak, beliefCauses, beliefProcessed,
} from '../src/race/belief.js';
import { market, syncMarket } from '../src/market.js';
import { eventBaseRateScale, BASE_RATE_MAX_MULT, EventEngine } from '../src/events.js';
import { runRaceBridge, resetRaceBridge } from '../src/events/race-bridge.js';
import { getEventById } from '../src/events/index.js';
import { NON_FED_POISSON_RATE } from '../src/config.js';
import { createWorldState, applyStructuredEffects } from '../src/world-state.js';

const argv = process.argv.slice(2);
let N = 2000;
for (const a of argv) if (/^\d+$/.test(a)) N = parseInt(a, 10);
const HORIZON = 1008;
const BASE_SEED = 1;

let failures = 0;
const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok, detail });
    if (!ok) failures++;
}
const pct = (x) => (100 * x).toFixed(1) + '%';
const line = (s = '') => console.log(s);

// ---- Fixtures ------------------------------------------------------------
const calmGeo = { taiwanBlockade: false, straitClosed: false, chinaRelations: 0, tradeWarStage: 0 };
const FIXED_MARKET = { S: 100, v: 0.04, r: 0.03, day: 0, q: 0, kappa: 2, theta: 0.04, xi: 0.4, rho: -0.5, a: 0.1, b: 0.03, sigmaR: 0.01, borrowSpread: 0 };
function syncFixed(day) { syncMarket({ ...FIXED_MARKET, day }); market.day = day; }

// =====================================================================
// A. Event base-rate scaling bounds (04 engine note 1)
// =====================================================================
{
    // Act-I exactness: rung 1 scale is EXACTLY 1 (no cadence regression).
    check('base-rate scale at R1 == 1 (Act-I match)', eventBaseRateScale(1) === 1,
        `got ${eventBaseRateScale(1)}`);
    // Monotone non-decreasing over the released-rung driver.
    let mono = true, prev = -Infinity;
    for (let r = 1; r <= 5; r++) { const s = eventBaseRateScale(r); if (s < prev) mono = false; prev = s; }
    check('base-rate scale monotone non-decreasing in R', mono);
    // Ceiling exactly at R5.
    check('base-rate scale at R5 == BASE_RATE_MAX_MULT', eventBaseRateScale(5) === BASE_RATE_MAX_MULT,
        `got ${eventBaseRateScale(5)} want ${BASE_RATE_MAX_MULT}`);
    // Bounded: the late-game accept probability never certainty-fires (capped 0.95).
    const lateRate = Math.min(0.95, NON_FED_POISSON_RATE * eventBaseRateScale(5));
    check('late-game accept rate bounded < 0.95 cap', lateRate <= 0.95 && lateRate > NON_FED_POISSON_RATE,
        `late ${lateRate.toFixed(4)} vs base ${NON_FED_POISSON_RATE.toFixed(4)}`);
    // Cadence MC: replicate the maybeFire step-3 accept+cooldown loop and confirm
    // early (scale 1) matches the constant-rate cadence within tolerance and late
    // (scale MAX) compresses it. Deterministic-ish over many days.
    function cadence(scale, days = 400000) {
        let cd = 0, fires = 0;
        // fixed cooldown expectation = midpoint of [8,15] = 11.5 (config), scaled.
        for (let d = 0; d < days; d++) {
            if (cd > 0) { cd--; continue; }
            if (Math.random() < Math.min(0.95, NON_FED_POISSON_RATE * scale)) {
                fires++;
                cd = Math.max(1, Math.round((8 + Math.floor(Math.random() * 8)) / scale));
            }
        }
        return days / fires;   // mean inter-arrival (days per fire)
    }
    const early = cadence(1), late = cadence(eventBaseRateScale(5));
    // The current constant-rate cadence is ~1/41.5 (config comment). Tolerance +-25%.
    check('early cadence ~ current constant-rate (~41.5d)', early >= 31 && early <= 52,
        `${early.toFixed(1)}d`);
    check('late cadence compresses vs early', late < early * 0.7,
        `late ${late.toFixed(1)}d vs early ${early.toFixed(1)}d`);
}

// =====================================================================
// B (baseline strait) + C (regime reachability) -- one tension=0 pass
// =====================================================================
const regimeTally = { private: 0, supervised: 0, mobilized: 0, nationalized: 0, classified: 0 };
let reachMob = 0, monoViolations = 0;
let baselineBlockadeRuns = 0;
let grayAtTension0 = 0;
let reversibilityOK = true, gateAndHeatOK = true;
for (let i = 0; i < N; i++) {
    const race = createRaceState((BASE_SEED + i) >>> 0);
    let prevRank = 0, hadBlockade = false, sawActiveHeat = false;
    for (let d = 0; d < HORIZON; d++) {
        advanceRace(race, { straitTension: 0 });
        stepControlRegime(race);
        const rank = REGIME_RANK[race.controlRegime];
        if (rank < prevRank) monoViolations++;
        prevRank = rank;
        const s = race.lastTransitions.strait;
        grayAtTension0 += s.grayZone.length;
        if (s.blockadeStart) {
            hadBlockade = true;
            // A blockade sets the flag, the reversible heat overlay, and the mobilization gate.
            if (!race.taiwanBlockade || Math.abs(race.heat.strait - BLOCKADE_HEAT) > 1e-9 || !race.mobilizationGateOpen) gateAndHeatOK = false;
        }
        if (race.taiwanBlockade && race.heat.strait > 0) sawActiveHeat = true;
        if (s.blockadeEnd) {
            // Reversibility: after the end, the flag + heat overlay lift.
            if (race.taiwanBlockade || race.heat.strait !== 0) reversibilityOK = false;
        }
    }
    if (hadBlockade) baselineBlockadeRuns++;
    regimeTally[race.controlRegime]++;
    if (REGIME_RANK[race.controlRegime] >= 2) reachMob++;
}
const baselineIncidence = baselineBlockadeRuns / N;
const reachSup = (N - regimeTally.private) / N;
const reachMobFrac = reachMob / N;

// B baseline: ~3% (02a). Design band 1.5-4.5%.
check('strait blockade baseline incidence ~3% (tension 0)',
    baselineIncidence >= 0.015 && baselineIncidence <= 0.045, pct(baselineIncidence));
check('gray-zone silent at tension 0 (tension-gated)', grayAtTension0 === 0, `${grayAtTension0} fired`);
check('blockade sets taiwanBlockade + heat overlay + mobilization gate', gateAndHeatOK);
check('blockade heat overlay reverses on lift', reversibilityOK);

// C reachability + monotonicity.
check('controlRegime monotone (never backward)', monoViolations === 0, `${monoViolations} viol`);
check('every regime reachable: private', regimeTally.private > 0, `${regimeTally.private}`);
check('every regime reachable: supervised', regimeTally.supervised > 0, `${regimeTally.supervised}`);
check('every regime reachable: mobilized', regimeTally.mobilized > 0, `${regimeTally.mobilized}`);
check('every regime reachable: nationalized', regimeTally.nationalized > 0, `${regimeTally.nationalized}`);
check('every regime reachable: classified', regimeTally.classified > 0, `${regimeTally.classified}`);
check('supervised reached (majority, not universal)', reachSup >= 0.60 && reachSup <= 0.97, pct(reachSup));
check('mobilized+ a STRICT minority (knife-edge #4)', reachMobFrac > 0.03 && reachMobFrac < 0.45, pct(reachMobFrac));
const natClsFrac = (regimeTally.nationalized + regimeTally.classified) / N;
check('nationalization/classification RARE (< 10%)', natClsFrac < 0.10, pct(natClsFrac));

// Forced-exo deterministic reachability (belt-and-suspenders: the terminal peers
// are reachable via lobbying pushes regardless of the endogenous sample).
{
    const rN = createRaceState(12345);
    advanceRace(rN); stepControlRegime(rN, { mobilizationPush: true });
    advanceRace(rN); stepControlRegime(rN, { nationalizationPush: true });
    check('forced exo reaches nationalized', rN.controlRegime === 'nationalized', rN.controlRegime);
    const rC = createRaceState(54321);
    advanceRace(rC); stepControlRegime(rC, { mobilizationPush: true });
    advanceRace(rC); stepControlRegime(rC, { classificationPush: true });
    check('forced exo reaches classified', rC.controlRegime === 'classified', rC.controlRegime);
}

// =====================================================================
// B (hot strait) -- tension=1 pass
// =====================================================================
let hotBlockadeRuns = 0, grayAtTension1 = 0;
const HOT_N = Math.min(N, 2000);
for (let i = 0; i < HOT_N; i++) {
    const race = createRaceState((BASE_SEED + i) >>> 0);
    let had = false;
    for (let d = 0; d < HORIZON; d++) {
        advanceRace(race, { straitTension: 1 });
        if (race.lastTransitions.strait.blockadeStart) had = true;
        grayAtTension1 += race.lastTransitions.strait.grayZone.length;
    }
    if (had) hotBlockadeRuns++;
}
const hotIncidence = hotBlockadeRuns / HOT_N;
check('strait blockade hot incidence 12-15% (tension 1)',
    hotIncidence >= 0.11 && hotIncidence <= 0.16, pct(hotIncidence));
check('gray-zone fires at tension 1', grayAtTension1 > 0, `${grayAtTension1} total`);

// =====================================================================
// D. No-wedge full run: forced ratchet settles the book, no portfolio wedge
// =====================================================================
{
    const race = createRaceState(777);
    initConsensus(race);
    initComputeMarket(race, calmGeo);
    resetPortfolio(10000);
    syncFixed(race.day);
    // Take a spread of race-instrument positions.
    const binKey = consensus.contracts[0].key;               // R2 cert binary
    const binLong = executeBinaryTrade(binKey, 'long', 3);
    const binShort = executeBinaryTrade(consensus.contracts[1].key, 'short', 2);
    const cKey = computeMarket.contracts[0] ? computeMarket.contracts[0].key : null;
    const cPos = cKey != null ? executeMarketOrder(null, 'computefuture', 'long', 4, market.S, market.sigma, market.r, race.day, cKey, cKey, undefined, 0) : null;
    let crashed = false;
    try {
        for (let d = 0; d < HORIZON; d++) {
            advanceRace(race, { straitTension: 0 });
            // Force the ratchet all the way to nationalized (mobilize, then nationalize).
            stepControlRegime(race, { mobilizationPush: true, nationalizationPush: true });
            syncFixed(race.day);
            applyBinarySettlementRows(computeBinarySettlements(race));
            applyBinarySettlementRows(consensus.pendingRows);
            consensus.pendingRows = consensus.pendingRows.filter(r => !r._consumed);
            refreshBinaryQuotes(race);
            stepNationalizationRef(race, market.S);
            settleComputeFutures(computeFutureSettlements(race, calmGeo), race);
            refreshComputeQuotes(race, calmGeo);
        }
    } catch (e) { crashed = true; results.push({ name: 'no-wedge run threw: ' + e.message, ok: false }); failures++; }
    const noBinary = !portfolio.positions.some(p => p.type === 'binary');
    const noCompute = !portfolio.positions.some(p => p.type === 'computefuture');
    const equity = portfolioValue(market.S, Math.sqrt(market.v), market.r, market.day, market.q);
    check('no-wedge: ran full horizon without crashing', !crashed);
    check('no-wedge: reached nationalized', race.controlRegime === 'nationalized', race.controlRegime);
    check('no-wedge: all binaries settled (book cleared)', noBinary);
    check('no-wedge: all compute futures settled (book cleared)', noCompute);
    check('no-wedge: portfolio equity finite', Number.isFinite(equity), `${equity}`);
    check('no-wedge: not left restricted', !portfolio.restricted);
    void binLong; void binShort; void cPos;
    deactivateConsensus();
    deactivateComputeMarket();
}

// =====================================================================
// E. Consensus dispute adjudication (09 succession) + finality (F2/F3)
// =====================================================================
{
    // Adjudicator-succession names.
    check('adjudicator private -> exchange panel', disputeAdjudicator('private') === 'exchange-cert-panel');
    check('adjudicator supervised -> exchange panel', disputeAdjudicator('supervised') === 'exchange-cert-panel');
    check('adjudicator mobilized -> federal evals office', disputeAdjudicator('mobilized') === 'federal-evals-office');
    check('adjudicator nationalized -> fallback', disputeAdjudicator('nationalized') === 'fallback');
    check('adjudicator classified -> fallback', disputeAdjudicator('classified') === 'fallback');

    // Path A: timely ruling YES -> SYNCHRONOUS settlement at notional (F2b),
    // routed through the real shared helper (which marks the row consumed).
    {
        const race = createRaceState(101);
        initConsensus(race);
        const c = consensus.contracts.find(x => !x.terminal);
        openDispute(c.key, 10, 'private'); refreshBinaryQuotes(race);
        const nonTradeable = getBinaryQuote(c.key).disputed === true;
        const row = ruleDispute(c.key, 'YES', 12, 'private');
        applyBinarySettlementRows([row]);
        consensus.pendingRows = consensus.pendingRows.filter(r => !r._consumed);
        check('dispute ruled YES -> row YES at notional, settled synchronously + consumed',
            !!row && row.outcome === 'YES' && row.payoutPerUnit === c.notional && row._consumed === true
            && !getDispute(c.key) && consensus.settled[c.key] && consensus.settled[c.key].outcome === 'YES');
        check('disputed contract is non-tradeable', nonTradeable && executeBinaryTrade(c.key, 'long', 1) === null);
        deactivateConsensus();
    }
    // Path B: timely ruling NO -> synchronous settlement at 0, via the shared helper.
    {
        const race = createRaceState(102);
        initConsensus(race);
        const c = consensus.contracts.find(x => !x.terminal);
        openDispute(c.key, 10, 'private');
        const row = ruleDispute(c.key, 'NO', 11, 'private');
        applyBinarySettlementRows([row]);
        consensus.pendingRows = consensus.pendingRows.filter(r => !r._consumed);
        check('dispute ruled NO -> settled NO at 0', !!row && row.outcome === 'NO' && row.payoutPerUnit === 0
            && row._consumed === true && consensus.settled[c.key].outcome === 'NO');
        deactivateConsensus();
    }
    // Path C: disputeDeadline expires with no ruling -> auto-fallback.
    {
        const race = createRaceState(103);
        initConsensus(race);
        const c = consensus.contracts.find(x => !x.terminal);
        openDispute(c.key, 10, 'private');
        race.day = c.disputeDeadline + 1;   // past the dispute deadline, no ruling
        const s = computeBinarySettlements(race).find(x => x.key === c.key);
        check('dispute deadline expiry -> FALLBACK', !!s && s.outcome === 'FALLBACK'
            && Math.abs(s.payoutPerUnit - c.fallbackValue * c.notional) < 1e-9 && s.dispute === 'expired');
        deactivateConsensus();
    }

    // -- F2a probe: a post-deadline ruling is VOID; the deadline fallback pays. --
    {
        const race = createRaceState(201);
        initConsensus(race);
        const c = consensus.contracts.find(x => !x.terminal);
        openDispute(c.key, 10, 'private');
        const late = ruleDispute(c.key, 'YES', c.disputeDeadline + 1, 'private');
        check('F2a: post-deadline ruling rejected', late === null && !consensus.settled[c.key]);
        race.day = c.disputeDeadline + 2;
        const s = computeBinarySettlements(race).find(x => x.key === c.key);
        check('F2a: fallback pays after a voided late ruling',
            !!s && s.outcome === 'FALLBACK' && Math.abs(s.payoutPerUnit - c.fallbackValue * c.notional) < 1e-9);
        deactivateConsensus();
    }

    // -- R1 probe: exact-deadline ruling survives in the live call order (the daily --
    //    settlement pass runs BEFORE queued popup rulings, so the deadline-day pass  --
    //    must NOT pre-empt a same-day ruling; fallback is strictly post-deadline).   --
    {
        const race = createRaceState(206);
        initConsensus(race);
        const c = consensus.contracts.find(x => !x.terminal);
        openDispute(c.key, 10, 'private');
        race.day = c.disputeDeadline;                                   // the deadline day itself
        const passBefore = computeBinarySettlements(race).find(x => x.key === c.key);   // pass FIRST
        const row = ruleDispute(c.key, 'YES', c.disputeDeadline, 'private');            // ruling AFTER, still allowed
        applyBinarySettlementRows([row]);
        consensus.pendingRows = consensus.pendingRows.filter(r => !r._consumed);
        race.day = c.disputeDeadline + 1;
        const passAfter = computeBinarySettlements(race).find(x => x.key === c.key);    // next day: no re-settle
        check('R1: deadline-day pass does not pre-empt the ruling',
            passBefore === undefined && !!row && row.outcome === 'YES'
            && consensus.settled[c.key].outcome === 'YES' && passAfter === undefined);
        deactivateConsensus();
    }

    // -- R2 probe: a synchronous ruling SCORES credibility (no milestone settles --
    //    unscored). Lock 0.9 on R2, rule YES, apply via the shared helper.         --
    {
        const race = createRaceState(301);
        initConsensus(race); initBelief(race);
        const c = consensus.contracts.find(x => x.predicate.rung === 2);
        lockForecast(0, { 2: 0.9, 3: 0.5, 4: 0.3, 5: 0.2 });
        const before = credibility();
        openDispute(c.key, 10, 'private');
        const row = ruleDispute(c.key, 'YES', 12, 'private');
        applyBinarySettlementRows([row]);                              // cash + settleClaims
        consensus.pendingRows = consensus.pendingRows.filter(r => !r._consumed);
        const after = credibility();
        // Brier = (0.9-1)^2 = 0.01; cred EMA (a=0.25, init 0) -> 0.25*(1-2*0.01) = 0.245.
        check('R2: ruling scores credibility (shared helper, no unscored settle)',
            !!row && before === 0 && Math.abs(after - 0.245) < 1e-6, `cred ${before}->${after.toFixed(4)}`);
        deactivateConsensus(); deactivateBelief();
    }

    // -- R3a probe: a DROPPED ruling return is drained by the daily pass, paying --
    //    exactly once (the durable outbox is the safety net, R3).                  --
    {
        const race = createRaceState(303);
        initConsensus(race); resetPortfolio(10000); syncFixed(race.day);
        const c = consensus.contracts.find(x => !x.terminal);
        executeBinaryTrade(c.key, 'long', 2);                          // a real position to pay out
        const cashAfterBuy = portfolio.cash;
        openDispute(c.key, 10, 'private');
        const row = ruleDispute(c.key, 'YES', 12, 'private');          // stashed in the outbox
        // DROP the return entirely -- simulate the daily-pass drain instead.
        applyBinarySettlementRows(consensus.pendingRows);
        consensus.pendingRows = consensus.pendingRows.filter(r => !r._consumed);
        const noPos = !portfolio.positions.some(p => p.type === 'binary');
        const paidOnce = portfolio.cash > cashAfterBuy;
        check('R3a: dropped ruling row drained by daily pass (paid once, position cleared)',
            !!row && noPos && paidOnce);
        const cashBeforeRedrain = portfolio.cash;
        applyBinarySettlementRows(consensus.pendingRows);              // re-drain: nothing left / consumed
        check('R3a: re-drain does not double-pay', portfolio.cash === cashBeforeRedrain);
        deactivateConsensus();
    }
    // -- R3b probe: double-application of the SAME row is blocked (consumed flag). --
    {
        const race = createRaceState(304);
        initConsensus(race); resetPortfolio(10000); syncFixed(race.day);
        const c = consensus.contracts.find(x => !x.terminal);
        executeBinaryTrade(c.key, 'long', 2);
        openDispute(c.key, 10, 'private');
        const row = ruleDispute(c.key, 'YES', 12, 'private');
        applyBinarySettlementRows([row]);                              // apply once
        const cashAfter1 = portfolio.cash;
        applyBinarySettlementRows([row]);                              // apply again -> no-op
        const cashAfter2 = portfolio.cash;
        applyBinarySettlementRows(consensus.pendingRows);              // outbox drain -> also skips consumed
        check('R3b: double-application blocked (no double-pay)',
            !!row && cashAfter1 === cashAfter2 && portfolio.cash === cashAfter1);
        deactivateConsensus();
    }

    // -- F2b probe: timely ruling, THEN nationalization next day -- ruling pays. --
    {
        const race = createRaceState(202);
        initConsensus(race);
        const c = consensus.contracts.find(x => !x.terminal);
        openDispute(c.key, 10, 'private');
        const row = ruleDispute(c.key, 'YES', 12, 'private');   // timely, settles synchronously YES
        setControlRegime(race, 'mobilized');
        setControlRegime(race, 'nationalized');                 // fallback regime, day after
        race.day = 13;
        const later = computeBinarySettlements(race).find(x => x.key === c.key);   // must NOT re-settle
        check('F2b: timely ruling senior to later regime fallback',
            !!row && consensus.settled[c.key].outcome === 'YES' && later === undefined);
        deactivateConsensus();
    }

    // -- F3 probe: adjudicator succession reaches an OPEN dispute (opened private, --
    //    ruled mobilized -> reason names the CURRENT federal-evals-office).       --
    {
        const race = createRaceState(203);
        initConsensus(race);
        const c = consensus.contracts.find(x => !x.terminal);
        openDispute(c.key, 10, 'private');
        setControlRegime(race, 'mobilized');
        const row = ruleDispute(c.key, 'YES', 12, 'mobilized');
        const st = consensus.settled[c.key];
        check('F3: succession reaches open dispute (current adjudicator)',
            !!row && row.adjudicator === 'federal-evals-office'
            && st.reason === 'dispute-ruled:federal-evals-office' && st.openedUnder === 'private');
        deactivateConsensus();
    }
    // F3b: under a fallback regime the succession has ended -- a ruling is rejected.
    {
        const race = createRaceState(204);
        initConsensus(race);
        const c = consensus.contracts.find(x => !x.terminal);
        openDispute(c.key, 10, 'private');
        const rej = ruleDispute(c.key, 'YES', 12, 'nationalized');
        check('F3b: ruling rejected under fallback regime (fallback governs)', rej === null && !!getDispute(c.key));
        deactivateConsensus();
    }
    // F: a fallback regime still settles a STILL-DISPUTED (unruled) contract at fallback.
    {
        const race = createRaceState(205);
        initConsensus(race);
        const c = consensus.contracts.find(x => !x.terminal);
        openDispute(c.key, 10, 'private');
        setControlRegime(race, 'mobilized');
        setControlRegime(race, 'nationalized');
        race.day = 20;
        const s = computeBinarySettlements(race).find(x => x.key === c.key);
        check('fallback regime settles unruled dispute at FALLBACK', !!s && s.outcome === 'FALLBACK' && !getDispute(c.key));
        deactivateConsensus();
    }
}

// =====================================================================
// F4. Three-mirror write authority: structured effects cannot forge the
// race-owned taiwanBlockade / controlRegime / reportingRegime mirrors.
// =====================================================================
{
    const w = createWorldState();
    applyStructuredEffects(w, [
        { path: 'geopolitical.taiwanBlockade', op: 'set', value: true },
        { path: 'ai.controlRegime', op: 'set', value: 'nationalized' },
        { path: 'ai.reportingRegime', op: 'set', value: true },
    ]);
    check('F4: structured effect cannot write taiwanBlockade', w.geopolitical.taiwanBlockade === false);
    check('F4: structured effect cannot write ai.controlRegime', w.ai.controlRegime === 'private');
    check('F4: structured effect cannot write ai.reportingRegime', w.ai.reportingRegime === false);
    // Sanity: a legitimately-whitelisted field IS writable (Hormuz's straitClosed).
    applyStructuredEffects(w, [{ path: 'geopolitical.straitClosed', op: 'set', value: true }]);
    check('F4: whitelisted straitClosed still writable', w.geopolitical.straitClosed === true);
}

// =====================================================================
// F5. stepControlRegime same-day replay is a no-op (no double-walk).
// =====================================================================
{
    // A single S4-detected + successful-theft ledger at high heat. One consume:
    // private -> mobilized (s4Seen). A guarded replay is a no-op; an UN-guarded
    // replay would walk mobilized -> nationalized (the defect F5 fixes).
    function craftTick(race, day) {
        race.day = day;
        race.theftCount = 1;
        race.heat = { transient: 0.6, floor: 0, strait: 0 };   // heatNow ~0.6 >= natHeat
        race.lastTransitions = {
            spawned: [], releases: [], thefts: [{ success: true }], crossings: [], certifications: [],
            incidents: { occurred: [], detected: [{ id: 's4', severity: 4, cls: 'accident' }] },
            evidence: { occurred: [], published: [] },
            strait: { grayZone: [], blockadeStart: null, blockadeEnd: null },
            regimeChange: null,
        };
    }
    const race = createRaceState(888);
    craftTick(race, 5);
    stepControlRegime(race);               // consume day 5 -> mobilized
    const after1 = race.controlRegime;
    stepControlRegime(race);               // same-day replay -> guarded no-op
    check('F5: same-day replay is a no-op', after1 === 'mobilized' && race.controlRegime === 'mobilized');
    // Control: force an un-guarded re-consume of the same tick -> the double-walk appears.
    race.controlSignals.lastConsumedDay = -1;
    stepControlRegime(race);
    check('F5: un-guarded re-consume WOULD double-walk (guard is load-bearing)', race.controlRegime === 'nationalized');
}

// =====================================================================
// F6. setControlRegime rejects nationalized <-> classified (both directions).
// =====================================================================
{
    const r1 = createRaceState(1); setControlRegime(r1, 'nationalized');
    const okN2C = setControlRegime(r1, 'classified') === false && r1.controlRegime === 'nationalized';
    const r2 = createRaceState(2); setControlRegime(r2, 'classified');
    const okC2N = setControlRegime(r2, 'nationalized') === false && r2.controlRegime === 'classified';
    check('F6: nationalized -/-> classified (rejected)', okN2C);
    check('F6: classified -/-> nationalized (rejected)', okC2N);
    // Same-regime re-apply stays allowed (idempotent); forward still works.
    const r3 = createRaceState(3);
    const fwd = setControlRegime(r3, 'nationalized') === true && r3.controlRegime === 'nationalized';
    check('F6: forward escalation still honored', fwd);
}

// =====================================================================
// EVIDENCE MACHINERY ROUND (2026-07-24)
// =====================================================================

/** SHA-256 over the full daily PHYSICAL trajectory (C both tracks / S / heat /
 *  theftCount / rung + certification stamps) -- the P6-2 pattern. This is the
 *  quantity every "bit-identical" claim in this round is about: the race's
 *  physical state, not the narrative/belief ledgers layered on top. */
function trajectoryHash(seed, opts, mutate) {
    const race = createRaceState(seed >>> 0);
    if (mutate) mutate(race);
    const h = createHash('sha256');
    for (let d = 0; d < HORIZON; d++) {
        advanceRace(race, opts);
        const c = race.capability;
        h.update([
            c.labs.halcyon.C_internal, c.labs.tianxia.C_internal,
            c.labs.polaris.active ? c.labs.polaris.C_internal : 'x', c.open.C,
            c.labs.halcyon.C_released, c.labs.tianxia.C_released,
            race.safety.halcyon, race.safety.tianxia,
            race.safety.polaris === null ? 'x' : race.safety.polaris,
            heatValue(race.heat), race.heat.floor, race.heat.transient, race.theftCount,
            JSON.stringify(c.labs.halcyon.rungInternal), JSON.stringify(c.labs.tianxia.rungInternal),
            JSON.stringify(c.labs.halcyon.rungCertified), JSON.stringify(c.labs.tianxia.rungCertified),
        ].join('|') + '\n');
    }
    return h.digest('hex');
}

// =====================================================================
// G. exportControlStage -> Tianxia compute dampener
// =====================================================================
const IDENT_SEEDS = Math.max(100, Math.min(N, 120));
let stageIdentOK = true, discIdentOK = true;
let damp0 = null, damp3 = null;
{
    // G1. STAGE-0 BIT-IDENTITY -- the calibration invariant. Three arms must agree
    //     over >= 100 seeds: no inputs at all (race-mc / every pre-round harness),
    //     an explicit stage 0, and the disclosure track switched OFF. Any drift here
    //     would silently invalidate every 02a calibration band recorded pre-round.
    for (let s = 0; s < IDENT_SEEDS; s++) {
        const seed = (BASE_SEED + s) >>> 0;
        const bare = trajectoryHash(seed, undefined);
        const stage0 = trajectoryHash(seed, { straitTension: 0, exportControlStage: 0 });
        const discOff = trajectoryHash(seed, undefined, (r) => { r.theftDisclosureEnabled = false; });
        if (bare !== stage0) stageIdentOK = false;
        if (bare !== discOff) discIdentOK = false;
    }
    check(`G1: stage-0 trajectory bit-identical to no-stage over ${IDENT_SEEDS} seeds`, stageIdentOK);
    check(`G1: theft-disclosure ON/OFF trajectory bit-identical over ${IDENT_SEEDS} seeds`, discIdentOK);

    // G2. Growth table transcription + stage normalization (02a verbatim).
    check('G2: EXPORT_CONTROL_GROWTH == [1.30, 1.20, 1.06, 0.90] (02a verbatim)',
        JSON.stringify(EXPORT_CONTROL_GROWTH) === JSON.stringify([1.30, 1.20, 1.06, 0.90]));
    check('G2: stage normalization clamps + rounds (absent -> 0, 9 -> 3, -1 -> 0)',
        normalizeExportStage(undefined) === 0 && normalizeExportStage(null) === 0
        && normalizeExportStage(9) === 3 && normalizeExportStage(-1) === 0 && normalizeExportStage(2.4) === 2);

    // G3. EXACT drift monotonicity in the stage, and COMPUTE-LEG-ONLY: the stage
    //     must strictly slow Tianxia's drift at every step, must not touch any other
    //     lab, and must leave the fast-follower term k_f untouched (controls bind
    //     chips, never weights already released). Deterministic -- no MC needed.
    {
        const race = createRaceState(4242);
        for (let d = 0; d < 500; d++) advanceRace(race);
        const cap = race.capability;
        const base = { regime: race.controlRegime, deltaSup: RETUNE.delta_sup, followerKf: RETUNE.k_f };
        const tx = [0, 1, 2, 3].map(s => deterministicDrift(cap, cap.labs.tianxia, race.day, { ...base, exportControlStage: s }));
        let strict = true;
        for (let i = 1; i < tx.length; i++) if (!(tx[i] < tx[i - 1])) strict = false;
        check('G3: Tianxia drift STRICTLY decreasing in stage 0->3', strict,
            tx.map(x => x.toExponential(3)).join(' > '));
        const hal = [0, 3].map(s => deterministicDrift(cap, cap.labs.halcyon, race.day, { ...base, exportControlStage: s }));
        check('G3: Halcyon drift untouched by the stage (Tianxia-only dampener)', hal[0] === hal[1]);
        // k_f isolation: the follower term's CONTRIBUTION (drift with k_f minus drift
        // without) must be identical at stage 0 and stage 3 for the same C -- the
        // dampener rides mu_b only. Compare at a FIXED C by restoring it.
        const cInt = cap.labs.tianxia.C_internal;
        const kf = (s) => {
            cap.labs.tianxia.C_internal = cInt;
            const withKf = deterministicDrift(cap, cap.labs.tianxia, race.day, { ...base, exportControlStage: s });
            const noKf = deterministicDrift(cap, cap.labs.tianxia, race.day, { ...base, followerKf: 0, exportControlStage: s });
            return withKf - noKf;
        };
        check('G3: fast-follower k_f term identical at stage 0 and 3 (chips, not weights)',
            Math.abs(kf(0) - kf(3)) < 1e-15, `${kf(0).toExponential(3)} vs ${kf(3).toExponential(3)}`);
    }

    // G4. DIRECTIONAL probe (not a band, 02a): a sustained stage 3 from day 0 must
    //     visibly cut Tianxia capability and family-4 incidence vs stage 0.
    const DAMP_N = Math.min(N, 800);
    function dampArm(stage) {
        let c504 = 0, n504 = 0, fam4 = 0, txLeads = 0;
        for (let i = 0; i < DAMP_N; i++) {
            const race = createRaceState((BASE_SEED + i) >>> 0);
            for (let d = 0; d < HORIZON && !race.resolution; d++) {
                advanceRace(race, { straitTension: 0, exportControlStage: stage });
                if (race.day === 504) { c504 += race.capability.labs.tianxia.C_internal; n504++; }
                stepControlRegime(race); stepTreaty(race, {}); checkResolution(race, null);
            }
            if (!race.resolution) checkResolution(race, null);
            if (race.resolution.family === 4) fam4++;
            if (race.capability.labs.tianxia.C_internal > race.capability.labs.halcyon.C_internal) txLeads++;
        }
        return { c504: c504 / n504, fam4: fam4 / DAMP_N, txLeads: txLeads / DAMP_N };
    }
    damp0 = dampArm(0); damp3 = dampArm(3);
    check('G4: stage 3 cuts mean Tianxia C@504 vs stage 0', damp3.c504 < damp0.c504,
        `${damp3.c504.toFixed(4)} < ${damp0.c504.toFixed(4)}`);
    check('G4: stage 3 cuts Tianxia-leads-at-1008 vs stage 0', damp3.txLeads < damp0.txLeads,
        `${pct(damp3.txLeads)} < ${pct(damp0.txLeads)}`);
    // "Visibly": a >= 25% relative cut in family-4 incidence (directional, generous).
    check('G4: stage 3 VISIBLY cuts family-4 incidence (>= 25% relative)',
        damp3.fam4 < damp0.fam4 * 0.75, `${pct(damp3.fam4)} vs ${pct(damp0.fam4)} at stage 0`);
}

// =====================================================================
// H. Leak coupling via _tipIncidentId
// =====================================================================
{
    // H1. Detection forcing: a never-detectable incident becomes detectable on the
    //     4d clock, and the daily pass then finds it inside ~a week in expectation.
    //     P(detect within 7d) = 1 - exp(-7/4) = 0.826.
    let forcedOK = true, noopOK = true, unknownOK = true;
    const detDays = [];
    const LEAK_N = Math.min(N, 600);
    let within7 = 0, leakRuns = 0;
    for (let i = 0; i < LEAK_N; i++) {
        const race = createRaceState((BASE_SEED + 9000 + i) >>> 0);
        for (let d = 0; d < 400; d++) advanceRace(race);
        // Pick a NEVER-detectable, undetected latent incident (the tail the verb overrides).
        const target = race.latentIncidents.find(x => !x.detected && !x.detectable);
        if (!target) continue;
        const res = forceLeakDetection(race, target.id);
        if (!res || !res.forced || !target.detectable || target.meanLag > LEAK_FORCED_MEAN_LAG) forcedOK = false;
        const leakDay = race.day;
        for (let d = 0; d < 60 && !target.detected; d++) advanceRace(race);
        leakRuns++;
        if (target.detected) {
            detDays.push(target.detectDay - leakDay);
            if (target.detectDay - leakDay <= 7) within7++;
        }
        // Already-detected: a second force is a no-op that reports itself.
        const again = forceLeakDetection(race, target.id);
        if (target.detected && (!again || again.forced !== false || again.alreadyDetected !== true)) noopOK = false;
        if (forceLeakDetection(race, 'inc_does_not_exist') !== null) unknownOK = false;
    }
    const meanDetLag = detDays.length ? detDays.reduce((a, b) => a + b, 0) / detDays.length : NaN;
    check('H1: leak forces detectable=true on the 4d clock (never-detected tail overridden)', forcedOK);
    check('H1: leaked incident detects within a week in ~82% of cases (1-e^-7/4)',
        within7 / leakRuns >= 0.75 && within7 / leakRuns <= 0.90,
        `${pct(within7 / leakRuns)} of ${leakRuns}; mean lag ${meanDetLag.toFixed(2)}d (target ${LEAK_FORCED_MEAN_LAG})`);
    check('H1: mean forced detection lag ~ 4d', meanDetLag > 3 && meanDetLag < 5.5, `${meanDetLag.toFixed(2)}d`);
    check('H1: re-forcing an already-detected incident is a no-op', noopOK);
    check('H1: unknown incident id -> null (stale popup safe)', unknownOK);

    // H2. THE belief identity: the leak folds under the DETECTION's own id, so the
    //     total alignment displacement is IDENTICAL leaked vs unleaked -- only the
    //     DAY differs. Two arms over the same synthetic detection ledger.
    const inc = { id: 'inc_probe_1', source: 'halcyon', severity: 2, cls: 'accident', occurDay: 10, detectDay: 30, lag: 20 };
    const detLedger = {
        releases: [], certifications: [], strait: null, theftDisclosures: [],
        incidents: { occurred: [], detected: [inc] }, evidence: { occurred: [], published: [] },
    };
    // Arm A (unleaked): the detection alone.
    initBelief(null);
    belief.day = 30;
    stepBelief({ day: 30, lastTransitions: detLedger });
    const alignA = belief.alignment;
    const causesA = beliefCauses().filter(c => c.id === `det_${inc.id}`);
    // Arm B (leaked on day 12, detection lands day 30).
    initBelief(null);
    belief.day = 12;
    const folded = foldPlayerLeak(inc.id, inc.severity);
    const alignAfterLeak = belief.alignment;
    const leakCauses = beliefCauses().filter(c => c.id === `det_${inc.id}`);
    belief.day = 30;
    stepBelief({ day: 30, lastTransitions: detLedger });
    const alignB = belief.alignment;
    const causesB = beliefCauses().filter(c => c.id === `det_${inc.id}`);
    check('H2: leak fold lands under the DETECTION\'s own id `det_${id}`',
        folded === true && leakCauses.length === 1 && leakCauses[0].cause === 'player-leak'
        && beliefProcessed(`det_${inc.id}`) === true);
    check('H2: TOTAL alignment displacement identical leaked vs unleaked',
        Math.abs(alignA - alignB) < 1e-15, `${alignA} vs ${alignB}`);
    check('H2: the leak moved B EARLY (day 12, not day 30)',
        Math.abs(alignAfterLeak - alignB) < 1e-15 && alignAfterLeak !== 0
        && leakCauses[0].day === 12);
    check('H2: the real detection\'s later fold is a NO-OP (exactly one cause entry)',
        causesA.length === 1 && causesB.length === 1
        && causesB[0].cause === 'player-leak' && causesA[0].cause === 'incident-detected');
    // A second leak of the same incident is idempotent (the processed set).
    check('H2: re-leaking the same incident folds nothing (idempotent)',
        foldPlayerLeak(inc.id, inc.severity) === false && belief.alignment === alignB);

    // H2b. The never-detectable TAIL is the asymmetry the identity above does
    //      NOT cover (gate ruling): without the leak the incident never folds
    //      (it never detects); the leak's fold is mass the counterfactual never
    //      gets. The override IS the difference -- that is what the verb is for.
    const emptyLedger = {
        releases: [], certifications: [], strait: null, theftDisclosures: [],
        incidents: { occurred: [], detected: [] }, evidence: { occurred: [], published: [] },
    };
    initBelief(null);
    belief.day = 40;
    stepBelief({ day: 40, lastTransitions: emptyLedger });
    const alignTailUnleaked = belief.alignment;
    initBelief(null);
    belief.day = 12;
    const foldedTail = foldPlayerLeak('inc_probe_tail', 2);
    const alignTailLeaked = belief.alignment;
    check('H2b: never-detectable tail -- unleaked counterfactual folds NOTHING',
        alignTailUnleaked === 0);
    check('H2b: never-detectable tail -- the leak fold is NEW mass (-0.18 at sev 2)',
        foldedTail === true && Math.abs(alignTailLeaked - (-0.18)) < 1e-12,
        `${alignTailLeaked}`);
    deactivateBelief();
    // Belief inactive (Classic): the fold is inert, never a crash on a null set.
    check('H2: fold inert while belief is inactive (Classic)', foldPlayerLeak('inc_x', 3) === false);

    // H3. The frozen/inactive GATE -- the same one applyRaceEffects uses. main.js
    //     guards the leak on raceChannelsLive(), so a leak after the terminal latch
    //     (frozen) or in Classic (inactive) does nothing MECHANICAL.
    deactivateLedger();
    check('H3: gate CLOSED while the ledger is inactive (Classic)', raceChannelsLive() === false);
    resetLedger();
    check('H3: gate OPEN in a live Dynamic run', raceChannelsLive() === true);
    freezeLedger();
    check('H3: gate CLOSED after the terminal latch (freezeLedger)', raceChannelsLive() === false);
    deactivateLedger();
}

// =====================================================================
// I. Theft disclosure track
// =====================================================================
let discRows = 0, discEligible = 0, discThefts = 0;
{
    const DISC_N = Math.min(N, 2000);
    const lags = [];
    const attrTally = {}; for (const a of PUBLIC_ATTRIBUTIONS) attrTally[a] = 0;
    let sameTick = 0, disclosedLatents = 0, rowShapeOK = true, publicIndependent = 0, trueEspionage = 0;
    for (let i = 0; i < DISC_N; i++) {
        const race = createRaceState((BASE_SEED + i) >>> 0);
        for (let d = 0; d < HORIZON; d++) {
            advanceRace(race);
            for (const row of race.lastTransitions.theftDisclosures) {
                discRows++;
                lags.push(row.lag);
                if (row.lag <= 0) sameTick++;
                if (attrTally[row.publicAttribution] === undefined) rowShapeOK = false;
                else attrTally[row.publicAttribution]++;
                if (row.id == null || row.from == null || row.to == null
                    || row.theftDay == null || row.day !== race.day
                    || row.lag !== row.day - row.theftDay) rowShapeOK = false;
            }
        }
        discThefts += race.theftCount;
        for (const t of race.latentThefts) {
            if (t.disclosable) discEligible++;
            if (t.disclosed) disclosedLatents++;
            // The record's TRUE attribution is always 'espionage' on the dyad path;
            // the PUBLISHED one is sampled independently, so they disagree often.
            if (t.disclosed) {
                trueEspionage += (t.trueAttribution === 'espionage') ? 1 : 0;
                if (t.publicAttribution !== t.trueAttribution) publicIndependent++;
            }
        }
    }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const eligFrac = discEligible / discThefts;
    check(`I1: disclosure eligibility ~ ${DISCLOSE_PROB} (the never-disclosed tail is real)`,
        eligFrac >= 0.71 && eligFrac <= 0.79, `${pct(eligFrac)} of ${discThefts} thefts`);
    check('I1: a quarter of thefts stay rumor forever (eligibility strictly < 1)',
        eligFrac < 0.95 && discEligible < discThefts, `${discThefts - discEligible} never-disclosable`);
    // Right-censored at the horizon, so the OBSERVED mean lag sits below the 40d
    // Exp mean; the band allows the censoring without allowing a wrong rate.
    check(`I2: disclosure lag mean consistent with Exp(${DISCLOSE_MEAN_LAG}) under horizon censoring`,
        mean(lags) >= 28 && mean(lags) <= 42, `${mean(lags).toFixed(1)}d over ${lags.length} disclosures`);
    check('I2: no theft discloses in its own commit tick (occurrence stays silent)',
        sameTick === 0 && Math.min(...lags) >= 1, `min lag ${Math.min(...lags)}`);
    check('I3: public attribution ~ 0.55 espionage',
        attrTally.espionage / discRows >= 0.51 && attrTally.espionage / discRows <= 0.59,
        pct(attrTally.espionage / discRows));
    check('I3: public attribution ~ 0.30 insider',
        attrTally.insider / discRows >= 0.26 && attrTally.insider / discRows <= 0.34,
        pct(attrTally.insider / discRows));
    check('I3: public attribution ~ 0.15 the model itself',
        attrTally.model / discRows >= 0.12 && attrTally.model / discRows <= 0.18,
        pct(attrTally.model / discRows));
    check('I3: public attribution INDEPENDENT of the true one (the dispute is the story)',
        publicIndependent > 0 && trueEspionage === disclosedLatents,
        `${publicIndependent}/${disclosedLatents} disclosures blame the wrong thing`);
    check('I4: ledger rows complete + exactly one per disclosure',
        rowShapeOK && discRows === disclosedLatents, `${discRows} rows, ${disclosedLatents} disclosed`);

    // I5. The BRIDGE routes the ledger: both shells exist, are Poisson-excluded,
    //     and the frontier-victim case takes the superevent while an ordinary
    //     victim takes the toast shell. Fires the real bridge against a stub
    //     engine (a shell-id typo would otherwise only surface in play).
    const shellTally = {};
    let tokensClean = true, frontierIsSuperevent = true, victimTokenOK = true;
    const stubEngine = {
        world: { factions: {}, geopolitical: {}, ai: {} },
        _fireEvent(ev) {
            if (ev.id.startsWith('theft_')) {
                shellTally[ev.id] = (shellTally[ev.id] || 0) + 1;
                if (/\{[a-zA-Z]+\}/.test(ev.headline)) tokensClean = false;
                if (ev.id === 'theft_disclosed_frontier' && !ev.superevent) frontierIsSuperevent = false;
                if (!ev.raceMeta || ev.raceMeta.lab !== ev.raceMeta.victim) victimTokenOK = false;
            }
            return ev.popup ? { queued: true, event: ev } : { id: ev.id };
        },
    };
    for (let i = 0; i < Math.min(N, 600); i++) {
        const race = createRaceState((BASE_SEED + i) >>> 0);
        initConsensus(race); initBelief(race); resetRaceBridge();
        for (let d = 0; d < HORIZON; d++) {
            advanceRace(race);
            if (race.lastTransitions.theftDisclosures.length) {
                runRaceBridge(stubEngine, race, { day: race.day }, race.day, 0);
            }
        }
        deactivateConsensus(); deactivateBelief();
    }
    // Poisson exclusion asserted through the ENGINE's real pool (not a copy of the
    // category set): a 'theft' shell must never be random-drawable.
    const randomPool = new EventEngine('offline')._pools.random;
    check('I5: both theft-disclosure shells exist and are category theft (Poisson-excluded)',
        getEventById('theft_disclosed')?.category === 'theft'
        && getEventById('theft_disclosed_frontier')?.category === 'theft'
        && !randomPool.some(e => e.category === 'theft'));
    check('I5: bridge fires BOTH shells off the ledger (frontier + ordinary victim)',
        (shellTally.theft_disclosed_frontier || 0) > 0 && (shellTally.theft_disclosed || 0) > 0,
        `frontier ${shellTally.theft_disclosed_frontier || 0} / ordinary ${shellTally.theft_disclosed || 0}`);
    check('I5: frontier victim gets the superevent; every token substitutes; {lab} is the VICTIM',
        frontierIsSuperevent && tokensClean && victimTokenOK);
}

// ---- Report --------------------------------------------------------------
line(`plumbing-test: N=${N}, horizon=${HORIZON}d`);
line(`control tuning: supP=${CONTROL_TUNING.supPressure} mobP=${CONTROL_TUNING.mobPressure} natP=${CONTROL_TUNING.natPressure} natHeat=${CONTROL_TUNING.natHeat}`);
line('='.repeat(72));
line('\nRegime final distribution (endogenous, tension 0):');
for (const k of CONTROL_REGIMES) line(`  ${k.padEnd(13)} ${pct(regimeTally[k] / N)}`);
line(`  reached >= supervised ${pct(reachSup)}   >= mobilized ${pct(reachMobFrac)}`);
line(`\nStrait blockade incidence: baseline ${pct(baselineIncidence)} (tension 0) | hot ${pct(hotIncidence)} (tension 1)`);
line('\nEvidence machinery:');
line(`  export-control dampener [${EXPORT_CONTROL_GROWTH.join(', ')}]x/yr`);
line(`    stage 0: TianxiaC@504 ${damp0.c504.toFixed(4)}  Tianxia leads ${pct(damp0.txLeads)}  family-4 ${pct(damp0.fam4)}`);
line(`    stage 3: TianxiaC@504 ${damp3.c504.toFixed(4)}  Tianxia leads ${pct(damp3.txLeads)}  family-4 ${pct(damp3.fam4)}`);
line(`  theft disclosure: ${discRows} disclosures / ${discEligible} eligible / ${discThefts} thefts`);
line('='.repeat(72));
line('\nChecks:');
for (const r of results) {
    line(`  [${r.ok ? 'PASS' : 'MISS'}] ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
}
line('='.repeat(72));
line(failures === 0 ? 'ALL PLUMBING CHECKS PASS' : `${failures} PLUMBING CHECK(S) MISS -- see above`);
process.exitCode = failures === 0 ? 0 : 1;
