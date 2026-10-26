#!/usr/bin/env node
/* ===================================================
   tools/valuation-test.mjs -- HCN valuation-layer gate
   (02a "The valuation layer").

   V = (1 - eta)*V_legible + eta*V_full, each V_x the
   survival-conditioned expected family mark under reader
   x's family head. Sections:
     A. Formula, marks, the pool, bounds, Classic inertia
     B. Singleton reset and clamped-gap convergence
     C. Real races: corruption, bounds, telescoping, day 0
     G. The stopped process (survival measure, family != 3):
        G1 calibration by V_x decile, per reader
        G2 fairness on each reader's own information
        G3 the pool's advantage (legible: gated; full: per act)
        G4 challengers on the full reader's terminal residual
     D. Diagnostics: gaps, reveals, conversion worlds apart,
        drift indicators (log returns of V net of spread)
     E. Terminal reconciliation, conversion, conservation
     F. Bit-identical race trajectories with valuation on/off

   Worlds run the reader's training loop (tools/reader-data.mjs:
   advanceRace + stepControlRegime + stepTreaty + checkResolution
   on the assumed input schedule), N per scenario. As for the
   reader, the legible gates run on the scenario mixture and the
   full and pooled gates per scenario. Every series is the stopped
   process: once a world ends (resolution or the term), V is its
   family mark m_f.

   Usage: node tools/valuation-test.mjs [N] [--seed S] [--validation]
          N defaults to 1000 per scenario; base seed 1. --validation
          runs the validation seeds (2,000,001+) and prints the
          challenger R² values the bound is set from.
   =================================================== */

import { createRaceState, advanceRace, stepControlRegime } from '../src/race/race-state.js';
import { stepTreaty } from '../src/race/treaty-track.js';
import { checkResolution, HORIZON } from '../src/race/resolution.js';
import { buildPublicView, initConsensus } from '../src/race/consensus.js';
import { belief, initBelief, stepBelief, familyHeads, binaryProb } from '../src/race/belief.js';
import { ruleSummary, recordFeatures, FEATURE_NAMES } from '../src/race/public-record.js';
import { readerFamily } from '../src/race/reader.js';
import {
    VALUATION_TUNING, familyMarks, valuationFromFamily, pooledValuation, computeValuation,
    initValuation, stepValuation, lastValuation, resetValuation,
} from '../src/race/valuation.js';
import { CLOSEOUT_TUNING, hcnTerminalMark, closeoutBook, closeoutUnitValue } from '../src/race/closeout.js';
import { PRESETS, STOCKBOND_SPREAD_PCT } from '../src/config.js';
import { inputSchedule } from './reader-data.mjs';

// ---- CLI + assertion plumbing ------------------------------------------
const argv = process.argv.slice(2);
let N = 1000, BASE_SEED = 1, VALIDATION = false;
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') BASE_SEED = parseInt(argv[++i], 10) >>> 0;
    else if (a === '--n' || a === '-n') N = parseInt(argv[++i], 10);
    else if (a === '--validation') VALIDATION = true;
    else if (/^\d+$/.test(a)) N = parseInt(a, 10);
    else throw new Error(`Unknown argument ${a}`);
}
if (VALIDATION) BASE_SEED = 2000001;
if (!Number.isInteger(N) || N < 1) throw new Error('N must be a positive integer');

// Bands. FAIR_BOUND, CAL_TOL and MIN_BIN are 02a's. The challenger R² bound is
// set on validation worlds (--validation, seeds 2,000,001+, N=1000 per scenario,
// reader schema 7, 2026-10-25): 1.25 x the largest world-bootstrap 97.5% endpoint
// of held-out R² among the three challengers and both scenarios (0.0061), rounded
// up to 0.001, floor 0.005 -> 0.008. The same construction as the reader's own
// challenger bound (tools/reader-fit-report.json).
// 02a "The valuation layer", "Known limit: V drifts predictably":
// both own-information fairness and pool-from-legible predictability use 0.03.
const CAL_TOL = 0.05, MIN_BIN = 200, FAIR_BOUND = 0.03;
const CHALLENGER_R2_BOUND = 0.008;

