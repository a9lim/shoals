/* =====================================================
   main.js -- Entry point for the Shoals trading simulator.

   Wires together DOM cache, simulation loop, camera,
   rendering, autoplay, and event handlers.
   ===================================================== */

import { SPEED_OPTIONS, SKIP_DAYS_PER_SEC, PRESETS, INTRADAY_STEPS, HISTORY_CAPACITY, CHART_SLOT_PX, CHART_LEFT_MARGIN, CHART_RIGHT_MARGIN, DEFAULT_PRESET, RULES_VERSION } from './src/config.js';
import { createSparkHistory, pushSparkSample } from './src/sparkline.js';
import { buildChainSkeleton, priceChainExpiry, ExpiryManager } from './src/chain.js';
import { portfolio, checkMargin, aggregateGreeks, isExpiredForTrading } from './src/portfolio.js';
import { dealtFixture } from './src/opening.js';
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
import { initMarkets, setMarketsVisible, marketsDayClose, resetMarkets, redrawMarkets, marketsSubstep, smileExpiryDay, marketsGhost, restoreMarkets } from './src/markets.js';
import {
    initTicket, pickPoint, addToTicket, legState, renderTicket, resetTicket, refreshTicketQuotes, redrawTicket,
    invalidateTicket, tradeTicket, ticketLegCount, loadFlatten,
} from './src/ticket.js';
import { positionLabel } from './src/portfolio-renderer.js';
import { initSurface } from './src/surface.js';
import { initRacePage, resetRacePage, recordRaceDay, endRacePage, revealRace, setRaceVisible, drawRace } from './src/race-page.js';
import { countPause, counts } from './src/counters.js';
import { closeStop, majorSince } from './src/pacing.js';
import { appendAlmanac } from './src/almanac.js';
import { initAlmanacView, renderAlmanac } from './src/almanac-view.js';
import { REFERENCE } from './src/reference.js';
import { market } from './src/market.js';
import { ALL_EVENTS } from './src/events/index.js';
import { factions, getFactionDescriptor } from './src/faction-standing.js';
import { getActiveTraits, getTraitEffect } from './src/traits.js';
import { getRegulation, getRegulationPipeline } from './src/regulations.js';
import {
    initAudio, setAmbientMood, playStinger, playMusic, stopMusic, setVolume, getVolume, resetAudio,
    setMachineIntensity, glitchAudio, silenceDesk,
} from './src/audio.js';
import {
    substepClock, publishedChain, advanceVxhcnPublication, publishedVxhcn, publishedVariance,
    rollCandleRepaint, skipSparklineFrame, noteDegradationIncident, takeGlitchSeverity,
    workingOrderCount, setReducedMotion,
} from './src/act3.js';
import { standingOrdersView } from './src/standing-orders.js';
import { getAvailableActions } from './src/lobbying.js';
import { consensus, getBinaryQuote } from './src/race/consensus.js';
import { computeMarket, isComputeTradeable } from './src/race/compute-market.js';
import { randomSeed } from './src/race/rng.js';
import {
    run, setSink, newRun, beginDay, substep, tryClose, barrier, runCommand, position, isDynamicPreset,
    debugFireEvent, debugPopup,
} from './src/run.js';
import { replayTo, keepDigests, record } from './src/run-replay.js';
import { portfolioEquity, relDay, latency } from './src/run-state.js';


// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// The run (src/run.js) owns the simulation and every engine; the shell reads them.
const $ = {};
const sim = run.sim;
const expiryMgr = new ExpiryManager();   // the chain's listed expiries (display; the run keeps its own)
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
let mouseX = -1, mouseY = -1;
let portfolioHistory = null; // sparkline ring buffer for the book's value
let benchHistory = null;     // ... and for holding HCN with the same capital (the ghost under it)
let _capFront = null;          // the tape's live caption setter (shared/colophon.js caption())
let _epilogueReopen = null;    // reopens the last edition after a visit to the race page
let _replaying = false;        // a save is replaying: the sink rebuilds display history and nothing else
let _runEnded = false;         // the last edition has shown: the save is cleared and stays cleared
const SAVE_KEY = 'shoals-run'; // the run's save in browser storage (02a "Save and resume")

