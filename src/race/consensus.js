/* ===================================================
   src/race/consensus.js -- Consensus Markets: milestone
   binary contracts over the capability rung ladder
   (overhaul phase 3a, the first new instrument class).

   Two contract families:
     - Certification binaries (R2-R4): "any frontier lab
       certified rung R by day D". Settle YES (pays notional)
       the day the certification ledger records that rung, NO
       if the deadline passes uncertified.
     - The terminal-resolution binary (R5): "frontier reaches
       R5 by day D". R5 is resolution territory (09; CERT_RUNGS
       excludes it), so it is NOT an ordinary certification
       bet: at its deadline it settles NO only if no R5
       crossing occurred, and if one did it stays OPEN and is
       recorded pending terminal closeout for the endings
       phase to value against the 09 closeout matrix. Never
       booked NO against a crossed world.

   Regime handling (09 "Oracle discipline" / adjudicator
   succession, split per the gate):
     - private/supervised : exchange certification panel.
     - mobilized          : SYNCHRONOUS FREEZE of the classes
       (trading barred) + successor adjudicator (the federal
       evals office) keeps settling; NOT a fallback.
     - nationalized/classified : every open contract settles
       at fallbackValue for all holders identically (the
       predeclared third outcome; cost-basis-independent).
   The freeze is applied only through setControlRegime(race,
   regime) in race-state.js -- the canonical control-regime
   mutation op -- which calls freezeConsensus() here.

   THE INTEGRITY RULE (09 "Information hygiene"): nothing in
   the QUOTE path may read hidden state. C_released is LATENT
   (02-race-model) -- only rung CLAIMS, certifications, public
   release records, and time are observable. buildPublicView
   projects exactly those (no continuous capability of any
   track); the quoter is handed that view and the contract,
   nothing else, so the rule holds by construction. (The
   terminal-crossing read used for R5 SETTLEMENT is a
   settlement-time terminal-truth read -- invariant 3 -- never
   a quote input.)

   Every oracle tuple binds at listing to
   {predicate, oracleId, evidenceStandard, deadline,
   disputeDeadline, fallbackValue} (09).

   Pure of DOM. `consensus` is a module-level singleton
   mirroring market.js / portfolio.js.
   =================================================== */

import { CERT_RUNGS, RUNGS } from './capability.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => { const c = clamp(p, 1e-6, 1 - 1e-6); return Math.log(c / (1 - c)); };

// ---- Instrument constants ------------------------------------------------

/** Contract notional: a YES contract pays this at a certified crossing.
 *  RATIFIED (02a "Consensus binaries", phase-3a): 100 mirrors BOND_FACE_VALUE so
 *  per-unit prices display on the same $X.XX scale as bonds. */
export const BINARY_NOTIONAL = 100;

// UNRATIFIED: 02a deliberately does NOT record the quote/spread magnitudes --
// they are placeholders until belief `B` lands (phase 4), which replaces the
// whole quoter. Everything below this line is that placeholder.
const QUOTE_FLOOR = 0.02;    // never quote a live contract at hard 0/1
const QUOTE_CEIL = 0.98;
const BINARY_SPREAD = 0.04;  // total bid/ask width on the [0,1] probability quote (modest)
const DEADLINE_TAIL = 150;   // days over which "running out of time, rung unclaimed" drags the quote down
const Q_CLAIM = 1.5;         // log-odds nudge per rung of public release-claim progress
const Q_CERT = 1.0;          // log-odds nudge when the adjacent lower rung is certified
const Q_LATE = 2.5;          // log-odds drag as the deadline nears with the rung still unclaimed

// Which control regimes freeze the Consensus classes (09 succession).
const FREEZE_REGIMES = new Set(['mobilized', 'nationalized', 'classified']);
// Which regimes settle open contracts at fallbackValue (nationalized/classified
// only -- mobilized freezes but the successor adjudicator keeps settling).
const FALLBACK_REGIMES = new Set(['nationalized', 'classified']);

/** True if `regime` freezes trading in the Consensus classes. */
export function isFreezeRegime(regime) {
    return FREEZE_REGIMES.has(regime);
}

