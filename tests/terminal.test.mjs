// The terminal:
// the closeout conserves equity in every cell, the books' finalizers settle once,
// the desk's presence never changes the world's outcome, and the player's
// influence on it is bounded and stops at the latch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceState, advanceRace, stepControlRegime } from '../src/race/race-state.js';
import { stepTreaty } from '../src/race/treaty-track.js';
import { checkResolution, resolveNow, HORIZON } from '../src/race/resolution.js';
import { initConsensus, finalizeConsensusTerminal } from '../src/race/consensus.js';
import { initComputeMarket, finalizeComputeTerminal } from '../src/race/compute-market.js';
import { hcnTerminalMark, closeoutPosition, closeoutBook, closeoutUnitValue, CLOSEOUT_TUNING } from '../src/race/closeout.js';
import { familyMarks } from '../src/race/valuation.js';
import { privateTerminalMultiple, initRounds, recordPrimaryAllocation, primaryInputs } from '../src/race/rounds.js';
import { ledger, resetLedger, deactivateLedger, freezeLedger, appendLedger, ledgerTotals, ledgerEntries, applyRaceEffects } from '../src/race/ledger.js';
import { resetCoupling, stepCoupling, couplingAttribution, COUPLING_TUNING } from '../src/race/coupling.js';
import { initBelief, credibility } from '../src/race/belief.js';
import * as book from '../src/portfolio.js';

const REGIMES = ['private', 'supervised', 'mobilized', 'nationalized', 'classified'];
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
function runToResolution(seed, { consensus = false, until = HORIZON } = {}) {
    const race = createRaceState(seed);
    if (consensus) initConsensus(race);
    for (let d = 0; d < until && !race.resolution; d++) {
        advanceRace(race, { straitTension: 0 }); stepControlRegime(race); stepTreaty(race, {}); checkResolution(race, null);
    }
    if (!race.resolution && until >= HORIZON) checkResolution(race, null);
    return race;
}

// A position converts at its terminal unit value u: cash = qty·u + the collateral
// returned, so pre-closeout equity equals post-closeout cash, whatever the basis.
test('the closeout conserves equity in every family x regime x instrument cell', () => {
    const race = createRaceState(1);
    race.nationalizationRef = { multiple: 0.9, window: [], frozen: { day: 500, median: 120, multiple: 0.9, reference: 108, sessions: 20 } };
    const bond = { rate: 0.055, a: 0.15, b: 0.03, sigmaR: 0.01, day: 400, face: 100 };
    const specs = [
        { type: 'stock', qty: 10, entryPrice: 90 }, { type: 'call', qty: 5, strike: 95, entryPrice: 8 }, { type: 'put', qty: 5, strike: 110, entryPrice: 7 },
        { type: 'vxhcnfuture', qty: 3, entryPrice: 20 }, { type: 'bond', qty: 4, expiryDay: 900, entryPrice: 97 },
    ];
    for (let family = 1; family <= 6; family++) for (const regime of REGIMES) {
        const ctx = { family, regime, hcnMark: hcnTerminalMark(family, regime, race, 100).mark, varianceIndex: 22, bond };
        for (const s of specs) {
            const long = closeoutPosition({ id: 1, ...s }, ctx), short = closeoutPosition({ id: 2, ...s, qty: -s.qty }, ctx);
            const u = long.unitValue;
            assert.ok(Number.isFinite(u) && u >= 0, `${family}/${regime}/${s.type}: u = ${u}`);
            assert.ok(near(long.cashChange, long.qty * u) && near(short.cashChange, short.qty * u) && near(long.cashChange + short.cashChange, 0));
            const rebased = closeoutPosition({ id: 3, ...s, entryPrice: s.entryPrice + 25 }, ctx);
            assert.ok(near(rebased.cashChange, long.cashChange) && !near(rebased.pnl, long.pnl), `${s.type}: cash depends on basis`);
        }
    }
    const sr = closeoutPosition({ id: 4, type: 'stock', qty: -10, entryPrice: 90, _reservedMargin: 700 }, { family: 1, regime: 'private', hcnMark: 160, varianceIndex: 22, bond });
    assert.ok(near(sr.cashChange, 700 - 10 * 160), 'collateral not returned net of the cover');
    // Conversion regimes mark HCN at the frozen reference; with none, the mark is
    // flagged converted, never a silent family mark.
    const conv = hcnTerminalMark(1, 'nationalized', race, 100);
    assert.ok(conv.converted && near(conv.mark, 108));
    const noRef = hcnTerminalMark(3, 'nationalized', createRaceState(9), 100);
    assert.ok(noRef.converted && noRef.cell === 'hcn:conversion-unavailable' && !near(noRef.mark, 100 * CLOSEOUT_TUNING.doomRecovery));
});

