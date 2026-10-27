/* =====================================================
   markets.js -- The markets page: every market is a
   curve, drawn identically as small multiples.

   Six curves over six different axes: HCN through time,
   the Vasicek yield curve over maturity, the VXHCN
   futures over expiry, the option smile over strike, the
   Cambria compute curve over delivery, and Consensus's
   implied crossing curves over the deadline. Each is
   sampled from the real engines into a snapshot once a
   day; on a news day the previous snapshot is kept as
   the ghost (dashed), and the curves ease from it.

   Every tradeable point on a curve is a contract: a
   click (or Enter on a focused curve) hands it to the
   ticket (ticket.js), a right-click hands it over short.
   A panel's title opens it: the curve takes the page,
   with its table beside it, every contract on the curve
   as a row (the options chain at the smile's expiry,
   with the volatility surface under the smile). Rows
   pick like points. Reads public state only: the
   Consensus and compute curves come from belief B and
   the public views, the same inputs as the quoters, and
   the chain is the published one (Act III may hold it).

   The Consensus panel also draws the player's draft
   posterior over B (02a, the posterior) read-only: one
   solid curve per open rung with a bead at its median.
   The draft is edited on the Race page (race-page.js).
   ===================================================== */

import { market } from './market.js';
import { TRADING_DAYS_PER_YEAR, BOND_FACE_VALUE } from './config.js';
import { vasicekBondPrice, computeEffectiveSigma, computeSkewSigma, computeVXHCNFuturePrice } from './pricing.js';
import { unitPrice } from './position-value.js';
import { computeBidAsk } from './portfolio.js';
import { getVxhcnImpact } from './price-impact.js';
import { consensus, BINARY_NOTIONAL } from './race/consensus.js';
import { computeMarket, buildComputePublicView, isComputeTradeable } from './race/compute-market.js';
import { belief, binaryProb, computeCurveFromBelief, crossingProb, draftCurves, openRungs, certDay, impliedTimeline, marketCurves, curvesEqual } from './race/belief.js';
import { HORIZON } from './race/resolution.js';
import { contractName, fmtSpan, consensusOutcomeClass } from './format-helpers.js';
import { drawSurface } from './surface.js';

const TY = TRADING_DAYS_PER_YEAR;
const sqrtT = (T) => Math.sqrt(T);

// ---------------------------------------------------------------------------
// Snapshot: every curve sampled from the engines at one moment
// ---------------------------------------------------------------------------

/**
 * @param {object} ctx  { sim, expiries(), race(), geo(), origin() }
 * @param {number} smileIdx  expiry index for the smile's points
 * @param {boolean} full     every listed strike on the smile (the opened panel)
 */
export function takeSnapshot(ctx, smileIdx, full = false) {
    const sim = ctx.sim, origin = ctx.origin();
    const rel = sim.day - origin;
    const S = market.S, v = market.v;
    const snap = { day: sim.day, rel, origin, S, r: market.r, q: market.q };

    // HCN: the last 120 closes.
    const h = sim.history, path = [];
    for (let d = Math.max(h.minDay, sim.day - 119); d <= h.maxDay; d++) {
        const b = h.get(d);
        if (b) path.push([d - origin, d === h.maxDay ? S : b.close]);
    }
    snap.hcn = path;

    // Rates: the Vasicek zero-coupon yield curve, 1 month to 10 years (sqrt axis).
    const yld = (T) => -Math.log(vasicekBondPrice(1, market.r, T, market.a, market.b, market.sigmaR)) / T * 100;
    snap.rates = [];
    for (let i = 0; i <= 32; i++) {
        const x = sqrtT(1 / 12) + (sqrtT(10) - sqrtT(1 / 12)) * i / 32;
        snap.rates.push([x, yld(x * x)]);
    }

    // VXHCN: spot at 0 and the futures curve to 2 years (expected 30-day vol).
    const vxAt = (T) => computeVXHCNFuturePrice(v, market.kappa, market.theta, market.xi, T);
    snap.vx = [];
    for (let i = 0; i <= 30; i++) { const mo = 24 * i / 30; snap.vx.push([mo, vxAt(mo / 12)]); }
    snap.vxSpot = market.vxhcn;

    // The smile: implied pricing vol by strike, one curve per listed expiry.
    snap.expiries = ctx.expiries().map(e => ({ day: e.day, dte: e.day - sim.day, strikes: e.strikes || [] }));
    snap.smiles = snap.expiries.map(e => {
        const T = Math.max(1, e.dte) / TY;
        const eff = computeEffectiveSigma(v, T, market.kappa, market.theta, market.xi);
        const pts = [];
        for (let i = 0; i <= 36; i++) {
            const K = S * (0.6 + 0.8 * i / 36);
            pts.push([K, computeSkewSigma(eff, S, K, T, market.rho, market.xi, market.kappa) * 100]);
        }
        return pts;
    });

    // Cambria: the belief-lifted compute curve from today to the last listed maturity.
    const race = ctx.race();
    snap.compute = null;
    if (race && computeMarket.active) {
        const view = buildComputePublicView(race, ctx.geo());
        const last = computeMarket.contracts.length ? computeMarket.contracts[computeMarket.contracts.length - 1].settleDay : race.day + 252;
        const span = Math.max(63, last - race.day);
        const curve = [];
        if (!computeMarket.frozen) {
            for (let i = 0; i <= 28; i++) { const dte = span * i / 28; curve.push([race.day + dte, computeCurveFromBelief(view, dte)]); }
        }
        snap.compute = {
            frozen: computeMarket.frozen, raceDay: race.day, curve,
            contracts: computeMarket.contracts.map(c => {
                const qt = computeMarket.quotes[c.key];
                return { key: c.key, settleDay: c.settleDay, mid: qt ? qt.mid : null, tradeable: isComputeTradeable(c.key) };
            }),
        };
    }

    // Consensus: P(rung R certified by day D), from belief B, today to the horizon.
    snap.consensus = null;
    if (race && consensus.active && belief.active) {
        const curves = {}, med = impliedTimeline();
        for (const R of [2, 3, 4, 5]) {
            const cd = certDay(R);
            const pts = [];
            for (let i = 0; i <= 44; i++) { const D = race.day + (HORIZON - race.day) * i / 44; pts.push([D, binaryProb(R, D)]); }
            curves[R] = { pts, crossed: cd != null, certDay: cd, median: med[R] };
        }
        snap.consensus = {
            raceDay: race.day, frozen: consensus.frozen, curves,
            contracts: consensus.contracts.map(c => {
                const qt = consensus.quotes[c.key] || {};
                return {
                    key: c.key, R: c.predicate.rung, deadline: c.deadline, mid: qt.mid,
                    tradeable: !!(qt.mid != null && !qt.settled && !qt.pending && !qt.disputed && !qt.frozen && race.day < c.deadline),
                    settled: !!qt.settled, outcome: qt.outcome,
                };
            }),
        };
    }
    // The smile defaults to the expiry nearest a quarter out; ‹ › choose another.
    let si = smileIdx;
    if (si < 0) {
        si = 0;
        snap.expiries.forEach((e, i) => { if (Math.abs(e.dte - 63) < Math.abs(snap.expiries[si].dte - 63)) si = i; });
    }
    snap.smileIdx = Math.min(si, snap.expiries.length - 1);
    snap.points = _points(snap, ctx, full);
    return snap;
}

