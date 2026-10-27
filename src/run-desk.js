/* ===================================================
   src/run-desk.js -- The desk's trade entry points
   (02a "The run, headless"): the ticket's sends, resting
   orders, closes and unwinds, exercise, the flatten, the
   Act III latency ladder's deferred fills, and standing
   orders. DOM-free; run.js's commands call these, and
   the run's substep and close call the machinery's.
   =================================================== */

import {
    portfolio, checkPendingOrders, executeMarketOrder, closePosition, exerciseOption,
    placePendingOrder, cancelOrder, cancelAllOrders, executeBinaryTrade,
    isExpiredForTrading, reduceOnlyClose,
} from './portfolio.js';
import { market } from './market.js';
import { consensus } from './race/consensus.js';
import { computeMarket } from './race/compute-market.js';
import { deferOrder, dueOrders, clearDeferredOrders, workingOrderCount } from './act3.js';
import { runDayBoundaryRules, runSubstepRules, setArmed as setStandingArmed, STANDING_COPY } from './standing-orders.js';
import {
    run, toast, haptic, develop, recordImpact, latency, blockedByRestriction,
} from './run-state.js';

const sim = run.sim;

/** Fill resting orders against the current authoritative price. */
export function fillPendingOrders() {
    const filledOrders = checkPendingOrders(sim, sim.S, market.sigma, sim.r, sim.day, sim.q);
    for (const pos of filledOrders) {
        develop('fill');
        const side = pos.qty > 0 ? 'Bought' : 'Sold';
        toast(side + ' ' + Math.abs(pos.qty) + 'k ' + pos.type + ' @ $' + pos.fillPrice.toFixed(2));
    }
    if (filledOrders.length) run.sink.book();
}

/**
 * Execute the manual orders whose latency has elapsed (P7-1 agency migration).
 * The fill price is the price AT THIS SUBSTEP -- that is the point of the ladder.
 * Terminal / restriction state is re-checked HERE, at execution time: an order
 * placed before a freeze that lands after it is REJECTED with cash untouched --
 * including a working CLOSE, which `closePosition` itself would happily fill
 * (restriction is not one of its chokepoints), so the drop has to live here. The
 * MACHINERY's own liquidation of a restricted book is untouched: it never enters
 * this queue. A substep's fills run atomically: no command lands inside them.
 */
export function drainDeferredFills() {
    if (workingOrderCount() === 0) return;
    const due = dueOrders();
    if (due.length === 0) return;
    if (run.gameOver || portfolio.restricted) {
        toast(due.length + ' working order' + (due.length > 1 ? 's' : '') + ' cancelled — the book is closed.', 4000);
        return;
    }
    for (const entry of due) _executeDeferred(entry);
    run.sink.book();
}

/**
 * Close one position at market -- the PLAYER's row button. Shared by the immediate
 * path and the deferred executor so the ladder can never change what a close
 * DOES, only when it prints. `spreadMult` omitted = the pre-P7 fill exactly.
 */
function _closePositionAction(id, spreadMult) {
    const ok = closePosition(sim, id, sim.S, market.sigma, sim.r, sim.day, sim.q, spreadMult);
    if (ok) toast('Position closed.');
    run.sink.book();
    return ok;
}

/** Unwind every leg of a named strategy -- the PLAYER's unwind button. Shared by
 *  the immediate path and the deferred executor (one unit, one execution substep). */
function _unwindStrategyAction(name, spreadMult) {
    const positions = portfolio.positions.filter(p => p.strategyName === name);
    let closed = 0;
    for (const pos of [...positions]) {
        if (closePosition(sim, pos.id, sim.S, market.sigma, sim.r, sim.day, sim.q, spreadMult)) closed++;
    }
    if (closed > 0) {
        toast('Unwound "' + name + '" (' + closed + ' position' + (closed > 1 ? 's' : '') + ').');
        run.sink.book();
    }
    return closed;
}

/** Execute one deferred manual order at the current substep's prices. Every toast
 *  below is final (coordinator, P7-1 copy pass) -- the fill
 *  reports reuse the immediate path's wording so nothing reads as a new mechanic
 *  the player was not told about. */
