#!/usr/bin/env node
/* ===================================================
   tools/run-test.mjs -- The run, headless (02a "The run,
   headless", "Gates"): the twelfth harness.

   A. No ambient randomness: Math.random throws; a Dynamic
      and a Classic run complete
   B. Determinism: a seed and a journal replay twice to
      the same per-day digest
   D. Round trip: a scripted policy's run (every command
      kind), recorded and replayed
   E. The fixture: tools/fixtures/run-fixture.json replays
      to its digest trail under its rules version
   F. Resume: replay to an endpoint, continue, match an
      uninterrupted run
   G. Order: a trace of the close matches AGENTS.md's
      race-block order
   I. The bystander: every pool dispatch and generator
      names a qualifying bystander choice
   J. Classic stays inert
   K. Timing: a full Dynamic headless run's wall time

   Usage: node tools/run-test.mjs [--rebaseline] [--record-interim] [--seed S]
     --rebaseline      re-derive the fixture's digest trail after a
                       RULES_VERSION bump (fails if a command no longer applies)
     --record-interim  regenerate the interim, headless-generated fixture
                       from the scripted policy (Claude replaces it with a
                       browser recording: window.shoalsJournal())
   =================================================== */

import { readFileSync, writeFileSync } from 'node:fs';
import { RULES_VERSION, DEFAULT_PRESET, STRIKE_INTERVAL } from '../src/config.js';
import { run, newRun, setSink, runInternals } from '../src/run.js';
import { runHeadless, drive, replayTo, keepDigests } from '../src/run-replay.js';
import { portfolio } from '../src/portfolio.js';
import { consensus } from '../src/race/consensus.js';
import { computeMarket, isComputeTradeable } from '../src/race/compute-market.js';
import { belief, draftState, editDraftState } from '../src/race/belief.js';
import { getAvailableActions } from '../src/lobbying.js';
import { STANDING_RULES } from '../src/standing-orders.js';
import { ALL_EVENTS } from '../src/events/index.js';
import { roundDispatch } from '../src/events/rounds.js';
import { roomChoices } from '../src/events/room.js';

const argv = process.argv.slice(2);
const REBASELINE = argv.includes('--rebaseline');
const RECORD_INTERIM = argv.includes('--record-interim');
let BASE_SEED = 20261027;
for (let i = 0; i < argv.length; i++) if (argv[i] === '--seed') BASE_SEED = parseInt(argv[++i], 10) >>> 0;

const FIXTURE = new URL('./fixtures/run-fixture.json', import.meta.url);
let failures = 0;
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok, detail }); if (!ok) failures++; }
const t0 = Date.now();
// The race's resolution line is the page's log; keep the harness's output to its checks.
const _log = console.log;
const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = _log; } };

// ---- Policies ------------------------------------------------------------------

/** What a bystander choice may not carry (02a "Headless policies"). */
const NOT_BYSTANDER = ['trades', 'round', 'raceEffects', 'raceLeak', '_applyReportingRegime', '_openDispute', '_ruleDispute', 'regulatoryAction', '_tipAction'];
const qualifies = (c) => !!c && !NOT_BYSTANDER.some(k => c[k] != null && c[k] !== false);

/**
 * TEST POLICY, not the bystander: answers the choice flagged `bystander: true`
 * where a dispatch has one, else the first choice that would qualify, else the
 * first. It stands in for BYSTANDER in the determinism gates until pass B's
 * flags cover every dispatch (section I reports which do not).
 */
const TEST_BYSTANDER = Object.freeze({
    name: 'test-bystander (interim)', hand: false, commands: null,
    answer(ev) {
        const cs = ev.choices || [];
        let i = cs.findIndex(c => c.bystander);
        if (i < 0) i = cs.findIndex(qualifies);
        return i < 0 ? 0 : i;
    },
});

