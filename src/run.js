/* =====================================================
   src/run.js -- A run's transitions (02a "The run,
   headless"): opening a day, a substep, the close (the
   race block in its documented order), the dispatch
   queue as a state machine, the terminal path, a new run
   and the commands. DOM-free: main.js keeps rendering,
   wiring, the clock (play, step, the skip) and the
   dispatch's display, and hears what happened through
   the run's sink (run-state.js). A headless run
   (run-replay.js) drives the same functions with no sink.
   ===================================================== */

import { QUARTERLY_CYCLE, HISTORY_CAPACITY, ROGUE_TRADING_THRESHOLD, BOND_FACE_VALUE, TIP_REAL_PROBABILITY, RULES_VERSION } from './config.js';
import { fmtDollar, fmtSigned, fmtBook } from './format-helpers.js';
import {
    portfolio, resetPortfolio, processExpiry,
    chargeBorrowInterest, processDividends, checkMargin,
    executeMarketOrder, closePosition, liquidateAll, cancelAllOrders,
    computeNetDelta, computeGrossNotional, portfolioValue,
    settleComputeFutures, applyBinarySettlementRows, applyCloseoutRows,
    allocatePrivateStake, allocatePrimaryStock,
    settleObligation, payObligationsAtCloseout,
} from './portfolio.js';
import { dealOpeningHand, resetOpening, dealtFixture } from './opening.js';
import { resetCounts, countDispatch, countChoice } from './counters.js';
import { buildAlmanacRecord } from './almanac.js';
import { EventEngine, eventBaseRateScale, SUBSTEP_LANE_RUNG } from './events.js';
import { checkEndings, generateEnding, determineOverlay, isTerminalSafeBeat } from './endings.js';
import { computePositionPnl } from './position-value.js';
import { market } from './market.js';
import {
    resetImpactState, decayImpactVolumes, modeledStockADV, rehedgeMM,
    updateParamShifts, decayParamShifts, applyParamOverlays, removeParamOverlays,
    selectImpactToast, getStockImpact,
} from './price-impact.js';
import { applyStructuredEffects } from './world-state.js';
import { pickTip, resetUsedTips } from './events/tips.js';
import { getEventById } from './events/index.js';
import {
    factions, resetFactions, getFaction, onQuarterlyReview, applyComplianceChoice,
    shiftFaction, settleRegulatory, cooperateRegulatory,
} from './faction-standing.js';
import { evaluateTraits, getTrait, resetTraits, getActiveTraitIds, hasTrait } from './traits.js';
import { tickRegulations, getActiveRegulations, getRegulation, getRegulationEffect, resetRegulations } from './regulations.js';
import { stepAct3Driver, resetAct3, tickSubstepClock, clearDeferredOrders } from './act3.js';
import {
    resetStandingOrders, freezeStandingOrders, syncStandingOrders,
    standingLiquidationOrder, tipAutoSitArmed, STANDING_COPY,
} from './standing-orders.js';
import { getAvailableActions, executeLobbyAction, resetLobbying, getLastLobbyDay } from './lobbying.js';
import { createRaceState, advanceRace, stepControlRegime, roomTrigger } from './race/race-state.js';
import { keyedRng } from './race/rng.js';
import { initIntel, deactivateIntel } from './race/intel.js';
import {
    ROOM_EVENT_ID, ROOM_FLAGS, ROOM_GATE, ROOM_FLAG_CRITERIA,
    roomVoice, roomInvited, roomChoices, roomPresentation, resetRoomRotation,
} from './events/room.js';
import { runRaceBridge, resetRaceBridge } from './events/race-bridge.js';
import { roundDispatch } from './events/rounds.js';
import { applyReportingRegime, forceLeakDetection } from './race/incidents.js';
import { straitTension } from './race/strait.js';
import { stepTreaty } from './race/treaty-track.js';
import { checkResolution, resolveNow, HORIZON } from './race/resolution.js';
import {
    consensus, initConsensus, deactivateConsensus,
    refreshBinaryQuotes, computeBinarySettlements, setBinaryQuoteSource,
    buildPublicView, openDispute, ruleDispute, finalizeConsensusTerminal,
} from './race/consensus.js';
import {
    computeMarket, initComputeMarket, deactivateComputeMarket,
    refreshComputeQuotes, computeFutureSettlements, stepNationalizationRef, setComputePriceSource,
    finalizeComputeTerminal,
} from './race/compute-market.js';
import { closeoutBook } from './race/closeout.js';
import { initValuation, stepValuation, lastValuation, resetValuation } from './race/valuation.js';
import {
    ROUNDS_TUNING, initRounds, resetRounds, stepRounds, lastPolarisRound,
    roundAllocation, halcyonOfferPrice, recordPrimaryAllocation, primaryInputs,
} from './race/rounds.js';
import {
    belief, initBelief, deactivateBelief, stepBelief, binaryProb,
    binaryQuoteFromBelief, computeCurveFromBelief,
    isLockDay, snapshotForecast, scoreQuarter, scoreCopierQuarter, scoreOutstandingQuarter, scoreCopierOutstanding,
    forecastRecord, copierRecord,
    playerPilled, stepFirmBelief, scrutinyGap, hasStatedForecast, credibility,
    canSendMemos, canActAsFund, firmBelief, foldPlayerLeak, setDraftState,
} from './race/belief.js';
import {
    decayEventImpulses, applyEventImpulseOverlay, removeEventImpulseOverlay, resetEventImpulses,
} from './race/impulse.js';
import { stepCoupling, couplingAttribution, resetCoupling, deactivateCoupling } from './race/coupling.js';
import { resetLedger, deactivateLedger, applyRaceEffects, appendLedger, ledgerTotals, raceChannelsLive } from './race/ledger.js';
import {
    run, toast, haptic, mark, syncAll, portfolioEquity, develop, relDay, frontierRung, regime, laneLive,
} from './run-state.js';
import {
    fillPendingOrders, drainDeferredFills, runStandingDayRules, runStandingSubstepRules,
    sendTicket, closeByHand, unwindByHand, exerciseByHand, cancelByHand, setStanding,
} from './run-desk.js';

export { run, setSink } from './run-state.js';

const sim = run.sim;


/** The closed day's public level and primary-market announcements. The only
 *  caller is after the bridge and before the markets' snapshot in _onDayComplete. */
function _stepRaceMarkets(capexWaves) {
    if (!run.race || run.race.resolution || run.gameOver) return;
    if (run.dayOpen) throw new Error('Race-market gaps require a closed trading day');
    const { ratio } = stepValuation(run.race);
    sim.S *= ratio * Math.pow(ROUNDS_TUNING.halcyonDilution, capexWaves);
    syncAll();
    // Resting orders see the gap at the price it publishes, not after the next
    // substep has moved it again (a stop the gap jumped fills at the gap).
    fillPendingOrders();
    for (let i = 0; i < capexWaves; i++) {
        _queuePopup({ category: 'rounds', _roundOffer: {
            kind: 'halcyon', id: `halcyon_followon_${run.race.day}_${i}`, day: run.race.day,
            price: halcyonOfferPrice(sim.S),
        } });
    }
    // Pi is the R5 contract's quote: B's probability of R5 by day 1000 (02a rounds).
    const pi = binaryProb(5, 1000);
    for (const round of stepRounds(run.race, pi)) _queuePopup({ category: 'rounds', _roundOffer: round });
}
/** Install / restore the belief-backed Consensus + compute quote sources (P4).
 *  The swapped-in quoters read the `belief` singleton (public-derived) + the
 *  public view -- integrity holds by construction. */
function _wireBeliefQuoters() {
    setBinaryQuoteSource(binaryQuoteFromBelief);
    setComputePriceSource(computeCurveFromBelief);
}
function _unwireBeliefQuoters() {
    setBinaryQuoteSource(null);    // restore the placeholder quoter
    setComputePriceSource(null);
}
/** Mirror the race-owned strait + controlRegime state into world-state (phase 5a)
 *  so the compute market sees the Taiwan blockade and event `when` guards can read
 *  the regime / reporting regime. race-state.js stays the sole AUTHORITY; this is a
 *  one-way read-only mirror. No-op outside Dynamic mode. */
function _syncRaceToWorld() {
    if (!run.race || !run.engine) return;
    const w = run.engine.world;
    w.geopolitical.taiwanBlockade = run.race.taiwanBlockade;   // Taiwan strait (compute market reads this)
    w.ai.controlRegime = run.race.controlRegime;
    w.ai.reportingRegime = run.race.incidentReporting;
    // Released frontier rung -- the public act proxy arc `when` guards key on
    // (same public quantity eta and the base-rate scale read; latent C never mirrored).
    w.ai.frontierRung = buildPublicView(run.race).releasedFrontierRung;
    // Summit-window flag (P6): the declared seam the treaty_window event is gated
    // on. Mirrors the race-side gauntlet's open window -- race-state.js stays the
    // sole authority, this is the read-only mirror (same pattern as frontierRung).
    w.ai.summitLive = run.race.treaty.summitOpen;
    // Fund-as-actor latch (P7-3): belief.js's OWN gate predicate (credibility >
    // 0.65 AND F > 60), evaluated through `canActAsFund` and never re-derived from
    // raw credibility/F anywhere else. MONOTONE: once the desk has been a
    // fund-scale actor, Treasury's interest does not evaporate on a credibility
    // wobble -- so the treasury_backchannel beat cannot be raced by a one-quarter
    // dip. Mirrored read-only for event guards, like every other w.ai mirror.
    if (!run.fundLive && canActAsFund(firmBelief(run.race))) run.fundLive = true;
    w.ai.fundLive = run.fundLive;
}
/** Public strait tension in [0,1] from world-state China proxies (phase 5a),
 *  fed to the strait generator so gray-zone / blockade hazard reads the same
 *  public tension the compute curve does. 0 outside Dynamic mode. */
function _straitTension() {
    return run.engine ? straitTension(run.engine.world.geopolitical) : 0;
}
/** Public export-control stage 0..3 (world.ai.exportControlStage, moved by policy
 *  events), fed to the race as the Tianxia compute dampener -- the straitTension
 *  precedent: an ORCHESTRATOR-PASSED input, never a race-side read of world state.
 *  0 outside Dynamic mode, which is the undamped baseline. */
function _exportControlStage() {
    return run.engine ? (run.engine.world.ai.exportControlStage || 0) : 0;
}
/** Player net PERSISTENT HCN positioning for the P6-2 cost-of-capital coupling,
 *  signed and normalized to [-1, +1] (long +, short -). Blends the two sources the
 *  brief names: the STANDING net book (delta-dollar exposure to HCN over equity --
 *  the position the player is financing) and the impact-overlay cumulative FLOW
 *  (getStockImpact: the signed price displacement the player's sustained order flow
 *  has left, a persistent-pressure confirmation that decays on its own clock). The
 *  coupling EMA (halflife ~50d) then filters for sustained conviction, so a scalp
 *  that nets flat leaves neither a lasting book nor a lasting overlay. Weights are a
 *  live-feel choice (un-gated: headless MC never passes positioning, and the
 *  constraint-2 harness reasons about the coupling CAP, not this formula). */
function _hcnPositioning() {
    const eq = Math.max(1, portfolioEquity());
    const bookPos = (computeNetDelta() * sim.S) / eq;                       // standing exposure / equity
    const flow = getStockImpact(market.sigma) / Math.max(1e-9, sim.S);      // overlay displacement as a fraction of spot
    const flowPos = Math.max(-0.3, Math.min(0.3, flow * 8));               // bounded footprint confirmation
    return Math.max(-1, Math.min(1, bookPos + flowPos));
}
/** Exogenous controlRegime-ratchet signals (lobbying / election) for
 *  stepControlRegime. Built from player lobbying flags the content rounds set;
 *  absent flags are simply falsy, so the endogenous ratchet carries phase 5a. */
function _exoSignals() {
    return {
        evalsPush: !!run.playerChoices.lobbied_evals_regime,
        supervisionPush: !!run.playerChoices.lobbied_supervision,
        mobilizationPush: !!run.playerChoices.lobbied_mobilization,
        nationalizationPush: !!run.playerChoices.lobbied_nationalization,
        classificationPush: !!run.playerChoices.lobbied_classification,
    };
}
/** Apply a batch of Consensus settlement rows through the ONE shared consequence
 *  helper (cash, exactly-once) and layer the narrative on top (settled toasts,
 *  dispute-resolution shells, R5 pending-closeout notices). Used identically by the
 *  daily settlement pass, the outbox drain, and the dispute ruling hook -- so no
 *  milestone double-pays. */
