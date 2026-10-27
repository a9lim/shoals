/* 02a "The reader": shared fit-validation/test metrics. Explicit head
   lists only; challenger feature selection sees its training half only. */
import { evaluateReaderFeatures, lawQuarter, lawCDF, lawRawCDF } from '../src/race/reader.js';
import { expandReaderFeatures } from '../src/race/public-record.js';
import { sampleFeatures, SAMPLE_LAYOUT } from './reader-data.mjs';
import { createRng, deriveSeed } from '../src/race/rng.js';

export const CHALLENGER_SPEC = Object.freeze({
    split: 'world bit 1, cross-fit both directions independently within each scenario/rung',
    fitRows: 2048, selectedFeatures: 12, plantedWorlds: 1000,
    splines: 'linear hinge at 21,63,126,252 days of every full-head claimAge feature, plus the screened coordinates',
    nearestNeighbours: '128 deterministic evenly spaced anchors, 16 neighbours, 8 train-selected full-head coordinates',
    planted: 'World-prefix power checks: full replaced by legible; odds doubled; logit plus 1.5*(halcyon.claimAge2-0.3). Each challenger must improve held-out log loss by more than the ratified challenger bound.',
    penalty: 0.002, correction: 'two ridge-regularized logistic Newton steps on the full-reader residual, with its logit as offset; kNN normalized residual logit correction shrunk by 0.5',
});
export const loss = (p, y) => { p = Math.max(1e-12, Math.min(1 - 1e-12, p)); return -(y * Math.log(p) + (1 - y) * Math.log1p(-p)); };
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const clip = x => Math.max(1e-8, Math.min(1 - 1e-8, x));
const thin = (a, n) => a.length <= n ? a : Array.from({ length: n }, (_, i) => a[Math.floor(i * a.length / n)]);

/** Cluster bootstrap: the unit resampled is a WORLD, never a snapshot. */
export function bootstrapWorldStats(rows, value, seed = 40, repeats = 200) {
    const groups = new Map();
    for (const e of rows) {
        const g = groups.get(e.world) || [0, 0]; g[0] += value(e); g[1]++; groups.set(e.world, g);
    }
    const a = [...groups.values()], rng = createRng(deriveSeed(seed, 'reader-world-bootstrap'));
    if (!a.length) return { interval: [null, null], se: 0, worlds: 0 };
    const estimates = [];
    for (let b = 0; b < repeats; b++) {
        let s = 0, n = 0;
        for (let i = 0; i < a.length; i++) { const g = a[rng.int(a.length)]; s += g[0]; n += g[1]; }
        estimates.push(s / n);
    }
    const average = mean(estimates), se = Math.sqrt(estimates.reduce((s, v) => s + (v - average) ** 2, 0) / (repeats - 1));
    estimates.sort((a, b) => a - b);
    return { interval: [estimates[Math.floor(repeats * 0.025)], estimates[Math.floor(repeats * 0.975)]], se, worlds: a.length };
}
export const bootstrapWorld = (...args) => bootstrapWorldStats(...args).interval;
export const READER_DEADLINES = Object.freeze({ 2: 420, 3: 756, 4: 880, 5: 1000 });

/** 02a calibration: ECE includes all ten fixed-width deciles, including
 * small cells. Resample worlds and recompute the absolute bin sums. */
function bootstrapWorldECE(rows, set, seed, repeats = 200) {
    const groups = new Map();
    for (const e of rows) {
        if (!groups.has(e.world)) groups.set(e.world, new Float64Array(11));
        const g = groups.get(e.world); g[Math.min(9, Math.floor(e[set] * 10))] += e[set] - e.y; g[10]++;
    }
    const a = [...groups.values()], rng = createRng(deriveSeed(seed, 'reader-ece-world-bootstrap')), estimates = [];
    if (!a.length) return null;
    for (let b = 0; b < repeats; b++) {
        const sums = new Float64Array(11);
        for (let i = 0; i < a.length; i++) { const g = a[rng.int(a.length)]; for (let j = 0; j < 11; j++) sums[j] += g[j]; }
        estimates.push(sums.slice(0, 10).reduce((s, x) => s + Math.abs(x), 0) / sums[10]);
    }
    estimates.sort((a, b) => a - b);
    return [estimates[Math.floor(repeats * 0.025)], estimates[Math.floor(repeats * 0.975)]];
}

