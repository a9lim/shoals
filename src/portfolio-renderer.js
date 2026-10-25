/* =====================================================
   portfolio-renderer.js -- Portfolio display with DOM
   diffing for the Shoals trading simulator.

   Extracted from ui.js. Updates P&L values in-place
   instead of rebuilding all position rows every day.
   ===================================================== */

import { computePositionPnl, computePositionValue } from './position-value.js';
import { drawSparkline } from './sparkline.js';
import { fmtDollar, fmtQty, pnlClass, fmtDte, posTypeLabel } from './format-helpers.js';
import { lastPolarisRound } from './race/rounds.js';

const PRIVATE_TIP = 'Private stakes are marked at the last round and cannot be sold before the race ends. At the end they settle by what happened to Polaris.';

// ---------------------------------------------------------------------------
// Margin display formatter (pure function -- no portfolio access)
// ---------------------------------------------------------------------------

function _computeMarginDisplay(equity, required) {
    if (required <= 0) return { label: 'OK', cls: 'margin-ok' };
    if (equity < required) return { label: 'Margin call', cls: 'margin-alert' };
    const pct = Math.min((equity / required) * 100, 999);
    if (equity < required * 1.2) return { label: 'Low (' + pct.toFixed(0) + '%)', cls: 'margin-warn' };
    return { label: 'OK (' + pct.toFixed(0) + '%)', cls: 'margin-ok' };
}

// ---------------------------------------------------------------------------
// positionLabel (pure; DTE display source)
// ---------------------------------------------------------------------------

/**
 * Build a position-row label. Single source of truth for both the initial render
 * and the daily in-place update, so the DTE clock can't diverge between them.
 * Compute futures carry a RACE-clock `expiryDay`; subtracting the sim `day` would
 * print a nonsense DTE, so it is omitted for them (the maturity lives in the
 * compute panel, shown against raceState.day). All other instruments are
 * sim-clock. Exported for headless display-source testing.
 */
export function positionLabel(pos, day) {
    const absQty    = Math.abs(pos.qty);
    if (pos.type === 'privatestake') return 'Polaris (private) x' + fmtQty(absQty);
    const typeLabel = posTypeLabel(pos.type, pos.qty);
    const isOption  = pos.type === 'call' || pos.type === 'put';
    const strikeStr = isOption && pos.strike != null ? ' K' + pos.strike : '';
    const expiryStr = (pos.expiryDay != null && pos.type !== 'computefuture') ? ' ' + fmtDte(pos.expiryDay - day) : '';
    return typeLabel + strikeStr + expiryStr + ' x' + fmtQty(absQty);
}

function _updatePrivateLabel(label, pos) {
    const round = lastPolarisRound();
    label.querySelector('.pos-private-name').textContent = positionLabel(pos);
    label.querySelector('.pos-private-mark').textContent = '$' + (round?.price ?? 0).toFixed(2) + ' / unit';
    label.querySelector('.pos-private-note').textContent = round && !round.founding
        ? 'marked at the Series ' + round.letter + ' round' : 'marked at the founding round';
}

// ---------------------------------------------------------------------------
// _buildPositionRow
// ---------------------------------------------------------------------------

