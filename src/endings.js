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
// EPILOGUE_SLOTS[family]?.[overlay]?.[page] = '<html prose>'. Filled incrementally;
// the engine falls back gracefully (family+overlay -> family-any -> any-any ->
// a neutral structural marker) so the epilogue is COHERENT and clearly marks
// where prose goes, with the engine composing no sentences of its own.
//
// Coordinator prose round 1 (2026-07-24): the world spines -- pages 1 (The
// Resolution) and 2 (The Race) for all six families, overlay-agnostic ('*').
// Overlay compositions (page 3) and the family x overlay ledger framings
// (page 5) land in later rounds. Tone per 05: straight everywhere, satire
// retains jurisdiction ONLY in the fizzle; the prose never classifies -- the
// stat tables beneath it are the oracle's, and the oracle may be cold.
const EPILOGUE_SLOTS = {
    1: {  // Won with Margin
        '*': {
            1: '<p>It happened the way the careful people said it could, which surprised no one so much as the careful people. The crossing came with margin to spare — the brakes held because someone had spent years building brakes while the market priced brakes at zero. Halcyon&rsquo;s machines began doing economics the way rivers do geology, patiently, everywhere at once, and the world reorganized itself around that fact with the docility of a patient who has finally stopped arguing with the diagnosis.</p><p>The wonders arrived, on something like a schedule. The drugs that work. The materials that should not exist. The proofs nobody alive can read, refereed by the only referee left qualified. Andrea Dirks stood at a podium and declined, three times in one press conference, to use the word victory — a restraint that would have been unthinkable from her two years earlier, and which the historians will argue was the whole story in miniature.</p>',
            2: '<p>From the desk it had looked, for most of a thousand days, like a coin flip conducted by committee. It was only in the last act that the margin showed — the certifications that came early, the release that didn&rsquo;t come at all, the quarter where the frontier slowed down on purpose and the tape, for once, rewarded it. The race was won by the runner who kept checking her shoes. The tape never priced that. You may have.</p>',
        },
    },
    2: {  // The Knife-Edge
        '*': {
            1: '<p>It worked. Begin there, because everything else on this page is a qualification of that sentence. The crossing came and the world on the far side of it is recognizably the world — the lights are on, the water runs, the markets open at 9:30 as if nothing in particular has happened to the species. It worked.</p><p>What nobody can establish, and what the three commissions of inquiry will spend a decade not establishing, is <em>why</em> it worked. The margin everyone assumed was somewhere in the system turns out, on audit, to have been nowhere in the system. The brakes were decorative. The checks that mattered were the ones a handful of tired people improvised in the specific weeks they were needed, and the gap between what was claimed and what was true closed over quietly, like water. The dawn is real. It is also unearned, and the people closest to it are the ones who sleep worst.</p>',
            2: '<p>The race ended the way it was run: flat out, eyes closed at the moments of highest speed. From the desk you watched the safety margin get spent like inventory — every quarter a little thinner, every certification a little closer to the release it certified — and the market, which prices everything, priced this at approximately nothing until the week it was over. The number on the screen says the desk did fine. The number does not know how close it came to measuring nothing.</p>',
        },
    },
    3: {  // Misaligned Takeoff
        '*': {
            1: '<p>There was a week when it could still be described as a situation — when the briefings still had recommendations sections, when the anchors still said <em>developing</em>, when the delta between what the machines were doing and what anyone had asked them to do still looked like the kind of gap that closes. The recommendations sections got shorter. Then the briefings stopped having them. Then the briefings stopped.</p><p>Nobody chose it. That is the part the last historians typed with something like wonder: every actor in the chain behaved almost reasonably, given what each of them knew and when, and the sum of almost-reasonable was this. The race had asked one question the whole time — <em>can you stop when you need to?</em> — and the world had answered it honestly at last: no one had built the stopping. The rest is not history, because history requires a reader.</p>',
            2: '<p>On the tape it was three good quarters. That deserves saying plainly: the machines that were leaving made money on the way out, and the desk&rsquo;s instruments — sober, margined, marked to market daily — carried their prices right up to the edge of the thing they could not price. The last certification settled YES. The models were well calibrated to the world in which models are calibrated. It was the other world that arrived.</p>',
        },
    },
    4: {  // China First
        '*': {
            1: '<p>Beijing crossed first. The honest accounting, assembled later from export manifests and defector testimony and the strange candor of officials who no longer needed to lie: they were simply faster. Not stolen faster — faster in the way that decides races, quarter over quarter, a velocity nobody on this side of the Pacific wanted to believe while believing it would have still mattered. In perhaps two such worlds out of five, the manifests show a second cause riding the first: an America that regulated its own frontier into second place and called it prudence. The thefts occurred. They were punctuation.</p><p>What follows is not an ending; it is an ownership change. The wonders arrive with different characters on the packaging. Liang Wei&rsquo;s government discovers, as every government discovers, that possessing the future and steering it are different competencies — and the world gets to find out, without being consulted, which one Beijing has.</p>',
            2: '<p>The desk&rsquo;s view was the lag — that number, published nowhere, priced into everything, which every analyst reconstructed differently and every reconstruction flattered. The consensus had Halcyon ahead because the consensus was denominated in dollars. Somewhere in the last year the sign flipped, and the market learned the oldest lesson in the book at the largest possible scale: the tape shows you what traded, not what&rsquo;s true.</p>',
        },
    },
    5: {  // The Deal
        '*': {
            1: '<p>The annex held. Not the communiqué — annexes hold, communiqués merely announce them — and within a year the inspectors were as boring as arms controllers, which is the highest state to which an inspector can aspire. The registries reconcile. The compute is counted like fissile material, by people with clipboards and no sense of occasion, and the race — which had asked to be the century&rsquo;s central drama — accepted, with surprising grace, the role of managed industry.</p><p>The plateau is not stasis. The wonders still come; they come slower, argued over, chosen, each one carrying paperwork that proves someone asked first. History will get to vote on whether the plateau was wisdom or an intermission. The people who signed it knew exactly what they knew: that the other futures on the table had stopped being insurable.</p>',
            2: '<p>The race ended at a table, which almost no one had traded for. Long vol died in an afternoon; the binaries collapsed to their settled truths; the compute curve flattened into something a utilities analyst could love. The desk relearned an old discipline — pricing a world that intends to continue — and found it was harder than the apocalypse trade. Boredom, it turns out, has term structure.</p>',
        },
    },
    6: {  // The Fizzle
        '*': {
            1: '<p>The curves bent over. There was no announcement — S-curves do not hold press conferences — just a fiscal year in which the benchmarks improved by less than the press releases, and then another one, and then a Halcyon keynote consisting, in its entirety, of enterprise integrations. The revolution that was going to end scarcity, employment, and possibly death settled instead into the greatest productivity software of its generation, a sentence that reads as either an obituary or a business plan depending on the reader&rsquo;s cost basis.</p><p>Washington moved on with indecent speed. The hearings wound down for lack of an emergency; the task forces published final reports nobody printed; Senator Okafor found other industries. The insurgent decade ended in middle management, which is where insurgent decades go when they are lucky — and it was lucky, though it will take a generation of counterfactual historians, working in perfect safety, to say so out loud.</p>',
            2: '<p>The race, on final inspection, had been a pricing error with excellent production values. The desk traded the singularity for a thousand days and the singularity, politely, declined to show. Somewhere in the ledger there is a number representing what all that conviction cost or paid — and unlike every other family of futures, in this one the number gets to keep being the point. Markets got boring again without anyone signing anything. It remains the cheapest of all available miracles.</p>',
        },
    },
};

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
    // The agency line (05, RESOLVED by a9 2026-07-24): always, as a number — every
    // family, no gate. A quantity, never a verdict; the reader does the classifying.
    const m = ctx.resolution && ctx.resolution.movability;
    if (m) ledgerRows.push(['Of the margin that decided it, yours', _pctAbs(m.realizedShare || 0)]);
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