export function quarterEntries(samples, constants, sets = ['prior', 'legible', 'full']) {
    const entries = [];
    for (const s of samples) {
        const grid = s.grid ?? s.day % 21 === 0, offset = s.offset ?? false;
        if (!grid && !offset && !s.calibration) continue;
        for (const R of [2, 3, 4, 5]) {
            if (!constants.models[R]?.[sets[0]]) continue;
            if (s.targets[R - 2] <= s.day) continue;
            const x = sets.includes('full') && s.day % 63 === 0 ? expandReaderFeatures(sampleFeatures(s, R, 'full'), R, 'full', constants.bases[R]) : null, ps = {};
            const deadline = s.day < READER_DEADLINES[R] ? READER_DEADLINES[R] : null, rawDeadline = {}, calibratedDeadline = {}, support = {};
            let legibleSupport = null;
            for (const set of sets) {
                const law = evaluateReaderFeatures(R, set, sampleFeatures(s, R, set), s.day, constants);
                ps[set] = lawQuarter(law, s.day);
                support[set] = lawCDF(law, s.day, R === 5 ? 1260 : 1008);
                if (set === 'legible') legibleSupport = support[set];
                if (deadline != null) { rawDeadline[set] = lawRawCDF(law, s.day, deadline); calibratedDeadline[set] = lawCDF(law, s.day, deadline); }
            }
            entries.push({ world: s.world, day: s.day, grid, offset, calibration: !!s.calibration, R, act: s.act, claim: s.legs[R - 2][4], regime: s.regime,
                y: +(s.targets[R - 2] <= s.day + 63), x, featureNames: constants.models[R].full?.features, ...ps,
                legibleSupport, support, supportY: +(s.targets[R - 2] <= (R === 5 ? 1260 : 1008)),
                deadline, rawDeadline, calibratedDeadline, deadlineY: +(s.targets[R - 2] <= READER_DEADLINES[R]) });
        }
    }
    return entries;
}

/** 02a contract-deadline diagnostic; never a gate or a test-time fit trigger.
 * Open rungs, live contracts, lock days only. Errors are clustered by world. */
export function deadlineMetrics(entries, intervals = true, sets = ['prior', 'legible', 'full']) {
    const result = {};
    for (const R of [2, 3, 4, 5]) {
        const rows = entries.filter(e => e.day % 63 === 0 && e.R === R && e.deadline != null);
        result[R] = {};
        for (const set of sets) {
            const describe = (sub, withIntervals = intervals) => {
                const raw = mean(sub.map(e => e.rawDeadline[set])), calibrated = mean(sub.map(e => e.calibratedDeadline[set])), observed = mean(sub.map(e => e.deadlineY));
                return { n: sub.length, worlds: new Set(sub.map(e => e.world)).size, rawPredicted: raw, calibratedPredicted: calibrated, observed,
                    rawBias: raw-observed, calibratedBias: calibrated-observed, meanProbabilityShift: calibrated-raw,
                    rawLogLoss: mean(sub.map(e => loss(e.rawDeadline[set], e.deadlineY))),
                    calibratedLogLoss: mean(sub.map(e => loss(e.calibratedDeadline[set], e.deadlineY))),
                    rawInterval: withIntervals ? bootstrapWorld(sub, e => e.rawDeadline[set]-e.deadlineY, R+9100) : null,
                    calibratedInterval: withIntervals ? bootstrapWorld(sub, e => e.calibratedDeadline[set]-e.deadlineY, R+9200) : null };
            };
            result[R][set] = { deadline: READER_DEADLINES[R], ...describe(rows),
                claimStates: [0, 1].map(claimed => ({ claimed, ...describe(rows.filter(e => e.claim === claimed), false) })) };
        }
    }
    return result;
}

/** 02a legible-horizon diagnostic. Deadline aggregates include only live
 * contracts. Support includes every open-rung lock row; no new gates. */
export function legibleHorizonMetrics(entries, intervals = true) {
    const result = {};
    for (const R of [2,3,4,5]) {
        const rows = entries.filter(e => e.R === R && (e.grid ?? e.day % 21 === 0)), keys = ['quarter','deadline','support'];
        const describe = (source, key, seed) => {
            const sub = key === 'deadline' ? source.filter(e => e.deadline != null) : source;
            if (!sub.length) return { n: 0, worlds: 0, predicted: null, observed: null, bias: null, interval: null, se: 0 };
            const p = e => key === 'quarter' ? e.legible : key === 'deadline' ? e.calibratedDeadline.legible : e.legibleSupport;
            const y = e => key === 'quarter' ? e.y : key === 'deadline' ? e.deadlineY : e.supportY;
            const predicted = mean(sub.map(p)), observed = mean(sub.map(y));
            return { n: sub.length, predicted, observed, bias: predicted-observed,
                ...(intervals ? bootstrapWorldStats(sub,e => p(e)-y(e),seed) : { worlds: new Set(sub.map(e => e.world)).size, interval: null, se: 0 }) };
        };
        result[R] = { deadlineDay: READER_DEADLINES[R], supportDay: R === 5 ? 1260 : 1008,
            ...Object.fromEntries(keys.map((key,k) => [key,describe(rows,key,25000+R*100+k)])),
            days: [...new Set(rows.map(e => e.day))].sort((a,b) => a-b).map(day => ({ day,
                ...Object.fromEntries(keys.map((key,k) => [key,describe(rows.filter(e => e.day === day),key,30000+R*2000+day*3+k)])) })) };
    }
    return result;
}

/** 02a calendar noise carries the finite training cells used by the stage.
 * One training snapshot per world/day makes each cell's Bernoulli cluster SE
 * sqrt(p(1-p)/(n-1)). Held scales follow their recorded matched source. */
