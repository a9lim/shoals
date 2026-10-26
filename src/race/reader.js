/* ===================================================
   Pure fitted reader. 02a "The reader": raw-rule legible laws,
   piecewise-exponential full/prior laws, and per-act family heads.
   Every rung law ends in one segmented calibration stage with 21-day
   and role-change knots, scale-space interpolation, and a pooled prior.
   No live singleton, RNG, cache or access to the race.
   =================================================== */
import { READER_CONSTANTS } from './reader-constants.js';
import { RECORD_SCHEMA, readerBasisNames, expandReaderFeatures, recordFeatures, recordCertified, readerCalibrationDays, RULE_HAZARD_FLOOR } from './public-record.js';
export const HAZARD_BINS = Object.freeze([0, 21, 63, 126, 252, 504, Infinity]);
export const READER_DEADLINES = Object.freeze({ 2: 420, 3: 756, 4: 880, 5: 1000 });
const softplus = x => Math.max(x, 0) + Math.log1p(Math.exp(-Math.abs(x)));
const SEGMENTS = Object.freeze(['early', 'middle', 'tail']);
export function assertReaderSchema(constants = READER_CONSTANTS) {
    if (constants.schema !== RECORD_SCHEMA) throw new Error('Reader schema mismatch; refit required');
    for (const R of [2, 3, 4, 5, 'family']) for (const set of R === 'family' ? ['legible', 'full'] : ['legible', 'full', 'prior']) {
        const head = constants.models[R]?.[set];
        if (JSON.stringify(head?.features) !== JSON.stringify(readerBasisNames(R, set, constants.bases[R]))) throw new Error(`Reader feature mismatch ${R}/${set}`);
        if (R !== 'family') {
            const c = head.calibration;
            if (JSON.stringify(c?.knots) !== JSON.stringify(readerCalibrationDays(R)) || c.states?.length !== (set === 'prior' ? 1 : 2)
                || c.states.some(m => !Array.isArray(m.limits) || m.limits.some(l => !SEGMENTS.includes(l.segment) || !c.knots.includes(l.day) || ['left','right'].some(side => l[side] && !Number.isFinite(l[side].sigma))) || SEGMENTS.some(k => m.sigma?.[k]?.length !== c.knots.length || m.sigma[k].some(v => !Number.isFinite(v))))) throw new Error(`Invalid calibration stage ${R}/${set}`);
            if (set === 'legible') continue;
        }
        const models = R === 'family' ? head.acts : set === 'prior' ? [head] : head.states;
        if (!models || models.length !== (R === 'family' ? 3 : set === 'prior' ? 1 : 2)
            || models.some(m => m.mean.length !== head.features.length || m.scale.length !== head.features.length || m.weights.length !== 6
                || m.weights.some(w => w.length !== head.features.length + 1) || (set === 'full' && m.calibration))) throw new Error(`Invalid reader sub-model ${R}/${set}`);
    }
}
/** 02a nested segments: keep geometric identities as boundaries cross.
 * Early ends at min(quarter, live deadline), middle at their maximum.
 * After the deadline only middle (through quarter) and tail remain.
 * Zero-width segments disappear without changing the remaining scales. */
export function calibrationHorizons(R, day) {
    const support = R === 5 ? 1260 : 1008, deadline = READER_DEADLINES[R], quarter = Math.min(day + 63, support);
    const out = [];
    if (deadline > day) {
        const early = Math.min(quarter,deadline), middle = Math.max(quarter,deadline);
        if (early > day) out.push({ name:'early', end:early });
        if (middle > early) out.push({ name:'middle', end:middle });
        if (support > middle) out.push({ name:'tail', end:support });
    } else {
        if (quarter > day) out.push({ name:'middle', end:quarter });
        if (support > quarter) out.push({ name:'tail', end:support });
    }
    return out;
}