/** Tradeable contracts on each curve, priced through the one valuation path. */
function _points(snap, ctx, full) {
    const sim = ctx.sim, P = {};
    const up = (type, strike, expiryDay) => unitPrice(type, snap.S, market.sigma, snap.r, sim.day, strike, expiryDay, snap.q);
    const name = (type, strike, expiryDay, R) => contractName(type, strike, expiryDay, sim.day, R);
    P.hcn = [{ id: 'stock', type: 'stock', x: snap.rel, y: snap.S, desc: name('stock'), price: up('stock') }];
    P.rates = snap.expiries.map(e => {
        const T = Math.max(1, e.dte) / TY, pr = up('bond', undefined, e.day);
        return { id: 'bond@' + e.day, type: 'bond', expiryDay: e.day, x: sqrtT(T), y: -Math.log(pr / BOND_FACE_VALUE) / T * 100, desc: name('bond', null, e.day), price: pr };
    });
    P.vx = snap.expiries.map(e => {
        const pr = up('vxhcnfuture', undefined, e.day);
        return { id: 'vx@' + e.day, type: 'vxhcnfuture', expiryDay: e.day, x: e.dte / 21, y: pr, desc: name('vxhcnfuture', null, e.day), price: pr };
    });
    // A smile point is a strike, out of the money by default; the ticket can make
    // it the other kind, so a call and a put there both answer it (`anyType`).
    const e = snap.expiries[snap.smileIdx];
    P.smile = [];
    if (e) {
        const T = Math.max(1, e.dte) / TY;
        const eff = computeEffectiveSigma(market.v, T, market.kappa, market.theta, market.xi);
        const atm = Math.round(snap.S / 5) * 5;
        const strikes = full && e.strikes.length ? e.strikes
            : [-6, -4, -2, -1, 1, 2, 4, 6].map(k => atm + k * 5).filter(K => K > 0);
        for (const K of strikes) {
            if (K < snap.S * 0.6 || K > snap.S * 1.4) continue;
            const type = K < snap.S ? 'put' : 'call';
            const iv = computeSkewSigma(eff, snap.S, K, T, market.rho, market.xi, market.kappa) * 100;
            P.smile.push({ id: `opt${K}@${e.day}`, anyType: true, type, strike: K, expiryDay: e.day, x: K, y: iv, desc: name(type, K, e.day), price: up(type, K, e.day) });
        }
    }
    P.cmp = [];
    if (snap.compute) {
        for (const c of snap.compute.contracts) {
            if (c.mid == null) continue;
            P.cmp.push({ id: 'cmp@' + c.key, type: 'computefuture', key: c.key, expiryDay: c.key, x: c.settleDay, y: c.mid, desc: name('computefuture', c.key), price: c.mid, disabled: !c.tradeable });
        }
    }
    P.cons = [];
    if (snap.consensus) {
        for (const c of snap.consensus.contracts) {
            if (c.mid == null || c.settled) continue;
            P.cons.push({ id: 'bin@' + c.key, type: 'binary', key: c.key, R: c.R, expiryDay: c.deadline, x: c.deadline, y: c.mid, desc: name('binary', c.key, c.deadline, c.R), price: c.mid * BINARY_NOTIONAL, disabled: !c.tradeable });
        }
    }
    return P;
}

// ---------------------------------------------------------------------------
// The six panels: one drawing routine, six specs (`sub` and `what` are spoken
// only, in each canvas's aria-label; on screen a panel is its title)
// ---------------------------------------------------------------------------

const pct = (v) => v.toFixed(v < 10 ? 2 : 1) + '%';