const trainingLookup = new WeakMap();
function trainingCells(calibrationStage) {
    let lookup = trainingLookup.get(calibrationStage);
    if (!lookup) {
        const cells = new Map(), fallbacks = new Map(), covariance = new Map(), limits = new Map();
        const compact = !!calibrationStage.targets;
        if (compact) {
            for (const [R, data] of Object.entries(calibrationStage.targets)) covariance.set(+R, { ...data, index:new Map(data.keys.map((key,j)=>[key,j])) });
            for (const [key, route] of Object.entries(calibrationStage.routes)) {
                const R=key.split('/')[0],knots=calibrationStage.knots[R],days=new Map();
                for (let i=0;i<knots.length;i++) days.set(knots[i],['early','middle','tail'].map((name,j)=>({day:knots[i],name,sourceId:route[i*3+j]})));
                cells.set(key,days);
            }
        } else {
            for (const [key, rows] of Object.entries(calibrationStage.cells)) {
                const days = new Map();
                for (const c of rows) { if (!days.has(c.day)) days.set(c.day, []); days.get(c.day).push(c); }
                cells.set(key, days);
            }
            for (const f of calibrationStage.fallbacks ?? []) fallbacks.set(`${f.rung}/${f.set}/${f.state}/${f.day}/${f.segment}`, f);
            for (const [R, data] of Object.entries(calibrationStage.targetCovariance ?? {})) covariance.set(+R, { ...data, index: new Map(data.keys.map((key,j)=>[key,j])) });
        }
        for (const limit of calibrationStage.roleLimits ?? []) limits.set(`${limit.rung}/${limit.set}/${limit.state}/${limit.day}/${limit.segment}`, limit);
        lookup = { cells, fallbacks, covariance, limits, compact }; trainingLookup.set(calibrationStage, lookup);
    }
    return lookup;
}
function trainingSegmentStats(calibrationStage, R, set, day, claimed, segment, side = null) {
    const lookup = trainingCells(calibrationStage);
    const group = set === 'prior' && lookup.cells.has(`${R}/${set}/pooled`) ? 'pooled' : claimed;
    const cells = (state, at) => lookup.cells.get(`${R}/${set}/${state}`)?.get(at) ?? [];
    if (lookup.compact) {
        const cell=cells(group,day).find(c=>c.name===segment);
        const limit=side ? lookup.limits.get(`${R}/${set}/${group}/${day}/${segment}`)?.[side] : null;
        const id=limit?.source ?? cell?.sourceId,targets=lookup.covariance.get(R);
        if (!Number.isInteger(id) || !targets?.keys[id]) throw new Error(`Missing compact training source ${R}/${set}/${group}/${day}/${segment}/${side}`);
        const key=targets.keys[id],[state,at,name]=key.split('/'),[n,events,se]=targets.stats[id];
        return {key,state:state==='pooled'?'pooled':+state,day:+at,segment:name,n,worlds:n,events,rate:events/n,se};
    }
    let cell = cells(group,day).find(c => c.name===segment), source = [group,day,segment];
    const limit = side ? lookup.limits.get(`${R}/${set}/${group}/${day}/${segment}`)?.[side] : null;
    if (limit || !cell?.solved) {
        source = limit?.source ?? (cell?.fallback ?? lookup.fallbacks.get(`${R}/${set}/${group}/${day}/${segment}`))?.source;
        if (!Array.isArray(source)) throw new Error(`Calendar training SE requires matched source ${R}/${set}/${group}/${day}/${segment}`);
        const [state,at,name] = source;
        cell = cells(state,at).find(c=>c.name===name);
        if (!cell && state==='pooled') {
            const parts=[0,1].map(st=>cells(st,at).find(c=>c.name===name));
            if (parts.some(c=>!c)) throw new Error('Missing pooled calibration source');
            cell={n:parts.reduce((n,c)=>n+c.n,0),events:parts.reduce((n,c)=>n+c.events,0)};
        }
    }
    if (!cell || cell.n<2) throw new Error('Calendar training target requires at least two independent worlds');
    const rate=cell.events/cell.n;
    return { key:source.join('/'), state:source[0],day:source[1],segment:source[2],n:cell.n,worlds:cell.n,events:cell.events,rate,se:Math.sqrt(rate*(1-rate)/(cell.n-1)) };
}
function targetSegment(R,day,horizon) {
    const deadline=READER_DEADLINES[R], quarter=Math.min(day+63,R===5?1260:1008);
    if (horizon==='deadline') return deadline<=quarter ? 'early' : 'middle';
    return day>=deadline || quarter>deadline ? 'middle' : 'early';
}
export function trainingTargetStats(calibrationStage, R, set, day, claimed, horizon) {
    return trainingSegmentStats(calibrationStage,R,set,day,claimed,targetSegment(R,day,horizon));
}

/** Endpoint source identities follow the interpolated segment, including
 * its recorded hold where that segment is inactive at a role-change knot. */
