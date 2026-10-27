/* =====================================================
   main.js -- Entry point for the Shoals trading simulator.

   Wires together DOM cache, simulation loop, camera,
   rendering, autoplay, and event handlers.
   ===================================================== */

import { SPEED_OPTIONS, SKIP_DAYS_PER_SEC, PRESETS, INTRADAY_STEPS, HISTORY_CAPACITY, QUARTERLY_CYCLE, CHART_SLOT_PX, CHART_LEFT_MARGIN, CHART_RIGHT_MARGIN, DEFAULT_PRESET, ROGUE_TRADING_THRESHOLD, BOND_FACE_VALUE } from './src/config.js';
import { fmtDollar, fmtSigned, fmtBook } from './src/format-helpers.js';
import { createSparkHistory, pushSparkSample } from './src/sparkline.js';
import { Simulation } from './src/simulation.js';
import { buildChainSkeleton, priceChainExpiry, ExpiryManager } from './src/chain.js';
import {
    portfolio, resetPortfolio, checkPendingOrders, processExpiry,
    chargeBorrowInterest, processDividends, checkMargin, aggregateGreeks,
    executeMarketOrder, closePosition, exerciseOption,
    liquidateAll, placePendingOrder, cancelOrder, cancelAllOrders,
    computeNetDelta, computeGrossNotional, portfolioValue,
    executeBinaryTrade, settleComputeFutures, applyBinarySettlementRows, applyCloseoutRows,
    isExpiredForTrading, allocatePrivateStake, allocatePrimaryStock,
    settleObligation, payObligationsAtCloseout, reduceOnlyClose,
} from './src/portfolio.js';
import { dealOpeningHand, resetOpening, dealtFixture } from './src/opening.js';
import { ChartRenderer } from './src/chart.js';
import {
    cacheDOMElements, bindEvents,
    updatePortfolioDisplay, updateGreeksDisplay,
    syncSettingsUI,
    updatePlayBtn, updateSpeedBtn,
    wireInfoTips,
    updateDynamicSections, updateCongressDiagrams, updateStandings, renderHandover,
    updateStandingOrdersPanel,
    refreshTooltip,
    showPopupEvent,
} from './src/ui.js';
import { initPages, showPage, cyclePage, currentPage, setFolioCount } from './src/pages.js';
import { initBrief, resetBrief, updateMasthead, renderWire, markExtra, splitHeadline } from './src/brief.js';
import { initMarkets, setMarketsVisible, marketsDayClose, resetMarkets, refreshMarkets, redrawMarkets, marketsSubstep, smileExpiryDay } from './src/markets.js';
import {
    initTicket, pickPoint, addToTicket, legState, renderTicket, resetTicket, refreshTicketQuotes, redrawTicket,
    invalidateTicket, tradeTicket, ticketLegCount, loadFlatten,
} from './src/ticket.js';
import { positionLabel } from './src/portfolio-renderer.js';
import { initSurface } from './src/surface.js';
import { initRacePage, resetRacePage, recordRaceDay, endRacePage, revealRace, setRaceVisible, drawRace } from './src/race-page.js';
import { resetCounts, countDispatch, countChoice, countDevelopment, countPause, counts } from './src/counters.js';
import { closeStop, majorSince } from './src/pacing.js';
import { buildAlmanacRecord, appendAlmanac } from './src/almanac.js';
import { initAlmanacView, renderAlmanac } from './src/almanac-view.js';
import { EventEngine, eventBaseRateScale, SUBSTEP_LANE_RUNG } from './src/events.js';
import { checkEndings, generateEnding, determineOverlay, isTerminalSafeBeat } from './src/endings.js';
import { computePositionValue, computePositionPnl } from './src/position-value.js';
import { REFERENCE } from './src/reference.js';
import { computeVXHCNSpot } from './src/pricing.js';
import { syncMarket, market } from './src/market.js';
import {
    resetImpactState, decayImpactVolumes,
    modeledStockADV, rehedgeMM,
    updateParamShifts, decayParamShifts,
    applyParamOverlays, removeParamOverlays,
    selectImpactToast, getStockImpact,
} from './src/price-impact.js';
import { applyStructuredEffects } from './src/world-state.js';
import { pickTip, resetUsedTips } from './src/events/tips.js';
import { getEventById, ALL_EVENTS } from './src/events/index.js';
import {
    factions, resetFactions, getFaction,
    onQuarterlyReview, applyComplianceChoice,
    shiftFaction, getFactionDescriptor,
    settleRegulatory, cooperateRegulatory,
} from './src/faction-standing.js';
import {
    evaluateTraits, getActiveTraits, getTrait,
    getTraitEffect, resetTraits, getActiveTraitIds, hasTrait,
} from './src/traits.js';
import {
    tickRegulations, getActiveRegulations, getRegulation,
    getRegulationEffect, resetRegulations, getRegulationPipeline,
} from './src/regulations.js';
import { TIP_REAL_PROBABILITY } from './src/config.js';
import {
    initAudio, setAmbientMood, playStinger, playMusic, stopMusic, setVolume, getVolume, resetAudio,
    setMachineIntensity, glitchAudio, silenceDesk,
} from './src/audio.js';
import {
    stepAct3Driver, resetAct3,
    tickSubstepClock, substepClock, orderLatency,
    deferOrder, dueOrders, clearDeferredOrders, workingOrderCount,
    publishedChain, advanceVxhcnPublication, publishedVxhcn, publishedVariance,
    rollCandleRepaint, skipSparklineFrame, noteDegradationIncident, takeGlitchSeverity,
    setReducedMotion,
} from './src/act3.js';
import {
    resetStandingOrders, freezeStandingOrders, syncStandingOrders,
    runDayBoundaryRules, runSubstepRules, standingLiquidationOrder,
    tipAutoSitArmed, standingOrdersView, setArmed as setStandingArmed,
    STANDING_COPY,
} from './src/standing-orders.js';
import { getAvailableActions, executeLobbyAction, resetLobbying, getLastLobbyDay } from './src/lobbying.js';
import { createRaceState, advanceRace, resetRaceState, stepControlRegime, roomTrigger } from './src/race/race-state.js';
import { initIntel, resetIntel, deactivateIntel } from './src/race/intel.js';
import {
    ROOM_EVENT_ID, ROOM_FLAGS, ROOM_GATE, ROOM_FLAG_CRITERIA,
    roomVoice, roomInvited, roomChoices, roomPresentation, resetRoomRotation,
} from './src/events/room.js';
import { runRaceBridge, resetRaceBridge } from './src/events/race-bridge.js';
import { roundDispatch } from './src/events/rounds.js';
import { applyReportingRegime, forceLeakDetection } from './src/race/incidents.js';
import { straitTension } from './src/race/strait.js';
import { stepTreaty } from './src/race/treaty-track.js';
import { checkResolution, resolveNow, HORIZON } from './src/race/resolution.js';
import {
    consensus, initConsensus, resetConsensus, deactivateConsensus,
    refreshBinaryQuotes, computeBinarySettlements, setBinaryQuoteSource,
    buildPublicView, openDispute, ruleDispute, finalizeConsensusTerminal, getBinaryQuote,
} from './src/race/consensus.js';
import {
    computeMarket, initComputeMarket, resetComputeMarket, deactivateComputeMarket,
    refreshComputeQuotes, computeFutureSettlements, stepNationalizationRef, setComputePriceSource,
    finalizeComputeTerminal, isComputeTradeable,
} from './src/race/compute-market.js';
import { closeoutBook } from './src/race/closeout.js';
import { initValuation, stepValuation, lastValuation, resetValuation } from './src/race/valuation.js';
import {
    ROUNDS_TUNING, initRounds, resetRounds, stepRounds, lastPolarisRound,
    roundAllocation, halcyonOfferPrice, recordPrimaryAllocation, primaryInputs,
} from './src/race/rounds.js';
import {
    belief, initBelief, resetBelief, deactivateBelief, stepBelief, binaryProb,
    binaryQuoteFromBelief, computeCurveFromBelief,
    isLockDay, snapshotForecast, scoreQuarter, scoreCopierQuarter, scoreOutstandingQuarter, scoreCopierOutstanding,
    forecastRecord, copierRecord,
    playerPilled, stepFirmBelief, scrutinyGap, hasStatedForecast, credibility,
    canSendMemos, canActAsFund, firmBelief, foldPlayerLeak,
} from './src/race/belief.js';
import {
    decayEventImpulses,
    applyEventImpulseOverlay, removeEventImpulseOverlay, resetEventImpulses,
} from './src/race/impulse.js';
import { stepCoupling, couplingAttribution, resetCoupling, deactivateCoupling } from './src/race/coupling.js';
import {
    resetLedger, deactivateLedger, applyRaceEffects, appendLedger, ledgerTotals,
    raceChannelsLive,
} from './src/race/ledger.js';


// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const $ = {};
const sim = new Simulation();
const expiryMgr = new ExpiryManager();
let chart;
let camera;
let chainSkeleton = [];
let playing = false;
let _resumeAfterDispatch = false;   // the desk was running when a dispatch paused it; resume once they are all answered
// To the next edition worth reading (02a "The evening", "Pacing").
let _skipping = false;          // a skip is running: the clock plays at SKIP_DAYS_PER_SEC
const _skipLatch = new Set();   // the stops latched since the skip began, taken at the close
let _skipLogMark = null;        // the newest wire entry when the skip began or the last close ended
let _prevCloseEquity = null;    // equity net of obligations at the previous close (null: the run's start)
let speedIndex = 2;
let dirty = true;
let bookDirty = true;     // the book changed: the markets tables and the ticket re-read holdings
let lastTickTime = 0;
let dayInProgress = false; // true between beginDay() and finalizeDay()
let mouseX = -1, mouseY = -1;
let eventEngine = null;  // EventEngine instance (null when not in Dynamic mode)
let raceState = null;    // hidden AI-race state machine (null when not in Dynamic mode; nothing reads it yet)
let _gameOver = false;   // P6-3 DURABLE terminal latch: desk locked, book closed out, epilogue shown. Never auto-releases (unlike portfolio.restricted); cleared only by _resetCore.
let _pendingEpilogue = null;   // P6-3: epilogue pages built at game-over, rendered only AFTER the resolution-day beat drains from the popup queue (the treaty superevent reaches the player first).
let portfolioHistory = null; // sparkline ring buffer for the book's value
let benchHistory = null;     // ... and for holding HCN with the same capital (the ghost under it)
let _savedOverlays = {};
let _savedImpulse = {};   // event-impulse overlay saved originals (restored at day-complete)
let _lastForecastLockDay = -1;   // race-day of the last lock-day block (scoring, F, scrutiny; avoids double-firing)
let _almanacRecord = null;       // the run's almanac record, built at game over, appended when the last edition shows
let _fundLive = false;    // P7-3 fund-as-actor latch (monotone; mirrored to world.ai.fundLive)
let _roomFired = false;   // P7-3: the room is a once-per-run branch point, gate open or shut
let _capFront = null;
let _epilogueReopen = null;   // reopens the last edition after a visit to the race page     // the tape's live caption setter (shared/colophon.js caption())

const _popupQueue = [];
const playerChoices = {};

const impactHistory = [];
let _lobbyCount = 0;
const quarterlyReviews = [];


// ---------------------------------------------------------------------------
// Micro-helpers — eliminate repeated typeof guards & duplicated blocks
// ---------------------------------------------------------------------------

function _toast(msg, duration) {
    if (typeof showToast !== 'undefined') showToast(msg, duration);
}
function _haptic(pattern) {
    if (typeof _haptics !== 'undefined') _haptics.trigger(pattern);
}
function _syncAll() {
    syncMarket(sim);
    market.vxhcn = computeVXHCNSpot(sim.v, sim.kappa, sim.theta, sim.xi);
}
/** The closed day's public level and primary-market announcements. The only
 *  caller is after the bridge and before marketsDayClose in _onDayComplete. */
function _stepRaceMarkets(capexWaves) {
    if (!raceState || raceState.resolution || _gameOver) return;
    if (dayInProgress) throw new Error('Race-market gaps require a closed trading day');
    const { ratio } = stepValuation(raceState);
    sim.S *= ratio * Math.pow(ROUNDS_TUNING.halcyonDilution, capexWaves);
    _syncAll();
    // Resting orders see the gap at the price it publishes, not after the next
    // substep has moved it again (a stop the gap jumped fills at the gap).
    _fillPendingOrders();
    for (let i = 0; i < capexWaves; i++) {
        _queuePopup({ category: 'rounds', _roundOffer: {
            kind: 'halcyon', id: `halcyon_followon_${raceState.day}_${i}`, day: raceState.day,
            price: halcyonOfferPrice(sim.S),
        } });
    }
    // Pi is the R5 contract's quote: B's probability of R5 by day 1000 (02a rounds).
    const pi = binaryProb(5, 1000);
    for (const round of stepRounds(raceState, pi)) _queuePopup({ category: 'rounds', _roundOffer: round });
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
    if (!raceState || !eventEngine) return;
    const w = eventEngine.world;
    w.geopolitical.taiwanBlockade = raceState.taiwanBlockade;   // Taiwan strait (compute market reads this)
    w.ai.controlRegime = raceState.controlRegime;
    w.ai.reportingRegime = raceState.incidentReporting;
    // Released frontier rung -- the public act proxy arc `when` guards key on
    // (same public quantity eta and the base-rate scale read; latent C never mirrored).
    w.ai.frontierRung = buildPublicView(raceState).releasedFrontierRung;
    // Summit-window flag (P6): the declared seam the treaty_window event is gated
    // on. Mirrors the race-side gauntlet's open window -- race-state.js stays the
    // sole authority, this is the read-only mirror (same pattern as frontierRung).
    w.ai.summitLive = raceState.treaty.summitOpen;
    // Fund-as-actor latch (P7-3): belief.js's OWN gate predicate (credibility >
    // 0.65 AND F > 60), evaluated through `canActAsFund` and never re-derived from
    // raw credibility/F anywhere else. MONOTONE: once the desk has been a
    // fund-scale actor, Treasury's interest does not evaporate on a credibility
    // wobble -- so the treasury_backchannel beat cannot be raced by a one-quarter
    // dip. Mirrored read-only for event guards, like every other w.ai mirror.
    if (!_fundLive && canActAsFund(firmBelief(raceState))) _fundLive = true;
    w.ai.fundLive = _fundLive;
}
/** Public strait tension in [0,1] from world-state China proxies (phase 5a),
 *  fed to the strait generator so gray-zone / blockade hazard reads the same
 *  public tension the compute curve does. 0 outside Dynamic mode. */
function _straitTension() {
    return eventEngine ? straitTension(eventEngine.world.geopolitical) : 0;
}
/** Public export-control stage 0..3 (world.ai.exportControlStage, moved by policy
 *  events), fed to the race as the Tianxia compute dampener -- the straitTension
 *  precedent: an ORCHESTRATOR-PASSED input, never a race-side read of world state.
 *  0 outside Dynamic mode, which is the undamped baseline. */
function _exportControlStage() {
    return eventEngine ? (eventEngine.world.ai.exportControlStage || 0) : 0;
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
    const eq = Math.max(1, _portfolioEquity());
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
        evalsPush: !!playerChoices.lobbied_evals_regime,
        supervisionPush: !!playerChoices.lobbied_supervision,
        mobilizationPush: !!playerChoices.lobbied_mobilization,
        nationalizationPush: !!playerChoices.lobbied_nationalization,
        classificationPush: !!playerChoices.lobbied_classification,
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
        _develop('settlement');
        _toast('Consensus: ' + r.label + ' settled ' + r.outcome + ' — P&L ' + fmtDollar(r.pnl), 4500);
    }
    for (const r of fresh) {
        if (r.dispute === 'ruled') _fireRaceShell('dispute_ruled');
        else if (r.dispute === 'expired') _fireRaceShell('dispute_fallback');
        if (r.outcome === 'PENDING_CLOSEOUT'
            && portfolio.positions.some(p => p.type === 'binary' && p.strike === r.key)) {
            _toast('Consensus: ' + r.label + ' reached — held for terminal closeout.', 4500);
        }
    }
    return cashResults;   // per-position binary P&L (for the terminal scorecard)
}
/** Fire a race/policy shell event by id as a toast (phase 5a: dispute lifecycle
 *  narrative). Non-popup shells toast their headline; popup shells queue. */
