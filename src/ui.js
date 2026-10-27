/* =====================================================
   ui.js -- DOM access for the Brief outside its canvases
   and its own modules: the element cache, the settings,
   the book's Greeks, Meridian's record, standing, orders
   and Washington, and the dispatch.

   Pure functions over the cache -- no simulation state.
   ===================================================== */

import { fmtSigned } from './format-helpers.js';
import { forecastRecord } from './race/belief.js';
export { updatePortfolioDisplay } from './portfolio-renderer.js';

// ---------------------------------------------------------------------------
// Focus trap state (module-scoped for overlay open/close)
// ---------------------------------------------------------------------------
let _popupTrapCleanup = null;
let _popupPrevFocus = null;

// ---------------------------------------------------------------------------
// Tooltip state (module-scoped so refreshTooltip can update visible tip)
// ---------------------------------------------------------------------------
let _tip = null;
let _tipTarget = null;

/**
 * If a bid/ask tooltip is currently visible, re-read data-tooltip from
 * the hovered element and update the displayed text.  Called each substep.
 */
export function refreshTooltip() {
    if (_tip && _tipTarget) {
        const text = _tipTarget.dataset.tooltip;
        if (text) _tip.el.textContent = text;
    }
}

// ---------------------------------------------------------------------------
// cacheDOMElements
// ---------------------------------------------------------------------------

export function cacheDOMElements($) {
    $.chartCanvas    = document.getElementById('chart-canvas');
    $.playBtn     = document.getElementById('play-btn');
    $.speedBtn    = document.getElementById('speed-btn');
    $.stepBtn     = document.getElementById('step-btn');
    $.book        = document.getElementById('book');
    $.defaultPositions  = document.getElementById('default-positions');
    $.strategyPositions = document.getElementById('strategy-positions');
    $.strategySection   = document.getElementById('book-strategies');
    $.pendingOrders     = document.getElementById('pending-orders');
    $.ordersSection     = document.getElementById('book-orders');
    $.cashDisplay       = document.getElementById('cash-display');
    $.portfolioValue    = document.getElementById('portfolio-value');
    $.bookChange        = document.getElementById('book-change');
    $.portfolioSparkCanvas = document.getElementById('portfolio-sparkline');
    $.marginStatus      = document.getElementById('margin-status');
    $.borrowCostDisplay = document.getElementById('borrow-cost');
    $.dividendDisplay   = document.getElementById('dividend-income');
    $.greekDelta      = document.getElementById('greek-delta');
    $.greekGamma      = document.getElementById('greek-gamma');
    $.greekTheta      = document.getElementById('greek-theta');
    $.greekVega       = document.getElementById('greek-vega');
    $.greekRho        = document.getElementById('greek-rho');
    $.presetSelect    = document.getElementById('preset-select');
    $.advancedToggle  = document.getElementById('advanced-toggle');
    $.advancedSection = document.getElementById('advanced-section');
    $.resetBtn        = document.getElementById('reset-btn');
    $.sliders = {};
    for (const p of ['mu','theta','kappa','xi','rho','lambda','muJ','sigmaJ','a','b','sigmaR','borrowSpread','q']) {
        $.sliders[p]         = document.getElementById('slider-' + p);
        $.sliders[p + 'Val'] = document.getElementById('slider-' + p + '-val');
    }
    $.zoomControls = document.getElementById('zoom-controls');
    $.zoomInBtn    = document.getElementById('zoom-in-btn');
    $.zoomOutBtn   = document.getElementById('zoom-out-btn');
    $.zoomResetBtn = document.getElementById('zoom-reset-btn');
    $.zoomLevel    = document.getElementById('zoom-level');
    $.popupOverlay   = document.getElementById('popup-event-overlay');
    $.popupHeadline  = document.getElementById('popup-event-headline');
    $.popupContext   = document.getElementById('popup-event-context');
    $.popupChoices   = document.getElementById('popup-event-choices');
    $.dynamicOnly    = document.querySelectorAll('[data-dynamic]');
    $.senateSeats        = document.getElementById('senate-seats');
    $.houseSeats         = document.getElementById('house-seats');
    $.senateKey          = document.getElementById('senate-key');
    $.houseKey           = document.getElementById('house-key');
    $.lobbyBar           = document.getElementById('lobby-bar');
    $.lobbyActions       = document.getElementById('lobby-actions');
    $.standingsWorld     = document.getElementById('standings-world');
    $.standingsRecord    = document.getElementById('standings-record');
    $.standingsFactions  = document.getElementById('standings-factions');
    $.standingOrdersSection = document.getElementById('standing-orders-section');
    $.standingOrdersList    = document.getElementById('standing-orders-list');
    $.standingOrdersState   = document.getElementById('standing-orders-state');
    $.convictionsSection = document.getElementById('convictions-section');
    $.convictionsList    = document.getElementById('convictions-list');
}

