/* ===================================================
   chart.js — The tape: HCN drawn after Tufte on
   Canvas 2D. Each day's range is a band, the close a
   line over it; news days are ticked on the band and
   the most recent carry their heads. Position entries,
   held strikes and a crosshair with the day's agate
   line complete it. The shared camera pans and zooms
   horizontally; the log Y axis fits the visible days.
   =================================================== */

import {
    CHART_Y_AXIS_W, CHART_Y_LABEL_W, CHART_X_AXIS_H, CHART_PADDING_T,
    CHART_SLOT_PX, CHART_BODY_RATIO,
} from './config.js';

export class ChartRenderer {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        this.camera = null;
        this.dayOrigin = 0; // absolute day that maps to Y0 M0 D0

        // Logical (CSS) dimensions — updated by resize()
        this.width  = 0;
        this.height = 0;

        // Live candle interpolation state
        this._lerp = {
            day: -1, close: 0, high: 0, low: 0,
            _from: 0, _targetClose: 0, _targetHigh: 0, _targetLow: 0,
            _t: 1, // progress 0→1 through current segment
        };
        this._segmentDur = 0.25; // seconds per substep (updated by setSubstepInterval)
        this._lastFrameTime = 0;

        // P7-1 presentation degradation: a DISPLAY-ONLY offset applied to the live
        // candle's close for exactly one drawn frame -- the terminal printing a
        // wrong tick, then correcting. It never touches _lerp (so no high/low
        // water mark is polluted) and never touches history: the printed record is
        // immutable. `_repaintDirty` asks main.js for the corrective redraw.
        this._repaint = 0;
        this._repaintDirty = false;

        // News days for the tape (setNews): [{ day, head, major }]
        this._news = [];

        // Axis gutter sizes (CSS px) — from config.js
        this.Y_AXIS_W  = CHART_Y_AXIS_W;
        this.Y_LABEL_W = CHART_Y_LABEL_W;
        this.X_AXIS_H  = CHART_X_AXIS_H;
        this.PADDING_T = CHART_PADDING_T;

        // Candle sizing — from config.js
        this.SLOT_PX    = CHART_SLOT_PX;
        this.BODY_RATIO = CHART_BODY_RATIO;

