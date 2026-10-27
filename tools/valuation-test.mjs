#!/usr/bin/env node
/* ===================================================
   tools/valuation-test.mjs -- HCN valuation-layer gate
   (02a "The valuation layer").

   V = (1 - eta)*V_legible + eta*V_full, each V_x the
   survival-conditioned expected family mark under reader
   x's family head. Sections:
     A. Formula, marks, the pool, bounds, Classic inertia
     B. Singleton reset and clamped-gap convergence
     C. Real races: corruption, bounds, telescoping, all
        resolve
     G. V roughly calibrated: on the survival measure
        (family != 3), the pooled V's mean within CAL_TOL of
        the mean realized mark m_f, over both scenarios
     E. Terminal reconciliation, conversion, conservation

   Worlds run the reader's training loop (tools/reader-data.mjs:
   advanceRace + stepControlRegime + stepTreaty + checkResolution
   on the world's inputs), N per scenario: neutral, and engine (a
   bystander run's input tape, tools/engine-worlds.mjs), each on
   its own seeds. Every
   series is the stopped process: once a world ends (resolution
   or the term), V is its family mark m_f.

   Usage: node tools/valuation-test.mjs [N] [--seed S]
          N defaults to 150 per scenario; base seed 1.
   =================================================== */

import { createRaceState } from '../src/race/race-state.js';
import { checkResolution, HORIZON } from '../src/race/resolution.js';
import { buildPublicView, initConsensus } from '../src/race/consensus.js';
import { belief, initBelief, stepBelief, familyHeads } from '../src/race/belief.js';
import { ruleSummary } from '../src/race/public-record.js';
import { readerFamily } from '../src/race/reader.js';
import {
    VALUATION_TUNING, familyMarks, valuationFromFamily, pooledValuation, computeValuation,
    initValuation, stepValuation, lastValuation, resetValuation,
} from '../src/race/valuation.js';
import { CLOSEOUT_TUNING, hcnTerminalMark, closeoutBook, closeoutUnitValue } from '../src/race/closeout.js';
import { WORLD_SCENARIOS, worldInputs, stepWorld } from './reader-data.mjs';
import { ensureEngineWorlds } from './engine-worlds.mjs';

// ---- CLI + assertion plumbing ------------------------------------------
const argv = process.argv.slice(2);
let N = 150, BASE_SEED = 1;
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') BASE_SEED = parseInt(argv[++i], 10) >>> 0;
    else if (a === '--n' || a === '-n') N = parseInt(argv[++i], 10);
    else if (/^\d+$/.test(a)) N = parseInt(a, 10);
    else throw new Error(`Unknown argument ${a}`);
}
if (!Number.isInteger(N) || N < 1) throw new Error('N must be a positive integer');

// V roughly calibrated, read in the large over both scenarios: one realized
// family per world makes the mean noisy (about 0.03 at the default N), so the
// band is loose.
// 2026-10-27: describes the game (a9: the map fits the territory)
const CAL_TOL = 0.08;

let failures = 0;
const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok, detail });
    if (!ok) failures++;
}
const near = (a, b, tol = 1e-10) => Math.abs(a - b) < tol;
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const fmt = (x, d = 4) => Number.isFinite(x) ? x.toFixed(d) : '--';
const MARKS = familyMarks();


// Copy preserves nonfinite dates and RNG functions (no function is invoked by V).
function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)]));
    return value;
}
// Same latent-field probe as belief-test, plus internal crossing records: these
// are terminal truth, not released claims. Keep every public record intact.
function corruptLatent(race) {
    for (const k of Object.keys(race.hidden)) race.hidden[k] = 0.999;
    race.hidden.takeoffSharpness = 3;
    race.evidenceLogOdds = 99;
    race.heat.transient = 0.99; race.heat.floor = 0.99;
    for (const k of Object.keys(race.safety)) race.safety[k] = 0.01;
    for (const lab of Object.values(race.capability.labs)) {
        lab.C_internal = 5.5; lab.C_released = 5.5;
        for (const r of [1, 2, 3, 4, 5]) lab.rungInternal[r] = 0;
    }
    race.capability.open.C = 5.5;
    // Open rungInternal is PUBLIC (the open ecosystem has no concealed release).
    race.latentIncidents.push({ id: 'FAKE', severity: 4, occurDay: race.day, insiderTip: true, detected: false, detectable: false, meanLag: 0 });
    race.latentEvidence.push({ id: 'FAKE', published: false, path: 'leaked', logLR: 5, publicDay: Infinity });
}

