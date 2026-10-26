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
   sandbox (sandbox.js). Reads public state only: the
   Consensus and compute curves come from belief B and
   the public views, the same inputs as the quoters.

   The Consensus panel also draws the player's draft
   posterior over B (02a, the posterior), one solid curve
   per open rung with a bead at its median. "Your curves"
   puts the panel in edit mode: the beads become handles
   (drag across for the median, up and down for the
   width; arrows on a focused panel), a second handle at
   the term's end sets the plateau (drag up and down;
   PageUp/PageDown), and sandbox picks are off until edit
   mode ends. A lock the player chose to adjust first
   holds edit mode on and shows the panel's Lock. The
   draft itself lives in belief.js.
   ===================================================== */

import { market } from './market.js';
import { TRADING_DAYS_PER_YEAR, BOND_FACE_VALUE } from './config.js';
import { vasicekBondPrice, computeEffectiveSigma, computeSkewSigma, computeVXHCNFuturePrice } from './pricing.js';
import { unitPrice } from './position-value.js';
import { consensus, BINARY_NOTIONAL } from './race/consensus.js';
import { computeMarket, buildComputePublicView, isComputeTradeable } from './race/compute-market.js';
import {
    belief, binaryProb, computeCurveFromBelief, crossingProb, plateauHeight,
    draftCurves, openRungs, setDraftMedian, setDraftWidth, setDraftPlateau,
    certDay, impliedTimeline, curveMedian, marketCurves, curvesEqual,
} from './race/belief.js';
import { HORIZON } from './race/resolution.js';

const TY = TRADING_DAYS_PER_YEAR;
const sqrtT = (T) => Math.sqrt(T);

// ---------------------------------------------------------------------------
// Snapshot: every curve sampled from the engines at one moment
// ---------------------------------------------------------------------------

/**
 * @param {object} ctx  { sim, expiries(), race(), geo(), origin() }
 * @param {number} smileIdx  expiry index for the smile's points
 */
export function takeSnapshot(ctx, smileIdx) {
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
    snap.expiries = ctx.expiries().map(e => ({ day: e.day, dte: e.day - sim.day }));
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
    snap.points = _points(snap, ctx);
    return snap;
}

const _fmtDays = (d) => d >= TY ? (d / TY).toFixed(1).replace(/\.0$/, '') + ' years' : d >= 42 ? Math.round(d / 21) + ' months' : d + ' days';

/** Tradeable contracts on each curve, priced through the one valuation path. */
function _points(snap, ctx) {
    const sim = ctx.sim, P = {};
    const up = (type, strike, expiryDay) => unitPrice(type, snap.S, market.sigma, snap.r, sim.day, strike, expiryDay, snap.q);
    P.hcn = [{ id: 'stock', type: 'stock', x: snap.rel, y: snap.S, desc: 'HCN shares', price: up('stock') }];
    P.rates = snap.expiries.map(e => {
        const T = Math.max(1, e.dte) / TY, pr = up('bond', undefined, e.day);
        return { id: 'bond@' + e.day, type: 'bond', expiryDay: e.day, x: sqrtT(T), y: -Math.log(pr / BOND_FACE_VALUE) / T * 100, desc: `Zero-coupon bond, ${_fmtDays(e.dte)}`, price: pr };
    });
    P.vx = snap.expiries.map(e => {
        const pr = up('vxhcnfuture', undefined, e.day);
        return { id: 'vx@' + e.day, type: 'vxhcnfuture', expiryDay: e.day, x: e.dte / 21, y: pr, desc: `VXHCN future, ${_fmtDays(e.dte)}`, price: pr };
    });
    const e = snap.expiries[snap.smileIdx];
    P.smile = [];
    if (e) {
        const T = Math.max(1, e.dte) / TY;
        const eff = computeEffectiveSigma(market.v, T, market.kappa, market.theta, market.xi);
        const atm = Math.round(snap.S / 5) * 5;
        for (let k = -6; k <= 6; k++) {
            if (k === 0) continue;
            const K = atm + k * 5;
            if (K <= 0 || Math.abs(k) % 2 === 1 && Math.abs(k) > 2) continue;
            const type = K < snap.S ? 'put' : 'call';
            const iv = computeSkewSigma(eff, snap.S, K, T, market.rho, market.xi, market.kappa) * 100;
            P.smile.push({ id: `${type}${K}@${e.day}`, type, strike: K, expiryDay: e.day, x: K, y: iv, desc: `HCN ${K} ${type}, ${_fmtDays(e.dte)}`, price: up(type, K, e.day) });
        }
    }
    P.cmp = [];
    if (snap.compute) {
        for (const c of snap.compute.contracts) {
            if (c.mid == null) continue;
            P.cmp.push({ id: 'cmp@' + c.key, type: 'computefuture', key: c.key, x: c.settleDay, y: c.mid, desc: `Cambria compute, day ${c.settleDay}`, price: c.mid, disabled: !c.tradeable });
        }
    }
    P.cons = [];
    if (snap.consensus) {
        for (const c of snap.consensus.contracts) {
            if (c.mid == null || c.settled) continue;
            P.cons.push({ id: 'bin@' + c.key, type: 'binary', key: c.key, R: c.R, x: c.deadline, y: c.mid, desc: `R${c.R} ${c.R === 5 ? 'reached' : 'certified'} by day ${c.deadline}`, price: c.mid * BINARY_NOTIONAL, disabled: !c.tradeable });
        }
    }
    return P;
}

