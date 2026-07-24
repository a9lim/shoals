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

   All numeric bands are DESIGN bands; the tuning is RATIFIED in
   02a's "Content plumbing (phase-5a ratifications, 2026-07-23)"
   block. Exits 1 on any MISS.

   Usage:  node tools/plumbing-test.mjs [N]
   =================================================== */

import {
    createRaceState, advanceRace, stepControlRegime, setControlRegime,
    heatValue, REGIME_RANK, CONTROL_REGIMES,
} from '../src/race/race-state.js';
import { CONTROL_TUNING } from '../src/race/control-regime.js';
import { BLOCKADE_HEAT } from '../src/race/strait.js';
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
import { initBelief, deactivateBelief, lockForecast, credibility } from '../src/race/belief.js';
import { market, syncMarket } from '../src/market.js';
import { eventBaseRateScale, BASE_RATE_MAX_MULT } from '../src/events.js';
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

// ---- Report --------------------------------------------------------------
line(`plumbing-test: N=${N}, horizon=${HORIZON}d`);
line(`control tuning: supP=${CONTROL_TUNING.supPressure} mobP=${CONTROL_TUNING.mobPressure} natP=${CONTROL_TUNING.natPressure} natHeat=${CONTROL_TUNING.natHeat}`);
line('='.repeat(72));
line('\nRegime final distribution (endogenous, tension 0):');
for (const k of CONTROL_REGIMES) line(`  ${k.padEnd(13)} ${pct(regimeTally[k] / N)}`);
line(`  reached >= supervised ${pct(reachSup)}   >= mobilized ${pct(reachMobFrac)}`);
line(`\nStrait blockade incidence: baseline ${pct(baselineIncidence)} (tension 0) | hot ${pct(hotIncidence)} (tension 1)`);
line('='.repeat(72));
line('\nChecks:');
for (const r of results) {
    line(`  [${r.ok ? 'PASS' : 'MISS'}] ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
}
line('='.repeat(72));
line(failures === 0 ? 'ALL PLUMBING CHECKS PASS' : `${failures} PLUMBING CHECK(S) MISS -- see above`);
process.exitCode = failures === 0 ? 0 : 1;
