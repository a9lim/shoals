/* ===================================================
   src/race/demonstrations.js -- Demonstrations (02a
   "Demonstrations", ratified 2026-10-27): a frontier lab
   publishes what its unreleased model did, a third
   disclosure mode beside a release and a leak.

   Halcyon and Polaris demonstrate; Tianxia ships nearly
   everything and the open ecosystem holds nothing back.
   A demonstration bears on k = the lab's released rung
   + 1, never R5. Its truth (sound, over-scoped, flawed)
   is read from C_int at publication and kept on the
   hidden list, which nothing public reads. Each
   publication, scope dispute, evaluation and withdrawal
   goes out as a public row on `tr.demonstrations`, for
   the bridge and the record.

   Draws ONLY from streams.demonstrations and moves no
   capability, heat, S, schedule or hazard, so the race
   core is bit-identical with it on or off (race-mc).
   Runs inside advanceRace after the day's releases and
   certifications. Pure / DOM-free.
   =================================================== */

import { polarisRoundDays } from './rounds.js';

// 02a "Demonstrations". Mutable for headless sweeps (the levers are lambda0,
// then the evaluation lag).
export const DEMO_TUNING = {
    lambda0: 1 / 60,      // hazard per lab per trading day
    phi: 0.5,             // weight of the over-scoped band
    band: 0.15,           // over-scoped: k - 0.15 <= C_int < k
    pFlawed: 0.15,        // a lemma fails, independent of reach
    pCite: 0.5,           // cites the lab's latest standing demonstration
    pDisputeWeak: 0.6,    // scope dispute if over-scoped or flawed
    pDisputeSound: 0.2,   // rivals and critics contest sound work too
    disputeMean: 10,      // Exp(10) trading days after publication
    evalMin: 20,          // independent evaluation U(20, 60) days after
    evalMax: 60,
    fundingWindow: 42,    // Polaris, the days before a scheduled round
    fundingF: 2.5,
    fundingPhi: 1.0,
};

/** The labs that demonstrate, in draw order. */
export const DEMO_LABS = Object.freeze(['halcyon', 'polaris']);
const TOP_RUNG = 4;        // R5's internal crossing resolves the world
// Live play ends at day 1008 (resolution.js HORIZON; not imported, to keep this
// module out of the resolution import cycle). A tick that starts there or later
// is the timeout's headless extrapolation, which the record never sees.
const LIVE_HORIZON = 1008;

/** Statuses a demonstration report can hold (02a "The chain's reports"). */
export const DEMO_STATUS = Object.freeze(['standing', 'disputed', 'upheld', 'narrowed', 'withdrawn']);

/** Fresh per-run hidden state. */
export function freshDemonstrationState() {
    return {
        list: [],              // every demonstration, in publication order (hidden truth on each)
        nextId: 1,             // one sequence for every report id
        polarisSpawnDay: null,
        polarisRounds: null,   // Polaris's nominal round days (rounds.js)
        closed: false,         // set when the world resolves: pending work is cancelled
    };
}

/** A lab's released (claimed) rung: the public rung map, as buildPublicView reads it. */
function claimedRung(lab) {
    for (let r = 5; r >= 1; r--) if (lab.rungReleased[r] != null) return r;
    return 0;
}

/** Polaris is in a funding window when a nominal round falls in the next 42 days. */
function inFundingWindow(state, day) {
    if (!state.polarisRounds) return false;
    return state.polarisRounds.some(s => s > day && s <= day + DEMO_TUNING.fundingWindow);
}

/** Ceil a lag to whole days, at least one (the close has passed). */
const wholeDays = lag => Math.max(1, Math.ceil(lag));

function nextId(state, prefix) {
    return prefix + state.nextId++;
}

/**
 * Cancel everything pending when the world resolves (02a: every pending dispute
 * and evaluation is cancelled, and the record ends where the run did). Writes no
 * row. Idempotent. stepDemonstrations calls it itself once the race has resolved
 * or the tick is past the live horizon; the orchestrator calls it before a
 * player-terminal `resolveNow`, whose extrapolation starts inside the horizon.
 */
export function closeDemonstrations(race, day = race.day) {
    const state = race && race.demonstrations;
    if (!state || state.closed) return;
    state.closed = true;
    for (const d of state.list) {
        if (d.status === 'withdrawn') continue;
        if (d.evalDay != null && d.evalDay > day) { d.evalDay = null; d.cancelledDay = day; }
        if (d.disputeDay != null && d.disputeDay > day) { d.disputeDay = null; d.cancelledDay = day; }
    }
}

/** Withdraw a flawed demonstration due for evaluation today, and everything that
 *  cites it, transitively, whatever their own truth. Returns the public row. */
function withdraw(state, root, day) {
    const id = nextId(state, 'W');
    const took = [];
    const stack = [root.id];
    while (stack.length) {
        const parent = stack.pop();
        for (const d of state.list) {
            if (d.cites !== parent || d.status === 'withdrawn') continue;
            took.push(d);
            stack.push(d.id);
        }
    }
    took.sort((a, b) => a.seq - b.seq);
    for (const d of [root, ...took]) {
        d.status = 'withdrawn';
        d.withdrawnBy = id;
        d.root = root.id;
        d.withdrawnDay = day;
        d.evalDay = null;      // a dependent withdrawn before its evaluation is never evaluated
        d.disputeDay = null;   // a withdrawal cancels a dispute still pending
    }
    return { kind: 'withdrawal', id, on: root.id, lab: root.lab, rung: root.rung, took: took.map(d => d.id) };
}