function _fireRaceShell(id) {
    if (!eventEngine) return;
    const base = getEventById(id);
    if (!base) return;
    const r = eventEngine._fireEvent({ ...base }, sim, sim.day, 0, 0);
    if (r && r.queued) _queuePopup(r.event);
    else if (r && r.headline) _toast(r.headline, 5000);
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
function _runSubstep() {
    sim.substep();
    _clampRate();
    decayImpactVolumes();
    _syncAll();
    rehedgeMM(portfolio.positions);
    _onSubstepTick();
    // ---- Act III substep boundary ----
    tickSubstepClock();
    _drainDeferredFills();      // manual-order latency ladder: fills due at THIS substep
    _runStandingSubstepRules(); // P7-2 rule (f): the intraday precommitment, machinery-instant
    _fireSubstepArrival();      // the discretionary beat that landed intraday
    if (_laneLive() && !_gameOver) _processPopupQueue();
}

// ---------------------------------------------------------------------------
// Act III systemic layer (P7-1) -- driver, substep lane, latency ladder
// ---------------------------------------------------------------------------

/** The PUBLIC released frontier rung (world.ai mirror; 0 outside Dynamic modes).
 *  The same public act proxy `eta`, the base-rate scale, and the arc guards read
 *  -- never latent capability. */
function _frontierRung() {
    return eventEngine ? (eventEngine.world.ai.frontierRung || 0) : 0;
}
/** The PUBLIC controlRegime (world.ai mirror; 'private' outside Dynamic modes). */
function _regime() {
    return eventEngine ? (eventEngine.world.ai.controlRegime || 'private') : 'private';
}
/** Substep lag + spread multiplier for a MANUAL desk order right now. */
function _latency() {
    return raceState ? orderLatency(_frontierRung(), _regime()) : { lag: 0, spreadMult: 1 };
}
/** True while the substep event lane is open (Dynamic ∧ released R4+). */
function _laneLive() {
    return !!(eventEngine && eventEngine.substepLaneLive());
}

/**
 * Step the Act III driver one completed trading day and hand `x` to the audio
 * machine register. Reads the PUBLIC mirrors only. Dynamic modes only: in Classic
 * the driver is never stepped, x stays 0, and audio is never told anything.
 */
function _stepAct3() {
    const x = stepAct3Driver(_frontierRung(), _regime());
    setMachineIntensity(x);
    // The lane opens on the same public driver (02a: at released R4 the
    // discretionary pass moves to substep granularity).
    eventEngine.setSubstepLane(_frontierRung() >= SUBSTEP_LANE_RUNG);
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
    if (!dayInProgress) return fn();
    removeEventImpulseOverlay(sim, _savedImpulse);   // LIFO: impulse (innermost) first
    removeParamOverlays(sim, _savedOverlays);
    _savedImpulse = {};
    _savedOverlays = {};
    try {
        return fn();
    } finally {
        _savedOverlays = applyParamOverlays(sim);
        _savedImpulse = applyEventImpulseOverlay(sim);
        _syncAll();
    }
}

/** Fire the substep lane's arrival if one lands at this substep (P7-1). */
function _fireSubstepArrival() {
    if (!eventEngine || _gameOver) return;
    const idx = sim.substepsDone - 1;
    if (idx < 0) return;
    const ev = eventEngine.takeSubstepArrival(sim.day, idx);
    if (!ev) return;
    const netDelta = computeNetDelta();
    const { fired, popups } = _midDayBaseline(() => {
        const r = eventEngine.fireArrival(ev, sim, sim.day, netDelta);
        if (r.fired.length > 0 || r.popups.length > 0) sim.recomputeK();
        return r;
    });
    for (const p of popups) _queuePopup(p);
    for (const f of fired) {
        if (f.interjection) { _showInterjection(f.headline); continue; }
        let headline = f.headline;
        if (getTraitEffect('eventHintArrows', false) && f.params) {
            const _hintMu = f.params.mu || 0;
            if (_hintMu > 0) headline += ' \u2191';
            else if (_hintMu < 0) headline += ' \u2193';
        }
        const duration = f.magnitude === 'major' ? 8000 : f.magnitude === 'moderate' ? 5000 : 3000;
        _toast(headline, duration);
        const _mu = f.params?.mu || 0;
        if (_mu > 0.02) playStinger('positive');
        else if (_mu < -0.02) playStinger('negative');
        else playStinger('alert');
    }
    if (fired.length > 0 || popups.length > 0) {
        syncSettingsUI($, _simSettingsObj());
        _updateWire();
        updateCongressDiagrams($, eventEngine.world);
        updateStandings($, eventEngine.world, factions, getFactionDescriptor);
        bookDirty = true;
        dirty = true;
    }
}

/**
 * Execute the manual orders whose latency has elapsed (P7-1 agency migration).
 * The fill price is the price AT THIS SUBSTEP -- that is the point of the ladder.
 * Terminal / restriction state is re-checked HERE, at execution time: an order
 * placed before a freeze that lands after it is REJECTED with cash untouched --
 * including a working CLOSE, which `closePosition` itself would happily fill
 * (restriction is not one of its chokepoints), so the drop has to live here. The
 * MACHINERY's own liquidation of a restricted book is untouched: it never enters
 * this queue.
 */
function _drainDeferredFills() {
    if (workingOrderCount() === 0) return;
    const due = dueOrders();
    if (due.length === 0) return;
    if (_gameOver || portfolio.restricted) {
        _toast(due.length + ' working order' + (due.length > 1 ? 's' : '') + ' cancelled — the book is closed.', 4000);
        return;
    }
    for (const entry of due) _executeDeferred(entry);
    bookDirty = true;
    updateUI();
    dirty = true;
}

/**
 * Close one position at market -- the PLAYER's row button. Shared by the immediate
 * path and the deferred executor so the ladder can never change what a close
 * DOES, only when it prints. `spreadMult` omitted = the pre-P7 fill exactly.
 */
function _closePositionAction(id, spreadMult) {
    const ok = closePosition(sim, id, sim.S, market.sigma, sim.r, sim.day, sim.q, spreadMult);
    if (ok) _toast('Position closed.');
    bookDirty = true;
    updateUI();
    dirty = true;
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
        _toast('Unwound "' + name + '" (' + closed + ' position' + (closed > 1 ? 's' : '') + ').');
        bookDirty = true;
        updateUI();
        dirty = true;
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
            _toast('Working order outlived its contract — dropped, nothing filled.', 2500);
            _haptic('error');
            return;
        }
        const pos = executeMarketOrder(
            sim, p.type, p.side, p.qty, sim.S, market.sigma, sim.r, sim.day,
            p.strike, p.expiryDay, undefined, sim.q, mult
        );
        if (pos) {
            _develop('fill');
            const label = p.side === 'short' ? 'Shorted' : 'Bought';
            _toast(label + ' ' + p.qty + 'k ' + p.type + ' at $' + pos.fillPrice.toFixed(2), 3000);
            _haptic('success');
            if (p.type === 'stock') _recordImpact(sim.day, p.side === 'long' ? 1 : -1, p.qty, 'Stock trade');
        } else {
            // Margin, a short-sale ban that landed inside the window, any other
            // chokepoint: the order died at the fill and does not name a cause it
            // cannot know.
            _toast('Order died at the fill — margin or the rulebook moved inside the window.', 2500);
            _haptic('error');
        }
    } else if (entry.kind === 'compute') {
        const pos = executeMarketOrder(
            sim, 'computefuture', p.side, p.qty, sim.S, market.sigma, sim.r, sim.day,
            p.key, p.key, undefined, sim.q, mult
        );
        if (pos) {
            _develop('fill');
            _toast((p.side === 'long' ? 'Bought' : 'Sold') + ' ' + p.qty + 'k Compute Q@' + p.key, 2500);
            _haptic('success');
        } else {
            _toast('Compute order rejected at the fill — margin or book frozen.', 4000);
            _haptic('error');
        }
    } else if (entry.kind === 'binary') {
        const pos = executeBinaryTrade(p.key, p.side, p.qty, mult);
        if (pos) {
            _develop('fill');
            _toast((p.side === 'long' ? 'Bought' : 'Sold') + ' ' + p.qty + 'k Yes', 2500);
            _haptic('success');
        } else {
            _toast('Binary order rejected at the fill — cash or contract closed.', 4000);
            _haptic('error');
        }
    } else if (entry.kind === 'strategy') {
        if (executeWithRollback(p.legs, p.name, p.mult, mult)) _develop('fill');
    } else if (entry.kind === 'close') {
        // The position may have expired / settled / been flattened by machinery
        // while the close was working -- report it, never fabricate a fill.
        if (!_closePositionAction(p.id, mult)) {
            _toast('Working close expired — the position closed without you.', 4000);
        } else _develop('fill');
    } else if (entry.kind === 'unwind') {
        if (_unwindStrategyAction(p.name, mult) === 0) {
            _toast('Working unwind expired — no legs left in "' + p.name + '".', 4000);
        } else _develop('fill');
    } else if (entry.kind === 'reduce') {
        // A flatten leg that waited closes what its position still holds, or nothing.
        const res = _reduceLeg(p, mult);
        if (res.status === 'filled') {
            _develop('fill');
            _toast('Closed ' + (Math.round(res.qty * 100) / 100) + 'k ' + p.desc + '.', 3000);   /* PROSE */
            _haptic('success');
        } else if (res.status === 'reversed') {
            _toast('Working close skipped — ' + p.desc + ' changed sides inside the window.', 4000);   /* PROSE */
        } else if (res.status === 'gone') {
            _toast('Working close expired — the position closed without you.', 4000);
        } else {
            _toast('Order died at the fill — margin or the rulebook moved inside the window.', 2500);
            _haptic('error');
        }
    }
}

/** One flatten leg at the desk (02a "The flatten"): reduce-only, capped at what
 *  its position still holds, skipped when the position reversed sign. Shared by
 *  the immediate path and the deferred executor; an HCN leg records its impact
 *  like any ticket's stock leg. */
function _reduceLeg(p, spreadMult) {
    const res = reduceOnlyClose(sim, p.posId, p.side, p.qty, sim.S, market.sigma, sim.r, sim.day, sim.q, spreadMult);
    if (res.status === 'filled' && res.type === 'stock') _recordImpact(sim.day, p.side === 'long' ? 1 : -1, res.qty, 'Stock trade');
    return res;
}

/**
 * Route a manual desk action through the latency ladder: immediate at lag 0 (the
 * pre-P7 path, bit-identical), otherwise queued for `lag` substeps with the
 * ladder's spread multiplier applied at the fill. Returns true when the action
 * was deferred (the caller should not also execute it).
 */
function _deferManual(kind, payload) {
    const { lag, spreadMult } = _latency();
    if (lag <= 0) return false;
    deferOrder(kind, payload, lag, spreadMult);
    // Two registers (coordinator): the ordinary ladder is a queue you are no
    // longer at the front of; the advisory tier (mobilized+) is a queue you are
    // no longer certain to be IN.
    if (lag >= 6) {
        _toast('Routed for review — ' + lag + ' ticks, if nothing outranks it.', 2500);
    } else {
        _toast('Routed — ' + lag + ' tick' + (lag > 1 ? 's' : '') + ' to the front of the queue.', 2500);
    }
    _haptic('medium');
    return true;
}

// ---------------------------------------------------------------------------
// Pacing: to the next edition worth reading (02a "The evening")
// ---------------------------------------------------------------------------

/** The clock's rate in days a second: the skip's while one runs, otherwise the
 *  speed setting's, which a skip never changes. */
function _daysPerSec() { return _skipping ? SKIP_DAYS_PER_SEC : SPEED_OPTIONS[speedIndex]; }

/** Something worth reading happened: latched while a skip runs, taken at the close. */
function _worthReading(cause) { if (_skipping) _skipLatch.add(cause); }

/**
 * An actionable development the player did not make by hand (02a "Pacing"): a
 * resting order filling, a standing order trading, the player's own deferred
 * order completing under the ladder, exercise or assignment at expiry, a held
 * contract settling, a forced sale, a margin liquidation, or an obligation's
 * notice. Every site counts it (counters.js) and the skip latches it through
 * this one hook.
 * INTERPRETATION: the latch is fed only while a skip runs, so what happened
 * before the player pressed it (and has seen) never stops it.
 */
function _develop(kind) {
    countDevelopment(kind);
    _worthReading(kind === 'notice' ? 'notice' : 'development');
}

/** Start a skip from a paused or playing desk. Nothing in a finished run, while a
 *  dispatch holds the desk, or while a skip already runs. */
function skipToNextEdition() {
    if (_gameOver || _skipping || _popupBarrier()) return;
    _skipping = true;
    _skipLatch.clear();
    const log = eventEngine ? eventEngine.eventLog : [];
    _skipLogMark = log.length ? log[log.length - 1] : null;
    _resumeAfterDispatch = false;
    playing = true;
    lastTickTime = _resumeClockOrigin();
    _syncLerpSpeed();
    updatePlayBtn($, playing);
    _syncSkipBtn();
    _haptic('medium');
}

/**
 * End a skip. A stop (`cause`) pauses the desk and it stays paused: only play or
 * another skip resumes it, and answering the dispatch it stopped on does not.
 * Play, step, the terminal and a reset end a skip the same way, uncounted.
 */
function _endSkip(cause) {
    if (!_skipping) return;
    _skipping = false;
    _skipLatch.clear();
    playing = false;
    _resumeAfterDispatch = false;
    if (cause) countPause('skip:' + cause);
    _syncLerpSpeed();
    updatePlayBtn($, playing);
    _syncSkipBtn();
}

/** The skip control reads pressed while a skip runs and is disabled in a finished run. */
function _syncSkipBtn() {
    const b = $.skipBtn;
    if (!b) return;
    b.setAttribute('aria-pressed', String(_skipping));
    b.disabled = _gameOver;
}

/**
 * The end of every close (02a "Pacing"): a skip in progress stops at the first
 * of the close's stops (src/pacing.js), and this close's equity is the next
 * one's baseline for the book move.
 * INTERPRETATION: the run's first close measures from its starting equity (the
 * takeover's, or the cash start), the close before Edition 1 being the takeover.
 */
function _skipClose() {
    const equity = _portfolioEquity();
    const equityPrev = _prevCloseEquity ?? portfolio.initialCapital;
    _prevCloseEquity = equity;
    const log = eventEngine ? eventEngine.eventLog : [];
    const mark = _skipLogMark;
    _skipLogMark = log.length ? log[log.length - 1] : null;
    if (!_skipping) return;
    const cause = closeStop({
        extra: _skipLatch.has('extra'),
        majorWire: majorSince(log, mark),
        development: _skipLatch.has('development'),
        notice: _skipLatch.has('notice'),
        quarterLine: _skipLatch.has('quarter'),
        equityPrev, equity,
        day: sim.day,
        optionExpiries: portfolio.positions.filter(p => p.type === 'call' || p.type === 'put').map(p => p.expiryDay),
    });
    _skipLatch.clear();
    if (cause) _endSkip(cause);
}

// ---------------------------------------------------------------------------
// The flatten (02a "The evening")
// ---------------------------------------------------------------------------

/** A position the flatten can close: not a private stake, not a frozen,
 *  pending, disputed or settled Consensus leg or an untradeable compute future,
 *  and nothing on a restricted account or in a finished run. */
function _flattenable(pos) {
    if (_gameOver || portfolio.restricted || pos.type === 'privatestake') return false;
    if (pos.type === 'binary') {
        if (!raceState || !consensus.active || consensus.frozen) return false;
        const q = getBinaryQuote(pos.strike);
        return !!q && !q.settled && !q.frozen && !q.pending && !q.disputed;
    }
    if (pos.type === 'computefuture') return !!raceState && computeMarket.active && isComputeTradeable(pos.strike);
    return !isExpiredForTrading(pos.type, pos.expiryDay, sim.day);
}

/**
 * Load the flatten (X, or the book's Flatten): a closing leg for every position
 * that can trade, reduce-only, carrying the position's id and strategy name, the
 * ticket at size one, and the Markets page shown. The rest are named under it.
 */
function _loadFlatten() {
    const legs = [], off = [];
    for (const pos of portfolio.positions) {
        if (!_flattenable(pos)) { off.push(positionLabel(pos, sim.day)); continue; }
        const keyed = pos.type === 'binary' || pos.type === 'computefuture';
        legs.push({
            posId: pos.id, strategyName: pos.strategyName || null, type: pos.type, qty: -pos.qty,
            strike: keyed ? undefined : pos.strike, key: keyed ? pos.strike : undefined, expiryDay: pos.expiryDay,
        });
    }
    loadFlatten(legs, off);
    showPage('markets');
    _haptic('light');
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
    if (cancelled) parts.push(`${cancelled} order${cancelled > 1 ? 's' : ''} cancelled`);   /* PROSE */
    if (ok) parts.push(legs.length === 1 ? 'filled' : `${ok} leg${ok > 1 ? 's' : ''} filled`);
    if (deferred) parts.push(`${deferred} working`);
    if (skipped.length) parts.push(`nothing left to close: ${skipped.join(', ')}`);   /* PROSE */
    if (failed.length) parts.push(`rejected (margin, or the contract closed): ${failed.join(', ')}`);
    const msg = parts.join('; ') || 'Nothing traded';
    _toast(msg.charAt(0).toUpperCase() + msg.slice(1) + '.', failed.length ? 5000 : 3000);
    _haptic(failed.length ? 'error' : 'success');
    bookDirty = true;
    updateUI();
    dirty = true;
}

// ---------------------------------------------------------------------------
// Standing orders (P7-2) -- the delegation layer's wiring
// ---------------------------------------------------------------------------

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
        _toast(rep.message, 4500);
        if (rep.legs > 0) _develop('standing');   // a refusal traded nothing
    }
    _haptic('medium');
    bookDirty = true;
    updateUI();
    dirty = true;
}

/** Day-boundary standing orders (rules a / b / d). Dynamic modes only, and never
 *  after the terminal latch. Evaluated once the day's race ledger, settlements
 *  and quote refresh are final: (a) sees today's detections, (d) sees the
 *  certified world at live quotes. Reads the PUBLIC blockade mirror. */
function _runStandingDayRules() {
    if (!raceState || !eventEngine || _gameOver) return;
    _reportStanding(runDayBoundaryRules({
        ..._standingCtx(),
        transitions: raceState.lastTransitions,
        blockade: !!eventEngine.world.geopolitical.taiwanBlockade,
    }));
}

/** Substep standing orders (rule f). Runs at the substep boundary AFTER the
 *  deferred manual fills have landed, so the delta it flattens is the true
 *  post-fill book. The move is measured against the day's OPEN. */
function _runStandingSubstepRules() {
    if (!raceState || !eventEngine || _gameOver) return;
    _reportStanding(runSubstepRules({
        ..._standingCtx(),
        dayOpen: sim._partial ? sim._partial.open : sim.S,
    }));
}

/** Panel toggle handler: arm / disarm one rule. `setArmed` refuses before the
 *  unlock, after the R5 lock and past the terminal freeze -- re-render either way
 *  so the panel always shows the engine's real state, never the click's. */
function _onStandingToggle(id, on) {
    const applied = setStandingArmed(id, on);
    if (!applied) _toast(STANDING_COPY.refusedEdit, 3000);
    updateStandingOrdersPanel($, raceState ? standingOrdersView() : null, _onStandingToggle);
    _haptic('light');
}

// ---------------------------------------------------------------------------
// The book's sparkline: its value, and holding HCN beside it
// ---------------------------------------------------------------------------

/** Both histories backfill with holding HCN over the prepopulated year: the book
 *  starts as cash on day 0, so before it the two lines are one. */
