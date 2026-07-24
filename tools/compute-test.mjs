#!/usr/bin/env node
/* ===================================================
   tools/compute-test.mjs -- Lifecycle-correctness,
   money-conservation, integrity, nationalization-
   reference, and seed-stability harness for the compute
   futures (overhaul phase 3b; src/race/compute-market.js +
   the computefuture paths in src/portfolio.js).

   Hard-assertion checks:

   A. Curve construction + strait premium. placeholderCurve
      matches an INDEPENDENT re-implementation of the doc
      formula (pins every coefficient); the blockade far-curve
      tail premium lands in the RATIFIED [0.40, 0.80] band
      (02a); blockade lifts the far curve, tension lifts the
      standing premium, high demand puts the curve in
      backwardation (scramble).

   B. Ordinary settlement (09 row): a contract at maturity
      under the private regime + calm strait settles ORDINARY
      at the index; long/short cash + realized P&L exact.

   C. Blockade force-majeure (09 precedence rung 2): the curve
      carries the adjustment WHILE listed; a contract settling
      during a blockade settles FORCE_MAJEURE, above the calm
      ordinary settle.

   D. Decree conversion (09 precedence rung 1 / mobilized):
      every open contract converts at its bound decree price
      with realized P&L EXACTLY signedQty × multiplier ×
      (decreePrice − entryBasis), shorts symmetric; trading
      barred after the freeze. Driven only through
      setControlRegime.

   E. Precedence stacking: decree ⊃ force-majeure ⊃ ordinary.

   F. Money conservation across full lifecycles incl. forced
      liquidation + restriction: a frozen compute future is
      un-flattenable (stuck, never a fictional fill), the decree
      conversion clears it, and startCash + realized P&L ==
      endCash to the cent.

   G. Integrity (09 "Information hygiene"): buildComputePublicView
      exposes only the public projection, and corrupting EVERY
      continuous hidden field leaves every curve quote and every
      fresh settlement decision bit-identical.

   H. Nationalization reference (09 "protected"): the conversion
      multiple is in [0.60, 1.15], drawn ONCE at creation, and
      identical across same-seed runs; the frozen median is the
      median of the 20 sessions ending 5 before the trigger; the
      setControlRegime path freezes it.

   I. Seed stability: adding the compute-market draws does not
      perturb the capability / theft / incident / evidence
      trajectories (named-substream discipline).

   Usage:  node tools/compute-test.mjs [N] [--seed S]
           N defaults to 300; base seed defaults to 1.
   =================================================== */

import { createRaceState, advanceRace, setControlRegime } from '../src/race/race-state.js';
import {
    computeMarket, initComputeMarket, refreshComputeQuotes, computeFutureSettlements,
    buildComputePublicView, getComputeMark, getComputeQuote, computeContractByKey,
    isComputeTradeable, placeholderCurve, stepNationalizationRef, freezeNationalizationReference,
    getNationalizationReference, COMPUTE_MULTIPLIER, DECREE_FORMULAS,
} from '../src/race/compute-market.js';
import {
    portfolio, resetPortfolio, executeMarketOrder, closePosition, liquidateAll,
    settleComputeFutures, portfolioValue, processExpiry, cancelAllOrders, checkMargin,
} from '../src/portfolio.js';
import { market, syncMarket } from '../src/market.js';
import { positionLabel } from '../src/portfolio-renderer.js';
import { posTypeLabel, fmtQty, fmtDte } from '../src/format-helpers.js';

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
const EPS = 1e-6;

// ---- Fixtures ------------------------------------------------------------

// The compute market reads geo.taiwanBlockade (Taiwan/Hsinchu), NEVER
// geo.straitClosed (Hormuz/oil). Stubs mirror world-state.js field names.
const calmGeo = { taiwanBlockade: false, straitClosed: false, chinaRelations: 0, tradeWarStage: 0 };     // tension 0
const tenseGeo = { taiwanBlockade: false, straitClosed: false, chinaRelations: -3, tradeWarStage: 4 };    // tension 1, no blockade
const blockadeGeo = { taiwanBlockade: true, straitClosed: false, chinaRelations: -3, tradeWarStage: 4 };  // Taiwan blockade, tension 1
const hormuzGeo = { taiwanBlockade: false, straitClosed: true, chinaRelations: 0, tradeWarStage: 0 };     // Hormuz closed, Taiwan open -> MUST NOT move the chip curve
const FIXED_MARKET = { S: 100, v: 0.04, r: 0.03, day: 0, q: 0, kappa: 2, theta: 0.04, xi: 0.4, rho: -0.5, a: 0.1, b: 0.03, sigmaR: 0.01, borrowSpread: 0 };

function syncFixed(day) { syncMarket({ ...FIXED_MARKET, day }); market.day = day; }

/** Prime the compute book to `days`, driving the full daily loop (advance +
 *  nat-ref feed + settle + refresh). No player positions during priming. */
function primeCompute(seed, days, geo) {
    const race = createRaceState(seed >>> 0);
    initComputeMarket(race, geo);
    syncFixed(race.day);
    for (let d = 0; d < days; d++) {
        advanceRace(race);
        stepNationalizationRef(race, 100 + race.day * 0.05);
        settleComputeFutures(computeFutureSettlements(race, geo), race);
        refreshComputeQuotes(race, geo);
    }
    syncFixed(race.day);
    return race;
}

/** A currently-listed (open, tradeable) contract key, or null. */
function openComputeKey() {
    const c = computeMarket.contracts.find(x => {
        const q = computeMarket.quotes[x.key];
        return q && !q.settled && !q.frozen;
    });
    return c ? c.key : null;
}

