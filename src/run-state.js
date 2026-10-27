/* ===================================================
   src/run-state.js -- The run's state and the sink it
   reports through (02a "The run, headless").

   One run exists at a time in a page or a process: `run`
   holds that run's own state (the engines, the latches,
   the dispatch queue, the journal), and the module
   singletons it drives (the portfolio, belief, the
   markets, ...) are re-initialized by run.js's resetRun.
   DOM-free: the shell (main.js) hears what happened
   through `run.sink`; a headless run leaves it empty.
   =================================================== */

import { Simulation } from './simulation.js';
import { ExpiryManager } from './chain.js';
import { DEFAULT_PRESET } from './config.js';
import { portfolio, portfolioValue } from './portfolio.js';
import { market, syncMarket } from './market.js';
import { computeVXHCNSpot } from './pricing.js';
import { countDevelopment } from './counters.js';
import { orderLatency } from './act3.js';

/**
 * What the run tells the shell. Every method is optional; a headless run's sink
 * is all no-ops. Display only: nothing the sink does may change run state.
 *   toast(msg, ms)          a toast; haptic(pattern)
 *   develop(kind)           an actionable development (the skip's latch)
 *   worthReading(cause)     something worth reading ('quarter')
 *   book()                  the book changed (holdings, cash, orders)
 *   wire()                  the wire changed
 *   world()                 world state, factions or sim params changed by events
 *   fired(fired, lane)      the day's (or the lane's) fired items: toasts, stingers, interjections
 *   deskItem(headline)      a desk item went on the wire (a toast off the front page)
 *   dispatch(event)         a dispatch is up, awaiting an answer
 *   epilogue(pages, record) the last edition (the almanac's record, or null)
 *   gameOver()              the terminal latch closed the desk
 *   notice()                an obligation's notice: the desk pauses
 *   extra()                 an extra edition
 *   raceDay()               the race page's public record for the closed day
 *   marketsClose(lead)      the markets' daily snapshot (lead: the day's headline head, or null)
 *   closed(margin)          the close's display tail (the tape, the sparkline, the book)
 *   skipClose()             the close is done: the skip's stop
 *   afterClose()            after every close, whatever path ended it (the shell saves)
 *   substep()               a substep ran (presentation degradation)
 *   machine(x)              the Act III register; ambient(mood); silence()
 *   standing()              standing orders' view changed
 *   commanded(cmd, pos)     a command was applied (the shell saves between days)
 *   newRun()                a new run replaced the old one
 */
export const SINK_METHODS = [
    'toast', 'haptic', 'develop', 'worthReading', 'book', 'wire', 'world', 'fired', 'deskItem',
    'dispatch', 'epilogue', 'gameOver', 'notice', 'extra', 'raceDay', 'marketsClose', 'closed',
    'skipClose', 'afterClose',
    'substep', 'machine', 'ambient', 'silence', 'standing', 'commanded', 'newRun',
];
const _noop = () => {};
export const NULL_SINK = Object.freeze(Object.fromEntries(SINK_METHODS.map(k => [k, _noop])));

export const run = {
    seed: 0,                 // the run seed: the race's in Dynamic, drawn by randomSeed() at a new run
    preset: DEFAULT_PRESET,
    hand: true,              // the run began on the inherited desk (the bystander's does not)
    origin: 0,               // the sim day of Edition 1 (day 0 of the run)
    sim: new Simulation(),
    expiryMgr: new ExpiryManager(),
    engine: null,            // EventEngine (null in Classic)
    race: null,              // the hidden race (null in Classic)
    dayOpen: false,          // between beginDay() and finalizeDay()
    gameOver: false,         // P6-3 DURABLE terminal latch; cleared only by a new run
    pendingEpilogue: null,   // P6-3: the last edition, shown once the resolution-day beat drains
    almanacRecord: null,     // built at game over, handed to the shell with the last edition
    queue: [],               // dispatches waiting their turn
    current: null,           // the dispatch awaiting an answer (the barrier reads this, never the DOM)
    dispatchSeq: 0,          // occurrence ids for dispatches, in queue order
    playerChoices: {},
    impactHistory: [],
    quarterlyReviews: [],
    lobbyCount: 0,
    savedOverlays: {},
    savedImpulse: {},        // event-impulse overlay saved originals (restored at the close)
    lastForecastLockDay: -1, // race-day of the last lock-day block (avoids double-firing)
    fundLive: false,         // P7-3 fund-as-actor latch (monotone; mirrored to world.ai.fundLive)
    roomFired: false,        // P7-3: the room is a once-per-run branch point
    firmMemoFired: false,
    firmVerdictFired: false,
    journal: [],             // every command, with its position (run.js runCommand)
    digests: [],             // per-close digests, when `digesting`
    digesting: false,
    digestFn: null,          // run-replay.js's digest, installed when a trail is kept
    trace: null,             // the close's order trace (run-test), or null
    sink: NULL_SINK,
};