export function trainingTargetSources(calibrationStage, R, set, day, claimed, horizon) {
    const lookup = trainingCells(calibrationStage), group = set === 'prior' && lookup.cells.has(`${R}/${set}/pooled`) ? 'pooled' : claimed;
    const knots = [...lookup.cells.get(`${R}/${set}/${group}`).keys()].sort((a,b)=>a-b), segment=targetSegment(R,day,horizon);
    let hi = knots.findIndex(k=>k>=day);
    if (hi < 0) hi = knots.length-1;
    const at = (j,weight,side=null)=>({weight,...trainingSegmentStats(calibrationStage,R,set,knots[j],claimed,segment,side)});
    if (knots[hi] === day || hi === 0 || day>=knots.at(-1)) return [at(hi,1)];
    const lo=hi-1, f=(day-knots[lo])/(knots[hi]-knots[lo]);
    return [at(lo,1-f,'right'),at(hi,f,'left')];
}

export function trainingVariance(calibrationStage,R,sources) {
    const covariance=trainingCells(calibrationStage).covariance.get(R);
    if (!covariance) throw new Error('Calendar training SE needs its world-cluster target covariance');
    let variance=0;
    for (const a of sources) for (const b of sources) {
        const i=covariance.index.get(a.key), j=covariance.index.get(b.key);
        if (i==null || j==null) throw new Error(`Missing target covariance ${R}/${a.key}/${b.key}`);
        const value=covariance.matrix ? covariance.matrix[i][j] : covariance.pairs?.[`${Math.min(i,j)},${Math.max(i,j)}`];
        if (!Number.isFinite(value)) throw new Error(`Missing packed target covariance ${R}/${i}/${j}`);
        variance+=a.weight*b.weight*value;
    }
    return Math.max(0,variance);
}

/** 02a "The reader": all sampled days, all priced horizons. This is a
 * separate population from lock-day scoring/ECE; world bootstraps preserve
 * the dependence of all days and paired neutral/engine trajectories. */
export function calendarHorizonMetrics(entries, sets = ['legible', 'full'], intervals = true, trainingCalibration = null) {
    if (!trainingCalibration?.cells && !trainingCalibration?.routes) throw new Error('Calendar calibration requires its matched training targets');
    const result = {};
    for (const R of [2, 3, 4, 5]) {
        result[R] = {};
        const rung = entries.filter(e => e.R === R && ((e.grid ?? e.day % 21 === 0) || (e.calibration && [READER_DEADLINES[R]-63,READER_DEADLINES[R]].includes(e.day))));
        const offsetRung = entries.filter(e => e.R === R && e.offset && !(e.grid ?? e.day % 21 === 0));
        for (const [si, set] of sets.entries()) {
            const report = { over02: [] };
            for (const [hi, horizon] of ['quarter', 'deadline', 'support'].entries()) {
                const rows = horizon === 'deadline' ? rung.filter(e => e.deadline != null) : rung;
                const p = e => horizon === 'quarter' ? e[set] : horizon === 'deadline' ? e.calibratedDeadline[set] : e.support?.[set] ?? (set === 'legible' ? e.legibleSupport : NaN);
                const y = e => horizon === 'quarter' ? e.y : horizon === 'deadline' ? e.deadlineY : e.supportY;
                const describe = (sub, floor, multiplier, minimum, seed, withIntervals = intervals) => {
                    if (!sub.length) return { n: 0, worlds: 0, predicted: null, observed: null, bias: null,
                        interval: null, se: 0, band: floor, eligible: false, passed: true };
                    const predicted = mean(sub.map(p)), observed = mean(sub.map(y)), bias = predicted-observed;
                    const stats = withIntervals ? bootstrapWorldStats(sub, e => p(e)-y(e), seed)
                        : { interval: null, se: 0, worlds: new Set(sub.map(e => e.world)).size };
                    const band = Math.max(floor, multiplier*stats.se), eligible = stats.worlds >= minimum;
                    return { n: sub.length, predicted, observed, bias, ...stats, band, eligible,
                        passed: !eligible || Math.abs(bias) <= band, ratio: Math.abs(bias)/band };
                };
                const withTrainingNoise = (cell,sub) => {
                    if (horizon==='support' || !sub.length) return cell;
                    const groups=new Map(), sources=new Map();
                    for (const e of sub) { const key=`${e.day}/${e.claim}`; if (!groups.has(key)) groups.set(key,{day:e.day,claim:e.claim,n:0}); groups.get(key).n++; }
                    for (const {day,claim,n} of groups.values()) for (const source of trainingTargetSources(trainingCalibration,R,set,day,claim,horizon)) {
                        const weight=n/sub.length*source.weight;
                        if (!sources.has(source.key)) sources.set(source.key,{...source,weight:0});
                        sources.get(source.key).weight+=weight;
                    }
                    const trainingSources=[...sources.values()];
                    const trainSe=Math.sqrt(trainingVariance(trainingCalibration,R,trainingSources));
                    const combinedSe=Math.hypot(cell.se,trainSe),band=Math.max(.03,3*combinedSe);
                    return {...cell,trainSe,combinedSe,trainingSources,band,passed:!cell.eligible||Math.abs(cell.bias)<=band,ratio:Math.abs(cell.bias)/band};
                };
                const seed = 60000 + R*10000 + si*3000 + hi*1000;
                const days = [...new Set(rows.map(e => e.day))].sort((a,b) => a-b).map(day => {
                    const dayRows=rows.filter(e=>e.day===day);
                    const cell = { day, ...withTrainingNoise(describe(dayRows,.03,3,200,seed+day),dayRows,day) };
                    cell.claimBreakdown = [0,1].map(claimed => {
                        const sub = rows.filter(e => e.day === day && e.claim === claimed);
                        const state = { day, claimed, ...withTrainingNoise(describe(sub,.03,3,200,seed+day+claimed+100000),sub) };
                        if (state.bias != null && Math.abs(state.bias) > .02) report.over02.push({ horizon, kind: 'dayClaimState', ...state });
                        return state;
                    });
                    if (cell.bias != null && Math.abs(cell.bias) > .02) report.over02.push({ horizon, kind: 'day', ...cell });
                    return cell;
                });
                const offsetRows = horizon === 'deadline' ? offsetRung.filter(e=>e.deadline!=null) : offsetRung;
                const knotGroup = trainingCells(trainingCalibration).cells.get(`${R}/${set}/${set==='prior'?'pooled':0}`);
                const knots=[...knotGroup.keys()].sort((a,b)=>a-b), windows=new Map();
                for (const e of offsetRows) {
                    let j=knots.findIndex(k=>k>e.day); if (j<0) j=knots.length;
                    const start=knots[Math.max(0,j-1)],end=knots[j]??1008,key=`${start}/${end}`;
                    if (!windows.has(key)) windows.set(key,{start,end,rows:[]}); windows.get(key).rows.push(e);
                }
                const offGrid = horizon==='support' ? [] : [...windows.values()].map(({start,end,rows:sub})=> {
                    const cell={start,end,...withTrainingNoise(describe(sub,.03,3,200,seed+start+400000),sub)};
                    cell.claimBreakdown=[0,1].map(claimed=> {
                        const stateRows=sub.filter(e=>e.claim===claimed);
                        return {start,end,claimed,...withTrainingNoise(describe(stateRows,.03,3,200,seed+start+claimed+500000),stateRows)};
                    });
                    if(cell.bias!=null&&Math.abs(cell.bias)>.02) report.over02.push({horizon,kind:'offGridWindow',...cell});
                    return cell;
                }).sort((a,b)=>a.start-b.start);
                const aggregateRows = rows.filter(e=>e.grid ?? e.day%21===0);
                const claimStates = [0,1].map(claimed => {
                    const cell = { claimed, ...describe(aggregateRows.filter(e => e.claim === claimed), .02, 2, 1, seed+claimed+200000) };
                    if (cell.bias != null && Math.abs(cell.bias) > .02) report.over02.push({ horizon, kind: 'claimState', ...cell });
                    return cell;
                });
                report[horizon] = { ...describe(aggregateRows, .01, 0, 1, seed+300000), days, claimStates, offGrid,
                    dayClaimStates: days.flatMap(day => day.claimBreakdown) };
            }
            result[R][set] = report;
        }
    }
    return result;
}