function _buildPositionRow(pos, currentPrice, vol, rate, day, q) {
    const absQty     = Math.abs(pos.qty);
    const pnl        = computePositionPnl(pos, currentPrice, vol, rate, day, q);
    const value      = computePositionValue(pos, currentPrice, vol, rate, day, q);
    const entryTotal = pos.entryPrice * absQty;
    const isOption   = pos.type === 'call' || pos.type === 'put';
    const labelStr   = positionLabel(pos, day);

    const row = document.createElement('div');
    row.className = 'data-row pos-row stat-row';
    row.dataset.posId = pos.id;

    const labelEl = document.createElement('span');
    labelEl.className = 'pos-label stat-label';
    labelEl.textContent = labelStr;
    if (pos.type === 'privatestake') {
        labelEl.classList.add('pos-private-label');
        labelEl.textContent = '';
        for (const cls of ['pos-private-name', 'pos-private-mark', 'pos-private-note']) {
            const part = document.createElement('span');
            part.className = cls;
            labelEl.appendChild(part);
        }
        _updatePrivateLabel(labelEl, pos);
    }

    const valueEl = document.createElement('span');
    valueEl.className = 'pos-value stat-value';
    valueEl.textContent = fmtDollar(value);
    valueEl.title = 'Entry ' + fmtDollar(entryTotal);

    const pnlEl = document.createElement('span');
    pnlEl.className = 'pos-pnl stat-value ' + pnlClass(pnl);
    pnlEl.textContent = fmtDollar(pnl);

    const actions = document.createElement('div');
    actions.className = 'pos-actions';

    if (pos.type === 'privatestake') {
        const info = document.createElement('button');
        info.type = 'button';
        info.className = 'info-trigger';
        info.textContent = '?';
        info.setAttribute('aria-label', 'Info: Polaris (private)');
        info.title = PRIVATE_TIP;
        if (typeof createInfoTip !== 'undefined') row._infoCleanup = createInfoTip(info, { title: 'Polaris (private)', body: PRIVATE_TIP });
        actions.appendChild(info);
    } else {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'ghost-btn pos-close-btn';
        closeBtn.innerHTML = _ICON.at('close', 14);   // hardcoded icon markup
        closeBtn.title = 'Close position';
        closeBtn.setAttribute('aria-label', 'Close position');
        closeBtn.addEventListener('click', () => {
            closeBtn.dispatchEvent(new CustomEvent('shoals:closePosition', { detail: { id: pos.id }, bubbles: true }));
            if (typeof _haptics !== 'undefined') _haptics.trigger('medium');
        });
        actions.appendChild(closeBtn);
    }

    if (isOption && pos.qty > 0) {
        const exBtn = document.createElement('button');
        exBtn.className = 'ghost-btn pos-exercise-btn';
        exBtn.textContent = 'Ex';
        exBtn.title = 'Exercise option';
        exBtn.addEventListener('click', () => {
            exBtn.dispatchEvent(new CustomEvent('shoals:exerciseOption', { detail: { id: pos.id }, bubbles: true }));
            if (typeof _haptics !== 'undefined') _haptics.trigger('medium');
        });
        actions.appendChild(exBtn);
    }

    const numCol = document.createElement('div');
    numCol.className = 'pos-nums';
    numCol.appendChild(pnlEl);
    numCol.appendChild(valueEl);

    row.appendChild(labelEl);
    row.appendChild(numCol);
    row.appendChild(actions);
    return row;
}

// ---------------------------------------------------------------------------
// _buildOrderRow
// ---------------------------------------------------------------------------

function _buildOrderRow(order) {
    let labelStr;
    if (order.legs) {
        labelStr = (order.strategyName || 'Strategy') + ' x' + fmtQty(order.execMult) + ' ' + order.orderType + ' @ $' + order.triggerPrice.toFixed(2);
    } else {
        const typeLabel = posTypeLabel(order.type, order.side);
        const strikeStr = order.strike != null ? ' K' + order.strike : '';
        labelStr = typeLabel + strikeStr + ' x' + fmtQty(order.qty) + ' ' + order.orderType + ' @ $' + order.triggerPrice.toFixed(2);
    }

    // Strategy orders use a strategy-group-style box; single-leg orders use a flat row
    if (order.legs) {
        const group = document.createElement('div');
        group.className = 'strategy-group';
        group.dataset.orderId = order.id;

        const header = document.createElement('div');
        header.className = 'strategy-group-header';

        const nameEl = document.createElement('span');
        nameEl.className = 'stat-label strategy-group-name';
        nameEl.textContent = labelStr;
        header.appendChild(nameEl);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'ghost-btn pos-close-btn';
        cancelBtn.innerHTML = _ICON.at('close', 14);   // hardcoded icon markup
        cancelBtn.title = 'Cancel order';
        cancelBtn.setAttribute('aria-label', 'Cancel order');
        cancelBtn.addEventListener('click', () => {
            cancelBtn.dispatchEvent(new CustomEvent('shoals:cancelOrder', { detail: { id: order.id }, bubbles: true }));
            if (typeof _haptics !== 'undefined') _haptics.trigger('light');
        });
        header.appendChild(cancelBtn);

        const detail = document.createElement('div');
        detail.className = 'order-detail';
        const parts = order.legs.map(leg => {
            const baseQty = leg._baseQty || Math.abs(leg.qty);
            const label = posTypeLabel(leg.type, leg.qty);
            const isOption = leg.type === 'call' || leg.type === 'put';
            const strikeStr = isOption && leg.strike != null ? ' K' + leg.strike : '';
            return label + strikeStr + ' x' + baseQty;
        });
        detail.textContent = parts.join(', ');

        group.appendChild(header);
        group.appendChild(detail);
        return group;
    }

    const row = document.createElement('div');
    row.className = 'data-row order-row stat-row';
    row.dataset.orderId = order.id;

    const labelEl = document.createElement('span');
    labelEl.className = 'order-label stat-label';
    labelEl.textContent = labelStr;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ghost-btn order-cancel-btn';
    cancelBtn.innerHTML = _ICON.at('close', 14);   // hardcoded icon markup
    cancelBtn.title = 'Cancel order';
    cancelBtn.setAttribute('aria-label', 'Cancel order');
    cancelBtn.addEventListener('click', () => {
        cancelBtn.dispatchEvent(new CustomEvent('shoals:cancelOrder', { detail: { id: order.id }, bubbles: true }));
        if (typeof _haptics !== 'undefined') _haptics.trigger('light');
    });

    row.appendChild(labelEl);
    row.appendChild(cancelBtn);
    return row;
}

