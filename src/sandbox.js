/* =====================================================
   sandbox.js -- The markets page's sandbox: a book made
   of curve points, priced across what could happen.

   A click on a curve point adds that contract long, a
   second click flips it short, a third removes it. The
   scenario grid revalues every leg a quarter out over
   HCN moves (columns) against how far the race gets
   (rows; in Classic, where there is no race, against
   volatility), and one sentence says what the book bets
   on. "Add my book" folds the live positions in, marked
   from today. "Trade these legs" sends the legs through
   the desk's own order paths (main.js).

   The scenario model is the display's, not the engine's:
   the HCN move is given; variance follows Heston's mean
   reversion with a leverage shock; each newly certified
   rung lifts the long-run rate by the capex channel's
   0.005 (02a); Consensus reprices off belief B evaluated
   on a copy of the public record a quarter out, with the
   row's certification added, or on the quiet row each
   lab's routine releases at its trailing cadence
   (scenarioBelief, display only); compute reprices off the public curve with the
   new certified rung. Hidden state is never read.
   ===================================================== */

import { market } from './market.js';
import { TRADING_DAYS_PER_YEAR, BOND_FACE_VALUE } from './config.js';
import { allocTree, prepareTree, priceWithTree, vasicekBondPrice, computeEffectiveSigma, computeSkewSigma, computeVXHCNFuturePrice, computeVXHCNSpot } from './pricing.js';
import { unitPrice } from './position-value.js';
import { contractByKey, BINARY_NOTIONAL } from './race/consensus.js';
import { computeMarket, buildComputePublicView, placeholderCurve } from './race/compute-market.js';
import { belief, computeCurveFromBelief, certDay, scenarioBelief } from './race/belief.js';

const TY = TRADING_DAYS_PER_YEAR;
const H = 63;                                    // the horizon: one quarter
const COLS = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3];
const CAPEX_B = 0.005;                           // 02a "Rates: the capex channel", per rung rise

const _st = { legs: [], ctx: null, hooks: null, el: {}, mine: false, qty: 1, tree: null, touched: false };

/** Side of the leg on a contract id: 1 long, -1 short, 0 none. */
export function legState(id) {
    const L = _st.legs.find(l => l.id === id);
    return L ? L.side : 0;
}

/**
 * @param {object} ctx    { sim, race(), geo(), origin(), positions() }
 * @param {object} hooks  { onChange(), onTrade(legs) }
 */
export function initSandbox(ctx, hooks) {
    _st.ctx = ctx;
    _st.hooks = hooks;
    for (const id of ['sb-book', 'sb-empty', 'sb-sub', 'sb-scen', 'sb-read', 'sb-qty', 'sb-qty-val', 'sb-mine', 'sb-clear', 'sb-trade', 'sb-grid-h', 'sb-live']) _st.el[id] = document.getElementById(id);
    _st.tree = allocTree();
    _st.qty = Number(_st.el['sb-qty'].value) || 1;
    _forms.bindSlider(_st.el['sb-qty'], _st.el['sb-qty-val'], (v) => { _st.qty = v; for (const l of _st.legs) l.qty = v; renderSandbox(); });
    _st.el['sb-mine'].addEventListener('change', () => { _st.mine = _st.el['sb-mine'].checked; renderSandbox(); });
    _st.el['sb-clear'].addEventListener('click', () => { _st.legs = []; _st.touched = true; renderSandbox(); hooks.onChange(); });
    _st.el['sb-trade'].addEventListener('click', () => { if (_st.legs.length) hooks.onTrade(_st.legs.map(l => ({ ...l }))); });
    _st.el['sb-book'].addEventListener('click', (e) => {
        const b = e.target.closest('[data-leg]');
        if (!b) return;
        const i = _st.legs.findIndex(l => l.id === b.dataset.leg);
        if (i < 0) return;
        if (b.dataset.act === 'flip') _st.legs[i].side *= -1; else _st.legs.splice(i, 1);
        renderSandbox();
        hooks.onChange();
    });
}

/** A curve point was picked: add long, flip short, then remove. */
export function pickPoint(pt) {
    _st.touched = true;
    const i = _st.legs.findIndex(l => l.id === pt.id);
    let msg;
    if (i < 0) { _st.legs.push(_leg(pt, 1)); msg = `Added ${pt.desc}, long.`; }
    else if (_st.legs[i].side > 0) { _st.legs[i].side = -1; msg = `${pt.desc}, now short.`; }
    else { _st.legs.splice(i, 1); msg = `Removed ${pt.desc}.`; }
    if (_st.el['sb-live']) _st.el['sb-live'].textContent = msg;
    renderSandbox();
    _st.hooks.onChange();
}

function _leg(pt, side) {
    return { id: pt.id, type: pt.type, strike: pt.strike, expiryDay: pt.expiryDay, key: pt.key, R: pt.R, desc: pt.desc, side, qty: _st.qty, entry: pt.price };
}

