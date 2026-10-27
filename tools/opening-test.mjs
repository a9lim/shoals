#!/usr/bin/env node
/* ===================================================
   tools/opening-test.mjs -- The opening hand and its
   obligations (02a "The evening").

   A. The takeover: equity exactly INITIAL_CAPITAL, margin
      headroom, no rogue or margin trip, not a trade; the
      draw is uniform and a seed deals the same hand
   B. The draw consumes no race stream
   C. No fixture's construction reads hidden state
   D. The market maker's hedge baseline
   E. The liability is netted out of every equity path
   F. Payment in cash
   G. The forced sale: pro rata, floors, bypasses, what it
      never touches, the zero quote, the margin remainder
   H. The terminal pays what is unpaid; Classic stays cash
   I. main.js: notice, pause, payment and the forced
      sale's cost at the close
   J. The flatten's reduce-only legs: the cap by id, the
      reversal skip, partial shorts, the estimate's
      non-mutation and its agreement with execution
   K. The skip's stop classifier on synthetic closes
   L. The ticket's flatten: size one, bound legs, an edit
      unbinds them, the readout and the names left off
   M. main.js: the skip's latch, its stop and its pause

   Usage: node tools/opening-test.mjs [N] [--seed S]
          N worlds, default 400; base seed defaults to 1.
   =================================================== */

import { Simulation } from '../src/simulation.js';
import { ExpiryManager } from '../src/chain.js';
import { market, syncMarket } from '../src/market.js';
import { computeVXHCNSpot } from '../src/pricing.js';
import * as book from '../src/portfolio.js';
import { unitPrice } from '../src/position-value.js';
import { resetImpactState, rehedgeMM, baselineMMHedge, getStockImpact, getBondImpact, getVxhcnImpact, getOptionImpact } from '../src/price-impact.js';
import { createRaceState, advanceRace } from '../src/race/race-state.js';
import { consensus, initConsensus, setBinaryQuoteSource, refreshBinaryQuotes, getBinaryQuote, BINARY_NOTIONAL } from '../src/race/consensus.js';
import { initComputeMarket, setComputePriceSource, refreshComputeQuotes } from '../src/race/compute-market.js';
import { initBelief, binaryQuoteFromBelief, computeCurveFromBelief } from '../src/race/belief.js';
import { initValuation } from '../src/race/valuation.js';
import { initRounds } from '../src/race/rounds.js';
import { resetLedger, ledgerEntries } from '../src/race/ledger.js';
import { resetCoupling } from '../src/race/coupling.js';
import { EventEngine } from '../src/events.js';
import { checkEndings } from '../src/endings.js';
import { resetRegulations, activateRegulation } from '../src/regulations.js';
import { resetFactions, getFaction, shiftFaction, capitalMultiplier } from '../src/faction-standing.js';
import { FIXTURES, drawFixture, takeover, dealOpeningHand, dealtFixture, resetOpening } from '../src/opening.js';
import { INITIAL_CAPITAL as E0, INITIAL_PRICE, ROGUE_TRADING_THRESHOLD, REG_T_MARGIN, STRIKE_INTERVAL, FORCED_SALE_SPREAD_MULT, BOOK_MOVE_STOP, SKIP_DAYS_PER_SEC } from '../src/config.js';
import { closeStop, majorSince, SKIP_CAUSES } from '../src/pacing.js';
import * as ticket from '../src/ticket.js';
import { fmtBook } from '../src/format-helpers.js';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const argv = process.argv.slice(2);
let N = 400, BASE_SEED = 1;
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') BASE_SEED = parseInt(argv[++i], 10) >>> 0;
    else if (/^\d+$/.test(a)) N = parseInt(a, 10);
}
if (!Number.isInteger(N) || N < 1) throw new Error('N must be positive');
let failures = 0;
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok, detail }); if (!ok) failures++; }
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const P = book.portfolio;

// ---- Boot ------------------------------------------------------------------
// The chassis at boot: the backfill leaves S = 100, v = theta, r = b, day 252.
const sim = new Simulation();
sim.reset(5);
sim.prepopulate();
const BOOT_DAY = sim.day;
const em = new ExpiryManager();
em.init(sim.day);
const EXPIRIES = em.update(sim.day).map(e => e.day);
const WORLD = new EventEngine().world;
const GEO = WORLD.geopolitical;

function openingMarks() {
    sim.S = INITIAL_PRICE; sim.v = sim.theta; sim.r = sim.b; sim.day = BOOT_DAY;
    syncMarket(sim);
    market.vxhcn = computeVXHCNSpot(sim.v, sim.kappa, sim.theta, sim.xi);
}
function freshBook() { book.resetPortfolio(); resetImpactState(); }
function corruptLatent(race) {
    for (const k of Object.keys(race.hidden)) race.hidden[k] = 0.999;
    race.evidenceLogOdds = 99;
    race.heat.transient = 0.99; race.heat.floor = 0.99;
    for (const id of ['halcyon', 'tianxia', 'polaris']) {
        const lab = race.capability.labs[id];
        lab.C_internal = 5.5; lab.C_released = 5.5;
        lab.compute0 = 99; lab.computeGrowth = 99; lab.talent = 99;
        for (const r of [1, 2, 3, 4, 5]) lab.rungInternal[r] = 0;
        race.safety[id] = 0.001;
    }
    race.capability.open.C = 5.5;
    race.capability.E = 0.999; race.capability.q = 99;
    race.capability.sharpness = 99; race.capability.velocity = 99;
    race.latentIncidents.push({ id: 'FAKE', severity: 4, occurDay: race.day });
    race.latentEvidence.push({ id: 'FAKE', logLR: 99, publicDay: Infinity });
}
/** A Dynamic boot up to the takeover: the race, belief, valuation, compute and
 *  Consensus initialized and quoting, the book empty. */
function boot(seed, corrupt = false) {
    openingMarks();
    freshBook();
    resetRegulations(); resetFactions(); resetOpening();
    const race = createRaceState(seed);
    if (corrupt) corruptLatent(race);
    resetCoupling(); resetLedger();
    initConsensus(race); initComputeMarket(race, GEO); initBelief(race); initValuation(race); initRounds(race);
    setBinaryQuoteSource(binaryQuoteFromBelief); setComputePriceSource(computeCurveFromBelief);
    refreshBinaryQuotes(race); refreshComputeQuotes(race, GEO);
    return race;
}
const bookSig = () => JSON.stringify({ cash: P.cash, positions: P.positions, orders: P.orders, obligations: P.obligations });
const equity = () => book.portfolioValue(sim.S, market.sigma, sim.r, sim.day, sim.q);
const margin = () => book.checkMargin(sim.S, market.sigma, sim.r, sim.day, sim.q);
const neutral = { straitTension: 0, playerCoupling: 0, exportControlStage: 0 };
function raceSig(race) {
    const { streams, ...rest } = race;
    return JSON.stringify(rest);
}