/**
 * Named dispute adjudicator per controlRegime (09 "Oracle discipline",
 * adjudicator succession): exchange certification panel (private/supervised) ->
 * the federal evals office (mobilized) -> fallbackValue (nationalized/classified).
 * The satire register owns the staffing (the evals office is the one Congress
 * defunded); the math plays straight. Returns 'fallback' when the succession has
 * ended -- a disputed contract in a fallback regime pays fallbackValue for all
 * holders identically.
 */
export function disputeAdjudicator(regime) {
    if (FALLBACK_REGIMES.has(regime)) return 'fallback';
    if (regime === 'mobilized') return 'federal-evals-office';
    return 'exchange-cert-panel';
}

// ---- Contract definitions (09 oracle tuples) -----------------------------
//
// RATIFIED (02a "Consensus binaries", phase-3a): deadlines R2 420 / R3 756 /
// R4 880 / R5 1000, calibrated against the MEASURED certified KM-medians of the
// neutral race (R2~405, R3~736, R4~860) so each certification contract is
// two-sided (~57-60% YES). disputeDeadline rides every tuple per 09; its
// adjudication path activates when a dispute event class exists (P5) --
// certification disputes are meanwhile resolved upstream in stepCertification.
//
// `baseRate` is the public LISTING prior -- a per-contract base rate is
// legitimately public information (Consensus lists at market-consistent priors),
// calibrated to the measured settlement frequencies. RECALIBRATED (P6-1b re-gate,
// 2026-07-24) under the final retuned kinematics -- the velocity/drag/follower
// legs shifted the certified-crossing rates: R2 0.57->0.70, R3 0.56->0.62,
// R4 0.57->0.60 YES (measured 0.705 / 0.625 / 0.600 at N=2000; all two-sided,
// within the harness's 8pp invariant). The R5 base rate 0.70 is the designed
// crossing expectation (measured crossing 0.712); the closeout-recovery multiplier
// is a later-phase (endings) refinement.

function contractDefs() {
    const cert = (key, rung, deadline, disputeDeadline, baseRate) => ({
        key,
        id: `bin_frontier_cert_R${rung}`,
        label: `Frontier certified R${rung} by day ${deadline}`,   // data label, not narrative flavor
        predicate: { kind: 'any-frontier-certified-rung', rung },
        oracleId: 'exchange-cert-panel',            // 09 adjudicator (private/supervised regime)
        evidenceStandard: 'certified-rung-settlement',
        deadline,
        disputeDeadline,
        fallbackValue: 0.50,                        // 09 default; identical for every holder
        notional: BINARY_NOTIONAL,
        baseRate,
        terminal: false,
    });
    const terminal = (key, rung, deadline, disputeDeadline, baseRate) => ({
        key,
        id: `bin_frontier_terminal_R${rung}`,
        label: `Frontier reaches R${rung} by day ${deadline}`,
        predicate: { kind: 'frontier-reaches-rung-terminal', rung },
        oracleId: 'terminal-closeout',              // 09 succession terminal adjudicator / closeout matrix
        evidenceStandard: 'terminal-resolution',
        deadline,
        disputeDeadline,
        fallbackValue: 0.50,
        notional: BINARY_NOTIONAL,
        baseRate,
        terminal: true,
    });
    return [
        cert(0, 2, 420, 450, 0.70),
        cert(1, 3, 756, 786, 0.62),
        cert(2, 4, 880, 910, 0.60),
        terminal(3, 5, 1000, 1008, 0.70),   // resolution territory -> terminal closeout, never NO-against-crossing
    ];
}

// ---- Singleton state -----------------------------------------------------

/**
 * The Consensus book. Mutated single-writer by main.js (init/reset/day-complete)
 * and by setControlRegime (freeze); read by position-value.js and ui.js.
 *   active         -- true only in Dynamic modes (guards like raceState)
 *   frozen         -- trading frozen (mobilized+); orders barred, settlement may continue
 *   contracts      -- the listed oracle tuples
 *   quotes         -- key -> { bid, ask, mid, settled?, frozen?, pending?, outcome? }
 *   settled        -- key -> { outcome:'YES'|'NO'|'FALLBACK', day, cert?, reason? }
 *   pendingCloseout-- key -> { day, reason } (terminal R5 crossed; awaits endings closeout)
 */
