/* ===================================================
   tools/race-mc.mjs -- the race's stance, reported (not a
   gate): N seeds of the hidden race over the 1008-day
   horizon on neutral inputs, against 02a's tuning targets,
   and the terminal families beside 02a's target outcome
   distribution (the tuning contract).

   The crossing statistic is the UNCONDITIONAL first-
   passage median (Kaplan-Meier: runs with no crossing by
   1008 count as censored), never the median conditional
   on crossing, which biases early. With one administrative
   censoring time KM reduces to the empirical CDF, so the
   quantile is the p-quantile of the full sample with
   non-crossers at +infinity.

   Usage:  node tools/race-mc.mjs [N] [--seed S]
           N defaults to 1000; base seed defaults to 1.
   =================================================== */

import { createRaceState, advanceRace, stepControlRegime } from '../src/race/race-state.js';
import { stepTreaty } from '../src/race/treaty-track.js';
import { checkResolution } from '../src/race/resolution.js';

const argv = process.argv.slice(2);
let N = 1000, BASE_SEED = 1;
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed') BASE_SEED = parseInt(argv[++i], 10) >>> 0;
    else if (/^\d+$/.test(argv[i])) N = parseInt(argv[i], 10);
}
const HORIZON = 1008;
const ENTITIES = ['halcyon', 'tianxia', 'polaris', 'open'];
// 02a "The race": frontier internal-crossing medians, each within ±10% or ±25 days,
// and the fizzle (elasticity ≤ 0.60) share in 9–15%.
const TARGETS = { 2: 230, 3: 644, 4: 800, 5: 911 };

const kmQuantile = (days, p) => {
    const need = Math.ceil(p * N);
    return days.length < need ? Infinity : [...days].sort((a, b) => a - b)[need - 1];
};
const d0 = (x) => (Number.isFinite(x) ? Math.round(x).toString() : '>1008');
const pct = (x) => (100 * x).toFixed(1) + '%';

const cross = { 2: [], 3: [], 4: [], 5: [] };
let fizzle = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
    const race = createRaceState((BASE_SEED + i) >>> 0);
    for (let d = 0; d < HORIZON; d++) advanceRace(race);
    for (const r of [2, 3, 4, 5]) {
        let m = Infinity;
        for (const e of ENTITIES) {
            const rec = e === 'open' ? race.capability.open.rungInternal : race.capability.labs[e].rungInternal;
            if (rec[r] != null) m = Math.min(m, rec[r]);
        }
        if (Number.isFinite(m)) cross[r].push(m);
    }
    if (race.hidden.scalingElasticity <= 0.60) fizzle++;
}

console.log(`race-mc: N=${N}, base seed=${BASE_SEED}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log('\n  rung   p10    p50    p90    crossed   target (band)');
for (const r of [2, 3, 4, 5]) {
    const a = cross[r], med = kmQuantile(a, 0.5), tol = Math.max(0.10 * TARGETS[r], 25);
    const off = !(Number.isFinite(med) && Math.abs(med - TARGETS[r]) <= tol);
    console.log(`  R${r}   ${d0(kmQuantile(a, 0.1)).padStart(5)}  ${d0(med).padStart(5)}  ${d0(kmQuantile(a, 0.9)).padStart(5)}   ${pct(a.length / N).padStart(6)}   ${TARGETS[r]} (±${tol.toFixed(0)})${off ? '  off target' : ''}`);
}
const f = fizzle / N;
console.log(`\n  fizzle tail ${pct(f)}, target 12% (9-15%)${f < 0.09 || f > 0.15 ? '  off target' : ''}`);

// The families: the full daily loop to resolution, with the day-1008 extrapolation.
const fam = [0, 0, 0, 0, 0, 0, 0];
let extrapolated = 0;
for (let i = 0; i < N; i++) {
    const race = createRaceState((BASE_SEED + i) >>> 0);
    for (let d = 0; d < HORIZON && !race.resolution; d++) {
        advanceRace(race, { straitTension: 0 }); stepControlRegime(race); stepTreaty(race, {});
        if (checkResolution(race, null)) break;
    }
    if (!race.resolution) checkResolution(race, null);
    fam[race.resolution.family]++;
    if (race.resolution.extrapolated) extrapolated++;
}
console.log(`\n  families (compare 02a "Target outcome distribution"): ${[1, 2, 3, 4, 5, 6].map(f => `${f} ${pct(fam[f] / N)}`).join(', ')}; extrapolated ${pct(extrapolated / N)}`);
