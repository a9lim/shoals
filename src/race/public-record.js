/* ===================================================
   Public record and head-specific features. 02a "The reader".
   No latent queues, evidence, continuous capability or RNG reads.
   A daily public projection is also the replay contract: persist these
   rows and the initial projection, never a serialized race object.
   =================================================== */
import { buildPublicView } from './consensus.js';

export const RECORD_SCHEMA = 15;
export const READER_CALIBRATION_DAYS = Object.freeze(Array.from({ length: 48 }, (_, j) => 21 * j));
/** 02a: explicit role-change knots keep interpolation within one geometry. */
export const readerCalibrationDays = R => [...new Set([...READER_CALIBRATION_DAYS, ({2:420,3:756,4:880,5:1000})[R]-63, ({2:420,3:756,4:880,5:1000})[R]])].sort((a,b)=>a-b);
export const RULE_HAZARD_FLOOR = 1e-8;
export const READER_CLOCK_DAYS = Object.freeze(Array.from({ length: 15 }, (_, j) => 63 * (j + 1)));
export const LABS = Object.freeze(['halcyon', 'tianxia', 'polaris']);
export const RUNGS = Object.freeze([2, 3, 4, 5]);
export const INCIDENT_KINDS = Object.freeze(['minor', 'moderate', 'grave', 'catastrophe', 'persuasion', 'classified', 'classifiedGrave']);
const copy = x => JSON.parse(JSON.stringify(x));
const top = m => Math.max(0, ...Object.keys(m).filter(r => m[r] != null).map(Number));
const age = (day, d) => d == null ? 0 : Math.min(1008, Math.max(0, day - d)) / 252;
const count = n => Math.log1p(n);

/** Read only the same public per-lab records buildPublicView reads. Open
 * rungInternal is the ecosystem's PUBLIC rung map, not a frontier lab's. */
export function publicSnapshot(race) {
    const view = buildPublicView(race);
    return {
        day: race.day, view,
        labs: Object.fromEntries(LABS.map(id => {
            const l = race.capability.labs[id];
            return [id, { active: l.active, claims: { ...l.rungReleased }, certs: { ...l.rungCertified },
                releaseCount: l.releaseCount, lastReleaseDay: Number.isFinite(l.lastReleaseDay) ? l.lastReleaseDay : null }];
        })),
        openRung: top(race.capability.open.rungInternal),
    };
}

export function createPublicRecord(race) { return createRecordFromSnapshot(publicSnapshot(race)); }
export function createRecordFromSnapshot(initial) {
    return { schema: RECORD_SCHEMA, initial: copy(initial), day: initial.day, snapshot: copy(initial),
        spawnDay: Object.fromEntries(LABS.map(id => [id, initial.labs[id].active ? initial.day : null])),
        releases: [], incidents: [], thefts: [], grayZone: [], blockades: [], blockadeEnds: [],
        regimeDay: initial.day, treatyWindows: [], treatyOutcomes: [],
        inputs: { straitTension: 0, exportControlStage: 0, treatyStage: 0 } };
}

/** Whitelist and redact the ledger BEFORE anything is accumulated. Source
 * survives classification: both numbered-brief headlines print {lab}.
 * S0/S1 share a category; persuasion has no numeric-severity token.
 * No bridge metadata that is absent from printed text enters this row. */