// ---------------------------------------------------------------------------
// The six panels: one drawing routine, six specs
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
      read: (s) => { const e = s.expiries[s.smileIdx]; return e ? `${_fmtDays(e.dte)}` : ''; } },
    { key: 'cmp', title: 'Cambria compute', sub: 'the forward curve', what: 'The compute index at each delivery. A falling curve is a scramble for chips now.',
      series: (s) => s.compute && s.compute.curve.length ? [{ pts: s.compute.curve }] : [], yfmt: (v) => v.toFixed(0),
      xr: (s) => s.compute && s.compute.curve.length ? [s.compute.curve[0][0], s.compute.curve[s.compute.curve.length - 1][0]] : [0, 1],
      xticks: (s) => s.compute && s.compute.curve.length ? [[s.compute.curve[0][0], 'now', 'left'], ...s.compute.contracts.map((c, i, a) => [c.settleDay, 'day ' + c.settleDay, i === a.length - 1 ? 'right' : 'center']).filter((_, i, a) => i === a.length - 1 || i % 2 === 1)] : [],
      empty: (s) => !s.compute ? 'Listed in the Dynamic regimes only.' : s.compute.frozen ? 'Frozen by the control regime: held at the last valid marks.' : '',
      read: (s) => s.compute && s.compute.curve.length ? `spot ${s.compute.curve[0][1].toFixed(1)}` : '' },
    { key: 'cons', title: 'Consensus', sub: 'crossing curves', what: 'The chance each rung is certified by each day: a timeline priced as odds.',
      series: (s) => s.consensus ? [2, 3, 4, 5].map(R => ({ pts: s.consensus.curves[R].pts, R, crossed: s.consensus.curves[R].crossed })) : [],
      yfmt: (v) => Math.round(v * 100) + '%', fixed: [0, 1],
      xr: (s) => s.consensus ? [s.consensus.raceDay, HORIZON] : [0, HORIZON],
      xticks: (s) => s.consensus ? [[s.consensus.raceDay, 'today', 'left'], [HORIZON, 'day ' + HORIZON, 'right']] : [],
      empty: (s) => !s.consensus ? 'Listed in the Dynamic regimes only.' : '',
      read: (s) => { if (!s.consensus) return ''; const R = [2, 3, 4, 5].find(r => !s.consensus.curves[r].crossed); return R ? `R${R} by day ${HORIZON}: ${Math.round(s.consensus.curves[R].pts[44][1] * 100)}%` : 'R4 certified'; } },
];

// ---------------------------------------------------------------------------
// The page: panels, ghosts, the ease after news, pointer and keyboard
// ---------------------------------------------------------------------------

const _st = {
    ctx: null, onPick: null, legState: () => 0, cur: null, ghost: null, ghostHead: '', prev: null,
    t0: -1e9, dur: 1100, smileIdx: -1, panels: [], visible: false, raf: 0, reduced: false, cap: null,
    // The Consensus editor: edit mode, a held lock, the selected rung, the Lock hook.
    edit: false, pending: false, sel: 2, onLock: null, cons: null,
};

