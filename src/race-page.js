/* =====================================================
   race-page.js -- The race page, after Epoch's
   Capabilities Index: one capability scale, every public
   release placed on it by date.

   The scale is the rung ladder R1-R5. A release sits in
   its lab's lane inside the band of the rung it claims
   (circle Halcyon, square Tianxia, triangle Polaris); a
   claim is a hollow diamond on the rung, its
   certification a filled one, joined by the adjudication
   lag. The released frontier steps along the rungs. On
   every rung still ahead, Consensus's implied crossing
   date is drawn as a distribution (belief B, survival-
   conditioned on today). The self-graded Fixedpoint Index
   sits apart, unlisted.

   THE INTEGRITY RULE (09 "Information hygiene", as in
   race/consensus.js): during play this page reads only
   public records -- release dates and claimed rungs,
   certifications, belief B, the listed contracts. The
   continuous tracks (C_internal, C_released) are recorded
   each day into `_hid` and drawn only once the run has
   ended and the epilogue reveals them.
   ===================================================== */

import { belief } from './race/belief.js';
import { consensus } from './race/consensus.js';
import { HORIZON } from './race/resolution.js';

export const RUNG_NAME = { 1: 'Reliable agent', 2: 'Autonomous engineer', 3: 'Autonomous researcher', 4: 'Recursion', 5: 'Takeoff threshold' };
const LABS = [
    { id: 'halcyon', name: 'Halcyon', model: 'Aleph', ink: 'ochre', shape: 'circle', lane: 0.64 },
    { id: 'polaris', name: 'Polaris', model: 'Holt', ink: 'verdigris', shape: 'triangle', lane: 0.44 },
    { id: 'tianxia', name: 'Tianxia', model: 'Cangjie', ink: 'mulberry', shape: 'square', lane: 0.26 },
];
const LAB = Object.fromEntries(LABS.map(l => [l.id, l]));

// Public record (drawn during play) and hidden record (drawn after the end).
let _pub = null, _hid = null;
const _st = { ctx: null, visible: false, revealed: false, ended: false, reveal0: -1e9, raf: 0, w: 0, h: 0, dpr: 1, cap: null, canvas: null, c: null, reduced: false };

function _fresh() {
    _pub = { releases: [], claims: [], certs: [], open: [], fixedpoint: null, lastDay: 0 };
    _hid = { days: [], tracks: { halcyon: [], tianxia: [], polaris: [], open: [] } };
}

/** @param {object} ctx { race(), world() } */
export function initRacePage(ctx) {
    _st.ctx = ctx;
    _st.canvas = document.getElementById('race-canvas');
    _st.c = _st.canvas.getContext('2d');
    _st.cap = _colophon.caption(document.getElementById('cap-race'), 300);
    _st.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    _fresh();
    new ResizeObserver(() => { if (_size()) drawRace(); }).observe(_st.canvas.parentElement);
    const btn = document.getElementById('race-reveal');
    btn.addEventListener('click', () => revealRace(!_st.revealed));
    _key();
}

/** Clear the record (reset / new run). Seeds day 0's starting claims. */
export function resetRacePage() {
    _fresh();
    _st.revealed = false;
    _st.ended = false;
    const btn = document.getElementById('race-reveal');
    if (btn) { btn.hidden = true; btn.setAttribute('aria-pressed', 'false'); btn.textContent = 'Show the hidden tracks'; }
    const back = document.getElementById('race-epilogue');
    if (back) back.hidden = true;
    const race = _st.ctx && _st.ctx.race();
    if (race) _seed(race);
    _table();
}

function _topRung(map) {
    let top = 0;
    for (const r of [1, 2, 3, 4, 5]) if (map[r] != null) top = r;
    return top;
}

function _seed(race) {
    const cap = race.capability;
    for (const L of LABS) {
        const lab = cap.labs[L.id];
        if (!lab.active) continue;
        _pub.releases.push({ day: 0, lab: L.id, rung: _topRung(lab.rungReleased), seed: true });
    }
    _pub.open.push([0, _topRung(cap.open.rungInternal)]);
    _sampleHidden(race);
}