// ---- A. The takeover ---------------------------------------------------------
const t0 = Date.now();
const counts = Object.fromEntries(FIXTURES.map(f => [f.id, 0]));
const minHeadroom = Object.fromEntries(FIXTURES.map(f => [f.id, Infinity]));
const books = {}, distinct = Object.fromEntries(FIXTURES.map(f => [f.id, new Set()]));
let eqOK = true, eqWorst = 0, marginOK = true, rogueOK = true, endingsOK = true, notTradeOK = true;
let marksOK = true, gridOK = true, obligOK = true, sameHandOK = true;
for (let s = BASE_SEED; s < BASE_SEED + N; s++) {
    const fx = drawFixture(s);
    counts[fx.id]++;
    if (drawFixture(s) !== fx) sameHandOK = false;
    boot(s);
    for (const f of FIXTURES) {
        freshBook();
        takeover(f, EXPIRIES);
        const eq = equity();
        eqWorst = Math.max(eqWorst, Math.abs(eq - E0));
        if (!near(eq, E0)) eqOK = false;
        const m = margin();
        const headroom = (m.collateralEquity - m.required) / E0;
        minHeadroom[f.id] = Math.min(minHeadroom[f.id], headroom);
        if (m.triggered) marginOK = false;
        if (!(eq >= P.initialCapital * ROGUE_TRADING_THRESHOLD) || P.initialCapital !== E0 || P.peakValue !== E0) rogueOK = false;
        if (checkEndings(sim, P, WORLD, {}) !== null) endingsOK = false;
        if (P.totalTrades !== 0 || ledgerEntries().length !== 0 || getStockImpact(market.sigma) !== 0
            || getBondImpact(market.sigmaR) !== 0 || getVxhcnImpact(market.xi) !== 0) notTradeOK = false;
        for (const p of P.positions) {
            const mark = unitPrice(p.type, sim.S, market.sigma, sim.r, sim.day, p.strike, p.expiryDay, sim.q);
            if (p.entryPrice !== mark || p.entryDay !== BOOT_DAY || !Number.isInteger(p.qty)) marksOK = false;
            if ((p.type === 'call' || p.type === 'put') && (p.strike % STRIKE_INTERVAL !== 0 || !EXPIRIES.includes(p.expiryDay))) gridOK = false;
            if ((p.type === 'bond' || p.type === 'vxhcnfuture') && !EXPIRIES.includes(p.expiryDay)) gridOK = false;
        }
        const ob = P.obligations[0];
        if (P.obligations.length !== 1 || !near(ob.amount, f.obligation.amount * E0) || ob.dueDay !== f.obligation.dueDay) obligOK = false;
        distinct[f.id].add(bookSig());
        if (!books[f.id]) books[f.id] = { cash: P.cash, positions: P.positions.map(p => ({ ...p })), orders: P.orders.map(o => ({ ...o })), headroom };
    }
}
check(`A: takeover equity equals INITIAL_CAPITAL to 1e-9 for every fixture in ${N} worlds`, eqOK, `worst |equity - E0| ${eqWorst.toExponential(2)}`);
for (const f of FIXTURES) check(`A: ${f.id} passes the margin check at takeover with headroom >= 0.10 E0`, marginOK && minHeadroom[f.id] >= 0.10, `min headroom ${minHeadroom[f.id].toFixed(4)} E0`);
check('A: neither the rogue-trading threshold nor any player-terminal check fires at the takeover', rogueOK && endingsOK);
check('A: the takeover is not a trade (no trade count, ledger row or impact)', notTradeOK);
check('A: every position enters at its takeover mark on the takeover day, in whole units', marksOK);
check('A: options, bonds and VXHCN futures sit on listed strikes and expiries', gridOK);
check('A: the obligation is recorded at its fraction of E0 and its relative due day', obligOK);
check('A: a seed always deals the same hand', sameHandOK);
const band = 4 * Math.sqrt(0.25 * 0.75 / N);
check('A: the draw is uniform over the four fixtures', FIXTURES.every(f => Math.abs(counts[f.id] / N - 0.25) <= band),
    FIXTURES.map(f => `${f.id} ${counts[f.id]}`).join(', '));
const tA = Date.now() - t0;

// ---- B. The draw consumes no race stream --------------------------------------
{
    let identical = true;
    const K = Math.min(N, 40);
    for (let s = BASE_SEED; s < BASE_SEED + K; s++) {
        const a = boot(s);
        for (let d = 0; d < 300; d++) advanceRace(a, neutral);
        const b = boot(s);
        dealOpeningHand(b.seed, EXPIRIES);
        for (let d = 0; d < 300; d++) advanceRace(b, neutral);
        if (raceSig(a) !== raceSig(b)) { identical = false; break; }
    }
    check(`B: race trajectories are bit-identical with and without the deal (${K} seeds x 300 days, no player)`, identical);
}

// ---- C. No fixture's construction reads hidden state --------------------------
{
    let same = true;
    const K = Math.min(N, 40);
    for (let s = BASE_SEED; s < BASE_SEED + K && same; s++) {
        for (const f of FIXTURES) {
            boot(s); takeover(f, EXPIRIES);
            const clean = bookSig();
            boot(s, true); takeover(f, EXPIRIES);
            if (bookSig() !== clean) { same = false; break; }
        }
    }
    check('C: corrupting every hidden field leaves each fixture\'s book identical', same);
}

// ---- D. The market maker's hedge baseline -------------------------------------
{
    boot(BASE_SEED);
    let quiet = true, contrast = true, later = true;
    for (const id of ['catalyst', 'insurance']) {
        freshBook();
        takeover(FIXTURES.find(f => f.id === id), EXPIRIES);
        rehedgeMM(P.positions);   // the first substep's rehedge, at the takeover market
        if (getStockImpact(market.sigma) !== 0) quiet = false;
        resetImpactState();       // without the baseline the whole inherited hedge would be flow
        rehedgeMM(P.positions);
        const full = Math.abs(getStockImpact(market.sigma));
        if (!(full > 0)) contrast = false;
        resetImpactState();
        baselineMMHedge(P.positions);
        sim.S = 100.5; syncMarket(sim);   // a later move in delta does count
        rehedgeMM(P.positions);
        const moved = Math.abs(getStockImpact(market.sigma));
        if (!(moved > 0 && moved < full)) later = false;
        openingMarks();
    }
    check('D: the takeover records no stock impact on the first substep\'s rehedge', quiet);
    check('D: without the baseline the inherited hedge would have been recorded as flow', contrast);
    check('D: later changes in delta still count as flow, and only the change', later);
}