export const consensus = {
    active: false,
    frozen: false,
    contracts: [],
    quotes: {},
    settled: {},
    pendingCloseout: {},
    // Phase-5a dispute lifecycle (09 adjudicator succession). key -> { openedDay,
    // disputeDeadline, openedUnder, mark }. A disputed contract is non-tradeable
    // (held at its last valid mark, like a pending one) until the adjudicator rules
    // (ruleDispute) or the disputeDeadline expires (auto-fallback).
    disputed: {},
    // Durable settlement OUTBOX (R3). A synchronous ruling (ruleDispute) marks the
    // contract terminal and stashes its settlement row here as well as returning it,
    // so a caller that drops the return does not strand portfolio cash: the daily
    // settlement pass drains any UNCONSUMED stashed rows through the shared
    // consequence helper, exactly-once by each row's `_consumed` flag.
    pendingRows: [],
};

/** Build the listed contracts and clear the book. Dynamic-mode init/reset.
 *  Freeze state initializes from the supplied race's regime -- an already-
 *  mobilized (or later) race inits frozen. */
export function initConsensus(race) {
    consensus.active = true;
    consensus.frozen = !!(race && isFreezeRegime(race.controlRegime));
    consensus.contracts = contractDefs();
    consensus.quotes = {};
    consensus.settled = {};
    consensus.pendingCloseout = {};
    consensus.disputed = {};
    consensus.pendingRows = [];
    _quoteSource = placeholderQuote;
    if (race) refreshBinaryQuotes(race);
}

/** In-place reset (singleton-reset convention). Same code path as init. */
export function resetConsensus(race) {
    initConsensus(race);
}

/** Classic mode: no Consensus book. Clears everything and marks inactive. */
export function deactivateConsensus() {
    consensus.active = false;
    consensus.frozen = false;
    consensus.contracts = [];
    consensus.quotes = {};
    consensus.settled = {};
    consensus.pendingCloseout = {};
    consensus.disputed = {};
    consensus.pendingRows = [];
}

/**
 * Synchronously freeze the Consensus classes (trading barred). Idempotent.
 * Called ONLY from setControlRegime (race-state.js) when the regime reaches a
 * freeze regime -- the canonical control-regime mutation path (mirrors
 * commitTheft / commitRelease). Settlement is NOT performed here: mobilization
 * freezes trading while the successor adjudicator keeps settling; the
 * fallback-settlement branch lives in computeBinarySettlements.
 */
export function freezeConsensus() {
    if (consensus.active) consensus.frozen = true;
}

// ---- The public view (integrity boundary) --------------------------------

/** First internal-rung crossing day across all entities (terminal truth). Exported
 *  (P6) so the resolution ladder reuses the single R5-crossing read rather than
 *  duplicating it -- this is a settlement-time terminal-truth read, never a quote
 *  input (the integrity boundary above still holds: buildPublicView never exposes it). */
export function frontierInternalCrossDay(cap, rung) {
    let m = Infinity;
    for (const id of ['halcyon', 'tianxia', 'polaris']) {
        const lab = cap.labs[id];
        if (lab.active && lab.rungInternal[rung] != null) m = Math.min(m, lab.rungInternal[rung]);
    }
    if (cap.open.rungInternal[rung] != null) m = Math.min(m, cap.open.rungInternal[rung]);
    return m;
}

/**
 * Project the race state onto the ONLY fields a Consensus quote may see:
 * discrete rung CLAIMS (released-rung records), certifications, public release
 * records (counts/dates), the clock, and the control regime. NO continuous
 * capability of any track -- C_released is LATENT (02-race-model), so only the
 * released-RUNG crossing (the public claim) is exposed, never the value. The
 * quoter never receives `race`; it receives this object, so the integrity rule
 * holds by construction (09 "Information hygiene").
 */