function _sampleHidden(race) {
    const cap = race.capability;
    _hid.days.push(race.day);
    for (const L of LABS) {
        const lab = cap.labs[L.id];
        _hid.tracks[L.id].push(lab.active ? [lab.C_internal, lab.C_released] : null);
    }
    _hid.tracks.open.push([cap.open.C, cap.open.C]);
}

/**
 * Record one completed race day from its ledger (main.js, after advanceRace).
 * Public fields go to `_pub`; the continuous tracks go to `_hid`.
 */
export function recordRaceDay(race, world) {
    if (!race || !_pub) return;
    if (race.day > HORIZON) return;
    const tr = race.lastTransitions, cap = race.capability, day = race.day;
    if (!_pub.releases.length) _seed(race);
    for (const id of tr.spawned || []) {
        const lab = cap.labs[id];
        if (lab && LAB[id]) _pub.releases.push({ day, lab: id, rung: _topRung(lab.rungReleased), spawn: true, C: lab.C_released });
    }
    for (const rel of tr.releases || []) {
        if (!LAB[rel.labId]) continue;
        _pub.releases.push({ day, lab: rel.labId, rung: _topRung(cap.labs[rel.labId].rungReleased), C: rel.C_released });
        for (const r of rel.openCrossings || []) _pub.open.push([day, r]);
    }
    for (const x of tr.crossings || []) {
        if (x.track === 'released' && LAB[x.lab] && x.rung >= 2) _pub.claims.push({ day, lab: x.lab, rung: x.rung });
    }
    for (const c of tr.certifications || []) _pub.certs.push({ day, lab: c.lab, rung: c.rung });
    if (world && world.ai && world.ai.fixedpointIndex && !_pub.fixedpoint) _pub.fixedpoint = { day };
    _pub.lastDay = day;
    _sampleHidden(race);
    if (_st.visible) { drawRace(); _table(); }
}

/** The run has ended: offer the hidden tracks (the epilogue's reveal). */
export function endRacePage() {
    _st.ended = true;
    const btn = document.getElementById('race-reveal');
    if (btn) btn.hidden = false;
}

export function revealRace(on) {
    if (!_st.ended) return;
    _st.revealed = on;
    _st.reveal0 = _st.reduced ? -1e9 : performance.now();
    const btn = document.getElementById('race-reveal');
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? 'Hide the hidden tracks' : 'Show the hidden tracks';
    _animate();
}

export function setRaceVisible(on) {
    _st.visible = on;
    if (on) { _size(); drawRace(); _table(); }
}

function _animate() {
    if (_st.raf) return;
    const tick = () => {
        _st.raf = 0;
        drawRace();
        if (performance.now() - _st.reveal0 < 1200) _st.raf = requestAnimationFrame(tick);
    };
    _st.raf = requestAnimationFrame(tick);
}

function _size() {
    const r = _st.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return false;
    if (w === _st.w && h === _st.h && dpr === _st.dpr) return true;
    _st.w = w; _st.h = h; _st.dpr = dpr;
    _st.canvas.width = Math.round(w * dpr);
    _st.canvas.height = Math.round(h * dpr);
    _st.c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const sig = (x) => 1 / (1 + Math.exp(-x));

/** Height for a place in the band of rung `r`. A track that has not reached R1
 *  (a Tianxia far behind) sits in a narrow strip just under the R1 rule. */
const _bandV = (r, frac) => (r >= 1 ? r + frac : 0.66 + 0.3 * frac);

/** Conditional crossing law of rung R from belief B, given no crossing by `t0`. */
function _law(R, t0) {
    const r = belief.rungs[R];
    if (!r || r.crossed) return null;
    const F0 = sig((t0 - r.m) / r.w);
    const tgt = F0 + (1 - F0) / 2;
    return {
        dens: (d) => { const s = sig((d - r.m) / r.w); return s * (1 - s) / r.w / (1 - F0); },
        median: r.m + r.w * Math.log(tgt / (1 - tgt)),
    };
}

function _shape(c, shape, x, y, r, fill, stroke) {
    c.beginPath();
    if (shape === 'square') c.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
    else if (shape === 'triangle') { c.moveTo(x, y - r * 1.1); c.lineTo(x + r, y + r * 0.75); c.lineTo(x - r, y + r * 0.75); c.closePath(); }
    else if (shape === 'diamond') { c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); }
    else c.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.stroke(); }
}