function _applyBinaryRows(rows) {
    if (!rows || rows.length === 0) return [];
    const { fresh, cashResults } = applyBinarySettlementRows(rows);   // cash, exactly-once
    for (const r of cashResults) {
        develop('settlement');
        toast('Consensus: ' + r.label + ' settled ' + r.outcome + ' — P&L ' + fmtDollar(r.pnl), 4500);
    }
    for (const r of fresh) {
        if (r.dispute === 'ruled') _fireRaceShell('dispute_ruled');
        else if (r.dispute === 'expired') _fireRaceShell('dispute_fallback');
        if (r.outcome === 'PENDING_CLOSEOUT'
            && portfolio.positions.some(p => p.type === 'binary' && p.strike === r.key)) {
            toast('Consensus: ' + r.label + ' reached — held for terminal closeout.', 4500);
        }
    }
    return cashResults;   // per-position binary P&L (for the terminal scorecard)
}
/** Fire a race/policy shell event by id as a toast (phase 5a: dispute lifecycle
 *  narrative). Non-popup shells toast their headline; popup shells queue. */
function _fireRaceShell(id) {
    if (!run.engine) return;
    const base = getEventById(id);
    if (!base) return;
    const r = run.engine._fireEvent({ ...base }, sim, sim.day, 0, 0);
    if (r && r.queued) _queuePopup(r.event);
    else if (r && r.headline) toast(r.headline, 5000);
}
function _clampRate() {
    const ceil = getRegulationEffect('rateCeiling', null);
    const flr  = getRegulationEffect('rateFloor', null);
    if (ceil !== null && sim.r > ceil) sim.r = ceil;
    if (flr  !== null && sim.r < flr)  sim.r = flr;
}
/** Run one substep + impact decay + market sync + MM rehedge + order check, then
 *  the Act III substep boundary (P7-1): deferred manual fills, the substep event
 *  lane, and -- while the lane is live -- a popup-queue drain. All three are inert
 *  outside Dynamic modes and below released R4. */
export function substep() {
    sim.substep();
    _clampRate();
    decayImpactVolumes();
    syncAll();
    rehedgeMM(portfolio.positions);
    _onSubstepTick();
    // ---- Act III substep boundary ----
    tickSubstepClock();
    drainDeferredFills();       // manual-order latency ladder: fills due at THIS substep
    runStandingSubstepRules();  // P7-2 rule (f): the intraday precommitment, machinery-instant
    _fireSubstepArrival();      // the discretionary beat that landed intraday
    if (laneLive() && !run.gameOver) _processPopupQueue();
}

/**
 * Step the Act III driver one completed trading day and hand `x` to the audio
 * machine register. Reads the PUBLIC mirrors only. Dynamic modes only: in Classic
 * the driver is never stepped, x stays 0, and audio is never told anything.
 */
function _stepAct3() {
    const x = stepAct3Driver(frontierRung(), regime());
    run.sink.machine(x);
    // The lane opens on the same public driver (02a: at released R4 the
    // discretionary pass moves to substep granularity).
    run.engine.setSubstepLane(frontierRung() >= SUBSTEP_LANE_RUNG);
}

/**
 * Run `fn` against the TRUE BASELINE sim params when a trading day is in progress.
 * The day's Layer-3 + impulse overlays are unwound LIFO first and re-derived
 * after, so an INTRADAY event delta (substep lane, or a mid-day popup choice)
 * mutates the baseline instead of being erased by the overlay restore at day
 * close. This is the phase-4 overlay-gate rule (AGENTS: overlays are removed
 * before events mutate params) applied at a substep boundary. No-op when no day
 * is open, so every day-boundary path is unchanged.
 */
function _midDayBaseline(fn) {
    if (!run.dayOpen) return fn();
    removeEventImpulseOverlay(sim, run.savedImpulse);   // LIFO: impulse (innermost) first
    removeParamOverlays(sim, run.savedOverlays);
    run.savedImpulse = {};
    run.savedOverlays = {};
    try {
        return fn();
    } finally {
        run.savedOverlays = applyParamOverlays(sim);
        run.savedImpulse = applyEventImpulseOverlay(sim);
        syncAll();
    }
}

/** Fire the substep lane's arrival if one lands at this substep (P7-1). */
function _fireSubstepArrival() {
    if (!run.engine || run.gameOver) return;
    const idx = sim.substepsDone - 1;
    if (idx < 0) return;
    const ev = run.engine.takeSubstepArrival(sim.day, idx);
    if (!ev) return;
    const netDelta = computeNetDelta();
    const { fired, popups } = _midDayBaseline(() => {
        const r = run.engine.fireArrival(ev, sim, sim.day, netDelta);
        if (r.fired.length > 0 || r.popups.length > 0) sim.recomputeK();
        return r;
    });
    for (const p of popups) _queuePopup(p);
    run.sink.fired(fired, true);
    if (fired.length > 0 || popups.length > 0) {
        run.sink.world();
        run.sink.book();
    }
}

/**
 * Open a trading day: install the Layer-3 param overlay + the decaying event-
 * impulse overlay (nested innermost over Layer-3), then beginDay. The overlays
 * affect ONLY the day's substep integration -- the price PATH -- and are removed
 * in `_closeTradingDay` BEFORE any day-complete bookkeeping. Shared by frame() /
 * tick() / step() so the step button applies impulses too.
 */
export function beginDay() {
    run.savedOverlays = applyParamOverlays(sim);
    run.savedImpulse = applyEventImpulseOverlay(sim);
    sim.beginDay();
    run.dayOpen = true;
}

/**
 * Close a trading day: finalizeDay, then REMOVE both overlays LIFO (impulse
 * first) and re-sync the market to BASELINE params -- all BEFORE `_onDayComplete`
 * runs. This is the phase-4 gate fix: ordinary events fire inside _onDayComplete
 * and mutate sim params; if the overlay were still installed, removing it
 * afterward would restore the pre-event saved originals and ERASE the legitimate
 * event delta. With the overlay gone first, events always mutate the true
 * baseline, and a popup pausing mid-_onDayComplete can never strand an overlay.
 * Does NOT call `_onDayComplete` -- the caller runs it (tick() snaps the lerp
 * between close and _onDayComplete).
 */
function _closeTradingDay() {
    sim.finalizeDay();
    run.dayOpen = false;
    removeEventImpulseOverlay(sim, run.savedImpulse);   // LIFO: impulse (innermost) first
    removeParamOverlays(sim, run.savedOverlays);
    run.savedImpulse = {};
    run.savedOverlays = {};
    syncAll();
}

/**
 * The POPUP BARRIER (02a "Act III"): true while a decision is on screen or
 * still waiting. While it holds, `_closeTradingDay` / `_onDayComplete` may NOT run
 * on ANY path (frame / tick / step) -- the day stays open, overlays installed,
 * until the player has answered. Without it a substep-lane arrival at substep 15
 * would let the world advance race / treaty / belief / settlements underneath the
 * open decision, landing the choice's deltas and `raceEffects` one race tick late.
 *
 * Two halves, both required: the dispatch awaiting an answer (`run.current`,
 * shifted off the queue when it was shown), and an event still QUEUED waiting
 * its turn behind it. The barrier reads the run's state, never the DOM (02a "The
 * run, headless"). A pending terminal epilogue bars the close outright --
 * nothing ticks after the latch. Nothing holds a day for the forecast (02a "The
 * standing policy").
 */
export function barrier() {
    return run.queue.length > 0 || !!run.pendingEpilogue || !!run.current;
}

/**
 * Close the day if its substeps are done and nothing holds it (every clock path:
 * play, step, the skip, a headless run). A barrier still holding is drained
 * first, so a beat still queued reaches the player and the day is never
 * stranded. Returns true when the day closed.
 */
export function tryClose() {
    if (!run.dayOpen || !sim.dayComplete) return false;
    if (barrier()) _processPopupQueue();
    if (barrier()) return false;
    _closeTradingDay();
    _onDayComplete();
    _afterClose();
    return true;
}

/**
 * Close a day whose substeps finished while the barrier held, SYNCHRONOUSLY from
 * the drain (02a "Act III"): the player never presses play to collect a day
 * the world already finished. Called from the popup-dismissal callback, after its
 * own `_processPopupQueue` has had the chance to show the next queued beat.
 *
 * `run.dayOpen` is the idempotency predicate, not `sim.dayComplete`:
 * `_closeTradingDay` clears the flag BEFORE `_onDayComplete` runs, so the
 * re-entrant `_processPopupQueue()` at the tail of `_onDayComplete` -- and every
 * dismissal callback downstream of it -- finds the day already closed.
 */
function _closeCompletedDayIfPending() {
    if (run.gameOver || !run.dayOpen || !sim.dayComplete) return;
    if (barrier()) return;
    _closeTradingDay();
    _onDayComplete();
    _afterClose();
}

/**
 * Terminal partial-day ABORT (02a "Act III"). A terminal entered mid-day --
 * an intraday compliance choice, a rogue-trading latch off a substep-lane popup --
 * unwinds the day's overlays LIFO (same discipline as `_closeTradingDay`'s
 * restore), re-syncs to baseline, and marks the day closed WITHOUT running
 * `_onDayComplete`: no race advance, no settlements, no day-boundary events. The
 * world does not tick after the latch, and the closeout / epilogue never price or
 * render through a transient overlay or a half-open day.
 *
 * The sim clock is deliberately NOT advanced (`finalizeDay` would increment
 * `sim.day` and misdate every closeout mark): the day's partial bar is already in
 * history and stands as the honest record of the desk's last, unfinished day.
 */
function _abortPartialDay() {
    if (!run.dayOpen) return;
    run.dayOpen = false;
    removeEventImpulseOverlay(sim, run.savedImpulse);   // LIFO: impulse (innermost) first
    removeParamOverlays(sim, run.savedOverlays);
    run.savedImpulse = {};
    run.savedOverlays = {};
    syncAll();
}


/** Called after each individual substep — orders, margin tracking, peak/drawdown. */
function _onSubstepTick() {
    const vol = market.sigma;

    // Check pending orders at intraday price
    fillPendingOrders();

    // Track peak equity and drawdown for epilogue scorecard
    const substepMargin = checkMargin(sim.S, vol, sim.r, sim.day, sim.q);
    if (run.engine) {
        if (substepMargin.equity > portfolio.peakValue) portfolio.peakValue = substepMargin.equity;
        if (portfolio.peakValue > 0) {
            const dd = 1 - substepMargin.equity / portfolio.peakValue;
            if (dd > portfolio.maxDrawdown) portfolio.maxDrawdown = dd;
        }
    }

    // P7-1 presentation degradation (the wrong print, the glitch) is the shell's,
    // on its own display stream: it feeds no state.
    run.sink.substep();
}

/**
 * THE popup-queue chokepoint (P7-2). Every beat that could reach the player goes
 * through here, so a standing order that INTERCEPTS a decision can do it before
 * the beat is ever queued: an intercepted tip never holds a day open (the popup
 * BARRIER reads this queue -- 02a "Act III") and never flashes on screen.
 * Because interception happens at INSERTION, the barrier's state is untouched and
 * `_closeCompletedDayIfPending` keeps working exactly as before -- an interception
 * cannot leave a completed day stranded, since the queue never grew.
 *
 * @param {boolean} [front] unshift instead of push (margin calls / game-over jump
 *                          the queue -- the world's news waits behind them).
 * @returns {boolean} true when the event was actually queued.
 */
function _queuePopup(event, front) {
    if (_interceptByStandingOrder(event)) { countDispatch(_dispatchCategory(event), 'intercepted'); return false; }
    event._occ = ++run.dispatchSeq;   // the occurrence id an answer names
    if (front) run.queue.unshift(event); else run.queue.push(event);
    countDispatch(_dispatchCategory(event), 'queued');
    return true;
}

/** A dispatch's category, as the popup frame reads it. */
function _dispatchCategory(event) {
    return event.category || (event.id && event.id.startsWith('desk_') ? 'desk' : '');
}

/**
 * Standing-order interception (P7-2 rule (e), the compliance precommitment): an
 * armed auto-sit answers the insider channel for the player, unopened. The SIT
 * choice is applied through `_applyPopupChoice` -- the SAME path a manual sit
 * takes -- so its factionShifts, playerFlag, followups and resultToast land
 * exactly once and nothing has to be re-implemented here.
 *
 * The sit verb is identified by its `playerFlag`, and a tip whose sit choice
 * cannot be found is NOT intercepted (it shows normally): silently falling back
 * to a positional choice could trade on a tip the player precommitted to decline,
 * which is the one failure this rule exists to make impossible.
 *
 * The FEED REFRESH is mandatory here (sol gate P1): `_fireEvent` has already
 * written the tip into `run.engine.eventLog`, but the day-boundary path only
 * repaints the log DOM for a superevent popup or a non-popup fire -- so an
 * intercepted tip (the whole point of which is that you read about it afterward
 * instead of answering it) would sit invisible in the feed until some unrelated
 * later refresh. Repainting here keeps ruling 7's contract: the beat stays in the
 * event feed, on the day it happened.
 */
