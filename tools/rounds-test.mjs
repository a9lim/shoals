#!/usr/bin/env node
/* ===================================================
   tools/rounds-test.mjs -- Primary-market regression gate
   (02a "Private rounds and primary offerings").

   A. Founding/series schedule and public-only pricing
   B. No-participation race and RNG substream isolation
   C. Allocation caps, dilution, discount and deployment window
   D. Polaris S effect, ledger attribution and terminal gate
   E. Cell-10 multiples and private-stake conservation
   F. Cash-funded entries, illiquidity and margin collateral
   G. Classic/reset inertia
   H. Actual main-thread gaps, subscription and restriction chokepoints

   Usage: node tools/rounds-test.mjs [N] [--seed S]
          N defaults to 300; base seed defaults to 1.
   =================================================== */

import { createRaceState, advanceRace, stepControlRegime, freshTransitions } from '../src/race/race-state.js';
import { stepTreaty } from '../src/race/treaty-track.js';
import { checkResolution, HORIZON } from '../src/race/resolution.js';
import { buildPublicView, initConsensus } from '../src/race/consensus.js';
import { belief, initBelief, stepBelief } from '../src/race/belief.js';
import { r5ProbabilityFromBelief, initValuation, stepValuation, lastValuation, resetValuation, computeValuation } from '../src/race/valuation.js';
import { resetLedger, deactivateLedger, freezeLedger, ledgerEntries, applyRaceEffects, raceChannelsLive } from '../src/race/ledger.js';
import { resetCoupling, stepCoupling, couplingAttribution, COUPLING_TUNING } from '../src/race/coupling.js';
import {
    ROUNDS_TUNING, initRounds, resetRounds, stepRounds, lastPolarisRound,
    roundPriceRatio, roundAllocation, halcyonOfferPrice,
    recordPrimaryAllocation, primaryInputs, privateTerminalMultiple,
} from '../src/race/rounds.js';
import { closeoutBook, closeoutUnitValue } from '../src/race/closeout.js';
import { unitPrice } from '../src/position-value.js';
import * as book from '../src/portfolio.js';
import { market, syncMarket } from '../src/market.js';
import { resetImpactState, getStockImpact } from '../src/price-impact.js';
import { EventEngine } from '../src/events.js';
import { runRaceBridge, resetRaceBridge } from '../src/events/race-bridge.js';
import { PRESETS } from '../src/config.js';
import { computeVXHCNSpot } from '../src/pricing.js';
import { roundDispatch } from '../src/events/rounds.js';
import { fmtDollar } from '../src/format-helpers.js';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const argv = process.argv.slice(2);
let N = 300, BASE_SEED = 1;
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') BASE_SEED = parseInt(argv[++i], 10) >>> 0;
    else if (a === '--n' || a === '-n') N = parseInt(argv[++i], 10);
    else if (/^\d+$/.test(a)) N = parseInt(a, 10);
}
if (!Number.isInteger(N) || N < 1) throw new Error('N must be positive');
let failures = 0;
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok, detail }); if (!ok) failures++; }
const near = (a, b) => Math.abs(a - b) < 1e-9;
const T = ROUNDS_TUNING;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const pi = () => r5ProbabilityFromBelief(belief.rungs[5], belief.day);

function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)]));
    return value;
}
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
    race.capability.polarisSpawnDay = -999;
    race.latentIncidents.push({ id: 'FAKE', severity: 4, occurDay: race.day });
    race.latentEvidence.push({ id: 'FAKE', logLR: 99, publicDay: Infinity });
}
function fixture(seed = BASE_SEED, spawnDay = 10) {
    const race = createRaceState(seed);
    race.day = spawnDay;
    race.lastTransitions = freshTransitions();
    race.lastTransitions.spawned = ['polaris'];
    race.capability.labs.polaris.active = true;
    race.capability.labs.polaris.rungReleased = { 1: spawnDay };
    race.safety.polaris = 0.70;
    return race;
}