/** Day `lab` first reached rung `R` in house (epilogue only). Reads the race's
 *  own crossing record, which also covers a run resolved by extrapolation. */
function _hiddenCross(lab, R) {
    const race = _st.ctx.race();
    const L = race && race.capability.labs[lab];
    return L && L.rungInternal[R] != null ? L.rungInternal[R] : null;
}

export function drawRace() {
    if (!_st.visible || !_st.canvas || !_pub) return;
    if (!_size()) return;
    const c = _st.c, W = _st.w, H = _st.h, race = _st.ctx.race();
    const pal = _themePalette(), ink = pal.inks, text = pal.text, muted = pal.textMuted;
    const font = (px, it, wt) => `${it ? 'italic ' : ''}${wt ? wt + ' ' : ''}${px}px ${_FONT.text}`;
    c.clearRect(0, 0, W, H);
    if (!race) {
        c.font = font(14, true); c.fillStyle = muted; c.textAlign = 'center';
        c.fillText('The race runs in the Dynamic regimes. Choose one on the Desk page.', W / 2, H / 2);
        _st.cap('No race in a Classic regime.');
        return;
    }
    const narrow = W < 560;
    // Once the run has ended, "today" is the desk's last day; an extrapolated
    // resolution runs on past it, and only the epilogue sees that far.
    const today = _st.ended ? _pub.lastDay : Math.min(race.day, HORIZON);
    const L0 = narrow ? 6 : 10, R0 = W - (narrow ? 62 : 128), T0 = 34;
    const stripH = narrow ? 40 : 46, B0 = H - 30 - stripH - 14;
    const X = (d) => L0 + (R0 - L0) * d / HORIZON;
    const Y = (v) => B0 - (B0 - T0) * (v - 0.62) / (5.7 - 0.62);
    const now = X(today);
    const k = _st.revealed ? Math.min(1, (performance.now() - _st.reveal0) / 1100) : 0;

    // The priced future.
    c.fillStyle = _r(text, document.documentElement.dataset.theme === 'dark' ? 0.035 : 0.025);
    c.fillRect(now, T0 - 14, R0 - now, B0 - T0 + 14);
    c.font = font(12.5, true); c.fillStyle = muted; c.textAlign = 'right'; c.textBaseline = 'alphabetic';
    if (R0 - now > (narrow ? 150 : 260)) c.fillText(narrow ? 'priced' : 'the future, priced by Consensus', R0, T0 - 18);

    // Years.
    c.strokeStyle = _r(text, 0.07); c.lineWidth = 1; c.beginPath();
    for (let y = 1; y < 4; y++) { const x = Math.round(X(y * 252)) + 0.5; c.moveTo(x, T0 - 14); c.lineTo(x, H - 30); }
    c.stroke();
    c.font = font(12.5); c.fillStyle = muted; c.textAlign = 'center';
    for (let y = 0; y < 4; y++) c.fillText(`year ${y + 1}`, X(y * 252 + 126), H - 10);

    // Rungs.
    for (let R = 1; R <= 5; R++) {
        const y = Math.round(Y(R)) + 0.5;
        c.strokeStyle = _r(text, R === 5 ? 0.42 : 0.2); c.lineWidth = 1;
        c.beginPath(); c.moveTo(L0, y); c.lineTo(R0, y); c.stroke();
    }
    const rungLabels = () => {
        c.font = font(12.5, true); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
        for (let R = 1; R <= 5; R++) {
            const t = narrow ? `R${R}` : `R${R} · ${RUNG_NAME[R]}`, y = Math.round(Y(R)) + 0.5;
            c.fillStyle = pal.canvas;
            c.fillRect(L0, y - 17, c.measureText(t).width + 6, 15);
            c.fillStyle = muted;
            c.fillText(t, L0 + 2, y - 5);
        }
    };

    // Open weights: a hatched strip on the rung the open ecosystem has reached.
    const open = _pub.open;
    if (open.length) {
        c.save();
        c.beginPath();
        for (let i = 0; i < open.length; i++) {
            const d0 = open[i][0], d1 = i + 1 < open.length ? open[i + 1][0] : today, r = open[i][1];
            if (d1 > d0) c.rect(X(d0), Y(_bandV(r, 0.13)), X(d1) - X(d0), Y(_bandV(r, 0.03)) - Y(_bandV(r, 0.13)));
        }
        c.clip();
        c.strokeStyle = _r(ink.umber, 0.7); c.lineWidth = 1; c.beginPath();
        for (let x = L0 - 40; x < now + 40; x += 5) { c.moveTo(x, B0); c.lineTo(x + (B0 - T0), T0); }
        c.stroke();
        c.restore();
        if (!narrow && now - L0 > 140) {
            const r = open[open.length - 1][1];
            c.font = font(12, true); c.fillStyle = ink.umber; c.textAlign = 'right';
            c.fillText('open weights', now - 6, Y(_bandV(r, 0.03)) + 12);
        }
    }

    rungLabels();

    // Consensus: the implied crossing date on every rung still ahead.
    const ind = ink.indigo;
    const deadlines = {};
    for (const ct of consensus.contracts) deadlines[ct.predicate.rung] = ct;
    if (belief.active && !_st.revealed) {
        for (const R of [2, 3, 4, 5]) {
            const law = _law(R, today);
            if (!law) continue;
            const y = Y(R), amp = narrow ? 10 : 15;
            let mx = 0;
            for (let d = today; d <= HORIZON; d += 4) mx = Math.max(mx, law.dens(d));
            if (mx <= 0) continue;
            c.beginPath();
            for (let d = today; d <= HORIZON; d += 3) c.lineTo(X(d), y - amp * law.dens(d) / mx);
            for (let d = HORIZON; d >= today; d -= 3) c.lineTo(X(d), y + amp * law.dens(d) / mx);
            c.closePath();
            c.fillStyle = _r(ind, document.documentElement.dataset.theme === 'dark' ? 0.26 : 0.17); c.fill();
            c.strokeStyle = _r(ind, 0.6); c.lineWidth = 0.8; c.stroke();
            if (law.median >= today && law.median <= HORIZON) {
                const mx2 = Math.round(X(law.median)) + 0.5;
                c.strokeStyle = ind; c.lineWidth = 1.2;
                c.beginPath(); c.moveTo(mx2, y - amp - 3); c.lineTo(mx2, y + amp + 3); c.stroke();
                if (!narrow) { c.font = font(12, true); c.fillStyle = ind; c.textAlign = 'center'; c.fillText(`median day ${Math.round(law.median)}`, mx2, y - amp - 6); }
            }
            const ct = deadlines[R], q = ct && consensus.quotes[ct.key];
            if (ct && q) {
                c.font = font(12, true); c.fillStyle = ind; c.textAlign = 'left';
                const p = Math.round(q.mid * 100);
                c.fillText(narrow ? `${p}%` : `${p}% by day ${ct.deadline}`, R0 + 6, y + 4);
            }
        }
    }

    // The hidden tracks (epilogue): what each lab had in house, drawn left to right.
    if (_st.revealed && _hid.days.length > 1) {
        const upto = _hid.days[0] + (_hid.days[_hid.days.length - 1] - _hid.days[0]) * (k < 1 ? k : 1);
        for (const L of LABS) {
            const tr = _hid.tracks[L.id];
            for (const which of [0, 1]) {
                c.strokeStyle = which ? _r(ink[L.ink], 0.6) : ink[L.ink];
                c.lineWidth = which ? 1 : 1.5;
                c.setLineDash(which ? [4, 3] : []);
                c.beginPath();
                let on = false;
                for (let i = 0; i < tr.length; i++) {
                    const d = _hid.days[i];
                    if (!tr[i] || d > upto) { on = false; continue; }
                    const yy = Y(Math.max(0.62, Math.min(5.65, tr[i][which])));
                    if (on) c.lineTo(X(d), yy); else c.moveTo(X(d), yy);
                    on = true;
                }
                c.stroke();
            }
        }
        c.setLineDash([]);
        c.strokeStyle = _r(ink.umber, 0.8); c.lineWidth = 1; c.beginPath();
        _hid.tracks.open.forEach((v, i) => { const d = _hid.days[i]; if (d > upto) return; const yy = Y(Math.max(0.62, v[0])); if (i) c.lineTo(X(d), yy); else c.moveTo(X(d), yy); });
        c.stroke();
        // Every internal crossing, including days the run was extrapolated past
        // the desk: a tick on the rung in the lab's ink.
        if (k >= 1) {
            c.font = font(11.5, true); c.textAlign = 'center';
            for (const L of LABS) for (const R of [2, 3, 4, 5]) {
                const d = _hiddenCross(L.id, R);
                if (d == null || d > HORIZON) continue;
                const x = Math.round(X(d)) + 0.5;
                c.strokeStyle = ink[L.ink]; c.lineWidth = 2;
                c.beginPath(); c.moveTo(x, Y(R) - 7); c.lineTo(x, Y(R) + 7); c.stroke();
                if (L.id === 'halcyon' && !narrow) { c.fillStyle = ink[L.ink]; c.fillText(`in house, day ${d}`, x, Y(R) + 19); }
            }
        }
    }

    // The released frontier: the highest rung claimed, stepping along the rungs.
    const rel = _pub.releases.slice().sort((a, b) => a.day - b.day);
    c.strokeStyle = text; c.lineWidth = 1.6; c.beginPath();
    let best = 0;
    for (const r of rel) {
        if (r.rung > best) {
            if (best === 0) c.moveTo(X(r.day), Y(r.rung)); else { c.lineTo(X(r.day), Y(best)); c.lineTo(X(r.day), Y(r.rung)); }
            best = r.rung;
        }
    }
    if (best) c.lineTo(now, Y(best));
    c.stroke();

    // Claims (hollow) and certifications (filled), joined by the adjudication lag.
    for (const cert of _pub.certs) {
        const claim = _pub.claims.find(cl => cl.rung === cert.rung && cl.lab === cert.lab) || _pub.claims.find(cl => cl.rung === cert.rung);
        if (claim && claim.day < cert.day) {
            c.strokeStyle = _r(ink[LAB[cert.lab] ? LAB[cert.lab].ink : 'ochre'], 0.45); c.lineWidth = 3;
            c.beginPath(); c.moveTo(X(claim.day), Y(cert.rung)); c.lineTo(X(cert.day), Y(cert.rung)); c.stroke();
        }
    }
    c.lineWidth = 1.4;
    for (const cl of _pub.claims) _shape(c, 'diamond', X(cl.day), Y(cl.rung), 5.5, pal.canvas, ink[LAB[cl.lab].ink]);
    c.lineWidth = 1.5;
    for (const ce of _pub.certs) {
        const col = LAB[ce.lab] ? ink[LAB[ce.lab].ink] : text;
        _shape(c, 'diamond', X(ce.day), Y(ce.rung), 6.2, col, pal.canvas);
        if (!narrow) { c.font = font(12, true); c.fillStyle = pal.textSecondary; c.textAlign = 'right'; c.fillText(`certified day ${ce.day}`, X(ce.day) - 9, Y(ce.rung) - 8); }
    }

    // Releases, in their labs' lanes; in the epilogue they slide to their true value.
    c.lineWidth = 1.4;
    for (const r of rel) {
        const L = LAB[r.lab];
        let v = _bandV(r.rung, L.lane);
        if (_st.revealed && r.C != null) v = v + (Math.max(0.62, r.C) - v) * (k < 1 ? k * k * (3 - 2 * k) : 1);
        _shape(c, L.shape, X(r.day), Y(v), r.seed ? 3.4 : 4.3, ink[L.ink], pal.canvas);
    }

    // Lab names beside today.
    c.font = font(13); c.textAlign = 'left'; c.textBaseline = 'middle';
    const last = LABS.map(L => { const rs = rel.filter(r => r.lab === L.id); return rs.length ? [L, Y(_bandV(rs[rs.length - 1].rung, L.lane))] : null; }).filter(Boolean).sort((a, b) => a[1] - b[1]);
    for (let i = 1; i < last.length; i++) if (last[i][1] - last[i - 1][1] < 15) last[i][1] = last[i - 1][1] + 15;
    for (const [L, y] of last) { c.fillStyle = ink[L.ink]; c.fillText(L.name, Math.min(now + 8, R0 - 52), y); }
    c.textBaseline = 'alphabetic';

    // Today.
    c.strokeStyle = _r(text, 0.5); c.lineWidth = 1;
    c.beginPath(); c.moveTo(Math.round(now) + 0.5, T0 - 14); c.lineTo(Math.round(now) + 0.5, B0 + 4); c.stroke();
    c.font = font(12.5, true); c.fillStyle = muted; c.textAlign = now > W * 0.5 ? 'right' : 'left';
    c.fillText(`today, day ${today}`, now + (now > W * 0.5 ? -6 : 6), T0 - 18);

    // The Fixedpoint Index, apart: self-graded, unlisted.
    const sT = H - 30 - stripH, sB = H - 30;
    c.strokeStyle = _r(text, 0.2); c.beginPath(); c.moveTo(L0, Math.round(sT) + 0.5); c.lineTo(R0, Math.round(sT) + 0.5); c.stroke();
    c.font = font(12.5, true); c.fillStyle = muted; c.textAlign = 'left';
    c.fillText(narrow ? 'Fixedpoint Index · unlisted' : 'Fixedpoint Index · Halcyon’s tasks, graded by Halcyon · unlisted: Consensus will not list it', L0 + 2, sT + 15);
    const fp = _pub.fixedpoint;
    if (_st.revealed && _hid.tracks.halcyon.length > 1) {
        const tr = _hid.tracks.halcyon, FY = (v) => sB - 4 - (sB - sT - 22) * Math.max(0, Math.min(1, (v - 1) / 4.5));
        c.strokeStyle = ink.ochre; c.lineWidth = 1.2; c.setLineDash([4, 3]); c.beginPath();
        tr.forEach((v, i) => { if (!v) return; const x = X(_hid.days[i]); if (i) c.lineTo(x, FY(v[0])); else c.moveTo(x, FY(v[0])); });
        c.stroke(); c.setLineDash([]);
    } else if (fp) {
        c.lineWidth = 1.3;
        _shape(c, 'circle', X(fp.day), sB - 10, 4, pal.canvas, ink.ochre);
        c.font = font(12, true); c.fillStyle = pal.textSecondary; c.textAlign = X(fp.day) > W * 0.6 ? 'right' : 'left';
        c.fillText(`published day ${fp.day}: “up sixteen points”`, X(fp.day) + (X(fp.day) > W * 0.6 ? -9 : 9), sB - 6);
    } else {
        c.font = font(12, true); c.fillStyle = muted; c.textAlign = 'left';
        c.fillText('Not published.', L0 + 2, sB - 6);
    }

    _caption(today, best);
}

