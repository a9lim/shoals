#!/usr/bin/env node
/* ===================================================
   tools/forecast-test.mjs -- Calibration and reachability
   harness for the player's posterior (02a "Belief, η, and
   the firm": the posterior, locks, scoring, K_CRED;
   src/race/belief.js).

   Each world runs the reader's loop (advanceRace,
   stepControlRegime, stepTreaty, stepBelief with the assumed
   input schedule's inputs, checkResolution), N per scenario.
   Pass 1 records the world's certification days (the truth the
   oracle and the informed player are handed; it exists only
   inside this harness). Pass 2 replays the same seed
   bit-identically and runs every synthetic player through the
   REAL API: on each lock day the player's store is installed as
   `belief.player`, the closing quarter is scored (scoreQuarter),
   and, unless the world resolved that day, the new lock is
   recorded (lockForecast). At the terminal the outstanding
   quarter is scored (scoreOutstandingQuarter).

   Players:
     market      a market-policy lock every quarter (pP === pM)
     reader      the full reader's quarter probabilities, scored
                 against the pM B stores at each lock (outside the
                 player store: no curve in the family carries them)
     oracle      m_R = the true certification day (2016 if none), w 30, q 0
     informed    halfway between B's projection and the truth
                 (w = 0.7*w_B; q halfway to the truth's plateau): diagnostic
     earlier     the "earlier than the market" preset every quarter
     later       the "later than the market" preset every quarter
     projection  B's projection, locked as drawn every quarter

   Checks:
   A. Market-policy copier: every increment exactly 0; its
      playerPilled is marketPilled on every lock day; every
      synthetic lock is valid.
   B. Properness (02a) with the plateau: analytic per quarter and
      Monte Carlo over a full term with common random numbers.
   C. Calibration targets at the module's K_CRED (02a):
        - the reader-copier clears the memo gate by day 882 in at
          least half of worlds (this target sets K_CRED);
        - no static preset earns positive mean skill (<= +0.05 nats
          per run) or clears the memo gate by day 882 in more than
          10% of worlds;
        - the oracle earns more mean skill than the reader-copier
          (its fund-by-756 rate is reported);
        - the market-policy player stays at 0 (S_P and sigma0).
      sigma0 is reported for every player; no gate reads it.
   D. The real predicates (canSendMemos, canActAsFund with F stubbed
      at 100) agree with the recorded paths on every lock day.

   Usage:  node tools/forecast-test.mjs [N] [--seed S] [--calibrate]
           N defaults to 500 per scenario; base seed 1.
           --calibrate runs the validation seeds (2,000,001+) and
           sweeps K over the recorded paths; no gates.
   =================================================== */

import { createRaceState, advanceRace, stepControlRegime } from '../src/race/race-state.js';
import { stepTreaty } from '../src/race/treaty-track.js';
import { checkResolution } from '../src/race/resolution.js';
import { initConsensus } from '../src/race/consensus.js';
import {
    belief, initBelief, stepBelief, binaryProb, certDay, isLockDay, LOCK_INTERVAL, POSTERIOR,
    lockForecast, scoreQuarter, scoreOutstandingQuarter, quarterProb, crossingProb, logScoreDelta,
    presetCurves, marketCurves, normalizeCurves, forecastRecord, forecastTuning,
    credibility, canSendMemos, canActAsFund, playerPilled, marketPilled, latestLock, scoreVariance,
} from '../src/race/belief.js';
import { ruleSummary } from '../src/race/public-record.js';
import { readerLaw, lawQuarter } from '../src/race/reader.js';
import { createRng } from '../src/race/rng.js';
import { inputSchedule } from './reader-data.mjs';

// ---- CLI -----------------------------------------------------------------

