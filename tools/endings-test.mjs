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
     -- P6-3 closeout + endings sections --
     N. Closeout matrix conservation (every family x regime x instrument cell)
     O. Consensus terminal finalizer (outcomes + idempotent exactly-once)
     P. Compute terminal finalizer (held-past-resolution settles once)
     Q. Player-terminal -> extrapolation -> closeout e2e (3 seeds)
     R. Nationalization reference (multiple range, frozen once, conversion vs decree)

   PROMOTE_DISTRIBUTION flips A/B/D from diagnostic to hard gates.
   Set true once the outcome-table retune (02a "Outcome-table
   levers") lands and the family table is inside the 02a bands.
   =================================================== */

import { createRaceState, advanceRace, stepControlRegime, heatValue, RETUNE, setControlRegime } from '../src/race/race-state.js';
import { stepTreaty } from '../src/race/treaty-track.js';
import { checkResolution, resolveNow, HORIZON } from '../src/race/resolution.js';
import {
    buildPublicView, initConsensus, resetConsensus, finalizeConsensusTerminal,
    frontierCertifiedDay,
} from '../src/race/consensus.js';
import {
    initComputeMarket, finalizeComputeTerminal, getNationalizationReference,
    freezeNationalizationReference, stepNationalizationRef, COMPUTE_MULTIPLIER,
} from '../src/race/compute-market.js';
import {
    hcnTerminalMark, closeoutUnitValue, closeoutPosition, closeoutBook, CLOSEOUT_TUNING,
} from '../src/race/closeout.js';
import { applyBinarySettlementRows } from '../src/portfolio.js';
import { determineOverlay, isTerminalSafeBeat } from '../src/endings.js';
import { getEventById } from '../src/events/index.js';
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
// P6-3 closeout + endings sections
// =========================================================================

// ---- N: closeout matrix conservation (every family x regime x instrument) --
// The conserving invariant (Codex): a position converts to cash at its terminal
// unit value u -- cashChange = signedQty*u + reservedReturned -- so terminal
// pre-closeout equity (signed MTM at the mark + reserved escrow) EQUALS post-closeout
// cash, basis-free. Drive every cell; also check mark-leg zero-sum, entryPrice cash-
// invariance, bond impact-independence, fizzle determinism, and conversion reference.
let closeoutOK = true, coDetail = '', coCells = 0;
{
    const race = createRaceState(BASE_SEED >>> 0);
    // Synthesize a frozen nationalization reference for the conversion cells.
    race.nationalizationRef = { multiple: 0.9, window: [], frozen: { day: 500, median: 120, multiple: 0.9, reference: 108, sessions: 20 } };
    const regimes = ['private', 'supervised', 'mobilized', 'nationalized', 'classified'];
    const families = [1, 2, 3, 4, 5, 6];
    const specs = [
        { type: 'stock', qty: 10, strike: undefined, entryPrice: 90 },
        { type: 'call', qty: 5, strike: 95, entryPrice: 8 },
        { type: 'put', qty: 5, strike: 110, entryPrice: 7 },
        { type: 'vxhcnfuture', qty: 3, strike: undefined, entryPrice: 20 },
        { type: 'bond', qty: 4, strike: undefined, expiryDay: 900, entryPrice: 97 },
    ];
    const spot = 100, varianceIndex = 22;
    // Rate-MOVED bond params -> the Vasicek MTM is NOT par (99.2), so non-doom bonds
    // must carry the MTM (02a P6-3 ruling), not redeem at face.
    const bond = { rate: 0.055, a: 0.15, b: 0.03, sigmaR: 0.01, day: 400, face: 100 };
    const fail = (m) => { if (closeoutOK) { closeoutOK = false; coDetail = m; } };
    for (const family of families) {
        for (const regime of regimes) {
            const hcn = hcnTerminalMark(family, regime, race, spot);
            const ctx = { family, regime, hcnMark: hcn.mark, varianceIndex, bond };
            for (const s of specs) {
                coCells++;
                const long = closeoutPosition({ id: 1, ...s }, ctx);
                const short = closeoutPosition({ id: 2, ...s, qty: -s.qty }, ctx);
                const u = long.unitValue;
                if (!Number.isFinite(u) || u < 0) { fail(`nonfinite/neg u ${family}/${regime}/${s.type}`); continue; }
                // pre/post equity equality: cashChange == signedQty*u + reserved (reserved 0 here).
                if (Math.abs(long.cashChange - long.qty * u) > 1e-9) fail(`equity long ${s.type}`);
                if (Math.abs(short.cashChange - short.qty * u) > 1e-9) fail(`equity short ${s.type}`);
                // mark-leg zero-sum across offsetting sides (no reserved).
                if (Math.abs(long.cashChange + short.cashChange) > 1e-9) fail(`mark-leg ${s.type}`);
                // entryPrice cash-invariance (P&L may differ).
                const long2 = closeoutPosition({ id: 3, ...s, entryPrice: s.entryPrice + 25 }, ctx);
                if (Math.abs(long2.cashChange - long.cashChange) > 1e-9) fail(`entryPrice cash-variance ${s.type}`);
                if (Math.abs(long2.pnl - long.pnl) < 1e-9 && s.entryPrice + 25 !== s.entryPrice) fail(`pnl basis-invariant ${s.type}`);
            }
        }
    }
    // reserved escrow release: short at u with collateral returns reserved - |qty|*u.
    const sr = closeoutPosition({ id: 4, type: 'stock', qty: -10, entryPrice: 90, _reservedMargin: 700 },
        { family: 1, regime: 'private', hcnMark: 160, varianceIndex, bond });
    if (Math.abs(sr.cashChange - (700 - 10 * 160)) > 1e-9) fail('reserved escrow');
    // bond: non-doom carries the impact-free Vasicek MTM (NOT par); doom recovers on FACE.
    const bondPos = { type: 'bond', qty: 1, expiryDay: 900 };
    const bondSafe = closeoutUnitValue(bondPos, { family: 5, bond });   // MTM at rate 0.055, dte (900-400)/252
    const bondDoom = closeoutUnitValue(bondPos, { family: 3, bond });
    if (!(bondSafe > 0) || Math.abs(bondSafe - bond.face) < 1e-6) fail(`bond non-doom not MTM (par-like ${f3(bondSafe)})`);
    if (Math.abs(bondDoom - bond.face * CLOSEOUT_TUNING.bondDoomRecovery) > 1e-9) fail('bond doom recovery on face');
    // bond MTM is impact-free/tree-free: unchanged when only unrelated market state moves.
    const bondSafe2 = closeoutUnitValue(bondPos, { family: 5, bond });
    if (bondSafe2 !== bondSafe) fail('bond MTM not deterministic/pure');
    // fizzle determinism + no race-stream mutation.
    const streamsBefore = JSON.stringify(createRaceState(77).streams);
    const rf = createRaceState(77);
    const m1 = hcnTerminalMark(6, 'private', rf, 100).mark;
    const m2 = hcnTerminalMark(6, 'private', createRaceState(77), 100).mark;
    if (m1 !== m2) fail('fizzle non-deterministic');
    if (JSON.stringify(rf.streams) !== streamsBefore) fail('fizzle mutated race streams');
    // conversion with NO frozen reference -> converted, NOT a family mark.
    const noRef = createRaceState(9);   // nationalizationRef undefined (initComputeMarket not called)
    const cNo = hcnTerminalMark(3, 'nationalized', noRef, 100);
    if (!cNo.converted || cNo.cell !== 'hcn:conversion-unavailable') fail('no-ref not flagged converted');
    if (Math.abs(cNo.mark - 100 * CLOSEOUT_TUNING.doomRecovery) < 1e-9) fail('no-ref silently used doom family mark');
    // conversion WITH reference uses reference, never the compute multiplier.
    const cYes = hcnTerminalMark(1, 'nationalized', race, 100);
    if (!cYes.converted || Math.abs(cYes.mark - 108) > 1e-9) fail('conversion not at reference');
}
check(`N: closeout matrix conservation (${coCells} cells: equity==cash, mark zero-sum, basis-invariant, conversion)`, closeoutOK, coDetail);

// ---- O: consensus terminal finalizer (outcomes + idempotent exactly-once) ---
let consFinOK = true, cfDetail = '';
{
    const fail = (m) => { if (consFinOK) { consFinOK = false; cfDetail = m; } };
    const setup = (mut) => {
        const race = createRaceState(BASE_SEED >>> 0);
        initConsensus(race);
        mut(race);
        return race;
    };
    const byKey = (rows) => Object.fromEntries(rows.map(r => [r.contract.predicate.rung + (r.contract.terminal ? 'T' : 'C'), r.outcome]));
    // R5 crossed by its deadline -> YES; a cert rung certified by deadline -> YES.
    let race = setup(r => {
        r.capability.labs.halcyon.rungInternal[5] = 900;   // R5 internal cross before deadline (1000)
        r.capability.labs.halcyon.rungCertified[2] = 100;  // R2 certified before its deadline (420)
    });
    let rows = finalizeConsensusTerminal(race);
    let o = byKey(rows);
    if (o['5T'] !== 'YES') fail('R5 crossed-by-deadline not YES');
    if (o['2C'] !== 'YES') fail('R2 certified not YES');
    if (o['3C'] !== 'NO') fail('R3 uncertified not NO');
    // idempotent: second call settles nothing.
    if (finalizeConsensusTerminal(race).length !== 0) fail('finalizer not idempotent');
    // R5 crossing AFTER the deadline -> NO (judged on deadline, not race.day).
    race = setup(r => { r.capability.labs.halcyon.rungInternal[5] = 1200; r.day = 1300; });
    o = byKey(finalizeConsensusTerminal(race));
    if (o['5T'] !== 'NO') fail('R5 post-deadline crossing paid YES');
    // fallback regime (nationalized) settles EVERYTHING at FALLBACK.
    race = setup(r => { r.controlRegime = 'nationalized'; r.capability.labs.halcyon.rungInternal[5] = 900; });
    const allFb = finalizeConsensusTerminal(race).every(r => r.outcome === 'FALLBACK');
    if (!allFb) fail('fallback regime not all FALLBACK');
}
check('O: consensus terminal finalizer (deadline-judged outcomes + fallback + idempotent)', consFinOK, cfDetail);

// ---- P: compute terminal finalizer (held-past-resolution settles once) ------
let compFinOK = true, pDetail = '';
{
    const fail = (m) => { if (compFinOK) { compFinOK = false; pDetail = m; } };
    const race = createRaceState(BASE_SEED >>> 0);
    initComputeMarket(race, null);
    // Held contracts exist from listing; a private-regime terminal settles them all.
    const s1 = finalizeComputeTerminal(race, null);
    if (s1.length === 0) fail('no compute contracts settled at terminal');
    if (!s1.every(s => s.kind === 'TERMINAL' && Number.isFinite(s.settlePrice))) fail('non-TERMINAL / nonfinite settle');
    // idempotent.
    if (finalizeComputeTerminal(race, null).length !== 0) fail('compute finalizer not idempotent');
    // decree regime settles at DECREE.
    const race2 = createRaceState((BASE_SEED + 1) >>> 0);
    initComputeMarket(race2, null);
    race2.controlRegime = 'nationalized';
    const s2 = finalizeComputeTerminal(race2, null);
    if (!s2.every(s => s.kind === 'DECREE')) fail('nationalized not DECREE');
}
check('P: compute terminal finalizer (held settles TERMINAL / DECREE, idempotent)', compFinOK, pDetail);

// ---- Q: player-terminal -> extrapolation -> closeout e2e (3 seeds) ----------
let e2eOK = true, qDetail = '';
{
    const fail = (m) => { if (e2eOK) { e2eOK = false; qDetail = m; } };
    for (const seed of [1, 90210, 424242]) {
        const race = createRaceState(seed >>> 0);
        initConsensus(race);
        initComputeMarket(race, null);
        resetLedger();   // active, so resolveNow's freeze is observable
        // Run to an EARLY day (desk ejects mid-race), stopping if the world resolves first.
        for (let d = 0; d < 300 && !race.resolution; d++) {
            advanceRace(race, { straitTension: 0 });
            stepControlRegime(race);
            stepTreaty(race, {});
            checkResolution(race, null);
        }
        // Eject: force resolution NOW (extrapolate if still racing) -> must resolve + freeze ledger.
        const res = resolveNow(race, null);
        if (!res || !race.resolution) fail(`seed ${seed}: no resolution`);
        else if (!ledger.frozen) fail(`seed ${seed}: ledger not frozen at resolve`);
        // Close the books: finalizers idempotent + a synthetic HCN/option/vxhcn/bond book conserves.
        finalizeConsensusTerminal(race);
        finalizeComputeTerminal(race, null);
        const positions = [
            { id: 1, type: 'stock', qty: 8, entryPrice: 95 },
            { id: 2, type: 'call', qty: 4, strike: 100, entryPrice: 6 },
            { id: 3, type: 'vxhcnfuture', qty: -2, entryPrice: 21, _reservedMargin: 120 },
            { id: 4, type: 'bond', qty: 5, expiryDay: 950, entryPrice: 98 },
        ];
        // Rate-moved bond params -> the bond leg carries a Vasicek MTM != par; conservation
        // (equity == cash) must still hold with the MTM leg (02a P6-3 ruling test (a)).
        const bond = { rate: 0.055, a: 0.15, b: 0.03, sigmaR: 0.01, day: 400, face: 100 };
        const book = closeoutBook(positions, res, race, { spot: 100, varianceIndex: 22, bond });
        const bondRow = book.rows.find(r => r.type === 'bond');
        if (bondRow && Math.abs(bondRow.unitValue - bond.face) < 1e-6) fail(`seed ${seed}: bond leg redeemed at par, not MTM`);
        // pre-closeout equity contribution (signed MTM at mark + reserved) == post cash.
        let pre = 0;
        for (const r of book.rows) {
            const pos = positions.find(p => p.id === r.id);
            pre += r.qty * r.unitValue + (pos._reservedMargin || 0);
        }
        if (Math.abs(pre - book.totalCash) > 1e-6) fail(`seed ${seed}: closeout equity!=cash (${pre} vs ${book.totalCash})`);
        if (book.rows.length !== 4) fail(`seed ${seed}: not all legs valued`);
    }
}
check('Q: player-terminal -> extrapolation -> closeout e2e (resolves, freezes, conserves; 3 seeds)', e2eOK, qDetail);

// ---- R: nationalization reference (range, frozen once, conversion vs decree) -
let natRefOK = true, rDetail = '';
{
    const fail = (m) => { if (natRefOK) { natRefOK = false; rDetail = m; } };
    for (const seed of [1, 90210, 424242, 7, 55]) {
        const race = createRaceState(seed >>> 0);
        initComputeMarket(race, null);
        const mult = race.nationalizationRef.multiple;
        if (!(mult >= 0.60 && mult <= 1.15)) fail(`seed ${seed}: multiple ${mult} out of [0.60,1.15]`);
    }
    const race = createRaceState(BASE_SEED >>> 0);
    initComputeMarket(race, null);
    for (let d = 0; d < 30; d++) { race.day = d; stepNationalizationRef(race, 100 + d); }
    const frozen1 = freezeNationalizationReference(race, 30);
    const frozen2 = freezeNationalizationReference(race, 40);   // second freeze: first wins
    if (frozen1 !== frozen2) fail('reference re-froze');
    if (frozen1.reference == null || Math.abs(frozen1.reference - frozen1.median * frozen1.multiple) > 1e-9) fail('reference != median*multiple');
    // Conversion mark uses the reference; the compute multiplier is a SEPARATE constant (1).
    const conv = hcnTerminalMark(3, 'nationalized', race, 100);
    if (Math.abs(conv.mark - frozen1.reference) > 1e-9) fail('conversion not at frozen reference');
    if (COMPUTE_MULTIPLIER === race.nationalizationRef.multiple) fail('compute multiplier collided with nat multiple');
}
check('R: nationalization reference (multiple in range, frozen once, conversion vs decree separate)', natRefOK, rDetail);

// ---- S: ejection-invariance -- the desk's presence never changes the oracle -
// 02a P6-3 ruling 2: an early ejection extrapolates the world forward; a certification
// that lands INSIDE the extrapolated trajectory before a contract's deadline settles
// that contract YES, exactly as if the desk had stayed. So the SAME seed settles
// IDENTICALLY whether the desk ejects early (finalize against the extrapolated world)
// or plays to the natural resolution. Non-vacuous: at least one seed must have a
// contract certified AFTER the ejection day, and its YES must survive.
let ejInvOK = true, sDetail = '', nonVacuous = 0, seedsChecked = 0;
{
    const fail = (m) => { if (ejInvOK) { ejInvOK = false; sDetail = m; } };
    const EJECT_DAY = 200;
    // Settle the same race with a FRESH consensus book (finalizeConsensusTerminal reads
    // the persistent capability state, not the daily pass -- so the ONLY input is the
    // final world). key -> outcome.
    const settleOutcomes = (race) => {
        initConsensus(race);   // fresh contract set on this race's public view
        const rows = finalizeConsensusTerminal(race);
        return Object.fromEntries(rows.map(r => [r.key, r.outcome]));
    };
    for (let i = 0; i < Math.min(N, 200); i++) {
        const seed = (BASE_SEED + i) >>> 0;
        // Path A: run to EJECT_DAY, then resolveNow (extrapolate forward).
        const rA = createRaceState(seed);
        for (let d = 0; d < EJECT_DAY && !rA.resolution; d++) {
            advanceRace(rA, { straitTension: 0 }); stepControlRegime(rA); stepTreaty(rA, {}); checkResolution(rA, null);
        }
        const certAtEject = { ...rA.capability.labs.halcyon.rungCertified };   // cert snapshot at ejection
        resolveNow(rA, null);
        const outA = settleOutcomes(rA);
        // Path B: same seed, run to natural resolution (no ejection).
        const rB = createRaceState(seed);
        for (let d = 0; d < HORIZON && !rB.resolution; d++) {
            advanceRace(rB, { straitTension: 0 }); stepControlRegime(rB); stepTreaty(rB, {}); checkResolution(rB, null);
        }
        if (!rB.resolution) checkResolution(rB, null);
        const outB = settleOutcomes(rB);
        seedsChecked++;
        // Identical settlement, contract by contract.
        const keys = new Set([...Object.keys(outA), ...Object.keys(outB)]);
        for (const k of keys) if (outA[k] !== outB[k]) { fail(`seed ${seed}: contract ${k} A=${outA[k]} B=${outB[k]}`); break; }
        // Non-vacuous: a rung certified strictly AFTER the ejection day whose contract settled YES.
        for (const r of [2, 3, 4]) {
            const cd = rB.capability.labs.halcyon.rungCertified[r] ?? rB.capability.labs.tianxia.rungCertified[r];
            if (cd != null && cd > EJECT_DAY && certAtEject[r] == null && Object.values(outA).includes('YES')) { nonVacuous++; break; }
        }
    }
    // At least one seed exercised the post-ejection-certification -> YES path.
    if (nonVacuous === 0) fail('vacuous: no post-ejection certification settled YES in any seed');
    // Credibility scoring routes through applyBinarySettlementRows: every matured YES/NO
    // is scored exactly once (the shape the shared consequence helper consumes).
    const rc = createRaceState(BASE_SEED >>> 0);
    initConsensus(rc); initBelief(rc);
    for (let d = 0; d < HORIZON && !rc.resolution; d++) {
        advanceRace(rc, { straitTension: 0 }); stepControlRegime(rc); stepTreaty(rc, {}); checkResolution(rc, null);
    }
    if (!rc.resolution) checkResolution(rc, null);
    const finRows = finalizeConsensusTerminal(rc);
    const yesNo = finRows.filter(r => r.outcome === 'YES' || r.outcome === 'NO').length;
    const { matured } = applyBinarySettlementRows(finRows);
    if (matured.length !== yesNo) fail(`matured ${matured.length} != YES/NO ${yesNo} (scoring not routed exactly-once)`);
    // second application scores nothing (exactly-once).
    if (applyBinarySettlementRows(finRows).matured.length !== 0) fail('re-apply re-scored (not exactly-once)');
}
check(`S: ejection-invariance (desk presence never changes the oracle; ${seedsChecked} seeds, ${nonVacuous} non-vacuous)`, ejInvOK, sDetail);

// ---- T: natural-resolution atomic closeout (02a P6-3: interim SUPERSEDED) ---
// A world that resolves BEFORE term now enters the SAME atomic path as ejection --
// latch (freeze ledger before marking) -> closeout AT the resolution-time regime ->
// epilogue -- instead of running on with a drifting regime the delayed finalizers
// would misread. Gated: natural-resolution conservation; ledger frozen at resolution;
// the Deal treaty-outcome stamp carried across the latch (the bridge fires treaty_holds
// before the epilogue); and the finalizer's REGIME-SENSITIVITY (finalizing against a
// later drifted fallback regime differs -> reading the resolution-time regime is
// load-bearing).
let natResOK = true, tDetail = '', natChecked = 0, dealChecked = 0, dealCarry = 0, regimeSensitive = 0;
{
    const fail = (m) => { if (natResOK) { natResOK = false; tDetail = m; } };
    const bond = { rate: 0.05, a: 0.15, b: 0.03, sigmaR: 0.01, day: 400, face: 100 };
    const runToResolution = (seed, withConsensus) => {
        const race = createRaceState(seed >>> 0);
        if (withConsensus) initConsensus(race);
        initComputeMarket(race, null);
        for (let d = 0; d < HORIZON && !race.resolution; d++) {
            advanceRace(race, { straitTension: 0 }); stepControlRegime(race); stepTreaty(race, {}); checkResolution(race, null);
        }
        if (!race.resolution) checkResolution(race, null);
        return race;
    };
    const outcomes = (race) => Object.fromEntries(finalizeConsensusTerminal(race).map(r => [r.key, r.outcome]));
    for (let i = 0; i < Math.min(N, 200); i++) {
        const seed = (BASE_SEED + i) >>> 0;
        resetLedger();
        const race = runToResolution(seed, true);
        natChecked++;
        if (!ledger.frozen) fail(`seed ${seed}: ledger not frozen at resolution (freeze-before-marking)`);
        if (race.resolution.family === 5) {
            dealChecked++;
            if (race.lastTransitions && race.lastTransitions.treatyOutcome) dealCarry++;
            else fail(`seed ${seed}: Deal dropped treatyOutcome (treaty_holds beat lost)`);
        }
        const regimeR = race.controlRegime;
        const outR = outcomes(race);   // finalize AT the resolution-time regime
        finalizeComputeTerminal(race, null);
        // conservation on a synthetic HCN/VXHCN/bond book.
        const positions = [
            { id: 1, type: 'stock', qty: 6, entryPrice: 95 },
            { id: 2, type: 'vxhcnfuture', qty: -2, entryPrice: 20, _reservedMargin: 120 },
            { id: 3, type: 'bond', qty: 4, expiryDay: 950, entryPrice: 98 },
        ];
        const book = closeoutBook(positions, race.resolution, race, { spot: 100, varianceIndex: 22, bond });
        let pre = 0;
        for (const r of book.rows) { const p = positions.find(x => x.id === r.id); pre += r.qty * r.unitValue + (p._reservedMargin || 0); }
        if (Math.abs(pre - book.totalCash) > 1e-6) fail(`seed ${seed}: natural closeout equity!=cash`);
        // REGIME-SENSITIVITY: a NON-fallback resolution with some YES/NO settles
        // DIFFERENTLY if the regime later drifts to a fallback regime (all FALLBACK).
        // The atomic fix pins the regime at resolution; the interim would have drifted it.
        if (regimeR !== 'nationalized' && regimeR !== 'classified' && Object.values(outR).some(o => o !== 'FALLBACK')) {
            const drift = runToResolution(seed, true);
            drift.controlRegime = 'classified';   // simulate the interim's post-terminal drift
            const outDrift = outcomes(drift);
            if (Object.values(outDrift).every(o => o === 'FALLBACK') &&
                Object.keys(outR).some(k => outR[k] !== outDrift[k])) regimeSensitive++;
        }
    }
    if (regimeSensitive === 0) fail('vacuous: could not demonstrate finalizer regime-sensitivity (the atomic-timing fix)');
}
check(`T: natural-resolution atomic closeout (${natChecked} seeds conserve + frozen; ${dealCarry}/${dealChecked} Deal beats carried; ${regimeSensitive} regime-sensitive -> resolution-time regime load-bearing)`, natResOK, tDetail);

// ---- U: rogue / resignation game-over overlay (shared latch) ----------------
// Rogue trading routes as forced_resignation through the shared terminal latch (02a
// P6-3 ruling 2); the involvement split then decides the overlay like any resignation.
{
    const lo = determineOverlay('forced_resignation', {}, 0, false);         // walked out, uninvolved
    const hi = determineOverlay('forced_resignation', { C: 0.05 }, 0, false); // walked out, but in the room
    const marginOverlay = determineOverlay('margin_call_liquidation', {}, 0, false);
    check('U: forced_resignation splits by involvement (bystander / gray_eminence); margin->margin_called',
        lo === 'bystander' && hi === 'gray_eminence' && marginOverlay === 'margin_called', `${lo}/${hi}/${marginOverlay}`);
}

// ---- V: terminal queue discipline (only effect-free 'summit' beats survive) --
// 02a P6-3: once terminal closeout starts, the world's resolution supersedes the day's
// ordinary news. A queued effect-carrying popup (the REAL scrutiny_enforcement, which
// deterministically queues on 58/5000 forecast-lock resolutions and carries a
// cashPenalty 2000) MUST be discarded at game-over -- BEFORE closeout/epilogue -- so
// its choice can never mutate the settled book or stale the epilogue. Only category
// 'summit' beats (treaty_holds / treaty_resolution, effect-free acknowledgments)
// survive. The filter predicate is extracted to endings.js (isTerminalSafeBeat)
// because main.js is DOM-coupled and unreachable headlessly; this probes the REAL
// events + the REAL predicate main.js applies.
let tqOK = true, tqDetail = '';
{
    const fail = (m) => { if (tqOK) { tqOK = false; tqDetail = m; } };
    const scrutiny = getEventById('scrutiny_enforcement');   // cashPenalty 2000 (investigation.js)
    const holds = getEventById('treaty_holds');              // category 'summit', acknowledge-only
    const resolution = getEventById('treaty_resolution');    // category 'summit'
    const effectful = (ev) => !!ev && (ev.choices || []).some(c => c.cashPenalty || c.factionShifts || c.deltas || c.effects || c.regulatoryAction);
    // The probe is non-vacuous: scrutiny_enforcement really carries a book effect.
    if (!effectful(scrutiny)) fail('probe vacuous: scrutiny_enforcement carries no book effect');
    // Effect-carrying ordinary popup -> NOT terminal-safe -> discarded before closeout.
    if (isTerminalSafeBeat({ ...scrutiny })) fail('effect-carrying scrutiny_enforcement survived the terminal filter');
    // Summit beats -> terminal-safe -> retained (the treaty superevent reaches the player).
    if (!isTerminalSafeBeat({ ...holds })) fail('treaty_holds not terminal-safe (beat lost)');
    if (!isTerminalSafeBeat({ ...resolution })) fail('treaty_resolution not terminal-safe');
    // Retained summit beats are EFFECT-FREE by construction -> draining them after the
    // epilogue cannot mutate the settled book (cash / factions stay at closeout values).
    if (effectful(holds)) fail('treaty_holds carries a book effect (not an acknowledgment)');
    if (effectful(resolution)) fail('treaty_resolution carries a book effect');
    // The filter main.js runs (retain only isTerminalSafeBeat) on a mixed queue keeps
    // ONLY the summit beat; the cashPenalty + factionShift popups are dropped.
    const factionPopup = { category: 'macro', choices: [{ factionShifts: [{ faction: 'firmStanding', value: 5 }] }] };
    const q = [{ ...scrutiny }, { ...holds }, factionPopup];
    const kept = q.filter(isTerminalSafeBeat);
    if (kept.length !== 1 || kept[0].id !== 'treaty_holds') fail(`filter kept ${kept.length} (expected 1 summit beat)`);
    // ...and the kept queue carries no residual effect at all.
    if (kept.some(effectful)) fail('a retained beat still carries a book effect');
}
check('V: terminal queue discipline (effect popups discarded pre-closeout; only effect-free summit beats survive)', tqOK, tqDetail);

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
line(`\n  P6-3 closeout + endings:`);
line(`    matrix (N): ${coCells} family x regime x instrument cells, equity==cash + mark zero-sum ${closeoutOK ? 'conserve' : 'VIOLATED'}`);
line(`    finalizers (O/P): consensus deadline-judged + idempotent ${consFinOK ? 'ok' : 'VIOLATED'}; compute held-settles ${compFinOK ? 'ok' : 'VIOLATED'}`);
line(`    e2e (Q): eject -> extrapolate -> freeze -> closeout conserves ${e2eOK ? 'ok' : 'VIOLATED'} (3 seeds; bond leg carries MTM)`);
line(`    nationalization (R): multiple in [0.60,1.15], frozen once, conversion!=decree ${natRefOK ? 'ok' : 'VIOLATED'}`);
line(`    ejection-invariance (S): ${seedsChecked} seeds settle identically eject-vs-term, ${nonVacuous} non-vacuous (cert-in-extrapolation -> YES) ${ejInvOK ? 'ok' : 'VIOLATED'}`);
line(`    natural-resolution atomic (T): ${natChecked} conserve+frozen, ${dealCarry}/${dealChecked} Deal beats carried, ${regimeSensitive} regime-sensitive ${natResOK ? 'ok' : 'VIOLATED'} (interim superseded)`);
line(`    terminal queue discipline (V): effect popups (scrutiny_enforcement cashPenalty 2000) discarded pre-closeout, only effect-free summit beats survive ${tqOK ? 'ok' : 'VIOLATED'}`);
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