function _interceptByStandingOrder(event) {
    if (!event || run.gameOver || !run.race || !run.engine) return false;
    if (event.id !== 'insider_tip' || !tipAutoSitArmed()) return false;
    const choice = (event.choices || []).find(c => c.playerFlag === 'sat_on_insider_tip');
    if (!choice) return false;
    _applyPopupChoice(event, choice);
    toast(STANDING_COPY.tip_autosit, 5000);
    run.sink.wire();
    run.sink.world();
    return true;
}

/**
 * The dispatch queue's show step: the next queued dispatch becomes the one
 * awaiting an answer (`run.current`), and the shell shows it. Nothing shows while
 * one is up. With the queue empty, a pending last edition goes to the shell
 * (P6-3: the terminal epilogue renders ONLY after the resolution-day beat has
 * drained -- the treaty superevent showed as an event; now the desk closes over
 * the player), with the almanac's record (02a "The evening": the last edition of
 * a Dynamic run, natural resolution and ejection alike, appends it once).
 */
function _processPopupQueue() {
    if (run.current) return;
    if (run.queue.length === 0) {
        if (run.pendingEpilogue) {
            const pages = run.pendingEpilogue, record = run.almanacRecord;
            run.pendingEpilogue = null;
            run.almanacRecord = null;
            run.sink.epilogue(pages, record);
        }
        return;
    }

    const event = run.queue.shift();
    countDispatch(_dispatchCategory(event), 'shown');
    if (event._roundOffer) {
        // Allocation caps and all prose tokens are public show-time values. The
        // offer price is fixed at announcement; another dispatch may move cash.
        event._offered = roundAllocation(event._roundOffer.kind, portfolioEquity());
        Object.assign(event, roundDispatch(event._roundOffer, event._offered));
        run.engine?._logEvent(sim.day, event, {}, event.magnitude);
        run.sink.wire();
    }
    if (event.choices && event.choices.some(c => c.complianceTier)) {
        factions.equityAtLastReview = portfolioEquity();
        factions.lastReviewDay = sim.day;
    }
    run.current = event;
    run.sink.dispatch(event);
}

/**
 * The answer to the dispatch that is up (a command: 02a "The run, headless"). It
 * names the dispatch by its occurrence id, and fails loudly if another is up.
 * Then the next queued dispatch shows (this chains the resolution-day beats and,
 * when the queue empties, hands over any pending last edition; a game-over choice
 * already triggered its own drain), and a day that finished its substeps behind
 * the barrier closes HERE, synchronously (P7-1 ruling 2): the player does not
 * press play to collect a day the world already finished.
 */
function _answer(occ, index) {
    const event = run.current;
    if (!event || event._occ !== occ) {
        throw new Error(`answer to dispatch ${occ}, but ${event ? 'dispatch ' + event._occ : 'none'} is up`);
    }
    const choice = event.choices && event.choices[index];
    if (!choice) throw new Error(`dispatch ${occ} has no choice ${index}`);
    run.current = null;
    // INTERPRETATION: a repeat is counted on the player's own answers only (an
    // intercepted tip is the standing order's), keyed by event id and choice label.
    countChoice(event.id || event.headline, choice.label ?? index);
    _applyPopupChoice(event, choice);
    _processPopupQueue();
    _closeCompletedDayIfPending();
}

/**
 * Apply ONE popup choice's full declarative consequence. Extracted from the
 * `showPopupEvent` callback (P7-2) so a standing order that INTERCEPTS a decision
 * runs the identical code path a manual answer takes -- nothing double-applies,
 * nothing goes missing, and no field ever has to be re-implemented for the
 * automated route. Everything AROUND the consequence (the stinger, the music
 * duck, the queue drain, the day-close retry) stays with the caller: those are
 * about a popup having been on screen, which an intercepted beat never was.
 */
function _applyPopupChoice(event, choice) {
    if (!choice) return;
    if (choice.round) {
        if (!run.race || run.gameOver || run.race.resolution || !raceChannelsLive()
            || event._roundApplied || event._roundOffer?.id !== choice.round.id) return;
        // Popup subscriptions are instant primary allocations, never secondary
        // fills or latency-ladder orders. Every queued offer can be answered once.
        event._roundApplied = true;
        const round = event._roundOffer;
        const equity = portfolioEquity();
        const requested = event._offered * Math.max(0, Math.min(1, choice.round.take));
        const result = round.kind === 'polaris'
            ? allocatePrivateStake(round, requested, sim.day)
            : allocatePrimaryStock(round.price, requested, sim.day);
        if (requested > 0 && !result) {
            toast('Allocation rejected — insufficient cash or account restricted.', 3500);
            return;
        }
        if (result && round.kind === 'polaris' && event._offered > 0) {
            applyRaceEffects(run.race, [{ dial: 'S', lab: 'polaris', amount: ROUNDS_TUNING.polarisSafety * result.allocated / event._offered }], round.id, sim.day);
        } else if (result) {
            recordPrimaryAllocation(round.id, run.race.day, result.allocated, equity);
        }
        run.sink.book();
    }
    if (choice.deltas && run.engine) {
        // P7-1: a substep-lane popup can be answered MID-DAY, with the day's
        // overlays still installed -- apply the deltas against the true
        // baseline so the overlay restore at day close cannot erase them.
        // No-op wrapper at a day boundary (every pre-P7 path).
        _midDayBaseline(() => run.engine.applyDeltas(sim, choice.deltas));
    }
    // P6-2 treaty-channel ledger: capture treatyStage across the choice's
    // structured effects so a player-advanced treaty step is attributed to the
    // player (the advice/diplomacy line). Guarded on run.race.
    const _treatyBefore = (run.race && run.engine) ? run.engine.world.ai.treatyStage : 0;
    if (choice.effects && run.engine) {
        applyStructuredEffects(run.engine.world, choice.effects);
    }
    if (run.race && run.engine) {
        const _treatyDelta = run.engine.world.ai.treatyStage - _treatyBefore;
        if (_treatyDelta > 0) appendLedger(sim.day, 'treaty', event.id, _treatyDelta, 'treatyStage advance');
    }
    // P6-2 raceEffects chokepoint (popup-choice path): the ONE sanctioned
    // choice->race mutation route -- whitelisted dials (S per lab, heat), clamped,
    // and ledgered under the event id (applyRaceEffects tracks race.playerS for the
    // d_P decomposition). Guarded on run.race (null outside Dynamic modes).
    if (choice.raceEffects && run.race) {
        applyRaceEffects(run.race, choice.raceEffects, event.id, sim.day);
    }
    // Leak coupling (evidence machinery round): the insider channel's LEAK verb,
    // declared as `raceLeak: true` on the choice, applied at THIS chokepoint --
    // the same place raceEffects lands, behind the SAME frozen/inactive gate
    // (raceChannelsLive: inert post-terminal-latch and in Classic, where the
    // narrative followup still fires and nothing mechanical does). Two effects
    // from the popup's stamped `_tipIncidentId`:
    //   (1) detection forcing -- the leaked incident becomes detectable
    //       unconditionally on a 4d memoryless clock (RNG-free);
    //   (2) the B evidence-fold NOW, under the DETECTION's own fold id, so the
    //       real detection's later fold is a no-op. Would-detect-anyway
    //       incidents: total belief move identical leaked or unleaked (timing,
    //       not mass). Never-detectable tail: the fold is NEW mass the world
    //       would otherwise never get -- the override is the verb's point.
    if (choice.raceLeak && run.race && event._tipIncidentId && raceChannelsLive()) {
        const leaked = forceLeakDetection(run.race, event._tipIncidentId);
        if (leaked) foldPlayerLeak(leaked.id, leaked.severity ?? event.raceMeta?.severity);
    }
    if (choice.factionShifts) {
        for (const fs of choice.factionShifts) {
            let value = fs.value;
            if (fs.when?.hasTrait && hasTrait(fs.when.hasTrait)) value += (fs.bonus || 0);
            shiftFaction(fs.faction, value);
        }
    }
    if (choice.playerFlag) {
        run.playerChoices[choice.playerFlag] = sim.day;
    }
    // P7-3: EVERY room path sets `sat_in_the_room` -- the seat is the beat, not one
    // of the options, so the flag belongs to the event and not to a choice's own
    // `playerFlag` (which the say-nothing path spends on `room_declined`). Set here,
    // at choice time, so a room the terminal queue filter discarded never leaves a
    // flag claiming the player was in a meeting they never saw.
    if (event.category === 'room') run.playerChoices[ROOM_FLAGS.seat] = sim.day;
    if (choice.cashPenalty) {
        portfolio.cash -= choice.cashPenalty;
    }
    if (choice.regulatoryAction === 'settle') {
        settleRegulatory();
    } else if (choice.regulatoryAction === 'cooperate') {
        cooperateRegulatory();
    }
    // A choice's draws are keyed by the event's id and occurrence and the choice.
    const _choiceKey = [event.id || '', event._fireOcc ?? 0, (event.choices || []).indexOf(choice)];
    if (choice.followups && run.engine) {
        for (let i = 0; i < choice.followups.length; i++) {
            run.engine.scheduleFollowup(choice.followups[i], sim.day, [..._choiceKey, i]);
        }
    }
    if (choice.resultToast) {
        toast(choice.resultToast, 4000);
    }
    // -- Declarative trade execution --
    if (choice.trades) {
        const vol = market.sigma;
        const snapshot = [...portfolio.positions];
        let closed = 0;
        let pnlSum = 0;
        for (const trade of choice.trades) {
            let targets;
            if (trade.action === 'close_all') {
                // P&L captured per position BEFORE liquidation (positions vanish);
                // summed only over the ids actually removed (frozen legs excluded).
                const pnlById = new Map();
                for (const p of snapshot) pnlById.set(p.id, computePositionPnl(p, sim.S, vol, sim.r, sim.day, sim.q));
                const { stuck } = liquidateAll(sim, sim.S, vol, sim.r, sim.day, sim.q);
                const stuckIds = new Set(stuck.map(s => s.id));
                for (const p of snapshot) if (!stuckIds.has(p.id)) pnlSum += pnlById.get(p.id);
                closed = snapshot.length - stuck.length;
                if (stuck.length) toast(`${stuck.length} Consensus contract${stuck.length > 1 ? 's' : ''} frozen — could not flatten.`, 4000);
                break;
            } else if (trade.action === 'close_type') {
                targets = snapshot.filter(p => p.type === trade.type);
            } else if (trade.action === 'close_short') {
                targets = snapshot.filter(p =>
                    (p.type === 'stock' && p.qty < 0) ||
                    (p.type === 'call' && p.qty < 0) ||
                    (p.type === 'put' && p.qty > 0)
                );
            } else if (trade.action === 'close_long') {
                targets = snapshot.filter(p =>
                    (p.type === 'stock' && p.qty > 0) ||
                    (p.type === 'call' && p.qty > 0) ||
                    (p.type === 'put' && p.qty < 0)
                );
            } else if (trade.action === 'close_options') {
                targets = snapshot.filter(p => p.type === 'call' || p.type === 'put');
            } else if (trade.action === 'hedge_unlimited_risk') {
                let nuu = 0;
                for (const p of portfolio.positions) {
                    if (p.type === 'stock' || p.type === 'call') nuu += p.qty;
                }
                if (nuu < 0) {
                    const hedgeQty = Math.abs(nuu);
                    executeMarketOrder(
                        sim, 'stock', 'long', hedgeQty,
                        sim.S, vol, sim.r, sim.day,
                        undefined, undefined, undefined, sim.q
                    );
                    toast(`Hedge placed: bought ${hedgeQty} shares at market.`, 4000);
                }
                continue;
            }
            if (targets) {
                for (const p of targets) {
                    pnlSum += computePositionPnl(p, sim.S, vol, sim.r, sim.day, sim.q);
                    if (closePosition(sim, p.id, sim.S, vol, sim.r, sim.day, sim.q)) {
                        closed++;
                    }
                }
            }
        }
        if (closed > 0) {
            const sign = pnlSum >= 0 ? '+' : '';
            toast(`Closed ${closed} position${closed > 1 ? 's' : ''}. P&L: ${sign}${fmtDollar(pnlSum)}`, 4000);
            run.sink.book();
        }
    }
    // -- Compliance tier processing --
    if (choice.complianceTier) {
        applyComplianceChoice(choice.complianceTier);
        if (getFaction('firmStanding') <= 0) {
            _showComplianceTermination();
        }
    }
    // -- Insider tip scheduling --
    if (choice._tipAction && run.engine) {
        // The tip's slot: the incident it carries, or the event's id and occurrence.
        const tipRng = event._tipIncidentId != null
            ? keyedRng(run.seed, 'tips', event._tipIncidentId)
            : keyedRng(run.seed, 'tips', event.id || '', event._fireOcc ?? 0);
        const tip = pickTip(tipRng);
        const isReal = tipRng.next() < TIP_REAL_PROBABILITY;
        const eventId = isReal ? tip.realEvent : tip.fakeEvent;
        toast(`"Word is ${tip.hint}."`, 6000);
        run.engine.scheduleFollowup({ id: eventId, mtth: 14 }, sim.day, [..._choiceKey, 'tip']);
        if (isReal) {
            shiftFaction('firmStanding', -5);
        }
    }
    // Margin call actions
    if (event._marginAction) {
        const vol = market.sigma;
        const _heldBefore = portfolio.positions.length;
        // P7-2 rule (c): the standing liquidation PREFERENCE. Not an action that
        // fires -- an ordering the forced liquidation consumes (bonds first above
        // 80% utilization). null while disarmed, and the chassis order is then
        // bit-identical to the pre-P7-2 path.
        const _liqOrder = standingLiquidationOrder(checkMargin(sim.S, vol, sim.r, sim.day, sim.q));
        if (choice.playerFlag === 'margin_liquidated') {
            const closedBefore = portfolio.positions.length;
            const { stuck } = liquidateAll(sim, sim.S, vol, sim.r, sim.day, sim.q, _liqOrder);
            _applyRestriction(stuck, closedBefore);
            run.sink.book();
            // Assess lending-eligible equity once exchange legs are flat. Private
            // marks cannot repay a margin debit; frozen exchange claims restrict
            // the book rather than declaring an unsettled account insolvent.
            const eligible = checkMargin(sim.S, vol, sim.r, sim.day, sim.q).collateralEquity;
            if (stuck.every(p => p.type === 'privatestake') && eligible < 0) {
                _showGameOver('Forced liquidation left your account in deficit by '
                    + fmtDollar(Math.abs(eligible))
                    + '. Regulators have flagged the account for review.',
                    'margin_call_liquidation', 'Account liquidation');
            }
        } else if (choice.playerFlag === 'margin_partial') {
            // Close stock positions only
            const stockPos = portfolio.positions.filter(p => p.type === 'stock');
            for (const p of stockPos) {
                closePosition(sim, p.id, sim.S, vol, sim.r, sim.day, sim.q);
            }
            run.sink.book();
            // Re-check margin after partial liquidation
            const recheck = checkMargin(sim.S, vol, sim.r, sim.day, sim.q);
            if (recheck.triggered) {
                toast('Still below margin. Full liquidation required.', 4000);
                const closedBefore = portfolio.positions.length;
                const { stuck } = liquidateAll(sim, sim.S, vol, sim.r, sim.day, sim.q,
                    standingLiquidationOrder(recheck));
                _applyRestriction(stuck, closedBefore);
                run.sink.book();
                const eligible = checkMargin(sim.S, vol, sim.r, sim.day, sim.q).collateralEquity;
                if (stuck.every(p => p.type === 'privatestake') && eligible < 0) {
                    _showGameOver('Forced liquidation left your account in deficit.',
                        'margin_call_liquidation', 'Account liquidation');
                }
            }
        }
        if (portfolio.positions.length < _heldBefore) develop('liquidation');
        haptic('heavy');
    }
    // Rogue trading / margin-deficit game over: the announcement popup is the
    // BEAT; what follows is the SHARED terminal machinery (02a "Resolution"),
    // NOT a preset reset -- latch -> extrapolate -> closeout -> epilogue, with the
    // involvement split deciding the overlay like any other resignation.
    if (event._gameOverAction) {
        _triggerGameOver(event._gameOverEnding || 'forced_resignation');
    }
    // Reporting-regime lever (phase 5a): a policy choice enacts the mandatory
    // incident-reporting regime (retroactive-once). Mirror the flag into
    // world-state so guards see it, and report the disclosure wave.
    if (choice._applyReportingRegime && run.race) {
        const res = applyReportingRegime(run.race);
        _syncRaceToWorld();
        toast('Mandatory incident reporting enacted — disclosure wave: '
            + res.rescued + ' surfaced, ' + res.shortened + ' lags shortened.', 5000);
    }
    // Consensus dispute lifecycle (phase 5a): open a dispute on a contract, or
    // record an adjudicator ruling. Content-driven; the machinery + narrative
    // exist so the arcs can drive them.
    if (choice._openDispute != null && run.race) {
        const rec = openDispute(choice._openDispute, run.race.day, run.race.controlRegime);
        if (rec) { refreshBinaryQuotes(run.race); _fireRaceShell('dispute_opened'); }
    }
    if (choice._ruleDispute && run.race) {
        // A timely ruling settles SYNCHRONOUSLY (F2b) and returns the settlement
        // row (also stashed in the outbox, R3); route it through the ONE shared
        // consequence helper -- cash + narrative -- exactly like the daily pass, so
        // a ruled milestone is paid exactly once.
        const row = ruleDispute(choice._ruleDispute.key, choice._ruleDispute.outcome, run.race.day, run.race.controlRegime);
        if (row) { _applyBinaryRows([row]); refreshBinaryQuotes(run.race); }
    }
}