// ---- A. Formula, marks, pool -------------------------------------------
const T = VALUATION_TUNING;
{
    check('A: marks read from CLOSEOUT_TUNING', MARKS[1] === CLOSEOUT_TUNING.meltUpWon && MARKS[2] === CLOSEOUT_TUNING.meltUpDawn
        && MARKS[4] === CLOSEOUT_TUNING.doomRecovery && MARKS[5] === CLOSEOUT_TUNING.boring && MARKS[6] === CLOSEOUT_TUNING.fizzleFloor,
        `m = ${[1, 2, 4, 5, 6].map(k => MARKS[k]).join('/')}`);
    check('A: VALUATION_TUNING holds only the clamp', JSON.stringify(Object.keys(T).sort()) === '["ratioMax","ratioMin"]');
    const p = [0.1, 0.2, 0.3, 0.15, 0.05, 0.2];
    const naive = (0.1 * 1.60 + 0.2 * 1.25 + 0.15 * 0.35 + 0.05 * 1.00 + 0.2 * 0.55) / 0.7;
    check('A: V_x is the survival-conditioned expected mark', near(valuationFromFamily(p), naive, 1e-12), `${fmt(valuationFromFamily(p), 6)} vs ${fmt(naive, 6)}`);
    check('A: family 3 gets no weight', near(valuationFromFamily([0.5, 0, 0.4, 0, 0, 0.1]), valuationFromFamily([0.5 / 0.6, 0, 0, 0, 0, 0.1 / 0.6]), 1e-12));
    const race = createRaceState(BASE_SEED);
    initConsensus(race); initBelief(race);
    const rule = ruleSummary(belief.rungs, 0), heads = familyHeads();
    const L = readerFamily(belief.record, 'legible', rule), F = readerFamily(belief.record, 'full', rule);
    check('A: heads are the readers on the record and the rule', JSON.stringify([...heads.legible]) === JSON.stringify([...L]) && JSON.stringify([...heads.full]) === JSON.stringify([...F]));
    const eta = (Math.max(1, buildPublicView(race).releasedFrontierRung) - 1) / 4;
    check('A: the pool at day 0', near(computeValuation(race), (1 - eta) * valuationFromFamily(L) + eta * valuationFromFamily(F), 1e-12)
        && pooledValuation(heads) === computeValuation(race), `V0 ${fmt(computeValuation(race))}, eta ${eta}`);
    resetValuation();
    const classic = stepValuation(null);
    check('A: Classic is inert', initValuation(null) === null && classic.V === 1 && classic.ratio === 1 && lastValuation() === null);
}

// ---- B. Applied level + reset -------------------------------------------
{
    // Two worlds' day-0 levels stand in for a shock: V moves from V_a to V_b at once.
    const a = createRaceState(BASE_SEED);
    initBelief(a); initValuation(a);
    const Va = lastValuation();
    const b = createRaceState(BASE_SEED);
    for (const r of [1, 2, 3, 4]) b.capability.labs.halcyon.rungReleased[r] = 0;   // a public R4 claim at day 0
    initBelief(b);
    const Vb = computeValuation(b), raw = Vb / Va;
    const first = stepValuation(b);
    check('B: first gap is the clamped ratio and retains the applied level', first.V === Vb
        && first.ratio === Math.max(T.ratioMin, Math.min(T.ratioMax, raw)) && near(lastValuation(), Va * first.ratio, 1e-12),
        `V ${fmt(Va)} -> ${fmt(Vb)} (raw ${fmt(raw)})`);
    for (let i = 0; i < 12; i++) stepValuation(b);
    check('B: unchanged target converges after clamping', lastValuation() === Vb && stepValuation(b).ratio === 1);
    initBelief(a);
    const back = stepValuation(a);
    check('B: reverse gap clamps the same way', back.ratio === Math.max(T.ratioMin, Math.min(T.ratioMax, Va / Vb)));
    resetValuation();
    check('B: reset clears terminal level', lastValuation() === null);
}


