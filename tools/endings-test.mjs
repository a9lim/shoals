#!/usr/bin/env node
/* ===================================================
   tools/endings-test.mjs -- Headless gate for the P6-1
   terminal-resolution machinery (overhaul phase 6,
   endings round 1 + fix/retune round). Runs N seeds of
   the full daily loop (advanceRace + stepControlRegime +
   stepTreaty + checkResolution) over the 1008-day horizon
   with the day-1008 timeout extrapolation, and calibrates
   the WORLD-side terminal distribution.

   The WORLD-side sections (A-I) run with NO player input, so
   d_P == 0 and d_eff == d_W -- they calibrate the world-side
   distribution and MUST keep passing untouched as P6-2 wires
   the player channels (the no-player world does not move).

   Sections:
     A. Family distribution vs the 02a tuning contract
     B. Liveness (every family >= 2% marginally)
     C. Knife-edge concentration: median |d| ~ 0.10
     D. Late determination (day-350 / day-700 oracle Brier)
     E. Ratchets bind sometimes, never always
     F. Plateau regressions (saturation FP, joint capture, cap)
     G. Determinism + resolution latch
     H. Treaty track (Deal, completion, window, leak, isolation)
     I. Blockade|family-4 anti-correlation (diagnostic)
     -- P6-2 player-channel sections (round 2) --
     J. No-player identity: d_P == 0, d_W == d_actual, d_eff == d_actual
     K. Ledger reconstruction audit + applyRaceEffects (synthetic)
     L. Bounded-influence clip: d_eff = d_W + clip(d_P, -(3/7)|d_W|, +(3/7)|d_W|)
     M. Constraint 2: max reachable |d_P| catches >= 40% of |d_W|

   PROMOTE_DISTRIBUTION flips A/B/D from diagnostic to hard gates.
   Set true once the outcome-table retune (02a "Outcome-table
   levers") lands and the family table is inside the 02a bands.
   =================================================== */

import { createRaceState, advanceRace, stepControlRegime, heatValue, RETUNE } from '../src/race/race-state.js';
import { stepTreaty } from '../src/race/treaty-track.js';
import { checkResolution, HORIZON } from '../src/race/resolution.js';
import { buildPublicView } from '../src/race/consensus.js';
import {
    ledger, resetLedger, deactivateLedger, freezeLedger,
    appendLedger, ledgerTotals, ledgerEntries, applyRaceEffects,
} from '../src/race/ledger.js';
import { COUPLING_TUNING } from '../src/race/coupling.js';
import { belief, initBelief, stepFirmBelief } from '../src/race/belief.js';

const clampFn = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const PLAYER_CLIP_FRAC = 3 / 7;   // 02a bounded-influence clip (mirrors resolution.js)

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
// P6-2 section J: no-player identity. The headless world passes no player input, so
// every resolution must carry d_P == 0, d_W == d_actual, and d_eff == d_actual (the
// player decomposition is provably inert when unfed -- the "no-player trajectory
// identity" the brief requires vs the committed P6-1 world).
let playerInertOK = true;

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

    // Section J: player channels unfed => d_P == 0 and d_eff == d_actual == d_W.
    const ax = res.axes;
    if (ax.dP !== 0 || ax.dW !== ax.dActual || res.d !== ax.dActual) playerInertOK = false;

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
// P6-2 player-channel sections (round 2)
// =========================================================================

// ---- J: no-player identity (tracked in the main ensemble) ----------------
check('J: no-player identity (d_P == 0, d_eff == d_W == d_actual, all runs)', playerInertOK);

