// Market belief B, the player's posterior and its scoring, the reader's laws and
// the event-impulse overlay. Every
// number here reaches a price or a score, and none of it is visible as wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceState, advanceRace, stepControlRegime, freshTransitions } from '../src/race/race-state.js';
import { stepTreaty } from '../src/race/treaty-track.js';
import { checkResolution } from '../src/race/resolution.js';
import { initConsensus, buildPublicView } from '../src/race/consensus.js';
import {
    belief, initBelief, stepBelief, binaryProb, familyHeads, impliedTimeline, beliefLaw, certDay, isCertified, beliefCauses,
    isLockDay, LOCK_INTERVAL, lockForecast, scoreQuarter, scoreOutstandingQuarter, scoreVariance, copierLock,
    scoreCopierQuarter, scoreCopierOutstanding, copierRecord, crossingProb, quarterProb, logScoreDelta,
    presetCurves, marketCurves, normalizeCurves, setDraft, followMarket, forecastRecord, forecastTuning, credibility,
} from '../src/race/belief.js';
import { ruleSummary } from '../src/race/public-record.js';
import { readerLaw, readerFamily, lawCDF, lawQuarter, lawMass, lawAtom } from '../src/race/reader.js';
import {
    VALUATION_TUNING, familyMarks, valuationFromFamily, pooledValuation, computeValuation, initValuation, stepValuation,
    lastValuation, resetValuation,
} from '../src/race/valuation.js';
import {
    addEventImpulse, decayEventImpulses, applyEventImpulseOverlay, removeEventImpulseOverlay, currentEventImpulse,
    eventImpulseMagnitude, resetEventImpulses, IMPULSE_HALF_LIFE,
} from '../src/race/impulse.js';
import { PARAM_RANGES } from '../src/events/param-ranges.js';
import { summarizeAlmanac } from '../src/almanac.js';

const HORIZON = 1008;
const SUPPORT = { 2: 1008, 3: 1008, 4: 1008, 5: 1260 };
const sig = (x) => 1 / (1 + Math.exp(-x));
const clampP = (p) => Math.min(0.98, Math.max(0.02, p));
const close = (a, b, tol = 1e-12) => Math.abs(a - b) < tol;
// The naive forms, against the module's log-space ones.
const S = (m, w, q, x) => 1 - (1 - q) * sig((x - m) / w);
const naiveP = (m, w, q, t0, t1) => 1 - S(m, w, q, t1) / S(m, w, q, t0);
const naiveD = (pP, pM, o) => (o ? Math.log(pP / pM) : Math.log((1 - pP) / (1 - pM)));
const naiveV = (pP, pM) => pM * (1 - pM) * (Math.log(pP / pM) - Math.log((1 - pP) / (1 - pM))) ** 2;

/** One completed day of the game's race block on neutral inputs. */
function raceDay(race) { advanceRace(race); stepControlRegime(race); stepTreaty(race, {}); stepBelief(race); }
/** Quiet synthetic days to `day`; `edits[d]` changes the public state on day d. */
function quietTo(race, day, edits = {}) {
    for (let d = race.day + 1; d <= day; d++) {
        race.day = d; race.lastTransitions = freshTransitions();
        if (edits[d]) edits[d](race);
        stepBelief(race);
    }
}
const certifyOn = (R, lab = 'halcyon') => (race) => {
    const L = race.capability.labs[lab];
    for (let r = 1; r <= R; r++) if (L.rungReleased[r] == null) L.rungReleased[r] = race.day;
    for (let r = 2; r <= R; r++) if (L.rungCertified[r] == null) L.rungCertified[r] = race.day;
    race.lastTransitions.certifications = [{ lab, rung: R, direct: true }];
};
const frontierCert = (race, R) => {
    let m = null;
    for (const id of ['halcyon', 'tianxia', 'polaris']) { const c = race.capability.labs[id].rungCertified[R]; if (c != null && (m == null || c < m)) m = c; }
    return m;
};