/** The listed expiries and an at-the-money strike, as the ticket resolves them. */
const expiries = () => run.expiryMgr.update(run.sim.day).map(e => e.day);
const atm = () => Math.round(run.sim.S / STRIKE_INTERVAL) * STRIKE_INTERVAL;
const leg = (type, side, qty, extra = {}) => ({ type, side, qty, desc: type, ...extra });

/**
 * The scripted policy: every command kind at a fixed run day (between days) or
 * substep, resolved the way the page resolves it, answering dispatches like the
 * test policy. Stateless in position, so a resumed run continues it exactly.
 */
const SCRIPTED = Object.freeze({
    name: 'scripted', hand: true,
    answer: TEST_BYSTANDER.answer,
    commands(pos) {
        const rel = pos.day - run.origin, sub = pos.substeps, out = [];
        const ex = expiries();
        if (sub === 0 && rel === 2) {
            out.push({ kind: 'trade', order: { kind: 'legs', order: 'market', trigger: null, legs: [leg('stock', 'long', 10)] } });
            out.push({ kind: 'setting', param: 'mu', value: run.sim.mu + 0.01 });
        }
        if (sub === 0 && rel === 3) {
            const K = atm();
            out.push({ kind: 'trade', order: { kind: 'strategy', name: 'Bull call', size: 2, order: 'market', trigger: null,
                legs: [{ type: 'call', qty: 1, strike: K, expiryDay: ex[0] }, { type: 'call', qty: -1, strike: K + 10, expiryDay: ex[0] }] } });
        }
        if (sub === 0 && rel === 4) {
            out.push({ kind: 'trade', order: { kind: 'legs', order: 'limit', trigger: Math.round(run.sim.S * 0.7), legs: [leg('stock', 'long', 5)] } });
        }
        if (sub === 0 && rel === 5 && portfolio.orders.length) out.push({ kind: 'cancel', id: portfolio.orders[0].id });
        if (sub === 8 && rel === 5) {
            out.push({ kind: 'trade', order: { kind: 'legs', order: 'market', trigger: null, legs: [leg('call', 'long', 5, { strike: atm() - 10, expiryDay: ex[1] })] } });
        }
        if (sub === 0 && rel === 6) {
            const c = portfolio.positions.find(p => p.type === 'call' && p.qty > 0 && !p.strategyName);
            if (c) out.push({ kind: 'exercise', id: c.id });
        }
        if (sub === 0 && rel === 7) {
            const s = portfolio.positions.find(p => p.type === 'stock' && !p.strategyName);
            if (s) out.push({ kind: 'close', id: s.id });
        }
        if (sub === 0 && rel === 8) out.push({ kind: 'unwind', name: 'Bull call' });
        if (sub === 0 && rel === 9 && belief.player) {
            out.push({ kind: 'forecast', state: editDraftState(draftState(), { op: 'median', R: 2, v: 400 }) });
        }
        if (sub === 0 && rel === 10 && run.engine) {
            const a = getAvailableActions(run.sim.history.maxDay, portfolio.cash).find(x => x.affordable && x.cooldownReady);
            if (a) out.push({ kind: 'lobby', action: a.id });
        }
        if (sub === 0 && rel === 11) out.push({ kind: 'standing', id: STANDING_RULES[0].id, on: true });
        if (sub === 0 && rel === 12 && run.race) {
            const bin = consensus.contracts.find(c => consensus.quotes[c.key] && !consensus.quotes[c.key].settled);
            const cmp = computeMarket.contracts.find(c => isComputeTradeable(c.key));
            const legs = [];
            if (bin) legs.push(leg('binary', 'long', 3, { key: bin.key }));
            if (cmp) legs.push(leg('computefuture', 'short', 2, { key: cmp.key }));
            legs.push(leg('bond', 'long', 4, { expiryDay: ex[2] }));
            out.push({ kind: 'trade', order: { kind: 'legs', order: 'market', trigger: null, legs } });
        }
        if (sub === 0 && rel === 14) {
            const legs = portfolio.positions.filter(p => p.type !== 'privatestake').map(p => {
                const keyed = p.type === 'binary' || p.type === 'computefuture';
                return { type: p.type, side: p.qty > 0 ? 'short' : 'long', qty: Math.abs(p.qty), strike: keyed ? undefined : p.strike,
                    key: keyed ? p.strike : undefined, expiryDay: p.expiryDay, desc: p.type, posId: p.id, strategyName: p.strategyName || null };
            });
            out.push({ kind: 'trade', order: { kind: 'flatten', legs } });
        }
        if (sub === 0 && rel === 16) out.push({ kind: 'setting', param: 'rho', value: run.sim.rho - 0.05 });
        return out;
    },
});