function _executeDeferred(entry) {
    const p = entry.payload;
    const mult = entry.spreadMult;
    if (entry.kind === 'market') {
        // Two distinct failures, reported as two (P7-1 fix round, finding 6). The
        // CONTRACT can expire inside the latency window -- an order placed while
        // tomorrow's expiry was still listed, landing after the rollover -- which is
        // nothing like a rejected fill. Checked here, before the call; the
        // `isExpiredForTrading` reject inside executeMarketOrder is the backstop.
        if (isExpiredForTrading(p.type, p.expiryDay, sim.day)) {
            toast('Working order outlived its contract — dropped, nothing filled.', 2500);
            haptic('error');
            return;
        }
        const pos = executeMarketOrder(
            sim, p.type, p.side, p.qty, sim.S, market.sigma, sim.r, sim.day,
            p.strike, p.expiryDay, undefined, sim.q, mult
        );
        if (pos) {
            develop('fill');
            const label = p.side === 'short' ? 'Shorted' : 'Bought';
            toast(label + ' ' + p.qty + 'k ' + p.type + ' at $' + pos.fillPrice.toFixed(2), 3000);
            haptic('success');
            if (p.type === 'stock') recordImpact(sim.day, p.side === 'long' ? 1 : -1, p.qty, 'Stock trade');
        } else {
            // Margin, a short-sale ban that landed inside the window, any other
            // chokepoint: the order died at the fill and does not name a cause it
            // cannot know.
            toast('Order died at the fill — margin or the rulebook moved inside the window.', 2500);
            haptic('error');
        }
    } else if (entry.kind === 'compute') {
        const pos = executeMarketOrder(
            sim, 'computefuture', p.side, p.qty, sim.S, market.sigma, sim.r, sim.day,
            p.key, p.key, undefined, sim.q, mult
        );
        if (pos) {
            develop('fill');
            toast((p.side === 'long' ? 'Bought' : 'Sold') + ' ' + p.qty + 'k Compute Q@' + p.key, 2500);
            haptic('success');
        } else {
            toast('Compute order rejected at the fill — margin or book frozen.', 4000);
            haptic('error');
        }
    } else if (entry.kind === 'binary') {
        const pos = executeBinaryTrade(p.key, p.side, p.qty, mult);
        if (pos) {
            develop('fill');
            toast((p.side === 'long' ? 'Bought' : 'Sold') + ' ' + p.qty + 'k Yes', 2500);
            haptic('success');
        } else {
            toast('Binary order rejected at the fill — cash or contract closed.', 4000);
            haptic('error');
        }
    } else if (entry.kind === 'strategy') {
        if (executeWithRollback(p.legs, p.name, p.mult, mult)) develop('fill');
    } else if (entry.kind === 'close') {
        // The position may have expired / settled / been flattened by machinery
        // while the close was working -- report it, never fabricate a fill.
        if (!_closePositionAction(p.id, mult)) {
            toast('Working close expired — the position closed without you.', 4000);
        } else develop('fill');
    } else if (entry.kind === 'unwind') {
        if (_unwindStrategyAction(p.name, mult) === 0) {
            toast('Working unwind expired — no legs left in "' + p.name + '".', 4000);
        } else develop('fill');
    } else if (entry.kind === 'reduce') {
        // A flatten leg that waited closes what its position still holds, or nothing.
        const res = _reduceLeg(p, mult);
        if (res.status === 'filled') {
            develop('fill');
            toast('Closed ' + (Math.round(res.qty * 100) / 100) + 'k ' + p.desc + '.', 3000);
            haptic('success');
        } else if (res.status === 'reversed') {
            toast('Working close skipped — ' + p.desc + ' changed sides inside the window.', 4000);
        } else if (res.status === 'gone') {
            toast('Working close expired — the position closed without you.', 4000);
        } else {
            toast('Order died at the fill — margin or the rulebook moved inside the window.', 2500);
            haptic('error');
        }
    }
}

/** One flatten leg at the desk (02a "The flatten"): reduce-only, capped at what
 *  its position still holds, skipped when the position reversed sign. Shared by
 *  the immediate path and the deferred executor; an HCN leg records its impact
 *  like any ticket's stock leg. */
function _reduceLeg(p, spreadMult) {
    const res = reduceOnlyClose(sim, p.posId, p.side, p.qty, sim.S, market.sigma, sim.r, sim.day, sim.q, spreadMult);
    if (res.status === 'filled' && res.type === 'stock') recordImpact(sim.day, p.side === 'long' ? 1 : -1, res.qty, 'Stock trade');
    return res;
}

/**
 * Route a manual desk action through the latency ladder: immediate at lag 0 (the
 * pre-P7 path, bit-identical), otherwise queued for `lag` substeps with the
 * ladder's spread multiplier applied at the fill. Returns true when the action
 * was deferred (the caller should not also execute it).
 */