// ---- C/G. The ensemble -------------------------------------------------
const SCENARIOS = WORLD_SCENARIOS.scenarios;
// Each scenario on its own seeds: the two share their races on the same seed,
// so distinct seeds double the independent worlds the calibration reads.
const seedOf = (scenario, i) => (BASE_SEED + (scenario === 'engine' ? N : 0) + i) >>> 0;
await ensureEngineWorlds([...Array.from({ length: N }, (_, i) => seedOf('engine', i)), ...Array.from({ length: 6 }, (_, i) => (BASE_SEED + 9100 + i) >>> 0)]);
const t0 = Date.now();
const rows = [];       // every 21-day snapshot while live
let boundsOK = true, telescopeOK = true, resolvedOK = true;

/** One world on the reader's loop (mirrors tools/reader-data.mjs runReaderWorld,
 *  with the inputs handed to stepBelief so B's record carries them). */
function runWorld(seed, scenario, perDay = null, feed = null) {
    const race = createRaceState(seed), schedule = worldInputs(seed, scenario);
    initConsensus(race); initBelief(race); initValuation(race);
    const V0 = lastValuation();
    let inputs = null, product = 1;
    const snaps = [];
    const take = () => {
        const h = familyHeads();
        snaps.push({ scenario, VL: valuationFromFamily(h.legible), VF: valuationFromFamily(h.full), V: pooledValuation(h) });
    };
    if (!perDay) take();
    for (let d = 0; d < HORIZON && !race.resolution; d++) {
        inputs = schedule();
        stepWorld(race, inputs);
        // The corruption probe feeds the same corrupted copy to the belief step and
        // to the valuation step, so a hidden read in either would show.
        const seen = feed ? feed(race) : race;
        stepBelief(seen, inputs);
        const { V, ratio } = stepValuation(seen);
        if (perDay) perDay(V);
        else {
            boundsOK &&= V >= 0.35 - 1e-12 && V <= 1.60 + 1e-12 && ratio >= T.ratioMin && ratio <= T.ratioMax;
            product *= ratio;
            if (race.day % 21 === 0) take();
        }
        if (checkResolution(race, inputs.geo)) break;
    }
    if (!race.resolution) checkResolution(race, inputs?.geo);
    return { race, V0, product, snaps, VT: lastValuation() };
}

for (const scenario of SCENARIOS) {
    for (let i = 0; i < N; i++) {
        const w = runWorld(seedOf(scenario, i), scenario);
        resolvedOK &&= !!w.race.resolution;
        if (!w.race.resolution) continue;
        telescopeOK &&= near(w.V0 * w.product, w.VT, 1e-9);
        // m_f is the realized terminal multiple the closeout pays (the fizzle's seeded
        // draw; family 3's doom recovery, outside the survival measure).
        const fam = w.race.resolution.family, mf = hcnTerminalMark(fam, 'private', w.race, 1, 1).mark;
        if (fam !== 3) for (const s of w.snaps) rows.push({ ...s, mf });
    }
}
const ensembleSeconds = (Date.now() - t0) / 1000;

// Corruption: the same worlds, with stepBelief fed a corrupted copy every day.
let corruptionOK = true, probeDays = 0;
for (let i = 0; i < Math.min(N, 6); i++) {
    const seed = (BASE_SEED + 9100 + i) >>> 0;
    const clean = [], dirty = [];
    runWorld(seed, i % 2 ? 'engine' : 'neutral', V => clean.push(V));
    runWorld(seed, i % 2 ? 'engine' : 'neutral', V => dirty.push(V), race => { const c = copy(race); corruptLatent(c); return c; });
    corruptionOK &&= clean.length === dirty.length && clean.every((v, k) => v === dirty[k]);
    probeDays += clean.length;
}

check('C: corruption leaves V bit-identical', corruptionOK, `${probeDays} days`);
check('C: V in [0.35, 1.60] and the daily ratio inside its clamp', boundsOK);
check('C: applied gaps telescope to the terminal level', telescopeOK);
check('C: all races resolve', resolvedOK);

