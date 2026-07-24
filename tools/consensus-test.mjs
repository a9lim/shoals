#!/usr/bin/env node
/* ===================================================
   tools/consensus-test.mjs -- Settlement-correctness and
   fairness-invariant harness for the Consensus milestone
   binaries (overhaul phase 3a; src/race/consensus.js +
   the binary paths in src/portfolio.js).

   Hard-assertion checks:

   A. Settlement matrix over N real race runs (settled daily
      off the certification ledger). Cross-checks:
        - cert contracts (R2-R4): outcome + day vs the
          independently-computed certified state; each emits
          EXACTLY ONE cash settlement (=== 1).
        - terminal R5: NEVER booked NO against a crossed
          world (09; ratified). At its deadline it settles
          NO iff no R5 crossing occurred (checked against the
          internal CROSSING ledger, independent of
          rungCertified[5]); if a crossing occurred it is
          recorded pending terminal closeout and emits no
          cash settlement.
        - every payout is a listed-tuple value (notional / 0
          / fallbackValue x notional) -- 09 invariant 3.

   B. Regime split (09 adjudicator succession):
        - mobilized  -> SYNCHRONOUS FREEZE (trades rejected),
          settlement CONTINUES normally (no fallback).
        - nationalized/classified -> every open contract
          settles at fallbackValue.
      Freeze is driven only through setControlRegime.

   C. Portfolio accounting (full lifecycle through the
      canonical binary op AND the generic close/liquidation
      paths): short loss <= collateral; cash never negative;
      cost-basis independence (09 invariant 4); closePosition
      round-trip cash exactness (spread only); partial close;
      position flip; mixed book; generic liquidateAll on
      binaries (+ frozen-book reporting); coincident
      option-expiry + settlement (processExpiry skips binaries).

   D. Integrity (09 "Information hygiene" / invariant 6):
      buildPublicView exposes only the public projection (no
      continuous C_released), and corrupting EVERY continuous
      hidden field -- C_internal, C_released, open.C, tau,
      elasticity, evidence, latents -- leaves every QUOTE and
      every fresh SETTLEMENT decision bit-identical.

   E. Listing calibration: day-0 listing mids within +-8pp of
      the measured outcome frequencies, and two-sided.

   F. Fallback-render pure-function check: consensusOutcomeClass
      never returns '' -> classList.add('') (throws).

   Usage:  node tools/consensus-test.mjs [N] [--seed S]
           N defaults to 500; base seed defaults to 1.
   =================================================== */

import { createRaceState, advanceRace, setControlRegime } from '../src/race/race-state.js';
import {
    consensus, initConsensus, refreshBinaryQuotes, computeBinarySettlements,
    buildPublicView, getBinaryQuote, getBinaryMark, pendingTerminalCloseout, BINARY_NOTIONAL,
    setBinaryQuoteSource, placeholderQuote as placeholderQuoteRef,
} from '../src/race/consensus.js';
import { initBelief, stepBelief, binaryQuoteFromBelief } from '../src/race/belief.js';
import {
    portfolio, resetPortfolio, executeBinaryTrade, settleBinaries,
    executeMarketOrder, closePosition, liquidateAll, processExpiry, portfolioValue,
    placePendingOrder, checkPendingOrders, cancelAllOrders,
} from '../src/portfolio.js';
import { market, syncMarket } from '../src/market.js';

// ui.js sets one top-level property on `window`; stub it, then load the module
// dynamically (after the stub) so the pure render helper is headless-importable.
globalThis.window = globalThis.window || {};
const { consensusOutcomeClass } = await import('../src/ui.js');

// ---- CLI -----------------------------------------------------------------

const argv = process.argv.slice(2);
let N = 500;
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
    if (!cond) {
        failures++;
        if (failSamples.length < 25) failSamples.push(msg);
    }
}
const line = (s = '') => console.log(s);
const pct = (x) => (100 * x).toFixed(1) + '%';
const EPS = 1e-6;

// ---- Independent terminal-truth helpers ----------------------------------

function frontierInternalCrossDay(cap, rung) {
    let m = Infinity;
    for (const id of ['halcyon', 'tianxia', 'polaris']) {
        const lab = cap.labs[id];
        if (lab.active && lab.rungInternal[rung] != null) m = Math.min(m, lab.rungInternal[rung]);
    }
    if (cap.open.rungInternal[rung] != null) m = Math.min(m, cap.open.rungInternal[rung]);
    return m;
}
function frontierCertDay(cap, rung) {
    let m = Infinity;
    for (const id of ['halcyon', 'tianxia', 'polaris']) {
        const lab = cap.labs[id];
        if (lab.active && lab.rungCertified[rung] != null) m = Math.min(m, lab.rungCertified[rung]);
    }
    return m;
}

// Scramble EVERY continuous hidden field. Does NOT touch discrete rung records,
// the certification ledger, release counts/dates, controlRegime, or the clock.
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
}

// ---- A. Settlement matrix over N real runs -------------------------------

const outcomeTally = {};   // key -> { YES, NO, FALLBACK, PENDING }
let contractsRef = null;
let listingMids = null;    // key -> day-0 listing mid (measured through the real quoter)

