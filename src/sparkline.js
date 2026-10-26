// Sparklines: a ring-buffer history and a polyline drawn on a small canvas (the
// book's value against holding HCN). Moved here from shared/ when each sim took its own
// small charts (docs/sim-overhaul/PLAN.md).

/**
 * Create a ring-buffer history for sparkline data.
 * @param {number} capacity  Maximum samples stored
 * @returns {{ data: Float32Array, head: number, count: number, cap: number }}
 */
export function createSparkHistory(capacity) {
    return { data: new Float32Array(capacity), head: 0, count: 0, cap: capacity };
}

/**
 * Push a sample into the ring buffer.
 * @param {{ data: Float32Array, head: number, count: number, cap: number }} h
 * @param {number} value
 */
export function pushSparkSample(h, value) {
    h.data[h.head] = value;
    h.head = (h.head + 1) % h.cap;
    if (h.count < h.cap) h.count++;
}

/**
 * Reset a sparkline history to empty.
 * @param {{ data: Float32Array, head: number, count: number, cap: number }} h
 */
export function resetSparkHistory(h) {
    h.head = 0;
    h.count = 0;
    h.data.fill(0);
}

/**
 * Draw a polyline sparkline onto a canvas 2D context.
 * Single-pass: finds min/max and draws in one loop.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ data: Float32Array, head: number, count: number, cap: number }} h
 * @param {number} w       Canvas width (CSS pixels)
 * @param {number} hh      Canvas height (CSS pixels)
 * @param {string} color   Stroke color (hex)
 * @param {string} dimColor  Dim color for the "now" marker (hex with alpha)
 * @param {object} [ghost] A second history on the same scale, drawn dashed in dimColor
 *                         (the book's buy-and-hold benchmark)
 */
export function drawSparkline(ctx, h, w, hh, color, dimColor, ghost) {
    ctx.clearRect(0, 0, w, hh);
    if (h.count < 2) return;

    let data = h.data;
    let count = h.count;
    let cap = h.cap;
    // Precompute base offset once — avoids modulo with negative numbers
    let base = (h.head - count + cap) % cap;
    let xScale = w / (cap - 1);
    let pad = hh * 0.1;
    let plotH = hh - 2 * pad;

    // Single pass: find min/max (over the ghost too, so both share one scale)
    let min = Infinity, max = -Infinity;
    for (const src of ghost && ghost.count >= 2 ? [h, ghost] : [h]) {
        const b = (src.head - src.count + src.cap) % src.cap;
        for (let i = 0; i < src.count; i++) {
            let v = src.data[(b + i) % src.cap];
            if (v < min) min = v;
            if (v > max) max = v;
        }
    }
    let range = max - min || 1;
    let yScale = plotH / range;

    if (ghost && ghost.count >= 2) {
        const gb = (ghost.head - ghost.count + ghost.cap) % ghost.cap;
        ctx.beginPath();
        ctx.strokeStyle = dimColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        for (let i = 0; i < ghost.count; i++) {
            const y = pad + plotH - (ghost.data[(gb + i) % ghost.cap] - min) * yScale;
            if (i === 0) ctx.moveTo(i * xScale, y); else ctx.lineTo(i * xScale, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Draw polyline
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    for (let i = 0; i < count; i++) {
        let x = i * xScale;
        let y = pad + plotH - (data[(base + i) % cap] - min) * yScale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Dashed vertical at the data frontier (visible when buffer not yet full)
    if (count < cap) {
        let nowX = (count / cap) * w;
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = dimColor;
        ctx.beginPath();
        ctx.moveTo(nowX, 0);
        ctx.lineTo(nowX, hh);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}