// ---- G. V roughly calibrated (the stopped process, survival measure) ------
const calIn = (key, sub) => mean(sub.map(r => r.mf)) - mean(sub.map(r => r[key]));
const calV = calIn('V', rows);
check(`G: V calibrated in the large: |mean m_f - mean V| <= ${CAL_TOL} (survival measure)`, Math.abs(calV) <= CAL_TOL,
    `${fmt(calV)} over ${rows.length} snapshots`);

// ---- E. Reconciled marks and conserving closeout -------------------------
{
    const race = createRaceState(BASE_SEED);
    race.nationalizationRef = { frozen: { reference: 108 } };
    const positions = [
        { id: 1, type: 'stock', qty: 7, entryPrice: 83 },
        { id: 2, type: 'stock', qty: -3, entryPrice: 121, _reservedMargin: 500 },
        { id: 3, type: 'call', qty: 2, strike: 95, entryPrice: 6 },
        { id: 4, type: 'put', qty: -4, strike: 110, entryPrice: 7, _reservedMargin: 440 },
        { id: 5, type: 'bond', qty: 2, expiryDay: 1100, entryPrice: 95 },
        { id: 6, type: 'bond', qty: -1, expiryDay: 1100, entryPrice: 94, _reservedMargin: 100 },
        { id: 7, type: 'vxhcnfuture', qty: -2, entryPrice: 29, _reservedMargin: 80 },
    ];
    const marks = { spot: 100, valuation: 0.83, varianceIndex: 24, bond: { face: 100, rate: 0.04, a: 0.5, b: 0.04, sigmaR: 0.01, day: 800 } };
    const multiples = { 1: CLOSEOUT_TUNING.meltUpWon, 2: CLOSEOUT_TUNING.meltUpDawn, 3: CLOSEOUT_TUNING.doomRecovery, 4: CLOSEOUT_TUNING.doomRecovery, 5: CLOSEOUT_TUNING.boring, 6: hcnTerminalMark(6, 'private', race, 1).mark };
    let reconcileOK = true, conversionOK = true, conservationOK = true, legacyOK = true;
    for (let f = 1; f <= 6; f++) {
        const legacy = hcnTerminalMark(f, 'private', race, marks.spot);
        legacyOK &&= legacy.mark === marks.spot * multiples[f];
        for (const regime of ['private', 'supervised', 'mobilized', 'nationalized', 'classified']) {
            const mark = hcnTerminalMark(f, regime, race, marks.spot, marks.valuation);
            if (regime === 'nationalized' || regime === 'classified') conversionOK &&= mark.converted && mark.mark === 108;
            else reconcileOK &&= mark.mark === marks.spot * multiples[f] / marks.valuation;
            const result = closeoutBook(positions, { family: f, axes: { politicalControl: regime } }, race, marks);
            const cash = 1000;
            const equity = cash + positions.reduce((sum, p) => sum + p.qty * closeoutUnitValue(p, result.ctx) + (p._reservedMargin || 0), 0);
            conservationOK &&= near(equity, cash + result.totalCash) && result.ctx.hcnMark === mark.mark;
        }
    }
    check('E: all families reconcile realized over expected', reconcileOK);
    check('E: conversion regimes keep frozen reference', conversionOK);
    check('E: absent valuation preserves family marks', legacyOK);
    check('E: synthetic book conserves equity across 30 cells', conservationOK);
}


// ---- Report -------------------------------------------------------------
console.log(`\nValuation layer: N=${N} per scenario, base seed=${BASE_SEED}, ensemble ${ensembleSeconds.toFixed(1)}s`);
for (const [key, label] of [['VL', 'legible'], ['VF', 'full'], ['V', 'pooled']]) {
    console.log(`  mean m_f - mean ${label.padEnd(7)} ${SCENARIOS.map(sc => `${sc} ${fmt(calIn(key, rows.filter(r => r.scenario === sc)))}`).join(', ')}`);
}
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
console.log(`\n${failures ? `FAIL: ${failures} checks` : 'PASS: all valuation checks'}`);
process.exitCode = failures ? 1 : 0;
