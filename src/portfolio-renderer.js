/* =====================================================
   portfolio-renderer.js -- The book, on the front
   page's rail: the value against holding HCN, the
   account, positions, strategies and working orders.

   Rows are agate: the contract as the ticket names it,
   the signed quantity, the profit or loss. A row's name
   hands the contract to the ticket; its × closes it.
   P&L values update in place instead of rebuilding the
   rows every substep.
   ===================================================== */

import { computePositionPnl, computePositionValue } from './position-value.js';
import { drawSparkline } from './sparkline.js';
import { fmtDollar, fmtBook, pnlClass, contractName } from './format-helpers.js';
import { lastPolarisRound } from './race/rounds.js';
import { contractByKey } from './race/consensus.js';

const PRIVATE_TIP = 'Private stakes are marked at the last round and cannot be sold before the race ends. At the end they settle by what happened to Polaris.';

// ---------------------------------------------------------------------------
// Margin display formatter (pure function -- no portfolio access)
// ---------------------------------------------------------------------------

function _computeMarginDisplay(equity, required) {
    if (required <= 0) return { label: 'Clear', cls: 'margin-ok' };
    if (equity < required) return { label: 'Margin call', cls: 'margin-alert' };
    const pct = Math.min((equity / required) * 100, 999);
    if (equity < required * 1.2) return { label: 'Low, ' + pct.toFixed(0) + '% of requirement', cls: 'margin-warn' };
    if (equity >= required * 5) return { label: 'Ample', cls: 'margin-ok' };
    return { label: pct.toFixed(0) + '% of requirement', cls: 'margin-ok' };
}

// ---------------------------------------------------------------------------
// positionLabel (pure; DTE display source)
// ---------------------------------------------------------------------------

/**
 * A position's name, as the ticket and the markets tables name its contract.
 * Single source of truth for the initial render and the daily in-place update,
 * so the span to expiry can't diverge between them. Compute futures carry a
 * RACE-clock `expiryDay` (their key), so they name their delivery day rather
 * than a span from the sim `day`; binaries name their rung and deadline. All
 * other instruments are sim-clock. Exported for headless display-source testing.
 */
export function positionLabel(pos, day) {
    if (pos.type === 'binary') {
        const c = contractByKey(pos.strike);
        return contractName('binary', pos.strike, pos.expiryDay, day, c ? c.predicate.rung : undefined);
    }
    return contractName(pos.type, pos.strike, pos.expiryDay, day);
}

const _qty = (q) => (q < 0 ? '−' : '+') + Math.abs(q).toLocaleString() + 'k';

function _updatePrivateLabel(label, pos) {
    const round = lastPolarisRound();
    label.querySelector('.pos-private-name').textContent = positionLabel(pos);
    label.querySelector('.pos-private-note').textContent = '$' + (round?.price ?? 0).toFixed(2) + ' a unit, '
        + (round && !round.founding ? 'marked at the Series ' + round.letter + ' round' : 'marked at the founding round');
}

function _iconBtn(cls, title, event, detail, haptic) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'x-btn ' + cls;
    b.innerHTML = _ICON.at('close', 14);   // hardcoded icon markup
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', () => {
        b.dispatchEvent(new CustomEvent(event, { detail, bubbles: true }));
        if (typeof _haptics !== 'undefined') _haptics.trigger(haptic);
    });
    return b;
}

// ---------------------------------------------------------------------------
// _buildPositionRow
// ---------------------------------------------------------------------------

