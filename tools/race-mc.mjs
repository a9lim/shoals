#!/usr/bin/env node
/* ===================================================
   tools/race-mc.mjs -- Headless Monte-Carlo harness for
   the src/race/ hidden state machine. Runs N seeds of
   the full daily loop over the 1008-day horizon with
   neutral player inputs and reports the distributions
   plus a calibration PASS/MISS block against the stated
   targets in docs/design/02a-tuning.md.

   The calibration statistic is the UNCONDITIONAL
   first-passage median (Kaplan-Meier: right-censored
   runs -- no crossing by 1008 -- count), never the
   median conditional on crossing (which biases early).
   With a single administrative censoring time (day
   1008), KM reduces to the empirical CDF, so the
   unconditional quantile is the p-quantile of the full
   N-sample with non-crossers placed at +infinity.

   02a "Demonstrations" adds the release jitter's gates (the
   race core at zero jitter width against HEAD 43d677c's
   fingerprint, the claim excess in days 42-48 of the
   63-day cycle) and Polaris's nominal round schedule
   (rounds open on exactly the days the old clock opened
   them).

   Usage:  node tools/race-mc.mjs [N] [--seed S]
           N defaults to 1000; base seed defaults to 1.
   =================================================== */

import { createHash } from 'node:crypto';
import { createRaceState, advanceRace, heatValue, RACE_TUNING } from '../src/race/race-state.js';
import { buildPublicView } from '../src/race/consensus.js';
import { initRounds, stepRounds, polarisRoundDays, ROUNDS_TUNING } from '../src/race/rounds.js';
import { createRng, deriveSeed } from '../src/race/rng.js';

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

// ---- Phase-2 incident / evidence accumulators ----------------------------
const EARLY_W = 126, LATE_W = 126;               // occurrence-cadence windows (days)
const OCC_EARLY_TARGET = 13.0, OCC_LATE_ANCHOR = 3.3;   // 02a: ~1/13d early, capped ~1/3.3d late
const incTotal = [];      // detected+undetected occurrences per run
const incEarly = [];      // occurrences in the first EARLY_W days
const incLate = [];       // occurrences in the last LATE_W days
const s4PerRun = [];      // S4 occurrences per run
const detLags = [];       // pooled detection lags (detectDay − occurDay)
const neverDetFrac = [];  // per-run never-detected fraction (by horizon)
// Reality-beats round (02a "Incidents"): concealment scales the detection
// lag with the source's internal−released gap, which only opens late. Split the
// detection diagnostics by OCCURRENCE ERA so the late shift is visible. These are
// DIAGNOSTICS, never bands (02a says so explicitly for this round).
const ERA_SPLIT = 700;
const detLagsEarly = [], detLagsLate = [];
let ndEarly = 0, occEarlyEra = 0, ndLate = 0, occLateEra = 0;
const evFound = [];       // evidence beats found (occurred) per run
const evPublished = [];   // evidence beats made public per run
let s4Checked = 0, s4Violations = 0;   // S4 generation invariant: immediacy + never-persuasion (hard FAIL)
let nonImmediate = 0, tipCount = 0;    // insider-tip rate over non-immediate occurrences (~0.30 intent)

const T_CAP = RACE_TUNING.prolifCap / RACE_TUNING.prolifInc;   // releases needed to hit the cap

// ---- Release jitter: claims by week of the 63-day cycle (02a) -------------
// A claim is a released rung newly crossed by a release (R1 included: the early
// lockstep is chiefly Tianxia's R1 claims on days 1, 46 and 91). Bins are the
// nine 7-day weeks of day mod 63; the excess is a week's count over the weekly
// mean, minus one. The gate reads the whole run; the Act I slice (released
// frontier at or below R2 before the claim) is reported beside it.
const claimWeeks = new Array(9).fill(0), claimWeeksAct1 = new Array(9).fill(0), releaseWeeks = new Array(9).fill(0);

