/* ===================================================
   src/race/compute-market.js -- Compute futures: a term
   structure of Cambria allocation-quarter contracts over
   a public compute-price index, carrying the standing
   strait tail premium (overhaul phase 3b, the second new
   instrument class after Consensus binaries).

   The instrument (03-market-mechanics):
     - A public COMPUTE-PRICE INDEX driven ONLY by public
       state: compute-demand proxies (frontier release
       counts + certified rungs from the public view), a
       time trend, and the public strait tension / blockade
       state. The race's physical layer as a term structure:
       backwardation = scramble.
     - A rolling ladder of quarterly-style maturities (a
       small window listed at a time). Each contract is
       cash-settled at the index at its maturity.
     - The STANDING STRAIT TAIL PREMIUM: the far end of the
       curve carries a persistent invasion-risk premium that
       responds to public tension; a Taiwan blockade (the
       world-state `geo.taiwanBlockade` flag -- NOT Hormuz's
       `straitClosed`; 02a "Two straits, two flags") applies
       the 09 force-majeure adjustment (far curve +40-80%, per
       02a) -- "blockade scares print here first."

   Regime lifecycle (09 "Lifecycle", compute-futures row):
     precedence  decree conversion (mobilized)
               ⊃ force-majeure adjustment (blockade)
               ⊃ ordinary settlement.
     - ordinary  : cash-settle at the index on maturity.
     - blockade  : force-majeure -- the index already prices
       the +40-80% far-curve adjustment while listed, so
       ordinary settlement DURING a blockade settles at the
       adjusted index (tagged FORCE_MAJEURE).
     - mobilized+: DECREE CONVERSION of every open contract,
       cash closeout signedQty × multiplier × (decreePrice −
       entryBasis); shorts owe symmetrically. The committee
       chooses only among formulas enumerated at listing
       (DECREE_FORMULAS) -- pre-bound per contract, so the
       closeout is computable from public info (09 invariant
       3). Wired through the canonical setControlRegime path
       via freezeComputeMarket (mirrors freezeConsensus) --
       never a second regime path.

   THE INTEGRITY RULE (09 "Information hygiene"): the pricer
   receives ONLY buildComputePublicView(race, geo) -- discrete
   public rung claims / certifications / release counts, the
   clock, and the PUBLIC geopolitical facts (strait tension /
   blockade). Never continuous C, latents, or the event queue.
   The corruption probe scrambles every hidden field and
   asserts the whole curve is bit-identical.

   The nationalization reference (09 "protected"): a rolling
   20-session median of the HCN exchange settlement mark, plus
   a conversion multiple U[0.60,1.15] PRE-SAMPLED once at race
   creation from deriveSeed(seed,'nationalization') (reloads
   cannot reroll it). Built here even though HCN conversion
   itself lands later -- it is seed-persisted state that must
   exist from run start. Stored on race state; its freeze event
   is ledgered.

   Pure of DOM. `computeMarket` is a module-level singleton
   mirroring market.js / consensus.js.
   =================================================== */

import { CERT_RUNGS, RUNGS } from './capability.js';
import { createRng, deriveSeed } from './rng.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const median = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---- Instrument constants ------------------------------------------------

/** Contract multiplier ($ per index point). RATIFIED as 1: the futures price IS
 *  the index level, mirroring the VXHCN-future convention (direct settlement,
 *  Reg-T shorts). With multiplier 1 the 09 decree closeout
 *  signedQty × multiplier × (decreePrice − entryBasis) equals the realized P&L. */
export const COMPUTE_MULTIPLIER = 1;

/** Quarterly maturity grid (trading days) + how many list at once (rolling). */
const QUARTER = 63;        // QUARTERLY_CYCLE -- quarter length in trading days
const LADDER_SIZE = 4;     // maturities listed at a time (03: "3-4 listed at a time, rolling")
const HORIZON = 1008;      // race clock end (no maturity past the term)

