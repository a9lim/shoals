/* 02a "The reader": shared deterministic simulation/sampling contract for
   the offline fit and the harnesses. Never imported by the game. */
import { createRaceState, advanceRace, stepControlRegime } from '../src/race/race-state.js';
import { checkResolution, HORIZON } from '../src/race/resolution.js';
import { stepTreaty } from '../src/race/treaty-track.js';
import { frontierCertifiedDay, frontierInternalCrossDay } from '../src/race/consensus.js';
import { initBelief, stepBelief, belief } from '../src/race/belief.js';
import { createPublicRecord, createRecordFromSnapshot, foldPublicRecordRow, stepPublicRecord, recordFeatures, ruleSummary, FEATURE_NAMES } from '../src/race/public-record.js';
import { engineInputs } from './engine-worlds.mjs';

/** 02a "Demonstrations" (The refit): the worlds' input scenarios. The assumed
 *  Markov schedule is retired. */
export const WORLD_SCENARIOS = Object.freeze({
    scenarios: ['neutral', 'engine'],
    training: '4000 neutral + 4000 engine, alternating by world index; validation and test report each separately',
    neutral: 'no strait tension, export-control stage 0, treaty stage 0, no coupling; timeout extrapolation at zero tension',
    engine: 'a bystander headless Dynamic run (02a "Headless policies"; tools/engine-worlds.mjs): the event engine moves the world inputs, priced by the reader in place when the world was generated; the race replays from the run\'s input tape',
});

const NEUTRAL_GEO = Object.freeze({ chinaRelations: 0, tradeWarStage: 0 });
/** A world's daily orchestrator inputs, one call per completed day:
 *  { straitTension, exportControlStage, treatyStage, playerCoupling, exo, geo }.
 *  An engine world's come from its run's tape (the cache must hold it:
 *  `ensureEngineWorlds`). */
export function worldInputs(seed, scenario) {
    if (scenario === 'engine') return engineInputs(seed);
    if (scenario !== 'neutral') throw new Error(`Unknown world scenario ${scenario}`);
    return () => ({ straitTension: 0, exportControlStage: 0, treatyStage: 0, playerCoupling: 0, exo: null, geo: NEUTRAL_GEO });
}
/** One completed day of the race on a world's inputs, in the run's order
 *  (02a "The run, headless"): advanceRace, the regime ratchet, the treaty track. */
export function stepWorld(race, inputs) {
    advanceRace(race, { straitTension: inputs.straitTension, playerCoupling: inputs.playerCoupling, exportControlStage: inputs.exportControlStage });
    stepControlRegime(race, inputs.exo || undefined);
    stepTreaty(race, { treatyStage: inputs.treatyStage });
}

const ROLE_DAYS = [357, 693, 817, 937, 420, 756, 880, 1000];
const actOf = rec => rec.snapshot.view.releasedFrontierRung <= 2 ? 0 : rec.snapshot.view.releasedFrontierRung === 3 ? 1 : 2;
export function sampleRecord(rec, rule, world, scenario) {
    const legs = [2, 3, 4, 5].map(R => Array.from(recordFeatures(rec, 'full', rule, R).slice(0, 5)));
    const fullFamily = Array.from(recordFeatures(rec, 'full', rule, 'family'));
    return { world, scenario, day: rec.day, grid: rec.day % 21 === 0, offset: rec.day % 21 === world % 21, calibration: rec.day % 21 === 0 || ROLE_DAYS.includes(rec.day), act: actOf(rec),
        regime: rec.snapshot.view.controlRegime, rules: [2, 3, 4, 5].map(R => [rule[R].m, rule[R].w, +rule[R].crossed, rule[R].certDay ?? -1]), legs, family: fullFamily.slice(0, 8), common: fullFamily.slice(8),
        certified: [2, 3, 4, 5].map(R => R < 5 && Object.values(rec.snapshot.labs).some(l => l.certs[R] != null)) };
}
export function sampleFeatures(s, R, set) {
    if (set === 'prior') return Float64Array.of(s.day / 1008, R);
    if (R !== 'family' && set === 'legible') return Float64Array.from([...s.rules[R - 2], s.legs[R - 2][4], s.day / 1008]);
    const leg = R === 'family' ? s.family : s.legs[R - 2];
    return Float64Array.from(set === 'full' ? [...leg, ...s.common] : leg);
}

/** 02a: a world's sampling. Grid and seed-offset 21-day snapshots, explicit
 *  role-change knots, diagnostic days and each act boundary; coincident series
 *  share one snapshot. A snapshot taken on the day the world resolves is
 *  dropped (no extrapolation, no labels conditioned on surviving a quarter).
 *  `due(rec)` names a sampled day; the engine worlds store the rule's state on
 *  exactly those days. */