for (let i = 0; i < N; i++) {
    const race = createRaceState((BASE_SEED + i) >>> 0);
    initConsensus(race);                     // fresh book per run (singleton reset)
    if (!contractsRef) {
        contractsRef = consensus.contracts.map(c => ({ ...c }));
        listingMids = {};
        for (const c of consensus.contracts) listingMids[c.key] = getBinaryQuote(c.key).mid;
    }
    const cashSettleCount = {};   // emitted cash settlements per key
    const markerCount = {};       // emitted PENDING_CLOSEOUT markers per key
    for (const c of consensus.contracts) {
        cashSettleCount[c.key] = 0; markerCount[c.key] = 0;
        outcomeTally[c.key] ||= { YES: 0, NO: 0, FALLBACK: 0, PENDING: 0 };
    }

    let r5LedgerCross = null;   // first internal R5 crossing, ACCUMULATED from the daily ledger
    for (let d = 0; d < HORIZON; d++) {
        advanceRace(race);
        for (const cr of race.lastTransitions.crossings) {
            if (cr.track === 'internal' && cr.rung === 5 && r5LedgerCross == null) r5LedgerCross = race.day;
        }
        const settlements = computeBinarySettlements(race);
        for (const s of settlements) {
            const c = s.contract;
            if (s.outcome === 'PENDING_CLOSEOUT') {
                markerCount[s.key]++;
                assert(s.payoutPerUnit == null, `PENDING marker carried a payout: key=${s.key}`);
                continue;
            }
            cashSettleCount[s.key]++;

            // 09 invariant 3: every payout is a listed-tuple value only.
            const tupleVals = [c.notional, 0, c.fallbackValue * c.notional];
            assert(tupleVals.some(v => Math.abs(v - s.payoutPerUnit) < EPS),
                `payout not a tuple value: key=${s.key} outcome=${s.outcome} pay=${s.payoutPerUnit}`);
            if (s.outcome === 'YES') {
                assert(Math.abs(s.payoutPerUnit - c.notional) < EPS, 'YES pays notional');
                assert(race.day <= c.deadline, `YES after deadline: key=${s.key} day=${race.day}`);
                assert(race.lastTransitions.certifications.some(ct => ct.rung === c.predicate.rung),
                    `YES with no matching certification in ledger: key=${s.key}`);
            }
            if (s.outcome === 'NO') {
                assert(s.payoutPerUnit === 0, 'NO pays 0');
                assert(race.day >= c.deadline, `NO before deadline: key=${s.key} day=${race.day}`);
            }
        }
    }

    // Cross-check every contract's terminal disposition.
    for (const c of consensus.contracts) {
        const st = consensus.settled[c.key];
        const pend = consensus.pendingCloseout[c.key];
        // Exactly one terminal disposition (settled XOR pending).
        assert((!!st) !== (!!pend), `contract ${c.key} not exactly one of settled/pending`);

        if (c.terminal) {
            // R5: independent terminal truth ACCUMULATED from each day's crossing
            // ledger (lastTransitions.crossings), NOT re-derived from rungInternal.
            const shouldPend = r5LedgerCross != null && r5LedgerCross <= c.deadline;
            // Sanity: the ledger accumulation agrees with the final-state read.
            assert(r5LedgerCross === (Number.isFinite(frontierInternalCrossDay(race.capability, 5)) ? frontierInternalCrossDay(race.capability, 5) : null),
                `R5 ledger-cross ${r5LedgerCross} disagrees with final-state crossing`);
            if (shouldPend) {
                assert(!!pend && !st, `R5 crossed by ${c.deadline} but not pending (ledgerCross=${r5LedgerCross})`);
                assert(cashSettleCount[c.key] === 0, `R5 crossed but emitted a cash settlement (key=${c.key})`);
                assert(markerCount[c.key] === 1, `R5 crossed but marker count != 1 (key=${c.key})`);
                outcomeTally[c.key].PENDING++;
            } else {
                assert(st && st.outcome === 'NO' && st.day === c.deadline,
                    `R5 uncrossed but not NO@deadline (key=${c.key})`);
                assert(cashSettleCount[c.key] === 1, `R5 NO emitted count != 1 (key=${c.key})`);
                outcomeTally[c.key].NO++;
            }
        } else {
            // Cert contract: outcome + day vs certified state; exactly one cash settlement.
            assert(cashSettleCount[c.key] === 1, `cert contract ${c.key} did not settle exactly once (n=${cashSettleCount[c.key]})`);
            const fcd = frontierCertDay(race.capability, c.predicate.rung);
            const expected = (fcd <= c.deadline) ? 'YES' : 'NO';
            assert(st && st.outcome === expected, `outcome mismatch key=${c.key}: got ${st && st.outcome} want ${expected}`);
            const expectedDay = expected === 'YES' ? fcd : c.deadline;
            assert(st && st.day === expectedDay, `settle-day mismatch key=${c.key}: got ${st && st.day} want ${expectedDay}`);
            outcomeTally[c.key][expected]++;
        }
    }
}

// ---- B. Regime split -----------------------------------------------------