test('the closeout reconciles HCN at spot·m_f/V and a whole book, private stakes included, closes conserving equity', () => {
    const race = createRaceState(1);
    race.nationalizationRef = { frozen: { reference: 108 } };
    const m = familyMarks();
    for (let f = 1; f <= 6; f++) {
        if (f !== 3) assert.ok(near(hcnTerminalMark(f, 'private', race, 100, 0.83).mark, 100 * hcnTerminalMark(f, 'private', race, 1).mark / 0.83));
        if (f !== 3 && f !== 6) assert.equal(hcnTerminalMark(f, 'private', race, 100).mark, 100 * m[f]);
    }
    const positions = [
        { id: 1, type: 'privatestake', lab: 'polaris', qty: 12, entryPrice: 4 }, { id: 2, type: 'stock', qty: 3, entryPrice: 85 },
        { id: 3, type: 'stock', qty: -2, entryPrice: 120, _reservedMargin: 250 }, { id: 4, type: 'put', qty: -1, strike: 110, entryPrice: 7, _reservedMargin: 110 },
        { id: 5, type: 'call', qty: 2, strike: 95, entryPrice: 6 }, { id: 6, type: 'bond', qty: 2, expiryDay: 1100, entryPrice: 95 },
        { id: 7, type: 'vxhcnfuture', qty: -2, entryPrice: 29, _reservedMargin: 80 },
    ];
    const marks = { spot: 100, valuation: 0.9, privatePrice: 7, varianceIndex: 25, bond: { face: 100, day: 800, rate: 0.04, a: 0.5, b: 0.04, sigmaR: 0.01 } };
    for (let family = 1; family <= 6; family++) for (const leader of ['polaris', 'halcyon']) for (const regime of REGIMES) {
        const resolution = { family, leader, axes: { politicalControl: regime } };
        const result = closeoutBook(positions, resolution, race, marks);
        assert.equal(result.rows.find(r => r.type === 'privatestake').unitValue, marks.privatePrice * privateTerminalMultiple(resolution, regime));
        book.resetPortfolio(); book.portfolio.cash = 1234; book.portfolio.positions = structuredClone(positions);
        const equity = 1234 + positions.reduce((s, p) => s + p.qty * closeoutUnitValue(p, result.ctx) + (p._reservedMargin || 0), 0);
        book.applyCloseoutRows(result.rows);
        assert.ok(near(book.portfolio.cash, equity) && book.portfolio.positions.length === 0, `${family}/${leader}/${regime}`);
    }
});

