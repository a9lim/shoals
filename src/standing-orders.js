/* ===================================================
   src/standing-orders.js -- The delegation layer
   (overhaul phase 7, slice 2).

   04's standing orders, made mechanical: MENU-AUTHORED
   precommitments, never free-form. The player arms rules
   while the world is still slow enough to think in, and Act
   III executes them -- "takeoff is felt as your own agency
   migrating into machinery you configured earlier".

   Six rules (02a "Standing orders" + "P7-2 semantics"):
     (a) severity_cut    S>=3 DETECTION -> cut gross 50%
     (b) blockade_halve  blockade ONSET -> halve HCN stock
     (c) bonds_first     margin util > 80% -> bonds liquidate
                         FIRST (a PREFERENCE the margin path
                         consumes; it never fires an action)
     (d) cert_harvest    any certification -> sell ITM long
                         binaries at the quote
     (e) tip_autosit     an insider tip is INTERCEPTED and the
                         SIT verb applies (main.js owns the
                         interception; this module owns the arm
                         state -- see tipAutoSitArmed)
     (f) delta_flatten   |HCN move vs day open| > 8% at any
                         substep -> flatten net delta to +-20

   BINDING CONVENTIONS (02a P7-2 semantics):
   1. Standing executions are MACHINERY: every trade below
      omits `spreadMult` (the exact pre-P7 fill) and NEVER
      touches the P7-1 latency queue -- precommitments are the
      fast path, which IS the mechanic (act3.js orderLatency
      is not called from here, by design).
   2. ONE fire per trigger episode: per incident id, per
      certification (lab:rung), per blockade onset, per day for
      (f). Same-tick multiples collapse to a single execution --
      two grave detections in one day are not a 75% cut.
   3. Unlock at RELEASED frontier rung >= 3 (public state, the
      same proxy eta / the base-rate scale / the arc guards
      read); rules stay EDITABLE until R5, then the armed set
      is LOCKED for the run. Arming is refused while locked;
      armed rules keep firing (the lock binds exactly when
      reneging gets tempting -- that is the design).
   4. Run-scoped state, never localStorage: `resetStandingOrders`
      from `_resetCore` clears arming, the lock and every
      episode memory. Precommitments are authored per run.
   5. Restriction / terminal are respected like every machinery
      path: a restricted book (`portfolio.restricted`) or the
      terminal freeze (`freezeStandingOrders`, called from the
      game-over latch) makes every rule a full no-op. The gate is
      checked before any rule ACTS and before any incident or
      certification episode is consumed, so a trigger the desk
      could not act on is simply missed, never deferred. The ONE
      thing that advances ahead of the gate is the blockade
      OBSERVATION (`_blockadeSeen`): the edge is tracked
      unconditionally so arming mid-blockade cannot fire on a
      closure that already happened.
   6. Parameters are FIXED in v1 -- arming is the choice.

   DOM-free (portfolio + Consensus quotes only), so
   tools/plumbing-test.mjs section M drives the whole engine
   headless. Mutable module singleton, reset by
   `resetStandingOrders()` -- mirrors act3.js / price-impact.js.
   Draws NO randomness: standing orders are deterministic
   consequences of public state, so Classic (never evaluated at
   all) stays byte-identical.
   =================================================== */

import {
    portfolio, executeMarketOrder, executeBinaryTrade, closePosition, computeNetDelta,
} from './portfolio.js';
import { getBinaryQuote } from './race/consensus.js';

/** Fixed v1 parameters. Arming is the player's only choice (02a). */
export const STANDING_TUNING = {
    unlockRung:      3,      // released frontier rung that reveals the panel
    lockRung:        5,      // released frontier rung that freezes the armed set
    severityGate:    3,      // (a) incident severity that trips the cut
    grossCutFrac:    0.5,    // (a) proportional reduction across the book
    blockadeFrac:    0.5,    // (b) proportional reduction of the HCN stock leg
    marginUtilGate:  0.80,   // (c) utilization above which bonds go first
    liquidationFirst: ['bond'],   // (c) the preference itself
    itmThreshold:    0.5,    // (d) a long binary is ITM above this quote mid
    moveGate:        0.08,   // (f) day-open displacement fraction that trips the flatten (STRICTLY greater; compared as |S - open| > open * gate, symmetric)
    deltaBand:       20,     // (f) target |net delta| after the flatten
};