export function publicRecordRow(race, inputs = {}) {
    const tr = race.lastTransitions;
    const blackout = race.controlRegime === 'classified';
    return {
        snapshot: publicSnapshot(race),
        inputs: { straitTension: inputs.straitTension ?? 0, exportControlStage: inputs.exportControlStage ?? 0, treatyStage: inputs.treatyStage ?? 0 },
        spawned: [...(tr.spawned || [])],
        releases: tr.releases.map(r => ({ lab: r.labId, rungs: [...r.releasedCrossings] })),
        certifications: tr.certifications.map(r => ({ lab: r.lab, rung: r.rung })),
        incidents: tr.incidents.detected.map(d => {
            const kind = d.severity >= 4 ? 'catastrophe' : blackout ? (d.severity === 3 ? 'classifiedGrave' : 'classified')
                : d.cls === 'persuasion' ? 'persuasion' : d.severity === 3 ? 'grave' : d.severity === 2 ? 'moderate' : 'minor';
            return { source: d.source, kind, lag: blackout && d.severity < 4 ? null : d.lag };
        }),
        thefts: (tr.theftDisclosures || []).map(d => ({ lab: d.from, attribution: d.publicAttribution, lag: d.lag })),
        grayZone: (tr.strait?.grayZone || []).map(() => true),
        blockadeStart: !!tr.strait?.blockadeStart, blockadeEnd: !!tr.strait?.blockadeEnd,
        regimeChange: tr.regimeChange ? { from: tr.regimeChange.from, to: tr.regimeChange.to } : null,
        treatyWindow: !!tr.treatyWindowOpen,
        treatyOutcome: tr.treatyOutcome ? { implemented: !!tr.treatyOutcome.implemented } : null,
    };
}

export function foldPublicRecordRow(rec, row) {
    const day = row.snapshot.day;
    if (day === rec.day) return rec;
    if (day !== rec.day + 1) throw new Error(`Public record missing day ${rec.day + 1}`);
    rec.day = day; rec.snapshot = copy(row.snapshot); rec.inputs = { ...row.inputs };
    for (const id of row.spawned) if (rec.spawnDay[id] == null) rec.spawnDay[id] = day;
    for (const r of row.releases) rec.releases.push({ day, ...copy(r) });
    for (const d of row.incidents) rec.incidents.push({ day, ...d });
    for (const d of row.thefts) rec.thefts.push({ day, ...d });
    for (const _ of row.grayZone) rec.grayZone.push(day);
    if (row.blockadeStart) rec.blockades.push(day);
    if (row.blockadeEnd) rec.blockadeEnds.push(day);
    if (row.regimeChange) rec.regimeDay = day;
    if (row.treatyWindow) rec.treatyWindows.push(day);
    if (row.treatyOutcome) rec.treatyOutcomes.push({ day, ...row.treatyOutcome });
    return rec;
}
export function stepPublicRecord(rec, race, inputs = {}) {
    if (race.day === rec.day) return rec;
    return foldPublicRecordRow(rec, publicRecordRow(race, inputs));
}

/** Stable logistic survival ratio, identical mathematically to binaryProb.
 * The old valuation's unconditional R5 F(1000) is explicit, family-only. */
export function ruleSummary(rungs, day) {
    const softplus = x => Math.max(x, 0) + Math.log1p(Math.exp(-Math.abs(x)));
    const out = {};
    for (const R of RUNGS) {
        const r = rungs[R];
        const prob = D => r.crossed ? +(D >= r.certDay) : D <= day ? 0
            : -Math.expm1(softplus((day - r.m) / r.w) - softplus((D - r.m) / r.w));
        out[R] = { m: r.m, w: r.w, crossed: !!r.crossed, certDay: r.certDay, quarter: prob(day + 63), year: prob(day + 252), term: prob(1008) };
    }
    out.r5Unconditional1000 = 1 / (1 + Math.exp((rungs[5].m - 1000) / rungs[5].w));
    return out;
}