// Editor steps (UNRATIFIED feel numbers, 02a gives only the keys): ←/→ move a
// median 5 days, Shift 21 (ratified); ↑/↓ scale the width by 10%; a vertical drag
// scales it by e per 90 px, up tighter. The plateau handle (unratified binding):
// PageUp/PageDown move the term-end height 0.05, Shift 0.01; a drag follows the axis.
const EDIT_STEP = 5, EDIT_STEP_BIG = 21, EDIT_W_STEP = 1.1, EDIT_W_PX = 90;
const EDIT_H_STEP = 0.05, EDIT_H_STEP_FINE = 0.01;
const _EDIT_HELP = 'Drag a median; up and down to tighten or loosen. The square at the term’s end sets the chance it lands at all.';

const _ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Build the six panels into #mk-grid.
 * @param {object} ctx  snapshot context (see takeSnapshot)
 * @param {object} hooks { onPick(point, panelKey), legState(id) -> -1|0|1 }
 */
export function initMarkets(ctx, hooks) {
    _st.ctx = ctx;
    _st.onPick = hooks.onPick;
    _st.legState = hooks.legState;
    _st.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    _st.cap = _colophon.caption(document.getElementById('cap-markets'), 300);
    const grid = document.getElementById('mk-grid');
    grid.textContent = '';
    _st.onLock = hooks.onLock || null;
    for (const spec of PANELS) {
        const fig = document.createElement('figure');
        fig.className = 'mk-panel';
        const cons = spec.key === 'cons';
        fig.innerHTML = `<figcaption class="mk-h"><span class="mk-t">${spec.title}</span> <span class="mk-sub">· ${spec.sub}</span>`
            + (spec.key === 'smile' ? ' <span class="mk-exp"><button class="hbtn" type="button" data-exp="-1" aria-label="Earlier expiry">‹</button><button class="hbtn" type="button" data-exp="1" aria-label="Later expiry">›</button></span>' : '')
            + (cons ? ' <span class="mk-exp"><button class="hbtn mk-edit" type="button" aria-pressed="false" hidden>Your curves</button></span>' : '')
            + `</figcaption><p class="mk-what"><span class="mk-what-t">${spec.what}</span>`
            + (cons ? ' <button class="hbtn mk-lock" type="button" hidden>Lock these curves</button>' : '')
            + `</p><div class="mk-box"><canvas tabindex="0" role="img"></canvas></div>`;
        grid.appendChild(fig);
        const canvas = fig.querySelector('canvas');
        const p = { spec, fig, canvas, ctx2d: canvas.getContext('2d'), w: 0, h: 0, pts: [], hover: null, focus: -1, read: '', handles: [], geom: null, drag: null };
        _label(p);
        _st.panels.push(p);
        if (cons) {
            _st.cons = p;
            p.editBtn = fig.querySelector('.mk-edit');
            p.lockBtn = fig.querySelector('.mk-lock');
            p.whatEl = fig.querySelector('.mk-what-t');
            p.editBtn.addEventListener('click', () => { if (!_st.pending) setCurveEdit(!_st.edit); });
            p.lockBtn.addEventListener('click', () => { if (_st.pending && _st.onLock) _st.onLock(); });
        }
        _wirePanel(p);
        new ResizeObserver(() => { _size(p); _draw(p); }).observe(fig.querySelector('.mk-box'));
    }
    grid.addEventListener('click', (e) => {
        const b = e.target.closest('[data-exp]');
        if (!b || !_st.cur) return;
        const n = _st.cur.expiries.length;
        _st.smileIdx = Math.max(0, Math.min(n - 1, _st.cur.smileIdx + Number(b.dataset.exp)));
        refreshMarkets(true);
    });
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
    const next = takeSnapshot(_st.ctx, _st.smileIdx);
    if (newsHead && _st.prev) {
        _st.ghost = _st.prev;
        _st.ghostHead = newsHead;
        _st.t0 = _st.reduced ? -1e9 : performance.now();
    }
    _st.prev = next;
    _st.cur = next;
    if (_st.visible) { _drawAll(); _kick(); }
}

/** Clear ghosts and snapshots, and leave edit mode (reset / regime change). */
export function resetMarkets() {
    _st.cur = _st.prev = _st.ghost = null;
    _st.ghostHead = '';
    _st.smileIdx = -1;
    setCurveEdit(false, false);
}