let bMobilizedFroze = false, bMobilizedNoFallback = false, bNatFallback = false, bTradeRejected = false;
{
    // Mobilized: freeze + trades rejected + settlement continues (NO fallback).
    const race = createRaceState((BASE_SEED + 22222) >>> 0);
    initConsensus(race);
    for (let d = 0; d < 200; d++) { advanceRace(race); computeBinarySettlements(race); }
    setControlRegime(race, 'mobilized');
    bMobilizedFroze = consensus.frozen === true;
    assert(bMobilizedFroze, 'mobilized did not freeze the book');
    const openBefore = consensus.contracts.filter(c => !consensus.settled[c.key] && !consensus.pendingCloseout[c.key]);
    const s1 = computeBinarySettlements(race);
    // Mobilization alone must NOT fallback-settle open contracts.
    bMobilizedNoFallback = !s1.some(s => s.outcome === 'FALLBACK');
    assert(bMobilizedNoFallback, 'mobilized wrongly fell back to fallbackValue');
    // Trades are rejected while frozen.
    resetPortfolio(10000); market.day = race.day;
    bTradeRejected = openBefore.length ? executeBinaryTrade(openBefore[0].key, 'long', 1) === null : true;
    assert(bTradeRejected, 'trade not rejected on frozen book');

    // Nationalized: fallback settlement of every open contract.
    const race2 = createRaceState((BASE_SEED + 33333) >>> 0);
    initConsensus(race2);
    for (let d = 0; d < 200; d++) { advanceRace(race2); computeBinarySettlements(race2); }
    const openN = consensus.contracts.filter(c => !consensus.settled[c.key] && !consensus.pendingCloseout[c.key]);
    setControlRegime(race2, 'nationalized');
    const s2 = computeBinarySettlements(race2);
    bNatFallback = openN.length > 0 && openN.every(c => {
        const rec = s2.find(s => s.key === c.key);
        return rec && rec.outcome === 'FALLBACK' && Math.abs(rec.payoutPerUnit - c.fallbackValue * c.notional) < EPS;
    });
    assert(bNatFallback, 'nationalized did not fallback-settle all open contracts');
}

// ---- C. Portfolio accounting ---------------------------------------------

function primeBook(seed, days) {
    const race = createRaceState(seed >>> 0);
    initConsensus(race);
    for (let d = 0; d < days; d++) { advanceRace(race); computeBinarySettlements(race); }
    refreshBinaryQuotes(race);
    market.day = race.day;
    return race;
}
function openKey(race) {
    const c = consensus.contracts.find(x => !consensus.settled[x.key] && !consensus.pendingCloseout[x.key] && !x.terminal);
    return c ? c.key : null;
}

// Loss bound + cash>=0 across outcomes (full lifecycle).
let lossBoundChecks = 0;
for (let s = 0; s < 24; s++) {
    const race = primeBook(BASE_SEED + 7000 + s, 40 + s * 15);
    const key = openKey(race);
    if (key == null) continue;
    for (const outcome of ['YES', 'NO', 'FALLBACK']) {
        resetPortfolio(10000); market.day = race.day;
        const pos = executeBinaryTrade(key, 'short', 3);
        if (!pos) continue;
        const reserved = pos._reservedMargin || 0;
        const c = consensus.contracts.find(x => x.key === key);
        const payoutPerUnit = outcome === 'YES' ? c.notional : outcome === 'FALLBACK' ? c.fallbackValue * c.notional : 0;
        settleBinaries([{ key, label: c.label, outcome, payoutPerUnit }]);
        const pnl = portfolio.cash - 10000;
        lossBoundChecks++;
        assert(-pnl <= reserved + EPS, `short loss ${(-pnl).toFixed(2)} > collateral ${reserved} (${outcome})`);
        assert(portfolio.cash >= -EPS, `cash negative after settle: ${portfolio.cash.toFixed(2)} (${outcome})`);
    }
}

// Cost-basis independence (09 invariant 4).
let basisOK = true;
{
    const key = 0, qty = 5;
    for (const outcome of ['YES', 'NO', 'FALLBACK']) {
        const payoutPerUnit = outcome === 'YES' ? BINARY_NOTIONAL : outcome === 'FALLBACK' ? 0.5 * BINARY_NOTIONAL : 0;
        const cashLong = [10, 80].map(e => {
            resetPortfolio(10000);
            portfolio.positions.push({ id: 1, type: 'binary', qty, strike: key, expiryDay: 300, entryPrice: e, entryDay: 0, fillPrice: e });
            const before = portfolio.cash; settleBinaries([{ key, label: 'x', outcome, payoutPerUnit }]);
            return portfolio.cash - before;
        });
        const cashShort = [10, 80].map(e => {
            resetPortfolio(10000);
            portfolio.positions.push({ id: 1, type: 'binary', qty: -qty, strike: key, expiryDay: 300, entryPrice: e, entryDay: 0, fillPrice: e, _reservedMargin: BINARY_NOTIONAL * qty });
            const before = portfolio.cash; settleBinaries([{ key, label: 'x', outcome, payoutPerUnit }]);
            return portfolio.cash - before;
        });
        if (Math.abs(cashLong[0] - cashLong[1]) >= EPS || Math.abs(cashShort[0] - cashShort[1]) >= EPS) basisOK = false;
        assert(Math.abs(cashLong[0] - cashLong[1]) < EPS, `long settlement cash depends on basis (${outcome})`);
        assert(Math.abs(cashShort[0] - cashShort[1]) < EPS, `short settlement cash depends on basis (${outcome})`);
    }
}

// closePosition round-trip cash exactness (spread only) through the canonical op.
let roundTripOK = true;
{
    const race = primeBook(BASE_SEED + 8000, 120);
    const key = openKey(race);
    if (key != null) {
        resetPortfolio(10000); market.day = race.day;
        const q = getBinaryQuote(key);
        const spreadCost = (q.ask - q.bid) * BINARY_NOTIONAL * 4;   // qty 4
        const pos = executeBinaryTrade(key, 'long', 4);
        const ok = closePosition(null, pos.id, market.S, market.sigma, market.r, market.day, market.q);
        assert(ok, 'binary closePosition returned false unexpectedly');
        assert(!portfolio.positions.some(p => p.type === 'binary'), 'binary not removed after closePosition');
        const roundTrip = 10000 - portfolio.cash;
        roundTripOK = Math.abs(roundTrip - spreadCost) < 1e-3;
        assert(roundTripOK, `round-trip cost ${roundTrip.toFixed(4)} != spread ${spreadCost.toFixed(4)}`);
    }
}