export const PANELS = [
    { key: 'hcn', title: 'HCN', sub: 'the stock', what: 'One number through time: what Halcyon is worth today.',
      series: (s) => [{ pts: s.hcn }], yfmt: (v) => v.toFixed(0), tween: false,
      xr: (s) => [s.hcn.length ? s.hcn[0][0] : s.rel - 119, s.rel],
      xticks: (s) => [[s.hcn.length ? s.hcn[0][0] : s.rel - 119, '120 sessions ago', 'left'], [s.rel, 'today', 'right']],
      read: (s) => `${s.S.toFixed(2)}` },
    { key: 'rates', title: 'Rates', sub: 'the yield curve', what: 'The short rate’s expected path, plus what lenders charge for waiting.',
      series: (s) => [{ pts: s.rates }], yfmt: pct,
      xr: () => [sqrtT(1 / 12), sqrtT(10)],
      xticks: () => [[sqrtT(1 / 12), '1 mo', 'left'], [1, '1y'], [sqrtT(3), '3y'], [sqrtT(10), '10 years', 'right']],
      read: (s) => `10-year ${pct(s.rates[s.rates.length - 1][1])}` },
    { key: 'vx', title: 'VXHCN', sub: 'futures by expiry', what: 'The 30-day volatility expected at each expiry. Rising is calm; falling is fear.',
      series: (s) => [{ pts: s.vx }], yfmt: (v) => v.toFixed(0),
      xr: () => [0, 24], xticks: () => [[0, 'spot', 'left'], [6, '6 mo'], [12, '1y'], [24, '2 years', 'right']],
      extra: (s) => ({ dot: [0, s.vxSpot] }),
      read: (s) => `spot ${s.vxSpot.toFixed(1)}` },
    { key: 'smile', title: 'Options', sub: 'the smile', what: 'Pricing vol by strike at one expiry: the distribution the market fears.',
      series: (s) => s.smiles.map((p, i) => ({ pts: p, faint: i !== s.smileIdx })), yfmt: (v) => v.toFixed(0) + '%',
      xr: (s) => [s.S * 0.6, s.S * 1.4],
      xticks: (s) => [[s.S * 0.62, (s.S * 0.62).toFixed(0), 'left'], [s.S, 'spot ' + s.S.toFixed(0)], [s.S * 1.38, (s.S * 1.38).toFixed(0), 'right']],
      extra: (s) => ({ vline: s.S }),
      read: (s) => { const e = s.expiries[s.smileIdx]; return e ? `${fmtSpan(e.dte)}, day ${e.day - s.origin}` : ''; } },
    { key: 'cmp', title: 'Cambria compute', sub: 'the forward curve', what: 'The compute index at each delivery. A falling curve is a scramble for chips now.',
      series: (s) => s.compute && s.compute.curve.length ? [{ pts: s.compute.curve }] : [], yfmt: (v) => v.toFixed(0),
      xr: (s) => s.compute && s.compute.curve.length ? [s.compute.curve[0][0], s.compute.curve[s.compute.curve.length - 1][0]] : [0, 1],
      xticks: (s) => s.compute && s.compute.curve.length ? [[s.compute.curve[0][0], 'now', 'left'], ...s.compute.contracts.map((c, i, a) => [c.settleDay, 'day ' + c.settleDay, i === a.length - 1 ? 'right' : 'center']).filter((_, i, a) => i === a.length - 1 || i % 2 === 1)] : [],
      empty: (s) => !s.compute ? 'Dynamic only' : s.compute.frozen ? 'Frozen' : '',
      read: (s) => s.compute && s.compute.curve.length ? `spot ${s.compute.curve[0][1].toFixed(1)}` : '' },
    { key: 'cons', title: 'Consensus', sub: 'crossing curves', what: 'The chance each rung is certified by each day: a timeline priced as odds. Yours, set on the Race page, in ink.',
      series: (s) => s.consensus ? [2, 3, 4, 5].map(R => ({ pts: s.consensus.curves[R].pts, R, crossed: s.consensus.curves[R].crossed })) : [],
      yfmt: (v) => Math.round(v * 100) + '%', fixed: [0, 1],
      xr: (s) => s.consensus ? [s.consensus.raceDay, HORIZON] : [0, HORIZON],
      xticks: (s) => s.consensus ? [[s.consensus.raceDay, 'today', 'left'], [HORIZON, 'day ' + HORIZON, 'right']] : [],
      empty: (s) => !s.consensus ? 'Dynamic only' : '',
      read: (s) => { if (!s.consensus) return ''; const R = [2, 3, 4, 5].find(r => !s.consensus.curves[r].crossed); return R ? `R${R} by day ${HORIZON}: ${Math.round(s.consensus.curves[R].pts[44][1] * 100)}%` : 'R4 certified'; } },
];

// ---------------------------------------------------------------------------
// The page: panels, ghosts, the ease after news, pointer and keyboard
// ---------------------------------------------------------------------------

const _st = {
    ctx: null, onPick: null, legState: () => 0, cur: null, ghost: null, prev: null,
    t0: -1e9, dur: 1100, smileIdx: -1, panels: [], visible: false, raf: 0, reduced: false, cap: null,
    open: null, grid: null, onOpen: null,
};

const _ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Build the six panels into #mk-grid.
 * @param {object} ctx  snapshot context (see takeSnapshot), plus
 *                      chain(day): the published priced expiry for that day (null once
 *                      it has rolled off), vxVariance() and vxSpot(): VXHCN's published
 *                      variance and index, positions()
 * @param {object} hooks { onPick(point, side), legState(point) -> -1|0|1, onOpen(key|null) }
 */
export function initMarkets(ctx, hooks) {
    _st.ctx = ctx;
    _st.onPick = hooks.onPick;
    _st.legState = hooks.legState;
    _st.onOpen = hooks.onOpen || null;
    _st.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    _st.cap = _colophon.caption(document.getElementById('cap-markets'), 300);
    const grid = _st.grid = document.getElementById('mk-grid');
    grid.textContent = '';
    for (const spec of PANELS) {
        const fig = document.createElement('figure');
        fig.className = 'mk-panel';
        fig.dataset.key = spec.key;
        fig.innerHTML = `<figcaption class="mk-h"><button type="button" class="mk-t" aria-expanded="false" title="Open with its table">${spec.title}</button>`
            + '<span class="mk-exp">'
            + (spec.key === 'smile' ? '<button class="hbtn" type="button" data-exp="-1" aria-label="Earlier expiry">‹</button><button class="hbtn" type="button" data-exp="1" aria-label="Later expiry">›</button>' : '')
            + `<button class="hbtn mk-open" type="button" aria-label="Open ${spec.title} with its table">Open</button></span>`
            + '</figcaption>'
            + '<div class="mk-body"><div class="mk-fig"><div class="mk-box"><canvas tabindex="0" role="img"></canvas></div>'
            + (spec.key === 'smile' ? '<div class="mk-surface"><canvas id="surface-canvas" role="img" aria-label="The pricing volatility surface: vol by strike and expiry, rising toward low strikes. Drag to turn it."></canvas></div>' : '')
            + '</div><div class="mk-table" hidden></div></div>';
        grid.appendChild(fig);
        const canvas = fig.querySelector('.mk-box canvas');
        const p = { spec, fig, canvas, ctx2d: canvas.getContext('2d'), w: 0, h: 0, pts: [], hover: null, focus: -1, geom: null, table: fig.querySelector('.mk-table'), tpts: [] };
        p.canvas.setAttribute('aria-label', `${spec.title}, ${spec.sub}. ${spec.what} Arrow keys choose a contract; Enter adds it to the ticket, again to go short, a third time to remove it.`);
        _st.panels.push(p);
        _wirePanel(p);
        _wireTable(p);
        new ResizeObserver(() => { _size(p); _draw(p); }).observe(fig.querySelector('.mk-box'));
    }
    grid.addEventListener('click', (e) => {
        const b = e.target.closest('[data-exp]');
        if (b && _st.cur) {
            const n = _st.cur.expiries.length;
            _st.smileIdx = Math.max(0, Math.min(n - 1, _st.cur.smileIdx + Number(b.dataset.exp)));
            refreshMarkets(true);
            return;
        }
        const t = e.target.closest('.mk-t, .mk-open');
        if (t) {
            const key = t.closest('.mk-panel').dataset.key;
            openPanel(_st.open === key ? null : key);
        }
    });
    grid.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _st.open) { e.stopPropagation(); const key = _st.open; openPanel(null); _st.panels.find(q => q.spec.key === key)?.fig.querySelector('.mk-t').focus(); }
    });
}