// ---- E. The liability is netted out of every equity path ------------------------
const OB = (amount, dueDay = 40, label = 'the test redemption') => ({ kind: 'redemption', label, amount, dueDay });
{
    boot(BASE_SEED);
    // Totals: NAV, collateral, the margin check's equity and collateral.
    freshBook();
    P.cash = 2000;
    book.seatPosition('stock', 50, 100, sim.day);
    book.seatPosition('stock', -10, 100, sim.day, undefined, undefined);
    const before = [equity(), book.collateralEquity(sim.S, market.sigma, sim.r, sim.day, sim.q), margin().equity, margin().collateralEquity];
    P.obligations = [OB(700)];
    const after = [equity(), book.collateralEquity(sim.S, market.sigma, sim.r, sim.day, sim.q), margin().equity, margin().collateralEquity];
    check('E: portfolioValue, collateralEquity and checkMargin all net the unpaid obligation',
        before.every((v, i) => near(v - after[i], 700)) && near(book.unpaidObligations(), 700));
    // NAV 6,500 against a 250 requirement: an obligation of 6,400 leaves 100.
    P.obligations = [];
    const clearBefore = !margin().triggered;
    P.obligations = [OB(6400)];
    check('E: the margin check trips on an obligation that leaves collateral under the requirement', clearBefore && margin().triggered);

    // Short-order admission: a short admitted without the obligation is refused with it.
    const shortTry = (ob) => {
        freshBook(); P.cash = 1000; if (ob) P.obligations = [OB(ob)];
        return book.executeMarketOrder(sim, 'stock', 'short', 10, sim.S, market.sigma, sim.r, sim.day, undefined, undefined, null, sim.q) != null;
    };
    check('E: short-order admission nets the obligation', shortTry(0) && !shortTry(500));

    // The initial-margin debit check: a margin buy admitted without it is refused with it.
    const ob = 500, C = 1000;
    const debit = (C - ob / 2) * capitalMultiplier() / REG_T_MARGIN;
    const qty = Math.round((C + debit) / 100);
    const longTry = (o) => {
        freshBook(); P.cash = C; if (o) P.obligations = [OB(o)];
        return book.executeMarketOrder(sim, 'stock', 'long', qty, sim.S, market.sigma, sim.r, sim.day, undefined, undefined, null, sim.q) != null;
    };
    check('E: the initial-margin debit check nets the obligation', longTry(0) && !longTry(ob), `qty ${qty}`);

    // The private-stake headroom.
    const stakeTry = (o) => {
        freshBook(); P.cash = 3000; book.seatPosition('stock', -10, 100, sim.day); if (o) P.obligations = [OB(o)];
        return book.allocatePrivateStake({ price: 10 }, 5000)?.allocated ?? 0;
    };
    const a0 = stakeTry(0), a1 = stakeTry(400);
    check('E: the private-stake headroom nets the obligation', a0 > 0 && near(a0 - a1, 400), `${a0.toFixed(2)} vs ${a1.toFixed(2)}`);

    // The endings' terminal check.
    freshBook(); P.cash = 100;
    const clear = checkEndings(sim, P, WORLD, {});
    P.obligations = [OB(200)];
    check('E: the endings\' equity check nets the obligation', clear === null && checkEndings(sim, P, WORLD, {}) === 'margin_call_liquidation');
}

// ---- F. Payment in cash ---------------------------------------------------------
{
    boot(BASE_SEED); freshBook();
    P.cash = 5000;
    book.seatPosition('stock', 20, 100, sim.day);
    const ob = OB(2500);
    P.obligations = [ob];
    const eq0 = equity(), pos0 = JSON.stringify(P.positions);
    const res = book.settleObligation(ob, sim, sim.S, market.sigma, sim.r, sim.day, sim.q);
    check('F: a covered obligation is paid from cash, with no forced sale',
        res && !res.forced && res.proceeds === 0 && res.remainder === 0 && near(P.cash, 2500) && P.obligations.length === 0
        && JSON.stringify(P.positions) === pos0);
    check('F: paying moves cash and the liability together, leaving equity unchanged', near(equity(), eq0));
    check('F: a settled obligation cannot be paid twice', book.settleObligation(ob, sim, sim.S, market.sigma, sim.r, sim.day, sim.q) === null);
}

