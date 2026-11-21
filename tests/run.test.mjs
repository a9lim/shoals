// The run, headless (02a "The run, headless"): a run is its seed, its journal and
// its rules version. Determinism, isolation between runs, the save's round trip
// and resume are invisible in play until a player's save resumes somewhere else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRIKE_INTERVAL } from '../src/config.js';
import { run, newRun, runInternals } from '../src/run.js';
import { runHeadless, drive, replayTo, keepDigests, BYSTANDER } from '../src/run-replay.js';
import { portfolio } from '../src/portfolio.js';
import { consensus } from '../src/race/consensus.js';
import { computeMarket, isComputeTradeable } from '../src/race/compute-market.js';
import { belief, draftState, editDraftState } from '../src/race/belief.js';
import { getAvailableActions } from '../src/lobbying.js';
import { STANDING_RULES } from '../src/standing-orders.js';
import { ALL_EVENTS } from '../src/events/index.js';
import { roundDispatch } from '../src/events/rounds.js';
import { roomChoices } from '../src/events/room.js';

const SEED = 20261027;
const _log = console.log;
const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = _log; } };
const clone = (x) => JSON.parse(JSON.stringify(x));
const trail = (digests) => digests.map(d => `${d.day}:${d.h}`);

const expiries = () => run.expiryMgr.update(run.sim.day).map(e => e.day);
const atm = () => Math.round(run.sim.S / STRIKE_INTERVAL) * STRIKE_INTERVAL;
const leg = (type, side, qty, extra = {}) => ({ type, side, qty, desc: type, ...extra });

/** Every command kind at a fixed run day or substep, resolved the way the page
 *  resolves it, answering dispatches as the bystander does. Stateless in
 *  position, so a resumed run continues it exactly. */
const SCRIPTED = Object.freeze({
    name: 'scripted', hand: true,
    answer: BYSTANDER.answer,
    commands(pos) {
        const rel = pos.day - run.origin, sub = pos.substeps, out = [], ex = expiries();
        if (sub === 8 && rel === 5) out.push({ kind: 'trade', order: { kind: 'legs', order: 'market', trigger: null, legs: [leg('call', 'long', 5, { strike: atm() - 10, expiryDay: ex[1] })] } });
        if (sub !== 0) return out;
        if (rel === 2) {
            out.push({ kind: 'trade', order: { kind: 'legs', order: 'market', trigger: null, legs: [leg('stock', 'long', 10)] } });
            out.push({ kind: 'setting', param: 'mu', value: run.sim.mu + 0.01 });
        }
        if (rel === 3) {
            const K = atm();
            out.push({ kind: 'trade', order: { kind: 'strategy', name: 'Bull call', size: 2, order: 'market', trigger: null,
                legs: [{ type: 'call', qty: 1, strike: K, expiryDay: ex[0] }, { type: 'call', qty: -1, strike: K + 10, expiryDay: ex[0] }] } });
        }
        if (rel === 4) out.push({ kind: 'trade', order: { kind: 'legs', order: 'limit', trigger: Math.round(run.sim.S * 0.7), legs: [leg('stock', 'long', 5)] } });
        if (rel === 5 && portfolio.orders.length) out.push({ kind: 'cancel', id: portfolio.orders[0].id });
        if (rel === 6) {
            const c = portfolio.positions.find(p => p.type === 'call' && p.qty > 0 && !p.strategyName);
            if (c) out.push({ kind: 'exercise', id: c.id });
        }
        if (rel === 7) {
            const s = portfolio.positions.find(p => p.type === 'stock' && !p.strategyName);
            if (s) out.push({ kind: 'close', id: s.id });
        }
        if (rel === 8) out.push({ kind: 'unwind', name: 'Bull call' });
        if (rel === 9 && belief.player) out.push({ kind: 'forecast', state: editDraftState(draftState(), { op: 'median', R: 2, v: 400 }) });
        if (rel === 10 && run.engine) {
            const a = getAvailableActions(run.sim.history.maxDay, portfolio.cash).find(x => x.affordable && x.cooldownReady);
            if (a) out.push({ kind: 'lobby', action: a.id });
        }
        if (rel === 11) out.push({ kind: 'standing', id: STANDING_RULES[0].id, on: true });
        if (rel === 12 && run.race) {
            const bin = consensus.contracts.find(c => consensus.quotes[c.key] && !consensus.quotes[c.key].settled);
            const cmp = computeMarket.contracts.find(c => isComputeTradeable(c.key));
            const legs = [];
            if (bin) legs.push(leg('binary', 'long', 3, { key: bin.key }));
            if (cmp) legs.push(leg('computefuture', 'short', 2, { key: cmp.key }));
            legs.push(leg('bond', 'long', 4, { expiryDay: ex[2] }));
            out.push({ kind: 'trade', order: { kind: 'legs', order: 'market', trigger: null, legs } });
        }
        if (rel === 14) {
            const legs = portfolio.positions.filter(p => p.type !== 'privatestake').map(p => {
                const keyed = p.type === 'binary' || p.type === 'computefuture';
                return { type: p.type, side: p.qty > 0 ? 'short' : 'long', qty: Math.abs(p.qty), strike: keyed ? undefined : p.strike,
                    key: keyed ? p.strike : undefined, expiryDay: p.expiryDay, desc: p.type, posId: p.id, strategyName: p.strategyName || null };
            });
            out.push({ kind: 'trade', order: { kind: 'flatten', legs } });
        }
        if (rel === 16) out.push({ kind: 'setting', param: 'rho', value: run.sim.rho - 0.05 });
        return out;
    },
});