// The reader's legible heads were fit on the rule of thumb's exact trajectory, so
// its state must be recoverable from the ledger alone.
test('the rule of thumb reconstructs from its ledger, and agrees with the record on certification', () => {
    const race = createRaceState(950);
    initConsensus(race); initBelief(race);
    const recon = Object.fromEntries([2, 3, 4, 5].map(R => [R, { m: belief.rungs[R].m, w: belief.rungs[R].w, crossed: false, certDay: null }]));
    for (let d = 0; d < 600; d++) raceDay(race);
    const causes = beliefCauses();
    assert.ok(causes.length > 0 && causes.every(c => c.id != null), 'a rule move carried no evidence id');
    for (const c of causes) {
        if (c.rung == null) continue;
        const r = recon[c.rung];
        if (c.kind === 'mw') {
            assert.ok(close(r.m, c.mFrom, 1e-9) && close(r.w, c.wFrom, 1e-9), 'ledger entries do not chain');
            r.m = c.mTo; r.w = c.wTo;
        } else if (c.kind === 'crossed') { r.crossed = true; r.certDay = c.certDay; }
    }
    for (const R of [2, 3, 4, 5]) {
        const live = belief.rungs[R], rc = recon[R];
        assert.equal(rc.crossed, live.crossed);
        if (live.crossed) assert.equal(rc.certDay, live.certDay);
        else assert.ok(close(rc.m, live.m, 1e-9) && close(rc.w, live.w, 1e-9), `R${R} does not reconstruct`);
    }
    for (const R of [2, 3, 4]) assert.equal(belief.rungs[R].crossed, isCertified(R));
});

test('a leaked beat folds into the sentiment once per id', () => {
    initBelief(null);
    const tr = { releases: [], certifications: [], thefts: [], crossings: [], spawned: [], incidents: { occurred: [], detected: [] },
        evidence: { occurred: [{ id: 'L1', lab: 'halcyon', favorable: false, logLR: -1.0, path: 'leaked', occurDay: 10 }], published: [] } };
    belief.day = 10;
    const a0 = belief.alignment;
    stepBelief({ day: 10, lastTransitions: tr });
    const a1 = belief.alignment;
    stepBelief({ day: 10, lastTransitions: tr });
    assert.ok(Math.abs(a1 - a0) > 1e-9 && belief.alignment === a1);
    assert.equal(beliefCauses().filter(c => c.id === 'evleak_L1').length, 1);
});

test('the posterior\'s arithmetic: crossing probabilities, locks, the score, credibility and sigma0 against the naive forms', () => {
    for (const [m, w, q, t0, t1] of [[100, 50, 0, 0, 63], [721, 140, 0.2, 315, 378], [400, 25, 0.5, 378, 441], [2016, 400, 0.95, 0, 63]]) {
        assert.ok(close(crossingProb(m, w, q, t0, t1), naiveP(m, w, q, t0, t1)));
        assert.ok(close(quarterProb(m, w, q, t0, t1), clampP(naiveP(m, w, q, t0, t1))));
    }
    // Far past the median the logistic's tail hazard is 1/w; with a plateau the survivors never cross.
    assert.ok(close(crossingProb(10, 25, 0, 1000, 1063), 1 - Math.exp(-63 / 25), 1e-9));
    assert.ok(crossingProb(10, 25, 0.3, 1000, 1063) < 1e-9);

    const race = createRaceState(223);
    initBelief(race);
    const mine = normalizeCurves({ ...marketCurves(), 2: { m: 40, w: 30, q: 0.1 } });
    setDraft(mine);
    const lk = lockForecast(0);
    assert.equal(lk.classes[2], 'carried');
    for (const R of [2, 3, 4]) {
        assert.equal(lk.pairs[R].pM, clampP(binaryProb(R, 63)));
        if (lk.classes[R] === 'carried') assert.ok(close(lk.pairs[R].pP, clampP(naiveP(mine[R].m, mine[R].w, mine[R].q, 0, 63))));
        else assert.equal(lk.pairs[R].pP, lk.pairs[R].pM);
    }
    quietTo(race, 63, { 63: certifyOn(2) });
    const q1 = scoreQuarter(63);
    const want = [2, 3, 4].reduce((a, R) => a + naiveD(lk.pairs[R].pP, lk.pairs[R].pM, R === 2 ? 1 : 0), 0);
    assert.ok(close(q1.delta, want), 'the score is not read from the stored pairs');
    assert.ok(close(credibility(), Math.tanh(want / forecastTuning.K_CRED)));
    const v1 = [2, 3, 4].reduce((a, R) => a + naiveV(lk.pairs[R].pP, lk.pairs[R].pM), 0);
    assert.ok(close(q1.var0, v1) && v1 > 0);
    assert.ok(close(forecastRecord().sigma0, Math.sqrt(v1)));
    for (const [a, b] of [[0.3, 0.1], [0.02, 0.98]]) assert.ok(close(scoreVariance(a, b), naiveV(a, b)));
    assert.equal(scoreQuarter(63), q1, 'a quarter scored twice');
});