// ---- G. The forced sale --------------------------------------------------------
const settle = (ob) => book.settleObligation(ob, sim, sim.S, market.sigma, sim.r, sim.day, sim.q);
const quote = (p) => book.forcedSaleQuote(p, sim.S, market.sigma, sim.r, sim.day, sim.q);
const seatAtMark = (type, qty, strike, expiryDay) =>
    book.seatPosition(type, qty, unitPrice(type, sim.S, market.sigma, sim.r, sim.day, strike, expiryDay, sim.q), sim.day, strike, expiryDay);
{
    // G1. One slice, pro rata within a unit, in the stable fill order.
    boot(BASE_SEED); freshBook();
    seatAtMark('call', 142, 115, EXPIRIES[1]);
    seatAtMark('vxhcnfuture', 45, undefined, EXPIRIES[0]);
    seatAtMark('stock', 110);
    seatAtMark('bond', 65, undefined, EXPIRIES[7]);
    P.cash = 500;
    const ob = OB(1000);
    P.obligations = [ob];
    const held = P.positions.map(p => ({ id: p.id, qty: p.qty, q: quote(p) }));
    const value = held.reduce((s, h) => s + h.q * h.qty, 0);
    const f = Math.min(1, 500 / value);
    const expect = Object.fromEntries(held.map(h => [h.id, Math.min(h.qty, Math.ceil(f * h.qty - 1e-9))]));
    const cash0 = P.cash;
    const res = settle(ob);
    const oneSlice = res.sold.every(r => r.qty === expect[r.id]) && res.sold.length === held.length;
    check('G: a slice sells the same fraction of every eligible long, rounded up to a unit', oneSlice
        && res.sold.every(r => r.qty - f * held.find(h => h.id === r.id).qty < 1), `f ${f.toFixed(4)}`);
    check('G: the slice fills bonds, HCN, VXHCN futures, then options', res.sold.map(r => r.type).join(',') === 'bond,stock,vxhcnfuture,call');
    check('G: the forced sale raises the shortfall and pays the obligation (cash conserves)',
        res.forced && near(res.shortfall, 500) && res.proceeds >= 500 && res.remainder === 0
        && near(P.cash, cash0 + res.proceeds - 1000) && P.obligations.length === 0);
    check('G: the sale pays the forced spread: proceeds sit under the ordinary bid', res.proceeds < res.sold.reduce((s, r) => s + r.qty * held.find(h => h.id === r.id).q, 0) + 1e-9);
}
{
    // G2. The executable quote's floors: $0.01 for chassis, 0 for Consensus.
    boot(BASE_SEED); freshBook();
    const cheap = seatAtMark('call', 10, 150, sim.day + 1);
    const key = consensus.contracts[0].key;
    const bin = book.seatPosition('binary', 10, 1, sim.day, key, consensus.contracts[0].deadline);
    consensus.quotes[key] = { bid: 0, ask: 0.02, mid: 0.01, settled: false, frozen: false };
    check('G: a chassis quote floors at $0.01 and a Consensus quote at 0', quote(cheap) === 0.01 && quote(bin) === 0);
    // The regulation multiplier widens every forced-sale quote, Consensus included.
    boot(BASE_SEED); freshBook();
    const st = seatAtMark('stock', 10);
    const b2 = book.seatPosition('binary', 10, 50, sim.day, key, consensus.contracts[0].deadline);
    const qs = quote(st), qb = quote(b2);
    activateRegulation('transaction_tax');
    const mid = unitPrice('stock', sim.S, market.sigma, sim.r, sim.day);
    const bq = getBinaryQuote(key), bmid = bq.mid * BINARY_NOTIONAL;
    check('G: the regulation multiplier widens every forced-sale quote, x3 on top of it',
        near(mid - quote(st), (mid - qs) * 1.5, 1e-9) && near(bmid - quote(b2), (bmid - qb) * 1.5, 1e-9)
        && near(mid - qs, mid * 0.001 * (1 + market.sigma) * FORCED_SALE_SPREAD_MULT, 1e-9));
    resetRegulations();
}
{
    // G3. Bypasses: the restriction, the short-sale ban and the binary cash rule.
    boot(BASE_SEED); freshBook();
    seatAtMark('stock', 20);
    const key = consensus.contracts[0].key;
    book.seatPosition('binary', 30, unitPrice('binary', 0, 0, 0, 0, key), sim.day, key, consensus.contracts[0].deadline);
    P.cash = -200; P.restricted = true;
    activateRegulation('short_sale_ban');
    const refused = book.executeMarketOrder(sim, 'stock', 'short', 1, sim.S, market.sigma, sim.r, sim.day, undefined, undefined, null, sim.q) == null
        && book.executeBinaryTrade(key, 'short', 1) == null;
    const ob = OB(500);
    P.obligations = [ob];
    const res = settle(ob);
    const types = new Set(res.sold.map(r => r.type));
    check('G: the forced sale bypasses the restriction, the short-sale ban and the binary cash rule',
        refused && types.has('stock') && types.has('binary') && near(res.shortfall, 700));
    resetRegulations(); P.restricted = false;
}
{
    // G4. Never a short, a private stake, or a frozen, pending, disputed or settled contract.
    boot(BASE_SEED); freshBook();
    const shortStock = seatAtMark('stock', -20);
    const stake = book.seatPosition('privatestake', 40, 10, sim.day);
    const k1 = consensus.contracts[1].key, k2 = consensus.contracts[2].key;
    const disputed = book.seatPosition('binary', 30, 50, sim.day, k1, consensus.contracts[1].deadline);
    const pending = book.seatPosition('binary', 30, 50, sim.day, k2, consensus.contracts[2].deadline);
    consensus.quotes[k1] = { ...consensus.quotes[k1], disputed: true };
    consensus.quotes[k2] = { ...consensus.quotes[k2], pending: true };
    const bond = seatAtMark('bond', 10, undefined, EXPIRIES[7]);
    P.cash = 0;
    const ob = OB(5000);
    P.obligations = [ob];
    const untouched = [shortStock, stake, disputed, pending].map(p => p.qty);
    const res = settle(ob);
    check('G: never sells a short, a private stake, or a disputed or pending contract',
        res.sold.length === 1 && res.sold[0].id === bond.id && !P.positions.includes(bond)
        && [shortStock, stake, disputed, pending].every((p, i) => P.positions.includes(p) && p.qty === untouched[i]));
    check('G: what the eligible longs cannot raise goes on the margin loan',
        near(res.remainder, 5000 - res.proceeds) && near(P.cash, -res.remainder) && P.obligations.length === 0);
    // A frozen book: Consensus frozen, nothing of it sells.
    boot(BASE_SEED); freshBook();
    const frozen = book.seatPosition('binary', 30, 50, sim.day, k1, consensus.contracts[1].deadline);
    consensus.frozen = true;
    P.cash = 0;
    const ob2 = OB(1000);
    P.obligations = [ob2];
    const r2 = settle(ob2);
    check('G: a frozen Consensus book sells nothing', r2.sold.length === 0 && frozen.qty === 30 && near(P.cash, -1000));
    consensus.frozen = false;
}
{
    // G5. The eligible longs quote zero: nothing is sold.
    boot(BASE_SEED); freshBook();
    const key = consensus.contracts[0].key;
    const bin = book.seatPosition('binary', 30, 1, sim.day, key, consensus.contracts[0].deadline);
    consensus.quotes[key] = { bid: 0, ask: 0, mid: 0, settled: false, frozen: false };
    P.cash = 100;
    const ob = OB(600);
    P.obligations = [ob];
    const res = settle(ob);
    check('G: if the eligible longs quote zero, nothing is sold', res.sold.length === 0 && res.proceeds === 0
        && bin.qty === 30 && near(res.remainder, 500) && near(P.cash, -500));
}
{
    // G6. Selling into its own impact: up to three slices, never past the holding.
    boot(BASE_SEED); freshBook();
    seatAtMark('vxhcnfuture', 364, undefined, EXPIRIES[7]);
    seatAtMark('stock', 30);
    P.cash = 0;
    const ob = OB(2000);
    P.obligations = [ob];
    const qty0 = Object.fromEntries(P.positions.map(p => [p.id, p.qty]));
    const res = settle(ob);
    const vx = res.sold.find(r => r.type === 'vxhcnfuture'), stk = res.sold.find(r => r.type === 'stock');
    check('G: a forced sale into its own impact raises the shortfall within three slices, longs only',
        res.proceeds >= 2000 - 1e-9 && res.remainder === 0 && P.positions.every(p => p.qty >= 0)
        && vx && stk && vx.qty <= qty0[vx.id] && stk.qty <= qty0[stk.id]
        && Math.abs(vx.qty / 364 - stk.qty / 30) < 3 / 30, `vx ${vx?.qty}/364, HCN ${stk?.qty}/30, proceeds ${res.proceeds.toFixed(1)}`);
}

