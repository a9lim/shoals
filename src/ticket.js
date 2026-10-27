/* =====================================================
   ticket.js -- The ticket: the one place the desk
   trades. Legs come from the markets page, a point on
   any curve or a row of an opened curve's table: a click
   adds the contract long, a second flips it short, a
   third removes it (a right-click goes short at once).

   Each leg carries a signed ratio and the size scales
   them all, so a butterfly is +1 / -2 / +1 at any size.
   One leg, or a named strategy, may rest as a limit or
   stop order on HCN's price; anything else trades at
   market. A named ticket of stock, bonds, VXHCN and
   options trades as one strategy (every leg or none,
   grouped in the book); any other ticket trades leg by
   leg. Strategies load and save here (strategy-store.js).

   The figure prices the book at a horizon over HCN
   moves, one line per scenario row: how far the race
   gets (in Classic, where there is no race, how
   volatility goes). The grid is its table. "Include my
   book" folds the live positions in, marked from today.

   The scenario model is the display's, not the engine's:
   the HCN move is given; variance follows Heston's mean
   reversion with a leverage shock; each newly certified
   rung lifts the long-run rate by the capex channel's
   0.005 (02a); Consensus reprices off belief B evaluated
   on a copy of the public record at the horizon, with the
   row's certification added, or on the quiet row each
   lab's routine releases at its trailing cadence
   (scenarioBelief, display only); compute reprices off
   the public curve with the new certified rung. Hidden
   state is never read.

   The flatten (02a "The evening") loads a closing leg
   for every position that can trade, each reduce-only
   and bound to its position's id and strategy name, at
   size one; the rest are named under the ticket. It
   shows its estimated cost apart from the cash it
   releases, and trades leg by leg like any ticket. An
   edit to its legs makes it an ordinary ticket.
   ===================================================== */

import { market } from './market.js';
import { TRADING_DAYS_PER_YEAR, BOND_FACE_VALUE } from './config.js';
import { allocTree, prepareTree, priceWithTree, vasicekBondPrice, computeEffectiveSigma, computeSkewSigma, computeVXHCNFuturePrice, computeVXHCNSpot } from './pricing.js';
import { unitPrice } from './position-value.js';
import { computeBidAsk, computeOptionBidAsk, aggregateGreeks, estimateReduceOnly } from './portfolio.js';
import { consensus, contractByKey, BINARY_NOTIONAL } from './race/consensus.js';
import { computeMarket, buildComputePublicView, placeholderCurve } from './race/compute-market.js';
import { belief, computeCurveFromBelief, certDay, scenarioBelief } from './race/belief.js';
import { listStrategies, getStrategy, saveStrategy, deleteStrategy, resolveLegs, legsToRelative, nextAutoName } from './strategy-store.js';
import { contractName, fmtSpan, fmtSigned, fmtDollar } from './format-helpers.js';
import { getVxhcnImpact } from './price-impact.js';

const TY = TRADING_DAYS_PER_YEAR;
const MOVES = Array.from({ length: 41 }, (_, i) => Math.round((-0.4 + 0.02 * i) * 100) / 100);
const COLS = [5, 10, 15, 20, 25, 30, 35];        // the grid's moves, as indices into MOVES (-30% .. +30%)
const CAPEX_B = 0.005;                            // 02a "Rates: the capex channel", per rung rise
const STRATEGY_TYPES = new Set(['stock', 'bond', 'vxhcnfuture', 'call', 'put']);
const MARKET_ONLY = new Set(['binary', 'computefuture']);
const DASH = [[], [6, 3], [1.5, 2.5]];
const GREEKS = [['delta', 'Δ'], ['gamma', 'Γ'], ['theta', 'Θ'], ['vega', 'ν'], ['rho', 'ρ']];
const RATIO_MAX = 9999;                           // what a player types; a flatten leg may hold more

const _st = {
    legs: [], size: 1, order: 'market', trigger: 100, name: '', stratId: null,
    horizon: 63, horizonSet: false, mine: false, ctx: null, hooks: null, el: {}, tree: null,
    fig: { w: 0, h: 0, dpr: 1, c: null, hover: -1 }, calc: null,
    flat: null,   // the flatten while the ticket holds it: { off: [names left off] }
};

// ---------------------------------------------------------------------------
// Legs
// ---------------------------------------------------------------------------

/** The contract's identity: the id its curve point or table row carries. */
function _cid(type, strike, expiryDay, key) {
    switch (type) {
        case 'stock': return 'stock';
        case 'bond': return 'bond@' + expiryDay;
        case 'vxhcnfuture': return 'vx@' + expiryDay;
        case 'computefuture': return 'cmp@' + key;
        case 'binary': return 'bin@' + key;
        default: return `${type}${strike}@${expiryDay}`;
    }
}

function _leg(type, strike, expiryDay, key, ratio) {
    const c = type === 'binary' ? contractByKey(key) : null;
    return {
        id: _cid(type, strike, expiryDay, key), type, ratio,
        strike: type === 'call' || type === 'put' ? strike : undefined,
        expiryDay: type === 'binary' ? (c ? c.deadline : expiryDay) : type === 'computefuture' ? key : expiryDay,
        key: type === 'binary' || type === 'computefuture' ? key : undefined,
        R: c ? c.predicate.rung : undefined,
    };
}

/** The leg a point or row refers to. A smile point (`anyType`) is a strike, so a
 *  call and a put there both answer it. */
function _find(pt) {
    if (pt.anyType) return _st.legs.findIndex(l => (l.type === 'call' || l.type === 'put') && l.strike === pt.strike && l.expiryDay === pt.expiryDay);
    return _st.legs.findIndex(l => l.id === pt.id);
}

/** Side of the ticket's leg on a curve point or table row: 1 long, -1 short, 0 none. */
export function legState(pt) {
    const i = _find(pt);
    return i < 0 ? 0 : Math.sign(_st.legs[i].ratio);
}