// ---- Duplicated-code parity check (NOT doc calibration) ------------------
// The docs deliberately leave the curve magnitudes unrecorded (P4-swappable
// placeholder), so this cannot be doc calibration. It is a DUPLICATED
// re-implementation of the module's own formula: if the module's coefficients
// drift without this copy being updated in lockstep, the parity check fails --
// a change-detector on the placeholder, plus the RATIFIED blockade band assertion.
function expectedCurve(view, dte) {
    const K_RELEASE = 0.010, K_CERT = 0.030, K_TREND = 0.060;
    const BASE = 100, SCRAMBLE_COEF = 0.5, SCRAMBLE_TAU = 180, TAIL_TAU = 120;
    const S_BASE = 0.06, S_TENSION = 0.10, FAR_LO = 0.40, FAR_HI = 0.80, NEAR_FRAC = 0.5;
    const demand = K_RELEASE * view.releaseCount + K_CERT * view.certifiedFrontierRung + K_TREND * (view.day / 504);
    const spot = BASE * (1 + demand);
    const scramble = SCRAMBLE_COEF * demand;
    const back = scramble * (1 - Math.exp(-dte / SCRAMBLE_TAU));
    const sat = 1 - Math.exp(-dte / TAIL_TAU);
    let tailPrem, straitTilt;
    if (view.blockade) { tailPrem = FAR_LO + (FAR_HI - FAR_LO) * view.straitTension; straitTilt = tailPrem * (NEAR_FRAC + (1 - NEAR_FRAC) * sat); }
    else { tailPrem = S_BASE + S_TENSION * view.straitTension; straitTilt = tailPrem * sat; }
    const price = Math.max(0.01, spot * (1 + straitTilt - back));
    return { price, spot, scramble, tailPrem, straitTilt, back };
}

// ---- A. Curve construction + strait premium ------------------------------

let curveExactOK = true, blockadeBandOK = true, blockadeLiftsOK = true, tensionLiftsOK = true, backwardationOK = true;
{
    const views = [
        { day: 0, releaseCount: 0, certifiedFrontierRung: 0, blockade: false, straitTension: 0 },
        { day: 300, releaseCount: 6, certifiedFrontierRung: 2, blockade: false, straitTension: 0.5 },
        { day: 700, releaseCount: 14, certifiedFrontierRung: 3, blockade: true, straitTension: 1 },
        { day: 900, releaseCount: 20, certifiedFrontierRung: 4, blockade: true, straitTension: 0.3 },
    ];
    for (const v of views) {
        for (const dte of [0, 63, 126, 189, 252, 2000]) {
            const got = placeholderCurve(v, dte);
            const exp = expectedCurve(v, dte).price;
            if (Math.abs(got - exp) > 1e-9) curveExactOK = false;
            assert(Math.abs(got - exp) < 1e-9, `curve mismatch v.day=${v.day} dte=${dte}: got ${got} want ${exp}`);
        }
        // Blockade band: the tail premium sits in [0.40, 0.80] (02a, RATIFIED).
        if (v.blockade) {
            const tp = expectedCurve(v, 252).tailPrem;
            if (!(tp >= 0.40 - EPS && tp <= 0.80 + EPS)) blockadeBandOK = false;
            assert(tp >= 0.40 - EPS && tp <= 0.80 + EPS, `blockade tailPrem ${tp} out of [0.40,0.80]`);
        }
    }
    // Blockade lifts the far curve vs calm at the SAME public state.
    const stateFar = { day: 700, releaseCount: 14, certifiedFrontierRung: 3 };
    const farCalm = placeholderCurve({ ...stateFar, blockade: false, straitTension: 0 }, 252);
    const farBlock = placeholderCurve({ ...stateFar, blockade: true, straitTension: 1 }, 252);
    blockadeLiftsOK = farBlock > farCalm * 1.20;   // a real jump on the far end
    assert(blockadeLiftsOK, `blockade far curve did not jump: calm ${farCalm.toFixed(2)} block ${farBlock.toFixed(2)}`);
    // Standing premium responds to tension (no blockade).
    const farNoTension = placeholderCurve({ ...stateFar, blockade: false, straitTension: 0 }, 252);
    const farTension = placeholderCurve({ ...stateFar, blockade: false, straitTension: 1 }, 252);
    tensionLiftsOK = farTension > farNoTension;
    assert(tensionLiftsOK, `tension did not lift the standing premium: ${farNoTension} vs ${farTension}`);
    // Backwardation under scramble: high demand, no strait -> near > far.
    const hiDemand = { day: 900, releaseCount: 25, certifiedFrontierRung: 4, blockade: false, straitTension: 0 };
    const near = placeholderCurve(hiDemand, 21);
    const far = placeholderCurve(hiDemand, 252);
    backwardationOK = near > far;
    assert(backwardationOK, `no backwardation under scramble: near ${near.toFixed(2)} far ${far.toFixed(2)}`);
}

// ---- A2. Hormuz-leakage regression (two straits, two flags) --------------
// A HORMUZ closure (geo.straitClosed = true) with TAIWAN open must NOT move the
// chip curve: the view's blockade reads geo.taiwanBlockade only, so the curve
// equals the calm curve and settlement is ORDINARY, never FORCE_MAJEURE.

let hormuzNoBlockadeViewOK = false, hormuzCurveIdenticalOK = false, hormuzOrdinaryKindOK = false;
{
    const race = primeCompute(BASE_SEED + 1500, 130, hormuzGeo);
    const viewHormuz = buildComputePublicView(race, hormuzGeo);
    const viewCalm = buildComputePublicView(race, calmGeo);
    hormuzNoBlockadeViewOK = viewHormuz.blockade === false;
    assert(hormuzNoBlockadeViewOK, `Hormuz closure leaked into the compute view.blockade (${viewHormuz.blockade})`);
    // Curve identical to calm (Hormuz carries no chip-curve premium).
    hormuzCurveIdenticalOK = [0, 63, 252].every(dte => Math.abs(placeholderCurve(viewHormuz, dte) - placeholderCurve(viewCalm, dte)) < 1e-12);
    assert(hormuzCurveIdenticalOK, 'Hormuz closure moved the compute curve (should be identical to calm)');
    // A contract maturing under a Hormuz-only closure settles ORDINARY.
    let sawOrdinary = false, sawFm = false;
    for (let d = 0; d < 130; d++) {
        advanceRace(race);
        for (const s of computeFutureSettlements(race, hormuzGeo)) { if (s.kind === 'ORDINARY') sawOrdinary = true; if (s.kind === 'FORCE_MAJEURE') sawFm = true; }
        refreshComputeQuotes(race, hormuzGeo);
    }
    hormuzOrdinaryKindOK = sawOrdinary && !sawFm;
    assert(hormuzOrdinaryKindOK, `Hormuz closure produced a FORCE_MAJEURE settlement (ordinary=${sawOrdinary} fm=${sawFm})`);
}

// ---- B. Ordinary settlement ----------------------------------------------