function _caption(today, frontier) {
    if (_st.revealed) {
        const bits = [];
        for (const R of [3, 4, 5]) {
            const d = _hiddenCross('halcyon', R);
            const claim = _pub.claims.find(cl => cl.rung === R);
            if (d != null) bits.push(`R${R} in house on day ${d}` + (claim ? `, claimed on day ${claim.day}` : d > _pub.lastDay ? ', after the desk closed' : ', never claimed'));
        }
        _st.cap('The hidden tracks: solid is what each lab had in house, dashed what it shipped, and each release slides to its true value. Halcyon reached '
            + (bits.length ? bits.join('; ') : 'no rung past R2 in house') + '.');
        return;
    }
    const next = [2, 3, 4, 5].find(R => belief.rungs[R] && !belief.rungs[R].crossed);
    let tail = '';
    if (next) {
        const law = _law(next, today);
        tail = law ? ` Consensus’s median for R${next} is day ${Math.round(law.median)}.` : '';
    }
    _st.cap(`Day ${today}. The released frontier claims R${frontier || 1}.${tail} Hollow diamonds are claims nobody has adjudicated; the thick rule to a filled one is the certification lag.`);
}

// ---------------------------------------------------------------------------
// The side column: the ladder table, the release log, the key
// ---------------------------------------------------------------------------