export function worldSampler(seed, scenario) {
    const samples = [], diagnostics = [], boundaries = [];
    let lastAct = 0;
    return {
        due: rec => rec.day % 21 === 0 || rec.day % 21 === seed % 21 || ROLE_DAYS.includes(rec.day) || rec.day === 350 || rec.day === 700 || lastAct !== actOf(rec),
        take: (rec, rule) => sampleRecord(rec, rule, seed, scenario),
        keep(snap) {
            if (snap.grid || snap.offset || snap.calibration) samples.push(snap);
            if (snap.day === 350 || snap.day === 700) diagnostics.push(snap);
            if (snap.act !== lastAct) { boundaries.push(snap); lastAct = snap.act; }
        },
        finish(targets, family) {
            for (const s of [...samples, ...diagnostics, ...boundaries]) { s.targets = targets; s.outcome = family; }
            return { samples, diagnostics, boundaries, targets, family };
        },
    };
}
/** The labels: certification days R2-R4 within the term, R5's internal crossing
 *  within the extrapolation, Infinity beyond. */
const capTargets = (targets, T5) => [...targets, T5 <= 1260 ? T5 : Infinity].map((v, i) => v <= (i === 3 ? 1260 : 1008) ? v : Infinity);

/** One world on the reader's loop: the race on the world's inputs, the rule of
 *  thumb beside it, sampled by `worldSampler`. `source` replaces the scenario's
 *  inputs (engine-worlds.mjs replays a stored tape to check it). */
export function runReaderWorld(seed, scenario = 'neutral', hook = null, source = null) {
    const race = createRaceState(seed), rec = createPublicRecord(race), inputsOf = source || worldInputs(seed, scenario);
    // 02a reader fit consumes the heuristic only. The public initializer's
    // capability-free form seeds that rule without phase-B pricing/player
    // projection; the complete race is still passed to stepBelief below.
    initBelief({ seed: race.seed, day: race.day });
    const sampler = worldSampler(seed, scenario);
    sampler.keep(sampler.take(rec, ruleSummary(belief.rungs, 0)));
    let targets = [Infinity, Infinity, Infinity], inputs = null;
    for (let d = 0; d < HORIZON && !race.resolution; d++) {
        inputs = inputsOf();
        stepWorld(race, inputs);
        stepBelief(race, inputs); stepPublicRecord(rec, race, inputs);
        const rule = ruleSummary(belief.rungs, race.day);
        if (hook) hook({ race, rec, rule, inputs });
        const snap = sampler.due(rec) ? sampler.take(rec, rule) : null;
        targets = [2, 3, 4].map(R => frontierCertifiedDay(race.capability, R));
        checkResolution(race, inputs.geo);
        if (race.resolution) break;
        if (snap) sampler.keep(snap);
    }
    if (!race.resolution) checkResolution(race, inputs?.geo);
    const out = sampler.finish(capTargets(targets, frontierInternalCrossDay(race.capability, 5)), race.resolution.family);
    return { ...out, race, rec };
}

/** An engine world's samples from its stored rows (the replay contract,
 *  public-record.js): the initial projection folded day by day, the rule's
 *  state read where the world stored it, the outcome as the run ended. Features
 *  come from the record as it stands, so a new schema needs no new world. */
export function samplesFromRows(world, scenario = 'engine') {
    const rec = createRecordFromSnapshot(world.initial), sampler = worldSampler(world.seed, scenario);
    const rungs = state => Object.fromEntries([2, 3, 4, 5].map((R, i) => [R, { m: state[i][0], w: state[i][1], crossed: state[i][2], certDay: state[i][3] }]));
    sampler.keep(sampler.take(rec, ruleSummary(rungs(world.rules[0]), 0)));
    const last = world.rows.length - 1;
    world.rows.forEach((row, i) => {
        foldPublicRecordRow(rec, row);
        if (!sampler.due(rec)) return;
        const state = world.rules[rec.day];
        if (!state) throw new Error(`engine world ${world.seed}: no rule state stored for sampled day ${rec.day}`);
        const snap = sampler.take(rec, ruleSummary(rungs(state), rec.day));
        if (i < last) sampler.keep(snap);
    });
    return { ...sampler.finish(world.outcome.targets.map(t => t ?? Infinity), world.outcome.family), rec };
}

/** 02a: the encoded sample's columns, derived from the feature names so the
 *  optimizer and the metrics never hard-code a schema's width. */
const COMMON = FEATURE_NAMES[2].full.length - 5;
export const SAMPLE_LAYOUT = Object.freeze({ legs: 10, family: 30, common: 38, commonCount: COMMON, rules: 38 + COMMON, mask: 38 + COMMON + 16, columns: 38 + COMMON + 17 });
export const DATA_HEADER = ['world', 'scenario', 'day', 'act', 'regime', 'T2', 'T3', 'T4', 'T5', 'outcome'];
export function encodeSample(s) {
    return [s.world, +(s.scenario !== 'neutral'), s.day, s.act,
        ['private', 'supervised', 'mobilized', 'nationalized', 'classified'].indexOf(s.regime),
        ...s.targets.map(t => Number.isFinite(t) ? t : 1e6), s.outcome, ...s.legs.flat(), ...s.family, ...s.common, ...s.rules.flat(), (s.grid ? 1 : 0) | (s.offset ? 2 : 0) | (s.calibration && !s.grid ? 4 : 0) | ([350,700].includes(s.day) ? 8 : 0)];
}