let ordinaryOK = true, ordinaryConserveOK = true, ordinaryChecks = 0;
for (let s = 0; s < 30; s++) {
    for (const side of ['long', 'short']) {
        // Fresh book per side: a settled/advanced clock from one side must not
        // starve the other (each is an independent lifecycle).
        const race = primeCompute(BASE_SEED + 1000 + s, 100 + s * 8, calmGeo);
        const key = openComputeKey();
        if (key == null) continue;
        const st = computeContractByKey(key);
        resetPortfolio(10000); syncFixed(race.day);
        const pos = executeMarketOrder(null, 'computefuture', side, 4, market.S, market.sigma, market.r, race.day, key, key, undefined, 0);
        if (!pos) continue;
        const entry = pos.entryPrice, absQty = Math.abs(pos.qty);
        const reserved = pos._reservedMargin || 0;
        // Advance to the contract's maturity, settling daily (calm/private -> ORDINARY).
        let settleRow = null, settleRec = null;
        while (race.day < st.settleDay && race.day < HORIZON) {
            advanceRace(race);
            stepNationalizationRef(race, 100 + race.day * 0.05);
            const settlements = computeFutureSettlements(race, calmGeo);
            const rec = settlements.find(x => x.key === key);
            if (rec) { settleRec = rec; settleRow = settleComputeFutures([rec], race).find(r => r.key === key); }
            refreshComputeQuotes(race, calmGeo);
            syncFixed(race.day);
            if (settleRow) break;
        }
        ordinaryChecks++;
        assert(settleRec && settleRec.kind === 'ORDINARY', `expected ORDINARY, got ${settleRec && settleRec.kind}`);
        if (!settleRow) { ordinaryOK = false; continue; }
        const sp = settleRec.settlePrice;
        const expectedPnl = (side === 'long' ? 1 : -1) * absQty * COMPUTE_MULTIPLIER * (sp - entry);
        if (Math.abs(settleRow.pnl - expectedPnl) > 1e-6) ordinaryOK = false;
        assert(Math.abs(settleRow.pnl - expectedPnl) < 1e-6, `ordinary P&L ${settleRow.pnl} != ${expectedPnl} (${side})`);
        // Money conservation: no positions remain, endCash == 10000 + realized P&L.
        const noPos = !portfolio.positions.some(p => p.type === 'computefuture');
        if (!noPos || Math.abs(portfolio.cash - (10000 + settleRow.pnl)) > 1e-6) ordinaryConserveOK = false;
        assert(noPos, 'compute position not removed after ordinary settlement');
        assert(Math.abs(portfolio.cash - (10000 + settleRow.pnl)) < 1e-6, `cash ${portfolio.cash} != 10000 + pnl ${settleRow.pnl}`);
        void reserved;
    }
}

// ---- C. Blockade force-majeure -------------------------------------------

let fmKindOK = false, fmAdjustOK = false, fmWhileListedOK = false;
{
    // Curve carries the adjustment WHILE listed: same race state, blockade geo vs calm.
    const raceCalm = primeCompute(BASE_SEED + 2000, 250, calmGeo);
    const keyCalm = openComputeKey();
    const midCalm = keyCalm != null ? getComputeMark(keyCalm) : null;
    const raceBlock = primeCompute(BASE_SEED + 2000, 250, blockadeGeo);
    const keyBlock = openComputeKey();
    const midBlock = keyBlock != null ? getComputeMark(keyBlock) : null;
    fmWhileListedOK = midCalm != null && midBlock != null && keyCalm === keyBlock && midBlock > midCalm * 1.05;
    assert(fmWhileListedOK, `blockade did not lift the listed mark: calm ${midCalm} block ${midBlock}`);

    // A contract settling DURING a blockade settles FORCE_MAJEURE, above ordinary.
    const race = primeCompute(BASE_SEED + 2100, 120, calmGeo);
    const key = openComputeKey();
    const st = key != null ? computeContractByKey(key) : null;
    if (st) {
        // What it would settle at ORDINARY (calm) vs FORCE_MAJEURE (blockade), same day.
        const viewCalm = buildComputePublicView(race, calmGeo);
        const viewBlock = buildComputePublicView(race, blockadeGeo);
        const ordinaryPrice = placeholderCurve(viewCalm, 0);
        const fmPrice = placeholderCurve(viewBlock, 0);
        fmAdjustOK = fmPrice > ordinaryPrice * 1.10;   // near/settlement lift from BLOCKADE_NEAR_FRAC
        assert(fmAdjustOK, `force-majeure settle not above ordinary: ord ${ordinaryPrice.toFixed(2)} fm ${fmPrice.toFixed(2)}`);
        // Drive to maturity under blockade; the emitted settlement is FORCE_MAJEURE.
        resetPortfolio(10000); syncFixed(race.day);
        executeMarketOrder(null, 'computefuture', 'long', 2, market.S, market.sigma, market.r, race.day, key, key, undefined, 0);
        let rec = null;
        while (race.day < st.settleDay && race.day < HORIZON) {
            advanceRace(race);
            stepNationalizationRef(race, 100 + race.day * 0.05);
            const settlements = computeFutureSettlements(race, blockadeGeo);
            rec = settlements.find(x => x.key === key);
            if (rec) settleComputeFutures([rec], race);
            refreshComputeQuotes(race, blockadeGeo);
            if (rec) break;
        }
        fmKindOK = !!rec && rec.kind === 'FORCE_MAJEURE';
        assert(fmKindOK, `expected FORCE_MAJEURE, got ${rec && rec.kind}`);
    }
}

// ---- D. Decree conversion (mobilized) ------------------------------------