function _initPortfolioHistory() {
    portfolioHistory = createSparkHistory(HISTORY_CAPACITY);
    benchHistory = createSparkHistory(HISTORY_CAPACITY);
    const h = sim.history;
    const cap = portfolio.initialCapital;
    for (let d = h.minDay; d <= h.maxDay; d++) {
        const bar = h.get(d);
        if (bar) { pushSparkSample(portfolioHistory, cap / 100 * bar.close); pushSparkSample(benchHistory, cap / 100 * bar.close); }
    }
}

const _bookHistories = () => ({ value: portfolioHistory, bench: benchHistory });

// ---------------------------------------------------------------------------
// Lazy chain pricing helpers
// ---------------------------------------------------------------------------

/** Price one skeleton expiry on demand (price-only, no greeks). */
function _priceExpiry(idx) {
    if (idx < 0 || idx >= chainSkeleton.length) return null;
    return priceChainExpiry(sim.S, sim.v, sim.r, chainSkeleton[idx], false, sim.q);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

cacheDOMElements($);
$.regulationsList = document.getElementById('regulations-list');
init();

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

function init() {
    // The retired LLM mode stored an API key here; a stale key should not linger in the browser.
    try { localStorage.removeItem('shoals_llm_key'); localStorage.removeItem('shoals_llm_model'); } catch { /* storage unavailable */ }

    // 0. The colophon (play, step, theme, help) and the Brief's pages. Reduced
    //    motion opens on a still, complete frame; otherwise the desk is already
    //    trading when the page appears.
    const _reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    playing = !_reduced;
    let _about = null;
    _colophon.mount({
        themeKey: 'shoals-theme',
        playing,
        onPlay: () => { togglePlay(); return playing; },
        onStep: () => step(),
        onTheme: () => _onThemeChange(),
        onHelp: () => { if (_about) _about.show(); },
    });
    initPages(_onPageChange);
    initBrief();
    initAlmanacView();

    // 1. Create the tape's renderer
    chart    = new ChartRenderer($.chartCanvas);

    // 2. Create camera for horizontal chart pan/zoom
    if (typeof createCamera !== 'undefined') {
        // Camera zoom = pixels per world unit. 1 world unit = 1 day.
        const DEFAULT_ZOOM = CHART_SLOT_PX;
        const vpW = $.chartCanvas.clientWidth  || $.chartCanvas.offsetWidth  || 800;
        const vpH = $.chartCanvas.clientHeight || $.chartCanvas.offsetHeight || 600;
        camera = createCamera({
            width:   vpW,
            height:  vpH,
            x:       -(vpW / 2 - CHART_LEFT_MARGIN) / DEFAULT_ZOOM,
            zoom:    DEFAULT_ZOOM,
            minZoom: DEFAULT_ZOOM,
            maxZoom: DEFAULT_ZOOM * 3,
            onUpdate: () => { dirty = true; },
        });

        // 3. Bind camera to chart canvas
        camera.bindWheel($.chartCanvas);
        camera.bindMousePan($.chartCanvas, { button: 0 });
        camera.bindTouch($.chartCanvas);
        camera.bindZoomButtons({
            zoomIn:  $.zoomInBtn,
            zoomOut: $.zoomOutBtn,
            reset:   $.zoomResetBtn,
            display: $.zoomLevel,
            formatZoom: (z) => Math.round(z / DEFAULT_ZOOM * 100) + '%',
            onReset: () => {
                camera.zoom = DEFAULT_ZOOM;
                _repositionCamera();
            },
        });

        // 4. Attach camera to chart renderer
        chart.setCamera(camera);
    }

    // 8. Init keyboard shortcuts

    var _shortcuts = [
        // Space on a focused button (e.g. a popup choice) keeps its native activation
        { key: 'space', label: 'Play / pause',   group: 'Simulation', action: () => togglePlay(),
          when: () => !(document.activeElement && document.activeElement.tagName === 'BUTTON') },
        { key: '.', label: 'Speed up',            group: 'Simulation', action: () => cycleSpeed() },
        { key: ',', label: 'Slow down',            group: 'Simulation', action: () => decycleSpeed() },
        { key: '/', label: 'Step forward one day', group: 'Simulation', action: () => step() },
        { key: 'n', label: 'To the next edition worth reading', group: 'Simulation', action: () => skipToNextEdition() },
        { key: 'r', label: 'Reset simulation',    group: 'Simulation', action: () => resetSim() },
        { key: 's', label: 'Show or hide your book', group: 'View',   action: () => _toggleRail() },
        { key: '[', label: 'Previous page',        group: 'View',       action: () => cyclePage(-1) },
        { key: ']', label: 'Next page',            group: 'View',       action: () => cyclePage(1) },
        { key: 'f', label: 'Front page',           group: 'View',       action: () => showPage('front') },
        { key: 'm', label: 'Markets',              group: 'View',       action: () => showPage('markets') },
        { key: 'g', label: 'Race',                 group: 'View',       action: () => showPage('race') },
        { key: 'd', label: 'Meridian',             group: 'View',       action: () => showPage('meridian') },
        { key: '=', label: 'Zoom in',              group: 'View',       action: () => { if (camera) camera.zoomBy(1.2); } },
        { key: '-', label: 'Zoom out',             group: 'View',       action: () => { if (camera) camera.zoomBy(1 / 1.2); } },
        { key: '0', label: 'Reset zoom',           group: 'View',       action: () => { if (camera) { camera.zoom = CHART_SLOT_PX; _repositionCamera(); } } },
        { key: 'Enter', label: 'Trade the ticket', group: 'Trade',      action: () => { if (currentPage() === 'markets') tradeTicket(); },
          when: () => !document.activeElement || document.activeElement === document.body },
        { key: 'x', label: 'Load the flatten', group: 'Trade', action: () => _loadFlatten() },
        { key: '1', label: PRESETS[0].name,   group: 'Presets',    action: () => loadPreset(0) },
        { key: '2', label: PRESETS[1].name,   group: 'Presets',    action: () => loadPreset(1) },
        { key: '3', label: PRESETS[2].name,   group: 'Presets',    action: () => loadPreset(2) },
        { key: '4', label: PRESETS[3].name,   group: 'Presets',    action: () => loadPreset(3) },
        { key: '5', label: PRESETS[4].name,   group: 'Presets',    action: () => loadPreset(4) },
        { key: '6', label: PRESETS[5].name,   group: 'Presets',    action: () => loadPreset(5) },
    ];

    if (typeof initShortcuts !== 'undefined') {
        initShortcuts(_shortcuts, { helpTitle: 'Shoals keyboard shortcuts' });
    }

    if (typeof initAboutPanel === 'function') {
        _about = initAboutPanel({
            title: 'Shoals',
            lastUpdated: '2026-10-24',
            description: 'Trade stock, bonds, VXHCN volatility futures, and American options in a stochastic market simulator. Build multi-leg strategies, manage a margin portfolio, and navigate branching institutional events during a volatile political term.',
            controls: [
                { label: 'Trade', value: 'Pick points on the Markets page’s curves onto the ticket, then Trade (or Enter)' },
                { label: 'Every contract', value: 'Open a curve by its title for its table; right-click goes short' },
                { label: 'Strategies', value: 'Load or save them on the ticket' },
                { label: 'Your forecast', value: 'Drag the beads on the Race page, or focus the ladder and use the arrows' },
                { label: 'Pan / zoom the tape', value: 'Drag to pan, = / - / 0 to zoom' },
                { label: 'Pages', value: '[ previous, ] next; F, M, G, D for front, markets, race, Meridian' },
                { label: 'Speed', value: '. faster, , slower, / step' },
                { label: 'Load preset', value: 'Meridian’s settings, or keys 1\u20136' },
            ],
            shortcuts: _shortcuts,
            repo: 'https://github.com/a9lim/shoals',
        });
    }

    // 9. Bind UI events
    bindEvents($, {
        onSpeedUp:        () => cycleSpeed(),
        onSpeedDown:      () => decycleSpeed(),
        onPresetChange:   (index) => loadPreset(index),
        onReset:          () => resetSim(),
        onSliderChange:   (param, value) => syncSliderToSim(param, value),
    });
    if ($.skipBtn) $.skipBtn.addEventListener('click', () => skipToNextEdition());
    if ($.bookFlatten) $.bookFlatten.addEventListener('click', () => _loadFlatten());
    _syncSkipBtn();

    // 10. Wire custom events from ui.js position rows
    document.addEventListener('shoals:closePosition', (e) => {
        const id = e.detail && e.detail.id;
        if (id != null) {
            // P7-1 ladder (02a "Act III"): a PLAYER exit takes the same lag as an
            // entry -- exits are not faster than entries in a market made of
            // machines. Machinery-initiated closes (expiry, margin trims, popup
            // trades, terminal liquidation) never route through here.
            if (_deferManual('close', { id })) { updateUI(); dirty = true; return; }
            _closePositionAction(id);
        }
    });

    document.addEventListener('shoals:exerciseOption', (e) => {
        const id = e.detail && e.detail.id;
        if (id != null) {
            // Capture qty before exercise removes the position
            const pos = portfolio.positions.find(p => p.id === id);
            const qty = pos ? pos.qty : 0;
            const isCall = pos && pos.type === 'call';
            const result = exerciseOption(id, sim.S, sim.day, market.sigma, sim.r, sim.q);
            if (result && qty > 0) {
                _recordImpact(sim.day, isCall ? 1 : -1, qty, 'Option exercise');
            }
            _toast(result ? 'Option exercised.' : 'Cannot exercise.');
            bookDirty = true;
            updateUI();
            dirty = true;
        }
    });

    document.addEventListener('shoals:cancelOrder', (e) => {
        const id = e.detail && e.detail.id;
        if (id != null) {
            cancelOrder(id);
            _toast('Order cancelled.');
            updateUI();
            dirty = true;
        }
    });

    // A position's name in the book hands its contract to the ticket, on its side.
    document.addEventListener('shoals:toTicket', (e) => {
        const pos = portfolio.positions.find(p => p.id === (e.detail && e.detail.id));
        if (!pos) return;
        const keyed = pos.type === 'binary' || pos.type === 'computefuture';
        addToTicket({
            id: pos.type === 'stock' ? 'stock' : pos.type === 'bond' ? 'bond@' + pos.expiryDay : pos.type === 'vxhcnfuture' ? 'vx@' + pos.expiryDay
                : pos.type === 'binary' ? 'bin@' + pos.strike : pos.type === 'computefuture' ? 'cmp@' + pos.strike : `${pos.type}${pos.strike}@${pos.expiryDay}`,
            type: pos.type, strike: keyed ? undefined : pos.strike, key: keyed ? pos.strike : undefined,
            expiryDay: pos.expiryDay, desc: 'that contract',
        }, pos.qty > 0 ? 1 : -1);
        showPage('markets');
    });

    document.addEventListener('shoals:unwindStrategy', (e) => {
        const name = e.detail && e.detail.name;
        if (!name) return;
        // P7-1 ladder: the strategy-unwind button is a player exit too, and it
        // defers as ONE unit (all legs at the execution substep) exactly like the
        // strategy ENTRY does.
        if (_deferManual('unwind', { name })) { updateUI(); dirty = true; return; }
        _unwindStrategyAction(name);
    });

    // 11. Init audio on first user interaction (Web Audio API requires gesture)
    function _initAudioOnce() {
        initAudio();
        setAmbientMood('calm');
        document.removeEventListener('click', _initAudioOnce);
        document.removeEventListener('keydown', _initAudioOnce);
    }
    document.addEventListener('click', _initAudioOnce, { once: true });
    document.addEventListener('keydown', _initAudioOnce, { once: true });

    // 11b. Reduced motion (P7-1): the Act III degradation keeps its STALENESS
    //      (information the player is meant to feel) and drops the STUTTER (the
    //      transient wrong print, the sparkline frame-skip) for anyone who asked
    //      the platform for less motion. Live-updating, so a mid-session change
    //      to the OS preference takes effect.
    if (typeof matchMedia === 'function') {
        const _rm = matchMedia('(prefers-reduced-motion: reduce)');
        setReducedMotion(_rm.matches);
        if (typeof _rm.addEventListener === 'function') {
            _rm.addEventListener('change', (e) => setReducedMotion(e.matches));
        }
    }

    // 12. Wire info tips for slider labels
    wireInfoTips();

    // 12b. Wire reference overlay
    const openReference = initReferenceOverlay(
        document.getElementById('reference-overlay'),
        document.getElementById('reference-title'),
        document.getElementById('reference-body'),
        document.getElementById('reference-close'),
        REFERENCE
    );
    bindReferenceTriggers(openReference);

    // 13. Pre-populate full history buffer (prices scaled so final close = $100)
    sim.prepopulate();
    _syncAll();
    _initPortfolioHistory();
    chart.dayOrigin = sim.day;

    // 14. Build initial chain and update UI
    expiryMgr.init(sim.day);
    chainSkeleton = buildChainSkeleton(sim.S, sim.day, expiryMgr.update(sim.day));
    syncSettingsUI($, _simSettingsObj());
    updatePlayBtn($, playing);
    updateSpeedBtn($, SPEED_OPTIONS[speedIndex] * 2);
    _syncLerpSpeed();

    // 14b. Initialize event engine for dynamic presets
    if (_isDynamicPreset(DEFAULT_PRESET)) {
        eventEngine = new EventEngine();
        // Faction state lives in faction-standing.js; attach by reference so events can read it
        eventEngine.world.factions = factions;
        // Hidden AI-race state machine (overhaul phase 1): wired but invisible.
        raceState = createRaceState();
        // Attach the race by reference for the non-popup raceEffects chokepoint (P6-2).
        eventEngine.race = raceState;
        // Player cost-of-capital coupling + complicity ledger (P6-2): activate.
        resetCoupling();
        resetLedger();
        // Consensus milestone binaries (overhaul phase 3a): list contracts + prime quotes.
        initConsensus(raceState);
        // Compute-futures term structure (overhaul phase 3b): list ladder + prime curve.
        initComputeMarket(raceState, eventEngine.world.geopolitical);
        // Market belief B + belief-backed quoters + player/firm belief (phase 4).
        initBelief(raceState);
        initValuation(raceState);
        initRounds(raceState);
        // chinaTrue intel reliability stream (P7-3): its own module-local RNG,
        // seeded OUTSIDE race.streams so intel beats cannot perturb the race.
        initIntel(raceState);
        _wireBeliefQuoters();
        refreshBinaryQuotes(raceState);
        refreshComputeQuotes(raceState, eventEngine.world.geopolitical);
        _dealOpeningHand();
    } else {
        deactivateConsensus();
        deactivateComputeMarket();
        deactivateBelief();
        deactivateIntel();
        deactivateCoupling();
        deactivateLedger();
        _unwireBeliefQuoters();
    }
    updateDynamicSections($, DEFAULT_PRESET);
    _updateWire();
    updateCongressDiagrams($, eventEngine ? eventEngine.world : null);
    if (eventEngine) updateStandings($, eventEngine.world, factions, getFactionDescriptor);
    _updateLobbyPills();

    // Wire lobby pill buttons
    if ($.lobbyBar) {
        $.lobbyBar.addEventListener('click', (e) => {
            if (!eventEngine) return;
            const btn = e.target.closest('.lobby-pill');
            if (!btn || btn.disabled) return;
            const actionId = btn.dataset.lobby;
            const day = sim.history.maxDay;
            const result = executeLobbyAction(actionId, day, eventEngine.world);
            if (result) {
                portfolio.cash -= result.cost;
                if (result.playerFlag) playerChoices[result.playerFlag] = day;
                else playerChoices['lobbied_' + actionId] = day;
                _lobbyCount++;
                _toast('Lobbying: ' + result.action.name + (result.cost > 0 ? ' (-$' + result.cost + 'k)' : ''), 3000);
                _updateLobbyPills();
                dirty = true;
            }
        });
    }

    updateUI();

    _syncMasthead(true);

    // 15. Position camera so latest candle is visible
    _repositionCamera();

    // 16. Wire resize via ResizeObserver on chart container
    // This fires during CSS sidebar transition AND window resize.
    // We must redraw IMMEDIATELY after resize (same call stack) because
    // setting canvas.width clears the buffer — if we wait for the next
    // rAF frame, the user sees a blank flash.
    const chartContainer = document.getElementById('chart-container');
    let prevViewW = $.chartCanvas.clientWidth || $.chartCanvas.offsetWidth || 800;
    function handleResize() {
        if (!chartContainer.clientWidth) return;   // the front page is hidden
        chart.resize();
        const newW = $.chartCanvas.clientWidth  || $.chartCanvas.offsetWidth  || 800;
        const newH = $.chartCanvas.clientHeight || $.chartCanvas.offsetHeight || 600;
        if (camera) {
            // Shift camera so the right edge stays anchored during sidebar slide
            const dw = newW - prevViewW;
            if (dw !== 0) camera.panBy(dw / 2, 0);
            camera.setViewport(newW, newH);
        }
        prevViewW = newW;
        // Immediate redraw to avoid blank frame
        renderCurrentView();
        dirty = false; // already rendered this frame
    }
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(handleResize).observe(chartContainer);
    } else {
        window.addEventListener('resize', handleResize);
    }

    // 17. Wire mousemove/mouseleave on chart canvas for crosshair
    $.chartCanvas.addEventListener('mousemove', (e) => {
        const rect = $.chartCanvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        dirty = true;
    });
    $.chartCanvas.addEventListener('mouseleave', () => {
        mouseX = -1;
        mouseY = -1;
        dirty = true;
    });

    // The markets page and its ticket read the engines through one context. The
    // opened Options table reads the published chain (Act III may hold it).
    const _mkCtx = {
        sim,
        expiries: () => chainSkeleton,
        race: () => raceState,
        geo: () => (eventEngine ? eventEngine.world.geopolitical : null),
        origin: () => chart.dayOrigin,
        positions: () => portfolio.positions,
        chain: (day) => {
            const idx = chainSkeleton.findIndex(e => e.day === day);
            return idx < 0 ? null : publishedChain(_priceExpiry(idx), substepClock());
        },
        vxVariance: () => publishedVariance(market.v),
        vxSpot: () => publishedVxhcn(market.vxhcn),
        expiryDay: () => smileExpiryDay(),
        spreadMult: () => _latency().spreadMult,   // the ladder's multiple now (the flatten's estimate)
    };
    initTicket(_mkCtx, {
        onChange: () => { redrawMarkets(); setFolioCount('markets', ticketLegCount()); },
        onTrade: (order) => _tradeTicket(order),
        toast: (msg) => _toast(msg, 2500),
    });
    initMarkets(_mkCtx, { onPick: (pt, side) => pickPoint(pt, side), legState });
    initSurface();
    marketsDayClose(null);
    initRacePage({ race: () => raceState, world: () => (eventEngine ? eventEngine.world : null) }, {
        onEdit: () => redrawMarkets(),
    });
    resetRacePage();
    document.getElementById('race-epilogue').addEventListener('click', () => { if (_epilogueReopen) _epilogueReopen(); });

    // Volume (Meridian's settings)
    const _vol = document.getElementById('volume-slider');
    if (_vol) {
        _vol.value = Math.round(getVolume() * 100);
        document.getElementById('volume-val').textContent = _vol.value + '%';
        _forms.bindSlider(_vol, document.getElementById('volume-val'), v => setVolume(v / 100), v => Math.round(v) + '%');
    }

    // 19. Debug console API — use window._debug in the browser console. The
    //     interruption counters (02a "Interruption counters") read as shoalsCounts().
    window.shoalsCounts = () => counts();
    window._debug = {
        sim, portfolio, market, factions,
        get eventEngine() { return eventEngine; },
        get world() { return eventEngine?.world; },
        popupQueue: _popupQueue,
        /** Fire any event by id. Toast events apply immediately; popup events queue. */
        fireEvent(id) {
            const ev = getEventById(id);
            if (!ev) { console.error(`No event with id "${id}"`); return; }
            if (!eventEngine) { console.error('eventEngine is null (not in Dynamic mode)'); return; }
            const result = eventEngine._fireEvent(ev, sim, sim.day, 0, 0);
            if (result.queued) { _queuePopup(result.event); _processPopupQueue(); }
            else { _updateWire(); updateCongressDiagrams($, eventEngine.world); updateStandings($, eventEngine.world, factions, getFactionDescriptor); }
            console.log('Fired:', ev.id, result);
            return result;
        },
        /** Show an arbitrary popup (no event engine needed). */
        popup(headline, context, choices) {
            _queuePopup({ headline, context, choices: choices || [{ label: 'OK', desc: 'Dismiss' }], popup: true });
            _processPopupQueue();
        },
        /** Show a toast message. */
        toast(msg, ms) { _toast(msg, ms || 3000); },
        /** List all event ids, optionally filtered by substring. */
        listEvents(filter) {
            const list = ALL_EVENTS.map(e => ({ id: e.id, category: e.category, magnitude: e.magnitude, popup: !!e.popup, superevent: !!e.superevent }));
            if (filter) return list.filter(e => e.id.includes(filter) || (e.category && e.category.includes(filter)));
            return list;
        },
    };

    // 20. Start animation loop
    requestAnimationFrame(frame);

    // 21. Canvas text is rasterized with whatever face is ready; redraw the
    // active view once the shared text faces have loaded so no fallback labels linger.
    window._loadTextFonts().then(() => { dirty = true; });
}

