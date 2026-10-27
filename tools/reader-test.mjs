#!/usr/bin/env node
/* ===================================================
   Tenth headless harness. 02a "The reader".
   A. Schema, public-row reconstruction, hidden corruption, replay
   B. Grid/off-grid quarter/deadline calendar and day-state gates; support; deciles
   C. Learning floor relative to prior-only (ratified phi; validation suggestion)
   D. World-split age-spline/kNN challengers and planted-defect power checks
   E. Family calibration, 350/700 Brier, act-boundary knife edge
   F. Legible-to-full edge by act (eta=0 diagnostic)
   G. Quarter/live-deadline/support diagnostics at every 21-day sampled day
   H-K. Phase B: B's edge per act and its bands, the close, the reader-copier and
        static presets, diagnostics (V's gates are in valuation-test).
   Run: node tools/reader-test.mjs [N=2000] [--seed S] [--json PATH] [--sections A-G]
   N worlds PER scenario; legible calibration pools the training mixture. Any gate fails
   the process. Reports unmodified bands, even for a provisional fit.
   =================================================== */
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { READER_CONSTANTS as constants } from '../src/race/reader-constants.js';
import { assertReaderSchema, readerLaw, readerFamily, lawQuarter, lawCDF, lawRawCDF, lawMass, lawAtom, evaluateReaderFeatures } from '../src/race/reader.js';
import { RECORD_SCHEMA, READER_CLOCK_DAYS, readerCalibrationDays, RULE_HAZARD_FLOOR, expandReaderFeatures, createRecordFromSnapshot, foldPublicRecordRow, publicRecordRow, recordFeatures, createPublicRecord, stepPublicRecord, ruleSummary, ruleLogHazard } from '../src/race/public-record.js';
import { createRaceState } from '../src/race/race-state.js';
import { belief, initBelief } from '../src/race/belief.js';
import { WORLD_SCENARIOS, runReaderWorld, sampleFeatures } from './reader-data.mjs';
import { ensureEngineWorlds } from './engine-worlds.mjs';
import { quarterEntries, quarterMetrics, challengerMetrics, familyMetrics, familyMetricsFromRows, deadlineMetrics, legibleHorizonMetrics, calendarHorizonMetrics, plantedDefectMetrics } from './reader-metrics.mjs';
const fitReport = JSON.parse(readFileSync(new URL('./reader-fit-report.json', import.meta.url), 'utf8'));
// 02a: ratified gates are fixed here; refits report validation suggestions separately.
const RATIFIED_PHI = .221, RATIFIED_CHALLENGER_BOUND = .001;

const args = process.argv.slice(2);
let N = 2000, base = 1, json = null, readerOnly = false;
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seed') base = Number(args[++i]);
    else if (args[i] === '--sections') { if (args[++i] !== 'A-G') throw new Error('Supported section selection: A-G'); readerOnly = true; }
    else if (args[i] === '--json') json = args[++i];
    else if (args[i] === '--n' || args[i] === '-n') N = Number(args[++i]);
    else if (/^\d+$/.test(args[i])) N = Number(args[i]);
    else throw new Error(`Unknown argument ${args[i]}`);
}
if (!Number.isInteger(N) || N < 1 || !Number.isInteger(base) || base < 0) throw new Error('N and seed must be nonnegative integers; N must be positive');
const t0 = performance.now();
// The engine scenario's worlds: bystander runs' tapes (tools/engine-worlds.mjs).
await ensureEngineWorlds(Array.from({ length: Math.max(N, 94) }, (_, i) => base + i));
let failures = 0;
const checks = [], report = { N, base, schema: RECORD_SCHEMA, sections: readerOnly ? 'A-G' : 'A-K', scenarios: {} };
report.bands = { phi: RATIFIED_PHI, challengerBound: RATIFIED_CHALLENGER_BOUND, suggestedPhi: fitReport.suggestedPhi, suggestedChallengerBound: fitReport.suggestedChallengerBound };
console.log(`Validation suggestions: phi=${fitReport.suggestedPhi}, challenger bound=${fitReport.suggestedChallengerBound}; ratified gates phi=${RATIFIED_PHI}, challenger bound=${RATIFIED_CHALLENGER_BOUND}`);
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