export function quarterMetrics(entries, intervals = true, sets = ['prior', 'legible', 'full'], rungList = [2, 3, 4, 5]) {
    // The scoring, learning-floor and ECE population remains the lock days.
    entries = entries.filter(e => e.day % 63 === 0);
    const rungs = {};
    for (const R of rungList) {
        const rows = entries.filter(e => e.R === R), metrics = {};
        for (const set of sets) {
            const deciles = Array.from({ length: 10 }, (_, bin) => {
                const sub = rows.filter(e => Math.min(9, Math.floor(e[set] * 10)) === bin);
                const stats = intervals && sub.length ? bootstrapWorldStats(sub, e => e[set] - e.y, 10 + R * 10 + bin)
                    : { interval: null, se: 0, worlds: new Set(sub.map(e => e.world)).size };
                const predicted = mean(sub.map(e => e[set])), observed = mean(sub.map(e => e.y)), bias = predicted - observed;
                const band = Math.max(0.03, 2 * stats.se);
                const states = [];
                if (set !== 'prior' && sub.length && Math.abs(bias) > band) {
                    const groups = new Map();
                    for (const e of sub) {
                        const key = `${e.day}/${e.claim}`;
                        if (!groups.has(key)) groups.set(key, []);
                        groups.get(key).push(e);
                    }
                    for (const a of groups.values()) states.push({ day: a[0].day, claimed: a[0].claim,
                        claimRung: R === 5 ? 4 : R, n: a.length, worlds: new Set(a.map(e => e.world)).size,
                        predicted: mean(a.map(e => e[set])), observed: mean(a.map(e => e.y)) });
                    states.sort((a, b) => b.n - a.n || a.day - b.day || a.claimed - b.claimed);
                }
                return { bin, n: sub.length, predicted, observed, bias, ...stats, band, ratio: Math.abs(bias) / band,
                    eligible: sub.length >= 200, passed: sub.length < 200 || Math.abs(bias) <= band, states };
            });
            const groupMetrics = (key, values, minimum, floor, k, seed) => values.map(value => {
                const sub = rows.filter(e => e[key] === value), eligible = new Set(sub.map(e=>e.world)).size >= minimum;
                const stats = intervals && sub.length ? bootstrapWorldStats(sub, e => e[set] - e.y, seed + value)
                    : { interval: null, se: 0, worlds: new Set(sub.map(e => e.world)).size };
                const predicted = mean(sub.map(e => e[set])), observed = mean(sub.map(e => e.y)), bias = predicted - observed;
                const band = Math.max(floor, k * stats.se);
                return { [key === 'claim' ? 'claimed' : key]: value, n: sub.length, predicted, observed, bias, ...stats,
                    band, eligible, passed: !eligible || Math.abs(bias) <= band, ratio: Math.abs(bias) / band };
            });
            // 02a: per lock day, max(0.03, 3 SE). Some 200 day cells are checked,
            // and at 2 SE about one in twenty would fail by chance.
            const days = groupMetrics('day', [...new Set(rows.map(e => e.day))].sort((a, b) => a - b), 200, 0.03, 3, 1000 + R * 1100);
            // 02a: claim state within max(0.02, two world-bootstrap SE).
            const claimStates = groupMetrics('claim', [0, 1], 1, 0.02, 2, 6000 + R * 10);
            for (const cell of days.filter(d => !d.passed)) cell.claimBreakdown = [0, 1].map(claimed => {
                const sub = rows.filter(e => e.day === cell.day && e.claim === claimed);
                return { claimed, claimRung: R === 5 ? 4 : R, n: sub.length, worlds: new Set(sub.map(e => e.world)).size,
                    predicted: mean(sub.map(e => e[set])), observed: mean(sub.map(e => e.y)),
                    bias: mean(sub.map(e => e[set]-e.y)), ...(intervals && sub.length ? bootstrapWorldStats(sub, e => e[set]-e.y, 18000 + R * 1000 + cell.day + claimed) : {}) };
            });
            metrics[set] = { n: rows.length, logLoss: mean(rows.map(e => loss(e[set], e.y))), bias: mean(rows.map(e => e[set] - e.y)),
                interval: intervals ? bootstrapWorld(rows, e => e[set] - e.y, R) : null,
                ece: rows.length ? deciles.reduce((s, d) => s + d.n * Math.abs(d.bias), 0) / rows.length : 0,
                eceInterval: intervals ? bootstrapWorldECE(rows, set, 8000 + R) : null,
                days, claimStates, failingDays: days.filter(d => !d.passed), failingClaimStates: claimStates.filter(c => !c.passed),
                maxDecileBias: Math.max(0, ...deciles.filter(d => d.eligible).map(d => Math.abs(d.bias))),
                worstDecile: deciles.filter(d => d.eligible).sort((a, b) => b.ratio - a.ratio)[0] || null,
                worstDecileAll: deciles.filter(d => d.n).sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias))[0] || null,
                failingDeciles: deciles.filter(d => d.eligible && !d.passed), deciles };
        }
        metrics.relativeImprovement = sets.includes('full') ? 1 - metrics.full.logLoss / metrics.prior.logLoss : null;
        rungs[R] = metrics;
    }
    const edgeByAct = !sets.includes('full') ? [] : [0, 1, 2].map(act => {
        const sub = entries.filter(e => e.act === act && e.R < 5);
        const worlds = new Set(entries.map(e => e.world)).size;
        return { act, n: sub.length, perEvent: mean(sub.map(e => loss(e.legible, e.y) - loss(e.full, e.y))),
            opportunity: sub.reduce((n, e) => n + loss(e.legible, e.y) - loss(e.full, e.y), 0) / worlds };
    });
    return { rungs, edgeByAct };
}