// ---- H. The terminal; Classic ----------------------------------------------------
{
    boot(BASE_SEED); freshBook();
    P.cash = 3000;
    P.obligations = [OB(2500)];
    const paid = book.payObligationsAtCloseout();
    check('H: the closeout pays every unpaid obligation out of its cash', paid === 2500 && P.cash === 500
        && P.obligations.length === 0 && book.unpaidObligations() === 0);
    book.resetPortfolio();
    resetOpening();
    check('H: Classic starts on cash: no obligations, no dealt hand', P.cash === E0 && P.obligations.length === 0
        && P.positions.length === 0 && dealtFixture() === null);
    const race = boot(BASE_SEED + 7);
    const fx = dealOpeningHand(race.seed, EXPIRIES);
    check('H: the dealt hand is the seed\'s draw, readable by its getter', dealtFixture() === fx && fx === drawFixture(race.seed));
}

// ---- I. main.js at the close ----------------------------------------------------
{
    const source = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
    const main = source.replace(/^import[\s\S]*?from '[^']+';\n/gm, '')
        .replace(/^cacheDOMElements\(\$\);[\s\S]*?^init\(\);/m, '');
    const log = [];
    const context = createContext({
        Simulation: class { constructor() { Object.assign(this, { S: 100, v: 0.06, r: 0.04, day: BOOT_DAY, q: 0 }); } },
        ExpiryManager: class {},
        portfolio: P, market, settleObligation: book.settleObligation, shiftFaction, fmtBook,
        currentPage: () => 'front', updatePlayBtn: () => {}, showToast: () => {},
        countDevelopment: () => {}, countPause: () => {},
    });
    runInContext(main + `
        chart = { dayOrigin: ${BOOT_DAY} };
        eventEngine = { _logEvent(day, ev, p, magnitude) { const e = { day, headline: ev.headline, category: ev.category, magnitude }; globalThis.__log.push(e); return e; } };
        _updateWire = () => {};
        globalThis.mainTest = {
            sim, close: _settleObligations,
            set(p, r) { playing = p; _resumeAfterDispatch = r; },
            state() { return { playing, resume: _resumeAfterDispatch }; },
        };
    `, Object.assign(context, { __log: log }), { filename: 'main.js (headless helpers)' });
    const api = context.mainTest;
    const run = (rel, cash, amount = 2500) => {
        freshBook(); resetFactions();
        P.cash = cash;
        P.obligations = [OB(amount, 40, 'the Ostrander redemption')];
        api.sim.day = BOOT_DAY + rel;
        api.set(true, true);
        log.length = 0;
        const fs0 = getFaction('firmStanding');
        api.close();
        return { items: log.map(e => e.headline), state: api.state(), dFirm: getFaction('firmStanding') - fs0, cats: log.map(e => `${e.category}/${e.magnitude}`) };
    };
    const n = run(35, 1000);
    check('I: five sessions out, a short desk gets the notice, and the desk pauses with no automatic resume',
        n.items[0] === 'The Ostrander redemption, $2,500k, is due in five sessions; the desk holds $1,000k in cash.'
        && n.cats[0] === 'desk/minor' && !n.state.playing && !n.state.resume && P.obligations.length === 1, n.items[0]);
    const c = run(35, 3000);
    check('I: a covered obligation gives no notice', c.items.length === 0 && c.state.playing);
    const other = run(34, 1000);
    check('I: the notice is checked only at the close due on dueDay - 5', other.items.length === 0);
    const paid = run(40, 3000);
    check('I: due today, a covered obligation is paid with its wire item',
        paid.items[0] === 'The Ostrander redemption is paid in full; $2,500k leaves the desk in cash.'
        && P.obligations.length === 0 && near(P.cash, 500) && paid.dFirm === 0, paid.items[0]);
    freshBook();
    const forced = (() => {
        resetFactions(); P.cash = 100;
        seatAtMark('stock', 40);
        P.obligations = [OB(2500, 40, 'the Ostrander redemption')];
        api.sim.day = BOOT_DAY + 40; api.set(true, true); log.length = 0;
        const fs0 = getFaction('firmStanding');
        api.close();
        return { items: log.map(e => e.headline), dFirm: getFaction('firmStanding') - fs0, state: api.state() };
    })();
    check('I: a short desk is force-sold with its wire item and costs firmStanding 8, without pausing',
        forced.items[0] === 'Operations sells a slice of the book to meet the Ostrander redemption; the desk was $2,400k short on the day, and the risk committee has noted it.'
        && forced.dFirm === -8 && forced.state.playing && P.obligations.length === 0, forced.items[0]);
}

// ---- J. The flatten's reduce-only legs ---------------------------------------------
const reduce = (posId, side, qty, mult) => book.reduceOnlyClose(sim, posId, side, qty, sim.S, market.sigma, sim.r, sim.day, sim.q, mult);
const estimate = (legs, mult) => book.estimateReduceOnly(legs, sim.S, market.sigma, sim.r, sim.day, sim.q, mult);
const buy = (type, side, qty, strike, expiryDay, name) =>
    book.executeMarketOrder(sim, type, side, qty, sim.S, market.sigma, sim.r, sim.day, strike, expiryDay, name, sim.q);
