/* =====================================================
   brief.js -- The Meridian Brief: masthead, editions,
   the lead item and the "In brief" column.

   Each live trading day is an edition (day 0 is Edition
   1). An extra edition marks a regime change or a crisis:
   the masthead carries "Extra" until the next edition.
   The lead is the newest item on the wire, set from the
   event log the engine already keeps; its head and body
   are the event's own text, split at its first clause
   break, never rewritten. A quiet day leads with the tape.

   DOM only; reads what main.js hands it.
   ===================================================== */

// Kickers for the wire, by event category (the dispatch uses the same labels).
export const CATEGORY_LABEL = {
    fed: 'Federal Reserve', investigation: 'Investigation', congressional: 'Congress',
    political: 'Political', midterm: 'Election', macro: 'Macro', sector: 'Sector',
    market: 'Markets', compound: 'Crisis', desk: 'Meridian Capital', margin: 'Margin call',
    gameover: 'Meridian Capital', release: 'The race', certification: 'Consensus',
    incident: 'Incident report', catastrophe: 'Incident report', theft: 'Exfiltration', strait: 'The strait',
    regime: 'The state', halcyon: 'Halcyon', china: 'Beijing', polaris: 'Polaris',
    wonder: 'The wonders', policy: 'Washington', treaty: 'Geneva', summit: 'Reykjavik',
    insider: 'The channel', ghostwritten: 'Unsigned', interjection: 'The floor',
    rates: 'Rates', dispute: 'Consensus', conversion: 'Meridian Capital', room: 'The room',
};

export function categoryLabel(cat) {
    return CATEGORY_LABEL[cat] || 'The wire';
}

const el = {};
let _edition = 0;
let _extraDay = null;
let _extras = 0;
let _leadKey = null;
let _briefSig = null;
let _reduced = false;