/** The game-over dispatch (a generated dispatch: its bystander choice is its only one). */
function _gameOverDispatch(contextText, endingId, headline) {
    return {
        category: 'gameover',
        magnitude: 'major',
        headline,
        context: contextText,
        choices: [
            {
                label: 'Accept your fate',
                desc: 'No appeal, no counter, no hedge. From here the story continues without your hands on it.',
                playerFlag: 'game_over',
                resultToast: 'Your career at Meridian Capital is over.',
                bystander: true,
            },
        ],
        _gameOverAction: true,
        _gameOverEnding: endingId,   // routed through _triggerGameOver (the shared latch)
    };
}

function _showGameOver(contextText, endingId = 'forced_resignation', headline = 'Rogue trading investigation') {
    _queuePopup(_gameOverDispatch(contextText, endingId, headline), true);
    _processPopupQueue();
}

function _showComplianceTermination() {
    run.playerChoices['compliance_terminated'] = sim.day;
    _triggerGameOver('forced_resignation');
}

// ---------------------------------------------------------------------------
// P6-3: terminal game-over -- desk locks, world resolves, book closes out,
// epilogue renders against the resolved world.
// ---------------------------------------------------------------------------

/**
 * Fire the DURABLE terminal game-over for a player-terminal state (P6-1 ruling):
 * the desk ends, the world extrapolates to a resolution (if it had not resolved
 * already), the book closes out against that resolution through the 09 matrix, and
 * the endings engine renders the epilogue. Idempotent (the run.gameOver latch guards
 * re-entry). Ledger-freeze-before-marking is guaranteed: the freeze fires inside
 * checkResolution (mid-run / timeout) or resolveNow (early ejection) BEFORE any
 * closeout cash moves.
 */
function _triggerGameOver(endingId) {
    if (run.gameOver) return;
    // 0. The band stops mid-note (P7-1 terminal latch, 02a "Act III"): immediately
    //    after the idempotency guard, BEFORE the game-over latch, the play mutation,
    //    the UI update, and the resolution-day beat. The desk goes quiet; the hum
    //    and the machines do not notice. Dynamic modes only -- Classic never enters
    //    the machine register at all.
    if (run.race) run.sink.silence();
    run.gameOver = true;
    run.sink.gameOver();   // the shell ends a skip, stops the clock, locks its controls
    // 0b. Partial-day abort (02a "Act III"): a terminal reached MID-DAY -- an
    //     intraday compliance choice, a rogue latch off a substep-lane popup --
    //     unwinds the day's overlays and closes the day WITHOUT running
    //     _onDayComplete. The world does not tick after the latch, and the closeout
    //     below never prices through a transient overlay or a half-open day.
    _abortPartialDay();
    // 1. Lock the desk: cancel pending orders AND every working (deferred) manual
    //    order, silence the delegation layer (P7-2: a precommitment cannot execute
    //    into a closed-out book, and the tip interception stops with it), restrict
    //    (the durable lock is run.gameOver).
    cancelAllOrders();
    clearDeferredOrders();
    freezeStandingOrders();
    portfolio.restricted = true;

    // TERMINAL QUEUE DISCIPLINE (02a "Resolution"): the world's resolution supersedes the day's
    // ordinary news. FILTER the popup queue -- BEFORE closeout / epilogue generation --
    // to terminal-safe beats only: today exactly category 'summit' (treaty_holds /
    // treaty_resolution, effect-free acknowledgments by construction). DISCARD every
    // ordinary queued popup, so no queued choice (cashPenalty, factionShift, trade) can
    // mutate the settled book or stale the epilogue. The retained beats are known-
    // effect-free, so the epilogue generated below stays exact by construction; later
    // terminal beats (P7's room) opt in by category, never by exemption. The predicate
    // is extracted to endings.js (isTerminalSafeBeat) so the harness gates the rule.
    for (let i = run.queue.length - 1; i >= 0; i--) {
        if (!isTerminalSafeBeat(run.queue[i])) run.queue.splice(i, 1);
    }

    // 2/3. Dynamic mode only: resolve the world (extrapolate if the desk ended first)
    //      and close the book out against it. Classic mode has no race -> no closeout.
    let resolution = null, closeout = null, overlay = 'bystander';
    if (run.race) {
        const geo = run.engine ? run.engine.world.geopolitical : null;
        const deskDay = relDay();                        // the desk's last day: the race clock may already be extrapolated
        resolution = resolveNow(run.race, geo);          // existing record, or extrapolate + latch (freezeLedger first)
        // The outstanding quarter (02a "Scoring"): the unscored lock is scored once,
        // against its original end date and the completed trajectory; the
        // reader-copier's beside it (02a "The almanac").
        scoreOutstandingQuarter(run.race);
        scoreCopierOutstanding(run.race);
        closeout = _runTerminalCloseout(resolution, geo);
        const _dP = resolution && resolution.axes ? Math.abs(resolution.axes.dP || 0) : 0;
        // Personal overlay (surface the mapping; the epilogue picks slots, not tone).
        overlay = determineOverlay(endingId, ledgerTotals(), _dP, run.firmVerdictFired);
        const fixture = dealtFixture() ? dealtFixture().id : null;
        // The record keeps both clocks: the desk's last day and its ending (natural or
        // an ejection), and the world's resolution day and cause, which an
        // extrapolation can carry past the desk.
        run.almanacRecord = buildAlmanacRecord({
            race: run.race, resolution, overlay, ending: endingId, deskDay, fixture,
            player: forecastRecord(), copier: copierRecord(),
        });
    }

    // 4. Epilogue (structure + numbers here; sentences are coordinator slots). DEFERRED
    //    behind the popup queue (02a "Resolution"): any resolution-day beat already
    //    queued -- the treaty superevent above all -- shows as an EVENT first; the
    //    epilogue renders only once the queue has drained (see _processPopupQueue).
    run.pendingEpilogue = generateEnding(endingId, {
        resolution, overlay, totals: run.race ? ledgerTotals() : {},
        closeout, sim, portfolio, playerChoices: run.playerChoices,
        eventLog: run.engine ? run.engine.eventLog : [],
        impactHistory: run.impactHistory, quarterlyReviews: run.quarterlyReviews,
    });
    _processPopupQueue();   // drain the resolution-day beat first, THEN render the epilogue
}

/**
 * Run the 09 terminal closeout for the whole book against the resolved world.
 * Consensus + compute settle through their STATEFUL idempotent finalizers (cash,
 * exactly-once); HCN stock / options / VXHCN futures / bonds settle
 * through the pure closeout matrix at IMPACT-FREE authoritative marks. Returns the
 * matrix result for the epilogue's desk page.
 */