        this.resize();
    }

    /* -----------------------------------------------
       setCamera(camera)
       Store reference to the shared camera object.
    ----------------------------------------------- */
    setCamera(camera) {
        this.camera = camera;
    }

    /* -----------------------------------------------
       resize()
       Sync canvas buffer size with CSS size * DPR.
       Call on window resize and after panel layout
       changes.
    ----------------------------------------------- */
    resize() {
        const r = resizeCanvasDPR(this.canvas, this.ctx);
        this._dpr   = r.dpr;
        this.width  = r.width;
        this.height = r.height;

        // Keep camera viewport in sync
        if (this.camera) {
            this.camera.setViewport(r.width, r.height);
        }
    }

    /* -----------------------------------------------
       setSubstepInterval(ms)
       Set the expected duration between substeps so the
       cubic interpolation fills the full interval.
       @param {number} ms  milliseconds between substeps
    ----------------------------------------------- */
    setSubstepInterval(ms) {
        this._segmentDur = ms / 1000;
    }

    /* -----------------------------------------------
       isLerpActive()
       Returns true if the live candle is still animating
       (i.e., display values differ from targets).
    ----------------------------------------------- */
    isLerpActive() {
        const L = this._lerp;
        return L.day >= 0 && (
            Math.abs(L.close - L._targetClose) > 0.001 ||
            Math.abs(L.high  - L._targetHigh)  > 0.001 ||
            Math.abs(L.low   - L._targetLow)   > 0.001
        );
    }

    /* -----------------------------------------------
       resetTransients()
       Clear every PER-RUN transient display field: the
       live-candle lerp animation and the P7-1 one-frame
       wrong print (02a "Act III"). Called by
       `_resetCore` -- a pending repaint generated while
       the strategy view was up is never consumed by
       draw(), so without this it could survive a
       Dynamic->Classic reset and print one Act-III wrong
       tick on a world that has no Act III.
    ----------------------------------------------- */
    resetTransients() {
        Object.assign(this._lerp, {
            day: -1, close: 0, high: 0, low: 0,
            _from: 0, _targetClose: 0, _targetHigh: 0, _targetLow: 0, _t: 1,
        });
        this._repaint = 0;
        this._repaintDirty = false;
    }

    /* -----------------------------------------------
       update(now)
       Advance cubic interpolation toward the live
       candle's target. Call once per frame before draw().
       @param {number} now  performance.now() timestamp
    ----------------------------------------------- */
    update(now) {
        const dt = this._lastFrameTime > 0
            ? Math.min((now - this._lastFrameTime) / 1000, 0.1) // cap at 100ms
            : 0;
        this._lastFrameTime = now;

        const L = this._lerp;
        if (L.day < 0 || L._t >= 1) return;

        L._t = Math.min(1, L._t + dt / this._segmentDur);
        // Smoothstep: cubic ease-in-out, zero velocity at endpoints
        const t = L._t;
        const s = t * t * (3 - 2 * t);
        L.close = L._from + (L._targetClose - L._from) * s;
        // High/low are water marks of the interpolated path
        if (L.close > L.high) L.high = L.close;
        if (L.close < L.low)  L.low  = L.close;
    }

    /* -----------------------------------------------
       setLiveCandle(bar)
       Update the lerp targets from the current partial
       bar. If the day changed, snap instead of lerp.
       @param {Object} bar  The partial/live bar
    ----------------------------------------------- */
    setLiveCandle(bar) {
        if (!bar) return;
        const L = this._lerp;
        if (L.day !== bar.day) {
            // Finish previous day: snap close to its final target
            // so the last substep value is actually reached
            if (L.day >= 0) {
                L.close = L._targetClose;
                if (L.close > L.high) L.high = L.close;
                if (L.close < L.low)  L.low  = L.close;
            }
            // New day — snap to open price
            L.day   = bar.day;
            L.close = bar.open;
            L.high  = bar.open;
            L.low   = bar.open;
        } else {
            // New substep — snap close to previous target so every
            // substep value is visited, then water-mark high/low
            L.close = L._targetClose;
            if (L.close > L.high) L.high = L.close;
            if (L.close < L.low)  L.low  = L.close;
        }
        // Start new cubic segment from current close to new target
        L._from = L.close;
        L._t = 0;
        L._targetClose = bar.close;
        L._targetHigh = bar.high;
        L._targetLow  = bar.low;
    }

    /* -----------------------------------------------
       setTransientRepaint(delta)
       P7-1 presentation degradation: draw the live
       candle's close `delta` off for ONE frame, then
       correct. Display only -- the lerp state, the
       partial bar, and the printed history are all
       untouched.
       @param {number} delta  signed price offset
    ----------------------------------------------- */
    setTransientRepaint(delta) {
        this._repaint = delta || 0;
    }

    /* -----------------------------------------------
       setNews(items)
       News days for the tape: [{ day, head, major }],
       oldest first. Marked on the range band; the
       most recent carry their heads along the top.
    ----------------------------------------------- */
    setNews(items) {
        this._news = items || [];
    }

    /* -----------------------------------------------
       draw(history, positions, mouseX, mouseY, latestBar)

       The tape, after Tufte: each day's range is a
       band, the close a line over it. News days are
       ticked on the band, positions marked where they
       were entered, option strikes ruled across.

       @param {Object[]} history     OHLC bars { day, open, high, low, close }
       @param {Object[]} positions   Portfolio positions
       @param {number}   mouseX      CSS px, or <0 to hide the crosshair
       @param {number}   mouseY      CSS px
       @param {Object}   [latestBar] The live bar
    ----------------------------------------------- */
    draw(history, positions, mouseX, mouseY, latestBar) {
        const ctx = this.ctx;
        const pal = _themePalette();
        const ink = pal.inks;
        const text = pal.text, muted = pal.textMuted, sec = pal.textSecondary, red = pal.accent;
        const W = this.width, H = this.height;
        const yAW = this.Y_AXIS_W, xAH = this.X_AXIS_H, pT = this.PADDING_T + 22;
        const plotX = 0, plotY = pT, plotW = W - yAW, plotH = H - pT - xAH;
        ctx.clearRect(0, 0, W, H);

        if (!history || history.size === 0 || history.length === 0) {
            ctx.fillStyle = muted;
            ctx.font = `italic 14px ${_FONT.text}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Awaiting the first session…', W / 2, H / 2);
            return;
        }

        // ── Visible days (camera: 1 world unit = 1 day) ──
        const cam = this.camera;
        const hMinDay = history.minDay != null ? history.minDay : 0;
        const hMaxDay = history.maxDay != null ? history.maxDay : history.length - 1;
        const X = (d) => cam ? cam.worldToScreenX(d) : plotX + ((d - hMinDay) / (hMaxDay - hMinDay + 1)) * plotW;
        let firstDay = hMinDay, lastDay = hMaxDay;
        if (cam) {
            firstDay = Math.max(hMinDay, Math.floor(cam.screenToWorldX(plotX)) - 1);
            lastDay = Math.min(hMaxDay, Math.ceil(cam.screenToWorldX(plotX + plotW)));
        }
        if (firstDay > lastDay) return;
        const _get = typeof history.get === 'function' ? (d) => history.get(d) : (d) => history[d];

        // The live day draws from the interpolated close; the one-frame wrong
        // print (P7-1) rides on it and is consumed below.
        const liveDay = this._lerp.day, repaint = this._repaint;
        const bars = [];
        let lo = Infinity, hi = -Infinity;
        for (let d = firstDay; d <= lastDay; d++) {
            const b = _get(d);
            if (!b) continue;
            let h = b.high, l = b.low, c = b.close;
            if (d === liveDay && liveDay >= 0) {
                c = this._lerp.close + repaint;
                h = Math.max(this._lerp.high, c);
                l = Math.min(this._lerp.low, c);
            }
            bars.push({ d, o: b.open, h, l, c, x: X(d + 0.5) });
            if (l < lo) lo = l;
            if (h > hi) hi = h;
        }
        if (!bars.length) return;
        if (lo <= 0) lo = 0.01;
        if (hi <= lo) hi = lo * 1.02;

        // ── Log scale with a little air ──
        const lLo0 = Math.log(lo), lHi0 = Math.log(hi), span = lHi0 - lLo0;
        const lLo = lLo0 - span * 0.08, lHi = lHi0 + span * 0.1, lD = lHi - lLo;
        const Y = (p) => plotY + plotH - ((Math.log(Math.max(p, 1e-9)) - lLo) / lD) * plotH;
        const pLo = Math.exp(lLo), pHi = Math.exp(lHi);
        const step = _niceInterval(pHi - pLo, 5);
        const font = (px, it) => `${it ? 'italic ' : ''}${px}px ${_FONT.text}`;

        // ── Price rules: hairlines, labels at the right ──
        ctx.lineWidth = 1;
        ctx.strokeStyle = _r(text, 0.06);
        ctx.beginPath();
        for (let p = Math.ceil(pLo / step) * step; p <= pHi; p += step) {
            const y = Math.round(Y(p)) + 0.5;
            ctx.moveTo(plotX, y); ctx.lineTo(plotX + plotW + 4, y);
        }
        ctx.stroke();
        ctx.font = font(12);
        ctx.fillStyle = muted;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        for (let p = Math.ceil(pLo / step) * step; p <= pHi; p += step) {
            const y = Y(p);
            if (y < plotY + 6 || y > plotY + plotH - 4) continue;
            ctx.fillText(_tickPrice(p, step), plotX + plotW + 8, y);
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(plotX, plotY - 2, plotW, plotH + 4);
        ctx.clip();

        // ── Option strikes held: dashed rules, call and put inks ──
        const strikes = new Map();
        for (const pos of positions || []) {
            if ((pos.type !== 'call' && pos.type !== 'put') || pos.strike == null) continue;
            const e = strikes.get(pos.strike) || { call: false, put: false };
            e[pos.type] = true;
            strikes.set(pos.strike, e);
        }
        ctx.font = font(12, true);
        ctx.textBaseline = 'bottom';
        for (const [K, f] of strikes) {
            const y = Math.round(Y(K)) + 0.5;
            if (y < plotY || y > plotY + plotH) continue;
            const col = f.call && f.put ? sec : f.call ? (pal.call || ink.indigo) : (pal.put || ink.sienna);
            ctx.strokeStyle = _r(col, 0.7);
            ctx.setLineDash([5, 4]);
            ctx.beginPath(); ctx.moveTo(plotX, y); ctx.lineTo(plotX + plotW, y); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = col;
            ctx.textAlign = 'left';
            ctx.fillText(`${K} ${f.call && f.put ? 'call and put' : f.call ? 'call' : 'put'}`, plotX + 6, y - 2);
        }

        // ── The day's range: one band through every high and low ──
        const half = Math.max(0.5, Math.min(6, (cam ? cam.zoom : 8) * 0.36));
        ctx.beginPath();
        for (let i = 0; i < bars.length; i++) {
            const b = bars[i];
            if (i === 0) ctx.moveTo(b.x - half, Y(b.h)); else ctx.lineTo(b.x - half, Y(b.h));
            ctx.lineTo(b.x + half, Y(b.h));
        }
        for (let i = bars.length - 1; i >= 0; i--) {
            const b = bars[i];
            ctx.lineTo(b.x + half, Y(b.l));
            ctx.lineTo(b.x - half, Y(b.l));
        }
        ctx.closePath();
        ctx.fillStyle = _r(text, document.documentElement.dataset.theme === 'dark' ? 0.13 : 0.09);
        ctx.fill();

        // ── News days: a tick on the band; recent heads along the top ──
        const news = this._news || [];
        const newsByDay = new Map();
        for (const n of news) if (n.day >= firstDay && n.day <= lastDay) newsByDay.set(n.day, n);
        ctx.strokeStyle = sec;
        ctx.lineWidth = 1;
        for (const [d, n] of newsByDay) {
            const b = bars.find(z => z.d === d);
            if (!b) continue;
            const x = Math.round(b.x) + 0.5, y = Y(b.h) - 5;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - (n.major ? 9 : 5)); ctx.stroke();
        }
        ctx.restore();

        // Heads, newest first, in two rows above the plot, leader lines to their days.
        ctx.font = font(12.5, true);
        ctx.textBaseline = 'alphabetic';
        const taken = [];
        const recent = [...newsByDay.values()].sort((a, b) => b.day - a.day).slice(0, 8);
        for (const n of recent) {
            const b = bars.find(z => z.d === n.day);
            if (!b) continue;
            const x = Math.round(b.x) + 0.5;
            const label = n.head.length > 54 ? n.head.slice(0, 52).replace(/\s+\S*$/, '') + '…' : n.head;
            const w = ctx.measureText(label).width;
            const right = x > plotW * 0.55;
            const x0 = right ? x - 4 - w : x + 4;
            if (x0 < plotX || x0 + w > plotX + plotW) continue;
            let row = 0;
            while (row < 2 && taken.some(t => t.row === row && x0 < t.x1 + 10 && x0 + w > t.x0 - 10)) row++;
            if (row > 1) continue;
            taken.push({ row, x0, x1: x0 + w });
            const ty = 14 + row * 16;
            ctx.strokeStyle = _r(text, 0.22);
            ctx.beginPath(); ctx.moveTo(x, ty + 3); ctx.lineTo(x, Y(b.h) - 6); ctx.stroke();
            ctx.fillStyle = n.major ? text : muted;
            ctx.textAlign = 'left';
            ctx.fillText(label, x0, ty);
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(plotX, plotY - 2, plotW, plotH + 4);
        ctx.clip();

        // ── The close: one line ──
        ctx.strokeStyle = text;
        ctx.lineWidth = 1.4;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        bars.forEach((b, i) => { if (i) ctx.lineTo(b.x, Y(b.c)); else ctx.moveTo(b.x, Y(b.c)); });
        ctx.stroke();

        // ── Entries: a triangle under the band for long, over it for short ──
        for (const pos of positions || []) {
            const b = bars.find(z => z.d === pos.entryDay);
            if (!b) continue;
            const col = pal[pos.type] || text;
            if (pos.qty > 0) _drawTriangle(ctx, b.x, Y(b.l) + 12, 4.5, 'up', col);
            else _drawTriangle(ctx, b.x, Y(b.h) - 12, 4.5, 'down', col);
        }
        ctx.restore();

        // ── Today: the last close, red if the session is down ──
        const last = bars[bars.length - 1];
        const lastBar = latestBar || (typeof history.last === 'function' ? history.last() : null);
        if (lastBar && last.d === lastBar.day) {
            const prev = _get(last.d - 1);
            const down = last.c < (prev ? prev.close : last.o);
            const y = Y(last.c);
            ctx.strokeStyle = _r(text, 0.3);
            ctx.lineWidth = 1;
            ctx.setLineDash([1, 3]);
            ctx.beginPath(); ctx.moveTo(last.x + 5, Math.round(y) + 0.5); ctx.lineTo(plotX + plotW + 4, Math.round(y) + 0.5); ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(last.x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = down ? red : text; ctx.fill();
            ctx.font = `600 12.5px ${_FONT.text}`;
            const lbl = last.c.toFixed(2), lw = ctx.measureText(lbl).width;
            ctx.fillStyle = pal.canvas;
            ctx.fillRect(plotX + plotW + 4, y - 9, lw + 8, 18);
            ctx.fillStyle = down ? red : text;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(lbl, plotX + plotW + 8, y);
        }

        // ── Calendar: month ticks, year and quarter names ──
        const vis = lastDay - firstDay + 1;
        const tick = vis > 400 ? 63 : vis > 150 ? 42 : 21;
        ctx.font = font(12);
        ctx.fillStyle = muted;
        ctx.strokeStyle = _r(text, 0.25);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const o = this.dayOrigin;
        const yAxis = plotY + plotH + 4;
        ctx.beginPath();
        for (let d = Math.ceil((firstDay - o) / tick) * tick + o; d <= lastDay + 1; d += tick) {
            const x = Math.round(X(d)) + 0.5;
            if (x < plotX + 18 || x > plotX + plotW - 18) continue;
            ctx.moveTo(x, yAxis); ctx.lineTo(x, yAxis + 4);
            const rel = d - o;
            ctx.fillText(rel < 0 ? `${rel} days` : rel % 252 === 0 ? `Year ${rel / 252 + 1}` : `day ${rel}`, x, yAxis + 7);
        }
        ctx.stroke();

        // ── Crosshair and the day's agate line ──
        const inPlot = mouseX >= plotX && mouseX <= plotX + plotW && mouseY >= plotY && mouseY <= plotY + plotH;
        if (mouseX >= 0 && inPlot && cam) {
            const hd = Math.floor(cam.screenToWorldX(mouseX));
            const hb = bars.find(z => z.d === hd);
            ctx.strokeStyle = _r(text, 0.25);
            ctx.setLineDash([2, 3]);
            const vx = Math.round(hb ? hb.x : mouseX) + 0.5, hy = Math.round(mouseY) + 0.5;
            ctx.beginPath(); ctx.moveTo(vx, plotY); ctx.lineTo(vx, plotY + plotH); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(plotX, hy); ctx.lineTo(plotX + plotW, hy); ctx.stroke();
            ctx.setLineDash([]);
            const hp = Math.exp(lLo + ((plotY + plotH - mouseY) / plotH) * lD);
            ctx.font = font(12);
            const pl = _formatPrice(hp), pw = ctx.measureText(pl).width;
            ctx.fillStyle = pal.canvas; ctx.fillRect(plotX + plotW + 4, mouseY - 9, pw + 8, 18);
            ctx.strokeStyle = _r(text, 0.3); ctx.strokeRect(plotX + plotW + 4.5, mouseY - 8.5, pw + 7, 17);
            ctx.fillStyle = text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(pl, plotX + plotW + 8, mouseY);
            if (hb) {
                const rel = hd - o;
                const n = newsByDay.get(hd);
                let line = `${rel >= 0 ? 'Edition ' + (rel + 1) : rel + ' days'} · open ${hb.o.toFixed(2)}, high ${hb.h.toFixed(2)}, low ${hb.l.toFixed(2)}, close ${hb.c.toFixed(2)}`;
                ctx.font = font(12.5, true);
                ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
                const rows = [line];
                if (n) rows.unshift(n.head.length > 96 ? n.head.slice(0, 94).replace(/\s+\S*$/, '') + '…' : n.head);
                rows.forEach((t, k) => {
                    const y = plotY + plotH - 8 - (rows.length - 1 - k) * 17;
                    const tw = Math.min(plotW - 4, ctx.measureText(t).width + 8);
                    ctx.fillStyle = pal.canvas;
                    ctx.fillRect(plotX, y - 13, tw, 17);
                    ctx.fillStyle = k === rows.length - 1 ? sec : text;
                    ctx.fillText(t, plotX + 3, y);
                });
            }
        }

        if (this._repaint !== 0) {
            this._repaint = 0;
            this._repaintDirty = true;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Choose a "nice" grid interval for `range` spread across `targetCount` ticks.
 * Rounds to the nearest value from {1, 2, 2.5, 5} * 10^n.
 *
 * @param {number} range        Total span to cover
 * @param {number} targetCount  Desired approximate number of intervals
 * @returns {number}
 */
function _niceInterval(range, targetCount) {
    if (range <= 0 || targetCount <= 0) return 1;
    const rough    = range / targetCount;
    const exponent = Math.floor(Math.log10(rough));
    const base     = Math.pow(10, exponent);
    const mantissa = rough / base;

    let nice;
    if      (mantissa <= 1.0) nice = 1;
    else if (mantissa <= 2.0) nice = 2;
    else if (mantissa <= 2.5) nice = 2.5;
    else if (mantissa <= 5.0) nice = 5;
    else                       nice = 10;

    return nice * base;
}

/** An axis price at the precision its tick step needs, without a currency sign. */
function _tickPrice(p, step) {
    return p.toFixed(step >= 1 ? 0 : step >= 0.1 ? 1 : 2);
}

/**
 * Format a price value for axis labels.
 * Shows enough decimal places to distinguish nearby tick marks.
 *
 * @param {number} price
 * @returns {string}
 */
function _formatPrice(price) {
    if (price >= 1000) return `$${price.toFixed(0)}`;
    if (price >= 100)  return `$${price.toFixed(1)}`;
    if (price >= 10)   return `$${price.toFixed(2)}`;
    return `$${price.toFixed(3)}`;
}

/**
 * Draw a filled triangle marker.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx       Center X
 * @param {number} baseY    Y of the widest edge (point of triangle is above/below)
 * @param {number} size     Half-width of the base
 * @param {'up'|'down'} dir
 * @param {string}  color
 */
function _drawTriangle(ctx, cx, baseY, size, dir, color) {
    ctx.beginPath();
    ctx.fillStyle = color;
    if (dir === 'up') {
        ctx.moveTo(cx,         baseY - size * 1.5);
        ctx.lineTo(cx - size,  baseY);
        ctx.lineTo(cx + size,  baseY);
    } else {
        ctx.moveTo(cx,         baseY + size * 1.5);
        ctx.lineTo(cx - size,  baseY);
        ctx.lineTo(cx + size,  baseY);
    }
    ctx.closePath();
    ctx.fill();
}