/** Cache the masthead and front-page column. */
export function initBrief() {
    for (const id of ['ed-no', 'ed-extra', 'dl-day', 'dl-regime', 'dl-hcn', 'dl-vx', 'dl-rate', 'dl-book',
        'lead-item', 'lead-kick', 'lead-head', 'lead-body', 'lead-src', 'briefs', 'mast-title']) {
        el[id] = document.getElementById(id);
    }
    _reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Clear the per-run edition state (reset / new regime). */
export function resetBrief() {
    _edition = 0;
    _extraDay = null;
    _extras = 0;
    _leadKey = null;
    _briefSig = null;
}

/** Today's edition number for a run-relative day (day 0 is Edition 1). */
export function editionOf(rel) { return Math.max(1, rel + 1); }

/** "Year 2, Q3" for a run-relative day (252 trading days a year, 63 a quarter). */
export function calendarOf(rel) {
    if (rel < 0) return 'Before the term';
    const y = Math.floor(rel / 252) + 1, q = Math.floor((rel % 252) / 63) + 1;
    return `Year ${y}, Q${q}`;
}

/**
 * Mark today's edition an extra: a regime change or a crisis. The flag
 * holds until the next edition is set. `rel` is the run-relative day.
 */
export function markExtra(rel) {
    if (_extraDay === rel) return;
    _extraDay = rel;
    _extras++;
    _syncEdition(rel);
}

function _syncEdition(rel) {
    const extra = _extraDay === rel;
    if (el['ed-extra']) el['ed-extra'].hidden = !extra;
    if (el['ed-no']) el['ed-no'].textContent = `Edition ${editionOf(rel)}` + (extra && _extras > 1 ? ` · extra ${_extras}` : '');
}

/**
 * Set the masthead's dateline. Called on every UI refresh; writes only on change.
 * @param {object} d  { rel, regime, S, prevClose, vx, rate, equity, initial }
 */
export function updateMasthead(d) {
    if (d.rel !== _edition) { _edition = d.rel; _syncEdition(d.rel); }
    _text('dl-day', `Day ${Math.max(0, d.rel)} · ${calendarOf(d.rel)}`);
    _text('dl-regime', d.regime);
    const ch = d.prevClose > 0 ? (d.S / d.prevClose - 1) * 100 : 0;
    _mixed('dl-hcn', `HCN ${d.S.toFixed(2)} `, (ch < 0 ? '−' : '+') + Math.abs(ch).toFixed(1) + '%', ch < -0.05 ? 'dn' : '');
    _text('dl-vx', `VXHCN ${d.vx.toFixed(1)}`);
    _text('dl-rate', `Rate ${(d.rate * 100).toFixed(2)}%`);
    const pnl = d.equity - d.initial;
    _mixed('dl-book', `Book ${d.equity < 0 ? '−' : ''}$${Math.round(Math.abs(d.equity)).toLocaleString('en-US')}k `, (pnl < 0 ? '−' : '+') + Math.abs(pnl / d.initial * 100).toFixed(1) + '%', pnl < 0 ? 'dn' : '');
}

const _last = {};
function _text(id, t) {
    if (_last[id] === t || !el[id]) return;
    _last[id] = t;
    el[id].textContent = t;
}
function _mixed(id, a, b, cls) {
    const key = a + '|' + b + '|' + cls;
    if (_last[id] === key || !el[id]) return;
    _last[id] = key;
    el[id].textContent = a;
    const s = document.createElement('span');
    if (cls) s.className = cls;
    s.textContent = b;
    el[id].appendChild(s);
}

/**
 * Split an event's text at its first clause break into a head and a body:
 * "Fed leaves rates unchanged; statement language …" → head "Fed leaves rates
 * unchanged", body "Statement language …". Text is quoted, never rewritten.
 */
export function splitHeadline(text) {
    const t = String(text || '').trim();
    const seps = ['; ', '. ', ': ', ' — ', ', '];
    for (const lim of [[16, 96], [12, 130], [12, 240]]) {
        let best = -1, sep = '';
        for (const s of seps) {
            let i = t.indexOf(s, lim[0]);
            // Skip a period inside an abbreviation or a number ("U.S. ", "2.5. "),
            // and any break that falls inside a quotation.
            const inQuote = (k) => ((t.slice(0, k).match(/["“”]/g) || []).length % 2) === 1;
            while (i > 0 && ((s === '. ' && /\b[A-Z]$|\d$|\b(Mr|Ms|Dr|St|vs)$/.test(t.slice(0, i))) || inQuote(i))) i = t.indexOf(s, i + 2);
            if (i >= lim[0] && i <= lim[1]) { best = i; sep = s; break; }
        }
        if (best > 0) {
            const head = t.slice(0, best);
            let body = t.slice(best + sep.length).trim();
            // "The Meridian Brief: “…”": the paper quoting itself leads with the quote.
            const q = /^The Meridian Brief$/.test(head) && body.match(/^["“]([^"”]{8,130})["”]\s*(.*)$/);
            if (q) return { head: `\u201c${q[1].replace(/[.,]$/, '')}\u201d`, body: q[2] };
            if (body) body = body.charAt(0).toUpperCase() + body.slice(1);
            return { head, body };
        }
    }
    return { head: t, body: '' };
}

function _swapLead(kick, head, body, src) {
    const apply = () => {
        el['lead-kick'].textContent = kick;
        el['lead-head'].textContent = head;
        el['lead-head'].classList.toggle('long', head.length > 90);
        el['lead-body'].textContent = body;
        el['lead-src'].textContent = src;
        el['lead-item'].classList.remove('fading');
    };
    if (_reduced || !el['lead-item'] || !_leadKey) { apply(); return; }
    el['lead-item'].classList.add('fading');
    setTimeout(apply, 240);
}

/**
 * Set the lead and the "In brief" column from the wire (the engine's event log,
 * oldest first). With no news yet, the lead is the tape itself.
 * @param {object[]} log   eventLog entries { day, headline, magnitude, category }
 * @param {number} origin  sim day of edition 1
 * @param {object} tape    { S, prevClose, vx, rate } for a quiet day's lead
 */
export function renderWire(log, origin, tape) {
    if (!el['lead-item']) return;
    const items = (log || []).filter(e => e && e.headline);
    const lead = items[items.length - 1];
    const key = lead ? lead.day + '|' + lead.headline : 'tape|' + (tape ? tape.rel : 0);
    if (key !== _leadKey) {
        if (lead) {
            const { head, body } = splitHeadline(lead.headline);
            _swapLead(categoryLabel(lead.category), head, body, `Edition ${editionOf(lead.day - origin)}`);
        } else if (tape) {
            const ch = tape.prevClose > 0 ? (tape.S / tape.prevClose - 1) * 100 : 0;
            const rel = Math.max(0, tape.rel || 0);
            _swapLead('The tape', `HCN ${rel ? 'closes' : 'opens'} at ${tape.S.toFixed(2)}`,
                `VXHCN ${tape.vx.toFixed(1)}; the short rate ${(tape.rate * 100).toFixed(2)}%. `
                + (Math.abs(ch) < 0.05 ? 'Flat on the session.' : `${ch > 0 ? 'Up' : 'Down'} ${Math.abs(ch).toFixed(1)}% on the session.`),
                `Edition ${editionOf(rel)}`);
        }
        _leadKey = key;
    }
    // In brief: the rest of the wire, newest first.
    const rest = items.slice(-13, -1).reverse();
    const sig = rest.map(e => e.day + e.headline.length).join(',');
    if (sig === _briefSig) return;
    _briefSig = sig;
    const ol = el.briefs;
    ol.textContent = '';
    if (!rest.length) {
        const li = document.createElement('li');
        li.className = 'b-empty';
        li.textContent = 'Nothing else on the wire yet.';
        ol.appendChild(li);
        return;
    }
    for (const e of rest) {
        const li = document.createElement('li');
        if (e.magnitude === 'major') li.className = 'major';
        const d = document.createElement('span');
        d.className = 'b-day';
        d.textContent = 'Ed. ' + editionOf(e.day - origin);
        const k = document.createElement('span');
        k.className = 'b-kick';
        k.textContent = categoryLabel(e.category) + '. ';
        const h = document.createElement('span');
        h.className = 'b-head';
        const hd = splitHeadline(e.headline).head;
        h.textContent = hd + (/[.!?”"]$/.test(hd) ? '' : '.');
        li.append(d, k, h);
        li.title = e.headline;
        ol.appendChild(li);
    }
}