function solveRidge(rows, transform) {
    const xs = rows.map(transform), d = xs[0].length;
    const w = new Float64Array(d), logit = p => Math.log(clip(p) / (1 - clip(p)));
    for (let iteration = 0; iteration < 2; iteration++) {
        const A = Array.from({ length: d }, () => new Float64Array(d)), b = new Float64Array(d);
        for (let n = 0; n < rows.length; n++) {
            const x = xs[n]; let z = logit(rows[n].full);
            for (let j = 0; j < d; j++) z += w[j] * x[j];
            const p = 1 / (1 + Math.exp(-z)), v = p * (1 - p), y = rows[n].y - p;
            for (let i = 0; i < d; i++) { b[i] += x[i] * y; for (let j = 0; j <= i; j++) A[i][j] += v * x[i] * x[j]; }
        }
        for (let i = 0; i < d; i++) {
            A[i][i] += rows.length * CHALLENGER_SPEC.penalty; b[i] -= rows.length * CHALLENGER_SPEC.penalty * w[i];
            for (let j = 0; j < i; j++) A[j][i] = A[i][j];
        }
        // Cholesky; ridge guarantees a positive definite system.
        for (let i = 0; i < d; i++) for (let j = 0; j <= i; j++) {
            let v = A[i][j]; for (let k = 0; k < j; k++) v -= A[i][k] * A[j][k];
            A[i][j] = i === j ? Math.sqrt(Math.max(1e-15, v)) : v / A[j][j];
        }
        for (let i = 0; i < d; i++) { for (let j = 0; j < i; j++) b[i] -= A[i][j] * b[j]; b[i] /= A[i][i]; }
        for (let i = d - 1; i >= 0; i--) { for (let j = i + 1; j < d; j++) b[i] -= A[j][i] * b[j]; b[i] /= A[i][i]; }
        for (let j = 0; j < d; j++) w[j] += b[j];
    }
    return e => { const x = transform(e); let z = logit(e.full); for (let j = 0; j < d; j++) z += w[j] * x[j]; return clip(1 / (1 + Math.exp(-z))); };
}

