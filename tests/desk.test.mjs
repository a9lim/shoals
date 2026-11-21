// The desk's own accounting ("Private rounds and primary
// offerings"): the inherited hand, its obligations and the forced sale, the
// flatten's reduce-only legs, and private stakes. Each is a cash path where an
// error moves equity by an amount that looks plausible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { ExpiryManager } from '../src/chain.js';
import { market, syncMarket } from '../src/market.js';
import { computeVXHCNSpot } from '../src/pricing.js';
import * as book from '../src/portfolio.js';
import { unitPrice } from '../src/position-value.js';
import { resetImpactState, getStockImpact, getBondImpact, getVxhcnImpact } from '../src/price-impact.js';
import { createRaceState, freshTransitions } from '../src/race/race-state.js';
import { consensus, initConsensus, setBinaryQuoteSource, refreshBinaryQuotes } from '../src/race/consensus.js';
import { initComputeMarket, setComputePriceSource, refreshComputeQuotes } from '../src/race/compute-market.js';
import { initBelief, binaryQuoteFromBelief, computeCurveFromBelief } from '../src/race/belief.js';
import { initValuation } from '../src/race/valuation.js';
import { initRounds, stepRounds, recordPrimaryAllocation, halcyonOfferPrice } from '../src/race/rounds.js';
import { resetLedger, ledgerEntries } from '../src/race/ledger.js';
import { resetCoupling } from '../src/race/coupling.js';
import { EventEngine } from '../src/events.js';
import { resetRegulations, activateRegulation } from '../src/regulations.js';
import { resetFactions } from '../src/faction-standing.js';
import { FIXTURES, takeover, resetOpening } from '../src/opening.js';
import { INITIAL_CAPITAL as E0, INITIAL_PRICE } from '../src/config.js';
import { roundDispatch } from '../src/events/rounds.js';
import { run, setSink, runInternals } from '../src/run.js';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const P = book.portfolio;
const sim = new Simulation();
sim.reset(5);
sim.prepopulate();
const BOOT_DAY = sim.day;
const em = new ExpiryManager();
em.init(sim.day);
const EXPIRIES = em.update(sim.day).map(e => e.day);
const GEO = new EventEngine().world.geopolitical;

function corrupt(race) {
    for (const k of Object.keys(race.hidden)) if (typeof race.hidden[k] === 'number') race.hidden[k] = 0.999;
    race.evidenceLogOdds = 99;
    race.heat.transient = 0.99; race.heat.floor = 0.99;
    for (const id of ['halcyon', 'tianxia', 'polaris']) {
        const lab = race.capability.labs[id];
        lab.C_internal = 5.5; lab.C_released = 5.5; lab.compute0 = 99; lab.talent = 99;
        for (const r of [1, 2, 3, 4, 5]) lab.rungInternal[r] = 0;
        race.safety[id] = 0.001;
    }
    race.capability.open.C = 5.5;
    race.latentIncidents.push({ id: 'FAKE', severity: 4, occurDay: race.day });
}
/** A Dynamic boot up to the takeover: the race and its markets quoting at day 0's marks, the book empty. */
function boot(seed, dirty = false) {
    sim.S = INITIAL_PRICE; sim.v = sim.theta; sim.r = sim.b; sim.day = BOOT_DAY;
    syncMarket(sim);
    market.vxhcn = computeVXHCNSpot(sim.v, sim.kappa, sim.theta, sim.xi);
    book.resetPortfolio(); resetImpactState();
    resetRegulations(); resetFactions(); resetOpening();
    const race = createRaceState(seed);
    if (dirty) corrupt(race);
    resetCoupling(); resetLedger();
    initConsensus(race); initComputeMarket(race, GEO); initBelief(race); initValuation(race); initRounds(race);
    setBinaryQuoteSource(binaryQuoteFromBelief); setComputePriceSource(computeCurveFromBelief);
    refreshBinaryQuotes(race); refreshComputeQuotes(race, GEO);
    return race;
}
const fresh = () => { book.resetPortfolio(); resetImpactState(); };
const sigOf = () => JSON.stringify({ cash: P.cash, positions: P.positions, orders: P.orders, obligations: P.obligations });
const equity = () => book.portfolioValue(sim.S, market.sigma, sim.r, sim.day, sim.q);
const margin = () => book.checkMargin(sim.S, market.sigma, sim.r, sim.day, sim.q);
const settle = (ob) => book.settleObligation(ob, sim, sim.S, market.sigma, sim.r, sim.day, sim.q);
const seatAtMark = (type, qty, strike, expiryDay) =>
    book.seatPosition(type, qty, unitPrice(type, sim.S, market.sigma, sim.r, sim.day, strike, expiryDay, sim.q), sim.day, strike, expiryDay);
