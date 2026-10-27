/* ===================================================
   src/run-replay.js -- The run, headless (02a "The run,
   headless"): the clock without a page, replay of a
   journal to an endpoint, headless runs under a policy,
   and the digest the replay gates compare. DOM-free; the
   page's resume, run-test and the fit's worlds use it.
   =================================================== */

import { DEFAULT_PRESET } from './config.js';
import {
    run, newRun, beginDay, substep, tryClose, barrier, position, runCommand, journalHeader,
} from './run.js';
import { relDay } from './run-state.js';
import { portfolio } from './portfolio.js';
import { workingOrders, substepClock } from './act3.js';
import { belief } from './race/belief.js';
import { consensus } from './race/consensus.js';
import { computeMarket } from './race/compute-market.js';
import { counts } from './counters.js';
import { factions } from './faction-standing.js';
import { getActiveTraitIds } from './traits.js';
import { getRegulationPipeline } from './regulations.js';
import { getLastLobbyDay } from './lobbying.js';

const sim = run.sim;

const _fmt = (p) => `day ${p.day} substep ${p.substeps}`;

/** One substep of the clock, as play and step take it: a day begins with its
 *  first substep (no rest point between them), and a finished day closes unless
 *  a dispatch holds it. */
export function advance() {
    if (run.gameOver) throw new Error(`the run is over (${_fmt(position())})`);
    if (!run.dayOpen) beginDay();
    if (!sim.dayComplete) substep();
    if (sim.dayComplete) tryClose();
}

/** Run the clock to `target` ({day, substeps}), never past it. Throws when the
 *  run cannot get there: it ended, it passed it, or a dispatch holds a finished
 *  day the journal never answers. */
export function advanceTo(target) {
    for (;;) {
        const p = position();
        if (p.day === target.day && p.substeps === target.substeps) return;
        if (p.day > target.day || (p.day === target.day && p.substeps > target.substeps)) {
            throw new Error(`replay passed ${_fmt(target)} (at ${_fmt(p)})`);
        }
        if (run.gameOver) throw new Error(`the run ended at ${_fmt(p)}, before ${_fmt(target)}`);
        if (run.dayOpen && sim.dayComplete && barrier()) {
            throw new Error(`a dispatch holds day ${p.day} open, before ${_fmt(target)}`);
        }
        advance();
    }
}

/** Where the run stands, as a save's endpoint: the position, its phase and the
 *  commands applied. */
export function endpoint() {
    const p = position();
    const phase = !run.dayOpen ? 'between' : sim.dayComplete ? 'held' : 'open';
    return { day: p.day, phase, substeps: p.substeps, commands: run.journal.length };
}

/**
 * Replay a journal on the run newRun just began: each command at its position, in
 * journal order, then the clock to `end` (an endpoint; omitted, the last
 * command's position). The journal records commands, never outcomes; replay
 * recomputes them, and a dispatch answer names its dispatch, so a replay that
 * diverges fails loudly rather than drifting.
 */
export function replayTo(journal, end = null) {
    const n = end ? end.commands : journal.length;
    if (n > journal.length) throw new Error(`the endpoint names ${n} commands; the journal has ${journal.length}`);
    for (let i = 0; i < n; i++) {
        const e = journal[i];
        advanceTo(e);
        runCommand(e.cmd);
    }
    if (end) advanceTo(end);
}

/** The bystander (02a "Headless policies"): the desk that takes no position. It
 *  sends no commands, starts on cash, and answers every dispatch with the choice
 *  flagged `bystander: true`; a dispatch without one is an error. */
export const BYSTANDER = Object.freeze({
    name: 'bystander',
    hand: false,
    commands: null,
    answer(event) {
        const i = (event.choices || []).findIndex(c => c.bystander);
        if (i < 0) throw new Error(`dispatch ${event.id || event.headline} names no bystander choice`);
        return i;
    },
});

/** Answer every dispatch that is up, by the policy, as commands. */
function _answerUp(policy) {
    for (let guard = 0; run.current; guard++) {
        if (guard > 10000) throw new Error('dispatches never stop coming');
        const ev = run.current;
        runCommand({ kind: 'answer', occ: ev._occ, choice: policy.answer(ev, run) });
    }
}

/**
 * A run with no page (02a "Headless policies"). `policy` supplies commands by
 * position (`commands(pos, run)` returns a list, called at every rest point: after
 * each substep and between days) and an answer per dispatch (`answer(event, run)`
 * returns a choice index). The run stops when its last edition is handed over,
 * or between days once `until` run days have closed (a Classic run never ends by
 * itself). `hand` deals the inherited desk (default: the policy's, else true).
 * Returns the run's record: its header, journal, endpoint and digest trail.
 */
export function runHeadless({ seed, preset = DEFAULT_PRESET, policy = BYSTANDER, hand, until = Infinity, digests = false } = {}) {
    if (seed == null) throw new Error('a headless run names its seed');
    keepDigests(digests);
    newRun({ preset, seed, hand: hand ?? policy.hand ?? true });
    return drive(policy, until);
}

/** Drive the run as it stands under `policy` (runHeadless's loop; a resumed run
 *  continues through it). Returns the run's record. */
