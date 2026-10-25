#!/usr/bin/env node
/* ===================================================
   tools/valuation-test.mjs -- HCN valuation-layer gate
   (02a "The valuation layer", ratified 2026-10-24).

   Sections:
     A. Public claims, formula, deadline and Classic inertia
     B. Singleton reset and clamped-gap convergence
     C. Real races: corruption, no silent drift, bounds, day-0 priors
     D. Diagnostics: gaps, paths, log drift and reveal ratios by family
     E. Terminal reconciliation, conversion and book conservation
     F. Bit-identical race trajectories with valuation on/off

   Neutral daily loop: advanceRace + stepControlRegime +
   stepTreaty + stepBelief + valuation + checkResolution.
   Timeout extrapolation is hidden: terminal V is the LAST
   observed level, not a new quote from the extrapolated world.

   Usage: node tools/valuation-test.mjs [N] [--seed S]
          N defaults to 300; base seed defaults to 1.
   =================================================== */

import { createRaceState, advanceRace, stepControlRegime } from '../src/race/race-state.js';
import { stepTreaty } from '../src/race/treaty-track.js';
import { checkResolution, HORIZON } from '../src/race/resolution.js';
import { buildPublicView, initConsensus } from '../src/race/consensus.js';
import { belief, initBelief, stepBelief } from '../src/race/belief.js';
import {
    VALUATION_TUNING, r5ProbabilityFromBelief, valuationFromPublic, computeValuation,
    initValuation, stepValuation, lastValuation, resetValuation,
} from '../src/race/valuation.js';
import { CLOSEOUT_TUNING, hcnTerminalMark, closeoutBook, closeoutUnitValue } from '../src/race/closeout.js';

// ---- CLI + assertion plumbing ------------------------------------------
const argv = process.argv.slice(2);
let N = 300, BASE_SEED = 1;
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') BASE_SEED = parseInt(argv[++i], 10) >>> 0;
    else if (a === '--n' || a === '-n') N = parseInt(argv[++i], 10);
    else if (/^\d+$/.test(a)) N = parseInt(a, 10);
}
if (!Number.isInteger(N) || N < 1) throw new Error('N must be a positive integer');
let failures = 0;
const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok, detail });
    if (!ok) failures++;
}
const near = (a, b) => Math.abs(a - b) < 1e-10;
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const fmt = (x) => Number.isFinite(x) ? x.toFixed(6) : '--';
const pct = (x) => (100 * x).toFixed(2) + '%';
function quantile(sorted, p) {
    const k = (sorted.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo);
}

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