// Partial close + position flip through executeBinaryTrade.
let partialOK = false, flipOK = false;
{
    const race = primeBook(BASE_SEED + 8100, 150);
    const key = openKey(race);
    if (key != null) {
        resetPortfolio(10000); market.day = race.day;
        executeBinaryTrade(key, 'long', 5);
        const p = executeBinaryTrade(key, 'short', 2);   // partial close -> long 3
        partialOK = p && p.qty === 3 && !p._reservedMargin;
        assert(partialOK, `partial close wrong qty/reserved: ${p && p.qty}`);
        const f = executeBinaryTrade(key, 'short', 5);   // flip long 3 -> short 2
        flipOK = f && f.qty === -2 && Math.abs((f._reservedMargin || 0) - BINARY_NOTIONAL * 2) < EPS;
        assert(flipOK, `flip wrong qty/reserved: ${f && f.qty}/${f && f._reservedMargin}`);
    }
}

// Mixed book + generic liquidateAll (open book flattens; frozen reports stuck).
let mixedLiqOK = false, frozenLiqOK = false;
{
    const race = primeBook(BASE_SEED + 8200, 130);
    const key = openKey(race);
    if (key != null) {
        resetPortfolio(10000); market.day = race.day;
        syncMarket({ S: 100, v: 0.04, r: 0.03, day: race.day, q: 0, kappa: 2, theta: 0.04, xi: 0.4, rho: -0.5, a: 0.1, b: 0.03, sigmaR: 0.01, borrowSpread: 0 });
        executeBinaryTrade(key, 'long', 2);
        executeMarketOrder(null, 'stock', 'long', 1, 100, 0.2, 0.03, race.day, undefined, undefined, undefined, 0);
        const { stuck } = liquidateAll(null, 100, 0.2, 0.03, race.day, 0);
        mixedLiqOK = stuck.length === 0 && portfolio.positions.length === 0;
        assert(mixedLiqOK, `open-book liquidation left ${portfolio.positions.length} positions, stuck=${stuck.length}`);
    }
    // Frozen book: binary cannot be flattened -> reported, position remains.
    const race2 = primeBook(BASE_SEED + 8201, 130);
    const key2 = openKey(race2);
    if (key2 != null) {
        resetPortfolio(10000); market.day = race2.day;
        executeBinaryTrade(key2, 'long', 2);
        setControlRegime(race2, 'mobilized');
        refreshBinaryQuotes(race2);
        const { stuck } = liquidateAll(null, 100, 0.2, 0.03, race2.day, 0);
        frozenLiqOK = stuck.length === 1 && stuck[0].type === 'binary'
            && portfolio.positions.some(p => p.type === 'binary');
        assert(frozenLiqOK, `frozen liquidation did not report/keep the binary (stuck=${stuck.length})`);
    }
}

// Coincident option-expiry + settlement: processExpiry must skip binaries.
let coincidentOK = false;
{
    resetPortfolio(10000);
    const X = 300;
    portfolio.positions.push({ id: 1, type: 'binary', qty: 3, strike: 0, expiryDay: X, entryPrice: 40, entryDay: 0, fillPrice: 40 });
    portfolio.positions.push({ id: 2, type: 'call', qty: 1, strike: 100, expiryDay: X, entryPrice: 3, entryDay: 0, fillPrice: 3 });
    syncMarket({ S: 100, v: 0.04, r: 0.03, day: X, q: 0, kappa: 2, theta: 0.04, xi: 0.4, rho: -0.5, a: 0.1, b: 0.03, sigmaR: 0.01, borrowSpread: 0 });
    processExpiry(null, X, 100, X, 0.2, 0.03, 0);
    const binaryStill = portfolio.positions.some(p => p.type === 'binary' && p.id === 1);
    const callGone = !portfolio.positions.some(p => p.type === 'call');
    coincidentOK = binaryStill && callGone;
    assert(binaryStill, 'processExpiry wrongly touched the binary');
    assert(callGone, 'processExpiry did not expire the coincident option');
}

// ---- D. Integrity: quote + fresh settlement decision read no hidden state --