/** Open one panel over the curves area with its table (null: back to six). */
export function openPanel(key) {
    _st.open = key;
    _st.grid.classList.toggle('opened', !!key);
    for (const p of _st.panels) {
        const on = p.spec.key === key;
        p.fig.classList.toggle('open', on);
        p.fig.hidden = !!key && !on;
        p.table.hidden = !on;
        const t = p.fig.querySelector('.mk-t'), o = p.fig.querySelector('.mk-open');
        t.setAttribute('aria-expanded', String(on));
        t.title = on ? 'Back to all six' : 'Open with its table';
        o.textContent = on ? 'Close' : 'Open';
        o.setAttribute('aria-label', on ? `Close ${p.spec.title}` : `Open ${p.spec.title} with its table`);
    }
    if (_st.onOpen) _st.onOpen(key);
    refreshMarkets(true);
}

function _size(p) {
    const r = p.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    if (w === p.w && h === p.h && p.dpr === dpr) return;
    p.w = w; p.h = h; p.dpr = dpr;
    p.canvas.width = Math.round(w * dpr);
    p.canvas.height = Math.round(h * dpr);
    p.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Show or hide the page (pages.js); hidden panels do no work. */
export function setMarketsVisible(on) {
    _st.visible = on;
    if (on) refreshMarkets(true);
}

/**
 * Day close (main.js): take today's snapshot. On a news day the previous
 * snapshot becomes the ghost and the curves ease from it.
 * @param {string|null} newsHead  the day's lead head, or null on a quiet day
 */
export function marketsDayClose(newsHead) {
    if (!_st.ctx) return;
    const next = takeSnapshot(_st.ctx, _st.smileIdx, _st.open === 'smile');
    if (newsHead && _st.prev) {
        _st.ghost = _st.prev;
        _st.t0 = _st.reduced ? -1e9 : performance.now();
    }
    _st.prev = next;
    _st.cur = next;
    if (_st.visible) { _drawAll(); _renderTable(); _kick(); if (_st.open === 'smile') drawSurface(); }
}

/** The ghost on show (the snapshot from the close before the latest news), for
 *  the save: display state the live page computed, carried so a resumed run
 *  shows the curves it showed (02a "Save and resume"). */
export function marketsGhost() { return _st.ghost; }

/** A resumed run's curves: today's snapshot, the saved ghost beside it, at rest. */
export function restoreMarkets(ghost) {
    resetMarkets();
    marketsDayClose(null);
    _st.ghost = ghost || null;
    _st.t0 = -1e9;
    if (_st.visible) { _drawAll(); _renderTable(); }
}

/** Clear ghosts and snapshots (reset / regime change). */
export function resetMarkets() {
    _st.cur = _st.prev = _st.ghost = null;
    _st.smileIdx = -1;
}

/** Re-snapshot now (page shown, expiry stepped, theme or ticket changed). */
export function refreshMarkets(resnap) {
    if (!_st.ctx || !_st.visible) return;
    if (resnap || !_st.cur) {
        _st.cur = takeSnapshot(_st.ctx, _st.smileIdx, _st.open === 'smile');
        if (!_st.prev) _st.prev = _st.cur;
    }
    for (const p of _st.panels) _size(p);
    _drawAll();
    _renderTable();
    if (_st.open === 'smile') drawSurface();
}

/** One substep on the markets page: the open table's quotes are live. */
export function marketsSubstep() {
    if (_st.visible && _st.open) _renderTable();
}

/** Points currently on a panel (keyboard path, tests). */
export function marketPoints(key) { return _st.cur ? (_st.cur.points[key] || []) : []; }

/** The Options panel's expiry: where a strategy loads. */
export function smileExpiryDay() {
    const s = _st.cur;
    const e = s && s.expiries[s.smileIdx];
    return e ? e.day : null;
}

function _kick() {
    if (_st.raf) return;
    const tick = () => {
        _st.raf = 0;
        if (!_st.visible) return;
        _drawAll();
        if (performance.now() - _st.t0 < _st.dur) _st.raf = requestAnimationFrame(tick);
    };
    _st.raf = requestAnimationFrame(tick);
}

function _drawAll() {
    for (const p of _st.panels) if (!p.fig.hidden) _draw(p);
    _caption();
}

function _caption() {
    // The name, and the edition the dashed ghosts show; each panel reads its own value.
    if (!_st.cur || !_st.cap) return;
    _st.cap(_st.ghost ? `The curves · dashed, Edition ${_st.ghost.rel + 1}` : 'The curves');
}

// ---------------------------------------------------------------------------
// One drawing routine for all six
// ---------------------------------------------------------------------------

function _series(spec, s) {
    return s ? spec.series(s) : [];
}

function _draw(p) {
    const s = _st.cur, c = p.ctx2d, W = p.w, H = p.h;
    if (!W || !H) return;
    const pal = _themePalette(), text = pal.text, muted = pal.textMuted;
    c.clearRect(0, 0, W, H);
    if (!s) return;
    const spec = p.spec;
    const big = p.fig.classList.contains('open');
    const font = (px, it) => `${it ? 'italic ' : ''}${px}px ${_FONT.text}`;
    const empty = spec.empty ? spec.empty(s) : '';
    let cur = _series(spec, s);
    const g = { l: 2, r: W - 44, t: 16, b: H - 20 };

    // Ease from the ghost after news: interpolate each sample (same index grid).
    const ghost = _st.ghost ? _series(spec, _st.ghost) : null;
    const k = _ease(Math.min(1, Math.max(0, (performance.now() - _st.t0) / _st.dur)));
    if (ghost && k < 1 && spec.tween !== false) {
        cur = cur.map((sr, i) => {
            const gs = ghost[i];
            if (!gs || gs.pts.length !== sr.pts.length) return sr;
            return { ...sr, pts: sr.pts.map((q, j) => [gs.pts[j][0] + (q[0] - gs.pts[j][0]) * k, gs.pts[j][1] + (q[1] - gs.pts[j][1]) * k]) };
        });
    }

    let [x0, x1] = spec.xr(s);
    if (x1 - x0 < 1e-9) x1 = x0 + 1;
    let lo, hi;
    if (spec.fixed) [lo, hi] = spec.fixed;
    else {
        lo = Infinity; hi = -Infinity;
        for (const set of [cur, ghost]) if (set) for (const sr of set) if (!sr.faint) for (const q of sr.pts) if (q[0] >= x0 - 1e-9 && q[0] <= x1 + 1e-9) { lo = Math.min(lo, q[1]); hi = Math.max(hi, q[1]); }
        for (const q of s.points[spec.key] || []) { lo = Math.min(lo, q.y); hi = Math.max(hi, q.y); }
        const dot = spec.extra && spec.extra(s).dot;
        if (dot) { lo = Math.min(lo, dot[1]); hi = Math.max(hi, dot[1]); }
        if (!isFinite(lo)) { lo = 0; hi = 1; }
        const pad = Math.max((hi - lo) * 0.16, Math.abs(hi) * 0.006, 1e-6);
        lo -= pad; hi += pad;
    }
    const X = (x) => g.l + (g.r - g.l) * (x - x0) / (x1 - x0);
    const Y = (y) => g.t + (g.b - g.t) * (1 - (y - lo) / (hi - lo));
    p.geom = { x0, x1, gl: g.l, gr: g.r, lo, hi, gt: g.t, gb: g.b };

    if (empty && !cur.length) {
        c.strokeStyle = _r(text, 0.12); c.lineWidth = 1;
        c.beginPath(); c.moveTo(g.l, Math.round(g.b) + 0.5); c.lineTo(g.r, Math.round(g.b) + 0.5); c.stroke();
        c.font = font(12.5, true); c.fillStyle = muted; c.textAlign = 'center';
        c.fillText(empty, (g.l + g.r) / 2, (g.t + g.b) / 2);
        p.pts = [];
        return;
    }

    // Rules and labels.
    const ticks = spec.fixed ? (big ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1]) : _ticks(lo, hi);
    c.strokeStyle = _r(text, 0.07); c.lineWidth = 1; c.beginPath();
    for (const v of ticks) { const y = Math.round(Y(v)) + 0.5; c.moveTo(g.l, y); c.lineTo(g.r + 4, y); }
    c.stroke();
    c.font = font(11.5); c.fillStyle = muted; c.textAlign = 'left'; c.textBaseline = 'middle';
    // A narrow range can round two rules to one label: then print the step's decimals.
    let labs = ticks.map(v => spec.yfmt(v));
    if (new Set(labs).size < labs.length && ticks.length > 1) {
        const dp = Math.min(3, Math.max(1, Math.ceil(-Math.log10(ticks[1] - ticks[0]))));
        labs = ticks.map(v => v.toFixed(dp));
    }
    ticks.forEach((v, i) => c.fillText(labs[i], g.r + 7, Y(v)));
    c.textBaseline = 'alphabetic';
    for (const [x, t, al] of spec.xticks(s)) { c.textAlign = al || 'center'; c.fillText(t, Math.max(g.l, Math.min(g.r, X(x))), H - 5); }

    const ex = spec.extra ? spec.extra(s) : {};
    if (ex.vline != null) {
        const x = Math.round(X(ex.vline)) + 0.5;
        c.strokeStyle = _r(text, 0.28); c.setLineDash([1.5, 3]);
        c.beginPath(); c.moveTo(x, g.t); c.lineTo(x, g.b); c.stroke(); c.setLineDash([]);
    }

    const cons = spec.key === 'cons', ind = pal.inks.indigo;
    // The player's draft (02a, the posterior), read live from belief.js: edited on
    // the Race page, drawn here over B read-only, on the rungs where it differs.
    const draft = cons && s.consensus && belief.active ? draftCurves() : null;
    const tNow = draft ? s.consensus.raceDay : 0;
    const mkt = draft ? marketCurves() : null;
    const open = draft ? openRungs().filter(R => !curvesEqual(draft, mkt, R)) : [];
    const consDash = { 2: [], 3: [], 4: [5, 3], 5: [1.5, 2.5] }, consW = { 2: 1.1, 3: 1.6, 4: 1.4, 5: 1.4 };
    const line = (pts) => { c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(X(q[0]), Y(q[1])) : c.moveTo(X(q[0]), Y(q[1]))); c.stroke(); };
    c.save();
    c.beginPath(); c.rect(g.l - 1, g.t - 6, g.r - g.l + 2, g.b - g.t + 12); c.clip();

    // The ghost: the curves before the latest news, dashed.
    if (ghost) {
        c.strokeStyle = _r(text, 0.34); c.lineWidth = 1; c.setLineDash([3, 3]);
        for (const sr of ghost) if (!sr.faint && !(cons && sr.crossed)) line(sr.pts);
        c.setLineDash([]);
    }
    c.lineJoin = 'round';
    if (draft) {
        c.strokeStyle = _r(text, 0.6); c.lineWidth = 1.1;
        for (const R of open) {
            const { m, w, q } = draft[R], pts = [];
            for (let i = 0; i <= 120; i++) { const D = x0 + (x1 - x0) * i / 120; pts.push([D, crossingProb(m, w, q, tNow, D)]); }
            line(pts);
        }
    }
    // The curves.
    for (const sr of cur) {
        if (sr.faint) { c.strokeStyle = _r(text, 0.14); c.lineWidth = 1; line(sr.pts); continue; }
        if (cons) {
            c.strokeStyle = sr.crossed ? _r(ind, 0.45) : ind;
            c.lineWidth = consW[sr.R];
            c.setLineDash(sr.crossed ? [1, 3] : consDash[sr.R]);
            line(sr.pts);
            c.setLineDash([]);
        } else { c.strokeStyle = text; c.lineWidth = 1.4; line(sr.pts); }
    }
    c.restore();
    if (ex.dot) {
        c.beginPath(); c.arc(X(ex.dot[0]), Y(ex.dot[1]), 2.6, 0, Math.PI * 2); c.fillStyle = text; c.fill();
    }
    if (cons) {
        // Rung names on the left flank of each curve, at staggered heights
        // (the curves rise left to right, so the flank is clear paper).
        c.font = font(12, true); c.textBaseline = 'middle';
        let i = 0;
        for (const sr of cur) {
            if (sr.crossed) {
                c.textAlign = 'left'; c.fillStyle = muted;
                c.fillText(`R${sr.R} certified`, g.l + 4, Y(1) + 9 + 13 * (sr.R - 2));
                continue;
            }
            const target = 0.18 + 0.2 * i++;
            const q = sr.pts.find(z => z[1] >= target);
            if (!q) { c.textAlign = 'right'; c.fillStyle = ind; c.fillText(`R${sr.R}`, g.r - 2, Y(sr.pts[sr.pts.length - 1][1]) - 8); continue; }
            c.textAlign = 'right'; c.fillStyle = ind;
            c.fillText(`R${sr.R}`, Math.max(g.l + 16, X(q[0]) - 6), Y(q[1]));
        }
        // The draft's medians: a bead on each open rung's ink curve.
        if (draft) {
            c.fillStyle = _r(text, 0.7);
            for (const R of open) {
                const { m, w, q } = draft[R];
                if (m < x0 || m > x1) continue;
                c.beginPath(); c.arc(X(m), Y(crossingProb(m, w, q, tNow, m)), 2.4, 0, Math.PI * 2); c.fill();
            }
        }
        c.textBaseline = 'alphabetic';
    }

    // Tradeable points: hollow; legs on the ticket: a triangle, up long, down short.
    const pts = (s.points[spec.key] || []).map(q => ({ ...q, sx: X(q.x), sy: Y(q.y) }));
    p.pts = pts;
    pts.forEach((q, i) => {
        const side = _st.legState(q), on = (p.hover && p.hover.id === q.id) || p.focus === i;
        if (side) {
            const d = side > 0 ? -1 : 1, r = 5.5;
            c.beginPath(); c.moveTo(q.sx, q.sy + d * r); c.lineTo(q.sx - r, q.sy - d * r * 0.7); c.lineTo(q.sx + r, q.sy - d * r * 0.7); c.closePath();
            c.fillStyle = text; c.fill(); c.strokeStyle = pal.canvas; c.lineWidth = 1.5; c.stroke();
        } else {
            c.beginPath(); c.arc(q.sx, q.sy, on ? 4.8 : 3.3, 0, Math.PI * 2);
            c.fillStyle = pal.canvas; c.fill();
            c.lineWidth = on ? 1.5 : 1.1;
            c.strokeStyle = q.disabled ? _r(text, 0.3) : _r(text, on ? 0.95 : 0.65);
            c.stroke();
        }
        if (p.focus === i && document.activeElement === p.canvas) {
            c.strokeStyle = pal.accent; c.lineWidth = 1;
            c.strokeRect(Math.round(q.sx) - 7.5, Math.round(q.sy) - 7.5, 15, 15);
        }
    });

    // The reading, top left; a label for the hovered or focused contract.
    c.font = font(12, true); c.fillStyle = muted; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillText(spec.read(s), g.l, 11);
    const lab = p.hover || (p.focus >= 0 && document.activeElement === p.canvas ? pts[p.focus] : null);
    if (lab) {
        c.font = font(12, true);
        let t = `${lab.desc} · ${_priceLabel(lab)}${lab.disabled ? ' · not trading' : ''}`;
        if (c.measureText(t).width > W - 10) t = `${lab.desc} · ${_priceLabel(lab)}`;
        if (c.measureText(t).width > W - 10) t = _priceLabel(lab);
        const tw = c.measureText(t).width;
        const tx = Math.max(2, Math.min(W - tw - 6, lab.sx - tw / 2));
        const ty = lab.sy - 14 < 26 ? lab.sy + 22 : lab.sy - 12;
        c.fillStyle = pal.canvas; c.fillRect(tx - 4, ty - 13, tw + 8, 18);
        c.strokeStyle = _r(text, 0.3); c.lineWidth = 1; c.strokeRect(tx - 3.5, ty - 12.5, tw + 7, 17);
        c.fillStyle = text; c.fillText(t, tx, ty);
    }
}