// ---------------------------------------------------------------------------
// bindEvents
// ---------------------------------------------------------------------------

export function bindEvents($, handlers) {
    const { onSpeedUp, onSpeedDown, onPresetChange, onReset, onSliderChange } = handlers;

    // Play, step and theme live in the colophon (shared/colophon.js), wired by main.js.
    $.speedBtn.addEventListener('click', onSpeedUp);
    $.speedBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); onSpeedDown(); });
    $.presetSelect.addEventListener('change', () => {
        onPresetChange($.presetSelect.selectedIndex);
    });

    $.resetBtn.addEventListener('click', onReset);

    $.advancedToggle.addEventListener('click', () => {
        const open = $.advancedSection.classList.toggle('hidden') === false;
        $.advancedToggle.setAttribute('aria-expanded', String(open));
        if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
    });

    for (const p of ['mu','theta','kappa','xi','rho','lambda','muJ','sigmaJ','a','b','sigmaR','borrowSpread','q']) {
        if (!$.sliders[p]) continue;
        _forms.bindSlider($.sliders[p], $.sliders[p + 'Val'], v => onSliderChange(p, v));
    }

    // Tooltip delegation for [data-tooltip] cells (bid and ask on the chain).
    if (typeof createSimTooltip === 'function') {
        _tip = createSimTooltip();
        const pages = document.getElementById('pages');
        pages.addEventListener('mouseover', (e) => {
            const target = e.target.closest('[data-tooltip]');
            if (target === _tipTarget) return;
            if (target) {
                _tipTarget = target;
                _tip.show(e.clientX, e.clientY, target.dataset.tooltip);
            } else if (_tipTarget) {
                _tipTarget = null;
                _tip.hide();
            }
        });
        pages.addEventListener('mouseout', (e) => {
            if (!_tipTarget) return;
            const related = e.relatedTarget;
            if (!related || !_tipTarget.contains(related)) {
                _tipTarget = null;
                _tip.hide();
            }
        });
    }
}

// ---------------------------------------------------------------------------
// The book's Greeks
// ---------------------------------------------------------------------------

export function updateGreeksDisplay($, greeks) {
    if (!greeks) return;
    const f = (v) => fmtSigned(v, Math.abs(v) < 10 ? 2 : 1);
    $.greekDelta.textContent = f(greeks.delta);
    $.greekGamma.textContent = f(greeks.gamma);
    $.greekTheta.textContent = f(greeks.theta);
    $.greekVega.textContent  = f(greeks.vega);
    $.greekRho.textContent   = f(greeks.rho);
}

// ---------------------------------------------------------------------------
// syncSettingsUI
// ---------------------------------------------------------------------------

export function syncSettingsUI($, sim) {
    if (!sim || !sim.params) return;
    if (sim.presetIndex != null) $.presetSelect.selectedIndex = sim.presetIndex;
    for (const p of ['mu','theta','kappa','xi','rho','lambda','muJ','sigmaJ','a','b','sigmaR','borrowSpread','q']) {
        const slider  = $.sliders[p];
        const valSpan = $.sliders[p + 'Val'];
        if (!slider || sim.params[p] == null) continue;
        slider.value        = sim.params[p];
        valSpan.textContent = String(sim.params[p]);
        _forms.updateSliderFill(slider);
    }
}

// ---------------------------------------------------------------------------
// The colophon's play button and the speed control
// ---------------------------------------------------------------------------

export function updatePlayBtn($, playing) {
    _colophon.setPlayIcon($.playBtn, playing);
}

export function updateSpeedBtn($, speed) {
    const t = (speed < 1 ? String(speed).replace(/^0/, '') : String(speed)) + '×';
    $.speedBtn.textContent = t;
    $.speedBtn.setAttribute('aria-label', 'Speed ' + t + ' (. faster, , slower)');
}