test('the market copier scores exactly 0, every quarter', () => {
    const race = createRaceState(222);
    initBelief(race);
    followMarket();
    const l0 = lockForecast(0);
    assert.ok([2, 3, 4, 5].every(R => l0.classes[R] === 'followed') && [2, 3, 4].every(R => l0.pairs[R].pP === l0.pairs[R].pM));
    quietTo(race, 63, { 40: certifyOn(2) });
    const s1 = scoreQuarter(63);
    followMarket(); lockForecast(63);
    quietTo(race, 126);
    const s2 = scoreQuarter(126);
    assert.ok(s1.delta === 0 && s2.delta === 0 && s1.var0 === 0 && s2.var0 === 0);
    assert.ok(credibility() === 0 && forecastRecord().sigma0 === 0);
});

test('the score is proper: the true law maximizes the expected increment, plateau included', () => {
    const laws = [[400, 90, 0], [721, 140, 0.2], [860, 60, 0.5], [1200, 300, 0.1]];
    const quarters = [[0, 63], [315, 378], [882, 945]];
    const markets = [[500, 120, 0], [900, 50, 0.1]];
    for (const [m, w, q] of laws) for (const [t0, t1] of quarters) for (const [mm, wm, qm] of markets) {
        const pTrue = crossingProb(m, w, q, t0, t1), pM = quarterProb(mm, wm, qm, t0, t1);
        const E = (p) => pTrue * logScoreDelta(p, pM, 1) + (1 - pTrue) * logScoreDelta(p, pM, 0);
        const truth = E(quarterProb(m, w, q, t0, t1));
        for (const [pm, pw, pq] of [[m + 30, w, q], [m - 100, w, q], [m, w * 0.6, q], [m, w * 1.6, q], [m, w, Math.min(0.95, q + 0.2)], [m, w, Math.max(0, q - 0.2)]]) {
            assert.ok(E(quarterProb(pm, Math.max(25, pw), pq, t0, t1)) <= truth + 1e-12, `law {${m},${w},${q}} beaten by {${pm},${pw},${pq}} on [${t0},${t1}]`);
        }
    }
});

// binaryProb is the pool (1 - eta)·legible + eta·full over the reader's laws,
// made coherent up the ladder; recomputed here from the reader API.
test('B is the pool of the two readers, coherent up the ladder, and its laws add to one', () => {
    for (const seed of [700, 701]) {
        const race = createRaceState(seed);
        initConsensus(race); initBelief(race);
        for (let d = 0; d <= HORIZON && !race.resolution; d++) {
            if (d > 0) raceDay(race);
            if (race.day % 189 !== 0) continue;
            const t = race.day, rule = ruleSummary(belief.rungs, t);
            const eta = Math.min(1, Math.max(0, (Math.max(1, buildPublicView(race).releasedFrontierRung) - 1) / 4));
            const raw = (R, D) => {
                const cd = frontierCert(race, R);
                if (R < 5 && cd != null) return +(D >= cd);
                return (1 - eta) * lawCDF(readerLaw(belief.record, R, 'legible', rule), t, D) + eta * lawCDF(readerLaw(belief.record, R, 'full', rule), t, D);
            };
            for (const R of [2, 3, 4, 5]) {
                for (let D = t + 7; D <= SUPPORT[R]; D += 61) {
                    let want = raw(R, D);
                    if (R < 5) for (let r = 2; r < R; r++) want = Math.min(want, raw(r, D));
                    assert.ok(close(binaryProb(R, D), want, 1e-14), `R${R} day ${t} D ${D}`);
                    if (R >= 3 && R < 5) assert.ok(binaryProb(R, D) <= binaryProb(R - 1, D) + 1e-15, 'P(R) above P(R-1)');
                }
                if (R < 5 && frontierCert(race, R) != null) continue;
                const L = beliefLaw(R);
                let mass = 0, median = null;
                for (let D = t + 1; D <= SUPPORT[R]; D++) { mass += L.density(D); if (median == null && binaryProb(R, D) >= 0.5) median = D; }
                assert.ok(close(mass + L.atom, 1, 1e-9), `R${R} law mass ${mass + L.atom}`);
                assert.equal(impliedTimeline()[R], median);
            }
        }
    }
});