// ---- K: ledger reconstruction audit + applyRaceEffects (synthetic) -------
// The complicity ledger records what capital DID, reconstructable from entries ALONE
// (the beliefCauses audit basis). Exercised with SYNTHETIC entries -- the live wiring
// (main.js appends) is node --check + live-game verified, never harness-gated.
let ledgerOK = true, ledgerDetail = '';
{
    resetLedger();
    appendLedger(10, 'C', 'cost_of_capital', 0.02, 'a');
    appendLedger(20, 'S', 'halcyon_osei_board', 0.05, 'S[halcyon]');
    appendLedger(20, 'heat', 'china_export_controls', 0.04, 'heat.transient');
    appendLedger(30, 'treaty', 'treaty_ratify', 1, 'treatyStage advance');
    appendLedger(40, 'F', 'advice_line', 0.03, 'firm belief (F)');
    appendLedger(40, 'C', 'cost_of_capital', 0.01, 'b');
    const zeroRow = appendLedger(50, 'C', 'cost_of_capital', 0, 'zero');   // must drop (no zero-effect rows)
    const tot = ledgerTotals();
    if (zeroRow !== null) { ledgerOK = false; ledgerDetail = 'zero row not dropped'; }
    else if (ledger.entries.length !== 6) { ledgerOK = false; ledgerDetail = 'entry count ' + ledger.entries.length; }
    else if (Math.abs(tot.C - 0.03) > 1e-12) { ledgerOK = false; ledgerDetail = 'C total ' + tot.C; }
    else if (Math.abs(tot.S - 0.05) > 1e-12) { ledgerOK = false; ledgerDetail = 'S total ' + tot.S; }
    else if (Math.abs(tot.treaty - 1) > 1e-12) { ledgerOK = false; ledgerDetail = 'treaty total ' + tot.treaty; }
    else if (ledgerEntries('C').length !== 2) { ledgerOK = false; ledgerDetail = 'C entries ' + ledgerEntries('C').length; }
    else {
        freezeLedger();   // seal: post-freeze appends drop (09 latch)
        if (appendLedger(60, 'C', 'x', 0.9) !== null || ledger.entries.length !== 6) { ledgerOK = false; ledgerDetail = 'freeze not sealing'; }
        deactivateLedger();   // inactive: everything drops
        if (appendLedger(70, 'C', 'x', 0.5) !== null) { ledgerOK = false; ledgerDetail = 'inactive append'; }
    }
}
check('K: ledger reconstruction + zero-drop + freeze + deactivate', ledgerOK, ledgerDetail);

// applyRaceEffects: whitelist, per-effect clamp, Tianxia floor, playerS tracking, heat clamp.
let raceEffOK = true, raceEffDetail = '';
{
    resetLedger();
    const race = { safety: { halcyon: 0.5, tianxia: 0.50, polaris: null },
        playerS: { halcyon: 0, tianxia: 0, polaris: 0 }, heat: { transient: 0.9 } };
    applyRaceEffects(race, [{ dial: 'velocity', amount: 1 }], 'x', 1);          // non-whitelisted dial -> ignored
    applyRaceEffects(race, [{ dial: 'S', lab: 'polaris', amount: 0.06 }], 'x', 1);   // unspawned Polaris -> no-op
    if (race.playerS.polaris !== 0) { raceEffOK = false; raceEffDetail = 'polaris unspawned wrote'; }
    applyRaceEffects(race, [{ dial: 'S', lab: 'halcyon', amount: 0.05 }], 'halcyon_osei_board', 2);
    if (Math.abs(race.safety.halcyon - 0.55) > 1e-12) { raceEffOK = false; raceEffDetail = 'S apply ' + race.safety.halcyon; }
    if (Math.abs(race.playerS.halcyon - 0.05) > 1e-12) { raceEffOK = false; raceEffDetail = 'playerS track'; }
    applyRaceEffects(race, [{ dial: 'S', lab: 'halcyon', amount: 0.4 }], 'x', 3);   // clamp 0.4 -> 0.15
    if (Math.abs(race.safety.halcyon - 0.70) > 1e-12) { raceEffOK = false; raceEffDetail = 'clamp ' + race.safety.halcyon; }
    applyRaceEffects(race, [{ dial: 'S', lab: 'tianxia', amount: -0.15 }], 'x', 4);   // Tianxia floors at S0
    if (Math.abs(race.safety.tianxia - RETUNE.S0_tianxia) > 1e-12) { raceEffOK = false; raceEffDetail = 'tianxia floor ' + race.safety.tianxia; }
    applyRaceEffects(race, [{ dial: 'heat', amount: 0.15 }], 'x', 5);   // heat clamps at 1.0 (0.9 -> 1.0, delta 0.10)
    if (Math.abs(race.heat.transient - 1.0) > 1e-12) { raceEffOK = false; raceEffDetail = 'heat clamp ' + race.heat.transient; }
    // Ledger reconstructs the applied (post-clamp) deltas exactly.
    const t = ledgerTotals();
    if (Math.abs(t.S - (0.05 + 0.15 + (RETUNE.S0_tianxia - 0.50))) > 1e-9) { raceEffOK = false; raceEffDetail = 'S ledger ' + t.S; }
    if (Math.abs(t.heat - 0.10) > 1e-9) { raceEffOK = false; raceEffDetail = 'heat ledger ' + t.heat; }
    deactivateLedger();
}
check('K: applyRaceEffects whitelist/clamp/floor/track/ledger', raceEffOK, raceEffDetail);