function _buildPositionRow(pos, currentPrice, vol, rate, day, q) {
    const isOption = pos.type === 'call' || pos.type === 'put';
    const row = document.createElement('div');
    row.className = 'pos-row';
    row.dataset.posId = pos.id;

    let labelEl;
    if (pos.type === 'privatestake') {
        labelEl = document.createElement('span');
        labelEl.className = 'pos-label pos-private-label';
        for (const cls of ['pos-private-name', 'pos-private-note']) {
            const part = document.createElement('span');
            part.className = cls;
            labelEl.appendChild(part);
        }
        _updatePrivateLabel(labelEl, pos);
    } else {
        // The name hands the contract to the ticket, on the position's side.
        labelEl = document.createElement('button');
        labelEl.type = 'button';
        labelEl.className = 'pos-label link-btn';
        labelEl.title = 'Put this contract on the ticket';
        labelEl.addEventListener('click', () => {
            labelEl.dispatchEvent(new CustomEvent('shoals:toTicket', { detail: { id: pos.id }, bubbles: true }));
        });
    }

    const qtyEl = document.createElement('span');
    qtyEl.className = 'pos-qty';
    const pnlEl = document.createElement('span');
    pnlEl.className = 'pos-pnl';
    const actions = document.createElement('span');
    actions.className = 'pos-actions';

    if (pos.type === 'privatestake') {
        const info = document.createElement('button');
        info.type = 'button';
        info.className = 'info-trigger';
        info.textContent = '?';
        info.setAttribute('aria-label', 'Info: Polaris (private)');
        info.title = PRIVATE_TIP;
        if (typeof createInfoTip !== 'undefined') row._infoCleanup = createInfoTip(info, { title: 'Polaris, private', body: PRIVATE_TIP });
        actions.appendChild(info);
    } else {
        if (isOption && pos.qty > 0) {
            const exBtn = document.createElement('button');
            exBtn.type = 'button';
            exBtn.className = 'link-btn pos-exercise-btn';
            exBtn.textContent = 'ex';
            exBtn.title = 'Exercise option';
            exBtn.setAttribute('aria-label', 'Exercise option');
            exBtn.addEventListener('click', () => {
                exBtn.dispatchEvent(new CustomEvent('shoals:exerciseOption', { detail: { id: pos.id }, bubbles: true }));
                if (typeof _haptics !== 'undefined') _haptics.trigger('medium');
            });
            actions.appendChild(exBtn);
        }
        actions.appendChild(_iconBtn('pos-close-btn', 'Close position', 'shoals:closePosition', { id: pos.id }, 'medium'));
    }

    row.append(labelEl, qtyEl, pnlEl, actions);
    _updatePositionRow(row, pos, currentPrice, vol, rate, day, q);
    return row;
}

function _updatePositionRow(row, pos, S, vol, rate, day, q) {
    const pnl = computePositionPnl(pos, S, vol, rate, day, q);
    const value = computePositionValue(pos, S, vol, rate, day, q);
    const labelEl = row.querySelector('.pos-label');
    if (pos.type === 'privatestake') _updatePrivateLabel(labelEl, pos);
    else labelEl.textContent = positionLabel(pos, day);
    row.querySelector('.pos-qty').textContent = _qty(pos.qty);
    const pnlEl = row.querySelector('.pos-pnl');
    pnlEl.textContent = (pnl < 0 ? '−' : '+') + fmtDollar(Math.abs(pnl));
    pnlEl.className = 'pos-pnl ' + pnlClass(pnl);
    pnlEl.title = 'Worth ' + fmtDollar(value) + '; entered at ' + fmtDollar(pos.entryPrice * Math.abs(pos.qty));
}

// ---------------------------------------------------------------------------
// _buildOrderRow
// ---------------------------------------------------------------------------

/** "when HCN ≤ 115": resting orders trigger on HCN's price (checkPendingOrders). */
function _when(order) {
    const long = order.legs ? true : order.side === 'long';
    const below = (order.orderType === 'limit') === long;
    return `when HCN ${below ? '≤' : '≥'} ${order.triggerPrice.toFixed(0)}`;
}