let decreeKindOK = true, decreeFormulaOK = true, decreeBarredOK = false, decreeConserveOK = true, decreeChecks = 0;
for (let s = 0; s < 24; s++) {
    for (const side of ['long', 'short']) {
        // Fresh unfrozen book per side (mobilizing one side freezes the shared book).
        const race = primeCompute(BASE_SEED + 3000 + s, 120 + s * 10, calmGeo);
        const key = openComputeKey();
        if (key == null) continue;
        resetPortfolio(10000); syncFixed(race.day);
        const pos = executeMarketOrder(null, 'computefuture', side, 5, market.S, market.sigma, market.r, race.day, key, key, undefined, 0);
        if (!pos) continue;
        const entry = pos.entryPrice, absQty = Math.abs(pos.qty);
        const lastMark = getComputeMark(key);   // the 'last-valid-mark' decree formula
        setControlRegime(race, 'mobilized');     // canonical path -> freezeComputeMarket snapshots decree prices
        // Trading barred once frozen.
        decreeBarredOK = executeMarketOrder(null, 'computefuture', 'long', 1, market.S, market.sigma, market.r, race.day, key, key, undefined, 0) === null;
        assert(decreeBarredOK, 'trade not barred on a frozen (mobilized) compute book');
        const settlements = computeFutureSettlements(race, calmGeo);
        const rec = settlements.find(x => x.key === key);
        decreeChecks++;
        if (!rec || rec.kind !== 'DECREE') decreeKindOK = false;
        assert(rec && rec.kind === 'DECREE', `expected DECREE, got ${rec && rec.kind}`);
        // Decree price == the last valid mark (the bound 'last-valid-mark' formula).
        if (!rec || Math.abs(rec.decreePrice - lastMark) > 1e-9) decreeFormulaOK = false;
        assert(rec && Math.abs(rec.decreePrice - lastMark) < 1e-9, `decree price ${rec && rec.decreePrice} != last mark ${lastMark}`);
        const row = settleComputeFutures([rec], race).find(r => r.key === key);
        // EXACT 09 closeout: signedQty × multiplier × (decreePrice − entryBasis), shorts symmetric.
        const signedQty = side === 'long' ? absQty : -absQty;
        const expectedPnl = signedQty * COMPUTE_MULTIPLIER * (rec.decreePrice - entry);
        if (!row || Math.abs(row.pnl - expectedPnl) > 1e-6) decreeConserveOK = false;
        assert(row && Math.abs(row.pnl - expectedPnl) < 1e-6, `decree P&L ${row && row.pnl} != formula ${expectedPnl} (${side})`);
        // Money conservation.
        if (Math.abs(portfolio.cash - (10000 + expectedPnl)) > 1e-6) decreeConserveOK = false;
        assert(Math.abs(portfolio.cash - (10000 + expectedPnl)) < 1e-6, `cash ${portfolio.cash} != 10000 + pnl (${side})`);
    }
}

// ---- E. Precedence stacking ----------------------------------------------

let precDecreeWins = false, precFmBeatsOrdinary = false;
{
    // Decree ⊃ force-majeure ⊃ ordinary: mobilized + blockade + past-deadline -> ALL decree.
    const race = primeCompute(BASE_SEED + 4000, 300, blockadeGeo);
    setControlRegime(race, 'mobilized');
    const settlements = computeFutureSettlements(race, blockadeGeo);
    precDecreeWins = settlements.length > 0 && settlements.every(s => s.kind === 'DECREE');
    assert(precDecreeWins, `precedence: not all DECREE under mobilized+blockade (${settlements.map(s => s.kind).join(',')})`);

    // Force-majeure ⊃ ordinary: blockade + past-deadline, private regime -> FORCE_MAJEURE.
    const race2 = createRaceState((BASE_SEED + 4001) >>> 0);
    initComputeMarket(race2, blockadeGeo);
    let sawFm = false;
    for (let d = 0; d < 130; d++) {
        advanceRace(race2);
        const settlements2 = computeFutureSettlements(race2, blockadeGeo);
        if (settlements2.some(s => s.kind === 'FORCE_MAJEURE')) sawFm = true;
        assert(!settlements2.some(s => s.kind === 'ORDINARY'), 'ordinary settlement fired under an active blockade');
        refreshComputeQuotes(race2, blockadeGeo);
    }
    precFmBeatsOrdinary = sawFm;
    assert(precFmBeatsOrdinary, 'no FORCE_MAJEURE settlement observed under a sustained blockade');
}

// ---- F. Money conservation incl. forced liquidation + restriction --------

let liqOpenOK = false, liqFrozenStuckOK = false, liqReleaseOK = false, liqConserveOK = false;
{
    // Open book: liquidateAll flattens compute futures cleanly, cash conserved.
    const race = primeCompute(BASE_SEED + 5000, 150, calmGeo);
    const key = openComputeKey();
    if (key != null) {
        resetPortfolio(10000); syncFixed(race.day);
        executeMarketOrder(null, 'computefuture', 'long', 3, market.S, market.sigma, market.r, race.day, key, key, undefined, 0);
        executeMarketOrder(null, 'computefuture', 'short', 2, market.S, market.sigma, market.r, race.day, key === null ? 0 : key, key, undefined, 0);
        const { stuck } = liquidateAll(null, market.S, market.sigma, market.r, race.day, 0);
        liqOpenOK = stuck.length === 0 && !portfolio.positions.some(p => p.type === 'computefuture');
        assert(liqOpenOK, `open-book compute liquidation left positions / stuck (${stuck.length})`);
    }
    // Frozen book: compute future is un-flattenable (stuck), decree conversion clears it,
    // cash conserved end-to-end (startCash + realized P&L == endCash).
    const race2 = primeCompute(BASE_SEED + 5001, 150, calmGeo);
    const key2 = openComputeKey();
    if (key2 != null) {
        resetPortfolio(10000); syncFixed(race2.day);
        const pos = executeMarketOrder(null, 'computefuture', 'long', 4, market.S, market.sigma, market.r, race2.day, key2, key2, undefined, 0);
        const entry = pos.entryPrice, absQty = Math.abs(pos.qty);
        setControlRegime(race2, 'mobilized');   // freeze the book
        const { stuck } = liquidateAll(null, market.S, market.sigma, market.r, race2.day, 0);
        liqFrozenStuckOK = stuck.length === 1 && stuck[0].type === 'computefuture'
            && portfolio.positions.some(p => p.type === 'computefuture');
        assert(liqFrozenStuckOK, `frozen compute not reported stuck / kept (stuck=${stuck.length})`);
        portfolio.restricted = stuck.length > 0;
        cancelAllOrders();
        // Decree conversion settles the stuck leg.
        const rec = computeFutureSettlements(race2, calmGeo).find(x => x.key === key2);
        settleComputeFutures([rec], race2);
        const decreePnl = absQty * COMPUTE_MULTIPLIER * (rec.decreePrice - entry);
        liqReleaseOK = !portfolio.positions.some(p => p.type === 'computefuture');
        liqConserveOK = Math.abs(portfolio.cash - (10000 + decreePnl)) < 1e-6;
        assert(liqReleaseOK, 'stuck compute leg not cleared by decree conversion');
        assert(liqConserveOK, `frozen-lifecycle cash ${portfolio.cash} != 10000 + decree P&L ${decreePnl}`);
    }
}