// ---- A/B. Full no-participation ensemble ---------------------------------
const t0 = Date.now();
let identityOK = true, scheduleOK = true, formulaOK = true, roundsSeen = 0, foundings = 0;
let stoppedOK = true, lastMarkOK = true;
for (let i = 0; i < N; i++) {
    const a = createRaceState((BASE_SEED + i) >>> 0), b = createRaceState((BASE_SEED + i) >>> 0);
    initConsensus(a); initBelief(a); resetLedger(); initRounds(a);
    let spawn = null, previous = null, previousPi = null;
    for (let d = 0; d < HORIZON && !a.resolution; d++) {
        advanceRace(a, { straitTension: 0 }); stepControlRegime(a); stepTreaty(a, {});
        advanceRace(b, { straitTension: 0 }); stepControlRegime(b); stepTreaty(b, {});
        stepBelief(a);
        if (a.lastTransitions.spawned.includes('polaris')) spawn = a.day;
        checkResolution(a, null); checkResolution(b, null);
        for (const round of stepRounds(a, pi())) {
            roundsSeen++;
            if (round.founding) {
                foundings++;
                scheduleOK &&= round.day === spawn + T.foundingDelay && round.letter === null;
                formulaOK &&= round.price === T.foundingPrice && round.ratio === 1;
            } else {
                scheduleOK &&= !!previous && round.day - previous.day >= T.spacing - T.spacingJitter
                    && round.day - previous.day <= T.spacing + T.spacingJitter;
                const gain = buildPublicView(a).claimedRung.polaris - previous.claimedRung;
                const expected = clamp(Math.exp(T.rungWeight * gain + T.piWeight * (pi() - previousPi) - T.carry), T.ratioMin, T.ratioMax);
                formulaOK &&= round.ratio === expected && round.price === previous.price * expected
                    && round.ratio >= T.ratioMin && round.ratio <= T.ratioMax;
            }
            previous = round; previousPi = pi();
            lastMarkOK &&= lastPolarisRound() === round;
        }
        // Full race state and every daily transition must match, not just final family.
        identityOK &&= JSON.stringify(a) === JSON.stringify(b);
    }
    stoppedOK &&= stepRounds(a, pi()).length === 0;
    for (const name of Object.keys(a.streams)) identityOK &&= a.streams[name].next() === b.streams[name].next();
}
check('A: founding is spawn+21; later spacing within 126±21', scheduleOK && foundings > 0, `${foundings} founding rounds, ${roundsSeen} total`);
check('A: every real-round price follows public formula and bounds', formulaOK);
check('A: last round is the public mark; no round after resolution', lastMarkOK && stoppedOK);
check('B: rounds on/off full trajectories and RNG states bit-identical', identityOK, `${N} paired runs`);

{
    function syntheticRounds(corrupt) {
        const race = fixture();
        initRounds(race);
        const rounds = [];
        for (let day = 10; day <= 850; day++) {
            race.day = day;
            if (day !== 10) race.lastTransitions = freshTransitions();
            if (day === 250) race.capability.labs.polaris.rungReleased[2] = day;
            if (day === 520) race.capability.labs.polaris.rungReleased[3] = day;
            const observed = corrupt ? copy(race) : race;
            if (corrupt) corruptLatent(observed);
            rounds.push(...stepRounds(observed, day >= 650 ? 0.9 : 0.7));
        }
        return rounds;
    }
    const clean = syntheticRounds(false), corrupted = syntheticRounds(true);
    check('A: latent corruption leaves schedule and prices bit-identical', JSON.stringify(clean) === JSON.stringify(corrupted));
    check('A: series letters follow founding as A, B, C', clean.slice(1, 4).map(r => r.letter).join(',') === 'A,B,C');
    check('A: price-ratio clamps and quiet-round carry', roundPriceRatio(-100, -100) === T.ratioMin
        && roundPriceRatio(100, 100) === T.ratioMax && roundPriceRatio(0, 0) === Math.exp(-T.carry));
}

