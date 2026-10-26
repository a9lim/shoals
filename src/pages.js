/* =====================================================
   pages.js -- The Brief's sections (folios).

   Four pages share one masthead, one job each: the
   Front page reads (the lead, the wire, the tape, your
   book), Markets commits (every market a curve, and the
   ticket), Race knows (the ladder and your forecast),
   and Meridian accounts (your record, the firm, the
   world, the settings). Exactly one is visible; the
   others are `hidden`, so their canvases cost nothing
   until shown. The folios follow the ARIA tabs pattern
   (roving tabindex, arrow keys, Home/End).
   ===================================================== */

export const PAGES = ['front', 'markets', 'race', 'meridian'];

let _page = 'front';
let _onChange = null;

/** The page currently shown. */
export function currentPage() { return _page; }

/**
 * Show one page. `focus` moves keyboard focus to its folio (arrow-key use).
 * Calls the change handler with (page, previous) after the DOM has switched,
 * so a page's canvas has its real size when the handler measures it.
 */
export function showPage(name, focus = false) {
    if (!PAGES.includes(name)) return;
    const prev = _page;
    for (const p of PAGES) {
        const sec = document.getElementById('page-' + p);
        const btn = document.getElementById('folio-' + p);
        const on = p === name;
        if (sec) { sec.hidden = !on; sec.classList.toggle('active', on); }
        if (btn) {
            btn.setAttribute('aria-selected', String(on));
            btn.tabIndex = on ? 0 : -1;
            if (on && focus) btn.focus();
        }
    }
    document.body.dataset.page = name;
    _page = name;
    if (name !== prev && typeof _haptics !== 'undefined') _haptics.trigger('selection');
    if (_onChange) _onChange(name, prev);
}

/** Step to the next or previous page ([ and ]). */
export function cyclePage(dir) {
    const i = PAGES.indexOf(_page);
    showPage(PAGES[(i + dir + PAGES.length) % PAGES.length]);
}

/**
 * Wire the folios.
 * @param {function(string, string)} onChange  (page, previous) after a switch
 */
export function initPages(onChange) {
    _onChange = onChange;
    const folios = PAGES.map(p => document.getElementById('folio-' + p)).filter(Boolean);
    folios.forEach((btn, i) => {
        btn.addEventListener('click', () => showPage(btn.dataset.page));
        btn.addEventListener('keydown', (e) => {
            let j = -1;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % folios.length;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + folios.length) % folios.length;
            else if (e.key === 'Home') j = 0;
            else if (e.key === 'End') j = folios.length - 1;
            if (j < 0) return;
            e.preventDefault();
            showPage(folios[j].dataset.page, true);
        });
    });
    document.body.dataset.page = _page;
}

/** Mark a folio with a count (the ticket's legs on Markets), or clear it. */
export function setFolioCount(page, n) {
    const btn = document.getElementById('folio-' + page);
    if (!btn) return;
    let b = btn.querySelector('.folio-n');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'folio-n'; btn.appendChild(b); }
    b.textContent = String(n);
    b.setAttribute('aria-label', `, ${n} on the ticket`);
}