export function buildPublicView(race) {
    const cap = race.capability;
    const labs = ['halcyon', 'tianxia', 'polaris'];

    // Highest certified rung across frontier labs (public certification events).
    let certifiedFrontierRung = 0;
    for (const id of labs) {
        const lab = cap.labs[id];
        if (!lab.active) continue;
        for (const r of CERT_RUNGS) if (lab.rungCertified[r] != null) certifiedFrontierRung = Math.max(certifiedFrontierRung, r);
    }

    // Highest publicly-claimed (released) rung across frontier labs + open. This
    // is a discrete PUBLIC record (a released model claiming rung R), not the
    // latent continuous C_released.
    let releasedFrontierRung = 0;
    for (const id of labs) {
        const lab = cap.labs[id];
        if (!lab.active) continue;
        for (const r of RUNGS) if (lab.rungReleased[r] != null) releasedFrontierRung = Math.max(releasedFrontierRung, r);
    }
    for (const r of RUNGS) if (cap.open.rungInternal[r] != null) releasedFrontierRung = Math.max(releasedFrontierRung, r);

    // Public release behavior: counts + most-recent date (dates/counts are public).
    let releaseCount = 0;
    let lastReleaseDay = -Infinity;
    for (const id of labs) {
        const lab = cap.labs[id];
        if (!lab.active) continue;
        releaseCount += lab.releaseCount;
        if (lab.lastReleaseDay > lastReleaseDay) lastReleaseDay = lab.lastReleaseDay;
    }

    return {
        day: race.day,
        certifiedFrontierRung,
        releasedFrontierRung,
        releaseCount,
        lastReleaseDay,
        controlRegime: race.controlRegime,
    };
}

// ---- Quote process (swappable; P4 belief.js replaces the body) ------------

let _quoteSource = placeholderQuote;

/**
 * Inject a different quote source. In phase 4, belief.js calls this with a
 * function `(view, contract) => probability` that reads the market belief `B`.
 * `B` is built from public evidence (09), and the source is still handed only
 * the public `view`, so swapping it in preserves the integrity rule.
 */
export function setBinaryQuoteSource(fn) {
    _quoteSource = (typeof fn === 'function') ? fn : placeholderQuote;
}

/**
 * P4: replaced by belief-driven quote.
 *
 * Pre-belief placeholder. Starts from the contract's PUBLIC listing base rate
 * (a legitimately-public market-consistent prior) in log-odds, then layers
 * monotone OBSERVABLE-ONLY adjustments -- all zero at listing (day 0), so the
 * listing mid equals the base rate:
 *   - claim : how far the public released-RUNG claim has climbed toward R.
 *   - cert  : whether the adjacent lower rung is already certified.
 *   - late  : as the deadline nears with rung R still unclaimed, drag down.
 * Reads only released-RUNG records (never continuous C_released), certifications,
 * and time. All coefficients are UNRATIFIED placeholders.
 */
export function placeholderQuote(view, contract) {
    const R = contract.predicate.rung;
    if (view.day >= contract.deadline) return QUOTE_FLOOR;   // past deadline: settlement handles it
    const claim = clamp(view.releasedFrontierRung - (R - 1), 0, 2);   // 0 at listing
    const cert = clamp(view.certifiedFrontierRung - (R - 2), 0, 2);   // 0 at listing
    const unclaimed = view.releasedFrontierRung < R ? 1 : 0;
    const late = clamp(1 - (contract.deadline - view.day) / DEADLINE_TAIL, 0, 1) * unclaimed;   // 0 far from deadline
    const z = logit(contract.baseRate) + Q_CLAIM * claim + Q_CERT * cert - Q_LATE * late;
    return clamp(sigmoid(z), QUOTE_FLOOR, QUOTE_CEIL);
}

/**
 * Recompute every contract's quote. Settled contracts hold a terminal quote
 * (YES=1, NO=0, FALLBACK=fallbackValue); a pending-closeout contract marks at
 * its fallbackValue (placeholder -- the endings closeout sets the real value)
 * and is non-tradeable; open contracts quote off the public view. Call once per
 * completed day (quotes only move on day boundaries) and at init.
 */
