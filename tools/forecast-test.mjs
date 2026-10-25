#!/usr/bin/env node
/* ===================================================
   tools/forecast-test.mjs -- Calibration and reachability
   harness for the player's posterior (02a "Belief, η, and
   the firm": the posterior, locks, scoring; src/race/belief.js).

   Each world is a headless race with belief stepped exactly
   as belief-test.mjs does (advanceRace, then stepBelief, every
   day). Pass 1 records the world's public certification days
   (the truth the oracle and the informed player are handed --
   they exist only inside this harness). Pass 2 replays the
   same seed bit-identically and runs every synthetic player
   through the REAL API: on each lock day the player's own
   store is installed as `belief.player`, the closing quarter
   is scored (scoreQuarter), then the new lock is recorded
   (lockForecast). Records, credibility and the gate
   predicates are therefore the module's own.

   Players:
     copier    the market's curves every quarter
     oracle    m_R = the true certification day (2016 if none), w 30
     informed  m halfway between B's median and the truth, w 0.7*w_B
     earlier   the static "earlier than the market" preset
     later     the static "later than the market" preset

   Hard-assertion checks:

   A. Copier: every quarter's increment is exactly 0 in every
      world, and its playerPilled equals marketPilled exactly
      on every lock day (the scrutiny gap reads one measure).

   B. Properness (02a): for fixed true laws, reporting the law
      beats perturbations of {m, w} in expectation -- analytic
      per quarter, and Monte Carlo over a full term with common
      random numbers.

   C. Calibration targets (02a), at the module's K_CRED:
        - the oracle clears the fund gate (0.65) by day 756 in
          >= 80% of the worlds that certify a rung by then;
        - the informed player clears the memo gate (0.55) by
          day 882 in roughly half of worlds (gated 30-70%);
        - no static preset earns more than a bounded edge (B runs early; see 02a).

   D. Reachability through the real input path: the oracle's
      scored record opens canSendMemos() and canActAsFund(100)
      (F stubbed at 100) by day 756 in >= 80% of qualifying
      worlds.

   Reported, not gated: credibility quantiles by day 350 / 700
   / 882, gate-crossing days, skill per quarter, the quiet-
   quarter cost of calling early, and a K_CRED sweep over the
   recorded S_P paths (credibility = tanh(S_P / K)).

   Usage:  node tools/forecast-test.mjs [N] [--seed S]
           N defaults to 500; base seed defaults to 1.
   =================================================== */

import { createRaceState, advanceRace } from '../src/race/race-state.js';
import { initConsensus } from '../src/race/consensus.js';
import {
    belief, initBelief, stepBelief, isLockDay, LOCK_INTERVAL,
    lockForecast, scoreQuarter, quarterProb, crossingProb, logScoreDelta,
    presetCurves, marketCurves, normalizeCurves, forecastRecord, forecastTuning,
    credibility, canSendMemos, canActAsFund, playerPilled, marketPilled,
} from '../src/race/belief.js';
import { createRng } from '../src/race/rng.js';

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
const NONE = 2016;                       // the oracle's target for a rung that never certifies
const MEMO_GATE = 0.55, FUND_GATE = 0.65;   // 02a, mirrored from belief.js for the K sweep
const FUND_BY = 756, MEMO_BY = 882;
const REPORT_DAYS = [350, 700, 882];

// ---- Assertion plumbing --------------------------------------------------

