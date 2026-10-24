/* =====================================================
   pages.js -- The Brief's sections (folios) and the
   front page's rail tabs (Quotes / Book).

   Five pages share one masthead: Front page, Markets,
   Race, Strategy and Desk. Exactly one is visible; the
   others are `hidden`, so their canvases cost nothing
   until shown. Both tab groups follow the ARIA tabs
   pattern (roving tabindex, arrow keys, Home/End).
   ===================================================== */

export const PAGES = ['front', 'markets', 'race', 'strategy', 'desk'];

let _page = 'front';
let _onChange = null;

/** The page currently shown. */
export function currentPage() { return _page; }

function _wireTablist(buttons, activate) {
    buttons.forEach((btn, i) => {
        btn.addEventListener('click', () => activate(btn, false));
        btn.addEventListener('keydown', (e) => {
            let j = -1;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % buttons.length;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + buttons.length) % buttons.length;
            else if (e.key === 'Home') j = 0;
            else if (e.key === 'End') j = buttons.length - 1;
            if (j < 0) return;
            e.preventDefault();
            activate(buttons[j], true);
        });
    });
}

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

/** Show a rail tab on the front page ('trade' or 'portfolio'). */
export function showRailTab(tab, focus = false) {
    for (const b of document.querySelectorAll('.rail-tab')) {
        const on = b.dataset.tab === tab;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
        const panel = document.getElementById('tab-' + b.dataset.tab);
        if (panel) panel.classList.toggle('active', on);
    }
}

/**
 * Wire the folios and rail tabs.
 * @param {function(string, string)} onChange  (page, previous) after a switch
 */
export function initPages(onChange) {
    _onChange = onChange;
    const folios = PAGES.map(p => document.getElementById('folio-' + p)).filter(Boolean);
    _wireTablist(folios, (btn, focus) => showPage(btn.dataset.page, focus));
    const rail = [...document.querySelectorAll('.rail-tab')];
    _wireTablist(rail, (btn, focus) => showRailTab(btn.dataset.tab, focus));
    document.body.dataset.page = _page;
}