// ---------------------------------------------------------------------------
// DOM diffing helpers
// ---------------------------------------------------------------------------

function _diffPositionRows(container, positions, S, vol, rate, day, emptyHint, q) {
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
            hint.textContent = emptyHint;
            container.appendChild(hint);
        }
        return;
    }

    // Remove stale hint
    const hint = container.querySelector('.panel-hint');
    if (hint) hint.remove();

    // Add new or update existing
    for (const pos of positions) {
        const posId = String(pos.id);
        const existing = rowMap.get(posId);
        if (existing) {
            // Update value and P&L in-place
            const value = computePositionValue(pos, S, vol, rate, day, q);
            const valueEl = existing.querySelector('.pos-value');
            if (valueEl) valueEl.textContent = fmtDollar(value);
            const pnl = computePositionPnl(pos, S, vol, rate, day, q);
            const pnlEl = existing.querySelector('.pos-pnl');
            if (pnlEl) {
                pnlEl.textContent = fmtDollar(pnl);
                pnlEl.className = 'pos-pnl stat-value ' + pnlClass(pnl);
            }
            // Update label (DTE changes each day) -- shared source of truth.
            const labelStr = positionLabel(pos, day);
            const labelEl = existing.querySelector('.pos-label');
            if (labelEl) {
                if (pos.type === 'privatestake') _updatePrivateLabel(labelEl, pos);
                else labelEl.textContent = labelStr;
            }
        } else {
            const row = _buildPositionRow(pos, S, vol, rate, day, q);
            rowMap.set(posId, row);
            container.appendChild(row);
        }
    }
}

function _diffOrderRows(container, orders) {
    const currentIds = new Set(orders.map(o => String(o.id)));

    // Remove cancelled/filled orders
    for (const row of container.querySelectorAll('[data-order-id]')) {
        if (!currentIds.has(row.dataset.orderId)) row.remove();
    }

    if (orders.length === 0) {
        if (!container.querySelector('.panel-hint')) {
            container.textContent = '';
            const hint = document.createElement('p');
            hint.className = 'panel-hint';
            hint.textContent = 'No pending orders.';
            container.appendChild(hint);
        }
        return;
    }

    // Remove stale hint
    const hint = container.querySelector('.panel-hint');
    if (hint) hint.remove();

    // Add new orders (orders don't change once placed, so no update needed)
    for (const order of orders) {
        const orderId = String(order.id);
        const existing = container.querySelector('[data-order-id="' + orderId + '"]');
        if (!existing) {
            container.appendChild(_buildOrderRow(order));
        }
    }
}

// ---------------------------------------------------------------------------
// updatePortfolioDisplay -- main export
// ---------------------------------------------------------------------------