let failures = 0;
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok, detail, diag: false }); if (!ok) failures++; }
function diag(name, ok, detail = '') { results.push({ name, ok, detail, diag: true }); }
const line = (s = '') => console.log(s);
const pct = (x) => (100 * x).toFixed(1) + '%';
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : ' -- ');
function quantile(arr, p) {
    if (!arr.length) return NaN;
    const s = [...arr].sort((a, b) => a - b);
    const idx = p * (s.length - 1), lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

// ---- The players ---------------------------------------------------------

const truthOf = (certDays, R) => (certDays[R] != null ? certDays[R] : NONE);
const PLAYERS = {
    copier: () => presetCurves('market'),
    oracle: (truth) => normalizeCurves(Object.fromEntries([2, 3, 4, 5].map(R => [R, { m: truthOf(truth, R), w: 30 }]))),
    informed: (truth) => {
        const mk = marketCurves();
        return normalizeCurves(Object.fromEntries([2, 3, 4, 5].map(R => [R, { m: 0.5 * (mk[R].m + truthOf(truth, R)), w: 0.7 * mk[R].w }])));
    },
    earlier: () => presetCurves('earlier'),
    later: () => presetCurves('later'),
};
const NAMES = Object.keys(PLAYERS);

/** A blank player store, shaped like belief.js's own (_freshPlayer). */
const freshStore = () => ({ draft: marketCurves(), locks: [], scores: [], S: 0, credibility: 0, lastLockDay: null });

// ---- The worlds ----------------------------------------------------------

/** Pass 1: the world's public certification days, R2-R4 (R5 never certifies). */
function certDaysOf(seed) {
    const race = createRaceState(seed);
    initConsensus(race); initBelief(race);
    for (let d = 0; d < HORIZON; d++) { advanceRace(race); stepBelief(race); }
    const out = {};
    for (const R of [2, 3, 4, 5]) { const r = belief.rungs[R]; if (r && r.crossed) out[R] = r.certDay; }
    return out;
}

const worlds = [];
let copierExactOK = true, copierPilledOK = true, lockRejected = 0;
let copierDetail = '', pilledDetail = '';
for (let i = 0; i < N; i++) {
    const seed = (BASE_SEED + i) >>> 0;
    const truth = certDaysOf(seed);
    // Pass 2: the same seed, bit-identical, with every player on the real API.
    const race = createRaceState(seed);
    initConsensus(race); initBelief(race);
    const stores = Object.fromEntries(NAMES.map(n => [n, freshStore()]));
    const path = Object.fromEntries(NAMES.map(n => [n, []]));     // per lock day: { day, S, cred, memo, fund }
    const lockDay = (day) => {
        for (const n of NAMES) {
            belief.player = stores[n];
            if (day > 0) scoreQuarter(day);
            if (!lockForecast(day, PLAYERS[n](truth))) lockRejected++;
            const rec = forecastRecord();
            path[n].push({ day, S: rec.S, cred: credibility(), memo: canSendMemos(), fund: canActAsFund(100) });
            if (n === 'copier' && playerPilled() !== marketPilled()) {
                if (copierPilledOK) pilledDetail = `seed ${seed} day ${day}: ${playerPilled()} vs ${marketPilled()}`;
                copierPilledOK = false;
            }
        }
    };
    lockDay(0);
    for (let d = 0; d < HORIZON; d++) {
        advanceRace(race); stepBelief(race);
        if (isLockDay(race.day)) lockDay(race.day);
    }
    for (const q of stores.copier.scores) {
        if (q.delta !== 0 || q.rungs.some(r => r.delta !== 0)) {
            if (copierExactOK) copierDetail = `seed ${seed} quarter to ${q.to}: ${q.delta}`;
            copierExactOK = false;
        }
    }
    const certBy = (day) => [2, 3, 4].some(R => truth[R] != null && truth[R] <= day);
    worlds.push({ seed, truth, path, scores: Object.fromEntries(NAMES.map(n => [n, stores[n].scores])), qualifies: certBy(FUND_BY) });
}
belief.player = null;

// ---- A. Copier -------------------------------------------------------------

check('A: copier scores exactly 0 every quarter, every world', copierExactOK, copierDetail || `${N} worlds`);
check('A: copier playerPilled === marketPilled on every lock day', copierPilledOK, pilledDetail || `${N} worlds x 17 lock days`);
check('A: every synthetic lock is a valid curve set (none rejected)', lockRejected === 0, `${lockRejected} rejected`);

// ---- B. Properness -------------------------------------------------------

let analyticOK = true, analyticDetail = '';
{
    const laws = [[400, 90], [721, 140], [860, 60], [300, 30], [1200, 300]];
    const quarters = [[0, 63], [315, 378], [693, 756], [882, 945]];
    const market = [[500, 120], [700, 200], [900, 50]];
    const perturb = (m, w) => [[m + 30, w], [m - 30, w], [m + 100, w], [m - 100, w], [m, w * 0.6], [m, w * 1.6], [m + 60, w * 0.7]];
    for (const [m, w] of laws) for (const [t0, t1] of quarters) for (const [mm, wm] of market) {
        const pTrue = crossingProb(m, w, t0, t1);
        const pM = quarterProb(mm, wm, t0, t1);
        const E = (q) => pTrue * logScoreDelta(q, pM, 1) + (1 - pTrue) * logScoreDelta(q, pM, 0);
        const eTruth = E(quarterProb(m, w, t0, t1));
        for (const [pm, pw] of perturb(m, w)) {
            const ePert = E(quarterProb(pm, Math.max(25, pw), t0, t1));
            if (ePert > eTruth + 1e-12 && analyticOK) { analyticOK = false; analyticDetail = `law {${m},${w}} q [${t0},${t1}] pert {${pm},${pw}}: ${ePert} > ${eTruth}`; }
        }
    }
}
check('B: proper per quarter (expected Δ maximized by the true law)', analyticOK, analyticDetail || '5 laws x 4 quarters x 3 markets x 7 perturbations');

let mcOK = true, mcDetail = '';
{
    // A full term with common random numbers: the crossing day T is drawn from the
    // true law once per sample, and every report is scored against the same T.
    const rng = createRng((BASE_SEED * 7919 + 17) >>> 0);
    const M = 20000;
    const termScore = (rep, mkt, T) => {
        let S = 0;
        for (let L = 0; L + LOCK_INTERVAL <= HORIZON; L += LOCK_INTERVAL) {
            if (T <= L) break;                                     // certified before the quarter: frozen
            const o = T <= L + LOCK_INTERVAL ? 1 : 0;
            S += logScoreDelta(quarterProb(rep.m, rep.w, L, L + LOCK_INTERVAL), quarterProb(mkt.m, mkt.w, L, L + LOCK_INTERVAL), o);
        }
        return S;
    };
    const cases = [{ law: { m: 600, w: 120 }, mkt: { m: 721, w: 140 } }, { law: { m: 900, w: 60 }, mkt: { m: 760, w: 120 } }];
    const rows = [];
    for (const { law, mkt } of cases) {
        const reps = [law, { m: law.m - 80, w: law.w }, { m: law.m + 80, w: law.w }, { m: law.m, w: law.w * 0.5 }, { m: law.m, w: law.w * 2 }, mkt];
        const sums = reps.map(() => 0);
        for (let k = 0; k < M; k++) {
            const u = Math.min(1 - 1e-12, Math.max(1e-12, rng.uniform()));
            const T = law.m + law.w * Math.log(u / (1 - u));
            reps.forEach((r, j) => { sums[j] += termScore(r, mkt, T); });
        }
        const means = sums.map(x => x / M);
        rows.push(`law {${law.m},${law.w}}: truth ${means[0].toFixed(3)} vs ${means.slice(1).map(x => x.toFixed(3)).join(' / ')}`);
        if (means.slice(1).some(x => x >= means[0])) { mcOK = false; mcDetail = rows[rows.length - 1]; }
    }
    if (mcOK) mcDetail = rows.join('; ');
}
check('B: proper over a full term (Monte Carlo, common random numbers)', mcOK, mcDetail);

// ---- C/D. Calibration and reachability -------------------------------------

const credAt = (path, day) => { let c = 0; for (const p of path) if (p.day <= day) c = p.cred; return c; };
const firstCross = (path, pred) => { const p = path.find(pred); return p ? p.day : null; };
const qual = worlds.filter(w => w.qualifies);
const oracleFundFrac = (K) => mean(qual.map(w => (w.path.oracle.some(p => p.day <= FUND_BY && Math.tanh(p.S / K) > FUND_GATE) ? 1 : 0)));
const informedMemoFrac = (K) => mean(worlds.map(w => (w.path.informed.some(p => p.day <= MEMO_BY && Math.tanh(p.S / K) > MEMO_GATE) ? 1 : 0)));

const K = forecastTuning.K_CRED;
const oFund = mean(qual.map(w => { const d = firstCross(w.path.oracle, p => p.cred > FUND_GATE); return d != null && d <= FUND_BY ? 1 : 0; }));
const iMemo = mean(worlds.map(w => { const d = firstCross(w.path.informed, p => p.cred > MEMO_GATE); return d != null && d <= MEMO_BY ? 1 : 0; }));
const finalS = (n) => worlds.map(w => w.path[n][w.path[n].length - 1].S);
check(`C: oracle clears the fund gate by day ${FUND_BY} in >= 80% of qualifying worlds (K ${K})`, oFund >= 0.8, `${pct(oFund)} of ${qual.length}`);
check(`C: informed clears the memo gate by day ${MEMO_BY} in 30-70% of worlds (K ${K})`, iMemo >= 0.3 && iMemo <= 0.7, pct(iMemo));
check('C: copier stays at 0 (S_P and credibility, every world)', worlds.every(w => w.path.copier.every(p => p.S === 0 && p.cred === 0)));
// B's two-parameter law runs early (day-0 medians 341/686/831 against the
// certified KM medians 405/736/860): it cannot hold both the median and the
// deadline probability of an outcome with a long "not this term" tail. So a
// static "later" caller earns a little in Act I's quiet quarters. 02a accepts
// that bias as bounded until B gains a plateau mass; this gates the bound.
for (const n of ['earlier', 'later']) {
    const m = mean(finalS(n));
    const memo = mean(worlds.map(w => (w.path[n].some(p => p.day <= MEMO_BY && p.cred > MEMO_GATE) ? 1 : 0)));
    check(`C: static "${n}" preset earns at most a bounded edge (mean S_P <= 0.25 nats, memo by ${MEMO_BY} in <= 10%)`,
        m <= 0.25 && memo <= 0.10, `mean S_P ${f2(m)} nats, memo ${pct(memo)}`);
}
const reachFund = mean(qual.map(w => (w.path.oracle.some(p => p.day <= FUND_BY && p.fund) ? 1 : 0)));
const reachMemo = mean(qual.map(w => (w.path.oracle.some(p => p.day <= FUND_BY && p.memo) ? 1 : 0)));
check(`D: oracle reaches canSendMemos() by day ${FUND_BY} via lockForecast + scoreQuarter`, reachMemo >= 0.8, pct(reachMemo));
check(`D: oracle reaches canActAsFund(100) by day ${FUND_BY} via lockForecast + scoreQuarter`, reachFund >= 0.8, pct(reachFund));

// The quiet-quarter cost (02a): the early caller pays a little in quiet quarters
// and collects when the crossing lands.
const quietCost = [], hitGain = [];
for (const w of worlds) for (const q of w.scores.earlier) for (const r of q.rungs) (r.o ? hitGain : quietCost).push(r.delta);
diag('early caller: quiet quarters cost, crossing quarters pay', mean(quietCost) < 0 && mean(hitGain) > 0,
    `quiet ${f2(mean(quietCost))} nats/rung (n ${quietCost.length}), crossing ${f2(mean(hitGain))} (n ${hitGain.length})`);

// ---- Report --------------------------------------------------------------

line(`forecast-test: N=${N} worlds, base seed=${BASE_SEED}, horizon=${HORIZON}d, K_CRED=${K}`);
line(`  ${qual.length} worlds certify a rung by day ${FUND_BY}`);
line('='.repeat(72));
line('\nCredibility by day (p10 / p50 / p90), mean final S_P, gate crossings');
line('  player      ' + REPORT_DAYS.map(d => `day ${d}`.padEnd(20)).join('') + 'S_P     memo by 882   fund by 756');
for (const n of NAMES) {
    const cells = REPORT_DAYS.map(d => {
        const xs = worlds.map(w => credAt(w.path[n], d));
        return `${f2(quantile(xs, 0.1))}/${f2(quantile(xs, 0.5))}/${f2(quantile(xs, 0.9))}`.padEnd(20);
    }).join('');
    const memo = mean(worlds.map(w => { const d = firstCross(w.path[n], p => p.cred > MEMO_GATE); return d != null && d <= MEMO_BY ? 1 : 0; }));
    const fund = mean(qual.map(w => { const d = firstCross(w.path[n], p => p.cred > FUND_GATE); return d != null && d <= FUND_BY ? 1 : 0; }));
    line(`  ${n.padEnd(12)}${cells}${f2(mean(finalS(n))).padStart(6)}  ${pct(memo).padStart(8)}     ${pct(fund).padStart(8)}`);
}
line('\nGate-crossing days (p25 / p50 / p75 among worlds that cross by day 1008)');
for (const n of ['oracle', 'informed']) {
    const memo = worlds.map(w => firstCross(w.path[n], p => p.cred > MEMO_GATE)).filter(d => d != null);
    const fund = worlds.map(w => firstCross(w.path[n], p => p.cred > FUND_GATE)).filter(d => d != null);
    line(`  ${n.padEnd(10)} memo ${memo.length ? [0.25, 0.5, 0.75].map(p => Math.round(quantile(memo, p))).join(' / ') : '--'} (${pct(memo.length / N)})`
        + `   fund ${fund.length ? [0.25, 0.5, 0.75].map(p => Math.round(quantile(fund, p))).join(' / ') : '--'} (${pct(fund.length / N)})`);
}
line('\nK_CRED sweep over the recorded S_P paths');
line('  K      oracle fund by 756 (qualifying)   informed memo by 882');
for (const k of [1.5, 1.6, 1.7, 1.8, 1.9, 2, 2.25, 2.5, 3, 3.5, 4]) line(`  ${String(k).padEnd(6)} ${pct(oracleFundFrac(k)).padStart(8)}                          ${pct(informedMemoFrac(k)).padStart(8)}`);

line('\n' + '='.repeat(72));
line('Checks:');
for (const r of results) line(`  [${r.ok ? 'PASS' : 'FAIL'}${r.diag ? '/DIAG' : '     '}] ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
line('='.repeat(72));
line(failures === 0 ? 'FORECAST GATE: PASS' : `FORECAST GATE: FAIL -- ${failures} check(s)`);
process.exitCode = failures === 0 ? 0 : 1;