function _runTerminalCloseout(resolution, geo) {
    // Consensus binaries: durable rows through the ONE shared consequence helper.
    // Capture the player's per-position binary P&L for the scorecard (P6-3 finding 4).
    const binary = _applyBinaryRows(finalizeConsensusTerminal(run.race));
    // Compute futures: the P3b cash path, driven by the terminal finalizer.
    const cSettle = finalizeComputeTerminal(run.race, geo);
    const compute = cSettle.length ? settleComputeFutures(cSettle, run.race) : [];
    for (let i = 0; i < compute.length; i++) develop('settlement');   // as the daily pass counts them
    // HCN stock / options / VXHCN / bonds: impact-free authoritative marks (09 -- the
    // impact overlay and the CRR tree never touch settlement). sim.S is the
    // authoritative process price; market.vxhcn is the last-valid VXHCN spot (Heston,
    // impact-free -- the formal validity-history/realized-var-fallback observation
    // record is a market-integrity seam, FLAGGED); bonds carry their last live MTM via
    // the impact-free Vasicek price (02a "Terminal closeout and overlays" -- non-doom families mark at MTM,
    // doom recovers on face inside closeout.js).
    const book = closeoutBook(portfolio.positions, resolution, run.race, {
        spot: sim.S, valuation: lastValuation(), privatePrice: lastPolarisRound()?.price,
        varianceIndex: market.vxhcn,
        bond: { rate: sim.r, a: market.a, b: market.b, sigmaR: market.sigmaR, day: sim.day, face: BOND_FACE_VALUE },
    });
    applyCloseoutRows(book.rows);   // credit cash + remove positions by id (preserves borrow accrual)
    // Every unpaid obligation is paid out of the closeout's cash, so terminal equity
    // (the scorecard's cash) is net of it (02a "The evening").
    const obligations = payObligationsAtCloseout();
    // All nine cells reach the scorecard: the matrix book + the two finalizer P&L sets.
    return { rows: book.rows, ctx: book.ctx, totalCash: book.totalCash, totalPnl: book.totalPnl, binary, compute, obligations };
}

/**
 * The belief-gap scrutiny loop (overhaul phase 4): the risk committee heats on
 * the divergence between the player's positioning and firm belief `F`. Early
 * game the player is MORE pilled than the firm (AGI books draw heat, worse when
 * the divergent book is also down); late game, once `F` wakes, the pressure
 * INVERTS (conventional books underperform an AGI-loaded benchmark). Modest,
 * bounded firmStanding pressure -- UNRATIFIED gap thresholds.
 */
/** The firm-conversion throughline (04; content round 8): the CIO deciding out
 *  loud how much crazy the evidence now licenses. Checked quarterly on lock days
 *  AFTER stepFirmBelief: the grudging memo fires once when the credibility gate
 *  opens and F has begun to wake; the conversion verdict fires once when F
 *  crosses conviction with the gate still open. Ejection is the endings phase's
 *  branch, not an event here. Latches reset with the run. */
function _checkFirmConversion() {
    if (!run.race) return;
    const F = firmBelief(run.race);
    if (!run.firmMemoFired && canSendMemos() && F >= 40) {
        run.firmMemoFired = true;
        _fireRaceShell('firm_conversion_memo');
    } else if (run.firmMemoFired && !run.firmVerdictFired && canSendMemos()) {
        // Hedging the memo doesn't stop the firm -- being right converts it
        // regardless (04) -- but it costs the attribution: the verdict needs a
        // deeper F when the CIO got the risk-managed version (75 vs 85, ruled
        // at the content gate). The firm gets there on its own arithmetic, later.
        const gate = run.playerChoices.made_the_case ? 75 : 85;
        if (F >= gate) {
            run.firmVerdictFired = true;
            _fireRaceShell('firm_conversion_verdict');
        }
    }
}
/**
 * THE ROOM (P7-3; 02a "Act III", the room) -- the endgame
 * branch point, evaluated as a day-complete LATCH on a race-side PURE predicate
 * (`roomTriggerReady`: the leader lab's internal track within 0.15 of R5). The
 * conversion-latch precedent: the orchestrator owns the latch, the model owns the
 * fact, and main.js never reads a latent LEVEL.
 *
 * Fires ONCE per run and strictly PRE-terminal (the caller guards on an unlatched
 * resolution; a run the world ends first has no room, legitimately -- in
 * Deal-bound runs the summit window WAS the room). The latch burns on the first
 * day the predicate holds whether or not the gate opens: the decision happens when
 * it happens, and the standing accumulated AT THAT MOMENT is what buys the seat.
 * Below the gate NOTHING fires -- not a toast; the ending arrives as weather, on
 * the news, which the event feed already is.
 *
 * Voice weight = the satisfied-criteria count (2..6), scaling the advice's
 * whitelisted raceEffects by voice/6 through `roomChoices` BEFORE the shell is
 * fired, so the standard `_applyPopupChoice` chokepoint (whitelist, +-0.15 clamp,
 * ledger row under this event id) is the only route the effects take.
 *
 * WHO leads comes from the SAME race-side helper as the predicate (`roomTrigger`
 * returns both, one traversal) and rides the fired meta as `leaderLab`: the two
 * rooms are different rooms, so headline AND context are selected from per-leader
 * pools (`roomPresentation`, deterministic rotation, never RNG). The choices stay
 * leader-agnostic -- the advice is the advice.
 */
function _checkRoom() {
    if (run.roomFired || !run.race || !run.engine || run.gameOver) return;
    if (run.race.resolution) return;              // strictly pre-terminal
    const trigger = roomTrigger(run.race);
    if (!trigger.ready) return;                    // the leader is not at the decision yet
    // The six criteria (02a). Criterion 1 is belief.js's OWN memo gate
    // (credibility > 0.55) -- read through canSendMemos, never re-derived here.
    const criteria = [
        canSendMemos(),
        getFaction('safetyNetworkTrust') >= ROOM_GATE.safetyNetworkTrust,
        getFaction('labRelations') >= ROOM_GATE.labRelations,
        run.firmVerdictFired,                         // the firm-conversion latch
        ROOM_FLAG_CRITERIA.advice.some(f => !!run.playerChoices[f]),
        !!run.playerChoices[ROOM_FLAG_CRITERIA.treasury],
    ];
    const voice = roomVoice(criteria);
    run.roomFired = true;                             // the branch point is spent either way
    if (!roomInvited(voice)) return;               // below the gate: no beat at all
    const base = getEventById(ROOM_EVENT_ID);
    if (!base) return;
    const show = roomPresentation(trigger.leaderLab);
    const ev = {
        ...base,
        headline: show.headline,
        context: show.context,
        choices: roomChoices(voice, !!run.engine.world.ai.summitLive),
        raceMeta: { leaderLab: trigger.leaderLab, leaderSide: show.side, voice },
    };
    const r = run.engine._fireEvent(ev, sim, sim.day, 0, computeNetDelta());
    if (r && r.queued) {
        _queuePopup(r.event);
        // The room fires AFTER the day's maybeFire/bridge display pass, so repaint
        // the feed here (the interception precedent) -- the beat is in the log the
        // day it happened, not at some later unrelated refresh.
        run.sink.wire();
    }
}

function _runScrutiny() {
    if (!run.race) return;
    // A followed R4 states nothing (02a "What follows states nothing"): no stated
    // posterior on the recursion rung, no belief gap to scrutinize this quarter.
    const pilled = playerPilled();                 // null, or the locked posterior on R4
    const gap = scrutinyGap(run.race, pilled);    // player - F, null when pilled is
    if (gap == null || Math.abs(gap) <= 20) return;   // not stated, or not divergent -> no scrutiny
    const lastRev = run.quarterlyReviews[run.quarterlyReviews.length - 1];
    const vs = lastRev ? lastRev.vsBenchmark : 0;
    // Two-sided by rule (02a "Belief, η, and the firm"): the committee grudgingly respects P&L --
    // +3 divergent & outperforming, -3 divergent & underperforming.
    const delta = vs > 0 ? 3 : vs < 0 ? -3 : 0;
    if (delta !== 0) shiftFaction('firmStanding', delta);
    const morePilled = gap > 0;   // player more pilled than the firm (early) vs less (late, F awake)
    if (morePilled) {
        toast(vs > 0
            ? 'The risk committee grumbles about your AGI-heavy book — then reads the P&L, and the grumbling stops.'
            : 'Risk committee: "Explain the AGI thesis. The book is divergent and down."', vs > 0 ? 5000 : 6000);
    } else {
        toast(vs > 0
            ? 'The desk went long the future without you — but you are beating the benchmark, and they respect it.'
            : 'The desk went long the future without you. Your conventional book is the laggard now.', vs > 0 ? 5000 : 6000);
    }
}

/** A quarter's close is one line in the Brief (02a "The standing policy"): when
 *  the quarter just scored had a carried rung, the lock day's edition carries one
 *  desk item on the wire with the quarter's increment and the record. A quarter
 *  whose every rung was followed scored exactly 0 and prints nothing. */
function _quarterCloseLine(scored) {
    if (!scored || !run.engine || !scored.rungs.some(r => r.cls === 'carried')) return;
    // INTERPRETATION: n counts every quarter scored, the followed ones (which
    // scored exactly 0) included, as forecastRecord().quarters does.
    const rec = forecastRecord();
    const headline = `The desk’s forecast closes the quarter ${fmtSigned(scored.delta, 2)} nats against Consensus; `
        + `${fmtSigned(rec.S, 2)} over ${rec.quarters} ${rec.quarters === 1 ? 'quarter' : 'quarters'} scored.`;
    run.engine._logEvent(sim.day, { headline, category: 'desk' }, {}, 'minor');
    run.sink.wire();
    run.sink.worthReading('quarter');
}


/** A desk item on the wire (02a "The evening"): minor, category desk. Off the
 *  front page it also arrives as a toast, as the day's events do (the shell's). */
function _postDeskItem(headline) {
    if (!run.engine) return;
    run.engine._logEvent(sim.day, { headline, category: 'desk' }, {}, 'minor');
    run.sink.wire();
    run.sink.deskItem(headline);
}

const _capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The obligations' close (02a "The evening"). An obligation due today is paid from
 * cash, or, when cash is short, the shortfall is raised by the forced sale (which
 * costs firmStanding 8) and any remainder goes on the margin loan. Five sessions
 * ahead, a desk whose cash would not cover it gets a notice and pauses: not a
 * dispatch, so nothing but the player's play resumes it. A covered obligation
 * gives no notice.
 */
function _settleObligations() {
    if (!portfolio.obligations.length) return;
    const rel = relDay();
    for (const ob of portfolio.obligations.slice()) {
        if (ob.dueDay <= rel) {
            const res = settleObligation(ob, sim, sim.S, market.sigma, sim.r, sim.day, sim.q);
            if (!res) continue;
            if (res.forced) {
                develop('forced_sale');
                shiftFaction('firmStanding', -8);
                _postDeskItem(`Operations sells a slice of the book to meet ${ob.label}; the desk was ${fmtBook(res.shortfall)} short on the day, and the risk committee has noted it.`);
            } else {
                _postDeskItem(`${_capFirst(ob.label)} is paid in full; ${fmtBook(ob.amount)} leaves the desk in cash.`);
            }
        } else if (ob.dueDay - 5 === rel && portfolio.cash < ob.amount) {
            _postDeskItem(`${_capFirst(ob.label)}, ${fmtBook(ob.amount)}, is due in five sessions; the desk holds ${fmtBook(portfolio.cash)} in cash.`);
            develop('notice');
            run.sink.notice();   // the desk pauses (the shell's clock)
        }
    }
}

/**
 * Apply a real trading restriction after a forced liquidation that could not
 * flatten every leg (frozen Consensus contracts). Sets the persistent flag,
 * cancels ALL pending orders (liquidateAll only visits positions), and reports
 * the TRUE outcome (n closed, m frozen). Funded private stakes remain illiquid
 * without imposing a restriction on ordinary trading by themselves.
 */
function _applyRestriction(stuck, closedBefore) {
    const closed = closedBefore - stuck.length;
    const frozen = stuck.filter(p => p.type !== 'privatestake');
    if (frozen.length > 0) {
        portfolio.restricted = true;
        const cancelled = cancelAllOrders();
        toast(`Liquidation: ${closed} closed, ${frozen.length} frozen leg${frozen.length > 1 ? 's' : ''} remain`
            + (cancelled ? `; ${cancelled} pending order${cancelled > 1 ? 's' : ''} cancelled` : '')
            + '. Account restricted until they clear.', 5000);
    } else if (stuck.length) {
        toast(`${closed} position${closed !== 1 ? 's' : ''} liquidated; private stakes remain until terminal.`, 4000);
    } else {
        toast(`All ${closed} position${closed !== 1 ? 's' : ''} liquidated.`, 4000);
    }
}

/** True if any open position cannot currently be flattened (frozen/pending/settled
 *  binary leg, or a frozen/settled compute future under decree conversion). */
