/* ===================================================
   endings.js -- Terminal condition evaluation + the 5-page
   adaptive epilogue ENGINE (overhaul phase 6, round 3).

   checkEndings' trigger logic survives from the prototype;
   what a trigger MEANS changed (P6-1 ruling): firing is a
   PLAYER-TERMINAL state -- the desk locks, the world
   extrapolates, the book closes out against the resolved
   world, and this engine renders the epilogue against that
   resolution.

   PROSE DISCIPLINE (P6-3): this engine emits NO sentences.
   Every narrative line is a `PROSE: coordinator` SLOT keyed
   by (family, overlay, page), looked up with graceful
   fallback; the coordinator fills the composition table
   incrementally. What this file owns is STRUCTURE and
   NUMBERS -- page scaffolding, the closeout scorecard, the
   ledger STATEMENT, faction/scorecard tables. Slot selection
   only; never conditional sentence composition.

   Pure of DOM. Returns page objects { title, body(HTML) }.
   =================================================== */

import { computePositionValue } from './position-value.js';
import { INITIAL_CAPITAL, HISTORY_CAPACITY, TERM_END_DAY } from './config.js';
import { getFactionState, getFaction } from './faction-standing.js';
import { getActiveTraitIds, getTrait } from './traits.js';
import { ledgerComputeEquiv } from './race/ledger.js';

// -- HTML helpers -------------------------------------------------------------

function _p(text) { return `<p>${text}</p>`; }
function _h3(text) { return `<h3>${text}</h3>`; }

function _statSection(title, rows) {
    let html = `<div class="stat-group"><div class="group-label">${title}</div>`;
    for (const [label, value] of rows) {
        html += `<div class="stat-row"><span>${label}</span><span class="stat-value">${value}</span></div>`;
    }
    html += '</div>';
    return html;
}

// -- Formatting helpers -------------------------------------------------------

