// Public state only (AGENTS.md conventions): no hidden
// capability, latent or τ reaches a price, and the public record is the data
// contract the reader is fit and evaluated on. A leak would make the market
// prescient without anything on screen looking wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceState, advanceRace, stepControlRegime, freshTransitions } from '../src/race/race-state.js';
import { stepTreaty } from '../src/race/treaty-track.js';
import {
    consensus, initConsensus, refreshBinaryQuotes, computeBinarySettlements, setBinaryQuoteSource, buildPublicView,
} from '../src/race/consensus.js';
import {
    computeMarket, initComputeMarket, refreshComputeQuotes, computeFutureSettlements, setComputePriceSource, buildComputePublicView,
} from '../src/race/compute-market.js';
import {
    belief, initBelief, stepBelief, binaryProb, beliefLaw, familyHeads, impliedTimeline, marketCurves, computeUrgency,
    binaryQuoteFromBelief, computeCurveFromBelief,
} from '../src/race/belief.js';
import { computeValuation } from '../src/race/valuation.js';
import { initRounds, stepRounds } from '../src/race/rounds.js';
import {
    createPublicRecord, stepPublicRecord, publicRecordRow, foldPublicRecordRow, createRecordFromSnapshot, recordFeatures, ruleSummary, chainReports,
} from '../src/race/public-record.js';
import { readerLaw, readerFamily } from '../src/race/reader.js';

const HORIZON = 1008;
const json = (x) => JSON.stringify(x);
const copy = (v) => Array.isArray(v) ? v.map(copy) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copy(x)])) : v;

/** Every continuous hidden field and latent queue scrambled; the discrete public
 *  records (releases, certifications, the regime, the clock) left alone. */
function corrupt(race) {
    for (const k of Object.keys(race.hidden)) if (typeof race.hidden[k] === 'number') race.hidden[k] = 0.999;
    race.hidden.takeoffSharpness = 3;
    race.evidenceLogOdds = 99;
    race.heat.transient = 0.99; race.heat.floor = 0.99;
    for (const k of Object.keys(race.safety)) race.safety[k] = 0.01;
    for (const lab of Object.values(race.capability.labs)) {
        lab.C_internal = 5.5; lab.C_released = 5.5;
        lab.compute0 = 99; lab.computeGrowth = 99; lab.talent = 99;
        if (lab.active) for (const r of [1, 2, 3, 4, 5]) lab.rungInternal[r] = 0;
    }
    race.capability.open.C = 5.5;
    race.latentIncidents.push({ id: 'FAKE', severity: 4, occurDay: race.day, insiderTip: true, detected: false, detectable: false, meanLag: 0 });
    race.latentEvidence.push({ id: 'FAKE', published: false, path: 'leaked', logLR: 5, publicDay: Infinity });
}

function init(race) {
    initConsensus(race); initComputeMarket(race, null); initBelief(race);
    setBinaryQuoteSource(binaryQuoteFromBelief); setComputePriceSource(computeCurveFromBelief);
}
function worldDay(race) { advanceRace(race); stepControlRegime(race); stepTreaty(race, {}); }
function marketsDay(race) {
    computeBinarySettlements(race); refreshBinaryQuotes(race);
    computeFutureSettlements(race, null); refreshComputeQuotes(race, null);
}
/** Everything a quote, a display, a settlement or the valuation reads today. */
function priced(race) {
    const grid = [2, 3, 4, 5].map(R => [63, 252, 504].map(k => binaryProb(R, belief.day + k)));
    const laws = [2, 3, 4, 5].map(R => { const L = beliefLaw(R); return L && [L.median, L.atom, L.density(belief.day + 30)]; });
    const h = familyHeads();
    return json({
        grid, laws, tl: impliedTimeline(), proj: marketCurves(), fam: [...h.legible, ...h.full, h.eta], u: computeUrgency(),
        rule: belief.rungs, alignment: belief.alignment, V: computeValuation(race),
        cq: consensus.quotes, cs: consensus.settled, cp: consensus.pendingCloseout, kq: computeMarket.quotes, ks: computeMarket.settled,
    });
}

test('corrupting every hidden field leaves B, both books\' quotes and settlements, and V bit-identical', () => {
    for (const seed of [9101, 9102, 9103]) for (const D of [200, 500, 880]) {
        const a = createRaceState(seed); init(a);
        for (let d = 0; d < D; d++) { worldDay(a); stepBelief(a); marketsDay(a); }
        const clean = priced(a);
        const b = createRaceState(seed); init(b);
        for (let d = 0; d < D - 1; d++) { worldDay(b); stepBelief(b); marketsDay(b); }
        worldDay(b);
        corrupt(b);
        stepBelief(b); marketsDay(b);
        assert.equal(priced(b), clean, `seed ${seed} day ${D}`);
    }
    setBinaryQuoteSource(null); setComputePriceSource(null);
    // The views the quoters read carry only public keys.
    const r = createRaceState(9000);
    initConsensus(r); initComputeMarket(r, null);
    for (let d = 0; d < 400; d++) advanceRace(r);
    assert.deepEqual(Object.keys(buildPublicView(r)).sort(),
        ['certifiedFrontierRung', 'claimedRung', 'controlRegime', 'day', 'lastReleaseDay', 'releaseCount', 'releasedFrontierRung']);
    assert.deepEqual(Object.keys(buildComputePublicView(r, null)).sort(),
        ['blockade', 'certifiedFrontierRung', 'controlRegime', 'day', 'releaseCount', 'straitTension']);
});