// ---- C. Halcyon caps, dilution and primary window ------------------------
{
    check('C: allocation caps use positive equity in internal k scale', roundAllocation('polaris', 1000) === 200
        && roundAllocation('polaris', 20000) === 2000 && roundAllocation('halcyon', 1000) === 150
        && roundAllocation('halcyon', 20000) === 1500 && roundAllocation('halcyon', -1) === 0);
    check('C: offer price is 3% below post-dilution spot', near(halcyonOfferPrice(100 * T.halcyonDilution), 95.06));
    initRounds(fixture()); resetLedger();
    const entry = recordPrimaryAllocation('hcn_test', 100, 150, 1000);
    check('C: input equals min(1,3 allocation/equity), once per offering', near(entry.input, 0.45)
        && recordPrimaryAllocation('hcn_test', 100, 150, 1000) === null);
    check('C: deployment runs d+1 through d+126 inclusive', primaryInputs(100).length === 0
        && primaryInputs(101)[0]?.input === entry.input && primaryInputs(226)[0]?.input === entry.input
        && primaryInputs(227).length === 0);
    const large = recordPrimaryAllocation('large', 200, 10000, 1000);
    check('C: individual primary input bounded at one', large.input === 1);
    resetCoupling();
    let bounded = true;
    for (let d = 201; d <= 326; d++) bounded &&= Math.abs(stepCoupling(1 + primaryInputs(d).reduce((s, x) => s + x.input, 0))) <= COUPLING_TUNING.cap;
    check('C: aggregate primary input stays inside existing coupling cap', bounded);
    freezeLedger();
    check('C: primary channel is inert after latch', primaryInputs(210).length === 0
        && recordPrimaryAllocation('late', 210, 100, 1000) === null);
}
{
    initRounds(fixture()); resetLedger(); resetCoupling();
    recordPrimaryAllocation('hcn_saturated', 0, 150, 1000);
    let sourceOK = true, sumOK = true, capOK = true;
    for (let day = 1; day <= 127; day++) {
        const inputs = primaryInputs(day);
        const multiplier = stepCoupling(0.8, inputs);
        const actualDC = multiplier * 0.01;
        const rows = couplingAttribution(actualDC);
        sumOK &&= near(rows.reduce((sum, r) => sum + r.amount, 0), actualDC);
        sourceOK &&= rows.some(r => r.source === 'hcn_saturated' && r.amount > 0);
        capOK &&= Math.abs(multiplier) <= COUPLING_TUNING.cap;
        if (day === 127) sourceOK &&= inputs.length === 0;   // input expires, EMA tail remains attributed
    }
    check('C: clipped primary/secondary dC partition sums exactly once', sumOK && sourceOK && capOK);
}
{
    const race = createRaceState(BASE_SEED);
    for (const lab of Object.values(race.capability.labs)) lab.rungReleased = { 1: 0 };
    race.capability.open.rungInternal = { 1: 0 };
    race.lastTransitions = freshTransitions();
    const preset = PRESETS.find(p => p.name === 'Dynamic');
    const sim = { b: preset.b, sigmaR: preset.sigmaR, _recomputeRhoDerived() {} };
    const engine = new EventEngine();
    resetRaceBridge();
    const seed = runRaceBridge(engine, race, sim, 1);
    race.capability.labs.halcyon.rungReleased[2] = 2;
    const one = runRaceBridge(engine, race, sim, 2);
    const replay = runRaceBridge(engine, race, sim, 2);
    race.capability.labs.halcyon.rungReleased[3] = 3;
    race.capability.labs.halcyon.rungReleased[4] = 3;
    const two = runRaceBridge(engine, race, sim, 3);
    check('C: bridge counts actual capex fires, including replay and multi-rung jump', seed.capexWaves === 0
        && one.capexWaves === 1 && replay.capexWaves === 0 && two.capexWaves === 2
        && one.fired.filter(r => r.category === 'rates').length === one.capexWaves
        && two.fired.filter(r => r.category === 'rates').length === two.capexWaves);
    const postGapSpot = 100 * 1.1 * Math.pow(T.halcyonDilution, two.capexWaves);
    check('C: every actual wave adds its dilution beside valuation', near(postGapSpot, 105.644)
        && near(halcyonOfferPrice(postGapSpot), 102.47468));
}