// ---------------------------------------------------------------------------
// Micro-helpers — eliminate repeated typeof guards & duplicated blocks
// ---------------------------------------------------------------------------

function _toast(msg, duration) {
    if (typeof showToast !== 'undefined') showToast(msg, duration);
}
function _haptic(pattern) {
    if (typeof _haptics !== 'undefined') _haptics.trigger(pattern);
}

// ---------------------------------------------------------------------------
// The run's sink (02a "The run, headless"): what the run tells the page
// ---------------------------------------------------------------------------

/**
 * Everything the run reports reaches the page here. While a save replays
 * (`_replaying`) the page rebuilds only its display history (the tape's extra
 * editions, the race page's record, the sparkline) and stays otherwise silent:
 * no toasts, sounds, dispatches, storage writes or almanac; what the last
 * replayed day shows is drawn once the replay ends (`_resume`).
 */
const SINK = {
    toast(msg, ms) { if (!_replaying) _toast(msg, ms); },
    haptic(pattern) { if (!_replaying) _haptic(pattern); },
    develop(kind) { if (!_replaying) _develop(kind); },
    worthReading(cause) { if (!_replaying) _worthReading(cause); },
    book() { bookDirty = true; if (!_replaying) updateUI(); dirty = true; },
    wire() { if (!_replaying) _updateWire(); },
    world() { if (!_replaying) _refreshWorld(); },
    fired(fired, lane) { if (!_replaying) _announceFired(fired, lane); },
    deskItem(headline) { if (!_replaying && currentPage() !== 'front') _toast(headline, 5000); },
    dispatch(event) { if (!_replaying) _showDispatch(event); },
    epilogue(pages, record) { _onLastEdition(pages, record); },
    gameOver() { _onGameOver(); },
    notice() { if (!_replaying) _onNotice(); },
    extra() { markExtra(relDay()); if (!_replaying) _worthReading('extra'); },
    raceDay() { recordRaceDay(run.race, run.engine.world); },
    marketsClose(headline) { if (!_replaying) _marketsClose(headline); },
    closed(margin) { _onClosed(margin); },
    skipClose() { if (!_replaying) _skipClose(); },
    afterClose() { _save(); },
    substep() { if (!_replaying) _degrade(); },
    machine(x) { setMachineIntensity(x); },
    ambient(mood) { setAmbientMood(mood); },
    silence() { if (!_replaying) silenceDesk(); },
    standing() { if (!_replaying) updateStandingOrdersPanel($, run.race ? standingOrdersView() : null, _onStandingToggle); },
    commanded(cmd, pos) { if (pos.substeps === 0) _save(); },
};

/** World state, factions or sim params moved: the settings, Congress, the standings, the book. */
function _refreshWorld() {
    syncSettingsUI($, _simSettingsObj());
    updateCongressDiagrams($, run.engine ? run.engine.world : null);
    if (run.engine) updateStandings($, run.engine.world, factions, getFactionDescriptor);
    bookDirty = true;
    dirty = true;
}

/** The items a close (or the substep lane) fired: on the front page each leads the
 *  edition; elsewhere it arrives as a wire toast, with its stinger. The close's
 *  arrive staggered; an interjection is its own toast. */
