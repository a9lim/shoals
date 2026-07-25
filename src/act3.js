/* ===================================================
   src/act3.js -- The Act III systemic layer (overhaul
   phase 7, slice 1).

   ONE public driver, smoothed, two projections (02a
   "Act III machinery (P7 ratifications)"): `x` is the
   machine parameter -- how much of the world runs at
   machine tempo -- and `d = max(0, (x - 0.5)/0.5)` is the
   presentation degradation it projects. Everything here
   reads PUBLIC state only (the released frontier rung +
   controlRegime mirrors -- exactly what `eta` and the
   event base-rate scale read): no latent capability, no
   race internals, no belief.

   Three consumers, one driver:
     1. audio -- main.js calls setMachineIntensity(x) once
        per day-complete (the band stops being a band),
     2. the manual latency ladder -- `orderLatency` + the
        deferred-fill queue (04's agency migration: the
        desk's hands get slower while precommitments stay
        the fast path),
     3. presentation degradation -- the display latches:
        chain-quote holds, VXHCN publication staleness, the
        transient candle repaint, sparkline frame skips.

   PRESENTATION PACING, NOT RACE STATE (02a): `x` lives here
   and never feeds a price, a mark, a settlement, or a
   belief. The degradation latches are DISPLAY-side by
   construction -- `unitPrice`, margin, expiry, and every
   settlement path read the true computed values (09:
   settle on truth, display the failure). The chain snapshot
   below is a COPY for exactly that reason (chain.js returns
   a shared mutable singleton; holding the reference would
   hold nothing).

   Classic / non-Dynamic: the driver is never stepped, so
   x = 0, d = 0, lag = 0, every latch passes truth through
   and no RNG is drawn -- the whole surface is dead code.

   DOM-free (a leaf apart from the regime rank + the shared
   PRNG) so tools/plumbing-test.mjs drives it headless.
   Mutable module singleton reset by `resetAct3()` from
   `_resetCore` -- mirrors price-impact.js / impulse.js.

   RATIFIED (02a): the driver SHAPE (one public driver,
   smoothed at 0.15/day, targets 0 / 0.6 / 1.0 by released
   rung with a mobilized+ bump, two projections) and the
   LADDER SHAPE (0/1/3/6 substeps, spread x1.25 / x1.5).
   FEEL NUMBERS, coordinator's at the wiring review: every
   magnitude in ACT3_TUNING marked `feel` below -- the
   degradation hold lengths, the repaint probability and
   size, the sparkline skip gate, the glitch cluster sizes.
   =================================================== */

import { REGIME_RANK } from './race/control-regime.js';
import { createRng, deriveSeed } from './race/rng.js';

// The degradation's OWN stream. Presentation randomness must never perturb the
// shared Math.random the price path and the event engine draw from -- the display
// failing is not allowed to move the market. Fixed seed: the flicker pattern is
// deterministic (harness-checkable) and, at p ~ 0.04, imperceptibly repetitive.
const _DISPLAY_SEED = deriveSeed(0x5f3a91c7, 'act3-display');
let _rng = createRng(_DISPLAY_SEED);

/** Act III magnitudes. Shape ratified (02a); every `feel` entry is the
 *  coordinator's to tune at the wiring review. */
export const ACT3_TUNING = {
    // -- Driver (ratified shape) --
    smoothing:      0.15,   // x += (target - x) * smoothing, once per trading day
    targetR4:       0.6,    // released frontier rung 4
    targetR5:       1.0,    // released frontier rung 5
    regimeBump:     0.1,    // mobilized+ adds this to the rung target (capped at 1)
    knee:           0.5,    // d = max(0, (x - knee) / (1 - knee))

    // -- Manual latency ladder (shape ratified; numbers rev-1-tunable) --
    // Matched TOP-DOWN: the first rung/regime gate the public state satisfies wins.
    ladder: [
        { rung: 5, mobilized: true,  lag: 6, spreadMult: 1.5 },    // "advisory"
        { rung: 5, mobilized: false, lag: 3, spreadMult: 1.25 },
        { rung: 4, mobilized: false, lag: 1, spreadMult: 1 },
    ],

    // -- Presentation degradation (feel) --
    chainHoldMax:   6,      // feel: chain quotes hold floor(d * chainHoldMax) substeps
    vxhcnGate:      0.5,    // VXHCN publication goes stale past this d
    vxhcnHoldMin:   2,      // feel: substeps held at the gate
    vxhcnHoldMax:   6,      // feel: substeps held at d = 1
    repaintP:       0.04,   // p = repaintP * d per substep (one wrong frame, then correct)
    repaintSize:    0.006,  // feel: max wrong-print size as a fraction of spot
    sparkSkipGate:  0.6,    // feel: sparklines start skipping frames past this d
    sparkSkipMax:   0.75,   // feel: fraction of frames skipped at d = 1
    glitchMinMs:    15000,  // wall-clock rate limit between glitchAudio calls
    glitchCluster2: 4,      // feel: cluster size for severity 2
    glitchCluster3: 6,      // feel: cluster size for severity 3
};