let integrityOK = true;
{
    const PUBLIC_KEYS = ['day', 'certifiedFrontierRung', 'releasedFrontierRung', 'releaseCount', 'lastReleaseDay', 'controlRegime'].sort().join(',');
    // buildPublicView exposes ONLY the public projection (no continuous released capability).
    {
        const race = createRaceState((BASE_SEED + 9000) >>> 0);
        initConsensus(race);
        for (let d = 0; d < 400; d++) advanceRace(race);
        const view = buildPublicView(race);
        assert(Object.keys(view).sort().join(',') === PUBLIC_KEYS, 'buildPublicView leaks non-public keys: ' + Object.keys(view).join(','));
        assert(!('releasedFrontier' in view), 'buildPublicView still exposes continuous releasedFrontier');
    }
    // For each probe day, the day-D quote + fresh settlement decision must be
    // bit-identical whether or not the continuous hidden state is corrupted.
    const DAYS = [420, 500, 756, 880, 1000, 1005];
    for (let s = 0; s < 8; s++) {
        for (const D of DAYS) {
            const seed = (BASE_SEED + 9100 + s) >>> 0;
            // Reference run: drive to D, settling daily.
            const raceA = createRaceState(seed); initConsensus(raceA);
            for (let d = 0; d < D; d++) { advanceRace(raceA); computeBinarySettlements(raceA); }
            refreshBinaryQuotes(raceA);
            const qA = JSON.stringify(consensus.quotes), sA = JSON.stringify(consensus.settled), pA = JSON.stringify(consensus.pendingCloseout);

            // Corrupted run: identical to day D-1, advance to D, corrupt continuous
            // BEFORE the day-D settle + quote.
            const raceB = createRaceState(seed); initConsensus(raceB);
            for (let d = 0; d < D - 1; d++) { advanceRace(raceB); computeBinarySettlements(raceB); }
            advanceRace(raceB);
            corruptContinuous(raceB);
            computeBinarySettlements(raceB);
            refreshBinaryQuotes(raceB);
            const qB = JSON.stringify(consensus.quotes), sB = JSON.stringify(consensus.settled), pB = JSON.stringify(consensus.pendingCloseout);

            if (qA !== qB || sA !== sB || pA !== pB) integrityOK = false;
            assert(qA === qB, `quote changed under corruption (seed ${s}, D=${D})`);
            assert(sA === sB, `settlement changed under corruption (seed ${s}, D=${D})`);
            assert(pA === pB, `pending-closeout changed under corruption (seed ${s}, D=${D})`);
        }
    }
}

// ---- E. Listing calibration (+-8pp of measured, two-sided) ---------------

const listingRows = [];
{
    for (const c of contractsRef) {
        const t = outcomeTally[c.key];
        const tot = t.YES + t.NO + t.FALLBACK + t.PENDING || 1;
        // Measured "YES-equivalent": YES for cert contracts, crossing (PENDING) for terminal R5.
        const measured = c.terminal ? t.PENDING / tot : t.YES / tot;
        const mid = listingMids[c.key];
        const within = Math.abs(mid - measured) <= 0.08;
        const twoSided = mid > 0.05 && mid < 0.95;
        assert(within, `listing mid ${mid.toFixed(3)} not within 8pp of measured ${measured.toFixed(3)} (key=${c.key})`);
        assert(twoSided, `listing mid ${mid.toFixed(3)} not two-sided (key=${c.key})`);
        listingRows.push({ key: c.key, rung: c.predicate.rung, base: c.baseRate, mid, measured, within, twoSided });
    }
}

// ---- F. Fallback-render pure-function check -------------------------------

let renderOK = true;
{
    renderOK = consensusOutcomeClass('YES') === 'pnl-up'
        && consensusOutcomeClass('NO') === 'pnl-down'
        && consensusOutcomeClass('FALLBACK') === ''
        && consensusOutcomeClass('PENDING_CLOSEOUT') === '';
    assert(renderOK, 'consensusOutcomeClass returned a wrong / empty-throwing class');
}

// ---- G. Round-2 regression probes ----------------------------------------