export function refreshBinaryQuotes(race) {
    if (!consensus.active) return;
    const view = buildPublicView(race);
    for (const c of consensus.contracts) {
        const s = consensus.settled[c.key];
        if (s) {
            const mid = s.outcome === 'YES' ? 1 : s.outcome === 'FALLBACK' ? c.fallbackValue : 0;
            consensus.quotes[c.key] = { bid: mid, ask: mid, mid, settled: true, outcome: s.outcome };
            continue;
        }
        if (consensus.pendingCloseout[c.key]) {
            // Terminal crossing occurred; awaits the 09 closeout matrix. Non-tradeable;
            // marked at the FROZEN last-valid executable mark (09 halted-leg risk-mark
            // protocol), captured at pending time -- never a 0.50 overwrite.
            const pm = consensus.pendingCloseout[c.key];
            const mid = (pm.mark != null) ? pm.mark : c.fallbackValue;
            consensus.quotes[c.key] = { bid: mid, ask: mid, mid, pending: true };
            continue;
        }
        if (consensus.disputed[c.key]) {
            // Under adjudication (09): non-tradeable, held at the FROZEN last-valid
            // executable mark captured when the dispute opened (halted-leg risk-mark
            // protocol) -- never a live reprice, never a 0.50 overwrite.
            const dm = consensus.disputed[c.key];
            const mid = (dm.mark != null) ? dm.mark : c.fallbackValue;
            consensus.quotes[c.key] = { bid: mid, ask: mid, mid, disputed: true };
            continue;
        }
        const mid = clamp(_quoteSource(view, c), QUOTE_FLOOR, QUOTE_CEIL);
        const half = BINARY_SPREAD / 2;
        consensus.quotes[c.key] = {
            bid: clamp(mid - half, 0, 1),
            ask: clamp(mid + half, 0, 1),
            mid,
            settled: false,
            frozen: consensus.frozen,
        };
    }
}

/** Cached quote for a contract key, or null. Read-only. */
export function getBinaryQuote(key) {
    return consensus.quotes[key] || null;
}

/** Quote mid (probability, [0,1]) for marks; 0.5 if unknown. Used by unitPrice. */
export function getBinaryMark(key) {
    const q = consensus.quotes[key];
    return q ? q.mid : 0.5;
}

/** Contract definition by key, or null. */
export function contractByKey(key) {
    return consensus.contracts.find(c => c.key === key) || null;
}

/**
 * Contracts recorded pending terminal closeout (terminal R5 that crossed by its
 * deadline). Stub API for the endings phase to value against the 09 closeout
 * matrix; positions on these remain OPEN and un-cash-settled here.
 */
export function pendingTerminalCloseout() {
    return Object.keys(consensus.pendingCloseout).map(k => {
        const key = Number(k);
        return { key, contract: contractByKey(key), ...consensus.pendingCloseout[k] };
    });
}

// ---- Dispute lifecycle (09 adjudicator succession; phase 5a) --------------

/**
 * Open a dispute on a live contract (the "dispute event class", 09) -- a policy /
 * dispute narrative event calls this. The contract stops trading and is held at
 * its last valid executable mark (halted-leg risk-mark protocol) until the
 * adjudicator rules (ruleDispute) or the disputeDeadline expires (auto-fallback in
 * computeBinarySettlements). No-op on an unknown, already-settled, pending, or
 * already-disputed contract, or on the terminal R5 (which resolves via terminal
 * closeout, not disputes). `regime` is stored as `openedUnder` for the ledger /
 * narrative ONLY -- it is NOT the settlement authority (the adjudicator is resolved
 * from the CURRENT regime at ruling time, F3). Returns the dispute record, or null.
 */
export function openDispute(key, day, regime = 'private') {
    if (!consensus.active) return null;
    const c = contractByKey(key);
    if (!c || c.terminal) return null;
    if (consensus.settled[key] || consensus.pendingCloseout[key] || consensus.disputed[key]) return null;
    const lastQ = consensus.quotes[key];
    const mark = (lastQ && !lastQ.settled && lastQ.mid != null) ? lastQ.mid : c.fallbackValue;
    const rec = {
        openedDay: day,
        disputeDeadline: c.disputeDeadline,
        openedUnder: regime,     // informational (ledger/narrative) -- NOT the authority
        mark,
    };
    consensus.disputed[key] = rec;
    return rec;
}

