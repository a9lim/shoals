/* ===================================================
   src/almanac-view.js -- The almanac on the Meridian page
   (02a "The evening", "The almanac"): the runs, the
   cumulative score beside the reader-copier's, the
   reliability of the player's stated quarter probabilities,
   and the families seen beside the neutral-input baseline.

   Reads only the stored records (src/almanac.js); draws
   nothing while the Meridian page is hidden.
   =================================================== */

import { readAlmanac, summarizeAlmanac } from './almanac.js';
import { FAMILY_NAMES } from './endings.js';
import { HAND_NAMES } from './opening.js';
import { fmtSigned } from './format-helpers.js';

const el = {};
let _w = 0, _h = 0, _dpr = 0;

export function initAlmanacView() {
    for (const id of ['almanac-section', 'almanac-sum', 'almanac-runs', 'almanac-rel', 'almanac-families', 'cap-almanac']) {
        el[id] = document.getElementById(id);
    }
}

const _nats = (v) => `${fmtSigned(v, 2)} nats`;
const _pct = (v) => `${Math.round(v * 100)}%`;

/** Quarters in a scored record with at least one carried rung. */
const _stated = (rec) => rec ? rec.quarters.filter(q => q.rungs.some(r => r.cls === 'carried')).length : 0;

function _rows(container, entries) {
    container.textContent = '';
    for (const [label, value] of entries) {
        const row = document.createElement('div');
        row.className = 'stat-row';
        const l = document.createElement('span');
        l.className = 'stat-label';
        l.textContent = label;
        const v = document.createElement('span');
        v.className = 'stat-value';
        v.textContent = value;
        row.append(l, v);
        container.appendChild(row);
    }
}

function _cell(tr, text, cls) {
    const td = document.createElement('td');
    if (cls) td.className = cls;
    td.textContent = text;
    tr.appendChild(td);
}

const _signCls = (v) => v > 0.005 ? 'pnl-up' : v < -0.005 ? 'pnl-down' : '';

/** Render the almanac. Cheap; called when the Meridian page opens, on a theme
 *  change and after a run's record is appended. */
export function renderAlmanac() {
    if (!el['almanac-sum']) return;
    const records = readAlmanac();
    const sum = summarizeAlmanac(records);
    const dash = '—';
    _rows(el['almanac-sum'], [
        ['Runs', sum.runs ? String(sum.runs) : dash],
        ['Yours, across runs', sum.runs ? _nats(sum.S.player) : dash],
        ['The reader’s', sum.runs ? _nats(sum.S.copier) : dash],
    ]);

    // The most recent runs, newest first.
    const tb = el['almanac-runs'] && el['almanac-runs'].tBodies[0];
    if (tb) {
        tb.textContent = '';
        const recent = records.map((r, i) => [i + 1, r]).slice(-8).reverse();
        if (!recent.length) {
            const tr = document.createElement('tr');
            tr.className = 'muted';
            _cell(tr, dash, 'l');
            for (let k = 0; k < 5; k++) _cell(tr, '', k < 2 ? 'l' : '');
            tb.appendChild(tr);
        }
        for (const [n, r] of recent) {
            const tr = document.createElement('tr');
            _cell(tr, String(n), 'l');
            _cell(tr, HAND_NAMES[r.fixture] || dash, 'l');
            _cell(tr, FAMILY_NAMES[r.family] || dash, 'l');
            _cell(tr, String(_stated(r.player)));
            const ps = r.player ? r.player.S : 0, cs = r.copier ? r.copier.S : 0;
            _cell(tr, fmtSigned(ps, 2), _signCls(ps));
            _cell(tr, fmtSigned(cs, 2), _signCls(cs));
            tb.appendChild(tr);
        }
    }

    // Families seen, beside the neutral-input baseline.
    const fb = el['almanac-families'] && el['almanac-families'].tBodies[0];
    if (fb) {
        fb.textContent = '';
        for (const f of sum.families) {
            const tr = document.createElement('tr');
            _cell(tr, FAMILY_NAMES[f.family], 'l');
            _cell(tr, f.n ? `${f.n} · ${_pct(f.share)}` : dash);
            _cell(tr, _pct(f.baseline));
            fb.appendChild(tr);
        }
    }

    const stated = sum.reliability.reduce((a, b) => a + b.n, 0);
    if (el['cap-almanac']) {
        el['cap-almanac'].textContent = stated
            ? `Reliability: ${stated} stated rung-quarter${stated === 1 ? '' : 's'} over ${sum.runs} run${sum.runs === 1 ? '' : 's'}`
            : 'Reliability';
    }
    _drawReliability(sum.reliability);
}

function _size(cv) {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return false;
    if (w !== _w || h !== _h || dpr !== _dpr) {
        _w = w; _h = h; _dpr = dpr;
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
    }
    cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
}

/** Each decile's mean stated probability against how often the rung certified
 *  that quarter, a ring sized by its count; the diagonal is calibration. */
function _drawReliability(rows) {
    const cv = el['almanac-rel'];
    if (!cv || !_size(cv)) return;
    const c = cv.getContext('2d'), W = _w, H = _h;
    const pal = _themePalette(), text = pal.text, muted = pal.textMuted;
    const font = (px, it) => `${it ? 'italic ' : ''}${px}px ${_FONT.text}`;
    c.clearRect(0, 0, W, H);
    const L = 34, R = W - 10, T = 10, B = H - 30;
    const X = (p) => L + (R - L) * p, Y = (p) => B - (B - T) * p;

    // Frame, ticks and the diagonal.
    c.strokeStyle = muted; c.lineWidth = 1;
    c.beginPath(); c.moveTo(L + 0.5, T); c.lineTo(L + 0.5, B + 0.5); c.lineTo(R, B + 0.5); c.stroke();
    c.font = font(10.5); c.fillStyle = muted;
    for (const p of [0, 0.5, 1]) {
        c.textAlign = 'center'; c.textBaseline = 'top';
        c.fillText(p.toFixed(1), X(p), B + 5);
        c.textAlign = 'right'; c.textBaseline = 'middle';
        c.fillText(p.toFixed(1), L - 5, Y(p));
    }
    c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(1), Y(1)); c.stroke();
    c.setLineDash([]);
    c.font = font(11, true); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillText('your probability', (L + R) / 2, H - 4);
    c.save(); c.translate(11, (T + B) / 2); c.rotate(-Math.PI / 2);
    c.fillText('certified', 0, 0); c.restore();

    const max = Math.max(1, ...rows.map(r => r.n));
    c.strokeStyle = text; c.lineWidth = 1.4;
    for (const r of rows) {
        if (!r.n) continue;
        const rad = 2.5 + 5.5 * Math.sqrt(r.n / max);
        c.beginPath(); c.arc(X(r.meanP), Y(r.freq), rad, 0, Math.PI * 2); c.stroke();
    }
}