function _announceFired(fired, lane) {
    for (let i = 0; i < fired.length; i++) {
        const ev = fired[i];
        let headline = ev.headline;
        if (ev.interjection) {
            if (lane) _showInterjection(headline);
            else setTimeout(function() { _showInterjection(headline); }, i * 1500);
            continue;
        }
        if (!lane && ev.portfolioFlavor) {
            const flavor = ev.portfolioFlavor(portfolio);
            if (flavor) headline += ' ' + flavor;
        }
        if (getTraitEffect('eventHintArrows', false) && ev.params) {
            const _hintMu = ev.params.mu || 0;
            if (_hintMu > 0) headline += ' \u2191';
            else if (_hintMu < 0) headline += ' \u2193';
        }
        const duration = ev.magnitude === 'major' ? 8000 : ev.magnitude === 'moderate' ? 5000 : 3000;
        const _mu = ev.params?.mu || 0;
        const stinger = _mu > 0.02 ? 'positive' : _mu < -0.02 ? 'negative' : 'alert';
        if (lane) {
            _toast(headline, duration);
            playStinger(stinger);
            continue;
        }
        setTimeout(function() { if (currentPage() !== 'front') _toast(headline, duration); }, i * 1500);
        setTimeout(function() { playStinger(stinger); }, i * 1500 + 200);
    }
}

/** The markets' daily snapshot: the chain skeleton rolls first (the snapshot reads
 *  today's listed expiries), and the ghost is the curves from before today's news. */
function _marketsClose(headline) {
    chainSkeleton = buildChainSkeleton(sim.S, sim.day, expiryMgr.update(sim.day));
    marketsDayClose(headline ? splitHeadline(headline).head : null);
    invalidateTicket();   // the close's updateUI re-renders it (bookDirty)
}

/** The close's display tail: the tape keeps the latest candle in view while
 *  playing, the sparkline records the book's value and holding HCN beside it,
 *  and the book, convictions, regulations and government affairs repaint. */
function _onClosed(margin) {
    if (portfolioHistory) pushSparkSample(portfolioHistory, portfolioEquity());
    if (benchHistory) pushSparkSample(benchHistory, portfolio.initialCapital / 100 * sim.S);
    chainSkeleton = buildChainSkeleton(sim.S, sim.day, expiryMgr.update(sim.day));
    bookDirty = true;
    if (_replaying) return;
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
    updateUI(margin);
    _updateTraitDisplay();
    _updateRegulationDisplay();
    _updateLobbyPills();
    dirty = true;
}

/** P7-1 presentation degradation, after each substep: the terminal transiently
 *  prints a wrong tick (display only -- the lerp, the partial bar and the printed
 *  history are untouched; no roll at d = 0, so Classic is byte-identical), and a
 *  degradation CLUSTER reaches the audio glitch chain, wall-clock rate-limited. */
function _degrade() {
    const repaint = rollCandleRepaint(sim.S);
    if (repaint !== 0) {
        chart.setTransientRepaint(repaint);
        noteDegradationIncident();
        dirty = true;
    }
    const sev = takeGlitchSeverity(Date.now());
    if (sev > 0) glitchAudio(sev);
}

/** The terminal latch closed the desk: a skip ends, the clock stops, and the
 *  play and skip controls lock. */
function _onGameOver() {
    _endSkip(null);
    _syncSkipBtn();
    playing = false;
    _resumeAfterDispatch = false;
    updatePlayBtn($, playing);
}

/** An obligation's notice pauses the desk: not a dispatch, so nothing but the
 *  player's play resumes it.
 *  INTERPRETATION: one pause, one cause: during a skip the notice's pause is the
 *  skip's stop, counted at the close as 'skip:<cause>'. */