function _hasStuckLegs() {
    for (const p of portfolio.positions) {
        if (p.type === 'binary') {
            if (!consensus.active) continue;
            const q = consensus.quotes[p.strike];
            if (consensus.frozen || !q || q.settled || q.pending || q.frozen) return true;
        } else if (p.type === 'computefuture') {
            if (!computeMarket.active) continue;
            if (computeMarket.frozen || computeMarket.settled[p.strike]) return true;
        }
    }
    return false;
}


/** The margin call (a generated dispatch: the forced liquidation is its bystander
 *  choice). */
function _marginCallDispatch(margin) {
    const collateral = margin.collateralEquity ?? margin.equity;
    const shortfall = margin.required - collateral;
    return {
        category: 'margin',
        magnitude: 'major',
        headline: 'Margin call',
        context: `Portfolio equity ${fmtDollar(collateral)} is below the maintenance requirement of ${fmtDollar(margin.required)}. Shortfall: ${fmtDollar(shortfall)}. The risk desk is on the line.`,
        choices: [
            {
                label: 'Liquidate all positions',
                desc: 'Dump everything at market. Stop the bleeding.',
                playerFlag: 'margin_liquidated',
                // The bystander's answer: the forced liquidation (02a "Headless policies").
                bystander: true,
                // No static resultToast -- the _marginAction handler reports the
                // TRUE outcome (n closed, m frozen) via _applyRestriction.
            },
            {
                label: 'Sell stock first',
                desc: 'Unload equity exposure, keep options book intact.',
                playerFlag: 'margin_partial',
                resultToast: 'Stock positions closed.',
            },
        ],
        _marginAction: true,
    };
}