// P4-swappable placeholder (02a phase-3b block): the CURVE STRUCTURE is ratified
// -- demand uplift (releases + certified rungs + trend), scramble backwardation,
// and a pure-tail standing strait premium -- but its MAGNITUDES are deliberately
// left as placeholders (same stance as the Consensus binary quotes); this whole
// demand/curve model is swapped when belief `B` lands (phase 4). base 100 and the
// 4-maturity quarterly ladder are ratified.
const COMPUTE_INDEX_BASE = 100;   // normalized compute-price index base level
const K_RELEASE = 0.010;          // demand uplift per frontier release (public count)
const K_CERT = 0.030;             // demand uplift per certified frontier rung (public)
const K_TREND = 0.060;            // yearly compute-demand trend (× day/504)
const SCRAMBLE_COEF = 0.5;        // scramble intensity as a fraction of demand uplift
const SCRAMBLE_TAU = 180;         // days: backwardation tilt decays over ~9 months
const STRAIT_TAIL_BASE = 0.06;    // standing far-curve invasion-risk premium (calm)
const STRAIT_TAIL_TENSION = 0.10; // additional standing premium per unit public tension
const TAIL_TAU = 120;             // days: the tail premium saturates within the listed ladder

// RATIFIED (02a "Strait"): a blockade lifts the FAR compute curve +40-80%. The
// tail-premium magnitude under blockade lands in this band (position within it
// scaled by public tension).
const BLOCKADE_FAR_LO = 0.40;
const BLOCKADE_FAR_HI = 0.80;
// Ratified (02a phase-3b block, settlement-during-blockade rationale): a realized
// blockade is a supply shock that also lifts the NEAR curve (so a contract
// settling DURING a blockade carries the force-majeure adjustment, not just the
// far-dated marks). The near end gets this fraction of the far premium; the
// standing (pre-blockade) invasion-RISK premium is a pure tail (0 at spot).
const BLOCKADE_NEAR_FRAC = 0.5;

/** Enumerated decree-price formulas (09: "the committee chooses only among
 *  formulas enumerated at listing"). Each contract binds one at listing, so the
 *  decree closeout is computable from public info (fairness invariant 3). */
export const DECREE_FORMULAS = ['last-valid-mark', 'listing-anchor'];

// Which control regimes freeze compute-futures trading + arm decree conversion
// (09 succession -- same set as Consensus).
const FREEZE_REGIMES = new Set(['mobilized', 'nationalized', 'classified']);
// Which regimes are the nationalization trigger for the HCN reference freeze.
const NATIONALIZE_REGIMES = new Set(['nationalized', 'classified']);

/** True if `regime` freezes compute-futures trading. */
export function isComputeFreezeRegime(regime) {
    return FREEZE_REGIMES.has(regime);
}

// ---- Nationalization reference (09 "protected"; seed-persisted) ----------

const NAT_WINDOW = 20;     // sessions in the reference median window
const NAT_LAG = 5;         // window ends 5 sessions before the trigger
const NAT_KEEP = NAT_WINDOW + NAT_LAG + 8;   // rolling buffer depth (a little slack)
const NAT_MULT_LO = 0.60;  // conversion multiple U[0.60, 1.15] (09, RATIFIED)
const NAT_MULT_HI = 1.15;

// ---- Singleton state -----------------------------------------------------

/**
 * The compute-futures book. Single-writer by main.js (init/reset/day-complete)
 * and by freezeComputeMarket (regime); read by position-value.js and ui.js.
 *   active   -- true only in Dynamic modes (guards like raceState)
 *   frozen   -- trading barred (mobilized+); decree conversion settles the book
 *   contracts-- the CURRENT listed ladder (rebuilt each refresh)
 *   quotes   -- key -> { bid, ask, mid, frozen?, settled?, outcome? }
 *   settled  -- key -> { kind, day, settlePrice }
 *   _state   -- persistent per-contract record keyed by settleDay
 */
export const computeMarket = {
    active: false,
    frozen: false,
    contracts: [],
    quotes: {},
    settled: {},
    _state: {},
};

// P4-swappable placeholder (02a phase-3b block): a per-contract half-spread for
// the displayed curve quote; compute futures are illiquid, so wider than
// stock/bond. This is a price spread on the curve (the fill spread is the
// stock/bond model keyed off COMPUTE_SPREAD_VOL in _fillPrice).
const COMPUTE_HALF_SPREAD_PCT = 0.004;   // 0.4% each side (0.8% round-trip)

// ---- The public view (integrity boundary) --------------------------------

/**
 * Public tension scalar in [0,1] from PUBLIC geopolitical facts (world-state).
 * The Taiwan/compute chokepoint reads off China relations + the trade-war stage
 * -- both public narrative state, never hidden race truth, and both genuinely
 * China-side (02a). The weights are a P4-swappable placeholder (phase-3b block).
 * A null `geo` (headless / Classic) reads as calm (tension 0).
 */