export function updatePortfolioDisplay($, portfolio, currentPrice, vol, rate, day, marginInfo, q, portfolioHistory) {
    $.cashDisplay.textContent = fmtDollar(portfolio.cash);
    $.cashDisplay.className = 'stat-value ' + (portfolio.cash < 0 ? 'pnl-down' : '');

    // Use marginInfo.equity when available -- it's the canonical portfolio value computed
    // by the margin system (cash + all position mark-to-market values). Fall back to cash
    // only when marginInfo is not provided (e.g. called before first margin check).
    const totalValue = (marginInfo && marginInfo.equity != null) ? marginInfo.equity : portfolio.cash;
    $.portfolioValue.textContent = fmtDollar(totalValue);

    // Color portfolio value: green if outpacing buy-and-hold stock, red if underperforming
    const buyHoldValue = (portfolio.initialCapital / 100) * currentPrice;
    const vsBenchmark = totalValue - buyHoldValue;
    const benchCls = vsBenchmark > 0.005 ? 'pnl-up' : vsBenchmark < -0.005 ? 'pnl-down' : '';
    $.portfolioValue.className = 'stat-value ' + benchCls;

    // Portfolio value sparkline
    if ($.portfolioSparkCtx && portfolioHistory && portfolioHistory.count >= 2) {
        const c = $.portfolioSparkCanvas;
        const color = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#000000';
        drawSparkline($.portfolioSparkCtx, portfolioHistory, c.width, c.height, color, color + '44');
    }

    // Margin display from pre-computed values
    const marginDisplay = marginInfo
        ? _computeMarginDisplay(marginInfo.collateralEquity ?? marginInfo.equity, marginInfo.required)
        : { label: 'OK', cls: 'margin-ok' };
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

    // Default (non-strategy) positions -- DOM diff. Consensus binaries are shown
    // in their own panel (Dynamic-only), not this list, so exclude them here.
    const defaultPos = portfolio.positions.filter(p => !p.strategyName && p.type !== 'binary');
    _diffPositionRows($.defaultPositions, defaultPos, currentPrice, vol, rate, day, 'No open positions.', q);

    // Strategy positions -- grouped by name, single box per strategy
    const strategyNames = [...new Set(
        portfolio.positions.filter(p => p.strategyName).map(p => p.strategyName)
    )];

    if (strategyNames.length === 0) {
        const existingGroups = $.strategyPositions.querySelectorAll('.strategy-group');
        for (const g of existingGroups) g.remove();
        if (!$.strategyPositions.querySelector('.panel-hint')) {
            $.strategyPositions.textContent = '';
            const hint = document.createElement('p');
            hint.className = 'panel-hint';
            hint.textContent = 'No strategy positions.';
            $.strategyPositions.appendChild(hint);
        }
    } else {
        const hint = $.strategyPositions.querySelector('.panel-hint');
        if (hint) hint.remove();

        // Remove groups for strategies no longer present
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

            // Nearest expiry among group positions
            let nearestExpiry = Infinity;
            for (const pos of groupPositions) {
                if (pos.expiryDay != null && pos.expiryDay < nearestExpiry) nearestExpiry = pos.expiryDay;
            }
            const expiryStr = nearestExpiry < Infinity ? ' ' + fmtDte(nearestExpiry - day) : '';

            // Compute strategy execution multiplier from base qty
            // strategyBaseQty = per-execution qty for each leg, set at first execution
            const ref = groupPositions.find(p => p.strategyBaseQty);
            const mult = ref ? Math.round(Math.abs(ref.qty) / ref.strategyBaseQty) : 1;

            // Build abridged constituents string using per-unit (base) quantities
            const parts = groupPositions.map(pos => {
                const baseQty = pos.strategyBaseQty || Math.abs(pos.qty);
                const label = posTypeLabel(pos.type, pos.qty);
                const isOption = pos.type === 'call' || pos.type === 'put';
                const strikeStr = isOption && pos.strike != null ? ' K' + pos.strike : '';
                return label + strikeStr + ' x' + baseQty;
            });
            const constituents = parts.join(', ');

            let group = $.strategyPositions.querySelector('.strategy-group[data-strategy-name="' + CSS.escape(name) + '"]');
            if (!group) {
                group = document.createElement('div');
                group.className = 'strategy-group';
                group.dataset.strategyName = name;

                const header = document.createElement('div');
                header.className = 'strategy-group-header';

                const nameEl = document.createElement('span');
                nameEl.className = 'stat-label strategy-group-name';
                header.appendChild(nameEl);

                const numCol = document.createElement('div');
                numCol.className = 'pos-nums';

                const pnlEl = document.createElement('span');
                pnlEl.className = 'stat-value strategy-group-pnl';
                numCol.appendChild(pnlEl);

                const valEl = document.createElement('span');
                valEl.className = 'stat-value strategy-group-value';
                numCol.appendChild(valEl);

                header.appendChild(numCol);

                const closeBtn = document.createElement('button');
                closeBtn.className = 'ghost-btn pos-close-btn';
                closeBtn.innerHTML = _ICON.at('close', 14);   // hardcoded icon markup
                closeBtn.title = 'Unwind strategy';
                closeBtn.setAttribute('aria-label', 'Unwind strategy');
                closeBtn.addEventListener('click', () => {
                    closeBtn.dispatchEvent(new CustomEvent('shoals:unwindStrategy', { detail: { name }, bubbles: true }));
                    if (typeof _haptics !== 'undefined') _haptics.trigger('medium');
                });
                header.appendChild(closeBtn);

                const detail = document.createElement('div');
                detail.className = 'strategy-group-detail';

                group.appendChild(header);
                group.appendChild(detail);
                $.strategyPositions.appendChild(group);
            }

            // Update value, P/L and constituents
            const valEl = group.querySelector('.strategy-group-value');
            if (valEl) valEl.textContent = fmtDollar(totalValue);
            const pnlEl = group.querySelector('.strategy-group-pnl');
            if (pnlEl) {
                pnlEl.textContent = fmtDollar(totalPnl);
                pnlEl.className = 'stat-value strategy-group-pnl ' + pnlClass(totalPnl);
            }
            const nameEl = group.querySelector('.strategy-group-name');
            if (nameEl) nameEl.textContent = name + expiryStr + ' x' + fmtQty(mult);
            const detail = group.querySelector('.strategy-group-detail');
            if (detail) detail.textContent = constituents;
        }
    }

    // Pending orders -- DOM diff
    _diffOrderRows($.pendingOrders, portfolio.orders);
}