/** Publish one demonstration of rung k by `labId` at the close of `day`. */
function publish(state, rng, labId, lab, k, day) {
    const T = DEMO_TUNING;
    const C = lab.C_internal;
    const reach = C >= k ? 'sound' : 'overScoped';
    // Draws in a fixed order, every one taken whatever the earlier ones gave.
    const flawed = rng.bernoulli(T.pFlawed);
    let latest = null;
    for (const d of state.list) if (d.lab === labId && d.status !== 'withdrawn') latest = d;
    const citeDraw = rng.bernoulli(T.pCite);
    const disputed = rng.bernoulli(reach === 'overScoped' || flawed ? T.pDisputeWeak : T.pDisputeSound);
    const disputeLag = rng.exponential(T.disputeMean);
    const evalLag = rng.uniform(T.evalMin, T.evalMax);
    const seq = state.nextId;
    const d = {
        id: nextId(state, 'D'), seq, lab: labId, rung: k, day,
        cites: latest && citeDraw ? latest.id : null,
        ordinal: state.list.filter(x => x.lab === labId).length + 1,
        // Hidden truth: what the model had at publication. Nothing public reads it.
        truth: { reach, flawed, C },
        disputeDay: disputed ? day + wholeDays(disputeLag) : null,
        evalDay: day + wholeDays(evalLag),
        status: 'standing',
        disputeId: null, evaluationId: null, withdrawnBy: null, root: null,
    };
    state.list.push(d);
    return { kind: 'publication', id: d.id, lab: labId, rung: k, cites: d.cites, ordinal: d.ordinal };
}

/** A lab holds at most one live demonstration per rung: none while an earlier
 *  one of k is unevaluated or upheld; after a narrowing or a withdrawal, again. */
function eligible(state, labId, k) {
    for (const d of state.list) {
        if (d.lab === labId && d.rung === k && (d.status === 'standing' || d.status === 'disputed' || d.status === 'upheld')) return false;
    }
    return true;
}

/**
 * One close of the demonstration chain (02a "Demonstrations", order): withdrawals
 * (cascading through citations), then evaluations, then disputes, then new
 * publications. Called by advanceRace after the day's releases and
 * certifications, with the tick's ledger (`tr`, for Polaris's spawn), the tick's
 * start `day` and its `endDay`; rows are stamped at endDay by the record. Returns
 * the public rows, in that order.
 */
export function stepDemonstrations(race, tr, day, endDay) {
    const state = race.demonstrations;
    const rows = [];
    if (race.resolution || day >= LIVE_HORIZON) { closeDemonstrations(race, day); return rows; }
    if (state.closed) return rows;
    const rng = race.streams.demonstrations;
    const T = DEMO_TUNING;

    // Polaris's nominal round schedule, from the public spawn day (rounds.js).
    if (state.polarisSpawnDay == null && (tr.spawned || []).includes('polaris')) {
        state.polarisSpawnDay = endDay;
        state.polarisRounds = polarisRoundDays(race.seed, endDay, LIVE_HORIZON);
    }

    // 1. Withdrawals: a flawed demonstration's evaluation withdraws it, with its
    //    dependents. Publication order; one taken as a dependent earlier today is
    //    never evaluated.
    for (const d of state.list) {
        if (d.evalDay === endDay && d.status !== 'withdrawn' && d.truth.flawed) rows.push(withdraw(state, d, endDay));
    }
    // 2. Evaluations, exact: an over-scoped demonstration is narrowed, a sound one upheld.
    for (const d of state.list) {
        if (d.evalDay !== endDay || d.status === 'withdrawn') continue;
        const id = nextId(state, 'E');
        const outcome = d.truth.reach === 'overScoped' ? 'narrowed' : 'upheld';
        d.status = outcome; d.evaluationId = id; d.evaluatedDay = endDay;
        d.evalDay = null;
        d.disputeDay = null;   // an evaluation cancels a dispute still pending
        rows.push({ kind: 'evaluation', id, on: d.id, lab: d.lab, rung: d.rung, outcome });
    }
    // 3. Scope disputes: opened by an event, closed by the evaluation's ruling.
    for (const d of state.list) {
        if (d.disputeDay !== endDay || d.status !== 'standing') continue;
        const id = nextId(state, 'S');
        d.status = 'disputed'; d.disputeId = id; d.disputeDay = null;
        rows.push({ kind: 'dispute', id, on: d.id, lab: d.lab, rung: d.rung });
    }
    // 4. Publications. The hazard reads C_int against k = the released rung + 1.
    for (const labId of DEMO_LABS) {
        const lab = race.capability.labs[labId];
        if (!lab.active) continue;
        const k = claimedRung(lab) + 1;
        if (k > TOP_RUNG || !eligible(state, labId, k)) continue;
        const C = lab.C_internal;
        const funding = labId === 'polaris' && inFundingWindow(state, endDay);
        const phi = funding ? T.fundingPhi : T.phi;
        const reach = C >= k ? 1 : C >= k - T.band ? phi : 0;
        if (reach === 0) continue;
        const lambda = T.lambda0 * reach * (funding ? T.fundingF : 1);
        if (rng.next() < 1 - Math.exp(-lambda)) rows.push(publish(state, rng, labId, lab, k, endDay));
    }
    return rows;
}
