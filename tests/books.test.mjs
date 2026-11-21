// The Consensus binaries and the Cambria compute futures:
// settlement exactly once against independent truth, the regime split and the
// precedence ladder, and money conserved through every lifecycle. A wrong payout
// is a number on the book that looks like any other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceState, advanceRace, setControlRegime } from '../src/race/race-state.js';
import {
    consensus, initConsensus, refreshBinaryQuotes, computeBinarySettlements, getBinaryQuote, BINARY_NOTIONAL,
    openDispute, ruleDispute, setBinaryQuoteSource,
} from '../src/race/consensus.js';
import {
    computeMarket, initComputeMarket, refreshComputeQuotes, computeFutureSettlements, getComputeMark,
    computeContractByKey, isComputeTradeable, stepNationalizationRef, freezeNationalizationReference,
    getNationalizationReference, COMPUTE_MULTIPLIER,
} from '../src/race/compute-market.js';
import { initBelief, binaryQuoteFromBelief } from '../src/race/belief.js';
import {
    portfolio, resetPortfolio, executeBinaryTrade, settleBinaries, applyBinarySettlementRows, executeMarketOrder,
    closePosition, liquidateAll, settleComputeFutures,
} from '../src/portfolio.js';
import { market, syncMarket } from '../src/market.js';

const HORIZON = 1008, EPS = 1e-9;
const LABS = ['halcyon', 'tianxia', 'polaris'];
const FIXED = { S: 100, v: 0.04, r: 0.03, q: 0, kappa: 2, theta: 0.04, xi: 0.4, rho: -0.5, a: 0.1, b: 0.03, sigmaR: 0.01, borrowSpread: 0 };
const syncFixed = (day) => { syncMarket({ ...FIXED, day }); market.day = day; };
const firstDay = (cap, rung, track) => {
    let m = Infinity;
    for (const id of LABS) { const lab = cap.labs[id]; if (lab.active && lab[track][rung] != null) m = Math.min(m, lab[track][rung]); }
    if (track === 'rungInternal' && cap.open.rungInternal[rung] != null) m = Math.min(m, cap.open.rungInternal[rung]);
    return m;
};

// ---- Consensus ----------------------------------------------------------------

function primeConsensus(seed, days) {
    const race = createRaceState(seed);
    initConsensus(race);
    for (let d = 0; d < days; d++) { advanceRace(race); computeBinarySettlements(race); }
    refreshBinaryQuotes(race);
    market.day = race.day;
    return race;
}
const openBinary = () => consensus.contracts.find(c => !consensus.settled[c.key] && !consensus.pendingCloseout[c.key] && !c.terminal)?.key ?? null;

test('every binary settles exactly once, against the certification ledger; a crossed R5 waits for closeout', () => {
    const seen = { YES: 0, NO: 0, PENDING: 0 };
    for (let s = 1; s <= 60; s++) {
        const race = createRaceState(s);
        initConsensus(race);
        const cash = {}, markers = {};
        let r5Cross = null;
        for (let d = 0; d < HORIZON; d++) {
            advanceRace(race);
            for (const cr of race.lastTransitions.crossings) if (cr.track === 'internal' && cr.rung === 5 && r5Cross == null) r5Cross = race.day;
            for (const st of computeBinarySettlements(race)) {
                const c = st.contract;
                if (st.outcome === 'PENDING_CLOSEOUT') { markers[st.key] = (markers[st.key] || 0) + 1; assert.equal(st.payoutPerUnit, null); continue; }
                cash[st.key] = (cash[st.key] || 0) + 1;
                assert.ok([c.notional, 0, c.fallbackValue * c.notional].some(v => Math.abs(v - st.payoutPerUnit) < EPS), 'payout outside the listed tuple');
                if (st.outcome === 'YES') assert.ok(race.day <= c.deadline && race.lastTransitions.certifications.some(x => x.rung === c.predicate.rung));
                if (st.outcome === 'NO') assert.ok(race.day >= c.deadline);
            }
        }
        for (const c of consensus.contracts) {
            const st = consensus.settled[c.key], pend = consensus.pendingCloseout[c.key];
            assert.notEqual(!!st, !!pend, `seed ${s} key ${c.key}: not exactly one of settled / pending`);
            if (c.terminal) {
                if (r5Cross != null && r5Cross <= c.deadline) {
                    assert.ok(pend && !cash[c.key] && markers[c.key] === 1, `seed ${s}: a crossed R5 was booked or marked twice`);
                    seen.PENDING++;
                } else {
                    assert.ok(st.outcome === 'NO' && st.day === c.deadline && cash[c.key] === 1);
                    seen.NO++;
                }
            } else {
                const cd = firstDay(race.capability, c.predicate.rung, 'rungCertified');
                const want = cd <= c.deadline ? 'YES' : 'NO';
                assert.equal(cash[c.key], 1, `seed ${s} key ${c.key} settled ${cash[c.key]} times`);
                assert.equal(st.outcome, want);
                assert.equal(st.day, want === 'YES' ? cd : c.deadline);
                seen[want]++;
            }
        }
    }
    assert.ok(seen.YES && seen.NO && seen.PENDING, `every disposition exercised: ${JSON.stringify(seen)}`);
});