const OB = (amount, dueDay = 40) => ({ kind: 'redemption', label: 'the test redemption', amount, dueDay });
const buy = (type, side, qty, strike, expiryDay, name) => book.executeMarketOrder(sim, type, side, qty, sim.S, market.sigma, sim.r, sim.day, strike, expiryDay, name, sim.q);
const reduce = (posId, side, qty, mult) => book.reduceOnlyClose(sim, posId, side, qty, sim.S, market.sigma, sim.r, sim.day, sim.q, mult);
const closeLeg = (p) => ({ posId: p.id, side: p.qty > 0 ? 'short' : 'long', qty: Math.abs(p.qty) });

// The cash is solved so equity net of the obligation is INITIAL_CAPITAL.
test('every inherited desk takes over at exactly INITIAL_CAPITAL, is not a trade, and reads no hidden state', () => {
    for (const seed of [1, 2, 3]) {
        for (const f of FIXTURES) {
            boot(seed);
            takeover(f, EXPIRIES);
            assert.ok(near(equity(), E0), `${f.id}: equity ${equity()}`);
            assert.ok(!margin().triggered, `${f.id}: the takeover trips the margin check`);
            assert.ok(P.totalTrades === 0 && ledgerEntries().length === 0 && getStockImpact(market.sigma) === 0
                && getBondImpact(market.sigmaR) === 0 && getVxhcnImpact(market.xi) === 0, `${f.id}: the takeover traded`);
            const clean = sigOf();
            boot(seed, true);
            takeover(f, EXPIRIES);
            assert.equal(sigOf(), clean, `${f.id}: the hand read hidden state`);
        }
    }
});

test('an unpaid obligation is netted out of NAV, collateral and the margin check', () => {
    boot(1); fresh();
    P.cash = 2000;
    book.seatPosition('stock', 50, 100, sim.day);
    book.seatPosition('stock', -10, 100, sim.day);
    const read = () => [equity(), book.collateralEquity(sim.S, market.sigma, sim.r, sim.day, sim.q), margin().equity, margin().collateralEquity];
    const before = read();
    P.obligations = [OB(700)];
    read().forEach((v, i) => assert.ok(near(before[i] - v, 700), `path ${i} did not net the obligation`));
    const shortTry = (ob) => { fresh(); P.cash = 1000; if (ob) P.obligations = [OB(ob)]; return buy('stock', 'short', 10) != null; };
    assert.ok(shortTry(0) && !shortTry(500), 'short admission ignored the obligation');
});

