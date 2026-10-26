#!/usr/bin/env node
/* ===================================================
   02a "The reader": deterministic offline fit.
   A. World-split natural trajectories and public-only features
   B. Exact integer-day interval likelihood, L2, validation selection
   C. Validation bands, learning floor and residual challengers
   D. Fixed-precision, byte-reproducible generated artifact
   E. All-head 21-day segmented hazard calibration and guarded fallback map
   Optimizer uses existing Python NumPy/SciPy (no package installation).
   Run: node tools/reader-fit.mjs [--reuse-data DIR] [--work DIR]
        [--reuse-fit] [--resume] [--reuse-heads DIR]
   Default regenerates data and fits every head without checkpoints; reuse flags are explicit.
   Runtime provenance names the estimator; report.fitExecution records the actual path.
   Default splits are contractual; no small-N artifact path exists.
   =================================================== */
import { writeFileSync, appendFileSync, readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { RECORD_SCHEMA, FEATURE_NAMES, READER_CLOCK_DAYS, readerCalibrationDays, RULE_HAZARD_FLOOR } from '../src/race/public-record.js';
import { INPUT_SCHEDULE, runReaderWorld, encodeSample } from './reader-data.mjs';

const args = process.argv.slice(2), option = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const stage = option('--stage') || 'all';
if (stage !== 'all') throw new Error(`Unknown stage ${stage}`);
const reused = option('--reuse-data');
const dir = resolve(reused || option('--work') || mkdtempSync(join(tmpdir(), 'shoals-reader-')));
mkdirSync(dir, { recursive: true });
const t0 = performance.now();
const meta = { schema: RECORD_SCHEMA, schedule: INPUT_SCHEDULE, features: FEATURE_NAMES, clockDays: READER_CLOCK_DAYS, hazardFloor: RULE_HAZARD_FLOOR, splits: {
    train: [1000001, 1008000], validation: [2000001, 2002000], test: 'base 1, never read by the fit',
}, calibrationDays: Object.fromEntries([2,3,4,5].map(R=>[R,readerCalibrationDays(R)])), sampleMaskColumn:169, minCalibrationWorlds: 200, minCalibrationEvents: 5,
    lambdas: [1e-9, 1e-8, 1e-7, 1e-6, 1e-5], maxIterations: 2500 };
if (!reused) {
    for (const [split, [lo, hi]] of Object.entries(meta.splits).filter(([key]) => key !== 'test')) {
        const path = join(dir, `${split}.bin`); writeFileSync(path, '');
        let rows = 0, columns = 0;
        for (let seed = lo; seed <= hi; seed++) {
            const scenario = (seed - lo) % 2 === 0 ? 'neutral' : 'markov';
            const w = runReaderWorld(seed, scenario);
            // 02a: masks distinguish grid, seed-offset, explicit role knots and
            // family diagnostics; coincident days share one public snapshot.
            const samples = [...new Map([...w.samples, ...w.diagnostics].map(s=>[s.day,s])).values()].sort((a,b)=>a.day-b.day);
            const vals = samples.flatMap(encodeSample); columns = encodeSample(samples[0]).length;
            const data = Float64Array.from(vals); appendFileSync(path, Buffer.from(data.buffer));
            rows += samples.length;
            if ((seed - lo + 1) % 250 === 0) console.log(`${split}: ${seed - lo + 1}/${hi - lo + 1} worlds, ${(performance.now() - t0).toFixed(0)} ms`);
        }
        meta[split] = { rows, columns };
    }
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
}
const savedMeta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
if (savedMeta.schema !== RECORD_SCHEMA || JSON.stringify(savedMeta.features) !== JSON.stringify(FEATURE_NAMES)) throw new Error('Stale fitting data: regenerate for the current schema');
console.log(`Optimizer data: ${dir}`);
if (!args.includes('--reuse-fit')) {
const child = spawn('python', [fileURLToPath(new URL('./reader-optimizer.py', import.meta.url)), dir, stage, ...(args.includes('--resume') ? ['--resume'] : []), ...(option('--reuse-heads') ? ['--reuse-heads', option('--reuse-heads')] : [])], {
    stdio: 'inherit', env: { ...process.env, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1', VECLIB_MAXIMUM_THREADS: '1', MKL_NUM_THREADS: '1' },
});
const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
if (code !== 0) throw new Error(`Reader optimizer exited ${code}; data preserved in ${dir}`);
}
const fitPath = join(dir, `fit-schema${RECORD_SCHEMA}-${stage}.json`);
const result = JSON.parse(readFileSync(fitPath, 'utf8'));
if (!result.report.optimizer.length || result.report.optimizer.some(x => !x.converged)) throw new Error('Unconverged fit cannot be published as runtime constants');
if (!result.report.calibrationFits?.length || result.report.calibrationFits.some(x => !x.converged)) throw new Error('Unconverged segment calibration cannot be published');

for (const R of [2,3,4,5]) for (const set of ['prior','legible','full']) {
    const head = result.models[R]?.[set], calibration = head?.calibration, calibrationDays=readerCalibrationDays(R);
    if (!head || JSON.stringify(calibration?.knots) !== JSON.stringify(calibrationDays) || calibration.states?.length !== (set === 'prior' ? 1 : 2)
        || calibration.states.some(state => ['early','middle','tail'].some(key => state.sigma?.[key]?.length !== calibrationDays.length
            || state.sigma[key].some(x => !Number.isFinite(x))))) throw new Error(`Incomplete segmented calibration ${R}/${set}`);
    if (set !== 'legible') {
        const parts = set === 'prior' ? [head] : head.states;
        if (!parts?.length || parts.some(part => !part?.mean || !part.scale || part.weights?.length !== 6 || (set === 'full' && part.calibration))) throw new Error(`Incomplete raw hazard ${R}/${set}`);
    }
}
if (['legible','full'].some(set => result.models.family?.[set]?.acts?.length !== 3)) throw new Error('Incomplete family fit cannot replace runtime constants');
const runMeta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
if (runMeta.schema !== RECORD_SCHEMA || JSON.stringify(runMeta.features) !== JSON.stringify(FEATURE_NAMES)) throw new Error('Stale fitting data: regenerate for the current schema');
const fixed = (_key, v) => typeof v === 'number' ? Number(v.toPrecision(7)) : v;
const provenance = 'tools/reader-fit.mjs; train 1000001–1008000; validation 2000001–2002000; no test data; single-thread deterministic L-BFGS-B hazards/softmax; dual grid/seed-offset hazard samples; training-only grid plus role-knot segmented hazard moment matching, one-sided scale-space interpolation, pooled prior';
const constants = JSON.parse(JSON.stringify({ schema: RECORD_SCHEMA, provenance,
    schedule: { stream: INPUT_SCHEDULE.stream, ranges: INPUT_SCHEDULE.ranges, dailyMoveProbability: INPUT_SCHEDULE.dailyMoveProbability,
        summary: 'Half neutral, half clamped symmetric Markov; all start at zero; straitTension(geo); timeout freezes tension/export, uses treatyStage 0 per checkResolution.' },
    bases: result.bases, models: result.models }, fixed));
const report = { schema: RECORD_SCHEMA, provenance, schedule: INPUT_SCHEDULE, splits: runMeta.splits, ...result.report };
report.fitExecution = { regeneratedData: !reused, reusedFit: args.includes('--reuse-fit'), resumedCandidates: args.includes('--resume'), reusedHeads: !!option('--reuse-heads'),
    optimizerMode: result.report.provenanceMode ?? (result.report.reusedHeads ? 'explicit raw-head reuse' : 'raw heads fit from fixed initialization') };
report.priorInformation = 'Clock/rung only, including the claim-state-pooled calibration stage; no claimed input or routing.';
const artifact = new URL('../src/race/reader-constants.js', import.meta.url);
const write = () => writeFileSync(artifact, `/* generated by tools/reader-fit.mjs — do not edit; 02a "The reader".\n   ${provenance} */\nexport const READER_CONSTANTS = ${JSON.stringify(constants)};\n`);
// Publish only the complete, converged model and every guarded calibration stage.
write();
const { decodeSample, quarterEntries, quarterMetrics, challengerMetrics, familyMetrics, familyMetricsFromRows, deadlineMetrics, legibleHorizonMetrics, calendarHorizonMetrics, plantedDefectMetrics, trainingTargetSources, CHALLENGER_SPEC } = await import('./reader-metrics.mjs');
const info = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')).validation;
const buffer = readFileSync(join(dir, 'validation.bin'));
const data = new Float64Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 8);
const samples = [];
for (let i = 0; i < info.rows; i++) samples.push(decodeSample(data.subarray(i * info.columns, (i + 1) * info.columns)));
report.convergenceByHead = {};
report.heads = structuredClone(report.heads);
for (const R of [2,3,4,5]) for (const set of ['prior','legible','full']) {
    const calibrationRows = result.report.calibrationFits.filter(x => x.head.startsWith(`${R}/${set}/`));
    const key = `${R}/${set}`;
    report.convergenceByHead[key] = { calibration: { method: 'sequential scalar monotone moment matching',
        allConverged: calibrationRows.every(x => x.converged), solves: calibrationRows.length,
        longestSolve: Math.max(0,...calibrationRows.map(x => x.iterations)), maxMomentError: Math.max(0,...calibrationRows.map(x => x.maxMomentError)) } };
    if (set === 'legible') continue;
    for (const state of set === 'prior' ? [null] : [0,1]) {
        const rawKey = `${R}/${set}${state == null ? '' : `/${state}`}`, h = report.heads[rawKey];
        const rows = report.optimizer.filter(x => String(x.rung) === String(R) && x.set === set && (x.state ?? null) === state);
        const selected = rows.filter(x => x.lambda === h?.lambda);
        report.convergenceByHead[rawKey] = { ...report.convergenceByHead[rawKey], raw: {
            allCandidatesConverged: rows.every(x => x.converged), selectedLambda: h?.lambda,
            selectedIterations: selected.map(x => x.iterations), longestCandidate: Math.max(0,...rows.map(x => x.iterations)) } };
        if (h) h.features = result.models[R][set].features.length;
    }
}
for (const set of ['legible','full']) {
    const rows = report.optimizer.filter(x => x.rung === 'family' && x.set === set); let offset = 0;
    for (const act of [0,1,2]) {
        const key = `family/${set}/act${act}`, count = report.candidateScores[key].length, sub = rows.slice(offset, offset + count); offset += count;
        report.convergenceByHead[key] = { allCandidatesConverged: sub.every(x => x.converged), selectedLambda: report.heads[key].lambda,
            selectedIterations: sub.filter(x => x.lambda === report.heads[key].lambda).map(x => x.iterations), longestCandidate: Math.max(...sub.map(x => x.iterations)) };
    }
}
report.calibrationStage = { ...result.report.calibrationStage,
    formula: 'Linearly interpolate exp(sigma) between grid/role knots; sum scale_segment(t)*[H_raw(min(D,boundary))-H_raw(previous boundary)] over sorted unique boundaries. Before deadline: early ends at min(quarter,deadline), middle at max(quarter,deadline), tail at support; coincident quarter/deadline uses early. After deadline: middle ends at quarter, tail at support; coincident quarter/support uses middle.',
    method: 'Training-only sequential scalar moment matching at every 21-day knot; each full/legible claim state and pooled prior; incremental-event and survivor guards; nearest valid knot fallbacks; interpolate scales.',
    coefficients: Object.fromEntries([2,3,4,5].map(R => [R,Object.fromEntries(['prior','legible','full'].map(set => [set,result.models[R][set].calibration]))])) };
report.familyActs = { selector: 'Public released frontier, including the open ecosystem: <=R2, R3, >=R4. Explicit selector, never inferred from lab-only claims.',
    basis: 'Same global training-quantile basis as schema 7; separate standardization, weights and lambda in each act.',
    absentClass: 'Family 6 has zero training observations in Acts II and III. Its unpenalized softmax intercept has a boundary MLE; initialized at log(1e-12), then optimized to ordinary convergence tolerance. No class is removed or fixed to zero.' };
report.nesting = 'Information contract: legible rung laws depend only on raw rule state, clock and claim state; changing every other public-record coordinate leaves them bit-identical. No literal basis-nesting assertion.';
report.scenarios = {};
const pooledEntries = [], pooledFamilyRows = [];
let bestUpper = 0;
for (const scenario of INPUT_SCHEDULE.scenarios) {
    console.log(`Validation metrics and challengers: ${scenario}`);
    const sub = samples.filter(s => s.scenario === scenario), entries = quarterEntries(sub, constants);
    const metrics = quarterMetrics(entries), challengers = challengerMetrics(entries);
    const calendar = calendarHorizonMetrics(entries,['legible','full'],true,result.report.calibrationStage), plantedDefects = plantedDefectMetrics(entries);
    const families = familyMetrics(sub, constants, true, pooledFamilyRows);
    for (const entry of entries) pooledEntries.push(entry);
    report.scenarios[scenario] = { ...metrics, challengers, family: families, deadlines: deadlineMetrics(entries), calendar, plantedDefects };
    for (const R of [2,3,4,5]) for (const set of ['legible','full']) {
        const c = calendar[R][set];
        console.log(`Validation support ${scenario} R${R} ${set}: bias=${c.support.bias}, n=${c.support.n}`);
        for (const cell of c.over02) console.log(`Validation calendar/state over .02 ${scenario} R${R} ${set}: ${JSON.stringify(cell)}`);
    }
    console.log(`Validation planted defects ${scenario}: ${JSON.stringify(plantedDefects)}`);
    for (const [R, heads] of Object.entries(metrics.rungs)) for (const set of ['legible', 'full']) {
        const head = heads[set];
        console.log(`Validation calibration ${scenario} R${R} ${set}: ECE=${head.ece}; in-large=${head.bias}`);
        for (const cell of [...head.failingDays, ...head.failingClaimStates]) console.log(`Validation failing calendar/state cell ${scenario} R${R} ${set}: ${JSON.stringify(cell)}`);
        for (const d of head.failingDeciles) console.log(`Validation decile diagnostic ${scenario} R${R} ${set}: ${JSON.stringify(d)}`);
    }
    for (const c of Object.values(challengers)) {
        bestUpper = Math.max(bestUpper, c.interval[1], c.improvement);
        for (const cell of Object.values(c.groups.R)) bestUpper = Math.max(bestUpper, cell.interval[1], cell.improvement);
    }
}
report.pooled = { ...quarterMetrics(pooledEntries, true, ['legible']),
    family: familyMetricsFromRows(pooledFamilyRows, true, ['legible']), deadlines: deadlineMetrics(pooledEntries) };
report.pooled.horizons = legibleHorizonMetrics(pooledEntries);
report.pooled.calendar = calendarHorizonMetrics(pooledEntries,['legible'],true,result.report.calibrationStage);
for (const R of [2,3,4,5]) {
    const c=report.pooled.calendar[R].legible;
    console.log(`Validation support pooled R${R} legible: bias=${c.support.bias}, n=${c.support.n}`);
    for (const cell of c.over02) console.log(`Validation calendar/state over .02 pooled R${R} legible: ${JSON.stringify(cell)}`);
}
report.pooledPurpose = 'Legible calibration gates use the 50:50 world-scenario mixture; per-scenario legible reports are diagnostics. Full heads remain gated separately. World bootstrap clusters both counterfactual scenarios under their seed when seeds coincide.';
const validationECE = Object.values(report.scenarios).flatMap(s => Object.values(s.rungs).flatMap(r => ['full'].map(set => r[set].ece)));
report.eceBound = Math.ceil(Math.max(0.005, 1.25 * Math.max(...validationECE)) * 1000) / 1000;
report.eceBoundReason = 'One common bound: 1.25 times the largest validation ECE among full rung/scenario cells, rounded up to 0.001 (floor 0.005). Includes all ten fixed-width deciles, even below 200 rows; fixed before reading test worlds. The 25% allowance covers finite-world variation without requiring conditional calibration of each decile.';
report.calibrationSpec = { inLarge: 0.01, calendar: 'every 21-day sample and role knot, quarter and live deadline; distinct worlds >= 200; max(0.03, three times sqrt(test-world SE squared + matched training-target world SE squared))', offGrid: 'legible only, offset windows with >=200 distinct worlds; full windows diagnostic', supportInLarge: 0.01,
    claimState: 'each nonempty state; max(0.02, two world-bootstrap SE)', ece: 'all deciles n-weighted, validation-selected bound',
    deciles: 'diagnostic only; worst eligible decile and all cells exceeding its old diagnostic band are reported', family: 'aggregate over all acts: each class within 0.02; per-act heads diagnostic only', legible: 'pooled training mixture', full: 'per scenario' };
const improvements = Object.values(report.scenarios).flatMap(s => Object.values(s.rungs).map(r => r.relativeImprovement));
report.suggestedPhi = Math.max(0, Math.floor(Math.min(...improvements) * 0.5 * 1000) / 1000);
report.suggestedPhiReason = 'Suggestion recalculated on every refit: half the smallest validation relative quarter-loss improvement across all four rungs and both scenarios, rounded down to 0.001. The harness separately retains the ratified value.';
report.suggestedChallengerBound = Math.ceil(Math.max(0.001, bestUpper * 1.25) * 10000) / 10000;
report.suggestedChallengerBoundReason = 'Suggestion recalculated on every refit: 1.25 times the largest world-bootstrap validation upper endpoint among claim-age splines and nearest neighbours, all rungs and both scenarios, rounded up to 0.0001 nats/event (floor 0.001). The harness separately retains the ratified value.';
report.challengerSpec = CHALLENGER_SPEC;
report.constantsBytes = Buffer.byteLength(readFileSync(artifact));
report.constantsSHA256 = createHash('sha256').update(readFileSync(artifact)).digest('hex');
write();
writeFileSync(new URL('./reader-fit-detail.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
const compact = compactFitReport(report);
writeFileSync(new URL('./reader-fit-report.json', import.meta.url), JSON.stringify(compact) + '\n');
console.log(`Compact fit report: ${Buffer.byteLength(JSON.stringify(compact))+1} bytes; full detail: tools/reader-fit-detail.json`);
console.log(`Validation report: tools/reader-fit-report.json; ECE bound=${report.eceBound}; suggested phi=${report.suggestedPhi}; suggested challenger bound=${report.suggestedChallengerBound}; runtime constants=${report.constantsBytes} bytes`);
console.log(`Fit completed in ${((performance.now() - t0) / 1000).toFixed(2)} s. Data retained at ${dir} for byte-reproduction.`);

/** 02a: the tracked report is the harness contract; full diagnostics stay
 * beside it in the ignored detail file. Shared targets and sparse covariance
 * retain exact world-noise calculations without repeating head-level cells. */
function compactFitReport(detail) {
    const stage = detail.calibrationStage, segments = ['early','middle','tail'], sets = ['prior','legible','full'];
    const reasons = [...new Set(stage.fallbacks.map(f=>f.reason))].sort();
    const compactStage = { tolerance:stage.tolerance, knots:stage.knots, targets:{}, routes:{}, roleLimits:[],
        fallbackFields:['rung','set','state','day','segment','reason','source','sigma'],
        sets, segments, reasons, pooledState:2, fallbacks:[] };
    const indices = {}, cells = new Map(), fallbackMap = new Map();
    for (const [head, rows] of Object.entries(stage.cells)) for (const c of rows) cells.set(`${head}/${c.day}/${c.name}`,c);
    for (const f of stage.fallbacks) fallbackMap.set(`${f.rung}/${f.set}/${f.state}/${f.day}/${f.segment}`,f);
    const sourceId = (R, source) => {
        if (!Array.isArray(source)) throw new Error(`Unmatched calibration source ${R}/${source}`);
        const id = indices[R].get(source.join('/'));
        if (id == null) throw new Error(`Missing calibration target ${R}/${source}`);
        return id;
    };
    for (const R of [2,3,4,5]) {
        const covariance = stage.targetCovariance[R];
        indices[R] = new Map(covariance.keys.map((key,j)=>[key,j]));
        const stats = covariance.keys.map(key=> {
            const [state,day,name] = key.split('/'), set=state==='pooled'?'prior':'legible';
            const cell = cells.get(`${R}/${set}/${state}/${day}/${name}`);
            if (!cell) throw new Error(`Missing target counts ${R}/${key}`);
            const p=cell.n ? cell.events/cell.n : 0;
            return [cell.n,cell.events,cell.n>1 ? Math.sqrt(p*(1-p)/(cell.n-1)) : 0];
        });
        compactStage.targets[R] = { keys:covariance.keys, stats, pairs:{} };
        for (const set of sets) for (const state of set==='prior'?['pooled']:[0,1]) {
            compactStage.routes[`${R}/${set}/${state}`] = stage.knots[R].flatMap(day=>segments.map(name=> {
                const key=`${R}/${set}/${state}/${day}/${name}`, cell=cells.get(key);
                const source=cell?.solved ? [state,day,name] : (cell?.fallback ?? fallbackMap.get(key))?.source;
                return sourceId(R,source);
            }));
        }
        // Every integer test day is supported. Window source unions include
        // both claim states, so arbitrary held-out scenario/claim weights work.
        const groups = new Map();
        for (const set of ['legible','full']) for (const horizon of ['quarter','deadline']) for (let day=0;day<1008;day++) {
            if (horizon==='deadline' && day>=({2:420,3:756,4:880,5:1000})[R]) continue;
            const knots=stage.knots[R]; let j=knots.findIndex(k=>k>day); if(j<0)j=knots.length;
            const window=knots[Math.max(0,j-1)], key=`${set}/${horizon}/${day%21===0?'day'+day:'window'+window}`;
            if(!groups.has(key)) groups.set(key,new Set());
            for(const state of [0,1]) for(const s of trainingTargetSources(stage,R,set,day,state,horizon)) groups.get(key).add(indices[R].get(s.key));
        }
        for(const group of groups.values()) for(const i of group) for(const j of group) if(i<=j)
            compactStage.targets[R].pairs[`${i},${j}`] = covariance.matrix[i][j];
    }
    compactStage.roleLimits = stage.roleLimits.map(limit=>({...limit,
        left:limit.left ? {...limit.left,source:sourceId(limit.rung,limit.left.source)} : null,
        right:limit.right ? {...limit.right,source:sourceId(limit.rung,limit.right.source)} : null }));
    compactStage.fallbacks = stage.fallbacks.map(f=>[f.rung,sets.indexOf(f.set),f.state==='pooled'?2:f.state,f.day,
        segments.indexOf(f.segment),reasons.indexOf(f.reason),sourceId(f.rung,f.source),f.sigma]);
    const solved=Object.values(stage.cells).flat().filter(c=>c.solved);
    return { schema:detail.schema, constantsSHA256:detail.constantsSHA256, constantsBytes:detail.constantsBytes,
        provenance:detail.provenance, fitExecution:detail.fitExecution,
        optimizer:{count:detail.optimizer.length,maxIterations:Math.max(...detail.optimizer.map(x=>x.iterations)),allConverged:detail.optimizer.every(x=>x.converged)},
        calibration:{count:detail.calibrationFits.length,maxIterations:Math.max(...detail.calibrationFits.map(x=>x.iterations)),
            maxMomentError:Math.max(...detail.calibrationFits.map(x=>x.maxMomentError)),allConverged:detail.calibrationFits.every(x=>x.converged),
            guards:{solved:solved.length,allValid:solved.every(c=>c.n>=200&&c.segmentEvents>=5&&c.survivors>=5)},
            fallbacks:{count:stage.fallbacks.length,allFinite:stage.fallbacks.every(f=>Number.isFinite(f.sigma))}},
        eceBound:detail.eceBound,suggestedPhi:detail.suggestedPhi,suggestedChallengerBound:detail.suggestedChallengerBound,
        summary:{priorInformation:detail.priorInformation,rawHeads:18,validationFullMaxECE:Math.max(...Object.values(detail.scenarios).flatMap(s=>Object.values(s.rungs).map(r=>r.full.ece))),
            validationMinLearningImprovement:Math.min(...Object.values(detail.scenarios).flatMap(s=>Object.values(s.rungs).map(r=>r.relativeImprovement)))},
        calibrationStage:compactStage };
}