// ---------------------------------------------------------------------------
// frame — rAF loop
// ---------------------------------------------------------------------------

/** A page switch (pages.js). The front page re-syncs the tape's buffer, which
 *  was zero-sized while hidden; Markets reprices the ticket. */
function _onPageChange(page) {
    if (page === 'front') {
        chart.resize();
        _repositionCamera();
    }
    setMarketsVisible(page === 'markets');
    if (page === 'markets') renderTicket();
    setRaceVisible(page === 'race');
    if (page === 'meridian') {
        renderHandover(dealtFixture());
        renderAlmanac();
        _updateRegulationDisplay();
        _updateLobbyPills();
        if (eventEngine) updateStandings($, eventEngine.world, factions, getFactionDescriptor);
    }
    dirty = true;
}

/** Theme flipped (colophon): canvases re-read the palette on their next draw. */
function _onThemeChange() {
    updateUI();
    redrawMarkets();
    redrawTicket();
    drawRace();
    if (currentPage() === 'meridian') renderAlmanac();
    dirty = true;
}

/**
 * Trade the ticket through the desk's own paths (ticket.js builds the order).
 * A named strategy goes as one unit: every leg or none, through the latency
 * ladder as a 'strategy', or resting as a strategy limit or stop. Otherwise each
 * leg goes alone: a single leg may rest as a limit or stop; market legs go as
 * manual orders (the ladder and spread apply, as to any click), binaries through
 * executeBinaryTrade, compute through the compute chokepoint. The toast reports
 * what filled.
 */
function _tradeTicket(order) {
    if (_blockedByRestriction()) return;
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
            _toast(`Resting ${order.order} for ${mult}k ${order.name}, when HCN ${order.order === 'limit' ? '≤' : '≥'} ${order.trigger}.`);
            _haptic('medium');
        }
        bookDirty = true;
        updateUI();
        dirty = true;
        return;
    }
    if (order.order !== 'market' && order.legs.length === 1) {
        const L = order.legs[0];
        placePendingOrder(L.type, L.side, L.qty, order.order, order.trigger, L.strike, L.expiryDay);
        const below = (order.order === 'limit') === (L.side === 'long');
        _toast(`Resting ${order.order}: ${L.side} ${L.qty}k ${L.desc}, when HCN ${below ? '≤' : '≥'} ${order.trigger}.`);
        _haptic('medium');
        bookDirty = true;
        updateUI();
        dirty = true;
        return;
    }
    let ok = 0, deferred = 0;
    const failed = [];
    for (const L of order.legs) {
        let res = null;
        if (L.type === 'binary') {
            if (!raceState || !consensus.active) { failed.push(L.desc); continue; }
            if (_deferManual('binary', { key: L.key, side: L.side, qty: L.qty })) { deferred++; continue; }
            res = executeBinaryTrade(L.key, L.side, L.qty);
        } else if (L.type === 'computefuture') {
            if (!raceState || !computeMarket.active) { failed.push(L.desc); continue; }
            if (_deferManual('compute', { key: L.key, side: L.side, qty: L.qty })) { deferred++; continue; }
            res = executeMarketOrder(sim, 'computefuture', L.side, L.qty, sim.S, market.sigma, sim.r, sim.day, L.key, L.key, undefined, sim.q);
        } else {
            if (_deferManual('market', { type: L.type, side: L.side, qty: L.qty, strike: L.strike, expiryDay: L.expiryDay })) { deferred++; continue; }
            res = executeMarketOrder(sim, L.type, L.side, L.qty, sim.S, market.sigma, sim.r, sim.day, L.strike, L.expiryDay, undefined, sim.q);
            if (res && L.type === 'stock') _recordImpact(sim.day, L.side === 'long' ? 1 : -1, L.qty, 'Stock trade');
        }
        if (res) ok++; else failed.push(L.desc);
    }
    const parts = [];
    if (ok) parts.push(order.legs.length === 1 ? 'Filled' : `${ok} leg${ok > 1 ? 's' : ''} filled`);
    if (deferred) parts.push(`${deferred} working`);
    if (failed.length) parts.push(`rejected (margin, or the contract closed): ${failed.join(', ')}`);
    _toast((parts.join('; ') || 'Nothing traded') + '.', failed.length ? 5000 : 3000);
    _haptic(failed.length ? 'error' : 'success');
    bookDirty = true;
    updateUI();
    dirty = true;
}

/** S: hide or show the book beside the tape (the tape takes the width). */
function _toggleRail() {
    document.body.classList.toggle('rail-off');
    _haptic('light');
}

/** The run-relative day of the edition being traded (day 0 is Edition 1). */
function _relDay() { return sim.day - chart.dayOrigin; }

/** The dateline's regime: the Classic preset, or the race's control regime. */
function _regimeLabel() {
    const idx = $.presetSelect.selectedIndex;
    if (!_isDynamicPreset(idx)) return PRESETS[idx] ? PRESETS[idx].name : '';
    const reg = raceState ? raceState.controlRegime : 'private';
    return 'Dynamic, ' + reg;
}

function _tapeSnapshot() {
    const prev = sim.history.get(sim.day - 1);
    return { S: sim.S, prevClose: prev ? prev.close : sim.S, vx: market.vxhcn || 0, rate: sim.r, rel: _relDay() };
}

/** Repaint the masthead's dateline (cheap; brief.js writes only on change) and
 *  the tape's caption. */
function _syncMasthead(force = false) {
    const t = _tapeSnapshot();
    if (!_capFront) _capFront = _colophon.caption(document.getElementById('cap-front'), 400);
    const bar = sim.history.last();
    if (bar) {
        // The dateline carries the price and the session's change.
        _capFront(`HCN · range ${bar.low.toFixed(2)}–${bar.high.toFixed(2)}`, force);
    }
    updateMasthead({
        rel: _relDay(), regime: _regimeLabel(), S: t.S, prevClose: t.prevClose,
        vx: _publishVxhcn(), rate: t.rate, equity: _portfolioEquity(), initial: portfolio.initialCapital,
    });
}

/** The wire: the front page's lead and the whole wire under it. */
function _updateWire() {
    const log = eventEngine ? eventEngine.eventLog : [];
    renderWire(log, chart.dayOrigin, _tapeSnapshot());
    // Archived items (the predecessor's reports) predate the term: no news day on the tape.
    chart.setNews(log.filter(e => !e.archive).map(e => ({ day: e.day, head: splitHeadline(e.headline).head, major: e.magnitude === 'major' })));
    dirty = true;
}

/** Redraw the tape (the one rAF-driven canvas). Called from frame() and handleResize(). */
function renderCurrentView() {
    if (currentPage() !== 'front') return;
    chart.draw(sim.history, portfolio.positions, mouseX, mouseY, sim.history.last());
}

/**
 * Open a trading day: install the Layer-3 param overlay + the decaying event-
 * impulse overlay (nested innermost over Layer-3), then beginDay. The overlays
 * affect ONLY the day's substep integration -- the price PATH -- and are removed
 * in `_closeTradingDay` BEFORE any day-complete bookkeeping. Shared by frame() /
 * tick() / step() so the step button applies impulses too.
 */
function _beginTradingDay() {
    _savedOverlays = applyParamOverlays(sim);
    _savedImpulse = applyEventImpulseOverlay(sim);
    sim.beginDay();
    dayInProgress = true;
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
    dayInProgress = false;
    removeEventImpulseOverlay(sim, _savedImpulse);   // LIFO: impulse (innermost) first
    removeParamOverlays(sim, _savedOverlays);
    _savedImpulse = {};
    _savedOverlays = {};
    _syncAll();
}

/**
 * The POPUP BARRIER (02a "Act III"): true while a decision is on screen or
 * still waiting. While it holds, `_closeTradingDay` / `_onDayComplete` may NOT run
 * on ANY path (frame / tick / step) -- the day stays open, overlays installed,
 * until the player has answered. Without it a substep-lane arrival at substep 15
 * would let the world advance race / treaty / belief / settlements underneath the
 * open decision, landing the choice's deltas and `raceEffects` one race tick late.
 *
 * Two halves, both required: an event already SHOWN has been shifted OFF the queue
 * (so the overlay is the only evidence), and an event still QUEUED is waiting its
 * turn behind the one on screen. A pending terminal epilogue bars the close
 * outright -- nothing ticks after the latch. Nothing holds a day for the
 * forecast (02a "The standing policy").
 */
function _popupBarrier() {
    if (_popupQueue.length > 0 || _pendingEpilogue) return true;
    const ov = $.popupOverlay;
    return !!(ov && !ov.classList.contains('hidden'));
}

/**
 * Close a day whose substeps finished while the barrier held, SYNCHRONOUSLY from
 * the drain (02a "Act III"): the player never presses play to collect a day
 * the world already finished. Called from the popup-dismissal callback, after its
 * own `_processPopupQueue` has had the chance to show the next queued beat.
 *
 * `dayInProgress` is the idempotency predicate, not `sim.dayComplete`:
 * `_closeTradingDay` clears the flag BEFORE `_onDayComplete` runs, so the
 * re-entrant `_processPopupQueue()` at the tail of `_onDayComplete` -- and every
 * dismissal callback downstream of it -- finds the day already closed.
 */
function _closeCompletedDayIfPending() {
    if (_gameOver || !dayInProgress || !sim.dayComplete) return;
    if (_popupBarrier()) return;
    _closeTradingDay();
    _onDayComplete();
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
    if (!dayInProgress) return;
    dayInProgress = false;
    removeEventImpulseOverlay(sim, _savedImpulse);   // LIFO: impulse (innermost) first
    removeParamOverlays(sim, _savedOverlays);
    _savedImpulse = {};
    _savedOverlays = {};
    _syncAll();
}

function frame(now) {
    if (playing) {
        // A skip runs the same loop at its own rate: at most one day closes a frame.
        const tickInterval = 1000 / _daysPerSec();
        const substepInterval = tickInterval / INTRADAY_STEPS;

        if (!dayInProgress) {
            // Start a new day if enough time has passed since last tick
            if (now - lastTickTime >= tickInterval) {
                _beginTradingDay();
                // Advance by tickInterval (not now) to avoid drift; clamp
                // to prevent burst catch-up after tab was backgrounded
                lastTickTime = Math.max(lastTickTime + tickInterval, now - tickInterval);
                chart.setLiveCandle(sim._partial);
                dirty = true;
            }
        }

        if (dayInProgress) {
            const elapsed = now - lastTickTime;
            // How many sub-steps should be done by now
            const targetSteps = Math.min(
                INTRADAY_STEPS,
                Math.floor(elapsed / substepInterval) + 1
            );
            // Run any pending sub-steps
            let stepped = false;
            while (sim.substepsDone < targetSteps) {
                _runSubstep();
                chart.setLiveCandle(sim._partial);
                stepped = true;
                // P7-1: a substep-lane popup (or a deferred fill's margin call)
                // pauses the game mid-batch -- stop stepping, don't run the rest of
                // the day underneath an open decision.
                if (!playing) break;
            }
            // UI update once per frame (repricing chain/sidebar is expensive)
            if (stepped) {
                _onSubstepUI();
                dirty = true;
            }
            // All sub-steps done — close the day (overlays removed) then run
            // day-complete bookkeeping against baseline params. UNLESS the popup
            // barrier holds (02a "Act III"): a decision on screen or waiting
            // keeps the day OPEN. Retry the drain first, so a beat still queued
            // reaches the player and the day is never stranded.
            if (sim.dayComplete) {
                if (_popupBarrier()) _processPopupQueue();
                if (!_popupBarrier()) {
                    _closeTradingDay();
                    _onDayComplete();
                }
            }
        }
    }

    // Lerp animation runs every frame (even when paused, for settling)
    chart.update(now);
    // Lerp always causes a redraw while targets differ from display
    if (chart.isLerpActive()) dirty = true;
    // P7-1: a wrong print was drawn last frame — force the corrective redraw even
    // if nothing else is animating (the terminal always catches up).
    if (chart._repaintDirty) {
        chart._repaintDirty = false;
        dirty = true;
    }
    if (dirty) {
        dirty = false;
        renderCurrentView();
    }
    requestAnimationFrame(frame);
}

/** Fill resting orders against the current authoritative price. */
function _fillPendingOrders() {
    const filledOrders = checkPendingOrders(sim, sim.S, market.sigma, sim.r, sim.day, sim.q);
    for (const pos of filledOrders) {
        _develop('fill');
        const side = pos.qty > 0 ? 'Bought' : 'Sold';
        _toast(side + ' ' + Math.abs(pos.qty) + 'k ' + pos.type + ' @ $' + pos.fillPrice.toFixed(2));
        bookDirty = true;
    }
}

/** Called after each individual substep — orders, margin tracking, peak/drawdown. */
function _onSubstepTick() {
    const vol = market.sigma;

    // Check pending orders at intraday price
    _fillPendingOrders();

    // Track peak equity and drawdown for epilogue scorecard
    const substepMargin = checkMargin(sim.S, vol, sim.r, sim.day, sim.q);
    if (eventEngine) {
        if (substepMargin.equity > portfolio.peakValue) portfolio.peakValue = substepMargin.equity;
        if (portfolio.peakValue > 0) {
            const dd = 1 - substepMargin.equity / portfolio.peakValue;
            if (dd > portfolio.maxDrawdown) portfolio.maxDrawdown = dd;
        }
    }

    // P7-1 presentation degradation: the terminal transiently prints a wrong tick
    // (display only -- the lerp, the partial bar, and the printed history are
    // untouched). Rolls no RNG at d = 0, so Classic is byte-identical.
    const repaint = rollCandleRepaint(sim.S);
    if (repaint !== 0) {
        chart.setTransientRepaint(repaint);
        noteDegradationIncident();
        dirty = true;
    }
    // Eyes and ears fail together: a degradation CLUSTER reaches the audio glitch
    // chain, wall-clock rate-limited (UX, not simulation).
    const sev = takeGlitchSeverity(Date.now());
    if (sev > 0) glitchAudio(sev);
}

/** Called once per frame after substep batch — reprices chain/sidebar. */
function _onSubstepUI() {
    const substepMargin = checkMargin(sim.S, market.sigma, sim.r, sim.day, sim.q);
    updateSubstepUI(substepMargin);
}

/** The DISPLAY value of the VXHCN index: its last publication while the index is
 *  stale (P7-1), the true computed spot otherwise. `unitPrice`, margin, expiry,
 *  and VXHCN futures cash-settlement ALWAYS use the true value -- the latch lives
 *  strictly at this boundary and never touches `market.vxhcn`. */
function _publishVxhcn() {
    advanceVxhcnPublication(market.vxhcn, market.v, substepClock());
    return publishedVxhcn(market.vxhcn);
}

/** Government affairs on the Meridian page: one row per available action, its
 *  cost beside it, its description on hover. */
