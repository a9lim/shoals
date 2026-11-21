// The hidden race's own invariants: rules
// that hold by design but show in play only in rare worlds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceState, advanceRace, freshTransitions } from '../src/race/race-state.js';
import { createPublicRecord, publicRecordRow, foldPublicRecordRow, chainReports } from '../src/race/public-record.js';
import { stepDemonstrations, closeDemonstrations, freshDemonstrationState } from '../src/race/demonstrations.js';
import { initRounds, stepRounds, polarisRoundDays } from '../src/race/rounds.js';

const HORIZON = 1008;

// An S4 self-discloses on the tick it occurs and is never persuasion-class;
// demonstrations time Polaris's funding window by the nominal round schedule,
// so the rounds must open on it.
test('every S4 discloses in its occurrence tick, and Polaris\'s rounds open on the nominal schedule', () => {
    let s4 = 0, worlds = 0;
    for (let seed = 1; seed <= 20; seed++) {
        const race = createRaceState(seed);
        initRounds(race);
        const days = [];
        let spawn = null;
        for (let d = 0; d < HORIZON; d++) {
            advanceRace(race);
            for (const r of stepRounds(race, 0)) days.push(r.day);
            if (race.lastTransitions.spawned.includes('polaris')) spawn = race.day;
        }
        for (const inc of race.latentIncidents) {
            if (inc.severity !== 4) continue;
            s4++;
            assert.ok(inc.detected && inc.detectDay === inc.occurDay && inc.cls !== 'persuasion', `seed ${seed}: an S4 stayed hidden`);
        }
        if (spawn != null) {
            worlds++;
            assert.deepEqual(days, polarisRoundDays(race.seed, spawn, HORIZON).filter(d => d <= HORIZON), `seed ${seed}`);
        }
    }
    assert.ok(s4 > 0 && worlds > 0);
});

// Worlds almost never cite a demonstration still awaiting its evaluation, so the
// withdrawal's reach is checked on a constructed chain.
test('a withdrawal takes everything that cites it, and nothing else; the close cancels what is pending', () => {
    const race = createRaceState(1);
    race.capability.labs.halcyon.active = false;
    race.demonstrations = freshDemonstrationState();
    const st = race.demonstrations, chain = [];
    const add = (lab, rung, day, cites, flawed, reach, evalDay, disputeDay) => {
        const seq = chain.length + 1;
        chain.push({ id: 'D' + seq, seq, lab, rung, day, cites, ordinal: seq, truth: { reach, flawed, C: rung }, evalDay, disputeDay,
            status: 'standing', disputeId: null, evaluationId: null, withdrawnBy: null, root: null });
    };
    add('halcyon', 2, 11, null, true, 'overScoped', 50, 55);     // D1 the flawed root
    add('halcyon', 3, 20, 'D1', false, 'sound', 40, null);       // D2 upheld on day 40, then taken with its root
    add('halcyon', 4, 30, 'D2', false, 'overScoped', 50, null);  // D3 due the root's day: taken first
    add('halcyon', 4, 35, null, false, 'sound', 50, 52);         // D4 unrelated, upheld
    add('polaris', 2, 36, null, true, 'sound', 80, 45);          // D5 disputed, untouched
    st.nextId = chain.length + 1;
    race.day = 10;
    const rec = createPublicRecord(race);
    for (let day = 10; day < 60; day++) {
        race.day = day + 1;
        const tr = freshTransitions();
        tr.demonstrations = stepDemonstrations(race, tr, day, day + 1);
        for (const d of chain.filter(x => x.day === day + 1)) {
            st.list.push(d);
            tr.demonstrations.push({ kind: 'publication', id: d.id, lab: d.lab, rung: d.rung, cites: d.cites, ordinal: d.ordinal });
        }
        race.lastTransitions = tr;
        foldPublicRecordRow(rec, publicRecordRow(race));
    }
    const reps = new Map(chainReports(rec).map(r => [r.id, r]));
    const rows = rec.demonstrations.filter(r => r.kind !== 'publication')
        .map(r => `${r.day}:${r.kind}:${r.on}${r.took ? '>' + r.took.join('+') : ''}${r.outcome ? '=' + r.outcome : ''}`).join(' ');
    assert.equal(rows, '40:evaluation:D2=upheld 45:dispute:D5 50:withdrawal:D1>D2+D3 50:evaluation:D4=upheld');
    assert.ok(['D1', 'D2', 'D3'].every(id => reps.get(id).status === 'withdrawn' && reps.get(id).root === 'D1'));
    assert.deepEqual(reps.get('D3').ancestry, ['D2', 'D1']);
    assert.ok(reps.get('D4').status === 'upheld' && reps.get('D5').status === 'disputed');
    race.resolution = { family: 6 };
    assert.equal(stepDemonstrations(race, freshTransitions(), 60, 61).length, 0);
    assert.ok(st.closed && st.list.every(d => d.evalDay == null && d.disputeDay == null));
    closeDemonstrations(race);
});