const COMMON_NAMES = [
    'openRung', 'releasedRung', 'certifiedRung',
    ...LABS.flatMap(id => [`${id}.active`, `${id}.spawnAge`, `${id}.claimedRung`,
        ...[1, 2, 3, 4, 5].flatMap(R => [`${id}.claim${R}`, `${id}.claimAge${R}`]),
        ...[2, 3, 4].flatMap(R => [`${id}.cert${R}`, `${id}.certAge${R}`]),
        `${id}.releases`, `${id}.releaseAge`, `${id}.releases126`]),
    ...INCIDENT_KINDS.flatMap(k => [`incident.${k}.total`, `incident.${k}.recent126`, `incident.${k}.lag`]),
    ...LABS.map(id => `incident.${id}`),
    'thefts', 'theftAge', 'thefts126', 'grayZones', 'grayZones126', 'grayZoneAge',
    'blockade', 'blockadeAge', 'blockadeEndAge',
    ...['private', 'supervised', 'mobilized', 'nationalized', 'classified'].map(r => `regime.${r}`),
    'regimeAge', 'treatyWindows', 'treatyWindowAge', 'treatyOutcome', 'treatyOutcomeAge',
    'straitTension', 'exportControlStage', 'treatyStage',
];
const legibleNames = R => R === 'family'
    ? ['rule5.logH.quarter', 'rule5.logH.year', 'rule5.logH.term', 'rule5.logH.unconditional1000', ...LABS.map(id => `${id}.claimedRung`), 'clock']
    : [`rule${R}.logH.quarter`, `rule${R}.logH.year`, `rule${R}.logH.term`, 'clock', `claimed${Math.min(R, 4)}`];
export const FEATURE_NAMES = Object.freeze(Object.fromEntries([...RUNGS, 'family'].map(R => [R, Object.freeze({
    legible: Object.freeze(R === 'family' ? legibleNames(R) : [`rule${R}.m`, `rule${R}.w`, `rule${R}.crossed`, `rule${R}.certDay`, `claimed${Math.min(R, 4)}`, 'clock']), full: Object.freeze([...legibleNames(R), ...COMMON_NAMES]),
    prior: Object.freeze(['clock', 'rung']),
})])));

function fullValues(rec) {
    const { day, snapshot: s } = rec;
    const recent = arr => arr.filter(x => day - (typeof x === 'number' ? x : x.day) < 126).length;
    const a = [s.openRung, s.view.releasedFrontierRung, s.view.certifiedFrontierRung];
    for (const id of LABS) {
        const l = s.labs[id];
        a.push(+l.active, age(day, rec.spawnDay[id]), top(l.claims));
        for (const R of [1, 2, 3, 4, 5]) a.push(+(l.claims[R] != null), age(day, l.claims[R]));
        for (const R of [2, 3, 4]) a.push(+(l.certs[R] != null), age(day, l.certs[R]));
        a.push(count(l.releaseCount), age(day, l.lastReleaseDay), count(recent(rec.releases.filter(r => r.lab === id))));
    }
    for (const kind of INCIDENT_KINDS) {
        const rows = rec.incidents.filter(d => d.kind === kind), lags = rows.filter(d => d.lag != null);
        a.push(count(rows.length), count(recent(rows)), lags.length ? count(lags.reduce((n, d) => n + d.lag, 0) / lags.length) : 0);
    }
    for (const id of LABS) a.push(count(rec.incidents.filter(d => d.source === id).length));
    a.push(count(rec.thefts.length), age(day, rec.thefts.at(-1)?.day), count(recent(rec.thefts)),
        count(rec.grayZone.length), count(recent(rec.grayZone)), age(day, rec.grayZone.at(-1)),
        +(rec.blockades.length > rec.blockadeEnds.length), age(day, rec.blockades.at(-1)), age(day, rec.blockadeEnds.at(-1)));
    for (const r of ['private', 'supervised', 'mobilized', 'nationalized', 'classified']) a.push(+(s.view.controlRegime === r));
    a.push(age(day, rec.regimeDay), rec.treatyWindows.length, age(day, rec.treatyWindows.at(-1)),
        rec.treatyOutcomes.length ? (rec.treatyOutcomes.at(-1).implemented ? 1 : -1) : 0,
        age(day, rec.treatyOutcomes.at(-1)?.day), rec.inputs.straitTension, rec.inputs.exportControlStage, rec.inputs.treatyStage);
    return a;
}

/** R is a required rung or 'family'; rule is a caller-owned ruleSummary.
 * No dependency on belief's singleton. */