/**
 * A point or row was picked. `side` 0 cycles: add long, flip short, remove.
 * `side` -1 (a right-click, a bid) goes short and removes a short; +1 (an ask)
 * goes long and removes a long.
 */
export function pickPoint(pt, side = 0) {
    _unflatten();
    const i = _find(pt);
    let msg;
    if (i < 0) {
        _st.legs.push(_leg(pt.type, pt.strike, pt.expiryDay, pt.key, side < 0 ? -1 : 1));
        msg = `Added ${pt.desc}, ${side < 0 ? 'short' : 'long'}.`;
    } else {
        // 0 cycles long, short, gone; a side toggles: to it, or off if already there.
        const L = _st.legs[i], cur = Math.sign(L.ratio);
        const want = side === 0 ? (cur > 0 ? -1 : 0) : (cur === side ? 0 : side);
        if (want) { L.ratio = want * Math.abs(L.ratio); msg = `${pt.desc}, now ${want > 0 ? 'long' : 'short'}.`; }
        else { _st.legs.splice(i, 1); msg = `Removed ${pt.desc}.`; }
    }
    _say(msg);
    _changed();
}

/** Put a contract on the ticket on `side` (1 long, -1 short) without toggling it
 *  off: the book's hand-off. */
export function addToTicket(pt, side) {
    _unflatten();
    const i = _find(pt);
    if (i < 0) _st.legs.push(_leg(pt.type, pt.strike, pt.expiryDay, pt.key, side));
    else _st.legs[i].ratio = side * Math.abs(_st.legs[i].ratio);
    _changed();
}

/**
 * The market moved a day: the figure and the grid reprice on their next render,
 * and a leg whose contract expired or settled leaves the ticket.
 */
export function invalidateTicket() {
    _st.calc = null;
    _defaultHorizon();
    if (!_st.ctx || !_st.legs.length) return;
    const day = _st.ctx.sim.day, race = _st.ctx.race();
    const live = _st.legs.filter(L => {
        if (L.type === 'binary') return !consensus.settled[L.key] && !!race && L.expiryDay > race.day;
        if (L.type === 'computefuture') return !computeMarket.settled[L.key];
        return L.type === 'stock' || L.expiryDay > day;
    });
    if (live.length === _st.legs.length) return;
    _st.legs = live;
    _say('A contract on the ticket expired and left it.');
    _changed();
}

/** Replace the ticket with resolved legs (a strategy, or a hand-off from the book). */
export function setLegs(legs, name = '', stratId = null) {
    _st.flat = null;
    _st.legs = legs.map(l => _leg(l.type, l.strike, l.expiryDay, l.key, l.qty || 1));
    _st.name = name;
    _st.stratId = stratId;
    _changed();
}

/**
 * Until the player sets it, the horizon is a quarter out or the nearest dated
 * leg's expiry, whichever is sooner: an option book reads at expiry, as payoff
 * diagrams do. (Binaries and compute run on the race clock and keep the quarter.)
 */
function _defaultHorizon() {
    if (_st.horizonSet || !_st.ctx) return;
    const day = _st.ctx.sim.day;
    let h = 63;
    for (const L of _st.legs) {
        if (L.type === 'stock' || MARKET_ONLY.has(L.type) || L.expiryDay == null) continue;
        h = Math.min(h, L.expiryDay - day);
    }
    _st.horizon = Math.max(1, Math.min(252, h));
    const el = _st.el['tk-horizon'];
    if (el) { el.value = _st.horizon; _forms.updateSliderFill(el); _st.el['tk-horizon-val'].textContent = fmtSpan(_st.horizon); }
}

/** Clear the legs and the strategy (reset / regime change). */
export function resetTicket() {
    _st.flat = null;
    _st.legs = [];
    _st.name = '';
    _st.stratId = null;
    _st.order = 'market';
    _st.calc = null;
    _st.horizonSet = false;
    _defaultHorizon();
    if (_st.el['tk-mine']) { _st.el['tk-mine'].checked = false; _st.mine = false; }
}

export function ticketLegCount() { return _st.legs.length; }

/**
 * Load the flatten (02a "The evening"): `legs` close every position that can
 * trade, each { posId, strategyName, type, qty (the closing signed quantity),
 * strike, expiryDay, key }; `off` names the positions left off. Reduce-only legs
 * are bound to their positions, so the size resets to one and the order to
 * market. INTERPRETATION: a fractional holding (a primary allocation) loads its
 * quantity rounded up to a whole unit; execution caps it at what the position
 * holds, so the leg closes all of it. A holding past the ratio control's range
 * loads whole (RATIO_MAX bounds what a player types). `orders` counts the resting
 * orders and working entries the flatten cancels, so a flatten with no positions
 * left can still be sent to cancel them.
 */
export function loadFlatten(legs, off, orders = 0) {
    _st.legs = legs.map(l => Object.assign(
        _leg(l.type, l.strike, l.expiryDay, l.key, Math.sign(l.qty) * Math.max(1, Math.ceil(Math.abs(l.qty) - 1e-9))),
        { posId: l.posId, strategyName: l.strategyName || null }));
    _st.flat = { off: off.slice(), orders };
    _st.name = '';
    _st.stratId = null;
    _st.order = 'market';
    _st.size = 1;
    const el = _st.el['tk-size'];
    if (el) { el.value = 1; _forms.updateSliderFill(el); _st.el['tk-size-val'].textContent = '1k'; }
    _say(`Loaded the flatten, ${legs.length} leg${legs.length === 1 ? '' : 's'}.`);   /* PROSE */
    _changed();
}

/** Whether the ticket holds the flatten. */
export function ticketIsFlatten() { return !!_st.flat; }

/** The player edited the flatten's legs: it trades as edited, an ordinary ticket. */
function _unflatten() {
    if (!_st.flat) return;
    _st.flat = null;
    for (const L of _st.legs) { delete L.posId; delete L.strategyName; }
}