test('Polaris\'s round schedule and prices read only the public claims', () => {
    const rounds = (dirty) => {
        const race = createRaceState(1);
        race.day = 10; race.lastTransitions = freshTransitions(); race.lastTransitions.spawned = ['polaris'];
        Object.assign(race.capability.labs.polaris, { active: true, rungReleased: { 1: 10 } });
        race.safety.polaris = 0.70;
        initRounds(race);
        const out = [];
        for (let day = 10; day <= 850; day++) {
            race.day = day;
            if (day !== 10) race.lastTransitions = freshTransitions();
            if (day === 250) race.capability.labs.polaris.rungReleased[2] = day;
            if (day === 520) race.capability.labs.polaris.rungReleased[3] = day;
            const seen = dirty ? copy(race) : race;
            if (dirty) corrupt(seen);
            out.push(...stepRounds(seen, day >= 650 ? 0.9 : 0.7));
        }
        return out;
    };
    const clean = rounds(false);
    assert.ok(clean.length >= 4);
    assert.equal(json(rounds(true)), json(clean));
});

// The reader is fit on headless worlds and evaluated in play from the same
// record, so the record must be exactly what the public rows fold to.
test('the public record: its rows ignore hidden state, and folding them rebuilds every feature and law', () => {
    const race = createRaceState(94), rec = createPublicRecord(race);
    initBelief({ seed: race.seed, day: race.day });
    let replay = null, days = 0;
    for (let d = 0; d < HORIZON && !race.resolution; d++) {
        worldDay(race); stepBelief(race); stepPublicRecord(rec, race);
        if (!replay) replay = createRecordFromSnapshot(rec.initial);
        const row = publicRecordRow(race), before = json(row);
        const dirty = copy(race); corrupt(dirty);
        assert.equal(json(publicRecordRow(dirty)), before, `day ${race.day}: a hidden field reached the public row`);
        foldPublicRecordRow(replay, row);
        assert.equal(json(row), before, 'folding mutated its row');
        if (race.day % 63 === 0) {
            const rule = ruleSummary(belief.rungs, race.day);
            for (const R of [2, 3, 4, 5, 'family']) for (const set of R === 'family' ? ['legible', 'full'] : ['prior', 'legible', 'full']) {
                assert.equal(json(recordFeatures(replay, set, rule, R)), json(recordFeatures(rec, set, rule, R)), `day ${race.day} ${R} ${set} features`);
                const a = R === 'family' ? readerFamily(rec, set, rule) : readerLaw(rec, R, set, rule);
                const b = R === 'family' ? readerFamily(replay, set, rule) : readerLaw(replay, R, set, rule);
                assert.equal(json(b), json(a));
            }
            const was = json(rec);
            stepPublicRecord(rec, race);
            assert.equal(json(rec), was, 'a same-day replay moved the record');
            days++;
        }
    }
    assert.ok(days >= 5);
});

// Every report replays from the public rows, and hidden
// truth corrupted after publication changes nothing published by then.
test('the chain\'s reports replay from the public rows and ignore hidden truth corrupted after publication', () => {
    let reports = 0;
    for (const s of [3, 8, 21]) {
        const a = createRaceState(s), b = createRaceState(s);
        const recA = createPublicRecord(a), recB = createPublicRecord(b);
        const rows = [], asOf = new Map(), D = 300 + 7 * s;
        for (let d = 0; d < HORIZON; d++) {
            advanceRace(a); advanceRace(b);
            const row = json(publicRecordRow(a));
            if (b.day === D) {
                for (const x of b.demonstrations.list) {
                    x.truth = { reach: x.truth.reach === 'sound' ? 'overScoped' : 'sound', flawed: !x.truth.flawed, C: 99 };
                    if (x.evalDay != null) x.evalDay += 5;
                    if (x.disputeDay != null) x.disputeDay += 3; else if (x.status === 'standing') x.disputeDay = b.day + 2;
                }
                assert.equal(json(publicRecordRow(b)), row);
            }
            stepPublicRecord(recA, a); stepPublicRecord(recB, b);
            rows.push(row);
            if (a.day % 21 === 0) asOf.set(a.day, json(chainReports(recA)));
        }
        const replay = createRecordFromSnapshot(JSON.parse(json(recA.initial)));
        for (const row of rows) {
            foldPublicRecordRow(replay, JSON.parse(row));
            if (replay.day % 21 === 0) assert.equal(json(chainReports(replay)), asOf.get(replay.day), `seed ${s} day ${replay.day}`);
        }
        for (const [day, v] of asOf) assert.equal(json(chainReports(recA, day)), v, 'reports as of a day changed later');
        assert.equal(json(chainReports(recB, D)), json(chainReports(recA, D)));
        reports += chainReports(recA).filter(r => r.kind === 'demonstration').length;
    }
    assert.ok(reports > 0, 'no demonstration was published');
});
