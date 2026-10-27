#!/usr/bin/env node
/* ===================================================
   tools/race-mc.mjs -- Headless Monte-Carlo harness for
   the src/race/ hidden state machine. Runs N seeds of
   the full daily loop over the 1008-day horizon with
   neutral player inputs and checks the race's stance
   and its structural invariants.

   The crossing statistic is the UNCONDITIONAL first-
   passage median (Kaplan-Meier: right-censored runs --
   no crossing by 1008 -- count), never the median
   conditional on crossing (which biases early). With a
   single administrative censoring time, KM reduces to
   the empirical CDF, so the unconditional quantile is
   the p-quantile of the full N-sample with non-crossers
   placed at +infinity.

   Gates:
     stance      R2-R5 KM medians, the fizzle tail
     S4          every S4 self-discloses in its occurrence
                 tick and is never persuasion-class
     reports     the chain's reports replay from the public
                 rows, ignore hidden truth corrupted after
                 publication, keep their claims; the cascade
                 fixture
     rounds      Polaris's rounds open on its nominal schedule

   Usage:  node tools/race-mc.mjs [N] [--seed S]
           N defaults to 1000; base seed defaults to 1.
   =================================================== */

import { createRaceState, advanceRace, freshTransitions } from '../src/race/race-state.js';
import { createPublicRecord, stepPublicRecord, publicRecordRow, foldPublicRecordRow, createRecordFromSnapshot, chainReports } from '../src/race/public-record.js';
import { stepDemonstrations, closeDemonstrations, freshDemonstrationState } from '../src/race/demonstrations.js';
import { initRounds, stepRounds, polarisRoundDays } from '../src/race/rounds.js';

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

/**
 * Unconditional (Kaplan-Meier) first-passage quantile: the ceil(p*N)-th
 * smallest crossing, or Infinity (">1008") when it sits in the censored mass.
 */
function kmQuantile(days, N, p) {
    const need = Math.ceil(p * N);
    if (days.length < need) return Infinity;
    const s = [...days].sort((a, b) => a - b);
    return s[need - 1];
}
const d0 = (x) => (Number.isFinite(x) ? Math.round(x).toString() : '>1008');
const pct = (x) => (100 * x).toFixed(1) + '%';

// ---- Run the ensemble ----------------------------------------------------

const frontierCross = { 2: [], 3: [], 4: [], 5: [] };   // frontier (min over entities) internal crossing days
let plateauByE = 0;        // scalingElasticity <= 0.60 (recursion never ignites)
let s4Checked = 0, s4Violations = 0;
let roundsChecked = 0, roundsMismatch = 0, roundsTotal = 0;