const closeLeg = (p) => ({ posId: p.id, side: p.qty > 0 ? 'short' : 'long', qty: Math.abs(p.qty) });
{
    // J1. The cap: a position traded down while the leg waited closes what remains.
    boot(BASE_SEED); freshBook();
    const stock = seatAtMark('stock', 100);
    const leg = closeLeg(stock);
    buy('stock', 'short', 60);
    const cash0 = P.cash;
    const r = reduce(leg.posId, leg.side, leg.qty);
    check('J: a leg is capped at what its position still holds, by id',
        r.status === 'filled' && r.qty === 40 && !P.positions.some(p => p.id === stock.id) && P.cash > cash0
        && !P.positions.some(p => p.type === 'stock'), `${r.status} ${r.qty}`);
    // J2. Gone: nothing left closes nothing.
    const sig = bookSig();
    const g = reduce(leg.posId, leg.side, leg.qty);
    check('J: a leg whose position is gone closes nothing', g.status === 'gone' && g.qty === 0 && bookSig() === sig);
    // J3. Reversed: the position flipped sign under the same id; the stale side is never traded.
    freshBook();
    const flip = seatAtMark('stock', 50);
    const fleg = closeLeg(flip);
    buy('stock', 'short', 80);
    const after = P.positions.find(p => p.id === flip.id);
    const sig2 = bookSig();
    const rv = reduce(fleg.posId, fleg.side, fleg.qty);
    check('J: a leg whose position reversed sign is skipped, never traded on its stale side',
        after && after.qty === -30 && rv.status === 'reversed' && bookSig() === sig2, `qty ${after && after.qty}`);
    // J4. A partial chassis short returns the same fraction of its collateral.
    freshBook();
    const short = buy('stock', 'short', 50);
    const res0 = short._reservedMargin, cashS = P.cash;
    const mid = unitPrice('stock', sim.S, market.sigma, sim.r, sim.day, undefined, undefined, sim.q);
    const ps = reduce(short.id, 'long', 20);
    check('J: a partial close of a short keeps its side and returns its share of the collateral',
        ps.status === 'filled' && short.qty === -30 && near(short._reservedMargin, res0 * 0.6, 1e-9)
        && P.cash - cashS < res0 * 0.4 && P.cash - cashS > res0 * 0.4 - 20 * mid * 1.05, `${short.qty}`);
    // J5. A partial Consensus short, through the binary chokepoint.
    freshBook();
    const key = consensus.contracts.find(c => !consensus.quotes[c.key]?.settled).key;
    const bin = book.seatPosition('binary', -42, unitPrice('binary', sim.S, market.sigma, sim.r, sim.day, key, undefined, sim.q), sim.day, key, consensus.contracts.find(c => c.key === key).deadline);
    const pb = reduce(bin.id, 'long', 20);
    check('J: a partial Consensus close nets through the binary chokepoint',
        pb.status === 'filled' && bin.qty === -22 && near(bin._reservedMargin, 22 * BINARY_NOTIONAL), `${bin.qty}`);
    // J6. A restricted account trades nothing.
    P.restricted = true;
    const rr = reduce(bin.id, 'long', 5);
    check('J: a restricted account closes nothing', rr.status === 'rejected' && bin.qty === -22);
    P.restricted = false;
}
{
    // J7. The estimate: non-mutating, and exactly what immediate execution does
    //     (distinct pools, at a widened ladder multiple, a regulation spread on).
    boot(BASE_SEED); freshBook();
    activateRegulation('transaction_tax');
    buy('stock', 'long', 90); buy('bond', 'long', 30, undefined, EXPIRIES[3]);
    buy('vxhcnfuture', 'long', 40, undefined, EXPIRIES[0]);
    buy('call', 'long', 25, 105, EXPIRIES[1]); buy('put', 'short', 15, 95, EXPIRIES[2], 'Strangle');
    const key = consensus.contracts.find(c => !consensus.quotes[c.key]?.settled).key;
    book.executeBinaryTrade(key, 'short', 12);
    const legs = P.positions.map(closeLeg);
    legs[0].qty += 7;   // a leg larger than its holding is capped
    const pools = () => JSON.stringify([getStockImpact(market.sigma), getBondImpact(market.sigmaR), getVxhcnImpact(market.xi),
        getOptionImpact('call', 105, EXPIRIES[1], market.sigma, 0.1, 30), getOptionImpact('put', 95, EXPIRIES[2], market.sigma, 0.1, 30)]);
    const sig = bookSig(), pool0 = pools();
    const est = estimate(legs, 2.5);
    check('J: the estimate mutates neither the book nor the impact pools', bookSig() === sig && pools() === pool0);
    const est1 = estimate(legs, 1);
    const gross = P.positions.reduce((s, p) => s + Math.abs(p.qty * unitPrice(p.type, sim.S, market.sigma, sim.r, sim.day, p.strike, p.expiryDay, sim.q)), 0);
    const cash0 = P.cash;
    let ok = true;
    for (const L of legs) ok = reduce(L.posId, L.side, L.qty, 2.5).status === 'filled' && ok;
    const released = P.cash - cash0;
    check('J: the estimate\'s released cash is what execution releases, short collateral included',
        ok && P.positions.length === 0 && near(est.released, released, 1e-6), `${est.released.toFixed(6)} vs ${released.toFixed(6)}`);
    check('J: the cost is the spread at the ladder multiple plus impact, apart from the cash released',
        est.cost > 0 && est.cost < gross * 0.2 && est.cost > est1.cost, `cost ${est.cost.toFixed(3)} at x2.5, ${est1.cost.toFixed(3)} at x1`);
    resetRegulations();
}
{
    // J8. A leg that cannot trade now adds nothing to the estimate and is named,
    //     as execution rejects it: a frozen Consensus contract, a restricted account.
    boot(BASE_SEED); freshBook();
    buy('stock', 'long', 20);
    const key = consensus.contracts.find(c => !consensus.quotes[c.key]?.settled).key;
    book.executeBinaryTrade(key, 'long', 10);
    const legs = P.positions.map(closeLeg);
    const bin = P.positions.find(p => p.type === 'binary');
    const live = estimate(legs, 1);
    consensus.quotes[key] = { ...consensus.quotes[key], frozen: true };
    const frozen = estimate(legs, 1);
    const rej = reduce(bin.id, 'short', bin.qty, 1).status;
    P.restricted = true;
    const restricted = estimate(legs, 1);
    P.restricted = false;
    check('J: a frozen or restricted leg adds nothing to the estimate and is named, as execution rejects it',
        live.blocked.length === 0 && frozen.blocked.length === 1 && frozen.blocked[0] === bin.id
        && frozen.released < live.released && rej === 'rejected'
        && restricted.blocked.length === 2 && restricted.released === 0,
        `live ${live.released.toFixed(2)}, frozen ${frozen.released.toFixed(2)} [${frozen.blocked}], restricted [${restricted.blocked}]`);
}