/** Clear the legs (reset / regime change). */
export function resetSandbox() {
    _st.legs = [];
    _st.touched = false;
    if (_st.el['sb-mine']) { _st.el['sb-mine'].checked = false; _st.mine = false; }
}

// ---------------------------------------------------------------------------
// Scenarios: a quarter out, by HCN move and how far the race gets
// ---------------------------------------------------------------------------

function _certifiedRung() {
    let c = 1;
    for (const R of [2, 3, 4]) if (certDay(R) != null) c = R;
    return c;
}

function _rows(race) {
    if (!race || !belief.active) {
        return [
            { label: 'Volatility falls', vMul: 0.55 },
            { label: 'Volatility as now', vMul: 1 },
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
    const dRung = row.rung != null ? row.rung - base.c : 0;
    const b2 = market.b + CAPEX_B * Math.max(0, dRung);
    const eA = Math.exp(-market.a * H / TY);
    const rH = b2 + (market.r - b2) * eA;
    const vBar = market.theta + (market.v - market.theta) * Math.exp(-market.kappa * H / TY);
    const shock = 1 + 1.6 * Math.max(-m, 0) + 0.5 * Math.abs(m);
    const vH = vBar * shock * shock * (row.vMul || 1) * Math.pow(1.15, Math.max(0, dRung));
    return { S: market.S * (1 + m), rH, b2, vH, rung: row.rung, dRung, B: row.B || null };
}

function _value(leg, sc, base) {
    const dayH = base.day + H;
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
            const R = c.predicate.rung, hR = base.raceDay + H;
            if (R <= sc.rung) return BINARY_NOTIONAL;
            if (c.deadline <= hR) return 0;
            return sc.B ? sc.B(R, c.deadline) * BINARY_NOTIONAL : leg.entry;
        }
        case 'computefuture': {
            if (!base.cview || sc.rung == null) return leg.entry;
            const hR = base.raceDay + H;
            const view = { ...base.cview, day: hR, releaseCount: base.cview.releaseCount + base.relPerQ, certifiedFrontierRung: Math.min(4, Math.max(base.cview.certifiedFrontierRung, sc.rung)) };
            return placeholderCurve(view, Math.max(0, leg.key - hR)) * base.lift;
        }
        default: return unitPrice(leg.type, sc.S, market.sigma, sc.rH, dayH, leg.strike, leg.expiryDay, market.q);
    }
}

function _mineLegs() {
    if (!_st.mine) return [];
    const S = market.S, day = _st.ctx.sim.day;
    return _st.ctx.positions().map(p => ({
        id: 'mine' + p.id, type: p.type, strike: p.type === 'binary' || p.type === 'computefuture' ? undefined : p.strike,
        key: p.type === 'binary' || p.type === 'computefuture' ? p.strike : undefined,
        expiryDay: p.expiryDay, side: Math.sign(p.qty), qty: Math.abs(p.qty), mine: true,
        entry: unitPrice(p.type, S, market.sigma, market.r, day, p.strike, p.expiryDay, market.q),
    }));
}