test('every reader head is a law: masses and atom sum to one, the CDF monotone and capped at its support', () => {
    const race = createRaceState(1);
    initBelief(race);
    const rule = ruleSummary(belief.rungs, 0);
    for (const R of [2, 3, 4, 5]) for (const set of ['legible', 'full', 'prior']) {
        const law = readerLaw(belief.record, R, set, rule);
        let sum = lawAtom(law), prev = 0;
        for (let d = 1; d <= law.support; d++) { const p = lawCDF(law, 0, d); assert.ok(p >= prev && p <= 1); prev = p; sum += lawMass(law, d); }
        assert.ok(close(sum, 1) && lawCDF(law, 0, 0) === 0 && lawCDF(law, 0, 1e6) === lawCDF(law, 0, law.support), `R${R} ${set}`);
    }
    // The calibration stage scales raw hazard increments on nested segments.
    const raw = { day: 0, support: 1260, deadline: 420, hazards: Float64Array.of(0.01, 0.01, 0.01, 0.01, 0.01, 0.01),
        boundaries: [{ end: 63, scale: 2 }, { end: 420, scale: 0.5 }, { end: 1260, scale: 3 }] };
    const H = (D) => 0.01 * (2 * Math.min(D, 63) + 0.5 * Math.max(0, Math.min(D, 420) - 63) + 3 * Math.max(0, Math.min(D, 1260) - 420));
    for (const D of [0, 1, 63, 64, 420, 421, 1260, 2000]) assert.ok(close(lawCDF(raw, 0, D), -Math.expm1(-H(D))), `segmented CDF at ${D}`);
    assert.ok(close(lawAtom(raw), Math.exp(-H(1260))));
});

// V = (1 - eta)·V_legible + eta·V_full, each V_x the
// survival-conditioned expected family mark under reader x's family head.
test('V is the pooled survival-conditioned expected mark, and family 3 gets no weight', () => {
    const m = familyMarks();
    const naive = (p) => [1, 2, 4, 5, 6].reduce((a, f) => a + p[f - 1] * m[f], 0) / [1, 2, 4, 5, 6].reduce((a, f) => a + p[f - 1], 0);
    const p = [0.1, 0.2, 0.3, 0.15, 0.05, 0.2];
    assert.ok(close(valuationFromFamily(p), naive(p)));
    assert.ok(close(valuationFromFamily([0.5, 0, 0.4, 0, 0, 0.1]), valuationFromFamily([0.5 / 0.6, 0, 0, 0, 0, 0.1 / 0.6])));
    const race = createRaceState(1);
    initConsensus(race); initBelief(race);
    const rule = ruleSummary(belief.rungs, 0), heads = familyHeads();
    const L = readerFamily(belief.record, 'legible', rule), F = readerFamily(belief.record, 'full', rule);
    assert.deepEqual([...heads.legible], [...L]);
    assert.deepEqual([...heads.full], [...F]);
    const eta = (Math.max(1, buildPublicView(race).releasedFrontierRung) - 1) / 4;
    assert.ok(close(computeValuation(race), (1 - eta) * valuationFromFamily(L) + eta * valuationFromFamily(F)));
    assert.equal(pooledValuation(heads), computeValuation(race));
    resetValuation();
    const classic = stepValuation(null);
    assert.ok(initValuation(null) === null && classic.V === 1 && classic.ratio === 1 && lastValuation() === null, 'Classic is not inert');
});