// ---- Polaris's nominal schedule vs the old clock ----------------------------
// HEAD 43d677c's stepRounds, called every day: the founding round 21 days after
// the spawn, then each next one 126 + int(43) - 21 days after the day a round
// opened, drawn from the `rounds` substream as rounds executed.
function legacyRoundDays(seed, spawnDay, untilDay) {
    const rng = createRng(deriveSeed(seed, 'rounds'));
    const out = [];
    let next = spawnDay + 21;
    for (let day = spawnDay; day <= untilDay; day++) {
        if (day >= next) { out.push(day); next = day + 126 + rng.int(43) - 21; }
    }
    return out;
}
let roundsChecked = 0, roundsMismatch = 0, roundsTotal = 0;

const t0 = Date.now();
for (let i = 0; i < N; i++) {
    const race = createRaceState((BASE_SEED + i) >>> 0);
    initRounds(race);
    const roundDays = [];
    let spawnDay = null;
    let leaderC888 = null;
    let eOcc = 0, lOcc = 0, tOcc = 0, s4 = 0;   // per-run occurrence tallies
    for (let d = 0; d < HORIZON; d++) {
        const frontierBefore = buildPublicView(race).releasedFrontierRung;
        advanceRace(race);
        for (const round of stepRounds(race, 0)) roundDays.push(round.day);
        if (race.lastTransitions.spawned.includes('polaris')) spawnDay = race.day;
        for (const rel of race.lastTransitions.releases) {
            const week = Math.floor((race.day % 63) / 7);
            releaseWeeks[week]++;
            claimWeeks[week] += rel.releasedCrossings.length;
            if (frontierBefore <= 2) claimWeeksAct1[week] += rel.releasedCrossings.length;
        }
        if (race.day === 350) sAt[350].push(leaderSafety(race));
        if (race.day === 700) sAt[700].push(leaderSafety(race));
        if (race.day === 888) leaderC888 = leaderInternal(race).C;
        // Incident occurrence cadence (occurred track, silent -- but real).
        const occ = race.lastTransitions.incidents.occurred;
        tOcc += occ.length;
        if (race.day <= EARLY_W) eOcc += occ.length;
        if (race.day > HORIZON - LATE_W) lOcc += occ.length;
        for (const o of occ) if (o.severity >= 4) s4++;
    }
    const cap = race.capability;

    // Rounds open on the nominal schedule, which is the old clock's days.
    if (spawnDay != null) {
        roundsChecked++; roundsTotal += roundDays.length;
        const legacy = legacyRoundDays(race.seed, spawnDay, HORIZON);
        const nominal = polarisRoundDays(race.seed, spawnDay, HORIZON).filter(d => d <= HORIZON);
        if (JSON.stringify(roundDays) !== JSON.stringify(legacy) || JSON.stringify(roundDays) !== JSON.stringify(nominal)) roundsMismatch++;
    }

    // Incident occurrence / detection / evidence per-run summaries.
    incTotal.push(tOcc); incEarly.push(eOcc); incLate.push(lOcc); s4PerRun.push(s4);
    let nd = 0;
    for (const inc of race.latentIncidents) {
        const immediate = inc.detected && inc.detectDay === inc.occurDay;   // self-disclosed in occ tick
        const early = inc.occurDay < ERA_SPLIT;
        if (early) occEarlyEra++; else occLateEra++;
        if (inc.detected) {
            detLags.push(inc.detectDay - inc.occurDay);
            (early ? detLagsEarly : detLagsLate).push(inc.detectDay - inc.occurDay);
        } else { nd++; if (early) ndEarly++; else ndLate++; }
        // S4 invariant: every S4 must self-disclose in its occurrence tick and
        // never be persuasion-class (the absolute S4 rule, 02a).
        if (inc.severity === 4) {
            s4Checked++;
            if (!immediate || inc.cls === 'persuasion') s4Violations++;
        }
        // Insider-tip rate over non-immediate occurrences (tip is drawn for every
        // incident not detected in its occurrence tick).
        if (!immediate) { nonImmediate++; if (inc.insiderTip) tipCount++; }
    }
    neverDetFrac.push(race.latentIncidents.length ? nd / race.latentIncidents.length : 0);
    evFound.push(race.latentEvidence.length);
    evPublished.push(race.latentEvidence.filter(e => e.published).length);

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

// ---- Substream-isolation check -------------------------------------------
// Capability + theft trajectories must be bit-identical whether the incident /
// evidence generators run or not: each subsystem draws ONLY from its own named
// RNG substream, so adding the incidents stream perturbs nothing upstream.
// Run a batch of seeds with incidents ON vs OFF and compare C_internal (all
// labs + open), theftCount, and the internal rung-crossing days.
function isolationOK(nSeeds) {
    const run = (seed, enabled) => {
        const r = createRaceState(seed >>> 0);
        r.incidentsEnabled = enabled;
        for (let d = 0; d < HORIZON; d++) advanceRace(r);
        return r;
    };
    const capVec = (r) => ['halcyon', 'tianxia', 'polaris'].map(id => r.capability.labs[id].C_internal).concat([r.capability.open.C]);
    for (let s = 0; s < nSeeds; s++) {
        const seed = (BASE_SEED + s) >>> 0;
        const on = run(seed, true), off = run(seed, false);
        if (on.theftCount !== off.theftCount) return false;
        const a = capVec(on), b = capVec(off);
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        for (const id of ['halcyon', 'tianxia', 'polaris']) {
            if (JSON.stringify(on.capability.labs[id].rungInternal) !== JSON.stringify(off.capability.labs[id].rungInternal)) return false;
        }
    }
    return true;
}
const ISO_SEEDS = Math.min(N, 50);
const isolationPass = isolationOK(ISO_SEEDS);

// ---- The jitter's own stream (02a "Demonstrations") ------------------------
// At zero width every cooldown is 45 days, the pre-jitter constant, while the
// jitter stream is still drawn once per release. The race core must then match
// HEAD 43d677c bit for bit (seeds 1-50): drawing the cooldown perturbs no other
// stream. Fingerprint derived on HEAD 43d677c with this exact function.
const PRE_JITTER_CORE_SHA256 = '45769e9b8c21a364fff50d0972fe6c7c588054169c2a4f830583884a0f745340';
function coreFingerprint(seeds, setup = () => {}) {
    const h = createHash('sha256');
    for (let seed = 1; seed <= seeds; seed++) {
        const race = createRaceState(seed);
        setup(race);
        for (let d = 0; d < 1008; d++) {
            const tr = advanceRace(race);
            const cap = race.capability;
            const labs = ['halcyon', 'tianxia', 'polaris'].map(id => {
                const l = cap.labs[id];
                return [l.active, l.C_internal, l.C_released, l.releaseCount, Number.isFinite(l.lastReleaseDay) ? l.lastReleaseDay : null];
            });
            h.update(JSON.stringify([seed, race.day, labs, cap.open.C, race.safety, race.heat, race.theftCount,
                tr.releases.length, tr.certifications.length, tr.incidents.occurred.length, tr.incidents.detected.length,
                tr.theftDisclosures.length]) + '\n');
        }
    }
    return h.digest('hex');
}
let jitterIsolationPass;
{
    const saved = { lo: RACE_TUNING.releaseCooldownMin, hi: RACE_TUNING.releaseCooldownMax };
    RACE_TUNING.releaseCooldownMin = RACE_TUNING.releaseCooldownMax = 45;
    jitterIsolationPass = coreFingerprint(50) === PRE_JITTER_CORE_SHA256;
    RACE_TUNING.releaseCooldownMin = saved.lo; RACE_TUNING.releaseCooldownMax = saved.hi;
}

/** Week-of-cycle excess: each bin over the weekly mean, minus one. */
function weekExcess(bins) {
    const m = bins.reduce((a, b) => a + b, 0) / bins.length;
    return bins.map(x => m > 0 ? x / m - 1 : 0);
}
const claimExcess = weekExcess(claimWeeks), claimExcessAct1 = weekExcess(claimWeeksAct1), releaseExcess = weekExcess(releaseWeeks);

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
line(`tuned proliferation triple (RACE_TUNING): releaseCooldown=U(${RACE_TUNING.releaseCooldownMin}, ${RACE_TUNING.releaseCooldownMax})d, `
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

// ---- Incidents & evidence (phase 2) --------------------------------------

line('\nIncident occurrence cadence  (two-track: occurrence is silent but real)');
const eMean = mean(incEarly), lMean = mean(incLate);
const eIA = eMean > 0 ? EARLY_W / eMean : Infinity;
const lIA = lMean > 0 ? LATE_W / lMean : Infinity;
line(`  occurrences/run   mean ${f2(mean(incTotal))}   p10 ${d0(quantile(incTotal, 0.10))}   p50 ${d0(quantile(incTotal, 0.50))}   p90 ${d0(quantile(incTotal, 0.90))}`);
line(`  early window (first ${EARLY_W}d)  mean occ ${f2(eMean)}  => 1 per ${f2(eIA)}d   (02a anchor ~1/${OCC_EARLY_TARGET}d)`);
line(`  late  window (last  ${LATE_W}d)  mean occ ${f2(lMean)}  => 1 per ${f2(lIA)}d   (02a ceiling ~1/${OCC_LATE_ANCHOR}d; run-avg, not the cap -- diagnostic)`);

line('\nSeverity-4 (gated late-tail; the "39-50% of runs" figure is the REJECTED');
line('  flat-slice scenario, NOT a design band -- incidence is diagnostic only)');
line(`  S4 occurrences/run  mean ${f3(mean(s4PerRun))}   max ${Math.max(...s4PerRun)}   runs with >=1 S4: ${pct(s4PerRun.filter(x => x >= 1).length / N)}   (diagnostic)`);
line(`  S4 generation invariant: ${s4Checked} S4s checked, ${s4Violations} violation(s) `
    + `(every S4 self-discloses in its occurrence tick AND is never persuasion-class -- generation, not bridge routing)`);

line('\nDetection (per-latent-incident daily process; genuine never-detected tail)');
line(`  detection lag days   p10 ${d0(quantile(detLags, 0.10))}   p50 ${d0(quantile(detLags, 0.50))}   p90 ${d0(quantile(detLags, 0.90))}   (diagnostic; mixed severities)`);
line(`  never-detected fraction (by horizon)   mean ${f3(mean(neverDetFrac))}   p10 ${f3(quantile(neverDetFrac, 0.10))}   p90 ${f3(quantile(neverDetFrac, 0.90))}   (diagnostic)`);
line(`  insider-tip rate over non-immediate occurrences   ${f3(tipCount / Math.max(1, nonImmediate))}   (02a intent ~0.30; diagnostic; n=${nonImmediate})`);
line(`  by occurrence era (reality-beats concealment channel -- DIAGNOSTIC, not a band):`);
for (const [label, lags, nd, occ] of [
    [`occurDay <  ${ERA_SPLIT}`, detLagsEarly, ndEarly, occEarlyEra],
    [`occurDay >= ${ERA_SPLIT}`, detLagsLate, ndLate, occLateEra],
]) {
    line(`    ${label}   lag p50 ${d0(quantile(lags, 0.50))}  p90 ${d0(quantile(lags, 0.90))}`
        + `   never-detected ${pct(occ ? nd / occ : 0)}   (n=${occ})`);
}

line('\nEvidence beats (alignment twin; found vs published)');
line(`  found/run     mean ${f2(mean(evFound))}   p10 ${d0(quantile(evFound, 0.10))}   p90 ${d0(quantile(evFound, 0.90))}`);
line(`  published/run mean ${f2(mean(evPublished))}   (02a ratified cadence ~40 found / ~28 published per run; the ±log19 accumulator clamp is the stance and holds at any count)`);

line('\nSubstream isolation (incidents ON vs OFF, ' + ISO_SEEDS + ' seeds)');
line(`  capability + theft trajectories bit-identical: ${isolationPass ? 'PASS' : 'FAIL'}`);

const pctSigned = x => (x >= 0 ? '+' : '') + (100 * x).toFixed(0) + '%';
line('\nRelease jitter (02a "Demonstrations"): week of the 63-day cycle, excess over the weekly mean');
line(`  releases          ${releaseExcess.map(pctSigned).join(' ')}`);
line(`  claims            ${claimExcess.map(pctSigned).join(' ')}   (n=${claimWeeks.reduce((a, b) => a + b, 0)})`);
line(`  claims, Act I     ${claimExcessAct1.map(pctSigned).join(' ')}   (released frontier <= R2 before the claim; diagnostic)`);
line(`  days 42-48: claims ${pctSigned(claimExcess[6])}, Act I slice ${pctSigned(claimExcessAct1[6])} (HEAD 43d677c: +58% and +128% at N=1000)`);
line(`  zero width reproduces HEAD 43d677c's race core (seeds 1-50): ${jitterIsolationPass ? 'PASS' : 'FAIL'}`);

line('\nPolaris rounds: the nominal schedule vs the old clock');
line(`  ${roundsChecked} spawned worlds, ${roundsTotal} rounds, ${roundsMismatch} world(s) whose rounds moved`);

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

// Phase-2 incident targets that 02a actually states.
function checkVal(label, got, want, lo, hi, fmt = f2) {
    const pass = got >= lo && got <= hi;
    if (!pass) allPass = false;
    line(`  ${label.padEnd(28)} ${String(want).padStart(6)}   ${fmt(got).padStart(6)}    ${pass ? 'PASS' : 'MISS'}   (band ${fmt(lo)}-${fmt(hi)})`);
}
// Early-window inter-arrival vs 02a's ~1/13d anchor (all runs share the same
// C~1.75 start, so this is a clean target); +/-35% design band.
checkVal('incident early cadence (d)', eIA, '~13d', OCC_EARLY_TARGET * 0.65, OCC_EARLY_TARGET * 1.35);
// S4 self-disclosure is an absolute INVARIANT (not a band): every S4 must be
// immediate-detected and never persuasion-class. Any violation is a hard FAIL.
{
    const pass = s4Violations === 0;
    if (!pass) allPass = false;
    line(`  ${'S4 generation invariant'.padEnd(28)} ${'0 viol'.padStart(6)}   ${String(s4Violations).padStart(6)}    ${pass ? 'PASS' : 'MISS'}   (of ${s4Checked} S4s checked)`);
}
// Substream isolation is a hard invariant.
line(`  ${'substream isolation'.padEnd(28)} ${'ident.'.padStart(6)}   ${(isolationPass ? 'yes' : 'no').padStart(6)}    ${isolationPass ? 'PASS' : 'MISS'}`);
if (!isolationPass) allPass = false;
// Release jitter (02a "Demonstrations"): the claim excess in days 42-48 falls
// below 25%, and the jitter's draw perturbs no other stream.
{
    const pass = claimExcess[6] < 0.25;
    if (!pass) allPass = false;
    line(`  ${'claim excess, days 42-48'.padEnd(28)} ${'<25%'.padStart(6)}   ${pctSigned(claimExcess[6]).padStart(6)}    ${pass ? 'PASS' : 'MISS'}`);
}
line(`  ${'jitter stream isolation'.padEnd(28)} ${'ident.'.padStart(6)}   ${(jitterIsolationPass ? 'yes' : 'no').padStart(6)}    ${jitterIsolationPass ? 'PASS' : 'MISS'}`);
if (!jitterIsolationPass) allPass = false;
{
    const pass = roundsMismatch === 0 && roundsChecked > 0;
    if (!pass) allPass = false;
    line(`  ${'Polaris rounds unmoved'.padEnd(28)} ${'0 moved'.padStart(6)}   ${String(roundsMismatch).padStart(6)}    ${pass ? 'PASS' : 'MISS'}   (of ${roundsChecked} worlds, ${roundsTotal} rounds)`);
}

line('='.repeat(70));
line(allPass ? 'ALL CALIBRATION TARGETS PASS' : 'ONE OR MORE TARGETS MISS -- see above');
process.exitCode = allPass ? 0 : 1;
