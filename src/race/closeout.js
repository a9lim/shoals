/* ===================================================
   src/race/closeout.js -- The terminal closeout matrix
   (overhaul phase 6, endings round 3): what the book is
   worth when the desk's story ends.

   09 "Claims maturing past day 1008" is a ROW-CONSTRAINT
   CONTRACT: family x controlRegime x instrument, each cell
   giving a valuation timestamp, its public inputs, the
   recovery convention, and (for the fizzle) a seeded path.
   This module is that matrix's code-phase artifact -- a
   PURE, DOM-free valuation surface. It never mutates the
   portfolio; the orchestrator (main.js) applies the cash,
   routing binaries through applyBinarySettlementRows and
   compute futures through settleComputeFutures (09: those
   instruments keep their own terminal settlement paths --
   integrate, don't duplicate).

   THE ONE CASH MECHANIC (mirrors settleComputeFutures, the
   conserving pattern): a position converts to cash at its
   TERMINAL unit value `u`:
       long  (qty>0): cashChange = qty*u
       short (qty<0): cashChange = reserved - |qty|*u
   i.e. cashChange = signedQty*u + reservedReturned. The MARK
   leg is signedQty*u -- an offsetting long/short at the same
   `u` net to zero on the mark; the returned collateral is the
   player's OWN escrow, not a counterparty debit (so their
   cashChange sum is the collateral, not zero). Realized
   pnl = signedQty*(u - entryPrice), zero-sum on the mark leg
   but NOT fully-realized economic P&L (stock/bond/VXHCN keep
   the chassis first-entry basis; different acquisition bases
   break naive zero-sum). The conservation invariant the
   harness gates is stronger and basis-free: TERMINAL
   pre-closeout equity at authoritative marks (cash + signed
   MTM + every short's reserved) == post-closeout cash. No
   fictional fills; never cost-basis-dependent (09 inv 4).

   MAGNITUDES ARE PLACEHOLDER (flagged): 09 fixes the SHAPE of
   each family's HCN mark (melt-up / boring / seeded-unwind /
   waterfall) but not the numbers; CLOSEOUT_TUNING carries a
   defensible parameterization for the coordinator to ratify
   into 02a/09. Conservation is independent of the magnitudes,
   so the harness gates structure while the numbers stay open
   -- the placeholder-quoter pattern (binary/compute) applied
   to the closeout.
   =================================================== */

import { createRng, deriveSeed } from './rng.js';
import { getNationalizationReference } from './compute-market.js';
import { vasicekBondPrice } from '../pricing.js';
import { TRADING_DAYS_PER_YEAR } from '../config.js';

// ---- Placeholder family-mark magnitudes (FLAGGED for 02a/09 ratification) --
// 09 gives the SHAPE per family; these are the code-phase numbers. Mutable so a
// harness sweep / the coordinator's ratification can retune without a code edit.
export const CLOSEOUT_TUNING = {
    meltUpWon: 1.60,        // family 1 (won with margin): the wonders arrive, growth prints
    meltUpDawn: 1.25,       // family 2 (ambiguous dawn): melt-up no audit can fault, quieter
    boring: 1.00,           // family 5 (the Deal): boring-world curve, HCN ~ carries flat
    doomRecovery: 0.35,     // families 3/4 (doom): symmetric CCP waterfall recovery on HCN cash
    fizzleFloor: 0.55,      // family 6 (fizzle): centre of the seeded 18-month unwind
    fizzleSpread: 0.15,     // family 6: +-band the 'closeout' substream samples around the floor
    bondDoomRecovery: 0.40, // bonds default only inside doom families -- recovery fraction of FACE
};

// Family ids (mirror resolution.js): 1 won-margin, 2 knife-edge, 3 misaligned,
// 4 china-first, 5 the-Deal, 6 fizzle.
const DOOM_FAMILIES = new Set([3, 4]);
// Regimes at which HCN converts to compensation claims (09 nationalization cell).
const CONVERSION_REGIMES = new Set(['nationalized', 'classified']);

/**
 * The terminal HCN per-share mark for a resolved world. LITERAL 09 cells first:
 * at a conversion regime with a frozen nationalization reference, HCN converts
 * 1:1 to a compensation claim at `reference` (= median x pre-sampled multiple --
 * NEVER the compute contract's own multiplier; the two never mix). Otherwise the
 * family sets the mark as a multiple of the last authoritative process price
 * `spot` (09 family row constraints; magnitudes are CLOSEOUT_TUNING placeholders):
 *   won-margin -> melt-up; ambiguous dawn -> quieter melt-up; Deal -> boring;
 *   misaligned/china -> waterfall recovery; fizzle -> seeded unwind path.
 * The fizzle path draws from a NEW named substream (deriveSeed(seed,'closeout')) --
 * isolated from every race stream, so race trajectories are bit-identical with the
 * closeout on or off (the nationalization-multiple discipline).
 *
 * @param {number} family      resolution family (1..6)
 * @param {string} regime      controlRegime at resolution
 * @param {object} race        race state (nationalizationRef, seed)
 * @param {number} spot        last authoritative HCN process price (sim.S; impact never touches it)
 * @returns {{ mark:number, converted:boolean, cell:string }}
 */