function _updateLobbyPills() {
    if (!$.lobbyBar || !$.lobbyActions) return;
    const day = sim.history.maxDay;
    const actions = eventEngine ? getAvailableActions(day, portfolio.cash) : [];
    $.lobbyBar.hidden = !eventEngine || actions.length === 0;
    const sig = actions.map(a => a.id + (a.affordable ? 1 : 0) + (a.cooldownReady ? 1 : 0)).join('|');
    if ($.lobbyActions._sig === sig) return;
    $.lobbyActions._sig = sig;
    $.lobbyActions.textContent = '';
    for (const action of actions) {
        const row = document.createElement('div');
        row.className = 'lobby-row';
        row.dataset.tooltip = action.desc;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'link-btn lobby-pill';
        btn.dataset.lobby = action.id;
        btn.disabled = !action.affordable || !action.cooldownReady;
        btn.textContent = action.name;
        const cost = document.createElement('span');
        cost.className = 'lobby-cost';
        cost.textContent = (action.cost > 0 ? `$${action.cost}k` : 'free') + (action.cooldownReady ? '' : ', cooling off');
        row.append(btn, cost);
        $.lobbyActions.appendChild(row);
    }
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
    if (front) _popupQueue.unshift(event); else _popupQueue.push(event);
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
 * written the tip into `eventEngine.eventLog`, but the day-boundary path only
 * repaints the log DOM for a superevent popup or a non-popup fire -- so an
 * intercepted tip (the whole point of which is that you read about it afterward
 * instead of answering it) would sit invisible in the feed until some unrelated
 * later refresh. Repainting here keeps ruling 7's contract: the beat stays in the
 * event feed, on the day it happened.
 */
function _interceptByStandingOrder(event) {
    if (!event || _gameOver || !raceState || !eventEngine) return false;
    if (event.id !== 'insider_tip' || !tipAutoSitArmed()) return false;
    const choice = (event.choices || []).find(c => c.playerFlag === 'sat_on_insider_tip');
    if (!choice) return false;
    _applyPopupChoice(event, choice);
    _toast(STANDING_COPY.tip_autosit, 5000);
    _updateWire();
    updateStandings($, eventEngine.world, factions, getFactionDescriptor);
    dirty = true;
    return true;
}

/** Called after all 16 sub-steps complete — runs portfolio/chain/margin checks. */
function _processPopupQueue() {
    // Don't show if a popup is already up.
    if (!$.popupOverlay.classList.contains('hidden')) return;
    if (_popupQueue.length === 0) {
        // P6-3: the terminal epilogue renders ONLY after the resolution-day beat has
        // drained (the treaty superevent showed as an event; now the desk closes over
        // the player). Any _processPopupQueue call with an empty queue triggers it.
        if (_pendingEpilogue) {
            const pages = _pendingEpilogue;
            _pendingEpilogue = null;
            _showEpilogue(pages, true);   // terminal: no "keep playing"
            // The almanac (02a "The evening"): the last edition of a Dynamic run,
            // natural resolution and ejection alike, appends its record once.
            if (_almanacRecord) { appendAlmanac(_almanacRecord); _almanacRecord = null; renderAlmanac(); }
        }
        return;
    }

    const event = _popupQueue.shift();
    countDispatch(_dispatchCategory(event), 'shown');
    if (event._roundOffer) {
        // Allocation caps and all prose tokens are public show-time values. The
        // offer price is fixed at announcement; another dispatch may move cash.
        event._offered = roundAllocation(event._roundOffer.kind, _portfolioEquity());
        Object.assign(event, roundDispatch(event._roundOffer, event._offered));
        eventEngine?._logEvent(sim.day, event, {}, event.magnitude);
        _updateWire();
    }
    // A dispatch stops a skip at once, mid-day if that is when it opens, and the
    // stop stays paused (02a "Pacing"); otherwise a running desk resumes once
    // every dispatch is answered.
    if (_skipping) _endSkip('dispatch');
    else if (playing) _resumeAfterDispatch = true;
    playing = false;
    updatePlayBtn($, playing);

    const contextText = typeof event.context === 'function'
        ? event.context(sim, eventEngine?.world, portfolio)
        : event.context || '';

    const popupCat = _dispatchCategory(event);
    playStinger('alert');

    const isSuperevent = !!event.superevent;

    if (isSuperevent) {
        const _seMu = event.params?.mu || (event.choices?.[0]?.deltas?.mu) || 0;
        if (_seMu > 0) playMusic('triumph');
        else if (_seMu < -0.03) playMusic('collapse');
        else playMusic('tension');
    }

    if (event.choices && event.choices.some(c => c.complianceTier)) {
        factions.equityAtLastReview = _portfolioEquity();
        factions.lastReviewDay = sim.day;
    }
    const _dd = document.getElementById('dispatch-date');
    if (_dd) _dd.textContent = `Edition ${Math.max(1, _relDay() + 1)} · day ${Math.max(0, _relDay())}`;
    showPopupEvent($, event.headline, contextText, event.choices, (idx) => {
        if (isSuperevent) stopMusic(2000);
        // INTERPRETATION: a repeat is counted on the player's own answers only (an
        // intercepted tip is the standing order's), keyed by event id and choice label.
        countChoice(event.id || event.headline, event.choices[idx]?.label ?? idx);
        _applyPopupChoice(event, event.choices[idx]);
        dirty = true;
        // Drain the next queued popup (the overlay was hidden before this callback ran).
        // This chains the resolution-day beats and, when the queue empties, renders any
        // pending terminal epilogue (P6-3: the beat shows, THEN the desk closes over the
        // player). A game-over choice already triggered its own drain; this is a no-op then.
        _processPopupQueue();
        // P7-1 ruling 2: with the queue drained and nothing left on screen, a day that
        // finished its substeps behind the barrier closes HERE, synchronously -- the
        // player does not press play to collect a day the world already finished.
        _closeCompletedDayIfPending();
        _resumeAfterDispatches();
    }, popupCat, event.magnitude, isSuperevent);
}

/** Dispatches pause the desk the way a Paradox event pauses the map: once the
 *  last one is answered, a desk that was running runs again. A manual play or
 *  pause in between is the player's call and clears the latch (togglePlay). */
function _resumeAfterDispatches() {
    if (!_resumeAfterDispatch) return;
    if (_gameOver || _popupBarrier()) return;
    _resumeAfterDispatch = false;
    playing = true;
    lastTickTime = _resumeClockOrigin();
    updatePlayBtn($, playing);
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
        if (!raceState || _gameOver || raceState.resolution || !raceChannelsLive()
            || event._roundApplied || event._roundOffer?.id !== choice.round.id) return;
        // Popup subscriptions are instant primary allocations, never secondary
        // fills or latency-ladder orders. Every queued offer can be answered once.
        event._roundApplied = true;
        const round = event._roundOffer;
        const equity = _portfolioEquity();
        const requested = event._offered * Math.max(0, Math.min(1, choice.round.take));
        const result = round.kind === 'polaris'
            ? allocatePrivateStake(round, requested, sim.day)
            : allocatePrimaryStock(round.price, requested, sim.day);
        if (requested > 0 && !result) {
            _toast('Allocation rejected — insufficient cash or account restricted.', 3500);
            return;
        }
        if (result && round.kind === 'polaris' && event._offered > 0) {
            applyRaceEffects(raceState, [{ dial: 'S', lab: 'polaris', amount: ROUNDS_TUNING.polarisSafety * result.allocated / event._offered }], round.id, sim.day);
        } else if (result) {
            recordPrimaryAllocation(round.id, raceState.day, result.allocated, equity);
        }
        bookDirty = true;
        updateUI();
    }
    if (choice.deltas && eventEngine) {
        // P7-1: a substep-lane popup can be answered MID-DAY, with the day's
        // overlays still installed -- apply the deltas against the true
        // baseline so the overlay restore at day close cannot erase them.
        // No-op wrapper at a day boundary (every pre-P7 path).
        _midDayBaseline(() => eventEngine.applyDeltas(sim, choice.deltas));
    }
    // P6-2 treaty-channel ledger: capture treatyStage across the choice's
    // structured effects so a player-advanced treaty step is attributed to the
    // player (the advice/diplomacy line). Guarded on raceState.
    const _treatyBefore = (raceState && eventEngine) ? eventEngine.world.ai.treatyStage : 0;
    if (choice.effects && eventEngine) {
        applyStructuredEffects(eventEngine.world, choice.effects);
    }
    if (raceState && eventEngine) {
        const _treatyDelta = eventEngine.world.ai.treatyStage - _treatyBefore;
        if (_treatyDelta > 0) appendLedger(sim.day, 'treaty', event.id, _treatyDelta, 'treatyStage advance');
    }
    // P6-2 raceEffects chokepoint (popup-choice path): the ONE sanctioned
    // choice->race mutation route -- whitelisted dials (S per lab, heat), clamped,
    // and ledgered under the event id (applyRaceEffects tracks race.playerS for the
    // d_P decomposition). Guarded on raceState (null outside Dynamic modes).
    if (choice.raceEffects && raceState) {
        applyRaceEffects(raceState, choice.raceEffects, event.id, sim.day);
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
    if (choice.raceLeak && raceState && event._tipIncidentId && raceChannelsLive()) {
        const leaked = forceLeakDetection(raceState, event._tipIncidentId);
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
        playerChoices[choice.playerFlag] = sim.day;
    }
    // P7-3: EVERY room path sets `sat_in_the_room` -- the seat is the beat, not one
    // of the options, so the flag belongs to the event and not to a choice's own
    // `playerFlag` (which the say-nothing path spends on `room_declined`). Set here,
    // at choice time, so a room the terminal queue filter discarded never leaves a
    // flag claiming the player was in a meeting they never saw.
    if (event.category === 'room') playerChoices[ROOM_FLAGS.seat] = sim.day;
    if (choice.cashPenalty) {
        portfolio.cash -= choice.cashPenalty;
    }
    if (choice.regulatoryAction === 'settle') {
        settleRegulatory();
    } else if (choice.regulatoryAction === 'cooperate') {
        cooperateRegulatory();
    }
    if (choice.followups && eventEngine) {
        for (const fu of choice.followups) {
            eventEngine.scheduleFollowup(fu, sim.day);
        }
    }
    if (choice.resultToast) {
        _toast(choice.resultToast, 4000);
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
                if (stuck.length) _toast(`${stuck.length} Consensus contract${stuck.length > 1 ? 's' : ''} frozen — could not flatten.`, 4000);
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
                    _toast(`Hedge placed: bought ${hedgeQty} shares at market.`, 4000);
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
            _toast(`Closed ${closed} position${closed > 1 ? 's' : ''}. P&L: ${sign}${fmtDollar(pnlSum)}`, 4000);
            bookDirty = true;
            updateUI();
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
    if (choice._tipAction && eventEngine) {
        const tip = pickTip();
        const isReal = Math.random() < TIP_REAL_PROBABILITY;
        const eventId = isReal ? tip.realEvent : tip.fakeEvent;
        _toast(`"Word is ${tip.hint}."`, 6000);
        eventEngine.scheduleFollowup({ id: eventId, mtth: 14 }, sim.day);
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
            bookDirty = true;
            updateUI();
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
            bookDirty = true;
            updateUI();
            // Re-check margin after partial liquidation
            const recheck = checkMargin(sim.S, vol, sim.r, sim.day, sim.q);
            if (recheck.triggered) {
                _toast('Still below margin. Full liquidation required.', 4000);
                const closedBefore = portfolio.positions.length;
                const { stuck } = liquidateAll(sim, sim.S, vol, sim.r, sim.day, sim.q,
                    standingLiquidationOrder(recheck));
                _applyRestriction(stuck, closedBefore);
                bookDirty = true;
                updateUI();
                const eligible = checkMargin(sim.S, vol, sim.r, sim.day, sim.q).collateralEquity;
                if (stuck.every(p => p.type === 'privatestake') && eligible < 0) {
                    _showGameOver('Forced liquidation left your account in deficit.',
                        'margin_call_liquidation', 'Account liquidation');
                }
            }
        }
        if (portfolio.positions.length < _heldBefore) _develop('liquidation');
        _haptic('heavy');
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
    if (choice._applyReportingRegime && raceState) {
        const res = applyReportingRegime(raceState);
        _syncRaceToWorld();
        _toast('Mandatory incident reporting enacted — disclosure wave: '
            + res.rescued + ' surfaced, ' + res.shortened + ' lags shortened.', 5000);
    }
    // Consensus dispute lifecycle (phase 5a): open a dispute on a contract, or
    // record an adjudicator ruling. Content-driven; the machinery + narrative
    // exist so the arcs can drive them.
    if (choice._openDispute != null && raceState) {
        const rec = openDispute(choice._openDispute, raceState.day, raceState.controlRegime);
        if (rec) { refreshBinaryQuotes(raceState); _fireRaceShell('dispute_opened'); }
    }
    if (choice._ruleDispute && raceState) {
        // A timely ruling settles SYNCHRONOUSLY (F2b) and returns the settlement
        // row (also stashed in the outbox, R3); route it through the ONE shared
        // consequence helper -- cash + narrative -- exactly like the daily pass, so
        // a ruled milestone is paid exactly once.
        const row = ruleDispute(choice._ruleDispute.key, choice._ruleDispute.outcome, raceState.day, raceState.controlRegime);
        if (row) { _applyBinaryRows([row]); refreshBinaryQuotes(raceState); }
    }
}

function _showGameOver(contextText, endingId = 'forced_resignation', headline = 'Rogue trading investigation') {
    _queuePopup({
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
            },
        ],
        _gameOverAction: true,
        _gameOverEnding: endingId,   // routed through _triggerGameOver (the shared latch)
    }, true);
    _processPopupQueue();
}