function _buildOrderRow(order, day) {
    const row = document.createElement('div');
    row.className = 'pos-row order-row';
    row.dataset.orderId = order.id;
    const label = document.createElement('span');
    label.className = 'pos-label';
    const qty = document.createElement('span');
    qty.className = 'pos-qty';
    const when = document.createElement('span');
    when.className = 'pos-pnl order-when';
    when.textContent = order.orderType + ', ' + _when(order);
    if (order.legs) {
        label.textContent = order.strategyName || 'Strategy';
        label.title = order.legs.map(l => _qty(l._baseQty != null ? Math.sign(l.qty) * l._baseQty : l.qty).replace('k', '') + ' ' + contractName(l.type, l.strike, l.expiryDay, day)).join('; ');
        qty.textContent = '×' + (order.execMult || 1).toLocaleString() + 'k';
    } else {
        label.textContent = contractName(order.type, order.strike, order.expiryDay, day);
        qty.textContent = _qty(order.side === 'short' ? -order.qty : order.qty);
    }
    const actions = document.createElement('span');
    actions.className = 'pos-actions';
    actions.appendChild(_iconBtn('order-cancel-btn', 'Cancel order', 'shoals:cancelOrder', { id: order.id }, 'light'));
    row.append(label, qty, when, actions);
    return row;
}

// ---------------------------------------------------------------------------
// updatePortfolioDisplay -- main export
// ---------------------------------------------------------------------------

function _sizeSpark(c) {
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return null;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
}

/**
 * @param {object} histories  { value, bench } spark histories, or null to hold the
 *                            sparkline this frame (Act III's skipped frames)
 */