// ---- A. Projection + formula --------------------------------------------
const T = VALUATION_TUNING;
{
    const race = createRaceState(BASE_SEED);
    initConsensus(race); initBelief(race);
    const view = buildPublicView(race);
    const claimsMatch = ['halcyon', 'tianxia', 'polaris'].every(id => {
        const lab = race.capability.labs[id];
        const expected = lab.active ? Math.max(0, ...[1, 2, 3, 4, 5].filter(r => lab.rungReleased[r] != null)) : 0;
        return view.claimedRung[id] === expected;
    });
    const r = view.claimedRung;
    const lambda = 1 / (1 + Math.exp(-(T.lambda0 + (Math.max(r.halcyon, r.polaris) - r.tianxia) / T.leadScale)));
    const rung = belief.rungs[5];
    const pi = 1 / (1 + Math.exp(-(T.deadline - rung.m) / rung.w));
    check('A: day-0 claims match discrete public records', claimsMatch);
    check('A: unconditional listing prior', near(r5ProbabilityFromBelief(rung, 0), pi), `Pi=${fmt(pi)}`);
    check('A: formula at listing prior', near(computeValuation(race), pi * (lambda * T.mW + (1 - lambda) * T.mC) + (1 - pi) * T.mF));
    check('A: pure Pi has no clock drift before deadline', [0, 1, 350, 700, 999].every(day => r5ProbabilityFromBelief(rung, day) === pi));
    check('A: pure Pi moves on belief evidence', r5ProbabilityFromBelief({ ...rung, m: rung.m - 100 }, 350) > pi);
    const synthetic = copy(race);
    synthetic.capability.labs.halcyon.rungReleased = { 1: 0, 2: 10, 3: 20 };
    synthetic.capability.labs.tianxia.rungReleased = {};
    synthetic.capability.labs.polaris.rungReleased = { 5: 1 };
    const claims = buildPublicView(synthetic).claimedRung;
    check('A: highest claim, below ladder, inactive Polaris', claims.halcyon === 3 && claims.tianxia === 0 && claims.polaris === 0);
    synthetic.capability.labs.polaris.active = true;
    check('A: active Polaris contributes its public claim', buildPublicView(synthetic).claimedRung.polaris === 5);
    const tied = { claimedRung: { halcyon: 2, tianxia: 2, polaris: 0 } };
    const tiedLead = 1 / (1 + Math.exp(-T.lambda0));
    check('A: pure formula endpoints include lead prior', valuationFromPublic(tied, 0) === T.mF && near(valuationFromPublic(tied, 1), tiedLead * T.mW + (1 - tiedLead) * T.mC));
    belief.day = T.deadline;
    check('A: uncrossed R5 deadline collapses to fizzle', r5ProbabilityFromBelief(rung, T.deadline) === 0 && r5ProbabilityFromBelief(rung, T.deadline + 1) === 0 && computeValuation(race) === T.mF);
    belief.rungs[5].crossed = true; belief.rungs[5].certDay = T.deadline - 1;
    check('A: crossed-by-deadline Pi stays one', r5ProbabilityFromBelief(rung, T.deadline + 1) === 1);
    check('A: deadline crossing qualifies; later crossing does not', r5ProbabilityFromBelief({ ...rung, certDay: T.deadline }, T.deadline) === 1 && r5ProbabilityFromBelief({ ...rung, certDay: T.deadline + 1 }, T.deadline + 1) === 0);
    resetValuation();
    const classic = stepValuation(null);
    check('A: Classic is inert', initValuation(null) === null && classic.V === 1 && classic.ratio === 1 && lastValuation() === null);
}

// ---- B. Applied level + reset -------------------------------------------
{
    const race = createRaceState(BASE_SEED);
    initBelief(race); initValuation(race);
    const initial = lastValuation();
    belief.day = T.deadline;
    const first = stepValuation(race);
    check('B: clamped first gap retains applied level', first.V === T.mF && first.ratio === T.ratioMin && lastValuation() === initial * T.ratioMin);
    for (let i = 0; i < 10; i++) stepValuation(race);
    check('B: unchanged target converges after clamping', lastValuation() === T.mF && stepValuation(race).ratio === 1);
    // Reverse the shock to exercise the upper clamp too.
    belief.rungs[5].crossed = true; belief.rungs[5].certDay = 1;
    race.capability.labs.halcyon.rungReleased[5] = 1;
    const high = stepValuation(race);
    check('B: upward gap clamps', high.ratio === T.ratioMax);
    for (let i = 0; i < 10; i++) stepValuation(race);
    check('B: upward target converges', lastValuation() === high.V && stepValuation(race).ratio === 1);
    resetValuation();
    check('B: reset clears terminal level', lastValuation() === null);
}