function _priceLabel(q) {
    if (q.type === 'binary') return Math.round(q.y * 100) + '¢ yes';
    if (q.type === 'bond') return q.price.toFixed(2) + ' (' + q.y.toFixed(2) + '%)';
    if (q.type === 'call' || q.type === 'put') return q.price.toFixed(2) + ' (' + q.y.toFixed(0) + '% vol)';
    return q.price.toFixed(2);
}

function _ticks(lo, hi) {
    const st = Math.pow(10, Math.floor(Math.log10((hi - lo) / 2.5)));
    const n = [1, 2, 5, 10].map(m => m * st).find(z => (hi - lo) / z <= 4) || st * 10;
    const a = [];
    for (let v = Math.ceil(lo / n) * n; v <= hi + 1e-9; v += n) a.push(v);
    return a;
}

function _nearest(p, x, y) {
    let best = null, bd = 16;
    for (const q of p.pts) { const d = Math.hypot(q.sx - x, q.sy - y); if (d < bd) { bd = d; best = q; } }
    return best;
}

function _wirePanel(p) {
    const local = (e) => { const b = p.canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    p.canvas.addEventListener('pointermove', (e) => {
        const h = _nearest(p, ...local(e));
        if ((h && h.id) !== (p.hover && p.hover.id)) { p.hover = h; p.canvas.style.cursor = h && !h.disabled ? 'pointer' : ''; _draw(p); }
    });
    p.canvas.addEventListener('pointerleave', () => { p.hover = null; _draw(p); });
    p.canvas.addEventListener('click', (e) => {
        const h = _nearest(p, ...local(e));
        if (h && !h.disabled && _st.onPick) _st.onPick(h, 0);
    });
    p.canvas.addEventListener('contextmenu', (e) => {
        const h = _nearest(p, ...local(e));
        if (!h) return;
        e.preventDefault();
        if (!h.disabled && _st.onPick) _st.onPick(h, -1);
    });
    p.canvas.addEventListener('focus', () => {
        if (p.focus < 0 && p.pts.length) p.focus = 0;
        _draw(p); _announce(p);
    });
    p.canvas.addEventListener('blur', () => _draw(p));
    p.canvas.addEventListener('keydown', (e) => {
        if (!p.pts.length) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') p.focus = (p.focus + 1) % p.pts.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') p.focus = (p.focus - 1 + p.pts.length) % p.pts.length;
        else if (e.key === 'Home') p.focus = 0;
        else if (e.key === 'End') p.focus = p.pts.length - 1;
        else if (e.key === 'Enter' || e.key === ' ') {
            const q = p.pts[Math.max(0, p.focus)];
            if (q && !q.disabled && _st.onPick) _st.onPick(q, 0);
        } else return;
        e.preventDefault();
        e.stopPropagation();
        _draw(p);
        _announce(p);
    });
}