function reportCalibration(scenario, R, set, v, gated) {
    const emit = gated ? check : (name, ok, detail) => console.log(`DIAGNOSTIC ${name}: ${ok ? 'within band' : 'outside band'}; ${detail}`);
    emit(`B ${scenario} R${R} ${set} in-large`, Math.abs(v.bias) <= 0.01, `${v.bias.toFixed(6)} <= ±0.010; CI [${v.interval.map(x => x?.toFixed(6))}]`);
    const eceEmit = gated && set === 'full' ? check : (name, ok, detail) => console.log(`DIAGNOSTIC ${name}: ${ok ? 'within band' : 'outside band'}; ${detail}`);
    eceEmit(`B ${scenario} R${R} ${set} ECE`, Number.isFinite(fitReport.eceBound) && v.ece <= fitReport.eceBound,
        `${v.ece.toFixed(6)} <= ${fitReport.eceBound}; CI [${v.eceInterval.map(x => x?.toFixed(6))}]`);

    const worst = v.worstDecile;
    console.log(`  DECILE DIAGNOSTIC ${scenario} R${R} ${set}: ${JSON.stringify(worst)}`);
    console.log(`  WORST ABSOLUTE DECILE (including small cells) ${scenario} R${R} ${set}: ${JSON.stringify(v.worstDecileAll)}`);
    for (const d of v.failingDeciles) {
        console.log(`  DECILE OUTSIDE DIAGNOSTIC BAND ${scenario} R${R} ${set} bin=${d.bin}: predicted=${d.predicted.toFixed(6)}, observed=${d.observed.toFixed(6)}, n=${d.n}, worlds=${d.worlds}, SE=${d.se.toFixed(6)}, band=${d.band.toFixed(6)}`);
        for (const state of d.states) console.log(`    day=${state.day}, R${state.claimRung} claimed=${state.claimed}, n=${state.n}, worlds=${state.worlds}, predicted=${state.predicted.toFixed(6)}, observed=${state.observed.toFixed(6)}`);
    }
}
function reportCalendar(scope,R,set,v,gated) {
    const emit=gated?check:(name,ok,detail)=>console.log(`DIAGNOSTIC ${name}: ${ok?'within band':'outside band'}; ${detail}`);
    emit(`G ${scope} R${R} ${set} support in-large`,Math.abs(v.support.bias)<=.01,JSON.stringify(v.support));
    for(const horizon of ['quarter','deadline']) {
        const metric=v[horizon],eligible=metric.days.filter(c=>c.eligible),failed=eligible.filter(c=>!c.passed);
        emit(`B ${scope} R${R} ${set} ${horizon} all21 calendar`,!failed.length,
            `${failed.length}/${eligible.length} eligible cells fail; max(0.03,3 sqrt(SE_test²+SE_train²))`);
        for (const [label, cells] of [['day × claim state', metric.dayClaimStates], ['off-grid calendar', metric.offGrid]]) {
            const eligible = cells.filter(c => c.eligible), failed = eligible.filter(c => !c.passed);
            const calendarEmit = label === 'off-grid calendar' && set === 'full'
                ? (name, ok, detail) => console.log(`DIAGNOSTIC ${name}: ${ok?'within band':'outside band'}; ${detail}`) : emit;
            calendarEmit(`B ${scope} R${R} ${set} ${horizon} ${label}`, !failed.length,
                `${failed.length}/${eligible.length} eligible cells fail; max(0.03,3 sqrt(SE_test²+SE_train²))`);
        }
        const states=metric.claimStates.filter(c=>c.eligible),failedStates=states.filter(c=>!c.passed);
        emit(`B ${scope} R${R} ${set} ${horizon} claim states`,!failedStates.length,
            `${failedStates.length}/${states.length} states fail; max(0.02,2 world SE)`);
        for(const cell of metric.days) if(Math.abs(cell.bias)>.02 || (cell.eligible&&!cell.passed))
            console.log(`  CALENDAR OVER .02 ${scope} R${R} ${set} ${horizon}: ${JSON.stringify(cell)}`);
        for(const cell of metric.claimStates) if(Math.abs(cell.bias)>.02 || (cell.eligible&&!cell.passed))
            console.log(`  CLAIM STATE OVER .02 ${scope} R${R} ${set} ${horizon}: ${JSON.stringify(cell)}`);
        for(const cell of metric.offGrid) if(Math.abs(cell.bias)>.02 || (cell.eligible&&!cell.passed))
            console.log(`  OFF GRID OVER .02 ${scope} R${R} ${set} ${horizon}: ${JSON.stringify(cell)}`);
        for(const cell of metric.dayClaimStates) if(cell.bias!=null && (Math.abs(cell.bias)>.02 || (cell.eligible&&!cell.passed)))
            console.log(`  DAY CLAIM STATE OVER .02 ${scope} R${R} ${set} ${horizon}: ${JSON.stringify(cell)}`);
    }
}
function reportFamily(scenario, set, head, gated) {
    for (const cell of head.classBias) {
        const detail = `bias=${cell.bias.toFixed(6)} <= ±0.020; CI [${cell.interval.map(x => x?.toFixed(6))}]`;
        if (gated) check(`E ${scenario} ${set} aggregate family${cell.family}`, Math.abs(cell.bias) <= .02, detail);
        else console.log(`DIAGNOSTIC E ${scenario} ${set} aggregate family${cell.family}: ${detail}`);
    }
    for (const act of head.perAct) for (const cell of act.classBias) console.log(`DIAGNOSTIC E ${scenario} ${set} act${act.act} family${cell.family}: bias=${cell.bias.toFixed(6)}, n=${act.n}, worlds=${act.worlds}; CI [${cell.interval.map(x => x?.toFixed(6))}]`);
}