test('the applied gap is the clamped ratio, converges on an unchanged target, and telescopes to the terminal level', () => {
    const T = VALUATION_TUNING, clampR = (x) => Math.max(T.ratioMin, Math.min(T.ratioMax, x));
    const a = createRaceState(1);
    initBelief(a); initValuation(a);
    const Va = lastValuation();
    const b = createRaceState(1);
    for (const r of [1, 2, 3, 4]) b.capability.labs.halcyon.rungReleased[r] = 0;   // a public R4 claim at day 0
    initBelief(b);
    const Vb = computeValuation(b);
    const first = stepValuation(b);
    assert.ok(first.V === Vb && first.ratio === clampR(Vb / Va) && close(lastValuation(), Va * first.ratio));
    for (let i = 0; i < 12; i++) stepValuation(b);
    assert.ok(lastValuation() === Vb && stepValuation(b).ratio === 1, 'an unchanged target did not converge');
    for (const seed of [31, 32]) {
        const race = createRaceState(seed);
        initConsensus(race); initBelief(race); initValuation(race);
        const V0 = lastValuation();
        let product = 1;
        for (let d = 0; d < HORIZON && !race.resolution; d++) {
            advanceRace(race, { straitTension: 0 }); stepControlRegime(race); stepTreaty(race, {}); stepBelief(race);
            const { V, ratio } = stepValuation(race);
            assert.ok(V >= 0.35 - 1e-12 && V <= 1.60 + 1e-12 && ratio >= T.ratioMin && ratio <= T.ratioMax, `seed ${seed} day ${race.day}`);
            product *= ratio;
            if (checkResolution(race, null)) break;
        }
        assert.ok(close(V0 * product, lastValuation(), 1e-9), 'the applied gaps do not telescope');
    }
    resetValuation();
});

// The reader-copier's record is the almanac's and never shown in play.
test('the module\'s reader-copier record equals an independent recomputation, quarter by quarter', () => {
    for (const seed of [11, 12]) {
        const race = createRaceState(seed);
        initConsensus(race); initBelief(race);
        const mine = []; let lock = null, S = 0;
        const score = (to, cdOf) => {
            if (!lock) return;
            const rungs = [];
            for (const R of [2, 3, 4]) {
                const pr = lock.pairs[R];
                if (!pr) continue;
                const cd = cdOf(R), o = cd != null && cd > lock.day && cd <= to ? 1 : 0;
                rungs.push({ R, o, delta: logScoreDelta(pr.pP, pr.pM, o), v: scoreVariance(pr.pP, pr.pM) });
            }
            const delta = rungs.reduce((a, r) => a + r.delta, 0);
            S += delta;
            if (rungs.length) mine.push({ from: lock.day, to, rungs, delta });
            lock = null;
        };
        const lockDay = (day) => {
            copierLock(day);
            const rule = ruleSummary(belief.rungs, day), pairs = {};
            for (const R of [2, 3, 4]) {
                if (certDay(R) != null) continue;
                pairs[R] = { pP: clampP(lawQuarter(readerLaw(belief.record, R, 'full', rule), day)), pM: clampP(binaryProb(R, day + LOCK_INTERVAL)) };
            }
            lock = { day, pairs };
        };
        lockDay(0);
        for (let d = 0; d < HORIZON && !race.resolution; d++) {
            advanceRace(race, { straitTension: 0 }); stepControlRegime(race); stepTreaty(race, {}); stepBelief(race);
            const isLock = isLockDay(race.day);
            if (isLock) { score(race.day, certDay); scoreCopierQuarter(race.day); }
            if (checkResolution(race, null)) break;
            if (isLock && race.day < HORIZON) lockDay(race.day);
        }
        if (!race.resolution) checkResolution(race, null);
        scoreCopierOutstanding(race);
        score(lock ? lock.day + LOCK_INTERVAL : 0, (R) => frontierCert(race, R));
        const theirs = copierRecord().history;
        assert.ok(mine.length > 3);
        assert.equal(theirs.length, mine.length);
        mine.forEach((q, k) => {
            const t = theirs[k];
            assert.ok(q.from === t.from && q.to === t.to && q.delta === t.delta, `seed ${seed} quarter ${k}`);
            q.rungs.forEach((r, j) => assert.ok(r.R === t.rungs[j].R && r.o === t.rungs[j].o && r.delta === t.rungs[j].delta && r.v === t.rungs[j].v));
        });
        assert.equal(copierRecord().S, S);
    }
});