export function updatePortfolioDisplay($, portfolio, currentPrice, vol, rate, day, marginInfo, q, histories) {
    $.cashDisplay.textContent = fmtDollar(portfolio.cash);
    $.cashDisplay.className = 'stat-value ' + (portfolio.cash < 0 ? 'pnl-down' : '');

    // Use marginInfo.equity when available -- it's the canonical portfolio value computed
    // by the margin system (cash + all position mark-to-market values). Fall back to cash
    // only when marginInfo is not provided (e.g. called before first margin check).
    const totalValue = (marginInfo && marginInfo.equity != null) ? marginInfo.equity : portfolio.cash;
    // The figure in ink, rounded as the dateline sets it (the dateline carries the
    // term's change); the line under it compares holding HCN: viridian ahead of
    // it, the accent behind.
    $.portfolioValue.textContent = fmtBook(totalValue);
    const buyHoldValue = (portfolio.initialCapital / 100) * currentPrice;
    const vsBenchmark = totalValue - buyHoldValue;
    const benchCls = vsBenchmark > 0.005 ? 'pnl-up' : vsBenchmark < -0.005 ? 'pnl-down' : '';
    if ($.bookChange) {
        const b = (vsBenchmark < 0 ? '−' : '+') + fmtDollar(Math.abs(vsBenchmark));
        if ($.bookChange._key !== b) {
            $.bookChange._key = b;
            $.bookChange.innerHTML = `vs holding HCN <span class="${benchCls}">${b}</span>`;
        }
    }

    // Value sparkline, with holding HCN dashed under it.
    if ($.portfolioSparkCanvas && histories && histories.value && histories.value.count >= 2) {
        const sz = _sizeSpark($.portfolioSparkCanvas);
        if (sz) {
            const pal = _themePalette();
            drawSparkline(sz.ctx, histories.value, sz.w, sz.h, pal.text, _r(pal.textMuted, 0.8), histories.bench);
        }
    }

    // Margin display from pre-computed values
    const marginDisplay = marginInfo
        ? _computeMarginDisplay(marginInfo.collateralEquity ?? marginInfo.equity, marginInfo.required)
        : { label: 'Clear', cls: 'margin-ok' };
    $.marginStatus.textContent = marginDisplay.label;
    $.marginStatus.className   = 'stat-value ' + marginDisplay.cls;

    // Cumulative borrow cost across all positions (including closed -- tracked on portfolio)
    let totalBorrowCost = 0;
    for (const pos of portfolio.positions) {
        if (pos.borrowCost) totalBorrowCost += pos.borrowCost;
    }
    totalBorrowCost += portfolio.closedBorrowCost || 0;
    totalBorrowCost += portfolio.marginDebitCost || 0;
    if ($.borrowCostDisplay) {
        $.borrowCostDisplay.textContent = fmtDollar(-totalBorrowCost);
        $.borrowCostDisplay.className = 'stat-value ' + (totalBorrowCost > 0 ? pnlClass(-totalBorrowCost) : '');
    }

    // Cumulative dividend income
    const totalDividends = portfolio.totalDividends || 0;
    if ($.dividendDisplay) {
        $.dividendDisplay.textContent = fmtDollar(totalDividends);
        $.dividendDisplay.className = 'stat-value ' + (totalDividends !== 0 ? pnlClass(totalDividends) : '');
    }

    // Single positions, every instrument (binaries included: the book is their one list).
    const defaultPos = portfolio.positions.filter(p => !p.strategyName);
    _diffPositionRows($.defaultPositions, defaultPos, currentPrice, vol, rate, day, q);

    // Strategy positions -- grouped by name, one row per strategy and its legs under it.
    const strategyNames = [...new Set(
        portfolio.positions.filter(p => p.strategyName).map(p => p.strategyName)
    )];
    if ($.strategySection) $.strategySection.hidden = strategyNames.length === 0;

    for (const g of $.strategyPositions.querySelectorAll('.strategy-group')) {
        if (!strategyNames.includes(g.dataset.strategyName)) g.remove();
    }
    for (const name of strategyNames) {
        const groupPositions = portfolio.positions.filter(p => p.strategyName === name);
        let totalValue = 0, totalPnl = 0;
        for (const pos of groupPositions) {
            totalValue += computePositionValue(pos, currentPrice, vol, rate, day, q);
            totalPnl += computePositionPnl(pos, currentPrice, vol, rate, day, q);
        }
        // Execution multiplier from base qty: strategyBaseQty is each leg's
        // per-execution qty, set at first execution.
        const ref = groupPositions.find(p => p.strategyBaseQty);
        const mult = ref ? Math.round(Math.abs(ref.qty) / ref.strategyBaseQty) : 1;
        const constituents = groupPositions.map(pos => {
            const baseQty = pos.strategyBaseQty || Math.abs(pos.qty);
            return (pos.qty < 0 ? '−' : '+') + baseQty + ' ' + positionLabel(pos, day);
        }).join('; ');

        let group = $.strategyPositions.querySelector('.strategy-group[data-strategy-name="' + CSS.escape(name) + '"]');
        if (!group) {
            group = document.createElement('div');
            group.className = 'strategy-group';
            group.dataset.strategyName = name;
            const head = document.createElement('div');
            head.className = 'pos-row';
            const n = document.createElement('span');
            n.className = 'pos-label strategy-group-name';
            const qtyEl = document.createElement('span');
            qtyEl.className = 'pos-qty';
            const pnlEl = document.createElement('span');
            pnlEl.className = 'pos-pnl';
            const actions = document.createElement('span');
            actions.className = 'pos-actions';
            actions.appendChild(_iconBtn('pos-close-btn', 'Unwind strategy', 'shoals:unwindStrategy', { name }, 'medium'));
            head.append(n, qtyEl, pnlEl, actions);
            const detail = document.createElement('div');
            detail.className = 'strategy-group-detail';
            group.append(head, detail);
            $.strategyPositions.appendChild(group);
        }
        group.querySelector('.strategy-group-name').textContent = name;
        group.querySelector('.pos-qty').textContent = '×' + mult.toLocaleString() + 'k';
        const pnlEl = group.querySelector('.pos-pnl');
        pnlEl.textContent = (totalPnl < 0 ? '−' : '+') + fmtDollar(Math.abs(totalPnl));
        pnlEl.className = 'pos-pnl ' + pnlClass(totalPnl);
        pnlEl.title = 'Worth ' + fmtDollar(totalValue);
        group.querySelector('.strategy-group-detail').textContent = constituents;
    }

    // Working orders -- DOM diff
    if ($.ordersSection) $.ordersSection.hidden = portfolio.orders.length === 0;
    _diffOrderRows($.pendingOrders, portfolio.orders, day);

    // Unpaid obligations (02a "The evening"): label, due edition, amount.
    if ($.obligationsSection) $.obligationsSection.hidden = portfolio.obligations.length === 0;
    if ($.obligationList) _renderObligations($.obligationList, portfolio.obligations);
}

