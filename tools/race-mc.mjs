#!/usr/bin/env node
/* ===================================================
   tools/race-mc.mjs -- Headless Monte-Carlo harness for
   the src/race/ hidden state machine. Runs N seeds of
   the full daily loop over the 1008-day horizon with
   neutral player inputs and reports the distributions
   plus a calibration PASS/MISS block against the stated
   targets in docs/design/02a-tuning.md (rev 2).

   The calibration statistic is the UNCONDITIONAL
   first-passage median (Kaplan-Meier: right-censored
   runs -- no crossing by 1008 -- count), never the
   median conditional on crossing (which biases early).
   With a single administrative censoring time (day
   1008), KM reduces to the empirical CDF, so the
   unconditional quantile is the p-quantile of the full
   N-sample with non-crossers placed at +infinity.

   Usage:  node tools/race-mc.mjs [N] [--seed S]
           N defaults to 1000; base seed defaults to 1.
   =================================================== */

import { createRaceState, advanceRace, heatValue, RACE_TUNING } from '../src/race/race-state.js';

// ---- CLI -----------------------------------------------------------------

const argv = process.argv.slice(2);
let N = 1000;
let BASE_SEED = 1;
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') BASE_SEED = parseInt(argv[++i], 10) >>> 0;
    else if (a === '--n' || a === '-n') N = parseInt(argv[++i], 10);
    else if (/^\d+$/.test(a)) N = parseInt(a, 10);
}
const HORIZON = 1008;
const ENTITIES = ['halcyon', 'tianxia', 'polaris', 'open'];

// ---- Stats helpers -------------------------------------------------------

/** Linear-interpolation quantile over a numeric array (sorted internally). */
function quantile(arr, p) {
    if (arr.length === 0) return NaN;
    const s = [...arr].sort((a, b) => a - b);
    const idx = p * (s.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return s[lo];
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/**
 * Unconditional (Kaplan-Meier) first-passage quantile: the p-quantile of the
 * full N-sample where `days` holds the crossers and the remaining N-k runs are
 * right-censored at the horizon. With a single administrative censoring time,
 * this is the empirical quantile: the smallest observation t with F(t) >= p,
 * i.e. the ceil(p*N)-th smallest crossing. If fewer than ceil(p*N) crossers
 * exist, the quantile sits in the censored mass -> Infinity (report ">1008").
 * No interpolation across the censored boundary.
 */
function kmQuantile(days, N, p) {
    const need = Math.ceil(p * N);
    if (days.length < need) return Infinity;
    const s = [...days].sort((a, b) => a - b);
    return s[need - 1];
}
const mean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN;
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '  -- ');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '   -- ');
const d0 = (x) => (Number.isFinite(x) ? Math.round(x).toString() : '>1008');
const pct = (x) => (100 * x).toFixed(1) + '%';

// ---- Run the ensemble ----------------------------------------------------

const frontierCross = { 2: [], 3: [], 4: [], 5: [] };   // frontier (min over entities) internal crossing days
const condCross = { 2: [], 3: [], 4: [], 5: [] };       // same, for the conditional (secondary) median
const finalC = { halcyon: [], tianxia: [], polaris: [], open: [] };
const leadFinal = [];                                    // top entity C_int minus 2nd (per-run leader-agnostic)
const sAt = { 350: [], 700: [], 1008: [] };              // frontier-leader safety margin snapshots
const heatFinal = [];
const floorFinal = [];
const theftCounts = [];
const releasesTianxia = [];
let capHit = 0;            // proliferation floor reached its cap at day 1008
let plateauByE = 0;        // scalingElasticity <= 0.60 (recursion never ignites)
let plateauQ = 0;          // q < 0.01
let confirmedPlateau = 0;  // gated: q<0.01 AND R5 never crossed AND trailing-120d < 2e-4/d
let rawFlatline = 0;       // ungated raw diagnostic: trailing-120d < 2e-4/d over ALL runs
let leadUnique = 0, leadTie = 0, leadLost = 0;   // leadership outcome at 1008

const T_CAP = RACE_TUNING.prolifCap / RACE_TUNING.prolifInc;   // releases needed to hit the cap