/**
 * The adjudicator rules on an open dispute (a dispute-ruling narrative event
 * calls this). Dispute finality (09, ruled 2026-07-23):
 *   - F2a: a ruling AFTER `disputeDeadline` is VOID -- rejected; the deadline
 *     fallback stands (no late ruling can overturn the automatic fallback).
 *   - F3: the adjudicator is resolved from the CURRENT `regime` at ruling time
 *     (adjudicator succession reaches open disputes), not the open-time snapshot.
 *     Under a fallback regime (nationalized/classified) the succession has ended,
 *     so a ruling is not possible -- rejected; fallback governs.
 *   - F2b: a timely ruling is TERMINAL and settles the contract SYNCHRONOUSLY
 *     here (same consequence-bundle philosophy as setControlRegime) -- marked
 *     consensus.settled now, so no later fallback path (regime or deadline) can
 *     override it. The row is stashed in the `pendingRows` outbox AND returned;
 *     the caller applies it via portfolio.applyBinarySettlementRows (cash +
 *     credibility, exactly-once), and the daily pass drains any unconsumed
 *     stashed row -- a dropped return still pays exactly once (R3).
 * `outcome` is 'YES' or 'NO'. Returns the settlement row (settleBinaries-shaped),
 * or null if rejected.
 */
export function ruleDispute(key, outcome, day, regime = 'private') {
    const d = consensus.disputed[key];
    if (!d) return null;
    if (outcome !== 'YES' && outcome !== 'NO') return null;
    if (day > d.disputeDeadline) return null;                    // F2a: post-deadline -> void
    const adjudicator = disputeAdjudicator(regime);              // F3: current regime, not the snapshot
    if (adjudicator === 'fallback') return null;                 // succession ended -> fallback governs
    const c = contractByKey(key);
    delete consensus.disputed[key];
    // F2b: synchronous terminal settlement -- senior to every later fallback.
    consensus.settled[key] = { outcome, day, reason: 'dispute-ruled:' + adjudicator, openedUnder: d.openedUnder };
    // R3: stash the settlement row in the durable outbox (also returned). `_consumed`
    // is the exactly-once flag the shared consequence helper marks when it applies
    // the row -- so a dropped return is drained by the daily pass, and a hook that
    // applies it is not re-paid by the drain.
    const row = { key, contract: c, label: c.label, outcome,
        payoutPerUnit: outcome === 'YES' ? c.notional : 0, dispute: 'ruled', adjudicator, _consumed: false };
    consensus.pendingRows.push(row);
    return row;
}

/** The dispute record for a contract key, or null. Read-only. */
export function getDispute(key) {
    return consensus.disputed[key] || null;
}

// ---- Settlement (consumes the certification ledger, never state-diffing) --

/**
 * Determine every settlement triggered this completed day and mark the book.
 * Called right after advanceRace, so `race.day` is the endDay and
 * `race.lastTransitions.certifications` is this tick's ledger.
 *
 * Precedence:
 *   1. Fallback regime (nationalized/classified) -- every open contract settles
 *      at fallbackValue for all holders identically. (mobilized does NOT fall
 *      back: it froze trading via setControlRegime, and the successor
 *      adjudicator keeps settling normally below.)
 *   2. Terminal contract (R5) -- at deadline: NO only if no R5 crossing
 *      occurred; if one did, the contract stays OPEN and is recorded pending
 *      closeout (never booked NO against a crossed world).
 *   3. Certification contract (R2-R4) -- YES on a matching certification at/
 *      before the deadline (nested implied lower rungs settle the same day
 *      because stepCertification writes their records into the ledger), else NO
 *      at deadline.
 *
 * Returns the cash settlements that occurred:
 *   [{ key, contract, label, outcome, payoutPerUnit }] (payoutPerUnit in dollars,
 *   quote-independent). Pending-closeout does not emit a cash settlement.
 */