// ---- G. Integrity (no hidden state in curve OR fresh settlement) ---------

function corruptContinuous(race) {
    race.hidden.tau = 0.999;
    race.hidden.scalingElasticity = 0.999;
    race.evidenceLogOdds = 99;
    race.latentIncidents.push({ severity: 4, occurDay: race.day });
    race.latentEvidence.push({ published: false });
    for (const id of ['halcyon', 'tianxia', 'polaris']) {
        const lab = race.capability.labs[id];
        if (lab.active) { lab.C_internal = 5.5; lab.C_released = 5.5; }
    }
    race.capability.open.C = 5.5;
    // heat + safety are hidden race dials too -- the public compute view must not
    // read them (finding-7 hardening).
    race.heat.transient = 0.99; race.heat.floor = 0.99;
    race.safety.halcyon = 0.01; race.safety.tianxia = 0.01;
    if (race.safety.polaris != null) race.safety.polaris = 0.01;
}

let integrityViewOK = false, integrityInvariantOK = true;
{
    const PUBLIC_KEYS = ['day', 'releaseCount', 'certifiedFrontierRung', 'blockade', 'straitTension', 'controlRegime'].sort().join(',');
    {
        const race = createRaceState((BASE_SEED + 6000) >>> 0);
        initComputeMarket(race, calmGeo);
        for (let d = 0; d < 400; d++) advanceRace(race);
        const view = buildComputePublicView(race, calmGeo);
        integrityViewOK = Object.keys(view).sort().join(',') === PUBLIC_KEYS;
        assert(integrityViewOK, 'buildComputePublicView leaks non-public keys: ' + Object.keys(view).join(','));
        assert(!('releasedFrontier' in view) && !('C_internal' in view), 'compute view exposes continuous capability');
    }
    const DAYS = [130, 200, 380, 520, 760];
    for (let s = 0; s < 8; s++) {
        for (const D of DAYS) {
            const seed = (BASE_SEED + 6100 + s) >>> 0;
            const raceA = createRaceState(seed); initComputeMarket(raceA, calmGeo);
            for (let d = 0; d < D; d++) { advanceRace(raceA); computeFutureSettlements(raceA, calmGeo); refreshComputeQuotes(raceA, calmGeo); }
            const qA = JSON.stringify(computeMarket.quotes), sA = JSON.stringify(computeMarket.settled);

            const raceB = createRaceState(seed); initComputeMarket(raceB, calmGeo);
            for (let d = 0; d < D - 1; d++) { advanceRace(raceB); computeFutureSettlements(raceB, calmGeo); refreshComputeQuotes(raceB, calmGeo); }
            advanceRace(raceB);
            corruptContinuous(raceB);
            computeFutureSettlements(raceB, calmGeo);
            refreshComputeQuotes(raceB, calmGeo);
            const qB = JSON.stringify(computeMarket.quotes), sB = JSON.stringify(computeMarket.settled);

            if (qA !== qB || sA !== sB) integrityInvariantOK = false;
            assert(qA === qB, `curve changed under corruption (seed ${s}, D=${D})`);
            assert(sA === sB, `settlement changed under corruption (seed ${s}, D=${D})`);
        }
    }
}

// ---- H. Nationalization reference ----------------------------------------

let natMultRangeOK = true, natMultStableOK = true, natMultAtCreationOK = false;
let natMedianOK = false, natRegimePathOK = false, natIdempotentOK = false;
{
    // Multiple in [0.60,1.15], drawn at creation, identical across same-seed runs.
    for (let s = 0; s < N; s++) {
        const r1 = createRaceState((BASE_SEED + 40000 + s) >>> 0); initComputeMarket(r1, calmGeo);
        const m1 = r1.nationalizationRef.multiple;
        if (!(m1 >= 0.60 - EPS && m1 <= 1.15 + EPS)) natMultRangeOK = false;
        if (s < 40) {
            const r2 = createRaceState((BASE_SEED + 40000 + s) >>> 0); initComputeMarket(r2, calmGeo);
            if (Math.abs(m1 - r2.nationalizationRef.multiple) > 1e-12) natMultStableOK = false;
        }
    }
    assert(natMultRangeOK, 'nationalization multiple out of [0.60,1.15]');
    assert(natMultStableOK, 'nationalization multiple differs across same-seed runs');
    {
        const r = createRaceState((BASE_SEED + 41000) >>> 0); initComputeMarket(r, calmGeo);
        natMultAtCreationOK = typeof r.nationalizationRef.multiple === 'number' && r.nationalizationRef.frozen === null;
        assert(natMultAtCreationOK, 'nationalization multiple not present at creation (or already frozen)');
    }
    // Frozen median == median of the 20 sessions ending 5 before the trigger.
    {
        const r = createRaceState((BASE_SEED + 42000) >>> 0); initComputeMarket(r, calmGeo);
        const T = 300;
        for (let d = 0; d < T; d++) { advanceRace(r); stepNationalizationRef(r, 100 + r.day); }   // mark(day) = 100 + day
        const frozen = freezeNationalizationReference(r, T);
        // Window: days [T-24 .. T-5]; median of 100+day over 20 monotone points.
        const expectedMedian = 100 + ((T - 24) + (T - 5)) / 2;
        natMedianOK = frozen && Math.abs(frozen.median - expectedMedian) < 1e-9
            && Math.abs(frozen.reference - expectedMedian * r.nationalizationRef.multiple) < 1e-9
            && frozen.sessions === 20;
        assert(natMedianOK, `nat median ${frozen && frozen.median} != ${expectedMedian} (sessions ${frozen && frozen.sessions})`);
        // Idempotent.
        const again = freezeNationalizationReference(r, T + 50);
        natIdempotentOK = again.day === T && Math.abs(again.median - expectedMedian) < 1e-9;
        assert(natIdempotentOK, 'nationalization reference re-froze (not idempotent)');
    }
    // setControlRegime -> nationalized freezes the reference via the canonical path.
    {
        const r = createRaceState((BASE_SEED + 43000) >>> 0); initComputeMarket(r, calmGeo);
        for (let d = 0; d < 200; d++) { advanceRace(r); stepNationalizationRef(r, 100 + r.day); }
        setControlRegime(r, 'nationalized');
        natRegimePathOK = !!getNationalizationReference(r) && r.nationalizationRef.frozen.day === r.day;
        assert(natRegimePathOK, 'nationalized regime did not freeze the reference via setControlRegime');
    }
}