function stageBoundaries(head, R, day, state) {
    const c = head.calibration, m = c.states[state];
    if (!m) throw new Error(`Invalid calibration claim state ${R}`);
    const knots = c.knots;
    let j = 0; while (j + 1 < knots.length && day >= knots[j + 1]) j++;
    const k = Math.min(j + 1, knots.length - 1), u = k === j ? 0 : Math.max(0, (day - knots[j]) / (knots[k] - knots[j]));
    // 02a: zero-width role segments have independent endpoint limits.
    const sigma = (index, side, name) => m.limits.find(l => l.day === knots[index] && l.segment === name)?.[side]?.sigma ?? m.sigma[name][index];
    return Object.freeze(calibrationHorizons(R,day).map(h => {
        const left = day === knots[j] ? m.sigma[h.name][j] : sigma(j,'right',h.name);
        const right = k === j ? left : sigma(k,'left',h.name);
        return Object.freeze({ ...h, scale: (1-u)*Math.exp(left) + u*Math.exp(right) });
    }));
}
function linear(weights, x) { let v = weights[0]; for (let j = 0; j < x.length; j++) v += weights[j + 1] * x[j]; return v; }
export function evaluateReaderFeatures(R, set, features, day, constants = READER_CONSTANTS, familyAct = null) {
    const head = constants.models[R]?.[set];
    if (!head || constants.schema !== RECORD_SCHEMA) throw new Error(`Invalid reader model ${R}/${set}`);
    const support = R === 5 ? 1260 : 1008;
    if (R !== 'family' && set === 'legible') {
        if (!(features[1] > 0)) throw new Error(`Invalid rule state ${R}`);
        return Object.freeze({ kind: 'rule', day, support, deadline: READER_DEADLINES[R], m: features[0], w: features[1], crossed: !!features[2], certDay: features[3],
            boundaries: stageBoundaries(head,R,day,features[4]) });
    }
    if (R === 'family' && ![0, 1, 2].includes(familyAct)) throw new Error('Family evaluation requires the public released-frontier act');
    const m = R === 'family' ? head.acts[familyAct] : set === 'prior' ? head : head.states[features[4]];
    const expanded = expandReaderFeatures(features, R, set, constants.bases[R]);
    if (!m || expanded.length !== m.mean.length) throw new Error(`Reader basis mismatch ${R}/${set}`);
    const x = Float64Array.from(expanded, (v, j) => (v - m.mean[j]) / m.scale[j]);
    if (R === 'family') { const z = m.weights.map(w => linear(w, x)), hi = Math.max(...z), p = z.map(v => Math.exp(v - hi)), total = p.reduce((a, b) => a + b, 0); return Float64Array.from(p, v => v / total); }
    return Object.freeze({ day, support, deadline: READER_DEADLINES[R], hazards: Float64Array.from(m.weights, w => Math.exp(Math.max(-30, Math.min(8, linear(w, x))))),
        boundaries: stageBoundaries(head,R,day,set === 'prior' ? 0 : features[4]) });
}
export function readerLaw(rec, R, set, rule) {
    if (R < 5 && (set === 'legible' ? rule[R].crossed : recordCertified(rec, R))) return null;
    return evaluateReaderFeatures(R, set, recordFeatures(rec, set, rule, R), rec.day);
}
function cumulativeHazard(law, t, D) {
    if (!law || D <= t) return 0;
    if (t !== law.day) throw new Error('Reader law must be evaluated at its record day');
    const end = Math.max(t, Math.min(Math.floor(D), law.support));
    if (law.kind === 'rule') return end <= t ? 0 : law.crossed ? (end >= law.certDay ? Infinity : 0) : Math.max(RULE_HAZARD_FLOOR, softplus((end - law.m) / law.w) - softplus((t - law.m) / law.w));
    let H = 0; const s = end - t;
    for (let k = 0; k < 6; k++) H += law.hazards[k] * Math.max(0, Math.min(s, HAZARD_BINS[k + 1]) - HAZARD_BINS[k]);
    return H;
}
/** 02a: one calibration stage on disjoint raw-hazard increments. */
export function lawCDF(law, t, D) {
    if (!law || D <= t) return 0;
    const end = Math.max(t, Math.min(Math.floor(D), law.support));
    let H = 0, previous = 0;
    for (const boundary of law.boundaries) {
        const raw = cumulativeHazard(law,t,Math.min(end,boundary.end));
        if (raw === Infinity) return 1;
        H += boundary.scale * Math.max(0,raw-previous);
        if (end <= boundary.end) break;
        previous = raw;
    }
    return -Math.expm1(-H);
}
export const lawRawCDF = (law, t, D) => -Math.expm1(-cumulativeHazard(law, t, D));
export const lawQuarter = (law, t) => lawCDF(law, t, t + 63);
export const lawAtom = law => 1 - lawCDF(law, law.day, law.support);
export const lawMass = (law, D) => lawCDF(law, law.day, D) - lawCDF(law, law.day, D - 1);
export function readerFamily(rec, set, rule) {
    const rung = rec.snapshot.view.releasedFrontierRung, act = rung <= 2 ? 0 : rung === 3 ? 1 : 2;
    return evaluateReaderFeatures('family', set, recordFeatures(rec, set, rule, 'family'), rec.day, READER_CONSTANTS, act);
}