test('the outstanding quarter at the terminal scores once, from its stored pairs, against the original end date', () => {
    const race = createRaceState(240);
    initBelief(race);
    setDraft(presetCurves('earlier')); lockForecast(0);
    quietTo(race, 63);
    scoreQuarter(63);
    setDraft(presetCurves('earlier'));
    const L63 = lockForecast(63);
    quietTo(race, 100);
    const S0 = forecastRecord().S;
    race.capability.labs.tianxia.rungCertified[2] = 110; race.capability.labs.tianxia.rungCertified[3] = 110;
    const o = scoreOutstandingQuarter(race);
    const want = [2, 3, 4].reduce((a, R) => a + logScoreDelta(L63.pairs[R].pP, L63.pairs[R].pM, R <= 3 ? 1 : 0), 0);
    assert.ok(o.terminal && o.from === 63 && o.to === 126 && close(o.delta, want) && close(forecastRecord().S, S0 + want));
    assert.equal(scoreOutstandingQuarter(race), o);
    assert.equal(forecastRecord().quarters, 2);
    // A certification after the quarter's end does not count.
    const r2 = createRaceState(241);
    initBelief(r2);
    setDraft(presetCurves('later'));
    const L0 = lockForecast(0);
    quietTo(r2, 40);
    r2.capability.labs.halcyon.rungCertified[2] = 64;
    const o2 = scoreOutstandingQuarter(r2);
    assert.ok(o2.rungs.every(r => r.o === 0) && close(o2.delta, [2, 3, 4].reduce((a, R) => a + logScoreDelta(L0.pairs[R].pP, L0.pairs[R].pM, 0), 0)));
});

// Race-era events move the sim through a decaying overlay; a permanent delta on
// that stream would walk the params to their clamps over a run.
test('the impulse overlay halves on its half-life and leaves no permanent drift', () => {
    resetEventImpulses();
    addEventImpulse({ mu: -0.10 });
    const m0 = currentEventImpulse().mu;
    for (let d = 0; d < IMPULSE_HALF_LIFE; d++) decayEventImpulses();
    assert.ok(close(currentEventImpulse().mu / m0, 0.5, 1e-9));
    const BASE = { mu: 0.06, xi: 0.40, theta: 0.04, lambda: 0.5, kappa: 2.0 };
    const sim = { ...BASE };
    let shifted = false;
    resetEventImpulses();
    for (let d = 0; d < HORIZON; d++) {
        if (d < 900 && d % 3 === 0) addEventImpulse({ mu: -0.08, xi: 0.06, theta: 0.02, lambda: 1.0 }, 1, { id: 'e' + d, day: d });
        const saved = applyEventImpulseOverlay(sim);
        if (sim.mu !== BASE.mu) shifted = true;
        for (const k of Object.keys(saved)) { const r = PARAM_RANGES[k]; if (r) assert.ok(sim[k] >= r.min - 1e-12 && sim[k] <= r.max + 1e-12, `${k} escaped its range`); }
        removeEventImpulseOverlay(sim, saved);
        assert.deepEqual(sim, BASE, `day ${d}: the overlay left a param moved`);
        decayEventImpulses();
    }
    assert.ok(shifted && eventImpulseMagnitude() < 1e-6);
    resetEventImpulses();
});

test('the almanac\'s summary on a set with known answers', () => {
    const q = (rungs) => ({ from: 0, to: 63, terminal: false, rungs });
    const s = summarizeAlmanac([
        { family: 2, player: { S: 0.5, quarters: [q([{ R: 2, o: 1, pP: 0.25, pM: 0.2, cls: 'carried' }, { R: 3, o: 0, pP: 0.02, pM: 0.02, cls: 'followed' }])] }, copier: { S: 0.25, quarters: [] } },
        { family: 6, player: { S: -0.125, quarters: [q([{ R: 2, o: 0, pP: 0.29, pM: 0.2, cls: 'carried' }, { R: 4, o: 1, pP: 0.98, pM: 0.5, cls: 'carried' }])] }, copier: { S: 0.5, quarters: [] } },
    ]);
    assert.ok(s.runs === 2 && s.S.player === 0.375 && s.S.copier === 0.75);
    assert.ok(s.reliability[2].n === 2 && close(s.reliability[2].meanP, 0.27) && s.reliability[2].freq === 0.5);
    assert.ok(s.reliability[9].n === 1 && s.reliability[9].meanP === 0.98 && s.reliability[9].freq === 1);
    assert.ok(s.reliability[0].n === 0 && s.reliability[0].meanP === null, 'a followed rung-quarter entered the reliability deciles');
    assert.ok(s.families[1].n === 1 && s.families[5].n === 1 && s.families[1].share === 0.5 && s.families[0].share === 0);
    assert.ok(Math.abs(s.families.reduce((a, f) => a + f.baseline, 0) - 1) < 1e-12);
});
