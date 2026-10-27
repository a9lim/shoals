#!/usr/bin/env node
/* ===================================================
   tools/reader-test.mjs -- 02a "The reader".
   A. The fit report against the constants; schema, the
      evaluator's arithmetic (states, stage, segments, the
      rule, the family's acts); public-row reconstruction,
      hidden corruption, same-day replay, information
      isolation, masses
   B. Each head calibrated in the large (rungs R2-R5 per
      scenario, the family head pooled over both, legible and
      full); the full head's quarterly log loss no worse than
      the legible's
   H. B's edge over the full reader: positive in Act I,
      closed by Act III (|opportunity| <= 0.02 nats per run)
   J. The reader-copier's edge over B is positive
   Run: node tools/reader-test.mjs [N=200] [--seed S]
   N worlds PER scenario (neutral, engine). Any gate fails
   the process.
   =================================================== */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { READER_CONSTANTS as constants } from '../src/race/reader-constants.js';
import { assertReaderSchema, readerLaw, readerFamily, lawQuarter, lawCDF, lawRawCDF, lawMass, lawAtom, evaluateReaderFeatures } from '../src/race/reader.js';
import { RECORD_SCHEMA, READER_CLOCK_DAYS, readerCalibrationDays, RULE_HAZARD_FLOOR, expandReaderFeatures, createRecordFromSnapshot, foldPublicRecordRow, publicRecordRow, recordFeatures, createPublicRecord, stepPublicRecord, ruleSummary } from '../src/race/public-record.js';
import { createRaceState } from '../src/race/race-state.js';
import { belief, initBelief } from '../src/race/belief.js';
import * as BB from '../src/race/belief.js';
import { checkResolution } from '../src/race/resolution.js';
import { WORLD_SCENARIOS, runReaderWorld, worldInputs, stepWorld } from './reader-data.mjs';
import { ensureEngineWorlds } from './engine-worlds.mjs';
import { quarterEntries, quarterMetrics, familyMetrics, familyMetricsFromRows, loss } from './reader-metrics.mjs';
const fitReport = JSON.parse(readFileSync(new URL('./reader-fit-report.json', import.meta.url), 'utf8'));