const pooledEntries = [], pooledFamilyRows = [];
for (const scenario of WORLD_SCENARIOS.scenarios) {
    console.log(`Simulating ${N} ${scenario} worlds...`);
    const samples = [], boundaries = [];
    for (let i = 0; i < N; i++) {
        const w = runReaderWorld(base + i, scenario);
        // A role/offset sample may also be a 350/700 diagnostic; count that day once.
        samples.push(...new Map([...w.samples, ...w.diagnostics].map(s => [s.day, s])).values()); boundaries.push(...w.boundaries);
    }
    const entries = quarterEntries(samples, constants), metrics = quarterMetrics(entries), challengers = challengerMetrics(entries), family = familyMetrics(samples, constants, true, pooledFamilyRows);
    for (const entry of entries) pooledEntries.push(entry);
    const boundary = boundaries.map(s => ({ world: s.world, act: s.act, probabilities: Array.from(evaluateReaderFeatures('family', 'full', sampleFeatures(s, 'family', 'full'), s.day, constants, s.act)) }));
    const knife = { n: boundary.length, above060: boundary.filter(s => Math.max(...s.probabilities) > 0.6).length,
        below002: boundary.filter(s => Math.min(...s.probabilities) < 0.02).length, note: 'All six families treated as reachable; diagnostic only. Terminal/outcome reachability is not supplied by the public model.' };
    const calendar=calendarHorizonMetrics(entries,['legible','full'],true,fitReport.calibrationStage),planted=plantedDefectMetrics(entries);
    const out = { ...metrics, challengers, planted, calendar, family, knifeEdge: knife, deadlines: deadlineMetrics(entries) };
    report.scenarios[scenario] = out;
    for (const R of [2, 3, 4, 5]) {
        const m = metrics.rungs[R];
        for (const set of ['legible', 'full']) { reportCalibration(scenario,R,set,m[set],set==='full'); reportCalendar(scenario,R,set,calendar[R][set],set==='full'); }
        check(`C ${scenario} R${R} learning floor`, RATIFIED_PHI > 0 && m.full.logLoss <= (1 - RATIFIED_PHI) * m.prior.logLoss,
            `full=${m.full.logLoss.toFixed(6)}, prior=${m.prior.logLoss.toFixed(6)}, relative=${m.relativeImprovement.toFixed(4)} >= phi=${RATIFIED_PHI}`);
    }
    for (const [name, c] of Object.entries(challengers)) {
        check(`D ${scenario} ${name}`, Number.isFinite(RATIFIED_CHALLENGER_BOUND) && c.improvement <= RATIFIED_CHALLENGER_BOUND,
            `held-out improvement=${c.improvement.toFixed(6)} <= ${RATIFIED_CHALLENGER_BOUND}; CI [${c.interval.map(x => x?.toFixed(6))}]`);
        for (const [R, cell] of Object.entries(c.groups.R)) check(`D ${scenario} ${name} R${R}`, Number.isFinite(RATIFIED_CHALLENGER_BOUND) && cell.improvement <= RATIFIED_CHALLENGER_BOUND,
            `${cell.improvement.toFixed(6)} <= ${RATIFIED_CHALLENGER_BOUND}`);
    }
    for(const [defect,result] of Object.entries(planted)) for(const [name,value] of Object.entries(result.challengers))
        check(`D ${scenario} planted ${defect} ${name}`,Number.isFinite(value.improvement)&&value.improvement>RATIFIED_CHALLENGER_BOUND,
            `held-out improvement=${value.improvement} > ${RATIFIED_CHALLENGER_BOUND}; degraded-minus-shipped loss=${result.degradedMinusShippedLoss}`);
    for (const set of ['legible', 'full']) reportFamily(scenario, set, family[set], set === 'full');
    console.log(`E ${scenario} Brier ${JSON.stringify(family.full.brier)}; knife ${JSON.stringify(knife)}`);
    console.log(`F ${scenario} eta=0 edge ${JSON.stringify(metrics.edgeByAct)}`);
    console.log(`G ${scenario} raw/calibrated contract deadlines ${JSON.stringify(out.deadlines)}`);
}
report.pooled = { ...quarterMetrics(pooledEntries, true, ['legible']),
    family: familyMetricsFromRows(pooledFamilyRows, true, ['legible']), deadlines: deadlineMetrics(pooledEntries) };