/**
 * The v1 menu. `label` + `param` render verbatim in the panel (textContent —
 * literal typographic characters, no entities); nothing here is load-bearing
 * beyond the ids. `when` documents the evaluation site.
 */
export const STANDING_RULES = [
    {
        id: 'severity_cut',
        when: 'day',
        label: 'De-risk on a grave incident',
        param: 'A severity-3 incident or worse prints → every open position is cut by half.',
    },
    {
        id: 'blockade_halve',
        when: 'day',
        label: 'Blockade: halve HCN stock',
        param: 'A Taiwan blockade begins → the HCN stock leg is cut in half at the market.',
    },
    {
        id: 'bonds_first',
        when: 'margin',
        label: 'Bonds go first',
        param: 'If the desk is forced to liquidate, bonds sell before anything else touches the book.',
    },
    {
        id: 'cert_harvest',
        when: 'day',
        label: 'Harvest on certification',
        param: 'Consensus certifies a rung → every milestone long trading above even money is sold at the quote.',
    },
    {
        id: 'tip_autosit',
        when: 'intercept',
        label: 'Sit on every tip',
        param: 'Every insider call is declined on your behalf, on the record.',
    },
    {
        id: 'delta_flatten',
        when: 'substep',
        label: 'Flatten an 8% day',
        param: 'HCN moves more than 8% off the open → stock trades until net delta sits inside ±20. At most once a day.',
    },
];

const _RULE_BY_ID = {};
for (const r of STANDING_RULES) _RULE_BY_ID[r.id] = r;

/** Execution announcements — every string below is a toast. */
export const STANDING_COPY = {
    severity_cut:    'Standing order: grave incident — gross halved.',
    blockade_halve:  'Standing order: blockade — HCN stock halved.',
    cert_harvest:    'Standing order: certification — milestone longs cashed at the quote.',
    delta_flatten:   'Standing order: delta pulled back inside the band.',
    tip_autosit:     'Standing order: the tip was sat on. You are reading about it afterward.',
    refused:         ' Some legs would not trade.',
    blocked:         'A standing order fired and nothing filled — the book refused it.',
    refusedEdit:     'Standing orders are locked. The rules run as written.',
};

// ---------------------------------------------------------------------------
// State (run-scoped)
// ---------------------------------------------------------------------------

const _armed = new Set();
let _unlocked = false;          // released rung >= 3 (monotone within a run)
let _locked = false;            // released rung >= 5 -- armed set frozen
let _frozen = false;            // terminal latch: the whole engine is inert
const _firedIncidents = new Set();
const _firedCerts = new Set();
let _blockadeSeen = false;      // blockade EPISODE latch (edge detection)
let _lastFlattenDay = -1;
let _executions = 0;            // lifetime fires this run (panel / harness)

/** Back to Act I: nothing armed, nothing locked, no episode remembered. */
export function resetStandingOrders() {
    _armed.clear();
    _unlocked = false;
    _locked = false;
    _frozen = false;
    _firedIncidents.clear();
    _firedCerts.clear();
    _blockadeSeen = false;
    _lastFlattenDay = -1;
    _executions = 0;
}

/**
 * The terminal latch (P6-3 shared game-over path): the desk is closed, so the
 * delegation layer goes with it. Idempotent; cleared only by
 * `resetStandingOrders`. Arming is refused while frozen -- a precommitment after
 * the accounting has started is not a precommitment.
 */
export function freezeStandingOrders() { _frozen = true; }
export function standingOrdersFrozen() { return _frozen; }