/**
 * Attach info tip popovers to slider labels and other UI elements.
 * Must be called after DOM is ready.
 */
export function wireInfoTips() {
    const data = {
        // --- Simulation parameters ---
        mu:           { title: 'Drift (μ)', body: 'Expected annualised return of the stock. Positive = bullish tendency. The actual drift also accounts for dividends, jumps, and the Itô correction.' },
        theta:        { title: 'Vol mean (θ)', body: 'Long-run variance level. Volatility reverts toward $\\sqrt{\\theta}$ over time. $\\theta = 0.04$ corresponds to ~20% annualised vol.' },
        kappa:        { title: 'Mean reversion (κ)', body: 'Speed at which variance returns to $\\theta$. Half-life of a vol shock is $\\ln(2)/\\kappa$. Higher = faster reversion, shallower term structure.' },
        xi:           { title: 'Vol of vol (ξ)', body: 'Volatility of the variance process. Higher $\\xi$ steepens the volatility skew and fattens return tails.' },
        rho:          { title: 'Correlation (ρ)', body: 'Correlation between price and variance shocks. Negative = leverage effect (price drops cause vol spikes, steepening the skew).' },
        lambda:       { title: 'Jump rate (λ)', body: 'Expected Poisson jump count per year. $\\lambda = 0.5$: ~1 jump every 2 years. $\\lambda = 8$: crisis-level discontinuity.' },
        muJ:          { title: 'Jump mean (μJ)', body: 'Average log-jump size. Negative = predominantly downward jumps (crash risk). The drift compensator $\\lambda k$ offsets the expected jump effect.' },
        sigmaJ:       { title: 'Jump vol (σJ)', body: 'Standard deviation of jump sizes. Higher = more unpredictable jump magnitudes, fattening both tails of the return distribution.' },
        a:            { title: 'Rate reversion (a)', body: 'Speed of Vasicek mean reversion. Higher $a$ means rate shocks are transient. Bond duration capped at $1/a$.' },
        b:            { title: 'Rate mean (b)', body: 'Long-run equilibrium rate in the Vasicek model. Rates revert toward $b$ over time. Affects bond prices inversely.' },
        sigmaR:       { title: 'Rate vol (σR)', body: 'Volatility of the interest rate process. Higher = wider rate swings, more volatile bond prices.' },
        borrowSpread: { title: 'Borrow spread (k)', body: 'Volatility-scaled borrow cost factor. Daily charge = notional $\\times$ (max($r$,0) + $k \\sigma$) / 252. Events like short squeezes spike this.' },
        q:            { title: 'Dividend yield (q)', body: 'Continuous dividend yield. Reduces stock drift and option cost of carry ($b = r - q$). Cash dividends paid quarterly.' },
        // --- The book ---
        portfolioValue: { title: 'The book', body: 'Total equity: cash plus every position marked to market at mid-price. Set against holding HCN with the same starting capital, the dashed line under it.' },
        greeks:       { title: 'Greeks', body: '$\\Delta$: change in value per point of HCN. $\\Gamma$: change in $\\Delta$. $\\Theta$: decay per trading day. $\\nu$: change per point of volatility. $\\rho$: change per point of rates.' },
        // --- The ticket ---
        ticket:       { title: 'The ticket', body: 'Pick a point on a curve, or a cell of its table: once long, twice short, a third time off. The size scales every ratio; you buy at the ask and sell at the bid. A limit or stop rests until HCN reaches the trigger, and a named ticket trades as one strategy, every leg or none.' },
        horizon:      { title: 'The horizon', body: 'How far out the figure and the grid value the legs. Options are repriced on the tree at that day; one that expires before it is worth what it pays.' },
        // --- Meridian ---
        record:       { title: 'Your record', body: 'Each quarter your locked forecast is scored against the market’s by log-likelihood, in nats: the rungs that certified and the quarters that passed quietly. Credibility is the edge you have shown.' },
        standingOrders: { title: 'Standing orders', body: 'Armed rules execute without you. Editable until the frontier reaches R5; then the set is final.' },
        regime:       { title: 'Market regime', body: 'Five fixed regimes (Calm bull to Rate hike) for the trading sim alone, or Dynamic: the race, its markets and the wire. Changing regime resets the run.' },
        gbm:          { title: 'Pricing models', body: 'GBM + Merton jumps + Heston stochastic vol + Vasicek rates. American options priced via 128-step CRR binomial tree.' },
    };
    registerInfoTips(data);
}