// ---- I. Seed stability (substream isolation) -----------------------------

// A rolling 32-bit hash folded over the FULL per-day ledger (finding-7: daily
// full race/evidence signatures, not just final rung timestamps).
function foldHash(h, s) { for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; }
function dayDigest(tr) {
    return JSON.stringify({
        cr: tr.crossings, rl: tr.releases.map(r => r.labId), th: tr.thefts,
        ce: tr.certifications,
        io: tr.incidents.occurred, id: tr.incidents.detected,
        eo: tr.evidence.occurred, ep: tr.evidence.published,
    });
}
let seedStableOK = true, seedRunsChecked = 0;
{
    for (let s = 0; s < 12; s++) {
        const seed = (BASE_SEED + 50000 + s) >>> 0;
        // Arm A: bare race, no compute wiring -- accumulate the full daily signature.
        const raceA = createRaceState(seed);
        let hA = 0x811c9dc5 >>> 0;
        for (let d = 0; d < HORIZON; d++) { advanceRace(raceA); hA = foldHash(hA, dayDigest(raceA.lastTransitions)); }
        // Arm B: same seed WITH the full compute-market daily loop.
        const raceB = createRaceState(seed);
        initComputeMarket(raceB, calmGeo);
        let hB = 0x811c9dc5 >>> 0;
        for (let d = 0; d < HORIZON; d++) {
            advanceRace(raceB);
            hB = foldHash(hB, dayDigest(raceB.lastTransitions));   // hash BEFORE any compute op touches the tick
            stepNationalizationRef(raceB, 100 + raceB.day * 0.05);
            settleComputeFutures(computeFutureSettlements(raceB, calmGeo), raceB);
            refreshComputeQuotes(raceB, calmGeo);
        }
        seedRunsChecked++;
        if (hA !== hB || raceA.theftCount !== raceB.theftCount) seedStableOK = false;
        assert(hA === hB, `daily race/evidence signature perturbed by compute-market (seed ${s}: ${hA} vs ${hB})`);
        assert(raceA.theftCount === raceB.theftCount, `theft count perturbed by compute-market (seed ${s})`);
    }
}

// ---- J. Round-2 gate fixes -----------------------------------------------

// J1. Multi-fill accounting: a 2-unit then 3-unit same-direction fill sequence
// must settle with reported P&L == actual cash P&L (VWAP basis; finding 1).
let vwapBasisOK = false, multiFillConservesOK = false, multiFillMeaningful = false;
{
    const race = primeCompute(BASE_SEED + 80000, 40, calmGeo);
    const key = computeMarket.contracts.length
        ? [...computeMarket.contracts].sort((a, b) => b.settleDay - a.settleDay)[0].key : null;
    if (key != null) {
        resetPortfolio(10000); syncFixed(race.day);
        const p1 = executeMarketOrder(null, 'computefuture', 'long', 2, market.S, market.sigma, market.r, race.day, key, key, undefined, 0);
        const fill1 = p1.entryPrice;
        // Advance so the curve for `key` drifts (its dte shrinks; demand trends) -> fill2 != fill1.
        for (let d = 0; d < 40 && race.day < key - 6; d++) {
            advanceRace(race); stepNationalizationRef(race, 100 + race.day * 0.05);
            settleComputeFutures(computeFutureSettlements(race, calmGeo), race);
            refreshComputeQuotes(race, calmGeo);
        }
        syncFixed(race.day);
        const p2 = executeMarketOrder(null, 'computefuture', 'long', 3, market.S, market.sigma, market.r, race.day, key, key, undefined, 0);
        const fill2 = p2.fillPrice;
        const vwapExpected = (fill1 * 2 + fill2 * 3) / 5;
        vwapBasisOK = Math.abs(p2.entryPrice - vwapExpected) < 1e-9;
        assert(vwapBasisOK, `VWAP basis wrong: entry ${p2.entryPrice} != ${vwapExpected}`);
        // Settle via decree and confirm money conserves: reported P&L == actual cash P&L.
        setControlRegime(race, 'mobilized');
        const rec = computeFutureSettlements(race, calmGeo).find(x => x.key === key);
        const row = settleComputeFutures([rec], race).find(r => r.key === key);
        const actualCashPnl = portfolio.cash - 10000;
        multiFillConservesOK = row && Math.abs(row.pnl - actualCashPnl) < 1e-6;
        assert(multiFillConservesOK, `multi-fill P&L ${row && row.pnl} != actual cash P&L ${actualCashPnl}`);
        // The test is only meaningful if the fills actually differed (the buggy
        // first-entry P&L would have diverged).
        const buggyPnl = (rec.decreePrice - fill1) * 5;
        multiFillMeaningful = Math.abs(buggyPnl - row.pnl) > 1e-3;
        assert(multiFillMeaningful, `fills did not differ enough to exercise the bug (fill1=${fill1} fill2=${fill2})`);
    }
}

// J2. Contract admission: fabricated + settled keys rejected at the chokepoint.
let admitFabRejectedOK = false, admitSettledRejectedOK = false;
{
    const race = primeCompute(BASE_SEED + 81000, 130, calmGeo);
    const key = openComputeKey();
    resetPortfolio(10000); syncFixed(race.day);
    const fab = executeMarketOrder(null, 'computefuture', 'long', 1, market.S, market.sigma, market.r, race.day, 999999, 999999, undefined, 0);
    admitFabRejectedOK = fab === null && isComputeTradeable(999999) === false;
    assert(admitFabRejectedOK, 'fabricated compute contract key was accepted');
    if (key != null) {
        // Drive `key` to maturity so it settles, then try to reopen it.
        const st = computeContractByKey(key);
        while (race.day < st.settleDay && race.day < HORIZON) {
            advanceRace(race); stepNationalizationRef(race, 100 + race.day * 0.05);
            settleComputeFutures(computeFutureSettlements(race, calmGeo), race);
            refreshComputeQuotes(race, calmGeo);
        }
        syncFixed(race.day);
        const reopened = executeMarketOrder(null, 'computefuture', 'long', 1, market.S, market.sigma, market.r, race.day, key, key, undefined, 0);
        admitSettledRejectedOK = reopened === null && isComputeTradeable(key) === false && !!computeMarket.settled[key];
        assert(admitSettledRejectedOK, 'settled compute contract was reopened');
    }
}