// ---- K. The skip's stop classifier ---------------------------------------------------
{
    const base = { extra: false, majorWire: false, development: false, notice: false, quarterLine: false,
        equityPrev: 10000, equity: 10000, day: 300, optionExpiries: [] };
    const at = (o) => closeStop({ ...base, ...o });
    check('K: a quiet close does not stop', at({}) === null);
    check('K: each close stop is taken, in 02a\'s order',
        at({ extra: true }) === 'extra' && at({ majorWire: true }) === 'wire' && at({ development: true }) === 'development'
        && at({ notice: true }) === 'notice' && at({ quarterLine: true }) === 'quarter'
        && at({ equity: 10300 }) === 'book' && at({ optionExpiries: [301] }) === 'expiry'
        && at({ extra: true, development: true, equity: 9000 }) === 'extra' && at({ notice: true, equity: 9000 }) === 'notice');
    check('K: the book move is 3% of the previous close\'s equity, either way, net of obligations',
        BOOK_MOVE_STOP === 0.03 && at({ equity: 10299.99 }) === null && at({ equity: 9700 }) === 'book'
        && at({ equityPrev: 5000, equity: 5149 }) === null && at({ equityPrev: 5000, equity: 5150 }) === 'book'
        && at({ equityPrev: null, equity: 0 }) === null);
    check('K: a held option stops the close that opens its last trading day, and only that one',
        at({ optionExpiries: [302, 301] }) === 'expiry' && at({ optionExpiries: [300] }) === null && at({ optionExpiries: [302] }) === null);
    const a = { day: 3, magnitude: 'major', archive: true }, b = { day: 4, magnitude: 'minor' }, c = { day: 5, magnitude: 'major' }, d = { day: 6, magnitude: 'moderate' };
    check('K: a major wire item counts only after the mark, and an archived report never',
        majorSince([a, b], null) === false && majorSince([a, b, c, d], b) === true && majorSince([a, b, c, d], c) === false
        && majorSince([c, d], null) === true);
    check('K: every cause is named, the dispatch first', SKIP_CAUSES[0] === 'dispatch' && SKIP_CAUSES.length === 8 && SKIP_DAYS_PER_SEC === 8);
}

// ---- L. The ticket's flatten ---------------------------------------------------------
{
    // ticket.js reaches the DOM only through its init and render; a stand-in DOM is enough.
    const els = new Map();
    const fakeEl = (id) => ({ id, value: id === 'tk-size' ? '7' : id === 'tk-horizon' ? '63' : '', textContent: '', innerHTML: '',
        hidden: false, disabled: false, checked: false, placeholder: '', dataset: {}, rows: [], style: {},
        classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
        addEventListener() {}, setAttribute() {}, querySelectorAll: () => [],
        getContext: () => new Proxy({}, { get: () => () => {} }),
        getBoundingClientRect: () => ({ width: 0, height: 0, left: 0 }), parentElement: {} });
    const el = (id) => { if (!els.has(id)) els.set(id, fakeEl(id)); return els.get(id); };
    Object.assign(globalThis, {
        document: { getElementById: el, activeElement: null }, window: { devicePixelRatio: 1 },
        ResizeObserver: class { observe() {} },
        _forms: { bindSlider() {}, updateSliderFill() {} },
        _themePalette: () => ({ canvas: '#FCFCFB', accent: '#983432', text: '#161514', textMuted: '#666463', inks: { viridian: '#317B55' } }),
        _parseHex: (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255),
    });
    const trades = [];
    const race = boot(BASE_SEED); freshBook();
    ticket.initTicket({
        sim, race: () => race, geo: () => GEO, positions: () => P.positions, expiries: () => [],
        expiryDay: () => EXPIRIES[1], vxVariance: () => market.v, spreadMult: () => 1,
    }, { onChange() {}, onTrade: (o) => trades.push(o), toast() {} });
    const stock = seatAtMark('stock', 110);
    const call = buy('call', 'long', 14, 115, EXPIRIES[1], 'Bull');
    const key = consensus.contracts.find(c => !consensus.quotes[c.key]?.settled).key;
    const bin = book.seatPosition('binary', -42, unitPrice('binary', sim.S, market.sigma, sim.r, sim.day, key, undefined, sim.q), sim.day, key, consensus.contracts.find(c => c.key === key).deadline);
    // main.js _loadFlatten's shape: the closing quantity, the id and the strategy name.
    const legsOf = (ps) => ps.map(p => {
        const keyed = p.type === 'binary' || p.type === 'computefuture';
        return { posId: p.id, strategyName: p.strategyName || null, type: p.type, qty: -p.qty,
            strike: keyed ? undefined : p.strike, key: keyed ? p.strike : undefined, expiryDay: p.expiryDay };
    });
    check('L: the ticket starts at a size other than one (the reset is observable)', el('tk-size').value === '7');
    ticket.loadFlatten(legsOf([stock, call, bin]), ['Polaris, private']);
    check('L: loading the flatten resets the size to one', el('tk-size').value === 1 && el('tk-size-val').textContent === '1k' && ticket.ticketIsFlatten());
    ticket.tradeTicket();
    const f = trades.at(-1);
    check('L: the flatten sends reduce-only legs bound to their positions, closing each whole holding',
        f && f.kind === 'flatten' && f.legs.length === 3
        && f.legs.every((l, i) => l.posId === [stock, call, bin][i].id && l.qty === Math.abs([stock, call, bin][i].qty))
        && f.legs[0].side === 'short' && f.legs[2].side === 'long' && f.legs[1].strategyName === 'Bull' && f.legs[0].strategyName === null,
        f ? f.legs.map(l => `${l.side} ${l.qty} #${l.posId} ${l.strategyName}`).join('; ') : 'nothing sent');
    const cost = el('tk-cost').innerHTML;
    check('L: the readout shows the cost apart from the cash released, and names what is left off',
        /^Cost <b>\$[\d,.]+k<\/b> · releases <b>−?\$[\d,.]+k<\/b><br><span class="tk-off">Not on the ticket: Polaris, private\.<\/span>$/.test(cost), cost);
    ticket.pickPoint({ id: 'stock', type: 'stock', desc: 'HCN shares' });   // a click removes the short stock leg
    ticket.tradeTicket();
    const o = trades.at(-1);
    check('L: an edit to its legs makes the flatten an ordinary ticket, unbound',
        !ticket.ticketIsFlatten() && o.kind === 'legs' && o.legs.length === 2 && o.legs.every(l => l.posId === undefined)
        && !el('tk-cost').innerHTML.includes('Not on the ticket'));
    ticket.loadFlatten([{ posId: 99, strategyName: null, type: 'stock', qty: -27.43 }], []);
    ticket.tradeTicket();
    check('L: a fractional holding loads rounded up to a whole unit (execution caps it)', trades.at(-1).legs[0].qty === 28);
    ticket.loadFlatten([], ['Polaris, private']);
    check('L: a book with nothing tradeable still names what is left off', el('tk-cost').innerHTML === '<span class="tk-off">Not on the ticket: Polaris, private.</span>');
    ticket.resetTicket();
    for (const k of ['document', 'window', 'ResizeObserver', '_forms', '_themePalette', '_parseHex']) delete globalThis[k];
}