/**
 * Sync the panel gates to the PUBLIC released frontier rung. Called once per
 * completed trading day, from `_onDayComplete`'s Dynamic-only block -- and from
 * nowhere else: preset load and reset clear the gates through
 * `resetStandingOrders` instead, which leaves a fresh run locked out until its
 * first R3 day. Unlock is sticky, and the lock LATCHES: the rung is monotone in
 * practice, but a latch makes the promise ("locked for the run") independent of
 * that.
 */
export function syncStandingOrders(releasedFrontierRung) {
    const rung = releasedFrontierRung || 0;
    if (rung >= STANDING_TUNING.unlockRung) _unlocked = true;
    if (rung >= STANDING_TUNING.lockRung) _locked = true;
    return { unlocked: _unlocked, locked: _locked };
}

export function standingOrdersUnlocked() { return _unlocked; }
export function standingOrdersLocked() { return _locked; }
export function isArmed(id) { return _armed.has(id); }
export function armedRuleIds() { return STANDING_RULES.filter(r => _armed.has(r.id)).map(r => r.id); }
export function standingExecutionCount() { return _executions; }

/**
 * Arm / disarm one rule. Refused (returns false, state untouched) before the
 * unlock, after the lock, once the terminal latch has fired, or for an unknown
 * id -- the UI reads the same predicates, so a refusal here means the panel and
 * the engine disagreed, never that the player was quietly ignored.
 */
export function setArmed(id, on) {
    if (!_RULE_BY_ID[id]) return false;
    if (!_unlocked || _locked || _frozen) return false;
    if (on) _armed.add(id); else _armed.delete(id);
    return true;
}

/** Panel view model (pure data -- ui.js renders it, nothing more). */
export function standingOrdersView() {
    return {
        unlocked: _unlocked,
        locked: _locked,
        frozen: _frozen,
        rules: STANDING_RULES.map(r => ({
            id: r.id, label: r.label, param: r.param, when: r.when, armed: _armed.has(r.id),
        })),
    };
}

/** (e) The interception gate. main.js owns the interception itself (the popup
 *  queue is its state); this is the arm check, so the rule lives with its five
 *  siblings. */
export function tipAutoSitArmed() { return _live() && _armed.has('tip_autosit'); }

/**
 * (c) The liquidation PREFERENCE: the type-priority a forced liquidation should
 * flatten in, or null for the chassis order. Consumed by the margin path
 * (main.js passes it into `liquidateAll`) -- this rule never fires an action of
 * its own, so it has no episode and no toast. `marginInfo` is a `checkMargin`
 * result; utilization is required/equity, and a triggered call is already past
 * the gate by construction.
 */
export function standingLiquidationOrder(marginInfo) {
    // NOT gated on `portfolio.restricted`: the restriction gate exists to stop the
    // engine from TRADING, and reordering an already-decided liquidation is not a
    // trade. The terminal freeze still applies -- past the latch the closeout
    // matrix owns the book, not this preference.
    if (_frozen || !_armed.has('bonds_first')) return null;
    if (!marginInfo) return null;
    const eq = marginInfo.equity;
    const util = eq > 0 ? marginInfo.required / eq : Infinity;   // no equity left => fully utilized
    if (!(util > STANDING_TUNING.marginUtilGate)) return null;
    return STANDING_TUNING.liquidationFirst;
}

// ---------------------------------------------------------------------------
// Execution primitives -- MACHINERY-INSTANT by construction
// ---------------------------------------------------------------------------
//
// Every call below omits `spreadMult`, which is an exact no-op in the fill
// algebra (portfolio.js `_fillPrice`), and none of them touches act3.js: a
// standing order fills at the trigger substep's price with the pre-P7 spread.

/** True while the engine may act at all. */
function _live() {
    return !_frozen && !portfolio.restricted && _armed.size > 0;
}

/** Flatten one position whole, through the machinery close path (binaries route
 *  to `executeBinaryTrade`; a frozen contract refuses and is reported, never
 *  force-filled -- 09). */
function _flatten(pos, ctx) {
    return closePosition(ctx.sim, pos.id, ctx.S, ctx.vol, ctx.r, ctx.day, ctx.q);
}