function _onNotice() {
    if (!_skipping) countPause('notice');
    playing = false;
    _resumeAfterDispatch = false;   // a dispatch answered later must not resume past the notice
    updatePlayBtn($, playing);
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
 * An actionable development the player did not make by hand (02a "Pacing"): the
 * run counts it (run-state.js develop) and the skip latches it through this one
 * hook.
 * INTERPRETATION: the latch is fed only while a skip runs, so what happened
 * before the player pressed it (and has seen) never stops it.
 */
function _develop(kind) {
    _worthReading(kind === 'notice' ? 'notice' : 'development');
}

/** Start a skip from a paused or playing desk. Nothing in a finished run, while a
 *  dispatch holds the desk, or while a skip already runs. */
function skipToNextEdition() {
    if (run.gameOver || _skipping || barrier()) return;
    _skipping = true;
    _skipLatch.clear();
    const log = run.engine ? run.engine.eventLog : [];
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
    b.disabled = run.gameOver;
}

/**
 * The end of every close (02a "Pacing"): a skip in progress stops at the first
 * of the close's stops (src/pacing.js), and this close's equity is the next
 * one's baseline for the book move.
 * INTERPRETATION: the run's first close measures from its starting equity (the
 * takeover's, or the cash start), the close before Edition 1 being the takeover.
 */
function _skipClose() {
    const equity = portfolioEquity();
    const equityPrev = _prevCloseEquity ?? portfolio.initialCapital;
    _prevCloseEquity = equity;
    const log = run.engine ? run.engine.eventLog : [];
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
    if (run.gameOver || portfolio.restricted || pos.type === 'privatestake') return false;
    if (pos.type === 'binary') {
        if (!run.race || !consensus.active || consensus.frozen) return false;
        const q = getBinaryQuote(pos.strike);
        return !!q && !q.settled && !q.frozen && !q.pending && !q.disputed;
    }
    if (pos.type === 'computefuture') return !!run.race && computeMarket.active && isComputeTradeable(pos.strike);
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
    loadFlatten(legs, off, portfolio.orders.length + workingOrderCount());
    showPage('markets');
    _haptic('light');
}

// Standing orders (P7-2) -- the delegation layer's wiring
// ---------------------------------------------------------------------------

/** Panel toggle handler: arm / disarm one rule, a command (the run re-renders
 *  the panel through its sink either way, so it shows the engine's real state,
 *  never the click's). */
function _onStandingToggle(id, on) {
    runCommand({ kind: 'standing', id, on });
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
    //     Each is a command (02a "Commands"): the run journals and applies it.
    document.addEventListener('shoals:closePosition', (e) => {
        const id = e.detail && e.detail.id;
        if (id != null) runCommand({ kind: 'close', id });
    });

    document.addEventListener('shoals:exerciseOption', (e) => {
        const id = e.detail && e.detail.id;
        if (id != null) runCommand({ kind: 'exercise', id });
    });

    document.addEventListener('shoals:cancelOrder', (e) => {
        const id = e.detail && e.detail.id;
        if (id != null) runCommand({ kind: 'cancel', id });
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
        if (name) runCommand({ kind: 'unwind', name });
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

    // 13. The run (src/run.js). A save under the current rules replays once every
    //     page can take its display history (below); otherwise a new run begins
    //     on a fresh seed, the one ambient draw.
    setSink(SINK);
    keepDigests(true);   // the digest trail shoalsJournal() and shoalsReplayCheck() read
    const _saved = _readSave();
    newRun(_saved ? { preset: _saved.preset, seed: _saved.seed } : { preset: DEFAULT_PRESET, seed: randomSeed() });
    _initPortfolioHistory();
    expiryMgr.init(sim.day);
    chart.dayOrigin = run.origin;

    // 14. Build initial chain and update UI
    chainSkeleton = buildChainSkeleton(sim.S, sim.day, expiryMgr.update(sim.day));
    $.presetSelect.selectedIndex = run.preset;
    syncSettingsUI($, _simSettingsObj());
    updatePlayBtn($, playing);
    updateSpeedBtn($, SPEED_OPTIONS[speedIndex] * 2);
    _syncLerpSpeed();
    updateDynamicSections($, run.preset);
    _updateWire();
    updateCongressDiagrams($, run.engine ? run.engine.world : null);
    if (run.engine) updateStandings($, run.engine.world, factions, getFactionDescriptor);
    _updateLobbyPills();

    // Wire lobby pill buttons
    if ($.lobbyBar) {
        $.lobbyBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.lobby-pill');
            if (!btn || btn.disabled) return;
            // A command; the run admits it (the gate, the cost, the cooldown).
            runCommand({ kind: 'lobby', action: btn.dataset.lobby });
            _updateLobbyPills();
            dirty = true;
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
        race: () => run.race,
        geo: () => (run.engine ? run.engine.world.geopolitical : null),
        origin: () => chart.dayOrigin,
        positions: () => portfolio.positions,
        chain: (day) => {
            const idx = chainSkeleton.findIndex(e => e.day === day);
            return idx < 0 ? null : publishedChain(_priceExpiry(idx), substepClock());
        },
        vxVariance: () => publishedVariance(market.v),
        vxSpot: () => publishedVxhcn(market.vxhcn),
        expiryDay: () => smileExpiryDay(),
        spreadMult: () => latency().spreadMult,   // the ladder's multiple now (the flatten's estimate)
    };
    initTicket(_mkCtx, {
        onChange: () => { redrawMarkets(); setFolioCount('markets', ticketLegCount()); },
        onTrade: (order) => runCommand({ kind: 'trade', order }),
        toast: (msg) => _toast(msg, 2500),
    });
    initMarkets(_mkCtx, { onPick: (pt, side) => pickPoint(pt, side), legState });
    initSurface();
    marketsDayClose(null);
    initRacePage({ race: () => run.race, world: () => (run.engine ? run.engine.world : null) }, {
        onCommit: (state) => runCommand({ kind: 'forecast', state }),   // the editor's edit, as a command
        onEdit: () => redrawMarkets(),
    });
    resetRacePage();
    document.getElementById('race-epilogue').addEventListener('click', () => { if (_epilogueReopen) _epilogueReopen(); });

    // 18. The saved run replays to its endpoint now that every page can take its
    //     display history; the desk opens paused there, with any unanswered
    //     dispatch back on screen (02a "Save and resume"). A save that does not
    //     replay is discarded and a new run begins; a new run's save replaces it.
    if (_saved && _resume(_saved)) {
        playing = false;
        updatePlayBtn($, playing);
        _drawDesk();
        if (run.current) _showDispatch(run.current);
    } else {
        if (_saved) _startRun(DEFAULT_PRESET);
        else _save();
    }

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
    // The run's record and the live-equivalence check (02a "Gates"): the journal
    // with its header, endpoint and digest trail, and a replay of it in a module
    // worker (its own module instances) compared close by close.
    window.shoalsJournal = () => JSON.parse(JSON.stringify(record()));
    window.shoalsReplayCheck = () => _replayCheck();
    window._debug = {
        sim, portfolio, market, factions, run,
        get eventEngine() { return run.engine; },
        get world() { return run.engine?.world; },
        get popupQueue() { return run.queue; },
        /** Fire any event by id. Toast events apply immediately; popup events queue.
         *  Development only: outside the journal, so a run it touches no longer replays. */
        fireEvent(id) {
            const result = debugFireEvent(id);
            if (result && !result.queued) { _updateWire(); _refreshWorld(); }
            if (result) console.log('Fired:', id, result);
            return result;
        },
        /** Show an arbitrary popup (no event engine needed). Development only, as above. */
        popup(headline, context, choices) {
            debugPopup({ headline, context, choices: choices || [{ label: 'OK', desc: 'Dismiss' }], popup: true });
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
        if (run.engine) updateStandings($, run.engine.world, factions, getFactionDescriptor);
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

/** S: hide or show the book beside the tape (the tape takes the width). */
function _toggleRail() {
    document.body.classList.toggle('rail-off');
    _haptic('light');
}


/** The dateline's regime: the Classic preset, or the race's control regime. */
function _regimeLabel() {
    const idx = $.presetSelect.selectedIndex;
    if (!isDynamicPreset(idx)) return PRESETS[idx] ? PRESETS[idx].name : '';
    const reg = run.race ? run.race.controlRegime : 'private';
    return 'Dynamic, ' + reg;
}

function _tapeSnapshot() {
    const prev = sim.history.get(sim.day - 1);
    return { S: sim.S, prevClose: prev ? prev.close : sim.S, vx: market.vxhcn || 0, rate: sim.r, rel: relDay() };
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
        rel: relDay(), regime: _regimeLabel(), S: t.S, prevClose: t.prevClose,
        vx: _publishVxhcn(), rate: t.rate, equity: portfolioEquity(), initial: portfolio.initialCapital,
    });
}

/** The wire: the front page's lead and the whole wire under it. */
function _updateWire() {
    const log = run.engine ? run.engine.eventLog : [];
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

function frame(now) {
    if (playing) {
        // A skip runs the same loop at its own rate: at most one day closes a frame.
        const tickInterval = 1000 / _daysPerSec();
        const substepInterval = tickInterval / INTRADAY_STEPS;

        if (!run.dayOpen) {
            // Start a new day if enough time has passed since last tick
            if (now - lastTickTime >= tickInterval) {
                beginDay();
                // Advance by tickInterval (not now) to avoid drift; clamp
                // to prevent burst catch-up after tab was backgrounded
                lastTickTime = Math.max(lastTickTime + tickInterval, now - tickInterval);
                chart.setLiveCandle(sim._partial);
                dirty = true;
            }
        }

        if (run.dayOpen) {
            const elapsed = now - lastTickTime;
            // How many sub-steps should be done by now
            const targetSteps = Math.min(
                INTRADAY_STEPS,
                Math.floor(elapsed / substepInterval) + 1
            );
            // Run any pending sub-steps
            let stepped = false;
            while (sim.substepsDone < targetSteps) {
                substep();
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
            // keeps the day OPEN (run.js tryClose drains it first, so a beat still
            // queued reaches the player and the day is never stranded).
            if (sim.dayComplete) tryClose();
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
    const actions = run.engine ? getAvailableActions(day, portfolio.cash) : [];
    $.lobbyBar.hidden = !run.engine || actions.length === 0;
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
 * Show the dispatch the run has up (run.js keeps the queue). A dispatch stops a
 * skip at once, mid-day if that is when it opens, and the stop stays paused (02a
 * "Pacing"); otherwise a running desk resumes once every dispatch is answered.
 * The answer is a command naming the dispatch by its occurrence id.
 */
function _showDispatch(event) {
    if (_skipping) _endSkip('dispatch');
    else if (playing) _resumeAfterDispatch = true;
    playing = false;
    updatePlayBtn($, playing);

    const contextText = typeof event.context === 'function'
        ? event.context(sim, run.engine?.world, portfolio)
        : event.context || '';
    const popupCat = event.category || (event.id && event.id.startsWith('desk_') ? 'desk' : '');
    playStinger('alert');
    const isSuperevent = !!event.superevent;
    if (isSuperevent) {
        const _seMu = event.params?.mu || (event.choices?.[0]?.deltas?.mu) || 0;
        if (_seMu > 0) playMusic('triumph');
        else if (_seMu < -0.03) playMusic('collapse');
        else playMusic('tension');
    }
    const _dd = document.getElementById('dispatch-date');
    if (_dd) _dd.textContent = `Edition ${Math.max(1, relDay() + 1)} · day ${Math.max(0, relDay())}`;
    showPopupEvent($, event.headline, contextText, event.choices, (idx) => {
        if (isSuperevent) stopMusic(2000);
        runCommand({ kind: 'answer', occ: event._occ, choice: idx });
        dirty = true;
        _resumeAfterDispatches();
    }, popupCat, event.magnitude, isSuperevent);
}

/** The last edition: the epilogue, the almanac's record appended once (never by
 *  a replay), and the save cleared after it (02a "Save and resume"). */
function _onLastEdition(pages, record) {
    _showEpilogue(pages, true);   // terminal: no "keep playing"
    if (_replaying) return;
    if (record) { appendAlmanac(record); renderAlmanac(); }
    _runEnded = true;
    try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
}

// ---------------------------------------------------------------------------
// Save and resume (02a "Save and resume")
// ---------------------------------------------------------------------------

/** Write the save between days (each close, after its dispatches; each command
 *  made between days): the header, the journal, the endpoint and the Markets
 *  page's ghost. A day in progress is not saved, and nothing is saved while a
 *  save replays. */
function _save() {
    if (_replaying || _runEnded || run.dayOpen) return;
    const p = position();
    const data = {
        v: RULES_VERSION, seed: run.seed, preset: run.preset, journal: run.journal,
        endpoint: { day: p.day, phase: 'between', substeps: p.substeps, commands: run.journal.length },
        ghost: marketsGhost(),   // display state: the Markets page's curves before the latest news
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage unavailable or full */ }
}

/** The save under the current rules, or null. A save under other rules is
 *  retired with a notice; anything unreadable is dropped. */
function _readSave() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch { return null; }
    if (!raw) return null;
    let data = null;
    try { data = JSON.parse(raw); } catch { data = null; }
    if (!data || data.v !== RULES_VERSION || !Array.isArray(data.journal) || !data.endpoint) {
        try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
        if (data && data.v !== RULES_VERSION) {
            _toast('Your saved run was played under earlier rules and can’t be resumed. A new run begins.', 6000);
        }
        return null;
    }
    return data;
}

/**
 * Open the page on the saved run: replay its journal headless to exactly its
 * endpoint with the sink in replay mode, then draw the desk as it stood, paused,
 * with any unanswered dispatch back on screen. A replay that fails discards the
 * save and the page opens a new run.
 */
function _resume(data) {
    _replaying = true;
    try {
        newRun({ preset: data.preset, seed: data.seed, hand: isDynamicPreset(data.preset) });
        _onNewRun();
        replayTo(data.journal, data.endpoint);
    } catch (e) {
        console.error('[shoals] the saved run did not replay; a new run begins.', e);
        _replaying = false;
        try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
        _toast('Your saved run couldn’t be replayed in this browser. A new run begins.', 6000);
        return false;
    }
    _replaying = false;
    chainSkeleton = buildChainSkeleton(sim.S, sim.day, expiryMgr.update(sim.day));
    restoreMarkets(data.ghost);
    invalidateTicket();
    return true;
}

/** Replay the live journal in a module worker and compare its digest trail with
 *  the live run's: resolves with { ok, closes } or the first mismatch. */
function _replayCheck() {
    const live = JSON.parse(JSON.stringify(record()));
    return new Promise((resolve) => {
        const worker = new Worker('/shoals/src/run-worker.js', { type: 'module' });
        worker.onmessage = (e) => {
            worker.terminate();
            const got = e.data.digests || [];
            const n = Math.max(got.length, live.digests.length);
            for (let i = 0; i < n; i++) {
                const a = live.digests[i], b = got[i];
                if (!a || !b || a.day !== b.day || a.h !== b.h) {
                    resolve({ ok: false, close: i, day: (a || b).day, live: a ? a.h : null, replay: b ? b.h : null, error: e.data.error || null });
                    return;
                }
            }
            resolve(e.data.ok ? { ok: true, closes: n, commands: live.journal.length } : { ok: false, error: e.data.error });
        };
        worker.onerror = (e) => { worker.terminate(); resolve({ ok: false, error: e.message || 'the worker failed to load' }); };
        worker.postMessage({ header: live.header, journal: live.journal, endpoint: live.endpoint });
    });
}

/** Dispatches pause the desk the way a Paradox event pauses the map: once the
 *  last one is answered, a desk that was running runs again. A manual play or
 *  pause in between is the player's call and clears the latch (togglePlay). */
function _resumeAfterDispatches() {
    if (!_resumeAfterDispatch) return;
    if (run.gameOver || barrier()) return;
    _resumeAfterDispatch = false;
    playing = true;
    lastTickTime = _resumeClockOrigin();
    updatePlayBtn($, playing);
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
    updateStandingOrdersPanel($, run.race ? standingOrdersView() : null, _onStandingToggle);
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
    if (run.gameOver) return;
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
    if (!run.dayOpen) return now - Math.max(2000, tickInterval);
    return now - sim.substepsDone * (tickInterval / INTRADAY_STEPS);
}

function step() {
    if (_skipping) { _endSkip(null); return; }   // ends a skip in progress, paused
    if (playing) return;
    if (run.gameOver) return;   // same reason as togglePlay: never reopen an aborted day

    // Start a new day if none in progress (installs overlays via the shared helper).
    if (!run.dayOpen) {
        beginDay();
        chart.setLiveCandle(sim._partial);
    }

    // Advance one substep. A day whose substeps already finished behind the popup
    // barrier is NOT re-stepped -- it is waiting to be closed, not to be traded.
    if (!sim.dayComplete) {
        substep();
        chart.setLiveCandle(sim._partial);
        _onSubstepUI();
    }

    // If all substeps done, close the day (overlays removed) then bookkeeping --
    // unless the popup barrier holds (02a "Act III").
    if (sim.dayComplete) tryClose();

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

/** The page's half of a new run: the skip, the clock, the Brief's pages and
 *  overlays, the band. */
function _resetShell() {
    _endSkip(null);
    _prevCloseEquity = null;
    _skipLogMark = null;
    _runEnded = false;
    resetBrief();
    resetMarkets();
    resetTicket();
    setFolioCount('markets', 0);
    document.getElementById('epilogue-overlay')?.classList.add('hidden');
    document.getElementById('fraud-overlay')?.classList.add('hidden');
    document.getElementById('popup-event-overlay')?.classList.add('hidden');
    resetAudio();
    playing = false;
    _resumeAfterDispatch = false;
}

/** After the run's newRun: the display histories start from the new run (the
 *  sparkline backfills over the prepopulated year, the tape's origin is Edition 1). */
function _onNewRun() {
    _initPortfolioHistory();
    expiryMgr.init(sim.day);
    chart.dayOrigin = run.origin;
    chart.resetTransients();   // P7-1 ruling 5: lerp AND the pending one-frame wrong print
    chainSkeleton = buildChainSkeleton(sim.S, sim.day, expiryMgr.update(sim.day));
    bookDirty = true;
    $.presetSelect.selectedIndex = run.preset;
    syncSettingsUI($, _simSettingsObj());
    updatePlayBtn($, playing);
    _syncSkipBtn();
    updateDynamicSections($, run.preset);
    resetRacePage();
}

/** Draw the desk as the run stands (a new run, or a resumed one). */
function _drawDesk() {
    _updateWire();
    _refreshWorld();
    updateUI();
    _updateTraitDisplay();
    _updateRegulationDisplay();
    _updateLobbyPills();
    _repositionCamera();
    renderTicket();
    if (currentPage() === 'meridian') renderHandover(dealtFixture());
    dirty = true;
}

/**
 * A new run (a reset, a mode change, the epilogue's restart): a fresh run seed
 * (randomSeed(), the one ambient draw), the run's newRun, and the save replaced
 * by the new run's.
 */
function _startRun(index) {
    _resetShell();
    newRun({ preset: index, seed: randomSeed() });
    _onNewRun();
    marketsDayClose(null);
    _drawDesk();
    _save();
}

function loadPreset(index) {
    _startRun(index);
    _haptic('medium');
}

function resetSim() {
    _startRun($.presetSelect.selectedIndex);
    _haptic('heavy');
}

/** A pricing setting from Meridian's sliders: a command. */
function syncSliderToSim(param, value) {
    runCommand({ kind: 'setting', param, value });
    dirty = true;
}


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
        // `_resetCore` resets the chassis but leaves the OLD run.race -- already
        // resolved and (on the timeout path) extrapolated to day ~2800 -- plus the
        // old run.engine, Consensus book and compute book in place. The next bridge
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
    raceBtn.classList.toggle('hidden', !run.race);
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
    if (run.race) { endRacePage(); revealRace(true); }

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