function _dollar(n) {
    const sign = n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _pct(n) {
    const sign = n > 0 ? '+' : '';
    return sign + (n * 100).toFixed(1) + '%';
}
function _pctAbs(n) { return (n * 100).toFixed(1) + '%'; }
function _num(n, d = 3) { return (Number.isFinite(n) ? n : 0).toFixed(d); }

// -- Equity helper ------------------------------------------------------------

function _computeEquity(portfolio, sim) {
    let equity = portfolio.cash;
    for (const pos of portfolio.positions) {
        equity += computePositionValue(pos, sim.S, Math.sqrt(sim.v), sim.r, sim.day, sim.q);
        if (pos._reservedMargin) equity += pos._reservedMargin;
    }
    return equity;
}

// =============================================================================
// Terminal condition evaluation (trigger logic survives; MEANING changed to
// player-terminal per the P6-1 ruling -- see main.js integration)
// =============================================================================

/**
 * Check if any player-terminal condition is met. Priority-ordered: first match
 * fires. UNCHANGED trigger logic (P6-3: firing now locks the desk and closes the
 * book against the extrapolated world, rather than rendering the prototype world).
 * @returns {string|null} player-terminal state id, or null
 */
export function checkEndings(sim, portfolio, world, playerChoices = {}) {
    const f = getFactionState();
    const equity = _computeEquity(portfolio, sim);

    if (f.regulatoryExposure >= 95 && playerChoices.liedInTestimony) return 'criminal_indictment';
    if (equity <= 0) return 'margin_call_liquidation';
    const firmCollapse = f.firmStanding < 15 && f.regulatoryExposure > 60 &&
        (world?.investigations?.okaforProbeStage >= 1 || world?.media?.leakCount >= 2);
    if (firmCollapse) return 'firm_collapse';
    if (f.firmStanding <= 0) return 'forced_resignation';
    if (f.regulatoryExposure > 75 && playerChoices.cooperating) return 'whistleblower';
    if (sim.day >= TERM_END_DAY) return 'term_ends';
    return null;
}

// =============================================================================
// Family + personal-overlay metadata
// =============================================================================

const FAMILY_NAMES = {
    1: 'Won with Margin', 2: 'The Knife-Edge', 3: 'Misaligned Takeoff',
    4: 'China First', 5: 'The Deal', 6: 'The Fizzle',
};
const OVERLAY_NAMES = {
    margin_called: 'Margin-Called', convicted: 'Convicted',
    whistleblower_exile: 'Whistleblower', gray_eminence: 'Gray Eminence',
    bystander: 'Bystander',
};

// Terminal queue discipline (02a P6-3): once terminal closeout starts, only
// terminal-SAFE beats survive in the popup queue -- TODAY exactly category 'summit'
// (treaty_holds / treaty_resolution: effect-free acknowledgments by construction).
// Every ordinary queued popup is discarded so no queued choice (cashPenalty,
// factionShift, trade) can mutate the settled book or stale the epilogue. Later
// terminal beats (P7's room) opt in by CATEGORY here, never by ad-hoc exemption.
export const TERMINAL_SAFE_CATEGORIES = new Set(['summit']);

/** True if a queued popup is a terminal-safe beat (survives the game-over queue filter). */
export function isTerminalSafeBeat(popup) {
    return !!popup && TERMINAL_SAFE_CATEGORIES.has(popup.category);
}

// Involvement thresholds (P6-3 proposal -- code-local, FLAGGED for coordinator).
// Signals are ACTIONS the frozen complicity ledger recorded, plus the direct
// terminal-causality read dP; convictions (traits) are NOT a primary signal (a
// belief is not an act -- Codex ruling), reserved as a narrative tie-break.
const OVERLAY_THRESH = { C: 0.02, S: 0.03, F: 0.05, treaty: 1, dP: 0.03 };

/**
 * Determine the personal overlay (05: margin_called / convicted / whistleblower_exile
 * / gray_eminence / bystander). PROPOSAL (reported, tone-free): the three ruin states
 * map to their namesake overlay; the survive-or-quiet-exit states (term_ends /
 * forced_resignation / firm_collapse) split on INVOLVEMENT, judged on what the frozen
 * ledger records the player DID -- cost-of-capital financing (C), restraint bought
 * (S), the advice line (F, the PLAYER conversion component, not raw race.F which
 * carries autonomous market wake), diplomacy (treaty) -- plus the firm-conversion
 * latch and the DIRECT terminal-causality signal |dP| (the player's attributable
 * share of the margin at resolution). Any above threshold -> gray_eminence ("the
 * room, at maximum weight"); otherwise bystander ("rich, uninvolved").
 *
 * @param {string} endingId     player-terminal state
 * @param {object} totals       ledgerTotals() { C?, S?, heat?, F?, treaty? }
 * @param {number} dP           |resolution.axes.dP| -- player-attributable margin at resolution
 * @param {boolean} converted   firm converted to the player's thesis (fund-as-actor latch)
 * @returns {string} overlay id
 */
export function determineOverlay(endingId, totals = {}, dP = 0, converted = false) {
    if (endingId === 'criminal_indictment') return 'convicted';
    if (endingId === 'margin_call_liquidation') return 'margin_called';
    if (endingId === 'whistleblower') return 'whistleblower_exile';
    // term_ends / forced_resignation / firm_collapse -> involvement split (actions only).
    const involved =
        Math.abs(totals.C || 0) >= OVERLAY_THRESH.C ||
        (totals.S || 0) >= OVERLAY_THRESH.S ||
        Math.abs(totals.F || 0) >= OVERLAY_THRESH.F ||
        (totals.treaty || 0) >= OVERLAY_THRESH.treaty ||
        Math.abs(dP || 0) >= OVERLAY_THRESH.dP ||
        converted;
    return involved ? 'gray_eminence' : 'bystander';
}

// =============================================================================
// Prose slot table (PROSE: coordinator -- filled incrementally by the coordinator)
// =============================================================================
//
// EPILOGUE_SLOTS[family]?.[overlay]?.[page] = '<html prose>'. Empty at hand-off;
// the engine falls back gracefully (family+overlay -> family-any -> any-any ->
// a neutral structural marker) so the epilogue is COHERENT and clearly marks
// where prose goes, with the engine composing no sentences of its own.
const EPILOGUE_SLOTS = {};

const PAGE_TITLES = ['The Resolution', 'The Race', 'The Reckoning', 'The Desk', 'The Ledger'];

/** Resolve the (family, overlay, page) prose slot with graceful fallback. */
function slot(family, overlay, page) {
    const byFam = EPILOGUE_SLOTS[family];
    const s =
        byFam?.[overlay]?.[page] ??
        byFam?.['*']?.[page] ??
        EPILOGUE_SLOTS['*']?.['*']?.[page];
    if (s) return s;
    // Neutral fallback marker (NOT prose): names the unfilled slot so the coordinator
    // can see exactly which (family, overlay, page) cell to compose next.
    const fam = FAMILY_NAMES[family] || 'Unresolved';
    const ov = OVERLAY_NAMES[overlay] || overlay || '-';
    return `<p class="epilogue-slot-placeholder"><em>[PROSE: coordinator &mdash; ${PAGE_TITLES[page - 1]} &middot; ${fam} &middot; ${ov}]</em></p>`;
}

// =============================================================================
// Epilogue generation (5 pages, slot-driven)
// =============================================================================

/**
 * Generate the 5-page adaptive epilogue. Structure + numbers here; sentences are
 * (family, overlay, page) slots.
 *
 * @param {string} endingId  player-terminal state
 * @param {object} ctx       {
 *   resolution,          // race.resolution (family + axes + terminalCause + day)
 *   overlay,             // determineOverlay result
 *   totals,              // ledgerTotals()
 *   closeout,            // closeoutBook result { rows, ctx, totalCash, totalPnl } | null
 *   sim, portfolio, playerChoices, eventLog, impactHistory, quarterlyReviews
 * }
 * @returns {Array<{title,body}>}
 */
export function generateEnding(endingId, ctx = {}) {
    const resolution = ctx.resolution || null;
    const family = resolution ? resolution.family : 0;
    const overlay = ctx.overlay || 'bystander';
    const factionState = getFactionState();
    const traitIds = getActiveTraitIds();

    return [
        _pageResolution(family, overlay, resolution),
        _pageRace(family, overlay, resolution),
        _pageReckoning(family, overlay, endingId, factionState),
        _pageDesk(family, overlay, ctx.closeout, ctx.sim, ctx.portfolio),
        _pageLedger(family, overlay, ctx, factionState, traitIds),
    ];
}

// -- Page 1: The Resolution (the world's terminal) ---------------------------

function _pageResolution(family, overlay, resolution) {
    let body = slot(family, overlay, 1);
    if (resolution) {
        const ax = resolution.axes || {};
        body += _statSection('World Outcome', [
            ['Outcome', FAMILY_NAMES[family] || '-'],
            ['Terminal cause', _label(resolution.terminalCause)],
            ['Resolved (day)', String(resolution.day)],
            ['Path', resolution.extrapolated ? `extrapolated +${resolution.extrapolationDays}d` : 'in-horizon'],
        ]);
    }
    return { title: PAGE_TITLES[0], body };
}

// -- Page 2: The Race (crossing entity, alignment, control) ------------------

function _pageRace(family, overlay, resolution) {
    let body = slot(family, overlay, 2);
    if (resolution) {
        const ax = resolution.axes || {};
        body += _statSection('The Sampled World', [
            ['Frontier leader', _label(ax.leader)],
            ['Crossing entity', ax.crossingEntity ? _label(ax.crossingEntity) : 'none (no takeoff)'],
            ['Alignment', _label(ax.alignmentResult)],
            ['Political control', _label(ax.politicalControl)],
        ]);
    }
    return { title: PAGE_TITLES[1], body };
}

// -- Page 3: The Reckoning (personal overlay) --------------------------------

function _pageReckoning(family, overlay, endingId, factionState) {
    let body = slot(family, overlay, 3);
    body += _statSection('Personal Standing', [
        ['Outcome', OVERLAY_NAMES[overlay] || '-'],
        ['Desk ended by', _label(endingId)],
        ['Meridian standing', `${Math.round(factionState.firmStanding || 0)}/100`],
        ['Regulatory exposure', `${Math.round(factionState.regulatoryExposure || 0)}/100`],
    ]);
    return { title: PAGE_TITLES[2], body };
}

// -- Page 4: The Desk (terminal closeout scorecard) --------------------------

function _pageDesk(family, overlay, closeout, sim, portfolio) {
    let body = slot(family, overlay, 4);
    // Aggregate P&L by instrument cell across ALL NINE cells (P6-3 finding 4): the
    // matrix book (HCN shares / options / VXHCN / bonds) PLUS the two finalizer sets
    // -- Consensus binaries and compute futures -- so a binaries-or-compute-only book
    // no longer reads "none at term".
    const agg = {};
    const add = (cell, pnl) => { if (!agg[cell]) agg[cell] = 0; agg[cell] += pnl; };
    if (closeout) {
        for (const r of (closeout.rows || [])) add(r.cell || r.type, r.pnl);
        for (const r of (closeout.binary || [])) add('binary', r.pnl);
        for (const r of (closeout.compute || [])) add('compute', r.pnl);
    }
    const LABELS = { stock: 'HCN shares', option: 'HCN options', vxhcn: 'VXHCN futures',
        bond: 'Bonds', binary: 'Consensus binaries', compute: 'Compute futures' };
    const ORDER = ['stock', 'option', 'vxhcn', 'bond', 'binary', 'compute'];
    const rows = ORDER.filter(k => k in agg).map(k => [LABELS[k], `${_dollar(agg[k])} P&L`]);
    body += _statSection('Terminal Closeout', rows.length ? rows : [['Open positions at term', 'none']]);
    if (closeout && closeout.ctx && closeout.ctx.hcnConverted) {
        body += _statSection('Nationalization', [['HCN conversion price', _dollar(closeout.ctx.hcnMark)]]);
    }
    return { title: PAGE_TITLES[3], body };
}

// -- Page 5: The Ledger (complicity statement) -------------------------------

function _pageLedger(family, overlay, ctx, factionState, traitIds) {
    let body = slot(family, overlay, 5);

    // The complicity STATEMENT (05): the player's cumulative attributable channels,
    // rendered against the world outcome. Numbers + labels are structural (mine);
    // the sentence framing them is the slot above.
    const t = ctx.totals || {};
    const ledgerRows = [];
    if (t.C != null && t.C !== 0) {
        const eq = ledgerComputeEquiv(t.C);
        ledgerRows.push(['Compute financed (C)', `${_num(t.C)} rung-units`]);
        ledgerRows.push(['Release-days pulled forward', _num(eq.releaseDaysPulledForward, 0)]);
    }
    if (t.S != null && t.S !== 0) ledgerRows.push(['Restraint bought (S)', `${_num(t.S)} margin-units`]);
    if (t.heat != null && t.heat !== 0) ledgerRows.push(['Heat added', _num(t.heat)]);
    if (t.F != null && t.F !== 0) ledgerRows.push(['Firm belief moved (F)', _num(t.F)]);
    if (t.treaty != null && t.treaty !== 0) ledgerRows.push(['Treaty advanced', `${_num(t.treaty, 0)} stage(s)`]);
    if (ledgerRows.length === 0) ledgerRows.push(['Attributable channels', 'none (the desk moved nothing that counts)']);
    body += _statSection('The Complicity Ledger', ledgerRows);

    // Final scorecard (structural).
    body += _financialScorecard(ctx.sim, ctx.portfolio, ctx.closeout);
    return { title: PAGE_TITLES[4], body };
}

// -- Financial scorecard (structural) ----------------------------------------

function _financialScorecard(sim, portfolio, closeout) {
    if (!sim || !portfolio) return '';
    // Post-closeout equity is cash (closeout converted every valued position); fall
    // back to the mark-to-market equity when the closeout is absent (pre-integration).
    const equity = closeout ? portfolio.cash : _computeEquity(portfolio, sim);
    const totalPnl = equity - INITIAL_CAPITAL;
    const pnlPct = totalPnl / INITIAL_CAPITAL;
    const peakValue = portfolio.peakValue || equity;
    const maxDrawdown = portfolio.maxDrawdown || 0;
    let html = _statSection('Portfolio Performance', [
        ['Final Value', _dollar(equity)],
        ['Total P&L', `${_dollar(totalPnl)} (${_pct(pnlPct)})`],
        ['Peak Value', _dollar(peakValue)],
        ['Max Drawdown', _pctAbs(maxDrawdown)],
    ]);
    html += _statSection('Trading Activity', [
        ['Trades Executed', (portfolio.totalTrades || 0).toLocaleString()],
        ['Options Exercised', (portfolio.totalExercises || 0).toLocaleString()],
        ['Margin Calls', (portfolio.marginCallCount || 0).toLocaleString()],
    ]);
    return html;
}

// -- Small label prettifier (data enums -> Title Case; NOT prose) ------------

function _label(s) {
    if (s == null) return '-';
    return String(s)
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}