// ---------------------------------------------------------------------------
// updateDynamicSections: the sections that exist only with the race
// ---------------------------------------------------------------------------

export function updateDynamicSections($, presetIndex) {
    const isDynamic = presetIndex >= 5;
    for (const el of $.dynamicOnly || []) el.hidden = !isDynamic;
    // Standing orders (P7-2) are Dynamic-only AND rung-gated: the mode switch can
    // only ever HIDE the panel here; `updateStandingOrdersPanel` owns showing it
    // (released frontier rung >= 3).
    if (!isDynamic && $.standingOrdersSection) $.standingOrdersSection.hidden = true;
}

// ---------------------------------------------------------------------------
// Standing orders panel (the delegation layer -- overhaul phase 7, slice 2)
// ---------------------------------------------------------------------------

let _standingSig = null;   // last rendered arm/lock signature (render-churn guard)
let _standingBound = false;

/**
 * Render the standing-orders authoring panel on the Meridian page from the
 * engine's view model (standing-orders.js `standingOrdersView()`): one row per
 * rule with an arm/disarm toggle and its FIXED parameter shown underneath (v1
 * parameters are not editable -- arming is the choice). Hidden until the
 * released frontier rung unlocks it; after R5 every toggle is disabled and the
 * heading reads "locked".
 *
 * @param {object} $        DOM cache
 * @param {object|null} view  standingOrdersView(), or null (Classic / no race)
 * @param {Function} onToggle (ruleId, on) => void
 */
export function updateStandingOrdersPanel($, view, onToggle) {
    const section = $.standingOrdersSection;
    if (!section) return;
    if (!_standingBound && onToggle) {
        // Delegated toggle, bound once on the stable list (rows rebuild on change).
        $.standingOrdersList.addEventListener('change', (e) => {
            const box = e.target.closest('[data-standing-rule]');
            if (box) onToggle(box.dataset.standingRule, box.checked);
        });
        _standingBound = true;
    }
    if (!view || !view.unlocked) {
        section.hidden = true;
        _standingSig = null;
        return;
    }
    section.hidden = false;

    // The panel changes at most once a day (and on a toggle), while updateUI runs
    // constantly -- rebuild only when the state actually moved, so the rows are not
    // torn down under the player's cursor every frame.
    const sig = (view.locked ? 'L' : '-') + (view.frozen ? 'F' : '-')
        + view.rules.map(r => (r.armed ? '1' : '0')).join('');
    if (sig === _standingSig) return;
    _standingSig = sig;

    const list = $.standingOrdersList;
    list.textContent = '';
    for (const rule of view.rules) {
        const row = document.createElement('label');
        row.className = 'so-row';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.dataset.standingRule = rule.id;
        box.checked = rule.armed;
        box.disabled = view.locked || view.frozen;
        const text = document.createElement('span');
        const name = document.createElement('span');
        name.className = 'so-name';
        name.textContent = rule.label;
        const param = document.createElement('span');
        param.className = 'so-param';
        param.textContent = rule.param;
        text.append(name, param);
        row.append(box, text);
        list.appendChild(row);
    }

    $.standingOrdersState.textContent = view.locked ? '· locked' : '';
}

// ---------------------------------------------------------------------------
// Meridian: your record, your standing, the world
// ---------------------------------------------------------------------------

const _FACTION_IDS = ['firmStanding', 'regulatoryExposure', 'federalistSupport', 'farmerLaborSupport', 'mediaTrust', 'fedRelations', 'safetyNetworkTrust', 'labRelations'];

export function updateStandings($, world, factions, getFactionDescriptor) {
    if (!$.standingsWorld || !$.standingsFactions) return;
    _renderRows($.standingsWorld, [
        ['Barron approval', (world?.election?.barronApproval ?? '?') + '%'],
        ['Fed stance', (world?.fed?.hikeCycle) ? 'Hiking' : (world?.fed?.cutCycle) ? 'Cutting' : 'Holding'],
        ['Fed credibility', (world?.fed?.credibilityScore ?? '?') + ' of 10'],
    ]);
    _renderRecord($.standingsRecord);
    _renderRows($.standingsFactions, _FACTION_IDS.map(id => [_FACTION_LABELS[id] || id, getFactionDescriptor(id)]));
}