function _changed() {
    _st.calc = null;
    _defaultHorizon();
    renderTicket();
    if (_st.hooks) _st.hooks.onChange();
}

function _say(msg) {
    if (_st.el['tk-live']) _st.el['tk-live'].textContent = msg;
}

// ---------------------------------------------------------------------------
// Init and wiring
// ---------------------------------------------------------------------------

const IDS = ['tk-legs', 'tk-empty', 'tk-size', 'tk-size-val', 'tk-order', 'tk-trigger-row', 'tk-trigger',
    'tk-trigger-val', 'tk-trigger-lbl', 'tk-cost', 'tk-greeks', 'tk-clear', 'tk-trade', 'tk-fig-sub', 'tk-canvas',
    'tk-horizon', 'tk-horizon-val', 'tk-mine', 'tk-scen', 'tk-load', 'tk-name', 'tk-save', 'tk-delete', 'tk-live'];

/**
 * @param {object} ctx    { sim, race(), geo(), positions(), expiries(), expiryDay(), vxVariance() }
 *                        expiryDay(): the Options panel's expiry, where a strategy loads;
 *                        vxVariance(): the published variance VXHCN legs are shown at
 * @param {object} hooks  { onChange(), onTrade(order), toast(msg) }
 */
export function initTicket(ctx, hooks) {
    _st.ctx = ctx;
    _st.hooks = hooks;
    const el = _st.el;
    for (const id of IDS) el[id] = document.getElementById(id);
    _st.tree = allocTree();
    _st.fig.c = el['tk-canvas'].getContext('2d');
    _st.size = Number(el['tk-size'].value) || 1;
    _st.horizon = Number(el['tk-horizon'].value) || 63;

    _forms.bindSlider(el['tk-size'], el['tk-size-val'], (v) => { _st.size = v; _st.calc = null; renderTicket(); }, (v) => v + 'k');
    _forms.bindSlider(el['tk-horizon'], el['tk-horizon-val'], (v) => { _st.horizon = v; _st.horizonSet = true; _st.calc = null; renderTicket(); }, (v) => fmtSpan(v));
    _forms.bindSlider(el['tk-trigger'], el['tk-trigger-val'], (v) => { _st.trigger = v; }, (v) => v.toFixed(0));
    el['tk-mine'].addEventListener('change', () => { _st.mine = el['tk-mine'].checked; _st.calc = null; renderTicket(); });
    el['tk-clear'].addEventListener('click', () => { if (!_st.legs.length && !_st.flat) return; _st.legs = []; _st.flat = null; _st.name = ''; _st.stratId = null; _say('Ticket cleared.'); _changed(); });
    el['tk-trade'].addEventListener('click', () => tradeTicket());
    el['tk-order'].addEventListener('click', (e) => {
        const b = e.target.closest('[data-order]');
        if (!b || b.disabled) return;
        _st.order = b.dataset.order;
        if (_st.order !== 'market') _st.trigger = Math.round(market.S);
        renderTicket();
    });
    el['tk-legs'].addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const L = _st.legs[Number(b.dataset.i)];
        if (!L) return;
        _unflatten();
        if (b.dataset.act === 'side') L.ratio = -L.ratio;
        else if (b.dataset.act === 'type') { L.type = L.type === 'call' ? 'put' : 'call'; L.id = _cid(L.type, L.strike, L.expiryDay); }
        else _st.legs.splice(Number(b.dataset.i), 1);
        _changed();
    });
    el['tk-legs'].addEventListener('change', (e) => {
        const inp = e.target.closest('[data-ratio]');
        if (!inp) return;
        const L = _st.legs[Number(inp.dataset.ratio)];
        const v = Math.max(1, Math.min(RATIO_MAX, Math.round(Number(inp.value) || 1)));
        if (L) { _unflatten(); L.ratio = Math.sign(L.ratio) * v; _changed(); }
    });
    el['tk-load'].addEventListener('change', () => { if (el['tk-load'].value) loadStrategy(el['tk-load'].value); });
    el['tk-name'].addEventListener('input', () => { _st.name = el['tk-name'].value.slice(0, 40); _renderControls(); });
    el['tk-save'].addEventListener('click', () => _save());
    el['tk-delete'].addEventListener('click', () => _delete());

    const cv = el['tk-canvas'];
    new ResizeObserver(() => { if (_sizeFig()) _drawFig(); }).observe(cv.parentElement);
    cv.addEventListener('pointermove', (e) => {
        const r = cv.getBoundingClientRect(), x = e.clientX - r.left, g = _geom();
        const i = Math.round((x - g.l) / (g.r - g.l) * (MOVES.length - 1));
        const h = i >= 0 && i < MOVES.length ? i : -1;
        if (h !== _st.fig.hover) { _st.fig.hover = h; _drawFig(); }
    });
    cv.addEventListener('pointerleave', () => { _st.fig.hover = -1; _drawFig(); });
    _renderStrategyMenu();
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

function _renderStrategyMenu() {
    const sel = _st.el['tk-load'];
    if (!sel) return;
    const all = listStrategies();
    const opt = (s) => `<option value="${s.id}">${s.name.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</option>`;
    const saved = all.filter(s => !s.builtin);
    sel.innerHTML = '<option value="">Load a strategy…</option>'
        + '<optgroup label="Built in">' + all.filter(s => s.builtin).map(opt).join('') + '</optgroup>'
        + (saved.length ? '<optgroup label="Saved">' + saved.map(opt).join('') + '</optgroup>' : '');
    sel.value = '';
}

/** Load a strategy at the Options panel's expiry, centered on today's spot. */
export function loadStrategy(id) {
    const strat = getStrategy(id);
    if (!strat) return;
    const sim = _st.ctx.sim, expiries = _st.ctx.expiries();
    const override = strat.selectableExpiry ? _st.ctx.expiryDay() : null;
    const resolved = resolveLegs(strat.legs, sim.S, sim.day, expiries, override);
    setLegs(resolved, strat.name, strat.builtin ? null : id);
    _say(`Loaded ${strat.name}.`);
    _st.el['tk-load'].value = '';
}