test('the regime split: mobilized freezes and keeps settling; nationalized falls back, pending R5 included; no way back', () => {
    const race = primeConsensus(22222, 200);
    setControlRegime(race, 'mobilized');
    assert.equal(consensus.frozen, true);
    const open = openBinary();
    assert.ok(!computeBinarySettlements(race).some(s => s.outcome === 'FALLBACK'), 'mobilization alone fell back');
    resetPortfolio(10000); market.day = race.day;
    assert.equal(executeBinaryTrade(open, 'long', 1), null, 'a frozen book took a trade');
    assert.equal(setControlRegime(race, 'private'), false);
    assert.ok(race.controlRegime === 'mobilized' && consensus.frozen);

    let pendSeed = null;
    for (let s = 50000; s < 50080 && pendSeed == null; s++) { primeConsensus(s, 1001); if (consensus.pendingCloseout[3]) pendSeed = s; }
    assert.ok(pendSeed != null, 'no world with a pending R5 by day 1001');
    const r2 = primeConsensus(pendSeed, 1001);
    const openN = consensus.contracts.filter(c => !consensus.settled[c.key]);
    setControlRegime(r2, 'nationalized');
    const rows = computeBinarySettlements(r2);
    for (const c of openN) {
        const row = rows.find(x => x.key === c.key);
        assert.ok(row && row.outcome === 'FALLBACK' && Math.abs(row.payoutPerUnit - c.fallbackValue * c.notional) < EPS, `key ${c.key} not at fallback`);
    }
    assert.ok(!consensus.pendingCloseout[3] && consensus.settled[3], 'the pending R5 stayed parked under nationalization');
});

test('binary accounting: a short loses at most its collateral, cash never depends on basis, a round trip costs the spread', () => {
    const race = primeConsensus(7000, 130);
    const key = openBinary(), c = consensus.contracts.find(x => x.key === key);
    for (const outcome of ['YES', 'NO', 'FALLBACK']) {
        resetPortfolio(10000); market.day = race.day;
        const pos = executeBinaryTrade(key, 'short', 3);
        const reserved = pos._reservedMargin;
        const pay = outcome === 'YES' ? c.notional : outcome === 'FALLBACK' ? c.fallbackValue * c.notional : 0;
        settleBinaries([{ key, label: c.label, outcome, payoutPerUnit: pay }]);
        assert.ok(10000 - portfolio.cash <= reserved + EPS && portfolio.cash >= -EPS, `${outcome}: the short lost more than its collateral`);
        // Cash at settlement is independent of the entry price, long or short.
        const cashAt = (qty, entry) => {
            resetPortfolio(10000);
            portfolio.positions.push({ id: 1, type: 'binary', qty, strike: key, expiryDay: 300, entryPrice: entry, entryDay: 0, fillPrice: entry,
                ...(qty < 0 ? { _reservedMargin: BINARY_NOTIONAL * -qty } : {}) });
            settleBinaries([{ key, label: 'x', outcome, payoutPerUnit: pay }]);
            return portfolio.cash;
        };
        assert.equal(cashAt(5, 10), cashAt(5, 80));
        assert.equal(cashAt(-5, 10), cashAt(-5, 80));
    }
    resetPortfolio(10000); market.day = race.day;
    const q = getBinaryQuote(key);
    const pos = executeBinaryTrade(key, 'long', 4);
    assert.ok(closePosition(null, pos.id, market.S, market.sigma, market.r, market.day, market.q));
    assert.ok(Math.abs((10000 - portfolio.cash) - (q.ask - q.bid) * BINARY_NOTIONAL * 4) < 1e-3, 'the round trip cost more than the spread');
    // Flipping long 3 to short 2 reserves collateral for the short side only.
    executeBinaryTrade(key, 'long', 3);
    const f = executeBinaryTrade(key, 'short', 5);
    assert.ok(f.qty === -2 && Math.abs(f._reservedMargin - BINARY_NOTIONAL * 2) < EPS);
});