function tensionFromGeo(geo) {
    if (!geo) return 0;
    const china = clamp(-(geo.chinaRelations || 0) / 3, 0, 1);   // worse relations -> higher tension
    const trade = clamp((geo.tradeWarStage || 0) / 4, 0, 1);
    return clamp(0.6 * china + 0.4 * trade, 0, 1);
}

/**
 * Project the race + world state onto the ONLY fields a compute quote may see:
 * discrete public demand proxies (frontier release count + highest certified
 * rung), the clock, the control regime, and the PUBLIC Taiwan-strait state
 * (blockade flag + a tension scalar). NO continuous capability of any track --
 * C is LATENT (02-race-model). The pricer never receives `race`; it receives this
 * object, so the integrity rule holds by construction (09 "Information hygiene").
 *
 * TWO STRAITS, TWO FLAGS (02a): the compute market's chokepoint is TAIWAN (the
 * Hsinchu fabs, 03), so the blockade reads ONLY `geo.taiwanBlockade`. The
 * surviving Gulf arc's `geo.straitClosed` is the Strait of HORMUZ (oil), a
 * different chokepoint -- it must never move the chip curve.
 */
export function buildComputePublicView(race, geo) {
    const cap = race.capability;
    const labs = ['halcyon', 'tianxia', 'polaris'];

    let certifiedFrontierRung = 0;
    let releaseCount = 0;
    for (const id of labs) {
        const lab = cap.labs[id];
        if (!lab.active) continue;
        for (const r of CERT_RUNGS) if (lab.rungCertified[r] != null) certifiedFrontierRung = Math.max(certifiedFrontierRung, r);
        releaseCount += lab.releaseCount;
    }

    return {
        day: race.day,
        releaseCount,
        certifiedFrontierRung,
        blockade: !!(geo && geo.taiwanBlockade),   // Taiwan strait ONLY (never Hormuz's straitClosed)
        straitTension: tensionFromGeo(geo),
        controlRegime: race.controlRegime,
    };
}

// ---- The compute curve (swappable; P4 belief.js replaces the body) --------

let _priceSource = placeholderCurve;

/**
 * Inject a different curve source. In phase 4, belief.js calls this with a
 * function `(view, dte) => indexPrice` that reads the market belief `B`. `B` is
 * built from public evidence (09), and the source is still handed only the
 * public `view`, so swapping it in preserves the integrity rule.
 */
export function setComputePriceSource(fn) {
    _priceSource = (typeof fn === 'function') ? fn : placeholderCurve;
}

/**
 * P4: replaced by a belief-driven curve.
 *
 * Pre-belief placeholder curve. Public-state only:
 *   spot     = BASE × (1 + demand uplift)   [releases + certified rungs + trend]
 *   backwardation tilt (near richer during scramble) decays with maturity
 *   strait tail tilt (FAR end premium) grows with maturity; blockade lifts it
 *     into the RATIFIED [0.40, 0.80] band (02a force-majeure adjustment).
 * `dte` is the maturity in trading days. Reads only the public view; the
 * structure is ratified, the non-blockade magnitudes are P4-swappable
 * placeholders (02a phase-3b block).
 */
export function placeholderCurve(view, dte) {
    const demandUplift = K_RELEASE * view.releaseCount
        + K_CERT * view.certifiedFrontierRung
        + K_TREND * (view.day / 504);
    const spot = COMPUTE_INDEX_BASE * (1 + demandUplift);

    // Backwardation: high demand bids up the near end relative to the far end,
    // so the FAR end is discounted (near > far == backwardation == scramble).
    const scramble = SCRAMBLE_COEF * demandUplift;
    const backwardationTilt = scramble * (1 - Math.exp(-dte / SCRAMBLE_TAU));

    // Strait premium. Without a blockade, the far end carries a pure invasion-RISK
    // premium (0 at spot, growing with maturity). A realized blockade (09 force-
    // majeure) lifts the far curve into the RATIFIED [0.40, 0.80] band AND lifts
    // the near/settlement end by BLOCKADE_NEAR_FRAC of it, so a contract settling
    // during a blockade carries the adjustment.
    const sat = 1 - Math.exp(-dte / TAIL_TAU);
    let straitTilt;
    if (view.blockade) {
        const tailPrem = BLOCKADE_FAR_LO + (BLOCKADE_FAR_HI - BLOCKADE_FAR_LO) * view.straitTension;
        straitTilt = tailPrem * (BLOCKADE_NEAR_FRAC + (1 - BLOCKADE_NEAR_FRAC) * sat);
    } else {
        const tailPrem = STRAIT_TAIL_BASE + STRAIT_TAIL_TENSION * view.straitTension;
        straitTilt = tailPrem * sat;
    }

    return Math.max(0.01, spot * (1 + straitTilt - backwardationTilt));
}