function _onDayComplete() {
    if (run.gameOver) return;   // P6-3: the desk is closed; no further day processing after the terminal closeout

    // The quarterly snapshot (02a "Locks"): at the start of the close that ends a
    // lock day's edition, before any other close bookkeeping and before the race
    // steps, while race.day and belief.day still equal the lock day. The desk
    // snapshots the standing policy without asking, and the reader-copier beside
    // it. Day 0's is the close of Edition 1; none is ever taken on day 1008, and a
    // run that ended mid-edition never reaches here (the game-over guard above).
    if (run.race && belief.active && !run.race.resolution && run.race.day < HORIZON
        && isLockDay(run.race.day) && belief.day === run.race.day) {
        mark('snapshotForecast');
        snapshotForecast(run.race.day);
    }

    const vol = market.sigma;

    chargeBorrowInterest(sim.S, vol, sim.r, sim.borrowSpread, sim.day);

    // Quarterly dividend payments (every 63 trading days, aligned with expiry cycle)
    // Discrete proportional drop: stock price falls by q/4, matching the option
    // pricing model (binomial tree with discrete dividends at QUARTERLY_CYCLE).
    if (sim.q > 0 && sim.day > 0 && sim.day % QUARTERLY_CYCLE === 0) {
        sim.S *= (1 - sim.q / 4);
        const divNet = processDividends(sim.S, sim.q);
        if (divNet !== 0) {
            const label = divNet > 0 ? 'Dividend received' : 'Dividend charged';
            toast(label + ': $' + Math.abs(divNet).toFixed(2));
        }
    }

    // Quarterly desk review (live trading only)
    if (sim.day > HISTORY_CAPACITY && sim.day % QUARTERLY_CYCLE === 0) {
        const buyHoldPnl = (sim.S - 100) * (portfolio.initialCapital / 100);
        const actualPnl = portfolioEquity() - portfolio.initialCapital;
        const vsBenchmark = actualPnl - buyHoldPnl;
        let rating;
        if (vsBenchmark > portfolio.initialCapital * 0.1) rating = 'strong';
        else if (vsBenchmark > 0) rating = 'solid';
        else if (vsBenchmark > -portfolio.initialCapital * 0.1) rating = 'underperform';
        else rating = 'poor';

        run.quarterlyReviews.push({ day: sim.day, pnl: actualPnl, vsBenchmark, rating });

        // Adjust firmStanding based on quarterly performance
        onQuarterlyReview(portfolioEquity(), sim.day);

        const texts = {
            strong: 'Quarterly desk review: Meridian\'s risk committee notes exceptional returns.',
            solid: 'Quarterly desk review: Solid quarter. Book within risk parameters.',
            underperform: 'Quarterly desk review: Returns lag benchmark. Risk committee requests position summary.',
            poor: 'Quarterly desk review: Managing Director Vasquez wants a meeting about your book.',
        };
        let text = texts[rating];
        if (run.playerChoices.cooperated_sec || run.playerChoices.silent_sec || run.playerChoices.accepted_insider_tip) {
            text += ' The SEC inquiry hasn\'t helped perception of the desk.';
        }
        toast(text, rating === 'poor' ? 8000 : 5000);
    }

    const { expired, unwound } = processExpiry(sim, sim.day, sim.S, sim.day, market.sigma, sim.r, sim.q);
    // INTERPRETATION: a chassis expiry (an option, bond or VXHCN future reaching its
    // date) counts as its own kind beside Consensus and compute settlements.
    for (let i = 0; i < expired.length; i++) develop('expiry');
    if (unwound.length > 0) {
        const names = [...new Set(unwound.map(p => p.strategyName))];
        for (const name of names) {
            toast('Strategy "' + name + '" expired — unwound all legs.');
        }
    }

    // Crisis profit tracking for trait system
    if (run.engine) {
        const _eq = portfolioValue(market.S, Math.sqrt(market.v), market.r, market.day, market.q);
        if (_eq > portfolio.initialCapital * 1.1) {
            const _w = run.engine.world;
            if (_w.geopolitical.recessionDeclared) run.playerChoices.profited_recession = true;
            if (_w.geopolitical.oilCrisis) run.playerChoices.profited_oil_crisis = true;
            if (_w.geopolitical.gulfEscalation >= 2) run.playerChoices.profited_war_escalation = true;
            if (_w.investigations.impeachmentStage >= 2) run.playerChoices.profited_impeachment = true;
        }
    }

    const _traitCtx = {
        playerChoices: run.playerChoices,
        impactHistory: run.impactHistory,
        quarterlyReviews: run.quarterlyReviews,
        factions,
        portfolio,
        daysSinceLiveTrade: sim.history.maxDay - HISTORY_CAPACITY,
        lobbyCount: run.lobbyCount,
        flags: {
            largeImpactTrades: run.impactHistory.length,
            continentalMentions: run.playerChoices._continentalMentions || 0,
        },
        // Belief-derived OBSERVABLE signals for the v2 convictions (phase 5a).
        // The player's OWN locked posterior / credibility / lock participation --
        // never latent race state. Safe defaults in Classic (belief inactive):
        // everLocked false, so agi_pilled/doomer stay dormant.
        beliefPilled: run.race ? playerPilled() : 0,
        credibility: run.race ? credibility() : 0,
        everLocked: run.race ? hasStatedForecast() : false,
    };
    const newTraits = evaluateTraits(_traitCtx);
    for (const id of newTraits) {
        const trait = getTrait(id);
        if (trait) toast(`${trait.permanent ? 'Conviction unlocked' : 'Reputation earned'}: ${trait.name}`, 4000);
    }

    // The PUBLIC released-frontier rung as of the LIVE trading day, captured for
    // the bridge pass below (review fix, 2026-09-08). `checkResolution` runs inside
    // this block and its day-1008 timeout path EXTRAPOLATES the race forward in
    // place -- thousands of headless days with no events, market, or player. The
    // capex latch keys on the public rung, so a bridge pass that read the rung AFTER
    // that would print capex waves for releases the desk never traded through and
    // walk `sim.b` / `sim.sigmaR` into the bond closeout. The live snapshot is the
    // rung the desk actually lived to see. Null in Classic (no bridge pass either).
    let _liveRung = null;
    // Advance the hidden AI-race state machine one completed day (overhaul
    // phase 1). Neutral inputs; the bridge (phase 2) + Consensus binaries
    // (phase 3a) read the ledger it produces.
    // The race advances every day, even after it has terminally resolved (P6): the
    // resolution latch does NOT freeze the race -- freezing it left race-instrument
    // contracts unsettled past their deadlines (02a "Resolution"). The
    // interim instead clears the ledger + bars new trades at the latch (below).
    if (run.race) {
        // P6-2 cost-of-capital coupling: fold today's net persistent HCN positioning
        // into the EMA and pass the bounded velocity multiplier as an ORCHESTRATOR
        // input (the straitTension precedent) -- never a mutation export. The channel
        // routes through deterministicDrift, so the plateau detector sees it too.
        // POST-RESOLUTION the channel is INERT (02a "Player influence and the ledger"): once the race has
        // latched, the player moves nothing that counts -- pass no coupling (unfed =>
        // zero drift term, zero C row), matching the frozen ledger. The race still
        // advances for instrument settlement; that is settlement mechanics, not a
        // second act. The resolving tick itself completes normally (resolution latches
        // later this tick), so its live coupling still applies.
        mark('stepCoupling');
        const _playerCoupling = run.race.resolution ? 0 : stepCoupling(_hcnPositioning(), primaryInputs(run.race.day + 1));
        // Export controls (evidence machinery round): the third orchestrator-passed
        // input. Binds Tianxia's COMPUTE leg only (the fast-follower distillation term
        // is untouched -- controls bind chips, never weights already released), and is
        // STORED on the race so the plateau detector and any extrapolation price the
        // same drift the kinematics did.
        // The day's public world inputs: the race steps on them, and the public
        // record (stepBelief, below) logs the same values (02a "The reader").
        const _raceInputs = { straitTension: _straitTension(), exportControlStage: _exportControlStage() };
        mark('advanceRace');
        advanceRace(run.race, {
            straitTension: _raceInputs.straitTension,
            playerCoupling: _playerCoupling,
            exportControlStage: _raceInputs.exportControlStage,
        });
        // Ledger the day's player-attributable dC to Halcyon (C channel; drops zero,
        // and the frozen ledger drops it outright post-latch -- belt and suspenders).
        for (const row of couplingAttribution(run.race.lastTransitions.playerDeltaC)) {
            appendLedger(sim.day, 'C', row.source, row.amount, 'Halcyon velocity');
        }
        // controlRegime ratchet (overhaul phase 5a): evaluate + advance the regime
        // through the canonical setControlRegime writer BEFORE any settlement reads
        // it (a mobilized/nationalized regime freezes / fallback-settles below). A
        // strait blockade may have opened the mobilization gate this tick. Then
        // advance the treaty gauntlet (P6) and MIRROR the race-owned strait + regime
        // + summit-window state into world-state so the compute market sees the
        // Taiwan blockade, event guards can read the regime, and the treaty_window
        // shell sees the open summit. Order: advanceRace (sets taiwanBlockade) ->
        // ratchet -> treaty -> mirror.
        mark('stepControlRegime');
        stepControlRegime(run.race, _exoSignals());
        // Treaty track (P6): the hidden Reykjavik gauntlet. Consumes this tick's
        // detection ledger for the summit-week gate; public treatyStage (events)
        // is a pacing accelerator only. summitOpen is mirrored below to summitLive.
        _raceInputs.treatyStage = run.engine.world.ai.treatyStage;
        mark('stepTreaty');
        stepTreaty(run.race, { treatyStage: _raceInputs.treatyStage });
        mark('syncRaceToWorld');
        _syncRaceToWorld();
        // Live-day public rung snapshot -- taken here, BEFORE checkResolution's
        // extrapolation can move it (see the declaration above).
        _liveRung = buildPublicView(run.race).releasedFrontierRung;
        // Event base-rate scaling (overhaul phase 5a; 04 engine note 1): the
        // discretionary Poisson cadence scales with the PUBLIC released frontier
        // rung (1.0 at R1 = Act-I match, rising late-game). Set before maybeFire.
        mark('setBaseRateScale');
        run.engine.setBaseRateScale(eventBaseRateScale(buildPublicView(run.race).releasedFrontierRung));
        // Act III driver (P7-1): the ONE smoothed public parameter behind the
        // machine register, the substep lane, the latency ladder, and the
        // presentation degradation. Reads the SAME public mirrors as the base-rate
        // scale above (released rung + regime); never race internals. Also hands x
        // to the audio layer and opens/closes the substep lane.
        mark('stepAct3');
        _stepAct3();
        // Standing orders (P7-2): the panel's gates ride the SAME public released
        // rung -- unlocked at R3, armed set locked at R5. Synced here, before any
        // rule is evaluated below, so arming and firing agree about the world.
        mark('syncStandingOrders');
        syncStandingOrders(frontierRung());
        // Market belief B: fold this completed day's LEGIBLE ledger into the rule
        // of thumb and step the public record with the day's public inputs, before
        // anything reads a quote. Consumes ONLY race.lastTransitions and the public
        // projection -- never latent state.
        mark('stepBelief');
        stepBelief(run.race, _raceInputs);
        // Consensus binaries: settle on this tick's certified crossings /
        // deadlines / impossibility (consumes race.lastTransitions.certifications
        // -- the ledger, never state-diffing), then refresh quotes off the public
        // (released/certified) view. Runs before the event bridge so a settled
        // milestone's toast reads after the race headline.
        // All settlement rows -- the day's certifications/deadlines/fallbacks AND
        // any UNCONSUMED rows a synchronous dispute ruling stashed in the outbox --
        // route through the ONE shared consequence helper (cash, exactly-once).
        // Draining the outbox here is the safety net for a dropped ruling return
        // (R3): the stashed row is paid exactly once, whether the hook already
        // applied it (consumed -> skipped) or dropped it.
        mark('settleConsensus');
        _applyBinaryRows(computeBinarySettlements(run.race));
        _applyBinaryRows(consensus.pendingRows);
        consensus.pendingRows = consensus.pendingRows.filter(r => !r._consumed);
        refreshBinaryQuotes(run.race);

        // Compute futures (overhaul phase 3b): feed the nationalization reference
        // with today's HCN exchange settlement mark (the authoritative process
        // price sim.S -- impact never touches it), settle any matured / decreed /
        // force-majeure contracts off the public compute index + strait state, then
        // refresh the curve. `geo` (world-state geopolitical) is present whenever
        // run.race is (both are Dynamic-only).
        const _geo = run.engine ? run.engine.world.geopolitical : null;
        mark('settleCompute');
        const cSettlements = computeFutureSettlements(run.race, _geo);
        if (cSettlements.length) {
            const cSettled = settleComputeFutures(cSettlements, run.race);
            for (const r of cSettled) {
                develop('settlement');
                toast('Compute Q@' + r.key + ' ' + r.kind.toLowerCase().replace('_', ' ')
                    + ' — P&L ' + fmtDollar(r.pnl), 4500);
            }
        }
        refreshComputeQuotes(run.race, _geo);

        // Standing orders (P7-2), day-boundary rules: (a) severity cut, (b) blockade
        // halve, (d) certification harvest. Placed AFTER settlement + quote refresh
        // by design -- (d) must price its harvest off today's live quotes and skip
        // what already settled, and (a)'s cut lands before the margin check below
        // sees the book. Machinery-instant; one fire per trigger episode.
        mark('standingDayRules');
        runStandingDayRules();

        // The quarter's close + firm belief F + the belief-gap scrutiny loop
        // (overhaul phase 4). Lock days are the fixed quarterly grid 0/63/126...
        // (race clock). The lock itself is the snapshot at the top of the NEXT
        // close (02a "Locks"), so F, scrutiny and the conversion read the closing
        // quarter's lock here.
        if (isLockDay(run.race.day) && run.race.day !== run.lastForecastLockDay) {
            run.lastForecastLockDay = run.race.day;   // race.day >= 1 here
            // Score the quarter that just closed under the lock that opened it (02a
            // "Scoring"), the reader-copier's beside it, before F reads credibility
            // -- so the firm, the memo gate and the close line all see this
            // quarter's result.
            mark('scoreQuarter');
            const _scored = scoreQuarter(run.race.day);
            scoreCopierQuarter(run.race.day);
            run.sink.world();   // the Desk's record
            stepFirmBelief(run.race);   // F wakes toward B; converts on the player's track record
            // P6-2 F-channel ledger (advice line): stepFirmBelief exposes the applied
            // movement's decomposition -- ledger ONLY the PLAYER conversion term
            // (race.lastFConvert), never the autonomous B-wake (02a "Player influence and the ledger": the
            // ledger charges the player for persuasion, not for the world waking on its
            // own). Gated on the player having stated a forecast (the advice channel is
            // silent otherwise); zero-dropped like every channel. F is 0-100; /100 keeps
            // the epilogue's channel totals commensurable in margin-unit-ish fractions.
            if (hasStatedForecast()) appendLedger(sim.day, 'F', 'advice_line', (run.race.lastFConvert || 0) / 100, 'firm belief (F) conversion');
            _runScrutiny();              // risk committee heats on the player's belief-gap vs F
            _checkFirmConversion();      // the CIO throughline: memo, then verdict (once each)
            _quarterCloseLine(_scored);  // one desk item on the wire when a carried rung scored
        }

        // Terminal resolution (P6): the precedence ladder, checked LAST -- after this
        // tick's settlement/belief have applied. On the resolving tick, checkResolution
        // latches (freezeLedger -> mark -> clear lastTransitions, preserving the treaty
        // -outcome stamp for the bridge pass below) and bars new race-instrument trades.
        // Freezing and playing on to term-end is ruled out (02a "Resolution"):
        // letting the sim run past resolution mutated settlements the closeout
        // should have fixed at resolution time. Instead this tick completes its bridge
        // pass + popup drain (the treaty superevent reaches the player), then the
        // endings block below enters the atomic game-over -- SAME tick, resolution-time
        // regime. The freeze bars survive INSIDE that atomic sequence.
        mark('checkResolution');
        const _resolution = checkResolution(run.race, run.engine.world.geopolitical);
        if (_resolution) {
            consensus.frozen = true;        // bar new binary orders (survives into the atomic closeout)
            computeMarket.frozen = true;    // bar new compute-future orders (survives into the atomic closeout)
            console.log('[race resolution] day', _resolution.day, 'family', _resolution.family,
                _resolution.terminalCause, _resolution.extrapolated ? `(extrapolated +${_resolution.extrapolationDays}d)` : '',
                '| leader', _resolution.leader, '| d', _resolution.d.toFixed(3),
                '| align', _resolution.axes.alignmentResult, '| regime', _resolution.axes.politicalControl);
        }

        // THE ROOM (P7-3): the endgame branch point, checked AFTER the resolution
        // ladder so it is strictly pre-terminal by construction -- a tick that
        // resolves the world never also convenes a room, and the latch is not spent
        // on a world that has already ended.
        mark('checkRoom');
        if (!run.race.resolution) _checkRoom();
    }

    // Trading-restriction release: lifts once no un-flattenable (stuck) legs
    // remain (the frozen contracts have settled -- nationalization fallback or
    // deadline) AND canonical equity is non-negative. _resetCore always clears it.
    if (portfolio.restricted && !_hasStuckLegs() && portfolioEquity() >= 0) {
        portfolio.restricted = false;
        toast('Trading restriction lifted — account reopened.', 3500);
    }

    // Fire dynamic events
    if (run.engine) {
        run.engine.setPlayerContext(
            run.playerChoices,
            factions,
            getActiveRegulations().map(r => r.id),
            getActiveTraitIds(),
            {
                equity: portfolioEquity(),
                peakEquity: portfolio.peakValue || portfolio.initialCapital,
                pnlPct: (portfolioEquity() - portfolio.initialCapital) / portfolio.initialCapital,
                maxDrawdown: portfolio.maxDrawdown || 0,
                grossLeverage: computeGrossNotional() / Math.max(1, portfolioEquity()),
                positionCount: portfolio.positions.length,
                netDelta: computeNetDelta(),
                cash: portfolio.cash,
                strongQuarters: run.quarterlyReviews.filter(r => r.rating === 'strong').length,
                impactTradeCount: run.impactHistory.length,
            },
            run.lobbyCount,
            getLastLobbyDay()
        );
        const netDelta = computeNetDelta();
        mark('maybeFire');
        const { fired, popups } = run.engine.maybeFire(sim, sim.day, netDelta);
        // Race -> narrative bridge (overhaul phase 2): fire the day's race
        // transitions (releases, certifications, detected incidents) through the
        // same _fireEvent path, merging into the existing display arrays. Dynamic
        // modes only (run.race is null in Classic); may add toasts/popups but
        // must not crash. Runs right after advanceRace's ledger was produced.
        let capexWaves = 0;
        if (run.race) {
            mark('raceBridge');
            const bridged = runRaceBridge(run.engine, run.race, sim, sim.day, netDelta, _liveRung);
            capexWaves = bridged.capexWaves;
            for (const f of bridged.fired) fired.push(f);
            for (const p of bridged.popups) popups.push(p);
        }
        mark('stepRaceMarkets');
        _stepRaceMarkets(capexWaves);
        // The protected reference records the post-gap authoritative close.
        if (run.race && !run.race.resolution) stepNationalizationRef(run.race, sim.S);
        for (const ev of popups) _queuePopup(ev);
        const hasSupereventPopups = popups.some(ev => ev.superevent);
        // An extra edition: a regime change, a blockade, a superevent or a crisis.
        const _tr = run.race ? run.race.lastTransitions : null;
        if (hasSupereventPopups || fired.some(ev => ev.category === 'compound' || ev.superevent)
            || (_tr && (_tr.regimeChange || (_tr.strait && _tr.strait.blockadeStart)))) {
            run.sink.extra();
        }
        // The race page records the day's public ledger (and, for the epilogue, the hidden tracks).
        if (run.race) run.sink.raceDay();
        // The markets page keeps the curves from before today's news as its ghost.
        const _lead = fired.find(ev => !ev.interjection) || popups[0];
        mark('marketsDayClose');
        run.sink.marketsClose(_lead ? _lead.headline : null);
        if (hasSupereventPopups || fired.length > 0) {
            sim.recomputeK();
            syncAll();
            run.sink.world();
            run.sink.wire();
        }
        run.sink.fired(fired, false);
    }

    // Classic has no wire: the tape leads each edition, and the markets page
    // still takes its daily snapshot.
    if (!run.engine) {
        run.sink.wire();
        mark('marketsDayClose');
        run.sink.marketsClose(null);
    }

    // Portfolio-triggered popup events
    if (run.engine) {
        const portfolioPopups = run.engine.evaluateTriggers(sim, sim.day);
        for (const pp of portfolioPopups) _queuePopup(pp);
    }

    if (run.engine) {
        const { expired } = tickRegulations();
        for (const id of expired) {
            const reg = getRegulation(id);
            if (reg) toast('Regulation expired: ' + reg.name, 3000);
        }
    }

    // Endings check (after events and faction shifts). A player-terminal state
    // (P6-1 ruling) locks the desk, resolves the world, closes the book out, and
    // renders the epilogue -- all inside _triggerGameOver.
    if (run.engine && !run.gameOver) {
        const endingId = checkEndings(sim, portfolio, run.engine.world, run.playerChoices);
        if (endingId) {
            if (endingId === 'term_ends') run.engine.computeElectionOutcome(sim, sim.day);
            _triggerGameOver(endingId);
            return;
        }
        // NATURAL world resolution ends the desk's story too (02a "Resolution": the
        // post-resolution interim is SUPERSEDED -- letting the sim run past
        // resolution mutated settlements the closeout should have fixed at
        // resolution time). The resolving tick already completed the race pipeline
        // and the bridge pass above (so the treaty-outcome superevent is queued
        // and reaches the player as an event); NOW the desk closes over them. The
        // finalizers read the regime AS OF this resolution tick (unchanged since
        // this tick's stepControlRegime), never a later one.
        if (run.race && run.race.resolution) {
            _triggerGameOver('term_ends');
            return;
        }
    }

    // lobbyingExposed is set directly here (not via event system) because it's
    // a meta-flag derived from player behavior + faction state, not a narrative beat.
    // Check if lobbying has been exposed (heavy lobbying while media is watching)
    if (run.engine && run.lobbyCount >= 3 && factions.mediaTrust < 40 && !run.engine.world.media.lobbyingExposed) {
        run.engine.world.media.lobbyingExposed = true;
    }

    // Update ambient mood based on market regime
    const _ambientVol = Math.sqrt(sim.v);
    run.sink.ambient(_ambientVol > 0.35 || sim.lambda > 5 ? 'crisis' : _ambientVol > 0.20 || sim.lambda > 2 ? 'tense' : 'calm');

    // Layer 3: update param shifts based on gross exposure
    const grossNotional = computeGrossNotional();
    const grossRatio = grossNotional / (market.S * modeledStockADV(market.sigma));
    updateParamShifts(grossRatio);
    decayParamShifts();
    decayEventImpulses();   // decay the race-event market impulses once per day (phase 4)

    // Impact toast
    const hasOptions = portfolio.positions.some(p => p.type === 'call' || p.type === 'put');
    const impactLine = selectImpactToast(grossRatio, hasOptions ? 'option' : 'stock', sim.day);
    if (impactLine) toast(impactLine, 3000);

    if (grossRatio > 0.75) shiftFaction('regulatoryExposure', 1);

    // Obligations (02a "The evening"): one due on day d is settled at the close that
    // turns day d - 1 into day d -- this close -- after expiry, the race block's
    // settlements and the terminal check (a close that ended the run returned above,
    // and its closeout paid what was unpaid), immediately before the rogue-trading
    // and margin checks. The notice is checked at the same point.
    _settleObligations();

    // Rogue trading check (before margin)
    const equity = portfolioEquity();
    if (equity < portfolio.initialCapital * ROGUE_TRADING_THRESHOLD) {
        const lossAmt = fmtDollar(Math.abs(portfolio.initialCapital - equity));
        _showGameOver(`Meridian Capital's internal audit has uncovered ${lossAmt} in unauthorized losses on your desk. Bank security has been called. Your access has been revoked. The SEC has been notified.`);
        return;
    }

    // Check margin
    const margin = checkMargin(sim.S, vol, sim.r, sim.day, sim.q);
    if (margin.triggered) {
        portfolio.marginCallCount++;
        _queuePopup(_marginCallDispatch(margin), true);
        _processPopupQueue();
    }

    // The close's display (the tape, the sparkline, the book), then the day's
    // dispatches, then the skip's stop (the shell's).
    run.sink.closed(margin);
    _processPopupQueue();
    run.sink.skipClose();
}