// J3. Maintenance-boundary admission uses CANONICAL equity (reserved included).
let boundaryCanonicalOK = false, boundaryTightOK = false, boundaryUsesReservedOK = false;
{
    const race = primeCompute(BASE_SEED + 82000, 150, calmGeo);
    const key = openComputeKey();
    if (key != null) {
        let maxQ = 0;
        for (let Q = 1; Q <= 4000; Q++) {
            resetPortfolio(10000); syncFixed(race.day);
            const pos = executeMarketOrder(null, 'computefuture', 'short', Q, market.S, market.sigma, market.r, race.day, key, key, undefined, 0);
            if (pos) maxQ = Q; else break;
        }
        if (maxQ >= 1) {
            resetPortfolio(10000); syncFixed(race.day);
            const pos = executeMarketOrder(null, 'computefuture', 'short', maxQ, market.S, market.sigma, market.r, race.day, key, key, undefined, 0);
            const cm = checkMargin(market.S, market.sigma, market.r, race.day, 0);
            const reserved = pos._reservedMargin || 0;
            boundaryCanonicalOK = !cm.triggered && cm.equity >= cm.required - 1e-6;   // admitted -> canonical-healthy
            const equityOld = cm.equity - reserved;                                    // pre-fix (reserved omitted)
            boundaryUsesReservedOK = equityOld < cm.required;                          // old check would have rejected maxQ
            resetPortfolio(10000); syncFixed(race.day);
            const over = executeMarketOrder(null, 'computefuture', 'short', maxQ + 1, market.S, market.sigma, market.r, race.day, key, key, undefined, 0);
            boundaryTightOK = over === null;
            assert(boundaryCanonicalOK, `admitted max short breaches canonical maintenance (eq ${cm.equity.toFixed(1)} req ${cm.required.toFixed(1)})`);
            assert(boundaryUsesReservedOK, 'admission did not use the proposed reserved collateral (old too-strict boundary)');
            assert(boundaryTightOK, `boundary not tight: maxQ+1 (${maxQ + 1}) admitted`);
        }
    }
}

// J4. Frozen marks are immutable under a public-state change (halted-mark; finding 3).
let frozenMarkImmutableOK = false;
{
    const race = primeCompute(BASE_SEED + 83000, 200, calmGeo);
    const key = computeMarket.contracts.length
        ? [...computeMarket.contracts].sort((a, b) => b.settleDay - a.settleDay)[0].key : null;
    if (key != null) {
        setControlRegime(race, 'mobilized');    // freeze (snapshots decreePrice), do NOT settle
        refreshComputeQuotes(race, calmGeo);
        const st = computeContractByKey(key);
        const mark0 = getComputeMark(key), lastMark0 = st.lastMark, decree0 = st.decreePrice;
        const frozenFlag0 = getComputeQuote(key).frozen === true && !st.settled;
        // Change public state (releases/certifications/day drift) WITHOUT settling.
        for (let d = 0; d < 25; d++) { advanceRace(race); refreshComputeQuotes(race, calmGeo); }
        const mark1 = getComputeMark(key);
        frozenMarkImmutableOK = frozenFlag0
            && Math.abs(mark1 - mark0) < 1e-12
            && Math.abs(st.lastMark - lastMark0) < 1e-12
            && Math.abs(mark0 - decree0) < 1e-12;
        assert(frozenMarkImmutableOK, `frozen mark repriced under public change: ${mark0} -> ${mark1} (decree ${decree0})`);
    }
}

// J5. No listing after freeze + exactly-once settlement (findings 2 + interaction).
let noListAfterFreezeOK = false, firstDecreeAllOK = false, exactlyOnceOK = false;
{
    const race = primeCompute(BASE_SEED + 84000, 100, calmGeo);
    const keysBefore = Object.keys(computeMarket._state).sort();
    const openBefore = keysBefore.filter(k => !computeMarket._state[k].settled).length;
    setControlRegime(race, 'mobilized');
    const first = computeFutureSettlements(race, calmGeo);
    settleComputeFutures(first, race);
    refreshComputeQuotes(race, calmGeo);
    firstDecreeAllOK = first.length === openBefore && first.every(s => s.kind === 'DECREE');
    let extra = 0;
    for (let d = 0; d < 300; d++) {   // cross several quarter boundaries
        advanceRace(race);
        extra += computeFutureSettlements(race, calmGeo).length;
        refreshComputeQuotes(race, calmGeo);
    }
    const keysAfter = Object.keys(computeMarket._state).sort();
    noListAfterFreezeOK = JSON.stringify(keysBefore) === JSON.stringify(keysAfter);
    exactlyOnceOK = extra === 0;
    assert(firstDecreeAllOK, `first decree did not convert all ${openBefore} open contracts (${first.length})`);
    assert(noListAfterFreezeOK, 'new contracts were listed after the freeze');
    assert(exactlyOnceOK, `spurious post-freeze settlements: ${extra}`);
}

// J6. DTE display source: compute rows omit the (race-clock) DTE; sim-clock rows keep it.
let dteOmittedOK = false, dteKeptOK = false;
{
    const cfLabel = positionLabel({ type: 'computefuture', qty: 2, strike: 189, expiryDay: 189 }, 300);
    dteOmittedOK = cfLabel === posTypeLabel('computefuture', 2) + ' x' + fmtQty(2);   // no strike, no DTE
    const bondLabel = positionLabel({ type: 'bond', qty: 3, expiryDay: 500 }, 300);
    dteKeptOK = bondLabel === posTypeLabel('bond', 3) + ' ' + fmtDte(500 - 300) + ' x' + fmtQty(3);
    assert(dteOmittedOK, `compute row DTE not omitted: "${cfLabel}"`);
    assert(dteKeptOK, `sim-clock row DTE missing/wrong: "${bondLabel}"`);
}

// ---- Report --------------------------------------------------------------

line(`compute-test: N=${N} runs (nat-multiple sample), base seed=${BASE_SEED}, horizon=${HORIZON}d`);
line('='.repeat(72));