function challengerModels(train, R) {
    const names = train[0].featureNames, d = names.length, mu = new Float64Array(d), sd = new Float64Array(d), cov = new Float64Array(d);
    for (const e of train) for (let j = 0; j < d; j++) mu[j] += e.x[j] / train.length;
    for (const e of train) for (let j = 0; j < d; j++) { sd[j] += (e.x[j] - mu[j]) ** 2 / train.length; cov[j] += (e.x[j] - mu[j]) * (e.y - e.full); }
    for (let j = 0; j < d; j++) sd[j] = Math.max(1e-6, Math.sqrt(sd[j]));
    const ids = Array.from({ length: d }, (_, j) => j).sort((a, b) => Math.abs(cov[b] / sd[b]) - Math.abs(cov[a] / sd[a]) || a - b).slice(0, 12);
    const standardized = (e, j) => Math.max(-4, Math.min(4, (e.x[j] - mu[j]) / sd[j]));
    const ageIds = names.map((n, j) => n.includes('.claimAge') && !n.includes('.hinge') ? j : -1).filter(j => j >= 0);
    const spline = e => [1, ...ids.map(j => standardized(e, j)), ...ageIds.flatMap(j => [21, 63, 126, 252].map(k => Math.max(0, e.x[j] - k / 252)))];
    const anchors = thin(train, 128).map(e => ({ z: ids.slice(0, 8).map(j => standardized(e, j)), residual: e.y - e.full, variance: e.full * (1 - e.full) }));
    const nearest = e => {
        const z = ids.slice(0, 8).map(j => standardized(e, j));
        const distances = anchors.map((a, i) => { let dist = 0; for (let j = 0; j < z.length; j++) dist += (z[j] - a.z[j]) ** 2; return { dist, i }; });
        distances.sort((a, b) => a.dist - b.dist || a.i - b.i);
        const near = distances.slice(0, 16).map(d => anchors[d.i]);
        const correction = 0.5 * mean(near.map(a => a.residual)) / (0.05 + mean(near.map(a => a.variance)));
        return clip(1 / (1 + Math.exp(-Math.log(clip(e.full) / (1 - clip(e.full))) - correction)));
    };
    return { claimAgeSplines: solveRidge(train, spline), nearestNeighbours: nearest };
}

export function challengerMetrics(entries, intervals = true) {
    entries = entries.filter(e => e.day % 63 === 0);
    const rows = { claimAgeSplines: [], nearestNeighbours: [] };
    for (const R of [2, 3, 4, 5]) for (const held of [0, 1]) {
        const sub = entries.filter(e => e.R === R), side = e => (e.world >>> 1) & 1;
        const train = thin(sub.filter(e => side(e) !== held), CHALLENGER_SPEC.fitRows), test = sub.filter(e => side(e) === held);
        if (!train.length || !test.length) continue;
        const predictors = challengerModels(train, R);
        for (const e of test) for (const [name, predict] of Object.entries(predictors)) {
            const p = predict(e);
            rows[name].push({ world: e.world, act: e.act, R: e.R, claim: e.claim, regime: e.regime,
                residual: e.y - p, baselineResidual: e.y - e.full, gain: loss(e.full, e.y) - loss(p, e.y) });
        }
    }
    return Object.fromEntries(Object.entries(rows).map(([name, sub]) => {
        const groups = {};
        for (const key of ['act', 'R', 'claim', 'regime']) {
            groups[key] = Object.fromEntries([...new Set(sub.map(e => e[key]))].sort().map(v => {
                const a = sub.filter(e => e[key] === v);
                return [v, { n: a.length, bias: mean(a.map(e => e.residual)), baselineBias: mean(a.map(e => e.baselineResidual)), improvement: mean(a.map(e => e.gain)),
                    interval: intervals && key === 'R' ? bootstrapWorld(a, e => e.gain, Number(v) + 400) : null }];
            }));
        }
        return [name, { improvement: mean(sub.map(e => e.gain)), interval: intervals ? bootstrapWorld(sub, e => e.gain, 120) : null, groups }];
    }));
}

