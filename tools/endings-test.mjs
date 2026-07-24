#!/usr/bin/env node
/* ===================================================
   tools/endings-test.mjs -- Headless gate for the P6-1
   terminal-resolution machinery (overhaul phase 6,
   endings round 1 + fix/retune round). Runs N seeds of
   the full daily loop (advanceRace + stepControlRegime +
   stepTreaty + checkResolution) over the 1008-day horizon
   with the day-1008 timeout extrapolation, and calibrates
   the WORLD-side terminal distribution.

   Player channels do not exist yet, so d_P == 0 -- these
   sections calibrate the WORLD-side distribution only.

   Sections:
     A. Family distribution vs the 02a tuning contract
     B. Liveness (every family >= 2% marginally)
     C. Knife-edge concentration: median |d| ~ 0.10
     D. Late determination (day-350 / day-700 oracle Brier)
     E. Ratchets bind sometimes, never always
     F. Plateau regressions (saturation FP, joint capture, cap)
     G. Determinism + resolution latch
     H. Treaty track (Deal, completion, window, leak, isolation)

   PROMOTE_DISTRIBUTION flips A/B/D from diagnostic to hard gates.
   Set true once the outcome-table retune (02a "Outcome-table
   levers") lands and the family table is inside the 02a bands.
   =================================================== */

import { createRaceState, advanceRace, stepControlRegime, heatValue } from '../src/race/race-state.js';
import { stepTreaty } from '../src/race/treaty-track.js';
import { checkResolution, HORIZON } from '../src/race/resolution.js';
import { buildPublicView } from '../src/race/consensus.js';

// A/B/D are hard gates post-retune (Part 2); diagnostic during the Part-1 fix baseline.
const PROMOTE_DISTRIBUTION = true;

// ---- CLI -----------------------------------------------------------------
const argv = process.argv.slice(2);
let N = 2000;
let BASE_SEED = 1;
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') BASE_SEED = parseInt(argv[++i], 10) >>> 0;
    else if (a === '--n' || a === '-n') N = parseInt(argv[++i], 10);
    else if (/^\d+$/.test(a)) N = parseInt(a, 10);
}

let failures = 0;
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok, detail, diag: false }); if (!ok) failures++; }
function diag(name, ok, detail = '') { results.push({ name, ok, detail, diag: true }); }
// A distribution/liveness/determination check: hard when promoted, else diagnostic.
function dist(name, ok, detail = '') { if (PROMOTE_DISTRIBUTION) check(name, ok, detail); else diag(name, ok, detail); }