/**
 * The opening hand (02a "The evening"): a Dynamic run starts on an inherited desk,
 * drawn from the race's seed by the hand's own stream and taken over at day 0's
 * opening marks. Called at Dynamic boot once belief, valuation, compute and
 * Consensus are quoting, so every mark exists. The predecessor's two archived
 * reports go on the wire first and the memo last, so the memo is the newest item
 * and leads Edition 1; the archived items are dated Archive, not by edition.
 */
function _dealOpeningHand() {
    const fixture = dealOpeningHand(run.race.seed, run.expiryMgr.update(sim.day).map(e => e.day));
    // INTERPRETATION: 02a gives the memo and the reports no magnitude; they post as
    // minor, like the desk's other wire items, and the archived ones mark no news
    // day on the tape (main.js _updateWire).
    for (const r of fixture.reports) {
        run.engine._logEvent(sim.day, { headline: r.headline, category: r.category }, {}, 'minor').archive = true;
    }
    run.engine._logEvent(sim.day, { headline: fixture.memo, category: 'desk' }, {}, 'minor');
}

// ---------------------------------------------------------------------------
// A new run
// ---------------------------------------------------------------------------

/** Dynamic is the preset at index 5 and above; the rest are Classic. */
export function isDynamicPreset(index) { return index >= 5; }

/**
 * Initialize every module singleton the run touches, for a run on `seed` under
 * `preset` (02a "The run, headless": rounds, valuation, belief, the portfolio,
 * factions, traits, regulations, lobbying, impact, Act III, the bridge's and the
 * room's rotations among them), so a run never depends on the process's history.
 */
function _resetRun(preset, seed) {
    run.seed = seed >>> 0;
    run.preset = preset;
    run.gameOver = false;
    run.pendingEpilogue = null;
    run.almanacRecord = null;
    run.queue.length = 0;
    run.current = null;
    run.dispatchSeq = 0;
    for (const k in run.playerChoices) delete run.playerChoices[k];
    run.lobbyCount = 0;
    run.impactHistory.length = 0;
    run.quarterlyReviews.length = 0;
    run.lastForecastLockDay = -1;
    run.firmMemoFired = false;
    run.firmVerdictFired = false;
    run.fundLive = false;    // P7-3: the fund-as-actor latch is run-scoped
    run.roomFired = false;   // P7-3: the room is a once-per-RUN branch point
    run.journal = [];
    run.digests = [];
    resetUsedTips();
    resetFactions();
    resetTraits();
    resetRegulations();
    resetLobbying();
    resetAct3();             // P7-1: x -> 0, substep clock zeroed, working orders dropped, latches cleared
    resetStandingOrders();   // P7-2: precommitments are authored per RUN
    resetValuation();
    resetRounds();
    // The bridge's per-run latches (variant rotation, the tip throttle, the capex
    // latch) and the room's per-leader rotation: pure module state, cleared for
    // Classic too (02a reality-beats ruling 2), so same-seed playback never
    // depends on process history.
    resetRaceBridge();
    resetRoomRotation();
    resetEventImpulses();
    resetCounts();           // the interruption counters are run-scoped
    sim.reset(preset, run.seed);
    resetPortfolio();        // obligations too: Classic starts on cash; Dynamic deals the hand
    resetOpening();
    resetImpactState();
    sim.prepopulate();
    syncAll();
    run.origin = sim.day;
    run.dayOpen = false;
    run.savedOverlays = {};
    run.savedImpulse = {};
    run.expiryMgr.init(sim.day);
}

/**
 * Begin a new run: `seed` is its run seed (the shell draws it with randomSeed(),
 * the one ambient draw; a headless run names it), `preset` its mode. In Dynamic
 * the run seed is the race's, and `hand` deals the inherited desk (02a "The
 * evening"; the bystander starts on cash). The journal starts empty.
 */
export function newRun({ preset, seed, hand = true }) {
    _resetRun(preset, seed);
    run.hand = !!hand && isDynamicPreset(preset);
    if (isDynamicPreset(preset)) {
        run.engine = new EventEngine(run.seed);
        // Faction state lives in faction-standing.js; attach by reference so events can read it
        run.engine.world.factions = factions;
        run.race = createRaceState(run.seed);
        // Attach the race by reference for the non-popup raceEffects chokepoint (P6-2).
        run.engine.race = run.race;
        resetCoupling();
        resetLedger();
        initConsensus(run.race);
        initComputeMarket(run.race, run.engine.world.geopolitical);
        // Market belief B + belief-backed quoters + player/firm belief (phase 4).
        initBelief(run.race);
        initValuation(run.race);
        initRounds(run.race);
        // chinaTrue intel reliability stream (P7-3): its own module-local RNG,
        // seeded OUTSIDE race.streams so intel beats cannot perturb the race.
        initIntel(run.race);
        _wireBeliefQuoters();
        refreshBinaryQuotes(run.race);
        refreshComputeQuotes(run.race, run.engine.world.geopolitical);
        if (hand) _dealOpeningHand();
    } else {
        run.engine = null;
        run.race = null;
        deactivateConsensus();
        deactivateComputeMarket();
        deactivateBelief();
        deactivateIntel();
        deactivateCoupling();
        deactivateLedger();
        _unwireBeliefQuoters();
    }
    run.sink.newRun();
}

// ---------------------------------------------------------------------------
// Commands and the journal (02a "Commands")
// ---------------------------------------------------------------------------

/** Where the run stands: the day, and how many of its substeps have run (0
 *  between days; 16 for a finished day a dispatch holds open). */
export function position() {
    return { day: sim.day, substeps: run.dayOpen ? sim.substepsDone : 0 };
}

/** The journal's header: the rules a journal replays under, the seed, the preset. */
export function journalHeader() {
    return { v: RULES_VERSION, seed: run.seed, preset: run.preset, hand: run.hand };
}

/**
 * The one entry point for everything the player does that changes state (02a
 * "Commands"). The command is journaled with its position, in order, before it
 * applies; the journal records commands, never outcomes. Admission (cash,
 * cooldowns, gates) is checked here, inside the run. Kinds:
 *   trade      { order }            a resolved ticket send (legs, a strategy, the flatten)
 *   cancel     { id }               a resting order
 *   close      { id }               a position
 *   unwind     { name }             a strategy's legs
 *   exercise   { id }               an option, early
 *   answer     { occ, choice }      the dispatch that is up, by occurrence id
 *   forecast   { state }            the draft's whole state (belief.js draftState)
 *   standing   { id, on }           arm or disarm a standing order
 *   lobby      { action }           a government-affairs action
 *   setting    { param, value }     a pricing setting
 */
export function runCommand(cmd) {
    const entry = { ...position(), cmd: JSON.parse(JSON.stringify(cmd)) };
    run.journal.push(entry);
    _apply(entry.cmd);
    run.sink.commanded(entry.cmd, { day: entry.day, substeps: entry.substeps });
}

function _apply(cmd) {
    switch (cmd.kind) {
        case 'trade': return sendTicket(cmd.order);
        case 'cancel': return cancelByHand(cmd.id);
        case 'close': return closeByHand(cmd.id);
        case 'unwind': return unwindByHand(cmd.name);
        case 'exercise': return exerciseByHand(cmd.id);
        case 'answer': return _answer(cmd.occ, cmd.choice);
        case 'forecast': return _setForecast(cmd.state);
        case 'standing': return setStanding(cmd.id, cmd.on);
        case 'lobby': return _lobby(cmd.action);
        case 'setting': return _setting(cmd.param, cmd.value);
        default: throw new Error(`unknown command kind ${cmd.kind}`);
    }
}

/** The forecast editor's commit: the draft's whole state, validated by belief.js
 *  (a state that fails validation leaves the draft as it was). */
function _setForecast(state) {
    if (!run.race || run.gameOver) return;
    setDraftState(state);
}

/**
 * Government affairs (the Meridian page): admitted here, not by a disabled
 * button -- the action must be available (its gate), affordable and off
 * cooldown. Its trace, where it has one, draws from its own slot.
 */
function _lobby(actionId) {
    if (!run.engine || run.gameOver) return;
    const day = sim.history.maxDay;
    const action = getAvailableActions(day, portfolio.cash).find(a => a.id === actionId);
    if (!action || !action.affordable || !action.cooldownReady) return;
    const result = executeLobbyAction(actionId, day, run.engine.world, keyedRng(run.seed, 'lobby', actionId, day));
    if (!result) return;
    portfolio.cash -= result.cost;
    if (result.playerFlag) run.playerChoices[result.playerFlag] = day;
    else run.playerChoices['lobbied_' + actionId] = day;
    run.lobbyCount++;
    toast('Lobbying: ' + result.action.name + (result.cost > 0 ? ' (-$' + result.cost + 'k)' : ''), 3000);
    run.sink.book();
}

/** The pricing settings Meridian's sliders write: a model parameter of the sim.
 *  INTERPRETATION: a setting made while a day is open goes through
 *  `_midDayBaseline` (AGENTS "Intraday mutation"), so it sets the baseline and the
 *  close's overlay restore cannot erase it. */
const _SETTINGS = new Set(['mu', 'theta', 'kappa', 'xi', 'rho', 'lambda', 'muJ', 'sigmaJ', 'a', 'b', 'sigmaR', 'borrowSpread', 'q']);
function _setting(param, value) {
    if (!_SETTINGS.has(param) || !Number.isFinite(value)) return;
    _midDayBaseline(() => {
        sim[param] = value;
        if (param === 'rho') sim._recomputeRhoDerived();
    });
    syncAll();
}

/** After every close, whatever path ended it: the digest trail when one is
 *  kept, and the shell's save. */
function _afterClose() {
    if (run.digesting && run.digestFn) run.digests.push({ day: sim.day, h: run.digestFn() });
    run.sink.afterClose();
}

// ---------------------------------------------------------------------------
// Development hooks (window._debug). Outside the journal: a run they touch no
// longer replays.
// ---------------------------------------------------------------------------

/** Fire any event by id. Toast events apply immediately; popup events queue. */
export function debugFireEvent(id) {
    const ev = getEventById(id);
    if (!ev) { console.error(`No event with id "${id}"`); return null; }
    if (!run.engine) { console.error('No event engine (not in Dynamic mode)'); return null; }
    const result = run.engine._fireEvent(ev, sim, sim.day, 0, 0);
    if (result.queued) { _queuePopup(result.event); _processPopupQueue(); }
    return result;
}

/** Queue an arbitrary dispatch and show it if nothing is up. */
export function debugPopup(event) {
    _queuePopup(event);
    _processPopupQueue();
}

/** The harnesses' handle on single transitions (opening-test, rounds-test): the
 *  close's gap, a choice's consequence, the obligations' close, the restriction.
 *  Nothing in the page calls these; the run calls them in its own order. */
export const runInternals = Object.freeze({
    stepRaceMarkets: _stepRaceMarkets,
    applyPopupChoice: _applyPopupChoice,
    applyRestriction: _applyRestriction,
    hasStuckLegs: _hasStuckLegs,
    settleObligations: _settleObligations,
    marginCallDispatch: _marginCallDispatch,
    gameOverDispatch: _gameOverDispatch,
});