/** The forecast record (02a, the posterior's scoring): skill in nats over the
 *  quarters scored, and credibility as a whole percent. Dynamic only. */
function _renderRecord(container) {
    if (!container) return;
    const rec = forecastRecord();
    if (!rec) { container.textContent = ''; return; }
    const pct = Math.round(rec.credibility * 100);
    _renderRows(container, [
        ['Against the market', rec.quarters
            ? `${fmtSigned(rec.S)} nats over ${rec.quarters} ${rec.quarters === 1 ? 'quarter' : 'quarters'}`
            : '—'],
        ['Credibility', (pct < 0 ? '−' : '') + Math.abs(pct) + '%'],
        ['Forecasts locked', String(rec.locks)],
    ]);
    // The quarters scored, newest first.
    const tbl = document.getElementById('record-quarters');
    if (!tbl) return;
    tbl.hidden = !rec.history.length;
    const sig = rec.history.length + ':' + rec.S;
    if (tbl._sig === sig) return;
    tbl._sig = sig;
    tbl.tBodies[0].innerHTML = rec.history.slice(-12).reverse().map(q =>
        `<tr><td class="l">Days ${q.from}–${q.to}${q.terminal ? ', at the end' : ''}</td><td>${q.rungs.length}</td>`
        + `<td class="${q.delta > 0.005 ? 'pnl-up' : q.delta < -0.005 ? 'pnl-down' : ''}">${fmtSigned(q.delta, 2)}</td></tr>`).join('');
}

function _renderRows(container, entries) {
    const sig = entries.map(e => e.join(':')).join('|');
    if (container._sig === sig) return;
    container._sig = sig;
    container.textContent = '';
    for (const [label, value] of entries) {
        const row = document.createElement('div');
        row.className = 'stat-row';
        const lbl = document.createElement('span');
        lbl.className = 'stat-label';
        lbl.textContent = label;
        const val = document.createElement('span');
        val.className = 'stat-value';
        val.textContent = value;
        row.append(lbl, val);
        container.appendChild(row);
    }
}

const _FACTION_LABELS = {
    firmStanding: 'The firm',
    regulatoryExposure: 'Regulators',
    federalistSupport: 'Federalists',
    farmerLaborSupport: 'Farmer-Labor',
    mediaTrust: 'The press',
    fedRelations: 'The Fed',
    safetyNetworkTrust: 'The safety network',
    labRelations: 'The labs',
};

// ---------------------------------------------------------------------------
// Congress: one seat bar a chamber
// ---------------------------------------------------------------------------

/**
 * Each chamber as one bar of its seats: Farmer-Labor solid in sap, the
 * Federalists hatched in sienna (pattern before hue), a rule at the majority.
 */
function _seats(bar, key, chamber, fl, fed, majority) {
    if (!bar) return;
    const total = fl + fed;
    if (!total) return;
    bar.querySelector('.seats-fl').style.width = (100 * fl / total) + '%';
    bar.querySelector('.seats-fed').style.width = (100 * fed / total) + '%';
    bar.querySelector('.seats-maj').style.left = (100 * majority / total) + '%';
    bar.setAttribute('aria-label', `${chamber}: Farmer-Labor ${fl}, Federalists ${fed}; ${majority} for a majority`);
    key.innerHTML = `<span class="${fl >= majority ? 'maj' : ''}">Farmer-Labor ${fl}</span> · <span class="${fed >= majority ? 'maj' : ''}">Federalists ${fed}</span>`;
}

export function updateCongressDiagrams($, world) {
    if (!world) return;
    const s = world.congress.senate, h = world.congress.house;
    _seats($.senateSeats, $.senateKey, 'Senate', s.farmerLabor, s.federalist, 51);
    _seats($.houseSeats, $.houseKey, 'House', h.farmerLabor, h.federalist, 218);
}

// ---------------------------------------------------------------------------
// The dispatch
// ---------------------------------------------------------------------------