/** The canvas's accessible name: the sandbox keys, or the editor's in edit mode. */
function _label(p) {
    const { spec } = p;
    p.canvas.setAttribute('aria-label', spec.key === 'cons' && _st.edit
        ? `${spec.title}, your curves over the market’s. Tab chooses a rung; left and right move its median, with Shift for larger steps; up and down tighten or loosen it; Page Up and Page Down raise or lower the chance it lands this term.`
        : `${spec.title}, ${spec.sub}. ${spec.what} Arrow keys choose a contract; Enter adds it to the sandbox, again to go short, a third time to remove it.`);
}

/**
 * Edit mode for the Consensus panel's curves (main.js and the panel's toggle).
 * `pending` is a lock the player chose to adjust first: it forces edit mode on
 * and shows the Lock button until main.js records the lock. `focus` moves
 * keyboard focus to the panel (the dispatch's "Adjust first").
 */
export function setCurveEdit(on, pending = false, focus = false) {
    _st.pending = !!pending;
    _st.edit = !!on || _st.pending;
    const p = _st.cons;
    if (!p) return;
    p.drag = null;
    p.hover = null;
    p.editBtn.setAttribute('aria-pressed', String(_st.edit));
    p.editBtn.disabled = _st.pending;
    p.lockBtn.hidden = !_st.pending;
    p.whatEl.textContent = _st.edit ? _EDIT_HELP : p.spec.what;
    p.fig.classList.toggle('editing', _st.edit);
    _label(p);
    if (_st.edit) _selectOpen(0);
    if (focus) p.canvas.focus();
    if (_st.visible) _draw(p);
}

/** Keep the selected rung on an open one: step `dir` through the open rungs
 *  (0 = stay if still open, else the first). Returns false past either end. */
function _selectOpen(dir) {
    const open = belief.active ? openRungs() : [];
    if (!open.length) return false;
    const i = open.indexOf(_st.sel);
    if (dir === 0) { if (i < 0) _st.sel = open[0]; return true; }
    const j = (i < 0 ? 0 : i) + dir;
    if (j < 0 || j >= open.length) return false;
    _st.sel = open[j];
    return true;
}

/** Re-snapshot now (page shown, expiry stepped, theme or sandbox changed). */
export function refreshMarkets(resnap) {
    if (!_st.ctx || !_st.visible) return;
    if (resnap || !_st.cur) {
        _st.cur = takeSnapshot(_st.ctx, _st.smileIdx);
        if (!_st.prev) _st.prev = _st.cur;
    }
    for (const p of _st.panels) _size(p);
    _drawAll();
}

/** Points currently on a panel (sandbox keyboard path, tests). */
export function marketPoints(key) { return _st.cur ? (_st.cur.points[key] || []) : []; }

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
    for (const p of _st.panels) _draw(p);
    _caption();
}