/** Replay a record's journal on a fresh run; returns its digest trail. */
function replayRecord(rec) {
    keepDigests(true);
    quiet(() => {
        newRun({ preset: rec.header.preset, seed: rec.header.seed, hand: rec.header.hand ?? true });
        replayTo(clone(rec.journal), rec.endpoint);
    });
    return trail(run.digests);
}

test('no state path draws Math.random: Dynamic, Classic and scripted runs complete with it throwing', () => {
    const real = Math.random;
    Math.random = () => { throw new Error('ambient Math.random in a run'); };
    try {
        quiet(() => {
            runHeadless({ seed: SEED, policy: BYSTANDER });
            runHeadless({ seed: SEED, preset: 0, policy: BYSTANDER, until: 252 });
            runHeadless({ seed: SEED + 1, policy: SCRIPTED, until: 60 });
        });
    } finally { Math.random = real; }
});

test('a seed and a journal: determinism, the round trip and a loud divergence', () => {
    const a = clone(quiet(() => runHeadless({ seed: SEED, policy: SCRIPTED, until: 120, digests: true })));
    const b = quiet(() => runHeadless({ seed: SEED, policy: SCRIPTED, until: 120, digests: true }));
    assert.equal(a.digests.length, 120);
    assert.deepEqual(trail(b.digests), trail(a.digests), 'the same seed and policy ran to different states');

    const kinds = new Set(a.journal.map(e => e.cmd.kind));
    for (const k of ['trade', 'cancel', 'close', 'unwind', 'exercise', 'answer', 'forecast', 'standing', 'lobby', 'setting']) {
        assert.ok(kinds.has(k), `the scripted policy journaled no ${k} command, so the round trip does not cover it`);
    }
    const orders = new Set(a.journal.filter(e => e.cmd.kind === 'trade').map(e => `${e.cmd.order.kind}/${e.cmd.order.order}`));
    for (const k of ['legs/market', 'strategy/market', 'legs/limit', 'flatten/undefined']) assert.ok(orders.has(k), `no ${k} send`);

    assert.deepEqual(replayRecord(a), trail(a.digests), 'the recorded journal replayed to a different trail');

    const bad = clone(a);
    bad.journal[bad.journal.findIndex(e => e.cmd.kind === 'answer')].cmd.occ += 1000;
    assert.throws(() => replayRecord(bad), 'an answer naming a dispatch that is not up replayed silently');
});