const _popupCategoryLabel = {
    fed: 'Federal Reserve', investigation: 'Investigation', congressional: 'Congress', political: 'Political',
    midterm: 'Election', macro: 'Macro', sector: 'Sector', market: 'Markets', compound: 'Crisis',
    desk: 'Meridian Capital', margin: 'Margin call', gameover: 'Game over',
    release: 'The race', certification: 'Consensus markets', incident: 'Incident report', theft: 'Exfiltration',
    strait: 'The strait', regime: 'The state', halcyon: 'Halcyon', china: 'Beijing', polaris: 'Polaris',
    rounds: 'The round', wonder: 'The wonders', policy: 'Washington', treaty: 'Geneva', summit: 'Reykjavik',
    insider: 'The channel', ghostwritten: 'Unsigned',
};

export function showPopupEvent($, headline, context, choices, onChoice, category, magnitude, superevent = false) {
    // Category kicker
    let tag = $.popupOverlay.querySelector('.popup-tag');
    if (!tag) {
        tag = document.createElement('span');
        tag.className = 'popup-tag';
        $.popupHeadline.parentNode.insertBefore(tag, $.popupHeadline);
    }
    tag.textContent = _popupCategoryLabel[category] || _popupCategoryLabel.desk;

    $.popupHeadline.textContent = headline;
    if (superevent) {
        $.popupOverlay.classList.add('superevent');
        $.popupContext.textContent = '';
        $.popupChoices.style.display = 'none';
        const fullContext = context;
        let charIdx = 0;
        const cursor = document.createElement('span');
        cursor.className = 'typewriter-cursor';
        $.popupContext.appendChild(cursor);
        const typeInterval = setInterval(() => {
            if (charIdx < fullContext.length) {
                cursor.before(document.createTextNode(fullContext[charIdx]));
                charIdx++;
            } else {
                clearInterval(typeInterval);
                cursor.remove();
                // Staggered fade-in for each choice button
                $.popupChoices.style.display = '';
                const btns = $.popupChoices.querySelectorAll('.popup-choice-btn');
                btns.forEach((btn, i) => {
                    btn.classList.add('choice-animate-in');
                    btn.style.animationDelay = (i * 150) + 'ms';
                });
                const lastBtn = btns[btns.length - 1];
                if (lastBtn) {
                    lastBtn.addEventListener('animationend', () => {
                        const firstBtn = $.popupChoices.querySelector('button');
                        if (firstBtn) firstBtn.focus();
                    }, { once: true });
                }
            }
        }, 25);
    } else {
        $.popupOverlay.classList.remove('superevent');
        $.popupContext.textContent = context;
    }
    $.popupChoices.textContent = '';
    choices.forEach((c, i) => {
        const btn = document.createElement('button');
        btn.className = 'popup-choice-btn';
        const lbl = document.createElement('span');
        lbl.className = 'popup-choice-label';
        lbl.textContent = c.label;
        const desc = document.createElement('span');
        desc.className = 'popup-choice-desc';
        desc.textContent = c.desc;
        btn.appendChild(lbl);
        btn.appendChild(desc);
        btn.addEventListener('click', () => {
            $.popupOverlay.classList.add('hidden');
            $.popupOverlay.classList.remove('superevent');
            if (_popupTrapCleanup) { _popupTrapCleanup(); _popupTrapCleanup = null; }
            if (_popupPrevFocus && _popupPrevFocus.focus) { _popupPrevFocus.focus(); _popupPrevFocus = null; }
            onChoice(i);
        });
        $.popupChoices.appendChild(btn);
    });
    _popupPrevFocus = document.activeElement;
    $.popupOverlay.classList.remove('hidden');
    if (typeof trapFocus === 'function') _popupTrapCleanup = trapFocus($.popupOverlay);
    const firstChoice = $.popupChoices.querySelector('button');
    if (firstChoice) firstChoice.focus();
    if (typeof _haptics !== 'undefined') _haptics.trigger(magnitude === 'major' ? 'medium' : 'light');
}

export function hidePopupEvent($) {
    $.popupOverlay.classList.add('hidden');
    if (_popupTrapCleanup) { _popupTrapCleanup(); _popupTrapCleanup = null; }
    if (_popupPrevFocus && _popupPrevFocus.focus) { _popupPrevFocus.focus(); _popupPrevFocus = null; }
}

export function isPopupVisible($) {
    return !$.popupOverlay.classList.contains('hidden');
}