/** Install the shell's sink (null: a headless run's, all no-ops). */
export function setSink(s) {
    run.sink = s ? { ...NULL_SINK, ...s } : NULL_SINK;
}

export const toast = (msg, ms) => run.sink.toast(msg, ms);
export const haptic = (pattern) => run.sink.haptic(pattern);

/** A step of the close, for the order gate. */
export function mark(label) {
    if (run.trace) run.trace.push(label);
}

export function syncAll() {
    syncMarket(run.sim);
    market.vxhcn = computeVXHCNSpot(run.sim.v, run.sim.kappa, run.sim.theta, run.sim.xi);
}

/** Canonical equity: includes reserved short collateral (_reservedMargin).
 *  Omitting it under-counts equity for collateralized shorts (binary shorts
 *  sequester the whole notional), which can spuriously trip rogue-trading /
 *  review thresholds -- so always go through portfolioValue. */
export function portfolioEquity() {
    const s = run.sim;
    return portfolioValue(s.S, market.sigma, s.r, s.day, s.q);
}

/**
 * An actionable development the player did not make by hand (02a "Pacing"): a
 * resting order filling, a standing order trading, the player's own deferred
 * order completing under the ladder, exercise or assignment at expiry, a held
 * contract settling, a forced sale, a margin liquidation, or an obligation's
 * notice. Every site counts it (counters.js) and the shell's skip latches it.
 */
export function develop(kind) {
    countDevelopment(kind);
    run.sink.develop(kind);
}

export function recordImpact(day, direction, magnitude, context) {
    if (Math.abs(magnitude) < 0.5) return;
    const h = run.impactHistory;
    h.push({ day, direction, magnitude, context });
    if (h.length > 15) {
        h.sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude));
        h.length = 15;
    }
}

/** The run-relative day of the edition being traded (day 0 is Edition 1). */
export function relDay() { return run.sim.day - run.origin; }

/** The PUBLIC released frontier rung (world.ai mirror; 0 outside Dynamic modes).
 *  The same public act proxy `eta`, the base-rate scale, and the arc guards read
 *  -- never latent capability. */
export function frontierRung() {
    return run.engine ? (run.engine.world.ai.frontierRung || 0) : 0;
}
/** The PUBLIC controlRegime (world.ai mirror; 'private' outside Dynamic modes). */
export function regime() {
    return run.engine ? (run.engine.world.ai.controlRegime || 'private') : 'private';
}
/** Substep lag + spread multiplier for a MANUAL desk order right now. */
export function latency() {
    return run.race ? orderLatency(frontierRung(), regime()) : { lag: 0, spreadMult: 1 };
}
/** True while the substep event lane is open (Dynamic and released R4+). */
export function laneLive() {
    return !!(run.engine && run.engine.substepLaneLive());
}

/** The order-entry admission: the desk is closed, or the account is restricted. */
export function blockedByRestriction() {
    if (run.gameOver) {
        toast('The desk is closed. What remains is the accounting.', 3500);
        haptic('error');
        return true;
    }
    if (!portfolio.restricted) return false;
    toast('Account restricted — trading disabled until frozen positions clear.', 3500);
    haptic('error');
    return true;
}