function _deferManual(kind, payload) {
    const { lag, spreadMult } = latency();
    if (lag <= 0) return false;
    deferOrder(kind, payload, lag, spreadMult);
    // Two registers (coordinator): the ordinary ladder is a queue you are no
    // longer at the front of; the advisory tier (mobilized+) is a queue you are
    // no longer certain to be IN.
    if (lag >= 6) {
        toast('Routed for review — ' + lag + ' ticks, if nothing outranks it.', 2500);
    } else {
        toast('Routed — ' + lag + ' tick' + (lag > 1 ? 's' : '') + ' to the front of the queue.', 2500);
    }
    haptic('medium');
    return true;
}

/** Execute a resolved multi-leg strategy atomically. `spreadMult` is the P7-1
 *  latency-ladder widening applied to every leg's fill (1 / omitted = none): the
 *  strategy defers as ONE unit, so all legs fill at the SAME execution substep or
 *  the whole thing rolls back.
 *
 *  Returns false when the bundle was DROPPED before any leg touched the book.
 */
export function executeWithRollback(resolvedLegs, strategyName, execMult, spreadMult) {
    if (resolvedLegs.some(l => l.type === 'privatestake')) {
        toast('Private stakes cannot be traded in a strategy.', 2500);
        return false;
    }
    // BUNDLE PREFLIGHT (P7-1 fix round). A per-leg reject inside the fill loop below
    // cannot keep a bundle atomic: by the time leg 2 is refused, leg 1 has already
    // run `_fillPrice` and recorded price impact, and the rollback restores cash,
    // positions and counters but NOT the impact pools -- cumulative traded volume is
    // append-only, so a stock-first strategy (covered call, protective put) would
    // leak a permanent stock-pool footprint while reporting "all legs unwound". The
    // expiry check therefore runs over EVERY leg first, before anything can move.
    // The chain never resolves a leg to an expiry at or before today (resolveLegs ->
    // _resolveExpiry draws from ExpiryManager, which drops every expiry <=
    // currentDay), so this is reachable only through the P7-1 latency window.
    if (resolvedLegs.some(l => isExpiredForTrading(l.type, l.expiryDay, sim.day))) {
        toast('Strategy outlived one of its contracts — dropped, nothing filled.', 2500);
        haptic('error');
        return false;
    }
    const savedCash = portfolio.cash;
    const savedPositions = portfolio.positions.map(p => ({ ...p }));
    const savedClosedBorrowCost = portfolio.closedBorrowCost;
    const savedMarginDebitCost = portfolio.marginDebitCost;
    const savedTotalDividends = portfolio.totalDividends;
    const savedTotalTrades = portfolio.totalTrades;

    const results = [];
    let failed = false;
    for (const leg of resolvedLegs) {
        const side = leg.qty < 0 ? 'short' : 'long';
        const absQty = Math.abs(leg.qty);
        const pos = executeMarketOrder(
            sim, leg.type, side, absQty, sim.S, market.sigma, sim.r, sim.day,
            leg.strike, leg.expiryDay, strategyName, sim.q, spreadMult
        );
        if (pos) {
            if (!pos.strategyBaseQty) pos.strategyBaseQty = leg._baseQty || absQty;
            pos._fillCost = pos.fillPrice * absQty * (side === 'long' ? 1 : -1);
            results.push(pos);
        } else {
            failed = true;
            break;
        }
    }

    if (failed) {
        portfolio.cash = savedCash;
        portfolio.closedBorrowCost = savedClosedBorrowCost;
        portfolio.marginDebitCost = savedMarginDebitCost;
        portfolio.totalDividends = savedTotalDividends;
        portfolio.totalTrades = savedTotalTrades;
        portfolio.positions.length = 0;
        for (const p of savedPositions) portfolio.positions.push(p);
        toast('Strategy failed (leg ' + (results.length + 1) + ' rejected) \u2014 all legs unwound.');
        haptic('error');
    } else if (results.length > 0) {
        const netDebit = results.reduce((sum, r) => sum + r._fillCost, 0);
        const mult = execMult || 1;
        const perUnit = Math.abs(netDebit / mult);
        const verb = netDebit > 0 ? 'at' : 'for credit';
        const name = strategyName + 's';
        toast('Executed ' + mult + 'k ' + name + ' ' + verb + ' $' + perUnit.toFixed(2));
        haptic('success');
    }
    run.sink.book();
    return !failed;
}

/**
 * Send the flatten: cancel the resting orders and every working manual entry,
 * which could otherwise reopen the book, then trade leg by leg through the
 * ladder like any ticket, each leg reduce-only. The toast reports what filled,
 * what is working and what found nothing left to close.
 */