// ---------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------

let _x = 0;                     // the machine parameter, [0,1]
let _substepClock = 0;          // monotone substep counter (latency + latch clock)

/** True when the state's grip has reached mobilized or beyond. Public state. */
export function isMobilizedPlus(controlRegime) {
    return (REGIME_RANK[controlRegime] ?? 0) >= REGIME_RANK.mobilized;
}

/**
 * The driver's TARGET from public state alone: 0 through R3 released, 0.6 at R4,
 * 1.0 at R5, +regimeBump (capped at 1) once the regime is mobilized or beyond.
 * The bump is additive to whatever the rung target is -- a mobilized state before
 * R4 tints the room without reaching the degradation knee (INTERPRETATION of 02a's
 * "+0.1 (capped) under mobilized+"; flagged for the coordinator). Pure.
 */
export function act3Target(frontierRung, controlRegime) {
    const rung = frontierRung || 0;
    let t = rung >= 5 ? ACT3_TUNING.targetR5 : rung >= 4 ? ACT3_TUNING.targetR4 : 0;
    if (isMobilizedPlus(controlRegime)) t += ACT3_TUNING.regimeBump;
    return Math.max(0, Math.min(1, t));
}

/**
 * Advance the driver one trading day toward its target (~three trading weeks of
 * crossfade after each step: the world changes timbre the week the model ships,
 * not the second). Called ONCE per day-complete, Dynamic modes only. Returns x.
 */
export function stepAct3Driver(frontierRung, controlRegime) {
    const target = act3Target(frontierRung, controlRegime);
    _x += (target - _x) * ACT3_TUNING.smoothing;
    if (_x < 1e-6 && target === 0) _x = 0;      // settle exactly at rest
    return _x;
}

/** The machine parameter x in [0,1] (0 in Classic, always). */
export function machineIntensity() { return _x; }

/** The degradation projection d = max(0, (x - knee)/(1 - knee)), in [0,1]. */
export function degradation() {
    const k = ACT3_TUNING.knee;
    return Math.max(0, Math.min(1, (_x - k) / (1 - k)));
}

/** Force the driver (harness / debug only -- never a gameplay route). */
export function setMachineParam(x) { _x = Math.max(0, Math.min(1, x)); }

// ---------------------------------------------------------------------------
// The substep clock -- one monotone counter for latency + the display latches
// ---------------------------------------------------------------------------

/** Advance and return the substep clock. Called once per completed substep. */
export function tickSubstepClock() { return ++_substepClock; }

/** The current substep clock (monotone across days; reset per run). */
export function substepClock() { return _substepClock; }

// ---------------------------------------------------------------------------
// Manual latency ladder (the agency migration)
// ---------------------------------------------------------------------------

/**
 * Substep lag + spread multiplier for a MANUAL desk order at the current public
 * state. R<=3 returns lag 0 / multiplier 1 -- the pre-P7 path, bit-identical by
 * construction (callers bypass the queue entirely at lag 0, and a multiplier of
 * exactly 1 is an exact no-op in the fill algebra). Resting pending orders and
 * (P7-2) standing orders never call this: precommitments are the fast path.
 * Pure.
 */
export function orderLatency(frontierRung, controlRegime) {
    const rung = frontierRung || 0;
    const mob = isMobilizedPlus(controlRegime);
    for (const step of ACT3_TUNING.ladder) {
        if (rung >= step.rung && (!step.mobilized || mob)) {
            return { lag: step.lag, spreadMult: step.spreadMult };
        }
    }
    return { lag: 0, spreadMult: 1 };
}

const _deferred = [];
let _nextTicket = 1;