test('a frozen book cannot be flattened: the leg is reported stuck, never a fictional fill', () => {
    const race = primeConsensus(8201, 130);
    const key = openBinary();
    resetPortfolio(10000); market.day = race.day;
    executeBinaryTrade(key, 'long', 2);
    setControlRegime(race, 'mobilized');
    refreshBinaryQuotes(race);
    const { stuck } = liquidateAll(null, 100, 0.2, 0.03, race.day, 0);
    assert.ok(stuck.length === 1 && stuck[0].type === 'binary' && portfolio.positions.some(p => p.type === 'binary'));
});

test('a dispute ruling pays once, through the outbox or synchronously; a late ruling is void and the fallback pays', () => {
    const race = createRaceState(303);
    initConsensus(race); resetPortfolio(10000); syncFixed(race.day);
    const c = consensus.contracts.find(x => !x.terminal);
    executeBinaryTrade(c.key, 'long', 2);
    const bought = portfolio.cash;
    openDispute(c.key, 10, 'private');
    const row = ruleDispute(c.key, 'YES', 12, 'private');
    assert.ok(row.outcome === 'YES' && row.payoutPerUnit === c.notional);
    applyBinarySettlementRows(consensus.pendingRows);       // the daily pass drains the outbox
    const paid = portfolio.cash;
    assert.ok(paid > bought && !portfolio.positions.some(p => p.type === 'binary'));
    assert.equal(applyBinarySettlementRows([row]).fresh.length, 0);
    applyBinarySettlementRows(consensus.pendingRows);
    assert.equal(portfolio.cash, paid, 'a ruling paid twice');

    const r2 = createRaceState(201);
    initConsensus(r2);
    const c2 = consensus.contracts.find(x => !x.terminal);
    openDispute(c2.key, 10, 'private');
    assert.equal(ruleDispute(c2.key, 'YES', c2.disputeDeadline + 1, 'private'), null);
    r2.day = c2.disputeDeadline + 2;
    const s = computeBinarySettlements(r2).find(x => x.key === c2.key);
    assert.ok(s && s.outcome === 'FALLBACK' && Math.abs(s.payoutPerUnit - c2.fallbackValue * c2.notional) < EPS);
});

// The listing base rates live only in consensus.js and equal B's day-0 quote,
// which is the same in every world; a refit that skips re-deriving them leaves
// the listing disagreeing with the market.
test('each listing base rate is B\'s day-0 quote, two-sided', () => {
    for (const s of [91000, 91001, 91002]) {
        const race = createRaceState(s);
        initConsensus(race); initBelief(race); setBinaryQuoteSource(binaryQuoteFromBelief);
        refreshBinaryQuotes(race);
        for (const c of consensus.contracts) {
            const mid = getBinaryQuote(c.key).mid;
            assert.ok(mid > 0.05 && mid < 0.95, `R${c.predicate.rung} listing not two-sided`);
            assert.ok(Math.abs(c.baseRate - mid) <= 0.03, `R${c.predicate.rung} base rate ${c.baseRate} vs B's day-0 quote ${mid.toFixed(3)}`);
        }
    }
    setBinaryQuoteSource(null);
});

// ---- Compute futures ------------------------------------------------------------