// A reset that missed a module shows here before a player meets it on Restart.
test('isolation: runs A, B, A and Dynamic, Classic, Dynamic reproduce A', () => {
    const A = trail(quiet(() => runHeadless({ seed: SEED + 11, policy: BYSTANDER, until: 300, digests: true })).digests);
    quiet(() => runHeadless({ seed: SEED + 22, policy: SCRIPTED, until: 200, digests: true }));
    assert.deepEqual(trail(quiet(() => runHeadless({ seed: SEED + 11, policy: BYSTANDER, until: 300, digests: true })).digests), A);
    quiet(() => runHeadless({ seed: SEED + 11, preset: 0, policy: SCRIPTED, until: 100, digests: true }));
    assert.deepEqual(trail(quiet(() => runHeadless({ seed: SEED + 11, policy: BYSTANDER, until: 300, digests: true })).digests), A);
});

test('resume: replaying a save to its endpoint and continuing matches the uninterrupted run', () => {
    const full = trail(quiet(() => runHeadless({ seed: SEED + 5, policy: SCRIPTED, until: 90, digests: true })).digests);
    const part = quiet(() => runHeadless({ seed: SEED + 5, policy: SCRIPTED, until: 20, digests: true }));
    const save = clone({ header: part.header, journal: part.journal, endpoint: part.endpoint });
    assert.equal(save.endpoint.phase, 'between');
    keepDigests(true);
    quiet(() => {
        newRun({ preset: save.header.preset, seed: save.header.seed, hand: save.header.hand });
        replayTo(save.journal, save.endpoint);
        drive(SCRIPTED, 90);
    });
    assert.deepEqual(trail(run.digests), full);
});

test('Classic stays inert: no engine, race, books, belief, dispatch or forecast', () => {
    quiet(() => runHeadless({ seed: SEED + 3, preset: 0, policy: SCRIPTED, until: 120 }));
    assert.equal(run.engine, null);
    assert.equal(run.race, null);
    assert.ok(!consensus.active && !computeMarket.active && !belief.active);
    assert.ok(!run.journal.some(e => e.cmd.kind === 'answer' || e.cmd.kind === 'forecast'));
});

// Headless runs (the engine worlds, the bystander) answer every dispatch with the
// choice it names; a dispatch without one would stall or move the world.
test('every dispatch, pooled or generated, names one bystander choice that carries no action', () => {
    const NOT_BYSTANDER = ['trades', 'round', 'raceEffects', 'raceLeak', '_applyReportingRegime', '_openDispute', '_ruleDispute', 'regulatoryAction', '_tipAction'];
    const missing = [];
    const named = (where, choices) => {
        const flagged = (choices || []).filter(x => x.bystander);
        if (flagged.length !== 1) missing.push(`${where}: ${flagged.length} flagged`);
        else if (NOT_BYSTANDER.some(k => flagged[0][k] != null && flagged[0][k] !== false)) missing.push(`${where}: it acts`);
    };
    for (const e of ALL_EVENTS) if (e.popup && e.choices?.length) named(e.id, e.choices);
    named('Halcyon follow-on', roundDispatch({ kind: 'halcyon', id: 'probe_h', day: 0, price: 100 }, 100).choices);
    named('Polaris founding round', roundDispatch({ kind: 'polaris', id: 'probe_p', day: 0, price: 1, founding: true, ratio: 1 }, 100).choices);
    for (const voice of [2, 3, 4, 5, 6]) for (const summit of [false, true]) named(`the room (${voice}, ${summit})`, roomChoices(voice, summit));
    named('margin call', runInternals.marginCallDispatch({ triggered: true, equity: 100, collateralEquity: 100, required: 200 }).choices);
    named('game over', runInternals.gameOverDispatch('probe', 'forced_resignation', 'probe').choices);
    assert.deepEqual(missing, []);
});