/**
 * Queue a manual order for a later substep. `kind` + `payload` are opaque here --
 * main.js owns execution (act3.js stays DOM-free and portfolio-free). The fill
 * price is whatever the market is at the execution substep: that is the point.
 * Returns the queued entry (its `ticket` identifies it).
 */
export function deferOrder(kind, payload, lag, spreadMult) {
    const entry = {
        ticket: _nextTicket++,
        kind,
        payload,
        spreadMult: spreadMult || 1,
        placedClock: _substepClock,
        dueClock: _substepClock + Math.max(1, lag),
    };
    _deferred.push(entry);
    return entry;
}

/** Remove and return every deferred order due at or before the current clock. */
export function dueOrders() {
    if (_deferred.length === 0) return [];
    const due = [];
    for (let i = _deferred.length - 1; i >= 0; i--) {
        if (_deferred[i].dueClock <= _substepClock) due.unshift(..._deferred.splice(i, 1));
    }
    return due;
}

/** Number of orders still working. */
export function workingOrderCount() { return _deferred.length; }

/** Drop every working order (desk lock: terminal latch, restriction, reset). */
export function clearDeferredOrders() {
    const n = _deferred.length;
    _deferred.length = 0;
    return n;
}

// ---------------------------------------------------------------------------
// Presentation degradation -- DISPLAY latches only
// ---------------------------------------------------------------------------

let _reducedMotion = false;

/** Reduced-motion users keep the staleness (information) and lose the stutter
 *  (motion): the transient repaint and the sparkline frame-skip go quiet. */
export function setReducedMotion(on) { _reducedMotion = !!on; }
export function reducedMotion() { return _reducedMotion; }

/** Substeps the option chain holds a quote before snapping: floor(d * max). */
export function chainHoldSubsteps() {
    return Math.floor(degradation() * ACT3_TUNING.chainHoldMax);
}

// Held chain print. chain.js's price-only path returns a SHARED MUTABLE
// singleton, so the latch must copy the rendered fields (day/dte/strike +
// call/put bid/ask). Reused buffer: no steady-state allocation, mirroring
// chain.js's own pool convention.
const _chainSnap = { day: 0, dte: 0, options: [] };
let _chainSnapValid = false;
let _chainPrintClock = -1;

function _snapshotChain(priced) {
    _chainSnap.day = priced.day;
    _chainSnap.dte = priced.dte;
    const src = priced.options;
    const dst = _chainSnap.options;
    dst.length = src.length;
    for (let i = 0; i < src.length; i++) {
        let row = dst[i];
        if (!row) {
            row = dst[i] = { strike: 0, call: { bid: 0, ask: 0 }, put: { bid: 0, ask: 0 } };
        }
        row.strike = src[i].strike;
        row.call.bid = src[i].call.bid; row.call.ask = src[i].call.ask;
        row.put.bid  = src[i].put.bid;  row.put.ask  = src[i].put.ask;
    }
    _chainSnapValid = true;
    return _chainSnap;
}

/**
 * The chain DISPLAY boundary: returns the freshly priced expiry, or the held
 * print while it is still inside its hold window. The caller has already run the
 * real reprice -- only what reaches the DOM is stale. Clock-keyed, so the hold
 * counts SUBSTEPS regardless of how often the display path runs.
 */
export function publishedChain(priced, clock) {
    const hold = chainHoldSubsteps();
    if (hold <= 0 || !priced || !priced.options) {
        _chainSnapValid = false;
        return priced;
    }
    // A different expiry (or a rebuilt skeleton) always prints fresh: holding a
    // snapshot of a different expiry day would render the wrong contracts.
    const staleExpiry = _chainSnapValid && _chainSnap.day !== priced.day;
    if (!_chainSnapValid || staleExpiry || clock - _chainPrintClock >= hold) {
        _chainPrintClock = clock;
        return _snapshotChain(priced);
    }
    return _chainSnap;
}

// VXHCN publication latch: past the gate the INDEX holds its last print for
// 2..6 substeps growing with d. Spot and variance are latched together so the
// readout and the futures cells that price off the same variance state freeze
// and unfreeze as one publication.
let _pubSpot = null, _pubV = null, _pubClock = -1, _pubStale = false;

function _vxhcnHold(d) {
    const t = Math.max(0, Math.min(1, (d - ACT3_TUNING.vxhcnGate) / (1 - ACT3_TUNING.vxhcnGate)));
    return Math.round(ACT3_TUNING.vxhcnHoldMin
        + (ACT3_TUNING.vxhcnHoldMax - ACT3_TUNING.vxhcnHoldMin) * t);
}