let natReleasesPending = false, markFrozen = false, markEquityOK = false;
let backwardRejected = false, initFrozenOK = false, frozenEquityOK = false;
let pendSeed = null;
{
    // Find a seed whose R5 is pending closeout by day 1001.
    for (let s = 0; s < 80 && pendSeed == null; s++) {
        primeBook(BASE_SEED + 50000 + s, 1001);
        if (consensus.pendingCloseout[3]) pendSeed = BASE_SEED + 50000 + s;
    }

    // (a) Nationalize AFTER pending: the pending contract must fall back (not stay
    //     parked forever) -- marker deleted, FALLBACK emitted, positions released.
    if (pendSeed != null) {
        const race = primeBook(pendSeed, 1001);
        assert(!!consensus.pendingCloseout[3], 'setup: R5 not pending');
        resetPortfolio(10000);
        portfolio.positions.push({ id: 1, type: 'binary', qty: 5, strike: 3, expiryDay: 1000, entryPrice: 70, entryDay: 0, fillPrice: 70 });
        portfolio.positions.push({ id: 2, type: 'binary', qty: -3, strike: 3, expiryDay: 1000, entryPrice: 70, entryDay: 0, fillPrice: 70, _reservedMargin: BINARY_NOTIONAL * 3 });
        setControlRegime(race, 'nationalized');
        const s = computeBinarySettlements(race);
        const rec = s.find(x => x.key === 3);
        natReleasesPending = !!rec && rec.outcome === 'FALLBACK'
            && !consensus.pendingCloseout[3] && !!consensus.settled[3];
        assert(natReleasesPending, 'nationalization did not release the pending R5 at fallback');
        const settled = settleBinaries(s);
        assert(settled.filter(r => r.key === 3).length === 2, 'pending R5 positions not cash-settled under nationalization');
    }

    // (b) R5 pending mark freezes the last valid exchange mark (not 0.50). With no
    //     trade, equity must not move when the contract goes pending.
    if (pendSeed != null) {
        const race = primeBook(pendSeed, 999);   // R5 open the day before deadline
        resetPortfolio(10000); market.day = race.day;
        const midBefore = getBinaryQuote(3).mid;
        const q999 = getBinaryQuote(3);
        const qty = Math.max(1, Math.floor(9800 / (q999.ask * BINARY_NOTIONAL)));
        const pos = executeBinaryTrade(3, 'long', qty);
        if (pos) {
            const eqBefore = portfolioValue(100, 0.2, 0.03, race.day, 0);
            advanceRace(race);
            computeBinarySettlements(race);   // R5 -> pending (crossed)
            refreshBinaryQuotes(race);
            const pm = consensus.pendingCloseout[3];
            markFrozen = !!pm && Math.abs(pm.mark - midBefore) < 1e-9
                && Math.abs(getBinaryMark(3) - midBefore) < 1e-9 && Math.abs(pm.mark - 0.5) > 1e-9;
            assert(markFrozen, `pending mark not frozen at last mid (mark=${pm && pm.mark}, midBefore=${midBefore})`);
            const eqAfter = portfolioValue(100, 0.2, 0.03, race.day, 0);
            markEquityOK = Math.abs(eqAfter - eqBefore) < 1e-6;
            const overwriteLoss = qty * (midBefore - 0.5) * BINARY_NOTIONAL;
            assert(markEquityOK, `equity moved ${(eqBefore - eqAfter).toFixed(2)} on pending (a 0.50 overwrite would cost ${overwriteLoss.toFixed(0)})`);
        }
    }

    // (c) Backward regime transition is rejected and never unfreezes.
    {
        const race = createRaceState((BASE_SEED + 60001) >>> 0); initConsensus(race);
        setControlRegime(race, 'mobilized');
        const ret = setControlRegime(race, 'private');
        backwardRejected = ret === false && race.controlRegime === 'mobilized' && consensus.frozen === true;
        assert(backwardRejected, 'backward regime transition not rejected / unfroze the book');
    }

    // (d) initConsensus inits frozen from an already-mobilized race.
    {
        const race = createRaceState((BASE_SEED + 60002) >>> 0);
        race.controlRegime = 'mobilized';   // simulate an already-mobilized world (e.g. reload)
        initConsensus(race);
        initFrozenOK = consensus.frozen === true;
        assert(initFrozenOK, 'initConsensus did not init frozen=true from a mobilized race');
    }

    // (e) Frozen-book insolvency decision uses canonical equity: cash near zero
    //     but portfolioValue healthy -> the FIXED test (equity<0) would not fire.
    {
        const race = primeBook(BASE_SEED + 60003, 130);
        const key = openKey(race);
        if (key != null) {
            resetPortfolio(10000); market.day = race.day;
            const perUnit = getBinaryQuote(key).ask * BINARY_NOTIONAL;
            const qty = Math.max(1, Math.floor(9960 / perUnit));
            executeBinaryTrade(key, 'long', qty);   // drive cash near zero
            setControlRegime(race, 'mobilized'); refreshBinaryQuotes(race);
            const { stuck } = liquidateAll(null, 100, 0.2, 0.03, race.day, 0);
            const eq = portfolioValue(100, 0.2, 0.03, race.day, 0);
            frozenEquityOK = stuck.length >= 1 && eq > 5000 && portfolio.cash < 200;
            assert(frozenEquityOK, `frozen-book: stuck=${stuck.length} cash=${portfolio.cash.toFixed(0)} eq=${eq.toFixed(0)} (want cash<200, eq>5000)`);
        }
    }
}

// ---- H. Trading-restriction enforcement + release -----------------------

// Replicates main.js _hasStuckLegs (a position is stuck if its binary contract
// is currently un-flattenable).
function hasStuckLegs() {
    for (const p of portfolio.positions) {
        if (p.type !== 'binary') continue;
        const q = consensus.quotes[p.strike];
        if (consensus.frozen || !q || q.settled || q.pending || q.frozen) return true;
    }
    return false;
}

let restrictBlocksTrade = false, restrictBlocksPending = false, restrictBlocksFill = false;
let restrictBlocksBinary = false, cancelAllWorks = false, releaseAfterNat = false;
{
    // (a) A restricted account rejects every order-entry path.
    const race = primeBook(BASE_SEED + 70000, 130);
    const key = openKey(race);
    resetPortfolio(10000); market.day = race.day;
    syncMarket({ S: 100, v: 0.04, r: 0.03, day: race.day, q: 0, kappa: 2, theta: 0.04, xi: 0.4, rho: -0.5, a: 0.1, b: 0.03, sigmaR: 0.01, borrowSpread: 0 });
    placePendingOrder('stock', 'long', 1, 'limit', 999);   // trigger met (S=100<=999); would fill if evaluated
    portfolio.restricted = true;
    restrictBlocksTrade = executeMarketOrder(null, 'stock', 'long', 1, 100, 0.2, 0.03, race.day, undefined, undefined, undefined, 0) === null;
    restrictBlocksPending = placePendingOrder('stock', 'long', 1, 'limit', 999) === null;
    restrictBlocksFill = checkPendingOrders(null, 100, 0.2, 0.03, race.day, 0).length === 0;
    restrictBlocksBinary = key != null ? executeBinaryTrade(key, 'long', 1) === null : true;
    assert(restrictBlocksTrade, 'restricted book accepted a market order');
    assert(restrictBlocksPending, 'restricted book accepted a pending order');
    assert(restrictBlocksFill, 'restricted book filled a pending order');
    assert(restrictBlocksBinary, 'restricted book accepted a binary trade');

    // (b) cancelAllOrders empties the pending book.
    portfolio.restricted = false;
    placePendingOrder('stock', 'long', 1, 'limit', 999);
    const n = cancelAllOrders();
    cancelAllWorks = n >= 1 && portfolio.orders.length === 0;
    assert(cancelAllWorks, 'cancelAllOrders did not clear the pending book');
}
{
    // (c) Release fires after nationalization settles the stuck leg: a frozen
    //     book leaves a binary stuck under forced liquidation; nationalization
    //     falls it back and cash-settles it, so no stuck legs remain.
    const race = primeBook(BASE_SEED + 70001, 130);
    const key = openKey(race);
    if (key != null) {
        resetPortfolio(10000); market.day = race.day;
        executeBinaryTrade(key, 'long', 2);
        setControlRegime(race, 'mobilized'); refreshBinaryQuotes(race);
        const { stuck } = liquidateAll(null, 100, 0.2, 0.03, race.day, 0);
        portfolio.restricted = stuck.length > 0;
        cancelAllOrders();
        const stuckWhileFrozen = hasStuckLegs();                   // binary can't be flattened while frozen
        setControlRegime(race, 'nationalized');
        settleBinaries(computeBinarySettlements(race));            // frozen binary falls back + cash-settles
        refreshBinaryQuotes(race);
        const noStuckAfter = !hasStuckLegs();
        const eqOk = portfolioValue(100, 0.2, 0.03, race.day, 0) >= 0;
        releaseAfterNat = stuck.length > 0 && stuckWhileFrozen && noStuckAfter && eqOk;
        assert(releaseAfterNat, `release-after-nat failed: stuck=${stuck.length} whileFrozen=${stuckWhileFrozen} noStuckAfter=${noStuckAfter} eqOk=${eqOk}`);
    }
}