const calm = { taiwanBlockade: false, straitClosed: false, chinaRelations: 0, tradeWarStage: 0 };
const blockade = { taiwanBlockade: true, straitClosed: false, chinaRelations: -3, tradeWarStage: 4 };
function computeDay(race, geo) {
    advanceRace(race);
    stepNationalizationRef(race, 100 + race.day * 0.05);
    const rows = computeFutureSettlements(race, geo);
    settleComputeFutures(rows, race);
    refreshComputeQuotes(race, geo);
    return rows;
}
function primeCompute(seed, days, geo = calm) {
    const race = createRaceState(seed);
    initComputeMarket(race, geo);
    for (let d = 0; d < days; d++) computeDay(race, geo);
    syncFixed(race.day);
    return race;
}
const openCompute = () => computeMarket.contracts.find(x => { const q = computeMarket.quotes[x.key]; return q && !q.settled && !q.frozen; })?.key ?? null;
const buy = (race, side, qty, key) => executeMarketOrder(null, 'computefuture', side, qty, market.S, market.sigma, market.r, race.day, key, key, undefined, 0);

test('ordinary and decree settlement pay signedQty x multiplier x (price - basis) exactly, and conserve cash', () => {
    for (const side of ['long', 'short']) {
        const race = primeCompute(1000, 100);
        const key = openCompute(), st = computeContractByKey(key);
        resetPortfolio(10000); syncFixed(race.day);
        const pos = buy(race, side, 4, key);
        let rec = null, row = null;
        while (!row && race.day < st.settleDay) {
            advanceRace(race); stepNationalizationRef(race, 100 + race.day * 0.05);
            rec = computeFutureSettlements(race, calm).find(x => x.key === key);
            if (rec) row = settleComputeFutures([rec], race).find(r => r.key === key);
            refreshComputeQuotes(race, calm); syncFixed(race.day);
        }
        assert.equal(rec.kind, 'ORDINARY');
        assert.ok(Math.abs(row.pnl - pos.qty * COMPUTE_MULTIPLIER * (rec.settlePrice - pos.entryPrice)) < 1e-6, `${side}: ordinary P&L`);
        assert.ok(Math.abs(portfolio.cash - (10000 + row.pnl)) < 1e-6 && !portfolio.positions.length, `${side}: ordinary cash`);
    }
    for (const side of ['long', 'short']) {
        const race = primeCompute(3000, 120);
        const key = openCompute();
        resetPortfolio(10000); syncFixed(race.day);
        const pos = buy(race, side, 5, key);
        const lastMark = getComputeMark(key);
        setControlRegime(race, 'mobilized');
        assert.equal(buy(race, 'long', 1, key), null, 'a frozen compute book took a trade');
        const rec = computeFutureSettlements(race, calm).find(x => x.key === key);
        assert.ok(rec.kind === 'DECREE' && Math.abs(rec.decreePrice - lastMark) < EPS);
        const row = settleComputeFutures([rec], race).find(r => r.key === key);
        const pnl = pos.qty * COMPUTE_MULTIPLIER * (rec.decreePrice - pos.entryPrice);
        assert.ok(Math.abs(row.pnl - pnl) < 1e-6 && Math.abs(portfolio.cash - (10000 + pnl)) < 1e-6, `${side}: decree`);
    }
});

test('a multi-fill position settles on its VWAP basis: reported P&L is the cash P&L', () => {
    const race = primeCompute(80000, 40);
    const key = [...computeMarket.contracts].sort((a, b) => b.settleDay - a.settleDay)[0].key;
    resetPortfolio(10000); syncFixed(race.day);
    const f1 = buy(race, 'long', 2, key).entryPrice;
    for (let d = 0; d < 40; d++) computeDay(race, calm);
    syncFixed(race.day);
    const p2 = buy(race, 'long', 3, key);
    assert.ok(Math.abs(p2.fillPrice - f1) > 1e-3, 'the two fills did not differ');
    assert.ok(Math.abs(p2.entryPrice - (2 * f1 + 3 * p2.fillPrice) / 5) < EPS);
    setControlRegime(race, 'mobilized');
    const row = settleComputeFutures([computeFutureSettlements(race, calm).find(x => x.key === key)], race)[0];
    assert.ok(Math.abs(row.pnl - (portfolio.cash - 10000)) < 1e-6);
});