function _sendFlatten(legs) {
    const cancelled = cancelAllOrders() + clearDeferredOrders();
    let ok = 0, deferred = 0;
    const skipped = [], failed = [];
    for (const L of legs) {
        const p = { posId: L.posId, side: L.side, qty: L.qty, desc: L.desc };
        if (_deferManual('reduce', p)) { deferred++; continue; }
        const res = _reduceLeg(p);
        if (res.status === 'filled') ok++;
        else if (res.status === 'rejected') failed.push(L.desc);
        else skipped.push(L.desc);
    }
    const parts = [];
    if (cancelled) parts.push(`${cancelled} order${cancelled > 1 ? 's' : ''} cancelled`);
    if (ok) parts.push(legs.length === 1 ? 'filled' : `${ok} leg${ok > 1 ? 's' : ''} filled`);
    if (deferred) parts.push(`${deferred} working`);
    if (skipped.length) parts.push(`nothing left to close: ${skipped.join(', ')}`);
    if (failed.length) parts.push(`rejected (margin, or the contract closed): ${failed.join(', ')}`);
    const msg = parts.join('; ') || 'Nothing traded';
    toast(msg.charAt(0).toUpperCase() + msg.slice(1) + '.', failed.length ? 5000 : 3000);
    haptic(failed.length ? 'error' : 'success');
    run.sink.book();
}

/**
 * Send a ticket (ticket.js resolves the order: contracts, quantities, the
 * strategy's name, a flatten's reduce-only bindings, the order type). A named
 * strategy goes as one unit: every leg or none, through the latency ladder as a
 * 'strategy', or resting as a strategy limit or stop. Otherwise each leg goes
 * alone: a single leg may rest as a limit or stop; market legs go as manual
 * orders (the ladder and spread apply, as to any click), binaries through
 * executeBinaryTrade, compute through the compute chokepoint. The toast reports
 * what filled.
 */
export function sendTicket(order) {
    if (blockedByRestriction()) return;
    if (order.kind === 'flatten') { _sendFlatten(order.legs); return; }
    if (order.kind === 'strategy') {
        const mult = order.size;
        const scaled = order.legs.map(l => ({ ...l, _baseQty: Math.abs(l.qty), qty: l.qty * mult }));
        if (order.order === 'market') {
            // P7-1: the whole strategy defers as one unit (all legs at the execution
            // substep, or rollback) -- legs never straddle the latency window.
            if (!_deferManual('strategy', { legs: scaled, name: order.name, mult })) executeWithRollback(scaled, order.name, mult);
        } else {
            placePendingOrder(null, null, null, order.order, order.trigger, null, null, order.name, scaled, mult);
            toast(`Resting ${order.order} for ${mult}k ${order.name}, when HCN ${order.order === 'limit' ? '≤' : '≥'} ${order.trigger}.`);
            haptic('medium');
        }
        run.sink.book();
        return;
    }
    if (order.order !== 'market' && order.legs.length === 1) {
        const L = order.legs[0];
        placePendingOrder(L.type, L.side, L.qty, order.order, order.trigger, L.strike, L.expiryDay);
        const below = (order.order === 'limit') === (L.side === 'long');
        toast(`Resting ${order.order}: ${L.side} ${L.qty}k ${L.desc}, when HCN ${below ? '≤' : '≥'} ${order.trigger}.`);
        haptic('medium');
        run.sink.book();
        return;
    }
    let ok = 0, deferred = 0;
    const failed = [];
    for (const L of order.legs) {
        let res = null;
        if (L.type === 'binary') {
            if (!run.race || !consensus.active) { failed.push(L.desc); continue; }
            if (_deferManual('binary', { key: L.key, side: L.side, qty: L.qty })) { deferred++; continue; }
            res = executeBinaryTrade(L.key, L.side, L.qty);
        } else if (L.type === 'computefuture') {
            if (!run.race || !computeMarket.active) { failed.push(L.desc); continue; }
            if (_deferManual('compute', { key: L.key, side: L.side, qty: L.qty })) { deferred++; continue; }
            res = executeMarketOrder(sim, 'computefuture', L.side, L.qty, sim.S, market.sigma, sim.r, sim.day, L.key, L.key, undefined, sim.q);
        } else {
            if (_deferManual('market', { type: L.type, side: L.side, qty: L.qty, strike: L.strike, expiryDay: L.expiryDay })) { deferred++; continue; }
            res = executeMarketOrder(sim, L.type, L.side, L.qty, sim.S, market.sigma, sim.r, sim.day, L.strike, L.expiryDay, undefined, sim.q);
            if (res && L.type === 'stock') recordImpact(sim.day, L.side === 'long' ? 1 : -1, L.qty, 'Stock trade');
        }
        if (res) ok++; else failed.push(L.desc);
    }
    const parts = [];
    if (ok) parts.push(order.legs.length === 1 ? 'Filled' : `${ok} leg${ok > 1 ? 's' : ''} filled`);
    if (deferred) parts.push(`${deferred} working`);
    if (failed.length) parts.push(`rejected (margin, or the contract closed): ${failed.join(', ')}`);
    toast((parts.join('; ') || 'Nothing traded') + '.', failed.length ? 5000 : 3000);
    haptic(failed.length ? 'error' : 'success');
    run.sink.book();
}