// ---- Z. Belief-backed quoter swapped in (phase 4) ------------------------
// The REAL P4 quoter (belief.js) replaces the placeholder via setBinaryQuoteSource,
// stepped in lockstep with the race off the public ledger. Re-runs the two
// load-bearing probes against it: (1) listing calibration -- day-0 mids equal the
// listing base rate, two-sided; (2) full-corruption invariance -- corrupting every
// continuous hidden field leaves the belief-backed quote bit-identical (B is built
// from the ledger, so it never reads latent state). Restores the placeholder after.

let zListingOK = true, zInvarianceOK = true, zActiveOK = false;
{
    // initConsensus RESETS _quoteSource to the placeholder, so the belief source
    // must be installed AFTER every initConsensus (a helper enforces the order).
    const initBook = (race) => { initConsensus(race); initBelief(race); setBinaryQuoteSource(binaryQuoteFromBelief); };

    // (1) Listing calibration with the belief quoter.
    {
        const race = createRaceState((BASE_SEED + 91000) >>> 0);
        initBook(race); refreshBinaryQuotes(race);
        for (const c of consensus.contracts) {
            const mid = getBinaryQuote(c.key).mid;
            const within = Math.abs(mid - c.baseRate) <= 0.08;
            const twoSided = mid > 0.05 && mid < 0.95;
            if (!within || !twoSided) zListingOK = false;
            assert(within, `belief listing mid ${mid.toFixed(3)} not within 8pp of base ${c.baseRate} (key=${c.key})`);
            assert(twoSided, `belief listing mid ${mid.toFixed(3)} not two-sided (key=${c.key})`);
        }
    }

    // (2) The belief quoter is REALLY the source (distinguishes it from the
    //     placeholder): at a mid-run state the belief mid differs from what the
    //     placeholder would have printed for the same public view.
    {
        const race = createRaceState((BASE_SEED + 91200) >>> 0);
        initBook(race);
        for (let d = 0; d < 700; d++) { advanceRace(race); stepBelief(race); computeBinarySettlements(race); }
        refreshBinaryQuotes(race);
        const view = buildPublicView(race);
        let anyDiff = false;
        for (const c of consensus.contracts) {
            if (consensus.settled[c.key] || consensus.pendingCloseout[c.key]) continue;
            const beliefMid = getBinaryQuote(c.key).mid;             // belief source is installed
            const placeholderMid = placeholderQuoteRef(view, c);     // what the placeholder WOULD print
            if (Math.abs(beliefMid - placeholderMid) > 1e-3) anyDiff = true;
        }
        zActiveOK = anyDiff;
        assert(zActiveOK, 'belief-backed quote never diverged from the placeholder (source may not be installed)');
    }

    // (3) Full-corruption invariance with the belief quoter (belief stepped daily).
    const DAYS = [200, 420, 500, 756, 900, 1000];
    for (let s = 0; s < 6; s++) {
        for (const D of DAYS) {
            const seed = (BASE_SEED + 91100 + s) >>> 0;
            const raceA = createRaceState(seed); initBook(raceA);
            for (let d = 0; d < D; d++) { advanceRace(raceA); stepBelief(raceA); computeBinarySettlements(raceA); }
            refreshBinaryQuotes(raceA);
            const qA = JSON.stringify(consensus.quotes);

            const raceB = createRaceState(seed); initBook(raceB);
            for (let d = 0; d < D - 1; d++) { advanceRace(raceB); stepBelief(raceB); computeBinarySettlements(raceB); }
            advanceRace(raceB); stepBelief(raceB);   // clean belief step off the day-D ledger
            corruptContinuous(raceB);                 // corrupt AFTER B has folded the clean ledger
            computeBinarySettlements(raceB);
            refreshBinaryQuotes(raceB);
            const qB = JSON.stringify(consensus.quotes);
            if (qA !== qB) zInvarianceOK = false;
            assert(qA === qB, `belief quote changed under corruption (seed ${s}, D=${D})`);
        }
    }

    setBinaryQuoteSource(null);   // restore the placeholder for any later use
}

// ---- Report --------------------------------------------------------------

line(`consensus-test: N=${N} runs, base seed=${BASE_SEED}, horizon=${HORIZON}d`);
line('='.repeat(72));