test('precedence decree > force majeure > ordinary; after the freeze nothing lists and nothing settles twice', () => {
    const race = primeCompute(4000, 300, blockade);
    setControlRegime(race, 'mobilized');
    const all = computeFutureSettlements(race, blockade);
    assert.ok(all.length && all.every(s => s.kind === 'DECREE'));
    const r2 = createRaceState(4001);
    initComputeMarket(r2, blockade);
    let fm = 0;
    for (let d = 0; d < 130; d++) {
        advanceRace(r2);
        const rows = computeFutureSettlements(r2, blockade);
        assert.ok(!rows.some(s => s.kind === 'ORDINARY'), 'an ordinary settlement under a blockade');
        fm += rows.filter(s => s.kind === 'FORCE_MAJEURE').length;
        refreshComputeQuotes(r2, blockade);
    }
    assert.ok(fm > 0);

    const r3 = primeCompute(84000, 100);
    const keys = Object.keys(computeMarket._state).sort();
    const open = keys.filter(k => !computeMarket._state[k].settled).length;
    setControlRegime(r3, 'mobilized');
    const first = computeFutureSettlements(r3, calm);
    settleComputeFutures(first, r3);
    assert.ok(first.length === open && first.every(s => s.kind === 'DECREE'));
    let extra = 0;
    for (let d = 0; d < 300; d++) { advanceRace(r3); extra += computeFutureSettlements(r3, calm).length; refreshComputeQuotes(r3, calm); }
    assert.equal(extra, 0, 'a contract settled again after the decree');
    assert.deepEqual(Object.keys(computeMarket._state).sort(), keys, 'a contract listed after the freeze');
});

test('a frozen compute leg is stuck, the decree clears it, and the lifecycle conserves cash; frozen marks never move', () => {
    const race = primeCompute(5001, 150);
    const key = openCompute();
    resetPortfolio(10000); syncFixed(race.day);
    const pos = buy(race, 'long', 4, key);
    setControlRegime(race, 'mobilized');
    const { stuck } = liquidateAll(null, market.S, market.sigma, market.r, race.day, 0);
    assert.ok(stuck.length === 1 && stuck[0].type === 'computefuture');
    const mark = getComputeMark(key);
    for (let d = 0; d < 25; d++) { advanceRace(race); refreshComputeQuotes(race, calm); }
    assert.equal(getComputeMark(key), mark, 'a frozen mark repriced');
    const rec = computeFutureSettlements(race, calm).find(x => x.key === key);
    settleComputeFutures([rec], race);
    assert.ok(!portfolio.positions.length);
    assert.ok(Math.abs(portfolio.cash - (10000 + pos.qty * (rec.decreePrice - pos.entryPrice))) < 1e-6);
});

test('fabricated and settled contracts are refused at the admission chokepoint', () => {
    const race = primeCompute(81000, 130);
    const key = openCompute(), st = computeContractByKey(key);
    resetPortfolio(10000); syncFixed(race.day);
    assert.equal(buy(race, 'long', 1, 999999), null);
    while (race.day < st.settleDay) computeDay(race, calm);
    syncFixed(race.day);
    assert.ok(computeMarket.settled[key] && !isComputeTradeable(key));
    assert.equal(buy(race, 'long', 1, key), null, 'a settled contract reopened');
});

test('the nationalization reference: the median of the 20 sessions ending 5 before the trigger, frozen once', () => {
    const r = createRaceState(42000);
    initComputeMarket(r, calm);
    const T = 300;
    for (let d = 0; d < T; d++) { advanceRace(r); stepNationalizationRef(r, 100 + r.day); }
    const frozen = freezeNationalizationReference(r, T);
    const median = 100 + ((T - 24) + (T - 5)) / 2;
    assert.ok(frozen.sessions === 20 && Math.abs(frozen.median - median) < EPS);
    assert.ok(Math.abs(frozen.reference - median * r.nationalizationRef.multiple) < EPS);
    assert.equal(freezeNationalizationReference(r, T + 50).day, T, 'the reference re-froze');
    const r2 = createRaceState(43000);
    initComputeMarket(r2, calm);
    for (let d = 0; d < 200; d++) { advanceRace(r2); stepNationalizationRef(r2, 100 + r2.day); }
    setControlRegime(r2, 'nationalized');
    assert.equal(getNationalizationReference(r2) && r2.nationalizationRef.frozen.day, r2.day);
});
