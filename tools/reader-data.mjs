/* 02a "The reader": shared deterministic simulation/sampling contract for
   the offline fit and tenth harness. Never imported by the game. */
import { createRaceState, advanceRace, stepControlRegime } from '../src/race/race-state.js';
import { checkResolution, HORIZON } from '../src/race/resolution.js';
import { stepTreaty } from '../src/race/treaty-track.js';
import { frontierCertifiedDay, frontierInternalCrossDay } from '../src/race/consensus.js';
import { initBelief, stepBelief, belief } from '../src/race/belief.js';
import { createRng, deriveSeed } from '../src/race/rng.js';
import { straitTension } from '../src/race/strait.js';
import { createPublicRecord, stepPublicRecord, recordFeatures, ruleSummary } from '../src/race/public-record.js';

export const INPUT_SCHEDULE = Object.freeze({
    scenarios: ['neutral', 'markov'],
    training: '4000 neutral + 4000 Markov, alternating by world index; validation and test report each separately',
    stream: 'reader-input-schedule-v1',
    initial: { chinaRelations: 0, tradeWarStage: 0, exportControlStage: 0, treatyStage: 0 },
    ranges: { chinaRelations: [-3, 3], tradeWarStage: [0, 4], exportControlStage: [0, 3], treatyStage: [0, 4] },
    dailyMoveProbability: { chinaRelations: 1 / 126, tradeWarStage: 1 / 252, exportControlStage: 1 / 252, treatyStage: 1 / 252 },
    movement: 'nearest-neighbour symmetric +/-1 with clamping at boundaries; four draws each day, even in neutral worlds; tension=straitTension(geo)',
    rationale: 'Slow 126/252-day texture, reflecting Poisson policy/treaty arcs. Assumed schedule, not an event-engine emulator; treaty stages may reverse here.',
});
export function inputSchedule(seed, scenario) {
    const rng = createRng(deriveSeed(seed, INPUT_SCHEDULE.stream));
    const state = { ...INPUT_SCHEDULE.initial };
    return () => {
        for (const key of Object.keys(state)) {
            const u = rng.next(), p = INPUT_SCHEDULE.dailyMoveProbability[key];
            if (scenario !== 'neutral' && u < p) {
                const [lo, hi] = INPUT_SCHEDULE.ranges[key];
                state[key] = Math.max(lo, Math.min(hi, state[key] + (u < p / 2 ? -1 : 1)));
            }
        }
        const geo = { chinaRelations: state.chinaRelations, tradeWarStage: state.tradeWarStage };
        return { ...state, geo, straitTension: straitTension(geo) };
    };
}
export function sampleRecord(rec, rule, world, scenario) {
    const legs = [2, 3, 4, 5].map(R => Array.from(recordFeatures(rec, 'full', rule, R).slice(0, 5)));
    const fullFamily = Array.from(recordFeatures(rec, 'full', rule, 'family'));
    return { world, scenario, day: rec.day, grid: rec.day % 21 === 0, offset: rec.day % 21 === world % 21, calibration: rec.day % 21 === 0 || [357,693,817,937,420,756,880,1000].includes(rec.day), act: rec.snapshot.view.releasedFrontierRung <= 2 ? 0 : rec.snapshot.view.releasedFrontierRung === 3 ? 1 : 2,
        regime: rec.snapshot.view.controlRegime, rules: [2, 3, 4, 5].map(R => [rule[R].m, rule[R].w, +rule[R].crossed, rule[R].certDay ?? -1]), legs, family: fullFamily.slice(0, 8), common: fullFamily.slice(8),
        certified: [2, 3, 4, 5].map(R => R < 5 && Object.values(rec.snapshot.labs).some(l => l.certs[R] != null)) };
}
export function sampleFeatures(s, R, set) {
    if (set === 'prior') return Float64Array.of(s.day / 1008, R);
    if (R !== 'family' && set === 'legible') return Float64Array.from([...s.rules[R - 2], s.legs[R - 2][4], s.day / 1008]);
    const leg = R === 'family' ? s.family : s.legs[R - 2];
    return Float64Array.from(set === 'full' ? [...leg, ...s.common] : leg);
}
/** 02a: grid and seed-offset 21-day snapshots, explicit role-change knots,
 * diagnostic days, and first act boundary. Coincident series share one snapshot.
 * Samples on a resolving day are removed after checkResolution, avoiding
 * extrapolation and avoiding conditioning labels on surviving a quarter. */
