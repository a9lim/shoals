#!/usr/bin/env node
/* ===================================================
   tools/engine-worlds.mjs -- the engine worlds (02a
   "Demonstrations", The refit; "The run, headless",
   Headless policies). One world is a bystander's headless
   Dynamic run on src/run-replay.js: no inherited desk, every
   dispatch answered by its bystander choice, the event
   engine moving the world inputs, B and V priced by the
   reader in place. Captured at each close (the run's
   `checkResolution` mark, before the ladder):

     rows     the public record's daily rows and its initial
              projection (the replay contract, public-record.js),
              never features, so any schema reads them
     rules    the rule of thumb's state on every sampled day
     tape     the race's orchestrator inputs per day (geopolitics,
              export-control and treaty stages, the coupling,
              the regime pushes): the race replays from it
     outcome  the family, the labels and the resolution

   Every world is checked as it is written: the race replayed
   from the tape on the reader's loop reproduces the record,
   the rule's states, the samples and the outcome bit for bit.
   Worlds run on worker_threads and are cached one file per
   world, keyed by RULES_VERSION and the reader constants'
   hash, in .cache/engine-worlds/ (git ignores it;
   SHOALS_ENGINE_CACHE overrides the directory).

   Usage: node tools/engine-worlds.mjs [--seeds A-B ...]
              [--threads K] [--bench N]
   --bench N times N worlds on this thread, uncached.
   Never imported by the game.
   =================================================== */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { RULES_VERSION } from '../src/config.js';
import { straitTension } from '../src/race/strait.js';
import { HORIZON as HORIZON_DAYS } from '../src/race/resolution.js';

const READER_FILE = new URL('../src/race/reader-constants.js', import.meta.url);
/** The cache key: the rules and the reader that priced the worlds. */
export function engineKey() {
    const reader = createHash('sha256').update(readFileSync(READER_FILE)).digest('hex').slice(0, 16);
    return `r${RULES_VERSION}-${reader}`;
}
export const ENGINE_CACHE = process.env.SHOALS_ENGINE_CACHE || fileURLToPath(new URL('../.cache/engine-worlds/', import.meta.url));
const worldPath = (seed, key = engineKey()) => join(ENGINE_CACHE, key, `${seed}.json.gz`);

// ---- Storage encoding ------------------------------------------------------
// A row omits what is empty and a snapshot that differs from the day before
// only by its day; the tape stores runs of equal values.

const EMPTY_ROW = () => ({ snapshot: null, inputs: null, spawned: [], releases: [], certifications: [], incidents: [], thefts: [],
    grayZone: [], blockadeStart: false, blockadeEnd: false, regimeChange: null, treatyWindow: false, treatyOutcome: null, demonstrations: [] });
const ROW_KEYS = Object.keys(EMPTY_ROW());
const isEmpty = v => v === null || v === false || (Array.isArray(v) && v.length === 0);
const undated = s => JSON.stringify({ ...s, day: 0, view: { ...s.view, day: 0 } });
function encodeRows(rows) {
    let snap = null, inputs = null;
    return rows.map(row => {
        const out = {};
        for (const k of Object.keys(row)) if (!ROW_KEYS.includes(k)) throw new Error(`engine worlds: the public row grew a field (${k}); teach the encoding`);
        const s = undated(row.snapshot), i = JSON.stringify(row.inputs);
        if (s !== snap) { out.snapshot = row.snapshot; snap = s; }
        if (i !== inputs) { out.inputs = row.inputs; inputs = i; }
        for (const k of ROW_KEYS.slice(2)) if (!isEmpty(row[k])) out[k] = row[k];
        return out;
    });
}
function decodeRows(stored, initialDay) {
    let snap = null, inputs = null;
    return stored.map((o, i) => {
        const row = EMPTY_ROW(), day = initialDay + i + 1;
        if (o.snapshot) snap = o.snapshot;
        else { snap = structuredClone(snap); snap.day = day; snap.view.day = day; }
        if (o.inputs) inputs = o.inputs;
        Object.assign(row, o, { snapshot: snap, inputs: { ...inputs } });
        return row;
    });
}
const runs = values => values.reduce((out, v, i) => {
    if (!out.length || JSON.stringify(out.at(-1)[1]) !== JSON.stringify(v)) out.push([i, v]);
    return out;
}, []);
const unrun = (rle, n) => { const out = []; for (let k = 0; k < rle.length; k++) for (let i = rle[k][0]; i < (rle[k + 1]?.[0] ?? n); i++) out.push(rle[k][1]); return out; };
function encodeTape(days) {
    return { n: days.length, geo: runs(days.map(d => d.geo)), exportControlStage: runs(days.map(d => d.exportControlStage)),
        treatyStage: runs(days.map(d => d.treatyStage)), playerCoupling: runs(days.map(d => d.playerCoupling)), exo: runs(days.map(d => d.exo)) };
}
function decodeTape(t) {
    const geo = unrun(t.geo, t.n), ex = unrun(t.exportControlStage, t.n), tr = unrun(t.treatyStage, t.n), pc = unrun(t.playerCoupling, t.n), exo = unrun(t.exo, t.n);
    return Array.from({ length: t.n }, (_, i) => {
        const g = { chinaRelations: geo[i][0], tradeWarStage: geo[i][1] };
        return { straitTension: straitTension(g), exportControlStage: ex[i], treatyStage: tr[i], playerCoupling: pc[i], exo: exo[i], geo: g };
    });
}
const encodeWorld = w => gzipSync(JSON.stringify({ ...w, rows: encodeRows(w.rows), tape: encodeTape(w.tape) }));
function decodeWorld(buf) {
    const w = JSON.parse(gunzipSync(buf));
    return { ...w, rows: decodeRows(w.rows, w.initial.day), tape: decodeTape(w.tape) };
}
/** An engine world from the cache (generated under the current key). */
export function loadEngineWorld(seed, key = engineKey()) {
    const p = worldPath(seed, key);
    if (!existsSync(p)) throw new Error(`engine world ${seed} is not cached under ${key}: run ensureEngineWorlds first (node tools/engine-worlds.mjs --seeds ${seed}-${seed})`);
    return decodeWorld(readFileSync(p));
}
/** A world's tape as reader-data's inputs closure, one completed day per call. */
export function engineInputs(seed, key = engineKey()) {
    const tape = loadEngineWorld(seed, key).tape;
    let d = 0;
    return () => {
        if (d >= tape.length) throw new Error(`engine world ${seed}: the run ended on day ${tape.length}`);
        return tape[d++];
    };
}
const tapeSource = tape => { let d = 0; return () => tape[d++]; };