const args = process.argv.slice(2);
let N = 200, base = 1;
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seed') base = Number(args[++i]);
    else if (args[i] === '--n' || args[i] === '-n') N = Number(args[++i]);
    else if (/^\d+$/.test(args[i])) N = Number(args[i]);
    else throw new Error(`Unknown argument ${args[i]}`);
}
if (!Number.isInteger(N) || N < 1 || !Number.isInteger(base) || base < 0) throw new Error('N and seed must be nonnegative integers; N must be positive');
const t0 = performance.now();
// Each scenario on its own seeds (the two share their races on a seed); the
// engine scenario's worlds are bystander runs' tapes (tools/engine-worlds.mjs).
const seedOf = (scenario, i) => base + (scenario === 'engine' ? N : 0) + i;
await ensureEngineWorlds([...Array.from({ length: N }, (_, i) => seedOf('engine', i)), base + 93]);
let failures = 0;
const checks = [];
function check(name, ok, detail) { checks.push({ name, ok, detail }); if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`); }
const close = (a, b) => Math.abs(a - b) <= 1e-12;
const sig = x => JSON.stringify(x);
try { assertReaderSchema(); check('A schema/features', true, `schema ${RECORD_SCHEMA}`); } catch (e) { check('A schema/features', false, e.message); }
check('A fit report matches constants', fitReport.schema === RECORD_SCHEMA && fitReport.constantsSHA256 === createHash('sha256').update(readFileSync(new URL('../src/race/reader-constants.js', import.meta.url))).digest('hex'), 'schema + SHA256');
check('A optimizer convergence', fitReport.optimizer.count > 0 && fitReport.optimizer.allConverged,
    `${fitReport.optimizer.count} candidates/bins; longest ${fitReport.optimizer.maxIterations} iterations; all converged=${fitReport.optimizer.allConverged}`);
check('A calibration convergence', fitReport.calibration.count > 0 && fitReport.calibration.allConverged && fitReport.calibration.maxMomentError <= fitReport.calibrationStage.tolerance,
    `${fitReport.calibration.count} training-only scalar segment solves; max moment error ${fitReport.calibration.maxMomentError}, tolerance ${fitReport.calibrationStage.tolerance}`);
check('A grid and role-change calibration knots', [2,3,4,5].every(R => ['legible','full','prior'].every(set =>
    sig(constants.models[R][set].calibration.knots) === sig(readerCalibrationDays(R)))), '0,21,...,987 plus each rung deadline-minus-63 and deadline; no interpolation spans a role change');
{
    const { guards, fallbacks } = fitReport.calibration;
    check('A calibration incremental guards', guards.solved > 0 && guards.allValid,
        `${guards.solved} directly solved scales: at least 200 worlds, five segment events and five survivors each`);
    check('A guarded knots borrow finite scales', fallbacks.count >= 0 && fallbacks.allFinite,
        `${fallbacks.count} fallback mappings; all scales finite`);
}
check('A full/prior/family lock-day basis knots', [2, 3, 4, 5, 'family'].every(R => sig(constants.bases[R].clock) === sig(READER_CLOCK_DAYS.map(day => day / 1008))), '63,126,...,945 remain in each full/prior hazard and family basis');
check('A no claim-interaction columns', [2, 3, 4, 5].every(R => ['legible', 'full'].every(set =>
    constants.models[R][set].features.every(name => !name.startsWith('claimed*')))), 'independent state models replace the products');
{
    let routed = true;
    const rec = createPublicRecord(createRaceState(base)); initBelief(createRaceState(base));
    const rule = ruleSummary(belief.rungs, 0);
    for (const R of [2, 3, 4, 5]) for (const set of ['full']) {
        const head = constants.models[R][set], d = head.features.length;
        const states = [0, 1].map(state => ({ mean: Array(d).fill(0), scale: Array(d).fill(1),
            weights: Array.from({ length: 6 }, () => [Math.log(0.01 + 0.01 * state), 0.03, ...Array(d - 1).fill(0)]) }));
        states[1].mean[0] = 2; states[1].scale[0] = 3;
        const calibration = structuredClone(head.calibration);
        for (const part of calibration.states) for (const values of Object.values(part.sigma)) values.fill(0);
        const c = { ...constants, models: { ...constants.models, [R]: { ...constants.models[R], [set]: { ...head, states, calibration } } } };
        for (const state of [0, 1]) {
            const raw = recordFeatures(rec, set, rule, R); raw[4] = state;
            const law = evaluateReaderFeatures(R, set, raw, 0, c);
            const expectedHazard = Math.exp(Math.log(0.01 + 0.01 * state) + 0.03 * (raw[0] - states[state].mean[0]) / states[state].scale[0]);
            routed &&= close(lawQuarter(law, 0), -Math.expm1(-63 * expectedHazard));
        }
    }
    check('A state-specific weights and standardization', routed, 'both states of every full rung head route independently; R5 uses the R4 flag');
    check('A prior remains clock/rung-only through its stage', [2,3,4,5].every(R => {
        const h=constants.models[R].prior;
        return !h.states && !h.features.some(name=>name.includes('claimed')) && h.calibration.states.length===1;
    }), 'one pooled calibration state; no claim-state coordinate enters the raw hazard or stage');
    let priorIsolated = true;
    const alternate = structuredClone(rec); alternate.snapshot.view.releasedFrontierRung = 4;
    for (const R of [2,3,4,5]) {
        const a = recordFeatures(rec,'prior',rule,R), b = recordFeatures(alternate,'prior',rule,R);
        const la = evaluateReaderFeatures(R,'prior',a,0), lb = evaluateReaderFeatures(R,'prior',b,0);
        priorIsolated &&= sig(a) === sig(b) && sig(la) === sig(lb);
        for (const D of [63,252,420,756,880,1000,1260]) priorIsolated &&= Object.is(lawCDF(la,0,D),lawCDF(lb,0,D));
    }
    check('A prior claim-state isolation', priorIsolated, 'changing only the public claim state leaves prior features, law and every horizon bit-identical');
}
{
    // 02a: a single stage scales raw hazard increments on sorted nested segments.
    const raw = { day:0, support:1260, deadline:420, hazards:Float64Array.of(.01,.01,.01,.01,.01,.01),
        boundaries:[{end:63,scale:2},{end:420,scale:.5},{end:1260,scale:3}] };
    const expectedH = D => .01*(2*Math.min(D,63)+.5*Math.max(0,Math.min(D,420)-63)+3*Math.max(0,Math.min(D,1260)-420));
    let consistent=true;
    for(const D of [0,1,21,63,64,252,420,421,1000,1260,2000]) consistent &&= close(lawCDF(raw,0,D),-Math.expm1(-expectedH(D)));
    const underflow = { ...raw, kind:'rule', m:1e6, w:1, crossed:false, certDay:-1 };
    consistent &&= close(lawCDF(underflow,0,1),-Math.expm1(-2*RULE_HAZARD_FLOOR)) && close(lawCDF(underflow,0,1260),lawCDF(underflow,0,1));
    check('A segmented calibration at every horizon', consistent && close(lawAtom(raw),Math.exp(-expectedH(1260))),
        'analytic increments, continuity at quarter/deadline boundaries, support cap and calibrated atom');
}

{
    let ok=true;
    for(const R of [2,3,4,5]) for(const state of [0,1]) for(const day of [0,21,252,273,283,399,735,861,966,987,1007, ...[-64,-63,-62,-1,0,1].map(delta=>({2:420,3:756,4:880,5:1000}[R])+delta)]) {
        const raw=Float64Array.of(450,90,0,-1,state,day/1008),law=evaluateReaderFeatures(R,'legible',raw,day);
        const stage=constants.models[R].legible.calibration, model=stage.states[state];
        let j=0;while(j+1<stage.knots.length && day>=stage.knots[j+1])j++;
        const k=Math.min(j+1,stage.knots.length-1),u=j===k?0:(day-stage.knots[j])/(stage.knots[k]-stage.knots[j]);
        const ends=law.boundaries.map(v=>v.end);
        ok &&= law.kind==='rule' && !('alpha' in law) && !('beta' in law) && !('gamma' in law)
            && ends.at(-1)===law.support && ends.every((v,i)=>v>day && (!i || v>ends[i-1]));
        const quarter=Math.min(day+63,law.support), expectedSegments=[];
        if(day<law.deadline) {
            expectedSegments.push({name:'early',end:Math.min(quarter,law.deadline)});
            if(quarter!==law.deadline) expectedSegments.push({name:'middle',end:Math.max(quarter,law.deadline)});
        } else expectedSegments.push({name:'middle',end:quarter});
        if(expectedSegments.at(-1).end<law.support) expectedSegments.push({name:'tail',end:law.support});
        ok &&= sig(law.boundaries.map(({name,end})=>({name,end})))===sig(expectedSegments);
        for(const boundary of law.boundaries) {
            const values=model.sigma[boundary.name];
            let lo=values[j],hi=values[k];
            if (day!==stage.knots[j]) {
                lo=model.limits.find(v=>v.day===stage.knots[j]&&v.segment===boundary.name)?.right?.sigma ?? lo;
                hi=model.limits.find(v=>v.day===stage.knots[k]&&v.segment===boundary.name)?.left?.sigma ?? hi;
            }
            const scale=j===k?Math.exp(lo):(1-u)*Math.exp(lo)+u*Math.exp(hi);
            ok &&= close(boundary.scale,scale);
        }
        for(const D of [day,day+1,day+63,420,756,880,1000,1260,2000]) {
            let H=0,previous=day;
            for(const boundary of law.boundaries) {
                const end=Math.min(D,boundary.end);
                if(end>previous) H+=boundary.scale*(-Math.log1p(-lawRawCDF(law,day,end))+Math.log1p(-lawRawCDF(law,day,previous)));
                previous=boundary.end;if(D<=previous)break;
            }
            ok &&= close(lawCDF(law,day,D),-Math.expm1(-H));
        }
    }
    check('A rule is the raw heuristic through the common stage',ok,
        'both states; scale-space interpolation on grid plus role-change knots; stable early/middle/tail identities across crossover and deadline; duplicate horizons; no power/two-form branch');
}

{
    // Distinct synthetic one-sided values make cross-role borrowing observable.
    let ok=true, cases=0;
    for (const R of [2,3,4,5]) for (const state of [0,1]) for (const knot of [({2:420,3:756,4:880,5:1000}[R])-63,({2:420,3:756,4:880,5:1000}[R])]) {
        const head=constants.models[R].legible, calibration=structuredClone(head.calibration), part=calibration.states[state];
        for (const values of Object.values(part.sigma)) values.fill(Math.log(2));
        part.limits=['early','middle','tail'].map(segment=>({day:knot,segment,left:{sigma:Math.log(3),source:[state,knot-1,segment]},right:{sigma:Math.log(5),source:[state,knot+1,segment]}}));
        const c={...constants,models:{...constants.models,[R]:{...constants.models[R],legible:{...head,calibration}}}};
        for (const day of [knot-1,knot,knot+1]) {
            const law=evaluateReaderFeatures(R,'legible',Float64Array.of(450,90,0,-1,state,day/1008),day,c);
            let j=0;while(j+1<calibration.knots.length&&day>=calibration.knots[j+1])j++;
            const k=Math.min(j+1,calibration.knots.length-1),u=j===k?0:(day-calibration.knots[j])/(calibration.knots[k]-calibration.knots[j]);
            const expected=day===knot?2:day<knot?(1-u)*2+u*3:j===k?5:(1-u)*5+u*2;
            for(const boundary of law.boundaries){ok&&=close(boundary.scale,expected);cases++;}
        }
    }
    check('A one-sided scales isolate every role change',ok,
        `${cases} active segment cases; distinct pre/post limits, days on both sides and the exact knot; scale-space interpolation`);
}

{
    let ok = true;
    const race = createRaceState(base), rec = createPublicRecord(race); initBelief({ seed: race.seed, day: 0 });
    const rule = ruleSummary(belief.rungs, 0);
    for (const set of ['legible', 'full']) {
        const head = constants.models.family[set], d = head.features.length;
        const acts = [0,1,2].map(act => ({ mean: Array(d).fill(0), scale: Array(d).fill(1),
            weights: [0,1,2,3,4,5].map(k => [k === act ? Math.log(2+act) : 0, ...Array(d).fill(0)]) }));
        const c = { ...constants, models: { ...constants.models, family: { ...constants.models.family, [set]: { ...head, acts } } } };
        for (const act of [0,1,2]) {
            const p = evaluateReaderFeatures('family',set,recordFeatures(rec,set,rule,'family'),0,c,act);
            ok &&= close(p[act],(2+act)/(7+act));
        }
    }
    check('A family uses explicit public act', ok, 'same lab claims can route to every act; open-ecosystem frontier is included by the caller');
}

/** The belief-test A corruption list, plus the rest of the hidden state.
 * Do not change discrete released/certified/public-open rung maps. */
function corruptLatent(race) {
    const r = { ...race, hidden: { ...race.hidden, tau: 0.999, scalingElasticity: 0.999, takeoffSharpness: 3, sharpnessNorm: 99,
        chinaTrue: { ...race.hidden.chinaTrue, position: 99, dealPossible: !race.hidden.chinaTrue.dealPossible } },
        evidenceLogOdds: 99, heat: { transient: 0.99, floor: 0.99 }, safety: { halcyon: 0.01, tianxia: 0.01, polaris: 0.01 },
        playerCumC: 99, playerS: { halcyon: 99, tianxia: 99, polaris: 99 },
        capability: { ...race.capability, q: 99, pendingCerts: [{ dueDay: 0, rung: 5 }], polarisSpawnDay: -999,
            labs: Object.fromEntries(Object.entries(race.capability.labs).map(([id, lab]) => [id,
                { ...lab, C_internal: 5.5, C_released: 5.5, rungInternal: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, compute0: 99, computeGrowth: 99, talent: 99, securityLevel: 99 }])),
            open: { ...race.capability.open, C: 5.5 } },
        latentIncidents: [...race.latentIncidents, { id: 'FAKE', severity: 4, occurDay: race.day, insiderTip: true, detected: false, detectable: false, meanLag: 0 }],
        latentEvidence: [...race.latentEvidence, { id: 'FAKE', published: false, path: 'leaked', logLR: 5, publicDay: Infinity }],
        lastTransitions: { ...race.lastTransitions,
            releases: (race.lastTransitions.releases || []).map(v => ({ ...v, C_released: 999, C_internal: 998, C: 997, internalCrossings: [5], tau: .999 })),
            theftDisclosures: (race.lastTransitions.theftDisclosures || []).map(v => ({ ...v, to: v.to === 'halcyon' ? 'polaris' : 'halcyon', trueThief: 'POISON', secret: 9876 })),
            crossings: [{ lab: 'halcyon', rung: 5, track: 'internal' }], thefts: [{ from: 'halcyon', to: 'tianxia' }], playerDeltaC: 99,
            evidence: { occurred: [{ id: 'FAKE' }], published: [{ id: 'FAKE', logLR: 99 }] },
            incidents: { ...race.lastTransitions.incidents, occurred: [{ id: 'FAKE', severity: 4 }],
                detected: (race.lastTransitions.incidents.detected || []).map(v => ({ ...v, insiderTip: !v.insiderTip, occurDay: -999, meanLag: 999, detectable: false, hiddenCapability: 999 })) } },
    };
    return r;
}
{
    // Exercise all carried-row surfaces even if the sampled trajectory has no theft.
    const race=createRaceState(base),tr=race.lastTransitions;
    tr.releases=[{labId:'halcyon',releasedCrossings:[2],C_released:2.1,C_internal:2.5}];
    tr.theftDisclosures=[{from:'halcyon',to:'polaris',publicAttribution:'tianxia',lag:21}];
    tr.incidents.detected=[{source:'tianxia',severity:2,cls:'accident',lag:11,occurDay:0,insiderTip:false}];
    check('A hidden fields carried on public ledger rows',sig(publicRecordRow(race))===sig(publicRecordRow(corruptLatent(race))),
        'explicit release capability, theft true thief and detected-incident insider/occurDay sentinels; a spread row fails');
}
let replayOK = true, corruptionOK = true, idempotentOK = true, immutableOK = true, informationOK = true, priorClockOK = true, r5ClaimOK = true, count = 0;
for (const scenario of WORLD_SCENARIOS.scenarios) {
    let replay = null;
    const hook = ({ race, rec, rule, inputs }) => {
        if (!replay) replay = createRecordFromSnapshot(rec.initial);
        const row = publicRecordRow(race, inputs), before = sig(row);
        foldPublicRecordRow(replay, row);
        const badRow = publicRecordRow(corruptLatent(race), inputs);
        corruptionOK &&= sig(row) === sig(badRow);
        if (rec.day % 63 === 0) for (const R of [2, 3, 4, 5, 'family']) {
            const full = expandReaderFeatures(recordFeatures(rec, 'full', rule, R), R, 'full', constants.bases[R]);
            if (R !== 'family') {
                const prior = expandReaderFeatures(recordFeatures(rec, 'prior', rule, R), R, 'prior', constants.bases[R]);
                const priorNames = constants.models[R].prior.features, legNames = constants.models[R].full.features;
                for (let j = 0; j < priorNames.length; j++) if (priorNames[j].startsWith('clock')) {
                    const k = legNames.indexOf(priorNames[j]);
                    priorClockOK &&= k >= 0 && Object.is(prior[j], full[k]);
                }
                if (R === 5) r5ClaimOK &&= recordFeatures(rec, 'legible', rule, R)[4] === +(rec.snapshot.view.releasedFrontierRung >= 4);
            }
        }
        if (rec.day % 63 === 0) for (const R of [2,3,4,5]) {
            const poison = v => v === null ? 12345 : Array.isArray(v) ? v.map(poison) : typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k,x]) => [k,poison(x)])) : typeof v === 'number' ? v+9876 : typeof v === 'boolean' ? !v : 'unrelated';
            const changed = poison(rec), changedRule = poison(rule);
            changed.schema = rec.schema; changed.day = rec.day;
            const claim = +(rec.snapshot.view.releasedFrontierRung >= Math.min(R,4));
            changed.snapshot.view.releasedFrontierRung = claim ? 5 : 0;
            for (const key of ['m','w','crossed','certDay']) changedRule[R][key] = rule[R][key];
            const beforeLaw = readerLaw(rec,R,'legible',rule), afterLaw = readerLaw(changed,R,'legible',changedRule);
            informationOK &&= sig(beforeLaw) === sig(afterLaw) && sig(recordFeatures(rec,'legible',rule,R)) === sig(recordFeatures(changed,'legible',changedRule,R));
            for (const D of [rec.day+1,rec.day+63,rec.day+252,1260]) informationOK &&= Object.is(lawCDF(beforeLaw,rec.day,D),lawCDF(afterLaw,rec.day,D));
        }
        for (const R of [2, 3, 4, 5, 'family']) for (const set of R === 'family' ? ['legible', 'full'] : ['prior', 'legible', 'full']) {
            const features = recordFeatures(rec, set, rule, R), rebuilt = recordFeatures(replay, set, rule, R);
            replayOK &&= sig(features) === sig(rebuilt);
            const a = R === 'family' ? readerFamily(rec, set, rule) : readerLaw(rec, R, set, rule);
            const b = R === 'family' ? readerFamily(replay, set, rule) : readerLaw(replay, R, set, rule);
            replayOK &&= sig(a) === sig(b);
        }
        const old = sig(rec); stepPublicRecord(rec, race, inputs); idempotentOK &&= old === sig(rec);
        immutableOK &&= before === sig(row); count++;
    };
    runReaderWorld(base + 93, scenario, hook);
}
check('A public rows reconstruct features/outputs', replayOK, `${count} daily projections; initial public snapshot + whitelisted public daily observations and input log`);
check('A hidden corruption', corruptionOK, 'belief-test A list + q, internal rung maps, timers, silent rows and hidden metadata on public release/disclosure/detection rows');
check('A same-day replay', idempotentOK, 'all visited days');
check('A immutable public input rows', immutableOK, 'fold does not mutate its rows');
check('A legible information isolation', informationOK, 'corrupt every other record field and every unused rule-summary field; hold only schema, clock, own raw rule state and claim bit fixed; law/features/CDF bit-identical');
check('A identical prior clock basis', priorClockOK, 'same quantile and lock-day clock features as each full rung head');
{
    const rec = createPublicRecord(createRaceState(base));
    rec.snapshot.view.releasedFrontierRung = 4;
    const rule = Object.fromEntries([2, 3, 4, 5].map(R => [R, { quarter: 0.1, year: 0.2, term: 0.3 }]));
    r5ClaimOK &&= recordFeatures(rec, 'legible', rule, 5)[4] === 1 && recordFeatures(rec, 'full', rule, 5)[4] === 1;
}
check('A R5 reads R4 claim', r5ClaimOK, 'R5 claim flag follows the released R4 frontier');
{
    const race = createRaceState(base), rec = createPublicRecord(race); initBelief(race);
    const rule = ruleSummary(belief.rungs, 0);
    let same = true, massOK = true;
    for (const R of [2, 3, 4, 5]) {
        // binaryProb is phase B's pooled reader now. Check the heuristic's
        // logistic law directly, without routing through that consumer.
        const r = belief.rungs[R], F = D => 1 / (1 + Math.exp((r.m - D) / r.w));
        const p = D => (F(D) - F(0)) / (1 - F(0));
        same &&= close(rule[R].quarter, p(63)) && close(rule[R].year, p(252)) && close(rule[R].term, p(1008));
        for (const set of ['legible', 'full', 'prior']) {
            const law = readerLaw(rec, R, set, rule); let sum = lawAtom(law), previous = 0;
            for (let d = 1; d <= law.support; d++) { const p = lawCDF(law, 0, d); massOK &&= p >= previous && p <= 1; previous = p; sum += lawMass(law, d); }
            massOK &&= close(sum, 1) && lawCDF(law, 0, 0) === 0 && lawCDF(law, 0, 1e6) === lawCDF(law, 0, law.support);
        }
    }
    check('A rule summary', same, 'same survival-conditioned logistic law as the raw heuristic, independent of phase-B quotes');
    check('A integer masses/support/atom', massOK, 'all heads/sets sum to 1 including the atom');
}

// ==========================================================================
// B. Each head calibrated in the large; the full head no worse than the legible
// ==========================================================================
// 2026-10-27: describes the game (a9: the map fits the territory). The rung
// heads sit within about 0.01 of their outcomes at this N (02a's 0.01 was read at
// 2000 worlds per scenario); the family head's worst family is about 0.03 off
// on neutral worlds at 1000 per scenario, plus one outcome per world of noise
// here, so its band is read pooled over both scenarios and loose.
const IN_LARGE = 0.02, FAMILY_IN_LARGE = 0.08;
const familyRows = [];
for (const scenario of WORLD_SCENARIOS.scenarios) {
    const samples = [];
    for (let i = 0; i < N; i++) {
        const w = runReaderWorld(seedOf(scenario, i), scenario);
        // A role/offset sample may also be a 350/700 diagnostic; count that day once.
        samples.push(...new Map([...w.samples, ...w.diagnostics].map(s => [s.day, s])).values());
    }
    const entries = quarterEntries(samples, constants), metrics = quarterMetrics(entries, false);
    for (const R of [2, 3, 4, 5]) for (const set of ['legible', 'full']) {
        const v = metrics.rungs[R][set];
        check(`B ${scenario} R${R} ${set} in-large`, Math.abs(v.bias) <= IN_LARGE, `${v.bias.toFixed(4)} <= ±${IN_LARGE} (n ${v.n})`);
    }
    familyMetrics(samples, constants, false, familyRows);
    const lock = entries.filter(e => e.day % 63 === 0), mean = a => a.reduce((s, x) => s + x, 0) / a.length;
    const lossL = mean(lock.map(e => loss(e.legible, e.y))), lossF = mean(lock.map(e => loss(e.full, e.y)));
    check(`B ${scenario} full no worse than legible`, lossF <= lossL, `quarterly log loss full ${lossF.toFixed(5)} <= legible ${lossL.toFixed(5)} (${lock.length} rung-quarters)`);
}
{
    const family = familyMetricsFromRows(familyRows, false);
    for (const set of ['legible', 'full']) {
        const worst = Math.max(...family[set].classBias.map(c => Math.abs(c.bias)));
        check(`B pooled family ${set} in-large`, worst <= FAMILY_IN_LARGE, `worst family bias ${worst.toFixed(4)} <= ±${FAMILY_IN_LARGE}`);
    }
}
console.log(`Reader A-B: ${((performance.now() - t0) / 1000).toFixed(2)} s`);

// ==========================================================================
// Phase B: B on the reader (02a "Belief, η, and the firm")
//   H. B's edge over the full reader per act: positive in Act I, closed by
//      Act III
//   J. The reader-copier's edge over B, scored on the clamped pairs
// Worlds mirror runReaderWorld's loop, with the day's inputs handed to stepBelief
// so B's own record carries them. Lock days are 0, 63, ...; a lock on the day the
// world resolves is not recorded (the terminal latch discards its dispatch).
// ==========================================================================
{
    const ACT3_OPPORTUNITY = 0.02;
    const H = 1008, Q = 63, ACTS = ['I', 'II', 'III'];
    const clampP = p => Math.min(0.98, Math.max(0.02, p));
    const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
    const actOf = rr => rr <= 2 ? 0 : rr === 3 ? 1 : 2;
    const t1 = performance.now();
    for (const scenario of WORLD_SCENARIOS.scenarios) {
        const rows = [], worlds = [];
        for (let i = 0; i < N; i++) {
            const seed = seedOf(scenario, i), race = createRaceState(seed), sched = worldInputs(seed, scenario);
            BB.initBelief(race);
            const wrows = [];
            let inputs = null;
            const collect = (L) => {
                const rec = BB.belief.record, rule = ruleSummary(BB.belief.rungs, L);
                const act = actOf(rec.snapshot.view.releasedFrontierRung);
                const out = [];
                for (const R of [2, 3, 4]) {
                    if (BB.isCertified(R)) continue;
                    out.push({ L, R, act, pB: BB.binaryProb(R, L + Q), pF: lawQuarter(readerLaw(rec, R, 'full', rule), L) });
                }
                return out;
            };
            wrows.push(...collect(0));
            for (let d = 0; d < H && !race.resolution; d++) {
                inputs = sched();
                stepWorld(race, inputs);
                BB.stepBelief(race, inputs);
                const lock = race.day % Q === 0 ? collect(race.day) : null;
                if (checkResolution(race, inputs.geo)) break;
                if (lock) wrows.push(...lock);
            }
            if (!race.resolution) checkResolution(race, inputs?.geo);
            const T = {};
            for (const R of [2, 3, 4]) {
                let m = Infinity;
                for (const id of ['halcyon', 'tianxia', 'polaris']) { const c = race.capability.labs[id].rungCertified[R]; if (c != null) m = Math.min(m, c); }
                T[R] = m <= H ? m : Infinity;
            }
            for (const r of wrows) { r.o = +(T[r.R] > r.L && T[r.R] <= r.L + Q); r.edge = loss(r.pB, r.o) - loss(r.pF, r.o); rows.push(r); }
            worlds.push({ rows: wrows });
        }
        // H. The edge per act: per-run opportunity, nats summed over the act's open rung-quarters.
        const opportunity = ACTS.map((_, a) => mean(worlds.map(w => w.rows.filter(r => r.act === a).reduce((s, r) => s + r.edge, 0))));
        check(`H ${scenario} B's edge positive in Act I`, opportunity[0] > 0,
            `opportunity ${opportunity.map(x => x.toFixed(4)).join(' / ')} nats per run (Acts I / II / III)`);
        check(`H ${scenario} B's edge closed by Act III: |opportunity| <= ${ACT3_OPPORTUNITY} nats per run`, Math.abs(opportunity[2]) <= ACT3_OPPORTUNITY,
            `${opportunity[2].toFixed(5)}`);
        // J. The reader-copier, scored on the clamped pairs.
        const skill = mean(worlds.map(w => w.rows.reduce((s, r) => s + BB.logScoreDelta(clampP(r.pF), clampP(r.pB), r.o), 0)));
        check(`J ${scenario} reader-copier's edge positive`, skill > 0, `mean skill ${skill.toFixed(3)} nats per run`);
        BB.initBelief(null);
    }
    console.log(`Phase B sections: ${((performance.now() - t1) / 1000).toFixed(1)} s`);
}
console.log(`${checks.length - failures}/${checks.length} gates passed; ${((performance.now() - t0) / 1000).toFixed(2)} s`);
process.exitCode = failures ? 1 : 0;