function _showComplianceTermination() {
    playerChoices['compliance_terminated'] = sim.day;
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
 * the endings engine renders the epilogue. Idempotent (the _gameOver latch guards
 * re-entry). Ledger-freeze-before-marking is guaranteed: the freeze fires inside
 * checkResolution (mid-run / timeout) or resolveNow (early ejection) BEFORE any
 * closeout cash moves.
 */
function _triggerGameOver(endingId) {
    if (_gameOver) return;
    // 0. The band stops mid-note (P7-1 terminal latch, 02a "Act III"): immediately
    //    after the idempotency guard, BEFORE the game-over latch, the play mutation,
    //    the UI update, and the resolution-day beat. The desk goes quiet; the hum
    //    and the machines do not notice. Dynamic modes only -- Classic never enters
    //    the machine register at all.
    if (raceState) silenceDesk();
    _endSkip(null);
    _gameOver = true;
    _syncSkipBtn();
    playing = false;
    _resumeAfterDispatch = false;
    updatePlayBtn($, playing);
    // 0b. Partial-day abort (02a "Act III"): a terminal reached MID-DAY -- an
    //     intraday compliance choice, a rogue latch off a substep-lane popup --
    //     unwinds the day's overlays and closes the day WITHOUT running
    //     _onDayComplete. The world does not tick after the latch, and the closeout
    //     below never prices through a transient overlay or a half-open day.
    _abortPartialDay();
    // 1. Lock the desk: cancel pending orders AND every working (deferred) manual
    //    order, silence the delegation layer (P7-2: a precommitment cannot execute
    //    into a closed-out book, and the tip interception stops with it), restrict
    //    (the durable lock is _gameOver).
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
    for (let i = _popupQueue.length - 1; i >= 0; i--) {
        if (!isTerminalSafeBeat(_popupQueue[i])) _popupQueue.splice(i, 1);
    }

    // 2/3. Dynamic mode only: resolve the world (extrapolate if the desk ended first)
    //      and close the book out against it. Classic mode has no race -> no closeout.
    let resolution = null, closeout = null, overlay = 'bystander';
    if (raceState) {
        const geo = eventEngine ? eventEngine.world.geopolitical : null;
        resolution = resolveNow(raceState, geo);          // existing record, or extrapolate + latch (freezeLedger first)
        // The outstanding quarter (02a "Scoring"): the unscored lock is scored once,
        // against its original end date and the completed trajectory; the
        // reader-copier's beside it (02a "The almanac").
        scoreOutstandingQuarter(raceState);
        scoreCopierOutstanding(raceState);
        closeout = _runTerminalCloseout(resolution, geo);
        const _dP = resolution && resolution.axes ? Math.abs(resolution.axes.dP || 0) : 0;
        // Personal overlay (surface the mapping; the epilogue picks slots, not tone).
        overlay = determineOverlay(endingId, ledgerTotals(), _dP, _firmVerdictFired);
        const fixture = dealtFixture() ? dealtFixture().id : null;
        // INTERPRETATION: the record's terminal day and cause are the resolution's
        // (day, terminalCause); the desk's own ending (natural or an ejection) rides
        // beside them as `ending`.
        _almanacRecord = buildAlmanacRecord({
            race: raceState, resolution, overlay, ending: endingId, fixture,
            player: forecastRecord(), copier: copierRecord(),
        });
    }

    // 4. Epilogue (structure + numbers here; sentences are coordinator slots). DEFERRED
    //    behind the popup queue (02a "Resolution"): any resolution-day beat already
    //    queued -- the treaty superevent above all -- shows as an EVENT first; the
    //    epilogue renders only once the queue has drained (see _processPopupQueue).
    _pendingEpilogue = generateEnding(endingId, {
        resolution, overlay, totals: raceState ? ledgerTotals() : {},
        closeout, sim, portfolio, playerChoices,
        eventLog: eventEngine ? eventEngine.eventLog : [],
        impactHistory, quarterlyReviews,
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
    const binary = _applyBinaryRows(finalizeConsensusTerminal(raceState));
    // Compute futures: the P3b cash path, driven by the terminal finalizer.
    const cSettle = finalizeComputeTerminal(raceState, geo);
    const compute = cSettle.length ? settleComputeFutures(cSettle, raceState) : [];
    // HCN stock / options / VXHCN / bonds: impact-free authoritative marks (09 -- the
    // impact overlay and the CRR tree never touch settlement). sim.S is the
    // authoritative process price; market.vxhcn is the last-valid VXHCN spot (Heston,
    // impact-free -- the formal validity-history/realized-var-fallback observation
    // record is a market-integrity seam, FLAGGED); bonds carry their last live MTM via
    // the impact-free Vasicek price (02a "Terminal closeout and overlays" -- non-doom families mark at MTM,
    // doom recovers on face inside closeout.js).
    const book = closeoutBook(portfolio.positions, resolution, raceState, {
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
 *  branch, not an event here. Latches reset in _resetCore. */
let _firmMemoFired = false, _firmVerdictFired = false;
function _checkFirmConversion() {
    if (!raceState) return;
    const F = firmBelief(raceState);
    if (!_firmMemoFired && canSendMemos() && F >= 40) {
        _firmMemoFired = true;
        _fireRaceShell('firm_conversion_memo');
    } else if (_firmMemoFired && !_firmVerdictFired && canSendMemos()) {
        // Hedging the memo doesn't stop the firm -- being right converts it
        // regardless (04) -- but it costs the attribution: the verdict needs a
        // deeper F when the CIO got the risk-managed version (75 vs 85, ruled
        // at the content gate). The firm gets there on its own arithmetic, later.
        const gate = playerChoices.made_the_case ? 75 : 85;
        if (F >= gate) {
            _firmVerdictFired = true;
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
    if (_roomFired || !raceState || !eventEngine || _gameOver) return;
    if (raceState.resolution) return;              // strictly pre-terminal
    const trigger = roomTrigger(raceState);
    if (!trigger.ready) return;                    // the leader is not at the decision yet
    // The six criteria (02a). Criterion 1 is belief.js's OWN memo gate
    // (credibility > 0.55) -- read through canSendMemos, never re-derived here.
    const criteria = [
        canSendMemos(),
        getFaction('safetyNetworkTrust') >= ROOM_GATE.safetyNetworkTrust,
        getFaction('labRelations') >= ROOM_GATE.labRelations,
        _firmVerdictFired,                         // the firm-conversion latch
        ROOM_FLAG_CRITERIA.advice.some(f => !!playerChoices[f]),
        !!playerChoices[ROOM_FLAG_CRITERIA.treasury],
    ];
    const voice = roomVoice(criteria);
    _roomFired = true;                             // the branch point is spent either way
    if (!roomInvited(voice)) return;               // below the gate: no beat at all
    const base = getEventById(ROOM_EVENT_ID);
    if (!base) return;
    const show = roomPresentation(trigger.leaderLab);
    const ev = {
        ...base,
        headline: show.headline,
        context: show.context,
        choices: roomChoices(voice, !!eventEngine.world.ai.summitLive),
        raceMeta: { leaderLab: trigger.leaderLab, leaderSide: show.side, voice },
    };
    const r = eventEngine._fireEvent(ev, sim, sim.day, 0, computeNetDelta());
    if (r && r.queued) {
        _queuePopup(r.event);
        // The room fires AFTER the day's maybeFire/bridge display pass, so repaint
        // the feed here (the interception precedent) -- the beat is in the log the
        // day it happened, not at some later unrelated refresh.
        _updateWire();
    }
}

function _runScrutiny() {
    if (!raceState) return;
    // A followed R4 states nothing (02a "What follows states nothing"): no stated
    // posterior on the recursion rung, no belief gap to scrutinize this quarter.
    const pilled = playerPilled();                 // null, or the locked posterior on R4
    const gap = scrutinyGap(raceState, pilled);    // player - F, null when pilled is
    if (gap == null || Math.abs(gap) <= 20) return;   // not stated, or not divergent -> no scrutiny
    const lastRev = quarterlyReviews[quarterlyReviews.length - 1];
    const vs = lastRev ? lastRev.vsBenchmark : 0;
    // Two-sided by rule (02a "Belief, η, and the firm"): the committee grudgingly respects P&L --
    // +3 divergent & outperforming, -3 divergent & underperforming.
    const delta = vs > 0 ? 3 : vs < 0 ? -3 : 0;
    if (delta !== 0) shiftFaction('firmStanding', delta);
    const morePilled = gap > 0;   // player more pilled than the firm (early) vs less (late, F awake)
    if (morePilled) {
        _toast(vs > 0
            ? 'The risk committee grumbles about your AGI-heavy book — then reads the P&L, and the grumbling stops.'
            : 'Risk committee: "Explain the AGI thesis. The book is divergent and down."', vs > 0 ? 5000 : 6000);
    } else {
        _toast(vs > 0
            ? 'The desk went long the future without you — but you are beating the benchmark, and they respect it.'
            : 'The desk went long the future without you. Your conventional book is the laggard now.', vs > 0 ? 5000 : 6000);
    }
}

/** A quarter's close is one line in the Brief (02a "The standing policy"): when
 *  the quarter just scored had a carried rung, the lock day's edition carries one
 *  desk item on the wire with the quarter's increment and the record. A quarter
 *  whose every rung was followed scored exactly 0 and prints nothing. */
function _quarterCloseLine(scored) {
    if (!scored || !eventEngine || !scored.rungs.some(r => r.cls === 'carried')) return;
    // INTERPRETATION: n counts every quarter scored, the followed ones (which
    // scored exactly 0) included, as forecastRecord().quarters does.
    const rec = forecastRecord();
    const headline = `The desk’s forecast closes the quarter ${fmtSigned(scored.delta, 2)} nats against Consensus; `
        + `${fmtSigned(rec.S, 2)} over ${rec.quarters} ${rec.quarters === 1 ? 'quarter' : 'quarters'} scored.`;
    eventEngine._logEvent(sim.day, { headline, category: 'desk' }, {}, 'minor');
    _updateWire();
    _worthReading('quarter');
}

function _updateTraitDisplay() {
    const traits = getActiveTraits();
    const section = $.convictionsSection;
    const list = $.convictionsList;
    if (!section || !list) return;
    if (traits.length === 0) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');
    list.textContent = '';
    for (const c of traits) {
        const item = document.createElement('div');
        item.className = 'conviction-item';
        item.title = c.description || c.name;
        const name = document.createElement('span');
        name.className = 'conviction-name';
        name.textContent = c.name;
        item.appendChild(name);
        list.appendChild(item);
    }
}

function _updateRegulationDisplay() {
    const list = $.regulationsList;
    if (!list) return;
    const pipeline = getRegulationPipeline();
    list.textContent = '';
    if (pipeline.length === 0) {
        const p = document.createElement('p');
        p.className = 'panel-hint';
        p.textContent = '—';
        list.appendChild(p);
        return;
    }
    for (const entry of pipeline) {
        const row = document.createElement('div');
        row.className = 'stat-row';
        const reg = getRegulation(entry.id);
        if (reg) row.dataset.tooltip = reg.description;
        const name = document.createElement('span');
        name.className = 'stat-label';
        name.textContent = entry.name;
        const st = document.createElement('span');
        st.className = 'stat-value';
        st.textContent = _regStatusLabel(entry);
        row.append(name, st);
        list.appendChild(row);
    }
}

function _regStatusLabel(entry) {
    if (entry.status === 'active' && entry.remainingDays != null) {
        const months = entry.remainingDays / 21;
        if (months < 1) return 'In force, under a month left';
        return `In force, ${Math.round(months)} ${Math.round(months) === 1 ? 'month' : 'months'} left`;
    }
    const labels = { introduced: 'Introduced', committee: 'In committee', floor: 'On the floor', active: 'In force' };
    return labels[entry.status] || entry.status;
}

function _portfolioEquity() {
    // Canonical equity: includes reserved short collateral (_reservedMargin).
    // Omitting it under-counts equity for collateralized shorts (binary shorts
    // sequester the whole notional), which can spuriously trip rogue-trading /
    // review thresholds -- so always go through portfolioValue.
    return portfolioValue(sim.S, market.sigma, sim.r, sim.day, sim.q);
}

/** A desk item on the wire (02a "The evening"): minor, category desk. Off the
 *  front page it also arrives as a toast, as the day's events do. */
function _postDeskItem(headline) {
    if (!eventEngine) return;
    eventEngine._logEvent(sim.day, { headline, category: 'desk' }, {}, 'minor');
    _updateWire();
    if (currentPage() !== 'front') _toast(headline, 5000);
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
    const rel = _relDay();
    for (const ob of portfolio.obligations.slice()) {
        if (ob.dueDay <= rel) {
            const res = settleObligation(ob, sim, sim.S, market.sigma, sim.r, sim.day, sim.q);
            if (!res) continue;
            if (res.forced) {
                _develop('forced_sale');
                shiftFaction('firmStanding', -8);
                _postDeskItem(`Operations sells a slice of the book to meet ${ob.label}; the desk was ${fmtBook(res.shortfall)} short on the day, and the risk committee has noted it.`);
            } else {
                _postDeskItem(`${_capFirst(ob.label)} is paid in full; ${fmtBook(ob.amount)} leaves the desk in cash.`);
            }
            bookDirty = true;
        } else if (ob.dueDay - 5 === rel && portfolio.cash < ob.amount) {
            _postDeskItem(`${_capFirst(ob.label)}, ${fmtBook(ob.amount)}, is due in five sessions; the desk holds ${fmtBook(portfolio.cash)} in cash.`);
            _develop('notice');
            // INTERPRETATION: one pause, one cause: during a skip the notice's pause
            // is the skip's stop, counted at the close as 'skip:<cause>'.
            if (!_skipping) countPause('notice');
            playing = false;
            _resumeAfterDispatch = false;   // a dispatch answered later must not resume past the notice
            updatePlayBtn($, playing);
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
        _toast(`Liquidation: ${closed} closed, ${frozen.length} frozen leg${frozen.length > 1 ? 's' : ''} remain`
            + (cancelled ? `; ${cancelled} pending order${cancelled > 1 ? 's' : ''} cancelled` : '')
            + '. Account restricted until they clear.', 5000);
    } else if (stuck.length) {
        _toast(`${closed} position${closed !== 1 ? 's' : ''} liquidated; private stakes remain until terminal.`, 4000);
    } else {
        _toast(`All ${closed} position${closed !== 1 ? 's' : ''} liquidated.`, 4000);
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

/** Order-entry guard: toast + block when the account is restricted OR the game is
 *  terminally over (P6-3: the desk is closed; the durable _gameOver latch never
 *  auto-releases, so no trade can print after the closeout). */
function _blockedByRestriction() {
    if (_gameOver) {
        _toast('The desk is closed. What remains is the accounting.', 3500);
        _haptic('error');
        return true;
    }
    if (!portfolio.restricted) return false;
    _toast('Account restricted — trading disabled until frozen positions clear.', 3500);
    _haptic('error');
    return true;
}

function _showInterjection(text) {
    // On the front page the interjection is already the lead (it is on the wire).
    if (currentPage() === 'front') return;
    const container = document.getElementById('toast-container');
    _toast(text, 6000);
    requestAnimationFrame(() => {
        const last = container?.lastElementChild;
        if (last) last.classList.add('interjection-toast');
    });
}

function _recordImpact(day, direction, magnitude, context) {
    if (Math.abs(magnitude) < 0.5) return;
    impactHistory.push({ day, direction, magnitude, context });
    if (impactHistory.length > 15) {
        impactHistory.sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude));
        impactHistory.length = 15;
    }
}

function _onDayComplete() {
    if (_gameOver) return;   // P6-3: the desk is closed; no further day processing after the terminal closeout

    // The quarterly snapshot (02a "Locks"): at the start of the close that ends a
    // lock day's edition, before any other close bookkeeping and before the race
    // steps, while race.day and belief.day still equal the lock day. The desk
    // snapshots the standing policy without asking, and the reader-copier beside
    // it. Day 0's is the close of Edition 1; none is ever taken on day 1008, and a
    // run that ended mid-edition never reaches here (the game-over guard above).
    if (raceState && belief.active && !raceState.resolution && raceState.day < HORIZON
        && isLockDay(raceState.day) && belief.day === raceState.day) {
        snapshotForecast(raceState.day);
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
            _toast(label + ': $' + Math.abs(divNet).toFixed(2));
        }
    }

    // Quarterly desk review (live trading only)
    if (sim.day > HISTORY_CAPACITY && sim.day % QUARTERLY_CYCLE === 0) {
        const buyHoldPnl = (sim.S - 100) * (portfolio.initialCapital / 100);
        const actualPnl = _portfolioEquity() - portfolio.initialCapital;
        const vsBenchmark = actualPnl - buyHoldPnl;
        let rating;
        if (vsBenchmark > portfolio.initialCapital * 0.1) rating = 'strong';
        else if (vsBenchmark > 0) rating = 'solid';
        else if (vsBenchmark > -portfolio.initialCapital * 0.1) rating = 'underperform';
        else rating = 'poor';

        quarterlyReviews.push({ day: sim.day, pnl: actualPnl, vsBenchmark, rating });

        // Adjust firmStanding based on quarterly performance
        onQuarterlyReview(_portfolioEquity(), sim.day);

        const texts = {
            strong: 'Quarterly desk review: Meridian\'s risk committee notes exceptional returns.',
            solid: 'Quarterly desk review: Solid quarter. Book within risk parameters.',
            underperform: 'Quarterly desk review: Returns lag benchmark. Risk committee requests position summary.',
            poor: 'Quarterly desk review: Managing Director Vasquez wants a meeting about your book.',
        };
        let text = texts[rating];
        if (playerChoices.cooperated_sec || playerChoices.silent_sec || playerChoices.accepted_insider_tip) {
            text += ' The SEC inquiry hasn\'t helped perception of the desk.';
        }
        _toast(text, rating === 'poor' ? 8000 : 5000);
    }

    const { expired, unwound } = processExpiry(sim, sim.day, sim.S, sim.day, market.sigma, sim.r, sim.q);
    // INTERPRETATION: a chassis expiry (an option, bond or VXHCN future reaching its
    // date) counts as its own kind beside Consensus and compute settlements.
    for (let i = 0; i < expired.length; i++) _develop('expiry');
    if (unwound.length > 0) {
        const names = [...new Set(unwound.map(p => p.strategyName))];
        for (const name of names) {
            _toast('Strategy "' + name + '" expired — unwound all legs.');
        }
        bookDirty = true;
    }

    // Crisis profit tracking for trait system
    if (eventEngine) {
        const _eq = portfolioValue(market.S, Math.sqrt(market.v), market.r, market.day, market.q);
        if (_eq > portfolio.initialCapital * 1.1) {
            const _w = eventEngine.world;
            if (_w.geopolitical.recessionDeclared) playerChoices.profited_recession = true;
            if (_w.geopolitical.oilCrisis) playerChoices.profited_oil_crisis = true;
            if (_w.geopolitical.gulfEscalation >= 2) playerChoices.profited_war_escalation = true;
            if (_w.investigations.impeachmentStage >= 2) playerChoices.profited_impeachment = true;
        }
    }

    const _traitCtx = {
        playerChoices,
        impactHistory,
        quarterlyReviews,
        factions,
        portfolio,
        daysSinceLiveTrade: sim.history.maxDay - HISTORY_CAPACITY,
        lobbyCount: _lobbyCount,
        flags: {
            largeImpactTrades: impactHistory.length,
            continentalMentions: playerChoices._continentalMentions || 0,
        },
        // Belief-derived OBSERVABLE signals for the v2 convictions (phase 5a).
        // The player's OWN locked posterior / credibility / lock participation --
        // never latent race state. Safe defaults in Classic (belief inactive):
        // everLocked false, so agi_pilled/doomer stay dormant.
        beliefPilled: raceState ? playerPilled() : 0,
        credibility: raceState ? credibility() : 0,
        everLocked: raceState ? hasStatedForecast() : false,
    };
    const newTraits = evaluateTraits(_traitCtx);
    for (const id of newTraits) {
        const trait = getTrait(id);
        if (trait) _toast(`${trait.permanent ? 'Conviction unlocked' : 'Reputation earned'}: ${trait.name}`, 4000);
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
    if (raceState) {
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
        const _playerCoupling = raceState.resolution ? 0 : stepCoupling(_hcnPositioning(), primaryInputs(raceState.day + 1));
        // Export controls (evidence machinery round): the third orchestrator-passed
        // input. Binds Tianxia's COMPUTE leg only (the fast-follower distillation term
        // is untouched -- controls bind chips, never weights already released), and is
        // STORED on the race so the plateau detector and any extrapolation price the
        // same drift the kinematics did.
        // The day's public world inputs: the race steps on them, and the public
        // record (stepBelief, below) logs the same values (02a "The reader").
        const _raceInputs = { straitTension: _straitTension(), exportControlStage: _exportControlStage() };
        advanceRace(raceState, {
            straitTension: _raceInputs.straitTension,
            playerCoupling: _playerCoupling,
            exportControlStage: _raceInputs.exportControlStage,
        });
        // Ledger the day's player-attributable dC to Halcyon (C channel; drops zero,
        // and the frozen ledger drops it outright post-latch -- belt and suspenders).
        for (const row of couplingAttribution(raceState.lastTransitions.playerDeltaC)) {
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
        stepControlRegime(raceState, _exoSignals());
        // Treaty track (P6): the hidden Reykjavik gauntlet. Consumes this tick's
        // detection ledger for the summit-week gate; public treatyStage (events)
        // is a pacing accelerator only. summitOpen is mirrored below to summitLive.
        _raceInputs.treatyStage = eventEngine.world.ai.treatyStage;
        stepTreaty(raceState, { treatyStage: _raceInputs.treatyStage });
        _syncRaceToWorld();
        // Live-day public rung snapshot -- taken here, BEFORE checkResolution's
        // extrapolation can move it (see the declaration above).
        _liveRung = buildPublicView(raceState).releasedFrontierRung;
        // Event base-rate scaling (overhaul phase 5a; 04 engine note 1): the
        // discretionary Poisson cadence scales with the PUBLIC released frontier
        // rung (1.0 at R1 = Act-I match, rising late-game). Set before maybeFire.
        eventEngine.setBaseRateScale(eventBaseRateScale(buildPublicView(raceState).releasedFrontierRung));
        // Act III driver (P7-1): the ONE smoothed public parameter behind the
        // machine register, the substep lane, the latency ladder, and the
        // presentation degradation. Reads the SAME public mirrors as the base-rate
        // scale above (released rung + regime); never race internals. Also hands x
        // to the audio layer and opens/closes the substep lane.
        _stepAct3();
        // Standing orders (P7-2): the panel's gates ride the SAME public released
        // rung -- unlocked at R3, armed set locked at R5. Synced here, before any
        // rule is evaluated below, so arming and firing agree about the world.
        syncStandingOrders(_frontierRung());
        // Market belief B: fold this completed day's LEGIBLE ledger into the rule
        // of thumb and step the public record with the day's public inputs, before
        // anything reads a quote. Consumes ONLY race.lastTransitions and the public
        // projection -- never latent state.
        stepBelief(raceState, _raceInputs);
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
        _applyBinaryRows(computeBinarySettlements(raceState));
        _applyBinaryRows(consensus.pendingRows);
        consensus.pendingRows = consensus.pendingRows.filter(r => !r._consumed);
        refreshBinaryQuotes(raceState);

        // Compute futures (overhaul phase 3b): feed the nationalization reference
        // with today's HCN exchange settlement mark (the authoritative process
        // price sim.S -- impact never touches it), settle any matured / decreed /
        // force-majeure contracts off the public compute index + strait state, then
        // refresh the curve. `geo` (world-state geopolitical) is present whenever
        // raceState is (both are Dynamic-only).
        const _geo = eventEngine ? eventEngine.world.geopolitical : null;
        const cSettlements = computeFutureSettlements(raceState, _geo);
        if (cSettlements.length) {
            const cSettled = settleComputeFutures(cSettlements, raceState);
            for (const r of cSettled) {
                _develop('settlement');
                _toast('Compute Q@' + r.key + ' ' + r.kind.toLowerCase().replace('_', ' ')
                    + ' — P&L ' + fmtDollar(r.pnl), 4500);
            }
        }
        refreshComputeQuotes(raceState, _geo);

        // Standing orders (P7-2), day-boundary rules: (a) severity cut, (b) blockade
        // halve, (d) certification harvest. Placed AFTER settlement + quote refresh
        // by design -- (d) must price its harvest off today's live quotes and skip
        // what already settled, and (a)'s cut lands before the margin check below
        // sees the book. Machinery-instant; one fire per trigger episode.
        _runStandingDayRules();

        // The quarter's close + firm belief F + the belief-gap scrutiny loop
        // (overhaul phase 4). Lock days are the fixed quarterly grid 0/63/126...
        // (race clock). The lock itself is the snapshot at the top of the NEXT
        // close (02a "Locks"), so F, scrutiny and the conversion read the closing
        // quarter's lock here.
        if (isLockDay(raceState.day) && raceState.day !== _lastForecastLockDay) {
            _lastForecastLockDay = raceState.day;   // race.day >= 1 here
            // Score the quarter that just closed under the lock that opened it (02a
            // "Scoring"), the reader-copier's beside it, before F reads credibility
            // -- so the firm, the memo gate and the close line all see this
            // quarter's result.
            const _scored = scoreQuarter(raceState.day);
            scoreCopierQuarter(raceState.day);
            updateStandings($, eventEngine.world, factions, getFactionDescriptor);   // the Desk's record
            stepFirmBelief(raceState);   // F wakes toward B; converts on the player's track record
            // P6-2 F-channel ledger (advice line): stepFirmBelief exposes the applied
            // movement's decomposition -- ledger ONLY the PLAYER conversion term
            // (race.lastFConvert), never the autonomous B-wake (02a "Player influence and the ledger": the
            // ledger charges the player for persuasion, not for the world waking on its
            // own). Gated on the player having stated a forecast (the advice channel is
            // silent otherwise); zero-dropped like every channel. F is 0-100; /100 keeps
            // the epilogue's channel totals commensurable in margin-unit-ish fractions.
            if (hasStatedForecast()) appendLedger(sim.day, 'F', 'advice_line', (raceState.lastFConvert || 0) / 100, 'firm belief (F) conversion');
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
        const _resolution = checkResolution(raceState, eventEngine.world.geopolitical);
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
        if (!raceState.resolution) _checkRoom();
    }

    // Trading-restriction release: lifts once no un-flattenable (stuck) legs
    // remain (the frozen contracts have settled -- nationalization fallback or
    // deadline) AND canonical equity is non-negative. _resetCore always clears it.
    if (portfolio.restricted && !_hasStuckLegs() && _portfolioEquity() >= 0) {
        portfolio.restricted = false;
        _toast('Trading restriction lifted — account reopened.', 3500);
    }

    // Fire dynamic events
    if (eventEngine) {
        eventEngine.setPlayerContext(
            playerChoices,
            factions,
            getActiveRegulations().map(r => r.id),
            getActiveTraitIds(),
            {
                equity: _portfolioEquity(),
                peakEquity: portfolio.peakValue || portfolio.initialCapital,
                pnlPct: (_portfolioEquity() - portfolio.initialCapital) / portfolio.initialCapital,
                maxDrawdown: portfolio.maxDrawdown || 0,
                grossLeverage: computeGrossNotional() / Math.max(1, _portfolioEquity()),
                positionCount: portfolio.positions.length,
                netDelta: computeNetDelta(),
                cash: portfolio.cash,
                strongQuarters: quarterlyReviews.filter(r => r.rating === 'strong').length,
                impactTradeCount: impactHistory.length,
            },
            _lobbyCount,
            getLastLobbyDay()
        );
        const netDelta = computeNetDelta();
        const { fired, popups } = eventEngine.maybeFire(sim, sim.day, netDelta);
        // Race -> narrative bridge (overhaul phase 2): fire the day's race
        // transitions (releases, certifications, detected incidents) through the
        // same _fireEvent path, merging into the existing display arrays. Dynamic
        // modes only (raceState is null in Classic); may add toasts/popups but
        // must not crash. Runs right after advanceRace's ledger was produced.
        let capexWaves = 0;
        if (raceState) {
            const bridged = runRaceBridge(eventEngine, raceState, sim, sim.day, netDelta, _liveRung);
            capexWaves = bridged.capexWaves;
            for (const f of bridged.fired) fired.push(f);
            for (const p of bridged.popups) popups.push(p);
        }
        _stepRaceMarkets(capexWaves);
        // The protected reference records the post-gap authoritative close.
        if (raceState && !raceState.resolution) stepNationalizationRef(raceState, sim.S);
        for (const ev of popups) _queuePopup(ev);
        const hasSupereventPopups = popups.some(ev => ev.superevent);
        // An extra edition: a regime change, a blockade, a superevent or a crisis.
        const _tr = raceState ? raceState.lastTransitions : null;
        if (hasSupereventPopups || fired.some(ev => ev.category === 'compound' || ev.superevent)
            || (_tr && (_tr.regimeChange || (_tr.strait && _tr.strait.blockadeStart)))) {
            markExtra(_relDay());
            _worthReading('extra');
        }
        // The race page records the day's public ledger (and, for the epilogue, the hidden tracks).
        if (raceState) recordRaceDay(raceState, eventEngine.world);
        // The markets page keeps the curves from before today's news as its ghost.
        // Its snapshot reads today's listed expiries, so the skeleton rolls first.
        const _lead = fired.find(ev => !ev.interjection) || popups[0];
        chainSkeleton = buildChainSkeleton(sim.S, sim.day, expiryMgr.update(sim.day));
        marketsDayClose(_lead ? splitHeadline(_lead.headline).head : null);
        invalidateTicket();   // the day's updateUI re-renders it (bookDirty)
        if (hasSupereventPopups) {
            sim.recomputeK();
            _syncAll();
            syncSettingsUI($, _simSettingsObj());
            _updateWire();
            updateCongressDiagrams($, eventEngine.world);
            updateStandings($, eventEngine.world, factions, getFactionDescriptor);
        }
        if (fired.length > 0) {
            sim.recomputeK();
            _syncAll();
            syncSettingsUI($, _simSettingsObj());
            _updateWire();
            updateCongressDiagrams($, eventEngine.world);
            updateStandings($, eventEngine.world, factions, getFactionDescriptor);
            for (let i = 0; i < fired.length; i++) {
                const ev = fired[i];
                let headline = ev.headline;
                if (ev.interjection) {
                    setTimeout(function() { _showInterjection(headline); }, i * 1500);
                    continue;
                }
                if (ev.portfolioFlavor) {
                    const flavor = ev.portfolioFlavor(portfolio);
                    if (flavor) headline += ' ' + flavor;
                }
                if (getTraitEffect('eventHintArrows', false) && ev.params) {
                    const _hintMu = ev.params.mu || 0;
                    if (_hintMu > 0) headline += ' \u2191';
                    else if (_hintMu < 0) headline += ' \u2193';
                }
                const duration = ev.magnitude === 'major' ? 8000
                    : ev.magnitude === 'moderate' ? 5000 : 3000;
                // On the front page the item leads the edition; elsewhere it arrives as a wire toast.
                setTimeout(function() { if (currentPage() !== 'front') _toast(headline, duration); }, i * 1500);
                setTimeout(function() {
                    const _mu = ev.params?.mu || 0;
                    if (_mu > 0.02) playStinger('positive');
                    else if (_mu < -0.02) playStinger('negative');
                    else playStinger('alert');
                }, i * 1500 + 200);
            }
        }
    }

    // Classic has no wire: the tape leads each edition, and the markets page
    // still takes its daily snapshot.
    if (!eventEngine) {
        _updateWire();
        chainSkeleton = buildChainSkeleton(sim.S, sim.day, expiryMgr.update(sim.day));
        marketsDayClose(null);
        invalidateTicket();   // the day's updateUI re-renders it (bookDirty)
    }

    // Portfolio-triggered popup events
    if (eventEngine) {
        const portfolioPopups = eventEngine.evaluateTriggers(sim, sim.day);
        for (const pp of portfolioPopups) _queuePopup(pp);
    }

    if (eventEngine) {
        const { expired } = tickRegulations();
        for (const id of expired) {
            const reg = getRegulation(id);
            if (reg) _toast('Regulation expired: ' + reg.name, 3000);
        }
    }

    // Endings check (after events and faction shifts). A player-terminal state
    // (P6-1 ruling) locks the desk, resolves the world, closes the book out, and
    // renders the epilogue -- all inside _triggerGameOver.
    if (eventEngine && !_gameOver) {
        const endingId = checkEndings(sim, portfolio, eventEngine.world, playerChoices);
        if (endingId) {
            if (endingId === 'term_ends') eventEngine.computeElectionOutcome(sim);
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
        if (raceState && raceState.resolution) {
            _triggerGameOver('term_ends');
            return;
        }
    }

    // lobbyingExposed is set directly here (not via event system) because it's
    // a meta-flag derived from player behavior + faction state, not a narrative beat.
    // Check if lobbying has been exposed (heavy lobbying while media is watching)
    if (eventEngine && _lobbyCount >= 3 && factions.mediaTrust < 40 && !eventEngine.world.media.lobbyingExposed) {
        eventEngine.world.media.lobbyingExposed = true;
    }

    // Update ambient mood based on market regime
    const _ambientVol = Math.sqrt(sim.v);
    if (_ambientVol > 0.35 || sim.lambda > 5) setAmbientMood('crisis');
    else if (_ambientVol > 0.20 || sim.lambda > 2) setAmbientMood('tense');
    else setAmbientMood('calm');

    // Layer 3: update param shifts based on gross exposure
    const grossNotional = computeGrossNotional();
    const grossRatio = grossNotional / (market.S * modeledStockADV(market.sigma));
    updateParamShifts(grossRatio);
    decayParamShifts();
    decayEventImpulses();   // decay the race-event market impulses once per day (phase 4)

    // Impact toast
    const hasOptions = portfolio.positions.some(p => p.type === 'call' || p.type === 'put');
    const toast = selectImpactToast(grossRatio, hasOptions ? 'option' : 'stock', sim.day);
    if (toast) _toast(toast, 3000);

    if (grossRatio > 0.75) shiftFaction('regulatoryExposure', 1);

    chainSkeleton = buildChainSkeleton(sim.S, sim.day, expiryMgr.update(sim.day));
    bookDirty = true;

    // Obligations (02a "The evening"): one due on day d is settled at the close that
    // turns day d - 1 into day d -- this close -- after expiry, the race block's
    // settlements and the terminal check (a close that ended the run returned above,
    // and its closeout paid what was unpaid), immediately before the rogue-trading
    // and margin checks. The notice is checked at the same point.
    _settleObligations();

    // Rogue trading check (before margin)
    const equity = _portfolioEquity();
    if (equity < portfolio.initialCapital * ROGUE_TRADING_THRESHOLD) {
        const lossAmt = fmtDollar(Math.abs(portfolio.initialCapital - equity));
        _showGameOver(`Meridian Capital's internal audit has uncovered ${lossAmt} in unauthorized losses on your desk. Bank security has been called. Your access has been revoked. The SEC has been notified.`);
        return;
    }

    // Check margin
    const margin = checkMargin(sim.S, vol, sim.r, sim.day, sim.q);
    if (margin.triggered) {
        portfolio.marginCallCount++;
        const collateral = margin.collateralEquity ?? margin.equity;
        const shortfall = margin.required - collateral;
        _queuePopup({
            category: 'margin',
            magnitude: 'major',
            headline: 'Margin call',
            context: `Portfolio equity ${fmtDollar(collateral)} is below the maintenance requirement of ${fmtDollar(margin.required)}. Shortfall: ${fmtDollar(shortfall)}. The risk desk is on the line.`,
            choices: [
                {
                    label: 'Liquidate all positions',
                    desc: 'Dump everything at market. Stop the bleeding.',
                    playerFlag: 'margin_liquidated',
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
        }, true);
        _processPopupQueue();
    }

    // Auto-scroll: keep latest candle near right edge when playing
    if (playing && camera) {
        const lastDay = sim.history.maxDay;
        const viewW = $.chartCanvas.clientWidth || 800;
        const targetWorldX = lastDay + 1;
        const rightEdgeWorld = camera.screenToWorldX
            ? camera.screenToWorldX(viewW - CHART_RIGHT_MARGIN)
            : camera.screenToWorld(viewW - CHART_RIGHT_MARGIN, 0).x;
        if (targetWorldX > rightEdgeWorld) {
            const dx = targetWorldX - rightEdgeWorld;
            camera.panBy(-dx * camera.zoom, 0);
        }
    }

    // Record the book's value, and holding HCN beside it, for the sparkline
    if (portfolioHistory) pushSparkSample(portfolioHistory, _portfolioEquity());
    if (benchHistory) pushSparkSample(benchHistory, portfolio.initialCapital / 100 * sim.S);

    updateUI(margin);
    _updateTraitDisplay();
    _updateRegulationDisplay();
    _updateLobbyPills();
    dirty = true;

    _processPopupQueue();
    _skipClose();
}

// ---------------------------------------------------------------------------
// tick — advance one trading day
// ---------------------------------------------------------------------------

/** Instant full-day tick (used by step button). Overlays are applied for the
 *  day's substeps and removed before `_onDayComplete` via the shared helpers, so
 *  the step button now applies impulses (previously it never did). */
function tick() {
    // The popup barrier binds here too (02a "Act III"): a substep-lane arrival
    // stops the batch and holds the day OPEN, exactly as in frame(). The day
    // resumes from `sim.substepsDone` once the decision is answered.
    if (dayInProgress) {
        // Day already opened by frame() (overlays installed) -- finish substeps.
        while (!sim.dayComplete && !_popupBarrier()) _runSubstep();
    } else {
        _beginTradingDay();
        for (let i = 0; i < INTRADAY_STEPS; i++) {
            _runSubstep();
            if (_popupBarrier()) break;
        }
    }
    if (!sim.dayComplete || _popupBarrier()) return;
    _closeTradingDay();   // finalize + remove overlays LIFO + re-sync to baseline
    // Snap the lerp to the final state (no animation for step)
    const last = sim.history.last();
    if (last) {
        chart._lerp.day = last.day;
        chart._lerp.close = last.close;
        chart._lerp.high  = last.high;
        chart._lerp.low   = last.low;
        chart._lerp._from = last.close;
        chart._lerp._t = 1;
        chart._lerp._targetClose = last.close;
        chart._lerp._targetHigh  = last.high;
        chart._lerp._targetLow   = last.low;
    }
    _onDayComplete();
}

// ---------------------------------------------------------------------------
// UI update helper
// ---------------------------------------------------------------------------

function updateUI(precomputedMargin) {
    const vol = market.sigma;
    const margin = precomputedMargin || checkMargin(sim.S, vol, sim.r, sim.day, sim.q);
    _publishVxhcn();
    updatePortfolioDisplay($, portfolio, sim.S, vol, sim.r, sim.day, margin, sim.q, _bookHistories());
    updateGreeksDisplay($, aggregateGreeks(sim.S, vol, sim.r, sim.day, sim.q));
    // Standing orders (P7-2): hidden until the released frontier rung unlocks the
    // panel, and null outside Dynamic modes (the view model hides it).
    updateStandingOrdersPanel($, raceState ? standingOrdersView() : null, _onStandingToggle);
    _bookChanged();
    refreshTooltip();
    _syncMasthead();
}

/** The book changed (a fill, a close, an expiry): the tables' holdings, and the
 *  ticket's figure when it includes the book. */
function _bookChanged() {
    if (!bookDirty) return;
    bookDirty = false;
    invalidateTicket();
    if (currentPage() === 'markets') { redrawMarkets(); renderTicket(); }
}

/** Lightweight UI update called every substep: the book, and on Markets the
 *  opened table and the ticket's quotes. */
function updateSubstepUI(marginInfo) {
    const vol = market.sigma;
    // P7-1 display latches: the underlying reprice still runs every substep;
    // only what reaches the DOM is held. Sparklines skip frames at high d.
    _publishVxhcn();
    const skipSpark = skipSparklineFrame();
    updatePortfolioDisplay($, portfolio, sim.S, vol, sim.r, sim.day, marginInfo, sim.q,
        skipSpark ? null : _bookHistories());
    updateGreeksDisplay($, aggregateGreeks(sim.S, vol, sim.r, sim.day, sim.q));
    if (currentPage() === 'markets') { marketsSubstep(); refreshTicketQuotes(); }
    _bookChanged();
    refreshTooltip();
    _syncMasthead();
}

// ---------------------------------------------------------------------------
// Handler helpers
// ---------------------------------------------------------------------------

function togglePlay() {
    // The desk is closed (P7-1 ruling 3 abort): a terminal reached mid-day left the
    // day marked closed with its partial bar standing in history and the sim clock
    // deliberately un-advanced. Resuming would open a SECOND bar on that same day.
    if (_gameOver) return;
    if (_skipping) { _endSkip(null); _haptic('light'); return; }   // ends a skip in progress, paused
    _resumeAfterDispatch = false;
    playing = !playing;
    if (playing) {
        lastTickTime = _resumeClockOrigin();
    }
    updatePlayBtn($, playing);
    _haptic(playing ? 'medium' : 'light');
}

/**
 * The in-day clock origin for a resume (02a "Act III"). `frame()` derives an
 * ABSOLUTE in-day `targetSteps` from `lastTickTime`, so resuming a partially-run
 * day from a bare `performance.now()` would make the desk wait out every substep
 * the day had already traded -- after a lane popup at substep 15, about fifteen
 * substep intervals of nothing. Rebasing from `sim.substepsDone` puts the completed
 * substeps behind the origin, so the next substep is due immediately. Clock
 * bookkeeping only: working orders still sleep across a pause (ruling 3 stands).
 */
function _resumeClockOrigin() {
    const now = performance.now();
    const tickInterval = 1000 / _daysPerSec();
    // No day open: the first frame should begin one immediately.
    if (!dayInProgress) return now - Math.max(2000, tickInterval);
    return now - sim.substepsDone * (tickInterval / INTRADAY_STEPS);
}

function step() {
    if (_skipping) { _endSkip(null); return; }   // ends a skip in progress, paused
    if (playing) return;
    if (_gameOver) return;   // same reason as togglePlay: never reopen an aborted day

    // Start a new day if none in progress (installs overlays via the shared helper).
    if (!dayInProgress) {
        _beginTradingDay();
        chart.setLiveCandle(sim._partial);
    }

    // Advance one substep. A day whose substeps already finished behind the popup
    // barrier is NOT re-stepped -- it is waiting to be closed, not to be traded.
    if (!sim.dayComplete) {
        _runSubstep();
        chart.setLiveCandle(sim._partial);
        _onSubstepUI();
    }

    // If all substeps done, close the day (overlays removed) then bookkeeping --
    // unless the popup barrier holds (02a "Act III"). Retry the drain first so
    // a beat still queued is never stranded.
    if (sim.dayComplete) {
        if (_popupBarrier()) _processPopupQueue();
        if (!_popupBarrier()) {
            _closeTradingDay();
            _onDayComplete();
        }
    }

    dirty = true;
    _haptic('light');
}

function _syncLerpSpeed() {
    chart.setSubstepInterval(1000 / (_daysPerSec() * INTRADAY_STEPS));
}

function cycleSpeed() {
    speedIndex = (speedIndex + 1) % SPEED_OPTIONS.length;
    updateSpeedBtn($, SPEED_OPTIONS[speedIndex] * 2);
    _syncLerpSpeed();
    _haptic('selection');
}

function decycleSpeed() {
    speedIndex = (speedIndex - 1 + SPEED_OPTIONS.length) % SPEED_OPTIONS.length;
    updateSpeedBtn($, SPEED_OPTIONS[speedIndex] * 2);
    _syncLerpSpeed();
    _haptic('selection');
}

function _resetCore(index) {
    _endSkip(null);
    _prevCloseEquity = null;
    _skipLogMark = null;
    resetBrief();
    resetMarkets();
    resetTicket();
    setFolioCount('markets', 0);
    document.getElementById('epilogue-overlay')?.classList.add('hidden');
    document.getElementById('fraud-overlay')?.classList.add('hidden');
    document.getElementById('popup-event-overlay')?.classList.add('hidden');
    _gameOver = false;   // P6-3: clear the durable terminal latch on reset
    _pendingEpilogue = null;
    _popupQueue.length = 0;
    for (const k in playerChoices) delete playerChoices[k];
    _lobbyCount = 0;
    impactHistory.length = 0;
    quarterlyReviews.length = 0;
    if (eventEngine) eventEngine.resetTriggerCooldowns();
    resetUsedTips();
    resetFactions();
    // Re-attach faction reference after reset (faction-standing.js is the source of truth)
    if (eventEngine) eventEngine.world.factions = factions;
    resetTraits();
    resetRegulations();
    resetLobbying();
    resetAudio();
    resetAct3();   // P7-1: x -> 0, substep clock zeroed, working orders dropped, latches cleared
    resetStandingOrders();   // P7-2: precommitments are authored per RUN -- nothing armed, nothing locked, no episode remembered
    resetValuation();
    resetRounds();
    // Reset the race->narrative bridge's per-run latches (variant-rotation
    // counters, the tip throttle, the capex-wave rung latch) so same-seed
    // playback doesn't depend on process history. UNCONDITIONAL (02a
    // reality-beats ruling 2): this is pure module state and clearing it is
    // Classic-harmless, like resetRoomRotation below. The old `if (raceState)`
    // guard left every latch stale across a Classic->Dynamic switch, because
    // loadPreset creates the race AFTER _resetCore runs -- a stale _lastTipDay
    // would have throttled the new run's first tip. One reset path, no
    // self-healing in the bridge.
    resetRaceBridge();
    resetRoomRotation();   // P7-3: per-leader pool rotation is run-scoped (the resetRaceBridge precedent)
    _firmMemoFired = false;
    _firmVerdictFired = false;
    _fundLive = false;    // P7-3: the fund-as-actor latch is run-scoped
    _roomFired = false;   // P7-3: the room is a once-per-RUN branch point
    resetEventImpulses();          // clear the decaying race-event impulse overlay (phase 4)
    _lastForecastLockDay = -1;
    _almanacRecord = null;
    resetCounts();                 // the interruption counters are run-scoped
    sim.reset(index);
    resetPortfolio();   // obligations too: Classic starts on cash; Dynamic boot deals the hand
    resetOpening();
    resetImpactState();
    sim.prepopulate();
    _syncAll();
    _initPortfolioHistory();
    chart.dayOrigin = sim.day;
    dayInProgress = false;
    chart.resetTransients();   // P7-1 ruling 5: lerp AND the pending one-frame wrong print
    expiryMgr.init(sim.day);
    chainSkeleton = buildChainSkeleton(sim.S, sim.day, expiryMgr.update(sim.day));
    bookDirty = true;
    playing = false;
    _resumeAfterDispatch = false;
    syncSettingsUI($, _simSettingsObj());
    updatePlayBtn($, playing);
    _syncSkipBtn();
    updateDynamicSections($, index);
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
    const fixture = dealOpeningHand(raceState.seed, expiryMgr.update(sim.day).map(e => e.day));
    // INTERPRETATION: 02a gives the memo and the reports no magnitude; they post as
    // minor, like the desk's other wire items, and the archived ones mark no news
    // day on the tape (see _updateWire).
    for (const r of fixture.reports) {
        eventEngine._logEvent(sim.day, { headline: r.headline, category: r.category }, {}, 'minor').archive = true;
    }
    eventEngine._logEvent(sim.day, { headline: fixture.memo, category: 'desk' }, {}, 'minor');
    if (currentPage() === 'meridian') renderHandover(fixture);
    bookDirty = true;
}

function loadPreset(index) {
    $.presetSelect.selectedIndex = index;
    _resetCore(index);

    if (_isDynamicPreset(index)) {
        eventEngine = new EventEngine();
        // Attach faction reference (faction-standing.js is the source of truth)
        eventEngine.world.factions = factions;
        // Hidden AI-race state machine (overhaul phase 1): wired but invisible.
        raceState = createRaceState();
        // Attach the race by reference for the non-popup raceEffects chokepoint (P6-2).
        eventEngine.race = raceState;
        // Player cost-of-capital coupling + complicity ledger (P6-2): activate.
        resetCoupling();
        resetLedger();
        // Consensus milestone binaries (overhaul phase 3a).
        initConsensus(raceState);
        // Compute-futures term structure (overhaul phase 3b).
        initComputeMarket(raceState, eventEngine.world.geopolitical);
        // Market belief B + belief-backed quoters + player/firm belief (phase 4).
        initBelief(raceState);
        initValuation(raceState);
        initRounds(raceState);
        initIntel(raceState);   // P7-3 intel reliability stream (outside race.streams)
        _wireBeliefQuoters();
        refreshBinaryQuotes(raceState);
        refreshComputeQuotes(raceState, eventEngine.world.geopolitical);
        _dealOpeningHand();
    } else {
        eventEngine = null;
        raceState = null;
        deactivateConsensus();
        deactivateComputeMarket();
        deactivateBelief();
        deactivateIntel();
        deactivateCoupling();
        deactivateLedger();
        _unwireBeliefQuoters();
    }
    _updateWire();
    updateCongressDiagrams($, eventEngine ? eventEngine.world : null);
    if (eventEngine) updateStandings($, eventEngine.world, factions, getFactionDescriptor);

    updateUI();
    _repositionCamera();
    marketsDayClose(null);
    renderTicket();
    resetRacePage();
    dirty = true;
    _haptic('medium');
}

function resetSim() {
    const index = $.presetSelect.selectedIndex;
    _resetCore(index);

    if (eventEngine) eventEngine.reset();
    // Reset the hidden AI-race state in place with a fresh per-run seed (a new
    // world each reset). Same-preset reset only; mode changes create/null it in
    // loadPreset -- so no discarded-seed draws. Null in Classic, untouched.
    if (raceState) {
        resetRaceState(raceState);
        // Player cost-of-capital coupling + complicity ledger (P6-2): clear the EMA +
        // entries for the fresh run. raceState is mutated in place (singleton), so the
        // eventEngine.race reference stays valid -- no re-attach needed.
        resetCoupling();
        resetLedger();
        resetConsensus(raceState);
        resetComputeMarket(raceState, eventEngine ? eventEngine.world.geopolitical : null);
        // Rebuild belief for the fresh world + re-install the belief-backed quoters
        // (resetConsensus/resetComputeMarket reset the source to the placeholder).
        resetBelief(raceState);
        initValuation(raceState);
        initRounds(raceState);
        resetIntel(raceState);   // P7-3: fresh intel stream for the fresh world
        _wireBeliefQuoters();
        refreshBinaryQuotes(raceState);
        refreshComputeQuotes(raceState, eventEngine ? eventEngine.world.geopolitical : null);
        _dealOpeningHand();
    }
    _updateWire();
    updateCongressDiagrams($, eventEngine ? eventEngine.world : null);
    if (eventEngine) updateStandings($, eventEngine.world, factions, getFactionDescriptor);

    updateUI();
    _repositionCamera();
    marketsDayClose(null);
    renderTicket();
    resetRacePage();
    dirty = true;
    _haptic('heavy');
}

function _isDynamicPreset(index) { return index >= 5; }

function syncSliderToSim(param, value) {
    sim[param] = value;
    if (param === 'rho') sim._recomputeRhoDerived();
    _syncAll();
    dirty = true;
}

/** Execute a resolved multi-leg strategy atomically. `spreadMult` is the P7-1
 *  latency-ladder widening applied to every leg's fill (1 / omitted = none): the
 *  strategy defers as ONE unit, so all legs fill at the SAME execution substep or
 *  the whole thing rolls back.
 *
 *  Returns false when the bundle was DROPPED before any leg touched the book.
 */
function executeWithRollback(resolvedLegs, strategyName, execMult, spreadMult) {
    if (resolvedLegs.some(l => l.type === 'privatestake')) {
        _toast('Private stakes cannot be traded in a strategy.', 2500);
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
        _toast('Strategy outlived one of its contracts — dropped, nothing filled.', 2500);
        _haptic('error');
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
        _toast('Strategy failed (leg ' + (results.length + 1) + ' rejected) \u2014 all legs unwound.');
        _haptic('error');
    } else if (results.length > 0) {
        const netDebit = results.reduce((sum, r) => sum + r._fillCost, 0);
        const mult = execMult || 1;
        const perUnit = Math.abs(netDebit / mult);
        const verb = netDebit > 0 ? 'at' : 'for credit';
        const name = strategyName + 's';
        _toast('Executed ' + mult + 'k ' + name + ' ' + verb + ' $' + perUnit.toFixed(2));
        _haptic('success');
    }
    bookDirty = true;
    updateUI();
    dirty = true;
    return !failed;
}

// ---------------------------------------------------------------------------
// Epilogue overlay controller
// ---------------------------------------------------------------------------

function _showEpilogue(pages, terminal = false) {
    let currentPage = 0;

    const overlay = document.getElementById('epilogue-overlay');
    const title = overlay.querySelector('.epilogue-title');
    const body = overlay.querySelector('.epilogue-body');
    // Dynamically generate dots to match page count
    const dotsContainer = overlay.querySelector('.epilogue-dots');
    while (dotsContainer.firstChild) dotsContainer.removeChild(dotsContainer.firstChild);
    for (let i = 0; i < pages.length; i++) {
        const dot = document.createElement('span');
        dot.className = 'epilogue-dot' + (i === 0 ? ' active' : '');
        dotsContainer.appendChild(dot);
    }
    const dots = dotsContainer.querySelectorAll('.epilogue-dot');
    const backBtn = overlay.querySelector('#epilogue-back');
    const nextBtn = overlay.querySelector('#epilogue-next');
    const restartBtn = overlay.querySelector('#epilogue-restart');
    const keepBtn = overlay.querySelector('#epilogue-keep');

    function render() {
        const page = pages[currentPage];
        body.style.opacity = '0';
        setTimeout(() => {
            title.textContent = page.title;
            // SECURITY: page.body is generated entirely by generateEnding()
            // from trusted world state -- no user input or external data
            body.innerHTML = page.body;  // eslint-disable-line no-unsanitized/property
            body.scrollTop = 0;
            body.style.opacity = '1';
            dots.forEach((d, i) => d.classList.toggle('active', i === currentPage));
            document.getElementById('epilogue-folio').textContent = `Page ${currentPage + 1} of ${pages.length}`;
            backBtn.classList.toggle('hidden', currentPage === 0);
            nextBtn.classList.toggle('hidden', currentPage === pages.length - 1);
            restartBtn.classList.toggle('hidden', currentPage !== pages.length - 1);
            // P6-3: a TERMINAL game-over never offers "keep playing" -- the desk is
            // closed and the book settled; only Restart is coherent.
            keepBtn.classList.toggle('hidden', terminal || currentPage !== pages.length - 1);
        }, 200);
    }

    let _epiloguePrevFocus = document.activeElement;
    let _epilogueTrapCleanup = null;

    function _cleanupEpilogue() {
        if (_epilogueTrapCleanup) { _epilogueTrapCleanup(); _epilogueTrapCleanup = null; }
        if (_epiloguePrevFocus && _epiloguePrevFocus.focus) { _epiloguePrevFocus.focus(); _epiloguePrevFocus = null; }
    }

    backBtn.onclick = () => { if (currentPage > 0) { currentPage--; render(); } };
    nextBtn.onclick = () => { if (currentPage < pages.length - 1) { currentPage++; render(); } };
    restartBtn.onclick = () => {
        overlay.classList.add('hidden');
        _cleanupEpilogue();
        // Restart the Dynamic preset. Restart goes through the FULL
        // preset load, not the bare `_resetCore` (review fix, 2026-09-08):
        // `_resetCore` resets the chassis but leaves the OLD raceState -- already
        // resolved and (on the timeout path) extrapolated to day ~2800 -- plus the
        // old eventEngine, Consensus book and compute book in place. The next bridge
        // pass would then seed the capex latch at the dead run's late rung, and the
        // retained `race.resolution` would terminate the new desk on its first
        // day-complete. `loadPreset` calls `_resetCore` first and then builds the
        // fresh race, engine and instrument books -- one authoritative new-run path.
        loadPreset(DEFAULT_PRESET);
    };
    keepBtn.onclick = () => {
        overlay.classList.add('hidden');
        _cleanupEpilogue();
        _toast('Event storyline complete. Market simulation continues.');
    };
    // The race page shows what the labs had in house; the last edition stays a click away.
    const raceBtn = overlay.querySelector('#epilogue-race');
    raceBtn.classList.toggle('hidden', !raceState);
    raceBtn.onclick = () => {
        overlay.classList.add('hidden');
        _cleanupEpilogue();
        showPage('race');
    };
    _epilogueReopen = () => {
        _epiloguePrevFocus = document.activeElement;
        overlay.classList.remove('hidden');
        if (typeof trapFocus === 'function') _epilogueTrapCleanup = trapFocus(overlay);
        render();
    };
    const reBtn = document.getElementById('race-epilogue');
    if (reBtn) reBtn.hidden = false;
    if (raceState) { endRacePage(); revealRace(true); }

    overlay.classList.remove('hidden');
    if (typeof trapFocus === 'function') _epilogueTrapCleanup = trapFocus(overlay);
    render();
    const firstBtn = overlay.querySelector('button:not(.hidden)');
    if (firstBtn) firstBtn.focus();
}

// ---------------------------------------------------------------------------
// Helper: reposition camera so latest candle is near the right edge
// ---------------------------------------------------------------------------

function _repositionCamera() {
    if (!camera) return;
    const lastDay = sim.history.maxDay;
    const viewW = $.chartCanvas.clientWidth || $.chartCanvas.offsetWidth || 800;
    const targetScreenX = viewW - CHART_RIGHT_MARGIN;
    camera.x = (lastDay + 0.5) - (targetScreenX - viewW / 2) / camera.zoom;
}

// ---------------------------------------------------------------------------
// Helper: build a settings object matching syncSettingsUI expectations
// ---------------------------------------------------------------------------

function _simSettingsObj() {
    return {
        presetIndex: $.presetSelect.selectedIndex,
        params: {
            mu:     sim.mu,
            theta:  sim.theta,
            kappa:  sim.kappa,
            xi:     sim.xi,
            rho:    sim.rho,
            lambda: sim.lambda,
            muJ:    sim.muJ,
            sigmaJ: sim.sigmaJ,
            a:      sim.a,
            b:      sim.b,
            sigmaR: sim.sigmaR,
            borrowSpread: sim.borrowSpread,
            q: sim.q,
        },
        initialCapital: portfolio.initialCapital,
    };
}