/** Close a position (the book's row). P7-1 ladder (02a "Act III"): a PLAYER exit
 *  takes the same lag as an entry -- exits are not faster than entries in a
 *  market made of machines. Machinery-initiated closes (expiry, margin trims,
 *  popup trades, terminal liquidation) never route through here. */
export function closeByHand(id) {
    if (_deferManual('close', { id })) { run.sink.book(); return; }
    _closePositionAction(id);
}

/** Unwind a named strategy (the book's group). The strategy-unwind button is a
 *  player exit too, and it defers as ONE unit (all legs at the execution substep)
 *  exactly like the strategy ENTRY does. */
export function unwindByHand(name) {
    if (_deferManual('unwind', { name })) { run.sink.book(); return; }
    _unwindStrategyAction(name);
}

/** Exercise an option early. */
export function exerciseByHand(id) {
    // Capture qty before exercise removes the position
    const pos = portfolio.positions.find(p => p.id === id);
    const qty = pos ? pos.qty : 0;
    const isCall = pos && pos.type === 'call';
    const result = exerciseOption(id, sim.S, sim.day, market.sigma, sim.r, sim.q);
    if (result && qty > 0) recordImpact(sim.day, isCall ? 1 : -1, qty, 'Option exercise');
    toast(result ? 'Option exercised.' : 'Cannot exercise.');
    run.sink.book();
}

/** Cancel a resting order. */
export function cancelByHand(id) {
    cancelOrder(id);
    toast('Order cancelled.');
    run.sink.book();
}

/** The chassis trade context every standing-order execution fills against. No
 *  `spreadMult` and no act3 queue anywhere below: standing executions are
 *  MACHINERY -- zero ladder lag, the pre-P7 fill, at the trigger substep's price
 *  (02a: precommitments are the fast path, and that IS the mechanic). */
function _standingCtx() {
    return { sim, S: sim.S, vol: market.sigma, r: sim.r, day: sim.day, q: sim.q };
}

/** Announce a batch of standing-order executions (every one of them toasts) and
 *  run the same post-trade refresh a machinery trade does. */
function _reportStanding(reports) {
    if (!reports || reports.length === 0) return;
    for (const rep of reports) {
        toast(rep.message, 4500);
        if (rep.legs > 0) develop('standing');   // a refusal traded nothing
    }
    haptic('medium');
    run.sink.book();
}

/** Day-boundary standing orders (rules a / b / d). Dynamic modes only, and never
 *  after the terminal latch. Evaluated once the day's race ledger, settlements
 *  and quote refresh are final: (a) sees today's detections, (d) sees the
 *  certified world at live quotes. Reads the PUBLIC blockade mirror. */
export function runStandingDayRules() {
    if (!run.race || !run.engine || run.gameOver) return;
    _reportStanding(runDayBoundaryRules({
        ..._standingCtx(),
        transitions: run.race.lastTransitions,
        blockade: !!run.engine.world.geopolitical.taiwanBlockade,
    }));
}

/** Substep standing orders (rule f). Runs at the substep boundary AFTER the
 *  deferred manual fills have landed, so the delta it flattens is the true
 *  post-fill book. The move is measured against the day's OPEN. */
export function runStandingSubstepRules() {
    if (!run.race || !run.engine || run.gameOver) return;
    _reportStanding(runSubstepRules({
        ..._standingCtx(),
        dayOpen: sim._partial ? sim._partial.open : sim.S,
    }));
}


/** Arm or disarm one standing rule. `setArmed` refuses before the unlock, after
 *  the R5 lock and past the terminal freeze; the shell re-renders the panel
 *  either way, so it always shows the engine's real state, never the click's. */
export function setStanding(id, on) {
    const applied = setStandingArmed(id, on);
    if (!applied) toast(STANDING_COPY.refusedEdit, 3000);
    run.sink.standing();
    haptic('light');
}