test('paying an obligation moves cash and the liability together, once; the forced sale raises the shortfall', () => {
    boot(1); fresh();
    P.cash = 5000;
    book.seatPosition('stock', 20, 100, sim.day);
    const ob = OB(2500);
    P.obligations = [ob];
    const eq0 = equity();
    const res = settle(ob);
    assert.ok(!res.forced && near(P.cash, 2500) && P.obligations.length === 0 && near(equity(), eq0));
    assert.equal(settle(ob), null, 'an obligation paid twice');

    boot(1); fresh();
    seatAtMark('call', 142, 115, EXPIRIES[1]);
    seatAtMark('vxhcnfuture', 45, undefined, EXPIRIES[0]);
    seatAtMark('stock', 110);
    seatAtMark('bond', 65, undefined, EXPIRIES[7]);
    P.cash = 500;
    const ob2 = OB(1000);
    P.obligations = [ob2];
    const r2 = settle(ob2);
    assert.ok(r2.forced && near(r2.shortfall, 500) && r2.proceeds >= 500 && r2.remainder === 0);
    assert.ok(near(P.cash, 500 + r2.proceeds - 1000) && P.obligations.length === 0, 'the forced sale did not conserve cash');

    // Never a short, a private stake, or a disputed or pending contract; the rest goes on the margin loan.
    boot(1); fresh();
    const keep = [seatAtMark('stock', -20), book.seatPosition('privatestake', 40, 10, sim.day)];
    for (const [i, flag] of [[1, 'disputed'], [2, 'pending']]) {
        const c = consensus.contracts[i];
        keep.push(book.seatPosition('binary', 30, 50, sim.day, c.key, c.deadline));
        consensus.quotes[c.key] = { ...consensus.quotes[c.key], [flag]: true };
    }
    const bond = seatAtMark('bond', 10, undefined, EXPIRIES[7]);
    const qty = keep.map(p => p.qty);
    P.cash = 0;
    const ob3 = OB(5000);
    P.obligations = [ob3];
    const r3 = settle(ob3);
    assert.ok(r3.sold.length === 1 && r3.sold[0].id === bond.id);
    assert.ok(keep.every((p, i) => P.positions.includes(p) && p.qty === qty[i]));
    assert.ok(near(r3.remainder, 5000 - r3.proceeds) && near(P.cash, -r3.remainder));

    boot(1); fresh();
    P.cash = 3000;
    P.obligations = [OB(2500)];
    assert.ok(book.payObligationsAtCloseout() === 2500 && P.cash === 500 && book.unpaidObligations() === 0);
});

// The flatten loads a reduce-only leg per position, bound to its id, executed later.
test('a reduce-only leg is capped at what its position holds and skipped if the position reversed', () => {
    boot(1); fresh();
    const stock = seatAtMark('stock', 100);
    const leg = closeLeg(stock);
    buy('stock', 'short', 60);
    const r = reduce(leg.posId, leg.side, leg.qty);
    assert.ok(r.status === 'filled' && r.qty === 40 && !P.positions.some(p => p.type === 'stock'), `${r.status} ${r.qty}`);
    const gone = sigOf();
    assert.equal(reduce(leg.posId, leg.side, leg.qty).status, 'gone');
    assert.equal(sigOf(), gone);
    fresh();
    const flip = seatAtMark('stock', 50), fleg = closeLeg(flip);
    buy('stock', 'short', 80);
    const flipped = sigOf();
    assert.equal(reduce(fleg.posId, fleg.side, fleg.qty).status, 'reversed');
    assert.equal(sigOf(), flipped, 'a reversed position was traded on its stale side');
});

test('the flatten\'s estimate mutates nothing and releases exactly what execution releases', () => {
    boot(1); fresh();
    activateRegulation('transaction_tax');
    buy('stock', 'long', 90); buy('bond', 'long', 30, undefined, EXPIRIES[3]);
    buy('vxhcnfuture', 'long', 40, undefined, EXPIRIES[0]);
    buy('call', 'long', 25, 105, EXPIRIES[1]); buy('put', 'short', 15, 95, EXPIRIES[2], 'Strangle');
    book.executeBinaryTrade(consensus.contracts.find(c => !consensus.quotes[c.key]?.settled).key, 'short', 12);
    const legs = P.positions.map(closeLeg);
    legs[0].qty += 7;
    const pools = () => JSON.stringify([getStockImpact(market.sigma), getBondImpact(market.sigmaR), getVxhcnImpact(market.xi)]);
    const s0 = sigOf(), p0 = pools();
    const est = book.estimateReduceOnly(legs, sim.S, market.sigma, sim.r, sim.day, sim.q, 2.5);
    assert.ok(sigOf() === s0 && pools() === p0, 'the estimate mutated the book or the impact pools');
    const cash0 = P.cash;
    for (const L of legs) assert.equal(reduce(L.posId, L.side, L.qty, 2.5).status, 'filled');
    assert.ok(P.positions.length === 0 && near(est.released, P.cash - cash0, 1e-6), `${est.released} vs ${P.cash - cash0}`);
    resetRegulations();
});