// ---- Rolling quarterly ladder -------------------------------------------

/** The LADDER_SIZE quarterly grid-days strictly after `day` (capped at HORIZON). */
function ladderDays(day) {
    const first = (Math.floor(day / QUARTER) + 1) * QUARTER;
    const out = [];
    for (let g = first; out.length < LADDER_SIZE && g <= HORIZON; g += QUARTER) out.push(g);
    return out;
}

/** Ensure every window contract for `day` exists in _state (listing binds the
 *  decree formula -- 09: chosen among the enumerated set AT listing). */
function ensureListed(day) {
    for (const settleDay of ladderDays(day)) {
        if (computeMarket._state[settleDay]) continue;
        computeMarket._state[settleDay] = {
            key: settleDay,
            settleDay,
            listDay: day,
            // Deterministic binding from the enumerated set: predetermined, so the
            // decree closeout is reload-stable and computable (fairness invariant 3).
            decreeFormula: DECREE_FORMULAS[0],   // 'last-valid-mark'
            lastMark: null,
            settled: false,
            decreePrice: null,
        };
    }
}

/** Resolve the decree price for a contract from its bound formula. */
function resolveDecreePrice(st) {
    switch (st.decreeFormula) {
        case 'listing-anchor': return COMPUTE_INDEX_BASE;
        case 'last-valid-mark':
        default:
            // 09 halted-leg risk-mark: the last valid executable mark before the
            // decree; the listing anchor only if the contract was never quoted.
            return st.lastMark != null ? st.lastMark : COMPUTE_INDEX_BASE;
    }
}

// ---- Construction / reset ------------------------------------------------

/** Build the ladder + prime the curve and the nationalization reference. Dynamic
 *  init/reset. Freeze state initializes from the supplied race's regime. */
export function initComputeMarket(race, geo) {
    computeMarket.active = true;
    computeMarket.frozen = !!(race && isComputeFreezeRegime(race.controlRegime));
    computeMarket.contracts = [];
    computeMarket.quotes = {};
    computeMarket.settled = {};
    computeMarket._state = {};
    _priceSource = placeholderCurve;

    // Nationalization reference: seed-persisted state that must exist from run
    // start. The conversion multiple is PRE-SAMPLED ONCE from a NAMED substream
    // (deriveSeed(seed,'nationalization')) so (a) reloads/resets reproduce it
    // bit-for-bit, and (b) it never perturbs the capability/theft/incident
    // substreams (substream-isolation discipline).
    if (race) {
        const mult = createRng(deriveSeed(race.seed, 'nationalization')).uniform(NAT_MULT_LO, NAT_MULT_HI);
        race.nationalizationRef = {
            multiple: mult,     // U[0.60, 1.15], drawn at creation, never at event time
            window: [],         // rolling [{ day, mark }] of the HCN settlement mark
            frozen: null,       // ledger record: { day, median, multiple, reference } once frozen
        };
        refreshComputeQuotes(race, geo);
    }
}

/** In-place reset (singleton-reset convention). Same code path as init. */
export function resetComputeMarket(race, geo) {
    initComputeMarket(race, geo);
}

/** Classic mode: no compute book. Clears everything and marks inactive. */
export function deactivateComputeMarket() {
    computeMarket.active = false;
    computeMarket.frozen = false;
    computeMarket.contracts = [];
    computeMarket.quotes = {};
    computeMarket.settled = {};
    computeMarket._state = {};
}

// ---- Freeze / decree arming (canonical control-regime path) --------------

/**
 * Freeze compute-futures trading and arm decree conversion. Idempotent. Called
 * ONLY from setControlRegime (race-state.js) when the regime reaches a freeze
 * regime -- the canonical control-regime mutation path (mirrors freezeConsensus).
 * Snapshots each open contract's decree price (09 halted-leg risk-mark) ONCE so
 * the conversion is fixed at the freeze. When the regime is the nationalization
 * trigger, also freezes the HCN nationalization reference (median × multiple) and
 * ledgers it. Settlement of the converted book is a separate step in
 * computeFutureSettlements (mirrors computeBinarySettlements).
 */