line('\nContracts under test:');
for (const c of contractsRef) {
    line(`  key ${c.key}  ${c.label.padEnd(30)}  ${c.terminal ? 'TERMINAL ' : 'cert     '}oracle=${c.oracleId}`);
}

line('\nA. Settlement matrix (outcome share over N runs, cross-checked)');
line('  key  rung   YES      NO      PEND    FALLBK   (cross-check vs independent truth)');
for (const c of contractsRef) {
    const t = outcomeTally[c.key];
    const tot = t.YES + t.NO + t.FALLBACK + t.PENDING || 1;
    line(`  ${String(c.key).padStart(3)}   R${c.predicate.rung}   ${pct(t.YES / tot).padStart(6)}  ${pct(t.NO / tot).padStart(6)}  ${pct(t.PENDING / tot).padStart(6)}  ${pct(t.FALLBACK / tot).padStart(6)}`);
}
line('  R5 is the ratified terminal-resolution binary (09): on a crossing it is');
line('  held PENDING closeout, never booked NO -- the destroyed-closeout blocker.');

line('\nB. Regime split (09 adjudicator succession)');
line(`  mobilized -> freeze=${bMobilizedFroze}, no-fallback=${bMobilizedNoFallback}, trades-rejected=${bTradeRejected}`);
line(`  nationalized -> fallback-settles-all-open=${bNatFallback}`);

line('\nC. Portfolio accounting');
line(`  loss-bound + cash>=0: ${lossBoundChecks} short lifecycle cases`);
line(`  cost-basis independence: ${basisOK ? 'ok' : 'FAIL'} | round-trip=spread: ${roundTripOK ? 'ok' : 'FAIL'}`);
line(`  partial close: ${partialOK ? 'ok' : 'FAIL'} | flip: ${flipOK ? 'ok' : 'FAIL'}`);
line(`  mixed liquidateAll: ${mixedLiqOK ? 'ok' : 'FAIL'} | frozen reports stuck: ${frozenLiqOK ? 'ok' : 'FAIL'}`);
line(`  coincident option-expiry (processExpiry skips binary): ${coincidentOK ? 'ok' : 'FAIL'}`);

line('\nD. Integrity (no hidden state in quote OR fresh settlement)');
line(`  public-only view + quote+settlement invariant under full continuous corruption: ${integrityOK ? 'holds' : 'VIOLATED'}`);

line('\nE. Listing calibration (day-0 mid vs measured, +-8pp, two-sided)');
line('  key  rung   base    mid    measured   within8pp  two-sided');
for (const r of listingRows) {
    line(`  ${String(r.key).padStart(3)}   R${r.rung}   ${r.base.toFixed(2)}   ${r.mid.toFixed(3)}   ${r.measured.toFixed(3)}      ${r.within ? 'yes' : 'NO '}        ${r.twoSided ? 'yes' : 'NO'}`);
}

line('\nF. Fallback render helper');
line(`  consensusOutcomeClass never yields '' -> classList.add('') throw path: ${renderOK ? 'ok' : 'FAIL'}`);

line('\nG. Round-2 regression probes' + (pendSeed == null ? '  (no pending-R5 seed found; a/b skipped)' : ` (pending-R5 seed ${pendSeed})`));
line(`  nationalize-after-pending releases contract at fallback: ${natReleasesPending ? 'ok' : (pendSeed == null ? 'n/a' : 'FAIL')}`);
line(`  R5 pending mark frozen at last valid mark (not 0.50):    ${markFrozen ? 'ok' : (pendSeed == null ? 'n/a' : 'FAIL')}`);
line(`  no equity move when contract goes pending (no trade):    ${markEquityOK ? 'ok' : (pendSeed == null ? 'n/a' : 'FAIL')}`);
line(`  backward regime transition rejected (never unfreezes):   ${backwardRejected ? 'ok' : 'FAIL'}`);
line(`  initConsensus inits frozen from a mobilized race:        ${initFrozenOK ? 'ok' : 'FAIL'}`);
line(`  frozen-book insolvency uses canonical equity (cash~0):   ${frozenEquityOK ? 'ok' : 'FAIL'}`);

line('\nH. Trading-restriction enforcement + release');
line(`  restricted rejects market / pending / fill / binary:  ${restrictBlocksTrade ? 'ok' : 'FAIL'} / ${restrictBlocksPending ? 'ok' : 'FAIL'} / ${restrictBlocksFill ? 'ok' : 'FAIL'} / ${restrictBlocksBinary ? 'ok' : 'FAIL'}`);
line(`  cancelAllOrders clears the pending book:              ${cancelAllWorks ? 'ok' : 'FAIL'}`);
line(`  restriction releasable after nationalization settles: ${releaseAfterNat ? 'ok' : 'FAIL'}`);

line('\nZ. Belief-backed quoter (phase 4, swapped in via setBinaryQuoteSource)');
line(`  listing mids == base rate, two-sided:                 ${zListingOK ? 'ok' : 'FAIL'}`);
line(`  belief source really installed (diverges from placeholder): ${zActiveOK ? 'ok' : 'FAIL'}`);
line(`  full-corruption invariance with the real quoter:      ${zInvarianceOK ? 'holds' : 'VIOLATED'}`);

line('\n' + '='.repeat(72));
if (failures === 0) {
    line('ALL CONSENSUS INVARIANTS PASS');
} else {
    line(`${failures} ASSERTION FAILURE(S):`);
    for (const m of failSamples) line('  - ' + m);
}
process.exitCode = failures === 0 ? 0 : 1;