// P6-2 ruling 2 (NON-synthetic, gates the live fix): freeze is a MUTATION gate, not
// an append gate -- applyRaceEffects must be a FULL NO-OP (no S/heat/playerS mutation)
// while the ledger is frozen or inactive. Probed directly through applyRaceEffects.
let freezeNoopOK = true, freezeDetail = '';
{
    const frozenRace = () => ({ safety: { halcyon: 0.5, tianxia: 0.5, polaris: null },
        playerS: { halcyon: 0, tianxia: 0, polaris: 0 }, heat: { transient: 0.3 } });
    // Frozen ledger: mutation refused.
    resetLedger(); freezeLedger();
    let r = frozenRace();
    applyRaceEffects(r, [{ dial: 'S', lab: 'halcyon', amount: 0.05 }, { dial: 'heat', amount: 0.1 }], 'x', 1);
    if (r.safety.halcyon !== 0.5 || r.playerS.halcyon !== 0 || r.heat.transient !== 0.3 || ledger.entries.length !== 0) {
        freezeNoopOK = false; freezeDetail = `frozen mutated S=${r.safety.halcyon} heat=${r.heat.transient} rows=${ledger.entries.length}`;
    }
    // Inactive ledger (Classic / no race): also a full no-op.
    deactivateLedger();
    r = frozenRace();
    applyRaceEffects(r, [{ dial: 'S', lab: 'halcyon', amount: 0.05 }], 'x', 1);
    if (r.safety.halcyon !== 0.5 || r.playerS.halcyon !== 0) { freezeNoopOK = false; freezeDetail = 'inactive mutated ' + r.safety.halcyon; }
}
check('K: freeze/inactive is a mutation gate (applyRaceEffects full no-op)', freezeNoopOK, freezeDetail);