export function freezeComputeMarket(race, regime) {
    if (!computeMarket.active) return;
    computeMarket.frozen = true;
    for (const key of Object.keys(computeMarket._state)) {
        const st = computeMarket._state[key];
        if (st.settled || st.decreePrice != null) continue;
        st.decreePrice = resolveDecreePrice(st);
    }
    if (NATIONALIZE_REGIMES.has(regime) && race && race.nationalizationRef && !race.nationalizationRef.frozen) {
        freezeNationalizationReference(race, race.day);
    }
}

// ---- Nationalization reference machinery ---------------------------------

/**
 * Feed the current HCN exchange settlement mark into the rolling reference
 * window. Call once per completed day with the AUTHORITATIVE process mark (never
 * an impact-adjusted / player-touched price -- 09 excludes temporary and player
 * impact by construction). No-op once frozen (the window stops mattering).
 */
export function stepNationalizationRef(race, hcnMark) {
    const ref = race && race.nationalizationRef;
    if (!ref || ref.frozen) return;
    ref.window.push({ day: race.day, mark: hcnMark });
    if (ref.window.length > NAT_KEEP) ref.window.shift();
}

/**
 * Freeze the compensation reference at the nationalization trigger: the median
 * exchange settlement mark over the 20 sessions ENDING 5 sessions before the
 * trigger (09 "protected"), times the pre-sampled multiple. Idempotent (first
 * freeze wins). Returns the frozen ledger record (or the existing one).
 */
export function freezeNationalizationReference(race, triggerDay) {
    const ref = race.nationalizationRef;
    if (!ref) return null;
    if (ref.frozen) return ref.frozen;
    const cutoff = triggerDay - NAT_LAG;                     // window ends 5 sessions before trigger
    const eligible = ref.window.filter(w => w.day <= cutoff);
    const windowMarks = eligible.slice(-NAT_WINDOW).map(w => w.mark);   // last 20 ending at cutoff
    const med = median(windowMarks);
    ref.frozen = {
        day: triggerDay,
        median: med,
        multiple: ref.multiple,
        reference: med != null ? med * ref.multiple : null,
        sessions: windowMarks.length,
    };
    return ref.frozen;
}

/** The frozen nationalization reference (ledger record), or null if not frozen. */
export function getNationalizationReference(race) {
    return (race && race.nationalizationRef && race.nationalizationRef.frozen) || null;
}

// ---- Quote refresh -------------------------------------------------------

/**
 * Recompute the current ladder's curve. Settled contracts hold a terminal quote;
 * open contracts quote off the public view (curve at their maturity). Records
 * each contract's last valid mark for the decree formula. Call once per completed
 * day (the curve only moves on day boundaries) and at init. `geo` is the public
 * geopolitical projection (null in Classic / headless calm).
 *
 * FREEZE IS TERMINAL (findings 2 + 3): while `computeMarket.frozen`, no new
 * contract is listed (the universe is frozen at the regime transition), and every
 * unsettled contract's quote is HELD at its captured decree / last-valid mark --
 * the live price source is never called and `lastMark` never moves (09 halted-mark
 * invariant; the P4 seam inherits a book that stays frozen).
 */
export function refreshComputeQuotes(race, geo) {
    if (!computeMarket.active) return;
    if (!computeMarket.frozen) ensureListed(race.day);   // no listings once frozen
    const view = buildComputePublicView(race, geo);
    const window = ladderDays(race.day);

    computeMarket.contracts = window
        .map(k => computeMarket._state[k])
        .filter(st => st && !st.settled);

    for (const st of Object.values(computeMarket._state)) {
        const s = computeMarket.settled[st.key];
        if (s) {
            const mid = s.settlePrice;
            computeMarket.quotes[st.key] = { bid: mid, ask: mid, mid, settled: true, kind: s.kind };
            continue;
        }
        if (computeMarket.frozen) {
            // Halted book: hold at the captured decree price (== the last-valid mark
            // snapshot at the freeze); never reprice, never touch lastMark.
            const mid = st.decreePrice != null ? st.decreePrice
                : (st.lastMark != null ? st.lastMark : COMPUTE_INDEX_BASE);
            computeMarket.quotes[st.key] = { bid: mid, ask: mid, mid, settled: false, frozen: true };
            continue;
        }
        const dte = Math.max(0, st.settleDay - race.day);
        const mid = _priceSource(view, dte);
        st.lastMark = mid;   // for the decree 'last-valid-mark' formula
        const half = mid * COMPUTE_HALF_SPREAD_PCT;
        computeMarket.quotes[st.key] = {
            bid: Math.max(0.01, mid - half),
            ask: mid + half,
            mid,
            settled: false,
            frozen: false,
        };
    }
}