// ---- M. main.js: the skip's latch, stop and pause ------------------------------------
{
    const source = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
    const main = source.replace(/^import[\s\S]*?from '[^']+';\n/gm, '')
        .replace(/^cacheDOMElements\(\$\);[\s\S]*?^init\(\);/m, '');
    const pauses = [], developments = [], lerp = [];
    const context = createContext({
        Simulation: class { constructor() { Object.assign(this, { S: 100, v: 0.06, r: 0.04, day: BOOT_DAY + 10, q: 0 }); } },
        ExpiryManager: class {},
        portfolio: P, market, portfolioValue: book.portfolioValue, settleObligation: book.settleObligation, shiftFaction, fmtBook,
        closeStop, majorSince, SPEED_OPTIONS: [0.125, 0.25, 0.5, 1, 2], SKIP_DAYS_PER_SEC, INTRADAY_STEPS: 16,
        performance: { now: () => 5000 },
        currentPage: () => 'front', updatePlayBtn: () => {}, showToast: () => {},
        countDevelopment: (k) => developments.push(k), countPause: (c) => pauses.push(c),
    });
    runInContext(main + `
        chart = { dayOrigin: ${BOOT_DAY}, setSubstepInterval(v) { globalThis.__lerp.push(v); } };
        eventEngine = { eventLog: [], _logEvent(day, ev, p, magnitude) { const e = { day, headline: ev.headline, category: ev.category, magnitude }; this.eventLog.push(e); return e; } };
        _updateWire = () => {};
        globalThis.mainTest = {
            sim, skip: skipToNextEdition, develop: _develop, close: _skipClose, settle: _settleObligations,
            toggle: togglePlay, step, worth: _worthReading,
            over(v) { _gameOver = v; },
            state() { return { playing, skipping: _skipping, resume: _resumeAfterDispatch, rate: _daysPerSec() }; },
        };
    `, Object.assign(context, { __lerp: lerp }), { filename: 'main.js (headless skip)' });
    const api = context.mainTest;
    freshBook(); resetFactions();
    api.close();                                        // a close before the skip: the baseline
    api.develop('fill');                                // seen before the skip: never stops it
    api.skip();
    let st = api.state();
    check('M: a skip plays at SKIP_DAYS_PER_SEC, the lerp with it, and the speed setting is untouched',
        st.playing && st.skipping && st.rate === SKIP_DAYS_PER_SEC && lerp.at(-1) === 1000 / (SKIP_DAYS_PER_SEC * 16));
    api.close();
    st = api.state();
    check('M: a quiet close does not stop the skip, and a development before it began is not latched', st.playing && st.skipping && pauses.length === 0);
    api.develop('fill');
    check('M: a development is counted and latched, not taken until the close', developments.at(-1) === 'fill' && api.state().skipping);
    api.close();
    st = api.state();
    check('M: the close stops on it, paused, records skip:development, and play resumes at the speed setting',
        !st.playing && !st.skipping && !st.resume && pauses.at(-1) === 'skip:development' && st.rate === 0.5 && lerp.at(-1) === 1000 / (0.5 * 16));
    api.skip(); P.cash *= 1.031; api.close();
    check('M: equity net of obligations moving 3% of the previous close\'s equity stops the skip', pauses.at(-1) === 'skip:book' && !api.state().playing);
    api.skip(); api.worth('extra'); api.develop('settlement'); api.close();
    check('M: of two stops at one close, the first in 02a\'s order names it', pauses.at(-1) === 'skip:extra' && pauses.length === 3);
    // The notice: one pause, counted as the skip's stop.
    api.skip();
    P.cash = 1000; P.obligations = [OB(2500, 15, 'the Ostrander redemption')];
    api.sim.day = BOOT_DAY + 10; api.settle(); api.close();
    check('M: an obligation\'s notice during a skip is its stop, one pause counted once',
        pauses.at(-1) === 'skip:notice' && !pauses.includes('notice') && !api.state().playing && P.obligations.length === 1);
    P.obligations = [];
    api.skip(); api.toggle();
    st = api.state();
    check('M: play ends a skip in progress, paused and uncounted', !st.playing && !st.skipping && pauses.length === 4);
    api.skip(); api.step();
    check('M: step ends a skip in progress the same way', !api.state().skipping && !api.state().playing && pauses.length === 4);
    api.over(true); api.skip();
    check('M: the skip does nothing in a finished run', !api.state().skipping && !api.state().playing);
    api.over(false);
    const queue = source.slice(source.indexOf('function _processPopupQueue()'), source.indexOf('function _resumeAfterDispatches()'));
    check('M: a shown dispatch stops a skip at once and never arms the resume',
        /if \(_skipping\) _endSkip\('dispatch'\);\s*else if \(playing\) _resumeAfterDispatch = true;/.test(queue));
}

// ---- The built books -------------------------------------------------------------
const fmtPos = (p) => {
    const where = p.type === 'binary' ? `R${consensus.contracts.find(c => c.key === p.strike)?.predicate.rung} by ${p.expiryDay}`
        : [p.strike != null ? `K ${p.strike}` : '', p.expiryDay != null ? `day ${p.expiryDay - BOOT_DAY}` : ''].filter(Boolean).join(', ');
    const value = p.qty * p.entryPrice + (p._reservedMargin || 0);
    return `${p.type} ${p.qty > 0 ? '+' : ''}${p.qty}${where ? ' (' + where + ')' : ''} at ${p.entryPrice.toFixed(2)}`
        + ` = ${(value / E0).toFixed(3)} E0${p._reservedMargin ? ` (reserves ${(p._reservedMargin / E0).toFixed(3)} E0)` : ''}`;
};
console.log('\nThe built books (takeover marks; E0 = ' + E0 + ')');
for (const f of FIXTURES) {
    const b = books[f.id];
    console.log(`  ${f.id}: cash ${(b.cash / E0).toFixed(4)} E0; obligation ${f.obligation.amount} E0 due day ${f.obligation.dueDay}; headroom ${b.headroom.toFixed(3)} E0; distinct books across worlds ${distinct[f.id].size}`);
    for (const p of b.positions) console.log('    ' + fmtPos(p));
    for (const o of b.orders) console.log(`    order: ${o.orderType} ${o.side === 'short' ? 'sell' : 'buy'} ${o.qty} ${o.type} at ${o.triggerPrice}`);
}

console.log('\n' + '='.repeat(72));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
console.log(`\n(A: ${N} worlds x ${FIXTURES.length} fixtures in ${(tA / 1000).toFixed(1)} s)`);
if (failures) {
    console.log(`\nFAIL: ${failures} opening check(s) failed`);
    process.exit(1);
}
console.log('\nPASS: all opening checks');