test('the books\' terminal finalizers judge on the deadline, fall back under conversion, and settle once', () => {
    const setup = (mut) => { const r = createRaceState(1); initConsensus(r); mut(r); return r; };
    const out = (rows) => Object.fromEntries(rows.map(r => [r.contract.predicate.rung + (r.contract.terminal ? 'T' : 'C'), r.outcome]));
    let race = setup(r => { r.capability.labs.halcyon.rungInternal[5] = 900; r.capability.labs.halcyon.rungCertified[2] = 100; });
    const o = out(finalizeConsensusTerminal(race));
    assert.ok(o['5T'] === 'YES' && o['2C'] === 'YES' && o['3C'] === 'NO');
    assert.equal(finalizeConsensusTerminal(race).length, 0);
    race = setup(r => { r.capability.labs.halcyon.rungInternal[5] = 1200; r.day = 1300; });
    assert.equal(out(finalizeConsensusTerminal(race))['5T'], 'NO', 'an R5 crossing after its deadline paid YES');
    race = setup(r => { r.controlRegime = 'nationalized'; r.capability.labs.halcyon.rungInternal[5] = 900; });
    assert.ok(finalizeConsensusTerminal(race).every(r => r.outcome === 'FALLBACK'));

    const c1 = createRaceState(1);
    initComputeMarket(c1, null);
    const s1 = finalizeComputeTerminal(c1, null);
    assert.ok(s1.length && s1.every(s => s.kind === 'TERMINAL' && Number.isFinite(s.settlePrice)));
    assert.equal(finalizeComputeTerminal(c1, null).length, 0);
    const c2 = createRaceState(2);
    initComputeMarket(c2, null);
    c2.controlRegime = 'nationalized';
    assert.ok(finalizeComputeTerminal(c2, null).every(s => s.kind === 'DECREE'));

    // Terminal rows go through the binary chokepoint exactly once and never score credibility.
    const rc = runToResolution(1, { consensus: true });
    initBelief(rc);
    const rows = finalizeConsensusTerminal(rc), cred = credibility();
    book.resetPortfolio(10000);
    assert.equal(book.applyBinarySettlementRows(rows).fresh.length, rows.length);
    assert.equal(book.applyBinarySettlementRows(rows).fresh.length, 0);
    assert.equal(credibility(), cred);
});

// An early ejection extrapolates the world forward; the same seed must settle
// identically whether the desk ejects or plays to the natural resolution.
test('ejection invariance: ejecting at day 200 and extrapolating settles every contract as the natural run does', () => {
    let exercised = 0;
    const settle = (race) => { initConsensus(race); return finalizeConsensusTerminal(race); };
    for (const seed of [1, 2, 3, 4, 5, 6]) {
        const a = runToResolution(seed, { until: 200 });
        resetLedger();
        resolveNow(a, null);
        assert.ok(a.resolution && ledger.frozen, 'resolveNow did not resolve and freeze the ledger');
        const rowsA = settle(a), rowsB = settle(runToResolution(seed));
        const outcomes = (rows) => Object.fromEntries(rows.map(r => [r.key, r.outcome]));
        assert.deepEqual(outcomes(rowsA), outcomes(rowsB), `seed ${seed}`);
        // Non-vacuous: a rung first certified after the ejection, inside its deadline, paid YES.
        exercised += rowsA.filter(r => !r.contract.terminal && r.outcome === 'YES'
            && ['halcyon', 'tianxia', 'polaris'].every(id => !(a.capability.labs[id].rungCertified[r.contract.predicate.rung] <= 200))).length;
    }
    assert.ok(exercised > 0, 'no seed certified a rung after the ejection');
});

test('a seed resolves to the same record, extrapolation included, and the resolution latches', () => {
    let extrapolated = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const a = runToResolution(seed).resolution, b = runToResolution(seed).resolution;
        assert.equal(JSON.stringify(a), JSON.stringify(b), `seed ${seed}`);
        if (a.extrapolated) extrapolated++;
        // With no player, the effective distance is the world's.
        assert.ok(a.axes.dP === 0 && a.axes.dW === a.axes.dActual && a.d === a.axes.dActual);
    }
    assert.ok(extrapolated > 0, 'no seed reached the horizon');
    const race = runToResolution(1), before = JSON.stringify(race.resolution);
    assert.equal(checkResolution(race, null), null);
    assert.equal(JSON.stringify(race.resolution), before);
});