line('\nA. Curve construction + strait premium');
line(`  placeholderCurve == duplicated-code parity copy:  ${curveExactOK ? 'ok' : 'FAIL'}  (change-detector, not doc calibration)`);
line(`  blockade tail premium in [0.40,0.80] (02a):       ${blockadeBandOK ? 'ok' : 'FAIL'}`);
line(`  blockade lifts the far curve (>+20%):             ${blockadeLiftsOK ? 'ok' : 'FAIL'}`);
line(`  standing premium responds to tension:             ${tensionLiftsOK ? 'ok' : 'FAIL'}`);
line(`  backwardation (near>far) under scramble:          ${backwardationOK ? 'ok' : 'FAIL'}`);

line('\nA2. Hormuz-leakage regression (two straits, two flags)');
line(`  Hormuz (straitClosed) absent from compute view:   ${hormuzNoBlockadeViewOK ? 'ok' : 'FAIL'}`);
line(`  Hormuz closure leaves the chip curve identical:   ${hormuzCurveIdenticalOK ? 'ok' : 'FAIL'}`);
line(`  Hormuz-only closure settles ORDINARY (not FM):    ${hormuzOrdinaryKindOK ? 'ok' : 'FAIL'}`);

line('\nB. Ordinary settlement (calm/private)');
line(`  ${ordinaryChecks} long/short lifecycles: kind+P&L exact: ${ordinaryOK ? 'ok' : 'FAIL'} | money-conserving: ${ordinaryConserveOK ? 'ok' : 'FAIL'}`);

line('\nC. Blockade force-majeure (09 precedence rung 2)');
line(`  adjustment carried WHILE listed:                  ${fmWhileListedOK ? 'ok' : 'FAIL'}`);
line(`  settle-during-blockade above ordinary:            ${fmAdjustOK ? 'ok' : 'FAIL'}`);
line(`  emitted settlement tagged FORCE_MAJEURE:          ${fmKindOK ? 'ok' : 'FAIL'}`);

line('\nD. Decree conversion (09 precedence rung 1 / mobilized)');
line(`  ${decreeChecks} lifecycles: kind DECREE:                    ${decreeKindOK ? 'ok' : 'FAIL'}`);
line(`  decree price == bound last-valid-mark formula:    ${decreeFormulaOK ? 'ok' : 'FAIL'}`);
line(`  P&L == signedQty×mult×(decreePrice−entry) exact:  ${decreeConserveOK ? 'ok' : 'FAIL'}`);
line(`  trading barred on the frozen book:                ${decreeBarredOK ? 'ok' : 'FAIL'}`);
line(`  DECREE_FORMULAS enumerated at listing:            ${DECREE_FORMULAS.join(', ')}`);

line('\nE. Precedence stacking (decree ⊃ force-majeure ⊃ ordinary)');
line(`  mobilized+blockade -> all DECREE:                 ${precDecreeWins ? 'ok' : 'FAIL'}`);
line(`  blockade -> FORCE_MAJEURE beats ORDINARY:         ${precFmBeatsOrdinary ? 'ok' : 'FAIL'}`);

line('\nF. Money conservation incl. forced liquidation + restriction');
line(`  open-book liquidation flattens cleanly:           ${liqOpenOK ? 'ok' : 'FAIL'}`);
line(`  frozen leg reported stuck (no fictional fill):    ${liqFrozenStuckOK ? 'ok' : 'FAIL'}`);
line(`  decree conversion clears the stuck leg:           ${liqReleaseOK ? 'ok' : 'FAIL'}`);
line(`  startCash + realized P&L == endCash to the cent:  ${liqConserveOK ? 'ok' : 'FAIL'}`);

line('\nG. Integrity (09 "Information hygiene")');
line(`  public-only view:                                 ${integrityViewOK ? 'ok' : 'FAIL'}`);
line(`  curve + settlement invariant under full corruption: ${integrityInvariantOK ? 'holds' : 'VIOLATED'}`);

line('\nH. Nationalization reference (09 "protected")');
line(`  multiple in [0.60,1.15] (${N} seeds):                ${natMultRangeOK ? 'ok' : 'FAIL'}`);
line(`  multiple identical across same-seed runs:         ${natMultStableOK ? 'ok' : 'FAIL'}`);
line(`  multiple drawn at creation (not at use):          ${natMultAtCreationOK ? 'ok' : 'FAIL'}`);
line(`  frozen median = 20 sessions ending 5 before:      ${natMedianOK ? 'ok' : 'FAIL'}`);
line(`  freeze idempotent:                                ${natIdempotentOK ? 'ok' : 'FAIL'}`);
line(`  setControlRegime path freezes the reference:      ${natRegimePathOK ? 'ok' : 'FAIL'}`);

line('\nI. Seed stability (substream isolation)');
line(`  ${seedRunsChecked} seeds: FULL daily race/evidence signature unperturbed by compute-market: ${seedStableOK ? 'ok' : 'FAIL'}`);

line('\nJ. Round-2 gate fixes');
line(`  1  multi-fill VWAP basis + money conservation:     ${vwapBasisOK && multiFillConservesOK ? 'ok' : 'FAIL'}  (meaningful: ${multiFillMeaningful ? 'yes' : 'no'})`);
line(`  4  chokepoint rejects fabricated + settled keys:   ${admitFabRejectedOK && admitSettledRejectedOK ? 'ok' : 'FAIL'}`);
line(`  5  short admission uses canonical (reserved) eq:   ${boundaryCanonicalOK && boundaryUsesReservedOK && boundaryTightOK ? 'ok' : 'FAIL'}`);
line(`  3  frozen mark immutable under public change:      ${frozenMarkImmutableOK ? 'ok' : 'FAIL'}`);
line(`  2  no listing after freeze + settlement once:      ${noListAfterFreezeOK && firstDecreeAllOK && exactlyOnceOK ? 'ok' : 'FAIL'}`);
line(`  6  DTE display source (compute omits, bond keeps):  ${dteOmittedOK && dteKeptOK ? 'ok' : 'FAIL'}`);

line('\n' + '='.repeat(72));
if (failures === 0) {
    line('ALL COMPUTE-FUTURES INVARIANTS PASS');
} else {
    line(`${failures} ASSERTION FAILURE(S):`);
    for (const m of failSamples) line('  - ' + m);
}
process.exitCode = failures === 0 ? 0 : 1;