const t0 = Date.now();
for (let i = 0; i < N; i++) {
    const race = createRaceState((BASE_SEED + i) >>> 0);
    let leaderC888 = null;
    for (let d = 0; d < HORIZON; d++) {
        advanceRace(race);
        if (race.day === 350) sAt[350].push(leaderSafety(race));
        if (race.day === 700) sAt[700].push(leaderSafety(race));
        if (race.day === 888) leaderC888 = leaderInternal(race).C;
    }
    const cap = race.capability;

    // Frontier (leader-agnostic) internal-track first crossings.
    for (const r of [2, 3, 4, 5]) {
        let m = Infinity;
        for (const e of ENTITIES) {
            const rec = (e === 'open') ? cap.open.rungInternal : cap.labs[e].rungInternal;
            if (rec[r] != null) m = Math.min(m, rec[r]);
        }
        if (Number.isFinite(m)) { frontierCross[r].push(m); condCross[r].push(m); }
    }

    // Final capability per entity + lead of the top entity over the field.
    const cvals = {};
    for (const e of ENTITIES) cvals[e] = (e === 'open') ? cap.open.C : (cap.labs[e].active ? cap.labs[e].C_internal : null);
    for (const e of ENTITIES) if (cvals[e] != null) finalC[e].push(cvals[e]);
    const sorted = ENTITIES.map(e => cvals[e]).filter(v => v != null).sort((a, b) => b - a);
    leadFinal.push(sorted[0] - (sorted[1] ?? sorted[0]));

    // Leadership outcome: is Halcyon the unique top, tied at the ceiling, or lost?
    const top = sorted[0];
    const hc = cvals.halcyon;
    const nTop = ENTITIES.filter(e => cvals[e] != null && Math.abs(cvals[e] - top) < 1e-9).length;
    if (hc >= top - 1e-9 && nTop === 1) leadUnique++;
    else if (hc >= top - 1e-9) leadTie++;
    else leadLost++;

    sAt[1008].push(leaderSafety(race));
    heatFinal.push(heatValue(race.heat));
    floorFinal.push(race.heat.floor);
    theftCounts.push(race.theftCount);
    const tRel = cap.labs.tianxia.releaseCount;
    releasesTianxia.push(tRel);
    if (Math.min(RACE_TUNING.prolifInc * tRel, RACE_TUNING.prolifCap) >= RACE_TUNING.prolifCap - 1e-12) capHit++;

    const ignited = cap.q >= 0.01;
    const r5crossed = frontierCrossed(cap, 5);
    const leaderCend = leaderInternal(race).C;
    const flat = (leaderC888 != null) && ((leaderCend - leaderC888) / 120 < 0.0002);
    if (race.hidden.scalingElasticity <= 0.60) plateauByE++;
    if (!ignited) plateauQ++;
    if (!ignited && !r5crossed && flat) confirmedPlateau++;   // gated to pre-takeoff, non-ignited
    if (flat) rawFlatline++;                                  // ungated diagnostic
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

/** Leader = per-run argmax C_internal across active labs + open (no hardcoded Halcyon). */
function leaderInternal(race) {
    const cap = race.capability;
    let best = { id: 'open', C: cap.open.C };
    for (const id of ['halcyon', 'tianxia', 'polaris']) {
        const lab = cap.labs[id];
        if (lab.active && lab.C_internal > best.C) best = { id, C: lab.C_internal };
    }
    return best;
}
function leaderSafety(race) {
    const id = leaderInternal(race).id;
    if (id === 'open') return 0;
    return race.safety[id] ?? 0;
}
function frontierCrossed(cap, r) {
    for (const e of ENTITIES) {
        const rec = (e === 'open') ? cap.open.rungInternal : cap.labs[e].rungInternal;
        if (rec[r] != null) return true;
    }
    return false;
}

// ---- Report --------------------------------------------------------------

const line = (s = '') => console.log(s);
line(`race-mc: N=${N}, base seed=${BASE_SEED}, horizon=${HORIZON}d, ${elapsed}s`);
line(`tuned proliferation triple (RACE_TUNING): releaseCooldown=${RACE_TUNING.releaseCooldown}d, `
    + `prolifInc=${RACE_TUNING.prolifInc}, prolifCap=${RACE_TUNING.prolifCap} `
    + `(cap needs ${T_CAP.toFixed(1)} Tianxia releases)`);
line('='.repeat(70));

line('\nRung first-passage day -- frontier (min over labs+open, internal track)');
line('  PRIMARY: unconditional / Kaplan-Meier (right-censored at 1008)');
line('  rung   u-p10  u-p50  u-p90   crossed   cond-p50(secondary)');
for (const r of [2, 3, 4, 5]) {
    const a = frontierCross[r];
    line(`  R${r}    ${d0(kmQuantile(a, N, 0.10)).padStart(5)}  ${d0(kmQuantile(a, N, 0.50)).padStart(5)}  `
        + `${d0(kmQuantile(a, N, 0.90)).padStart(5)}   ${pct(a.length / N).padStart(6)}   ${d0(quantile(condCross[r], 0.50)).padStart(5)}`);
}

line('\nFinal capability C_internal at day 1008 (p10/p50/p90)');
for (const k of ENTITIES) {
    const a = finalC[k];
    line(`  ${k.padEnd(8)} ${f2(quantile(a, 0.10)).padStart(6)} ${f2(quantile(a, 0.50)).padStart(6)} `
        + `${f2(quantile(a, 0.90)).padStart(6)}   (n=${a.length})`);
}
line(`  Top-entity lead over field: p10 ${f2(quantile(leadFinal, 0.10))}  `
    + `p50 ${f2(quantile(leadFinal, 0.50))}  p90 ${f2(quantile(leadFinal, 0.90))}`);
line(`  Leadership @1008:  Halcyon unique-top ${pct(leadUnique / N)}  `
    + `ceiling-tie ${pct(leadTie / N)}  lost ${pct(leadLost / N)}`);

line('\nSafety margin S[leader] trajectory (mean / p10 / p90)');
for (const day of [350, 700, 1008]) {
    const a = sAt[day];
    line(`  day ${String(day).padStart(4)}   mean ${f3(mean(a))}   p10 ${f3(quantile(a, 0.10))}   p90 ${f3(quantile(a, 0.90))}`);
}

line('\nHeat (day 1008)');
line(`  total   mean ${f3(mean(heatFinal))}   p10 ${f3(quantile(heatFinal, 0.10))}   p90 ${f3(quantile(heatFinal, 0.90))}`);
line(`  floor   mean ${f3(mean(floorFinal))}   p10 ${f3(quantile(floorFinal, 0.10))}   p90 ${f3(quantile(floorFinal, 0.90))}`);

line('\nTheft (successful exfiltrations per run)');
line(`  mean ${f3(mean(theftCounts))}   p50 ${d0(quantile(theftCounts, 0.50))}   p90 ${d0(quantile(theftCounts, 0.90))}   `
    + `max ${Math.max(...theftCounts)}   >=1: ${pct(theftCounts.filter(x => x >= 1).length / N)}`);
line(`  (02a benchmark E[successes] ~0.6 at SL2/heat~0.3, "not an invariant")`);

line('\nTianxia releases/run');
line(`  mean ${f2(mean(releasesTianxia))}   p10 ${d0(quantile(releasesTianxia, 0.10))}   `
    + `p50 ${d0(quantile(releasesTianxia, 0.50))}   p90 ${d0(quantile(releasesTianxia, 0.90))}`);

line('\nPlateau / fizzle  (the raw trailing-120d estimator is unusable for');
line('  confirmation per 02a -- these are DIAGNOSTICS, not the fizzle target)');
line(`  scalingElasticity <= 0.60 (recursion never ignites): ${pct(plateauByE / N)}`);
line(`  q < 0.01:                                            ${pct(plateauQ / N)}`);
line(`  gated raw-flatline diagnostic (!ignited & !R5 & flat):${pct(confirmedPlateau / N).padStart(7)}`);
line(`  ungated raw-flatline diagnostic (ALL runs):          ${pct(rawFlatline / N).padStart(7)}  <- not a target`);

// ---- Calibration PASS/MISS against 02a targets ---------------------------

line('\n' + '='.repeat(70));
line('CALIBRATION vs 02a targets  (crossing medians are UNCONDITIONAL/KM;');
line('  tolerance is a DESIGN band, not a sampling band -- MC SD at N=1000 ~2-4d)');
line('  target                          want      got     status');

let allPass = true;
function checkMedian(label, arr, target) {
    const got = kmQuantile(arr, N, 0.50);
    const tol = Math.max(0.10 * target, 25);                  // +/-10% design band or +/-25d
    const pass = Number.isFinite(got) && Math.abs(got - target) <= tol;
    if (!pass) allPass = false;
    line(`  ${label.padEnd(28)} ${String(target).padStart(6)}   ${d0(got).padStart(6)}    ${pass ? 'PASS' : 'MISS'}`
        + `   (|d|=${Number.isFinite(got) ? Math.abs(got - target).toFixed(0) : '--'}, band=${tol.toFixed(0)})`);
}
checkMedian('R2 median (uncond)', frontierCross[2], 230);
checkMedian('R3 median (uncond)', frontierCross[3], 644);
checkMedian('R4 median (uncond)', frontierCross[4], 800);
checkMedian('R5 median (uncond)', frontierCross[5], 911);

function checkBand(label, got, want, lo, hi) {
    const pass = got >= lo && got <= hi;
    if (!pass) allPass = false;
    line(`  ${label.padEnd(28)} ${want.padStart(6)}   ${pct(got).padStart(6)}    ${pass ? 'PASS' : 'MISS'}`
        + `   (band ${pct(lo)}-${pct(hi)})`);
}
checkBand('fizzle/elasticity tail', plateauByE / N, '12.0%', 0.09, 0.15);      // 12% +/-3pp
checkBand('proliferation cap incidence', capHit / N, '35-55%', 0.35, 0.55);    // ratchet binds a strict minority

line('='.repeat(70));
line(allPass ? 'ALL CALIBRATION TARGETS PASS' : 'ONE OR MORE TARGETS MISS -- see above');
process.exitCode = allPass ? 0 : 1;