report.pooled.horizons = legibleHorizonMetrics(pooledEntries);
report.pooled.calendar=calendarHorizonMetrics(pooledEntries,['legible'],true,fitReport.calibrationStage);
report.pooling = 'Equal world counts per scenario; concatenate observations, cluster paired neutral/engine trajectories by their shared world seed. Legible calibration pooled; scenario-specific legible metrics diagnostic only. Full calibration, learning floors and challengers remain per scenario.';
for(const R of [2,3,4,5]) { reportCalibration('pooled',R,'legible',report.pooled.rungs[R].legible,true); reportCalendar('pooled',R,'legible',report.pooled.calendar[R].legible,true); }
reportFamily('pooled', 'legible', report.pooled.family.legible, true);
console.log(`G pooled raw/calibrated contract deadlines ${JSON.stringify(report.pooled.deadlines)}`);
console.log(`G pooled quarter/deadline/support horizons ${JSON.stringify(report.pooled.horizons)}`);
console.log(`G pooled every-21-day calendar ${JSON.stringify(report.pooled.calendar)}`);
console.log(`A calibration fallback map ${JSON.stringify(fitReport.calibrationStage.fallbacks)}`);
report.readerRuntimeSeconds = (performance.now() - t0) / 1000;
console.log(`Reader A-G: ${report.readerRuntimeSeconds.toFixed(2)} s`);
// ==========================================================================
// Phase B: B on the reader (02a "Belief, η, and the firm": the edge, gated)
//   H. The edge per act: front-loaded; Acts I and II, per-run opportunity and
//      per-event edge, each within ±max(30%, 0.005 nats) of its validation value;
//      Act III bounded absolutely, |opportunity| <= 0.02 nats per run
//   I. The close, by state at the lock: the edge over quarters locked while the
//      rung is claimed but uncertified is at most max(1/3 of the edge over
//      quarters locked while it is unclaimed, 0.005 nats)
//   J. Big enough to act on (the reader-copier at K_CRED); no static preset pays
//   K. Diagnostics: headline-plus-quote, the coherence projection and the
//      inversion baseline, the fallback-tree mispricing
// Worlds mirror runReaderWorld's loop, with the day's inputs handed to stepBelief
// so B's own record carries them. Lock days are 0, 63, ...; a lock on the day the
// world resolves is not recorded (the terminal latch discards its dispatch). On
// the validation seeds (--seed 2000001) the band values are printed and the
// bands are reported, not gated.
// ==========================================================================
if (!readerOnly) {
    const BB = await import('../src/race/belief.js');
    const { checkResolution } = await import('../src/race/resolution.js');
    const { worldInputs, stepWorld } = await import('./reader-data.mjs');
    const { loss } = await import('./reader-metrics.mjs');
    const VALIDATION = base === 2000001;
    // Validation values (seeds 2,000,001-2,002,000, N=2000 per scenario, reader
    // schema 16, neutral and engine worlds), 2026-10-27; the gate is ±max(30%,
    // 0.005 nats) of each (02a).
    // Opportunity is nats per run summed over the act's eligible rung-quarters;
    // perEvent is nats per eligible rung-quarter. Acts I / II; Act III holds too few
    // open rung-quarters for a band and is bounded absolutely (ACT3_OPPORTUNITY).
    const EDGE_BANDS = {
        neutral: { opportunity: [0.72016, 0.16039], perEvent: [0.02325, 0.05319] },
        engine: { opportunity: [0.71963, 0.15941], perEvent: [0.02323, 0.05283] },
    };
    const ACT3_OPPORTUNITY = 0.02, CLOSE_FLOOR = 0.005, PRESET_SKILL = 0.05, PRESET_MEMO = 0.10;
    const H = 1008, Q = 63, ACTS = ['I', 'II', 'III'], MEMO = 0.55, MEMO_BY = 882;
    const DEADLINE = { 2: 420, 3: 756, 4: 880, 5: 1000 };
    const clampP = p => Math.min(0.98, Math.max(0.02, p));
    const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
    const actOf = rr => rr <= 2 ? 0 : rr === 3 ? 1 : 2;
    const K = BB.forecastTuning.K_CRED;
    const phaseB = report.phaseB = { K, validation: VALIDATION, scenarios: {} };
    const t1 = performance.now();
    for (const scenario of WORLD_SCENARIOS.scenarios) {
        const rows = [], worlds = [], fallbacks = { 2: [], 3: [], 4: [], 5: [] };
        for (let i = 0; i < N; i++) {
            const seed = base + i, race = createRaceState(seed), sched = worldInputs(seed, scenario);
            BB.initBelief(race);
            const wrows = [];
            let inputs = null, converted = false;
            const collect = (L) => {
                const rec = BB.belief.record, rule = ruleSummary(BB.belief.rungs, L), eta = BB.beliefEta();
                const act = actOf(rec.snapshot.view.releasedFrontierRung);
                const pre = { E: BB.presetCurves('earlier'), L: BB.presetCurves('later'), P: BB.presetCurves('market') };
                const out = [];
                for (const R of [2, 3, 4]) {
                    if (BB.isCertified(R)) continue;
                    const pB = BB.binaryProb(R, L + Q);
                    const pF = lawQuarter(readerLaw(rec, R, 'full', rule), L), pL = lawQuarter(readerLaw(rec, R, 'legible', rule), L);
                    const unproj = (1 - eta) * pL + eta * pF;
                    out.push({ world: i, L, R, act, eta, pB, pF, pL, bind: unproj - pB, claimed: +(rec.snapshot.view.releasedFrontierRung >= R),
                        presets: Object.fromEntries(Object.entries(pre).map(([k, c]) => [k, BB.quarterProb(c[R].m, c[R].w, c[R].q, L, L + Q)])) });
                }
                return out;
            };
            wrows.push(...collect(0));
            let endDay = H;
            for (let d = 0; d < H && !race.resolution; d++) {
                inputs = sched();
                stepWorld(race, inputs);
                BB.stepBelief(race, inputs);
                if (!converted && (race.controlRegime === 'nationalized' || race.controlRegime === 'classified')) {
                    converted = true;
                    for (const R of [2, 3, 4, 5]) if (DEADLINE[R] > race.day && !BB.isCertified(R)) fallbacks[R].push(clampP(BB.binaryProb(R, DEADLINE[R])) - 0.5);
                }
                const lock = race.day % Q === 0 ? collect(race.day) : null;
                if (checkResolution(race, inputs.geo)) { endDay = race.day; break; }
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
            worlds.push({ i, T, endDay, rows: wrows });
        }
        // H. The edge per act.
        const perEvent = ACTS.map((_, a) => mean(rows.filter(r => r.act === a).map(r => r.edge)));
        const opportunity = ACTS.map((_, a) => mean(worlds.map(w => w.rows.filter(r => r.act === a).reduce((s, r) => s + r.edge, 0))));
        const out = phaseB.scenarios[scenario] = { worlds: N, rungQuarters: rows.length, perEvent, opportunity,
            perEventN: ACTS.map((_, a) => rows.filter(r => r.act === a).length) };
        check(`H ${scenario} edge front-loaded: per-run opportunity I >= II >= III`, opportunity[0] >= opportunity[1] && opportunity[1] >= opportunity[2],
            `opportunity ${opportunity.map(x => x.toFixed(4)).join(' / ')} nats per run; per event ${perEvent.map(x => x.toFixed(4)).join(' / ')}`);
        check(`H ${scenario} Act III |opportunity| <= ${ACT3_OPPORTUNITY} nats per run`, Math.abs(opportunity[2]) <= ACT3_OPPORTUNITY,
            `${opportunity[2].toFixed(5)} (per event ${perEvent[2].toFixed(5)}, n ${out.perEventN[2]}; reported)`);
        for (const [kind, vals] of [['opportunity', opportunity], ['perEvent', perEvent]]) for (let a = 0; a < 2; a++) {
            const v = EDGE_BANDS?.[scenario]?.[kind]?.[a];
            const name = `H ${scenario} ${kind} Act ${ACTS[a]} within ±max(30%, 0.005) of validation`;
            const tol = v == null ? NaN : Math.max(0.3 * Math.abs(v), 0.005);
            if (VALIDATION || v == null) console.log(`${VALIDATION ? 'VALIDATION' : 'PENDING'} ${name}: ${vals[a].toFixed(5)}${v != null ? ` (band ${v})` : ''}`);
            else check(name, Math.abs(vals[a] - v) <= tol, `${vals[a].toFixed(5)} vs ${v} ± ${tol.toFixed(5)}`);
        }
        // I. The close, by state at the lock (02a): on each rung, quarters locked while
        //    it is claimed but uncertified against quarters locked while unclaimed;
        //    at most a third of the unclaimed edge, or 0.005 nats, whichever is larger.
        out.close = {};
        for (const R of [2, 3, 4]) {
            const mine = rows.filter(r => r.R === R);
            const claimed = mine.filter(r => r.claimed).map(r => r.edge), unclaimed = mine.filter(r => !r.claimed).map(r => r.edge);
            const c = mean(claimed), u = mean(unclaimed);
            out.close[R] = { claimed: c, unclaimed: u, nClaimed: claimed.length, nUnclaimed: unclaimed.length };
            const bound = Math.max(u / 3, CLOSE_FLOOR);
            check(`I ${scenario} R${R} closes: claimed-uncertified edge <= max(1/3 of the unclaimed edge, ${CLOSE_FLOOR})`, claimed.length > 0 && unclaimed.length > 0 && c <= bound,
                `claimed ${c.toFixed(4)} (n ${claimed.length}) <= ${bound.toFixed(4)}; unclaimed ${u.toFixed(4)} (n ${unclaimed.length}) nats per rung-quarter`);
        }
        // J. The reader-copier and the static presets, scored on the clamped pairs.
        const skill = (pick) => worlds.map(w => {
            let S = 0, memo = false;
            const byL = new Map();
            for (const r of w.rows) byL.set(r.L, (byL.get(r.L) || 0) + BB.logScoreDelta(clampP(pick(r)), clampP(r.pB), r.o));
            for (const L of [...byL.keys()].sort((a, b) => a - b)) {
                S += byL.get(L);
                if (L + Q <= MEMO_BY && L + Q <= w.endDay && Math.tanh(S / K) > MEMO) memo = true;
            }
            return { S, memo };
        });
        const reader = skill(r => r.pF);
        out.readerMemo = mean(reader.map(x => +x.memo)); out.readerSkill = mean(reader.map(x => x.S));
        check(`J ${scenario} reader-copier clears the memo gate by day ${MEMO_BY} in >= 50% of worlds (K ${K})`, out.readerMemo >= 0.5,
            `${(100 * out.readerMemo).toFixed(1)}%, mean skill ${out.readerSkill.toFixed(3)} nats`);
        out.presets = {};
        for (const [k, name] of [['E', 'earlier'], ['L', 'later'], ['P', 'projection']]) {
            // 02a: an untouched projection drawing locks as market policy, so pP is pM.
            const s = skill(r => k === 'P' ? r.pB : r.presets[k]), m = mean(s.map(x => x.S)), memo = mean(s.map(x => +x.memo));
            out.presets[name] = { skill: m, memo };
            check(`J ${scenario} static "${name}" pays nothing (mean skill <= +${PRESET_SKILL} nats per run, memo by ${MEMO_BY} <= ${100 * PRESET_MEMO}%)`, m <= PRESET_SKILL && memo <= PRESET_MEMO,
                `${m.toFixed(3)} nats, memo ${(100 * memo).toFixed(1)}%`);
        }
        // K. Diagnostics.
        const fitHQ = (train) => {      // logistic o ~ logit(pB) + clock + claimed, Newton with a small ridge
            const X = train.map(r => [1, Math.log(clampP(r.pB) / (1 - clampP(r.pB))), r.L / H, r.claimed]), y = train.map(r => r.o);
            let wv = [0, 1, 0, 0];
            for (let it = 0; it < 25; it++) {
                const g = [0, 0, 0, 0], Hm = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
                for (let n = 0; n < X.length; n++) {
                    const z = X[n].reduce((s, x, j) => s + x * wv[j], 0), p = 1 / (1 + Math.exp(-z)), v = p * (1 - p);
                    for (let a = 0; a < 4; a++) { g[a] += (p - y[n]) * X[n][a]; for (let b = 0; b < 4; b++) Hm[a][b] += v * X[n][a] * X[n][b]; }
                }
                for (let a = 0; a < 4; a++) { Hm[a][a] += 1e-6 * X.length; g[a] += 1e-6 * X.length * wv[a]; }
                const M = Hm.map((row, a) => [...row, g[a]]);
                for (let c = 0; c < 4; c++) { let p = c; for (let r2 = c + 1; r2 < 4; r2++) if (Math.abs(M[r2][c]) > Math.abs(M[p][c])) p = r2; [M[c], M[p]] = [M[p], M[c]]; for (let r2 = c + 1; r2 < 4; r2++) { const f = M[r2][c] / M[c][c]; for (let k = c; k <= 4; k++) M[r2][k] -= f * M[c][k]; } }
                const step = [0, 0, 0, 0];
                for (let r2 = 3; r2 >= 0; r2--) { let s = M[r2][4]; for (let k = r2 + 1; k < 4; k++) s -= M[r2][k] * step[k]; step[r2] = s / M[r2][r2]; }
                wv = wv.map((v, j) => v - step[j]);
            }
            return r => 1 / (1 + Math.exp(-[1, Math.log(clampP(r.pB) / (1 - clampP(r.pB))), r.L / H, r.claimed].reduce((s, x, j) => s + x * wv[j], 0)));
        };
        const hq = [];
        for (const R of [2, 3, 4]) for (const held of [0, 1]) {
            const sub = rows.filter(r => r.R === R), train = sub.filter(r => ((r.world >>> 1) & 1) !== held), test = sub.filter(r => ((r.world >>> 1) & 1) === held);
            if (train.length < 100 || !test.length) continue;
            const f = fitHQ(train);
            for (const r of test) hq.push({ act: r.act, gain: loss(r.pB, r.o) - loss(f(r), r.o) });
        }
        out.headlinePlusQuote = ACTS.map((_, a) => mean(hq.filter(x => x.act === a).map(x => x.gain)));
        const binds = rows.filter(r => r.bind > 1e-9);
        out.projection = { share: binds.length / rows.length, meanSize: mean(binds.map(r => r.bind)), maxSize: Math.max(0, ...binds.map(r => r.bind)) };
        const inv = rows.filter(r => r.eta > 0 && !(r.bind > 1e-9));
        const invErr = Math.max(0, ...inv.map(r => Math.abs((r.pB - (1 - r.eta) * r.pL) / r.eta - r.pF)));
        out.inversion = { share: inv.length / rows.length, edgePerAct: ACTS.map((_, a) => mean(inv.filter(r => r.act === a).map(r => r.edge))), maxRecoveryError: invErr };
        out.fallback = Object.fromEntries([2, 3, 4, 5].map(R => [R, { worlds: fallbacks[R].length, share: fallbacks[R].length / N, meanQuoteMinusHalf: mean(fallbacks[R]) }]));
        console.log(`K ${scenario} headline-plus-quote edge (B minus baseline log loss) per act ${out.headlinePlusQuote.map(x => x.toFixed(4)).join(' / ')}`);
        console.log(`K ${scenario} coherence projection binds on ${(100 * out.projection.share).toFixed(2)}% of rung-quarters (mean ${out.projection.meanSize.toFixed(4)}, max ${out.projection.maxSize.toFixed(4)}); inversion recoverable on ${(100 * out.inversion.share).toFixed(1)}%, its edge per act ${out.inversion.edgePerAct.map(x => x.toFixed(4)).join(' / ')} (max recovery error ${invErr.toExponential(2)})`);
        console.log(`K ${scenario} fallback tree at conversion (share of worlds; mean quote - 0.50): ${[2, 3, 4, 5].map(R => `R${R} ${(100 * out.fallback[R].share).toFixed(1)}%/${Number.isFinite(out.fallback[R].meanQuoteMinusHalf) ? out.fallback[R].meanQuoteMinusHalf.toFixed(3) : '--'}`).join('  ')}; no event opens a dispute in play`);
        console.log(`H ${scenario} per rung: ${[2, 3, 4].map(R => `R${R} ${mean(rows.filter(r => r.R === R).map(r => r.edge)).toFixed(4)}`).join('  ')}; I close ${JSON.stringify(out.close)}`);
        BB.initBelief(null);
    }
    if (VALIDATION) console.log(`VALIDATION EDGE_BANDS = ${JSON.stringify(Object.fromEntries(Object.entries(phaseB.scenarios).map(([s, v]) => [s, { opportunity: v.opportunity.slice(0, 2).map(x => +x.toFixed(5)), perEvent: v.perEvent.slice(0, 2).map(x => +x.toFixed(5)) }])))}`);
    console.log(`Phase B sections: ${((performance.now() - t1) / 1000).toFixed(1)} s`);
}
report.checks = checks; report.failures = failures; report.runtimeSeconds = (performance.now() - t0) / 1000;
if (json) writeFileSync(json, JSON.stringify(report, null, 2) + '\n');
console.log(`${checks.length - failures}/${checks.length} gates passed; ${report.runtimeSeconds.toFixed(2)} s; phi=${RATIFIED_PHI}, challenger bound=${RATIFIED_CHALLENGER_BOUND}`);
process.exitCode = failures ? 1 : 0;