export function recordFeatures(rec, set, rule, R) {
    if (!FEATURE_NAMES[R]?.[set]) throw new Error(`Unknown reader head ${R}/${set}`);
    if (rec.schema !== RECORD_SCHEMA) throw new Error('Public record schema mismatch');
    if (set === 'prior') return Float64Array.of(rec.day / 1008, R === 'family' ? 0 : R);
    const r = rule[R === 'family' ? 5 : R];
    if (set === 'legible' && R !== 'family') return Float64Array.of(r.m, r.w, +r.crossed, r.certDay ?? -1, +(rec.snapshot.view.releasedFrontierRung >= Math.min(R, 4)), rec.day / 1008);
    const legible = R === 'family'
        ? [r.quarter, r.year, r.term, rule.r5Unconditional1000].map(ruleLogHazard).concat(LABS.map(id => rec.snapshot.view.claimedRung[id]), rec.day / 1008)
        : [ruleLogHazard(r.quarter), ruleLogHazard(r.year), ruleLogHazard(r.term), rec.day / 1008, +(rec.snapshot.view.releasedFrontierRung >= Math.min(R, 4))];
    return Float64Array.from(set === 'legible' ? legible : [...legible, ...fullValues(rec)]);
}

/** 02a reader basis: legible rungs carry the rule state for rescaling;
 * full/prior keep their fitted log-hazard/quantile basis and lock-day clocks.
 * R5 routes on R4 claim state. Family bases nest literally; rung information
 * comes from the same rule, but their model bases are no longer nested.
 * Probability clamp is numerical only, fixed before train/test. The fit writes
 * training-quantile knots; evaluation never estimates a knot from live data. */
export function ruleLogHazard(p) {
    return Math.log(-Math.log1p(-Math.max(1e-8, Math.min(1 - 1e-8, p))));
}
export function readerBasisNames(R, set, basis) {
    if (R !== 'family' && set === 'legible') return [...FEATURE_NAMES[R].legible];
    if (set === 'prior') return [...FEATURE_NAMES[R].prior.slice(0, 2),
        ...basis.legible.find(([j]) => j === 3)[1].map((_, k) => `clock.hinge${k + 1}`),
        ...READER_CLOCK_DAYS.map(day => `clock.lock${day}`)];
    const base = R === 'family' ? FEATURE_NAMES[R].legible : FEATURE_NAMES[R].full.slice(0, 5);
    const leg = [...base];
    for (const [j, knots] of basis.legible) knots.forEach((_, k) => leg.push(`${base[j]}.hinge${k + 1}`));
    for (const day of READER_CLOCK_DAYS) leg.push(`clock.lock${day}`);
    if (set === 'legible') return leg;
    const names = [...leg, ...FEATURE_NAMES[R].full.slice(base.length)];
    for (const [j, knots] of basis.ages) knots.forEach((_, k) => names.push(`${FEATURE_NAMES[R].full[j]}.hinge${k + 1}`));
    return names;
}
export function expandReaderFeatures(raw, R, set, basis) {
    if (R !== 'family' && set === 'legible') return Float64Array.from(raw);
    if (set === 'prior') return Float64Array.from([...raw.slice(0, 2),
        ...basis.legible.find(([j]) => j === 3)[1].map(knot => Math.max(0, raw[0] - knot)),
        ...basis.clock.map(knot => Math.max(0, raw[0] - knot))]);
    const n = R === 'family' ? 8 : 5, leg = Array.from(raw.slice(0, n));
    for (const [j, knots] of basis.legible) for (const knot of knots) leg.push(Math.max(0, raw[j] - knot));
    const clock = raw[R === 'family' ? 7 : 3];
    for (const knot of basis.clock) leg.push(Math.max(0, clock - knot));
    if (set === 'legible') return Float64Array.from(leg);
    const values = [...leg, ...raw.slice(n)];
    for (const [j, knots] of basis.ages) for (const knot of knots) values.push(Math.max(0, raw[j] - knot));
    return Float64Array.from(values);
}

export function recordCertified(rec, R) {
    return R < 5 && LABS.some(id => rec.snapshot.labs[id].certs[R] != null);
}