/** Cached quote for a contract key, or null. Read-only. */
export function getComputeQuote(key) {
    return computeMarket.quotes[key] || null;
}

/** Curve mark (index price) for a maturity key; 0 if unknown. Used by unitPrice. */
export function getComputeMark(key) {
    const q = computeMarket.quotes[key];
    return q ? q.mid : 0;
}

/** Contract state by key, or null. */
export function computeContractByKey(key) {
    return computeMarket._state[key] || null;
}

/**
 * Lifecycle gate for the trading chokepoint (finding-4 ruling): a compute-future
 * order may be accepted ONLY for an ACTIVE, currently-LISTED, OPEN, UNFROZEN,
 * UNSETTLED contract. Fabricated keys (no _state entry), settled contracts, and a
 * frozen book are all rejected here -- lifecycle enforcement lives in the
 * chokepoint, not the panel. Read-only.
 */
export function isComputeTradeable(key) {
    if (!computeMarket.active || computeMarket.frozen) return false;
    const st = computeMarket._state[key];
    if (!st || st.settled) return false;
    if (!computeMarket.contracts.some(c => c.key === key)) return false;   // must be in the current ladder window
    const q = computeMarket.quotes[key];
    return !!q && !q.settled && !q.frozen;
}

// ---- Settlement (precedence: decree ⊃ force-majeure ⊃ ordinary) ----------

/**
 * Determine every compute-future settlement triggered this completed day and
 * mark the book. Called right after advanceRace, so `race.day` is the endDay.
 * `geo` is the public geopolitical projection.
 *
 * Precedence (09 "Lifecycle"):
 *   1. Decree regime (mobilized/nationalized/classified) -> DECREE CONVERSION of
 *      every open contract at its bound decree price (frozen at freezeComputeMarket).
 *   2/3. Otherwise ORDINARY settlement of every contract whose maturity has
 *      arrived, at the current index. A Taiwan blockade (geo.taiwanBlockade) is
 *      folded into that index by the curve (02a force-majeure adjustment), so a
 *      blockade settlement is ordinary settlement at the adjusted index, tagged
 *      FORCE_MAJEURE for the ledger. Hormuz (geo.straitClosed) is NOT read here.
 *
 * Returns the cash settlements that occurred:
 *   [{ key, settleDay, kind, settlePrice, decreePrice? }] (settlePrice in index
 *   points; cost-basis independent). Cash application lives in
 *   portfolio.settleComputeFutures.
 */
export function computeFutureSettlements(race, geo) {
    if (!computeMarket.active) return [];
    const day = race.day;
    const regime = race.controlRegime;
    const decreeRegime = FREEZE_REGIMES.has(regime);
    const blockade = !!(geo && geo.taiwanBlockade);   // Taiwan strait ONLY (never Hormuz's straitClosed)
    const view = buildComputePublicView(race, geo);
    const out = [];

    for (const st of Object.values(computeMarket._state)) {
        if (st.settled) continue;

        // 1. Decree conversion: every open contract closes out at its decree price.
        if (decreeRegime) {
            const decreePrice = st.decreePrice != null ? st.decreePrice : resolveDecreePrice(st);
            st.decreePrice = decreePrice;
            st.settled = true;
            computeMarket.settled[st.key] = { kind: 'DECREE', day, settlePrice: decreePrice };
            out.push({ key: st.key, settleDay: st.settleDay, kind: 'DECREE', settlePrice: decreePrice, decreePrice });
            continue;
        }

        // 2/3. Ordinary settlement (blockade force-majeure folded into the index).
        if (day >= st.settleDay) {
            const settlePrice = _priceSource(view, 0);   // curve at 0 dte = spot index (blockade-adjusted)
            st.settled = true;
            const kind = blockade ? 'FORCE_MAJEURE' : 'ORDINARY';
            computeMarket.settled[st.key] = { kind, day, settlePrice };
            out.push({ key: st.key, settleDay: st.settleDay, kind, settlePrice });
        }
    }

    return out;
}