// Bounded influence: d_eff = d_W + clip(d_P, ±(3/7)|d_W|).
test('the player\'s influence on the outcome is clipped to 3/7 of the world\'s distance', () => {
    let bound = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const race = createRaceState(seed);
        for (const k of ['halcyon', 'tianxia', 'polaris']) if (race.playerS[k] != null) race.playerS[k] = 0.4;
        race.playerCumC = 0.1;
        for (let d = 0; d < HORIZON && !race.resolution; d++) {
            advanceRace(race, { straitTension: 0 }); stepControlRegime(race); stepTreaty(race, {}); checkResolution(race, null);
        }
        if (!race.resolution) checkResolution(race, null);
        const a = race.resolution.axes, lim = (3 / 7) * Math.abs(a.dW);
        assert.ok(near(a.dP, a.dP_S + a.dP_C) && near(a.dW, a.dActual - a.dP));
        assert.ok(near(race.resolution.d, a.dW + Math.max(-lim, Math.min(lim, a.dP))), `seed ${seed}`);
        if (!near(race.resolution.d, a.dActual)) bound++;
    }
    assert.ok(bound > 0, 'the clip never bound');
});

// The complicity ledger decides gray eminence against bystander, so it must be
// the whole record of what capital did, and nothing writes after the latch.
test('the ledger reconstructs its totals, drops empty rows, and gates every player channel at the latch', () => {
    resetLedger();
    appendLedger(10, 'C', 'cost_of_capital', 0.02, 'a');
    appendLedger(20, 'S', 'halcyon_osei_board', 0.05, 'S[halcyon]');
    appendLedger(40, 'C', 'cost_of_capital', 0.01, 'b');
    assert.equal(appendLedger(50, 'C', 'cost_of_capital', 0, 'zero'), null);
    const t = ledgerTotals();
    assert.ok(near(t.C, 0.03, 1e-12) && near(t.S, 0.05, 1e-12) && ledgerEntries('C').length === 2);
    resetLedger();
    const race = { safety: { halcyon: 0.5, tianxia: 0.5, polaris: null }, playerS: { halcyon: 0, tianxia: 0, polaris: 0 }, heat: { transient: 0.9 } };
    applyRaceEffects(race, [{ dial: 'S', lab: 'halcyon', amount: 0.4 }, { dial: 'heat', amount: 0.15 }], 'x', 3);
    const applied = ledgerTotals();
    assert.ok(near(applied.S, race.safety.halcyon - 0.5) && near(applied.heat, race.heat.transient - 0.9), 'the ledger is not the applied (clamped) delta');
    const frozen = JSON.stringify(race);
    freezeLedger();
    applyRaceEffects(race, [{ dial: 'S', lab: 'halcyon', amount: 0.05 }], 'late', 4);
    assert.equal(appendLedger(60, 'C', 'x', 0.9), null);
    assert.equal(JSON.stringify(race), frozen, 'a race effect landed after the latch');
    initRounds(createRaceState(1));
    assert.equal(recordPrimaryAllocation('late', 210, 100, 1000), null);
    deactivateLedger();
    applyRaceEffects(race, [{ dial: 'S', lab: 'halcyon', amount: 0.05 }], 'classic', 5);
    assert.equal(JSON.stringify(race), frozen);
});

test('the coupling\'s attribution partitions the clipped dC across its sources exactly once', () => {
    initRounds(createRaceState(1)); resetLedger(); resetCoupling();
    recordPrimaryAllocation('hcn_saturated', 0, 150, 1000);
    for (let day = 1; day <= 127; day++) {
        const inputs = primaryInputs(day);
        const mult = stepCoupling(0.8, inputs);
        const rows = couplingAttribution(mult * 0.01);
        assert.ok(Math.abs(mult) <= COUPLING_TUNING.cap);
        assert.ok(near(rows.reduce((s, r) => s + r.amount, 0), mult * 0.01), `day ${day}: the attribution does not sum to dC`);
        assert.ok(rows.some(r => r.source === 'hcn_saturated' && r.amount > 0));
    }
});