function _strategyable() {
    return _st.legs.length > 0 && _st.legs.every(l => STRATEGY_TYPES.has(l.type));
}

function _save() {
    if (!_strategyable()) return;
    const sim = _st.ctx.sim;
    const dated = _st.legs.filter(l => l.type !== 'stock');
    // One expiry across the legs saves relative to whatever expiry it loads at;
    // several save as fixed distances (a calendar).
    const shared = dated.length > 0 && dated.every(l => l.expiryDay === dated[0].expiryDay);
    const rel = legsToRelative(_st.legs.map(l => ({ type: l.type, qty: l.ratio, strike: l.strike, expiryDay: l.expiryDay })), sim.S, sim.day, shared);
    const id = saveStrategy(_st.stratId, _st.name, rel, shared);
    if (id === 'collision') { _st.hooks.toast('A strategy with that name already exists.'); return; }
    if (id === null) { _st.hooks.toast('Strategy limit reached (50).'); return; }
    _st.stratId = id;
    const saved = getStrategy(id);
    _st.name = saved ? saved.name : _st.name;
    _renderStrategyMenu();
    _st.hooks.toast(`Saved “${_st.name}”.`);
    renderTicket();
}

function _delete() {
    if (!_st.stratId) return;
    const s = getStrategy(_st.stratId);
    deleteStrategy(_st.stratId);
    _st.stratId = null;
    _renderStrategyMenu();
    _st.hooks.toast(`Deleted “${s ? s.name : 'strategy'}”.`);
    renderTicket();
}

// ---------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------

/** Order types the ticket allows as it stands. */
function _ordersAllowed() {
    if (_st.flat) return 'market';   // the flatten trades leg by leg at market
    const n = _st.legs.length;
    if (n === 1 && !MARKET_ONLY.has(_st.legs[0].type)) return 'all';
    if (n > 1 && _st.name.trim() && _strategyable()) return 'all';
    return 'market';
}

/** Send the ticket to the desk (main.js routes it through the ladder). */
export function tradeTicket() {
    if (_st.flat && (_st.legs.length || _st.flat.orders)) {
        _st.hooks.onTrade({ kind: 'flatten', legs: _flatLegs() });
        return;
    }
    if (!_st.legs.length) return;
    const order = _ordersAllowed() === 'all' ? _st.order : 'market';
    const trigger = _st.trigger;
    if (_st.name.trim() && _strategyable()) {
        _st.hooks.onTrade({
            kind: 'strategy', name: _st.name.trim(), size: _st.size, order, trigger,
            legs: _st.legs.map(l => ({ type: l.type, qty: l.ratio, strike: l.strike ?? null, expiryDay: l.expiryDay ?? null })),
        });
        return;
    }
    _st.hooks.onTrade({
        kind: 'legs', order, trigger,
        legs: _st.legs.map(l => ({
            type: l.type, side: l.ratio > 0 ? 'long' : 'short', qty: Math.abs(l.ratio) * _st.size,
            strike: l.strike, expiryDay: l.expiryDay, key: l.key, desc: _desc(l),
        })),
    });
}