// P6-2 ruling 1 (NON-synthetic, gates the live fix): stepFirmBelief EXPOSES the F
// decomposition and the autonomous B-wake is NEVER attributed to the player. Probed
// through a REAL stepFirmBelief call: a fresh player (no locks => credibility 0) gets
// zero conversion, so the whole applied F move is autonomous wake -- lastFConvert == 0
// while F still moved -- and (lastFWake + lastFConvert) == the applied delta exactly.
let fDecompOK = true, fDecompDetail = '';
const fail = (m) => { if (fDecompOK) { fDecompOK = false; fDecompDetail = m; } };
{
    const race = createRaceState(BASE_SEED >>> 0);
    initBelief(race);                       // fresh player: credibility 0, no locks
    race.F = 20;                            // interior, below marketPilled so wake moves it up
    let F0 = race.F;
    stepFirmBelief(race);
    let applied = race.F - F0;
    if (Math.abs(applied) < 1e-9) fail('F did not move (probe vacuous)');
    else if (Math.abs(race.lastFConvert || 0) > 1e-12) fail('player charged for autonomous wake: ' + race.lastFConvert);
    else if (Math.abs((race.lastFWake + race.lastFConvert) - applied) > 1e-9) fail('decomposition != applied');
    // Conversion path: inject positive credibility + a pilled stance -> player term nonzero, sum still holds.
    belief.player.credibility = 0.6;
    race.F = 20; F0 = race.F;
    stepFirmBelief(race, { playerPilled: 100 });   // max-pilled, above F -> positive conversion
    if (!(race.lastFConvert > 0)) fail('convert term not exposed/positive');
    else if (Math.abs((race.lastFWake + race.lastFConvert) - (race.F - F0)) > 1e-9) fail('convert-path sum');

    // EXACT CANCELLATION (the amended-ruling regression): wake and conversion exactly
    // oppose in an unclamped interior step -- the player PREVENTED the autonomous move.
    // Construction: force marketPilled() == 0 (crossed R4, far-future certDay), F0=12.5,
    // credibility 1/6, playerPilled=100 -> wake = 0.08*(0-12.5) = -1, convert = 6*(1/6)*(+1)
    // = +1, rawTotal == 0 exactly, F unchanged. The OLD `applied/rawTotal` form set
    // scale=0 and erased BOTH stamps (laundering the involvement). The fix records the
    // raw offsetting terms.
    belief.rungs[4] = { crossed: true, certDay: Number.MAX_SAFE_INTEGER };   // marketPilled == 0
    belief.player.credibility = 1 / 6;
    race.F = 12.5;
    stepFirmBelief(race, { playerPilled: 100 });
    if (race.F !== 12.5) fail('cancellation moved F: ' + race.F);
    else if (race.lastFConvert !== 1 || race.lastFWake !== -1) fail(`cancellation stamps erased/wrong: wake ${race.lastFWake} convert ${race.lastFConvert}`);
    else if (race.lastFWake + race.lastFConvert !== 0) fail('cancellation sum != 0');

    // UPPER RAIL: both terms positive, unclamped target > 100 -> clamp binds -> the two
    // stamps apportion the haircut and still sum to the applied (+1) delta.
    belief.rungs[4] = { crossed: true, certDay: 0 };   // marketPilled == 100
    belief.player.credibility = 0.5;
    race.F = 99; F0 = race.F;
    stepFirmBelief(race, { playerPilled: 100 });        // wake +0.08, convert +3 -> Fraw 102.08 -> clamp 100
    applied = race.F - F0;
    if (race.F !== 100) fail('upper rail did not clamp: ' + race.F);
    else if (Math.abs((race.lastFWake + race.lastFConvert) - applied) > 1e-9) fail('upper-rail sum != applied');
    else if (!(race.lastFWake > 0 && race.lastFConvert > 0)) fail('upper-rail stamps lost sign');

    // LOWER RAIL: both terms negative, unclamped target < 0 -> clamp binds -> stamps
    // apportion and sum to the applied (-1) delta.
    belief.rungs[4] = { crossed: true, certDay: Number.MAX_SAFE_INTEGER };   // marketPilled == 0
    belief.player.credibility = 0.5;
    race.F = 1; F0 = race.F;
    stepFirmBelief(race, { playerPilled: 0 });          // wake -0.08, convert -3 -> Fraw -2.08 -> clamp 0
    applied = race.F - F0;
    if (race.F !== 0) fail('lower rail did not clamp: ' + race.F);
    else if (Math.abs((race.lastFWake + race.lastFConvert) - applied) > 1e-9) fail('lower-rail sum != applied');
    else if (!(race.lastFWake < 0 && race.lastFConvert < 0)) fail('lower-rail stamps lost sign');
}
check('K: F decomposition -- interior/cancellation/both rails (stamps survive, sum == applied)', fDecompOK, fDecompDetail);