/** One row per unpaid obligation, in the book's row idiom. A liability is not a
 *  loss, so the amount is set in ink. Rebuilt only when the list changes. */
function _renderObligations(container, obligations) {
    const sig = obligations.map(o => o.label + '|' + o.dueDay + '|' + o.amount).join(',');
    if (container._sig === sig) return;
    container._sig = sig;
    container.textContent = '';
    for (const o of obligations) {
        const row = document.createElement('div');
        row.className = 'pos-row obligation-row';
        const label = document.createElement('span');
        label.className = 'pos-label';
        label.textContent = o.label.charAt(0).toUpperCase() + o.label.slice(1);
        const due = document.createElement('span');
        due.className = 'pos-qty';
        due.textContent = 'due Ed. ' + (o.dueDay + 1);
        const amount = document.createElement('span');
        amount.className = 'pos-pnl';
        amount.textContent = fmtBook(o.amount);
        const actions = document.createElement('span');
        actions.className = 'pos-actions';
        row.append(label, due, amount, actions);
        container.appendChild(row);
    }
}

// ---------------------------------------------------------------------------
// DOM diffing helpers
// ---------------------------------------------------------------------------

function _diffPositionRows(container, positions, S, vol, rate, day, q) {
    if (!container._rowMap) container._rowMap = new Map();
    const rowMap = container._rowMap;

    const currentIds = new Set(positions.map(p => String(p.id)));

    // Remove rows for closed positions
    for (const row of container.querySelectorAll('[data-pos-id]')) {
        const posId = row.dataset.posId;
        if (!currentIds.has(posId)) {
            rowMap.delete(posId);
            if (row._infoCleanup) row._infoCleanup();
            row.remove();
        }
    }

    if (positions.length === 0) {
        // Show hint only if not already present
        if (!container.querySelector('.panel-hint')) {
            container.textContent = '';
            rowMap.clear();
            const hint = document.createElement('p');
            hint.className = 'panel-hint';
            hint.textContent = '—';
            container.appendChild(hint);
        }
        return;
    }

    // Remove stale hint
    const hint = container.querySelector('.panel-hint');
    if (hint) hint.remove();

    // Add new or update existing
    // A row belongs to one position object: ids restart at every reset, and a run
    // now opens on an inherited book, so a new run's id 2 may be another contract
    // than the last run's (its actions, like an option's exercise, would be stale).
    for (const pos of positions) {
        const posId = String(pos.id);
        let existing = rowMap.get(posId);
        if (existing && existing._pos !== pos) {
            if (existing._infoCleanup) existing._infoCleanup();
            existing.remove();
            rowMap.delete(posId);
            existing = null;
        }
        if (existing) _updatePositionRow(existing, pos, S, vol, rate, day, q);
        else {
            const row = _buildPositionRow(pos, S, vol, rate, day, q);
            row._pos = pos;
            rowMap.set(posId, row);
            container.appendChild(row);
        }
    }
}

function _diffOrderRows(container, orders, day) {
    const currentIds = new Set(orders.map(o => String(o.id)));
    for (const row of container.querySelectorAll('[data-order-id]')) {
        if (!currentIds.has(row.dataset.orderId)) row.remove();
    }
    // Orders don't change once placed, so only new ones are built.
    for (const order of orders) {
        const orderId = String(order.id);
        if (!container.querySelector('[data-order-id="' + orderId + '"]')) container.appendChild(_buildOrderRow(order, day));
    }
}