/** Rebuild the book table, the grid and the sentence. */
export function renderSandbox() {
    const el = _st.el;
    if (!el['sb-book']) return;
    const ctx = _st.ctx, race = ctx.race();
    // The book.
    el['sb-book'].textContent = '';
    for (const L of _st.legs) {
        const tr = document.createElement('tr');
        const td = (t, cls) => { const d = document.createElement('td'); d.textContent = t; if (cls) d.className = cls; tr.appendChild(d); return d; };
        td(L.desc, 'l');
        const sideTd = td('');
        const flip = document.createElement('button');
        flip.type = 'button'; flip.className = 'link-btn'; flip.dataset.leg = L.id; flip.dataset.act = 'flip';
        flip.textContent = L.side > 0 ? 'long' : 'short';
        flip.setAttribute('aria-label', `${L.desc}: ${L.side > 0 ? 'long' : 'short'}; switch side`);
        sideTd.appendChild(flip);
        td(String(L.qty) + 'k');
        td(L.type === 'binary' ? Math.round(L.entry) + '¢' : L.entry.toFixed(2));
        const x = td('');
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'link-btn x'; rm.dataset.leg = L.id; rm.dataset.act = 'remove';
        rm.textContent = '×'; rm.setAttribute('aria-label', 'Remove ' + L.desc);
        x.appendChild(rm);
        el['sb-book'].appendChild(tr);
    }
    el['sb-empty'].hidden = _st.legs.length > 0;
    el['sb-trade'].disabled = _st.legs.length === 0;
    el['sb-sub'].textContent = _st.legs.length ? `· ${_st.legs.length} leg${_st.legs.length > 1 ? 's' : ''}` : '· click a point on any curve';

    // The grid.
    const legs = _st.legs.concat(_mineLegs());
    const base = { day: ctx.sim.day, raceDay: race ? race.day : 0, c: race && belief.active ? _certifiedRung() : 1, cview: null, lift: 1, relPerQ: 0 };
    if (race && computeMarket.active) {
        base.cview = buildComputePublicView(race, ctx.geo());
        const p0 = placeholderCurve(base.cview, 63);
        base.lift = p0 > 0 ? computeCurveFromBelief(base.cview, 63) / p0 : 1;
        base.relPerQ = race.day > 0 ? base.cview.releaseCount / race.day * H : 1;
    }
    const rows = _rows(race);
    // B a quarter out on each row's copy of the record (display only).
    for (const row of rows) {
        // The quiet row keeps each lab's routine release cadence (a quiet quarter is not a silent one).
        if (row.rung != null && row.rung < 5) row.B = row.rung > base.c ? scenarioBelief(base.raceDay + H, row.rung) : scenarioBelief(base.raceDay + H, null, { routine: true });
    }
    const cells = rows.map(row => COLS.map(m => {
        const sc = _scenario(m, row, base);
        let v = 0;
        for (const L of legs) v += L.side * L.qty * (_value(L, sc, base) - L.entry);
        return v;
    }));
    const dayLabel = race ? `day ${base.raceDay + H}` : 'a quarter out';
    el['sb-grid-h'].innerHTML = `Profit and loss at ${dayLabel} <span class="sub">· $ thousands, by HCN move</span>`;
    const flat = cells.flat(), maxAbs = Math.max(1, ...flat.map(Math.abs));
    const pal = _themePalette();
    let html = '<thead><tr><th scope="col" class="l"><span class="vh">' + (race ? 'How far the race gets' : 'Volatility') + '</span></th>'
        + COLS.map(m => `<th scope="col">${m === 0 ? 'flat' : (m > 0 ? '+' : '−') + Math.abs(m * 100) + '%'}</th>`).join('') + '</tr></thead><tbody>';
    rows.forEach((row, ri) => {
        html += `<tr><th scope="row" class="l">${row.label}</th>`;
        for (const v of cells[ri]) {
            const t = legs.length ? Math.min(1, Math.abs(v) / maxAbs) * 0.8 : 0;
            const bg = t > 0.02 ? _mix(pal.canvas, v < 0 ? pal.accent : pal.inks.viridian, t) : 'transparent';
            const fg = t > 0.5 ? pal.canvas : pal.text;
            const s = Math.abs(v) < 0.05 ? '0' : (v < 0 ? '−' : '+') + _k(Math.abs(v));
            html += `<td style="background:${bg};color:${fg}">${legs.length ? s : '·'}</td>`;
        }
        html += '</tr>';
    });
    el['sb-scen'].innerHTML = html + '</tbody>';
    el['sb-read'].textContent = _reading(cells, rows, maxAbs, legs.length, !!race);
}

const _k = (v) => v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);

function _mix(h1, h2, t) {
    const a = _parseHex(h1), b = _parseHex(h2);
    return 'rgb(' + a.map((x, i) => Math.round((x + (b[i] - x) * t) * 255)).join(',') + ')';
}

function _reading(cells, rows, maxAbs, n, raced) {
    if (!n) return 'Click a point on any curve to add a leg; click it again to go short, a third time to remove it.';
    const mean = (a) => a.reduce((p, q) => p + q, 0) / a.length;
    const col = (j) => mean(cells.map(r => r[j]));
    const thr = 0.15 * maxAbs;
    const race = mean(cells[cells.length - 1]) - mean(cells[0]);
    const hcn = col(6) - col(0), lowEdge = col(0) - col(3), highEdge = col(6) - col(3);
    const parts = [];
    if (Math.abs(race) > thr) parts.push(raced ? (race > 0 ? 'the race runs ahead of the market' : 'the race stalls') : (race > 0 ? 'volatility rises' : 'volatility falls'));
    if (Math.abs(hcn) > thr) parts.push(hcn > 0 ? 'HCN rises' : 'HCN falls');
    let first = parts.length ? `This book makes money if ${parts.join(' and ')}.` : 'This book is close to flat in direction.';
    if (lowEdge > thr && highEdge > thr) first += ' It also gains from a big move either way.';
    else if (lowEdge < -thr && highEdge < -thr) first += ' It wants a quiet quarter.';
    let worst = Infinity, wi = 0, wj = 0;
    cells.forEach((r, i) => r.forEach((v, j) => { if (v < worst) { worst = v; wi = i; wj = j; } }));
    const cl = COLS[wj] === 0 ? 'flat' : `${COLS[wj] > 0 ? 'up' : 'down'} ${Math.abs(COLS[wj] * 100)}%`;
    return worst < -0.05
        ? `${first} The worst case here is ${rows[wi].label.toLowerCase()} with HCN ${cl}: a loss of $${_k(-worst)}k.`
        : `${first} No scenario here loses money.`;
}