export function computeBinarySettlements(race) {
    if (!consensus.active) return [];
    const day = race.day;
    const regime = race.controlRegime;
    const fallbackRegime = FALLBACK_REGIMES.has(regime);
    const certs = race.lastTransitions ? race.lastTransitions.certifications : [];
    const out = [];

    for (const c of consensus.contracts) {
        if (consensus.settled[c.key]) continue;   // already cash-terminal

        // 1. Fallback regime (nationalized/classified) settles EVERY not-yet-cash-
        //    settled contract at fallbackValue -- INCLUDING a pending-closeout one:
        //    a nationalized world's closeout IS the fallback (09's succession ends
        //    there), so pending does not outrank it. Release the pending marker so
        //    the position's cash/collateral is freed.
        if (fallbackRegime) {
            if (consensus.pendingCloseout[c.key]) delete consensus.pendingCloseout[c.key];
            if (consensus.disputed[c.key]) delete consensus.disputed[c.key];   // succession ends at fallback
            consensus.settled[c.key] = { outcome: 'FALLBACK', day, reason: 'controlRegime:' + regime };
            out.push({ key: c.key, contract: c, label: c.label, outcome: 'FALLBACK', payoutPerUnit: c.fallbackValue * c.notional });
            continue;
        }

        // Non-fallback regimes: a parked pending contract stays parked.
        if (consensus.pendingCloseout[c.key]) continue;

        // 1b. Dispute resolution (09 adjudicator succession). A timely ruling
        //     already settled SYNCHRONOUSLY in ruleDispute (removing the marker and
        //     marking consensus.settled -- senior to every fallback), so a marker
        //     still present here means NO timely ruling: an expired disputeDeadline
        //     auto-settles at fallbackValue (09: "No indefinite limbo"); otherwise
        //     the dispute is still under adjudication and suspends the normal cert/
        //     terminal path (the contract is not trading).
        const disp = consensus.disputed[c.key];
        if (disp) {
            // R1: the deadline boundary is SINGULAR. The deadline day itself is the
            // LAST day a ruling can land (ruleDispute rejects only day > deadline), so
            // the auto-fallback fires only STRICTLY AFTER it -- otherwise the daily
            // pass (which runs before queued popup rulings) would beat a deadline-day
            // ruling to fallback by call order.
            if (day > disp.disputeDeadline) {
                delete consensus.disputed[c.key];
                consensus.settled[c.key] = { outcome: 'FALLBACK', day, reason: 'dispute-expired' };
                out.push({ key: c.key, contract: c, label: c.label, outcome: 'FALLBACK',
                    payoutPerUnit: c.fallbackValue * c.notional, dispute: 'expired' });
            }
            continue;   // disputed contracts never run the normal cert/terminal path
        }

        // 2. Terminal-resolution contract (R5): never NO against a crossed world.
        if (c.terminal) {
            if (day >= c.deadline) {
                const crossDay = frontierInternalCrossDay(race.capability, c.predicate.rung);
                if (crossDay <= day) {
                    // Freeze the last valid executable mark (09 halted-leg risk-mark
                    // protocol) -- the previous day's live quote mid -- so the position
                    // marks there (not fallbackValue) until the terminal closeout matrix
                    // supplies the authoritative value.
                    const lastQ = consensus.quotes[c.key];
                    const mark = (lastQ && !lastQ.settled && lastQ.mid != null) ? lastQ.mid : c.fallbackValue;
                    consensus.pendingCloseout[c.key] = { day, reason: 'terminal-crossing:R' + c.predicate.rung, mark };
                    // Marker only -- NOT a cash settlement (payoutPerUnit null); the
                    // position stays open for the endings closeout. settleBinaries skips it.
                    out.push({ key: c.key, contract: c, label: c.label, outcome: 'PENDING_CLOSEOUT', payoutPerUnit: null });
                } else {
                    consensus.settled[c.key] = { outcome: 'NO', day };
                    out.push({ key: c.key, contract: c, label: c.label, outcome: 'NO', payoutPerUnit: 0 });
                }
            }
            continue;
        }

        // 3. Certification contract: YES on a matching certification at/before deadline.
        let hit = null;
        if (day <= c.deadline) {
            for (const cert of certs) {
                if (cert.rung === c.predicate.rung) { hit = cert; break; }
            }
        }
        if (hit) {
            consensus.settled[c.key] = { outcome: 'YES', day, cert: hit };
            out.push({ key: c.key, contract: c, label: c.label, outcome: 'YES', payoutPerUnit: c.notional, cert: hit });
            continue;
        }
        if (day >= c.deadline) {
            consensus.settled[c.key] = { outcome: 'NO', day };
            out.push({ key: c.key, contract: c, label: c.label, outcome: 'NO', payoutPerUnit: 0 });
        }
    }

    return out;
}