const t0 = Date.now();
for (let i = 0; i < N; i++) {
    const race = createRaceState((BASE_SEED + i) >>> 0);
    initRounds(race);
    const roundDays = [];
    let spawnDay = null;
    for (let d = 0; d < HORIZON; d++) {
        advanceRace(race);
        for (const round of stepRounds(race, 0)) roundDays.push(round.day);
        if (race.lastTransitions.spawned.includes('polaris')) spawnDay = race.day;
    }
    const cap = race.capability;

    // Rounds open on the nominal schedule the demonstrations time themselves by.
    if (spawnDay != null) {
        roundsChecked++; roundsTotal += roundDays.length;
        const nominal = polarisRoundDays(race.seed, spawnDay, HORIZON).filter(d => d <= HORIZON);
        if (JSON.stringify(roundDays) !== JSON.stringify(nominal)) roundsMismatch++;
    }

    // S4 invariant: every S4 self-discloses in its occurrence tick and is never
    // persuasion-class (the absolute S4 rule, 02a).
    for (const inc of race.latentIncidents) {
        if (inc.severity !== 4) continue;
        s4Checked++;
        if (!(inc.detected && inc.detectDay === inc.occurDay) || inc.cls === 'persuasion') s4Violations++;
    }

    // Frontier (leader-agnostic) internal-track first crossings.
    for (const r of [2, 3, 4, 5]) {
        let m = Infinity;
        for (const e of ENTITIES) {
            const rec = (e === 'open') ? cap.open.rungInternal : cap.labs[e].rungInternal;
            if (rec[r] != null) m = Math.min(m, rec[r]);
        }
        if (Number.isFinite(m)) frontierCross[r].push(m);
    }
    if (race.hidden.scalingElasticity <= 0.60) plateauByE++;
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

// ---- The chain's reports (02a "Demonstrations": gates) ---------------------
// R1 replaying the fixed public rows (JSON) reproduces every report, at every
//    day; reports as of an earlier day equal the reports that day.
// R2 corrupting the hidden truth and schedule after publication changes neither
//    that day's row nor any report as of that day (later rows may differ).
// R3 every report keeps its publication's day, rung and citation edge, the
//    withdrawn and narrowed included.
const REPORT_SEEDS = Math.min(N, 100);
let replayReportsPass = true, corruptReportsPass = true, keepClaimPass = true, keptChecked = 0, corruptDiverged = 0;
function corruptDemonstrations(race) {
    for (const d of race.demonstrations.list) {
        d.truth = { reach: d.truth.reach === 'sound' ? 'overScoped' : 'sound', flawed: !d.truth.flawed, C: 99 };
        if (d.evalDay != null) d.evalDay += 5;
        if (d.disputeDay != null) d.disputeDay += 3; else if (d.status === 'standing') d.disputeDay = race.day + 2;
    }
}
for (let s = 1; s <= REPORT_SEEDS; s++) {
    const a = createRaceState(s), b = createRaceState(s);
    const recA = createPublicRecord(a), recB = createPublicRecord(b);
    const rows = [], asOf = new Map();
    const D = 300 + 7 * s;   // the corruption day
    for (let d = 0; d < HORIZON; d++) {
        advanceRace(a); advanceRace(b);
        const row = JSON.stringify(publicRecordRow(a));
        if (b.day === D) {
            corruptDemonstrations(b);
            if (JSON.stringify(publicRecordRow(b)) !== row) corruptReportsPass = false;
        }
        stepPublicRecord(recA, a); stepPublicRecord(recB, b);
        rows.push(row);
        if (a.day % 21 === 0) asOf.set(a.day, JSON.stringify(chainReports(recA)));
    }
    const replay = createRecordFromSnapshot(JSON.parse(JSON.stringify(recA.initial)));
    for (const row of rows) {
        foldPublicRecordRow(replay, JSON.parse(row));
        if (replay.day % 21 === 0 && JSON.stringify(chainReports(replay)) !== asOf.get(replay.day)) replayReportsPass = false;
    }
    for (const [day, json] of asOf) if (JSON.stringify(chainReports(recA, day)) !== json) replayReportsPass = false;
    if (JSON.stringify(chainReports(recB, D)) !== asOf.get(D) && asOf.has(D)) corruptReportsPass = false;
    if (JSON.stringify(chainReports(recB, D)) !== JSON.stringify(chainReports(recA, D))) corruptReportsPass = false;
    if (JSON.stringify(recB.demonstrations.filter(r => r.day <= D)) !== JSON.stringify(recA.demonstrations.filter(r => r.day <= D))) corruptReportsPass = false;
    if (JSON.stringify(recB.demonstrations) !== JSON.stringify(recA.demonstrations)) corruptDiverged++;   // later rows may differ
    const pubs = new Map(recA.demonstrations.filter(r => r.kind === 'publication').map(r => [r.id, r]));
    for (const rep of chainReports(recA)) {
        if (rep.kind !== 'demonstration') continue;
        const p = pubs.get(rep.id);
        if (rep.day !== p.day || rep.rung !== p.rung || rep.cites !== p.cites || rep.lab !== p.lab) keepClaimPass = false;
        if (rep.status === 'withdrawn' || rep.status === 'narrowed') keptChecked++;
    }
}

// R4 the cascade, constructed (MC worlds almost never cite a demonstration still
// awaiting its evaluation, so the withdrawal's reach is checked on a fixed chain).
let cascadePass = true;
const cascadeNotes = [];
{
    const race = createRaceState(1);
    race.capability.labs.halcyon.active = false;   // no new publications in the fixture
    race.demonstrations = freshDemonstrationState();
    const st = race.demonstrations;
    const fixture = [];
    const add = (lab, rung, day, cites, flawed, reach, evalDay, disputeDay) => {
        const seq = fixture.length + 1;
        fixture.push({ id: 'D' + seq, seq, lab, rung, day, cites, ordinal: seq, truth: { reach, flawed, C: rung }, evalDay, disputeDay,
            status: 'standing', disputeId: null, evaluationId: null, withdrawnBy: null, root: null });
    };
    add('halcyon', 2, 11, null, true, 'overScoped', 50, 55);    // D1 flawed root; its dispute falls after it is withdrawn
    add('halcyon', 3, 20, 'D1', false, 'sound', 40, null);      // D2 upheld on day 40, then taken
    add('halcyon', 4, 30, 'D2', false, 'overScoped', 50, null); // D3 due the root's day: taken first, never evaluated
    add('halcyon', 4, 35, null, false, 'sound', 50, 52);        // D4 unrelated, upheld on 50; its dispute cancelled
    add('polaris', 2, 36, null, true, 'sound', 80, 45);         // D5 disputed on 45, untouched
    st.nextId = fixture.length + 1;
    race.day = 10;
    const rec = createPublicRecord(race);
    for (let day = 10; day < 60; day++) {
        race.day = day + 1;
        const tr = freshTransitions();
        tr.demonstrations = stepDemonstrations(race, tr, day, day + 1);
        // The fixture's publications enter at their close, last, as the step's do.
        for (const d of fixture.filter(x => x.day === day + 1)) {
            st.list.push(d);
            tr.demonstrations.push({ kind: 'publication', id: d.id, lab: d.lab, rung: d.rung, cites: d.cites, ordinal: d.ordinal });
        }
        race.lastTransitions = tr;
        foldPublicRecordRow(rec, publicRecordRow(race));
    }
    const reps = new Map(chainReports(rec).map(r => [r.id, r]));
    const kinds = rec.demonstrations.filter(r => r.kind !== 'publication').map(r => `${r.day}:${r.kind}:${r.on}${r.took ? '>' + r.took.join('+') : ''}${r.outcome ? '=' + r.outcome : ''}`).join(' ');
    const want = '40:evaluation:D2=upheld 45:dispute:D5 50:withdrawal:D1>D2+D3 50:evaluation:D4=upheld';
    const expect = (ok, note) => { if (!ok) { cascadePass = false; cascadeNotes.push(note); } };
    expect(kinds === want, `rows ${kinds}`);
    expect(['D1', 'D2', 'D3'].every(id => reps.get(id).status === 'withdrawn' && reps.get(id).root === 'D1'), 'root and status');
    expect(JSON.stringify(reps.get('D3').ancestry) === '["D2","D1"]' && reps.get('D3').cites === 'D2', 'ancestry and edge');
    expect(reps.get('D4').status === 'upheld' && reps.get('D5').status === 'disputed', 'bystanders');
    // The world resolves: everything pending is cancelled and no row is written.
    race.resolution = { family: 6 };
    const after = stepDemonstrations(race, freshTransitions(), 60, 61);
    expect(after.length === 0 && st.closed && st.list.every(d => d.evalDay == null && d.disputeDay == null), 'close');
    closeDemonstrations(race);   // idempotent
}

// ---- Report --------------------------------------------------------------

const line = (s = '') => console.log(s);
line(`race-mc: N=${N}, base seed=${BASE_SEED}, horizon=${HORIZON}d, ${elapsed}s`);
line('\nRung first-passage day -- frontier (min over labs+open, internal track), unconditional/KM');
line('  rung   u-p10  u-p50  u-p90   crossed');
for (const r of [2, 3, 4, 5]) {
    const a = frontierCross[r];
    line(`  R${r}    ${d0(kmQuantile(a, N, 0.10)).padStart(5)}  ${d0(kmQuantile(a, N, 0.50)).padStart(5)}  `
        + `${d0(kmQuantile(a, N, 0.90)).padStart(5)}   ${pct(a.length / N).padStart(6)}`);
}

line('\n' + '='.repeat(70));
line('  gate                            want      got     status');
let allPass = true;
function gate(label, want, got, pass, note = '') {
    if (!pass) allPass = false;
    line(`  ${label.padEnd(28)} ${String(want).padStart(6)}   ${String(got).padStart(6)}    ${pass ? 'PASS' : 'MISS'}${note ? '   ' + note : ''}`);
}
// The stance: crossing medians within +/-10% or +/-25d of 02a's targets.
for (const [r, target] of [[2, 230], [3, 644], [4, 800], [5, 911]]) {
    const got = kmQuantile(frontierCross[r], N, 0.50);
    const tol = Math.max(0.10 * target, 25);
    gate(`R${r} median (uncond)`, target, d0(got), Number.isFinite(got) && Math.abs(got - target) <= tol, `(band ${tol.toFixed(0)})`);
}
gate('fizzle/elasticity tail', '12.0%', pct(plateauByE / N), plateauByE / N >= 0.09 && plateauByE / N <= 0.15, '(band 9.0%-15.0%)');
gate('S4 generation invariant', '0 viol', s4Violations, s4Violations === 0, `(of ${s4Checked} S4s)`);
gate('chain reports', 'held', replayReportsPass && corruptReportsPass && keepClaimPass && cascadePass ? 'held' : 'broke',
    replayReportsPass && corruptReportsPass && keepClaimPass && cascadePass,
    `(replay ${replayReportsPass}, corruption ${corruptReportsPass}, kept ${keepClaimPass} of ${keptChecked}, cascade ${cascadePass ? true : cascadeNotes.join('; ')})`);
gate('Polaris rounds on schedule', '0 moved', roundsMismatch, roundsMismatch === 0 && roundsChecked > 0, `(of ${roundsChecked} worlds, ${roundsTotal} rounds)`);

line('='.repeat(70));
line(allPass ? 'ALL GATES PASS' : 'ONE OR MORE GATES MISS -- see above');
process.exitCode = allPass ? 0 : 1;
