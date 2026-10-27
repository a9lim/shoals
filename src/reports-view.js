/* ===================================================
   src/reports-view.js -- The chain's reports on the Race
   page (02a "Demonstrations", "The chain's reports").

   One row per demonstration, newest first: its lab and
   rung, the day it was published, and what has happened
   to it since (disputed, upheld, narrowed, withdrawn),
   read from the public record by `chainReports`. A row
   whose latest report came after the latest snapshot is
   marked new since the last forecast. The wire's items
   never change; status lives here.
   =================================================== */

import { chainReports } from './race/public-record.js';

const LAB_NAME = { halcyon: 'Halcyon', polaris: 'Polaris' };
const WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = n => WORD[n] ?? String(n);

/** Fold the record's reports into one entry per demonstration. */
function demonstrations(rec, asOf) {
    const byId = new Map(), out = [];
    for (const rep of chainReports(rec, asOf)) {
        if (rep.kind === 'demonstration') {
            const d = { rep, events: [], latest: rep.day };
            byId.set(rep.id, d); out.push(d);
            continue;
        }
        const ids = rep.kind === 'withdrawal' ? [rep.on, ...rep.took] : [rep.on];
        for (const id of ids) {
            const d = byId.get(id);
            if (!d) continue;
            d.events.push(rep);
            d.latest = Math.max(d.latest, rep.day);
        }
    }
    return { out, byId };
}

/** What happened to a demonstration, latest first: the status line and the trail under it. */
function describe(d, byId) {
    const r = d.rep, parts = [];
    for (const e of d.events) {
        if (e.kind === 'dispute') parts.push(`disputed day ${e.day}`);
        else if (e.kind === 'evaluation') parts.push(e.outcome === 'narrowed' ? `narrowed day ${e.day}: short of R${r.rung}` : `upheld day ${e.day}`);
        else if (e.on === r.id) parts.push(`withdrawn day ${e.day}` + (e.took.length ? `, with ${word(e.took.length)} that cited it` : ''));
        else parts.push(`withdrawn day ${e.day} with day ${byId.get(e.on)?.rep.day ?? '—'}'s`);
    }
    const status = parts.length ? parts.pop() : 'standing';
    const cites = r.cites && byId.get(r.cites) ? `cites day ${byId.get(r.cites).rep.day}` : null;
    const trail = [...parts.reverse(), cites].filter(Boolean);
    return { status, trail };
}

/**
 * Render the list into `#race-reports`. `rec` is the live public record
 * (belief.record), `asOf` the day the page reads to, `lockDay` the latest
 * snapshot's day (null before the first).
 */
export function renderReports(rec, asOf, lockDay) {
    const list = document.getElementById('race-reports');
    if (!list) return;
    list.textContent = '';
    const { out, byId } = rec && rec.demonstrations ? demonstrations(rec, asOf) : { out: [], byId: new Map() };
    if (!out.length) {
        const li = document.createElement('li');
        li.className = 'b-empty';
        li.textContent = '—';
        list.appendChild(li);
        return;
    }
    for (const d of out.reverse().slice(0, 12)) {
        const r = d.rep, { status, trail } = describe(d, byId);
        const li = document.createElement('li');
        li.className = 'rep';
        li.dataset.status = r.status;
        if (lockDay != null && d.latest > lockDay) {
            li.classList.add('rep-new');
            li.title = 'New since your last forecast';
        }
        const day = document.createElement('span'); day.className = 'b-day'; day.textContent = `Day ${r.day}`;
        const claim = document.createElement('span'); claim.className = 'rep-claim';
        claim.textContent = `${LAB_NAME[r.lab] ?? r.lab}, R${r.rung}`;
        const st = document.createElement('span'); st.className = 'rep-st'; st.textContent = status;
        li.append(day, claim, ' ', st);
        if (trail.length) {
            const sub = document.createElement('span'); sub.className = 'rep-sub';
            sub.textContent = trail.join(' · ');
            li.append(sub);
        }
        list.appendChild(li);
    }
}