let failures = 0, pending = 0;
const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok, detail });
    if (!ok) failures++;
}
function pendingGate(name, detail) { results.push({ name, ok: null, detail }); pending++; }
const near = (a, b, tol = 1e-10) => Math.abs(a - b) < tol;
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const fmt = (x, d = 4) => Number.isFinite(x) ? x.toFixed(d) : '--';
const pct = (x) => (100 * x).toFixed(2) + '%';
function quantile(sorted, p) {
    if (!sorted.length) return NaN;
    const k = (sorted.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo);
}
const actOf = (rr) => rr <= 2 ? 0 : rr === 3 ? 1 : 2;
const ACTS = ['I', 'II', 'III'];
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

// ---- Linear algebra: ridge least squares on standardized columns ----------
function ridgeFit(X, y, lambdaRel = 1e-3) {
    const n = X.length, d = X[0].length;
    const mu = new Float64Array(d), sd = new Float64Array(d);
    for (const x of X) for (let j = 0; j < d; j++) mu[j] += x[j] / n;
    for (const x of X) for (let j = 0; j < d; j++) sd[j] += (x[j] - mu[j]) ** 2 / n;
    for (let j = 0; j < d; j++) sd[j] = sd[j] > 1e-18 ? Math.sqrt(sd[j]) : 0;
    const keep = [...Array(d).keys()].filter(j => sd[j] > 0);
    const k = keep.length + 1, A = Array.from({ length: k }, () => new Float64Array(k)), b = new Float64Array(k);
    const z = new Float64Array(k);
    for (let i = 0; i < n; i++) {
        z[0] = 1;
        for (let q = 0; q < keep.length; q++) { const j = keep[q]; z[q + 1] = (X[i][j] - mu[j]) / sd[j]; }
        for (let r = 0; r < k; r++) { b[r] += z[r] * y[i]; for (let c = 0; c <= r; c++) A[r][c] += z[r] * z[c]; }
    }
    for (let r = 0; r < k; r++) for (let c = r + 1; c < k; c++) A[r][c] = A[c][r];
    for (let r = 1; r < k; r++) A[r][r] += lambdaRel * n;
    // Gaussian elimination with partial pivoting.
    const M = A.map((row, r) => [...row, b[r]]);
    for (let c = 0; c < k; c++) {
        let p = c;
        for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        [M[c], M[p]] = [M[p], M[c]];
        const piv = M[c][c] || 1e-300;
        for (let r = c + 1; r < k; r++) { const f = M[r][c] / piv; if (f) for (let q = c; q <= k; q++) M[r][q] -= f * M[c][q]; }
    }
    const w = new Float64Array(k);
    for (let r = k - 1; r >= 0; r--) { let s = M[r][k]; for (let q = r + 1; q < k; q++) s -= M[r][q] * w[q]; w[r] = s / (M[r][r] || 1e-300); }
    return (x) => { let v = w[0]; for (let q = 0; q < keep.length; q++) { const j = keep[q]; v += w[q + 1] * (x[j] - mu[j]) / sd[j]; } return v; };
}
// World split: bit 1 of the world index, cross-fit both directions (as reader-metrics).
const sideOf = (row) => (row.wi >>> 1) & 1;
function crossFit(rows, xOf, yOf, lambdaRel) {
    const out = [];
    for (const held of [0, 1]) {
        const train = rows.filter(r => sideOf(r) !== held), test = rows.filter(r => sideOf(r) === held);
        if (train.length < 50 || !test.length) continue;
        const f = ridgeFit(train.map(xOf), train.map(yOf), lambdaRel);
        for (const r of test) out.push({ row: r, pred: f(xOf(r)), y: yOf(r) });
    }
    return out;
}
// A placebo: the same regression with increments permuted across worlds, the
// noise floor a mean |predicted increment| should be read against.
function permuted(rows, yOf, seed) {
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const ys = rows.map(yOf), idx = rows.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return rows.map((r, i) => ({ ...r, _perm: ys[idx[i]] }));
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

// ---- C/G/D. The ensemble -------------------------------------------------
const SCENARIOS = ['neutral', 'markov'];
const t0 = Date.now();
const gaps = [], day0 = [];
const rows = [];       // every 21-day snapshot while live
const worlds = [];     // per-world terminal record
let boundsOK = true, telescopeOK = true, resolvedOK = true;
const LEG = FEATURE_NAMES.family.legible.length;

/** One world on the reader's loop (mirrors tools/reader-data.mjs runReaderWorld,
 *  with the inputs handed to stepBelief so B's record carries them). */
function runWorld(seed, scenario, wi, perDay = null, feed = null) {
    const race = createRaceState(seed), schedule = inputSchedule(seed, scenario);
    initConsensus(race); initBelief(race); initValuation(race);
    const V0 = lastValuation();
    let inputs = null, product = 1, endDay = null;
    const snaps = [], Vs = [V0];
    const take = () => {
        const h = familyHeads(), rule = ruleSummary(belief.rungs, belief.day);
        const VL = valuationFromFamily(h.legible), VF = valuationFromFamily(h.full);
        const quotes = [2, 3, 4, 5].map(R => binaryProb(R, { 2: 420, 3: 756, 4: 880, 5: 1000 }[R]));
        snaps.push({ wi, seed, scenario, day: race.day, act: actOf(belief.record.snapshot.view.releasedFrontierRung),
            regime: race.controlRegime, VL, VF, V: pooledValuation(h), eta: h.eta, quotes,
            xL: recordFeatures(belief.record, 'legible', rule, 'family'),
            xF: recordFeatures(belief.record, 'full', rule, 'family') });
    };
    if (!perDay) take();
    for (let d = 0; d < HORIZON && !race.resolution; d++) {
        inputs = schedule();
        advanceRace(race, { straitTension: inputs.straitTension, exportControlStage: inputs.exportControlStage });
        stepControlRegime(race); stepTreaty(race, { treatyStage: inputs.treatyStage });
        // The corruption probe feeds the same corrupted copy to the belief step and
        // to the valuation step, so a hidden read in either would show.
        const seen = feed ? feed(race) : race;
        stepBelief(seen, inputs);
        const { V, ratio } = stepValuation(seen);
        if (perDay) perDay(V);
        else {
            boundsOK &&= V >= 0.35 - 1e-12 && V <= 1.60 + 1e-12 && ratio >= T.ratioMin && ratio <= T.ratioMax;
            product *= ratio; gaps.push(Math.abs(Math.log(ratio))); Vs.push(lastValuation());
            if (race.day % 21 === 0) take();
        }
        if (checkResolution(race, inputs.geo)) { endDay = race.day; break; }
    }
    if (!race.resolution) { checkResolution(race, inputs?.geo); endDay = HORIZON; }
    return { race, V0, product, endDay, snaps, VT: lastValuation() };
}

for (const scenario of SCENARIOS) {
    for (let i = 0; i < N; i++) {
        const seed = (BASE_SEED + i) >>> 0, wi = i;
        const w = runWorld(seed, scenario, wi);
        resolvedOK &&= !!w.race.resolution;
        if (!w.race.resolution) continue;
        telescopeOK &&= near(w.V0 * w.product, w.VT, 1e-9);
        if (scenario === 'neutral') day0.push(w.V0);
        // m_f is the realized terminal multiple the closeout pays (the fizzle's seeded
        // draw; family 3's doom recovery, outside the survival measure).
        const fam = w.race.resolution.family, mf = hcnTerminalMark(fam, 'private', w.race, 1, 1).mark;
        const conversion = ['nationalized', 'classified'].includes(w.race.resolution.axes.politicalControl);
        worlds.push({ wi, seed, scenario, fam, mf, conversion, V0: w.V0, VT: w.VT, endDay: w.endDay,
            reveal: mf / w.VT });
        // The stopped process: V_x at t + 63 is the next live snapshot's, or m_f once the world has ended.
        const byDay = new Map(w.snaps.map(s => [s.day, s]));
        for (const s of w.snaps) {
            const nx = s.day + 63 < w.endDay ? byDay.get(s.day + 63) : null;
            const prev = byDay.get(s.day - 63) || null;
            rows.push({ ...s, fam, mf, conversion, survive: fam !== 3,
                dL: (nx ? nx.VL : mf) - s.VL, dF: (nx ? nx.VF : mf) - s.VF, dV: (nx ? nx.V : mf) - s.V, ends: !nx,
                prevV: prev ? prev.V : s.V, prevQuotes: prev ? prev.quotes : s.quotes });
        }
    }
}
const ensembleSeconds = (Date.now() - t0) / 1000;

// Corruption: the same worlds, with stepBelief fed a corrupted copy every day.
let corruptionOK = true, probeDays = 0;
for (let i = 0; i < Math.min(N, 6); i++) {
    const seed = (BASE_SEED + 9100 + i) >>> 0;
    const clean = [], dirty = [];
    runWorld(seed, i % 2 ? 'markov' : 'neutral', i, V => clean.push(V));
    runWorld(seed, i % 2 ? 'markov' : 'neutral', i, V => dirty.push(V), race => { const c = copy(race); corruptLatent(c); return c; });
    corruptionOK &&= clean.length === dirty.length && clean.every((v, k) => v === dirty[k]);
    probeDays += clean.length;
}

check('C: corruption leaves V bit-identical', corruptionOK, `${probeDays} days`);
check('C: V in [0.35, 1.60] and the daily ratio inside its clamp', boundsOK);
check('C: applied gaps telescope to the terminal level', telescopeOK);
check('C: all races resolve', resolvedOK);

// ---- G. The stopped process ------------------------------------------------
const surv = rows.filter(r => r.survive);
const sets = { legible: 'VL', full: 'VF', pooled: 'V' };
const scopes = (set) => set === 'legible' ? [['mixture', surv]] : SCENARIOS.map(sc => [sc, surv.filter(r => r.scenario === sc)]);

// G1 calibration: equal-count deciles of V_x; bins of >= MIN_BIN samples are gated.
const calReport = {};
for (const set of ['legible', 'full', 'pooled']) for (const [scope, sub] of scopes(set)) {
    const key = sets[set], sorted = [...sub].sort((a, b) => a[key] - b[key]), bins = [];
    for (let b = 0; b < 10; b++) {
        const cell = sorted.slice(Math.floor(b * sorted.length / 10), Math.floor((b + 1) * sorted.length / 10));
        bins.push({ n: cell.length, V: mean(cell.map(r => r[key])), mf: mean(cell.map(r => r.mf)) });
    }
    const gated = bins.filter(b => b.n >= MIN_BIN), worst = Math.max(...gated.map(b => Math.abs(b.mf - b.V)));
    calReport[`${set}/${scope}`] = bins;
    const ok = gated.length > 0 && worst <= CAL_TOL;
    (set === 'pooled' ? (name, okk, det) => results.push({ name, ok: okk, detail: det, diag: true }) : check)(
        `G1: calibration ${set} (${scope}): |mean m_f - mean V| <= ${CAL_TOL} in every decile of >= ${MIN_BIN}`,
        ok, `worst ${fmt(worst)} over ${gated.length} bins, n=${sub.length}`);
}

// G2 fairness on own information: increments regressed on what the reader saw.
const ownX = {
    legible: r => [r.VL, ...r.xL],
    full: r => [r.VF, ...r.xF, r.VF - r.VL, ...r.quotes, ...r.prevQuotes, r.prevV],
};
const fairReport = {};
for (const set of ['legible', 'full']) for (const [scope, sub] of scopes(set)) {
    const dKey = set === 'legible' ? 'dL' : 'dF';
    const fit = crossFit(sub, ownX[set], r => r[dKey]);
    const mabs = mean(fit.map(f => Math.abs(f.pred)));
    const perm = permuted(sub, r => r[dKey], 77 + (set === 'full' ? 1 : 0));
    const placebo = mean(crossFit(perm, ownX[set], r => r._perm).map(f => Math.abs(f.pred)));
    fairReport[`${set}/${scope}`] = { mabs, placebo, cells: {},
        split: ACTS.map((_, a) => [false, true].map(e => { const g = fit.filter(f => f.row.act === a && f.row.ends === e); return { n: g.length, pred: mean(g.map(f => Math.abs(f.pred))), mean: mean(g.map(f => f.y)) }; })) };
    const key = sets[set], sorted = [...sub].sort((a, b) => a[key] - b[key]);
    const decile = new Map(sorted.map((r, k) => [r, Math.min(9, Math.floor(10 * k / sorted.length))]));
    for (const r of sub) {
        const c = `${ACTS[r.act]}/${decile.get(r)}`, cell = fairReport[`${set}/${scope}`].cells[c] || (fairReport[`${set}/${scope}`].cells[c] = { n: 0, s: 0 });
        cell.n++; cell.s += r[dKey];
    }
    check(`G2: fairness ${set} (${scope}): held-out mean |predicted 63-day increment| <= ${FAIR_BOUND}`,
        mabs <= FAIR_BOUND, `${fmt(mabs)} (placebo ${fmt(placebo)}), n=${sub.length}`);
}

// G3 the pool's advantage: pooled increments on the legible information (gated) and
// on the full reader's (the designed edge, reported per act).
const poolReport = {};
for (const [scope, sub] of [['mixture', surv], ...SCENARIOS.map(sc => [sc, surv.filter(r => r.scenario === sc)])]) {
    const legX = r => [r.V, r.VL, ...r.xL];
    const legFit = crossFit(sub, legX, r => r.dV);
    const placebo = mean(crossFit(permuted(sub, r => r.dV, 91), legX, r => r._perm).map(f => Math.abs(f.pred)));
    const fullFit = crossFit(sub, r => [r.V, r.VF, r.VF - r.V, ...r.xF], r => r.dV);
    const perAct = ACTS.map((_, a) => mean(fullFit.filter(f => f.row.act === a).map(f => Math.abs(f.pred))));
    const gap = ACTS.map((_, a) => mean(sub.filter(r => r.act === a).map(r => r.VF - r.V)));
    poolReport[scope] = { legible: mean(legFit.map(f => Math.abs(f.pred))), placebo, full: mean(fullFit.map(f => Math.abs(f.pred))), perAct, gap };
    if (scope === 'mixture') check(`G3: pooled increments not predictable from the legible information (mixture): mean |pred| <= ${FAIR_BOUND}`,
        poolReport[scope].legible <= FAIR_BOUND, `${fmt(poolReport[scope].legible)} (placebo ${fmt(placebo)})`);
}

// G4 challengers on the full reader's terminal residual m_f - V_full,t.
function challengers(sub) {
    const names = FEATURE_NAMES.family.full, out = { pairwise: [], claimAgeSplines: [], nearestNeighbours: [] };
    for (const held of [0, 1]) {
        const train = sub.filter(r => sideOf(r) !== held), test = sub.filter(r => sideOf(r) === held);
        if (train.length < 100 || !test.length) continue;
        const res = r => r.mf - r.VF, d = names.length, mu = new Float64Array(d), sd = new Float64Array(d), cov = new Float64Array(d);
        for (const r of train) for (let j = 0; j < d; j++) mu[j] += r.xF[j] / train.length;
        for (const r of train) for (let j = 0; j < d; j++) { sd[j] += (r.xF[j] - mu[j]) ** 2 / train.length; cov[j] += (r.xF[j] - mu[j]) * res(r); }
        for (let j = 0; j < d; j++) sd[j] = Math.max(1e-6, Math.sqrt(sd[j]));
        const ids = [...Array(d).keys()].sort((a, b) => Math.abs(cov[b] / sd[b]) - Math.abs(cov[a] / sd[a]) || a - b).slice(0, 12);
        const z = (r, j) => Math.max(-4, Math.min(4, (r.xF[j] - mu[j]) / sd[j]));
        const pair = r => { const v = ids.map(j => z(r, j)), x = [...v]; for (let a = 0; a < v.length; a++) for (let b = 0; b <= a; b++) x.push(v[a] * v[b]); return x; };
        const ageIds = names.map((n, j) => n.includes('.claimAge') ? j : -1).filter(j => j >= 0);
        const spline = r => [...ids.map(j => z(r, j)), ...ageIds.flatMap(j => [21, 63, 126, 252].map(k => Math.max(0, r.xF[j] - k / 252)))];
        const fP = ridgeFit(train.map(pair), train.map(res), 2e-3), fS = ridgeFit(train.map(spline), train.map(res), 2e-3);
        const step = Math.max(1, Math.floor(train.length / 128)), anchors = [];
        for (let k = 0; k < train.length && anchors.length < 128; k += step) anchors.push({ z: ids.slice(0, 8).map(j => z(train[k], j)), e: res(train[k]) });
        const knn = r => {
            const q = ids.slice(0, 8).map(j => z(r, j));
            const ds = anchors.map((a, i) => ({ i, d: a.z.reduce((s, v, k) => s + (v - q[k]) ** 2, 0) })).sort((a, b) => a.d - b.d || a.i - b.i);
            return 0.5 * mean(ds.slice(0, 16).map(x => anchors[x.i].e));
        };
        for (const r of test) {
            out.pairwise.push({ r, p: fP(pair(r)) }); out.claimAgeSplines.push({ r, p: fS(spline(r)) }); out.nearestNeighbours.push({ r, p: knn(r) });
        }
    }
    const rep = {};
    for (const [name, a] of Object.entries(out)) {
        const e0 = a.map(x => x.r.mf - x.r.VF), sse0 = e0.reduce((s, v) => s + v * v, 0), sse1 = a.reduce((s, x) => s + (x.r.mf - x.r.VF - x.p) ** 2, 0);
        const groups = {};
        for (const key of ['act', 'regime']) groups[key] = Object.fromEntries([...new Set(a.map(x => x.r[key]))].sort().map(v => {
            const g = a.filter(x => x.r[key] === v);
            return [key === 'act' ? ACTS[v] : v, { n: g.length, bias: mean(g.map(x => x.r.mf - x.r.VF - x.p)), baselineBias: mean(g.map(x => x.r.mf - x.r.VF)) }];
        }));
        // World bootstrap of the held-out R² (resampling worlds, never snapshots).
        const byW = new Map();
        for (const x of a) { const g = byW.get(x.r.wi) || [0, 0]; g[0] += (x.r.mf - x.r.VF) ** 2; g[1] += (x.r.mf - x.r.VF - x.p) ** 2; byW.set(x.r.wi, g); }
        const W = [...byW.values()], est = [];
        let s = 12345;
        const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
        for (let b = 0; b < 200 && W.length; b++) { let s0 = 0, s1 = 0; for (let k = 0; k < W.length; k++) { const g = W[Math.floor(rnd() * W.length)]; s0 += g[0]; s1 += g[1]; } est.push(s0 > 0 ? 1 - s1 / s0 : 0); }
        est.sort((x, y) => x - y);
        rep[name] = { r2: sse0 > 0 ? 1 - sse1 / sse0 : 0, hi: est.length ? est[Math.floor(0.975 * est.length)] : NaN, n: a.length, groups };
    }
    return rep;
}
const chalReport = {};
for (const sc of SCENARIOS) {
    chalReport[sc] = challengers(surv.filter(r => r.scenario === sc));
    for (const [name, r] of Object.entries(chalReport[sc])) {
        if (CHALLENGER_R2_BOUND == null) pendingGate(`G4: challenger ${name} (${sc}) held-out R² <= bound`, `R² ${fmt(r.r2)} (n=${r.n}); bound set on validation`);
        else check(`G4: challenger ${name} (${sc}) held-out R² <= ${CHALLENGER_R2_BOUND}`, r.r2 <= CHALLENGER_R2_BOUND, `R² ${fmt(r.r2)} (n=${r.n})`);
    }
}

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
console.log(`\nValuation layer: N=${N} per scenario, base seed=${BASE_SEED}${VALIDATION ? ' (validation)' : ''}, ensemble ${ensembleSeconds.toFixed(1)}s`);
for (const r of results) console.log(`${r.ok === null ? 'PEND' : r.diag ? (r.ok ? 'DIAG' : 'DIAG*') : r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);

console.log('\nG1: calibration by decile (n / mean V / mean m_f)');
for (const [k, bins] of Object.entries(calReport)) console.log(`  ${k.padEnd(18)} ${bins.map(b => `${b.n}:${fmt(b.V, 3)}/${fmt(b.mf, 3)}`).join('  ')}`);
console.log('\nG2: mean increment by (act, decile) cell, n >= 50 (own reader)');
for (const [k, r] of Object.entries(fairReport)) {
    const cells = Object.entries(r.cells).filter(([, c]) => c.n >= 50).sort().map(([c, v]) => `${c}:${fmt(v.s / v.n, 3)}`);
    console.log(`  ${k.padEnd(18)} ${cells.join(' ')}`);
}
console.log('\nG2: held-out mean |predicted| by act, live at t+63 | ending inside the window (n, mean realized increment)');
for (const [k, r] of Object.entries(fairReport)) console.log(`  ${k.padEnd(18)} ${r.split.map((pair, a) => `${ACTS[a]}: ${pair.map(c => `${fmt(c.pred, 3)} (${c.n}, ${fmt(c.mean, 3)})`).join(' | ')}`).join('   ')}`);
console.log('\nG3: the pool\'s increments, mean |predicted| (legible info | full info), and the mean full-minus-pool gap per act');
for (const [k, r] of Object.entries(poolReport)) console.log(`  ${k.padEnd(10)} legible ${fmt(r.legible)}  full ${fmt(r.full)}  per act ${r.perAct.map(fmt).join('/')}  gap ${r.gap.map(v => fmt(v, 3)).join('/')}`);
console.log('\nG4: challengers on m_f - V_full (held-out R², subgroup residual bias after / before)');
for (const [sc, rep] of Object.entries(chalReport)) for (const [name, r] of Object.entries(rep)) {
    const g = Object.entries(r.groups).map(([key, vals]) => `${key}[${Object.entries(vals).map(([v, x]) => `${v}:${fmt(x.bias, 3)}/${fmt(x.baselineBias, 3)}`).join(' ')}]`).join(' ');
    console.log(`  ${sc.padEnd(8)} ${name.padEnd(18)} R² ${fmt(r.r2)} (world-bootstrap 97.5% ${fmt(r.hi)})  ${g}`);
}
if (VALIDATION) {
    const top = Math.max(...Object.values(chalReport).flatMap(rep => Object.values(rep).map(r => r.hi)));
    console.log(`\nVALIDATION challenger R² bound = max(0.005, ceil_0.001(1.25 x ${fmt(top)})) = ${Math.max(0.005, Math.ceil(1.25 * top * 1000) / 1000)}`);
}

gaps.sort((a, b) => a - b);
console.log('\nD: daily |log ratio| (all observed days)');
console.log(`  days=${gaps.length}; mean=${fmt(mean(gaps), 5)}; p50=${fmt(quantile(gaps, 0.5), 5)}; p95=${fmt(quantile(gaps, 0.95), 5)}; p99=${fmt(quantile(gaps, 0.99), 5)}; max=${fmt(gaps[gaps.length - 1], 5)}; share > 2% ${pct(gaps.filter(v => v > Math.log(1.02)).length / gaps.length)}`);
console.log(`  day-0 V (neutral): mean ${fmt(mean(day0))}, min ${fmt(Math.min(...day0))}, max ${fmt(Math.max(...day0))}`);
console.log('\nD: terminal reveal m_f / V_T by family (median; conversion worlds apart)');
for (const f of [1, 2, 3, 4, 5, 6]) {
    const a = worlds.filter(w => w.fam === f && !w.conversion).map(w => w.reveal).sort((x, y) => x - y);
    const c = worlds.filter(w => w.fam === f && w.conversion).map(w => w.reveal).sort((x, y) => x - y);
    console.log(`  family ${f}: n ${String(a.length).padEnd(5)} median ${fmt(quantile(a, 0.5), 3)}   conversion n ${String(c.length).padEnd(4)} median ${fmt(quantile(c, 0.5), 3)} (hypothetical family factor)`);
}
{
    const conv = surv.filter(r => r.conversion);
    console.log(`  conversion-world snapshots (survival): ${conv.length}; mean m_f - V_full ${fmt(mean(conv.map(r => r.mf - r.VF)), 3)}, m_f - V ${fmt(mean(conv.map(r => r.mf - r.V)), 3)}`);
}
// Drift indicators (diagnostic): log returns of HCN's valuation component, net of
// the stock spread only. No margin, liquidation, borrow, conversion or position
// accounting: these say whether V drifts predictably, not what a book would earn.
// HCN's own drift and noise sit outside V; the closeout pays spot*m_f/V_T.
{
    const dyn = PRESETS[5], spread = STOCKBOND_SPREAD_PCT;
    const nonConv = worlds.filter(w => !w.conversion);
    const longR = nonConv.map(w => Math.log(w.mf / w.V0) - 2 * spread);
    const shortR = nonConv.map(w => -Math.log(w.mf / w.V0) - 2 * spread);
    console.log(`\nD: drift indicators, log return of V over the run net of spread ${spread} (${nonConv.length} non-conversion worlds; no margin, liquidation, borrow or conversion)`);
    console.log(`  long  mean log ${fmt(mean(longR))}  short mean log ${fmt(mean(shortR))}  (excludes HCN drift mu=${dyn.mu})`);
    const trades = rows.filter(r => !r.conversion && r.day % 63 === 0);
    const gapT = trades.map(r => {
        const s = Math.sign(r.VF - r.V), nxt = r.V + r.dV;
        return { act: r.act, r: s ? s * Math.log(nxt / r.V) - 2 * spread : 0, s };
    }).filter(t => t.s);
    console.log(`  legible-full gap indicator (sign(V_full - V), 63 days, at locks, net of spread): ${gapT.length} quarters, mean log ${fmt(mean(gapT.map(t => t.r)))}, per act ${ACTS.map((_, a) => fmt(mean(gapT.filter(t => t.act === a).map(t => t.r)))).join('/')}`);
}
console.log(`\n${failures ? `FAIL: ${failures} checks` : 'PASS: all valuation checks'}${pending ? ` (${pending} pending a validation band)` : ''}`);
process.exitCode = failures ? 1 : 0;