export function hcnTerminalMark(family, regime, race, spot) {
    if (CONVERSION_REGIMES.has(regime)) {
        const ref = getNationalizationReference(race);
        if (ref && ref.reference != null) {
            return { mark: ref.reference, converted: true, cell: 'hcn:conversion' };
        }
        // Conversion regime but NO usable frozen reference (degenerate: too-short
        // history for a median). Do NOT fall through to a family melt-up/doom mark
        // (Codex flag) -- a converted world never marks at a family multiple. Fail
        // LOUD and redeem at the last authoritative process price `spot`, flagged.
        console.warn('[closeout] conversion regime with no frozen nationalization reference; redeeming HCN at last spot', { regime, family });
        return { mark: spot, converted: true, cell: 'hcn:conversion-unavailable' };
    }
    const T = CLOSEOUT_TUNING;
    switch (family) {
        case 1: return { mark: spot * T.meltUpWon, converted: false, cell: 'hcn:meltup-won' };
        case 2: return { mark: spot * T.meltUpDawn, converted: false, cell: 'hcn:meltup-dawn' };
        case 5: return { mark: spot * T.boring, converted: false, cell: 'hcn:boring' };
        case 3:
        case 4: return { mark: spot * T.doomRecovery, converted: false, cell: 'hcn:doom-waterfall' };
        case 6: {
            // Fizzle terminal mark: centre fizzleFloor, +- fizzleSpread from the
            // isolated 'closeout' substream (fresh per closeout; never race.streams).
            // RULING FLAGGED (coordinator): 09 calls for a SEEDED 18-month unwind
            // PATH; this is a single seeded terminal DRAW (the epilogue compresses
            // the decay to a page). A full dated path is a later refinement.
            const u = createRng(deriveSeed(race.seed, 'closeout')).uniform(-1, 1);
            const mult = T.fizzleFloor + u * T.fizzleSpread;
            return { mark: spot * mult, converted: false, cell: 'hcn:fizzle-unwind' };
        }
        default: return { mark: spot, converted: false, cell: 'hcn:carry' };
    }
}

/**
 * Corporate-action adjustment hook (09: adjustments apply BEFORE intrinsic).
 * Identity today -- a split / special-dividend strike adjustment slots here without
 * touching the intrinsic formula. Kept explicit so the ordering (adjust, then
 * intrinsic) is a named seam rather than an omission.
 */
export function adjustedStrike(pos, _ctx) {
    return pos.strike;
}

/**
 * Terminal UNIT value of one position (per contract/share), given the terminal
 * context. Pure. Binaries and compute futures return null here -- they settle
 * through their own STATEFUL finalizers (finalizeConsensusTerminal /
 * finalizeComputeTerminal); this matrix values the instruments WITHOUT a terminal
 * settlement path of their own: HCN stock, HCN options, VXHCN futures, bonds.
 *
 * The marks in `ctx` MUST be impact-free AUTHORITATIVE marks (09: settlement never
 * consumes the impact overlay or the player's CRR tree). The orchestrator passes
 * spot = sim.S (the authoritative process price impact never touches), varianceIndex
 * = the last-valid VXHCN spot (Heston spot, impact-free), and `ctx.bond` = the Vasicek
 * rate params { rate, a, b, sigmaR, day, face } (the bond MTM is priced per position
 * from its own expiryDay, impact-free -- non-doom families carry the live MTM).
 *
 * @param {object} pos  position { type, qty, strike?, entryPrice, ... }
 * @param {object} ctx  { family, regime, hcnMark, varianceIndex, bondMark }
 * @returns {number|null} terminal unit value (>= 0), or null if routed elsewhere
 */