/** The flatten's legs as orders: each reduce-only, bound to its position. */
function _flatLegs() {
    return _st.legs.map(L => ({
        type: L.type, side: L.ratio > 0 ? 'long' : 'short', qty: Math.abs(L.ratio) * _st.size,
        strike: L.strike, expiryDay: L.expiryDay, key: L.key, desc: _desc(L),
        posId: L.posId, strategyName: L.strategyName,
    }));
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

function _desc(L) {
    return contractName(L.type, L.type === 'computefuture' ? L.key : L.strike, L.expiryDay, _st.ctx.sim.day, L.R);
}

/** The leg's mid and its fill for the side it is on, per unit. */
function _quote(L) {
    const s = _st.ctx.sim, S = market.S, vol = market.sigma;
    if (L.type === 'binary') {
        const q = consensus.quotes[L.key] || {};
        const mid = (q.mid ?? 0) * BINARY_NOTIONAL;
        return { mid, fill: (L.ratio > 0 ? (q.ask ?? q.mid ?? 0) : (q.bid ?? q.mid ?? 0)) * BINARY_NOTIONAL };
    }
    if (L.type === 'computefuture') {
        const q = computeMarket.quotes[L.key] || {};
        return { mid: q.mid ?? 0, fill: L.ratio > 0 ? (q.ask ?? q.mid ?? 0) : (q.bid ?? q.mid ?? 0) };
    }
    // VXHCN legs show the published variance (Act III may hold it); the fill uses the true one.
    const vPub = L.type === 'vxhcnfuture' && _st.ctx.vxVariance ? _st.ctx.vxVariance() : market.v;
    const mid = vPub !== market.v
        ? computeVXHCNFuturePrice(vPub, market.kappa, market.theta, market.xi, Math.max(0, L.expiryDay - s.day) / TY) + getVxhcnImpact(market.xi)
        : unitPrice(L.type, S, vol, s.r, s.day, L.strike, L.expiryDay, s.q);
    const ba = L.type === 'call' || L.type === 'put'
        ? computeOptionBidAsk(mid, S, L.strike, vol)
        : computeBidAsk(mid, L.type === 'bond' ? market.sigmaR : L.type === 'vxhcnfuture' ? market.xi : vol);
    return { mid, fill: L.ratio > 0 ? ba.ask : Math.max(0, ba.bid) };
}

const _px = (L, v) => L.type === 'binary' ? Math.round(v) + '¢' : v.toFixed(2);
const _k = (v) => v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Rebuild the ticket. The figure and grid reprice only when an input changed;
 *  `quotes` alone (each substep on the markets page) refreshes the prices. */
export function renderTicket() {
    const el = _st.el;
    if (!el['tk-legs'] || !_st.ctx) return;
    _renderLegs();
    _renderControls();
    _renderCost();
    _renderScenarios();
}

export function refreshTicketQuotes() {
    if (!_st.legs.length || !_st.el['tk-legs']) return;
    _renderLegs();
    _renderCost();
}

function _renderLegs() {
    const el = _st.el, tb = el['tk-legs'];
    const rows = _st.legs.map((L, i) => {
        const name = _desc(L);
        const opt = L.type === 'call' || L.type === 'put';
        const nameHtml = opt
            ? name.replace(` ${L.type},`, ` <button type="button" class="link-btn" data-act="type" data-i="${i}" aria-label="${name}: switch to a ${L.type === 'call' ? 'put' : 'call'}">${L.type}</button>,`)
            : name;
        const q = _quote(L);
        return `<tr><td class="l">${nameHtml}</td>`
            + `<td><button type="button" class="link-btn tk-side${L.ratio < 0 ? ' short' : ''}" data-act="side" data-i="${i}" aria-label="${name}: ${L.ratio > 0 ? 'long' : 'short'}; switch side">${L.ratio > 0 ? 'long' : 'short'}</button></td>`
            + `<td><input class="tk-ratio" type="number" min="1" max="${Math.max(RATIO_MAX, Math.abs(L.ratio))}" step="1" value="${Math.abs(L.ratio)}" data-ratio="${i}" aria-label="${name}: ratio"></td>`
            + `<td>${_px(L, q.mid)}</td>`
            + `<td><button type="button" class="link-btn x" data-act="remove" data-i="${i}" aria-label="Remove ${name}">×</button></td></tr>`;
    });
    // Rebuild only when the legs changed shape; otherwise patch the prices.
    const sig = _st.legs.map(l => l.id + ':' + l.ratio).join('|');
    if (tb.dataset.sig === sig && tb.rows.length === _st.legs.length) {
        _st.legs.forEach((L, i) => { tb.rows[i].cells[3].textContent = _px(L, _quote(L).mid); });
    } else {
        tb.innerHTML = rows.join('');
        tb.dataset.sig = sig;
    }
    el['tk-empty'].hidden = _st.legs.length > 0;
}

function _renderControls() {
    const el = _st.el;
    const allowed = _ordersAllowed();
    if (allowed === 'market') _st.order = 'market';
    for (const b of el['tk-order'].querySelectorAll('[data-order]')) {
        const on = b.dataset.order === _st.order;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
        b.disabled = b.dataset.order !== 'market' && allowed !== 'all';
    }
    const resting = _st.order !== 'market';
    el['tk-trigger-row'].hidden = !resting;
    if (resting) {
        const S = market.S, tr = el['tk-trigger'];
        tr.min = Math.max(1, Math.round(S * 0.5));
        tr.max = Math.round(S * 1.5);
        tr.step = 1;
        if (!(_st.trigger >= +tr.min && _st.trigger <= +tr.max)) _st.trigger = Math.round(S);
        tr.value = _st.trigger;
        _forms.updateSliderFill(tr);
        el['tk-trigger-val'].textContent = Number(_st.trigger).toFixed(0);
        // Resting orders trigger on HCN's price (portfolio.js checkPendingOrders).
        const strat = !!_st.name.trim() && _strategyable();
        const long = strat || _st.legs[0].ratio > 0;
        const below = (_st.order === 'limit') === long;
        el['tk-trigger-lbl'].textContent = below ? 'HCN ≤' : 'HCN ≥';
    }
    const named = !!_st.name.trim();
    const cancelOnly = !!_st.flat && !_st.legs.length && _st.flat.orders > 0;
    el['tk-trade'].disabled = !_st.legs.length && !cancelOnly;
    el['tk-trade'].textContent = cancelOnly ? `Cancel ${_st.flat.orders} order${_st.flat.orders > 1 ? 's' : ''}`   /* PROSE */
        : !_st.legs.length ? 'Trade'
        : _st.order !== 'market' ? `Place ${_st.order} order`
        : named && _strategyable() && !_st.flat ? `Trade ${_st.size}k ${_st.name.trim()}`
        : `Trade ${_st.legs.length} leg${_st.legs.length > 1 ? 's' : ''}`;
    if (document.activeElement !== el['tk-name']) el['tk-name'].value = _st.name;
    el['tk-name'].placeholder = nextAutoName();
    el['tk-save'].disabled = !_strategyable();
    el['tk-delete'].hidden = !_st.stratId;
}

function _renderCost() {
    const el = _st.el;
    if (_st.flat) _renderFlattenCost();
    if (!_st.legs.length) { if (!_st.flat) el['tk-cost'].textContent = ''; el['tk-greeks'].textContent = ''; return; }
    if (!_st.flat) {
        let net = 0;
        for (const L of _st.legs) net += Math.sign(L.ratio) * Math.abs(L.ratio) * _st.size * _quote(L).fill;
        el['tk-cost'].innerHTML = `${Math.abs(net) < 0.005 ? 'Net' : net > 0 ? 'Debit' : 'Credit'} <b>$${Math.abs(net).toFixed(2)}k</b>`;
    }
    const s = _st.ctx.sim;
    const pos = _st.legs.filter(l => STRATEGY_TYPES.has(l.type)).map(l => ({ type: l.type, qty: l.ratio * _st.size, strike: l.strike, expiryDay: l.expiryDay }));
    if (!pos.length) { el['tk-greeks'].textContent = ''; return; }
    const g = aggregateGreeks(market.S, market.sigma, s.r, s.day, s.q, pos);
    el['tk-greeks'].innerHTML = GREEKS.map(([k, sym]) => `<span class="greek-label-${k}" title="${k}">${sym} ${fmtSigned(g[k], Math.abs(g[k]) < 10 ? 2 : 1)}</span>`).join('');
}

/**
 * The flatten's readout (02a "The evening"): its estimated cost (the spread at
 * the current ladder multiple, plus impact) apart from the cash it releases,
 * returned short collateral included, from a non-mutating estimate; and, on a
 * line of its own, the positions left off the ticket.
 */
function _renderFlattenCost() {
    const el = _st.el, s = _st.ctx.sim;
    const parts = [], blocked = [];
    if (_st.legs.length) {
        const mult = _st.ctx.spreadMult ? _st.ctx.spreadMult() : 1;
        const legs = _flatLegs();
        const est = estimateReduceOnly(legs, market.S, market.sigma, s.r, s.day, s.q, mult);
        for (const id of est.blocked) { const L = legs.find(l => l.posId === id); if (L) blocked.push(L.desc); }
        const money = (v) => (v < -0.005 ? '−' : '') + fmtDollar(Math.abs(v));
        parts.push(`Cost <b>${money(est.cost)}</b> · releases <b>${money(est.released)}</b>`);   /* PROSE */
    }
    const esc = (t) => t.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'));
    if (_st.flat.off.length) {
        parts.push(`<span class="tk-off">Not on the ticket: ${esc(_st.flat.off.join(', '))}.</span>`);   /* PROSE */
    }
    if (blocked.length) {
        parts.push(`<span class="tk-off">Not tradeable now: ${esc(blocked.join(', '))}.</span>`);   /* PROSE */
    }
    el['tk-cost'].innerHTML = parts.join('<br>');
}

// ---------------------------------------------------------------------------
// Scenarios: the horizon, by HCN move and how far the race gets
// ---------------------------------------------------------------------------

function _certifiedRung() {
    let c = 1;
    for (const R of [2, 3, 4]) if (certDay(R) != null) c = R;
    return c;
}

function _rows(race) {
    if (!race || !belief.active) {
        return [
            { label: 'Volatility as now', vMul: 1 },
            { label: 'Volatility falls', vMul: 0.55 },
            { label: 'Volatility rises', vMul: 2.1 },
        ];
    }
    const c = _certifiedRung(), out = [];
    for (let R = c; R <= Math.min(5, c + 2); R++) {
        out.push({ rung: R, label: R === c ? 'No new rung' : R === 5 ? 'R5 reached' : `R${R} certified` });
    }
    return out;
}

function _scenario(m, row, base) {
    const H = base.H;
    const dRung = row.rung != null ? row.rung - base.c : 0;
    const b2 = market.b + CAPEX_B * Math.max(0, dRung);
    const eA = Math.exp(-market.a * H / TY);
    const rH = b2 + (market.r - b2) * eA;
    const vBar = market.theta + (market.v - market.theta) * Math.exp(-market.kappa * H / TY);
    const shock = 1 + 1.6 * Math.max(-m, 0) + 0.5 * Math.abs(m);
    const vH = vBar * shock * shock * (row.vMul || 1) * Math.pow(1.15, Math.max(0, dRung));
    return { S: market.S * (1 + m), rH, b2, vH, rung: row.rung, B: row.B || null };
}

function _value(leg, sc, base) {
    const dayH = base.day + base.H;
    const Tleft = leg.expiryDay != null ? (leg.expiryDay - dayH) / TY : 0;
    switch (leg.type) {
        case 'stock': return sc.S;
        case 'bond': return Tleft <= 0 ? BOND_FACE_VALUE : vasicekBondPrice(BOND_FACE_VALUE, sc.rH, Tleft, market.a, sc.b2, market.sigmaR);
        case 'vxhcnfuture': return Tleft <= 0 ? computeVXHCNSpot(sc.vH, market.kappa, market.theta, market.xi)
            : computeVXHCNFuturePrice(sc.vH, market.kappa, market.theta, market.xi, Tleft);
        case 'call': case 'put': {
            if (Tleft <= 0) return Math.max(0, leg.type === 'call' ? sc.S - leg.strike : leg.strike - sc.S);
            const eff = computeEffectiveSigma(sc.vH, Tleft, market.kappa, market.theta, market.xi);
            const sig = computeSkewSigma(eff, sc.S, leg.strike, Tleft, market.rho, market.xi, market.kappa);
            prepareTree(Tleft, sc.rH, sig, market.q, dayH, _st.tree);
            return priceWithTree(sc.S, leg.strike, leg.type === 'put', _st.tree);
        }
        case 'binary': {
            const c = contractByKey(leg.key);
            if (!c || sc.rung == null) return leg.entry;
            const R = c.predicate.rung, hR = base.raceDay + base.H;
            if (R <= sc.rung) return BINARY_NOTIONAL;
            if (c.deadline <= hR) return 0;
            return sc.B ? sc.B(R, c.deadline) * BINARY_NOTIONAL : leg.entry;
        }
        case 'computefuture': {
            if (!base.cview || sc.rung == null) return leg.entry;
            const hR = base.raceDay + base.H;
            const view = { ...base.cview, day: hR, releaseCount: base.cview.releaseCount + base.relPerH, certifiedFrontierRung: Math.min(4, Math.max(base.cview.certifiedFrontierRung, sc.rung)) };
            return placeholderCurve(view, Math.max(0, leg.key - hR)) * base.lift;
        }
        default: return unitPrice(leg.type, sc.S, market.sigma, sc.rH, dayH, leg.strike, leg.expiryDay, market.q);
    }
}

/** Every leg the figure values: the ticket's, entered at today's mid, and the
 *  book's when included, marked from today. */
function _valueLegs() {
    const legs = _st.legs.map(L => ({ type: L.type, strike: L.strike, expiryDay: L.expiryDay, key: L.key, side: Math.sign(L.ratio), qty: Math.abs(L.ratio) * _st.size, entry: _quote(L).mid }));
    if (!_st.mine) return legs;
    const s = _st.ctx.sim;
    for (const p of _st.ctx.positions()) {
        if (p.type === 'privatestake') continue;
        const keyed = p.type === 'binary' || p.type === 'computefuture';
        legs.push({
            type: p.type, strike: keyed ? undefined : p.strike, key: keyed ? p.strike : undefined,
            expiryDay: p.expiryDay, side: Math.sign(p.qty), qty: Math.abs(p.qty),
            entry: unitPrice(p.type, market.S, market.sigma, market.r, s.day, p.strike, p.expiryDay, market.q),
        });
    }
    return legs;
}

function _compute() {
    const ctx = _st.ctx, race = ctx.race(), H = _st.horizon;
    const legs = _valueLegs();
    const base = { day: ctx.sim.day, raceDay: race ? race.day : 0, H, c: race && belief.active ? _certifiedRung() : 1, cview: null, lift: 1, relPerH: 0 };
    if (race && computeMarket.active) {
        base.cview = buildComputePublicView(race, ctx.geo());
        const p0 = placeholderCurve(base.cview, H);
        base.lift = p0 > 0 ? computeCurveFromBelief(base.cview, H) / p0 : 1;
        base.relPerH = race.day > 0 ? base.cview.releaseCount / race.day * H : 1;
    }
    const rows = _rows(race);
    // B at the horizon on each row's copy of the record (display only). The quiet
    // row keeps each lab's routine release cadence: a quiet stretch is not a silent one.
    for (const row of rows) {
        if (row.rung != null && row.rung < 5) row.B = row.rung > base.c ? scenarioBelief(base.raceDay + H, row.rung) : scenarioBelief(base.raceDay + H, null, { routine: true });
    }
    const vals = rows.map(row => MOVES.map(m => {
        if (!legs.length) return 0;
        const sc = _scenario(m, row, base);
        let v = 0;
        for (const L of legs) v += L.side * L.qty * (_value(L, sc, base) - L.entry);
        return v;
    }));
    return { rows, vals, n: legs.length, raced: !!race, dayH: race ? base.raceDay + H : base.day + H, S: market.S };
}

function _renderScenarios() {
    const el = _st.el;
    if (!_st.calc) _st.calc = _compute();
    const { rows, vals, n, raced, dayH } = _st.calc;
    el['tk-fig-sub'].textContent = `· day ${dayH}, $k`;
    const cells = vals.map(r => COLS.map(j => r[j]));
    const maxAbs = Math.max(1, ...cells.flat().map(Math.abs));
    const pal = _themePalette();
    let html = '<thead><tr><th scope="col" class="l"><span class="vh">' + (raced ? 'How far the race gets' : 'Volatility') + '</span></th>'
        + COLS.map(j => { const m = MOVES[j]; return `<th scope="col">${m === 0 ? 'flat' : (m > 0 ? '+' : '−') + Math.round(Math.abs(m * 100)) + '%'}</th>`; }).join('') + '</tr></thead><tbody>';
    rows.forEach((row, ri) => {
        html += `<tr><th scope="row" class="l">${row.label}</th>`;
        for (const v of cells[ri]) {
            const t = n ? Math.min(1, Math.abs(v) / maxAbs) * 0.8 : 0;
            const bg = t > 0.02 ? _mix(pal.canvas, v < 0 ? pal.accent : pal.inks.viridian, t) : 'transparent';
            const fg = t > 0.5 ? pal.canvas : pal.text;
            const s = Math.abs(v) < 0.05 ? '0' : (v < 0 ? '−' : '+') + _k(Math.abs(v));
            html += `<td style="background:${bg};color:${fg}">${n ? s : '·'}</td>`;
        }
        html += '</tr>';
    });
    el['tk-scen'].innerHTML = html + '</tbody>';
    _drawFig();
}

function _mix(h1, h2, t) {
    const a = _parseHex(h1), b = _parseHex(h2);
    return 'rgb(' + a.map((x, i) => Math.round((x + (b[i] - x) * t) * 255)).join(',') + ')';
}


// ---------------------------------------------------------------------------
// The figure: P&L at the horizon against HCN, one line per scenario row
// ---------------------------------------------------------------------------

function _sizeFig() {
    const cv = _st.el['tk-canvas'], f = _st.fig;
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return false;
    if (w !== f.w || h !== f.h || dpr !== f.dpr) {
        f.w = w; f.h = h; f.dpr = dpr;
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        f.c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return true;
}

const _geom = () => ({ l: 2, r: _st.fig.w - 46, t: 12, b: _st.fig.h - 20 });

function _ticks(lo, hi) {
    const st = Math.pow(10, Math.floor(Math.log10((hi - lo) / 2.5)));
    const n = [1, 2, 5, 10].map(m => m * st).find(z => (hi - lo) / z <= 4) || st * 10;
    const a = [];
    for (let v = Math.ceil(lo / n) * n; v <= hi + 1e-9; v += n) a.push(Math.abs(v) < 1e-9 ? 0 : v);
    return a;
}

function _drawFig() {
    if (!_st.calc || !_sizeFig()) return;
    const f = _st.fig, c = f.c, W = f.w, H = f.h, g = _geom();
    const pal = _themePalette(), text = pal.text, muted = pal.textMuted;
    const font = (px, it) => `${it ? 'italic ' : ''}${px}px ${_FONT.text}`;
    const { rows, vals, n, S } = _st.calc;
    c.clearRect(0, 0, W, H);
    let lo = 0, hi = 0;
    if (n) for (const r of vals) for (const v of r) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (hi - lo < 1e-6) { lo = -1; hi = 1; }
    const pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;
    const X = (i) => g.l + (g.r - g.l) * i / (MOVES.length - 1);
    const Y = (v) => g.t + (g.b - g.t) * (1 - (v - lo) / (hi - lo));

    // Rules and labels.
    c.lineWidth = 1;
    c.strokeStyle = _r(text, 0.07); c.beginPath();
    for (const v of _ticks(lo, hi)) { const y = Math.round(Y(v)) + 0.5; c.moveTo(g.l, y); c.lineTo(g.r + 4, y); }
    c.stroke();
    c.font = font(11.5); c.fillStyle = muted; c.textAlign = 'left'; c.textBaseline = 'middle';
    for (const v of _ticks(lo, hi)) c.fillText((v < 0 ? '−' : v > 0 ? '+' : '') + _k(Math.abs(v)), g.r + 7, Y(v));
    c.textBaseline = 'alphabetic';
    for (const [i, t, al] of [[0, '−40%', 'left'], [10, '−20%'], [20, 'HCN ' + S.toFixed(0)], [30, '+20%'], [40, '+40%', 'right']]) {
        c.textAlign = al || 'center'; c.fillText(t, X(i), H - 5);
    }
    const y0 = Math.round(Y(0)) + 0.5;
    c.strokeStyle = _r(text, 0.4); c.beginPath(); c.moveTo(g.l, y0); c.lineTo(g.r, y0); c.stroke();
    const xs = Math.round(X(20)) + 0.5;
    c.strokeStyle = _r(text, 0.28); c.setLineDash([1.5, 3]); c.beginPath(); c.moveTo(xs, g.t); c.lineTo(xs, g.b); c.stroke(); c.setLineDash([]);

    if (!n) return;

    // The first row's gains and losses: viridian above the rule, the accent below.
    const line = (r) => { c.beginPath(); r.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)))); };
    for (const [up, col] of [[true, pal.inks.viridian], [false, pal.accent]]) {
        c.save();
        c.beginPath();
        if (up) c.rect(g.l, g.t - 2, g.r - g.l, y0 - g.t + 2); else c.rect(g.l, y0, g.r - g.l, g.b - y0 + 2);
        c.clip();
        line(vals[0]); c.lineTo(X(MOVES.length - 1), y0); c.lineTo(X(0), y0); c.closePath();
        c.fillStyle = _r(col, 0.13); c.fill();
        c.restore();
    }
    // Every row, solid to dotted by how far the race gets.
    c.lineJoin = 'round';
    for (let ri = rows.length - 1; ri >= 0; ri--) {
        c.strokeStyle = ri ? _r(text, 0.75) : text;
        c.lineWidth = ri ? 1.2 : 1.6;
        c.setLineDash(DASH[ri] || []);
        line(vals[ri]); c.stroke();
    }
    c.setLineDash([]);

    // Breakevens on the first row: where it crosses the rule.
    c.font = font(11.5, true); c.fillStyle = muted; c.textAlign = 'center';
    const r0 = vals[0];
    for (let i = 1; i < r0.length; i++) {
        if ((r0[i - 1] < 0) === (r0[i] < 0) || r0[i - 1] === r0[i]) continue;
        const t = r0[i - 1] / (r0[i - 1] - r0[i]), x = X(i - 1 + t);
        c.strokeStyle = text; c.lineWidth = 1;
        c.beginPath(); c.moveTo(Math.round(x) + 0.5, y0 - 4); c.lineTo(Math.round(x) + 0.5, y0 + 4); c.stroke();
        const m = MOVES[i - 1] + 0.02 * t;
        c.fillText((S * (1 + m)).toFixed(0), x, y0 + (r0[i] > r0[i - 1] ? 15 : -8));
    }

    // Row names at the right ends, kept apart.
    c.font = font(12, true); c.textAlign = 'right'; c.textBaseline = 'middle';
    const ends = rows.map((row, ri) => ({ ri, y: Y(vals[ri][vals[ri].length - 1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
    for (const e of ends) {
        const t = rows[e.ri].label, w = c.measureText(t).width;
        const y = Math.max(g.t + 6, Math.min(g.b - 4, e.y - 9));
        c.fillStyle = pal.canvas; c.fillRect(g.r - w - 6, y - 7, w + 4, 14);
        c.fillStyle = e.ri ? muted : text; c.fillText(t, g.r - 3, y);
    }
    c.textBaseline = 'alphabetic';

    // The crosshair's reading.
    const hi2 = f.hover;
    if (hi2 >= 0) {
        const x = Math.round(X(hi2)) + 0.5;
        c.strokeStyle = _r(text, 0.3); c.setLineDash([2, 3]);
        c.beginPath(); c.moveTo(x, g.t); c.lineTo(x, g.b); c.stroke(); c.setLineDash([]);
        const m = MOVES[hi2];
        const lines = [`HCN ${(S * (1 + m)).toFixed(2)} (${m === 0 ? 'flat' : (m > 0 ? '+' : '−') + Math.round(Math.abs(m * 100)) + '%'})`]
            .concat(rows.map((row, ri) => `${row.label} ${vals[ri][hi2] < 0 ? '−' : '+'}$${_k(Math.abs(vals[ri][hi2]))}k`));
        c.font = font(12, true);
        const bw = Math.max(...lines.map(t => c.measureText(t).width)) + 12, bh = lines.length * 15 + 6;
        const bx = x > (g.l + g.r) / 2 ? g.l + 4 : g.r - bw - 4;
        c.fillStyle = pal.canvas; c.fillRect(bx, g.t, bw, bh);
        c.strokeStyle = _r(text, 0.25); c.strokeRect(bx + 0.5, g.t + 0.5, bw - 1, bh - 1);
        c.textAlign = 'left';
        lines.forEach((t, k) => {
            c.fillStyle = k === 0 ? muted : text;
            c.fillText(t, bx + 6, g.t + 15 + k * 15);
        });
        for (let ri = 0; ri < rows.length; ri++) {
            c.beginPath(); c.arc(X(hi2), Y(vals[ri][hi2]), ri ? 2.2 : 2.8, 0, Math.PI * 2);
            c.fillStyle = text; c.fill();
        }
    }
}

/** Theme flipped: repaint the grid's colors and the figure. */
export function redrawTicket() {
    if (_st.calc) _renderScenarios();
}