function _announce(p) {
    const q = p.pts[p.focus];
    const live = document.getElementById('tk-live');
    if (!q || !live) return;
    const side = _st.legState(q);
    live.textContent = `${q.desc}, ${_priceLabel(q)}. ${q.disabled ? 'Not trading.' : side > 0 ? 'Long on the ticket; Enter to go short.' : side < 0 ? 'Short on the ticket; Enter to remove.' : 'Enter to add long.'}`;
}

/** Redraw every panel (ticket legs changed, theme flipped). */
export function redrawMarkets() {
    if (_st.visible) { _drawAll(); _renderTable(); if (_st.open === 'smile') drawSurface(); }
}

// ---------------------------------------------------------------------------
// The opened panel's table: every contract on the curve, a row each
// ---------------------------------------------------------------------------

function _wireTable(p) {
    const pick = (e, side) => {
        const cell = e.target.closest('[data-pt]');
        if (!cell || !p.table.contains(cell)) return false;
        const pt = p.tpts[Number(cell.dataset.pt)];
        if (!pt || pt.disabled) return false;
        if (_st.onPick) _st.onPick(pt, side ?? Number(cell.dataset.side || 0));
        return true;
    };
    p.table.addEventListener('click', (e) => pick(e));
    p.table.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-pt]')) { e.preventDefault(); pick(e, -1); } });
    p.table.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && pick(e)) e.preventDefault();
    });
}