// ---- D. Polaris participation uses the canonical effect + ledger gate ----
{
    const race = fixture();
    resetLedger();
    const source = 'polaris_series_a';
    const offered = 200, taken = 100, before = race.safety.polaris;
    applyRaceEffects(race, [{ dial: 'S', lab: 'polaris', amount: T.polarisSafety * taken / offered }], source, race.day);
    const rows = ledgerEntries('S');
    check('D: half participation gives actual +0.02 S and source ledger row', near(race.safety.polaris - before, 0.02)
        && rows.length === 1 && rows[0].source === source && near(rows[0].amount, 0.02));
    const state = JSON.stringify({ safety: race.safety, playerS: race.playerS, rows });
    freezeLedger();
    applyRaceEffects(race, [{ dial: 'S', lab: 'polaris', amount: T.polarisSafety }], 'late', race.day);
    check('D: no S or ledger effect after terminal latch', JSON.stringify({ safety: race.safety, playerS: race.playerS, rows: ledgerEntries('S') }) === state);
}

// ---- E/F. Portfolio and closeout surface (owned by the portfolio module) --
{
    let multiplesOK = true;
    const expected = { 1: 1, 2: 1, 3: 0, 4: 0.1, 5: 1.5, 6: 0.3 };
    for (let family = 1; family <= 6; family++) {
        for (const leader of ['halcyon', 'tianxia', 'polaris', 'open']) {
            const resolution = { family, leader };
            const mult = leader === 'polaris' && family === 1 ? 6 : leader === 'polaris' && family === 2 ? 3 : expected[family];
            multiplesOK &&= privateTerminalMultiple(resolution, 'private') === mult
                && privateTerminalMultiple(resolution, 'supervised') === mult
                && privateTerminalMultiple(resolution, 'mobilized') === mult
                && privateTerminalMultiple(resolution, 'nationalized') === 0.5
                && privateTerminalMultiple(resolution, 'classified') === 0.5;
        }
    }
    check('E: terminal multiples for every family/leader/regime', multiplesOK);
    const race = fixture();
    race.nationalizationRef = { frozen: { reference: 108 } };
    const positions = [
        { id: 1, type: 'privatestake', lab: 'polaris', qty: 12, entryPrice: 4 },
        { id: 2, type: 'stock', qty: 3, entryPrice: 85 },
        { id: 3, type: 'stock', qty: -2, entryPrice: 120, _reservedMargin: 250 },
        { id: 4, type: 'put', qty: -1, strike: 110, entryPrice: 7, _reservedMargin: 110 },
    ];
    const marks = { spot: 100, valuation: 0.9, privatePrice: 7, varianceIndex: 25, bond: { face: 100, day: 800, rate: 0.04, a: 0.5, b: 0.04, sigmaR: 0.01 } };
    let conservationOK = true, markOK = true;
    for (let family = 1; family <= 6; family++) for (const leader of ['polaris', 'halcyon']) {
        for (const regime of ['private', 'supervised', 'mobilized', 'nationalized', 'classified']) {
            const resolution = { family, leader, axes: { politicalControl: regime } };
            const result = closeoutBook(positions, resolution, race, marks);
            const stake = result.rows.find(r => r.type === 'privatestake');
            markOK &&= stake.cell === 'private' && stake.unitValue === marks.privatePrice * privateTerminalMultiple(resolution, regime);
            book.resetPortfolio(); book.portfolio.cash = 1234; book.portfolio.positions = copy(positions);
            const equity = book.portfolio.cash + positions.reduce((sum, p) => sum + p.qty * closeoutUnitValue(p, result.ctx) + (p._reservedMargin || 0), 0);
            book.applyCloseoutRows(result.rows);
            conservationOK &&= near(book.portfolio.cash, equity) && book.portfolio.positions.length === 0;
        }
    }
    check('E: private marks use last round times cell-10 multiple', markOK);
    check('E: private/stock/options book closes conserving equity (60 cells)', conservationOK);
}
{
    const race = fixture();
    initRounds(race); stepRounds(race, 0.7);
    race.day = 31; race.lastTransitions = freshTransitions();
    const founding = stepRounds(race, 0.7)[0];
    book.resetPortfolio(); book.portfolio.cash = 125;
    const taken = book.allocatePrivateStake(founding, 500, 283);
    check('F: private allocation is cash capped and long-only at round price', taken.allocated === 125 && taken.qty === 125
        && taken.position.lab === 'polaris' && taken.position.entryDay === 283 && book.portfolio.cash === 0);
    check('F: private stake marks only at last public round and carries no greeks', unitPrice('privatestake', 999, 9, 9, 999) === founding.price
        && book.portfolioValue(100, 0.2, 0.04, 283, 0) === 125
        && Object.values(book.aggregateGreeks(100, 0.2, 0.04, 283, 0)).every(v => v === 0)
        && book.computeNetDelta() === 0);
    const id = taken.position.id;
    const snapshot = JSON.stringify(book.portfolio);
    const manual = book.executeMarketOrder({}, 'privatestake', 'long', 1, 100, 0.2, 0.04, 283);
    const pending = book.placePendingOrder('privatestake', 'long', 1, 'limit', 1);
    const strategy = book.placePendingOrder('strategy', 'long', 1, 'limit', 1, null, null, 'bad', [{ type: 'privatestake', qty: 1 }]);
    const close = book.closePosition({}, id, 100, 0.2, 0.04, 283, 0);
    const exercise = book.exerciseOption(id, 100, 283, 0.2, 0.04, 0);
    check('F: all manual, pending, strategy, close and exercise paths reject private stakes', manual === null && pending === null && strategy === null
        && close === false && exercise === null && JSON.stringify(book.portfolio) === snapshot);
    const liquidation = book.liquidateAll({}, 100, 0.2, 0.04, 283, 0);
    check('F: liquidation reports stake stuck without sale or cash', liquidation.stuck.length === 1 && liquidation.stuck[0].id === id
        && book.portfolio.positions.length === 1 && book.portfolio.cash === 0);
    book.portfolio.cash = 20;
    book.portfolio.positions.push({ id: 999, type: 'stock', qty: -1, entryPrice: 100, _reservedMargin: 100 });
    resetImpactState();
    const margin = book.checkMargin(100, 0.2, 0.04, 283, 0);
    check('F: private NAV counts in equity but has zero maintenance collateral', near(margin.equity, 145)
        && near(margin.collateralEquity, 20) && margin.triggered && near(book.collateralEquity(100, 0.2, 0.04, 283, 0), 20));
    book.portfolio.positions.pop();
    const debit = book.executeMarketOrder({}, 'stock', 'long', 1, 100, 0.2, 0.04, 283);
    check('F: private marks cannot support initial margin borrowing', debit === null);
    race.day = 200;
    const nextRound = stepRounds(race, 0.7)[0];
    check('F: a new public round reprices existing units without a fill', unitPrice('privatestake', 100, 0.2, 0.04, 452) === nextRound.price
        && near(book.portfolioValue(100, 0.2, 0.04, 452, 0), 20 + taken.qty * nextRound.price)
        && taken.position.entryPrice === founding.price);

    book.resetPortfolio(); book.portfolio.cash = 100;
    // Non-cash assets keep equity high while only 100 can be wired. This makes
    // the actual-allocation input distinguishable from the requested 1000.
    book.portfolio.positions.push({ id: 991, type: 'bond', qty: 9, entryPrice: 100, expiryDay: 283 });
    resetImpactState();
    Object.assign(market, { S: 98, sigma: 0.2, v: 0.04, day: 283, r: 0.04, q: 0 });
    const offerPrice = halcyonOfferPrice(98);
    const initialEquity = book.portfolioValue(98, 0.2, 0.04, 283, 0);
    const stock = book.allocatePrimaryStock(offerPrice, 1000, 283);
    check('F: follow-on is ordinary cash-funded stock at post-gap discount', stock.allocated === 100 && near(stock.qty, 100 / 95.06)
        && stock.position.type === 'stock' && stock.position.entryPrice === offerPrice && book.portfolio.cash === 0);
    check('F: primary fill has no secondary impact and discount accrues to equity', getStockImpact(0.2) === 0
        && near(book.portfolioValue(98, 0.2, 0.04, 283, 0), initialEquity + stock.qty * (98 - offerPrice)));
    initRounds(race); resetLedger();
    const primary = recordPrimaryAllocation('hcn_cashcap', race.day, stock.allocated, initialEquity);
    check('F: primary input uses actual cash allocation, not requested amount', near(primary.input, 0.3));
}

