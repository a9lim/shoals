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

   ...and the ACT III SYSTEMIC LAYER (P7-1, 2026-07-24):

   J. The driver + substep event lane: driver shape (targets,
      smoothing, the d projection), lane RATE INVARIANCE at the
      R5 ceiling, uniform arrival over the 16 substeps, and the
      categories the lane may not move (bridge / ledger / pulse
      fired stay at day-complete).
   K. Manual latency ladder: 0/1/3/6 substeps with x1.25/x1.5
      spread, queue arithmetic (fill substep = order substep +
      lag), strategies deferring as ONE unit, the exact-no-op
      unit multiplier (R<=3 bit-identity), execution-time
      restriction / freeze rejection with cash untouched, and
      (02a P7-1 ruling 2) PLAYER EXITS on the same ladder while
      every MACHINERY path -- forced liquidation, expiry trims,
      popup trades -- and `exerciseOption` stay instant. Plus
      the P7-1 fix round: the EXPIRY ROLLOVER reject (ruling 1 --
      a fill at or past its own expiry is barred before the
      trade is counted, so nothing survives its expiry pass) and
      run-scoped reset state (ruling 5 -- the renderer's
      transient repaint fields, the queue's ticket counter).
   ...and the DELEGATION LAYER (P7-2, 2026-07-24):

   M. Standing orders: the unlock / lock / reset gates, each
      rule firing exactly on its predicate and exactly ONCE
      per trigger episode, executions routing MACHINERY-instant
      (never the P7-1 latency queue, never the ladder's widened
      spread), the liquidation PREFERENCE reordering the forced
      -liquidation sequence, the interception contract the
      auto-sit rule depends on, and full inertness while
      restricted / past the terminal latch / with nothing armed.

   L. Presentation degradation: hold arithmetic, and the
      invariant that every headless number (portfolio value,
      marks, the VXHCN index) is BITWISE unchanged with the
      display latches forced on -- plus Classic inertness (no
      RNG drawn at rest) and the reduced-motion split.

   All numeric bands are DESIGN bands; the tuning is RATIFIED in
   02a's "Content plumbing (phase-5a ratifications, 2026-07-23)"
   and "Evidence machinery (pre-P7 ratifications, 2026-07-24)"
   blocks. Exits 1 on any MISS.

   Usage:  node tools/plumbing-test.mjs [N]
   =================================================== */

import { createHash } from 'node:crypto';
import {
    createRaceState, advanceRace, stepControlRegime, setControlRegime,
    heatValue, REGIME_RANK, CONTROL_REGIMES, RETUNE, freshTransitions,
    roomTrigger, roomTriggerReady, ROOM_RUNG, ROOM_MARGIN, ROOM_TRIGGER_C,
} from '../src/race/race-state.js';
import { CONTROL_TUNING } from '../src/race/control-regime.js';
import { BLOCKADE_HEAT } from '../src/race/strait.js';
import {
    deterministicDrift, EXPORT_CONTROL_GROWTH, normalizeExportStage, frontierInternal,
} from '../src/race/capability.js';
import {
    forceLeakDetection, LEAK_FORCED_MEAN_LAG, stepIncidents,
    INSIDER_TIP_PROB, INSIDER_TIP_PROB_CLASSIFIED,
} from '../src/race/incidents.js';
import {
    initIntel, deactivateIntel, intelActive, intelRead, velocityBucket,
    INTEL_LO, INTEL_HI, INTEL_BUCKETS, INTEL_TRUTH_PROB,
} from '../src/race/intel.js';
import { createRng, deriveSeed } from '../src/race/rng.js';
import { DISCLOSE_PROB, DISCLOSE_MEAN_LAG, PUBLIC_ATTRIBUTIONS } from '../src/race/theft-disclosure.js';
import { stepTreaty } from '../src/race/treaty-track.js';
import { checkResolution } from '../src/race/resolution.js';
import {
    resetLedger, deactivateLedger, freezeLedger, raceChannelsLive,
    applyRaceEffects, ledgerEntries,
} from '../src/race/ledger.js';
import { isTerminalSafeBeat } from '../src/endings.js';
import {
    ROOM_EVENT_ID, ROOM_FLAGS, ROOM_GATE, ROOM_FLAG_CRITERIA, ROOM_LEADER_SIDES,
    ROOM_MIN_CRITERIA, ROOM_MAX_VOICE, roomVoice, roomInvited, roomChoices,
    roomLeaderSide, roomPresentation, resetRoomRotation,
} from '../src/events/room.js';
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
    settleComputeFutures, portfolioValue, applyBinarySettlementRows, computeBidAsk,
    closePosition, liquidateAll, exerciseOption, processExpiry, isExpiredForTrading,
    placePendingOrder, checkPendingOrders, liquidationSequence, computeNetDelta,
} from '../src/portfolio.js';
import {
    STANDING_RULES, STANDING_TUNING, resetStandingOrders, freezeStandingOrders,
    syncStandingOrders, standingOrdersUnlocked, standingOrdersLocked, standingOrdersView,
    isArmed, setArmed, armedRuleIds,
    runDayBoundaryRules, runSubstepRules, standingLiquidationOrder, tipAutoSitArmed,
} from '../src/standing-orders.js';
import { ChartRenderer } from '../src/chart.js';
import {
    ACT3_TUNING, act3Target, stepAct3Driver, machineIntensity, degradation, setMachineParam,
    resetAct3, tickSubstepClock, substepClock, orderLatency,
    deferOrder, dueOrders, clearDeferredOrders, workingOrderCount,
    publishedChain, chainHoldSubsteps, advanceVxhcnPublication, publishedVxhcn, publishedVariance,
    vxhcnPublicationStale, rollCandleRepaint, skipSparklineFrame,
    noteDegradationIncident, takeGlitchSeverity, setReducedMotion,
} from '../src/act3.js';
import { unitPrice } from '../src/position-value.js';
import { computeVXHCNSpot } from '../src/pricing.js';
import {
    resetImpactState, getStockImpact, getBondImpact, getVxhcnImpact, getOptionImpact,
} from '../src/price-impact.js';
import {
    belief, initBelief, deactivateBelief, lockForecast, credibility,
    stepBelief, foldPlayerLeak, beliefCauses, beliefProcessed, BLACKOUT_FOLD_MAX_SEV,
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
function trajectoryHash(seed, opts, mutate, perDay) {
    const race = createRaceState(seed >>> 0);
    if (mutate) mutate(race);
    const h = createHash('sha256');
    for (let d = 0; d < HORIZON; d++) {
        advanceRace(race, opts);
        if (perDay) perDay(race);
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

// =====================================================================
// J. Act III driver + substep event lane (P7-1)
// =====================================================================
let laneOffRate = 0, laneOnRate = 0, laneArrivalSpread = 0;
{
    // -- J1. The driver: shape, smoothing, and the two projections -------
    resetAct3();
    check('J1: driver starts at rest (x = 0, d = 0)',
        machineIntensity() === 0 && degradation() === 0);
    check('J1: target 0 through R3, 0.6 at R4, 1.0 at R5 (public state only)',
        act3Target(1, 'private') === 0 && act3Target(3, 'private') === 0
        && act3Target(4, 'private') === ACT3_TUNING.targetR4
        && act3Target(5, 'private') === ACT3_TUNING.targetR5);
    check('J1: mobilized+ adds the bump, capped at 1',
        Math.abs(act3Target(4, 'mobilized') - (ACT3_TUNING.targetR4 + ACT3_TUNING.regimeBump)) < 1e-12
        && act3Target(5, 'mobilized') === 1 && act3Target(5, 'nationalized') === 1);
    // Smoothed, monotone, ~three trading weeks of crossfade.
    let prevX = 0, mono = true;
    for (let d = 0; d < 15; d++) {
        const x = stepAct3Driver(4, 'private');
        if (x < prevX - 1e-12) mono = false;
        prevX = x;
    }
    check('J1: x crossfades monotonically to ~90% of target in 15 trading days',
        mono && prevX > 0.9 * ACT3_TUNING.targetR4 && prevX < ACT3_TUNING.targetR4,
        `x=${prevX.toFixed(3)} target=${ACT3_TUNING.targetR4}`);
    // Degradation is a pure projection with the knee at 0.5.
    setMachineParam(0.5);
    const dAtKnee = degradation();
    setMachineParam(0.75);
    const dMid = degradation();
    setMachineParam(1);
    const dTop = degradation();
    check('J1: d = max(0, (x - 0.5)/0.5) -- 0 at the knee, 0.5 midway, 1 at x = 1',
        dAtKnee === 0 && Math.abs(dMid - 0.5) < 1e-12 && dTop === 1);
    resetAct3();

    // -- J2. Lane rate invariance ----------------------------------------
    // The lane must NOT change the discretionary cadence: same accept/cooldown
    // arithmetic, arrival moved inside the day. Stubbed draw + no pulses isolates
    // the discretionary pass; the DAY-level scale is forced to the R5 ceiling
    // (2.5), the regime the lane actually runs in.
    const PROBE = { id: 'p71_probe', category: 'neutral', headline: 'probe', params: {}, magnitude: 'minor' };
    const STUB_SIM = {};
    function laneRun(lane, days, scale) {
        const eng = new EventEngine('offline');
        eng._pulses = [];                 // silence pulses (they preempt the discretionary pass)
        eng._pools.random = [];           // silence the one-shot pre-pass
        eng._drawRandom = () => PROBE;    // deterministic draw
        eng.setBaseRateScale(scale);
        eng.setSubstepLane(lane);
        const buckets = new Array(16).fill(0);
        let fires = 0;
        for (let d = 1; d <= days; d++) {
            const r = eng.maybeFire(STUB_SIM, d, 0);
            fires += r.fired.length + r.popups.length;
            const a = eng.pendingArrival();
            if (a) {
                buckets[a.substep]++;
                // Consume it exactly as _runSubstep does, at its substep.
                const ev = eng.takeSubstepArrival(d, a.substep);
                if (ev) {
                    const rr = eng.fireArrival(ev, STUB_SIM, d, 0);
                    fires += rr.fired.length + rr.popups.length;
                }
            }
        }
        return { fires, buckets };
    }
    const DAYS = 400000;
    const scaleR5 = eventBaseRateScale(5);
    const off = laneRun(false, DAYS, scaleR5);
    const on = laneRun(true, DAYS, scaleR5);
    laneOffRate = off.fires / DAYS;
    laneOnRate = on.fires / DAYS;
    const rateGap = Math.abs(laneOnRate - laneOffRate) / laneOffRate;
    check('J2: lane ON matches lane OFF discretionary rate (same expectation, band 5%)',
        rateGap < 0.05, `off ${laneOffRate.toFixed(5)}/d vs on ${laneOnRate.toFixed(5)}/d (${pct(rateGap)} gap)`);
    check('J2: lane OFF schedules no arrivals at all (day granularity preserved)',
        off.buckets.every(b => b === 0));
    const arrivals = on.buckets.reduce((a, b) => a + b, 0);
    const meanBucket = arrivals / 16;
    let worst = 0;
    for (const b of on.buckets) worst = Math.max(worst, Math.abs(b - meanBucket) / meanBucket);
    laneArrivalSpread = worst;
    check('J2: arrivals uniform over the 16 substeps (worst bucket within 15%)',
        arrivals > 10000 && worst < 0.15, `${arrivals} arrivals, worst deviation ${pct(worst)}`);
    check('J2: every arrival is consumed exactly once (no stale carry, no double-fire)',
        on.fires === arrivals, `${on.fires} fires vs ${arrivals} arrivals`);

    // -- J3. What the lane may NOT move ----------------------------------
    // The lane draws from `_pools.random` alone -- so every Poisson-excluded
    // category (bridge / ledger / latch / pulse fired) stays at day-complete by
    // construction. Asserted through the ENGINE's real pool, not a copy of the set.
    const EXCLUDED = ['fed', 'midterm', 'interjection', 'release', 'incident', 'certification',
        'strait', 'regime', 'dispute', 'theft', 'polaris', 'insider', 'conversion', 'summit'];
    const realPool = new EventEngine('offline')._pools.random;
    check('J3: the lane\'s source pool carries no bridge/ledger/pulse-fired category',
        realPool.length > 0 && realPool.every(e => !EXCLUDED.includes(e.category)),
        `${realPool.length} discretionary events`);
    // A pulse still fires AT the day boundary with the lane live.
    {
        const eng = new EventEngine('offline');
        eng._pools.random = [];
        eng._pools.fed = [{ id: 'p71_fomc', category: 'fed', headline: 'fomc probe', params: {}, magnitude: 'moderate' }];
        eng._pulses = [{ type: 'recurring', id: 'fomc', interval: 5, jitter: 0, nextDay: -1, poolKey: 'fed' }];
        eng.setSubstepLane(true);
        let dayFired = 0;
        for (let d = 1; d <= 60; d++) dayFired += eng.maybeFire(STUB_SIM, d, 0).fired.length;
        check('J3: pulses still fire at day-complete while the lane is live',
            dayFired > 0 && eng.pendingArrival() === null, `${dayFired} pulse fires`);
    }
    check('J3: a fresh engine has the lane closed (Classic / Act I default)',
        new EventEngine('offline').substepLaneLive() === false);
}

// =====================================================================
// K. Manual latency ladder (P7-1 agency migration)
// =====================================================================
let ladderRows = '';
{
    // -- K1. Ladder arithmetic (02a: 0 / 1 / 3 / 6 substeps) --------------
    const L3 = orderLatency(3, 'private'), L4 = orderLatency(4, 'private');
    const L5 = orderLatency(5, 'private'), L5m = orderLatency(5, 'mobilized');
    const L5n = orderLatency(5, 'nationalized'), L4m = orderLatency(4, 'mobilized');
    ladderRows = `R<=3 ${L3.lag}/${L3.spreadMult} R4 ${L4.lag}/${L4.spreadMult} `
        + `R5 ${L5.lag}/${L5.spreadMult} R5+mob ${L5m.lag}/${L5m.spreadMult}`;
    check('K1: ladder is 0 through R3, 1 at R4, 3 x1.25 at R5, 6 x1.5 at R5 + mobilized',
        L3.lag === 0 && L3.spreadMult === 1
        && L4.lag === 1 && L4.spreadMult === 1
        && L5.lag === 3 && L5.spreadMult === 1.25
        && L5m.lag === 6 && L5m.spreadMult === 1.5, ladderRows);
    check('K1: the mobilized escalation is R5-only; terminal regimes count as mobilized+',
        L4m.lag === 1 && L4m.spreadMult === 1 && L5n.lag === 6 && L5n.spreadMult === 1.5);
    check('K1: rung 0 (nothing released yet) is the pre-P7 path',
        orderLatency(0, 'private').lag === 0);

    // -- K2. Queue arithmetic: fill substep = order substep + lag ---------
    resetAct3();
    const placedAt = substepClock();
    const t = deferOrder('market', { type: 'stock', side: 'long', qty: 1 }, 3, 1.25);
    check('K2: due clock = placement clock + lag', t.dueClock === placedAt + 3 && t.placedClock === placedAt);
    let earlyDrain = 0;
    for (let i = 0; i < 2; i++) { tickSubstepClock(); earlyDrain += dueOrders().length; }
    const atLag = (tickSubstepClock(), dueOrders());
    check('K2: nothing fills early; the order fills at exactly substep + lag',
        earlyDrain === 0 && atLag.length === 1 && atLag[0].ticket === t.ticket
        && atLag[0].spreadMult === 1.25 && workingOrderCount() === 0);
    // Multi-leg strategies defer as ONE unit -> one due clock -> one price set.
    resetAct3();
    deferOrder('strategy', { legs: [{}, {}, {}], name: 'probe', mult: 2 }, 6, 1.5);
    tickSubstepClock(); tickSubstepClock(); tickSubstepClock();
    tickSubstepClock(); tickSubstepClock(); tickSubstepClock();
    const stratDue = dueOrders();
    check('K2: a strategy defers as ONE queue entry (all legs share the execution substep)',
        stratDue.length === 1 && stratDue[0].payload.legs.length === 3 && stratDue[0].spreadMult === 1.5);
    // The desk lock (terminal latch / restriction) drops working orders.
    resetAct3();
    deferOrder('market', { type: 'stock', side: 'long', qty: 1 }, 6, 1.5);
    deferOrder('binary', { key: 1, side: 'long', qty: 1 }, 6, 1.5);
    const dropped = clearDeferredOrders();
    check('K2: the desk lock drops every working order', dropped === 2 && workingOrderCount() === 0);
    resetAct3();

    // -- K3. The spread multiplier lands on the fill ----------------------
    // Impact state is reset before each fill so the ONLY difference is the ladder
    // multiplier: fill(m) - mid = (fill(1) - mid) * m, exactly.
    const S0 = 100, vol = 0.2;
    syncFixed(0);
    function stockFill(mult) {
        resetPortfolio();
        resetImpactState();
        const pos = executeMarketOrder(null, 'stock', 'long', 1, S0, vol, 0.03, 0, undefined, undefined, undefined, 0, mult);
        return pos ? pos.fillPrice : NaN;
    }
    const f1 = stockFill(1), fU = stockFill(undefined), f125 = stockFill(1.25), f15 = stockFill(1.5);
    const half = computeBidAsk(S0, vol).ask - S0;
    check('K3: omitted / unit multiplier is an EXACT no-op (R<=3 fills bit-identical)',
        fU === f1, `${fU} vs ${f1}`);
    check('K3: x1.25 and x1.5 widen the half-spread exactly',
        Math.abs((f125 - f1) - 0.25 * half) < 1e-12 && Math.abs((f15 - f1) - 0.5 * half) < 1e-12,
        `half ${half.toFixed(6)}, +${(f125 - f1).toFixed(6)} / +${(f15 - f1).toFixed(6)}`);
    // Shorts pay the widening on the bid side (worse, not better).
    resetPortfolio(); resetImpactState();
    const sh1 = executeMarketOrder(null, 'stock', 'short', 1, S0, vol, 0.03, 0, undefined, undefined, undefined, 0, 1).fillPrice;
    resetPortfolio(); resetImpactState();
    const sh15 = executeMarketOrder(null, 'stock', 'short', 1, S0, vol, 0.03, 0, undefined, undefined, undefined, 0, 1.5).fillPrice;
    check('K3: a widened short fills LOWER (the ladder never pays the desk)',
        sh15 < sh1 && Math.abs((sh1 - sh15) - 0.5 * half) < 1e-12);
    resetPortfolio(); resetImpactState();

    // -- K4. Execution-time state wins (the order-crosses-freeze case) ----
    // The queue holds an order; by the time it lands the desk is restricted /
    // the book is frozen. The fill must be REJECTED with cash untouched.
    resetPortfolio();
    const cash0 = portfolio.cash;
    portfolio.restricted = true;
    const blocked = executeMarketOrder(null, 'stock', 'long', 1, S0, vol, 0.03, 0, undefined, undefined, undefined, 0, 1.5);
    check('K4: a deferred fill landing after a restriction is rejected, cash untouched',
        blocked === null && portfolio.cash === cash0 && portfolio.positions.length === 0);
    portfolio.restricted = false;
    // Frozen Consensus: same story on the binary route.
    const race = createRaceState(7);
    initConsensus(race); initBelief(race);
    refreshBinaryQuotes(race);
    const bKey = consensus.contracts[0].key;
    consensus.frozen = true;
    const bBlocked = executeBinaryTrade(bKey, 'long', 1, 1.5);
    check('K4: a deferred binary landing after the freeze is rejected, cash untouched',
        bBlocked === null && portfolio.cash === cash0);
    consensus.frozen = false;
    // ...and the widened binary fill is symmetric about the quote mid.
    const q = consensus.quotes[bKey];
    const bLong = executeBinaryTrade(bKey, 'long', 1, 1.5);
    const perUnit = bLong ? bLong.fillPrice / 100 : NaN;    // BINARY_NOTIONAL = 100
    check('K4: binary widening is symmetric about the quote mid, clamped to [0,1]',
        bLong != null && perUnit >= q.ask - 1e-9 && perUnit <= 1
        && Math.abs(perUnit - Math.min(1, q.mid + (q.ask - q.mid) * 1.5)) < 1e-9,
        `mid ${q.mid.toFixed(4)} ask ${q.ask.toFixed(4)} fill ${perUnit.toFixed(4)}`);
    resetPortfolio();
    deactivateConsensus(); deactivateBelief();

    // -- K5. PLAYER EXITS take the same ladder (02a P7-1 ruling 2) --------
    // Exits are not faster -- or cheaper -- than entries in a market made of
    // machines. The queue treats a close / unwind exactly like an entry...
    resetAct3();
    const cT = deferOrder('close', { id: 4242 }, 3, 1.25);
    const uT = deferOrder('unwind', { name: 'probe' }, 3, 1.25);
    let exitEarly = 0;
    for (let i = 0; i < 2; i++) { tickSubstepClock(); exitEarly += dueOrders().length; }
    tickSubstepClock();
    const exitsDue = dueOrders();
    check('K5: a player close / unwind defers on the SAME queue, lag and multiplier as an entry',
        exitEarly === 0 && exitsDue.length === 2
        && exitsDue[0].ticket === cT.ticket && exitsDue[1].ticket === uT.ticket
        && exitsDue.every(e => e.spreadMult === 1.25 && e.dueClock === e.placedClock + 3)
        && workingOrderCount() === 0);
    resetAct3();

    // ...and the widening is PAID on the exit, in both directions: a widened
    // close returns less cash, never more.
    function closeProceeds(signedQty, mult) {
        resetPortfolio();
        resetImpactState();
        const pos = executeMarketOrder(null, 'stock', signedQty > 0 ? 'long' : 'short',
            Math.abs(signedQty), S0, vol, 0.03, 0, undefined, undefined, undefined, 0);
        resetImpactState();                       // isolate the CLOSE's own impact
        const cashBefore = portfolio.cash;
        const ok = closePosition(null, pos.id, S0, vol, 0.03, 0, 0, mult);
        return ok ? portfolio.cash - cashBefore : NaN;
    }
    const cl1 = closeProceeds(1, 1), clU = closeProceeds(1, undefined), cl15 = closeProceeds(1, 1.5);
    const cs1 = closeProceeds(-1, 1), cs15 = closeProceeds(-1, 1.5);
    check('K5: an omitted multiplier closes at the pre-P7 fill EXACTLY (machinery path)',
        clU === cl1, `${clU} vs ${cl1}`);
    check('K5: a widened close returns less cash, by exactly the half-spread step, both directions',
        Math.abs((cl1 - cl15) - 0.5 * half) < 1e-12 && Math.abs((cs1 - cs15) - 0.5 * half) < 1e-12,
        `long -${(cl1 - cl15).toFixed(6)} / short -${(cs1 - cs15).toFixed(6)} (half ${half.toFixed(6)})`);

    // -- K6. MACHINERY paths stay instant --------------------------------
    // The ladder binds the player's hand, never the machinery's: a forced
    // liquidation of a RESTRICTED book still flattens, immediately.
    resetPortfolio(); resetImpactState();
    executeMarketOrder(null, 'stock', 'long', 2, S0, vol, 0.03, 0, undefined, undefined, undefined, 0);
    executeMarketOrder(null, 'bond', 'long', 1, S0, vol, 0.03, 0, undefined, 42, undefined, 0);
    portfolio.restricted = true;
    const liq = liquidateAll(null, S0, vol, 0.03, 0, 0);
    check('K6: machinery liquidation of a RESTRICTED book is instant and unaffected by the ladder',
        liq.stuck.length === 0 && portfolio.positions.length === 0);
    // ...and closePosition is NOT restriction-gated, which is exactly why the
    // working-close drop has to live in the drain (main.js), not in portfolio.js.
    resetPortfolio(); resetImpactState();
    const rPos = executeMarketOrder(null, 'stock', 'long', 1, S0, vol, 0.03, 0, undefined, undefined, undefined, 0);
    portfolio.restricted = true;
    const closedWhileRestricted = closePosition(null, rPos.id, S0, vol, 0.03, 0, 0);
    check('K6: closePosition is not restriction-gated -> the due-close DROP must be the drain\'s job',
        closedWhileRestricted === true && portfolio.positions.length === 0);
    portfolio.restricted = false;
    // Exercise stays instant AND spread-free: a rights execution crosses nothing.
    resetPortfolio(); resetImpactState();
    const exCall = executeMarketOrder(null, 'call', 'long', 1, S0, vol, 0.03, 0, 90, 42, undefined, 0);
    const cashBeforeEx = portfolio.cash;
    const exd = exerciseOption(exCall.id, S0, 0, vol, 0.03, 0);
    const exStock = portfolio.positions.find(pp => pp.type === 'stock');
    check('K6: exercise is a rights execution -- delivered at the STRIKE, no spread, no ladder param',
        exd != null && exStock != null && exStock.entryPrice === 90
        && Math.abs((portfolio.cash - cashBeforeEx) + 90) < 1e-12,
        `entry ${exStock ? exStock.entryPrice : '--'}, cash ${(portfolio.cash - cashBeforeEx).toFixed(4)}`);
    resetPortfolio(); resetImpactState();

    // -- K7. EXPIRY RE-CHECKED AT EXECUTION (02a P7-1 ruling 1) -----------
    // The rollover case the ladder makes reachable: the live chain lists
    // tomorrow's expiry until the day rolls, so an order placed late with lag 3/6
    // can land AFTER that expiry has been processed. `processExpiry` matches the
    // boundary day EXACTLY, so a position filled at or past its own expiry would
    // never expire again -- permanently live, unsettleable. The reject lives in
    // executeMarketOrder, BEFORE the trade is counted.
    resetPortfolio(); resetImpactState();
    const preTrades = portfolio.totalTrades;
    const late = executeMarketOrder(null, 'call', 'long', 1, S0, vol, 0.03, 11, 90, 10, undefined, 0);
    check('K7: a time-bound fill PAST its expiry is rejected, uncounted, cash untouched',
        late === null && portfolio.positions.length === 0
        && portfolio.totalTrades === preTrades && portfolio.cash === 10000,
        `trades ${portfolio.totalTrades - preTrades}, cash ${portfolio.cash}`);
    // The boundary is expiryDay <= currentDay: an expiry being settled TODAY is
    // already gone (processExpiry ran at this day's close), so it is barred too.
    check('K7: the boundary is <=, not < -- today\'s expiry is already settled',
        executeMarketOrder(null, 'put', 'long', 1, S0, vol, 0.03, 11, 90, 11, undefined, 0) === null
        && executeMarketOrder(null, 'call', 'long', 1, S0, vol, 0.03, 11, 90, 12, undefined, 0) != null);
    // ...and the predicate agrees for every time-bound type, while the types that
    // carry their OWN settlement clock are untouched (binaries: deadline day;
    // compute futures: race-day maturity -- compute-test trades keys <= race.day).
    resetPortfolio(); resetImpactState();
    check('K7: predicate covers call/put/bond/vxhcnfuture and NOTHING else',
        ['call', 'put', 'bond', 'vxhcnfuture'].every(t => isExpiredForTrading(t, 10, 11))
        && ['stock', 'binary', 'computefuture'].every(t => !isExpiredForTrading(t, 10, 11))
        && !isExpiredForTrading('call', 12, 11) && !isExpiredForTrading('stock', undefined, 11));
    check('K7: stock (no expiry at all) is unaffected',
        executeMarketOrder(null, 'stock', 'long', 1, S0, vol, 0.03, 11, undefined, undefined, undefined, 0) != null);
    // The invariant the reject exists to protect: NO position can survive its own
    // expiry pass. Open every time-bound type legitimately, roll the clock past
    // each expiry, and assert the book is empty -- then assert the only way one
    // COULD have survived (a post-expiry fill) is closed.
    resetPortfolio(); resetImpactState();
    syncFixed(0);
    executeMarketOrder(null, 'call', 'long', 1, S0, vol, 0.03, 9, 90, 10, undefined, 0);
    executeMarketOrder(null, 'put', 'long', 1, S0, vol, 0.03, 9, 110, 10, undefined, 0);
    executeMarketOrder(null, 'bond', 'long', 1, S0, vol, 0.03, 9, undefined, 10, undefined, 0);
    executeMarketOrder(null, 'vxhcnfuture', 'long', 1, S0, vol, 0.03, 9, undefined, 10, undefined, 0);
    const opened = portfolio.positions.length;
    const survivor = executeMarketOrder(null, 'call', 'long', 1, S0, vol, 0.03, 11, 95, 10, undefined, 0);
    syncFixed(10);
    processExpiry(null, 10, S0, 10, vol, 0.03, 0);
    check('K7: no time-bound position survives its own expiry pass',
        opened === 4 && survivor === null && portfolio.positions.length === 0,
        `opened ${opened}, left ${portfolio.positions.length}`);
    resetPortfolio(); resetImpactState(); syncFixed(0);

    // -- K8. Reset restores an honest display (02a P7-1 ruling 5) ---------
    // The renderer's transient fields are cleared through ONE method, so a repaint
    // generated while the strategy view was up (draw() never consumed it) cannot
    // survive a Dynamic->Classic reset and print an Act-III wrong tick at rest.
    // ChartRenderer needs a canvas, so the method is exercised on the prototype.
    const fakeChart = {
        _lerp: { day: 7, close: 101, high: 102, low: 99, _from: 100, _targetClose: 101, _targetHigh: 102, _targetLow: 99, _t: 0.4 },
        _repaint: 0.37,
        _repaintDirty: true,
    };
    ChartRenderer.prototype.resetTransients.call(fakeChart);
    check('K8: resetTransients clears the lerp AND both repaint fields',
        fakeChart._repaint === 0 && fakeChart._repaintDirty === false
        && fakeChart._lerp.day === -1 && fakeChart._lerp.close === 0
        && fakeChart._lerp._t === 1 && fakeChart._lerp._targetClose === 0);
    // ...and resetAct3 makes the queue fully run-scoped: tickets restart at 1.
    resetAct3();
    const t1 = deferOrder('market', { type: 'stock', side: 'long', qty: 1 }, 3, 1.25).ticket;
    deferOrder('market', { type: 'stock', side: 'long', qty: 1 }, 3, 1.25);
    resetAct3();
    const t2 = deferOrder('market', { type: 'stock', side: 'long', qty: 1 }, 3, 1.25).ticket;
    check('K8: resetAct3 resets the ticket counter -- queue state is run-scoped',
        t1 === 1 && t2 === 1, `first ${t1}, after reset ${t2}`);
    resetAct3();

    // -- K9. BUNDLE ATOMICITY across rollover (P7-1 fix round) ------------
    // A per-leg expiry reject is NOT enough for a multi-leg bundle: a STOCK-FIRST
    // strategy (covered call) runs `_fillPrice` on leg 1 and records price impact
    // before leg 2's expired option is refused, and the rollback restores cash /
    // positions / counters but NOT the impact pools -- cumulative traded volume is
    // append-only. The preflight must drop the whole bundle before ANY leg moves.
    // Driven through the REAL pending-strategy path (checkPendingOrders), which is
    // where the leak was reproduced.
    const coveredCall = (expiry) => ([
        { type: 'stock', qty: 1, strike: null, expiryDay: null },   // stock FIRST
        { type: 'call', qty: -1, strike: 100, expiryDay: expiry },
    ]);
    const poolSnapshot = () => [
        getStockImpact(vol), getBondImpact(market.sigmaR), getVxhcnImpact(market.xi),
        getOptionImpact('call', 100, 10, vol, 0, 1 / 252),
        getOptionImpact('call', 100, 12, vol, 0, 3 / 252),
    ];
    resetPortfolio(); resetImpactState(); syncFixed(11);
    const k9Cash = portfolio.cash, k9Trades = portfolio.totalTrades;
    const poolsBefore = poolSnapshot();
    // Expiry 10 with currentDay 11: the option outlived its contract inside the
    // latency window. Trigger price 200 >= spot, so the limit order fires.
    placePendingOrder(null, null, null, 'limit', 200, null, null, 'Covered Call', coveredCall(10), 1);
    const k9Filled = checkPendingOrders(null, S0, vol, 0.03, 11, 0);
    const poolsAfter = poolSnapshot();
    check('K9: a rollover-expired bundle is DROPPED whole -- cash, positions and trade count untouched',
        k9Filled.length === 0 && portfolio.positions.length === 0
        && portfolio.cash === k9Cash && portfolio.totalTrades === k9Trades
        && portfolio.orders.length === 0,
        `filled ${k9Filled.length}, pos ${portfolio.positions.length}, cashDelta ${portfolio.cash - k9Cash}, trades ${portfolio.totalTrades - k9Trades}`);
    check('K9: EVERY impact pool is bitwise unmoved -- the stock leg never fills',
        poolsAfter.every((p, i) => p === poolsBefore[i]),
        `before [${poolsBefore.join(', ')}] after [${poolsAfter.join(', ')}]`);
    // Positive control: the SAME bundle on a LIVE expiry still fills both legs and
    // does move the stock pool -- the preflight rejects contracts, not strategies.
    resetPortfolio(); resetImpactState(); syncFixed(11);
    placePendingOrder(null, null, null, 'limit', 200, null, null, 'Covered Call', coveredCall(12), 1);
    const k9Live = checkPendingOrders(null, S0, vol, 0.03, 11, 0);
    check('K9: the same bundle on a live expiry fills both legs (the gate is the contract, not the bundle)',
        k9Live.length === 2 && portfolio.positions.length === 2
        && getStockImpact(vol) !== 0,
        `filled ${k9Live.length}, stock pool ${getStockImpact(vol)}`);
    resetPortfolio(); resetImpactState(); syncFixed(0);
}

// =====================================================================
// L. Presentation degradation is INVISIBLE to every headless number
// =====================================================================
let latchTrajOK = false, latchHeldSubsteps = 0;
{
    // -- L1. Hold arithmetic ---------------------------------------------
    resetAct3();
    setMachineParam(1);
    check('L1: chain hold = floor(d * 6) substeps', chainHoldSubsteps() === 6);
    setMachineParam(0.75);
    check('L1: chain hold scales with d (d = 0.5 -> 3 substeps)', chainHoldSubsteps() === 3);
    setMachineParam(0.5);
    check('L1: no hold at or below the knee', chainHoldSubsteps() === 0);
    // VXHCN publication: truth below the gate, held above it.
    setMachineParam(0.5);
    advanceVxhcnPublication(20, 0.04, substepClock());
    check('L1: below the staleness gate the index publishes truth',
        publishedVxhcn(21) === 21 && publishedVariance(0.05) === 0.05 && !vxhcnPublicationStale());
    setMachineParam(1);
    resetAct3(); setMachineParam(1);
    advanceVxhcnPublication(20, 0.04, substepClock());     // first print
    let held = 0;
    for (let i = 0; i < 12; i++) {
        tickSubstepClock();
        if (advanceVxhcnPublication(20 + i + 1, 0.05 + i, substepClock())) held++;
    }
    latchHeldSubsteps = held;
    check('L1: the index holds its print for 2-6 substeps at a time (never forever)',
        held > 0 && held < 12, `${held} of 12 substeps stale`);
    check('L1: a stale publication reports the LAST print, not the live value',
        publishedVxhcn(999) !== 999 || !vxhcnPublicationStale());
    // Idempotent within a substep: the display path may run twice.
    const before = publishedVxhcn(0);
    advanceVxhcnPublication(1234, 0.99, substepClock());
    check('L1: the latch is idempotent per substep clock', publishedVxhcn(0) === before);

    // -- L2. The latch never reaches a valuation --------------------------
    // A fixed book walked down a deterministic path, twice: once with the
    // degradation latches forced ON and exercised every step, once at rest. Every
    // headless number -- unitPrice, portfolioValue, the VXHCN spot -- must agree
    // BITWISE. (The latches live in the display path; this is the regression
    // guard against anyone ever wiring one into a price.)
    function trajectory(forceD) {
        resetAct3();
        resetPortfolio();
        resetImpactState();
        if (forceD) setMachineParam(1);
        syncFixed(0);
        executeMarketOrder(null, 'stock', 'long', 5, 100, 0.2, 0.03, 0, undefined, undefined, undefined, 0);
        executeMarketOrder(null, 'call', 'long', 2, 100, 0.2, 0.03, 0, 100, 42, undefined, 0);
        executeMarketOrder(null, 'vxhcnfuture', 'short', 1, 100, 0.2, 0.03, 0, undefined, 42, undefined, 0);
        executeMarketOrder(null, 'bond', 'long', 3, 100, 0.2, 0.03, 0, undefined, 42, undefined, 0);
        const out = [];
        for (let step = 1; step <= 64; step++) {
            const S = 100 * Math.exp(Math.sin(step / 7) * 0.05);
            const v = 0.04 + 0.01 * Math.cos(step / 5);
            const day = Math.floor(step / 16);
            syncMarket({ ...FIXED_MARKET, S, v, day });
            market.day = day;
            if (forceD) {
                // Exercise the display boundary exactly as main.js does.
                tickSubstepClock();
                advanceVxhcnPublication(computeVXHCNSpot(v, market.kappa, market.theta, market.xi), v, substepClock());
                publishedVariance(v);
                publishedChain({ day: 42, dte: 42 - day, options: [{ strike: 100, call: { bid: 1, ask: 2 }, put: { bid: 3, ask: 4 } }] }, substepClock());
            }
            out.push(portfolioValue(S, Math.sqrt(v), FIXED_MARKET.r, day, 0));
            out.push(unitPrice('vxhcnfuture', S, Math.sqrt(v), FIXED_MARKET.r, day, undefined, 42, 0));
            out.push(computeVXHCNSpot(v, market.kappa, market.theta, market.xi));
        }
        return out;
    }
    const trajRest = trajectory(false);
    const trajStale = trajectory(true);
    latchTrajOK = trajRest.length === trajStale.length
        && trajRest.every((x, i) => x === trajStale[i]);
    check('L2: portfolio / mark / index trajectories are BITWISE identical with degradation forced on',
        latchTrajOK, `${trajRest.length} sampled numbers`);
    resetAct3(); resetPortfolio(); resetImpactState();

    // -- L3. Classic inertness: the whole surface is dead code ------------
    resetAct3();
    let randomCalls = 0;
    const realRandom = Math.random;
    Math.random = () => { randomCalls++; return realRandom(); };
    let repaintNonzero = 0, skipped = 0;
    for (let i = 0; i < 2000; i++) {
        if (rollCandleRepaint(100) !== 0) repaintNonzero++;
        if (skipSparklineFrame()) skipped++;
    }
    check('L3: at rest the degradation produces NO effect at all',
        repaintNonzero === 0 && skipped === 0
        && chainHoldSubsteps() === 0 && publishedVxhcn(7) === 7 && publishedVariance(9) === 9);
    // ...and even at FULL degradation it never touches the shared Math.random the
    // price path and the event cadence draw from: the display failing may not move
    // the market. (act3.js owns a fixed-seed display substream.)
    setMachineParam(1);
    for (let i = 0; i < 2000; i++) { rollCandleRepaint(100); skipSparklineFrame(); }
    Math.random = realRandom;
    check('L3: the degradation NEVER draws from the shared Math.random stream',
        randomCalls === 0, `${randomCalls} Math.random calls over 4000 rolls`);
    resetAct3();
    check('L3: at rest the ladder is the pre-P7 path and nothing is working',
        orderLatency(0, 'private').lag === 0 && workingOrderCount() === 0);
    // Reduced motion silences the STUTTER and keeps the STALENESS.
    setMachineParam(1);
    setReducedMotion(true);
    let rmRepaint = 0, rmSkip = 0;
    for (let i = 0; i < 2000; i++) {
        if (rollCandleRepaint(100) !== 0) rmRepaint++;
        if (skipSparklineFrame()) rmSkip++;
    }
    check('L3: reduced motion drops the repaint + frame-skip, keeps the hold latches',
        rmRepaint === 0 && rmSkip === 0 && chainHoldSubsteps() === 6);
    setReducedMotion(false);
    // ...and at full degradation the stutter is actually live (the effect exists).
    let liveRepaint = 0;
    for (let i = 0; i < 20000; i++) if (rollCandleRepaint(100) !== 0) liveRepaint++;
    check('L3: at d = 1 the transient repaint fires at ~p = 0.04/substep',
        liveRepaint > 500 && liveRepaint < 1200, `${liveRepaint}/20000`);
    // Glitch severity: cluster-scaled and wall-clock rate limited.
    resetAct3();
    check('L4: a lone incident never reaches the audio chain',
        (noteDegradationIncident(), takeGlitchSeverity(1e9)) === 0);
    noteDegradationIncident();
    const sev1 = takeGlitchSeverity(1e9);
    for (let i = 0; i < 6; i++) noteDegradationIncident();
    const sevBlocked = takeGlitchSeverity(1e9 + 1000);      // inside the 15s limit
    const sev3 = takeGlitchSeverity(1e9 + 20000);
    check('L4: cluster size sets severity 1..3, wall-clock rate limit >= 15s holds',
        sev1 === 1 && sevBlocked === 0 && sev3 === 3, `${sev1} / ${sevBlocked} / ${sev3}`);
    resetAct3();
}

// =====================================================================
// M. Standing orders -- the delegation layer (P7-2)
// =====================================================================
let soRandomCalls = 0, soFillGap = '';
const soFiredRules = new Set();
{
    // ---- Fixtures ------------------------------------------------------
    // Every rule evaluation in this section routes through these two wrappers, so
    // the report can tally which rules actually EXECUTED across the whole block
    // (standingExecutionCount is per-run and armOnly resets it by design).
    const soDay = (ctx) => { const r = runDayBoundaryRules(ctx); for (const x of r) if (x.legs > 0) soFiredRules.add(x.rule); return r; };
    const soSub = (ctx) => { const r = runSubstepRules(ctx); for (const x of r) if (x.legs > 0) soFiredRules.add(x.rule); return r; };
    const SO_VOL = 0.2, SO_RATE = 0.03;
    const soCtx = (day = 0, S = 100) => ({ sim: null, S, vol: SO_VOL, r: SO_RATE, day, q: 0 });
    const det = (id, severity) => ({ id, severity, source: 'halcyon', cls: 'capability', occurDay: 0, detectDay: 0, lag: 0 });
    const ledger = ({ detected = [], certifications = [] } = {}) => ({
        incidents: { occurred: [], detected }, certifications,
    });
    const qtyOf = (t) => { const p = portfolio.positions.find(x => x.type === t); return p ? p.qty : 0; };
    function armOnly(...ids) {
        resetStandingOrders();
        syncStandingOrders(STANDING_TUNING.unlockRung);
        for (const id of ids) setArmed(id, true);
    }
    function threeLegBook() {
        resetPortfolio(); resetImpactState(); syncFixed(0);
        executeMarketOrder(null, 'stock', 'long', 4, 100, SO_VOL, SO_RATE, 0, undefined, undefined, undefined, 0);
        executeMarketOrder(null, 'call', 'long', 2, 100, SO_VOL, SO_RATE, 0, 100, 42, undefined, 0);
        executeMarketOrder(null, 'bond', 'long', 2, 100, SO_VOL, SO_RATE, 0, undefined, 42, undefined, 0);
    }
    const tightMargin = { triggered: true, equity: 100, required: 95 };    // utilization 0.95
    const looseMargin = { triggered: false, equity: 100, required: 50 };   // utilization 0.50

    // -- M1. Unlock / lock / reset semantics -----------------------------
    resetStandingOrders();
    check('M1: a fresh run has nothing armed, nothing unlocked, nothing locked',
        !standingOrdersUnlocked() && !standingOrdersLocked() && armedRuleIds().length === 0);
    check('M1: arming is refused before the released-R3 unlock',
        setArmed('severity_cut', true) === false && !isArmed('severity_cut'));
    syncStandingOrders(2);
    check('M1: R2 does not unlock the panel',
        !standingOrdersUnlocked() && setArmed('severity_cut', true) === false);
    syncStandingOrders(3);
    check('M1: released R3 unlocks and arming takes',
        standingOrdersUnlocked() && setArmed('severity_cut', true) === true && isArmed('severity_cut'));
    check('M1: an unknown rule id is refused', setArmed('not_a_rule', true) === false);
    syncStandingOrders(4);
    check('M1: R4 is still EDITABLE',
        !standingOrdersLocked() && setArmed('blockade_halve', true) === true);
    syncStandingOrders(5);
    check('M1: released R5 LOCKS the armed set -- arming AND disarming both refused',
        standingOrdersLocked()
        && setArmed('cert_harvest', true) === false && !isArmed('cert_harvest')
        && setArmed('severity_cut', false) === false && isArmed('severity_cut'));
    syncStandingOrders(3);
    check('M1: the lock LATCHES for the run (a lower rung cannot re-open it)',
        standingOrdersLocked());
    const soView = standingOrdersView();
    check('M1: the view model carries all six rules with their FIXED params + lock state',
        STANDING_RULES.length === 6 && soView.rules.length === 6 && soView.locked === true
        && soView.rules.every(r => r.label && r.param && r.when)
        && soView.rules.find(r => r.id === 'severity_cut').armed === true
        && soView.rules.find(r => r.id === 'cert_harvest').armed === false);
    resetStandingOrders();
    check('M1: reset clears arming, unlock and lock (precommitments are authored per RUN)',
        armedRuleIds().length === 0 && !standingOrdersUnlocked() && !standingOrdersLocked());

    // -- M2. (a) severity >= 3 detection -> cut gross 50% ----------------
    armOnly('severity_cut');
    threeLegBook();
    let reps = soDay({ ...soCtx(), transitions: ledger({ detected: [det('m2a', 2)] }), blockade: false });
    check('M2: a severity-2 detection does not trip the cut',
        reps.length === 0 && qtyOf('stock') === 4 && qtyOf('call') === 2 && qtyOf('bond') === 2);
    reps = soDay({ ...soCtx(), transitions: ledger({ detected: [det('m2b', 3)] }), blockade: false });
    check('M2: a severity-3 DETECTION cuts every open leg by half, machinery-instant',
        reps.length === 1 && reps[0].rule === 'severity_cut' && reps[0].legs === 3
        && qtyOf('stock') === 2 && qtyOf('call') === 1 && qtyOf('bond') === 1
        && workingOrderCount() === 0,
        `legs ${reps[0] ? reps[0].legs : '--'}, stock ${qtyOf('stock')}`);
    reps = soDay({ ...soCtx(), transitions: ledger({ detected: [det('m2b', 3)] }), blockade: false });
    check('M2: the same incident id never fires twice (one fire per episode)',
        reps.length === 0 && qtyOf('stock') === 2);
    reps = soDay({ ...soCtx(), transitions: ledger({ detected: [det('m2c', 3), det('m2d', 4)] }), blockade: false });
    check('M2: two grave detections in ONE tick collapse to one cut (never 75%)',
        reps.length === 1 && qtyOf('stock') === 1,
        `stock ${qtyOf('stock')}, positions ${portfolio.positions.length}`);
    check('M2: a 1-lot leg cannot be halved -- it flattens (rounding on the risk-reducing side)',
        qtyOf('call') === 0 && qtyOf('bond') === 0 && portfolio.positions.length === 1);

    // -- M3. (b) blockade ONSET -> halve the HCN stock leg ---------------
    armOnly('blockade_halve');
    resetPortfolio(); resetImpactState(); syncFixed(0);
    executeMarketOrder(null, 'stock', 'long', 4, 100, SO_VOL, SO_RATE, 0, undefined, undefined, undefined, 0);
    executeMarketOrder(null, 'bond', 'long', 2, 100, SO_VOL, SO_RATE, 0, undefined, 42, undefined, 0);
    reps = soDay({ ...soCtx(), transitions: ledger(), blockade: false });
    check('M3: no blockade, no fire', reps.length === 0 && qtyOf('stock') === 4);
    reps = soDay({ ...soCtx(), transitions: ledger(), blockade: true });
    check('M3: the blockade ONSET halves the HCN stock leg and touches nothing else',
        reps.length === 1 && reps[0].rule === 'blockade_halve'
        && qtyOf('stock') === 2 && qtyOf('bond') === 2);
    reps = soDay({ ...soCtx(), transitions: ledger(), blockade: true });
    check('M3: a persistent blockade does not re-fire (the episode is the onset)',
        reps.length === 0 && qtyOf('stock') === 2);
    soDay({ ...soCtx(), transitions: ledger(), blockade: false });
    reps = soDay({ ...soCtx(), transitions: ledger(), blockade: true });
    check('M3: a lift followed by a new closure is a NEW episode',
        reps.length === 1 && qtyOf('stock') === 1);
    resetStandingOrders();
    syncStandingOrders(3);
    soDay({ ...soCtx(), transitions: ledger(), blockade: true });   // edge consumed while disarmed
    setArmed('blockade_halve', true);
    reps = soDay({ ...soCtx(), transitions: ledger(), blockade: true });
    check('M3: arming mid-blockade does not fire on a closure that already happened',
        reps.length === 0 && qtyOf('stock') === 1);

    // -- M4. (c) the liquidation PREFERENCE (consumed, never fired) ------
    armOnly('bonds_first');
    check('M4: the preference is null below the 80% utilization gate, ["bond"] above it',
        standingLiquidationOrder(looseMargin) === null
        && (standingLiquidationOrder(tightMargin) || [])[0] === 'bond'
        && standingLiquidationOrder(null) === null);
    setArmed('bonds_first', false);
    check('M4: disarmed -> no preference at all (the chassis order stands)',
        standingLiquidationOrder(tightMargin) === null);
    setArmed('bonds_first', true);
    resetPortfolio(); resetImpactState(); syncFixed(0);
    executeMarketOrder(null, 'stock', 'long', 1, 100, SO_VOL, SO_RATE, 0, undefined, undefined, undefined, 0);
    executeMarketOrder(null, 'bond', 'long', 1, 100, SO_VOL, SO_RATE, 0, undefined, 42, undefined, 0);
    executeMarketOrder(null, 'call', 'long', 1, 100, SO_VOL, SO_RATE, 0, 100, 42, undefined, 0);
    executeMarketOrder(null, 'bond', 'long', 1, 100, SO_VOL, SO_RATE, 0, undefined, 63, undefined, 0);
    const seq = liquidationSequence(standingLiquidationOrder(tightMargin));
    check('M4: the armed preference hoists BOTH bonds to the front of the liquidation sequence',
        seq != null && seq.length === 4 && seq[0].type === 'bond' && seq[1].type === 'bond'
        && !seq.slice(2).some(p => p.type === 'bond'),
        seq ? seq.map(p => p.type).join(',') : 'null');
    check('M4: within a type the chassis descending-index order survives (stable)',
        seq[0].expiryDay === 63 && seq[1].expiryDay === 42);
    check('M4: no preference -> null sequence, so liquidateAll keeps its original loop',
        liquidationSequence(null) === null && liquidationSequence([]) === null
        && liquidationSequence(['vxhcnfuture']) === null);
    const soLiq = liquidateAll(null, 100, SO_VOL, SO_RATE, 0, 0, standingLiquidationOrder(tightMargin));
    check('M4: a preference-ordered forced liquidation still flattens the whole book',
        soLiq.stuck.length === 0 && portfolio.positions.length === 0);

    // -- M5. (d) certification -> harvest ITM long binaries --------------
    {
        armOnly('cert_harvest');
        const soRace = createRaceState(4242);
        initConsensus(soRace); initBelief(soRace);
        refreshBinaryQuotes(soRace);
        resetPortfolio(); resetImpactState(); syncFixed(0);
        const kIn = consensus.contracts[0].key;
        const kOut = consensus.contracts[1].key;
        const kShort = consensus.contracts[2].key;
        const setQuote = (k, mid) => {
            const q = consensus.quotes[k];
            q.mid = mid; q.bid = Math.max(0, mid - 0.02); q.ask = Math.min(1, mid + 0.02);
        };
        executeBinaryTrade(kIn, 'long', 1);
        executeBinaryTrade(kOut, 'long', 1);
        executeBinaryTrade(kShort, 'short', 1);
        setQuote(kIn, 0.70); setQuote(kOut, 0.30); setQuote(kShort, 0.70);
        const binAt = (k) => portfolio.positions.find(p => p.type === 'binary' && p.strike === k);
        const openedAll = !!binAt(kIn) && !!binAt(kOut) && !!binAt(kShort);
        reps = soDay({
            ...soCtx(), blockade: false,
            transitions: ledger({ certifications: [{ lab: 'halcyon', rung: 3, direct: true }] }),
        });
        check('M5: a certification sells the ITM LONG only -- the OTM long and the ITM short stay',
            openedAll && reps.length === 1 && reps[0].rule === 'cert_harvest' && reps[0].legs === 1
            && !binAt(kIn) && !!binAt(kOut) && !!binAt(kShort)
            && workingOrderCount() === 0,
            `reps ${reps.length}, legs ${reps[0] ? reps[0].legs : '--'}`);
        reps = soDay({
            ...soCtx(), blockade: false,
            transitions: ledger({ certifications: [{ lab: 'halcyon', rung: 3, direct: true }] }),
        });
        check('M5: the same certification (lab:rung) never harvests twice',
            reps.length === 0 && !!binAt(kOut) && !!binAt(kShort));
        executeBinaryTrade(kIn, 'long', 1);
        reps = soDay({
            ...soCtx(), blockade: false,
            transitions: ledger({ certifications: [{ lab: 'halcyon', rung: 4, direct: false, impliedBy: 4 }] }),
        });
        check('M5: a DIFFERENT certification is a new episode (implied certs count)',
            reps.length === 1 && !binAt(kIn));
        deactivateConsensus(); deactivateBelief();
        resetPortfolio(); resetImpactState();
    }

    // -- M6. (f) delta flatten at a substep boundary ---------------------
    armOnly('delta_flatten');
    resetPortfolio(); resetImpactState(); syncFixed(0);
    executeMarketOrder(null, 'stock', 'long', 40, 100, SO_VOL, SO_RATE, 0, undefined, undefined, undefined, 0);
    let r6 = soSub({ ...soCtx(0, 103), dayOpen: 100 });
    check('M6: a 3% move does not trip the flatten',
        r6.length === 0 && computeNetDelta() === 40);
    syncMarket({ ...FIXED_MARKET, S: 109 }); market.day = 0;
    r6 = soSub({ ...soCtx(0, 109), dayOpen: 100 });
    check('M6: an 8%+ move flattens net delta into +-20 with one machinery-instant trade',
        r6.length === 1 && r6[0].rule === 'delta_flatten'
        && Math.abs(computeNetDelta()) <= STANDING_TUNING.deltaBand
        && workingOrderCount() === 0,
        `delta ${computeNetDelta()} (was ${r6[0] ? r6[0].netBefore : '--'})`);
    r6 = soSub({ ...soCtx(0, 112), dayOpen: 100 });
    check('M6: at most ONE flatten per day, however long the condition persists',
        r6.length === 0 && computeNetDelta() === 20);
    executeMarketOrder(null, 'stock', 'long', 15, 109, SO_VOL, SO_RATE, 0, undefined, undefined, undefined, 0);
    r6 = soSub({ ...soCtx(1, 109), dayOpen: 100 });
    check('M6: a NEW day is a new episode',
        r6.length === 1 && Math.abs(computeNetDelta()) <= STANDING_TUNING.deltaBand);
    r6 = soSub({ ...soCtx(2, 130), dayOpen: 100 });
    check('M6: a book already inside the band never trades, however big the move',
        r6.length === 0 && computeNetDelta() === 20);
    resetPortfolio(); resetImpactState(); syncFixed(0);

    // The BOUNDARY, both directions (sol gate P1). The rule is specified as
    // strictly GREATER than 8%, and the two directions must agree: the return form
    // |S/open - 1| does NOT, because IEEE rounds 108/100 - 1 to 0.08000000000000007
    // (above the gate) and 92/100 - 1 to 0.07999999999999996 (below it), so an exact
    // +8% fired while an exact -8% did not. The engine compares absolute
    // displacement against open * moveGate, which is symmetric by construction.
    // Each probe re-arms (resetting the once-a-day episode) and rebuilds a book far
    // outside the delta band, so the ONLY gate under test is the move gate.
    {
        const moveProbe = (S) => {
            armOnly('delta_flatten');
            resetPortfolio(); resetImpactState(); syncFixed(0);
            executeMarketOrder(null, 'stock', 'long', 40, 100, SO_VOL, SO_RATE, 0, undefined, undefined, undefined, 0);
            syncMarket({ ...FIXED_MARKET, S }); market.day = 0;
            const fired = soSub({ ...soCtx(0, S), dayOpen: 100 }).length > 0;
            syncFixed(0);
            return fired;
        };
        const upExact = moveProbe(108), downExact = moveProbe(92);
        const upOver = moveProbe(108.001), downOver = moveProbe(91.999);
        const upUnder = moveProbe(107.999), downUnder = moveProbe(92.001);
        check('M6: an EXACT +-8% move does not fire (the gate is strictly greater)',
            upExact === false && downExact === false,
            `+8% ${upExact} / -8% ${downExact}`);
        check('M6: just OVER +-8% fires in both directions (symmetric boundary)',
            upOver === true && downOver === true,
            `+8.001% ${upOver} / -8.001% ${downOver}`);
        check('M6: just UNDER +-8% fires in neither direction',
            upUnder === false && downUnder === false,
            `+7.999% ${upUnder} / -7.999% ${downUnder}`);
        resetPortfolio(); resetImpactState(); syncFixed(0);
    }

    // -- M7. (e) the interception surface (main.js owns the queue half) ---
    armOnly('tip_autosit');
    check('M7: the interception gate follows the arm state', tipAutoSitArmed() === true);
    portfolio.restricted = true;
    check('M7: a restricted book silences the interception too', tipAutoSitArmed() === false);
    portfolio.restricted = false;
    {
        const tip = getEventById('insider_tip');
        const sit = ((tip && tip.choices) || []).find(c => c.playerFlag === 'sat_on_insider_tip');
        // main.js identifies the SIT verb by this playerFlag and does NOT intercept
        // when it cannot be found -- so the flag, and the declarative consequence
        // behind it, are part of the contract.
        check('M7: the insider tip still carries a SIT choice findable by playerFlag',
            !!tip && !!sit && !!tip.popup && tip.category === 'insider' && tip.choices.length === 3);
        check('M7: the sit verb\'s declarative consequence is non-empty (shifts, followups, toast)',
            !!sit && Array.isArray(sit.factionShifts) && sit.factionShifts.length > 0
            && Array.isArray(sit.followups) && sit.followups.length > 0 && !!sit.resultToast);
    }
    // The FEED contract behind the interception's own log repaint (sol gate P1). An
    // intercepted tip is logged by `_fireEvent` at fire time -- so the feed CONTENT
    // exists -- but the day-boundary path repaints the log DOM only for a superevent
    // popup or a non-popup fire. Both cases Codex named are ordinary queued popups:
    // the tip ALONE, and the tip alongside another ordinary popup. Neither produces a
    // `fired` entry and neither is a superevent, so no day-boundary repaint happens
    // and `_interceptByStandingOrder` must repaint itself.
    {
        const eng = new EventEngine('offline');
        const tipShell = { ...getEventById('insider_tip') };
        const ordinary = new EventEngine('offline')._pools.random
            .find(e => e.popup && e.choices && !e.superevent && e.id !== 'insider_tip');
        const log0 = eng.eventLog.length;
        const rTip = eng._fireEvent(tipShell, { day: 10 }, 10, 0, 0);
        const afterTipAlone = eng.eventLog.length;
        const rOther = ordinary ? eng._fireEvent({ ...ordinary }, { day: 10 }, 10, 0, 0) : null;
        check('M7: an intercepted tip is in the event log the moment it fires (alone)',
            rTip.queued === true && afterTipAlone === log0 + 1
            && eng.eventLog[afterTipAlone - 1].category === 'insider'
            && eng.eventLog[afterTipAlone - 1].headline === tipShell.headline,
            `log ${log0} -> ${afterTipAlone}`);
        check('M7: tip + an ordinary popup log BOTH, and NEITHER reaches the `fired` lane',
            !!ordinary && rOther.queued === true && eng.eventLog.length === log0 + 2
            && !tipShell.superevent && !ordinary.superevent,
            `ordinary ${ordinary ? ordinary.id : 'none'}, log ${eng.eventLog.length - log0}`);
    }
    freezeStandingOrders();
    check('M7: the terminal freeze silences the interception', tipAutoSitArmed() === false);

    // -- M8. Restriction / terminal / inertness / determinism ------------
    armOnly('severity_cut', 'blockade_halve', 'cert_harvest', 'delta_flatten');
    threeLegBook();
    portfolio.restricted = true;
    reps = soDay({ ...soCtx(), transitions: ledger({ detected: [det('m8a', 4)] }), blockade: true });
    let sub8 = soSub({ ...soCtx(0, 120), dayOpen: 100 });
    check('M8: a restricted book fires nothing and trades nothing',
        reps.length === 0 && sub8.length === 0 && qtyOf('stock') === 4 && qtyOf('bond') === 2);
    portfolio.restricted = false;
    freezeStandingOrders();
    reps = soDay({ ...soCtx(), transitions: ledger({ detected: [det('m8b', 4)] }), blockade: true });
    sub8 = soSub({ ...soCtx(0, 120), dayOpen: 100 });
    check('M8: past the terminal latch the engine is inert and arming is refused',
        reps.length === 0 && sub8.length === 0 && qtyOf('stock') === 4
        && setArmed('severity_cut', false) === false
        && standingLiquidationOrder(tightMargin) === null);
    resetStandingOrders();
    syncStandingOrders(5);
    reps = soDay({ ...soCtx(), transitions: ledger({ detected: [det('m8c', 4)] }), blockade: true });
    sub8 = soSub({ ...soCtx(0, 120), dayOpen: 100 });
    check('M8: nothing armed -> a full no-op even against a live ledger (Classic never even calls in)',
        reps.length === 0 && sub8.length === 0 && qtyOf('stock') === 4
        && standingLiquidationOrder(tightMargin) === null);

    // The engine draws NO randomness: standing orders are deterministic
    // consequences of public state, so the price path is untouched by them.
    {
        const realRandom = Math.random;
        Math.random = () => { soRandomCalls++; return realRandom(); };
        armOnly('severity_cut', 'blockade_halve', 'delta_flatten');
        threeLegBook();
        soDay({ ...soCtx(), transitions: ledger({ detected: [det('m8d', 4)] }), blockade: true });
        syncMarket({ ...FIXED_MARKET, S: 112 }); market.day = 0;
        soSub({ ...soCtx(0, 112), dayOpen: 100 });
        Math.random = realRandom;
        check('M8: the engine draws NO randomness',
            soRandomCalls === 0, `${soRandomCalls} Math.random calls`);
        syncFixed(0);
    }

    // A standing execution pays the PRE-P7 spread: it is machinery, so the P7-1
    // ladder widening (x1.5 at R5 + mobilized) must never reach its fill.
    {
        const buy4 = () => {
            resetPortfolio(); resetImpactState(); syncFixed(0);
            executeMarketOrder(null, 'stock', 'long', 4, 100, SO_VOL, SO_RATE, 0, undefined, undefined, undefined, 0);
            return portfolio.cash;
        };
        armOnly('blockade_halve');
        let cash0 = buy4();
        soDay({ ...soCtx(), transitions: ledger(), blockade: true });
        const standingProceeds = portfolio.cash - cash0;
        cash0 = buy4();
        executeMarketOrder(null, 'stock', 'short', 2, 100, SO_VOL, SO_RATE, 0, undefined, undefined, undefined, 0);
        const manualPlain = portfolio.cash - cash0;
        cash0 = buy4();
        executeMarketOrder(null, 'stock', 'short', 2, 100, SO_VOL, SO_RATE, 0, undefined, undefined, undefined, 0, 1.5);
        const manualWidened = portfolio.cash - cash0;
        soFillGap = `${standingProceeds.toFixed(6)} vs manual ${manualPlain.toFixed(6)} / widened ${manualWidened.toFixed(6)}`;
        check('M8: a standing execution fills at the pre-P7 spread, never the ladder\'s widening',
            standingProceeds === manualPlain && standingProceeds > manualWidened, soFillGap);
    }

    // -- M9. Reset clears episode memory ---------------------------------
    armOnly('severity_cut');
    threeLegBook();
    soDay({ ...soCtx(), transitions: ledger({ detected: [det('m9', 3)] }), blockade: false });
    const firedOnce = qtyOf('stock') === 2;
    armOnly('severity_cut');       // = reset + unlock + arm (a fresh run)
    threeLegBook();
    reps = soDay({ ...soCtx(), transitions: ledger({ detected: [det('m9', 3)] }), blockade: false });
    check('M9: reset clears episode memory -- a fresh run re-fires on the same trigger id',
        firedOnce && reps.length === 1 && qtyOf('stock') === 2);
    check('M9: every acting rule executed at least once in this section',
        ['severity_cut', 'blockade_halve', 'cert_harvest', 'delta_flatten'].every(r => soFiredRules.has(r)),
        [...soFiredRules].join(', '));
    resetStandingOrders();
    resetPortfolio(); resetImpactState(); syncFixed(0);
}

// =====================================================================
// N. P7-3: the room, the blackout, the backchannel, the intel
// =====================================================================
let roomReachFrac = 0, roomVoiceHist = '', roomLeaderMix = '';
let tipPrivateRate = 0, tipClassifiedRate = 0, blackoutStreamOK = true, blackoutRecordsOK = true;
let intelTruthRate = 0, intelAdjacencyOK = true, intelIdentOK = true;
{
    // -- N1. The room's race-side predicate ------------------------------
    check('N1: room trigger level is R5 - 0.15 = 4.85 (02a verbatim)',
        ROOM_RUNG === 5 && ROOM_MARGIN === 0.15 && Math.abs(ROOM_TRIGGER_C - 4.85) < 1e-12,
        `${ROOM_TRIGGER_C}`);
    check('N1: predicate false for a null race (Classic never convenes a room)',
        roomTriggerReady(null) === false && roomTriggerReady(undefined) === false);
    {
        const race = createRaceState(777);
        check('N1: predicate false at run start', roomTriggerReady(race) === false);
        // EXACT threshold behaviour, on the leader whoever it is: just under is
        // closed, exactly at the level is open.
        race.capability.labs.halcyon.C_internal = ROOM_TRIGGER_C - 1e-9;
        const justUnder = roomTriggerReady(race);
        race.capability.labs.halcyon.C_internal = ROOM_TRIGGER_C;
        const atLevel = roomTriggerReady(race);
        check('N1: predicate opens exactly AT the threshold, not below',
            justUnder === false && atLevel === true);
        // It is the LEADER, not Halcyon: an unspawned lab cannot trigger it, a
        // spawned rival can.
        const race2 = createRaceState(778);
        race2.capability.labs.polaris.C_internal = ROOM_TRIGGER_C + 0.2;
        const inactiveLeader = roomTriggerReady(race2);
        race2.capability.labs.polaris.active = true;
        check('N1: the LEADER triggers it -- an inactive lab does not, an active rival does',
            inactiveLeader === false && roomTriggerReady(race2) === true);
    }
    // -- N1b. ONE helper, both facts: `ready` + `leaderLab` (02a ruling 3) ---
    {
        check('N1b: roomTrigger is total on a null race (no leader, not ready)',
            JSON.stringify(roomTrigger(null)) === '{"ready":false,"leaderLab":null}'
            && roomTriggerReady(null) === false);
        // `ready` must agree with the frontier-internal predicate at every state,
        // and `leaderLab` must BE the argmax -- checked against an independent
        // traversal over many advanced states.
        let readyAgrees = true, leaderIsArgmax = true, sawTianxiaLead = false, sawPolarisLead = false;
        for (let i = 0; i < Math.min(N, 300); i++) {
            const race = createRaceState((BASE_SEED + 8000 + i) >>> 0);
            for (let d = 0; d < HORIZON; d += 60) {
                for (let k = 0; k < 60; k++) advanceRace(race);
                const t = roomTrigger(race);
                const cap = race.capability;
                if (t.ready !== (frontierInternal(cap) >= ROOM_TRIGGER_C)) readyAgrees = false;
                let best = -Infinity;
                for (const id of ['halcyon', 'tianxia', 'polaris']) {
                    const lab = cap.labs[id];
                    if (lab.active) best = Math.max(best, lab.C_internal);
                }
                if (cap.labs[t.leaderLab].C_internal !== best) leaderIsArgmax = false;
                if (t.leaderLab === 'tianxia') sawTianxiaLead = true;
                if (t.leaderLab === 'polaris') sawPolarisLead = true;
            }
        }
        check('N1b: `ready` agrees with frontierInternal >= 4.85 at every sampled state', readyAgrees);
        check('N1b: `leaderLab` IS the argmax over active labs, at every sampled state', leaderIsArgmax);
        // Tianxia leads organically in some worlds; Polaris spawns 0.6 BEHIND
        // Halcyon and never leads on its own (measured: 0% of trigger days), so the
        // polaris branch is exercised on a forced state instead of pretended into MC.
        const forcedPolaris = createRaceState(780);
        forcedPolaris.capability.labs.polaris.active = true;
        forcedPolaris.capability.labs.polaris.C_internal = 5.1;
        check('N1b: Tianxia leads in some worlds; the Polaris branch resolves when forced',
            sawTianxiaLead && sawPolarisLead === false
            && roomTrigger(forcedPolaris).leaderLab === 'polaris',
            `polaris never leads organically (${sawPolarisLead ? 'saw one' : 'none seen'})`);
        // Tie resolution: the shared iteration order (halcyon first) decides.
        const tie = createRaceState(779);
        tie.capability.labs.halcyon.C_internal = 5.0;
        tie.capability.labs.tianxia.C_internal = 5.0;
        check('N1b: an exact tie keeps the earlier lab in the shared iteration order',
            roomTrigger(tie).leaderLab === 'halcyon');
    }
    // Reachability (a REPORT, not a band -- 02a fixes no room incidence): how often
    // does a run reach the branch point at all, before the world resolves?
    {
        const ROOM_N = Math.min(N, 600);
        let reached = 0;
        const leaderTally = { halcyon: 0, tianxia: 0, polaris: 0 };
        for (let i = 0; i < ROOM_N; i++) {
            const race = createRaceState((BASE_SEED + 4000 + i) >>> 0);
            let sawRoom = false;
            for (let d = 0; d < HORIZON && !race.resolution; d++) {
                advanceRace(race);
                stepControlRegime(race); stepTreaty(race, {});
                checkResolution(race, null);
                const t = roomTrigger(race);
                if (!race.resolution && t.ready) { sawRoom = true; leaderTally[t.leaderLab]++; break; }
            }
            if (sawRoom) reached++;
        }
        roomReachFrac = reached / ROOM_N;
        roomLeaderMix = Object.entries(leaderTally)
            .map(([k, v]) => `${k} ${reached ? pct(v / reached) : '0%'}`).join(' / ');
        check('N1: the room is reachable and is NOT every run (a real branch point)',
            roomReachFrac > 0 && roomReachFrac < 1, `${pct(roomReachFrac)} of ${ROOM_N} runs`);
        // BOTH rooms are live: some worlds convene it with an American lab about to
        // cross, some with Beijing about to. If one side never happened, the
        // per-leader pools would be decoration.
        check('N1: BOTH leader sides actually happen at the trigger (two real rooms)',
            leaderTally.halcyon + leaderTally.polaris > 0 && leaderTally.tianxia > 0,
            roomLeaderMix);
    }

    // -- N2. Gate arithmetic + voice scaling (the pure helpers main.js calls) --
    check('N2: voice = satisfied-criteria count',
        roomVoice([]) === 0 && roomVoice([true, false, false, false, false, false]) === 1
        && roomVoice([true, true, false, false, false, false]) === 2
        && roomVoice([true, true, true, true, true, true]) === ROOM_MAX_VOICE);
    check('N2: seat needs >= 2 criteria (1 -> no beat, 2 -> in, 6 -> in)',
        ROOM_MIN_CRITERIA === 2 && roomInvited(0) === false && roomInvited(1) === false
        && roomInvited(2) === true && roomInvited(6) === true);
    check('N2: below the gate roomChoices is EMPTY (no beat, not even a toast)',
        roomChoices(1, true).length === 0 && roomChoices(0, false).length === 0);
    // The deal option tracks summitLive, both ways.
    const shell = getEventById(ROOM_EVENT_ID);
    const dealPresent = (cs) => cs.some(c => c._roomVerb === 'deal');
    check('N2: advise-the-deal is present ONLY while the summit window is live',
        dealPresent(roomChoices(6, true)) && !dealPresent(roomChoices(6, false))
        && roomChoices(6, true).length === 4 && roomChoices(6, false).length === 3);
    check('N2: the room shell is a superevent popup, category room, with no market coupling',
        !!shell && shell.superevent === true && shell.popup === true && shell.category === 'room'
        && !('impulse' in shell) && JSON.stringify(shell.params) === '{}');
    // Voice scaling: applied = base x voice/6, exactly, per effect.
    const amt = (cs, verb, dial) => {
        const c = cs.find(x => x._roomVerb === verb);
        const e = c.raceEffects.find(x => x.dial === dial);
        return e.amount;
    };
    const speed6 = amt(roomChoices(6, true), 'speed', 'S');
    const speed2 = amt(roomChoices(2, true), 'speed', 'S');
    const speed3 = amt(roomChoices(3, true), 'speed', 'S');
    check('N2: full-voice magnitudes are 02a verbatim (speed -0.12, margin +0.12, deal heat -0.09 + S +0.04)',
        Math.abs(speed6 - (-0.12)) < 1e-15
        && Math.abs(amt(roomChoices(6, true), 'margin', 'S') - 0.12) < 1e-15
        && Math.abs(amt(roomChoices(6, true), 'deal', 'heat') - (-0.09)) < 1e-15
        && Math.abs(amt(roomChoices(6, true), 'deal', 'S') - 0.04) < 1e-15);
    check('N2: applied effect = base x (voice/6)',
        Math.abs(speed2 - (-0.12 * 2 / 6)) < 1e-15 && Math.abs(speed3 - (-0.12 * 3 / 6)) < 1e-15,
        `voice2 ${speed2.toFixed(6)}, voice3 ${speed3.toFixed(6)}`);
    check('N2: scaling DEEP-CLONES -- the shared shell is never mutated across firings',
        shell.choices.find(c => c._roomVerb === 'speed').raceEffects[0].amount === -0.12);
    check('N2: saying nothing carries NO raceEffects and sets room_declined',
        (() => {
            const c = roomChoices(2, false).find(x => x._roomVerb === 'silence');
            return c && !c.raceEffects && c.playerFlag === ROOM_FLAGS.declined;
        })());
    // -- N2b. Per-leader presentation (02a ruling 3) -----------------------
    {
        check('N2b: sides are home (Halcyon, Polaris -- the schism) vs rival (Tianxia); unknown defaults home',
            JSON.stringify(ROOM_LEADER_SIDES) === '["home","rival"]'
            && roomLeaderSide('halcyon') === 'home' && roomLeaderSide('polaris') === 'home'
            && roomLeaderSide('tianxia') === 'rival'
            && roomLeaderSide(null) === 'home' && roomLeaderSide(undefined) === 'home');
        // The shell carries pools for BOTH fields on BOTH sides, and NO scalar
        // headline/context (a scalar would silently pre-empt the pools).
        check('N2b: headline AND context pools exist for both sides; no scalar fallback on the shell',
            ROOM_LEADER_SIDES.every(s => Array.isArray(shell.headlinesByLeader[s]) && shell.headlinesByLeader[s].length > 0
                && Array.isArray(shell.contextsByLeader[s]) && shell.contextsByLeader[s].length > 0)
            && !('headline' in shell) && !('context' in shell));
        resetRoomRotation();
        const homeShow = roomPresentation('halcyon');
        const rivalShow = roomPresentation('tianxia');
        check('N2b: selection tracks the leader side for BOTH headline and context',
            homeShow.side === 'home' && rivalShow.side === 'rival'
            && shell.headlinesByLeader.home.includes(homeShow.headline)
            && shell.contextsByLeader.home.includes(homeShow.context)
            && shell.headlinesByLeader.rival.includes(rivalShow.headline)
            && shell.contextsByLeader.rival.includes(rivalShow.context)
            && homeShow.headline !== rivalShow.headline);
        // Deterministic rotation, per (shell, side, field): even cycling, no
        // repeat-in-a-row, and the other side's counter is untouched.
        resetRoomRotation();
        const realRandom = Math.random;
        let rotationRandomCalls = 0;
        Math.random = () => { rotationRandomCalls++; return realRandom(); };
        const homeSeq = [];
        for (let i = 0; i < 5; i++) homeSeq.push(roomPresentation('halcyon').headline);
        const rivalFirstAfterHome = roomPresentation('tianxia').headline;
        Math.random = realRandom;
        const homePool = shell.headlinesByLeader.home;
        let cyclesEvenly = true, noRepeatInARow = true;
        for (let i = 0; i < homeSeq.length; i++) {
            if (homeSeq[i] !== homePool[i % homePool.length]) cyclesEvenly = false;
            if (i > 0 && homePool.length > 1 && homeSeq[i] === homeSeq[i - 1]) noRepeatInARow = false;
        }
        check('N2b: rotation is deterministic and even per side (never an RNG draw)',
            cyclesEvenly && noRepeatInARow && rotationRandomCalls === 0,
            `${rotationRandomCalls} Math.random calls`);
        check('N2b: the sides rotate INDEPENDENTLY -- home firings never advance rival',
            rivalFirstAfterHome === shell.headlinesByLeader.rival[0]);
        resetRoomRotation();
        check('N2b: resetRoomRotation restarts both sides at pool[0] (same-seed replay)',
            roomPresentation('halcyon').headline === homePool[0]
            && roomPresentation('tianxia').headline === shell.headlinesByLeader.rival[0]);
        resetRoomRotation();
        // The choices stay leader-agnostic: one set, whoever leads.
        check('N2b: the CHOICES are leader-agnostic (the advice is the advice)',
            !shell.choices.some(c => 'headlinesByLeader' in c || '_roomSide' in c)
            && JSON.stringify(roomChoices(6, true)) === JSON.stringify(roomChoices(6, true)));
    }

    // -- N2c. The fired event carries leaderLab (the meta contract) --------
    {
        for (const [lead, side] of [['halcyon', 'home'], ['tianxia', 'rival']]) {
            resetRoomRotation();
            const race = createRaceState(4242);
            race.capability.labs[lead].C_internal = 5.0;
            race.capability.labs[lead === 'halcyon' ? 'tianxia' : 'halcyon'].C_internal = 4.0;
            const trigger = roomTrigger(race);
            const show = roomPresentation(trigger.leaderLab);
            const eng = new EventEngine('offline');
            eng.race = race;
            // The event main.js builds, verbatim in shape.
            const ev = {
                ...getEventById(ROOM_EVENT_ID),
                headline: show.headline, context: show.context,
                choices: roomChoices(6, true),
                raceMeta: { leaderLab: trigger.leaderLab, leaderSide: show.side, voice: 6 },
            };
            const r = eng._fireEvent(ev, {}, 900, 0, 0);
            const logged = eng.eventLog[eng.eventLog.length - 1];
            check(`N2c: a ${lead}-led room fires queued with leaderLab on the meta and ${side}-side text`,
                r && r.queued === true
                && r.event.raceMeta.leaderLab === lead && r.event.raceMeta.leaderSide === side
                && getEventById(ROOM_EVENT_ID).headlinesByLeader[side].includes(r.event.headline)
                && getEventById(ROOM_EVENT_ID).contextsByLeader[side].includes(r.event.context)
                && logged.headline === r.event.headline && logged.category === 'room'
                && JSON.stringify(logged.params) === '{}');
        }
        resetRoomRotation();
    }

    check('N2: category room is Poisson-EXCLUDED and NOT terminal-safe',
        !new EventEngine('offline')._pools.random.some(e => e.category === 'room')
        && isTerminalSafeBeat({ category: 'room' }) === false
        && isTerminalSafeBeat({ category: 'summit' }) === true);
    roomVoiceHist = [2, 3, 4, 5, 6].map(v => `v${v}:${amt(roomChoices(v, true), 'speed', 'S').toFixed(3)}`).join(' ');

    // -- N3. The effects land through the STANDARD chokepoint --------------
    {
        const race = createRaceState(4321);
        resetLedger();
        const S0 = race.safety.halcyon;
        const applied = applyRaceEffects(race, roomChoices(6, true).find(c => c._roomVerb === 'speed').raceEffects,
            ROOM_EVENT_ID, 500);
        const rows = ledgerEntries('S');
        check('N3: full-voice speed advice moves S[halcyon] by -0.12 and ledgers ONE row under the room',
            applied.length === 1 && Math.abs(applied[0].amount - (-0.12)) < 1e-15
            && Math.abs(race.safety.halcyon - (S0 - 0.12)) < 1e-15
            && rows.length === 1 && rows[0].source === ROOM_EVENT_ID && rows[0].channel === 'S'
            && Math.abs(race.playerS.halcyon - (-0.12)) < 1e-15,
            `S ${S0.toFixed(3)} -> ${race.safety.halcyon.toFixed(3)}`);
        // Voice 2 lands the scaled magnitude, not the base one.
        const race2 = createRaceState(4322);
        resetLedger();
        const applied2 = applyRaceEffects(race2, roomChoices(2, true).find(c => c._roomVerb === 'speed').raceEffects,
            ROOM_EVENT_ID, 500);
        check('N3: a 2-voice room lands base x 1/3, ledgered at the SCALED magnitude',
            applied2.length === 1 && Math.abs(applied2[0].amount - (-0.04)) < 1e-15
            && Math.abs(ledgerEntries('S')[0].amount - (-0.04)) < 1e-15);
        // The deal advice writes BOTH channels.
        const race3 = createRaceState(4323);
        resetLedger();
        const heat0 = race3.heat.transient;
        const applied3 = applyRaceEffects(race3, roomChoices(6, true).find(c => c._roomVerb === 'deal').raceEffects,
            ROOM_EVENT_ID, 500);
        check('N3: the deal advice writes BOTH whitelisted channels (heat and S)',
            applied3.length === 2 && ledgerEntries('heat').length === 1 && ledgerEntries('S').length === 1
            && Math.abs(race3.heat.transient - Math.max(0, heat0 - 0.09)) < 1e-15);
        // The standard +-0.15 per-effect clamp still binds at the chokepoint (the
        // room's own magnitudes sit inside it BY DESIGN -- the clamp is the
        // guarantee, not the mechanic).
        const race4 = createRaceState(4324);
        resetLedger();
        const over = applyRaceEffects(race4, [{ dial: 'S', lab: 'halcyon', amount: -0.5 }], ROOM_EVENT_ID, 500);
        check('N3: the +-0.15 per-effect clamp binds at the chokepoint; the room sits inside it',
            over.length === 1 && Math.abs(over[0].amount - (-0.15)) < 1e-15
            && Math.abs(speed6) < 0.15);
        deactivateLedger();
    }

    // -- N4. Pre-terminal exclusivity -------------------------------------
    // main.js guards the latch on `!race.resolution` (the call sits AFTER the
    // resolution ladder). The DOM-bound latch itself is uncovered; what is gated
    // here is that the guard genuinely closes -- including on runs whose predicate
    // is still true at resolution (an R5 crossing), where the PREDICATE alone
    // would happily fire a room into a finished world.
    {
        let predicateTrueAtEnd = 0, guardOpenAfterLatch = 0, unresolved = 0, scanned = 0;
        for (let i = 0; i < Math.min(N, 400); i++) {
            const race = createRaceState((BASE_SEED + 6000 + i) >>> 0);
            for (let d = 0; d < HORIZON && !race.resolution; d++) {
                advanceRace(race); stepControlRegime(race); stepTreaty(race, {}); checkResolution(race, null);
            }
            if (!race.resolution) checkResolution(race, null);
            scanned++;
            if (!race.resolution) unresolved++;
            if (roomTriggerReady(race)) predicateTrueAtEnd++;
            // THE GUARD main.js runs, verbatim.
            if (!race.resolution && roomTriggerReady(race)) guardOpenAfterLatch++;
        }
        check('N4: a latched resolution closes the room guard -- even where the predicate stays true',
            unresolved === 0 && guardOpenAfterLatch === 0 && predicateTrueAtEnd > 0,
            `${predicateTrueAtEnd}/${scanned} resolved runs still satisfy the raw predicate`);
    }

    // -- N5. Classification blackout --------------------------------------
    // (a) The tip rate is regime-dependent at ROLL time, and the change consumes
    //     the SAME draws: two arms on one seed, driven through stepIncidents
    //     directly (which touches no dial, so the arms cannot diverge for any
    //     other reason). Stream-position identity is asserted by drawing from both
    //     streams AFTER the run -- that covers the draws taken inside
    //     categorical/exponential too, which a call-counter cannot see.
    {
        const BO_N = Math.min(N, 200);
        const HEAT = 0.30;
        let tipsP = 0, occP = 0, tipsC = 0, occC = 0;
        for (let i = 0; i < BO_N; i++) {
            const seed = (BASE_SEED + 7100 + i) >>> 0;
            const a = createRaceState(seed);
            const b = createRaceState(seed);
            b.controlRegime = 'classified';
            for (let d = 0; d < HORIZON; d++) {
                const ra = stepIncidents(a, d, d + 1, HEAT);
                const rb = stepIncidents(b, d, d + 1, HEAT);
                if (ra.occurred.length !== rb.occurred.length
                    || ra.detected.length !== rb.detected.length) blackoutRecordsOK = false;
                for (let k = 0; k < ra.occurred.length; k++) {
                    const x = ra.occurred[k], y = rb.occurred[k];
                    // Everything EXCEPT the tip flag must be identical.
                    if (x.id !== y.id || x.source !== y.source || x.severity !== y.severity
                        || x.cls !== y.cls || x.occurDay !== y.occurDay) blackoutRecordsOK = false;
                    occP++; occC++;
                    if (x.insiderTip) tipsP++;
                    if (y.insiderTip) tipsC++;
                }
            }
            // Stream position identity: the next draws must agree bit-for-bit.
            for (let k = 0; k < 5; k++) {
                if (a.streams.incidents.next() !== b.streams.incidents.next()) blackoutStreamOK = false;
            }
        }
        tipPrivateRate = occP ? tipsP / occP : 0;
        tipClassifiedRate = occC ? tipsC / occC : 0;
        check('N5a: the classified tip roll consumes the SAME draws (streams stay in lockstep)',
            blackoutStreamOK && blackoutRecordsOK,
            `${occP} occurrences compared`);
        check(`N5a: tip rate ${INSIDER_TIP_PROB} private -> ${INSIDER_TIP_PROB_CLASSIFIED} classified`,
            Math.abs(tipPrivateRate - INSIDER_TIP_PROB) < 0.03
            && Math.abs(tipClassifiedRate - INSIDER_TIP_PROB_CLASSIFIED) < 0.03,
            `${pct(tipPrivateRate)} vs ${pct(tipClassifiedRate)}`);
    }
    // (b) Belief: folds suppressed through severity 3, S4 unchanged, and the
    //     suppressed fold id stays UNCLAIMED (the player's leak still works).
    {
        const det = (id, severity) => ({ id, source: 'halcyon', severity, cls: 'accident', occurDay: 1, detectDay: 20, lag: 19 });
        const mkLedger = () => {
            const tr = freshTransitions();
            tr.incidents.detected = [det('bo0', 0), det('bo1', 1), det('bo2', 2), det('bo3', 3), det('bo4', 4)];
            return tr;
        };
        initBelief(null); belief.day = 20;
        stepBelief({ day: 20, controlRegime: 'private', lastTransitions: mkLedger() });
        const alignPrivate = belief.alignment;
        const foldsPrivate = beliefCauses().filter(c => c.cause === 'incident-detected').length;
        initBelief(null); belief.day = 20;
        stepBelief({ day: 20, controlRegime: 'classified', lastTransitions: mkLedger() });
        const alignBlackout = belief.alignment;
        const foldsBlackout = beliefCauses().filter(c => c.cause === 'incident-detected');
        check('N5b: under classified only the S4 detection folds (S0-S3 suppressed)',
            foldsPrivate === 5 && foldsBlackout.length === 1 && foldsBlackout[0].id === 'det_bo4'
            && BLACKOUT_FOLD_MAX_SEV === 3);
        // The S4 fold magnitude is untouched by the regime.
        initBelief(null); belief.day = 20;
        const trS4 = freshTransitions();
        trS4.incidents.detected = [det('bo4', 4)];
        stepBelief({ day: 20, controlRegime: 'private', lastTransitions: trS4 });
        check('N5b: the S4 fold is bit-identical under both regimes (undeniable)',
            Math.abs(belief.alignment - alignBlackout) < 1e-15 && alignBlackout !== alignPrivate,
            `S4-only ${belief.alignment.toFixed(4)} == blackout ${alignBlackout.toFixed(4)} != private ${alignPrivate.toFixed(4)}`);
        // A suppressed detection leaves its fold id unclaimed, so the insider
        // channel -- the one feed a blackout leaves open -- can still fold it.
        initBelief(null); belief.day = 20;
        stepBelief({ day: 20, controlRegime: 'classified', lastTransitions: mkLedger() });
        check('N5b: a suppressed fold id stays UNCLAIMED -- the player leak still lands',
            beliefProcessed('det_bo2') === false && foldPlayerLeak('bo2', 2) === true
            && beliefProcessed('det_bo4') === true);
        deactivateBelief();
    }
    // (c) The BRIDGE routes detections by regime: public ladder private, brief
    //     shells classified, S4 public in both.
    {
        const fired = { private: [], classified: [] };
        const stub = {
            world: { factions: {}, geopolitical: {}, ai: {} },
            _fireEvent(ev) { return ev.popup ? { queued: true, event: ev } : { id: ev.id }; },
        };
        const det = (id, severity, cls = 'accident') => ({ id, source: 'halcyon', severity, cls, occurDay: 1, detectDay: 20, lag: 19 });
        for (const regime of ['private', 'classified']) {
            const race = createRaceState(9191);
            initConsensus(race); initBelief(race); resetRaceBridge();
            race.controlRegime = regime;
            const tr = freshTransitions();
            tr.incidents.detected = [det('r0', 0), det('r2', 2), det('r3', 3), det('rp', 2, 'persuasion'), det('r4', 4)];
            race.lastTransitions = tr;
            const captured = [];
            stub._fireEvent = (ev) => { captured.push(ev.id); return ev.popup ? { queued: true, event: ev } : { id: ev.id }; };
            runRaceBridge(stub, race, { day: race.day }, race.day, 0);
            fired[regime] = captured;
            deactivateConsensus(); deactivateBelief();
        }
        const brief = getEventById('incident_brief_classified');
        const briefGrave = getEventById('incident_brief_classified_grave');
        check('N5c: private routes the PUBLIC ladder (minor/moderate/grave/persuasion/catastrophe)',
            JSON.stringify(fired.private) === JSON.stringify(
                ['incident_minor', 'incident_moderate', 'incident_grave', 'incident_persuasion', 'incident_catastrophe']),
            fired.private.join(','));
        check('N5c: classified fires NO public detection shell -- briefs instead, S4 still public',
            JSON.stringify(fired.classified) === JSON.stringify(
                ['incident_brief_classified', 'incident_brief_classified', 'incident_brief_classified_grave',
                    'incident_brief_classified', 'incident_catastrophe']),
            fired.classified.join(','));
        check('N5c: both brief shells exist, carry NO impulse key (absent, not zeroed), and no permanent params',
            !!brief && !!briefGrave && !('impulse' in brief) && !('impulse' in briefGrave)
            && JSON.stringify(brief.params) === '{}' && JSON.stringify(briefGrave.params) === '{}');
        check('N5c: the brief shells are Poisson-excluded (category incident, bridge-fired only)',
            brief.category === 'incident' && briefGrave.category === 'incident'
            && !new EventEngine('offline')._pools.random.some(e => e.id.startsWith('incident_brief_')));
    }

    // -- N6. Treasury backchannel (fund-as-actor) -------------------------
    {
        const ev = getEventById('treasury_backchannel');
        const accept = ev.choices[0], decline = ev.choices[1];
        check('N6: oneShot policy popup, gated on the fund latch mirror (never a recomputed gate)',
            ev.oneShot === true && ev.category === 'policy' && ev.popup === true
            && typeof ev.when === 'function');
        const world = createWorldState();
        const whenClosed = ev.when({}, world);
        world.ai.fundLive = true;
        check('N6: `when` closed until world.ai.fundLive, open after',
            !whenClosed && ev.when({}, world) === true);
        // The mirror is race/belief-owned: no structured effect may forge it.
        const w2 = createWorldState();
        applyStructuredEffects(w2, [{ path: 'ai.fundLive', op: 'set', value: true }]);
        check('N6: fundLive is NOT in WORLD_STATE_RANGES -- a structured effect cannot forge it',
            w2.ai.fundLive === false);
        check('N6: accepting sets treasury_backchannel and costs regulatoryExposure +6',
            accept.playerFlag === 'treasury_backchannel'
            && accept.factionShifts.length === 1
            && accept.factionShifts[0].faction === 'regulatoryExposure'
            && accept.factionShifts[0].value === 6);
        check('N6: declining sets declined_treasury and costs nothing',
            decline.playerFlag === 'declined_treasury' && !decline.factionShifts && !decline.raceEffects);
        // The cross-check the brief asks for: the room's sixth criterion reads the
        // SAME flag name the accept choice writes.
        check('N6: the room\'s sixth criterion reads the flag the accept choice writes',
            ROOM_FLAG_CRITERIA.treasury === accept.playerFlag);
        // Eligible through the ENGINE's real filter once the mirror is up.
        const eng = new EventEngine('offline');
        eng._currentDay = 800;
        eng.world.ai.fundLive = false;
        const before = eng._filterEligible([ev], {}).length;
        eng.world.ai.fundLive = true;
        check('N6: the one-shot pre-pass sees it exactly when the fund is live',
            before === 0 && eng._filterEligible([ev], {}).length === 1
            && eng._pools.random.some(e => e.id === 'treasury_backchannel'));
    }

    // -- N7. chinaTrue intel beats ----------------------------------------
    {
        check('N7: buckets cut at 0.90 / 1.10, edges belong to the UPPER bucket',
            INTEL_LO === 0.90 && INTEL_HI === 1.10
            && velocityBucket(0.75) === 'behind' && velocityBucket(0.8999) === 'behind'
            && velocityBucket(0.90) === 'matched' && velocityBucket(1.0999) === 'matched'
            && velocityBucket(1.10) === 'faster' && velocityBucket(1.325) === 'faster'
            && velocityBucket(undefined) === null && velocityBucket(NaN) === null);
        deactivateIntel();
        check('N7: the read is inert while the channel is inactive (Classic)',
            intelActive() === false && intelRead(createRaceState(1)) === null);
        // Reliability + adjacency: p = 0.7 truthful, and noise is exactly ONE
        // bucket off -- a 'behind' program is NEVER reported 'faster'.
        const DRAWS = 20000;
        const tallies = {};
        let truthful = 0, total = 0;
        for (const [truthBucket, v] of [['behind', 0.80], ['matched', 1.00], ['faster', 1.20]]) {
            const race = createRaceState(5150);
            race.hidden.chinaTrue.velocity = v;
            initIntel(race);
            const t = { behind: 0, matched: 0, faster: 0 };
            for (let i = 0; i < DRAWS; i++) {
                const r = intelRead(race);
                t[r.bucket]++;
                total++;
                if (r.truthful) truthful++;
                if (r.truthful !== (r.bucket === truthBucket)) intelAdjacencyOK = false;
            }
            if (truthBucket === 'behind' && t.faster !== 0) intelAdjacencyOK = false;
            if (truthBucket === 'faster' && t.behind !== 0) intelAdjacencyOK = false;
            tallies[truthBucket] = t;
        }
        intelTruthRate = truthful / total;
        check(`N7: reliability p = ${INTEL_TRUTH_PROB} (the read is true 70% of the time)`,
            Math.abs(intelTruthRate - INTEL_TRUTH_PROB) < 0.015, pct(intelTruthRate));
        check('N7: noise lands exactly ONE bucket off -- never a two-notch inversion',
            intelAdjacencyOK
            && tallies.behind.faster === 0 && tallies.faster.behind === 0
            && tallies.matched.behind > 0 && tallies.matched.faster > 0);
        check('N7: a matched truth splits its noise evenly between the neighbours',
            Math.abs(tallies.matched.behind - tallies.matched.faster) < 0.05 * DRAWS,
            `${tallies.matched.behind} behind / ${tallies.matched.faster} faster`);
        // OWN-SUBSTREAM BIT-IDENTITY: firing an intel read every single day must
        // leave the race trajectory bit-for-bit unchanged.
        for (let s = 0; s < IDENT_SEEDS; s++) {
            const seed = (BASE_SEED + s) >>> 0;
            const bare = trajectoryHash(seed, undefined);
            const withIntel = trajectoryHash(seed, undefined, (r) => initIntel(r), (r) => { intelRead(r); });
            if (bare !== withIntel) intelIdentOK = false;
        }
        check(`N7: intel ON/OFF trajectory bit-identical over ${IDENT_SEEDS} seeds (own substream)`,
            intelIdentOK);
        // End to end through the CANONICAL fire path: the shell's read selects its
        // pool, and the velocity itself is never rendered.
        {
            const race = createRaceState(5151);
            race.hidden.chinaTrue.velocity = 1.20;   // truth: faster
            initIntel(race);
            const eng = new EventEngine('offline');
            eng.race = race;
            const shellIntel = getEventById('china_intel_estimate');
            const pools = shellIntel.headlinesByRead;
            const seen = { behind: 0, matched: 0, faster: 0 };
            let allFromPools = true, noVelocity = true;
            for (let i = 0; i < 400; i++) {
                const r = eng._fireEvent({ ...shellIntel }, {}, 300 + i, 0, 0);
                const h = r.headline;
                let found = null;
                for (const b of INTEL_BUCKETS) if (pools[b].includes(h)) found = b;
                if (!found) allFromPools = false; else seen[found]++;
                if (h.includes('1.2') || h.includes(String(race.hidden.chinaTrue.velocity))) noVelocity = false;
            }
            check('N7: `intel: true` shells resolve their read through the canonical fire path',
                allFromPools && seen.faster > 0 && seen.matched > 0 && seen.behind === 0
                && Math.abs(seen.faster / 400 - INTEL_TRUTH_PROB) < 0.08,
                `faster ${seen.faster} / matched ${seen.matched} / behind ${seen.behind}`);
            check('N7: the velocity itself is NEVER rendered -- only the bucket',
                noVelocity && INTEL_BUCKETS.every(b => Array.isArray(pools[b]) && pools[b].length > 0));
            // -- N7b. The defensive contract (sol-gate P2, rulings 11 + 15) ----
            // (a) NO RACE ATTACHED: the shell must still render, from the matched
            //     pool. Before the fix `_fireEvent` skipped intel resolution
            //     entirely without `this.race` and logged headline === undefined.
            {
                const engNoRace = new EventEngine('offline');
                engNoRace.race = null;
                const r = engNoRace._fireEvent({ ...shellIntel }, {}, 700, 0, 0);
                const logged = engNoRace.eventLog[engNoRace.eventLog.length - 1];
                check('N7b: an intel shell fired with NO attached race falls back to the matched pool',
                    typeof r.headline === 'string' && pools.matched.includes(r.headline)
                    && logged.headline === r.headline,
                    `headline ${typeof r.headline}`);
                // Same for an attached race whose channel is inactive.
                deactivateIntel();
                const engInactive = new EventEngine('offline');
                engInactive.race = createRaceState(5152);
                const r2 = engInactive._fireEvent({ ...shellIntel }, {}, 701, 0, 0);
                check('N7b: an inactive intel channel also falls back to matched (never headline-less)',
                    typeof r2.headline === 'string' && pools.matched.includes(r2.headline));
            }
            // (b) THE DRAW CONTRACT: with the channel ACTIVE, an unresolvable read
            //     (missing hidden state) must still advance the stream EXACTLY
            //     twice. Asserted at stream-POSITION level against an independent
            //     reference stream built from the same derived seed, so this pins
            //     the count at 2 -- not merely "nonzero".
            {
                const seed = 5153;
                const race = createRaceState(seed);
                // A 'matched' truth makes BOTH draws load-bearing (the noise branch
                // reads the direction draw), so a predicted SEQUENCE is genuinely
                // discriminating -- an off-by-one stream position could not reproduce it.
                race.hidden.chinaTrue.velocity = 1.00;
                const SEQ = 6;
                const ref = createRng(deriveSeed(race.seed, 'intel'));
                const u = [];
                for (let k = 0; k < 2 * (SEQ + 1); k++) u.push(ref.next());
                /** The read a caller gets from the pair starting at raw index `i`. */
                const predict = (i) => (u[i] < INTEL_TRUTH_PROB)
                    ? { bucket: 'matched', truthful: true }
                    : { bucket: (u[i + 1] < 0.5) ? 'behind' : 'faster', truthful: false };
                const fmt = (rs) => rs.map(r => `${r.bucket[0]}${r.truthful ? 'T' : 'F'}`).join('');
                // Predicted sequence if the unresolvable read consumed EXACTLY 2 draws
                // (so the next read starts at raw index 2), and if it consumed ZERO.
                const fromTwo = [], fromZero = [];
                for (let k = 0; k < SEQ; k++) { fromTwo.push(predict(2 + 2 * k)); fromZero.push(predict(2 * k)); }
                initIntel(race);
                const bad = intelRead({ day: 0 });                // active channel, NO hidden state
                const actual = [];
                for (let k = 0; k < SEQ; k++) actual.push(intelRead(race));
                check('N7b: an unresolvable read on an ACTIVE channel returns null but still draws EXACTLY two',
                    bad === null && fmt(actual) === fmt(fromTwo) && fmt(fromTwo) !== fmt(fromZero),
                    `got ${fmt(actual)}; +2 predicts ${fmt(fromTwo)}, +0 predicts ${fmt(fromZero)}`);
                // Independent confirmation: the position an unresolvable read leaves
                // the stream at is the SAME one a resolvable read leaves it at.
                initIntel(race);
                intelRead(race);
                const paired = [];
                for (let k = 0; k < SEQ; k++) paired.push(intelRead(race));
                check('N7b: unresolvable and resolvable reads cost the same (paired-seed identity)',
                    fmt(paired) === fmt(actual));
                // And the inactive channel is the ONE path that draws nothing.
                deactivateIntel();
                check('N7b: an INACTIVE channel draws nothing (no stream to advance)',
                    intelRead(race) === null && intelActive() === false);
                initIntel(race);
                const firstAfterInit = intelRead(race);
                deactivateIntel();
                intelRead(race);                                   // must not advance anything
                initIntel(race);
                check('N7b: reads attempted while inactive leave the next active read unchanged',
                    intelRead(race).bucket === firstAfterInit.bucket);
                deactivateIntel();
            }
            initIntel(race);   // restore the live channel for the checks below
            check('N7: intel beats are narrative-only (no impulse, no raceEffects, no factionShifts)',
                ['china_intel_estimate', 'china_intel_human_source', 'china_intel_buildout'].every(id => {
                    const e = getEventById(id);
                    return e && e.intel === true && !('impulse' in e) && !e.raceEffects && !e.factionShifts
                        && JSON.stringify(e.params) === '{}' && !e.headline;
                }));
            deactivateIntel();
        }
    }
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
line('\nAct III systemic layer (P7-1):');
line(`  driver: smoothing ${ACT3_TUNING.smoothing}/day, targets 0 / ${ACT3_TUNING.targetR4} / ${ACT3_TUNING.targetR5}`
    + ` (+${ACT3_TUNING.regimeBump} mobilized+), knee ${ACT3_TUNING.knee}`);
line(`  substep lane: ${laneOffRate.toFixed(5)} events/day day-lane vs ${laneOnRate.toFixed(5)} substep-lane`
    + `  (worst arrival bucket deviation ${pct(laneArrivalSpread)})`);
line(`  latency ladder: ${ladderRows}`);
line(`  display latches: index stale ${latchHeldSubsteps}/12 substeps at d = 1;`
    + ` headless trajectory identity ${latchTrajOK ? 'BITWISE' : 'VIOLATED'}`);
line('\nStanding orders (P7-2):');
line(`  menu of ${STANDING_RULES.length}: ${STANDING_RULES.map(r => r.id).join(', ')}`);
line(`  gates: unlock at released R${STANDING_TUNING.unlockRung}, armed set locked at R${STANDING_TUNING.lockRung};`
    + ` cut ${STANDING_TUNING.grossCutFrac}, util gate ${STANDING_TUNING.marginUtilGate},`
    + ` move gate ${STANDING_TUNING.moveGate}, delta band +-${STANDING_TUNING.deltaBand}`);
line(`  rules exercised: ${[...soFiredRules].join(', ')} (+ bonds_first preference, tip_autosit gate)`);
line(`  RNG draws ${soRandomCalls}; standing fill ${soFillGap}`);
line('\nP7-3 (the room, the blackout, the backchannel, the intel):');
line(`  room: trigger C_int >= ${ROOM_TRIGGER_C}, seat at >= ${ROOM_MIN_CRITERIA}/${ROOM_MAX_VOICE} criteria`
    + ` (safetyNetworkTrust ${ROOM_GATE.safetyNetworkTrust}, labRelations ${ROOM_GATE.labRelations});`
    + ` reached in ${pct(roomReachFrac)} of runs`);
line(`  room voice scaling (speed advice dS[halcyon]): ${roomVoiceHist}`);
line(`  room presentation: per-leader pools keyed ${ROOM_LEADER_SIDES.join(' / ')}`
    + ` (headline + context, deterministic rotation); leader seen ${roomLeaderMix}`);
line(`  blackout: tip rate ${pct(tipPrivateRate)} private -> ${pct(tipClassifiedRate)} classified;`
    + ` incident streams ${blackoutStreamOK && blackoutRecordsOK ? 'IN LOCKSTEP' : 'DESYNCED'};`
    + ` B folds suppressed through S${BLACKOUT_FOLD_MAX_SEV}`);
line(`  intel: reliability ${pct(intelTruthRate)} (target ${pct(INTEL_TRUTH_PROB)}),`
    + ` adjacency ${intelAdjacencyOK ? 'ONE bucket' : 'VIOLATED'},`
    + ` trajectory identity ${intelIdentOK ? 'BITWISE' : 'VIOLATED'}`);
line('='.repeat(72));
line('\nChecks:');
for (const r of results) {
    line(`  [${r.ok ? 'PASS' : 'MISS'}] ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
}
line('='.repeat(72));
line(failures === 0 ? 'ALL PLUMBING CHECKS PASS' : `${failures} PLUMBING CHECK(S) MISS -- see above`);
process.exitCode = failures === 0 ? 0 : 1;