/** Reduce one position by `qty` units on the opposite side (netting against the
 *  existing leg on the standard key). Returns true when the reduction filled. */
function _reduce(pos, qty, ctx) {
    const side = pos.qty > 0 ? 'short' : 'long';
    if (pos.type === 'binary') {
        return executeBinaryTrade(pos.strike, side, qty) != null;
    }
    if (pos.type === 'computefuture') {
        // The compute chassis carries the key in BOTH strike and expiryDay slots.
        return executeMarketOrder(ctx.sim, 'computefuture', side, qty, ctx.S, ctx.vol, ctx.r,
            ctx.day, pos.strike, pos.strike, pos.strategyName || undefined, ctx.q) != null;
    }
    return executeMarketOrder(ctx.sim, pos.type, side, qty, ctx.S, ctx.vol, ctx.r, ctx.day,
        pos.strike ?? undefined, pos.expiryDay ?? undefined, pos.strategyName || undefined, ctx.q) != null;
}

/**
 * Proportionally reduce every open position by `frac` (a full close when the
 * rounded reduction reaches the whole leg -- a 1-lot book cannot be halved, and
 * rounding on the risk-REDUCING side is the conservative read of "cut gross").
 * `types` optionally restricts the sweep. Legs that refuse (frozen Consensus /
 * decreed compute / a margin or rulebook gate) are counted, never force-filled.
 */
function _proportionalCut(ctx, frac, types) {
    let legs = 0, units = 0, refused = 0;
    for (const pos of [...portfolio.positions]) {
        if (types && !types.includes(pos.type)) continue;
        const absQty = Math.abs(pos.qty);
        const reduce = Math.round(absQty * frac);
        if (reduce <= 0) continue;
        const ok = reduce >= absQty ? _flatten(pos, ctx) : _reduce(pos, reduce, ctx);
        if (ok) { legs++; units += Math.min(reduce, absQty); } else refused++;
    }
    return { legs, units, refused };
}

function _report(rule, res, extra) {
    if (res.legs > 0) _executions++;    // a refusal is reported, never counted as an execution
    const message = res.legs === 0
        ? STANDING_COPY.blocked                                      // nothing filled: say so, don't claim an execution
        : STANDING_COPY[rule] + (res.refused > 0 ? STANDING_COPY.refused : '');
    return {
        rule,
        legs: res.legs, units: res.units, refused: res.refused,
        message,
        ...(extra || {}),
    };
}

// ---------------------------------------------------------------------------
// Day-boundary rules: (a) severity cut, (b) blockade halve, (d) cert harvest
// ---------------------------------------------------------------------------

/**
 * Evaluate the day-boundary rules once per completed trading day.
 *
 * @param {object} ctx {
 *     sim, S, vol, r, day, q,          // the chassis trade context
 *     transitions,                     // race.lastTransitions (the P1 ledger)
 *     blockade,                        // world.ai / race-owned taiwanBlockade mirror
 * }
 * @returns {Array} one report per EXECUTED rule (already-toasted copy included).
 */