export function closeoutUnitValue(pos, ctx) {
    switch (pos.type) {
        case 'stock':
            // HCN shares -> terminal HCN mark (family mark, or conversion reference).
            // RULING FLAGGED (coordinator): 09 models nationalized shares as signed
            // COMPENSATION CLAIMS; this cash-settles them at the reference for the
            // epilogue (a claim held to redemption == cash at reference).
            return Math.max(0, ctx.hcnMark);
        case 'call':
        case 'put': {
            // Declared accelerated termination: cash at INTRINSIC vs the terminal HCN
            // mark; time value extinguished. Corporate-action adjustment applies BEFORE
            // intrinsic (09) -- `adjustedStrike` is the hook (identity today; a split /
            // special-dividend adjustment slots here). RULING FLAGGED (coordinator): 09
            // specifies accelerated intrinsic for NATIONALIZATION; this applies it to
            // every terminal family (all options settle at intrinsic vs the family HCN
            // mark), which is the natural terminal valuation but broader than the literal
            // cell.
            const k = adjustedStrike(pos, ctx);
            return pos.type === 'call' ? Math.max(0, ctx.hcnMark - k) : Math.max(0, k - ctx.hcnMark);
        }
        case 'vxhcnfuture':
            // Settle to the exchange variance index -- last valid observation before
            // the cutoff (09); never reconstructed from abandoned Heston state.
            return Math.max(0, ctx.varianceIndex);
        case 'bond': {
            // Bonds never halt (02a P6-3 ruling): a non-doom terminal marks the bond at
            // its last LIVE MTM -- the impact-free Vasicek price (par-at-the-world's-end
            // is only true when the world actually ends). Default ONLY inside doom
            // families (09), at a recovery fraction of FACE.
            if (DOOM_FAMILIES.has(ctx.family)) return Math.max(0, ctx.bond.face * CLOSEOUT_TUNING.bondDoomRecovery);
            const dte = pos.expiryDay != null
                ? Math.max((pos.expiryDay - ctx.bond.day) / TRADING_DAYS_PER_YEAR, 0) : 0;
            return Math.max(0, vasicekBondPrice(ctx.bond.face, ctx.bond.rate, dte, ctx.bond.a, ctx.bond.b, ctx.bond.sigmaR));
        }
        default:
            return null;   // binary / computefuture: own settlement path
    }
}

/**
 * Convert one position to cash at its terminal unit value -- THE conserving
 * mechanic (mirrors settleComputeFutures): long receives qty*u; short returns its
 * reserved collateral and pays |qty|*u. Returns the row (never mutates the
 * position). Binaries / compute futures return null (routed elsewhere).
 *
 * @param {object} pos  position
 * @param {object} ctx  terminal context (see closeoutUnitValue)
 * @returns {{type,qty,unitValue,cashChange,pnl,cell}|null}
 */
export function closeoutPosition(pos, ctx) {
    const u = closeoutUnitValue(pos, ctx);
    if (u == null) return null;
    const absQty = Math.abs(pos.qty);
    const reserved = pos._reservedMargin || 0;
    const cashChange = pos.qty > 0 ? pos.qty * u : reserved - absQty * u;
    const pnl = pos.qty * (u - (pos.entryPrice || 0));   // signedQty*(u - entry); the MARK leg is zero-sum across offsetting sides
    const cell = ({ stock: 'stock', call: 'option', put: 'option', vxhcnfuture: 'vxhcn', bond: 'bond' })[pos.type];
    return { id: pos.id, type: pos.type, qty: pos.qty, unitValue: u, cashChange, pnl, cell };
}

/**
 * Full terminal closeout of a position book against a resolved world -- the PURE
 * matrix the harness drives per cell. Returns the HCN-stock/option/VXHCN/bond
 * settlement rows (each carrying the position `id`) plus the terminal context used
 * and the aggregate cash/pnl. The orchestrator applies `rows` via
 * portfolio.applyCloseoutRows, and settles binaries (finalizeConsensusTerminal ->
 * applyBinarySettlementRows) and compute futures (finalizeComputeTerminal ->
 * settleComputeFutures) through their own STATEFUL finalizers.
 *
 * @param {Array}  positions  the player's positions
 * @param {object} resolution race.resolution (family + axes)
 * @param {object} race       race state
 * @param {object} marks      { spot, varianceIndex, bondMark } -- IMPACT-FREE authoritative
 * @returns {{ rows, ctx, totalCash, totalPnl }}
 */
export function closeoutBook(positions, resolution, race, marks) {
    const family = resolution.family;
    const regime = resolution.axes ? resolution.axes.politicalControl : race.controlRegime;
    const hcn = hcnTerminalMark(family, regime, race, marks.spot);
    const ctx = {
        family, regime,
        hcnMark: hcn.mark, hcnConverted: hcn.converted, hcnCell: hcn.cell,
        varianceIndex: marks.varianceIndex, bond: marks.bond,
    };
    const rows = [];
    let totalCash = 0, totalPnl = 0;
    for (const pos of positions) {
        const row = closeoutPosition(pos, ctx);
        if (!row) continue;   // binary / computefuture handled elsewhere
        rows.push(row);
        totalCash += row.cashChange;
        totalPnl += row.pnl;
    }
    return { rows, ctx, totalCash, totalPnl };
}