function _caption() {
    const s = _st.cur;
    if (!s || !_st.cap) return;
    const parts = [`HCN ${s.S.toFixed(2)}`, `10-year ${pct(s.rates[s.rates.length - 1][1])}`, `VXHCN ${s.vxSpot.toFixed(1)}`];
    if (s.compute && s.compute.curve.length) parts.push(`compute spot ${s.compute.curve[0][1].toFixed(1)}`);
    if (s.consensus) {
        const R = [2, 3, 4, 5].find(r => !s.consensus.curves[r].crossed);
        if (R) parts.push(`R${R} by day ${HORIZON} at ${Math.round(s.consensus.curves[R].pts[44][1] * 100)}%`);
    }
    _st.cap((_st.ghost ? `After “${_st.ghostHead}”: the dashed lines are the curves before it. ` : 'Edition ' + (s.rel + 1) + '. ')
        + parts.join(' · ') + '.');
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
    if (p.editBtn) p.editBtn.hidden = !(s && s.consensus);
    if (!s) return;
    const spec = p.spec;
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
    const ticks = spec.fixed ? [0, 0.5, 1] : _ticks(lo, hi);
    c.strokeStyle = _r(text, 0.07); c.lineWidth = 1; c.beginPath();
    for (const v of ticks) { const y = Math.round(Y(v)) + 0.5; c.moveTo(g.l, y); c.lineTo(g.r + 4, y); }
    c.stroke();
    c.font = font(11.5); c.fillStyle = muted; c.textAlign = 'left'; c.textBaseline = 'middle';
    for (const v of ticks) c.fillText(spec.yfmt(v), g.r + 7, Y(v));
    c.textBaseline = 'alphabetic';
    for (const [x, t, al] of spec.xticks(s)) { c.textAlign = al || 'center'; c.fillText(t, Math.max(g.l, Math.min(g.r, X(x))), H - 5); }

    const ex = spec.extra ? spec.extra(s) : {};
    if (ex.vline != null) {
        const x = Math.round(X(ex.vline)) + 0.5;
        c.strokeStyle = _r(text, 0.28); c.setLineDash([1.5, 3]);
        c.beginPath(); c.moveTo(x, g.t); c.lineTo(x, g.b); c.stroke(); c.setLineDash([]);
    }

    const cons = spec.key === 'cons', ind = pal.inks.indigo;
    const editing = cons && _st.edit;
    // The player's draft (02a, the posterior), read live from belief.js: it moves
    // under the pointer, not once a day like the snapshot.
    const draft = cons && s.consensus && belief.active ? draftCurves() : null;
    const tNow = draft ? s.consensus.raceDay : 0;
    const open = draft ? openRungs() : [];
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
    // The draft, beneath B: solid, in the text ink. Drawn even where it is B's
    // projection, since the projection is a fit to B's curve, not B's curve.
    if (draft) {
        c.strokeStyle = text; c.lineWidth = 1.5;
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
    }

    // The draft's medians: a bead on each open rung, a handle in edit mode. A
    // median outside the panel's span sits on the nearer edge with a chevron. In
    // edit mode each open rung also has a plateau handle at the term's end: the
    // curve's height there, a square (02a: the plateau handle).
    p.handles = [];
    if (draft) {
        for (const R of open) {
            const { m, w, q } = draft[R];
            const xm = Math.max(x0, Math.min(x1, m));
            p.handles.push({ R, sx: X(xm), sy: Y(crossingProb(m, w, q, tNow, xm)), off: m < x0 ? -1 : m > x1 ? 1 : 0 });
        }
        if (editing) {
            for (const R of open) {
                const { m, w, q } = draft[R];
                p.handles.push({ R, plateau: true, sx: X(x1), sy: Y(plateauHeight(m, w, q, tNow)), off: 0 });
            }
        }
        for (const hd of p.handles) {
            if (hd.plateau) {
                const sel = hd.R === _st.sel, r = sel ? 4 : 3.3;
                c.beginPath(); c.rect(hd.sx - r, hd.sy - r, 2 * r, 2 * r);
                c.fillStyle = sel ? text : pal.canvas; c.fill();
                c.strokeStyle = text; c.lineWidth = 1.5; c.stroke();
                continue;
            }
            const sel = editing && hd.R === _st.sel;
            c.beginPath(); c.arc(hd.sx, hd.sy, editing ? (sel ? 4.6 : 3.8) : 2.4, 0, Math.PI * 2);
            if (!editing) { c.fillStyle = text; c.fill(); continue; }
            c.fillStyle = sel ? text : pal.canvas; c.fill();
            c.strokeStyle = text; c.lineWidth = 1.5; c.stroke();
            if (hd.off) {
                const ax = hd.sx - hd.off * 9;
                c.beginPath(); c.moveTo(ax - hd.off * 3, hd.sy - 3.5); c.lineTo(ax, hd.sy); c.lineTo(ax - hd.off * 3, hd.sy + 3.5);
                c.lineWidth = 1.2; c.stroke();
            }
            if (sel) {
                c.font = font(12, true); c.fillStyle = text; c.textBaseline = 'alphabetic';
                c.textAlign = hd.sx > (g.l + g.r) / 2 ? 'right' : 'left';
                c.fillText(`R${hd.R}`, hd.sx + (c.textAlign === 'left' ? 7 : -7), hd.sy - 7);
                if (document.activeElement === p.canvas) {
                    c.strokeStyle = pal.accent; c.lineWidth = 1;
                    c.strokeRect(Math.round(hd.sx) - 7.5, Math.round(hd.sy) - 7.5, 15, 15);
                }
            }
        }
    }

    // Tradeable points: hollow; legs held in the sandbox: a triangle, up long, down short.
    const pts = (s.points[spec.key] || []).map(q => ({ ...q, sx: X(q.x), sy: Y(q.y) }));
    p.pts = pts;
    pts.forEach((q, i) => {
        const side = _st.legState(q.id), on = (p.hover && p.hover.id === q.id) || p.focus === i;
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
        if (!editing && p.focus === i && document.activeElement === p.canvas) {
            c.strokeStyle = pal.accent; c.lineWidth = 1;
            c.strokeRect(Math.round(q.sx) - 7.5, Math.round(q.sy) - 7.5, 15, 15);
        }
    });

    // The reading, top left; a label for the hovered or focused contract.
    c.font = font(12, true); c.fillStyle = muted; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    const sd = editing && draft && draft[_st.sel] ? _st.sel : 0;
    // Both as conditional medians given nothing yet; the draft's m is the median
    // given the rung ever certifies, a different measure from the market's.
    const by = (d) => d == null ? 'not this term' : `by day ${Math.round(d)}`;
    const bMed = sd ? s.consensus.curves[sd].median : null;
    // A rung still on the market's projection reads as the market's own date.
    const dMed = !sd ? null : curvesEqual(draft, marketCurves(), sd) ? bMed : curveMedian(draft[sd], s.consensus.raceDay, sd);
    c.fillText(sd ? `R${sd} yours ${by(dMed)} · Consensus ${by(bMed)}` : spec.read(s), g.l, 11);
    const lab = editing ? null : p.hover || (p.focus >= 0 && document.activeElement === p.canvas ? pts[p.focus] : null);
    if (lab) {
        const side = _st.legState(lab.id);
        const act = lab.disabled ? 'not trading' : side > 0 ? 'click: go short' : side < 0 ? 'click: remove' : 'click: add long';
        c.font = font(12, true);
        let t = `${lab.desc} · ${_priceLabel(lab)} · ${act}`;
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

function _nearestHandle(p, x, y) {
    let best = null, bd = 14;
    for (const h of p.handles) { const d = Math.hypot(h.sx - x, h.sy - y); if (d < bd) { bd = d; best = h; } }
    return best;
}

/** True while this panel is the Consensus editor in edit mode. */
const _editing = (p) => p.spec.key === 'cons' && _st.edit;

function _wirePanel(p) {
    const local = (e) => { const b = p.canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    // The editor's drag (Consensus, edit mode): across for the median, up and down
    // for the width, measured from where the drag began.
    p.canvas.addEventListener('pointerdown', (e) => {
        if (!_editing(p) || e.button !== 0) return;
        const [x, y] = local(e);
        const h = _nearestHandle(p, x, y);
        const d = draftCurves();
        if (!h || !d) return;
        _st.sel = h.R;
        p.drag = { R: h.R, plateau: !!h.plateau, x, y, m0: d[h.R].m, w0: d[h.R].w };
        p.canvas.setPointerCapture(e.pointerId);
        p.canvas.style.cursor = 'grabbing';
        e.preventDefault();
        _draw(p);
    });
    p.canvas.addEventListener('pointermove', (e) => {
        if (_editing(p)) {
            const [x, y] = local(e);
            if (p.drag && p.geom) {
                const G = p.geom;
                if (p.drag.plateau) {
                    // The plateau follows the pointer on the probability axis.
                    setDraftPlateau(p.drag.R, G.lo + (G.hi - G.lo) * (1 - (y - G.gt) / Math.max(1, G.gb - G.gt)));
                } else {
                    const perPx = (G.x1 - G.x0) / Math.max(1, G.gr - G.gl);
                    setDraftMedian(p.drag.R, p.drag.m0 + (x - p.drag.x) * perPx);
                    setDraftWidth(p.drag.R, p.drag.w0 * Math.exp((y - p.drag.y) / EDIT_W_PX));
                }
                _draw(p);
            } else {
                p.canvas.style.cursor = _nearestHandle(p, x, y) ? 'grab' : '';
            }
            return;
        }
        const h = _nearest(p, ...local(e));
        if ((h && h.id) !== (p.hover && p.hover.id)) { p.hover = h; p.canvas.style.cursor = h && !h.disabled ? 'pointer' : ''; _draw(p); }
    });
    const endDrag = () => {
        if (!p.drag) return;
        p.drag = null;
        p.canvas.style.cursor = 'grab';
        _draw(p);
        _announceEdit();
    };
    p.canvas.addEventListener('pointerup', endDrag);
    p.canvas.addEventListener('pointercancel', endDrag);
    p.canvas.addEventListener('pointerleave', () => { if (_editing(p)) return; p.hover = null; _draw(p); });
    p.canvas.addEventListener('click', (e) => {
        if (_editing(p)) return;                     // edit mode: no sandbox picks
        const h = _nearest(p, ...local(e));
        if (h && !h.disabled && _st.onPick) _st.onPick(h, p.spec.key);
    });
    p.canvas.addEventListener('focus', () => {
        if (_editing(p)) { _selectOpen(0); _draw(p); _announceEdit(); return; }
        if (p.focus < 0 && p.pts.length) p.focus = 0;
        _draw(p); _announce(p);
    });
    p.canvas.addEventListener('blur', () => _draw(p));
    p.canvas.addEventListener('keydown', (e) => {
        if (_editing(p)) { _editKey(p, e); return; }
        if (!p.pts.length) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') p.focus = (p.focus + 1) % p.pts.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') p.focus = (p.focus - 1 + p.pts.length) % p.pts.length;
        else if (e.key === 'Home') p.focus = 0;
        else if (e.key === 'End') p.focus = p.pts.length - 1;
        else if (e.key === 'Enter' || e.key === ' ') {
            const q = p.pts[Math.max(0, p.focus)];
            if (q && !q.disabled && _st.onPick) _st.onPick(q, p.spec.key);
        } else return;
        e.preventDefault();
        e.stopPropagation();
        _draw(p);
        _announce(p);
    });
}

/**
 * The editor's keys (02a): ←/→ move the selected median 5 days (Shift: 21),
 * ↑ tightens and ↓ loosens its width. Tab and Shift+Tab step through the open
 * rungs like the thumbs of a multi-thumb slider, letting focus leave the panel
 * past either end; Home and End choose the first and last.
 */
function _editKey(p, e) {
    const d = draftCurves();
    if (!d) return;
    const R = _st.sel, open = openRungs();
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        setDraftMedian(R, d[R].m + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? EDIT_STEP_BIG : EDIT_STEP));
    } else if (e.key === 'ArrowUp') setDraftWidth(R, d[R].w / EDIT_W_STEP);
    else if (e.key === 'ArrowDown') setDraftWidth(R, d[R].w * EDIT_W_STEP);
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
        const h = plateauHeight(d[R].m, d[R].w, d[R].q, belief.day);
        setDraftPlateau(R, h + (e.key === 'PageUp' ? 1 : -1) * (e.shiftKey ? EDIT_H_STEP_FINE : EDIT_H_STEP));
    }
    else if (e.key === 'Tab') { if (!_selectOpen(e.shiftKey ? -1 : 1)) return; }
    else if (e.key === 'Home') _st.sel = open[0];
    else if (e.key === 'End') _st.sel = open[open.length - 1];
    else return;
    e.preventDefault();
    e.stopPropagation();
    _draw(p);
    _announceEdit();
}