// ---- C/D. Real-race ensemble --------------------------------------------
const t0 = Date.now(), day0 = [], gaps = [];
const families = Object.fromEntries([1, 2, 3, 4, 5, 6].map(f => [f, { v350: [], v700: [], terminal: [], logDrift: [], deadlineDrift: [], otherDrift: [], reveals: [], small: 0, n: 0 }]));
let corruptionOK = true, boundsOK = true, telescopeOK = true, resolvedOK = true, day0OK = true, noSilentDriftOK = true;
let probes = 0, smallReveal = 0, silentDays = 0;
// Exactly the public valuation inputs, excluding the clock. Certifications
// affect this surface through B; retaining the public frontier also makes the
// no-news probe explicitly respect the certification condition in the contract.
function valuationInputSignature(race) {
    const view = buildPublicView(race);
    return JSON.stringify({ r5: belief.rungs[5], claimedRung: view.claimedRung, certifiedFrontierRung: view.certifiedFrontierRung });
}
function probe(race) {
    const corrupted = copy(race);
    corruptLatent(corrupted);
    corruptionOK &&= computeValuation(race) === computeValuation(corrupted);
    probes++;
}
for (let i = 0; i < N; i++) {
    const race = createRaceState((BASE_SEED + i) >>> 0);
    initConsensus(race); initBelief(race); initValuation(race);
    const initial = lastValuation();
    day0.push(initial); probe(race);
    const claims = buildPublicView(race).claimedRung;
    const lead = Math.max(claims.halcyon, claims.polaris) - claims.tianxia;
    day0OK &&= (lead === 0 && Math.abs(initial - 0.95) < 0.01) || (lead === 1 && Math.abs(initial - 1.08) < 0.01);
    let v350 = null, v700 = null, product = 1, deadlineDrift = 0, otherDrift = 0;
    let previousInputs = valuationInputSignature(race), previousTarget = initial;
    for (let d = 0; d < HORIZON && !race.resolution; d++) {
        advanceRace(race, { straitTension: 0 });
        stepControlRegime(race); stepTreaty(race, {}); stepBelief(race);
        const { V, ratio } = stepValuation(race);
        const inputs = valuationInputSignature(race);
        if (inputs === previousInputs && race.day !== T.deadline) {
            silentDays++;
            noSilentDriftOK &&= V === previousTarget;
        }
        const targetMove = Math.log(V / previousTarget);
        if (race.day === T.deadline) deadlineDrift += targetMove;
        else otherDrift += targetMove;
        previousInputs = inputs; previousTarget = V;
        boundsOK &&= V >= T.mC && V <= T.mW && ratio >= T.ratioMin && ratio <= T.ratioMax
            && lastValuation() >= T.mC && lastValuation() <= T.mW;
        product *= ratio;
        gaps.push(Math.abs(Math.log(ratio)));
        if (race.day === 350) v350 = lastValuation();
        if (race.day === 700) v700 = lastValuation();
        if (race.day % 63 === 0) probe(race);
        if (checkResolution(race, null)) break;
    }
    if (!race.resolution) checkResolution(race, null);
    resolvedOK &&= !!race.resolution;
    if (!race.resolution) continue;
    telescopeOK &&= near(initial * product, lastValuation());
    const f = race.resolution.family, row = families[f], V = lastValuation();
    const realized = hcnTerminalMark(f, 'private', race, 1).mark;
    const small = Math.abs(V / realized - 1) <= 0.10;
    row.n++; row.terminal.push(V); row.small += Number(small); smallReveal += Number(small);
    row.logDrift.push(Math.log(V / initial)); row.reveals.push(realized / V);
    row.deadlineDrift.push(deadlineDrift); row.otherDrift.push(otherDrift);
    if (v350 != null) row.v350.push(v350);
    if (v700 != null) row.v700.push(v700);
}
check('C: corruption leaves V bit-identical', corruptionOK, `${probes} probes`);
check('C: no silent target drift on unchanged public inputs', noSilentDriftOK && silentDays > 0, `${silentDays} unchanged-input days; day-${T.deadline} step excepted`);
check('C: V and daily ratio bounds', boundsOK);
check('C: applied gaps telescope to terminal level', telescopeOK);
check('C: all races resolve', resolvedOK);
check('C: day-0 V approximately 1.08 with lead / 0.95 tied', day0OK, `mean=${fmt(mean(day0))}, min=${fmt(Math.min(...day0))}, max=${fmt(Math.max(...day0))}`);

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