export function runReaderWorld(seed, scenario = 'neutral', hook = null) {
    const race = createRaceState(seed), rec = createPublicRecord(race), schedule = inputSchedule(seed, scenario);
    // 02a reader fit consumes the heuristic only. The public initializer's
    // capability-free form seeds that rule without phase-B pricing/player
    // projection; the complete race is still passed to stepBelief below.
    initBelief({ seed: race.seed, day: race.day });
    const samples = [], boundaries = [], diagnostics = [];
    let rule = ruleSummary(belief.rungs, 0), lastAct = 0;
    samples.push(sampleRecord(rec, rule, seed, scenario));
    let targets = [Infinity, Infinity, Infinity, Infinity], inputs = null;
    for (let d = 0; d < HORIZON && !race.resolution; d++) {
        inputs = schedule();
        advanceRace(race, { straitTension: inputs.straitTension, exportControlStage: inputs.exportControlStage });
        stepControlRegime(race); stepTreaty(race, { treatyStage: inputs.treatyStage });
        stepBelief(race, inputs); stepPublicRecord(rec, race, inputs);
        rule = ruleSummary(belief.rungs, race.day);
        if (hook) hook({ race, rec, rule, inputs });
        const pending = race.day % 21 === 0 || race.day % 21 === seed % 21 || [357,693,817,937,420,756,880,1000].includes(race.day) || race.day === 350 || race.day === 700
            || (lastAct !== (rec.snapshot.view.releasedFrontierRung <= 2 ? 0 : rec.snapshot.view.releasedFrontierRung === 3 ? 1 : 2));
        const snap = pending ? sampleRecord(rec, rule, seed, scenario) : null;
        targets = [2, 3, 4].map(R => frontierCertifiedDay(race.capability, R));
        const liveDay = race.day;
        checkResolution(race, inputs.geo);
        if (race.resolution) break;
        if (snap) {
            if (snap.grid || snap.offset || snap.calibration) samples.push(snap);
            if (liveDay === 350 || liveDay === 700) diagnostics.push(snap);
            if (snap.act !== lastAct) { boundaries.push(snap); lastAct = snap.act; }
        }
    }
    if (!race.resolution) checkResolution(race, inputs?.geo);
    const T5 = frontierInternalCrossDay(race.capability, 5);
    targets.push(T5 <= 1260 ? T5 : Infinity);
    targets = targets.map((v, i) => v <= (i === 3 ? 1260 : 1008) ? v : Infinity);
    for (const s of [...samples, ...diagnostics, ...boundaries]) { s.targets = targets; s.outcome = race.resolution.family; }
    return { samples, diagnostics, boundaries, targets, family: race.resolution.family, race };
}
export const DATA_HEADER = ['world', 'scenario', 'day', 'act', 'regime', 'T2', 'T3', 'T4', 'T5', 'outcome'];
export function encodeSample(s) {
    return [s.world, +(s.scenario !== 'neutral'), s.day, s.act,
        ['private', 'supervised', 'mobilized', 'nationalized', 'classified'].indexOf(s.regime),
        ...s.targets.map(t => Number.isFinite(t) ? t : 1e6), s.outcome, ...s.legs.flat(), ...s.family, ...s.common, ...s.rules.flat(), (s.grid ? 1 : 0) | (s.offset ? 2 : 0) | (s.calibration && !s.grid ? 4 : 0) | ([350,700].includes(s.day) ? 8 : 0)];
}