/** Earliest certification day of rung R across all entities (Infinity if never
 *  certified) -- the certification analogue of frontierInternalCrossDay, for the
 *  terminal finalizer's "certified by deadline" read. */
export function frontierCertifiedDay(cap, rung) {
    let m = Infinity;
    for (const id of ['halcyon', 'tianxia', 'polaris']) {
        const lab = cap.labs[id];
        if (lab.active && lab.rungCertified[rung] != null) m = Math.min(m, lab.rungCertified[rung]);
    }
    return m;
}

/**
 * TERMINAL FINALIZER (P6-3): settle EVERY not-yet-cash-settled Consensus contract
 * ONCE against the resolved world, and return the durable settlement rows for
 * applyBinarySettlementRows (cash + credibility, exactly-once). Stateful and
 * idempotent -- it records `consensus.settled` and clears pending/dispute markers,
 * so a second call returns [] (the P6-2 interim's "bar new trades" is replaced by
 * real settlement). Called by the ONE terminal finalizer for both the day-1008
 * timeout and player-terminal ejection.
 *
 * A pure row-builder cannot do exactly-once (applyBinarySettlementRows only
 * deduplicates the same row OBJECT, and re-enumeration would re-score credibility);
 * this function owns the settled-state, so re-calls are no-ops.
 *
 * Precedence (09): nationalized/classified fallback settles EVERYTHING at
 * fallbackValue (succession ends there). Otherwise, judged against the contract's
 * DEADLINE (never `race.day`, which post-extrapolation may sit far past it):
 *   - terminal R5: internal R5 crossed by its deadline -> YES, else NO.
 *   - certification contract: frontier certified rung R by its deadline -> YES, else NO.
 * A disputed contract still open at terminal settles at fallbackValue (no limbo).
 *
 * EXTRAPOLATION IS THE WORLD CONTINUING (02a P6-3 ruling): the reads
 * frontierInternalCrossDay / frontierCertifiedDay consume the PERSISTENT capability
 * state (rungInternal / rungCertified), which resolveNow's extrapolation advances
 * past the desk's ejection -- NEVER `lastTransitions` (the latch cleared it). So a
 * certification that lands INSIDE the extrapolated trajectory, before a contract's
 * deadline, settles that contract YES exactly as if the desk had been there to watch:
 * the binary book settles against the world that actually happened, not the world as
 * of the firing. The desk's presence does not change the oracle.
 *
 * RULING FLAGGED (coordinator): shares/binaries redeem to CASH here rather than
 * persisting as claims (09 models shares as signed claims; cash closeout is the
 * epilogue simplification).
 *
 * @param {object} race  race state (post-resolution)
 * @returns {Array} durable settlement rows (shape of computeBinarySettlements)
 */
export function finalizeConsensusTerminal(race) {
    if (!consensus.active) return [];
    const cap = race.capability;
    const fallback = FALLBACK_REGIMES.has(race.controlRegime);
    const rows = [];
    for (const c of consensus.contracts) {
        if (consensus.settled[c.key]) continue;   // already cash-terminal (idempotent)
        let outcome;
        if (fallback) {
            outcome = 'FALLBACK';
        } else if (consensus.disputed[c.key]) {
            outcome = 'FALLBACK';                  // open dispute at terminal -> no limbo (09)
        } else if (c.terminal) {
            outcome = frontierInternalCrossDay(cap, c.predicate.rung) <= c.deadline ? 'YES' : 'NO';
        } else {
            outcome = frontierCertifiedDay(cap, c.predicate.rung) <= c.deadline ? 'YES' : 'NO';
        }
        delete consensus.pendingCloseout[c.key];
        delete consensus.disputed[c.key];
        consensus.settled[c.key] = { outcome, day: race.day, reason: 'terminal-finalize' };
        const payoutPerUnit = outcome === 'YES' ? c.notional
            : outcome === 'FALLBACK' ? c.fallbackValue * c.notional : 0;
        rows.push({ key: c.key, contract: c, label: c.label, outcome, payoutPerUnit });
    }
    return rows;
}