// ---- F. Full trajectories + RNG state, valuation on/off ------------------
let identityOK = true;
const identityN = Math.min(N, 12);
for (let i = 0; i < identityN; i++) {
    const a = createRaceState((BASE_SEED + i) >>> 0), b = createRaceState((BASE_SEED + i) >>> 0);
    initConsensus(a); initBelief(a); initValuation(a);
    for (let d = 0; d < HORIZON && !a.resolution; d++) {
        advanceRace(a, { straitTension: 0 }); stepControlRegime(a); stepTreaty(a, {});
        advanceRace(b, { straitTension: 0 }); stepControlRegime(b); stepTreaty(b, {});
        stepBelief(a); stepValuation(a);
        checkResolution(a, null); checkResolution(b, null);
        identityOK &&= JSON.stringify(a) === JSON.stringify(b);
    }
    for (const name of Object.keys(a.streams)) identityOK &&= a.streams[name].next() === b.streams[name].next();
}
check('F: valuation on/off trajectories and RNG states identical', identityOK, `${identityN} full paired runs`);

// ---- Report -------------------------------------------------------------
console.log(`\nValuation layer: N=${N}, base seed=${BASE_SEED} (${((Date.now() - t0) / 1000).toFixed(2)}s)`);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
const priorCounts = new Map();
for (const v of day0) priorCounts.set(fmt(v), (priorCounts.get(fmt(v)) || 0) + 1);
console.log('\nC: measured day-0 distribution (one-rung Western lead / tied claims)');
for (const [v, n] of [...priorCounts].sort()) console.log(`V=${v}: ${n}/${N} (${pct(n / N)})`);
gaps.sort((a, b) => a - b);
console.log('\nD: daily |log ratio| distribution (diagnostic; all observed desk days)');
console.log(`days=${gaps.length}; mean=${fmt(mean(gaps))}; p50=${fmt(quantile(gaps, 0.50))}; p95=${fmt(quantile(gaps, 0.95))}; p99=${fmt(quantile(gaps, 0.99))}; max=${fmt(gaps[gaps.length - 1])}`);
for (const threshold of [0.02, 0.05]) {
    const n = gaps.filter(v => v > threshold).length;
    console.log(`|log ratio| > ${threshold}: ${n}/${gaps.length} (${pct(n / gaps.length)})`);
}
console.log('\nD: mean applied V by eventual family (snapshot n excludes runs already ended)');
console.log('family   runs    day 350 (n)         day 700 (n)         terminal V       within 10% of m_f');
for (const [f, r] of Object.entries(families)) {
    console.log(`${f.padEnd(9)}${String(r.n).padEnd(8)}${`${fmt(mean(r.v350))} (${r.v350.length})`.padEnd(20)}${`${fmt(mean(r.v700))} (${r.v700.length})`.padEnd(20)}${fmt(mean(r.terminal)).padEnd(17)}${r.n ? pct(r.small / r.n) : '--'}`);
}
console.log(`Within 10% of realized family multiple: ${smallReveal}/${N} (${pct(smallReveal / N)}). Conversion regimes included for this family-multiple diagnostic only.`);
console.log('\nD: cumulative log drift and terminal reveal ratio m_f / V_T by eventual family');
console.log('family   mean log(V_T/V_0)   reveal mean    p10         p50         p90         min         max');
for (const [f, r] of Object.entries(families)) {
    r.reveals.sort((a, b) => a - b);
    console.log(`${f.padEnd(9)}${fmt(mean(r.logDrift)).padEnd(20)}${fmt(mean(r.reveals)).padEnd(15)}${[0.10, 0.50, 0.90].map(p => fmt(quantile(r.reveals, p)).padEnd(12)).join('')}${fmt(r.reveals[0]).padEnd(12)}${fmt(r.reveals[r.reveals.length - 1])}`);
}
console.log('\nD: target-log-drift decomposition (deadline day / other days; applied terminal may retain a clamped remainder)');
for (const [f, r] of Object.entries(families)) console.log(`family ${f}: ${fmt(mean(r.deadlineDrift))} / ${fmt(mean(r.otherDrift))}`);
console.log('Terminal V is last observed, before any hidden timeout extrapolation; fizzle m_f uses its seeded closeout draw.');
console.log(`\n${failures ? `FAIL: ${failures} checks` : 'PASS: all valuation checks'}`);
process.exitCode = failures ? 1 : 0;
