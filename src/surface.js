/* =====================================================
   surface.js -- The front page's volatility surface: a
   small mesh of the pricing vol the chain is quoted at,
   by strike (moneyness) and expiry.

   Each vertex is computeEffectiveSigma (Heston term) with
   computeSkewSigma (skew and smile) at that strike and
   expiry, the same vol every option price on the page
   uses. Height and shade both read the vol; the mesh
   lines are the strikes and expiries. Drawn once a day
   and on theme change; a horizontal drag turns it.
   ===================================================== */

import { market } from './market.js';
import { TRADING_DAYS_PER_YEAR } from './config.js';
import { computeEffectiveSigma, computeSkewSigma } from './pricing.js';

const _st = { canvas: null, c: null, w: 0, h: 0, dpr: 1, az: -0.62, drag: null };

export function initSurface() {
    _st.canvas = document.getElementById('surface-canvas');
    if (!_st.canvas) return;
    _st.c = _st.canvas.getContext('2d');
    new ResizeObserver(() => drawSurface()).observe(_st.canvas);
    _st.canvas.addEventListener('pointerdown', (e) => { _st.drag = { x: e.clientX, az: _st.az }; _st.canvas.setPointerCapture(e.pointerId); });
    _st.canvas.addEventListener('pointermove', (e) => {
        if (!_st.drag) return;
        _st.az = Math.max(-1.3, Math.min(0.1, _st.drag.az + (e.clientX - _st.drag.x) * 0.008));
        drawSurface();
    });
    const end = () => { _st.drag = null; };
    _st.canvas.addEventListener('pointerup', end);
    _st.canvas.addEventListener('pointercancel', end);
}

function _size() {
    const r = _st.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return false;
    if (w !== _st.w || h !== _st.h || dpr !== _st.dpr) {
        _st.w = w; _st.h = h; _st.dpr = dpr;
        _st.canvas.width = Math.round(w * dpr);
        _st.canvas.height = Math.round(h * dpr);
        _st.c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return true;
}

export function drawSurface() {
    if (!_st.canvas || !_size() || !market.S) return;
    const c = _st.c, W = _st.w, H = _st.h;
    const pal = _themePalette(), text = pal.text, muted = pal.textMuted;
    c.clearRect(0, 0, W, H);
    const S = market.S;
    const ms = [], Ts = [];
    for (let i = 0; i <= 12; i++) ms.push(-0.35 + 0.7 * i / 12);           // log-moneyness
    for (let j = 0; j <= 9; j++) Ts.push(Math.exp(Math.log(5) + (Math.log(504) - Math.log(5)) * j / 9) / TRADING_DAYS_PER_YEAR);
    const iv = (m, T) => {
        const eff = computeEffectiveSigma(market.v, T, market.kappa, market.theta, market.xi);
        return computeSkewSigma(eff, S, S * Math.exp(m), T, market.rho, market.xi, market.kappa);
    };
    const grid = Ts.map(T => ms.map(m => iv(m, T)));
    let lo = Infinity, hi = -Infinity;
    for (const row of grid) for (const v of row) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (hi - lo < 0.02) { hi = lo + 0.02; }
    const ca = Math.cos(_st.az), sa = Math.sin(_st.az), el = 0.52, ce = Math.cos(el), se = Math.sin(el);
    const sc = Math.min(W / 3.2, (H - 34) / 2.25), cx = W / 2 + 6, cy = 18 + 1.62 * sc;
    const Z = (v) => (v - lo) / (hi - lo) * 1.05;
    const P = (x, y, z) => { const X1 = x * ca - y * sa, D = x * sa + y * ca; return [cx + sc * X1, cy - sc * (z * ce + D * se), D]; };
    const pts = grid.map((row, j) => row.map((v, i) => [...P(ms[i] / 0.35, j / (Ts.length - 1) * 2 - 1, Z(v)), v]));

    // The floor and its frame.
    const B = [P(-1, -1, 0), P(1, -1, 0), P(1, 1, 0), P(-1, 1, 0)];
    c.strokeStyle = _r(text, 0.25); c.lineWidth = 1; c.beginPath();
    B.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.stroke();

    // Quads far to near, shaded by vol.
    const quads = [];
    for (let j = 0; j < Ts.length - 1; j++) for (let i = 0; i < ms.length - 1; i++) {
        const a = pts[j][i], b = pts[j][i + 1], d = pts[j + 1][i], e = pts[j + 1][i + 1];
        quads.push({ q: [a, b, e, d], depth: a[2] + b[2] + d[2] + e[2], v: (a[3] + b[3] + d[3] + e[3]) / 4 });
    }
    quads.sort((p, q) => q.depth - p.depth);
    const ink = _parseHex(pal.inks.prussian), cv = _parseHex(pal.canvas);
    for (const qd of quads) {
        const t = 0.1 + 0.55 * (qd.v - lo) / (hi - lo);
        c.fillStyle = 'rgb(' + cv.map((x, k) => Math.round((x + (ink[k] - x) * t) * 255)).join(',') + ')';
        c.beginPath(); qd.q.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
        c.fill(); c.strokeStyle = _r(text, 0.3); c.lineWidth = 0.6; c.stroke();
    }

    // Labels: strike runs left to right, expiry into the page; the vol scale.
    c.font = `italic 12px ${_FONT.text}`; c.fillStyle = muted; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const sl = P(0, -1.28, 0), el2 = P(1.24, 0.1, 0);
    c.fillText('strike', sl[0], sl[1] + 13);
    c.fillText('expiry', el2[0] + 14, el2[1] + 10);
    c.textAlign = 'left';
    c.fillText(`vol ${Math.round(lo * 100)}% to ${Math.round(hi * 100)}%`, 2, 12);
}