const pct = (x) => (100 * x).toFixed(1) + '%';
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '  -- ');
const line = (s = '') => console.log(s);
function quantile(arr, p) {
    if (!arr.length) return NaN;
    const s = [...arr].sort((a, b) => a - b);
    const idx = p * (s.length - 1), lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

// ---- Run one seed to resolution (full orchestrated loop) -----------------
function runSeed(seed, capture) {
    const race = createRaceState(seed >>> 0);
    let detCount = 0, maxHeat = 0, sawSup = false, sawBlockade = false;
    let snap350 = null, snap700 = null, sawSummit = false;
    for (let d = 0; d < HORIZON && !race.resolution; d++) {
        advanceRace(race, { straitTension: 0 });
        stepControlRegime(race);
        stepTreaty(race, {});
        detCount += race.lastTransitions.incidents.detected.length;
        const h = heatValue(race.heat);
        if (h > maxHeat) maxHeat = h;         // RUN MAXIMUM of total heat (02a phase-6: not terminal)
        if (race.controlRegime === 'supervised') sawSup = true;   // for the family-4 drag composition
        if (race.lastTransitions.strait.blockadeStart) sawBlockade = true;   // for the blockade|f4 anti-correlation
        if (race.treaty.summitOpen) sawSummit = true;
        if (capture) {
            if (race.day === 350) snap350 = snapshot(race, detCount);
            if (race.day === 700) snap700 = snapshot(race, detCount);
        }
        if (checkResolution(race, null)) break;
    }
    if (!race.resolution) checkResolution(race, null);   // day-1008 timeout -> extrapolation
    return { race, res: race.resolution, snap350, snap700, sawSummit, maxHeat, sawSup, sawBlockade };
}

/** Observable-only snapshot for the oracle (public view + public heat proxy). */
function snapshot(race, detCount) {
    const v = buildPublicView(race);
    return {
        releasedRung: v.releasedFrontierRung,
        certifiedRung: v.certifiedFrontierRung,
        regimeRank: { private: 0, supervised: 1, mobilized: 2, nationalized: 3, classified: 3 }[v.controlRegime] || 0,
        detBucket: detCount < 20 ? 0 : detCount < 45 ? 1 : 2,   // coarse detected-incident tercile-ish
    };
}

// ---- Main ensemble -------------------------------------------------------
const t0 = Date.now();
const famAll = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };      // eventual family, all runs
const famInHorizon = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
let timeoutCount = 0, capHitCount = 0, unresolved = 0;
const absD = [];
const extrapDays = [];
// Ratchets (section E), measured on the run.
let natCount = 0, clsCount = 0, maxHeatRatchetCount = 0;
// Plateau regressions (section F).
let r5crossFam6 = 0;                     // family-6 confirmations on R5-crossers (must be 0)
let lowE = 0, lowEfam6InH = 0, lowEfam6Timeout = 0;   // true low-E capture split
const inHorizonPlateauDays = [];         // resolution day of in-horizon family-6 confirmations (F(iv))
// Treaty (section H).
let dealPossibleRuns = 0, dealRuns = 0, windowRuns = 0, windows = 0, windowsPass = 0;
let windowDealPossible = 0;              // dealPossible AND a window opened (for the leak posterior)
// Family-4 composition (feeds the epilogue prose): velocity vs drag vs theft-assisted.
const f4comp = { velocity: 0, drag: 0, theft: 0 };
// Blockade anti-correlation diagnostic (02a phase-6: blockades concentrate in
// slow-velocity worlds, family 4 in fast ones -- intended anti-correlation).
let blockadeRuns = 0, blockadeAndF4 = 0;
// Late-determination oracle (section D).
const oracleRows350 = [], oracleRows700 = [];