/** 02a challenger calibration: fixed, public-coordinate defects. The
 * challenger is fit on one world half and measured on the other in both
 * directions. Prefix worlds bound this diagnostic's cost without selecting
 * by labels, probabilities or observed success. */
export function plantedDefectMetrics(entries, intervals = false, bound = 0.001) {
    const locks = entries.filter(e => e.day % 63 === 0);
    const worlds = [...new Set(locks.map(e => e.world))].sort((a,b) => a-b).slice(0, CHALLENGER_SPEC.plantedWorlds);
    const ids = new Set(worlds), source = locks.filter(e => ids.has(e.world));
    const logit = p => Math.log(clip(p)/(1-clip(p))), sigmoid = z => clip(1/(1+Math.exp(-z)));
    const defects = {
        fullIsLegible: e => e.legible,
        doubledOdds: e => sigmoid(logit(e.full)+Math.log(2)),
        plantedClaimAge: e => {
            const j = e.featureNames.indexOf('halcyon.claimAge2');
            if (j < 0) throw new Error('Planted claim-age test requires its explicit full-head coordinate');
            return sigmoid(logit(e.full)+1.5*(e.x[j]-.3));
        },
    };
    return Object.fromEntries(Object.entries(defects).map(([name, defect]) => {
        const degraded = source.map(e => ({ ...e, full: defect(e) }));
        const challengers = challengerMetrics(degraded, intervals);
        return [name, { n: source.length, worlds: worlds.length,
            degradedMinusShippedLoss: mean(degraded.map((e,i) => loss(e.full,e.y)-loss(source[i].full,e.y))),
            challengers, bound, passed: Object.values(challengers).every(c => c.improvement > bound) }];
    }));
}

export function familyMetrics(samples, constants, intervals = true, collect = null) {
    const rows = samples.filter(s => (s.grid ?? s.day % 21 === 0) || (s.diagnostic ?? [350,700].includes(s.day))).map(s => ({ world: s.world, day: s.day, act: s.act, y: s.outcome,
        legible: evaluateReaderFeatures('family', 'legible', sampleFeatures(s, 'family', 'legible'), s.day, constants, s.act),
        full: evaluateReaderFeatures('family', 'full', sampleFeatures(s, 'family', 'full'), s.day, constants, s.act) }));
    if (collect) for (const row of rows) collect.push(row);
    return familyMetricsFromRows(rows, intervals);
}

/** Pooled calibration keeps the same seed as the bootstrap unit across
 * both scenario trajectories; it never treats a counterfactual as a new world. */
export function familyMetricsFromRows(rows, intervals = true, sets = ['legible', 'full']) {
    const report = {};
    for (const set of sets) report[set] = {
        perAct: [0, 1, 2].map(act => { const sub = rows.filter(e => e.act === act); return { act, n: sub.length, worlds: new Set(sub.map(e => e.world)).size, classBias: [1,2,3,4,5,6].map(family => ({ family, bias: mean(sub.map(e => e[set][family-1] - +(e.y === family))), interval: intervals ? bootstrapWorld(sub, e => e[set][family-1] - +(e.y === family), 800 + act * 10 + family) : null })) }; }),
        classBias: [0, 1, 2, 3, 4, 5].map(k => ({ family: k + 1, bias: mean(rows.map(e => e[set][k] - +(e.y === k + 1))),
            interval: intervals ? bootstrapWorld(rows, e => e[set][k] - +(e.y === k + 1), 200 + k) : null })),
        brier: Object.fromEntries([350, 700].map(day => {
            const sub = rows.filter(e => e.day === day), probs = [1, 2, 3, 4, 5, 6].map(k => mean(sub.map(e => +(e.y === k))));
            const score = p => mean(sub.map(e => Array.from(p(e), (p, k) => (p - +(e.y === k + 1)) ** 2).reduce((a, b) => a + b, 0)));
            const baseline = score(() => probs), brier = score(e => e[set]);
            return [day, { n: sub.length, brier, climatologyBrier: baseline, gain: baseline - brier, relativeGain: 1 - brier / baseline }];
        })),
    };
    return report;
}

export function decodeSample(v, L = SAMPLE_LAYOUT) {
    const mask = v[L.mask];
    if (v.length !== L.columns || !Number.isInteger(mask)) throw new Error('Reader sample layout mismatch; regenerate current-schema data');
    return { grid: !!(mask & 1), offset: !!(mask & 2), calibration: !!(mask & (1 | 4)), diagnostic: !!(mask & 8), world: v[0], scenario: v[1] ? 'engine' : 'neutral', day: v[2], act: v[3],
        regime: ['private', 'supervised', 'mobilized', 'nationalized', 'classified'][v[4]], targets: Array.from(v.slice(5, 9)), outcome: v[9],
        legs: [0, 1, 2, 3].map(i => Array.from(v.slice(L.legs + i * 5, L.legs + 5 + i * 5))), family: Array.from(v.slice(L.family, L.common)),
        common: Array.from(v.slice(L.common, L.rules)), rules: [0, 1, 2, 3].map(i => Array.from(v.slice(L.rules + i * 4, L.rules + 4 + i * 4))) };
}