const trail = (digests) => digests.map(d => `${d.day}:${d.h}`);
function firstDiff(a, b) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
    return -1;
}
const clone = (x) => JSON.parse(JSON.stringify(x));

/** Replay a record's journal on a fresh run, keeping digests; returns the trail. */
function replayRecord(rec) {
    keepDigests(true);
    quiet(() => {
        newRun({ preset: rec.header.preset, seed: rec.header.seed, hand: rec.header.hand ?? true });
        replayTo(clone(rec.journal), rec.endpoint);
    });
    return trail(run.digests);
}

// ---- A. No ambient randomness --------------------------------------------------
{
    const real = Math.random;
    let threw = null;
    Math.random = () => { throw new Error('ambient Math.random in a run'); };
    try {
        quiet(() => {
            runHeadless({ seed: BASE_SEED, policy: TEST_BYSTANDER });
            runHeadless({ seed: BASE_SEED, preset: 0, policy: TEST_BYSTANDER, until: 252 });
            runHeadless({ seed: BASE_SEED + 1, policy: SCRIPTED, until: 60 });
        });
    } catch (e) { threw = e; }
    Math.random = real;
    check('A: with Math.random throwing, a Dynamic, a Classic and a scripted run complete', !threw, threw ? threw.message : '');
    const src = ['main.js', ...['act3', 'run', 'run-desk', 'run-state', 'run-replay', 'simulation', 'events', 'lobbying', 'price-impact', 'portfolio'].map(f => `src/${f}.js`), 'src/events/tips.js'];
    const hits = [];
    for (const f of src) {
        const text = readFileSync(new URL('../' + f, import.meta.url), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        if (/Math\.random\s*\(/.test(text)) hits.push(f);
    }
    check('A: no Math.random call in the run\'s modules (randomSeed in rng.js is the one)', hits.length === 0, hits.join(', '));
}

// ---- B. Determinism -------------------------------------------------------------
let recScripted = null;
{
    const a = quiet(() => runHeadless({ seed: BASE_SEED, policy: SCRIPTED, until: 120, digests: true }));
    recScripted = clone(a);
    const b = quiet(() => runHeadless({ seed: BASE_SEED, policy: SCRIPTED, until: 120, digests: true }));
    const d = firstDiff(trail(a.digests), trail(b.digests));
    check('B: a seed and a policy run twice to the same per-day digest', d < 0 && a.digests.length === 120,
        d < 0 ? `${a.digests.length} closes, ${a.journal.length} commands` : `first difference at close ${d}`);
    const kinds = new Set(a.journal.map(e => e.cmd.kind));
    const want = ['trade', 'cancel', 'close', 'unwind', 'exercise', 'answer', 'forecast', 'standing', 'lobby', 'setting'];
    check('B: the scripted policy journals every command kind', want.every(k => kinds.has(k)), `missing: ${want.filter(k => !kinds.has(k)).join(', ') || 'none'}`);
    const orderKinds = new Set(a.journal.filter(e => e.cmd.kind === 'trade').map(e => e.cmd.order.kind + '/' + e.cmd.order.order));
    check('B: ticket sends cover legs, a strategy, a resting order and the flatten',
        ['legs/market', 'strategy/market', 'legs/limit', 'flatten/undefined'].every(k => orderKinds.has(k)), [...orderKinds].join(' '));
}

// ---- D. Round trip ------------------------------------------------------------------
{
    const t = trail(recScripted.digests);
    const r = replayRecord(recScripted);
    const d = firstDiff(t, r);
    check('D: the scripted run, recorded and replayed, reproduces its digest trail', d < 0,
        d < 0 ? `${r.length} closes, ${recScripted.journal.length} commands` : `first difference at close ${d}`);
    let threw = false;
    try {
        const bad = clone(recScripted);
        const i = bad.journal.findIndex(e => e.cmd.kind === 'answer');
        bad.journal[i].cmd.occ += 1000;
        replayRecord(bad);
    } catch { threw = true; }
    check('D: an answer naming a dispatch that is not up fails the replay loudly', threw);
}

// ---- E. The fixture -------------------------------------------------------------------
{
    if (RECORD_INTERIM) {
        const rec = clone(recScripted);
        const fixture = {
            source: 'headless-generated (interim): tools/run-test.mjs --record-interim, the scripted policy. '
                + 'Replace with a browser recording (window.shoalsJournal()) of trades, a strategy, a flatten, resting '
                + 'orders, an exercise, dispatch answers, forecast edits, a standing order and a government action.',
            header: rec.header, journal: rec.journal, endpoint: rec.endpoint, digests: rec.digests,
        };
        writeFileSync(FIXTURE, JSON.stringify(fixture, null, 1) + '\n');
        console.log(`wrote the interim fixture: ${rec.journal.length} commands, ${rec.digests.length} closes`);
    }
    let fx = null;
    try { fx = JSON.parse(readFileSync(FIXTURE, 'utf8')); } catch (e) { check('E: the fixture loads', false, e.message); }
    if (fx) {
        if (REBASELINE) {
            let threw = null, t = null;
            try { t = replayRecord(fx); } catch (e) { threw = e; }
            check('E: --rebaseline: every fixture command still applies', !threw,
                threw ? `${threw.message}; re-record the fixture in the browser` : '');
            if (!threw) {
                fx.header.v = RULES_VERSION;
                fx.digests = run.digests;
                writeFileSync(FIXTURE, JSON.stringify(fx, null, 1) + '\n');
                console.log(`rebaselined the fixture under rules version ${RULES_VERSION}: ${t.length} closes`);
            }
        }
        check('E: the fixture was recorded under the current rules version', fx.header.v === RULES_VERSION,
            `fixture v${fx.header.v}, RULES_VERSION ${RULES_VERSION}${fx.header.v === RULES_VERSION ? '' : ': run --rebaseline'}`);
        let threw = null, t = null;
        try { t = replayRecord(fx); } catch (e) { threw = e; }
        const d = t ? firstDiff(trail(fx.digests), t) : 0;
        check('E: the fixture replays headless to its digest trail', !threw && d < 0,
            threw ? threw.message : d < 0 ? `${t.length} closes, ${fx.journal.length} commands (${(fx.source || 'a browser recording').split(':')[0]})` : `first difference at close ${d}`);
    }
}

// ---- F. Resume ------------------------------------------------------------------------
{
    const full = quiet(() => runHeadless({ seed: BASE_SEED + 5, policy: SCRIPTED, until: 90, digests: true }));
    const tFull = trail(full.digests);
    // The save's endpoint: between days after run day 20's close.
    const part = quiet(() => runHeadless({ seed: BASE_SEED + 5, policy: SCRIPTED, until: 20, digests: true }));
    const save = clone({ header: part.header, journal: part.journal, endpoint: part.endpoint });
    keepDigests(true);
    quiet(() => {
        newRun({ preset: save.header.preset, seed: save.header.seed, hand: save.header.hand });
        replayTo(save.journal, save.endpoint);
        drive(SCRIPTED, 90);
    });
    const d = firstDiff(tFull, trail(run.digests));
    check('F: replaying a save to its endpoint and continuing matches the uninterrupted run', d < 0 && save.endpoint.phase === 'between',
        d < 0 ? `endpoint day ${save.endpoint.day - run.origin}, ${save.endpoint.commands} commands; ${tFull.length} closes` : `first difference at close ${d}`);
}

// ---- G. Order -------------------------------------------------------------------------
{
    // The close's steps (run.js mark()) and the AGENTS.md text each names them by.
    const DOC = [
        ['snapshotForecast', 'snapshot on a lock day'], ['stepCoupling', '`stepCoupling`'], ['advanceRace', '`advanceRace('],
        ['stepControlRegime', '`stepControlRegime`'], ['stepTreaty', '`stepTreaty`'], ['syncRaceToWorld', '`_syncRaceToWorld()`'],
        ['setBaseRateScale', '`setBaseRateScale`'], ['stepAct3', '`_stepAct3()`'], ['syncStandingOrders', 'standing-order sync'],
        ['stepBelief', '`stepBelief`'], ['settleConsensus', 'Consensus and compute'], ['settleCompute', 'Consensus and compute'],
        ['standingDayRules', 'standing day rules'], ['scoreQuarter', '`scoreQuarter`'], ['checkResolution', '`checkResolution`'],
        ['checkRoom', '`_checkRoom`'], ['maybeFire', 'After the event engine'], ['raceBridge', 'the bridge pass'],
        ['stepRaceMarkets', '`_stepRaceMarkets`'], ['marketsDayClose', '`marketsDayClose`'],
    ];
    const agents = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
    const para = agents.slice(agents.indexOf('That opens with the forecast'), agents.indexOf('### Pricing, impact, portfolio')).replace(/\s+/g, ' ');
    const at = new Map(DOC.map(([k, t]) => [k, para.indexOf(t)]));
    const docOrdered = DOC.every(([k], i) => at.get(k) >= 0 && (i === 0 || at.get(k) >= at.get(DOC[i - 1][0])));
    check('G: AGENTS.md names every step of the close, in this order', docOrdered,
        DOC.filter(([k]) => at.get(k) < 0).map(([, t]) => t).join(', ') || '');
    const traces = [];
    quiet(() => {
        newRun({ preset: DEFAULT_PRESET, seed: BASE_SEED + 7, hand: false });
        run.trace = [];
        let mark = 0;
        setSink({ afterClose: () => { traces.push(run.trace.slice(mark)); mark = run.trace.length; } });
        try { drive(TEST_BYSTANDER, 400); } finally { setSink(null); run.trace = null; }
    });
    const RACE = ['stepCoupling', 'advanceRace', 'stepControlRegime', 'stepTreaty', 'syncRaceToWorld', 'setBaseRateScale', 'stepAct3',
        'syncStandingOrders', 'stepBelief', 'settleConsensus', 'settleCompute', 'standingDayRules', 'checkResolution', 'checkRoom', 'maybeFire', 'raceBridge',
        'stepRaceMarkets', 'marketsDayClose'];
    let bad = null, locks = 0;
    const pos = new Map(DOC.map(([k], i) => [k, i]));
    for (let i = 0; i < traces.length && !bad; i++) {
        const tr = traces[i];
        if (tr.includes('scoreQuarter')) locks++;
        if (!RACE.every(k => tr.includes(k))) bad = `close ${i} misses ${RACE.filter(k => !tr.includes(k)).join(', ')}`;
        else if (tr.some((k, j) => j > 0 && pos.get(k) < pos.get(tr[j - 1]))) bad = `close ${i}: ${tr.join(' → ')}`;
        else if (tr.includes('snapshotForecast') && tr[0] !== 'snapshotForecast') bad = `close ${i}: the snapshot is not first`;
    }
    check('G: every close runs the race block in the documented order', !bad && traces.length === 400 && locks >= 5,
        bad || `${traces.length} closes, ${locks} lock days scored`);
}

// ---- I. The bystander -------------------------------------------------------------------
{
    const missing = [];
    const named = (where, choices) => {
        const c = (choices || []).find(x => x.bystander);
        if (!c) missing.push(`${where} (no choice flagged)`);
        else if (!qualifies(c)) missing.push(`${where} (its bystander choice carries ${NOT_BYSTANDER.filter(k => c[k] != null && c[k] !== false).join(', ')})`);
    };
    const pool = ALL_EVENTS.filter(e => e.popup && Array.isArray(e.choices) && e.choices.length);
    for (const e of pool) named(e.id, e.choices);
    named('generator: Halcyon follow-on', roundDispatch({ kind: 'halcyon', id: 'probe_h', day: 0, price: 100 }, 100).choices);
    named('generator: Polaris founding round', roundDispatch({ kind: 'polaris', id: 'probe_p', day: 0, price: 1, founding: true, ratio: 1 }, 100).choices);
    for (const voice of [2, 3, 4, 5, 6]) for (const summit of [false, true]) {
        const cs = roomChoices(voice, summit);
        if (cs.length) named(`generator: the room (voice ${voice}${summit ? ', summit' : ''})`, cs);
    }
    named('generator: margin call', runInternals.marginCallDispatch({ triggered: true, equity: 100, collateralEquity: 100, required: 200 }).choices);
    named('generator: game over', runInternals.gameOverDispatch('probe', 'forced_resignation', 'probe').choices);
    const shown = missing.slice(0, 12).join('; ') + (missing.length > 12 ? `; and ${missing.length - 12} more` : '');
    check('I: every pool dispatch and generator names a qualifying bystander choice (pass B adds the flags)',
        missing.length === 0, `${pool.length} pool dispatches; ${missing.length} without: ${shown}`);
    if (missing.length) console.log(`I: dispatches without a qualifying bystander choice (${missing.length}):\n  ` + missing.join('\n  '));
}

// ---- J. Classic stays inert -------------------------------------------------------------
{
    quiet(() => runHeadless({ seed: BASE_SEED + 3, preset: 0, policy: SCRIPTED, until: 120 }));
    const inert = run.engine === null && run.race === null && !consensus.active && !computeMarket.active && !belief.active
        && !run.journal.some(e => e.cmd.kind === 'answer') && !run.journal.some(e => e.cmd.kind === 'forecast');
    check('J: a Classic run has no engine, race, Consensus, compute, belief, dispatch or forecast', inert);
}

// ---- K. Timing ----------------------------------------------------------------------------
let timing = '';
{
    const ms = [], days = [];
    for (let i = 0; i < 5; i++) {
        const t = Date.now();
        const r = quiet(() => runHeadless({ seed: BASE_SEED + 100 + i, policy: TEST_BYSTANDER }));
        ms.push(Date.now() - t);
        days.push(r.endpoint.day - run.origin);
    }
    const t = Date.now();
    quiet(() => runHeadless({ seed: BASE_SEED + 100, policy: TEST_BYSTANDER, digests: true }));
    const withDigests = Date.now() - t;
    const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
    timing = `a full Dynamic headless run (test bystander, no digests): mean ${(mean / 1000).toFixed(2)} s over ${ms.length} seeds `
        + `(${ms.map(x => (x / 1000).toFixed(2)).join(', ')} s; ${days.join(', ')} run days); with the digest trail ${(withDigests / 1000).toFixed(2)} s`;
    check('K: a full Dynamic headless run completes (timing reported)', ms.length === 5, timing);
}

// ---- Summary ------------------------------------------------------------------------------
console.log('\n' + '='.repeat(72));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
console.log(`\nRun gate: base seed ${BASE_SEED}, rules version ${RULES_VERSION}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`Timing: ${timing}`);
if (failures) {
    console.log(`\nFAIL: ${failures} run check(s) failed`);
    process.exit(1);
}
console.log('\nPASS: all run checks');