/** Held quantity on a contract, signed (the book's own netting key). */
function _held(type, strike, expiryDay) {
    const pos = _st.ctx.positions ? _st.ctx.positions() : [];
    let q = 0;
    for (const x of pos) {
        if (x.type !== type) continue;
        if (type === 'binary' || type === 'computefuture') { if (x.strike === strike) q += x.qty; continue; }
        if ((type === 'call' || type === 'put') && x.strike !== strike) continue;
        if (type !== 'stock' && x.expiryDay !== expiryDay) continue;
        q += x.qty;
    }
    return q;
}

const _heldTxt = (q) => q ? (q > 0 ? '+' : '−') + Math.abs(q).toLocaleString() + 'k' : '';

/** A pickable cell: its point index, the ticket's mark, the book's. */
/** A pickable cell: its point index, the ticket's mark. A bid cell (`cellSide`
 *  -1) sells and an ask cell (+1) buys, each a toggle; a price cell (0) cycles. */
function _cell(p, pt, text, cls = '', cellSide = 0) {
    const i = p.tpts.push(pt) - 1;
    const side = _st.legState(pt);
    const mark = side && (!cellSide || side === cellSide) ? (side > 0 ? ' tk-long' : ' tk-short') : '';
    const dis = pt.disabled ? ' aria-disabled="true"' : '';
    const verb = cellSide > 0 ? 'buy' : cellSide < 0 ? 'sell' : '';
    return `<td class="pick${mark}${cls ? ' ' + cls : ''}" data-pt="${i}" data-side="${cellSide}" tabindex="0" role="button"${dis} aria-label="${verb ? verb + ' ' : ''}${pt.desc}, ${text}${side ? side > 0 ? ', long on the ticket' : ', short on the ticket' : ''}">${text}</td>`;
}