const argv = process.argv.slice(2);
let N = 500, BASE_SEED = 1, CALIBRATE = false;
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') BASE_SEED = parseInt(argv[++i], 10) >>> 0;
    else if (a === '--n' || a === '-n') N = parseInt(argv[++i], 10);
    else if (a === '--calibrate') CALIBRATE = true;
    else if (/^\d+$/.test(a)) N = parseInt(a, 10);
    else throw new Error(`Unknown argument ${a}`);
}
if (CALIBRATE) BASE_SEED = 2000001;
const HORIZON = 1008;
const NONE = 2016;                       // the oracle's target for a rung that never certifies
const MEMO_GATE = 0.55, FUND_GATE = 0.65;   // 02a, mirrored from belief.js for the K sweep
const FUND_BY = 756, MEMO_BY = 882;
const REPORT_DAYS = [350, 700, 882];
const SCENARIOS = ['neutral', 'markov'];
const clampP = (p) => Math.min(0.98, Math.max(0.02, p));

// ---- Assertion plumbing --------------------------------------------------

let failures = 0;
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok, detail, diag: false }); if (!ok) failures++; }
function diag(name, ok, detail = '') { results.push({ name, ok, detail, diag: true }); }
const line = (s = '') => console.log(s);
const pct = (x) => (100 * x).toFixed(1) + '%';
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : ' -- ');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : ' -- ');
function quantile(arr, p) {
    if (!arr.length) return NaN;
    const s = [...arr].sort((a, b) => a - b);
    const idx = p * (s.length - 1), lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

// ---- The players ---------------------------------------------------------

const truthOf = (truth, R) => (truth[R] != null ? truth[R] : NONE);
// Locking players: curves (own policy) or 'market' (market policy).
const PLAYERS = {
    market: () => 'market',
    oracle: (truth) => normalizeCurves(Object.fromEntries([2, 3, 4, 5].map(R => [R, { m: truthOf(truth, R), w: 30, q: 0 }]))),
    informed: (truth) => {
        const mk = marketCurves();
        return normalizeCurves(Object.fromEntries([2, 3, 4, 5].map(R => [R, {
            m: 0.5 * (mk[R].m + truthOf(truth, R)), w: 0.7 * mk[R].w, q: 0.5 * (mk[R].q + (truth[R] != null ? 0 : POSTERIOR.Q_MAX)),
        }])));
    },
    earlier: () => presetCurves('earlier'),
    later: () => presetCurves('later'),
    projection: () => presetCurves('market'),
};
const NAMES = Object.keys(PLAYERS);
const ALL = ['reader', ...NAMES];

/** A gate at K on one path point: credibility tanh(S/K) above it (02a). */
const gateAt = (p, gate, K) => Math.tanh(p.S / K) > gate;

/** A blank player store, shaped like belief.js's own (_freshPlayer). */
const freshStore = () => ({ draft: marketCurves(), locks: [], scores: [], S: 0, var0: 0, credibility: 0, lastLockDay: null });

// ---- The worlds ----------------------------------------------------------

/** Pass 1: the world's certification days R2-R4 within the term (the record's
 *  predicate: any frontier lab, direct or implied), on the reader's loop. */
function truthOfWorld(seed, scenario) {
    const race = createRaceState(seed), sched = inputSchedule(seed, scenario);
    let inputs = null;
    for (let d = 0; d < HORIZON && !race.resolution; d++) {
        inputs = sched();
        advanceRace(race, { straitTension: inputs.straitTension, exportControlStage: inputs.exportControlStage });
        stepControlRegime(race); stepTreaty(race, { treatyStage: inputs.treatyStage });
        if (checkResolution(race, inputs.geo)) break;
    }
    if (!race.resolution) checkResolution(race, inputs?.geo);
    const out = {};
    for (const R of [2, 3, 4]) {
        let m = null;
        for (const id of ['halcyon', 'tianxia', 'polaris']) { const c = race.capability.labs[id].rungCertified[R]; if (c != null && (m == null || c < m)) m = c; }
        if (m != null && m <= HORIZON) out[R] = m;
    }
    return out;
}

const worlds = [];
let copierExactOK = true, copierPilledOK = true, lockRejected = 0;
let copierDetail = '', pilledDetail = '', predicateOK = true, predicateDetail = '';
for (const scenario of SCENARIOS) for (let i = 0; i < N; i++) {
    const seed = (BASE_SEED + i) >>> 0;
    const truth = truthOfWorld(seed, scenario);
    // Pass 2: the same seed, bit-identical, with every player on the real API.
    const race = createRaceState(seed), sched = inputSchedule(seed, scenario);
    initConsensus(race); initBelief(race);
    const stores = Object.fromEntries(NAMES.map(n => [n, freshStore()]));
    const path = Object.fromEntries(ALL.map(n => [n, []]));      // per lock day: { day, S, v (sigma0^2) }
    const reader = { S: 0, var0: 0, lock: null, scores: [] };
    const readerScore = (to, cdOf) => {
        const L = reader.lock;
        if (!L) return;
        const rungs = [];
        for (const R of [2, 3, 4]) {
            const pr = L.pairs[R];
            if (!pr) continue;
            const cd = cdOf(R), o = cd != null && cd > L.day && cd <= to ? 1 : 0;
            rungs.push({ R, o, delta: logScoreDelta(pr.pP, pr.pM, o), v: scoreVariance(pr.pP, pr.pM) });
        }
        const delta = rungs.reduce((a, r) => a + r.delta, 0);
        reader.S += delta; reader.var0 += rungs.reduce((a, r) => a + r.v, 0);
        reader.scores.push({ from: L.day, to, rungs, delta });
        reader.lock = null;
    };
    const record = (n, day, S, v) => path[n].push({ day, S, v });
    const scoreDay = (day) => {
        for (const n of NAMES) {
            belief.player = stores[n];
            scoreQuarter(day);
            record(n, day, stores[n].S, stores[n].var0);
            // The module's own predicates against the path's, at the module's K.
            const memo = gateAt(path[n].at(-1), MEMO_GATE, forecastTuning.K_CRED);
            const fund = gateAt(path[n].at(-1), FUND_GATE, forecastTuning.K_CRED);
            if (canSendMemos() !== memo || canActAsFund(100) !== fund) {
                if (predicateOK) predicateDetail = `${n} seed ${seed} day ${day}`;
                predicateOK = false;
            }
        }
        readerScore(day, certDay);
        record('reader', day, reader.S, reader.var0);
    };
    const lockDay = (day) => {
        for (const n of NAMES) {
            belief.player = stores[n];
            const c = PLAYERS[n](truth);
            if (!(c === 'market' ? lockForecast(day, null, 'market') : lockForecast(day, c))) lockRejected++;
            if (n === 'market' && playerPilled() !== marketPilled()) {
                if (copierPilledOK) pilledDetail = `seed ${seed} day ${day}: ${playerPilled()} vs ${marketPilled()}`;
                copierPilledOK = false;
            }
        }
        // The reader-copier's pairs: the full reader's quarter probability, B's stored pM.
        const rule = ruleSummary(belief.rungs, day), pairs = {};
        for (const R of [2, 3, 4]) {
            if (certDay(R) != null) continue;
            pairs[R] = { pP: clampP(lawQuarter(readerLaw(belief.record, R, 'full', rule), day)), pM: clampP(binaryProb(R, day + LOCK_INTERVAL)) };
        }
        reader.lock = { day, pairs };
    };
    for (const n of ALL) record(n, 0, 0, 0);
    lockDay(0);
    let inputs = null, endDay = HORIZON;
    for (let d = 0; d < HORIZON && !race.resolution; d++) {
        inputs = sched();
        advanceRace(race, { straitTension: inputs.straitTension, exportControlStage: inputs.exportControlStage });
        stepControlRegime(race); stepTreaty(race, { treatyStage: inputs.treatyStage });
        stepBelief(race, inputs);
        const lock = isLockDay(race.day);
        if (lock) scoreDay(race.day);
        // The resolving day's lock dispatch is discarded by the terminal latch.
        if (checkResolution(race, inputs.geo)) { endDay = race.day; break; }
        if (lock && race.day < HORIZON) lockDay(race.day);
    }
    if (!race.resolution) checkResolution(race, inputs?.geo);
    // The outstanding quarter at the terminal (scores, but unlocks nothing).
    for (const n of NAMES) { belief.player = stores[n]; scoreOutstandingQuarter(race); }
    readerScore(reader.lock ? reader.lock.day + LOCK_INTERVAL : 0, (R) => {
        let m = null;
        for (const id of ['halcyon', 'tianxia', 'polaris']) { const c = race.capability.labs[id].rungCertified[R]; if (c != null && (m == null || c < m)) m = c; }
        return m;
    });
    for (const q of stores.market.scores) {
        if (q.delta !== 0 || q.rungs.some(r => r.delta !== 0)) {
            if (copierExactOK) copierDetail = `seed ${seed} quarter to ${q.to}: ${q.delta}`;
            copierExactOK = false;
        }
    }
    const certBy = (day) => [2, 3, 4].some(R => truth[R] != null && truth[R] <= day);
    const finalS = Object.fromEntries(NAMES.map(n => [n, stores[n].S]));
    finalS.reader = reader.S;
    const finalV = Object.fromEntries(NAMES.map(n => [n, stores[n].var0]));
    finalV.reader = reader.var0;
    worlds.push({ seed, scenario, truth, path, endDay, finalS, finalV, scores: Object.fromEntries(NAMES.map(n => [n, stores[n].scores])), readerScores: reader.scores, qualifies: certBy(FUND_BY) });
}
belief.player = null;

// The gates read off a path at K: crossed at a lock day on or before `by` (scores
// after the terminal unlock nothing).
const crossesBy = (path, gate, by, K) => path.some(p => p.day <= by && gateAt(p, gate, K));
const memoFrac = (n, K, ws = worlds) => mean(ws.map(w => +crossesBy(w.path[n], MEMO_GATE, MEMO_BY, K)));
const fundFrac = (n, K, ws = worlds.filter(w => w.qualifies)) => mean(ws.map(w => +crossesBy(w.path[n], FUND_GATE, FUND_BY, K)));
const PRESETS = ['earlier', 'later', 'projection'];
/** World-bootstrap standard error of a per-world 0/1 rate. */
function rateSE(n, K, gate = MEMO_GATE, by = MEMO_BY, ws = worlds) {
    const rng = createRng(4242), est = [];
    for (let b = 0; b < 200; b++) { let s = 0; for (let i = 0; i < ws.length; i++) s += +crossesBy(ws[rng.int(ws.length)].path[n], gate, by, K); est.push(s / ws.length); }
    const m = mean(est); return Math.sqrt(est.reduce((a, x) => a + (x - m) ** 2, 0) / (est.length - 1));
}
/** Per-player summary: final S_P mean / p50 / p90, sigma0 mean / p10 / p50 / p90. */
function playerStats() {
    for (const n of ALL) {
        const S = worlds.map(w => w.finalS[n]), sg = worlds.map(w => Math.sqrt(w.finalV[n]));
        line(`  ${n.padEnd(11)} S_P ${f3(mean(S))} / ${f3(quantile(S, 0.5))} / ${f3(quantile(S, 0.9))}   sigma0 ${f3(mean(sg))} / ${f3(quantile(sg, 0.1))} / ${f3(quantile(sg, 0.5))} / ${f3(quantile(sg, 0.9))}   P(S>0) ${pct(mean(S.map(x => +(x > 0))))}`);
    }
}

// ---- K_CRED calibration (validation seeds) ---------------------------------

if (CALIBRATE) {
    // 02a: the largest K (0.05 grid) at which the reader-copier clears memo by day
    // 882 in half of worlds with two world-bootstrap standard errors to spare.
    line(`K_CRED calibration: validation seeds ${BASE_SEED}.., N=${N} per scenario (${worlds.length} worlds)`);
    line('  K      reader memo by 882     earlier / later / projection memo   oracle fund by 756');
    let chosen = null;
    for (let k = 0.30; k <= 3.0001; k += 0.05) {
        const K = Math.round(k * 100) / 100, f = memoFrac('reader', K), se = rateSE('reader', K);
        if (f - 2 * se >= 0.5) chosen = K;
        if (Math.abs(K * 10 - Math.round(K * 10)) < 1e-9) line(`  ${K.toFixed(2).padEnd(6)} ${pct(f).padStart(7)} ±${pct(se)}        ${PRESETS.map(n => pct(memoFrac(n, K))).join(' / ').padEnd(26)}  ${pct(fundFrac('oracle', K))}`);
    }
    line(`\nProposed (not recorded): K_CRED = ${chosen}`);
    line('\nPer player (validation):');
    playerStats();
    for (const n of PRESETS) line(`  static "${n}": mean S_P ${f3(mean(worlds.map(w => w.finalS[n])))} nats per run`);
    process.exit(0);
}

// ---- A. Market-policy copier -------------------------------------------------

check('A: market-policy copier scores exactly 0 every quarter, every world', copierExactOK, copierDetail || `${worlds.length} worlds`);
check('A: market-policy playerPilled === marketPilled on every lock day', copierPilledOK, pilledDetail || `${worlds.length} worlds`);
check('A: every synthetic lock is a valid curve set (none rejected)', lockRejected === 0, `${lockRejected} rejected`);

// ---- B. Properness -------------------------------------------------------

let analyticOK = true, analyticDetail = '';
{
    const laws = [[400, 90, 0], [721, 140, 0.2], [860, 60, 0.5], [300, 30, 0], [1200, 300, 0.1]];
    const quarters = [[0, 63], [315, 378], [693, 756], [882, 945]];
    const market = [[500, 120, 0], [700, 200, 0.3], [900, 50, 0.1]];
    const perturb = (m, w, q) => [[m + 30, w, q], [m - 30, w, q], [m + 100, w, q], [m - 100, w, q], [m, w * 0.6, q], [m, w * 1.6, q],
        [m + 60, w * 0.7, q], [m, w, Math.min(0.95, q + 0.2)], [m, w, Math.max(0, q - 0.2)]];
    for (const [m, w, q] of laws) for (const [t0, t1] of quarters) for (const [mm, wm, qm] of market) {
        const pTrue = crossingProb(m, w, q, t0, t1);
        const pM = quarterProb(mm, wm, qm, t0, t1);
        const E = (p) => pTrue * logScoreDelta(p, pM, 1) + (1 - pTrue) * logScoreDelta(p, pM, 0);
        const eTruth = E(quarterProb(m, w, q, t0, t1));
        for (const [pm, pw, pq] of perturb(m, w, q)) {
            const ePert = E(quarterProb(pm, Math.max(25, pw), pq, t0, t1));
            if (ePert > eTruth + 1e-12 && analyticOK) { analyticOK = false; analyticDetail = `law {${m},${w},${q}} q [${t0},${t1}] pert {${pm},${pw},${pq}}: ${ePert} > ${eTruth}`; }
        }
    }
}
check('B: proper per quarter (expected Δ maximized by the true law, plateau included)', analyticOK, analyticDetail || '5 laws x 4 quarters x 3 markets x 9 perturbations');

let mcOK = true, mcDetail = '';
{
    // A full term with common random numbers: the crossing day T is drawn from the
    // true law once per sample (never, with probability q), and every report is
    // scored against the same T.
    const rng = createRng((BASE_SEED * 7919 + 17) >>> 0);
    const M = 20000;
    const termScore = (rep, mkt, T) => {
        let S = 0;
        for (let L = 0; L + LOCK_INTERVAL <= HORIZON; L += LOCK_INTERVAL) {
            if (T <= L) break;
            const o = T <= L + LOCK_INTERVAL ? 1 : 0;
            S += logScoreDelta(quarterProb(rep.m, rep.w, rep.q, L, L + LOCK_INTERVAL), quarterProb(mkt.m, mkt.w, mkt.q, L, L + LOCK_INTERVAL), o);
        }
        return S;
    };
    const cases = [{ law: { m: 600, w: 120, q: 0.2 }, mkt: { m: 721, w: 140, q: 0 } }, { law: { m: 900, w: 60, q: 0 }, mkt: { m: 760, w: 120, q: 0.3 } }];
    const rows = [];
    for (const { law, mkt } of cases) {
        const same = (r) => r.m === law.m && r.w === law.w && r.q === law.q;
        const reps = [law, ...[{ ...law, m: law.m - 80 }, { ...law, m: law.m + 80 }, { ...law, w: law.w * 0.5 }, { ...law, w: law.w * 2 },
            { ...law, q: Math.min(0.95, law.q + 0.25) }, { ...law, q: Math.max(0, law.q - 0.2) }, mkt].filter(r => !same(r))];
        const sums = reps.map(() => 0);
        for (let k = 0; k < M; k++) {
            const never = rng.uniform() < law.q;
            const u = Math.min(1 - 1e-12, Math.max(1e-12, rng.uniform()));
            const T = never ? Infinity : law.m + law.w * Math.log(u / (1 - u));
            reps.forEach((r, j) => { sums[j] += termScore(r, mkt, T); });
        }
        const means = sums.map(x => x / M);
        rows.push(`law {${law.m},${law.w},${law.q}}: truth ${means[0].toFixed(3)} vs ${means.slice(1).map(x => x.toFixed(3)).join(' / ')}`);
        if (means.slice(1).some(x => x >= means[0])) { mcOK = false; mcDetail = rows[rows.length - 1]; }
    }
    if (mcOK) mcDetail = rows.join('; ');
}
check('B: proper over a full term (Monte Carlo, common random numbers)', mcOK, mcDetail);

// ---- C/D. Calibration targets and the real predicates ----------------------

const K = forecastTuning.K_CRED;
const qual = worlds.filter(w => w.qualifies);
const rMemo = memoFrac('reader', K);
check(`C: reader-copier clears the memo gate by day ${MEMO_BY} in >= 50% of worlds (K ${K})`, rMemo >= 0.5, `${pct(rMemo)} of ${worlds.length}`);
for (const n of PRESETS) {
    const memo = memoFrac(n, K), m = mean(worlds.map(w => w.finalS[n]));
    check(`C: static "${n}" earns nothing (mean S_P <= +0.05 nats per run, memo by ${MEMO_BY} in <= 10%)`, m <= 0.05 && memo <= 0.10, `mean S_P ${f3(m)} nats, memo ${pct(memo)}`);
}
const oS = mean(worlds.map(w => w.finalS.oracle)), rS = mean(worlds.map(w => w.finalS.reader));
check('C: the oracle earns more mean skill than the reader-copier', oS > rS, `oracle ${f3(oS)} vs reader ${f3(rS)} nats per run`);
diag(`C: oracle fund gate by day ${FUND_BY} (qualifying worlds; reported)`, true, `${pct(fundFrac('oracle', K))} of ${qual.length}`);
check('C: market-policy player stays at 0 (S_P and sigma0, every world)', worlds.every(w => w.finalS.market === 0 && w.finalV.market === 0 && w.path.market.every(p => p.S === 0 && p.v === 0)));
check('D: canSendMemos / canActAsFund(100) agree with the paths at K_CRED on every lock day', predicateOK, predicateDetail || `${worlds.length} worlds x every lock day x ${NAMES.length} players`);
diag(`informed (diagnostic) memo by ${MEMO_BY}`, true, pct(memoFrac('informed', K)));

// The quiet-quarter cost (02a): the early caller pays a little in quiet quarters
// and collects when the crossing lands.
const quietCost = [], hitGain = [];
for (const w of worlds) for (const q of w.scores.earlier) for (const r of q.rungs) (r.o ? hitGain : quietCost).push(r.delta);
diag('early caller: quiet quarters cost, crossing quarters pay', mean(quietCost) < 0 && mean(hitGain) > 0,
    `quiet ${f3(mean(quietCost))} nats/rung (n ${quietCost.length}), crossing ${f3(mean(hitGain))} (n ${hitGain.length})`);
const terminal = worlds.reduce((a, w) => a + w.scores.oracle.filter(q => q.terminal).length, 0);
diag('outstanding quarters scored at the terminal (oracle)', true, `${terminal} of ${worlds.length} worlds`);

// ---- Report --------------------------------------------------------------

line(`forecast-test: N=${N} per scenario (${worlds.length} worlds), base seed=${BASE_SEED}, horizon=${HORIZON}d, K_CRED=${K}`);
line(`  ${qual.length} worlds certify a rung by day ${FUND_BY}; ${worlds.filter(w => w.endDay < MEMO_BY).length} end before day ${MEMO_BY}`);
line('='.repeat(72));
line('\nCredibility by day (p10 / p50 / p90), gate crossings');
line('  player      ' + REPORT_DAYS.map(d => `day ${d}`.padEnd(20)).join('') + 'memo by 882  fund by 756');
const credAt = (path, day) => { let c = 0; for (const p of path) if (p.day <= day) c = Math.tanh(p.S / K); return c; };
for (const n of ALL) {
    const cells = REPORT_DAYS.map(d => {
        const xs = worlds.map(w => credAt(w.path[n], d));
        return `${f2(quantile(xs, 0.1))}/${f2(quantile(xs, 0.5))}/${f2(quantile(xs, 0.9))}`.padEnd(20);
    }).join('');
    line(`  ${n.padEnd(12)}${cells}${pct(memoFrac(n, K)).padStart(8)}     ${pct(fundFrac(n, K)).padStart(8)}`);
}
line('\nFinal S_P (mean / p50 / p90) and sigma0 (mean / p10 / p50 / p90), reported');
playerStats();
line('\nPer scenario: reader memo by 882 / oracle fund by 756 / projection mean S_P');
for (const sc of SCENARIOS) {
    const ws = worlds.filter(w => w.scenario === sc);
    line(`  ${sc.padEnd(8)} ${pct(memoFrac('reader', K, ws))} / ${pct(fundFrac('oracle', K, ws.filter(w => w.qualifies)))} / ${f3(mean(ws.map(w => w.finalS.projection)))}`);
}
line('\nReader-copier skill per quarter by lock day (mean nats per world-quarter)');
{
    const byQ = new Map();
    for (const w of worlds) for (const q of w.readerScores) { const k = q.from; if (!byQ.has(k)) byQ.set(k, []); byQ.get(k).push(q.delta); }
    line('  ' + [...byQ].sort((a, b) => a[0] - b[0]).map(([d, a]) => `${d}:${f3(mean(a))}`).join(' '));
}
line('\nK sweep over the recorded paths (diagnostic on these seeds): reader memo / earlier / later / projection');
for (const k of [0.7, 1, 1.35, 1.7, 2]) line(`  ${k.toFixed(2).padEnd(6)} ${[ 'reader', ...PRESETS].map(n => pct(memoFrac(n, k))).join(' / ')}`);

line('\n' + '='.repeat(72));
line('Checks:');
for (const r of results) line(`  [${r.ok ? 'PASS' : 'FAIL'}${r.diag ? '/DIAG' : '     '}] ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
line('='.repeat(72));
line(failures === 0 ? 'FORECAST GATE: PASS' : `FORECAST GATE: FAIL -- ${failures} check(s)`);
process.exitCode = failures === 0 ? 0 : 1;