for (let i = 0; i < N; i++) {
    const seed = (BASE_SEED + i) >>> 0;
    const { race, res, snap350, snap700, maxHeat, sawSup, sawBlockade } = runSeed(seed, true);
    if (!res) { unresolved++; continue; }
    const fam = res.family;
    famAll[fam]++;
    if (sawBlockade) { blockadeRuns++; if (fam === 4) blockadeAndF4++; }
    if (res.extrapolated) { timeoutCount++; extrapDays.push(res.extrapolationDays); if (res.axes.hitCap) capHitCount++; }
    else famInHorizon[fam]++;
    absD.push(Math.abs(res.d));

    // Family-4 composition: theft-assisted first (a successful exfiltration closed
    // the gap), else fast-velocity worlds (hidden velocity > 1), else drag-assisted
    // (the run passed through supervised, which slowed the domestic frontier).
    if (fam === 4) {
        if (race.theftCount > 0) f4comp.theft++;
        else if (race.hidden.chinaTrue.velocity > 1.0) f4comp.velocity++;
        else if (sawSup) f4comp.drag++;
        else f4comp.velocity++;   // residual (slow-velocity, never-supervised): attribute to velocity
    }

    // Ratchets: {nationalized, classified, permanent max-heat} (02a phase-6 set).
    const reg = res.axes.politicalControl;
    if (reg === 'nationalized') natCount++;
    if (reg === 'classified') clsCount++;
    if (maxHeat >= 0.95) maxHeatRatchetCount++;   // permanent MAX heat (run-max near the 1.0 cap)

    // Plateau regressions.
    const r5crossed = res.axes.crossingEntity != null;
    if (fam === 6 && r5crossed) r5crossFam6++;
    if (fam === 6 && !res.extrapolated) inHorizonPlateauDays.push(res.day);
    if (race.hidden.scalingElasticity <= 0.60) {
        lowE++;
        if (fam === 6 && !res.extrapolated) lowEfam6InH++;
        else if (fam === 6 && res.extrapolated) lowEfam6Timeout++;
    }

    // Treaty.
    if (race.hidden.chinaTrue.dealPossible) dealPossibleRuns++;
    if (fam === 5) dealRuns++;
    if (race.treaty.windowOpened) {
        windowRuns++; windows++;
        if (race.treaty.summitPassed) windowsPass++;   // survived summit week clean (independent of dealPossible)
        if (race.hidden.chinaTrue.dealPossible) windowDealPossible++;
    }

    const split = (i % 2 === 0) ? 'train' : 'test';
    if (snap350) oracleRows350.push({ snap: snap350, fam, split });
    if (snap700) oracleRows700.push({ snap: snap700, fam, split });
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const resolved = N - unresolved;

// ---- Late-determination oracle (section D) -------------------------------
// Frequency table over coarse OBSERVABLE buckets (released rung x certified rung
// x regime rank x detected-tercile), train/test split across seeds; must NOT beat
// the prior's Brier by too much (knife-edge #3: determination is late).
function bucketKey(snap) { return [snap.releasedRung, snap.certifiedRung, snap.regimeRank, snap.detBucket].join('|'); }
function oracleImprovement(rows) {
    const train = rows.filter(r => r.split === 'train');
    const test = rows.filter(r => r.split === 'test');
    if (train.length < 50 || test.length < 50) return { improvement: 0, priorBrier: NaN, oracleBrier: NaN };
    const prior = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const r of train) prior[r.fam]++;
    for (const k of [1, 2, 3, 4, 5, 6]) prior[k] /= train.length;
    const buckets = {};
    for (const r of train) {
        const key = bucketKey(r.snap);
        if (!buckets[key]) buckets[key] = { n: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        buckets[key].n++; buckets[key][r.fam]++;
    }
    const brier = (probsFor) => {
        let sum = 0;
        for (const r of test) {
            const p = probsFor(r);
            for (const k of [1, 2, 3, 4, 5, 6]) { const y = (r.fam === k) ? 1 : 0; sum += (p[k] - y) ** 2; }
        }
        return sum / test.length;
    };
    const priorBrier = brier(() => prior);
    const oracleBrier = brier((r) => {
        const b = buckets[bucketKey(r.snap)];
        if (!b || b.n < 8) return prior;
        const p = {};
        for (const k of [1, 2, 3, 4, 5, 6]) p[k] = b[k] / b.n;
        return p;
    });
    const improvement = priorBrier > 0 ? (priorBrier - oracleBrier) / priorBrier : 0;
    return { improvement, priorBrier, oracleBrier };
}
const or350 = oracleImprovement(oracleRows350);
const or700 = oracleImprovement(oracleRows700);

// ---- Determinism + latch (section G) -------------------------------------
let determOK = true, latchOK = true, sawExtrapDeterm = false;
{
    for (let s = 0; s < Math.min(N, 40); s++) {
        const seed = (BASE_SEED + s) >>> 0;
        const a = runSeed(seed, false).race.resolution;
        const b = runSeed(seed, false).race.resolution;
        if (JSON.stringify(a) !== JSON.stringify(b)) determOK = false;
        if (a && a.extrapolated) sawExtrapDeterm = true;
    }
    const { race } = runSeed((BASE_SEED) >>> 0, false);
    const before = JSON.stringify(race.resolution);
    const again = checkResolution(race, null);
    if (again !== null || JSON.stringify(race.resolution) !== before) latchOK = false;
}

// ---- Treaty substream-isolation (section H) ------------------------------
// Full non-treaty RNG stream-state comparison (the gate's stronger probe): after
// the full horizon, the NEXT draw from every non-treaty substream must be
// identical (equal internal state), and the derived non-treaty state bit-identical.
function treatyIsolationOK(nSeeds) {
    const capState = (r) => JSON.stringify(['halcyon', 'tianxia', 'polaris'].map(id =>
        [r.capability.labs[id].C_internal, r.capability.labs[id].C_released, r.capability.labs[id].rungInternal, r.capability.labs[id].rungReleased])
        .concat([[r.capability.open.C, r.capability.open.rungInternal]]));
    for (let s = 0; s < nSeeds; s++) {
        const seed = (BASE_SEED + s) >>> 0;
        const on = createRaceState(seed); on.treatyEnabled = true;
        const off = createRaceState(seed); off.treatyEnabled = false;
        for (let d = 0; d < HORIZON; d++) { advanceRace(on, { straitTension: 0 }); stepTreaty(on, {}); }
        for (let d = 0; d < HORIZON; d++) { advanceRace(off, { straitTension: 0 }); stepTreaty(off, {}); }
        // Every non-treaty substream must be in an identical internal state.
        for (const name of ['capability', 'theft', 'certification', 'incidents', 'strait']) {
            if (on.streams[name].next() !== off.streams[name].next()) return false;
        }
        if (on.theftCount !== off.theftCount) return false;
        if (capState(on) !== capState(off)) return false;
        if (on.latentIncidents.length !== off.latentIncidents.length) return false;
        if (on.latentEvidence.length !== off.latentEvidence.length) return false;
        if (JSON.stringify(on.straitBlockade) !== JSON.stringify(off.straitBlockade)) return false;
        if (JSON.stringify(on.heat) !== JSON.stringify(off.heat)) return false;
    }
    return true;
}
const isolationPass = treatyIsolationOK(Math.min(N, 60));

// =========================================================================
// Checks
// =========================================================================
// 02a eventual-band RENORMALIZATION (2026-07-24): the original centers summed to
// 86 with timeout as a 14% bucket; under eventual accounting families sum to 100,
// so centers renormalize (÷0.86) with widths unchanged. Deal band 2.3-8%.
const CONTRACT = { 1: 0.14, 2: 0.21, 3: 0.32, 4: 0.14, 5: 0.05, 6: 0.14 };
const BANDS = { 1: 0.05, 2: 0.06, 3: 0.07, 4: 0.05, 6: 0.04 };
const DEAL_LO = 0.023, DEAL_HI = 0.08;   // Deal band 2.3-8% (renormalized; replaces 2-7)

// A-structural (HARD): every run resolves, buckets sum.
const bucketSum = famAll[1] + famAll[2] + famAll[3] + famAll[4] + famAll[5] + famAll[6];
check('A: every run resolves (no unresolved)', unresolved === 0, `${unresolved} unresolved`);
check('A: family buckets sum to resolved count', bucketSum === resolved, `${bucketSum} vs ${resolved}`);

// A-distribution: EVENTUAL families (in-horizon + extrapolated, per family) vs the
// 02a phase-6 bands; the timeout row is replaced by an extrapolation-SHARE statistic.
for (const k of [1, 2, 3, 4, 6]) {
    const got = famAll[k] / N, want = CONTRACT[k], band = BANDS[k];
    dist(`A: family ${k} eventual ${(want * 100).toFixed(0)}+-${(band * 100).toFixed(0)}pt`, Math.abs(got - want) <= band, pct(got));
}
{
    const got = famAll[5] / N;   // Deal: band 2.3-8% (02a renormalized)
    dist('A: family 5 eventual 5% (2.3-8)', got >= DEAL_LO && got <= DEAL_HI, pct(got));
}
{
    const share = timeoutCount / N;   // extrapolation share (02a phase-6: replaces the timeout row)
    dist('A: extrapolation share in [0.18, 0.32]', share >= 0.18 && share <= 0.32, pct(share));
}
{
    const f6ih = famInHorizon[6] / N;   // 02a phase-6: in-horizon family-6 expected ~0
    dist('A: in-horizon family-6 <= 3%', f6ih <= 0.03, pct(f6ih));
}

// B: liveness -- every family >= 2% marginally (eventual family).
for (const k of [1, 2, 3, 4, 5, 6]) {
    dist(`B: family ${k} live (>= 2% marginal)`, famAll[k] / N >= 0.02, pct(famAll[k] / N));
}

// C (HARD): knife-edge concentration -- median |d| ~ 0.10 (band 0.06-0.15).
const medAbsD = quantile(absD, 0.50);
check('C: median |d| in [0.06, 0.15]', medAbsD >= 0.06 && medAbsD <= 0.15, `median |d| = ${f3(medAbsD)}`);

// D: late determination -- oracle beats prior Brier by < 25% (day 350), < 60% (day 700).
dist('D: day-350 oracle improvement < 25%', or350.improvement < 0.25,
    `impr ${pct(or350.improvement)} (prior ${f3(or350.priorBrier)} -> oracle ${f3(or350.oracleBrier)})`);
dist('D: day-700 oracle improvement < 60%', or700.improvement < 0.60,
    `impr ${pct(or700.improvement)} (prior ${f3(or700.priorBrier)} -> oracle ${f3(or700.oracleBrier)})`);

// E (HARD): ratchet set {nationalized, classified, permanent max-heat} each < 50%,
// controlRegime terminals jointly < 25%. Heat is the RUN MAXIMUM.
check('E: nationalized < 50%', natCount / N < 0.50, pct(natCount / N));
check('E: classified < 50%', clsCount / N < 0.50, pct(clsCount / N));
check('E: permanent max-heat (run-max >= 0.95) < 50%', maxHeatRatchetCount / N < 0.50, pct(maxHeatRatchetCount / N));
check('E: controlRegime terminals jointly < 25%', (natCount + clsCount) / N < 0.25, pct((natCount + clsCount) / N));

// F (HARD): plateau regressions.
check('F(i): zero family-6 confirmations on R5-crossers', r5crossFam6 === 0, `${r5crossFam6}`);
const lowEfam6 = lowEfam6InH + lowEfam6Timeout;
check('F(ii): low-E (E<=0.60) joint capture (in-horizon U timeout) family 6 >> 71%',
    lowE === 0 || lowEfam6 / lowE > 0.71,
    lowE ? `${pct(lowEfam6 / lowE)} of ${lowE} (in-horizon ${lowEfam6InH}, timeout ${lowEfam6Timeout})` : 'no low-E runs');
const plateauP10 = quantile(inHorizonPlateauDays, 0.10);
check('F(iii): extrapolation cap fraction small (< 3%)', capHitCount / N < 0.03, `${pct(capHitCount / N)}`);
check('F(iv): in-horizon plateau confirmation days p10 >= 700',
    inHorizonPlateauDays.length === 0 || plateauP10 >= 700,
    inHorizonPlateauDays.length ? `p10 ${plateauP10.toFixed(0)} (n=${inHorizonPlateauDays.length})` : 'none in-horizon');

// G (HARD): determinism + latch.
check('G: same-seed resolution records identical (incl. extrapolated)', determOK,
    sawExtrapDeterm ? 'extrapolated run compared' : 'no extrapolated run in the determinism batch');
check('G: resolution latch (re-invoke is a no-op)', latchOK);

// H (HARD): treaty track.
const dealRate = dealRuns / N;
const completion = dealPossibleRuns ? dealRuns / dealPossibleRuns : 0;
const windowRate = windowRuns / N;
const summitPass = windows ? windowsPass / windows : 0;
const leakPosterior = windows ? windowDealPossible / windows : 0;   // P(dealPossible | window)
check('H: Deal rate in [0.023, 0.08]', dealRate >= DEAL_LO && dealRate <= DEAL_HI, pct(dealRate));
check('H: completion given eligible ~0.27 (band 0.20-0.34)', completion >= 0.20 && completion <= 0.34, f3(completion));
check('H: window rate in [0.25, 0.45]', windowRate >= 0.25 && windowRate <= 0.45, pct(windowRate));
check('H: leak-free P(dealPossible|window) within +-0.05 of 0.15', Math.abs(leakPosterior - 0.15) <= 0.05, f3(leakPosterior));
diag('H: summit-week-no-incident pass ~0.75', summitPass >= 0.65 && summitPass <= 0.85, `${f3(summitPass)} (n=${windows})`);
check('H: treaty substream isolation (full non-treaty stream states)', isolationPass);

// Blockade|family-4 anti-correlation (02a phase-6, DIAGNOSTIC non-gating): the
// shared desperation makes blockades concentrate in slow-velocity worlds and
// family 4 in fast ones, so P(blockade|f4) should be well below P(blockade).
const pBlock = blockadeRuns / N;
const pBlockGivenF4 = famAll[4] ? blockadeAndF4 / famAll[4] : 0;
diag('I: P(blockade|family 4) < P(blockade) (intended anti-correlation)', pBlockGivenF4 < pBlock,
    `P(blockade) ${pct(pBlock)}  P(blockade|f4) ${pct(pBlockGivenF4)}`);

// =========================================================================
// Report
// =========================================================================
line(`endings-test: N=${N}, base seed=${BASE_SEED}, horizon=${HORIZON}d, ${elapsed}s  `
    + `(distribution gates ${PROMOTE_DISTRIBUTION ? 'PROMOTED/hard' : 'diagnostic'})`);
line('='.repeat(72));
line('\nTerminal family distribution (EVENTUAL = in-horizon + extrapolated):');
line('  family        eventual   in-horizon   02a band');
for (const k of [1, 2, 3, 4, 5, 6]) {
    const band = k === 5 ? '2.3-8%' : (CONTRACT[k] * 100).toFixed(0) + '+-' + (BANDS[k] * 100).toFixed(0);
    line(`  ${k} ${['won-margin', 'knife-edge', 'misaligned', 'china-first', 'the-deal', 'the-fizzle'][k - 1].padEnd(12)} `
        + `${pct(famAll[k] / N).padStart(7)}   ${pct(famInHorizon[k] / N).padStart(8)}    ${band.padStart(7)}`);
}
line(`  extrapolation share       ${pct(timeoutCount / N).padStart(7)}   ${' '.repeat(8)}    ${'18-32%'.padStart(7)}`);
line(`  unresolved ${unresolved}`);
const totalF4 = f4comp.velocity + f4comp.drag + f4comp.theft;
line(`  family-4 composition (feeds epilogue prose): velocity ${f4comp.velocity} / drag ${f4comp.drag} / theft-present ${f4comp.theft}`
    + (totalF4 ? `  (${(100 * f4comp.velocity / totalF4).toFixed(0)}% / ${(100 * f4comp.drag / totalF4).toFixed(0)}% / ${(100 * f4comp.theft / totalF4).toFixed(0)}%)` : ''));
line(`  blockade anti-correlation: P(blockade) ${pct(blockadeRuns / N)}  P(blockade|family 4) ${pct(famAll[4] ? blockadeAndF4 / famAll[4] : 0)}  (intended: f4 < marginal)`);
line(`\n  median |d| = ${f3(medAbsD)}  (target ~0.10)   extrap days p50/p90/max: `
    + (extrapDays.length ? `${quantile(extrapDays, 0.5).toFixed(0)}/${quantile(extrapDays, 0.9).toFixed(0)}/${Math.max(...extrapDays)}` : '--'));
line(`  low-E family-6 capture: ${lowE ? pct(lowEfam6 / lowE) : '--'} (in-horizon ${lowEfam6InH}, timeout ${lowEfam6Timeout} of ${lowE})`
    + `   in-horizon plateau day p10 ${inHorizonPlateauDays.length ? plateauP10.toFixed(0) : '--'}`);
line(`  ratchets (run-max): nationalized ${pct(natCount / N)}  classified ${pct(clsCount / N)}  max-heat>=0.95 ${pct(maxHeatRatchetCount / N)}`);
line(`  treaty: dealPossible ${pct(dealPossibleRuns / N)}  Deal ${pct(dealRate)}  completion|eligible ${f3(completion)}  `
    + `window ${pct(windowRate)}  summit pass ${f3(summitPass)}  P(deal|window) ${f3(leakPosterior)}`);
line(`  late-determination oracle: day350 impr ${pct(or350.improvement)}  day700 impr ${pct(or700.improvement)}`);
line('='.repeat(72));
line('\nChecks:');
for (const r of results) {
    line(`  [${r.ok ? 'PASS' : 'MISS'}${r.diag ? '/DIAG' : '    '}] ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
}
line('='.repeat(72));
const diagMiss = results.filter(r => r.diag && !r.ok).length;
line(`HARD checks: ${failures === 0 ? 'ALL PASS' : failures + ' MISS'}${diagMiss ? `   |   DIAGNOSTIC misses: ${diagMiss}` : ''}`);
line(failures === 0 ? 'ENDINGS GATE: PASS' : 'ENDINGS GATE: FAIL -- see above');
process.exitCode = failures === 0 ? 0 : 1;