function _renderTable() {
    if (!_st.visible || !_st.open || !_st.cur) return;
    const p = _st.panels.find(q => q.spec.key === _st.open);
    if (!p) return;
    const s = _st.cur, sim = _st.ctx.sim, day = sim.day;
    const name = (type, strike, expiryDay, R) => contractName(type, strike, expiryDay, day, R);
    const S = market.S;
    p.tpts = [];
    let html = '';
    const head = (cols) => '<thead><tr>' + cols.map(([t, l]) => `<th${l ? ' class="l"' : ''}>${t}</th>`).join('') + '</tr></thead>';
    const ba = (mid, vol) => { const q = computeBidAsk(mid, vol); return [Math.max(0, q.bid), q.ask]; };
    switch (p.spec.key) {
        case 'hcn': {
            const mid = unitPrice('stock', S, market.sigma, sim.r, day);
            const [b, a] = ba(mid, market.sigma);
            const pt = { id: 'stock', type: 'stock', desc: name('stock'), price: mid };
            html = head([['Contract', 1], ['Bid'], ['Ask'], ['Held']]) + '<tbody><tr>'
                + `<td class="l">${pt.desc}</td>${_cell(p, pt, b.toFixed(2), '', -1)}${_cell(p, pt, a.toFixed(2), '', 1)}<td>${_heldTxt(_held('stock'))}</td></tr></tbody>`;
            break;
        }
        case 'rates': {
            html = head([['Maturity', 1], ['Yield'], ['Bid'], ['Ask'], ['Held']]) + '<tbody>';
            for (const e of s.expiries) {
                const mid = unitPrice('bond', S, market.sigma, sim.r, day, undefined, e.day);
                const T = Math.max(1, e.dte) / TY, y = -Math.log(mid / BOND_FACE_VALUE) / T * 100;
                const [b, a] = ba(mid, market.sigmaR);
                const pt = { id: 'bond@' + e.day, type: 'bond', expiryDay: e.day, desc: name('bond', null, e.day), price: mid };
                html += `<tr><td class="l">${fmtSpan(e.dte)}</td><td>${y.toFixed(2)}%</td>${_cell(p, pt, b.toFixed(2), '', -1)}${_cell(p, pt, a.toFixed(2), '', 1)}<td>${_heldTxt(_held('bond', null, e.day))}</td></tr>`;
            }
            html += '</tbody>';
            break;
        }
        case 'vx': {
            // The published index and variance (Act III may hold them); fills use the true ones.
            const vPub = _st.ctx.vxVariance ? _st.ctx.vxVariance() : market.v;
            const spot = _st.ctx.vxSpot ? _st.ctx.vxSpot() : s.vxSpot;
            html = head([['Expiry', 1], ['Bid'], ['Ask'], ['Held']]) + `<tbody><tr class="muted"><td class="l">Spot index</td><td colspan="2">${spot.toFixed(2)}</td><td></td></tr>`;
            for (const e of s.expiries) {
                const mid = vPub === market.v ? unitPrice('vxhcnfuture', S, market.sigma, sim.r, day, undefined, e.day)
                    : computeVXHCNFuturePrice(vPub, market.kappa, market.theta, market.xi, Math.max(0, e.day - day) / TY) + getVxhcnImpact(market.xi);
                const [b, a] = ba(mid, market.xi);
                const pt = { id: 'vx@' + e.day, type: 'vxhcnfuture', expiryDay: e.day, desc: name('vxhcnfuture', null, e.day), price: mid };
                html += `<tr><td class="l">${fmtSpan(e.dte)}</td>${_cell(p, pt, b.toFixed(2), '', -1)}${_cell(p, pt, a.toFixed(2), '', 1)}<td>${_heldTxt(_held('vxhcnfuture', null, e.day))}</td></tr>`;
            }
            html += '</tbody>';
            break;
        }
        case 'smile': {
            const e = s.expiries[s.smileIdx];
            // By day, not index: the skeleton can roll an expiry off under a snapshot.
            const priced = e && _st.ctx.chain ? _st.ctx.chain(e.day) : null;
            if (e && !priced && !_st.resnapped) { _st.resnapped = true; refreshMarkets(true); _st.resnapped = false; return; }
            if (!priced || !priced.options || !priced.options.length) { html = '<tbody><tr><td class="l">—</td></tr></tbody>'; break; }
            html = head([['Held'], ['Call'], ['Strike'], ['Put'], ['Held']]) + '<tbody>';
            const atm = priced.options.reduce((b, o) => Math.abs(o.strike - S) < Math.abs(b.strike - S) ? o : b, priced.options[0]).strike;
            // The published chain may be a held snapshot of bids and asks alone
            // (act3.js), so the cell shows their mid, as the chain always has.
            const mid = (x) => (Math.max(0, x.bid) + x.ask) / 2;
            for (const o of priced.options) {
                const cp = { id: `call${o.strike}@${priced.day}`, type: 'call', strike: o.strike, expiryDay: priced.day, desc: name('call', o.strike, priced.day), price: mid(o.call) };
                const pp = { id: `put${o.strike}@${priced.day}`, type: 'put', strike: o.strike, expiryDay: priced.day, desc: name('put', o.strike, priced.day), price: mid(o.put) };
                const tip = (x) => `Bid ${Math.max(0, x.bid).toFixed(2)} · ask ${x.ask.toFixed(2)}`;
                html += `<tr${o.strike === atm ? ' class="atm-row"' : ''}><td class="held">${_heldTxt(_held('call', o.strike, priced.day))}</td>`
                    + _cell(p, cp, mid(o.call).toFixed(2), 'call-cell').replace('<td ', `<td data-tooltip="${tip(o.call)}" `)
                    + `<td class="strike-cell">${o.strike}</td>`
                    + _cell(p, pp, mid(o.put).toFixed(2), 'put-cell').replace('<td ', `<td data-tooltip="${tip(o.put)}" `)
                    + `<td class="held">${_heldTxt(_held('put', o.strike, priced.day))}</td></tr>`;
            }
            html += '</tbody>';
            break;
        }
        case 'cmp': {
            if (!s.compute) { html = '<tbody><tr><td class="l">Dynamic only</td></tr></tbody>'; break; }
            html = head([['Delivery', 1], ['Bid'], ['Ask'], ['Held'], ['Days']]) + '<tbody>';
            for (const c of computeMarket.contracts) {
                const q = computeMarket.quotes[c.key] || {}, settled = computeMarket.settled[c.key];
                const pt = { id: 'cmp@' + c.key, type: 'computefuture', key: c.key, expiryDay: c.key, desc: name('computefuture', c.key), price: q.mid, disabled: !isComputeTradeable(c.key) };
                const dead = settled ? 'settled' : q.frozen || computeMarket.frozen ? 'frozen' : null;
                html += `<tr${dead ? ' class="muted"' : ''}><td class="l">Day ${c.settleDay}</td>`
                    + (dead || q.mid == null ? `<td colspan="2">${dead || '—'}</td>` : _cell(p, pt, q.bid.toFixed(1), '', -1) + _cell(p, pt, q.ask.toFixed(1), '', 1))
                    + `<td>${_heldTxt(_held('computefuture', c.key))}</td><td>${Math.max(0, c.settleDay - s.compute.raceDay)}</td></tr>`;
            }
            html += '</tbody>';
            break;
        }
        case 'cons': {
            if (!s.consensus) { html = '<tbody><tr><td class="l">Dynamic only</td></tr></tbody>'; break; }
            html = head([['Milestone', 1], ['Bid'], ['Ask'], ['Held'], ['Days']]) + '<tbody>';
            for (const c of consensus.contracts) {
                const q = consensus.quotes[c.key] || {}, st = consensus.settled[c.key];
                const pending = consensus.pendingCloseout && consensus.pendingCloseout[c.key];
                const R = c.predicate.rung;
                const tradeable = !!(q.mid != null && !st && !q.settled && !pending && !q.pending && !q.disputed && !q.frozen && s.consensus.raceDay < c.deadline);
                const pt = { id: 'bin@' + c.key, type: 'binary', key: c.key, R, expiryDay: c.deadline, desc: name('binary', c.key, c.deadline, R), price: (q.mid ?? 0) * BINARY_NOTIONAL, disabled: !tradeable };
                const out = st ? (st.outcome === 'YES' ? 'settled yes' : st.outcome === 'NO' ? 'settled no' : 'settled ' + Math.round(c.fallbackValue * 100) + '¢')
                    : pending ? 'closeout' : q.frozen ? 'frozen' : q.disputed ? 'disputed' : null;
                const oc = st ? consensusOutcomeClass(st.outcome) : '';
                html += `<tr${out ? ' class="muted"' : ''}><td class="l">${pt.desc}</td>`
                    + (out || q.bid == null ? `<td colspan="2"${oc ? ` class="${oc}"` : ''}>${out || '—'}</td>` : _cell(p, pt, Math.round(q.bid * 100) + '¢', '', -1) + _cell(p, pt, Math.round(q.ask * 100) + '¢', '', 1))
                    + `<td>${_heldTxt(_held('binary', c.key))}</td><td>${st ? '' : Math.max(0, c.deadline - s.consensus.raceDay)}</td></tr>`;
            }
            html += '</tbody>';
            break;
        }
    }
    // The table refreshes each substep: when its shape holds, patch the cells in
    // place, so focus, hover and a showing bid/ask tooltip stay on their nodes.
    const tpl = document.createElement('template');
    tpl.innerHTML = `<table class="agate mk-agate">${html}</table>`;
    const neu = tpl.content.firstElementChild, old = p.table.firstElementChild;
    const same = old && old.rows.length === neu.rows.length
        && [...old.rows].every((r, i) => r.cells.length === neu.rows[i].cells.length);
    if (!same) { p.table.textContent = ''; p.table.appendChild(neu); return; }
    [...neu.rows].forEach((r, i) => {
        const o = old.rows[i];
        if (o.className !== r.className) o.className = r.className;
        [...r.cells].forEach((c, j) => _patchCell(o.cells[j], c));
    });
}

function _patchCell(o, n) {
    if (o.innerHTML !== n.innerHTML) o.innerHTML = n.innerHTML;
    for (const a of [...o.attributes]) if (!n.hasAttribute(a.name)) o.removeAttribute(a.name);
    for (const a of [...n.attributes]) if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
}