// ---- One world ---------------------------------------------------------------

const EXO_FLAGS = { evalsPush: 'lobbied_evals_regime', supervisionPush: 'lobbied_supervision', mobilizationPush: 'lobbied_mobilization',
    nationalizationPush: 'lobbied_nationalization', classificationPush: 'lobbied_classification' };
/** The run's world generator, loaded once per thread (the run's modules are
 *  singletons; a thread plays its worlds one after another). */
async function worldGenerator() {
    const [{ run, newRun }, { drive, BYSTANDER, keepDigests }, { DEFAULT_PRESET }, { belief }, PR, { frontierCertifiedDay, frontierInternalCrossDay }, RD] = await Promise.all([
        import('../src/run.js'), import('../src/run-replay.js'), import('../src/config.js'), import('../src/race/belief.js'),
        import('../src/race/public-record.js'), import('../src/race/consensus.js'), import('./reader-data.mjs')]);
    const ruleState = () => [2, 3, 4, 5].map(R => { const r = belief.rungs[R]; return [r.m, r.w, !!r.crossed, r.certDay ?? null]; });
    return function generate(seed) {
        const t0 = performance.now();
        keepDigests(false);
        newRun({ preset: DEFAULT_PRESET, seed, hand: false });
        const race = run.race, initial = belief.record.initial, sampler = RD.worldSampler(seed, 'engine');
        const rows = [], rules = { 0: ruleState() }, tape = [];
        let targets = null;
        sampler.keep(sampler.take(belief.record, PR.ruleSummary(belief.rungs, 0)));
        PR.tapRecordRows((rec, row) => { if (rec === belief.record) rows.push(row); });
        // The close's mark before the ladder: the day's row is folded, the rule
        // stepped, and the inputs the race took this close are still in place.
        run.trace = { push(label) {
            if (label !== 'checkResolution') return;
            const rec = belief.record, day = race.day, geo = run.engine.world.geopolitical;
            if (rec.day !== day || rows.length !== day) throw new Error(`engine world ${seed}: ${rows.length} rows by day ${day}`);
            const g = [geo.chinaRelations || 0, geo.tradeWarStage || 0];
            if (straitTension({ chinaRelations: g[0], tradeWarStage: g[1] }) !== rec.inputs.straitTension) throw new Error(`engine world ${seed}: day ${day}'s geopolitics moved inside the race block`);
            const pushes = Object.entries(EXO_FLAGS).filter(([, flag]) => run.playerChoices[flag]);
            tape.push({ geo: g, exportControlStage: rec.inputs.exportControlStage, treatyStage: rec.inputs.treatyStage, playerCoupling: race.playerCoupling,
                exo: pushes.length ? Object.fromEntries(Object.entries(EXO_FLAGS).map(([k, flag]) => [k, !!run.playerChoices[flag]])) : null });
            if (sampler.due(rec)) { rules[day] = ruleState(); sampler.keep(sampler.take(rec, PR.ruleSummary(belief.rungs, day))); }
            targets = [2, 3, 4].map(R => frontierCertifiedDay(race.capability, R));
        } };
        try { drive(BYSTANDER); } finally { PR.tapRecordRows(null); run.trace = null; }
        const res = race.resolution;
        if (!res) throw new Error(`engine world ${seed}: the run ended unresolved`);
        if (rows.length !== tape.length || rows.length !== Math.min(res.day, HORIZON_DAYS)) throw new Error(`engine world ${seed}: resolved on day ${res.day} after ${rows.length} rows and ${tape.length} closes`);
        const T5 = frontierInternalCrossDay(race.capability, 5);
        const labels = [...targets, T5 <= 1260 ? T5 : Infinity].map((v, i) => v <= (i === 3 ? 1260 : 1008) ? v : null);
        const world = { seed, key: engineKey(), ms: +(performance.now() - t0).toFixed(1), initial, rows, rules, tape,
            outcome: { day: res.day, family: res.family, cause: res.terminalCause ?? null, extrapolated: !!res.extrapolated, targets: labels } };
        // The check: what is stored replays. Rows (through the storage encoding)
        // and the race replayed from the tape must agree on everything sampled.
        const buf = encodeWorld(world), stored = decodeWorld(buf);
        const fromRows = RD.samplesFromRows(stored), replay = RD.runReaderWorld(seed, 'engine', null, tapeSource(stored.tape));
        const view = w => JSON.stringify([w.samples, w.diagnostics, w.boundaries, w.targets, w.family, w.rec]);
        if (view(fromRows) !== view(replay)) throw new Error(`engine world ${seed}: the stored rows and the tape's replay disagree`);
        return { buf, ms: world.ms };
    };
}