export function drive(policy, until = Infinity) {
    for (;;) {
        _answerUp(policy);
        if (policy.commands) {
            for (const cmd of policy.commands(position(), run) || []) {
                runCommand(cmd);
                _answerUp(policy);
            }
        }
        if (run.gameOver && !barrier()) break;
        if (!run.dayOpen && relDay() >= until) break;
        advance();
    }
    return record();
}

/** The run's record: what a save, the fixture and shoalsJournal() carry. */
export function record() {
    return { header: journalHeader(), journal: run.journal, endpoint: endpoint(), digests: run.digests };
}

// ---------------------------------------------------------------------------
// The digest (02a "Gates": determinism)
// ---------------------------------------------------------------------------

/** Keep (or stop keeping) a digest at every close. */
export function keepDigests(on) {
    run.digesting = !!on;
    run.digestFn = on ? digest : null;
}

/**
 * The run's state at a close, hashed: the price process, the book with its
 * resting orders and deferred entries, the race, B's quotes, the forecast state
 * and its locks, the dispatch queue and pending followups, the complete wire, the
 * world state, the factions, convictions, regulations, flags, the run's latches
 * and the counters (pauses are the clock's and stay out).
 */
export function digest() {
    const e = run.engine;
    const c = counts();
    return hashValue({
        sim: {
            day: sim.day, S: sim.S, v: sim.v, r: sim.r,
            params: [sim.mu, sim.theta, sim.kappa, sim.xi, sim.rho, sim.lambda, sim.muJ, sim.sigmaJ, sim.a, sim.b, sim.sigmaR, sim.borrowSpread, sim.q, sim._k],
            bar: sim.history.last(),
        },
        book: portfolio,
        deferred: { clock: substepClock(), orders: workingOrders() },
        race: run.race,
        quotes: run.race ? {
            consensus: consensus.quotes, settled: consensus.settled, pending: consensus.pendingRows, frozen: consensus.frozen,
            compute: computeMarket.quotes, computeSettled: computeMarket.settled, computeFrozen: computeMarket.frozen,
        } : null,
        belief: run.race ? { day: belief.day, rungs: belief.rungs, alignment: belief.alignment, player: belief.player, copier: belief.copier } : null,
        dispatch: { queue: run.queue, current: run.current, seq: run.dispatchSeq, followups: e ? e._pendingFollowups : null },
        wire: e ? e.eventLog : null,
        world: e ? e.world : null,
        engine: e ? { cooldown: e._randomCooldown, minor: e._consecutiveMinor, occ: e._occ, lastFired: e._lastFired, oneShot: e._firedOneShot, pulses: e._pulses, arrival: e._substepArrival } : null,
        factions, traits: getActiveTraitIds(), regulations: getRegulationPipeline(), lastLobby: getLastLobbyDay(),
        run: {
            choices: run.playerChoices, impact: run.impactHistory, reviews: run.quarterlyReviews, lobbies: run.lobbyCount,
            gameOver: run.gameOver, lockDay: run.lastForecastLockDay, fund: run.fundLive, room: run.roomFired,
            memo: run.firmMemoFired, verdict: run.firmVerdictFired,
        },
        counts: { dispatches: c.dispatches, repeats: c.repeats, developments: c.developments },
    });
}

/**
 * A stable 64-bit hash (two FNV-1a lanes) of a value: object keys sorted,
 * numbers by their shortest round-trip text (so one ulp shows), functions
 * skipped, Sets and Maps by their sorted entries, a repeated object hashed once.
 * Returns 16 hex digits.
 */
export function hashValue(value) {
    let a = 0x811c9dc5 >>> 0, b = 0x01000193 ^ 0x9e3779b9;
    const feed = (str) => {
        for (let i = 0; i < str.length; i++) {
            const ch = str.charCodeAt(i);
            a = Math.imul(a ^ ch, 0x01000193) >>> 0;
            b = Math.imul(b ^ ch, 0x5bd1e995);
            b = (b ^ (b >>> 13)) >>> 0;
        }
    };
    const seen = new Set();
    const walk = (v) => {
        switch (typeof v) {
            case 'number': feed(Object.is(v, -0) ? '-0;' : v + ';'); return;
            case 'string': feed('"' + v + '";'); return;
            case 'boolean': feed(v ? 'T;' : 'F;'); return;
            case 'undefined': feed('u;'); return;
            case 'bigint': feed(v + 'n;'); return;
            case 'function': case 'symbol': return;
        }
        if (v === null) { feed('n;'); return; }
        if (seen.has(v)) { feed('@;'); return; }
        seen.add(v);
        if (Array.isArray(v) || ArrayBuffer.isView(v)) {
            feed('[');
            for (let i = 0; i < v.length; i++) walk(v[i]);
            feed(']');
        } else if (v instanceof Set) {
            feed('S[');
            for (const x of [...v].map(String).sort()) feed(x + ';');
            feed(']');
        } else if (v instanceof Map) {
            feed('M{');
            for (const k of [...v.keys()].sort()) { feed(String(k) + ':'); walk(v.get(k)); }
            feed('}');
        } else {
            feed('{');
            for (const k of Object.keys(v).sort()) {
                if (typeof v[k] === 'function') continue;
                feed(k + ':');
                walk(v[k]);
            }
            feed('}');
        }
    };
    walk(value);
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