// ---- L: bounded-influence clip (verbatim d_eff formula) ------------------
// Inject a large synthetic playerS on every lab so the LEADER's d_P_S dominates
// (~0.4 >> (3/7)|d_W|), forcing the clip to bind, then verify resolution.js applies
// the VERBATIM formula d_eff = d_W + clip(d_P, -(3/7)|d_W|, +(3/7)|d_W|) on res.axes.
// The injection is read ONLY at resolution (never during the run), so the world
// trajectory is unchanged -- a pure decomposition + clip-transcription audit.
let clipIdentityOK = true, clipBindCount = 0, clipN = 0, clipDetail = '';
const CLIP_BATCH = Math.min(N, 1200);
for (let i = 0; i < CLIP_BATCH; i++) {
    const race = createRaceState((BASE_SEED + i) >>> 0);
    for (const k of ['halcyon', 'tianxia', 'polaris']) if (race.playerS[k] != null) race.playerS[k] = 0.4;
    race.playerCumC = 0.1;
    for (let d = 0; d < HORIZON && !race.resolution; d++) {
        advanceRace(race, { straitTension: 0 });
        stepControlRegime(race);
        stepTreaty(race, {});
        if (checkResolution(race, null)) break;
    }
    if (!race.resolution) checkResolution(race, null);
    const a = race.resolution.axes, dEff = race.resolution.d;
    clipN++;
    if (Math.abs(a.dP - (a.dP_S + a.dP_C)) > 1e-9) { clipIdentityOK = false; clipDetail = 'dP decomposition sum'; }
    else if (Math.abs(a.dW - (a.dActual - a.dP)) > 1e-9) { clipIdentityOK = false; clipDetail = 'dW != dActual - dP'; }
    else {
        const ref = a.dW + clampFn(a.dP, -PLAYER_CLIP_FRAC * Math.abs(a.dW), PLAYER_CLIP_FRAC * Math.abs(a.dW));
        if (Math.abs(dEff - ref) > 1e-9) { clipIdentityOK = false; clipDetail = `d_eff ${f3(dEff)} vs ref ${f3(ref)}`; }
    }
    if (Math.abs(dEff - a.dActual) > 1e-9) clipBindCount++;   // clip changed the effective distance
}
check('L: bounded-influence clip verbatim (d_eff = d_W + clip(d_P, +-3/7|d_W|))', clipIdentityOK, clipDetail);
check('L: clip binds (d_eff != d_actual) on the max-injection batch', clipBindCount > 0.5 * clipN,
    `${clipBindCount}/${clipN} bound`);

// ---- M: constraint 2 (channel authority vs the knife-edge |d_W|) ---------
// The player channels must move a MEANINGFUL fraction of the knife-edge world: the max
// reachable |d_P| (a maximal LONG threaded at the coupling cap, plus one max S[halcyon])
// must catch >= 40% of the world |d_W| distribution. |d_W| is the no-player |d| (section
// J), already in absD. playerCoupling=cap from day 0 is the absolute long ceiling (the
// realistic halflife-50 ramp differs negligibly over the 1008d horizon). Reachable ceiling
// = p90 of the max-player |d_P| (robust; not a single lucky-seed max).
const CAP = COUPLING_TUNING.cap;
const M_BATCH = Math.min(N, 1200);
const maxPlayerAbsDP = [];
for (let i = 0; i < M_BATCH; i++) {
    const race = createRaceState((BASE_SEED + i) >>> 0);
    if (race.safety.halcyon != null) { race.safety.halcyon = Math.min(1, race.safety.halcyon + 0.05); race.playerS.halcyon += 0.05; }
    for (let d = 0; d < HORIZON && !race.resolution; d++) {
        advanceRace(race, { straitTension: 0, playerCoupling: CAP });
        stepControlRegime(race);
        stepTreaty(race, {});
        if (checkResolution(race, null)) break;
    }
    if (!race.resolution) checkResolution(race, null);
    maxPlayerAbsDP.push(Math.abs(race.resolution.axes.dP));
}
const maxReachableDP = quantile(maxPlayerAbsDP, 0.90);
const medDW = quantile(absD, 0.50);
const coverage = absD.filter(x => x <= maxReachableDP).length / absD.length;
diag('M: world |d_W| median in [0.135, 0.155] (final-retune 0.143-0.148)', medDW >= 0.135 && medDW <= 0.155, f3(medDW));
check('M: constraint 2 -- max reachable |d_P| catches >= 40% of |d_W|', coverage >= 0.40,
    `cap ${CAP}  max|dP| p90 ${f3(maxReachableDP)}  coverage ${pct(coverage)}`);

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
line(`\n  P6-2 player channels (cap ${CAP}, halflife ${COUPLING_TUNING.halflife}d):`);
line(`    no-player identity (J): ${playerInertOK ? 'inert (d_P == 0 all runs)' : 'VIOLATED'}`);
line(`    constraint 2 (M): world |d_W| median ${f3(medDW)}  |  max reachable |d_P| p90 ${f3(maxReachableDP)}  |  coverage ${pct(coverage)} (>= 40%)`);
line(`    clip (L): binds on ${clipBindCount}/${clipN} of the max-injection batch (verbatim d_eff identity ${clipIdentityOK ? 'holds' : 'VIOLATED'})`);
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