test('a private stake is cash-funded at the round price, counts in NAV but not collateral, and cannot back borrowing', () => {
    const race = createRaceState(1);
    race.day = 10; race.lastTransitions = freshTransitions(); race.lastTransitions.spawned = ['polaris'];
    Object.assign(race.capability.labs.polaris, { active: true, rungReleased: { 1: 10 } });
    race.safety.polaris = 0.70;
    initRounds(race); stepRounds(race, 0.7);
    race.day = 31; race.lastTransitions = freshTransitions();
    const founding = stepRounds(race, 0.7)[0];
    book.resetPortfolio(); P.cash = 125;
    const taken = book.allocatePrivateStake(founding, 500, 283);
    assert.ok(taken.allocated === 125 && taken.qty === 125 / founding.price && P.cash === 0, 'the allocation was not capped at cash');
    assert.equal(book.liquidateAll({}, 100, 0.2, 0.04, 283, 0).stuck.length, 1, 'a private stake was sold');
    P.cash = 20;
    P.positions.push({ id: 999, type: 'stock', qty: -1, entryPrice: 100, _reservedMargin: 100 });
    resetImpactState();
    const m = book.checkMargin(100, 0.2, 0.04, 283, 0);
    assert.ok(near(m.equity, 20 + 125) && near(m.collateralEquity, 20) && m.triggered);
    P.positions.pop();
    assert.equal(book.executeMarketOrder({}, 'stock', 'long', 1, 100, 0.2, 0.04, 283), null, 'a private mark backed a margin buy');
    // A subscription never spends collateral the book needs for maintenance.
    book.resetPortfolio(15000);
    syncMarket({ ...run.sim, S: 158, v: 0.04, r: 0.04, day: 283, q: 0 });
    P.positions.push({ id: 9001, type: 'stock', qty: -100, entryPrice: 150, fillPrice: 150, entryDay: 0, strategyName: null, _reservedMargin: 5000 });
    const before = book.checkMargin(158, 0.2, 0.04, 283, 0);
    const stake = book.allocatePrivateStake({ price: 1 }, 840, 283);
    assert.ok(!before.triggered && !book.checkMargin(158, 0.2, 0.04, 283, 0).triggered);
    assert.ok(!stake || stake.allocated <= before.collateralEquity - before.required + 1e-9);
});

test('a round offer\'s subscription funds once and the follow-on\'s primary input reads the cash actually taken', () => {
    const race = createRaceState(1);
    race.day = 10; race.lastTransitions = freshTransitions(); race.lastTransitions.spawned = ['polaris'];
    Object.assign(race.capability.labs.polaris, { active: true, rungReleased: { 1: 10 } });
    race.safety.polaris = 0.70;
    run.race = race; run.engine = null; run.queue.length = 0;
    setSink({ toast() {} });
    resetLedger(); initBelief(race); initRounds(race);
    stepRounds(race, 0.7);
    race.day = 31; race.lastTransitions = freshTransitions();
    const polaris = stepRounds(race, 0.7)[0];
    book.resetPortfolio(1000);
    const event = { ...roundDispatch(polaris, 200), _roundOffer: polaris, _offered: 200 };
    runInternals.applyPopupChoice(event, event.choices[0]);
    const cash = P.cash, S = race.safety.polaris;
    runInternals.applyPopupChoice(event, event.choices[0]);
    assert.ok(cash === 800 && P.cash === cash && race.safety.polaris === S && ledgerEntries('S').length === 1, 'the subscription funded twice');
    // Non-cash assets keep equity high while only 100 can be wired.
    book.resetPortfolio(); P.cash = 100;
    P.positions.push({ id: 991, type: 'bond', qty: 9, entryPrice: 100, expiryDay: 283 });
    resetImpactState();
    Object.assign(market, { S: 98, sigma: 0.2, v: 0.04, day: 283, r: 0.04, q: 0 });
    const eq = book.portfolioValue(98, 0.2, 0.04, 283, 0);
    const stock = book.allocatePrimaryStock(halcyonOfferPrice(98), 1000, 283);
    assert.ok(stock.allocated === 100 && P.cash === 0 && getStockImpact(0.2) === 0);
    initRounds(race); resetLedger();
    const primary = recordPrimaryAllocation('hcn_cashcap', race.day, stock.allocated, eq);
    assert.ok(near(primary.input, Math.min(1, 3 * 100 / eq)), 'the primary input read the request, not the allocation');
    run.race = null; setSink(null);
});