// ---- G. Classic/reset ---------------------------------------------------
{
    resetRounds(); deactivateLedger();
    check('G: Classic has no marks, rounds, primary entries or inputs', lastPolarisRound() === null
        && stepRounds(null, 0.7).length === 0 && recordPrimaryAllocation('classic', 0, 100, 1000) === null
        && primaryInputs(1).length === 0);
    initRounds(null);
    check('G: null initialization keeps rounds inactive', stepRounds(fixture(), 0.7).length === 0 && lastPolarisRound() === null);
}

// ---- H. Run the actual orchestrator helpers without the DOM bootstrap -----
// Keep main's functions intact; replace only browser initialization/rendering.
// This exercises the choice and pricing chokepoints, not a duplicate of them.
{
    const source = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
    const main = source.replace(/^import[\s\S]*?from '[^']+';\n/gm, '')
        .replace(/^cacheDOMElements\(\$\);[\s\S]*?^init\(\);/m, '');
    const messages = [];
    const context = createContext({
        Simulation: class { constructor() { Object.assign(this, { S: 100, v: 0.04, r: 0.04, day: 283, q: 0, kappa: 2, theta: 0.04, xi: 0.3, rho: -0.5, a: 0.5, b: 0.04, sigmaR: 0.01 }); } },
        ExpiryManager: class {},
        portfolio: book.portfolio, market, syncMarket, computeVXHCNSpot,
        portfolioValue: book.portfolioValue,
        allocatePrivateStake: book.allocatePrivateStake, allocatePrimaryStock: book.allocatePrimaryStock,
        cancelAllOrders: book.cancelAllOrders,
        ROUNDS_TUNING, stepRounds, stepValuation, r5ProbabilityFromBelief, belief,
        halcyonOfferPrice, recordPrimaryAllocation, applyRaceEffects, raceChannelsLive,
        consensus: { active: false }, computeMarket: { active: false },
        showToast: message => messages.push(message), fmtDollar,
    });
    runInContext(main + `
        updateUI = () => {};
        globalThis.mainTest = {
            sim, queue: _popupQueue,
            race(value) { raceState = value; },
            open(value) { dayInProgress = value; },
            gap: _stepRaceMarkets, choice: _applyPopupChoice,
            restrict: _applyRestriction, stuck: _hasStuckLegs,
        };
    `, context, { filename: 'main.js (headless helpers)' });
    const api = context.mainTest;
    book.resetPortfolio(1000); resetRounds(); resetValuation(); deactivateLedger();
    syncMarket(api.sim);
    api.gap(1);
    check('H: main Classic path has no valuation/dilution/rounds', api.sim.S === 100 && lastValuation() === null && api.queue.length === 0);

    const race = fixture();
    api.race(race); resetLedger(); initBelief(race); initValuation(race); initRounds(race);
    api.gap(0);   // observe the public walkout
    const previous = lastValuation();
    race.day = 31; belief.day = 31; race.lastTransitions = freshTransitions();
    race.capability.labs.tianxia.rungReleased[2] = 31;
    const ratio = clamp(computeValuation(race) / previous, 0.75, 1.30);
    api.gap(1);
    check('H: actual main gap combines valuation/dilution and syncs marks', near(api.sim.S, 100 * ratio * T.halcyonDilution) && market.S === api.sim.S);
    const halcyon = api.queue.find(e => e._roundOffer.kind === 'halcyon')._roundOffer;
    const polaris = api.queue.find(e => e._roundOffer.kind === 'polaris')._roundOffer;
    check('H: main queues post-gap offer and founding through one queue', near(halcyon.price, api.sim.S * T.halcyonDiscount) && polaris.founding && api.queue.length === 2);
    const pipeline = source.slice(source.indexOf('function _onDayComplete()'));
    check('H: bridge precedes gap; gap precedes snapshot', pipeline.indexOf('runRaceBridge(') < pipeline.indexOf('_stepRaceMarkets(capexWaves)')
        && pipeline.indexOf('_stepRaceMarkets(capexWaves)') < pipeline.indexOf('marketsDayClose('));
    api.open(true);
    let rejected = false;
    const closedSpot = api.sim.S;
    try { api.gap(1); } catch { rejected = true; }
    api.open(false);
    check('H: an open day cannot receive a close gap', rejected && api.sim.S === closedSpot);

    const event = { ...roundDispatch(polaris, 200), _roundOffer: polaris, _offered: 200 };
    api.choice(event, event.choices[0]);
    const filledCash = book.portfolio.cash, safety = race.safety.polaris;
    api.choice(event, event.choices[0]);
    check('H: main private choice funds once and ledgers actual S effect', filledCash === 800 && book.portfolio.cash === filledCash
        && near(safety, 0.74) && race.safety.polaris === safety && ledgerEntries('S').length === 1 && ledgerEntries('S')[0].source === polaris.id);
    book.portfolio.cash = 0;
    const empty = { ...roundDispatch(polaris, 200), _roundOffer: polaris, _offered: 200 };
    api.choice(empty, empty.choices[0]);
    check('H: failed funding does not emit success or apply an effect', messages.at(-1).startsWith('Allocation rejected') && race.safety.polaris === safety);
    book.portfolio.cash = 800;
    const primary = { ...roundDispatch(halcyon, 150), _roundOffer: halcyon, _offered: 150 };
    const equity = book.portfolioValue(api.sim.S, market.sigma, api.sim.r, api.sim.day, api.sim.q);
    api.choice(primary, primary.choices[1]);
    check('H: main follow-on uses actual cash take in primary channel', near(primaryInputs(32)[0]?.input, 3 * 75 / equity) && book.portfolio.cash === 725);
    const privatePosition = book.portfolio.positions.find(p => p.type === 'privatestake');
    book.portfolio.positions = [privatePosition];
    api.restrict([privatePosition], 2);
    check('H: keeping a funded private stake does not restrict ordinary trading', !book.portfolio.restricted && !api.stuck());
    const beforeLatch = JSON.stringify(book.portfolio), queueSize = api.queue.length;
    race.resolution = { family: 5 }; freezeLedger();
    api.gap(1);
    api.choice({ ...event, _roundApplied: false }, event.choices[0]);
    check('H: terminal latch bars gaps and subscriptions', api.sim.S === closedSpot && api.queue.length === queueSize && JSON.stringify(book.portfolio) === beforeLatch);
}

console.log(`\nRounds gate: N=${N}, base seed=${BASE_SEED}, ${((Date.now() - t0) / 1000).toFixed(2)}s`);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
console.log(`\n${failures ? `FAIL: ${failures} checks` : 'PASS: all rounds checks'}`);
process.exitCode = failures ? 1 : 0;