/**
 * Advance the VXHCN publication latch. IDEMPOTENT per clock value (the display
 * path may run more than once per substep): staleness is derived from whether
 * this clock is the print clock, never from a call counter. Below the gate the
 * latch passes truth through. NEVER touches market.vxhcn -- single-writer
 * discipline holds; this is the display boundary. A publication that STALLS
 * (rising edge) counts as one degradation incident for the audio cluster.
 * Returns true while the printed index is stale.
 */
export function advanceVxhcnPublication(trueSpot, trueV, clock) {
    const d = degradation();
    if (d < ACT3_TUNING.vxhcnGate) {
        _pubSpot = null; _pubV = null; _pubClock = -1; _pubStale = false;
        return false;
    }
    if (_pubSpot == null || clock - _pubClock >= _vxhcnHold(d)) {
        _pubSpot = trueSpot; _pubV = trueV; _pubClock = clock;
    }
    const stale = _pubClock !== clock;
    if (stale && !_pubStale) noteDegradationIncident();   // rising edge only
    _pubStale = stale;
    return stale;
}

/** The PUBLISHED VXHCN spot for display (truth when the latch is passing). */
export function publishedVxhcn(trueSpot) { return _pubSpot == null ? trueSpot : _pubSpot; }

/** The PUBLISHED variance for display-only VXHCN futures cells. */
export function publishedVariance(trueV) { return _pubV == null ? trueV : _pubV; }

/** True while the published index is holding a stale print. */
export function vxhcnPublicationStale() { return _pubStale; }

/**
 * Roll the transient live-candle repaint for one substep: returns a signed
 * DISPLAY-ONLY price offset, or 0. p = repaintP * d; magnitude scales with d.
 * Draws from the display stream only -- NEVER Math.random, so the price path and
 * the event cadence are identical whether or not the terminal is failing.
 */
export function rollCandleRepaint(spot) {
    const d = degradation();
    if (d <= 0 || _reducedMotion) return 0;
    if (_rng.next() >= ACT3_TUNING.repaintP * d) return 0;
    const size = spot * ACT3_TUNING.repaintSize * d;
    return (_rng.next() < 0.5 ? -1 : 1) * size * (0.4 + 0.6 * _rng.next());
}

/** True when this frame's sparklines should be skipped (visual stutter). */
export function skipSparklineFrame() {
    const d = degradation();
    if (d <= ACT3_TUNING.sparkSkipGate || _reducedMotion) return false;
    const t = (d - ACT3_TUNING.sparkSkipGate) / (1 - ACT3_TUNING.sparkSkipGate);
    return _rng.next() < ACT3_TUNING.sparkSkipMax * t;
}

// Degradation clustering -> glitchAudio severity. Eyes and ears fail together,
// but the ears are rate-limited on the WALL clock (this is UX, not simulation --
// main.js passes Date.now()).
let _cluster = 0, _lastGlitchMs = -Infinity;

/** Record one degradation incident (a repaint, a stalled publication). */
export function noteDegradationIncident() { _cluster++; }

/**
 * Take the audio severity for the current degradation cluster, or 0 when the
 * cluster is too small or the wall-clock rate limit has not elapsed. Consumes
 * the cluster when it fires.
 */
export function takeGlitchSeverity(nowMs) {
    if (_cluster < 2) return 0;
    if (nowMs - _lastGlitchMs < ACT3_TUNING.glitchMinMs) return 0;
    const sev = _cluster >= ACT3_TUNING.glitchCluster3 ? 3
        : _cluster >= ACT3_TUNING.glitchCluster2 ? 2 : 1;
    _cluster = 0;
    _lastGlitchMs = nowMs;
    return sev;
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

/** Back to Act I: human band, instant hands, honest display. */
export function resetAct3() {
    _x = 0;
    _substepClock = 0;
    _rng = createRng(_DISPLAY_SEED);
    _deferred.length = 0;
    _nextTicket = 1;            // queue state is fully run-scoped (02a P7-1 ruling 5)
    _chainSnapValid = false;
    _chainPrintClock = -1;
    _pubSpot = null; _pubV = null; _pubClock = -1; _pubStale = false;
    _cluster = 0;
    _lastGlitchMs = -Infinity;
}