/** Speak the selected rung's draft beside the market's (screen readers). */
function _announceEdit() {
    const live = document.getElementById('sb-live');
    const d = draftCurves();
    if (!live || !d || !d[_st.sel]) return;
    const R = _st.sel, bMed = impliedTimeline()[R], t = belief.day;
    const dMed = curvesEqual(d, marketCurves(), R) ? bMed : curveMedian(d[R], t, R);
    const h = plateauHeight(d[R].m, d[R].w, d[R].q || 0, t);
    const by = (x) => x == null ? 'not this term' : `by day ${Math.round(x)}`;
    live.textContent = `R${R}: yours ${by(dMed)}, width ${Math.round(d[R].w)} days, ${Math.round(100 * h)}% this term. Consensus ${by(bMed)}.`;
}

function _announce(p) {
    const q = p.pts[p.focus];
    const live = document.getElementById('sb-live');
    if (!q || !live) return;
    const side = _st.legState(q.id);
    live.textContent = `${q.desc}, ${_priceLabel(q)}. ${q.disabled ? 'Not trading.' : side > 0 ? 'Held long; Enter to go short.' : side < 0 ? 'Held short; Enter to remove.' : 'Enter to add long.'}`;
}

/** Redraw every panel (sandbox legs changed, theme flipped). */
export function redrawMarkets() {
    if (_st.visible) _drawAll();
}