function _table() {
    const tb = document.getElementById('race-tbody'), log = document.getElementById('race-log');
    if (!tb || !_pub) return;
    const race = _st.ctx.race();
    tb.textContent = '';
    for (const R of [2, 3, 4, 5]) {
        const tr = document.createElement('tr');
        const claim = _pub.claims.find(cl => cl.rung === R), cert = _pub.certs.find(ce => ce.rung === R);
        const law = race && belief.active ? _law(R, _st.ended ? _pub.lastDay : Math.min(race.day, HORIZON)) : null;
        const cells = [`R${R}`, claim ? `${claim.day}, ${LAB[claim.lab].name}` : '—', cert ? String(cert.day) : '—', law ? String(Math.round(law.median)) : cert ? 'certified' : '—'];
        cells.forEach((t, i) => { const td = document.createElement('td'); td.textContent = t; if (!i) td.className = 'l'; tr.appendChild(td); });
        tb.appendChild(tr);
    }
    log.textContent = '';
    const rel = _pub.releases.filter(r => !r.seed).slice(-10).reverse();
    if (!rel.length) {
        const li = document.createElement('li');
        li.className = 'b-empty';
        li.textContent = race ? 'No release yet this term.' : 'The race runs in the Dynamic regimes.';
        log.appendChild(li);
    }
    for (const r of rel) {
        const L = LAB[r.lab];
        const li = document.createElement('li');
        const d = document.createElement('span'); d.className = 'b-day'; d.textContent = `Day ${r.day}`;
        li.append(d, `${L.name}${r.spawn ? ' spins out with ' : ' ships '}${L.model}, claiming R${r.rung}`);
        log.appendChild(li);
    }
}