export function runDayBoundaryRules(ctx) {
    const reports = [];
    // The blockade EPISODE edge is tracked unconditionally: arming mid-blockade
    // must not fire on a blockade that opened days ago (the trigger is the onset,
    // not the state), and a lift re-arms the episode for the next closure.
    const blockadeNow = !!(ctx && ctx.blockade);
    const onset = blockadeNow && !_blockadeSeen;
    _blockadeSeen = blockadeNow;

    if (!_live()) return reports;
    const tr = ctx.transitions || null;

    // -- (a) severity >= 3 DETECTION -> cut gross 50% ------------------------
    if (_armed.has('severity_cut') && tr && tr.incidents) {
        let trip = false;
        for (const det of (tr.incidents.detected || [])) {
            if (det.severity < STANDING_TUNING.severityGate) continue;
            if (_firedIncidents.has(det.id)) continue;
            _firedIncidents.add(det.id);
            trip = true;
        }
        if (trip) {
            // ONE cut per day however many grave detections printed (convention 2).
            const res = _proportionalCut(ctx, STANDING_TUNING.grossCutFrac, null);
            if (res.legs > 0 || res.refused > 0) reports.push(_report('severity_cut', res));
        }
    }

    // -- (b) blockade ONSET -> halve the HCN stock leg ------------------------
    if (onset && _armed.has('blockade_halve')) {
        const res = _proportionalCut(ctx, STANDING_TUNING.blockadeFrac, ['stock']);
        if (res.legs > 0 || res.refused > 0) reports.push(_report('blockade_halve', res));
    }

    // -- (d) any certification -> sell ITM long binaries ---------------------
    if (_armed.has('cert_harvest') && tr) {
        let trip = false;
        for (const cert of (tr.certifications || [])) {
            const key = cert.lab + ':' + cert.rung;
            if (_firedCerts.has(key)) continue;
            _firedCerts.add(key);
            trip = true;
        }
        if (trip) {
            let legs = 0, units = 0, refused = 0;
            for (const pos of [...portfolio.positions]) {
                if (pos.type !== 'binary' || pos.qty <= 0) continue;
                const q = getBinaryQuote(pos.strike);
                // ITM for a milestone binary = the public quote is above even
                // (INTERPRETATION of 02a's "ITM long binaries"; flagged for the
                // coordinator -- the alternative read is "in profit vs entry").
                if (!q || !(q.mid > STANDING_TUNING.itmThreshold)) continue;
                if (_flatten(pos, ctx)) { legs++; units += pos.qty; } else refused++;
            }
            if (legs > 0 || refused > 0) reports.push(_report('cert_harvest', { legs, units, refused }));
        }
    }

    return reports;
}

// ---------------------------------------------------------------------------
// Substep rule: (f) delta flatten
// ---------------------------------------------------------------------------

/**
 * Evaluate the substep rules at a substep boundary. (f) trips on the day's move
 * from the OPEN (not a rolling window) and fires at most once per day: the
 * condition persists for the rest of a big day, and re-flattening every substep
 * would be exactly the machine-gunning the episode rule forbids.
 *
 * The gate compares ABSOLUTE DISPLACEMENT against `open * moveGate` rather than
 * the return `|S/open - 1|` against `moveGate`. The division form is not
 * directionally symmetric in IEEE doubles -- at open 100 it rounds S = 108 to
 * 0.08000000000000007 (fires) and S = 92 to 0.07999999999999996 (does not), so an
 * exact +8% tripped a rule specified as strictly GREATER than 8% while an exact
 * -8% did not. The multiplication form is symmetric by construction, and both
 * exact boundaries correctly do NOT fire.
 *
 * @param {object} ctx { sim, S, vol, r, day, q, dayOpen }
 */
export function runSubstepRules(ctx) {
    const reports = [];
    if (!_live() || !_armed.has('delta_flatten')) return reports;
    const open = ctx.dayOpen;
    if (!(open > 0)) return reports;
    if (ctx.day === _lastFlattenDay) return reports;
    if (!(Math.abs(ctx.S - open) > open * STANDING_TUNING.moveGate)) return reports;

    const net = computeNetDelta();
    const band = STANDING_TUNING.deltaBand;
    if (Math.abs(net) <= band) return reports;
    // Minimum stock trade that lands inside the band (ceil: the band is a
    // promise, not a target). Stock delta is 1 per unit.
    const qty = Math.ceil(Math.abs(net) - band);
    if (qty <= 0) return reports;
    _lastFlattenDay = ctx.day;      // the episode is spent whether or not the fill lands
    const pos = executeMarketOrder(ctx.sim, 'stock', net > 0 ? 'short' : 'long', qty,
        ctx.S, ctx.vol, ctx.r, ctx.day, undefined, undefined, undefined, ctx.q);
    const res = pos ? { legs: 1, units: qty, refused: 0 } : { legs: 0, units: 0, refused: 1 };
    reports.push(_report('delta_flatten', res, { netBefore: net, qty }));
    return reports;
}