// ---- The pool ----------------------------------------------------------------

// No top-level await: reader-data.mjs imports this module back, and a cycle
// through a suspended module never settles.
if (!isMainThread && workerData?.engineWorlds) worldGenerator().then(generate => {
    console.log = () => {};      // the run narrates its resolutions; a thread keeps quiet
    parentPort.on('message', ({ seed, key }) => {
        try {
            const { buf, ms } = generate(seed);
            const path = worldPath(seed, key), tmp = `${path}.${process.pid}.${seed}.tmp`;
            writeFileSync(tmp, buf); renameSync(tmp, path);
            parentPort.postMessage({ seed, ms, bytes: buf.length });
        } catch (e) { parentPort.postMessage({ seed, error: e.stack || String(e) }); }
    });
    parentPort.postMessage({ ready: true });
});

/** Generate every listed world the cache lacks under the current key, on
 *  `threads` worker threads. Resolves to { key, generated, cached, ms, wall }. */
export async function ensureEngineWorlds(seeds, { threads = Math.max(1, availableParallelism() - 2), log = console.log } = {}) {
    const key = engineKey();
    mkdirSync(join(ENGINE_CACHE, key), { recursive: true });
    const missing = [...new Set(seeds)].filter(s => !existsSync(worldPath(s, key)));
    const out = { key, generated: missing.length, cached: seeds.length - missing.length, ms: [], bytes: 0, wall: 0 };
    if (!missing.length) return out;
    const t0 = performance.now(), queue = [...missing], n = Math.min(threads, missing.length);
    log(`engine worlds: generating ${missing.length} under ${key} on ${n} threads`);
    await Promise.all(Array.from({ length: n }, () => new Promise((resolve, reject) => {
        const w = new Worker(new URL(import.meta.url), { workerData: { engineWorlds: true } });
        const next = () => { if (queue.length) w.postMessage({ seed: queue.shift(), key }); else w.terminate().then(resolve); };
        w.on('message', m => {
            if (m.error) { w.terminate(); reject(new Error(m.error)); return; }
            if (!m.ready) {
                out.ms.push(m.ms); out.bytes += m.bytes;
                if (out.ms.length % 500 === 0) log(`engine worlds: ${out.ms.length}/${missing.length}, ${((performance.now() - t0) / 1000).toFixed(0)} s`);
            }
            next();
        });
        w.on('error', reject);
    })));
    out.wall = (performance.now() - t0) / 1000;
    log(`engine worlds: ${missing.length} in ${out.wall.toFixed(1)} s wall; ${(out.ms.reduce((a, b) => a + b, 0) / out.ms.length).toFixed(0)} ms per world on a thread; ${(out.bytes / missing.length / 1024).toFixed(1)} KiB per world`);
    return out;
}

// ---- CLI ---------------------------------------------------------------------

if (isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) cli().catch(e => { console.error(e); process.exit(1); });
async function cli() {
    const args = process.argv.slice(2), opt = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
    if (opt('--bench')) {
        const generate = await worldGenerator(), n = +opt('--bench'), ms = [];
        console.log = (...a) => { if (!String(a[0]).startsWith('[race resolution]')) process.stdout.write(a.join(' ') + '\n'); };
        for (let s = 1; s <= n; s++) ms.push(generate(s).ms);
        ms.sort((a, b) => a - b);
        console.log(`bench: ${n} worlds, mean ${(ms.reduce((a, b) => a + b, 0) / n).toFixed(1)} ms, median ${ms[n >> 1].toFixed(1)} ms, max ${ms.at(-1).toFixed(1)} ms (one thread, generation only; the replay check adds to wall time)`);
    } else {
        const seeds = [];
        for (let i = 0; i < args.length; i++) if (args[i] === '--seeds') { const [a, b] = args[++i].split('-').map(Number); for (let s = a; s <= b; s++) seeds.push(s); }
        const threads = opt('--threads') ? +opt('--threads') : undefined;
        const r = await ensureEngineWorlds(seeds, { threads });
        console.log(`engine worlds under ${r.key}: ${r.generated} generated, ${r.cached} cached (${ENGINE_CACHE})`);
    }
}