function _key() {
    const el = document.getElementById('race-key');
    if (!el) return;
    const items = [
        ['circle', 'var(--ink-ochre)', 'Halcyon'], ['square', 'var(--ink-mulberry)', 'Tianxia'], ['triangle', 'var(--ink-verdigris)', 'Polaris'],
        ['hatch', 'var(--ink-umber)', 'open weights'], ['claim', 'var(--text)', 'claim'], ['cert', 'var(--text)', 'certified'],
        ['ridge', 'var(--ink-indigo)', 'Consensus'],
    ];
    const svg = (s, col) => {
        const sh = {
            circle: `<circle cx="7" cy="7" r="4.3" fill="${col}"/>`,
            square: `<rect x="3.2" y="3.2" width="7.6" height="7.6" fill="${col}"/>`,
            triangle: `<path d="M7 2.4 11.4 10.6H2.6Z" fill="${col}"/>`,
            hatch: `<path d="M1 11 5 3M5 11 9 3M9 11 13 3" stroke="${col}" stroke-width="1"/>`,
            claim: `<path d="M7 1.8 12.2 7 7 12.2 1.8 7Z" fill="none" stroke="${col}" stroke-width="1.3"/>`,
            cert: `<path d="M7 1.8 12.2 7 7 12.2 1.8 7Z" fill="${col}"/>`,
            ridge: `<path d="M1 7C4 7 5 3 7 3S10 7 13 7C10 7 9 11 7 11S4 7 1 7Z" fill="${col}" fill-opacity=".3" stroke="${col}" stroke-width=".8"/>`,
        }[s];
        return `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">${sh}</svg>`;
    };
    el.innerHTML = items.map(([s, col, t]) => `<span class="rk">${svg(s, col)}${t}</span>`).join('');
}
